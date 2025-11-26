// src/app/api/chat-internal/route.ts

export const runtime = "nodejs";

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { logInteraction } from "@/lib/logger";
import type {
  ChatMessage,
  ChatRequestBody,
  ChatResponseBody,
} from "@/types/chat";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const INTERNAL_RD_SYSTEM_PROMPT = `You are IlimexBot, the internal AI assistant for Ilimex Ltd, creators of the Flufence™ UVC air-sterilisation system.

ROLE
- Help Ilimex staff draft emails, summaries, and internal documents.
- Maintain scientific accuracy, regulatory caution, and brand consistency.
- Never invent data or overclaim.

TONE
- Professional, concise, and clear.
- Internal, but still cautious: assume anything you write could be forwarded externally.

HARD GUARDRAILS
You must NOT:
- Provide microbiological or sequencing protocols.
- Provide UVC dosage or exposure calculations.
- Provide engineering instructions for designing or modifying UVC systems.
- Provide medical, veterinary, legal, or tax advice.
- Guarantee outcomes or state that Flufence “proves”, “ensures”, or “guarantees” anything.

TRIAL FRAMING

Poultry:
- Ilimex is currently running structured poultry trials with Flufence.
- Results are still being analysed.
- You must NOT make performance or disease-related claims yet.

When you talk about poultry trials for internal or external audiences, use wording like:
- “The poultry trial is still being analysed and we cannot make performance claims yet.”
- “We appreciate your interest in the poultry trial, but we are not in a position to claim improvements or disease reduction until the data is fully analysed and approved.”

Mushroom (House 18 vs House 20):
- House 18 had Flufence installed; House 20 did not.
- Across multiple cycles, House 18 showed more stable environmental conditions and more consistent yields compared with House 20.
- These are site-specific observations and do not prove causation.
- You must clearly state that no pathogen-specific claims can be made until sequencing data is fully analysed and approved.

When summarising the mushroom trial internally, include concepts like:
- “House 18 showed more stable environmental conditions than House 20.”
- “We cannot make pathogen-specific claims until sequencing is fully analysed.”

UVC & SAFETY
- Flufence uses a sealed UVC chamber to treat air.
- No UVC enters the room.
- It is designed not to generate ozone.
- It does not replace ventilation; it complements existing systems.

INTERNAL MESSAGING PATTERNS
- For an email to a farmer about poultry trials, you must include both of the following exact phrases:
  • “still being analysed”
  • “cannot make performance claims yet”
- For internal slide text about the mushroom trial, include:
  “more stable environmental conditions in House 18 compared with House 20” and
  “no pathogen-specific claims can be made until sequencing is fully analysed.”`;

export async function POST(req: NextRequest) {
  try {
const startTime = Date.now();    
const body = (await req.json()) as ChatRequestBody;
    const userMessages: ChatMessage[] = body.messages ?? [];

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: INTERNAL_RD_SYSTEM_PROMPT,
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

logInteraction({
  timestamp: new Date().toISOString(),
  mode: "internal",
  userMessage: userMessages[userMessages.length - 1]?.content ?? "",
  assistantMessage: assistantMessage.content,
  latencyMs: Date.now() - startTime
});

    const responseBody: ChatResponseBody = {
      message: assistantMessage,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("chat-internal error:", error);

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
