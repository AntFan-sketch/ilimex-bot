// src/types/chat.ts

// Who is speaking in the chat
export type Role = "user" | "assistant" | "system";

// Single message in the conversation
export interface ChatMessage {
  role: Role;
  content: string;
}

// Optional document metadata if you ever add uploads/context docs.
// This is deliberately loose so it will fit whatever you're doing now.
export interface UploadedDocument {
  id: string;
  name: string;
  // Optional fields – safe defaults so existing code won't complain
  content?: string;
  url?: string;
  [key: string]: any;
}

// Shape of the request body your API routes accept
export interface ChatRequestBody {
  messages?: ChatMessage[];
  documents?: UploadedDocument[];
  // Extra fields can be added as needed without breaking anything
  [key: string]: any;
}

// Shape of the response body your API routes return
export interface ChatResponseBody {
  message: ChatMessage;
  // Optional additional data if you ever send more back
  [key: string]: any;
}

// Simple alias used in the frontend helper
export interface ChatApiResponse {
  message: ChatMessage;
}
