// Cookie-backed session helpers. Uses `next/headers`, so this module must only
// be imported from Node-runtime code (route handlers, server components) — NOT
// from middleware. See lib/auth.js for the Edge-safe JWT primitives.
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifySession } from "./auth";

export function setSessionCookie(token) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return await verifySession(token);
}
