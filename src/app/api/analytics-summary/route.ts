import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

function isAuthorized(req: NextRequest) {
  const expected = process.env.ADMIN_DASH_TOKEN?.trim() ?? "";
  const received = req.headers.get("x-admin-token")?.trim() ?? "";
  return Boolean(expected) && received === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) && daysRaw >= 1 && daysRaw <= 365 ? Math.floor(daysRaw) : 30;
  const modeRaw = req.nextUrl.searchParams.get("mode") ?? "all";
  const mode = modeRaw === "external" || modeRaw === "internal" ? modeRaw : "all";

  try {
    const pool = getPool();
    const params: unknown[] = [days];
    let modeClause = "";
    if (mode !== "all") {
      params.push(mode);
      modeClause = `AND mode = $${params.length}`;
    }

    const summaryResult = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_interactions,
        COUNT(*) FILTER (WHERE mode = 'external')::int AS external_count,
        COUNT(*) FILTER (WHERE mode = 'internal')::int AS internal_count,
        ROUND(AVG(latency_ms))::int AS avg_latency_ms,
        MIN(created_at) AS first_timestamp,
        MAX(created_at) AS last_timestamp
      FROM bot_events
      WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
      ${modeClause}
      `,
      params,
    );

    const dailyResult = await pool.query(
      `
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mode = 'external')::int AS external_count,
        COUNT(*) FILTER (WHERE mode = 'internal')::int AS internal_count
      FROM bot_events
      WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
      ${modeClause}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at) ASC
      `,
      params,
    );

    const questionResult = await pool.query(
      `
      SELECT user_snippet AS text, COUNT(*)::int AS count
      FROM bot_events
      WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND user_snippet IS NOT NULL
        AND user_snippet <> ''
        ${modeClause}
      GROUP BY user_snippet
      ORDER BY count DESC, user_snippet ASC
      LIMIT 10
      `,
      params,
    );

    return Response.json({
      days,
      mode,
      summary: summaryResult.rows[0] ?? {},
      daily: dailyResult.rows,
      topQuestions: questionResult.rows,
    });
  } catch (err) {
    console.error("analytics-summary error:", err instanceof Error ? err.message : "unknown");
    return Response.json(
      { error: "Analytics are unavailable. Check database configuration and bot_events schema." },
      { status: 503 },
    );
  }
}
