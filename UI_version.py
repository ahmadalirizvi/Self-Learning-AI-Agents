"""
mem0 + Gemini assistant — serves both the Recall web UI and the old console loop.

    pip install fastapi "uvicorn[standard]"

    python main.py          # start the API on http://localhost:8000  (also serves the UI)
    python main.py --cli    # the original terminal chat loop

The system prompt lives in prompt.txt next to this file. Use {memories} in it as
the placeholder for retrieved memories; if it's absent the memories are appended.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google import genai
from mem0 import Memory
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

# ── Gemini client ────────────────────────────────────────────────────────────
api_key = os.getenv("API_KEY")
if not api_key:
    print("No Gemini API key found. Set API_KEY in your .env file.")
    print("See https://ai.google.dev/gemini-api/docs/api-key for how to create one.")
    sys.exit(1)

# ── Force API-key auth for mem0's Gemini provider ────────────────────────────
# mem0's gemini embedder and LLM both call the legacy google.generativeai global
# `configure()` — the embedder falls back to GOOGLE_API_KEY, the LLM to
# GEMINI_API_KEY. If that global ever ends up without a key, the SDK silently
# uses Google Application Default Credentials and the API replies
# 401 ACCESS_TOKEN_TYPE_UNSUPPORTED. Pinning both names and dropping ADC from
# this process closes every fallback path.
ADC_AT_START = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")  # recorded for /health
os.environ["GOOGLE_API_KEY"] = api_key
os.environ["GEMINI_API_KEY"] = api_key
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
os.environ.pop("GOOGLE_CLOUD_PROJECT", None)

client = genai.Client(api_key=api_key)

# ── mem0: Qdrant for storage, Gemini for LLM + embeddings ────────────────────
config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "localhost",
            "port": 6333,
            "embedding_model_dims": 768,
        },
    },
    "llm": {
        "provider": "gemini",
        "config": {"api_key": api_key, "model": "gemini-3.6-flash"},
    },
    "embedder": {
        "provider": "gemini",
        "config": {"api_key": api_key, "model": "gemini-embedding-001"},
    },
}

memory = Memory.from_config(config)

# mem0 calls the legacy global configure() during init; re-assert the key here so
# nothing imported later can clobber it back to ADC.
try:
    import google.generativeai as _legacy_genai

    _legacy_genai.configure(api_key=api_key)
except ImportError:
    pass  # newer mem0 uses a per-instance google.genai client — nothing to do

# ── Prompt ───────────────────────────────────────────────────────────────────
PROMPT_PATH = BASE_DIR / "prompt.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")


def build_prompt(memories_str: str, message: str) -> str:
    """Inject memories without str.format(), so literal braces in prompt.txt
    (JSON examples, code snippets) can't raise KeyError."""
    if "{memories}" in SYSTEM_PROMPT:
        system = SYSTEM_PROMPT.replace("{memories}", memories_str)
    else:
        system = f"{SYSTEM_PROMPT.rstrip()}\n\nUser Memories:\n{memories_str}"
    return f"{system}\n\nUser: {message}"


# ── Core: one turn of conversation ───────────────────────────────────────────
def respond(message: str, user_id: str = "default_user", source: str = "web"):
    """Search memory, answer with Gemini, store the exchange.

    Returns (answer, hits) — hits are the memories that shaped the answer, so
    the UI can show them in the memory panel.
    """
    hits = memory.search(query=message, user_id=user_id, limit=3)["results"]
    memories_str = "\n".join(f"- {h['memory']}" for h in hits)

    response = client.models.generate_content(
        model="gemini-3.7-flash",
        contents=build_prompt(memories_str, message),
    )
    answer = response.text

    memory.add(
        [
            {"role": "user", "content": message},
            {"role": "assistant", "content": answer},
        ],
        user_id=user_id,
        metadata={"source": source},
    )

    return answer, hits


def stored_count(user_id: str) -> int:
    try:
        return len(memory.get_all(user_id=user_id)["results"])
    except Exception:
        return 0


# ── HTTP API consumed by the Recall UI ───────────────────────────────────────
app = FastAPI(title="Recall API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your UI origin before deploying anywhere public
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatIn(BaseModel):
    message: str
    user_id: str = "default_user"


@app.get("/health")
def health():
    """Smoke-test auth without touching the UI: curl localhost:8000/health

    Never raises — returns the failure so curl shows you the real reason instead
    of a bare 500.
    """
    out = {
        "prompt_chars": len(SYSTEM_PROMPT),
        "key_tail": f"...{api_key[-4:]}",
        "adc_present": bool(ADC_AT_START)
        or (Path.home() / ".config/gcloud/application_default_credentials.json").exists(),
    }
    try:
        out["embedding_dims"] = len(memory.embedding_model.embed("auth probe", "search"))
        out["embed"] = "ok"
    except Exception as e:
        out["embed"] = f"{type(e).__name__}: {e}"[:400]
    try:
        client.models.generate_content(model="gemini-3.7-flash", contents="ping")
        out["generate"] = "ok"
    except Exception as e:
        out["generate"] = f"{type(e).__name__}: {e}"[:400]
    out["ok"] = out["embed"] == "ok" and out["generate"] == "ok"
    return out


@app.post("/chat")
def chat(body: ChatIn):
    answer, hits = respond(body.message, body.user_id)
    return {
        "response": answer,
        "memories": [
            {"memory": h["memory"], "score": round(float(h.get("score", 0) or 0), 3)}
            for h in hits
        ],
        "stored_count": stored_count(body.user_id),
    }


@app.get("/memories")
def list_memories(user_id: str = "default_user"):
    results = memory.get_all(user_id=user_id)["results"]
    return {
        "memories": [{"id": m["id"], "memory": m["memory"]} for m in results],
        "stored_count": len(results),
    }


@app.delete("/memories/{memory_id}")
def delete_memory(memory_id: str):
    memory.delete(memory_id=memory_id)
    return {"deleted": memory_id}


# ── Original console loop, kept for debugging ─────────────────────────────────
def cli():
    print("Chat with AI (type 'exit' to quit)")
    while True:
        try:
            user_input = input("You: ").strip()
        except EOFError:
            print("\nNo input available — exiting.")
            break

        if not user_input:
            continue
        if user_input.lower() == "exit":
            print("Goodbye!")
            break

        try:
            answer, hits = respond(user_input, source="cli")
            if hits:
                print("Relevant memories:")
                for h in hits:
                    print(f"- {h['memory']}")
            print(f"AI: {answer}")
        except Exception as e:
            print("Error during chat:", e)


# Serve the Recall UI from the same origin when index.html sits next to this file,
# so GET / stops 404-ing and there's no CORS or mixed-content to worry about.
# Mounted last so /chat, /memories and /health keep priority.
if (BASE_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="ui")


if __name__ == "__main__":
    if "--cli" in sys.argv:
        cli()
    else:
        import uvicorn

        uvicorn.run(app, host="0.0.0.0", port=8000)
