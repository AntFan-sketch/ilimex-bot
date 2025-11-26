// src/app/api/chat-lite/route.ts

export const runtime = "nodejs";

import { NextRequest } from "next/server";
import OpenAI from "openai";
import type {
  ChatMessage,
  ChatRequestBody,
  ChatResponseBody,
} from "@/types/chat";

// A lighter-weight version of the public system prompt.
// Shorter answers, same core guardrails, no retrieval.
const LITE_SYSTEM_PROMPT = `You are IlimexBot Lite, a streamlined public-facing assistant for Ilimex Ltd.

Your role:
- Provide short, clear answers (2–4 sentences) about Ilimex and the Flufence™ system.
- Follow the same safety and claims guardrails as the main IlimexBot.

Core facts:
- Ilimex is a Northern Ireland–based biosecurity technology company.
- Flufence™ is a UVC-based air-sterilisation system for agricultural environments.
- It draws air through a sealed UVC chamber and returns treated air to the environment.
- No UVC enters the room.
- It is designed not to generate ozone and produces no chemical residues.
- Flufence complements existing ventilation and management; it does not replace ventilation.

Guardrails:
- Do not provide UVC dosage or exposure calculations.
- Do not provide engineering instructions for building or modifying UVC systems.
- Do not provide medical, veterinary, legal, or tax advice.
- Do not guarantee yield, production, or disease outcomes.
- For poultry trials: say that trials are ongoing, results are still being analysed, and no performance or disease-related claims can be made yet.

Style:
- Keep answers concise.
- Use plain English.
- If information is not available, say you don’t have access to that detail.`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const userMessages: ChatMessage[] = body.messages ?? [];

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: LITE_SYSTEM_PROMPT,
      },
      ...userMessages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const raw = completion.choices[0]?.message;

    const assistantMessage: ChatMessage = {
      role: (raw?.role as "assistant") ?? "assistant",
      content:
        typeof raw?.content === "string"
          ? raw.content
          : JSON.stringify(raw?.content ?? ""),
    };

    const responseBody: ChatResponseBody = {
      message: assistantMessage,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("chat-lite error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error?.message ?? "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
