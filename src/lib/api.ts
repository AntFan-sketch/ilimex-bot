// src/lib/api.ts

export type Role = "user" | "assistant" | "system";

export type ChatMessage = {
  role: Role;
  content: string;
};

export type ChatApiResponse = {
  reply?: ChatMessage;
  error?: string;
  [key: string]: any;
};

/**
 * Legacy helper for calling older chat endpoints.
 * Currently not used by IlimexBot (which calls /api/ilimex-bot directly),
 * but kept here so imports don't break and future code can re-use it.
 */
export async function postChat(
  endpoint: "/api/chat-public" | "/api/chat-internal" | "/api/chat-lite",
  body: any
): Promise<ChatApiResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      error: `HTTP ${res.status}`,
    };
  }

  const json = (await res.json()) as ChatApiResponse;
  return json;
}
