import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSession } from "../../../lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB cap (client already downscales)

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });

  try {
    const key = `photos/${session.uid}/${crypto.randomUUID()}.jpg`;
    const blob = await put(key, buf, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: false,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json({ error: "upload failed (is BLOB_READ_WRITE_TOKEN set?)" }, { status: 500 });
  }
}
