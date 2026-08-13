import Heatmap, { type HeatmapRow } from "@/components/Heatmap";
import EmptyState from "@/components/EmptyState";
import { loadDashboard } from "@/lib/dashboard-data";
import { aggregate, detectObjetivo, groupBy2 } from "@/lib/data";
import type { PeriodKey, RawRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function uniqueSortedDates(rows: RawRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.fecha))).sort();
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

function buildRows(
  rows: RawRow[],
  entityKey: "campaign_id" | "adset_id" | "ad_id",
  nameKey: "campaign_name" | "adset_name" | "ad_name",
  parentInfo?: (r: RawRow) => string
): HeatmapRow[] {
  const grouped = groupBy2(rows, entityKey, "fecha");
  return Array.from(grouped.entries())
    .map(([id, byDate]) => {
      const sample = rows.find((r) => r[entityKey] === id)!;
      const name = sample[nameKey];
      const parent = parentInfo?.(sample);
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
            {parent && <small style={{ color: "var(--muted)", marginLeft: 6 }}>· {parent}</small>}
          </>
        ),
        cells,
        trendPct: trend(cells),
        _spend: totalSpend,
      } as HeatmapRow & { _spend: number };
    })
    .sort((a, b) => (b as any)._spend - (a as any)._spend);
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await loadDashboard(
    sp.client ?? null,
    (sp.period as PeriodKey) ?? "last30"
  );

  if (!ctx.client) return <EmptyState title="No hay clientes configurados" />;
  const { client, period, rows } = ctx;
  const currency = client.moneda;
  const dates = uniqueSortedDates(rows);
  const target = client.roas_objetivo;

  if (rows.length === 0) {
    return (
      <>
        <Header client={client.nombre} period={period.label} />
        <EmptyState title="Sin datos para este período" />
      </>
    );
  }

  const campRows = buildRows(rows, "campaign_id", "campaign_name");
  const adsetRows = buildRows(rows, "adset_id", "adset_name", (r) => r.campaign_name);
  const adRows = buildRows(rows, "ad_id", "ad_name", (r) => r.adset_name).slice(0, 15);

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
      />

      <div className="section-label">Nivel 2 · Por Conjunto</div>
      <Heatmap
        title="ROAS por conjunto · día por día"
        dates={dates}
        rows={adsetRows}
        metric="roas"
        currency={currency}
        target={target}
        metricLabel="ROAS"
      />

      <div className="section-label">Nivel 3 · Por Anuncio</div>
      <Heatmap
        title={`ROAS por anuncio · top ${adRows.length} por gasto`}
        dates={dates}
        rows={adRows}
        metric="roas"
        currency={currency}
        target={target}
        metricLabel="ROAS"
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
