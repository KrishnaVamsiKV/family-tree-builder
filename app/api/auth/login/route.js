import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureSchema, sql } from "../../../../lib/db";
import { signSession } from "../../../../lib/auth";
import { setSessionCookie } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await ensureSchema();
    const { username, password } = await req.json();
    const u = String(username || "").trim().toLowerCase();
    const p = String(password || "");

    const { rows } = await sql`SELECT id, username, password_hash FROM users WHERE username = ${u};`;
    const user = rows[0];
    const ok = user && bcrypt.compareSync(p, user.password_hash);
    if (!ok) return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });

    const token = await signSession({ uid: user.id, username: user.username });
    setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("login failed:", e);
    const msg = !process.env.POSTGRES_URL
      ? "Database not configured: POSTGRES_URL is missing. Connect a Postgres store to this project and redeploy."
      : "Login failed: " + (e?.message || "unknown database error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
