import KpiCard from "@/components/KpiCard";
import EmptyState from "@/components/EmptyState";
import { loadDashboard } from "@/lib/dashboard-data";
import {
  aggregate,
  filterByPeriod,
  fmtMoney,
  fmtRoas,
  fmtNum,
  groupBy,
  detectObjetivo,
} from "@/lib/data";
import type { PeriodKey } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await loadDashboard(
    sp.client ?? null,
    (sp.period as PeriodKey) ?? "thisMonth"
  );

  if (!ctx.client) {
    return (
      <EmptyState
        title="No hay clientes configurados"
        hint="Agregá filas en la Master Sheet (pestaña 'Clientes') y refrescá."
      />
    );
  }

  const { client, period, rows, kpi, kpiPrev, allRows } = ctx;
  const currency = client.moneda;
  const roasStatus =
    kpi.roas >= client.roas_objetivo
      ? "good"
      : kpi.roas >= client.roas_objetivo * 0.9
      ? "warn"
      : "bad";

  // Ventas por día (para tabla de "por día")
  const daysMap = groupBy(rows, "fecha");
  const daysSorted = Array.from(daysMap.keys()).sort();

  // Top 8 campañas por gasto en el período
  const camps = groupBy(rows, "campaign_id");
  const campSummary = Array.from(camps.entries())
    .map(([id, rs]) => {
      const agg = aggregate(rs);
      const name = rs[0]?.campaign_name ?? id;
      return { id, name, agg, objetivo: detectObjetivo(name) };
    })
    .sort((a, b) => b.agg.gasto - a.agg.gasto)
    .slice(0, 8);

  const totalSpend = campSummary.reduce((s, c) => s + c.agg.gasto, 0);

  return (
    <>
      <header className="view-head">
        <div>
          <div className="eyebrow">
            {client.nombre} · {period.label} ({period.since} → {period.until}) · Moneda {currency}
          </div>
          <h1>Cómo vamos contra el objetivo</h1>
        </div>
        <div className="view-right">
          <div className="day-counter">
            <b>{kpi.dias_con_datos}</b> {kpi.dias_con_datos === 1 ? "día" : "días"} con datos
          </div>
          <div className="caption">
            {rows.length} filas · {new Set(rows.map((r) => r.ad_id)).size} anuncios activos
          </div>
        </div>
      </header>

      {rows.length === 0 && (
        <EmptyState
          title="No hay datos para este período"
          hint="Cambiá el filtro de período o esperá a que n8n corra el próximo pull (7 AM)."
        />
      )}

      <div className="kpis">
        <KpiCard
          title="Inversión"
          value={kpi.gasto}
          previous={kpiPrev.gasto}
          format="money"
          currency={currency}
          goal={client.presupuesto}
          progressColor="var(--accent)"
          subLeft={{ label: "Ritmo diario", value: fmtMoney(kpi.gasto / Math.max(1, kpi.dias_con_datos), currency) }}
          subRight={{ label: "Frecuencia", value: kpi.frecuencia.toFixed(2) }}
        />

        <KpiCard
          title="Ventas"
          value={kpi.ventas}
          previous={kpiPrev.ventas}
          format="money"
          currency={currency}
          goal={client.meta_ventas}
          progressColor="var(--good)"
          subLeft={{ label: "Compras", value: fmtNum(kpi.compras) }}
          subRight={{ label: "Ticket", value: fmtMoney(kpi.ticket, currency) }}
        />

        <KpiCard
          title="Eficiencia"
          value={kpi.roas}
          previous={kpiPrev.roas}
          format="roas"
          status={roasStatus}
          statusLabel={roasStatus === "good" ? "ROAS > objetivo" : roasStatus === "warn" ? "Cerca del objetivo" : "Debajo del objetivo"}
          subLeft={{ label: "CPA", value: fmtMoney(kpi.cpa, currency) }}
          subRight={{ label: "Objetivo", value: fmtRoas(client.roas_objetivo) }}
        />
      </div>

      {/* Detalle diario + Campañas */}
      <div className="section-label">Detalle por día y por campaña</div>
      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <h3>Rendimiento por día</h3>
            <span className="hint">{daysSorted.length} días con data</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Inversión</th>
                  <th>Ventas</th>
                  <th>Compras</th>
                  <th>ROAS</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {daysSorted.map((d) => {
                  const agg = aggregate(daysMap.get(d)!);
                  const status =
                    agg.roas >= client.roas_objetivo
                      ? "good"
                      : agg.roas >= client.roas_objetivo * 0.9
                      ? "warn"
                      : "bad";
                  return (
                    <tr key={d}>
                      <td>{d}</td>
                      <td>{fmtMoney(agg.gasto, currency)}</td>
                      <td>{fmtMoney(agg.ventas, currency)}</td>
                      <td>{fmtNum(agg.compras)}</td>
                      <td className={status === "good" ? "strong" : ""}>
                        {fmtRoas(agg.roas)}
                      </td>
                      <td>
                        <span className={`pill ${status}`}>
                          {status === "good" ? "🟢" : status === "warn" ? "🟡" : "🔴"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>Total</td>
                  <td>{fmtMoney(kpi.gasto, currency)}</td>
                  <td>{fmtMoney(kpi.ventas, currency)}</td>
                  <td>{fmtNum(kpi.compras)}</td>
                  <td>{fmtRoas(kpi.roas)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Rendimiento por campaña</h3>
            <span className="hint">top {campSummary.length} por gasto</span>
          </div>
          {campSummary.map((c) => {
            const pctSpend = totalSpend > 0 ? (c.agg.gasto / totalSpend) * 100 : 0;
            const isConv = c.objetivo === "conversion";
            const status =
              !isConv ? "info" :
              c.agg.roas >= client.roas_objetivo ? "good" :
              c.agg.roas >= client.roas_objetivo * 0.7 ? "warn" : "bad";
            const label =
              !isConv ? "Presentación" :
              status === "good" ? "Estrella" :
              status === "warn" ? "Observar" : "Sin conversión";
            const color =
              status === "good" ? "var(--good)" :
              status === "warn" ? "var(--warn)" :
              status === "info" ? "var(--info)" : "var(--bad)";

            return (
              <div className="campaign-row" key={c.id}>
                <div className="camp-head">
                  <span className="camp-name">
                    <span className="camp-swatch" style={{ background: color }} />
                    {c.name}
                  </span>
                  <span className={`pill ${status}`}><span className="dot"></span>{label}</span>
                </div>
                <div className="camp-meta">
                  <div><span className="k">Inv</span><span className="v">{fmtMoney(c.agg.gasto, currency)}</span></div>
                  <div><span className="k">Ventas</span><span className="v">{fmtMoney(c.agg.ventas, currency)}</span></div>
                  <div><span className="k">ROAS</span><span className="v">{isConv ? fmtRoas(c.agg.roas) : "—"}</span></div>
                  <div><span className="k">Compras</span><span className="v">{fmtNum(c.agg.compras)}</span></div>
                  <div><span className="k">CPA</span><span className="v">{c.agg.compras > 0 ? fmtMoney(c.agg.cpa, currency) : "—"}</span></div>
                </div>
                <div className="camp-bar">
                  <span style={{ width: `${pctSpend}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="footstrip">
        <span>Datos por <b>{client.nombre}</b> · Sheet <code style={{ fontSize: 11 }}>{client.sheet_id.substring(0, 12)}…</code></span>
        <span>Período comparado: <b>{period.previous?.label ?? "—"}</b></span>
        <span>Meta ROAS: <b>{fmtRoas(client.roas_objetivo)}</b> · Meta ventas: <b>{fmtMoney(client.meta_ventas, currency)}</b></span>
      </div>
    </>
  );
}
