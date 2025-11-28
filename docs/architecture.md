# IlimexBot – System Architecture (Source of Truth)

This document describes the **current working architecture** of IlimexBot as of November 2025.

It must be updated after every stable feature merge.  
It is the single source of truth for the bot’s structure.

---

## 1. Overview

IlimexBot consists of **three separate chat modes**, each exposed through its own API endpoint:

- `chat-internal` → For Ilimex staff, R&D partners, board-level use  
- `chat-public` → For farmers / website visitors (safe, controlled language)  
- `chat-lite` → Fallback mode, short answers, no file/RAG support

All three endpoints use the **same shared handler**, with different prompts and capabilities enabled.

---

## 2. API Endpoints

### `/api/chat-internal`
- Access to uploaded file contents  
- Can use DOCX, TXT, (PDF later)  
- Full R&D-level system prompt  
- Honest internal-facing answers  
- RAG context builder enabled

### `/api/chat-public`
- Access to uploaded file contents (restricted wording)  
- Safe external-facing tone  
- No internal-only data revealed  
- Cautious claims (“may help”, “designed to”)  
- RAG context builder enabled, but can be filtered later

### `/api/chat-lite`
- No file reading  
- No RAG  
- Minimal / short responses  
- Used when low-latency or low-risk answers are needed

---

## 3. Shared Handler: `lib/ilimexChat.ts`

All three endpoints call:

```ts
handleChatWithRag(req: NextRequest, mode: "internal" | "public" | "lite")
This tells ChatGPT the exact current architecture.

