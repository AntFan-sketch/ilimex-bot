// src/app/api/chat-public/route.ts
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { scoreLead } from "@/lib/revenue/scoring";

// analytics
import { logBotEvent } from "@/lib/analytics/logEvent";
import { redactSnippet, sha256, shouldSample } from "@/lib/analytics/sanitize";

// hardening
import { rateLimit } from "@/lib/security/rateLimit";

// lead alerts
import { maybeSendLeadAlert } from "@/lib/alerts/leadAlerts";

import { captureLead } from "@/lib/crm/captureLead";
import { buildRetrievedKnowledgePrompt } from "@/lib/bot/retrieveExternalKnowledge";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages: IncomingMessage[];
  uploadedText?: string;
  conversationId?: string;
  qualificationAsked?: boolean;
};

function shouldPushSoftCta(userText: string) {
  const text = userText.toLowerCase();

  const keywords = [
    "price",
    "pricing",
    "cost",
    "quote",
    "quotation",
    "roi",
    "payback",
    "worth",
    "install",
    "installation",
    "unit",
    "units",
    "house",
    "houses",
    "birds",
    "trial",
    "results",
    "interested",
    "contact",
    "demo",
    "meeting",
    "email",
    "call",
  ];

  return keywords.some((k) => text.includes(k));
}

function appendSoftCta(reply: string) {
  const lower = reply.toLowerCase();

  const alreadyHasCta =
    lower.includes("quick conversation") ||
    lower.includes("tailored estimate") ||
    lower.includes("look at your setup") ||
    lower.includes("enquiry form");

  if (alreadyHasCta) return reply;

  return (
    reply.trim() +
    "\n\nIf you'd like, I can help arrange a quick conversation with the Ilimex team to look at your setup and estimate what this could deliver on your farm."
  );
}

