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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as {
      status?: string;
    };

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
      RETURNING id, created_at, lead_score, intent, segment, scale, status, user_snippet
      `,
      [status, id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    return json(200, { ok: true, row: result.rows[0] });
  } catch (err) {
    console.error("PATCH /api/leads/[id] error:", err);
    return json(500, { error: "Failed to update lead status" });
  }
}