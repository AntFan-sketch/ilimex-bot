// src/types/chat.ts

// Core role type used everywhere
export type ChatRole = "user" | "assistant" | "system";

// Core message type used by all chat routes and UI
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// Generic API response for the older chat routes (chat-public, chat-internal, chat-lite)
export interface ChatApiResponse {
  message: ChatMessage;
  [key: string]: any;
}

// IlimexBot-specific response shape (used by /api/ilimex-bot and HomePage)
export interface ChatResponseBody {
  reply?: ChatMessage;
  error?: string;
  [key: string]: any;
}
