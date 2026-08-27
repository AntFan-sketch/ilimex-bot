import { Pool } from "pg";

let pool: Pool | null = null;

function sslRejectUnauthorized() {
  const configured = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (configured === "false") return false;
  return true;
}

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Missing DATABASE_URL");

  pool = new Pool({
    connectionString,
    // Production PostgreSQL providers such as Neon present publicly trusted
    // certificates, so verify the server certificate by default. A legacy
    // private/self-signed deployment can opt out explicitly via the documented
    // environment variable rather than silently disabling TLS verification.
    ssl: { rejectUnauthorized: sslRejectUnauthorized() },
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });

  return pool;
}
