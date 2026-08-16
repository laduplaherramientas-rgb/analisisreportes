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

  // ═════════════════════════════════════════════════════════════
  // Modelo cuadrático de saturación · para el gráfico
  // ventas(g) = a·g − b·g²   →   ROAS(g) = a − b·g  (recta decreciente)
  // Calibración: en g = 2·g0 asumimos ROAS = 0.7·ROAS0  → b = 0.3·ROAS0/g0
  // ─────────────────────────────────────────────────────────────
  const g0 = Math.max(1, proyGasto);
  const R0 = Math.max(0.01, proyRoas);
  const ROBJ = client.roas_objetivo;
  const CAC0 = kpi.cpa; // costo por adquisición actual

  const b = (0.3 * R0) / g0;
  const a = 1.3 * R0;

  const roasAt = (g: number) => Math.max(0, a - b * g);
  const ventasAt = (g: number) => Math.max(0, a * g - b * g * g);

  // Gasto donde ROAS alcanza el objetivo (frontera de zona verde)
  const gOptObj = a > ROBJ ? (a - ROBJ) / b : 0;
  // Gasto máximo rentable (ROAS = 1, break-even)
  const gBreakEven = a > 1 ? (a - 1) / b : 0;
  // Vértice de la parábola (máximo absoluto de ventas)
  const gVertex = a / (2 * b);

  const gMax = Math.max(g0 * 2.5, gBreakEven * 1.05);

  const chartW = 820;
  const chartH = 320;
  const mL = 70, mR = 70, mT = 20, mB = 44;
  const plotW = chartW - mL - mR;
  const plotH = chartH - mT - mB;

  const ventasMax = ventasAt(Math.min(gVertex, gMax)) * 1.08;
  const roasMax = Math.max(R0 * 1.2, a);

  const xScale = (g: number) => mL + (g / gMax) * plotW;
  const yVentas = (v: number) => mT + plotH - (v / ventasMax) * plotH;
  const yRoas = (r: number) => mT + plotH - (r / roasMax) * plotH;

  const N = 60;
  const points = Array.from({ length: N + 1 }, (_, i) => {
    const g = (i / N) * gMax;
    return { g, ventas: ventasAt(g), roas: roasAt(g) };
  });
  const ventasPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.g).toFixed(1)},${yVentas(p.ventas).toFixed(1)}`).join(" ");
  const roasPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.g).toFixed(1)},${yRoas(p.roas).toFixed(1)}`).join(" ");
  const ventasArea = `${ventasPath} L${xScale(gMax).toFixed(1)},${(mT + plotH).toFixed(1)} L${xScale(0).toFixed(1)},${(mT + plotH).toFixed(1)} Z`;

  // Ticks eje X (0, 0.5x, 1x, 1.5x, 2x, 2.5x del gasto actual)
  const xTicks = [0, 0.5, 1, 1.5, 2, 2.5]
    .map((mult) => ({ g: g0 * mult, label: mult === 1 ? "actual" : `${mult}×` }))
    .filter((t) => t.g <= gMax);
  const yVentasTicks = 5;
  const yRoasTicks = 5;

  // Puntos clave para simulación numérica
  const escenariosCuadratico = [10, 25, 50, 100].map((pct) => {
    const g = g0 * (1 + pct / 100);
    const v = ventasAt(g);
    const r = roasAt(g);
    const vExtra = v - ventasAt(g0);
    const gExtra = g - g0;
    const roasMarginal = gExtra > 0 ? vExtra / gExtra : r;
    const cacNuevo = ventasAt(g) > 0 && kpi.ticket > 0 ? g / (v / kpi.ticket) : CAC0;
    return { pct, g, v, r, vExtra, roasMarginal, cacNuevo };
  });

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

          {/* ── Curva de saturación · ventas vs ROAS ── */}
          <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
            <div className="panel-head" style={{ marginBottom: 8 }}>
              <h3>Curva de rendimiento decreciente</h3>
              <span className="hint">
                CAC actual {fmtMoney(CAC0, currency)} · ROAS objetivo {fmtRoas(ROBJ)} · modelo cuadrático
              </span>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
              Cuánto más gastás → más ventas pero cada peso extra rinde menos. La <b>parábola</b> de ventas alcanza su máximo cuando el ROAS marginal cae a cero.
            </div>

            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", height: "auto", display: "block" }}>
              {/* Zonas de fondo: verde (ROAS ≥ objetivo), amarillo (ROAS ≥ 1), rojo (ROAS < 1) */}
              {gOptObj > 0 && gOptObj <= gMax && (
                <rect x={mL} y={mT} width={xScale(gOptObj) - mL} height={plotH} fill="var(--good)" opacity="0.06" />
              )}
              {gBreakEven > gOptObj && gBreakEven <= gMax && (
                <rect x={xScale(Math.max(gOptObj, 0))} y={mT} width={xScale(gBreakEven) - xScale(Math.max(gOptObj, 0))} height={plotH} fill="var(--warn)" opacity="0.06" />
              )}
              {gBreakEven < gMax && (
                <rect x={xScale(gBreakEven)} y={mT} width={xScale(gMax) - xScale(gBreakEven)} height={plotH} fill="var(--bad)" opacity="0.06" />
              )}

              {/* Grid horizontal */}
              {Array.from({ length: yVentasTicks + 1 }, (_, i) => {
                const y = mT + (i / yVentasTicks) * plotH;
                return <line key={i} x1={mL} x2={mL + plotW} y1={y} y2={y} stroke="var(--rule)" strokeWidth="0.5" strokeDasharray="2,3" />;
              })}

              {/* Área bajo la curva de ventas */}
              <path d={ventasArea} fill="var(--accent)" opacity="0.08" />

              {/* Curva de ventas (parábola) */}
              <path d={ventasPath} fill="none" stroke="var(--accent)" strokeWidth="2.5" />

              {/* Curva de ROAS (recta decreciente en el modelo) */}
              <path d={roasPath} fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="5,4" />

              {/* Línea horizontal del ROAS objetivo */}
              <line x1={mL} x2={mL + plotW} y1={yRoas(ROBJ)} y2={yRoas(ROBJ)} stroke="var(--good)" strokeWidth="1" strokeDasharray="3,3" />
              <text x={mL + plotW - 4} y={yRoas(ROBJ) - 4} fill="var(--good)" fontSize="10" textAnchor="end" fontWeight="600">
                ROAS objetivo {fmtRoas(ROBJ)}
              </text>

              {/* Línea horizontal en ROAS = 1 (break-even) */}
              <line x1={mL} x2={mL + plotW} y1={yRoas(1)} y2={yRoas(1)} stroke="var(--bad)" strokeWidth="0.5" strokeDasharray="2,3" opacity="0.6" />
              <text x={mL + plotW - 4} y={yRoas(1) - 4} fill="var(--bad)" fontSize="10" textAnchor="end" opacity="0.7">
                break-even (1×)
              </text>

              {/* Marcador vertical: GASTO ACTUAL */}
              <line x1={xScale(g0)} x2={xScale(g0)} y1={mT} y2={mT + plotH} stroke="var(--ink)" strokeWidth="1.5" />
              <circle cx={xScale(g0)} cy={yVentas(ventasAt(g0))} r="5" fill="var(--accent)" stroke="var(--paper)" strokeWidth="2" />
              <circle cx={xScale(g0)} cy={yRoas(R0)} r="4" fill="var(--ink)" stroke="var(--paper)" strokeWidth="2" />
              <text x={xScale(g0)} y={mT - 6} fill="var(--ink)" fontSize="11" textAnchor="middle" fontWeight="700">
                HOY
              </text>

              {/* Marcador vertical: GASTO ÓPTIMO (donde ROAS = objetivo) */}
              {gOptObj > g0 * 0.1 && gOptObj < gMax && (
                <>
                  <line x1={xScale(gOptObj)} x2={xScale(gOptObj)} y1={mT} y2={mT + plotH} stroke="var(--good)" strokeWidth="1" strokeDasharray="4,3" />
                  <text x={xScale(gOptObj)} y={mT + 12} fill="var(--good)" fontSize="10" textAnchor="middle" fontWeight="600">
                    óptimo
                  </text>
                </>
              )}

              {/* Marcador vertical: BREAK-EVEN */}
              {gBreakEven > 0 && gBreakEven < gMax && (
                <>
                  <line x1={xScale(gBreakEven)} x2={xScale(gBreakEven)} y1={mT} y2={mT + plotH} stroke="var(--bad)" strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
                  <text x={xScale(gBreakEven)} y={mT + 12} fill="var(--bad)" fontSize="10" textAnchor="middle" fontWeight="600">
                    límite
                  </text>
                </>
              )}

              {/* Eje X: ticks */}
              {xTicks.map((t, i) => (
                <g key={i}>
                  <line x1={xScale(t.g)} x2={xScale(t.g)} y1={mT + plotH} y2={mT + plotH + 4} stroke="var(--rule)" />
                  <text x={xScale(t.g)} y={mT + plotH + 16} fill="var(--muted)" fontSize="10" textAnchor="middle">
                    {t.label}
                  </text>
                  <text x={xScale(t.g)} y={mT + plotH + 30} fill="var(--muted)" fontSize="9" textAnchor="middle" opacity="0.7">
                    {fmtMoney(t.g, currency).replace(/\s/g, "")}
                  </text>
                </g>
              ))}

              {/* Eje Y izquierdo (ventas) */}
              {Array.from({ length: yVentasTicks + 1 }, (_, i) => {
                const v = (i / yVentasTicks) * ventasMax;
                const y = yVentas(v);
                return (
                  <text key={i} x={mL - 8} y={y + 3} fill="var(--accent)" fontSize="9" textAnchor="end">
                    {fmtMoney(v, currency).replace(/\s/g, "").replace(/,00$/, "")}
                  </text>
                );
              })}
              <text x={mL - 8} y={mT - 8} fill="var(--accent)" fontSize="10" textAnchor="end" fontWeight="700">
                VENTAS
              </text>

              {/* Eje Y derecho (ROAS) */}
              {Array.from({ length: yRoasTicks + 1 }, (_, i) => {
                const r = (i / yRoasTicks) * roasMax;
                const y = yRoas(r);
                return (
                  <text key={i} x={mL + plotW + 8} y={y + 3} fill="var(--ink)" fontSize="9" textAnchor="start">
                    {r.toFixed(1)}×
                  </text>
                );
              })}
              <text x={mL + plotW + 8} y={mT - 8} fill="var(--ink)" fontSize="10" textAnchor="start" fontWeight="700">
                ROAS
              </text>

              {/* Eje X borde */}
              <line x1={mL} x2={mL + plotW} y1={mT + plotH} y2={mT + plotH} stroke="var(--rule)" />
            </svg>

            {/* Puntos numéricos debajo del gráfico */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--rule)" }}>
              {escenariosCuadratico.map((e) => {
                const marginalCls =
                  e.roasMarginal >= ROBJ ? "good" :
                  e.roasMarginal >= 1 ? "warn" : "bad";
                return (
                  <div key={e.pct}>
                    <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
                      +{e.pct}% presupuesto
                    </div>
                    <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 20, fontVariantNumeric: "tabular-nums", color: "var(--accent)" }}>
                      {fmtMoney(e.v, currency)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                      ventas · <b style={{ color: "var(--good)" }}>+{fmtMoney(e.vExtra, currency)}</b>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      ROAS <b style={{ color: "var(--ink)" }}>{fmtRoas(e.r)}</b> · CAC {fmtMoney(e.cacNuevo, currency)}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span className={`pill ${marginalCls}`} style={{ fontSize: 10 }}>
                        marginal {fmtRoas(e.roasMarginal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--rule)", fontSize: 12, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5 }}>
              <b>Cómo leerlo:</b> zona verde = ROAS por encima del objetivo · amarilla = rentable pero debajo · roja = pérdida.
              Punto <b>óptimo</b> = último peso donde el ROAS sigue arriba del objetivo. <b>Límite</b> = donde recuperás lo invertido (ROAS = 1).
              Modelo cuadrático simple asumiendo saturación de audiencia — validar con test A/B real antes de escalar fuerte.
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
      <div className="footstrip">
        <span>Datos por <b>{client.nombre}</b> · Sheet <code style={{ fontSize: 11 }}>{client.sheet_id.substring(0, 12)}…</code></span>
        <span>Período comparado: <b>{period.previous?.label ?? "—"}</b></span>
        <span>Meta ROAS: <b>{fmtRoas(client.roas_objetivo)}</b> · Meta ventas: <b>{fmtMoney(client.meta_ventas, currency)}</b></span>
      </div>
    </>
  );
}
