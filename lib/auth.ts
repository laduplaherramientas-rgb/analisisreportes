import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "ld_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.AUTH_USER || "";
  const expectedPass = process.env.AUTH_PASSWORD || "";
  if (!expectedUser || !expectedPass) return false;
  return safeEqual(user, expectedUser) && safeEqual(password, expectedPass);
}

export function makeSessionToken(user: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${user}.${issuedAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): { user: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [user, issuedAt, sig] = parts;
  const payload = `${user}.${issuedAt}`;
  const expected = sign(payload);
  if (!safeEqual(sig, expected)) return null;
  const age = Math.floor(Date.now() / 1000) - parseInt(issuedAt, 10);
  if (age < 0 || age > MAX_AGE) return null;
  return { user };
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<{ user: string } | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE_NAME)?.value);
}

export const SESSION_COOKIE = COOKIE_NAME;
