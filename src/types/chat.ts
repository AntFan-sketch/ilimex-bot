// src/types/chat.ts

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatResponseBody {
  message?: ChatMessage;
  reply?: ChatMessage;
  [key: string]: any;
}
