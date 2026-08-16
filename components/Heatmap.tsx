import { fmtRoas, fmtMoney, fmtNum } from "@/lib/data";

// ============================================================
// Heatmap genérico · rows = entidades, cols = fechas
// Color: escala 0 = min, 1 = max (o basada en objetivo si se pasa).
// ============================================================

export type HeatmapCell = { date: string; value: number };
export type HeatmapRow = {
  key: string;
  label: React.ReactNode;
  cells: HeatmapCell[];
  trendPct?: number;
  // Agrupamiento visual: filas con el mismo groupKey se muestran juntas bajo un header
  groupKey?: string;
  groupLabel?: React.ReactNode;
};

type Props = {
  title: string;
  dates: string[]; // columnas (fechas ordenadas)
  rows: HeatmapRow[];
  metric: "roas" | "money" | "num";
  currency?: string;
  target?: number; // valor de objetivo · usado para colorear
  metricLabel: string;
  highlightDate?: string; // resaltar esta fecha (típicamente hoy)
};

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

function colorForValue(v: number, max: number): string {
  if (v === 0) return "var(--surface-2)";
  const ratio = max > 0 ? v / max : 0;
  if (ratio >= 0.8) return "#8ECAA9";
  if (ratio >= 0.6) return "#B8DBC5";
  if (ratio >= 0.4) return "#DDEDE2";
  if (ratio >= 0.2) return "#F3E9C7";
  return "#F1DAD5";
}

function weekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()];
}

function dayNumber(dateStr: string): string {
  return dateStr.split("-")[2] ?? dateStr;
}

function fmt(v: number, metric: Props["metric"], currency = "ARS"): string {
  if (v === 0) return "";
  if (metric === "roas") return v.toFixed(1);
  if (metric === "money") return fmtMoney(v, currency).replace("$", "");
  return fmtNum(v);
}

export default function Heatmap({
  title,
  dates,
  rows,
  metric,
  currency,
  target = 5,
  metricLabel,
  highlightDate,
}: Props) {
  const allValues = rows.flatMap((r) => r.cells.map((c) => c.value));
  const max = Math.max(...allValues, 1);

  const bgFor = (v: number) =>
    metric === "roas" ? colorForRoas(v, target) : colorForValue(v, max);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <div className="heat-legend">
          <span>Peor</span>
          <span className="bar" />
          <span>Mejor</span>
          <span style={{ marginLeft: 16 }}>
            {metric === "roas"
              ? <>Objetivo <b style={{ color: "var(--ink)" }}>{fmtRoas(target)}</b></>
              : metricLabel}
          </span>
        </div>
      </div>
      <div className="heatmap-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th className="rowname" style={{ textAlign: "left", paddingLeft: 16 }}>
                {metric === "roas" ? "Entidad · ROAS" : `Entidad · ${metricLabel}`}
              </th>
              {dates.map((d) => {
                const isToday = d === highlightDate;
                return (
                  <th
                    key={d}
                    className="day"
                    style={isToday ? { color: "var(--accent)", fontWeight: 700 } : undefined}
                  >
                    {dayNumber(d)}
                    <span className="weekday">{weekday(d)}</span>
                    {isToday && <span style={{ display: "block", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>HOY</span>}
                  </th>
                );
              })}
              <th className="trend-cell" style={{ textAlign: "center" }}>Tend.</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((r, i) => {
              const prevGroup = i > 0 ? rows[i - 1].groupKey : undefined;
              const showGroupHeader = r.groupKey && r.groupKey !== prevGroup;
              const totalCols = dates.length + 2;
              const out: React.ReactElement[] = [];
              if (showGroupHeader) {
                out.push(
                  <tr key={`grp-${r.groupKey}-${i}`} className="heat-group-header">
                    <td colSpan={totalCols} style={{
                      padding: "12px 16px 8px",
                      background: "var(--surface-2)",
                      borderTop: i === 0 ? "none" : "2px solid var(--rule)",
                      fontFamily: "'Iowan Old Style', Georgia, serif",
                      fontSize: 13,
                      color: "var(--ink)",
                      letterSpacing: "0.02em",
                    }}>
                      {r.groupLabel}
                    </td>
                  </tr>
                );
              }
              out.push(
                <tr key={r.key}>
                  <td className="rowname">{r.label}</td>
                  {dates.map((d) => {
                    const c = r.cells.find((c) => c.date === d);
                    const v = c?.value ?? 0;
                    const isToday = d === highlightDate;
                    const cellStyle: React.CSSProperties = {
                      background: v > 0 ? bgFor(v) : undefined,
                    };
                    if (isToday) {
                      cellStyle.outline = "2px solid var(--accent)";
                      cellStyle.outlineOffset = "-2px";
                    }
                    return (
                      <td
                        key={d}
                        className={v === 0 ? "cell empty" : "cell"}
                        style={cellStyle}
                      >
                        {fmt(v, metric, currency)}
                      </td>
                    );
                  })}
                  <td className="trend-cell">
                    {r.trendPct !== undefined && r.trendPct !== 0 && (
                      <span
                        className={`trend ${
                          r.trendPct > 3 ? "up" : r.trendPct < -3 ? "down" : "flat"
                        }`}
                      >
                        {r.trendPct > 0 ? "↗ +" : r.trendPct < 0 ? "↘ " : "→ "}
                        {r.trendPct.toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
              return out;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
