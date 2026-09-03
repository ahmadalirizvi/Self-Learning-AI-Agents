# Self-Learning AI Chat Agent

A console-based conversational AI agent that **remembers past conversations** and uses that memory to give more personalized, context-aware responses over time — built with [mem0](https://github.com/mem0ai/mem0), [Qdrant](https://qdrant.tech/), and the **Google Gemini API**.

Inspired by / built on top of the [ai-cookbook mem0 example](https://github.com/daveebbelaar/ai-cookbook/tree/main/knowledge/mem0).

## Overview

Unlike a stateless chatbot, this agent has long-term memory. Every conversation is stored, and relevant past memories are retrieved and injected into the prompt before generating a new response — so the assistant "learns" facts and preferences about the user across sessions instead of forgetting everything when the process exits.

## Features

- 🧠 **Persistent memory** — stores and recalls facts from previous conversations using `mem0`
- 🔍 **Semantic memory retrieval** — pulls the most relevant past memories for each new message (not just the most recent)
- ⚡ **Gemini-powered** — uses Google's Gemini models for both response generation and embeddings
- 🗂️ **Vector storage with Qdrant** — memories are embedded and stored in a local Qdrant instance
- 💻 **Simple console interface** — lightweight REPL-style chat loop, no UI dependencies
- 🐳 **Dockerized vector store** — Qdrant runs via Docker Compose, no manual setup required

## Tech Stack

| Component        | Technology            |
|-------------------|------------------------|
| LLM / Chat model  | Google Gemini API      |
| Embeddings        | Gemini Embedding model |
| Memory layer      | mem0                   |
| Vector database   | Qdrant (via Docker)    |
| Language          | Python                 |

## Architecture

```
User input
   │
   ▼
mem0.search()  ──►  retrieve relevant memories from Qdrant
   │
   ▼
Build prompt (system prompt + memories + user message)
   │
   ▼
Gemini API  ──►  generate response
   │
   ▼
mem0.add()  ──►  store the new exchange as a memory
   │
   ▼
Response printed to console
```

## Prerequisites

- Python 3.10+
- Docker & Docker Compose
- A [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key)

## Setup

1. **Clone the repo**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

2. **Start Qdrant** (vector store for memories)
   ```bash
   docker compose up -d
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set your API key**

   Create a `.env` file in the project root:
   ```
   API_KEY=your_gemini_api_key_here
   ```

5. **Run the agent**
   ```bash
   python main.py
   ```

## Usage

Once running, just chat normally in the console:

```
Chat with AI (type 'exit' to quit)
You: Hi, I'm learning about neural networks.
AI: ...

You: exit
Goodbye!
```

The agent will automatically recall relevant details from earlier in this (or previous) conversations when they're useful.

## Project Structure

```
.
├── docker-compose.yml       # Qdrant vector database service
├── main.py                  # Core chat + memory logic
├── prompts/
│   └── system_prompt.txt    # System prompt template
├── .env                      # API key (not committed)
└── README.md
```

## Roadmap / Ideas

- [ ] Add multi-user support with per-user memory namespaces
- [ ] Add a simple web UI
- [ ] Support conversation summarization for long-term memory pruning
- [ ] Add streaming responses

## Acknowledgements

- [mem0](https://github.com/mem0ai/mem0) for the memory layer
- [Qdrant](https://qdrant.tech/) for vector storage
- [ai-cookbook](https://github.com/daveebbelaar/ai-cookbook) for the original example this project builds on
