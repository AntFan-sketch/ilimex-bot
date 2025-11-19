import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openaiClient";
import { ILIMEX_SYSTEM_PROMPT } from "@/lib/ilimexPrompt";
import { getContextForMessages } from "@/lib/retrieval";
import type {
  ChatMessage,
  ChatRequestBody,
  ChatResponseBody,
  UploadedDocument,
} from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Helpers to build extra context from uploaded docs ---

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);

async function buildFilesContext(
  docs: UploadedDocument[]
): Promise<string | null> {
  if (!docs.length) return null;

  const parts: string[] = [];

  for (const doc of docs) {
    const lower = doc.filename.toLowerCase();
    const ext = lower.includes(".") ? lower.split(".").pop()! : "";

    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          parts.push(
            `The user uploaded "${doc.filename}", but there was a problem downloading it. Please ask them to paste the relevant sections.`
          );
          continue;
        }

        const text = await res.text();
        const truncated =
          text.length > 15000 ? text.slice(0, 15000) : text;

        parts.push(
          `Content from text-based document "${doc.filename}":\n\n${truncated}`
        );
      } catch (err) {
        console.error("Error fetching document:", doc.filename, err);
        parts.push(
          `The user uploaded "${doc.filename}", but there was a problem reading it. Please ask them to paste the key parts.`
        );
      }
    } else {
      parts.push(
        `The user has uploaded a non-text document "${doc.filename}". This deployment does not yet auto-extract content from this file type. If the user asks about it, politely ask them to paste the relevant parts of the document so you can help summarise or explain it.`
      );
    }
  }

  return (
    "The user has uploaded one or more documents in this conversation. " +
    "Use the provided content where available, and if content is missing, " +
    "ask the user to paste the relevant sections.\n\n" +
    parts.join("\n\n")
  );
}

// --- Main handler ---

export const POST = async (req: NextRequest) => {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json<ChatResponseBody>(
        {
          reply: null,
          error:
            "IlimexBot expects application/json. Please update the client to send JSON.",
        },
        { status: 400 }
      );
    }

    const body = (await req.json()) as ChatRequestBody;

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json<ChatResponseBody>(
        { reply: null, error: "Missing messages array" },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = body.messages;
    const docs: UploadedDocument[] = body.documents ?? [];

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json<ChatResponseBody>(
        {
          reply: null,
          error:
            "OPENAI_API_KEY is not set on the server. Please configure it in .env.local or in your deployment environment variables.",
        },
        { status: 500 }
      );
    }

    const retrievalContext = await getContextForMessages(messages);
    const filesContext = await buildFilesContext(docs);

    const openAiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [{ role: "system", content: ILIMEX_SYSTEM_PROMPT }];

    if (retrievalContext) {
      openAiMessages.push({
        role: "system",
        content:
          "Additional internal Ilimex context relevant to this conversation:\n\n" +
          retrievalContext,
      });
    }

    if (filesContext) {
      openAiMessages.push({
        role: "system",
        content: filesContext,
      });
    }

    for (const m of messages) {
      openAiMessages.push({
        role: m.role,
        content: m.content,
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.ILIMEX_OPENAI_MODEL || "gpt-4o-mini",
      messages: openAiMessages,
      temperature: 0.3,
    });

    const replyMessage = completion.choices[0]?.message;

    let raw: string =
      (replyMessage && typeof replyMessage.content === "string"
        ? replyMessage.content
        : "") || "Sorry, we could not generate a reply just now.";

    // Handle <PARA> formatting from the system prompt
    let formatted: string;

    if (raw.includes("<PARA>")) {
      formatted = raw
        .split("<PARA>")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .join("\n\n");
    } else {
      const sentences = raw
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const paragraphs: string[] = [];
      let buffer: string[] = [];

      for (const sentence of sentences) {
        buffer.push(sentence);
        if (buffer.length === 2) {
          paragraphs.push(buffer.join(" "));
          buffer = [];
        }
      }
      if (buffer.length > 0) {
        paragraphs.push(buffer.join(" "));
      }

      formatted = paragraphs.join("\n\n");
    }

    const reply: ChatMessage = {
      role: "assistant",
      content: formatted,
    };

    return NextResponse.json<ChatResponseBody>({ reply }, { status: 200 });
  } catch (error: any) {
    console.error("IlimexBot API error:", error);

    const message =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Unknown server error";

    return NextResponse.json<ChatResponseBody>(
      { reply: null, error: message },
      { status: 500 }
    );
  }
};
