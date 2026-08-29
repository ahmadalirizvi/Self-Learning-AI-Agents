from google import genai
from mem0 import Memory
from dotenv import load_dotenv
import os
import sys

load_dotenv()

config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333},
    },
}

# Initialize Gemini (GenAI) client using an API key from environment or .env
api_key = os.getenv("API_KEY") or os.getenv("API_KEY")
if not api_key:
    print(
        "No Gemini API key found. Set GENAI_API_KEY in your environment or .env."
    )
    print(
        "See https://ai.google.dev/gemini-api/docs/api-key for how to create an API key."
    )
    sys.exit(1)

client = genai.Client(api_key=api_key)

interaction = client.interactions.create(
    model="gemini-3.7-flash",
    input="You are a helpful AI. Answer the question based on query and memories.\nUser Memories:"
)

memory = Memory.from_config(config)


def chat_with_memories(message: str, user_id: str = "default_user") -> str:
    # Retrieve relevant memories
    relevant_memories = memory.search(
        query=message, filters={"user_id": user_id}, limit=3
    )
    memories_str = "\n".join(
        f"- {entry['memory']}" for entry in relevant_memories["results"]
    )
    print(memories_str)

    # Generate Assistant response
    system_prompt = f"You are a helpful AI. Answer the question based on query and memories.\nUser Memories:\n{memories_str}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]
    response = client.chat.completions.create(
        model="gpt-4o-mini", messages=messages
    )
    assistant_response = response.choices[0].message.content

    # Create new memories from the conversation
    messages.append({"role": "assistant", "content": assistant_response})
    # This is where the magic happens
    memory.add(messages, user_id=user_id, metadata={"source": "demo"})

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