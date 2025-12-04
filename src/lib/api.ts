// src/lib/api.ts

//
// Local type definitions — do NOT import from "@/types/chat"
// because ChatMessage is now defined directly in page.tsx
//

type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatApiResponse {
  reply?: ChatMessage;
  error?: string;
  [key: string]: any;
}

//
// Core POST wrapper
//
async function postChat(
  endpoint: "/api/chat-public" | "/api/chat-internal" | "/api/chat-lite",
  messages: ChatMessage[]
): Promise<ChatMessage> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    throw new Error(`Chat API error: ${res.status} ${res.statusText}`);
  }

  const data: ChatApiResponse = await res.json();

  // The correct return field is now `reply`
  return (
    data.reply ?? {
      role: "assistant",
      content: "No reply received from API.",
    }
  );
}

//
// Public helpers
//
export async function sendPublicChat(
  messages: ChatMessage[]
): Promise<ChatMessage> {
  return postChat("/api/chat-public", messages);
}

export async function sendInternalChat(
  messages: ChatMessage[]
): Promise<ChatMessage> {
  return postChat("/api/chat-internal", messages);
}

export async function sendLiteChat(
  messages: ChatMessage[]
): Promise<ChatMessage> {
  return postChat("/api/chat-lite", messages);
}
