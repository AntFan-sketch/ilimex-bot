// src/lib/crm/upsertLead.ts

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

  source?: string;
  contactName?: string;
  company?: string;
  farm?: string;
  email?: string;
  phone?: string;
  notes?: string;
  status?: string;

  ipHash?: string;
  uaHash?: string;
};

export async function upsertCrmLead(input: LeadInput) {
  const pool = getPool();

  const baseParams = [
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
    input.source || null,
    input.contactName || null,
    input.company || null,
    input.farm || null,
    input.email || null,
    input.phone || null,
    input.notes || null,
    input.ipHash || null,
    input.uaHash || null,
    input.status || "new",
  ];

  if (input.conversationId) {
    const result = await pool.query(
      `
      INSERT INTO crm_leads (
        env,
        mode,
        conversation_id,
        lead_score,
        intent,
        segment,
        scale,
        timeline,
        user_text_hash,
        user_snippet,
        source,
        contact_name,
        company,
        farm,
        email,
        phone,
        notes,
        ip_hash,
        ua_hash,
        status,
        last_activity_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        NOW()
      )
      ON CONFLICT (mode, env, conversation_id)
      DO UPDATE SET
        lead_score = GREATEST(crm_leads.lead_score, EXCLUDED.lead_score),
        intent = COALESCE(EXCLUDED.intent, crm_leads.intent),
        segment = COALESCE(EXCLUDED.segment, crm_leads.segment),
        scale = COALESCE(EXCLUDED.scale, crm_leads.scale),
        timeline = COALESCE(EXCLUDED.timeline, crm_leads.timeline),
        user_snippet = EXCLUDED.user_snippet,
        source = COALESCE(EXCLUDED.source, crm_leads.source),
        contact_name = COALESCE(EXCLUDED.contact_name, crm_leads.contact_name),
        company = COALESCE(EXCLUDED.company, crm_leads.company),
        farm = COALESCE(EXCLUDED.farm, crm_leads.farm),
        email = COALESCE(EXCLUDED.email, crm_leads.email),
        phone = COALESCE(EXCLUDED.phone, crm_leads.phone),
        notes = COALESCE(EXCLUDED.notes, crm_leads.notes),
        status = COALESCE(EXCLUDED.status, crm_leads.status),
        last_activity_at = NOW()
      RETURNING
        id,
        created_at,
        conversation_id,
        user_snippet,
        lead_score,
        intent,
        segment,
        scale,
        timeline,
        mode,
        source,
        contact_name,
        company,
        farm,
        email,
        phone,
        notes,
        status,
        last_activity_at
      `,
      baseParams
    );

    return result.rows[0];
  }

  const result = await pool.query(
    `
    INSERT INTO crm_leads (
      env,
      mode,
      conversation_id,
      lead_score,
      intent,
      segment,
      scale,
      timeline,
      user_text_hash,
      user_snippet,
      source,
      contact_name,
      company,
      farm,
      email,
      phone,
      notes,
      ip_hash,
      ua_hash,
      status,
      last_activity_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      NOW()
    )
    RETURNING
      id,
      created_at,
      conversation_id,
      user_snippet,
      lead_score,
      intent,
      segment,
      scale,
      timeline,
      mode,
      source,
      contact_name,
      company,
      farm,
      email,
      phone,
      notes,
      status,
      last_activity_at
    `,
    baseParams
  );

  return result.rows[0];
}