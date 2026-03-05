import { getPool } from "@/lib/db";

export type BotEvent = {
  env: string;
  mode: "external" | "internal";
  eventType: string;

  conversationId?: string;

  leadScore?: number;
  scoreBand?: string;

  damped?: boolean;
  damperValue?: number;

  ctaEligible?: boolean;
  ctaAutoOpened?: boolean;
  qualificationAsked?: boolean;

  intent?: string;
  segment?: string;
  scale?: string;
  timeline?: string;

  msgLen?: number;
  userTextHash?: string;
  userSnippet?: string;
  ipHash?: string;
  uaHash?: string;

  latencyMs?: number;
  model?: string;

  payload?: Record<string, unknown>;
};

export async function logBotEvent(evt: BotEvent) {
  if (process.env.ILIMEX_ANALYTICS_ENABLED !== "true") return;

  try {
    const pool = getPool();

    await pool.query(
      `
      INSERT INTO bot_events (
        env, mode, event_type,
        conversation_id,
        lead_score, score_band,
        damped, damper_value,
        cta_eligible, cta_auto_opened,
        qualification_asked,
        intent, segment, scale, timeline,
        msg_len,
        user_text_hash, user_snippet,
        ip_hash, ua_hash,
        latency_ms, model,
        payload
      ) VALUES (
        $1,$2,$3,
        $4,
        $5,$6,
        $7,$8,
        $9,$10,
        $11,
        $12,$13,$14,$15,
        $16,
        $17,$18,
        $19,$20,
        $21,$22,
        $23
      )
      `,
      [
        evt.env,
        evt.mode,
        evt.eventType,

        evt.conversationId ?? null,

        Number.isFinite(evt.leadScore) ? evt.leadScore : null,
        evt.scoreBand ?? null,

        typeof evt.damped === "boolean" ? evt.damped : null,
        Number.isFinite(evt.damperValue) ? evt.damperValue : null,

        typeof evt.ctaEligible === "boolean" ? evt.ctaEligible : null,
        typeof evt.ctaAutoOpened === "boolean" ? evt.ctaAutoOpened : null,

        typeof evt.qualificationAsked === "boolean" ? evt.qualificationAsked : null,

        evt.intent ?? null,
        evt.segment ?? null,
        evt.scale ?? null,
        evt.timeline ?? null,

        Number.isFinite(evt.msgLen) ? evt.msgLen : null,

        evt.userTextHash ?? null,
        evt.userSnippet ?? null,

        evt.ipHash ?? null,
        evt.uaHash ?? null,

        Number.isFinite(evt.latencyMs) ? evt.latencyMs : null,
        evt.model ?? null,

        evt.payload ? JSON.stringify(evt.payload) : null,
      ]
    );
  } catch {
    // analytics must never break chat
  }
}