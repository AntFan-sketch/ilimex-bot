// src/app/api/chat-lite/route.ts

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { ChatMessage } from "@/types/chat";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MICRO_PROMPT = `You are IlimexBot, the official AI assistant for Ilimex Ltd.
Provide clear, cautious explanations of the Flufence™ UVC air-sterilisation system and Ilimex trial findings.
Use only publicly shared information.
Do NOT offer scientific protocols, UVC calculations, legal, tax, medical, or veterinary advice, or any guarantees.
Use phrases like “trials to date suggest” and “site-specific results”.
For safety-related or detailed engineering questions, redirect to the Ilimex team.
Tone: professional, concise, and accurate.`;

interface ChatRequestBody {
  messages?: ChatMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const userMessages = body.messages ?? [];

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: MICRO_PROMPT,
      },
      ...userMessages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 400,
    });

    const raw = completion.choices[0]?.message;

    const assistantMessage: ChatMessage = {
      role: (raw?.role as "assistant") ?? "assistant",
      content:
        typeof raw?.content === "string"
          ? raw.content
          : JSON.stringify(raw?.content ?? ""),
    };

    return new Response(
      JSON.stringify({
        message: assistantMessage,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    console.error("chat-lite error:", error);
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