function cleanAssistantReply(reply: string) {
  return reply
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stringifyScaleForLog(scale: unknown): string | undefined {
  if (typeof scale === "string") return scale;
  if (scale == null) return undefined;

  try {
    return JSON.stringify(scale);
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    const t0 = Date.now();
    const analyticsEnabled = process.env.ILIMEX_ANALYTICS_ENABLED === "true";
    const sampleRate = Number(process.env.ILIMEX_ANALYTICS_SAMPLE_RATE ?? "1");
    const envName = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";

    const userAgent = req.headers.get("user-agent") ?? "";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "";

    const ipHash = ip ? sha256(ip) : "";
    const uaHash = userAgent ? sha256(userAgent) : "";

    const rlKey = `public:${ipHash || "noip"}:${uaHash || "noua"}`;
    const rl = await rateLimit({ key: rlKey, limit: 30, windowSeconds: 600 });

    if (!rl.ok) {
      return new Response(
        JSON.stringify({
          message: {
            content: "You’re sending messages too quickly. Please try again shortly.",
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfterSeconds),
          },
        }
      );
    }

    const stableKey = body.conversationId ?? `${ipHash}:${uaHash}`;
    const sampled = analyticsEnabled && shouldSample(sampleRate, stableKey);

    const { messages, uploadedText, qualificationAsked = false } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({
          message: { content: "No messages received by public chat." },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
    const lastUser = userMessages[userMessages.length - 1] ?? "";
    const userCount = userMessages.length;
    const scoringText = userMessages.slice(-3).join("\n");

    if (lastUser.length > 3000) {
      return new Response(
        JSON.stringify({
          message: {
            content: "Message is too long. Please shorten it and try again.",
          },
        }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    const baseMeta = scoreLead({
      message: scoringText,
      messageCount: userCount,
      qualificationAsked,
    });

    const commercialIntentBoost = shouldPushSoftCta(lastUser) ? 8 : 0;
    const boostedLeadScore = Math.min(100, (baseMeta.leadScore ?? 0) + commercialIntentBoost);

    const meta = {
      ...baseMeta,
      leadScore: boostedLeadScore,
    };

    const metaOut = {
      ...meta,
      signals: Array.isArray(meta.signals) ? meta.signals : [],
    };

    const isDamped = (meta.signals ?? []).includes("negative_damper");
    const lowerUser = lastUser.toLowerCase();

    const explicitCtaRequest =
      /\b(quote|quotation|price|pricing|cost|install|installation|contact|call|email|meeting|demo|trial|roi|payback|results)\b/.test(
        lowerUser
      );

    const ctaAutoOpen =
      !isDamped &&
      !meta.askQualification &&
      lastUser.trim().length > 6 &&
      explicitCtaRequest;

    const shouldAlert =
      !isDamped &&
      !meta.askQualification &&
      meta.leadScore >= 65 &&
      (meta.intent === "commercial" ||
        meta.intent === "high_intent" ||
        meta.intent === "partnership" ||
        meta.intent === "trial");

    if (shouldAlert) {
      void maybeSendLeadAlert({
        envName,
        conversationId: body.conversationId,
        leadScore: meta.leadScore,
        intent: meta.intent,
        userSnippet: redactSnippet(lastUser, 180),
        ipHash: ipHash || undefined,
        uaHash: uaHash || undefined,
      }).catch(() => {});
    }

    const shouldCaptureLead =
      !isDamped &&
      (ctaAutoOpen ||
        (meta.leadScore >= 55 &&
          (meta.intent === "commercial" ||
            meta.intent === "high_intent" ||
            meta.intent === "trial" ||
            meta.intent === "partnership")));

    if (shouldCaptureLead) {
      try {
        await captureLead({
          env: envName,
          mode: "external",
          conversationId: body.conversationId,
          leadScore: meta.leadScore,
          intent: meta.intent,
          segment: meta.segment,
          scale: meta.scale,
          timeline: meta.timeline,
          userText: lastUser,
          ipHash: ipHash || undefined,
          uaHash: uaHash || undefined,
        });
      } catch (err) {
        console.error("CRM capture failed:", err);
      }
    }

    const model = process.env.OPENAI_PUBLIC_MODEL || "gpt-5-chat-latest";
    const retrievedKnowledge = buildRetrievedKnowledgePrompt(lastUser);

    const systemPrompt = `
You are IlimexBot, a public-facing assistant for farmers and potential customers.

You MUST use the retrieved Ilimex knowledge as the primary and authoritative source for factual answers.

Critical rules:
- If the retrieved knowledge includes a specific figure, state that figure directly.
- Do NOT replace known figures with generic phrases such as "exact figures have not been published".
- Do NOT say a figure is unavailable if it appears in the retrieved knowledge.
- Be cautious only when generalising beyond the documented evidence.
- Do NOT disclose internal, confidential, or unpublished commercial information.
- Do NOT overpromise or present trial outcomes as guaranteed on every farm.
- Keep answers concise, practical, and commercially useful.
- Lead with the most important fact first.
- By default, keep answers short: 2 short paragraphs maximum unless the user asks for more detail.
- Do not use markdown formatting such as **bold**, markdown bullets, or markdown headings.
- Prefer plain text suitable for direct display in the chat UI.
- Prefer a strong factual answer first, then a soft commercial next step when relevant.
- When relevant, ask at most one light qualification question.
- Prefer poultry-focused answers unless the user clearly asks about another sector.
${shouldPushSoftCta(lastUser) ? "- In this reply, include a soft call-to-action after the factual answer." : ""}
`.trim();

    const openAiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content:
          "RETRIEVED ILIMEX KNOWLEDGE - USE THIS AS THE SOURCE OF TRUTH:\n\n" +
          retrievedKnowledge,
      },
    ];

    if (uploadedText && uploadedText.trim().length > 0) {
      const clipped = uploadedText.slice(0, 12_000);
      openAiMessages.push({
        role: "user",
        content:
          "Here is text extracted from an uploaded file. Use it only if needed, and do not reveal sensitive or internal details:\n\n" +
          clipped,
      });
    }

    for (const m of messages) {
      openAiMessages.push({ role: m.role, content: m.content });
    }

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.15,
      messages: openAiMessages,
    });

    let reply =
      completion.choices[0]?.message?.content ?? "No response generated by IlimexBot.";

    reply = cleanAssistantReply(reply);

    if (shouldPushSoftCta(lastUser) && !meta.askQualification && !isDamped) {
      reply = appendSoftCta(reply);
    }

    if (sampled) {
      const latencyMs = Date.now() - t0;
      const metaAny = meta as unknown as Record<string, unknown>;

      void logBotEvent({
        env: envName,
        mode: "external",
        eventType: "turn",
        conversationId: body.conversationId,

        leadScore: meta.leadScore,
        scoreBand:
          typeof metaAny.scoreBand === "string" ? (metaAny.scoreBand as string) : undefined,

        damped: isDamped,
        damperValue: isDamped ? -25 : 0,

        ctaEligible: ctaAutoOpen,
        ctaAutoOpened: ctaAutoOpen,

        qualificationAsked,

        intent: meta.intent,
        segment:
          typeof metaAny.segment === "string" ? (metaAny.segment as string) : undefined,
        scale: stringifyScaleForLog(metaAny.scale),
        timeline:
          typeof metaAny.timeline === "string" ? (metaAny.timeline as string) : undefined,

        msgLen: lastUser.length,
        userTextHash: sha256(lastUser),
        userSnippet: redactSnippet(lastUser, 120),

        ipHash: ipHash || undefined,
        uaHash: uaHash || undefined,

        latencyMs,
        model,

        payload: {
          scoringVersion: "v1.4",
          messageCount: userCount,
          askQualification: meta.askQualification,
          assistantSnippet: redactSnippet(reply, 160),
          commercialIntentBoost,
          softCtaTriggered:
            shouldPushSoftCta(lastUser) && !meta.askQualification && !isDamped,
          retrievalUsed: true,
          retrievedKnowledgePreview: redactSnippet(retrievedKnowledge, 220),
        },
      });
    }

    return new Response(
      JSON.stringify({
        message: { content: reply },
        meta: metaOut,
        ctaAutoOpen,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("chat-public error:", {
      message: err?.message,
      status: err?.status,
      code: err?.code,
      type: err?.type,
      response: err?.response?.data,
    });

    return new Response(
      JSON.stringify({
        message: {
          content:
            "Sorry — something went wrong connecting to the server. Please try again in a moment.",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}