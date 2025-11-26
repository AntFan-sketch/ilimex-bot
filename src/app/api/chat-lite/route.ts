// src/app/api/chat-lite/route.ts

export const runtime = "nodejs";

import { retrieveRelevantKnowledge } from "@/lib/retrieval";
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { ChatMessage } from "@/types/chat";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MICRO_PROMPT = `You are IlimexBot, the official AI assistant for Ilimex Ltd.

Be very concise, but follow these rules:
- Explain Flufence™ UVC air-sterilisation and Ilimex trials clearly and cautiously.
- Use only the following knowledge:
  • Ilimex develops UVC-based air-sterilisation systems for agriculture.
  • Flufence draws air through a sealed UVC chamber and returns treated air.
  • UVC is contained inside the chamber (no UVC into the room, no residues, no ozone).
  • Trials to date suggest improved environmental stability and more consistent yields in poultry and mushroom environments, but results vary by site and no guarantees are made.
  • Flufence does NOT replace ventilation or good management and does NOT guarantee removal of any specific pathogen.

Hard boundaries:
- Do NOT provide protocols, UVC calculations, legal/tax/medical/veterinary advice, or guarantees.
- Use phrases like “trials to date suggest…” and “results vary by site”.
- For pricing, engineering, or detailed safety questions, redirect to the Ilimex team.

Tone: professional, concise, accurate.`;


interface ChatRequestBody {
  messages?: ChatMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const userMessages: ChatMessage[] = body.messages ?? [];

    // NEW: safe retrieval wrapper
    let knowledgeText = "No specific additional knowledge was retrieved.";
    try {
      const knowledgeChunks = await retrieveRelevantKnowledge(userMessages);

      if (knowledgeChunks.length > 0) {
        knowledgeText = knowledgeChunks
          .map(
            (k) => `From Ilimex Knowledge Pack (${k.title}):\n${k.text}`,
          )
          .join("\n\n");
      }
    } catch (err) {
      console.error("Error in retrieveRelevantKnowledge (public):", err);
      // keep knowledgeText as default fallback
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: WEBSITE_SYSTEM_PROMPT,
      },
      {
        role: "system",
        content: `Relevant Ilimex Knowledge:\n\n${knowledgeText}`,
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
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("chat-public error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error?.message ?? "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
