import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientById } from "@/lib/clients";
import { safeReadObjects } from "@/lib/sheets";
import { normalizeRow } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const client = await getClientById(clientId);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const raw = await safeReadObjects<Record<string, unknown>>(
    client.sheet_id,
    "Raw!A1:Y"
  );
  const rows = raw.map(normalizeRow);

  return NextResponse.json({ client, rows });
}
