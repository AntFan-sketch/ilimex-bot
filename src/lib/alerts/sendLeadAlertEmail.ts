import nodemailer from "nodemailer";

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function getPort(): number {
  const raw = (process.env.SMTP_PORT ?? "").trim();
  const n = Number(raw);
  // Default safely to 587 if blank/unparseable
  return Number.isFinite(n) && n > 0 ? n : 587;
}

function getTransport() {
  const host = reqEnv("SMTP_HOST");
  const port = getPort();
  const user = reqEnv("SMTP_USER");
  const pass = reqEnv("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS, 587/2525 = STARTTLS
    auth: { user, pass },
  });
}

export async function sendLeadAlertEmail(opts: {
  subject: string;
  text: string;
}) {
  if (process.env.ILIMEX_ALERTS_ENABLED !== "true") return;

  const to = reqEnv("TO_EMAIL");
  const from = reqEnv("FROM_EMAIL");

  const transporter = getTransport();
  await transporter.sendMail({
    to,
    from,
    subject: opts.subject,
    text: opts.text,
  });
}