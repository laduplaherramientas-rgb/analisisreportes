import { cookies } from "next/headers";

const COOKIE_NAME = "ld_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not set");
  return s;
}

// --- Web Crypto: funciona en Node 20+ y Edge Runtime ---
async function importKey(secretStr: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secretStr),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): ArrayBuffer {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  // Devolvemos un ArrayBuffer nuevo garantizado (no SharedArrayBuffer)
  return out.buffer.slice(0) as ArrayBuffer;
}

async function sign(payload: string): Promise<string> {
  const key = await importKey(secret());
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(sig);
}

async function verifyHmac(payload: string, sig: string): Promise<boolean> {
  try {
    const key = await importKey(secret());
    return crypto.subtle.verify(
      "HMAC",
      key,
      fromHex(sig),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

function safeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.AUTH_USER || "";
  const expectedPass = process.env.AUTH_PASSWORD || "";
  if (!expectedUser || !expectedPass) return false;
  return safeStrEqual(user, expectedUser) && safeStrEqual(password, expectedPass);
}

export async function makeSessionToken(user: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${user}.${issuedAt}`;
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined
): Promise<{ user: string } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [user, issuedAt, sig] = parts;
  const payload = `${user}.${issuedAt}`;
  const ok = await verifyHmac(payload, sig);
  if (!ok) return null;
  const age = Math.floor(Date.now() / 1000) - parseInt(issuedAt, 10);
  if (Number.isNaN(age) || age < 0 || age > MAX_AGE) return null;
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
