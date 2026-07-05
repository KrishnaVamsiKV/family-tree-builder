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
    if (u.length < 3 || u.length > 40 || !/^[a-z0-9_.-]+$/.test(u))
      return NextResponse.json({ error: "Username must be 3–40 chars: letters, numbers, . _ -" }, { status: 400 });
    if (p.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    const hash = bcrypt.hashSync(p, 10);
    let user;
    try {
      const { rows } = await sql`
        INSERT INTO users (username, password_hash) VALUES (${u}, ${hash})
        RETURNING id, username;`;
      user = rows[0];
    } catch (e) {
      if (String(e.message || e).includes("duplicate"))
        return NextResponse.json({ error: "That username is taken." }, { status: 409 });
      throw e;
    }
    await sql`INSERT INTO trees (user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING;`;

    const token = await signSession({ uid: user.id, username: user.username });
    setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("register failed:", e);
    const msg = !process.env.POSTGRES_URL
      ? "Database not configured: POSTGRES_URL is missing. Connect a Postgres store to this project and redeploy."
      : "Registration failed: " + (e?.message || "unknown database error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
