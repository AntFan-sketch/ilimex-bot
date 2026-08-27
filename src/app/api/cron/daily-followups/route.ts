import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorised(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const auth = req.headers.get("authorization")?.trim() ?? "";
  return Boolean(expected) && auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return Response.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  try {
    const pool = getPool();

    const overdue = await pool.query(`
      SELECT id, company, contact_name, owner, deal_score, deal_stage, next_action, next_action_due
      FROM crm_leads
      WHERE COALESCE(deal_stage, '') NOT IN ('Closed Won','Closed Lost')
      AND next_action_due < CURRENT_DATE
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const today = await pool.query(`
      SELECT id, company, contact_name, owner, deal_score, deal_stage, next_action, next_action_due
      FROM crm_leads
      WHERE COALESCE(deal_stage, '') NOT IN ('Closed Won','Closed Lost')
      AND next_action_due = CURRENT_DATE
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const immediate = await pool.query(`
      SELECT id, company, contact_name, owner, deal_score, deal_stage, next_action, next_action_due
      FROM crm_leads
      WHERE COALESCE(deal_stage, '') NOT IN ('Closed Won','Closed Lost')
      AND next_action_priority = 'Immediate'
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const unassigned = await pool.query(`
      SELECT id, company, contact_name, owner, deal_score, deal_stage, next_action, next_action_due
      FROM crm_leads
      WHERE COALESCE(deal_stage, '') NOT IN ('Closed Won','Closed Lost')
      AND (owner IS NULL OR owner = '')
      AND COALESCE(deal_score, lead_score, 0) >= 80
      ORDER BY COALESCE(deal_score, lead_score, 0) DESC
      LIMIT 25
    `);

    return Response.json({
      ok: true,
      generated_at: new Date().toISOString(),
      counts: {
        overdue: overdue.rows.length,
        today: today.rows.length,
        immediate: immediate.rows.length,
        unassigned: unassigned.rows.length,
      },
    });
  } catch (err) {
    console.error("GET /api/cron/daily-followups error:", err);

    return Response.json(
      {
        ok: false,
        error: "Failed to generate daily follow-up digest",
      },
      {
        status: 500,
      }
    );
  }
}