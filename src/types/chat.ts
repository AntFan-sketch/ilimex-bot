export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  role: Role;
  content: string;
}

// Retrieved chunk info for the Sources Drawer UI
export interface RetrievedChunk {
  id: string;
  score: number;
  section?: string;
  textPreview?: string;
  documentLabel?: string;
  debug?: {
    baseSim?: number;
    normalizedSim?: number;
    sectionWeight?: number;
  };
}

export interface ChatResponseBody {
  message?: ChatMessage;
  reply?: ChatMessage;

  // New for the Sources Drawer UI
  retrievedChunks?: RetrievedChunk[];

  [key: string]: any;
}
