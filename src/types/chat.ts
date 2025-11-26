// src/types/chat.ts

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  role: Role;
  content: string;
}

// Shape of what your API routes return
export interface ChatApiResponse {
  message: ChatMessage;
}
