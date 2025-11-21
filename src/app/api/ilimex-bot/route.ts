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

// ---- Helpers for uploaded docs ----

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
    const ext = getExtension(doc.filename);

    // 1) Plain text-like docs: fetch and inline content
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          parts.push(
            `The user uploaded a text-based document named "${doc.filename}", but there was a problem downloading it from storage. Tell the user that there was a problem downloading the file and ask them to paste the relevant sections so you can help.`
          );
          continue;
        }

        const text = await res.text();
        const truncated = text.length > 15000 ? text.slice(0, 15000) : text;

        parts.push(
          `The user has uploaded a text document named "${doc.filename}". The following is the usable text content from that document. You MUST treat this as normal context and you MUST NOT say you cannot access the document.\n\n` +
            `Begin content for "${doc.filename}":\n\n` +
            truncated +
            `\n\nEnd content for "${doc.filename}".`
        );
      } catch (err) {
        console.error("Error fetching text document:", doc.filename, err);
        parts.push(
          `The user uploaded a document named "${doc.filename}", but there was an internal error reading it. Tell the user there was an internal error reading the file and ask them to paste the key sections as text.`
        );
      }
      continue;
    }

    // 2) Non-text docs (PDF, Word, Excel, etc.) – acknowledge and explain limitation
    parts.push(
      `The user has uploaded a non-text document named "${doc.filename}". In THIS deployment, you CANNOT automatically read the contents of this file type. ` +
        `If the user asks you to summarise, interpret, or compare this document, you MUST clearly tell them that this system cannot automatically read that file type yet and politely ask them to paste the relevant sections or key points as text.`
    );
  }

  if (parts.length === 0) return null;

  return (
    "The user has uploaded one or more documents in this conversation. " +
    "Treat these documents as related to the question unless the user clearly states otherwise.\n\n" +
    parts.join("\n\n")
  );
}

// ---- Main handler ----

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

    // 1) Vector / retrieval context
    const retrievalContext = await getContextForMessages(messages);

    // 2) File-based context (text docs inline, others explained)
    const filesContext = await buildFilesContext(docs);

    // 3) Build messages for OpenAI
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
      // Our ChatMessage only uses "user" or "assistant" from the UI
      const role: "user" | "assistant" =
        m.role === "assistant" ? "assistant" : "user";

      openAiMessages.push({
        role,
        content: m.content,
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.ILIMEX_OPENAI_MODEL || "gpt-4o-mini",
      messages: openAiMessages,
      temperature: 0.3,
    });

    const replyMessage = completion.choices[0]?.message;

    // message.content is a string in our usage.
    let raw: string =
      (replyMessage && typeof replyMessage.content === "string"
        ? replyMessage.content
        : "") || "Sorry, we could not generate a reply just now.";

    // ---- Strip all PARA markup before sending to the client ----
    // Normalise any HTML-escaped PARA tags first
    raw = raw
      .replace(/&lt;PARA&gt;/g, "")
      .replace(/&lt;\/PARA&gt;/g, "");

    // Remove literal tags if the model still used them
    raw = raw.replace(/<PARA>/g, "").replace(/<\/PARA>/g, "");

    // Optionally trim leading/trailing whitespace
    const cleaned = raw.trim();

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
