import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClients } from "@/lib/clients";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clients = await getClients();
  return NextResponse.json({ clients });
}
