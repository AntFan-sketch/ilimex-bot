import { getPool } from "@/lib/db";

type LeadInput = {
  env: string;
  mode: string;
  conversationId?: string;

  leadScore: number;
  intent?: string;
  segment?: string;
  scale?: string;
  timeline?: string;

  userTextHash: string;
  userSnippet: string;

  ipHash?: string;
  uaHash?: string;
};

export async function upsertCrmLead(input: LeadInput) {
  try {
    const pool = getPool();

    await pool.query(
      `
      INSERT INTO crm_leads (
        env, mode,
        conversation_id,
        lead_score,
        intent, segment, scale, timeline,
        user_text_hash, user_snippet,
        ip_hash, ua_hash
      )
      VALUES (
        $1,$2,
        $3,
        $4,
        $5,$6,$7,$8,
        $9,$10,
        $11,$12
      )
      ON CONFLICT (mode, env, conversation_id)
      DO UPDATE SET
        lead_score = GREATEST(crm_leads.lead_score, EXCLUDED.lead_score),
        intent = COALESCE(EXCLUDED.intent, crm_leads.intent),
        segment = COALESCE(EXCLUDED.segment, crm_leads.segment),
        scale = COALESCE(EXCLUDED.scale, crm_leads.scale),
        timeline = COALESCE(EXCLUDED.timeline, crm_leads.timeline),
        user_snippet = EXCLUDED.user_snippet
      `,
      [
        input.env,
        input.mode,
        input.conversationId || null,
        input.leadScore,
        input.intent || null,
        input.segment || null,
        input.scale || null,
        input.timeline || null,
        input.userTextHash,
        input.userSnippet,
        input.ipHash || null,
        input.uaHash || null,
      ]
    );
  } catch (err) {
    console.error("CRM lead upsert failed:", err);
  }
}