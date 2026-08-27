import { NextRequest } from "next/server";
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

function isAuthorised(req: NextRequest) {
  const expected = process.env.ADMIN_DASH_TOKEN?.trim() ?? "";
  const received = req.headers.get("x-admin-token")?.trim() ?? "";
  return Boolean(expected) && received === expected;
}

const DIGEST_SELECT = `
  SELECT
    id, company, contact_name, owner,
    COALESCE(deal_score, lead_score) AS deal_score,
    COALESCE(deal_stage, status, 'new') AS deal_stage,
    next_action, next_action_priority, next_action_due,
    last_contacted_at, next_follow_up_at, source, sector
  FROM crm_leads
`;

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) return json(401, { error: "Unauthorised" });
  try {
    const pool = getPool();

    const overdue = await pool.query(`
      ${DIGEST_SELECT}
      WHERE deal_stage NOT IN ('Closed Won','Closed Lost')
      AND next_action_due < CURRENT_DATE
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const today = await pool.query(`
      ${DIGEST_SELECT}
      WHERE deal_stage NOT IN ('Closed Won','Closed Lost')
      AND next_action_due = CURRENT_DATE
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const immediate = await pool.query(`
      ${DIGEST_SELECT}
      WHERE deal_stage NOT IN ('Closed Won','Closed Lost')
      AND next_action_priority = 'Immediate'
      ORDER BY deal_score DESC NULLS LAST
      LIMIT 25
    `);

    const unassigned = await pool.query(`
      ${DIGEST_SELECT}
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