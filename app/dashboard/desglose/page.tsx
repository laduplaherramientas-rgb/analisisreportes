import EmptyState from "@/components/EmptyState";
import { loadDashboard } from "@/lib/dashboard-data";
import {
  aggregate,
  derivedMetrics,
  detectObjetivo,
  fmtMoney,
  fmtNum,
  fmtRoas,
  groupBy,
} from "@/lib/data";
import type { PeriodKey, RawRow } from "@/lib/types";
import type { Objetivo as ObjT } from "@/lib/data";

export const dynamic = "force-dynamic";

const OBJ_META: Record<ObjT, { num: string; label: string; hint: string; accent: string }> = {
  presentacion: {
    num: "1",
    label: "Presentación",
    hint: "optimiza por visitas al sitio · construye audiencia · ROAS moderado",
    accent: "var(--info)",
  },
  evaluacion: {
    num: "2",
    label: "Evaluación",
    hint: "optimiza por Add to Cart + Checkout · ya te conocen · ROAS medio-alto",
    accent: "var(--warn)",
  },
  conversion: {
    num: "3",
    label: "Conversión",
    hint: "optimiza 100% por compras · pixel busca compradores · ROAS más alto",
    accent: "var(--good)",
  },
};

type Ad = { id: string; name: string; rows: RawRow[] };
type Adset = { id: string; name: string; rows: RawRow[]; ads: Ad[] };
type Camp = { id: string; name: string; objetivo: ObjT; rows: RawRow[]; adsets: Adset[] };

