import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");

  // Neon typically requires TLS; usually sslmode=require is already in DATABASE_URL.
  // But this is safe as a fallback in serverless.
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  return pool;
}