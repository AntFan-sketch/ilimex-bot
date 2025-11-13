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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json<ChatResponseBody>(
        { reply: null, error: "Missing messages array" },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = body.messages;

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

    // 🔎 Retrieve any additional internal context based on the conversation
    const context = await getContextForMessages(messages);

    // Build messages for OpenAI
    const openAiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [{ role: "system", content: ILIMEX_SYSTEM_PROMPT }];

    if (context) {
      openAiMessages.push({
        role: "system",
        content:
          "Additional internal Ilimex context relevant to this conversation:\n\n" +
          context,
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

    // 🔧 Convert <PARA> markers into real paragraph breaks if present.
    // If not present, heuristically split into short paragraphs based on sentences.
    let formatted: string;

    if (raw.includes("<PARA>")) {
      formatted = raw
        .split("<PARA>")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .join("\n\n");
    } else {
      // Heuristic fallback: split into sentences and group them into paragraphs.
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
}
