import { NextResponse } from "next/server";
import { ensureSchema, sql } from "../../../lib/db";
import { getSession } from "../../../lib/session";

export const runtime = "nodejs";

const EMPTY = { people: {}, nextId: 1 };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const { rows } = await sql`SELECT data FROM trees WHERE user_id = ${session.uid};`;
  return NextResponse.json(rows[0]?.data || EMPTY);
}

export async function PUT(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();

  let data;
  try {
    data = await req.json(); // works for fetch(JSON) and sendBeacon(text)
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!data || typeof data !== "object" || typeof data.people !== "object")
    return NextResponse.json({ error: "invalid tree" }, { status: 400 });

  await sql`
    INSERT INTO trees (user_id, data, updated_at)
    VALUES (${session.uid}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();`;
  return NextResponse.json({ ok: true });
}
