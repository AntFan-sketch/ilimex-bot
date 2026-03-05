import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    const body = (await req.json().catch(() => ({}))) as { status?: string };

    const nextStatus = String(body.status ?? "").trim();
    if (!nextStatus) return json(400, { error: "Missing status" });

    // Optional: lock down allowed statuses
    const allowed = new Set(["new", "contacted", "qualified", "closed"]);
    if (!allowed.has(nextStatus)) return json(400, { error: "Invalid status" });

    const pool = getPool();

    const { rowCount, rows } = await pool.query(
      `
      UPDATE crm_leads
      SET status = $1
      WHERE id = $2
      RETURNING id, created_at, lead_score, intent, segment, scale, timeline, status, user_snippet
      `,
      [nextStatus, id]
    );

    if (!rowCount) return json(404, { error: "Lead not found" });

    return json(200, { ok: true, row: rows[0] });
  } catch (e: any) {
    console.error("PATCH /api/leads/[id] error:", e?.message || e);
    return json(500, { error: "Failed to update lead status" });
  }
}