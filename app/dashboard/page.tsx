import KpiCard from "@/components/KpiCard";
import EmptyState from "@/components/EmptyState";
import SaturationChart from "@/components/SaturationChart";
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

  // ============ Cálculo de plan-a-hoy y proyección ============
  const totalDaysInPeriod = Math.max(
    1,
    Math.round(
      (new Date(period.until + "T00:00:00").getTime() -
        new Date(period.since + "T00:00:00").getTime()) /
        86400000
    ) + 1
  );
  const daysElapsed = Math.max(1, kpi.dias_con_datos);
  const planFraction = daysElapsed / totalDaysInPeriod;

  const planGasto = client.presupuesto * planFraction;
  const planVentas = client.meta_ventas * planFraction;

  // Proyección de cierre (extrapolando el ritmo diario actual)
  const dailyGasto = kpi.gasto / daysElapsed;
  const dailyVentas = kpi.ventas / daysElapsed;
  const dailyCompras = kpi.compras / daysElapsed;

  const daysInMonth = totalDaysInPeriod;
  const proyGasto = dailyGasto * daysInMonth;
  const proyVentas = dailyVentas * daysInMonth;
  const proyCompras = Math.round(dailyCompras * daysInMonth);
  const proyRoas = proyGasto > 0 ? proyVentas / proyGasto : 0;

  const cumpleMetaGasto = proyGasto <= client.presupuesto * 1.05;
  const cumpleMetaVentas = proyVentas >= client.meta_ventas * 0.95;
  const cumpleMetaRoas = proyRoas >= client.roas_objetivo;

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
          format="money"
          currency={currency}
          goal={client.presupuesto}
          goalPace={planGasto}
          progressColor="var(--accent)"
          subLeft={{ label: "Restante", value: fmtMoney(Math.max(0, client.presupuesto - kpi.gasto), currency) }}
          subRight={{ label: "Ritmo/día", value: fmtMoney(dailyGasto, currency) }}
        />

        <KpiCard
          title="Ventas"
          value={kpi.ventas}
          format="money"
          currency={currency}
          goal={client.meta_ventas}
          goalPace={planVentas}
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

      {/* ═════ TENDENCIA · PROYECCIÓN DE CIERRE ═════ */}
      <div className="section-label">Tendencia · Proyección de cierre</div>
      <div className="panel" style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
              Cierre proyectado · Gasto
            </div>
            <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 28, fontVariantNumeric: "tabular-nums", color: cumpleMetaGasto ? "var(--good)" : "var(--warn)" }}>
              {fmtMoney(proyGasto, currency)}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              de meta {fmtMoney(client.presupuesto, currency)}
              {" · "}
              {cumpleMetaGasto ? (
                <span style={{ color: "var(--good)" }}>en el rango</span>
              ) : proyGasto > client.presupuesto ? (
                <span style={{ color: "var(--warn)" }}>+{fmtMoney(proyGasto - client.presupuesto, currency)} sobregasto</span>
              ) : (
                <span style={{ color: "var(--muted)" }}>{fmtMoney(client.presupuesto - proyGasto, currency)} sin gastar</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
              Cierre proyectado · Ventas
            </div>
            <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 28, fontVariantNumeric: "tabular-nums", color: cumpleMetaVentas ? "var(--good)" : "var(--bad)" }}>
              {fmtMoney(proyVentas, currency)}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              de meta {fmtMoney(client.meta_ventas, currency)}
              {" · "}
              {cumpleMetaVentas ? (
                <span style={{ color: "var(--good)" }}>
                  {proyVentas > client.meta_ventas ? "+" : ""}
                  {(((proyVentas - client.meta_ventas) / client.meta_ventas) * 100).toFixed(0)}%
                </span>
              ) : (
                <span style={{ color: "var(--bad)" }}>
                  {(((proyVentas - client.meta_ventas) / client.meta_ventas) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
              Cierre proyectado · ROAS
            </div>
            <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 28, fontVariantNumeric: "tabular-nums", color: cumpleMetaRoas ? "var(--good)" : "var(--bad)" }}>
              {fmtRoas(proyRoas)}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              objetivo {fmtRoas(client.roas_objetivo)}
              {" · "}
              {cumpleMetaRoas ? (
                <span style={{ color: "var(--good)" }}>+{(proyRoas - client.roas_objetivo).toFixed(2)}x sobre</span>
              ) : (
                <span style={{ color: "var(--bad)" }}>{(proyRoas - client.roas_objetivo).toFixed(2)}x bajo</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
              Cierre proyectado · Compras
            </div>
            <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 28, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
              {fmtNum(proyCompras)}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              ritmo {dailyCompras.toFixed(1)}/día · {daysElapsed} de {totalDaysInPeriod} días
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--rule)", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
          Proyección lineal · asume que el ritmo diario actual se sostiene hasta el cierre del período. Recalibrar con cada pull de n8n.
        </div>
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

      {daysSorted.length >= 2 && (
        <>
          <div className="section-label">Simulador · curva de rendimiento decreciente</div>
          <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <h3>¿Y si movés el presupuesto?</h3>
              <span className="hint">
                CAC actual {fmtMoney(kpi.cpa, currency)} · ROAS objetivo {fmtRoas(client.roas_objetivo)}
              </span>
            </div>
            <SaturationChart
              g0={proyGasto}
              R0={proyRoas}
              ROBJ={client.roas_objetivo}
              CAC0={kpi.cpa}
              ticket={kpi.ticket}
              currency={currency}
              lastUpdate={daysSorted[daysSorted.length - 1]}
            />
          </div>
        </>
      )}

      <div className="footstrip">
        <span>Datos por <b>{client.nombre}</b> · Sheet <code style={{ fontSize: 11 }}>{client.sheet_id.substring(0, 12)}…</code></span>
        <span>Período comparado: <b>{period.previous?.label ?? "—"}</b></span>
        <span>Meta ROAS: <b>{fmtRoas(client.roas_objetivo)}</b> · Meta ventas: <b>{fmtMoney(client.meta_ventas, currency)}</b></span>
      </div>
    </>
  );
}
