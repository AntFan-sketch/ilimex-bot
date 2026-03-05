import { getPool } from "@/lib/db";

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function rateLimit(opts: {
  key: string;              // hashed ip + ua (or conversationId)
  limit: number;            // requests
  windowSeconds: number;    // per N seconds
}): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = opts;
  const pool = getPool();

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  // Transaction ensures correctness under concurrency
  const client = await pool.connect();
  try {
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

    // If outside window, reset
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

    // Within window
    if (row.count >= limit) {
      // retry after remaining time
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
  } catch {
    // Fail open: never block user if DB hiccups
    try {
      await client.query("ROLLBACK");
    } catch {}
    return { ok: true };
  } finally {
    client.release();
  }
}