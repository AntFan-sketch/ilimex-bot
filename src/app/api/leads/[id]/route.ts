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

function requireAdmin(req: NextRequest) {
  const expected = (
    process.env.ADMIN_DASH_TOKEN ??
    process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ??
    ""
  ).trim();

  const received = (req.headers.get("x-admin-token") ?? "").trim();

  return !!expected && received === expected;
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

    const { id } = await ctx.params;
    const pool = getPool();

    const leadResult = await pool.query(
      `
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
        mode,
        source,
        contact_name,
        company,
        farm,
        email,
        phone,
        notes,
        user_snippet,
        conversation_id
      FROM crm_leads
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if ((leadResult.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    const lead = withEstimatedValue(leadResult.rows[0]);
    let events: unknown[] = [];

    if (lead.conversation_id) {
      const eventsResult = await pool.query(
        `
        SELECT *
        FROM (
          SELECT
            id,
            created_at,
            event_type,
            intent,
            segment,
            timeline,
            lead_score,
            user_snippet,
            assistant_snippet,
            payload
          FROM bot_events
          WHERE conversation_id = $1
          ORDER BY created_at DESC
          LIMIT 20
        ) recent_events
        ORDER BY created_at ASC
        `,
        [lead.conversation_id]
      );

      events = eventsResult.rows;
    }

    return json(200, { lead, events });
  } catch (err) {
    console.error("GET /api/leads/[id] error:", err);
    return json(500, { error: "Failed to load lead detail" });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

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
        mode,
        source,
        contact_name,
        company,
        farm,
        email,
        phone,
        notes,
        user_snippet,
        conversation_id
      `,
      [status, id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    return json(200, { ok: true, row: withEstimatedValue(result.rows[0]) });
  } catch (err) {
    console.error("PATCH /api/leads/[id] error:", err);
    return json(500, { error: "Failed to update lead status" });
  }
}