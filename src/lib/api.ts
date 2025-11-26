// src/lib/api.ts

import { ChatMessage, ChatApiResponse } from "@/types/chat";

async function postChat(
  endpoint: "/api/chat-public" | "/api/chat-internal" | "/api/chat-lite",
  messages: ChatMessage[],
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

  return data.message;
}

export async function sendPublicChat(
  messages: ChatMessage[],
): Promise<ChatMessage> {
  return postChat("/api/chat-public", messages);
}

export async function sendInternalChat(
  messages: ChatMessage[],
): Promise<ChatMessage> {
  return postChat("/api/chat-internal", messages);
}

export async function sendLiteChat(
  messages: ChatMessage[],
): Promise<ChatMessage> {
  return postChat("/api/chat-lite", messages);
}
