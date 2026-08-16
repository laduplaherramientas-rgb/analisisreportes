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

  // ═════════════════════════════════════════════════════════════
  // Simulación de escenarios · rendimientos decrecientes
  // ═════════════════════════════════════════════════════════════
  // ROAS marginal se degrada con saturación de la audiencia.
  // Fórmula: ROAS_efectivo(mult) = ROAS_actual * (1 - k * ln(mult))
  // donde k depende del CV (más varianza histórica → más saturación temprana)
  const dailyAggs = daysSorted.map((d) => aggregate(daysMap.get(d)!));
  const gastos = dailyAggs.map((a) => a.gasto);
  const ventasArr = dailyAggs.map((a) => a.ventas);
  const roasArr = dailyAggs.map((a) => a.roas).filter((r) => r > 0);

  function std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }
  const meanGasto = gastos.length ? gastos.reduce((s, x) => s + x, 0) / gastos.length : 0;
  const meanVentas = ventasArr.length ? ventasArr.reduce((s, x) => s + x, 0) / ventasArr.length : 0;
  const meanRoas = roasArr.length ? roasArr.reduce((s, x) => s + x, 0) / roasArr.length : 0;
  const stdGasto = std(gastos);
  const stdVentas = std(ventasArr);
  const stdRoas = std(roasArr);
  const cvGasto = meanGasto > 0 ? (stdGasto / meanGasto) * 100 : 0;
  const cvVentas = meanVentas > 0 ? (stdVentas / meanVentas) * 100 : 0;
  const cvRoas = meanRoas > 0 ? (stdRoas / meanRoas) * 100 : 0;

  // k de saturación: entre 0.15 (base) y 0.35 (alta varianza)
  const saturationK = 0.15 + Math.min(0.20, (cvRoas / 100) * 0.30);

  const escenarios = [0, 10, 25, 50, 100].map((pct) => {
    const mult = 1 + pct / 100;
    const gastoProy = proyGasto * mult;
    // ROAS efectivo con saturación logarítmica (mult=1 → sin degradar)
    const roasEfectivo = mult === 1
      ? proyRoas
      : proyRoas * Math.max(0.4, 1 - saturationK * Math.log(mult));
    const ventasProy = gastoProy * roasEfectivo;
    const comprasProy = kpi.ticket > 0 ? Math.round(ventasProy / kpi.ticket) : 0;
    const ventasExtra = ventasProy - proyVentas;
    const gastoExtra = gastoProy - proyGasto;
    return { pct, mult, gastoProy, roasEfectivo, ventasProy, comprasProy, ventasExtra, gastoExtra };
  });

  // ═════════════════════════════════════════════════════════════
  // Creativos activos vs ROAS · por día
  // ═════════════════════════════════════════════════════════════
  const adsVsRoas = daysSorted.map((d) => {
    const dayRows = daysMap.get(d)!;
    const nAds = new Set(dayRows.map((r) => r.ad_id)).size;
    const agg = aggregate(dayRows);
    return { fecha: d, ads: nAds, roas: agg.roas, gasto: agg.gasto };
  });
  // Correlación simple de Pearson entre # ads y ROAS
  function pearson(xs: number[], ys: number[]): number {
    if (xs.length < 3) return 0;
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const my = ys.reduce((s, y) => s + y, 0) / ys.length;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  }
  const corrAdsRoas = pearson(
    adsVsRoas.map((d) => d.ads),
    adsVsRoas.map((d) => d.roas)
  );
  const corrGastoRoas = pearson(
    adsVsRoas.map((d) => d.gasto),
    adsVsRoas.map((d) => d.roas)
  );

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

      {/* ═════ SIMULACIÓN · VARIABILIDAD · CREATIVOS ═════ */}
      {daysSorted.length >= 2 && (
        <>
          <div className="section-label">Escenarios y variabilidad</div>

          {/* ── Simulador de gasto ── */}
          <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
            <div className="panel-head" style={{ marginBottom: 16 }}>
              <h3>¿Y si gastáramos más?</h3>
              <span className="hint">
                proyección con saturación · k={saturationK.toFixed(2)} (basado en variabilidad ROAS)
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Escenario</th>
                    <th>Gasto proyectado</th>
                    <th>ROAS efectivo</th>
                    <th>Ventas proyectadas</th>
                    <th>Compras</th>
                    <th>Ventas extra vs base</th>
                    <th>Eficiencia marginal</th>
                  </tr>
                </thead>
                <tbody>
                  {escenarios.map((e) => {
                    const marginal = e.gastoExtra > 0 ? e.ventasExtra / e.gastoExtra : e.roasEfectivo;
                    const isBase = e.pct === 0;
                    const marginalCls =
                      marginal >= client.roas_objetivo ? "good" :
                      marginal >= client.roas_objetivo * 0.7 ? "warn" : "bad";
                    return (
                      <tr key={e.pct} className={isBase ? "total" : ""}>
                        <td>
                          <b>{isBase ? "Actual" : `+${e.pct}%`}</b>
                          {isBase && <span className="pill info" style={{ marginLeft: 8 }}>base</span>}
                        </td>
                        <td>{fmtMoney(e.gastoProy, currency)}</td>
                        <td>{fmtRoas(e.roasEfectivo)}</td>
                        <td>{fmtMoney(e.ventasProy, currency)}</td>
                        <td>{fmtNum(e.comprasProy)}</td>
                        <td>
                          {isBase ? "—" : (
                            <span style={{ color: e.ventasExtra > 0 ? "var(--good)" : "var(--muted)" }}>
                              +{fmtMoney(e.ventasExtra, currency)}
                            </span>
                          )}
                        </td>
                        <td>
                          {isBase ? "—" : (
                            <span className={`pill ${marginalCls}`}>
                              {fmtRoas(marginal)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
              La <b>eficiencia marginal</b> es el ROAS del gasto <i>extra</i> — si cae debajo del objetivo, cada peso adicional deja de ser rentable. Modelo logarítmico simple, valida siempre con test A/B real.
            </div>
          </div>

          {/* ── Variabilidad / desvío ── */}
          <div className="split" style={{ marginBottom: 20 }}>
            <div className="panel" style={{ padding: 24 }}>
              <div className="panel-head" style={{ marginBottom: 16 }}>
                <h3>Consistencia del rendimiento</h3>
                <span className="hint">σ y coeficiente de variación · últimos {daysSorted.length} días</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
                {[
                  { label: "Gasto diario", mean: meanGasto, sd: stdGasto, cv: cvGasto, fmt: "money" as const },
                  { label: "Ventas diarias", mean: meanVentas, sd: stdVentas, cv: cvVentas, fmt: "money" as const },
                  { label: "ROAS diario", mean: meanRoas, sd: stdRoas, cv: cvRoas, fmt: "roas" as const },
                ].map((m) => {
                  const cvCls = m.cv < 20 ? "good" : m.cv < 40 ? "warn" : "bad";
                  const cvLabel = m.cv < 20 ? "Estable" : m.cv < 40 ? "Volátil" : "Errático";
                  return (
                    <div key={m.label}>
                      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
                        {m.label}
                      </div>
                      <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 22, fontVariantNumeric: "tabular-nums" }}>
                        {m.fmt === "money" ? fmtMoney(m.mean, currency) : fmtRoas(m.mean)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        promedio · σ = {m.fmt === "money" ? fmtMoney(m.sd, currency) : m.sd.toFixed(2)}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <span className={`pill ${cvCls}`}>
                          CV {m.cv.toFixed(0)}% · {cvLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--rule)", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                CV bajo (&lt;20%) = campañas predecibles. CV alto (&gt;40%) = mucha varianza día a día — cuidado al proyectar sobre pocos datos.
              </div>
            </div>

            {/* ── Ads activos vs ROAS ── */}
            <div className="panel" style={{ padding: 24 }}>
              <div className="panel-head" style={{ marginBottom: 16 }}>
                <h3>Creativos activos vs ROAS</h3>
                <span className="hint">correlación diaria</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
                    #Ads vs ROAS
                  </div>
                  <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 22, fontVariantNumeric: "tabular-nums", color: corrAdsRoas < -0.3 ? "var(--bad)" : corrAdsRoas > 0.3 ? "var(--good)" : "var(--ink)" }}>
                    {corrAdsRoas >= 0 ? "+" : ""}{corrAdsRoas.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    {corrAdsRoas < -0.5 ? "Fuerte inversa: más ads bajan ROAS" :
                     corrAdsRoas < -0.2 ? "Leve inversa: puede haber canibalización" :
                     corrAdsRoas > 0.5 ? "Fuerte positiva: más ads = mejor mix" :
                     corrAdsRoas > 0.2 ? "Leve positiva" : "Sin relación clara"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
                    Gasto vs ROAS
                  </div>
                  <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 22, fontVariantNumeric: "tabular-nums", color: corrGastoRoas < -0.3 ? "var(--bad)" : corrGastoRoas > 0.3 ? "var(--good)" : "var(--ink)" }}>
                    {corrGastoRoas >= 0 ? "+" : ""}{corrGastoRoas.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    {corrGastoRoas < -0.3 ? "Días de más inversión rinden peso a peso" :
                     corrGastoRoas > 0.3 ? "Escalar funciona en este cliente" :
                     "Escala neutra"}
                  </div>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Ads</th>
                      <th>Gasto</th>
                      <th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adsVsRoas.slice(-8).map((d) => (
                      <tr key={d.fecha}>
                        <td>{d.fecha}</td>
                        <td><b>{d.ads}</b></td>
                        <td>{fmtMoney(d.gasto, currency)}</td>
                        <td>{fmtRoas(d.roas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                Últimos 8 días. Cuando la correlación #ads vs ROAS es negativa, probablemente estén canibalizándose entre sí — revisar solapes de audiencia.
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═════ SIMULADOR · ¿Y SI GASTÁRAMOS MÁS? ═════ */}
      <div className="section-label">Simulador · ¿Y si gastáramos más?</div>
      <div className="panel" style={{ padding: 24 }}>
        <div className="panel-head" style={{ marginBottom: 16 }}>
          <h3>Proyección de cierre bajo distintos niveles de inversión</h3>
          <span className="hint">
            saturación k={saturationK.toFixed(2)} · basada en variabilidad de ROAS ({cvRoas.toFixed(0)}%)
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Escenario</th>
                <th>Gasto proyectado</th>
                <th>ROAS efectivo</th>
                <th>Ventas proyectadas</th>
                <th>Compras</th>
                <th>Δ Ventas vs base</th>
              </tr>
            </thead>
            <tbody>
              {escenarios.map((e) => {
                const isBase = e.pct === 0;
                const eficienciaMarginal = e.gastoExtra > 0 ? e.ventasExtra / e.gastoExtra : 0;
                return (
                  <tr key={e.pct} className={isBase ? "total" : ""}>
                    <td>
                      <b>{isBase ? "Base (ritmo actual)" : `+${e.pct}%`}</b>
                      {!isBase && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          ROAS marginal ~{fmtRoas(eficienciaMarginal)}
                        </div>
                      )}
                    </td>
                    <td>{fmtMoney(e.gastoProy, currency)}</td>
                    <td className={isBase ? "strong" : ""}>{fmtRoas(e.roasEfectivo)}</td>
                    <td>{fmtMoney(e.ventasProy, currency)}</td>
                    <td>{fmtNum(e.comprasProy)}</td>
                    <td>
                      {isBase ? "—" : (
                        <span className={`delta ${e.ventasExtra > 0 ? "up" : "down"}`}>
                          {e.ventasExtra > 0 ? "↑ +" : "↓ "}
                          {fmtMoney(Math.abs(e.ventasExtra), currency)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Barra visual de ventas por escenario */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 12 }}>
            Ventas proyectadas por escenario
          </div>
          {(() => {
            const maxV = Math.max(...escenarios.map((e) => e.ventasProy));
            return escenarios.map((e) => {
              const pct = maxV > 0 ? (e.ventasProy / maxV) * 100 : 0;
              const isBase = e.pct === 0;
              return (
                <div key={e.pct} style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", gap: 12, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: isBase ? "var(--ink)" : "var(--ink-2)", fontWeight: isBase ? 600 : 400 }}>
                    {isBase ? "Base" : `+${e.pct}% gasto`}
                  </div>
                  <div style={{ position: "relative", height: 22, background: "var(--surface-2)", borderRadius: 3 }}>
                    <span style={{
                      display: "block",
                      width: `${pct}%`,
                      height: "100%",
                      background: isBase ? "var(--accent)" : "var(--good)",
                      borderRadius: 3,
                      opacity: isBase ? 1 : 0.85,
                    }} />
                  </div>
                  <div style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--ink-2)" }}>
                    {fmtMoney(e.ventasProy, currency)}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--rule)", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
          Modelo: ROAS efectivo = ROAS actual × (1 − k · ln(multiplicador)), con k derivado de la volatilidad histórica del ROAS. A mayor varianza, saturación más rápida.
        </div>
      </div>

      {/* ═════ CONSISTENCIA · DESVIACIÓN ESTÁNDAR ═════ */}
      <div className="section-label">Consistencia del rendimiento</div>
      <div className="panel" style={{ padding: 24 }}>
        <div className="panel-head" style={{ marginBottom: 16 }}>
          <h3>¿Qué tan predecible es el rendimiento diario?</h3>
          <span className="hint">σ = desviación estándar · CV = coef. de variación (σ/μ)</span>
        </div>

        {dailyAggs.length < 3 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontStyle: "italic" }}>
            Se necesitan al menos 3 días con datos para calcular variabilidad.
            Tenés <b>{dailyAggs.length}</b>.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {[
              { label: "Gasto diario", mean: meanGasto, std: stdGasto, cv: cvGasto, fmt: (v: number) => fmtMoney(v, currency) },
              { label: "Ventas diarias", mean: meanVentas, std: stdVentas, cv: cvVentas, fmt: (v: number) => fmtMoney(v, currency) },
              { label: "ROAS diario", mean: meanRoas, std: stdRoas, cv: cvRoas, fmt: (v: number) => fmtRoas(v) },
            ].map((m) => {
              const cvStatus = m.cv < 25 ? "good" : m.cv < 50 ? "warn" : "bad";
              const cvLabel = m.cv < 25 ? "estable" : m.cv < 50 ? "moderada" : "volátil";
              return (
                <div key={m.label}>
                  <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
                    {m.label}
                  </div>
                  <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 22, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
                    {m.fmt(m.mean)}
                    <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 6 }}>promedio</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    σ = <b style={{ color: "var(--ink-2)" }}>{m.fmt(m.std)}</b>
                    {" · "}
                    CV <span className={`pill ${cvStatus}`} style={{ marginLeft: 4 }}>
                      <span className="dot"></span>{m.cv.toFixed(0)}% {cvLabel}
                    </span>
                  </div>
                  {/* Barra visual μ ± σ */}
                  <div style={{ marginTop: 12, position: "relative", height: 8, background: "var(--surface-2)", borderRadius: 2 }}>
                    <span style={{
                      position: "absolute",
                      left: `${Math.max(0, 50 - Math.min(50, (m.cv / 2)))}%`,
                      width: `${Math.min(100, m.cv)}%`,
                      height: "100%",
                      background: cvStatus === "good" ? "var(--good)" : cvStatus === "warn" ? "var(--warn)" : "var(--bad)",
                      borderRadius: 2,
                      opacity: 0.5,
                    }} />
                    <span style={{
                      position: "absolute",
                      left: "50%",
                      top: -2,
                      bottom: -2,
                      width: 2,
                      background: "var(--ink)",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                    <span>μ − σ</span>
                    <span>μ</span>
                    <span>μ + σ</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--rule)", fontSize: 12, color: "var(--muted)" }}>
          <b>Cómo leerlo:</b> CV &lt; 25% → performance predecible, base sólida para escalar. CV 25–50% → variable, revisar antes de subir presupuesto. CV &gt; 50% → volátil, priorizar estabilizar antes que crecer.
        </div>
      </div>

      {/* ═════ CREATIVOS ACTIVOS vs ROAS ═════ */}
      <div className="section-label">Presupuesto y creativos · efecto sobre ROAS</div>
      <div className="panel" style={{ padding: 24 }}>
        <div className="panel-head" style={{ marginBottom: 16 }}>
          <h3>¿Más anuncios activos = mejor o peor ROAS?</h3>
          <span className="hint">
            Correlación gasto↔ROAS: <b style={{ color: corrGastoRoas < -0.3 ? "var(--bad)" : corrGastoRoas > 0.3 ? "var(--good)" : "var(--muted)" }}>{corrGastoRoas.toFixed(2)}</b>
            {" · "}
            Correlación #anuncios↔ROAS: <b style={{ color: corrAdsRoas < -0.3 ? "var(--bad)" : corrAdsRoas > 0.3 ? "var(--good)" : "var(--muted)" }}>{corrAdsRoas.toFixed(2)}</b>
          </span>
        </div>

        {adsVsRoas.length < 3 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontStyle: "italic" }}>
            Se necesitan al menos 3 días con datos.
          </div>
        ) : (() => {
          const maxAds = Math.max(...adsVsRoas.map((d) => d.ads), 1);
          const maxRoas = Math.max(...adsVsRoas.map((d) => d.roas), client.roas_objetivo, 1);
          const W = 640, H = 220, P = 32;
          return (
            <div style={{ overflowX: "auto" }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto" }}>
                {/* Grid horizontal */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <line
                    key={f}
                    x1={P} x2={W - P}
                    y1={H - P - f * (H - 2 * P)}
                    y2={H - P - f * (H - 2 * P)}
                    stroke="var(--rule)"
                    strokeDasharray="2 3"
                  />
                ))}
                {/* Línea objetivo ROAS */}
                {maxRoas > 0 && (
                  <line
                    x1={P} x2={W - P}
                    y1={H - P - (client.roas_objetivo / maxRoas) * (H - 2 * P)}
                    y2={H - P - (client.roas_objetivo / maxRoas) * (H - 2 * P)}
                    stroke="var(--good)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                )}
                {/* Puntos */}
                {adsVsRoas.map((d, i) => {
                  const x = P + (d.ads / maxAds) * (W - 2 * P);
                  const y = H - P - (d.roas / maxRoas) * (H - 2 * P);
                  const r = 4 + Math.sqrt(d.gasto / (meanGasto || 1)) * 3;
                  const color = d.roas >= client.roas_objetivo ? "var(--good)" : d.roas >= client.roas_objetivo * 0.7 ? "var(--warn)" : "var(--bad)";
                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r={r} fill={color} opacity={0.7} />
                      <title>{d.fecha} · {d.ads} ads · ROAS {d.roas.toFixed(2)} · Gasto {fmtMoney(d.gasto, currency)}</title>
                    </g>
                  );
                })}
                {/* Ejes */}
                <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--ink-2)" strokeWidth="1" />
                <line x1={P} x2={P} y1={P} y2={H - P} stroke="var(--ink-2)" strokeWidth="1" />
                {/* Labels */}
                <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  # anuncios activos por día (0 → {maxAds})
                </text>
                <text x={10} y={P} fontSize="10" fill="var(--muted)">
                  ROAS {maxRoas.toFixed(1)}x
                </text>
                <text x={10} y={H - P + 3} fontSize="10" fill="var(--muted)">0</text>
              </svg>
            </div>
          );
        })()}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--rule)", fontSize: 12, color: "var(--muted)" }}>
          <b>Cómo leerlo:</b> cada círculo es un día · tamaño = gasto de ese día · verde/amarillo/rojo según ROAS.
          {" "}
          {corrAdsRoas < -0.3 && <span style={{ color: "var(--bad)" }}>Correlación negativa fuerte: sumar más creativos está diluyendo la eficiencia. Considerá pausar los de bajo rendimiento antes de agregar más.</span>}
          {corrAdsRoas > 0.3 && <span style={{ color: "var(--good)" }}>Correlación positiva: más creativos activos coinciden con mejor ROAS. Hay margen para seguir sumando variantes.</span>}
          {corrAdsRoas >= -0.3 && corrAdsRoas <= 0.3 && <span>No hay señal clara todavía · seguí acumulando data.</span>}
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
