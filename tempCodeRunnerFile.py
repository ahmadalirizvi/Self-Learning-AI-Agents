from google import genai
from mem0 import Memory
from dotenv import load_dotenv
import os
import sys

load_dotenv()

# Gemini API key (support common env names)
api_key = os.getenv("API_KEY") or os.getenv("API_KEY") or os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("No Gemini API key found. Set GENAI_API_KEY or GOOGLE_API_KEY in your .env file.")
    print("See https://ai.google.dev/gemini-api/docs/api-key for how to create one.")
    sys.exit(1)

client = genai.Client(api_key=api_key)

# mem0 config: Qdrant for storage, Gemini for both the LLM and the embedder
config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "localhost",
            "port": 6333,
            # Gemini embedding model used below returns 768-dim vectors;
            # ensure this matches the embedder you choose.
            "embedding_model_dims": 768,
            # Use a collection name that encodes the embedding dimension to
            # avoid colliding with an existing collection created with a
            # different vector size (e.g. 3072).
            "collection_name": "mem0_768",
        },
    },
    "llm": {
        "provider": "gemini",
        "config": {"api_key": api_key, "model": "gemini-3.7-flash"},
    },
    "embedder": {
        "provider": "gemini",
        "config": {"api_key": api_key, "model": "gemini-embedding-001"},
    },
}

memory = Memory.from_config(config)


def chat_with_memories(message: str, user_id: str = "default_user") -> str:
    # Retrieve relevant memories
    relevant_memories = memory.search(
        query=message, filters={"user_id": user_id}, limit=3
    )
    memories_str = "\n".join(
        f"- {entry['memory']}" for entry in relevant_memories["results"]
    )
    if memories_str:
        print("Relevant memories:\n" + memories_str)

    # Build the prompt for Gemini
    system_prompt = (
        "You are a helpful AI. Answer the question based on the query and memories.\n"
        f"User Memories:\n{memories_str}"
    )
    full_prompt = f"{system_prompt}\n\nUser: {message}"

    # Generate response using Gemini
    response = client.models.generate_content(
        model="gemini-3.7-flash",
        contents=full_prompt,
    )
    assistant_response = response.text

    # Store the exchange as new memory
    conversation = [
        {"role": "user", "content": message},
        {"role": "assistant", "content": assistant_response},
    ]
    memory.add(conversation, user_id=user_id, metadata={"source": "demo"})

    return assistant_response


def main():
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
            print(f"AI: {chat_with_memories(user_input)}")
        except Exception as e:
            print("Error during chat:", e)


if __name__ == "__main__":
    main()