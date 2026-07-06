import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.ISKILLS2_DATABASE_URL;
if (!connectionString) {
  throw new Error("ISKILLS2_DATABASE_URL must be set.");
}

// Railway Postgres requires SSL; rejectUnauthorized is disabled only because
// Railway uses self-signed certs on internal proxied connections.
// This is safe when the connection string is kept as a secret.
const sslConfig = connectionString.includes("railway") || connectionString.includes("rlwy.net")
  ? { rejectUnauthorized: false }
  : true;
export const pool = new Pool({ connectionString, ssl: sslConfig });

export const SHARED_USER_ID = "iskills2-shared";

export async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iskills2_users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS iskills2_skills (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL REFERENCES iskills2_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      tool TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      priority INTEGER NOT NULL DEFAULT 0,
      trigger_examples TEXT[] NOT NULL DEFAULT '{}',
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Ensure a shared user exists so that the app can work without login.
  await pool.query(
    `INSERT INTO iskills2_users (id, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [SHARED_USER_ID, "shared@iskills2.local", "disabled"],
  );

  console.log("[iSkills2] Tables initialized");
}

initialize().catch((err) => console.error("[iSkills2] DB init failed:", err));
