import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openaiClient";
import { ILIMEX_SYSTEM_PROMPT } from "@/lib/ilimexPrompt";
import { getContextForMessages } from "@/lib/retrieval";
import type {
  ChatMessage,
  ChatRequestBody,
  ChatResponseBody,
} from "@/types/chat";

export const runtime = "nodejs";

// --- Helpers to extract text from files ---

async function extractTextFromFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = file.name || "uploaded_file";
  const lower = filename.toLowerCase();

  try {
    if (lower.endsWith(".pdf")) {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return `Content from PDF "${filename}":\n\n${data.text}`;
    }

    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return `Content from Word document "${filename}":\n\n${result.value}`;
    }

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });

      let textParts: string[] = [];
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim().length > 0) {
          textParts.push(`Sheet: ${sheetName}\n${csv}`);
        }
      });

      const combined = textParts.join("\n\n");
      return `Content from Excel workbook "${filename}":\n\n${combined}`;
    }

    if (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".csv")
    ) {
      // Treat as UTF-8 text
      const text = buffer.toString("utf-8");
      return `Content from text file "${filename}":\n\n${text}`;
    }

    // Fallback: we don't know how to parse this type yet
    return `The user uploaded "${filename}" (file type not fully supported for direct text extraction yet).`;
  } catch (err) {
    console.error(`Failed to extract text from file "${filename}":`, err);
    return `There was an error reading "${filename}". Please continue using the rest of the conversation context.`;
  }
}

async function buildReplyFromMessages(
  messages: ChatMessage[],
  extraContext?: string
) {
  const openAiMessages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[] = [{ role: "system", content: ILIMEX_SYSTEM_PROMPT }];

  if (extraContext && extraContext.trim().length > 0) {
    openAiMessages.push({
      role: "system",
      content:
        "Additional internal Ilimex context relevant to this conversation:\n\n" +
        extraContext,
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

    // ✅ Branch 1: multipart/form-data (with file upload)
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
      const uploadedFiles = rawFiles.filter(
        (f): f is File => f instanceof File
      );

      if (uploadedFiles.length > 0) {
        const extractedTexts: string[] = [];
        for (const file of uploadedFiles) {
          const text = await extractTextFromFile(file);
          extractedTexts.push(text);
        }

        filesContext = extractedTexts.join("\n\n----------------------\n\n");
      }
    }
    // ✅ Branch 2: JSON (no files, existing behaviour)
    else {
      const body = (await req.json()) as ChatRequestBody;

      if (!body.messages || !Array.isArray(body.messages)) {
        return NextResponse.json<ChatResponseBody>(
          { reply: null, error: "Missing messages array" },
          { status: 400 }
        );
      }

      messages = body.messages;
    }

    // 🔎 Retrieve RAG-style internal context (existing logic)
    const retrievalContext = await getContextForMessages(messages);

    // Merge retrieval context + file context (if any)
    const combinedContext = [retrievalContext, filesContext]
      .filter((x) => x && x.trim().length > 0)
      .join("\n\n-----\n\n");

    const reply = await buildReplyFromMessages(messages, combinedContext);

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
