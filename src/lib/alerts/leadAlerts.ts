import { getPool } from "@/lib/db";
import { sendLeadAlertEmail } from "@/lib/alerts/sendLeadAlertEmail";

export async function maybeSendLeadAlert(opts: {
  envName: string;
  conversationId?: string;
  leadScore: number;
  intent?: string;
  userSnippet?: string;
  ipHash?: string;
  uaHash?: string;
}) {
  if (process.env.ILIMEX_ALERTS_ENABLED !== "true") return;

  const conversationId = (opts.conversationId || "").trim();
  if (!conversationId) return;

  const pool = getPool();

  // Dedupe: one alert per (env, conversation_id)
  try {
    const inserted = await pool.query(
      `
      INSERT INTO lead_alerts_sent (env, conversation_id, lead_score, intent, user_snippet, ip_hash, ua_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (env, conversation_id) DO NOTHING
      RETURNING id
      `,
      [
        opts.envName,
        conversationId,
        opts.leadScore,
        opts.intent ?? null,
        opts.userSnippet ?? null,
        opts.ipHash ?? null,
        opts.uaHash ?? null,
      ]
    );

    if (inserted.rowCount === 0) return; // already alerted
  } catch {
    // Fail open: do nothing if DB has an issue
    return;
  }

  const subject = `ILIMEX BOT LEAD (${opts.leadScore}) — ${opts.intent ?? "unknown"}`;
  const text = [
    `New high-intent lead detected by IlimexBot.`,
    ``,
    `Environment: ${opts.envName}`,
    `Conversation ID: ${conversationId}`,
    `Lead Score: ${opts.leadScore}`,
    `Intent: ${opts.intent ?? "unknown"}`,
    ``,
    `User snippet:`,
    opts.userSnippet ?? "(no snippet)",
  ].join("\n");

  await sendLeadAlertEmail({ subject, text });
}