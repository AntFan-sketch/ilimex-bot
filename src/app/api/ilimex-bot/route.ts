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

// Route config
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- File helpers ----------

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx + 1) : "";
}

async function extractDocxText(url: string): Promise<string | null> {
  try {
    // Lazy-load mammoth so build still works even if not used
    const mammoth = await import("mammoth");
    const res = await fetch(url);
    if (!res.ok) {
      console.error("[DOCX] Fetch failed:", res.status, url);
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuf });
    if (!result?.value) return null;

    const text = result.value as string;
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Truncate to keep prompts safe
    return trimmed.length > 15000 ? trimmed.slice(0, 15000) : trimmed;
  } catch (err) {
    console.error("[DOCX] Extraction error:", err);
    return null;
  }
}

async function buildFilesContext(
  docs: UploadedDocument[]
): Promise<string | null> {
  if (!docs.length) return null;

  const parts: string[] = [];

  for (const doc of docs) {
    const ext = getExtension(doc.filename);

    // 1) Plain text-like docs – fetch and embed content directly
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          console.error("[TEXT] Fetch failed:", res.status, doc.url);
          parts.push(
            `The user uploaded a text-based document named "${doc.filename}", but there was a problem downloading it. Tell the user that there was a problem downloading the file and ask them to paste the relevant sections so you can help.`
          );
          continue;
        }

        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed) {
          parts.push(
            `The user uploaded a text-based document named "${doc.filename}", but it appeared to contain no readable text. Ask them to paste the key sections so you can assist.`
          );
          continue;
        }

        const truncated =
          trimmed.length > 15000 ? trimmed.slice(0, 15000) : trimmed;

        parts.push(
          `You DO have access to the following text from an uploaded document named "${doc.filename}". You MUST treat this as normal text context and NEVER say that you cannot access the document.\n\n` +
            `Begin document content for "${doc.filename}":\n\n` +
            truncated +
            `\n\nEnd document content for "${doc.filename}".`
        );
      } catch (err) {
        console.error("[TEXT] Error fetching document:", doc.filename, err);
        parts.push(
          `The user uploaded a document named "${doc.filename}", but there was a problem reading it. Tell the user there was an internal error reading the file and ask them to paste the key sections.`
        );
      }
      continue;
    }

    // 2) DOCX – use mammoth to extract raw text
    if (ext === "docx") {
      const extracted = await extractDocxText(doc.url);
      if (extracted) {
        parts.push(
          `You DO have access to the following extracted text from a Word document named "${doc.filename}". Treat it as normal document content and NEVER say that you cannot access this file.\n\n` +
            `Begin document content for "${doc.filename}":\n\n` +
            extracted +
            `\n\nEnd document content for "${doc.filename}".`
        );
      } else {
        parts.push(
          `The user uploaded a Word document named "${doc.filename}", but there was an internal error extracting the text. Tell the user that this deployment cannot reliably read that document automatically and politely ask them to paste the key sections as text.`
        );
      }
      continue;
    }

    // 3) PDFs and everything else – for now, we do NOT auto-parse
    if (ext === "pdf") {
      parts.push(
        `The user has uploaded a PDF document named "${doc.filename}". This deployment does NOT automatically extract text from PDFs. If the user asks you to summarise or interpret this PDF, you MUST tell them clearly that you cannot automatically read the PDF in this deployment and politely ask them to paste the relevant sections or key points as text.`
      );
    } else {
      parts.push(
        `The user has uploaded a non-text document named "${doc.filename}". This deployment does NOT automatically extract content from that file type. If the user asks you to summarise or interpret this document, you MUST tell them clearly that you cannot automatically read the file and politely ask them to paste the relevant sections or key points as text.`
      );
    }
  }

  if (!parts.length) return null;

  // Wrap file context with the Ilimex internal-mode instructions you already defined
  return (
    "The user has uploaded one or more documents in this conversation. " +
    "These documents should be treated as a related document set unless the user explicitly states otherwise.\n\n" +
    "INTERNAL CONTEXT DETECTION (MANDATORY OVERRIDE):\n" +
    "If ANY uploaded document appears to be Ilimex internal material — including trial notes, engineering notes, microbiology notes, airflow data, internal summaries, or operational observations — you MUST switch into INTERNAL MODE. INTERNAL MODE means you treat the user as an Ilimex team member and use internal R&D, engineering and microbiology language, not farmer-facing language.\n\n" +
    parts.join("\n\n")
  );
}

// ---------- Main handler ----------

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

    // ... rest of the handler stays exactly as in the last version ...

    // Retrieval context (existing behaviour)
    const retrievalContext = await getContextForMessages(messages);

    // File-based context (text + docx; PDFs just described)
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

    // In the current OpenAI SDK, message.content is a string.
    let raw: string =
      (replyMessage && typeof replyMessage.content === "string"
        ? replyMessage.content
        : "") || "Sorry, we could not generate a reply just now.";

    // 🔧 Hard-strip any PARA markup so it never surfaces in the UI
    raw = raw
      .replace(/&lt;PARA&gt;/gi, "")
      .replace(/&lt;\/PARA&gt;/gi, "")
      .replace(/<PARA>/gi, "")
      .replace(/<\/PARA>/gi, "");

    let formatted = raw.trim();

    // Optional: light sentence-based paragraphing for readability
    if (formatted.length > 0) {
      const sentences = formatted
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (sentences.length > 1) {
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
