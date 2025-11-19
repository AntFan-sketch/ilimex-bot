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

// ---- Helpers to build extra context from uploaded docs ----

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx + 1) : "";
}

async function buildFilesContext(
  docs: UploadedDocument[]
): Promise<string | null> {
  if (!docs.length) return null;

  const parts: string[] = [];

  for (const doc of docs) {
    const ext = getExtension(doc.filename);

    // 1) Plain text-like docs: fetch and embed content
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) {
          parts.push(
            `The user uploaded a text-based document named "${doc.filename}", but there was a problem downloading it. Tell the user that there was a problem downloading the file and ask them to paste the relevant sections so you can help.`
          );
          continue;
        }

        const text = await res.text();
        const truncated =
          text.length > 15000 ? text.slice(0, 15000) : text;

        parts.push(
          `You DO have access to the following text from an uploaded document named "${doc.filename}". You MUST treat this as normal text context and NEVER say that you cannot access the document.\n\n` +
            `When the user asks you to summarise, interpret or explain this document, you should normally follow this structure in your response, while still obeying all Ilimex style rules and paragraph formatting:\n\n` +
            `First paragraph: Briefly describe what the document is and its purpose in plain language.\n\n` +
            `Second and third paragraphs: Explain the main findings or points in clear, farmer-friendly terms, avoiding technical jargon where possible and keeping claims cautious and site-specific.\n\n` +
            `Next paragraph: Describe the practical implications or "so what" for the user’s farm or site, including any operational considerations, limitations and dependencies.\n\n` +
            `Final paragraph: Suggest sensible next steps with Ilimex, such as offering to pass details to the technical or commercial team, or asking for any missing information needed to advise properly.\n\n` +
            `Begin document content for "${doc.filename}":\n\n` +
            truncated +
            `\n\nEnd document content for "${doc.filename}".`
        );
      } catch (err) {
        console.error("Error fetching text document:", doc.filename, err);
        parts.push(
          `The user uploaded a document named "${doc.filename}", but there was a problem reading it. Tell the user there was an internal error reading the file and ask them to paste the key sections.`
        );
      }
      continue;
    }

    // 2) All other docs (PDF, Word, Excel, etc.) – acknowledge and ask for text
    parts.push(
      `The user has uploaded a non-text document named "${doc.filename}". This deployment does NOT automatically extract content from that file type yet. If the user asks you to summarise or interpret this document, you MUST tell them clearly that you cannot automatically read the file and politely ask them to paste the relevant sections or key points as text.`
    );
  }

  if (!parts.length) return null;

return (
  `The user has uploaded one or more documents in this conversation. ` +
  `These documents should be treated as a related document set unless the user explicitly states otherwise. ` +
  `When multiple documents are present, you MUST perform multi-document reasoning. This includes comparing them, identifying consistent or conflicting points, extracting shared themes, recognising gaps in the combined information, and producing a unified interpretation where appropriate.\n\n` +

  `If the user asks for a summary, explanation or analysis and more than one document contains usable text content, you should normally follow this structure while still applying all Ilimex style rules and paragraph formatting:\n\n` +
  `Paragraph 1: State what documents are present and what each one appears to represent.\n\n` +
  `Paragraph 2–3: Extract key points from each document, comparing them where relevant. Highlight alignments, differences, or patterns across the document set.\n\n` +
  `Next paragraph: Explain the combined implications for the farm or site, ensuring that claims remain cautious and site-specific.\n\n` +
  `Next paragraph: Identify gaps, inconsistencies or missing data that would improve interpretation.\n\n` +
  `Final paragraph: Suggest next steps with Ilimex, such as requesting additional data, connecting with the technical team, or preparing a clearer trial summary.\n\n` +

  `Use the provided content where available. If you see explicit "document content" in this context, you DO have access to it and MUST use it. ` +
  `Only say that you cannot access a document if this context does not include any actual document content.\n\n` +
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

    // Vector / retrieval context (existing behaviour)
    const retrievalContext = await getContextForMessages(messages);

    // File-based context (text docs only)
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
