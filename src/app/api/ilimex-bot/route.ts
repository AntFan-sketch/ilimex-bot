import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openaiClient";
import { ILIMEX_SYSTEM_PROMPT } from "@/lib/ilimexPrompt";
import { getContextForMessages } from "@/lib/retrieval";
import JSZip from "jszip";
import type {
  ChatMessage,
  ChatRequestBody,
  ChatResponseBody,
  UploadedDocument,
} from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Helpers to build extra context from uploaded docs ----

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);

const DOCX_EXTENSIONS = new Set(["docx"]);

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx + 1) : "";
}

async function extractDocxTextFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("DOCX fetch failed:", url, res.status);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();

    // Load ZIP structure of the .docx
    const zip = await JSZip.loadAsync(arrayBuffer as any);
    const docFile = zip.file("word/document.xml");
    if (!docFile) {
      console.error("DOCX word/document.xml not found in", url);
      return null;
    }

    const xml = await docFile.async("string");

    // Very simple XML → text extraction
    let text = xml;

    // Paragraphs → newlines
    text = text.replace(/<w:p[^>]*>/g, "\n");

    // Explicit line breaks
    text = text.replace(/<w:br[^>]*\/>/g, "\n");

    // Tabs
    text = text.replace(/<w:tab[^>]*\/>/g, " ");

    // Strip all remaining tags
    text = text.replace(/<[^>]+>/g, " ");

    // Decode a few common entities
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalise whitespace
    text = text.replace(/\s+/g, " ").trim();

    if (!text) return null;

    // Trim very long docs to keep context manageable
    const MAX_LEN = 15000;
    if (text.length > MAX_LEN) {
      text = text.slice(0, MAX_LEN);
    }

    return text;
  } catch (err) {
    console.error("Error extracting DOCX text from", url, err);
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

 if (DOCX_EXTENSIONS.has(ext)) {
      try {
        const text = await extractDocxTextFromUrl(doc.url);

        if (text && text.trim().length > 0) {
          parts.push(
            `You DO have access to the following text from an uploaded Word document named "${doc.filename}". You MUST treat this as normal text context and NEVER say that you cannot access the document.\n\n` +
              `When the user asks you to summarise, interpret or explain this document, you should normally follow this structure in your response, while still obeying all Ilimex style rules and paragraph formatting:\n\n` +
              `First paragraph: Briefly describe what the document is and its purpose in plain language.\n\n` +
              `Second and third paragraphs: Explain the main findings or points in clear, farmer-friendly terms, avoiding technical jargon where possible and keeping claims cautious and site-specific (unless you are clearly in INTERNAL MODE).\n\n` +
              `Next paragraph: Describe the practical implications or "so what" for Ilimex or the relevant site, including any operational considerations, limitations and dependencies.\n\n` +
              `Final paragraph: Suggest sensible next steps with Ilimex, such as offering to pass details to the technical or commercial team, or asking for any missing information needed to advise properly.\n\n` +
              `Begin document content for "${doc.filename}":\n\n` +
              text +
              `\n\nEnd document content for "${doc.filename}".`
          );
        } else {
          parts.push(
            `The user uploaded a Word document named "${doc.filename}", but there was a problem extracting text from it. Tell the user there was an internal error reading the file and ask them to paste the key sections.`
          );
        }
      } catch (err) {
        console.error("Error handling DOCX document:", doc.filename, err);
        parts.push(
          `The user uploaded a Word document named "${doc.filename}", but there was an internal error reading it. Ask them politely to paste the relevant sections as text so you can help.`
        );
      }
      continue;
    }

    // 1) Plain text-like docs: fetch and embed content
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          parts.push(
            `The user uploaded a text-based document named "${doc.filename}", but there was a problem downloading it. You must tell the user that there was a problem downloading the file and ask them to paste the relevant sections so you can help.`
          );
          continue;
        }

        const text = await res.text();
        const truncated =
          text.length > 15000 ? text.slice(0, 15000) : text;

        parts.push(
          `Document "${doc.filename}" (text content, truncated if very long):\n\n` +
            truncated
        );
      } catch (err) {
        console.error("Error fetching text document:", doc.filename, err);
        parts.push(
          `The user uploaded a document named "${doc.filename}", but there was an internal error reading it. You must tell the user there was an internal error reading the file and ask them to paste the key sections as text.`
        );
      }
      continue;
    }

    // 2) All other docs (PDF, Word, Excel, etc.) – acknowledge and ask for text
    parts.push(
      `The user has uploaded a non-text document named "${doc.filename}". This deployment cannot automatically extract content from that file type. If the user asks you to summarise or interpret this document, you must clearly say that you cannot automatically read the file and politely ask them to paste the relevant sections or key points as text.`
    );
  }

  if (!parts.length) return null;

  return (
    "The user has uploaded one or more documents in this conversation. " +
    "Treat these documents as potentially related internal Ilimex material unless the user explicitly says otherwise. " +
    "Use your INTERNAL vs EXTERNAL MODE rules from the system prompt when deciding how to interpret and discuss them.\n\n" +
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

    // Vector / retrieval context
    const retrievalContext = await getContextForMessages(messages);

    // File-based context (currently only for plain text docs)
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
    // Fall back to a friendly error message if it is missing.
    let raw: string =
      (replyMessage && typeof replyMessage.content === "string"
        ? replyMessage.content
        : "") || "Sorry, we could not generate a reply just now.";

    // 🔧 Normalise and STRIP any PARA tags so the UI never sees them
    raw = raw
      .replace(/&lt;PARA&gt;/g, "")
      .replace(/&lt;\/PARA&gt;/g, "")
      .replace(/<PARA>/g, "")
      .replace(/<\/PARA>/g, "")
      .trim();

    // Heuristic paragraph formatting: split into short paragraphs for readability
    const sentences = raw
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const paragraphs: string[] = [];
    let buffer: string[] = [];

    for (const sentence of sentences) {
      buffer.push(sentence);
      // group two sentences per paragraph for readability
      if (buffer.length === 2) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
    }

    if (buffer.length > 0) {
      paragraphs.push(buffer.join(" "));
    }

    const formatted = paragraphs.length > 0 ? paragraphs.join("\n\n") : raw;

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
