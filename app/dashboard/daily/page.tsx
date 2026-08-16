import Heatmap, { type HeatmapRow } from "@/components/Heatmap";
import EmptyState from "@/components/EmptyState";
import { loadDashboard } from "@/lib/dashboard-data";
import { aggregate, detectObjetivo, groupBy2 } from "@/lib/data";
import type { PeriodKey, RawRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function uniqueSortedDates(rows: RawRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.fecha))).sort();
}

// Genera todas las fechas ISO entre since y until (inclusive)
function datesInRange(since: string, until: string): string[] {
  const out: string[] = [];
  const start = new Date(since + "T00:00:00");
  const end = new Date(until + "T00:00:00");
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function trend(cells: { date: string; value: number }[]): number {
  // Compara promedio últimos 3 días vs 3 previos
  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 6) return 0;
  const last3 = sorted.slice(-3);
  const prev3 = sorted.slice(-6, -3);
  const avg = (xs: typeof cells) => xs.reduce((s, x) => s + x.value, 0) / xs.length;
  const l = avg(last3);
  const p = avg(prev3);
  if (p === 0) return 0;
  return ((l - p) / p) * 100;
}

type RowWithMeta = HeatmapRow & {
  _spend: number;
  _groupSpend?: number; // gasto del grupo (para ordenar grupos completos)
};

function buildRowsFlat(
  rows: RawRow[],
  entityKey: "campaign_id" | "adset_id" | "ad_id",
  nameKey: "campaign_name" | "adset_name" | "ad_name"
): RowWithMeta[] {
  const grouped = groupBy2(rows, entityKey, "fecha");
  return Array.from(grouped.entries())
    .map(([id, byDate]) => {
      const sample = rows.find((r) => r[entityKey] === id)!;
      const name = sample[nameKey];
      const objetivo = detectObjetivo(sample.campaign_name);
      const badge = objetivo === "presentacion" ? "pre" : objetivo === "evaluacion" ? "eval" : "conv";

      const cells = Array.from(byDate.entries()).map(([date, rs]) => ({
        date,
        value: aggregate(rs).roas,
      }));
      cells.sort((a, b) => a.date.localeCompare(b.date));

      const totalSpend = rows.filter((r) => r[entityKey] === id).reduce((s, r) => s + r.gasto, 0);

      return {
        key: id,
        label: (
          <>
            <span className={`badge-type ${badge}`}>{badge.toUpperCase()}</span>
            {name}
          </>
        ),
        cells,
        trendPct: trend(cells),
        _spend: totalSpend,
      } as RowWithMeta;
    })
    .sort((a, b) => b._spend - a._spend);
}

// Construye filas de CONJUNTOS agrupadas por su campaña padre.
// Los grupos (campañas) van ordenados por gasto total del grupo, y dentro de cada
// grupo los conjuntos también por gasto — así lo importante siempre queda arriba.
function buildAdsetsGrouped(rows: RawRow[]): RowWithMeta[] {
  const byCampAdset = new Map<string, { campName: string; adsets: Map<string, RawRow[]> }>();
  for (const r of rows) {
    if (!byCampAdset.has(r.campaign_id)) {
      byCampAdset.set(r.campaign_id, { campName: r.campaign_name, adsets: new Map() });
    }
    const camp = byCampAdset.get(r.campaign_id)!;
    if (!camp.adsets.has(r.adset_id)) camp.adsets.set(r.adset_id, []);
    camp.adsets.get(r.adset_id)!.push(r);
  }

  // Convertimos y calculamos spend por grupo
  const grupos = Array.from(byCampAdset.entries()).map(([campId, camp]) => {
    const objetivo = detectObjetivo(camp.campName);
    const badge = objetivo === "presentacion" ? "pre" : objetivo === "evaluacion" ? "eval" : "conv";
    const adsetRows: RowWithMeta[] = Array.from(camp.adsets.entries()).map(([adsetId, ars]) => {
      const adsetName = ars[0].adset_name;
      const byDate = new Map<string, RawRow[]>();
      for (const r of ars) {
        if (!byDate.has(r.fecha)) byDate.set(r.fecha, []);
        byDate.get(r.fecha)!.push(r);
      }
      const cells = Array.from(byDate.entries()).map(([date, drs]) => ({
        date,
        value: aggregate(drs).roas,
      }));
      cells.sort((a, b) => a.date.localeCompare(b.date));
      const spend = ars.reduce((s, r) => s + r.gasto, 0);
      return {
        key: `${campId}::${adsetId}`,
        label: <>📦 {adsetName}</>,
        cells,
        trendPct: trend(cells),
        _spend: spend,
        groupKey: campId,
        groupLabel: (
          <>
            <span className={`badge-type ${badge}`}>{badge.toUpperCase()}</span>
            <b>{camp.campName}</b>
            <span style={{ marginLeft: 8, color: "var(--muted)", fontSize: 11, fontFamily: "system-ui", letterSpacing: 0 }}>
              · {camp.adsets.size} {camp.adsets.size === 1 ? "conjunto" : "conjuntos"}
            </span>
          </>
        ),
      } as RowWithMeta;
    }).sort((a, b) => b._spend - a._spend);
    const groupSpend = adsetRows.reduce((s, r) => s + r._spend, 0);
    return { campId, adsetRows, groupSpend };
  });

  grupos.sort((a, b) => b.groupSpend - a.groupSpend);
  return grupos.flatMap((g) => g.adsetRows);
}

