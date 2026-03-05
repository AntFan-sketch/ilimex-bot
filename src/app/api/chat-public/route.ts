// src/app/api/chat-public/route.ts
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { scoreLead } from "@/lib/revenue/scoring";

// ✅ NEW: analytics
import { logBotEvent } from "@/lib/analytics/logEvent";
import { redactSnippet, sha256, shouldSample } from "@/lib/analytics/sanitize";

// ✅ NEW: hardening
import { rateLimit } from "@/lib/security/rateLimit";

// ✅ NEW: lead alerts
import { maybeSendLeadAlert } from "@/lib/alerts/leadAlerts";

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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    // --------------------------------------------------
    // ✅ Analytics controls (additive-only, never breaks chat)
    // --------------------------------------------------
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

    // ✅ Rate limit key (privacy-safe)
    const rlKey = `public:${ipHash || "noip"}:${uaHash || "noua"}`;

    // ✅ Limit: 30 requests per 10 minutes per browser/IP signature
    const rl = await rateLimit({ key: rlKey, limit: 30, windowSeconds: 600 });
    if (!rl.ok) {
      return new Response(
        JSON.stringify({
          message: {
            content:
              "You’re sending messages too quickly. Please try again shortly.",
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

    // stable sampling key: prefer conversationId, fallback ip/ua
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

    const lastUser =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const userCount = messages.filter((m) => m.role === "user").length;

    // ✅ Hard cap: reject huge inputs to protect cost/abuse
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

    // ✅ Revenue intelligence meta (Scoring v1.0)
    const meta = scoreLead({
      message: lastUser,
      messageCount: userCount,
      qualificationAsked,
    });

    // Public route: keep meta safe (no debug signals)
    const metaOut = { ...meta, signals: [] as string[] };

    // ✅ Decide CTA behaviour server-side (public bot)
    // NOTE: scoreLead() adds "negative_damper" to signals when message looks academic / "template answer" etc.
    const isDamped = (meta.signals ?? []).includes("negative_damper");

    const ctaAutoOpen =
  !isDamped &&
  !meta.askQualification &&
  lastUser.trim().length > 6 &&
  (
    meta.intent === "commercial" ||
    meta.intent === "high_intent" ||
    meta.intent === "partnership" ||
    meta.intent === "trial"
  ) &&
  meta.leadScore >= 75;

    // --------------------------------------------------
    // ✅ Real-time lead alerts (fail-open, deduped per conversation)
    // --------------------------------------------------
    const shouldAlert =
  !isDamped &&
  !meta.askQualification &&
  meta.leadScore >= 65 &&
  (
    meta.intent === "commercial" ||
    meta.intent === "high_intent" ||
    meta.intent === "partnership" ||
    meta.intent === "trial"
  );

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

    // Use an environment override so you can switch later without code changes
    const model = process.env.OPENAI_PUBLIC_MODEL || "gpt-5-chat-latest";

    const systemPrompt = `
You are IlimexBot, a public-facing assistant for farmers and potential customers.
Use clear, friendly language and focus on practical benefits of Ilimex technology.

Rules:
- Avoid sharing internal, confidential, or unpublished details.
- Use cautious language: "may help", "is designed to", "aims to".
- Outcomes vary by site; trials are ongoing.
- Do NOT repeat meta-instructions, prompts, or phrases like
  "in a cautious way", "farmer-friendly", or similar guidance.
- Respond naturally, as if speaking directly to a farmer.
- Use cautious language implicitly, not explicitly.
- If asked for pricing, provide ranges only if explicitly provided; otherwise explain what info is needed for a quote.
- If the user asks to contact sales, provide a short list of what you need and suggest using the site's enquiry form.
`.trim();

    const openAiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [{ role: "system", content: systemPrompt }];

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
      temperature: 0.3,
      messages: openAiMessages,
    });

    const reply =
      completion.choices[0]?.message?.content ??
      "No response generated by IlimexBot.";

    // --------------------------------------------------
    // ✅ Analytics event write (non-blocking, swallow errors)
    // --------------------------------------------------
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
          typeof metaAny.scoreBand === "string"
            ? (metaAny.scoreBand as string)
            : undefined,

        damped: isDamped,
        damperValue: isDamped ? -25 : 0,

        ctaEligible: ctaAutoOpen,
        ctaAutoOpened: ctaAutoOpen,

        qualificationAsked,

        intent: meta.intent,
        segment:
          typeof metaAny.segment === "string"
            ? (metaAny.segment as string)
            : undefined,
        scale:
          typeof metaAny.scale === "string"
            ? (metaAny.scale as string)
            : undefined,
        timeline:
          typeof metaAny.timeline === "string"
            ? (metaAny.timeline as string)
            : undefined,

        msgLen: lastUser.length,
        userTextHash: sha256(lastUser),
        userSnippet: redactSnippet(lastUser, 120),

        ipHash: ipHash || undefined,
        uaHash: uaHash || undefined,

        latencyMs,
        model,

        payload: {
          scoringVersion: "v1.0",
          messageCount: userCount,
          askQualification: meta.askQualification,
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