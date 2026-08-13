import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClientById } from "@/lib/clients";
import { appendRow, safeReadObjects } from "@/lib/sheets";
import type { LogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET · lee bitácora de un cliente (pestaña "Bitacora")
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const client = await getClientById(clientId);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const entries = await safeReadObjects<LogEntry>(client.sheet_id, "Bitacora!A1:F");
  return NextResponse.json({ entries: entries.reverse() });
}

// POST · agrega entrada nueva
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    clientId: string;
    tipo: string;
    scope: string;
    scope_label: string;
    texto: string;
  };

  const client = await getClientById(body.clientId);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const now = new Date().toISOString();
  const autor = session.user.name ?? session.user.email ?? "Admin";

  await appendRow(client.sheet_id, "Bitacora!A:F", [
    now,
    body.tipo,
    body.scope,
    body.scope_label,
    body.texto,
    autor,
  ]);

  return NextResponse.json({ ok: true });
}
