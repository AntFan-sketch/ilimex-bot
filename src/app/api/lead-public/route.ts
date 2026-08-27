export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { rateLimit } from "@/lib/security/rateLimit";
import { redactSnippet, sha256 } from "@/lib/analytics/sanitize";
import { captureLead } from "@/lib/crm/captureLead";
import { scoreLead, extractBirdCount } from "@/lib/revenue/scoring";
import { calculateDealScore } from "@/lib/crm/calculateDealScore";

function safeTrim(s: unknown) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function bad(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Accept either:
 * - object: { unit: "houses"|"rooms", count: number }
 * - stringified JSON of same
 * - anything else -> null
 */
function parseScale(v: unknown): { unit: string; count: number } | null {
  try {
    const obj =
      typeof v === "string"
        ? (JSON.parse(v) as any)
        : (v as any);

    if (!obj || typeof obj !== "object") return null;

    const unit = safeTrim(obj.unit);
    const count = Number(obj.count);

    if (!unit) return null;
    if (!Number.isFinite(count) || count <= 0) return null;

    return { unit, count };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "";
    const userAgent = req.headers.get("user-agent") ?? "";
    const ipHash = ip ? sha256(ip) : "";
    const uaHash = userAgent ? sha256(userAgent) : "";
    const rl = await rateLimit({
      key: `lead-public:${ipHash || "noip"}`,
      limit: 5,
      windowSeconds: 600,
    });

    if (!rl.ok) {
      return new Response(
        JSON.stringify({ error: "Too many enquiry attempts. Please try again shortly." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Honeypot: if present, pretend success (anti-bot)
    const website = safeTrim(body.website);
    if (website) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const name = safeTrim(body.name).slice(0, 120);
    const company = safeTrim(body.company).slice(0, 200);
    const email = safeTrim(body.email).slice(0, 254);
    const phone = safeTrim(body.phone).slice(0, 60);
    const siteType = safeTrim(body.siteType).slice(0, 120);
    const location = safeTrim(body.location).slice(0, 200);
    const message = safeTrim(body.message).slice(0, 4000);

    if (!name) return bad("Missing name");
    if (!email || !isValidEmail(email)) return bad("Missing/invalid email");
    if (!location) return bad("Missing location");
    if (!message) return bad("Missing message");

    const transcriptTail = Array.isArray(body.transcriptTail) ? body.transcriptTail : [];
    const source = (safeTrim(body.source) || "ilimex-bot-external").slice(0, 120);

    // Derive lead intelligence server-side from the recent conversation rather
    // than trusting browser-supplied scoring metadata. This keeps CRM capture
    // useful even if the UI state is reset or client metadata is missing.
    const transcriptUserMessages = transcriptTail
      .filter((m) => safeTrim((m as any)?.role).toLowerCase() === "user")
      .map((m) => safeTrim((m as any)?.content).slice(0, 2000))
      .filter(Boolean)
      .slice(-8);
    const transcriptAssistantMessages = transcriptTail
      .filter((m) => safeTrim((m as any)?.role).toLowerCase() === "assistant")
      .map((m) => safeTrim((m as any)?.content).slice(0, 2000))
      .filter(Boolean)
      .slice(-8);
    const intelligenceText = [...transcriptUserMessages, message].filter(Boolean).join("\n");
    const sector = /poultry|broiler|layer|bird/i.test(siteType + " " + intelligenceText)
      ? "Poultry"
      : /mushroom|growing room|tunnel/i.test(siteType + " " + intelligenceText)
        ? "Mushrooms"
        : siteType || undefined;
    const serverMeta = scoreLead({
      message: intelligenceText,
      messageCount: Math.max(1, transcriptUserMessages.length),
      qualificationAsked: false,
    });
    const birdCount = extractBirdCount(intelligenceText);

    // Optional fields (support both legacy mainIssue/extraDetails and current message)
    const mainIssue = safeTrim((body as any).mainIssue ?? message).slice(0, 2000);
    const extraDetails = safeTrim((body as any).extraDetails).slice(0, 2000);

    // ✅ NEW: revenue intelligence fields (optional)
    const conversationId = safeTrim((body as any).conversationId).slice(0, 160);
    const clientLeadScore = Number((body as any).leadScore);
    const clientLeadScoreSafe = Number.isFinite(clientLeadScore)
      ? Math.max(0, Math.min(100, Math.round(clientLeadScore)))
      : 0;
    const leadScoreSafe = Math.max(clientLeadScoreSafe, serverMeta.leadScore ?? 0);
    const intent = safeTrim(serverMeta.intent).slice(0, 80);
    // Keep CRM segment as the operating sector where known; intent already
    // captures whether this is a trial, commercial enquiry, partnership, etc.
    const segment = safeTrim(
      sector === "Poultry"
        ? "poultry"
        : sector === "Mushrooms"
          ? "mushroom"
          : serverMeta.segment
    ).slice(0, 80);
    const scoreBand = safeTrim(serverMeta.scoreBand).slice(0, 40);
    const timeline = safeTrim(serverMeta.timeline).slice(0, 120);
    const scale = serverMeta.scale ?? parseScale((body as any).scale);
    const rolloutAcrossScale =
      !!scale &&
      /\b(?:roll(?:ing)?\s*out|across\s+all|all\s+\d+\s+(?:houses|rooms)|whole\s+farm|entire\s+farm)\b/i.test(
        intelligenceText
      );
    const estimatedUnitCount = rolloutAcrossScale ? scale.count : undefined;

    const partnershipType = intent === "trial" ? "Trial" : undefined;
    const dealStage =
      intent === "trial"
        ? "Trial Discussion"
        : intent === "commercial" || intent === "high_intent"
          ? "Qualified"
          : "New";
    const dealScore = calculateDealScore({
      leadScore: leadScoreSafe,
      segment,
      sector,
      partnershipType,
      estimatedUnitCount,
      company,
      dealStage,
      intent,
      timeline,
    });
    const nextActionPriority =
      dealScore >= 85 ? "Immediate" : dealScore >= 70 ? "This Week" : dealScore >= 50 ? "Normal" : "Low";
    const nextAction =
      intent === "trial"
        ? "Arrange discovery call / site assessment and scope commercial trial"
        : intent === "commercial" || intent === "high_intent"
          ? "Arrange commercial discovery call and confirm site requirements"
          : "Review enquiry and respond";

    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = Number(process.env.SMTP_PORT || "2525");
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const TO_EMAIL = process.env.TO_EMAIL;
    const FROM_EMAIL = process.env.FROM_EMAIL;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !TO_EMAIL || !FROM_EMAIL) {
      return new Response(
        JSON.stringify({ error: "We could not send your enquiry just now. Please try again shortly." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT || 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      requireTLS: true,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      tls: { minVersion: "TLSv1.2" },
    });

    const subject = `NEW ENQUIRY | IlimexBot | ${siteType || "Unknown"} | ${location || "Unknown"}`;

    const lines: string[] = [
      "New website enquiry (IlimexBot)",
      "",
      `Name: ${name || "Unknown"}`,
      `Company / farm: ${company || "Not provided"}`,
      `Email: ${email || "Unknown"}`,
      `Phone: ${phone || "Unknown"}`,
      `Site type: ${siteType || "Unknown"}`,
      `Location: ${location || "Unknown"}`,
      "",
      `Main issue: ${mainIssue || "Not provided"}`,
      "",
      "Extra details:",
      extraDetails || "None provided",
      "",
      "Message:",
      message || "None provided",
      "",
      `Source: ${source}`,
      "",
    ];

    // ✅ Lead intelligence block (only if we have anything meaningful)
    const hasIntel =
      !!conversationId || !!intent || !!segment || leadScoreSafe > 0 || !!scoreBand || !!timeline || !!scale;

    if (hasIntel) {
      lines.push("Lead intelligence:", "");
      if (conversationId) lines.push(`Conversation ID: ${conversationId}`);
      if (segment) lines.push(`Segment: ${segment}`);
      if (intent) lines.push(`Intent: ${intent}`);
      if (leadScoreSafe) lines.push(`Lead score: ${leadScoreSafe}${scoreBand ? ` (${scoreBand})` : ""}`);
      if (scale) lines.push(`Scale: ${scale.count} ${scale.unit}`);
      if (timeline) lines.push(`Timeline: ${timeline}`);
      lines.push("");
    }

    // Append recent chat context, if any
    if (transcriptTail.length) {
      lines.push("Recent chat context (last messages):", "");
      for (const m of transcriptTail.slice(-12)) {
        const roleRaw = safeTrim((m as any)?.role).toLowerCase();
        const role = roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : "";
        const content = safeTrim((m as any)?.content).slice(0, 2000);
        if (!role || !content) continue;
        lines.push(`${role.toUpperCase()}: ${content}`, "");
      }
    }

    const text = lines.join("\n");

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: email,
      subject,
      text,
    });

    const scaleSummary = scale ? `${scale.count} ${scale.unit}` : "";
    const birdSummary = birdCount
      ? `approximately ${birdCount.count.toLocaleString("en-GB")} ${birdCount.type === "poultry" ? "birds" : `${birdCount.type}s`}${/per\s+(?:house|shed|barn)/i.test(intelligenceText) ? " per house" : ""}`
      : "";
    const chatSummary = [
      sector ? `${sector} enquiry` : "Website enquiry",
      location ? `Location: ${location}` : "",
      scaleSummary ? `Reported scale: ${scaleSummary}` : "",
      birdSummary ? `Reported flock detail: ${birdSummary}` : "",
      message ? `Interest: ${message}` : "",
    ]
      .filter(Boolean)
      .join(". ")
      .slice(0, 2000);
    const lastBotMessage = transcriptAssistantMessages.at(-1);
    const isSyntheticTest =
      /@example\.com$/i.test(email) || /\btest\b/i.test(name) || /\btest\b/i.test(company);

    // The visitor has explicitly submitted an enquiry, so this is the point at
    // which we create/update a CRM record. CRM failure must not make a
    // successfully-sent enquiry appear to have failed.
    try {
      await captureLead({
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        mode: "external",
        conversationId: conversationId || undefined,
        leadScore: leadScoreSafe,
        dealScore,
        dealStage,
        nextAction,
        nextActionPriority,
        intent: intent || undefined,
        segment: segment || undefined,
        scale: scale || undefined,
        timeline: timeline || undefined,
        userText: message,
        source,
        contactName: name,
        company: company || undefined,
        email,
        phone: phone || undefined,
        notes: [siteType ? `Site type: ${siteType}` : "", location ? `Location: ${location}` : ""]
          .filter(Boolean)
          .join(" | "),
        sector,
        partnershipType,
        estimatedUnitCount,
        chatSummary,
        lastUserMessage: redactSnippet(message, 500),
        lastBotMessage: lastBotMessage ? redactSnippet(lastBotMessage, 1000) : undefined,
        isTest: isSyntheticTest,
        ipHash: ipHash || undefined,
        uaHash: uaHash || undefined,
      });
    } catch (crmError) {
      console.error(
        "CRM capture after enquiry failed:",
        crmError instanceof Error ? crmError.message : "unknown error"
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("SMTP ERROR", {
      message: err?.message,
      code: err?.code,
    });

    return new Response(
      JSON.stringify({
        error: "We could not send your enquiry just now. Please try again shortly.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}