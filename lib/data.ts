import type { Kpi, RawRow } from "./types";

// ============================================================
// Coerción robusta a número — el Sheet a veces devuelve strings con coma.
// ============================================================
export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ============================================================
// Convierte cualquier formato de fecha del Sheet al ISO YYYY-MM-DD.
// Maneja: serial numérico (46245), ISO ya-en-formato ("2026-08-11"),
// y formatos localizados ("8/11/2026", "11/8/2026", "11-8-2026").
// ============================================================
export function normalizeFecha(v: unknown): string {
  // Serial numérico de Google Sheets (epoch: 1899-12-30)
  if (typeof v === "number" && v > 40000 && v < 60000) {
    const ms = Date.UTC(1899, 11, 30) + v * 86400 * 1000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  // Ya en formato ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Formato dd/mm/yyyy o mm/dd/yyyy o dd-mm-yyyy — intentamos parsear
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    const yr = y.length === 2 ? "20" + y : y;
    // Si el primer valor > 12, seguro es día. Si el segundo > 12, seguro es mes.
    // Por defecto asumimos dd/mm (formato AR).
    const day = parseInt(a, 10);
    const month = parseInt(b, 10);
    if (day > 12) {
      return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    if (month > 12) {
      // formato es mm/dd
      return `${yr}-${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`;
    }
    // Ambiguo — asumimos dd/mm
    return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return s;
}

// ============================================================
// Normaliza una fila cruda del Sheet a RawRow (con tipos correctos).
// ============================================================
export function normalizeRow(r: Record<string, unknown>): RawRow {
  return {
    unique_id: String(r.unique_id ?? ""),
    fecha: normalizeFecha(r.fecha),
    campaign_id: String(r.campaign_id ?? ""),
    campaign_name: String(r.campaign_name ?? ""),
    adset_id: String(r.adset_id ?? ""),
    adset_name: String(r.adset_name ?? ""),
    ad_id: String(r.ad_id ?? ""),
    ad_name: String(r.ad_name ?? ""),
    gasto: num(r.gasto),
    cpc: num(r.cpc),
    ctr_general: num(r.ctr_general),
    ctr_enlace: num(r.ctr_enlace),
    frecuencia: num(r.frecuencia),
    visitas_pagina: num(r.visitas_pagina),
    costo_visita_pagina: num(r.costo_visita_pagina),
    agregados_carrito: num(r.agregados_carrito),
    costo_agregado_carrito: num(r.costo_agregado_carrito),
    valor_agregado_carrito: num(r.valor_agregado_carrito),
    pagos_iniciados: num(r.pagos_iniciados),
    costo_pago_iniciado: num(r.costo_pago_iniciado),
    valor_pago_iniciado: num(r.valor_pago_iniciado),
    compras: num(r.compras),
    valor_compra: num(r.valor_compra),
    costo_compra: num(r.costo_compra),
    roas: num(r.roas),
  };
}

// ============================================================
// Filtra por rango de fechas [since, until] inclusivo.
// ============================================================
export function filterByPeriod(
  rows: RawRow[],
  since: string,
  until: string
): RawRow[] {
  return rows.filter((r) => r.fecha >= since && r.fecha <= until);
}

// ============================================================
// KPI agregado sobre un set de filas.
// ============================================================
export function aggregate(rows: RawRow[]): Kpi {
  const gasto = rows.reduce((s, r) => s + r.gasto, 0);
  const ventas = rows.reduce((s, r) => s + r.valor_compra, 0);
  const compras = rows.reduce((s, r) => s + r.compras, 0);
  const visitas_pagina = rows.reduce((s, r) => s + r.visitas_pagina, 0);
  const agregados_carrito = rows.reduce((s, r) => s + r.agregados_carrito, 0);
  const pagos_iniciados = rows.reduce((s, r) => s + r.pagos_iniciados, 0);
  const frecuenciaAvg =
    rows.length > 0 ? rows.reduce((s, r) => s + r.frecuencia, 0) / rows.length : 0;
  const dias = new Set(rows.map((r) => r.fecha)).size;

  return {
    gasto,
    ventas,
    compras,
    roas: gasto > 0 ? ventas / gasto : 0,
    cpa: compras > 0 ? gasto / compras : 0,
    ticket: compras > 0 ? ventas / compras : 0,
    frecuencia: frecuenciaAvg,
    visitas_pagina,
    agregados_carrito,
    pagos_iniciados,
    dias_con_datos: dias,
  };
}

// ============================================================
// Agrupa filas por un campo (fecha, campaign_id, adset_id, ad_id).
// ============================================================
export function groupBy<K extends keyof RawRow>(
  rows: RawRow[],
  key: K
): Map<string, RawRow[]> {
  const map = new Map<string, RawRow[]>();
  for (const r of rows) {
    const k = String(r[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return map;
}

// ============================================================
// Agrupa por 2 keys (campaign + adset, etc.) — devuelve mapa anidado.
// ============================================================
export function groupBy2<K1 extends keyof RawRow, K2 extends keyof RawRow>(
  rows: RawRow[],
  k1: K1,
  k2: K2
): Map<string, Map<string, RawRow[]>> {
  const outer = new Map<string, Map<string, RawRow[]>>();
  for (const r of rows) {
    const a = String(r[k1]);
    const b = String(r[k2]);
    if (!outer.has(a)) outer.set(a, new Map());
    const inner = outer.get(a)!;
    if (!inner.has(b)) inner.set(b, []);
    inner.get(b)!.push(r);
  }
  return outer;
}

// ============================================================
// Detecta el objetivo de una campaña por su nombre (heurística).
// Mejor sería que Meta lo devuelva, pero por ahora inferimos.
// ============================================================
export type Objetivo = "presentacion" | "evaluacion" | "conversion";

export function detectObjetivo(campaignName: string): Objetivo {
  const n = campaignName.toLowerCase();
  if (
    n.includes("visita") ||
    n.includes("view") ||
    n.includes("pre ") ||
    n.startsWith("pre") ||
    n.includes("presenta")
  )
    return "presentacion";
  if (n.includes("eval") || n.includes("cart") || n.includes("carrito"))
    return "evaluacion";
  return "conversion";
}

// ============================================================
// Delta absoluto y porcentaje entre 2 valores.
// ============================================================
export function delta(current: number, previous: number) {
  const abs = current - previous;
  const pct = previous !== 0 ? (abs / previous) * 100 : current > 0 ? 100 : 0;
  return { abs, pct, direction: abs > 0 ? "up" : abs < 0 ? "down" : "flat" as "up" | "down" | "flat" };
}

// ============================================================
// Formatters de moneda + porcentaje (para Argentina).
// ============================================================
export function fmtMoney(n: number, currency = "ARS"): string {
  if (currency === "USD") {
    return "US$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function fmtPct(n: number, decimals = 1): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + "%";
}

export function fmtRoas(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "x";
}

export function fmtNum(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
