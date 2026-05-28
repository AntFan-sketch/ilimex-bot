import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requireAdmin(req: NextRequest) {
  const expected = (
    process.env.ADMIN_DASH_TOKEN ??
    process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ??
    ""
  ).trim();

  const received = (req.headers.get("x-admin-token") ?? "").trim();

  return !!expected && received === expected;
}

export async function GET(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

    const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        id,
        created_at,
        last_activity_at,
        lead_score,
        COALESCE(deal_score, lead_score) AS deal_score,
        intent,
        segment,
        scale,
        timeline,
        status,
        COALESCE(deal_stage, status, 'new') AS deal_stage,
        next_action,
        next_action_priority,
        next_action_due,
        next_follow_up_at,
        last_contacted_at,
        follow_up_count,
        owner,
        contact_name,
        company,
        farm,
        email,
        phone,
        role_title,
        notes,
        source,
        mode,
        is_test,
        user_snippet
      FROM crm_leads
      WHERE
        (
          next_follow_up_at <= now()
          OR next_action_due <= CURRENT_DATE
          OR next_action_priority = 'Immediate'
        )
        AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'closed won', 'closed lost')
        AND LOWER(COALESCE(deal_stage, '')) NOT IN ('closed', 'closed won', 'closed lost')
      ORDER BY
        CASE
          WHEN next_action_priority = 'Immediate' THEN 0
          WHEN next_action_priority = 'This Week' THEN 1
          WHEN next_action_priority = 'Normal' THEN 2
          ELSE 3
        END ASC,
        COALESCE(deal_score, lead_score, 0) DESC,
        next_action_due ASC NULLS LAST,
        next_follow_up_at ASC NULLS LAST
      LIMIT 100;
    `);

    return json(200, { rows });
  } catch (err) {
    console.error("GET /api/leads/followups-due error:", err);
    return json(500, { error: "Failed to load due follow-ups" });
  }
}