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

// -------- File helpers --------

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx + 1) : "";
}

async function buildFilesContext(
  docs: UploadedDocument[]
): Promise<string | null> {
  if (!docs || docs.length === 0) return null;

  const parts: string[] = [];

  for (const doc of docs) {
    const ext = getExtension(doc.filename || "");

    // Text-like documents we can fetch directly
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          parts.push(
            `The user uploaded a text-based document named "${doc.filename}", but there was a problem downloading it. Tell the user there was a download error and ask them to paste the key sections as text so you can help.`
          );
          continue;
        }

        const text = await res.text();
        const truncated = text.length > 15000 ? text.slice(0, 15000) : text;

        parts.push(
          `You have access to the following text from an uploaded document named "${doc.filename}". Treat this as normal internal context. Use it when summarising, comparing documents or reasoning about trials, engineering or microbiology.\n\n` +
            `Begin document content for "${doc.filename}":\n\n` +
            truncated +
            `\n\nEnd document content for "${doc.filename}".`
        );
      } catch (err) {
        console.error("Error fetching text document:", doc.filename, err);
        parts.push(
          `The user uploaded a document named "${doc.filename}", but there was an internal error reading it. Tell the user there was a problem reading the file and ask them to paste the key sections as text.`
        );
      }
    } else {
      // PDFs, Word, Excel etc – we don't auto-extract yet
      parts.push(
        `The user has uploaded a non-text document named "${doc.filename}". This deployment does not automatically extract content from this file type yet. ` +
          `If the user asks you to summarise or interpret this document, clearly tell them you cannot automatically read the file and politely ask them to paste the relevant sections or key points as text.`
      );
    }
  }

  if (parts.length === 0) return null;

  return (
    "The user has uploaded one or more documents in this conversation. " +
    "Treat these as related internal context unless the user clearly indicates otherwise.\n\n" +
    parts.join("\n\n")
  );
}

// -------- Main handler --------

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

    // Vector / retrieval context
    const retrievalContext = await getContextForMessages(messages);

    // File-based context (text docs only)
    const filesContext = await buildFilesContext(docs);

    // Build messages for OpenAI
    const openAiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [];

    // Core system prompt
    openAiMessages.push({
      role: "system",
      content: ILIMEX_SYSTEM_PROMPT,
    });

    // Retrieval context as additional system message
    if (retrievalContext) {
      openAiMessages.push({
        role: "system",
        content:
          "Additional internal Ilimex context relevant to this conversation:\n\n" +
          retrievalContext,
      });
    }

    // File context as additional system message
    if (filesContext) {
      openAiMessages.push({
        role: "system",
        content: filesContext,
      });
    }

    // Conversation so far
    for (const m of messages) {
      openAiMessages.push({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.ILIMEX_OPENAI_MODEL || "gpt-4o-mini",
      messages: openAiMessages,
      temperature: 0.3,
    });

    const replyMessage = completion.choices[0]?.message;

    // In the current OpenAI SDK, message.content is a string.
    let raw: string =
      (replyMessage && typeof replyMessage.content === "string"
        ? replyMessage.content
        : "") || "Sorry, we could not generate a reply just now.";

    // ---- PARA CLEANUP (hard guarantee no tags reach UI) ----

    // Normalise HTML-encoded PARA tags and then strip them
    raw = raw
      .replace(/&lt;PARA&gt;/g, "\n\n")
      .replace(/&lt;\/PARA&gt;/g, "")
      .replace(/<PARA>/g, "\n\n")
      .replace(/<\/PARA>/g, "");

    // Collapse 3+ newlines down to double newlines for nicer paragraphs
    const cleaned = raw.replace(/\n{3,}/g, "\n\n").trim();

    const reply: ChatMessage = {
      role: "assistant",
      content: cleaned,
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
