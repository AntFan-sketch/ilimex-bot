import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { estimateLeadValue } from "@/lib/revenue/value";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withEstimatedValue<T extends { segment?: string | null; scale?: string | null }>(row: T) {
  let scaleParsed: { unit: string; count: number } | null = null;

  try {
    scaleParsed = row.scale ? JSON.parse(row.scale) : null;
  } catch {
    scaleParsed = null;
  }

  return {
    ...row,
    est_value: estimateLeadValue(row.segment, scaleParsed),
  };
}

const LEAD_SELECT = `
  SELECT
    id,
    created_at,
    last_activity_at,
    lead_score,
    intent,
    segment,
    scale,
    timeline,
    status,
    user_snippet
  FROM crm_leads
`;

export async function GET() {
  try {
    const pool = getPool();

    const { rows } = await pool.query(`
      ${LEAD_SELECT}
      ORDER BY last_activity_at DESC NULLS LAST, created_at DESC
      LIMIT 200;
    `);

    const rowsWithValue = rows.map((r) => withEstimatedValue(r));

    return json(200, { rows: rowsWithValue });
  } catch (err) {
    console.error("GET /api/leads error:", err);
    return json(500, { error: "Failed to load leads" });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
    };

    const id = String(body.id ?? "").trim();
    const status = String(body.status ?? "").trim();

    const allowed = new Set(["new", "contacted", "qualified", "closed"]);
    if (!id || !allowed.has(status)) {
      return json(400, { error: "Invalid id or status" });
    }

    const pool = getPool();
    const result = await pool.query(
      `
      UPDATE crm_leads
      SET status = $1
      WHERE id = $2
      RETURNING
        id,
        created_at,
        last_activity_at,
        lead_score,
        intent,
        segment,
        scale,
        timeline,
        status,
        user_snippet
      `,
      [status, id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    const rowWithValue = withEstimatedValue(result.rows[0]);

    return json(200, { ok: true, row: rowWithValue });
  } catch (err) {
    console.error("PATCH /api/leads error:", err);
    return json(500, { error: "Failed to update lead status" });
  }
}