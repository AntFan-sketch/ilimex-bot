import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = opts;

  // Rate limiting is a protective layer, not a hard dependency for the public
  // chatbot. If the CRM/analytics database is unavailable or not configured,
  // fail open so a database issue cannot take the customer-facing bot offline.
  let client: PoolClient | null = null;

  try {
    const pool = getPool();
    client = await pool.connect();

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    await client.query("BEGIN");

    const res = await client.query(
      `SELECT window_start, count
       FROM rate_limits
       WHERE key = $1
       FOR UPDATE`,
      [key]
    );

    if (res.rowCount === 0) {
      await client.query(
        `INSERT INTO rate_limits (key, window_start, count, updated_at)
         VALUES ($1, $2, 1, now())`,
        [key, now]
      );
      await client.query("COMMIT");
      return { ok: true };
    }

    const row = res.rows[0] as { window_start: Date; count: number };

    if (row.window_start < windowStart) {
      await client.query(
        `UPDATE rate_limits
         SET window_start = $2, count = 1, updated_at = now()
         WHERE key = $1`,
        [key, now]
      );
      await client.query("COMMIT");
      return { ok: true };
    }

    if (row.count >= limit) {
      const elapsed = (now.getTime() - new Date(row.window_start).getTime()) / 1000;
      const retryAfterSeconds = Math.max(1, Math.ceil(windowSeconds - elapsed));
      await client.query("COMMIT");
      return { ok: false, retryAfterSeconds };
    }

    await client.query(
      `UPDATE rate_limits
       SET count = count + 1, updated_at = now()
       WHERE key = $1`,
      [key]
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    // Deliberately do not log the key; it is derived from request metadata.
    console.warn("Rate limiting unavailable; allowing request:",
      error instanceof Error ? error.message : "unknown error"
    );
    return { ok: true };
  } finally {
    client?.release();
  }
}
