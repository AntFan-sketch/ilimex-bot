export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface UploadedDocument {
  filename: string;
  url: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  documents?: UploadedDocument[];
}

export interface ChatResponseBody {
  reply: ChatMessage | null;
  error?: string;
}
