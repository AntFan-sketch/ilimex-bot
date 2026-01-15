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

    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = Number(process.env.SMTP_PORT || "2525");
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const TO_EMAIL = process.env.TO_EMAIL;
    const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;


    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !TO_EMAIL || !FROM_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Missing mail configuration on server." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // SMTP2GO on 2525 uses STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const subject = `Website Enquiry – IlimexBot (ilimex.co.uk)`;

    const lines: string[] = [
      "New website enquiry (IlimexBot)",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : "Phone: (not provided)",
      siteType ? `Site type: ${siteType}` : "Site type: (not provided)",
      `Location: ${location}`,
      "",
      "Message:",
      message,
      "",
      `Source: ${source}`,
      "",
    ];

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
      replyTo: email, // so you can hit reply and respond to the lead
      subject,
      text,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lead-public error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function bad(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
