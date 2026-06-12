import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

    const digest = {
      overdue: overdue.rows,
      today: today.rows,
      immediate: immediate.rows,
      unassigned: unassigned.rows,
    };

    console.log("DAILY FOLLOW-UP DIGEST");
    console.log(JSON.stringify(digest, null, 2));

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