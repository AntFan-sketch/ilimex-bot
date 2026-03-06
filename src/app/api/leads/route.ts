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

const LEAD_SELECT = `
  SELECT
    id,
    created_at,
    lead_score,
    intent,
    segment,
    scale,
    status,
    user_snippet
  FROM crm_leads
`;

export async function GET(){
  try {
    const pool = getPool();

    const { rows } = await pool.query(`
      ${LEAD_SELECT}
      ORDER BY created_at DESC
      LIMIT 200;
    `);

    return json(200, { rows });
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
        lead_score,
        intent,
        segment,
        scale,
        status,
        user_snippet
      `,
      [status, id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    return json(200, { ok: true, row: result.rows[0] });
  } catch (err) {
    console.error("PATCH /api/leads error:", err);
    return json(500, { error: "Failed to update lead status" });
  }
}