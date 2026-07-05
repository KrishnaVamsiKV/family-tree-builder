import { sql } from "@vercel/postgres";

let schemaReady = null;

// Idempotently create tables on first use (kept simple; for a bigger app use
// a real migration tool).
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );`;
      await sql`
        CREATE TABLE IF NOT EXISTS trees (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          data JSONB NOT NULL DEFAULT '{"people":{},"nextId":1}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

export { sql };
