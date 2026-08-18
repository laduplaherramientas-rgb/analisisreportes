import EmptyState from "@/components/EmptyState";
import { loadDashboard } from "@/lib/dashboard-data";
import {
  aggregate,
  derivedMetrics,
  detectObjetivo,
  fmtMoney,
  fmtNum,
  groupBy,
} from "@/lib/data";
import type { PeriodKey } from "@/lib/types";
import type { Objetivo as ObjT } from "@/lib/data";

export const dynamic = "force-dynamic";

// Benchmarks orientativos para e-commerce (ajustar por vertical)
const BENCH = {
  ctr_enlace: { good: 1.5, warn: 0.8 },       // %
  clic_a_visita: { good: 85, warn: 65 },      // % (mide cuánto del clic realmente carga la web)
  visita_a_atc: { good: 8, warn: 4 },         // %
  atc_a_checkout: { good: 55, warn: 35 },     // %
  checkout_a_compra: { good: 55, warn: 30 },  // %
  visita_a_compra: { good: 2.5, warn: 1 },    // % (tasa global sitio)
};

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return (num / den) * 100;
}

function statusPct(v: number, b: { good: number; warn: number }): "good" | "warn" | "bad" {
  if (v >= b.good) return "good";
  if (v >= b.warn) return "warn";
  return "bad";
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await loadDashboard(
    sp.client ?? null,
    (sp.period as PeriodKey) ?? "thisMonth"
  );

  if (!ctx.client) return <EmptyState title="No hay clientes configurados" />;
  const { client, period, rows, rowsPrev } = ctx;
  const currency = client.moneda;

  if (rows.length === 0) {
    return (
      <>
        <Header client={client.nombre} period={period.label} />
        <EmptyState title="Sin datos para este período" hint="Cambiá el filtro de período." />
      </>
    );
  }

  const agg = aggregate(rows);
  const der = derivedMetrics(rows);
  const aggPrev = aggregate(rowsPrev);
  const derPrev = derivedMetrics(rowsPrev);

  // Embudo actual
  const impresiones = der.impresiones;
  const clicks = der.clicks;
  const visitas = agg.visitas_pagina;
  const atc = agg.agregados_carrito;
  const checkout = agg.pagos_iniciados;
  const compras = agg.compras;

  // Tasas
  const ctrEnlace = pct(clicks, impresiones); // % — usa CTR ponderado real de las filas
  const clicAVisita = pct(visitas, clicks);
  const visitaAAtc = pct(atc, visitas);
  const atcACheckout = pct(checkout, atc);
  const checkoutACompra = pct(compras, checkout);
  const visitaACompra = pct(compras, visitas);
  const conversionTotal = pct(compras, clicks); // clicks → compras (tasa conversión del anuncio)

  // Costos
  const cpv = visitas > 0 ? agg.gasto / visitas : 0;      // costo por visita
  const cpAtc = atc > 0 ? agg.gasto / atc : 0;             // costo por add to cart
  const cpCheckout = checkout > 0 ? agg.gasto / checkout : 0; // costo por pago iniciado
  const cpCompra = compras > 0 ? agg.gasto / compras : 0;  // CPA
  const cpc = der.cpc;
  const cpm = der.cpm;

  // Período anterior — deltas
  const visitasPrev = aggPrev.visitas_pagina;
  const clicksPrev = derPrev.clicks;
  const atcPrev = aggPrev.agregados_carrito;
  const checkoutPrev = aggPrev.pagos_iniciados;
  const comprasPrev = aggPrev.compras;

  const visitaAAtcPrev = pct(atcPrev, visitasPrev);
  const atcACheckoutPrev = pct(checkoutPrev, atcPrev);
  const checkoutACompraPrev = pct(comprasPrev, checkoutPrev);
  const visitaACompraPrev = pct(comprasPrev, visitasPrev);
  const clicAVisitaPrev = pct(visitasPrev, clicksPrev);

  const maxCount = Math.max(impresiones, clicks, visitas, atc, checkout, compras, 1);

  // Embudo desglosado por objetivo — típicamente sólo Evaluación/Conversión tienen sentido
  const byCamp = groupBy(rows, "campaign_id");
  const objList: ObjT[] = ["presentacion", "evaluacion", "conversion"];
  const objData = objList.map((obj) => {
    const campIds = Array.from(byCamp.entries())
      .filter(([, crs]) => detectObjetivo(crs[0]?.campaign_name ?? "") === obj)
      .map(([id]) => id);
    if (campIds.length === 0) return null;
    const objRows = rows.filter((r) => campIds.includes(r.campaign_id));
    const oAgg = aggregate(objRows);
    const oDer = derivedMetrics(objRows);
    return { obj, oAgg, oDer, campCount: campIds.length };
  }).filter(Boolean) as Array<{
    obj: ObjT; oAgg: ReturnType<typeof aggregate>;
    oDer: ReturnType<typeof derivedMetrics>; campCount: number;
  }>;

  return (
    <>
      <Header client={client.nombre} period={period.label} />

      <div className="callout info" style={{ marginBottom: 24 }}>
        <span className="icon">i</span>
        <span>
          Este es el embudo <b>Anuncio → Compra</b>. Cada paso muestra cuánta gente pasó al siguiente y qué % se perdió en el camino.
          Ideal para saber <b>dónde</b> se está fugando la conversión.
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Embudo visual */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="section-label">Embudo del período · {period.label}</div>
      <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FunnelStep
            label="Impresiones"
            count={impresiones}
            max={maxCount}
            hint="cuánta gente vio el anuncio (aprox)"
            color="var(--muted)"
          />
          <FunnelStep
            label="Clicks"
            count={clicks}
            max={maxCount}
            hint={`CTR ${ctrEnlace.toFixed(2)}% · costo por clic ${fmtMoney(cpc, currency)}`}
            statusPill={{ label: `${ctrEnlace.toFixed(2)}% CTR`, cls: statusPct(ctrEnlace, BENCH.ctr_enlace) }}
            color="var(--info)"
          />
          <FunnelStep
            label="Visitas a la web"
            count={visitas}
            max={maxCount}
            hint={`${clicAVisita.toFixed(1)}% de los clicks realmente cargaron la landing · costo por visita ${fmtMoney(cpv, currency)}`}
            statusPill={{ label: `${clicAVisita.toFixed(0)}% clic→visita`, cls: statusPct(clicAVisita, BENCH.clic_a_visita) }}
            delta={{ prev: visitasPrev }}
            color="var(--accent)"
          />
          <FunnelStep
            label="Agregados al carrito"
            count={atc}
            max={maxCount}
            hint={`${visitaAAtc.toFixed(1)}% de las visitas agregó · costo por ATC ${fmtMoney(cpAtc, currency)}`}
            statusPill={{ label: `${visitaAAtc.toFixed(1)}% visita→ATC`, cls: statusPct(visitaAAtc, BENCH.visita_a_atc) }}
            delta={{ prev: atcPrev }}
            color="var(--warn)"
          />
          <FunnelStep
            label="Pagos iniciados (checkout)"
            count={checkout}
            max={maxCount}
            hint={`${atcACheckout.toFixed(1)}% de los ATC llegó al checkout · costo por checkout ${fmtMoney(cpCheckout, currency)}`}
            statusPill={{ label: `${atcACheckout.toFixed(0)}% ATC→checkout`, cls: statusPct(atcACheckout, BENCH.atc_a_checkout) }}
            delta={{ prev: checkoutPrev }}
            color="#D97706"
          />
          <FunnelStep
            label="Compras"
            count={compras}
            max={maxCount}
            hint={`${checkoutACompra.toFixed(1)}% del checkout compró · CPA ${fmtMoney(cpCompra, currency)}`}
            statusPill={{ label: `${checkoutACompra.toFixed(0)}% checkout→compra`, cls: statusPct(checkoutACompra, BENCH.checkout_a_compra) }}
            delta={{ prev: comprasPrev }}
            color="var(--good)"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Tasas de conversión resumidas */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="section-label">Tasas de conversión entre etapas</div>
      <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          <RateCard
            title="Clic → Visita"
            value={clicAVisita}
            prev={clicAVisitaPrev}
            bench={BENCH.clic_a_visita}
            hint="qué % de los clicks llega realmente a cargar la landing"
          />
          <RateCard
            title="Visita → Carrito"
            value={visitaAAtc}
            prev={visitaAAtcPrev}
            bench={BENCH.visita_a_atc}
            hint="qué % de los visitantes agrega algo al carrito"
          />
          <RateCard
            title="Carrito → Checkout"
            value={atcACheckout}
            prev={atcACheckoutPrev}
            bench={BENCH.atc_a_checkout}
            hint="qué % de los que agregaron al carrito inició el pago"
          />
          <RateCard
            title="Checkout → Compra"
            value={checkoutACompra}
            prev={checkoutACompraPrev}
            bench={BENCH.checkout_a_compra}
            hint="qué % de los que iniciaron el pago efectivamente compró"
          />
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--rule)", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          <RateCard
            title="Tasa de conversión global (Visita → Compra)"
            value={visitaACompra}
            prev={visitaACompraPrev}
            bench={BENCH.visita_a_compra}
            hint="qué % de los visitantes terminó comprando · métrica clave del sitio"
            big
          />
          <RateCard
            title="Conversión Ad → Compra (Click → Compra)"
            value={conversionTotal}
            prev={pct(comprasPrev, clicksPrev)}
            bench={{ good: 2, warn: 0.7 }}
            hint="qué % de los que hicieron clic al anuncio compró"
            big
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Costos por evento */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="section-label">Costos por evento</div>
      <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          <CostCard label="Costo por mil impresiones (CPM)" value={fmtMoney(cpm, currency)} sub="cuánto cuesta llegar a 1.000 personas" />
          <CostCard label="Costo por clic (CPC)" value={fmtMoney(cpc, currency)} sub="promedio ponderado por gasto" />
          <CostCard label="Costo por visita a la web (CPV)" value={fmtMoney(cpv, currency)} sub={`gasto / ${fmtNum(visitas)} visitas`} accent="var(--accent)" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 16, paddingTop: 16, borderTop: "1px dashed var(--rule)" }}>
          <CostCard label="Costo por agregado al carrito" value={fmtMoney(cpAtc, currency)} sub={`gasto / ${fmtNum(atc)} ATC`} accent="var(--warn)" />
          <CostCard label="Costo por pago iniciado" value={fmtMoney(cpCheckout, currency)} sub={`gasto / ${fmtNum(checkout)} checkouts`} accent="#D97706" />
          <CostCard label="Costo por compra (CPA)" value={fmtMoney(cpCompra, currency)} sub={`gasto / ${fmtNum(compras)} compras`} accent="var(--good)" big />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Embudo por objetivo de campaña */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {objData.length > 0 && (
        <>
          <div className="section-label">Embudo por objetivo de campaña</div>
          <div className="panel" style={{ padding: 0, marginBottom: 20 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "18%" }}>Objetivo</th>
                    <th>Gasto</th>
                    <th>Visitas</th>
                    <th>V→ATC</th>
                    <th>ATC</th>
                    <th>ATC→Checkout</th>
                    <th>Checkout</th>
                    <th>Chk→Compra</th>
                    <th>Compras</th>
                    <th>V→Compra</th>
                    <th>CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {objData.map(({ obj, oAgg, campCount }) => {
                    const label = obj === "presentacion" ? "1 · Presentación" : obj === "evaluacion" ? "2 · Evaluación" : "3 · Conversión";
                    const v2a = pct(oAgg.agregados_carrito, oAgg.visitas_pagina);
                    const a2c = pct(oAgg.pagos_iniciados, oAgg.agregados_carrito);
                    const c2p = pct(oAgg.compras, oAgg.pagos_iniciados);
                    const v2p = pct(oAgg.compras, oAgg.visitas_pagina);
                    const cpa = oAgg.compras > 0 ? oAgg.gasto / oAgg.compras : 0;
                    return (
                      <tr key={obj}>
                        <td className="name"><b>{label}</b> <small style={{ color: "var(--muted)" }}>· {campCount} camp.</small></td>
                        <td>{fmtMoney(oAgg.gasto, currency)}</td>
                        <td>{fmtNum(oAgg.visitas_pagina)}</td>
                        <td>{v2a > 0 ? `${v2a.toFixed(1)}%` : "—"}</td>
                        <td>{fmtNum(oAgg.agregados_carrito)}</td>
                        <td>{a2c > 0 ? `${a2c.toFixed(0)}%` : "—"}</td>
                        <td>{fmtNum(oAgg.pagos_iniciados)}</td>
                        <td>{c2p > 0 ? `${c2p.toFixed(0)}%` : "—"}</td>
                        <td className="strong">{fmtNum(oAgg.compras)}</td>
                        <td>{v2p > 0 ? `${v2p.toFixed(2)}%` : "—"}</td>
                        <td>{cpa > 0 ? fmtMoney(cpa, currency) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="footstrip">
        <span>Semáforos según benchmarks orientativos de e-commerce · ajustables por vertical</span>
        <span>Impresiones y CTR estimados a partir de Gasto/CPC/CTR de Meta cuando el sheet no trae impresiones directas</span>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Componentes
// ═══════════════════════════════════════════════════════════════════════
function Header({ client, period }: { client: string; period: string }) {
  return (
    <header className="view-head">
      <div>
        <div className="eyebrow">{client} · {period}</div>
        <h1>% de Conversión · Embudo</h1>
      </div>
      <div className="view-right">
        <div className="caption">Anuncio → Compra · dónde se fuga cada persona</div>
      </div>
    </header>
  );
}

function FunnelStep({
  label, count, max, hint, statusPill, delta, color,
}: {
  label: string;
  count: number;
  max: number;
  hint?: string;
  statusPill?: { label: string; cls: "good" | "warn" | "bad" };
  delta?: { prev: number };
  color?: string;
}) {
  const width = max > 0 ? (count / max) * 100 : 0;
  const deltaPct = delta && delta.prev > 0 ? ((count - delta.prev) / delta.prev) * 100 : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 }}>
            {label}
          </span>
          {statusPill && (
            <span className={`pill ${statusPill.cls}`} style={{ fontSize: 10 }}>{statusPill.label}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          {deltaPct !== null && (
            <span className={`delta ${deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat"}`} style={{ fontSize: 11 }}>
              {deltaPct > 0 ? "↑ +" : deltaPct < 0 ? "↓ " : "→ "}{deltaPct.toFixed(0)}%
            </span>
          )}
          <span style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 22, fontVariantNumeric: "tabular-nums", color: color ?? "var(--ink)" }}>
            {fmtNum(count)}
          </span>
        </div>
      </div>
      <div style={{ height: 28, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${width}%`, height: "100%", background: color ?? "var(--accent)", opacity: 0.85, transition: "width 300ms" }} />
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>{hint}</div>
      )}
    </div>
  );
}

function RateCard({
  title, value, prev, bench, hint, big,
}: {
  title: string;
  value: number;
  prev?: number;
  bench: { good: number; warn: number };
  hint?: string;
  big?: boolean;
}) {
  const cls = statusPct(value, bench);
  const deltaPct = prev && prev > 0 ? value - prev : null;
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: big ? 30 : 22, fontVariantNumeric: "tabular-nums", color: cls === "good" ? "var(--good)" : cls === "warn" ? "var(--warn)" : "var(--bad)" }}>
        {value > 0 ? `${value.toFixed(2)}%` : "—"}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
        <span className={`pill ${cls}`} style={{ fontSize: 10 }}>
          {cls === "good" ? "óptimo" : cls === "warn" ? "aceptable" : "bajo"}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          benchmark ≥ {bench.good}%
        </span>
        {deltaPct !== null && Math.abs(deltaPct) > 0.05 && (
          <span className={`delta ${deltaPct > 0 ? "up" : "down"}`} style={{ fontSize: 11 }}>
            {deltaPct > 0 ? "↑ +" : "↓ "}{deltaPct.toFixed(1)}pp
          </span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, fontStyle: "italic", lineHeight: 1.4 }}>{hint}</div>
      )}
    </div>
  );
}

function CostCard({
  label, value, sub, accent, big,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  big?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: big ? 26 : 20, fontVariantNumeric: "tabular-nums", color: accent ?? "var(--ink)" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}