export default async function DesglosePage({
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
  const { client, period, rows } = ctx;
  const currency = client.moneda;

  if (rows.length === 0) {
    return (
      <>
        <Header client={client} period={period.label} />
        <EmptyState title="Sin datos para este período" />
      </>
    );
  }

  const byCamp = groupBy(rows, "campaign_id");
  const campaigns: Camp[] = Array.from(byCamp.entries()).map(([id, crs]) => {
    const name = crs[0]?.campaign_name ?? id;
    const objetivo = detectObjetivo(name);
    const byAdset = groupBy(crs, "adset_id");
    const adsets: Adset[] = Array.from(byAdset.entries()).map(([aid, ars]) => {
      const aname = ars[0]?.adset_name ?? aid;
      const byAd = groupBy(ars, "ad_id");
      const ads: Ad[] = Array.from(byAd.entries()).map(([adid, drs]) => ({
        id: adid,
        name: drs[0]?.ad_name ?? adid,
        rows: drs,
      }));
      return { id: aid, name: aname, rows: ars, ads };
    });
    return { id, name, objetivo, rows: crs, adsets };
  });

  const objBuckets: Record<ObjT, Camp[]> = {
    presentacion: [],
    evaluacion: [],
    conversion: [],
  };
  for (const c of campaigns) objBuckets[c.objetivo].push(c);

  const totalCampaigns = campaigns.length;
  const totalAdsets = campaigns.reduce((s, c) => s + c.adsets.length, 0);
  const totalAds = campaigns.reduce((s, c) => s + c.adsets.reduce((ss, a) => ss + a.ads.length, 0), 0);

  return (
    <>
      <Header client={client} period={period.label} />

      <div className="callout info" style={{ marginBottom: 24 }}>
        <span className="icon">i</span>
        <span>
          <b>{totalCampaigns}</b> campañas · <b>{totalAdsets}</b> conjuntos · <b>{totalAds}</b> anuncios.
          Cada bloque muestra las métricas relevantes según el objetivo de campaña.
        </span>
      </div>

      {(["presentacion", "evaluacion", "conversion"] as ObjT[]).map((obj) => {
        const camps = objBuckets[obj];
        if (camps.length === 0) return null;
        return (
          <ObjetivoSection
            key={obj}
            objetivo={obj}
            campaigns={camps}
            currency={currency}
            roasObjetivo={client.roas_objetivo}
          />
        );
      })}
    </>
  );
}

function Header({ client, period }: { client: { nombre: string }; period: string }) {
  return (
    <header className="view-head">
      <div>
        <div className="eyebrow">{client.nombre} · {period}</div>
        <h1>Desglose por campaña, conjunto y anuncio</h1>
      </div>
      <div className="view-right">
        <div className="caption">Métricas diferentes según objetivo · presentación mide tráfico · conversión mide ventas</div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Sección por objetivo · tabla con columnas específicas
// ═══════════════════════════════════════════════════════════════════════
function ObjetivoSection({
  objetivo,
  campaigns,
  currency,
  roasObjetivo,
}: {
  objetivo: ObjT;
  campaigns: Camp[];
  currency: string;
  roasObjetivo: number;
}) {
  const meta = OBJ_META[objetivo];
  const allRows = campaigns.flatMap((c) => c.rows);
  const objAgg = aggregate(allRows);
  const objDer = derivedMetrics(allRows);
  const isTraffic = objetivo === "presentacion";

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${meta.accent}` }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28, height: 28,
          borderRadius: 14,
          background: meta.accent,
          color: "var(--paper)",
          fontFamily: "'Iowan Old Style', Georgia, serif",
          fontWeight: 700,
          fontSize: 14,
        }}>{meta.num}</span>
        <h2 style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 22, margin: 0 }}>
          {meta.label}
        </h2>
        <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
          {meta.hint}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          {campaigns.length} campañas · {campaigns.reduce((s, c) => s + c.adsets.length, 0)} conjuntos
        </span>
      </div>

      {/* Resumen KPI del objetivo */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isTraffic ? "repeat(4, 1fr)" : "repeat(6, 1fr)",
        gap: 16,
        padding: "16px 20px",
        background: "var(--surface-2)",
        borderRadius: 6,
        marginBottom: 12,
      }}>
        {isTraffic ? (
          <>
            <SumCard label="Inversión" value={fmtMoney(objAgg.gasto, currency)} />
            <SumCard label="Visitas a la web" value={fmtNum(objAgg.visitas_pagina)} accent={meta.accent} />
            <SumCard label="CTR promedio" value={`${objDer.ctr.toFixed(2)}%`} />
            <SumCard label="CPM estimado" value={fmtMoney(objDer.cpm, currency)} />
          </>
        ) : (
          <>
            <SumCard label="Inversión" value={fmtMoney(objAgg.gasto, currency)} />
            <SumCard label="Ventas" value={fmtMoney(objAgg.ventas, currency)} />
            <SumCard label="ROAS" value={fmtRoas(objAgg.roas)} accent={objAgg.roas >= roasObjetivo ? "var(--good)" : "var(--warn)"} />
            <SumCard label="Compras" value={fmtNum(objAgg.compras)} accent={meta.accent} />
            <SumCard label="Ticket" value={objAgg.compras > 0 ? fmtMoney(objAgg.ticket, currency) : "—"} />
            <SumCard label="CTR · CPM" value={`${objDer.ctr.toFixed(2)}% · ${fmtMoney(objDer.cpm, currency)}`} />
          </>
        )}
      </div>

      {/* Tabla con columnas del objetivo */}
      <div className="panel" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              {isTraffic ? <HeaderTraffic /> : <HeaderConversion />}
            </thead>
            <tbody>
              {campaigns.map((camp) => (
                <CampaignBlock
                  key={camp.id}
                  camp={camp}
                  currency={currency}
                  isTraffic={isTraffic}
                  roasObjetivo={roasObjetivo}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SumCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 18, fontVariantNumeric: "tabular-nums", color: accent ?? "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Headers de tabla · diferentes por objetivo
// ═══════════════════════════════════════════════════════════════════════
function HeaderTraffic() {
  return (
    <tr>
      <th style={{ width: "32%" }}>Nombre</th>
      <th>Gasto</th>
      <th>Visitas web</th>
      <th>CPV</th>
      <th>CTR</th>
      <th>CPM</th>
      <th>Frec.</th>
    </tr>
  );
}

function HeaderConversion() {
  return (
    <tr>
      <th style={{ width: "26%" }}>Nombre</th>
      <th>Gasto</th>
      <th>Visitas</th>
      <th>ATC</th>
      <th>Checkout</th>
      <th>Compras</th>
      <th>ROAS</th>
      <th>CTR</th>
      <th>CPM</th>
      <th>Frec.</th>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Bloque de campaña + adsets + ads
// ═══════════════════════════════════════════════════════════════════════
function CampaignBlock({
  camp, currency, isTraffic, roasObjetivo,
}: {
  camp: Camp;
  currency: string;
  isTraffic: boolean;
  roasObjetivo: number;
}) {
  const trs: React.ReactElement[] = [];
  trs.push(
    <MetricRow
      key={`c-${camp.id}`}
      cls="row-campaign"
      name={<><span className="badge-type conv">{isTraffic ? "PRE" : "CAMP"}</span>{camp.name}</>}
      rows={camp.rows}
      currency={currency}
      isTraffic={isTraffic}
      roasObjetivo={roasObjetivo}
    />
  );
  for (const a of camp.adsets) {
    trs.push(
      <MetricRow
        key={`as-${a.id}`}
        cls="row-adset"
        name={<>📦 {a.name}</>}
        rows={a.rows}
        currency={currency}
        isTraffic={isTraffic}
        roasObjetivo={roasObjetivo}
      />
    );
    for (const ad of a.ads) {
      trs.push(
        <MetricRow
          key={`ad-${ad.id}`}
          cls="row-ad"
          name={<>🎬 {ad.name}</>}
          rows={ad.rows}
          currency={currency}
          isTraffic={isTraffic}
          roasObjetivo={roasObjetivo}
        />
      );
    }
  }
  return <>{trs}</>;
}

function MetricRow({
  cls, name, rows, currency, isTraffic, roasObjetivo,
}: {
  cls: string;
  name: React.ReactNode;
  rows: RawRow[];
  currency: string;
  isTraffic: boolean;
  roasObjetivo: number;
}) {
  const agg = aggregate(rows);
  const der = derivedMetrics(rows);
  const cpv = agg.visitas_pagina > 0 ? agg.gasto / agg.visitas_pagina : 0;

  if (isTraffic) {
    return (
      <tr className={cls}>
        <td className="name">{name}</td>
        <td>{fmtMoney(agg.gasto, currency)}</td>
        <td className="strong">{fmtNum(agg.visitas_pagina)}</td>
        <td>{cpv > 0 ? fmtMoney(cpv, currency) : "—"}</td>
        <td>{der.ctr > 0 ? `${der.ctr.toFixed(2)}%` : "—"}</td>
        <td>{der.cpm > 0 ? fmtMoney(der.cpm, currency) : "—"}</td>
        <td>{agg.frecuencia > 0 ? agg.frecuencia.toFixed(2) : "—"}</td>
      </tr>
    );
  }

  // Conversion / Evaluación
  const roasCls = agg.roas >= roasObjetivo ? "strong" : "";
  return (
    <tr className={cls}>
      <td className="name">{name}</td>
      <td>{fmtMoney(agg.gasto, currency)}</td>
      <td>{fmtNum(agg.visitas_pagina)}</td>
      <td>{fmtNum(agg.agregados_carrito)}</td>
      <td>{fmtNum(agg.pagos_iniciados)}</td>
      <td className="strong">{fmtNum(agg.compras)}</td>
      <td className={roasCls}>{agg.gasto > 0 ? fmtRoas(agg.roas) : "—"}</td>
      <td>{der.ctr > 0 ? `${der.ctr.toFixed(2)}%` : "—"}</td>
      <td>{der.cpm > 0 ? fmtMoney(der.cpm, currency) : "—"}</td>
      <td>{agg.frecuencia > 0 ? agg.frecuencia.toFixed(2) : "—"}</td>
    </tr>
  );
}
