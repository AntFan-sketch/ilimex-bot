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
import AdmZip from "adm-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ----------------------
// Helpers & constants
// ----------------------

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx + 1) : "";
}

/**
 * Extract plain text from a DOCX buffer by reading word/document.xml
 * and stripping XML tags.
 */
function extractDocxTextFromBuffer(buffer: Buffer): string {
  try {
    const zip = new AdmZip(buffer);
    const xmlEntry = zip.getEntry("word/document.xml");

    if (!xmlEntry) {
      console.error("[DOCX] word/document.xml not found in DOCX");
      return "";
    }

    const xml = xmlEntry.getData().toString("utf-8");

    // Very simple XML -> text conversion:
    // - treat <w:p> as paragraph breaks
    // - strip all remaining tags
    // - normalise whitespace
    let text = xml
      .replace(/<w:p[^>]*>/g, "\n") // paragraph tags -> newline
      .replace(/<[^>]+>/g, " ") // all tags -> space
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();

    return text;
  } catch (err) {
    console.error("[DOCX] Error extracting DOCX text:", err);
    return "";
  }
}

/**
 * Build extra context message from uploaded documents.
 * - TXT-like files: fully ingested.
 * - DOCX: parsed via AdmZip (word/document.xml).
 * - Everything else (PDF, etc.): politely ask user to paste key sections.
 */
async function buildFilesContext(
  docs: UploadedDocument[]
): Promise<string | null> {
  if (!docs.length) return null;

  const parts: string[] = [];

  for (const doc of docs) {
    const ext = getExtension(doc.filename);

    // 1) Plain text files – download and embed directly
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          console.error("[FILES] Failed to download text doc:", doc.filename);
          parts.push(
            `The user uploaded a text-based document named "${doc.filename}", but there was a problem downloading it. Tell the user there was a problem downloading the file and ask them to paste the relevant sections so you can help.`
          );
          continue;
        }

        const text = await res.text();
        const truncated = text.length > 15000 ? text.slice(0, 15000) : text;

        parts.push(
          `The user has uploaded a text document named "${doc.filename}". You DO have access to the following text from this document:\n\n` +
            truncated +
            `\n\nEnd of document content for "${doc.filename}". Use this text normally in your reasoning.`
        );
      } catch (err) {
        console.error("[FILES] Error fetching text document:", doc.filename, err);
        parts.push(
          `The user uploaded a document named "${doc.filename}", but there was a problem reading it. Tell the user there was an internal error reading the file and ask them to paste the key sections.`
        );
      }
      continue;
    }

    // 2) DOCX – try to extract text via AdmZip
    if (ext === "docx") {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          console.error("[DOCX] Failed to download DOCX:", doc.filename);
          parts.push(
            `The user uploaded a DOCX document named "${doc.filename}", but there was a problem downloading it. Ask them to paste the key sections as text so you can assist.`
          );
          continue;
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const docxText = extractDocxTextFromBuffer(buffer);

        if (!docxText || !docxText.trim()) {
          console.error("[DOCX] Empty text extracted from DOCX:", doc.filename);
          parts.push(
            `The user uploaded a DOCX document named "${doc.filename}", but we could not reliably extract text from it. Ask them to paste the key sections as text so you can assist.`
          );
          continue;
        }

        const truncated =
          docxText.length > 15000 ? docxText.slice(0, 15000) : docxText;

        parts.push(
          `The user has uploaded a DOCX document named "${doc.filename}". You DO have access to the following extracted text from this document:\n\n` +
            truncated +
            `\n\nEnd of extracted DOCX content for "${doc.filename}". Use this text normally in your reasoning.`
        );
      } catch (err) {
        console.error("[DOCX] Error handling DOCX document:", doc.filename, err);
        parts.push(
          `The user uploaded a DOCX document named "${doc.filename}", but there was an internal error extracting text. Ask them to paste the key sections or main points as text.`
        );
      }
      continue;
    }

    // 3) All other file types (PDF, XLSX, etc.) – no automatic extraction (for now)
    parts.push(
      `The user has uploaded a document named "${doc.filename}". This deployment cannot automatically read that file type yet. If the user asks you to summarise or interpret it, tell them you cannot automatically read that file and politely ask them to paste the key sections or main points as text.`
    );
  }

  if (!parts.length) return null;

  return (
    `The user has uploaded one or more documents in this conversation. ` +
    `Treat them as related internal context unless the user states otherwise.\n\n` +
    parts.join("\n\n")
  );
}

// ----------------------
// Main handler
// ----------------------

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

    // File-based context (TXT + DOCX)
    const filesContext = await buildFilesContext(docs);

    // Build messages for OpenAI
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
        role: m.role as "user" | "assistant",
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

    // Hard-strip any PARA tags / escaped PARA tags so UI never sees them
    raw = raw
      .replace(/&lt;PARA&gt;/g, "")
      .replace(/&lt;\/PARA&gt;/g, "")
      .replace(/<PARA>/g, "")
      .replace(/<\/PARA>/g, "")
      .trim();

    const reply: ChatMessage = {
      role: "assistant",
      content: raw,
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
