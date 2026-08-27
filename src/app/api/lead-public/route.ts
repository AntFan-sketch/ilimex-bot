export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { rateLimit } from "@/lib/security/rateLimit";
import { redactSnippet, sha256 } from "@/lib/analytics/sanitize";
import { captureLead } from "@/lib/crm/captureLead";

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

    // Optional fields (support both legacy mainIssue/extraDetails and current message)
    const mainIssue = safeTrim((body as any).mainIssue ?? message).slice(0, 2000);
    const extraDetails = safeTrim((body as any).extraDetails).slice(0, 2000);

    // ✅ NEW: revenue intelligence fields (optional)
    const conversationId = safeTrim((body as any).conversationId).slice(0, 160);
    const intent = safeTrim((body as any).intent).slice(0, 80);
    const segment = safeTrim((body as any).segment).slice(0, 80);
    const scoreBand = safeTrim((body as any).scoreBand).slice(0, 40);
    const timeline = safeTrim((body as any).timeline).slice(0, 120);
    const leadScoreRaw = (body as any).leadScore;
    const leadScore = Number(leadScoreRaw);
    const leadScoreSafe = Number.isFinite(leadScore)
      ? Math.max(0, Math.min(100, Math.round(leadScore)))
      : 0;

    const scale = parseScale((body as any).scale);

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

    // The visitor has explicitly submitted an enquiry, so this is the point at
    // which we create/update a CRM record. CRM failure must not make a
    // successfully-sent enquiry appear to have failed.
    try {
      await captureLead({
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        mode: "external",
        conversationId: conversationId || undefined,
        leadScore: leadScoreSafe,
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
        lastUserMessage: redactSnippet(message, 500),
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