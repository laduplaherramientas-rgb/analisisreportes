import { delta, fmtMoney, fmtPct, fmtRoas, fmtNum } from "@/lib/data";

type Props = {
  title: string;
  value: number;
  previous?: number;
  format: "money" | "pct" | "roas" | "num";
  currency?: string;
  status?: "good" | "warn" | "bad" | "info";
  statusLabel?: string;
  subLeft?: { label: string; value: string | number };
  subRight?: { label: string; value: string | number };
  goal?: number;
  goalPace?: number; // valor "plan a hoy" (proporcional al calendario)
  progressColor?: string;
};

function fmt(v: number, format: Props["format"], currency = "ARS"): string {
  switch (format) {
    case "money": return fmtMoney(v, currency);
    case "pct": return fmtPct(v);
    case "roas": return fmtRoas(v);
    case "num": return fmtNum(v);
  }
}

export default function KpiCard({
  title,
  value,
  previous,
  format,
  currency,
  status,
  statusLabel,
  subLeft,
  subRight,
  goal,
  goalPace,
  progressColor = "var(--accent)",
}: Props) {
  const d = previous !== undefined ? delta(value, previous) : undefined;
  const pctOfGoal = goal && goal > 0 ? Math.min(100, (value / goal) * 100) : null;
  const pctOfPace = goal && goalPace && goalPace > 0 ? Math.min(100, (goalPace / goal) * 100) : null;

  // vs plan a hoy (positivo = arriba del plan)
  const planDelta = goalPace && goalPace > 0 ? ((value - goalPace) / goalPace) * 100 : null;

  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="kpi-title">{title}</span>
        {status && statusLabel && (
          <span className={`pill ${status}`}><span className="dot"></span>{statusLabel}</span>
        )}
      </div>

      <div>
        <div className="kpi-big">{fmt(value, format, currency)}</div>
        {goalPace !== undefined && goalPace > 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            plan a hoy <b style={{ color: "var(--ink-2)" }}>{fmt(goalPace, format, currency)}</b>
            {planDelta !== null && (
              <> · <span className={`delta ${planDelta > 0 ? "up" : planDelta < 0 ? "down" : "flat"}`}>
                {planDelta > 0 ? "↑ +" : planDelta < 0 ? "↓ " : "→ "}
                {planDelta.toFixed(1)}%
              </span></>
            )}
          </div>
        )}
        {d && !goalPace && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {previous !== undefined && `vs ${fmt(previous, format, currency)} anterior · `}
            <span className={`delta ${d.direction}`}>
              {d.direction === "up" ? "↑" : d.direction === "down" ? "↓" : "→"}{" "}
              {d.pct > 0 ? "+" : ""}{d.pct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {goal !== undefined && pctOfGoal !== null && (
        <>
          <div className="progress" style={{ position: "relative" }}>
            <span
              className="real"
              style={{ width: `${pctOfGoal}%`, background: progressColor, display: "block", height: "100%", borderRadius: 3 }}
            />
            {pctOfPace !== null && (
              <span
                className="plan-tick"
                style={{
                  position: "absolute",
                  top: -4, bottom: -4,
                  left: `${pctOfPace}%`,
                  width: 2,
                  background: "var(--ink)",
                }}
              />
            )}
          </div>
          <div className="progress-legend">
            <span>0</span>
            {goalPace ? <span>Plan {fmt(goalPace, format, currency)}</span> : null}
            <span>Meta {fmt(goal, format, currency)}</span>
          </div>
        </>
      )}

      {(subLeft || subRight) && (
        <div className="kpi-sub">
          {subLeft && <span>{subLeft.label} <b>{subLeft.value}</b></span>}
          {subRight && <span>{subRight.label} <b>{subRight.value}</b></span>}
        </div>
      )}
    </div>
  );
}
