import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openaiClient";
import { ILIMEX_SYSTEM_PROMPT } from "@/lib/ilimexPrompt";
import { getContextForMessages } from "@/lib/retrieval";
import type {
  ChatMessage,
  ChatRequestBody,
  ChatResponseBody,
} from "@/types/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "auto";

// --- Helpers to extract text from files ---

async function extractTextFromFile(file: File): Promise<string> {
  const filename = file.name || "uploaded_file";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const lower = filename.toLowerCase();

  try {
    // For now, keep only very simple text handling
    if (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".csv")
    ) {
      const text = buffer.toString("utf-8");
      return `Content from text file "${filename}":\n\n${text}`;
    }

    // For all other file types (PDF, Word, Excel, etc.) we currently
    // cannot reliably parse content in this deployment.
    return `A file named "${filename}" was uploaded, but this IlimexBot deployment cannot reliably read its internal content. When the user asks about this file, you must clearly explain that file contents are not accessible in this environment and politely ask them to paste the relevant text or key sections into the chat so that you can help summarise or explain them. Do not say that you cannot read documents in general; instead focus on this specific limitation and invite the user to paste the text they want help with.`;
  } catch (err) {
    console.error(`Failed to process file "${filename}":`, err);
    return `A file named "${filename}" was uploaded, but there was an internal error while trying to handle it. You must tell the user that this deployment cannot read that file directly and ask them to paste the relevant sections or key points so you can assist.`;
  }
}

async function buildReplyFromMessages(
  messages: ChatMessage[],
  retrievalContext?: string,
  filesContext?: string
) {
  const openAiMessages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[] = [];

  // Base Ilimex system prompt
  openAiMessages.push({
    role: "system",
    content: ILIMEX_SYSTEM_PROMPT,
  });

  // Internal RAG context if present
  if (retrievalContext && retrievalContext.trim().length > 0) {
    openAiMessages.push({
      role: "system",
      content:
        "Additional internal Ilimex context relevant to this conversation:\n\n" +
        retrievalContext,
    });
  }

  // File-derived context if present
  if (filesContext && filesContext.trim().length > 0) {
    // Truncate to avoid huge prompts
    const MAX_FILE_CONTEXT_CHARS = 15000;
    const truncated =
      filesContext.length > MAX_FILE_CONTEXT_CHARS
        ? filesContext.slice(0, MAX_FILE_CONTEXT_CHARS) +
          "\n\n[Content truncated for length.]"
        : filesContext;

    openAiMessages.push({
      role: "system",
      content:
        "You have access to text that has been extracted from one or more documents the user uploaded in this chat. You must use this extracted content to answer questions about those documents, and you must not say that you cannot access or read documents. When the user asks for a summary or explanation, work directly from the extracted content below.\n\nExtracted document content:\n\n" +
        truncated,
    });
  }

  // Conversation history
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

  return reply;
}

export async function POST(req: NextRequest) {
  try {
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

    const contentType = req.headers.get("content-type") || "";

    let messages: ChatMessage[] = [];
    let filesContext = "";

    // Multipart/form-data: messages + files
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      const messagesJson = formData.get("messages");
      if (!messagesJson || typeof messagesJson !== "string") {
        return NextResponse.json<ChatResponseBody>(
          { reply: null, error: "Missing messages field in form data" },
          { status: 400 }
        );
      }

      try {
        const parsed = JSON.parse(messagesJson) as ChatMessage[];
        if (!Array.isArray(parsed)) {
          throw new Error("messages is not an array");
        }
        messages = parsed;
      } catch {
        return NextResponse.json<ChatResponseBody>(
          { reply: null, error: "Invalid messages JSON" },
          { status: 400 }
        );
      }

      const rawFiles = formData.getAll("files");
      console.log("DEBUG: rawFiles:", rawFiles);
      const uploadedFiles = rawFiles.filter(
        (f): f is File => f instanceof File
      );

      if (uploadedFiles.length > 0) {
        const extractedTexts: string[] = [];
        for (const file of uploadedFiles) {
          const text = await extractTextFromFile(file);
          extractedTexts.push(text);
        }
        filesContext = extractedTexts.join(
          "\n\n----------------------\n\n"
        );
      }
    } else {
      // JSON mode (no files)
      const body = (await req.json()) as ChatRequestBody;

      if (!body.messages || !Array.isArray(body.messages)) {
        return NextResponse.json<ChatResponseBody>(
          { reply: null, error: "Missing messages array" },
          { status: 400 }
        );
      }

      messages = body.messages;
    }

    // Internal RAG-style context
    const retrievalContext = await getContextForMessages(messages);

    const reply = await buildReplyFromMessages(
      messages,
      retrievalContext || undefined,
      filesContext
    );

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
}
