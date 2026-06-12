import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function GET() {
  try {
    const pool = getPool();

    const overdue = await pool.query(`
      SELECT *
      FROM crm_leads
      WHERE deal_stage NOT IN ('Closed Won','Closed Lost')
      AND next_action_due < CURRENT_DATE
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const today = await pool.query(`
      SELECT *
      FROM crm_leads
      WHERE deal_stage NOT IN ('Closed Won','Closed Lost')
      AND next_action_due = CURRENT_DATE
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const immediate = await pool.query(`
      SELECT *
      FROM crm_leads
      WHERE deal_stage NOT IN ('Closed Won','Closed Lost')
      AND next_action_priority = 'Immediate'
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const unassigned = await pool.query(`
      SELECT *
      FROM crm_leads
      WHERE deal_stage NOT IN ('Closed Won','Closed Lost')
      AND (owner IS NULL OR owner = '')
      AND deal_score >= 80
      ORDER BY deal_score DESC
      LIMIT 25
    `);

    return json(200, {
      overdue: overdue.rows,
      today: today.rows,
      immediate: immediate.rows,
      unassigned: unassigned.rows,
    });
  } catch (err) {
    console.error(err);

    return json(500, {
      error: "Failed to generate digest",
    });
  }
}