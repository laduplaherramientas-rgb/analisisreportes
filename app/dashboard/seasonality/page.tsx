import EmptyState from "@/components/EmptyState";
import { loadDashboard } from "@/lib/dashboard-data";
import { aggregate, fmtMoney, fmtNum, fmtRoas } from "@/lib/data";
import type { PeriodKey, RawRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function weekdayIdx(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

function monthKey(dateStr: string): string {
  return dateStr.substring(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MESES[parseInt(m, 10) - 1]} ${y}`;
}

export default async function SeasonalityPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; period?: string }>;
}) {
  const sp = await searchParams;
  // Estacionalidad usa TODAS las filas históricas, no filtradas por período.
  const ctx = await loadDashboard(
    sp.client ?? null,
    (sp.period as PeriodKey) ?? "last12Months"
  );

  if (!ctx.client) return <EmptyState title="No hay clientes configurados" />;
  const { client, allRows } = ctx;
  const currency = client.moneda;

  if (allRows.length === 0) {
    return (
      <>
        <Header client={client.nombre} />
        <EmptyState title="Sin datos históricos aún" hint="Estas vistas se llenan cuando tengas ~4 semanas de data." />
      </>
    );
  }

  // ============================================================
  // Análisis 1: por día de la semana
  // ============================================================
  const byWeekday: Record<number, RawRow[]> = {};
  for (const r of allRows) {
    const idx = weekdayIdx(r.fecha);
    (byWeekday[idx] ??= []).push(r);
  }
  const weekdayStats = DIAS_SEMANA.map((label, i) => {
    const rs = byWeekday[i] ?? [];
    const agg = aggregate(rs);
    return { label, agg, count: new Set(rs.map((r) => r.fecha)).size };
  });

  // Mejor y peor día para semáforo
  const roasOrdenado = [...weekdayStats].sort((a, b) => b.agg.roas - a.agg.roas);
  const mejorDia = roasOrdenado[0];
  const peorDia = roasOrdenado[roasOrdenado.length - 1];

  // ============================================================
  // Análisis 2: por mes
  // ============================================================
  const byMonth: Record<string, RawRow[]> = {};
  for (const r of allRows) {
    const k = monthKey(r.fecha);
    (byMonth[k] ??= []).push(r);
  }
  const months = Object.keys(byMonth).sort();
  const monthStats = months.map((k) => ({
    key: k,
    label: monthLabel(k),
    agg: aggregate(byMonth[k]),
    dias: new Set(byMonth[k].map((r) => r.fecha)).size,
  }));

  // ============================================================
  // Análisis 3: día × semana del mes (grid tipo calendario compacto)
  // ============================================================
  // Últimas 12 semanas
  const last12Weeks = getLastNWeeks(allRows, 12);

  return (
    <>
      <Header client={client.nombre} />

      {allRows.length < 100 && (
        <div className="callout warn" style={{ marginBottom: 24 }}>
          <span className="icon">i</span>
          <span>
            Tenés <b>{allRows.length} filas</b> · las lecturas de estacionalidad se vuelven confiables con 4+ semanas y 500+ filas. Por ahora los patrones son directivos, no concluyentes.
          </span>
        </div>
      )}

      {/* Día de la semana */}
      <div className="section-label">Por día de la semana</div>
      <div className="panel">
        <div className="panel-head">
          <h3>¿Qué días compran más tus clientes?</h3>
          <span className="hint">
            Mejor día: <b style={{ color: "var(--good)" }}>{mejorDia?.label} ({fmtRoas(mejorDia?.agg.roas ?? 0)})</b> · Peor: <b style={{ color: "var(--bad)" }}>{peorDia?.label} ({fmtRoas(peorDia?.agg.roas ?? 0)})</b>
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Día</th>
                <th>Inversión</th>
                <th>Ventas</th>
                <th>Compras</th>
                <th>Ticket</th>
                <th>ROAS</th>
                <th>% del gasto</th>
              </tr>
            </thead>
            <tbody>
              {weekdayStats.map((w) => {
                const pctSpend = allRows.reduce((s, r) => s + r.gasto, 0) > 0
                  ? (w.agg.gasto / allRows.reduce((s, r) => s + r.gasto, 0)) * 100
                  : 0;
                const isBest = w.label === mejorDia?.label;
                const isWorst = w.label === peorDia?.label;
                return (
                  <tr key={w.label}>
                    <td>
                      <b>{w.label}</b>
                      {isBest && <span className="pill good" style={{ marginLeft: 8 }}>Mejor</span>}
                      {isWorst && <span className="pill bad" style={{ marginLeft: 8 }}>Peor</span>}
                    </td>
                    <td>{fmtMoney(w.agg.gasto, currency)}</td>
                    <td>{fmtMoney(w.agg.ventas, currency)}</td>
                    <td>{fmtNum(w.agg.compras)}</td>
                    <td>{w.agg.compras > 0 ? fmtMoney(w.agg.ticket, currency) : "—"}</td>
                    <td className="strong">{fmtRoas(w.agg.roas)}</td>
                    <td>{pctSpend.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparación mensual */}
      <div className="section-label">Mes a mes</div>
      <div className="panel">
        <div className="panel-head">
          <h3>Evolución mensual</h3>
          <span className="hint">{monthStats.length} meses con data</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Días</th>
                <th>Inversión</th>
                <th>Ventas</th>
                <th>Compras</th>
                <th>Ticket</th>
                <th>ROAS</th>
                <th>Δ ROAS vs mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {monthStats.map((m, i) => {
                const prev = monthStats[i - 1];
                const deltaRoas = prev ? m.agg.roas - prev.agg.roas : null;
                const trendCls = deltaRoas === null ? "flat" : deltaRoas > 0.1 ? "up" : deltaRoas < -0.1 ? "down" : "flat";
                return (
                  <tr key={m.key}>
                    <td><b>{m.label}</b></td>
                    <td>{m.dias}</td>
                    <td>{fmtMoney(m.agg.gasto, currency)}</td>
                    <td>{fmtMoney(m.agg.ventas, currency)}</td>
                    <td>{fmtNum(m.agg.compras)}</td>
                    <td>{m.agg.compras > 0 ? fmtMoney(m.agg.ticket, currency) : "—"}</td>
                    <td className="strong">{fmtRoas(m.agg.roas)}</td>
                    <td>
                      {deltaRoas === null ? (
                        <span className="dim">—</span>
                      ) : (
                        <span className={`trend ${trendCls}`}>
                          {trendCls === "up" ? "↗" : trendCls === "down" ? "↘" : "→"}{" "}
                          {deltaRoas > 0 ? "+" : ""}{deltaRoas.toFixed(2)}x
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Día × semana */}
      <div className="section-label">Últimas 12 semanas · día × semana</div>
      <div className="panel">
        <div className="panel-head">
          <h3>Heatmap semanal · ROAS</h3>
          <span className="hint">columnas = semanas · filas = días</span>
        </div>
        <div className="heatmap-wrap">
          <table className="heatmap">
            <thead>
              <tr>
                <th className="rowname" style={{ textAlign: "left", paddingLeft: 16 }}>Día</th>
                {last12Weeks.map((w) => (
                  <th key={w.label} className="day">
                    S{w.weekNum}
                    <span className="weekday">{w.monthLabel}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DIAS_SEMANA.map((d, di) => (
                <tr key={d}>
                  <td className="rowname"><b>{d}</b></td>
                  {last12Weeks.map((w) => {
                    const dayRows = w.rows.filter((r) => weekdayIdx(r.fecha) === di);
                    const agg = aggregate(dayRows);
                    const v = agg.roas;
                    const bg = colorForRoas(v, client.roas_objetivo);
                    return (
                      <td
                        key={w.label}
                        className={v === 0 ? "cell empty" : "cell"}
                        style={{ background: v > 0 ? bg : undefined }}
                      >
                        {v > 0 ? v.toFixed(1) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="footstrip">
        <span>Todas las vistas usan <b>toda la data histórica</b> (no filtrada por período)</span>
        <span>Recomendación: revisar mensualmente para ajustar reparto por día de la semana</span>
      </div>
    </>
  );
}

function Header({ client }: { client: string }) {
  return (
    <header className="view-head">
      <div>
        <div className="eyebrow">{client} · Análisis de patrones históricos</div>
        <h1>Estacionalidad</h1>
      </div>
      <div className="view-right">
        <div className="caption">Datos históricos completos · no depende del período seleccionado</div>
      </div>
    </header>
  );
}

// ============================================================
// Helpers
// ============================================================
function colorForRoas(v: number, target: number): string {
  if (v === 0) return "var(--surface-2)";
  const ratio = v / target;
  if (ratio >= 1.5) return "#8ECAA9";
  if (ratio >= 1.2) return "#B8DBC5";
  if (ratio >= 0.9) return "#DDEDE2";
  if (ratio >= 0.7) return "#F3E9C7";
  if (ratio >= 0.5) return "#F1DAD5";
  return "#EDBFB9";
}

function getLastNWeeks(rows: RawRow[], n: number): {
  label: string;
  weekNum: number;
  monthLabel: string;
  rows: RawRow[];
}[] {
  if (rows.length === 0) return [];
  const dates = Array.from(new Set(rows.map((r) => r.fecha))).sort();
  const last = new Date(dates[dates.length - 1] + "T00:00:00");
  const weeks: { start: Date; end: Date }[] = [];
  const cursor = new Date(last);
  cursor.setDate(cursor.getDate() - cursor.getDay()); // Domingo de la última semana
  for (let i = 0; i < n; i++) {
    const start = new Date(cursor);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    weeks.unshift({ start, end });
  }
  return weeks.map((w) => {
    const startStr = w.start.toISOString().split("T")[0];
    const endStr = w.end.toISOString().split("T")[0];
    const wRows = rows.filter((r) => r.fecha >= startStr && r.fecha <= endStr);
    const weekNum = getWeekNumber(w.start);
    const monthLabel = MESES[w.start.getMonth()];
    return { label: `${startStr}→${endStr}`, weekNum, monthLabel, rows: wRows };
  });
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}