// Igual pero para ANUNCIOS agrupados por conjunto padre (con la campaña arriba del nombre del conjunto)
function buildAdsGrouped(rows: RawRow[], limit = 20): RowWithMeta[] {
  const byAdset = new Map<string, { campName: string; adsetName: string; ads: Map<string, RawRow[]> }>();
  for (const r of rows) {
    if (!byAdset.has(r.adset_id)) {
      byAdset.set(r.adset_id, { campName: r.campaign_name, adsetName: r.adset_name, ads: new Map() });
    }
    const grp = byAdset.get(r.adset_id)!;
    if (!grp.ads.has(r.ad_id)) grp.ads.set(r.ad_id, []);
    grp.ads.get(r.ad_id)!.push(r);
  }

  const grupos = Array.from(byAdset.entries()).map(([adsetId, grp]) => {
    const objetivo = detectObjetivo(grp.campName);
    const badge = objetivo === "presentacion" ? "pre" : objetivo === "evaluacion" ? "eval" : "conv";
    const adRows: RowWithMeta[] = Array.from(grp.ads.entries()).map(([adId, drs]) => {
      const adName = drs[0].ad_name;
      const byDate = new Map<string, RawRow[]>();
      for (const r of drs) {
        if (!byDate.has(r.fecha)) byDate.set(r.fecha, []);
        byDate.get(r.fecha)!.push(r);
      }
      const cells = Array.from(byDate.entries()).map(([date, xrs]) => ({
        date,
        value: aggregate(xrs).roas,
      }));
      cells.sort((a, b) => a.date.localeCompare(b.date));
      const spend = drs.reduce((s, r) => s + r.gasto, 0);
      return {
        key: `${adsetId}::${adId}`,
        label: <>🎬 {adName}</>,
        cells,
        trendPct: trend(cells),
        _spend: spend,
        groupKey: adsetId,
        groupLabel: (
          <>
            <span className={`badge-type ${badge}`}>{badge.toUpperCase()}</span>
            <b>{grp.adsetName}</b>
            <span style={{ marginLeft: 8, color: "var(--muted)", fontSize: 11, fontFamily: "system-ui", letterSpacing: 0 }}>
              en {grp.campName}
            </span>
          </>
        ),
      } as RowWithMeta;
    }).sort((a, b) => b._spend - a._spend);
    const groupSpend = adRows.reduce((s, r) => s + r._spend, 0);
    return { adsetId, adRows, groupSpend };
  });

  grupos.sort((a, b) => b.groupSpend - a.groupSpend);
  // Devolvemos los top-N ads globales pero respetando el orden por grupo.
  // Marcamos los ads que entran (top por gasto global) y luego los emitimos en orden de grupo.
  const allAds = grupos.flatMap((g) => g.adRows);
  const topAdKeys = new Set(
    [...allAds].sort((a, b) => b._spend - a._spend).slice(0, limit).map((a) => a.key)
  );
  return grupos.flatMap((g) => g.adRows.filter((a) => topAdKeys.has(a.key)));
}

export default async function DailyPage({
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
  const today = todayISO();
  // Todas las fechas del período (para mostrar días sin datos con patrón rayado).
  // Aseguramos que hoy esté incluido para que el highlight se vea.
  const until = period.until >= today ? period.until : today;
  const dates = datesInRange(period.since, until);
  const target = client.roas_objetivo;

  if (rows.length === 0) {
    return (
      <>
        <Header client={client.nombre} period={period.label} />
        <EmptyState title="Sin datos para este período" />
      </>
    );
  }

  const campRows = buildRowsFlat(rows, "campaign_id", "campaign_name");
  const adsetRows = buildAdsetsGrouped(rows);
  const adRows = buildAdsGrouped(rows, 20);

  return (
    <>
      <Header client={client.nombre} period={period.label} />

      <div className="section-label">Nivel 1 · Por Campaña</div>
      <Heatmap
        title="ROAS por campaña · día por día"
        dates={dates}
        rows={campRows}
        metric="roas"
        currency={currency}
        target={target}
        metricLabel="ROAS"
        highlightDate={today}
      />

      <div className="section-label">Nivel 2 · Por Conjunto (agrupado por campaña)</div>
      <Heatmap
        title="ROAS por conjunto · agrupado por campaña padre"
        dates={dates}
        rows={adsetRows}
        metric="roas"
        currency={currency}
        target={target}
        metricLabel="ROAS"
        highlightDate={today}
      />

      <div className="section-label">Nivel 3 · Por Anuncio (agrupado por conjunto)</div>
      <Heatmap
        title={`ROAS por anuncio · top ${adRows.length} por gasto · agrupados por conjunto padre`}
        dates={dates}
        rows={adRows}
        metric="roas"
        currency={currency}
        target={target}
        metricLabel="ROAS"
        highlightDate={today}
      />

      <div className="footstrip">
        <span>Color según distancia al ROAS objetivo · <b>{target.toFixed(2)}x</b> = neutro</span>
        <span>Tendencia = promedio 3 últimos días vs 3 anteriores</span>
      </div>
    </>
  );
}

function Header({ client, period }: { client: string; period: string }) {
  return (
    <header className="view-head">
      <div>
        <div className="eyebrow">{client} · {period}</div>
        <h1>Rendimiento diario por campaña, conjunto y anuncio</h1>
      </div>
      <div className="view-right">
        <div className="caption">Verde = por encima del objetivo · Rojo = por debajo</div>
      </div>
    </header>
  );
}
