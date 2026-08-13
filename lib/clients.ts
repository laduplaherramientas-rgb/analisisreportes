import { safeReadObjects } from "./sheets";
import type { Client } from "./types";
import { num } from "./data";

// ============================================================
// Lee la Master Sheet · pestaña "Clientes" · devuelve array de clientes.
// ============================================================
export async function getClients(): Promise<Client[]> {
  const masterId = process.env.MASTER_SHEET_ID;
  if (!masterId) return [];

  type Row = {
    id: string;
    nombre: string;
    sheet_id: string;
    presupuesto: string | number;
    meta_ventas: string | number;
    moneda: string;
    roas_objetivo: string | number;
    logo_url?: string;
    color?: string;
  };

  const rows = await safeReadObjects<Row>(masterId, "Clientes!A1:I");

  return rows
    .filter((r) => r.id && r.sheet_id)
    .map((r) => ({
      id: String(r.id).trim(),
      nombre: String(r.nombre).trim(),
      sheet_id: String(r.sheet_id).trim(),
      presupuesto: num(r.presupuesto),
      meta_ventas: num(r.meta_ventas),
      moneda: String(r.moneda || "ARS").trim(),
      roas_objetivo: num(r.roas_objetivo),
      logo_url: r.logo_url?.trim() || undefined,
      color: r.color?.trim() || undefined,
    }));
}

export async function getClientById(id: string): Promise<Client | null> {
  const all = await getClients();
  return all.find((c) => c.id === id) ?? null;
}
