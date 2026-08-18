import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClients } from "@/lib/clients";
import { readRange } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const clients = await getClients();

  if (!debug) return NextResponse.json({ clients });

  // ─── Modo diagnóstico ─────────────────────────────────────
  const masterId = process.env.MASTER_SHEET_ID;
  const raw: { header: string[]; rows: string[][] } = { header: [], rows: [] };
  const errors: Array<{ where: string; message: string }> = [];

  if (!masterId) {
    errors.push({ where: "env", message: "MASTER_SHEET_ID no está seteado" });
  } else {
    try {
      const matrix = await readRange(masterId, "Clientes!A1:I");
      raw.header = matrix[0] ?? [];
      raw.rows = matrix.slice(1);
    } catch (e) {
      errors.push({ where: "master-sheet", message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Probamos leer 1 fila del Raw de cada cliente para saber cuáles fallan
  const probes = await Promise.all(
    clients.map(async (c) => {
      try {
        const m = await readRange(c.sheet_id, "Raw!A1:B2");
        return { id: c.id, nombre: c.nombre, sheet_id: c.sheet_id, ok: true, sample: m };
      } catch (e) {
        return {
          id: c.id,
          nombre: c.nombre,
          sheet_id: c.sheet_id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );

  return NextResponse.json({
    clients_parsed: clients.length,
    clients,
    master_raw: raw,
    probes,
    errors,
    hints: [
      "1. Verificá que la fila de Roca Santa tenga columnas: id, nombre, sheet_id, presupuesto, meta_ventas, moneda, roas_objetivo, logo_url, color",
      "2. El sheet_id debe ser el ID (parte de la URL entre /d/ y /edit), no la URL completa",
      "3. En el Sheet del cliente, compartir con la Service Account con permiso 'Viewer' (o Editor si querés Bitácora)",
      "4. El Sheet del cliente debe tener una pestaña llamada exactamente 'Raw'",
      "5. Si acabás de agregar, esperá 60s por el caché o hacé 'Redeploy' en Vercel",
    ],
  });
}
