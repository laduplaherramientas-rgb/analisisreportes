import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, makeSessionToken, setSessionCookie } from "@/lib/auth";

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();

  const rec = attempts.get(ip);
  if (rec && rec.until > now) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá 1 minuto." },
      { status: 429 }
    );
  }

  let body: { user?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const user = String(body.user || "");
  const password = String(body.password || "");

  if (!verifyCredentials(user, password)) {
    const count = (rec?.count || 0) + 1;
    const until = count >= 5 ? now + 60_000 : 0;
    attempts.set(ip, { count, until });
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }

  attempts.delete(ip);
  const token = await makeSessionToken(user);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
