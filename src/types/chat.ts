export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
}

export interface ChatResponseBody {
  reply: ChatMessage | null;
  error?: string;
}
