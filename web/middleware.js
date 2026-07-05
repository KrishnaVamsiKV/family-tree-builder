import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/auth";

// Routes reachable without a session.
const PUBLIC_PATHS = ["/login", "/register"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Signed-in users shouldn't see login/register.
  if (session && isPublic) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // Everything else (the app) requires a session.
  if (!session && !isPublic) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on pages only; skip API (guarded per-route), Next internals, and
  // static assets like /app.js, /app.css, favicon.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|app.js|app.css).*)"],
};
