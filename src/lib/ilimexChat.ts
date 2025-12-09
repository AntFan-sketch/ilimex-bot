// src/lib/ilimexChat.ts

import { NextRequest } from "next/server";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type Role = "user" | "assistant" | "system";

export type IncomingMessage = {
  role: Role;
  content: string;
};

export type FileMeta = {
  originalName: string;
  storedName: string; // filename or id returned by your upload API
  mimeType: string;
};

export type ChatRequestBody = {
  messages: IncomingMessage[];
  files?: FileMeta[];
};

type Mode = "internal" | "public" | "lite";

// adjust this if your upload dir is different
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// ---------- SYSTEM PROMPTS ----------

function systemPromptForMode(mode: Mode): string {
  if (mode === "internal") {
    return `
You are IlimexBot, an internal assistant for Ilimex staff, board, and R&D partners.
You can discuss detailed trial results, houses, environmental stability, pathogen data,
and commercial modelling. Be honest about uncertainties and avoid over-claiming
beyond what Ilimex documents actually support.
`.trim();
  }

  if (mode === "public") {
    return `
You are IlimexBot, a public-facing assistant for farmers and potential customers.
Use clear, friendly language and focus on practical benefits of Ilimex technology.
Use cautious language such as "may help" or "is designed to". Do not reveal internal,
unpublished details or confidential partner information. Emphasise that results can
vary by farm and that trials are ongoing.
`.trim();
  }

  // lite
  return `
You are IlimexBot in lite mode. Provide short, clear answers. Do not rely on uploaded
files or external RAG context.
`.trim();
}

// ---------- FILE LOADING ----------

async function loadFileText(file: FileMeta): Promise<string> {
  const filePath = path.join(UPLOAD_DIR, file.storedName);

  // Plain text
  if (
    file.mimeType.startsWith("text/") ||
    file.originalName.toLowerCase().endsWith(".txt")
  ) {
    return await fs.readFile(filePath, "utf8");
  }

  // DOCX
  if (
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.originalName.toLowerCase().endsWith(".docx")
  ) {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // PDF placeholder
  if (
    file.mimeType === "application/pdf" ||
    file.originalName.toLowerCase().endsWith(".pdf")
  ) {
    return "[PDF support not yet implemented – file was uploaded but cannot be parsed on the server yet.]";
  }

  return `[Unsupported file type: ${file.mimeType} for ${file.originalName}]`;
}

// ---------- SIMPLE RAG CONTEXT (LEGACY) ----------

async function buildFileContext(
  files: FileMeta[] | undefined,
  mode: Mode,
  question: string
): Promise<string | null> {
  if (!files || files.length === 0) return null;
  if (mode === "lite") return null;

  const chunks: string[] = [];

  for (const f of files) {
    try {
      const text = await loadFileText(f);
      chunks.push(`--- FILE: ${f.originalName} ---\n${text}`);
    } catch (err) {
      console.error("Error reading file for RAG:", f, err);
      chunks.push(
        `--- FILE: ${f.originalName} ---\n[Error reading this file on the server]`
      );
    }
  }

  if (chunks.length === 0) return null;

  const combined = chunks.join("\n\n");
  const MAX_CHARS = 12000;
  const trimmed =
    combined.length > MAX_CHARS
      ? combined.slice(0, MAX_CHARS) + "\n\n[File content truncated]"
      : combined;

  return `The user asked: "${question}"

You have access to the following uploaded Ilimex documents:

${trimmed}`;
}

// ---------- MAIN HANDLER ----------

export async function handleChatWithRag(req: NextRequest, mode: Mode) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const { messages, files } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ reply: "No messages received by this chat endpoint." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemMessage: IncomingMessage = {
      role: "system",
      content: systemPromptForMode(mode),
    };

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const question = lastUser?.content ?? "";

    let augmentedMessages: IncomingMessage[] = [systemMessage, ...messages];

    if (mode !== "lite") {
      const context = await buildFileContext(files, mode, question);
      if (context) {
        augmentedMessages = [
          systemMessage,
          {
            role: "user",
            content: context,
          },
          ...messages,
        ];
      }
    }

    const completion = await client.chat.completions.create({
      model: "gpt-5.1-mini",
      temperature: 0.3,
      messages: augmentedMessages,
    });

    const replyText = completion.choices[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ reply: replyText }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Chat route error (mode:", mode, "):", err);
    return new Response(
      JSON.stringify({
        reply:
          "We hit an error handling this chat request. Please try again or contact the Ilimex team.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
