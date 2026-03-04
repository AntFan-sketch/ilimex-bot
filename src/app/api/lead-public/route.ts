export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import nodemailer from "nodemailer";

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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Honeypot: if present, pretend success (anti-bot)
    const company = safeTrim(body.company);
    if (company) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const name = safeTrim(body.name);
    const email = safeTrim(body.email);
    const phone = safeTrim(body.phone);
    const siteType = safeTrim(body.siteType);
    const location = safeTrim(body.location);
    const message = safeTrim(body.message);

    if (!name) return bad("Missing name");
    if (!email || !isValidEmail(email)) return bad("Missing/invalid email");
    if (!location) return bad("Missing location");
    if (!message) return bad("Missing message");

    const transcriptTail = Array.isArray(body.transcriptTail) ? body.transcriptTail : [];
    const source = safeTrim(body.source) || "ilimex-bot-external";

    // Optional fields (support both legacy mainIssue/extraDetails and current message)
    const mainIssue = safeTrim((body as any).mainIssue ?? message);
    const extraDetails = safeTrim((body as any).extraDetails);

    // ✅ NEW: revenue intelligence fields (optional)
    const conversationId = safeTrim((body as any).conversationId);
    const intent = safeTrim((body as any).intent);
    const segment = safeTrim((body as any).segment);
    const scoreBand = safeTrim((body as any).scoreBand);
    const timeline = safeTrim((body as any).timeline);
    const leadScoreRaw = (body as any).leadScore;
    const leadScore = Number(leadScoreRaw);
    const leadScoreSafe = Number.isFinite(leadScore) ? leadScore : 0;

    const scale = parseScale((body as any).scale);

    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = Number(process.env.SMTP_PORT || "2525");
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const TO_EMAIL = process.env.TO_EMAIL;
    const FROM_EMAIL = process.env.FROM_EMAIL;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !TO_EMAIL || !FROM_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Missing mail configuration on server." }),
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
        const role = safeTrim((m as any)?.role);
        const content = safeTrim((m as any)?.content);
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

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("SMTP ERROR", {
      message: err?.message,
      code: err?.code,
      response: err?.response,
      stack: err?.stack,
    });

    return new Response(
      JSON.stringify({
        error: err?.message || "SMTP failure",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}