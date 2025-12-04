// src/lib/ilimexChat.ts

// Local chat types — do NOT import "@/types/chat"

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface IlimexChatApiResponse {
  reply?: ChatMessage;
  error?: string;
  [key: string]: any;
}

export interface UploadedDocText {
  docName: string;
  text: string;
}

interface CallIlimexChatOptions {
  mode?: "internal" | "external";
  docsText?: UploadedDocText[];
  conversationId?: string;
}

/**
 * Core helper for the unified /api/ilimex-bot route.
 */
export async function callIlimexChat(
  messages: ChatMessage[],
  opts: CallIlimexChatOptions = {}
): Promise<ChatMessage> {
  const { mode, docsText, conversationId } = opts;
  const endpoint = "/api/ilimex-bot";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        mode,
        uploadedDocsText: docsText && docsText.length > 0 ? docsText : undefined,
        conversationId,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ilimex chat route HTTP ${res.status}`);
    }

    const data: IlimexChatApiResponse = await res.json();

    return (
      data.reply ?? {
        role: "assistant",
        content: "Sorry — no reply received from the API.",
      }
    );
  } catch (err) {
    console.error("Chat route error:", err);

    return {
      role: "assistant",
      content:
        "We hit a problem contacting the Ilimex chat route. Please try again shortly.",
    };
  }
}

/** INTERNAL convenience wrapper */
export async function callInternalIlimexChat(
  messages: ChatMessage[],
  docsText?: UploadedDocText[],
  conversationId?: string
): Promise<ChatMessage> {
  return callIlimexChat(messages, {
    mode: "internal",
    docsText,
    conversationId,
  });
}

/** EXTERNAL convenience wrapper */
export async function callExternalIlimexChat(
  messages: ChatMessage[],
  docsText?: UploadedDocText[],
  conversationId?: string
): Promise<ChatMessage> {
  return callIlimexChat(messages, {
    mode: "external",
    docsText,
    conversationId,
  });
}
