import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic: reports which commit is actually live. Public (no auth) so it can
// be checked from anywhere. Vercel injects the VERCEL_GIT_* vars at build time.
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    hasAuthSecret: !!process.env.AUTH_SECRET,
    hasPostgres: !!process.env.POSTGRES_URL,
    hasBlob: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}
