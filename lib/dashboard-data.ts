import { getClientById, getClients } from "./clients";
import { safeReadObjects } from "./sheets";
import { normalizeRow, filterByPeriod, aggregate } from "./data";
import { buildPeriod } from "./period";
import type { Client, PeriodKey, RawRow, Period, Kpi } from "./types";

// ============================================================
// Helper server-side: para cualquier página del dashboard, dado
// un clientId + period, devuelve todo lo que necesita la vista.
// ============================================================
export type DashboardContext = {
  clients: Client[];
  client: Client | null;
  period: Period;
  rows: RawRow[]; // filas del período seleccionado
  rowsPrev: RawRow[]; // filas del período previo (para comparativas)
  allRows: RawRow[]; // TODAS las filas (para vistas de estacionalidad)
  kpi: Kpi;
  kpiPrev: Kpi;
};

export async function loadDashboard(
  clientId: string | null,
  periodKey: PeriodKey,
  custom?: { since: string; until: string }
): Promise<DashboardContext> {
  const clients = await getClients();

  const client = clientId ? await getClientById(clientId) : clients[0] ?? null;
  const period = buildPeriod(periodKey, custom);

  let allRows: RawRow[] = [];
  if (client) {
    const raw = await safeReadObjects<Record<string, unknown>>(
      client.sheet_id,
      "Raw!A1:Y"
    );
    allRows = raw.map(normalizeRow);
  }

  const rows = filterByPeriod(allRows, period.since, period.until);
  const rowsPrev = period.previous
    ? filterByPeriod(allRows, period.previous.since, period.previous.until)
    : [];

  return {
    clients,
    client,
    period,
    rows,
    rowsPrev,
    allRows,
    kpi: aggregate(rows),
    kpiPrev: aggregate(rowsPrev),
  };
}
