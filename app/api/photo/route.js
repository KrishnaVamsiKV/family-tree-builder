import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { getSession } from "../../../lib/session";

export const runtime = "nodejs";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB cap (client already downscales)

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is missing in this environment" },
      { status: 500 }
    );
  }

  try {
    const key = `photos/${session.uid}/${randomUUID()}.jpg`;
    const blob = await put(key, buf, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      token,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error("photo upload failed:", e);
    return NextResponse.json(
      { error: "upload failed: " + (e && e.message ? e.message : String(e)) },
      { status: 500 }
    );
  }
}
