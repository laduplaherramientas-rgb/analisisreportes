"use client";

import { useMemo, useState } from "react";
import { fmtMoney, fmtRoas } from "@/lib/data";

type Props = {
  g0: number;             // gasto proyectado actual (base)
  R0: number;             // ROAS proyectado actual
  ROBJ: number;           // ROAS objetivo del cliente
  CAC0: number;           // CAC actual
  ticket: number;         // ticket promedio (para calcular compras)
  currency: string;
  lastUpdate?: string;    // fecha de la última fila de data
};

export default function SaturationChart({
  g0, R0, ROBJ, CAC0, ticket, currency, lastUpdate,
}: Props) {
  // Estado del slider: multiplicador del gasto base (1 = actual)
  const [mult, setMult] = useState(1);

  // Modelo cuadrático:
  //   ventas(g) = a·g − b·g²
  //   ROAS(g)   = a − b·g   (recta decreciente)
  // Calibración: en g = 2·g0 asumimos ROAS = 0.7·R0
  const a = 1.3 * R0;
  const b = (0.3 * R0) / Math.max(1, g0);

  const roasAt = (g: number) => Math.max(0, a - b * g);
  const ventasAt = (g: number) => Math.max(0, a * g - b * g * g);

  const gOptObj = a > ROBJ ? (a - ROBJ) / b : 0;
  const gBreakEven = a > 1 ? (a - 1) / b : 0;
  const gVertex = a / (2 * b);
  const gMax = Math.max(g0 * 2.5, gBreakEven * 1.05);

  // Dimensiones SVG
  const W = 820, H = 340;
  const mL = 70, mR = 70, mT = 24, mB = 48;
  const plotW = W - mL - mR;
  const plotH = H - mT - mB;

  const ventasMax = ventasAt(Math.min(gVertex, gMax)) * 1.08;
  const roasMax = Math.max(R0 * 1.3, a);

  const xScale = (g: number) => mL + (g / gMax) * plotW;
  const yVentas = (v: number) => mT + plotH - (v / ventasMax) * plotH;
  const yRoas = (r: number) => mT + plotH - (r / roasMax) * plotH;

  const { ventasPath, roasPath, ventasArea } = useMemo(() => {
    const N = 80;
    const pts = Array.from({ length: N + 1 }, (_, i) => {
      const g = (i / N) * gMax;
      return { g, v: ventasAt(g), r: roasAt(g) };
    });
    const vp = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.g).toFixed(1)},${yVentas(p.v).toFixed(1)}`).join(" ");
    const rp = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.g).toFixed(1)},${yRoas(p.r).toFixed(1)}`).join(" ");
    const va = `${vp} L${xScale(gMax).toFixed(1)},${(mT + plotH).toFixed(1)} L${xScale(0).toFixed(1)},${(mT + plotH).toFixed(1)} Z`;
    return { ventasPath: vp, roasPath: rp, ventasArea: va };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g0, R0]);

  // Valores del punto simulado
  const gSim = g0 * mult;
  const vSim = ventasAt(gSim);
  const rSim = roasAt(gSim);
  const vExtra = vSim - ventasAt(g0);
  const gExtra = gSim - g0;
  const roasMarginal = gExtra !== 0 ? vExtra / gExtra : rSim;
  const cacSim = vSim > 0 && ticket > 0 ? gSim / (vSim / ticket) : CAC0;
  const comprasSim = ticket > 0 ? Math.round(vSim / ticket) : 0;

  const marginalCls =
    roasMarginal >= ROBJ ? "good" :
    roasMarginal >= 1 ? "warn" : "bad";

  const xTicks = [0, 0.5, 1, 1.5, 2, 2.5]
    .map((m) => ({ g: g0 * m, label: m === 1 ? "actual" : `${m}×` }))
    .filter((t) => t.g <= gMax);

  return (
    <div>
      {/* Slider */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "center", marginBottom: 20, padding: "16px 20px", background: "var(--surface-2)", borderRadius: 6 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>
            Simulá el ajuste de presupuesto
          </div>
          <input
            type="range"
            min={-20}
            max={150}
            step={5}
            value={Math.round((mult - 1) * 100)}
            onChange={(e) => setMult(1 + parseInt(e.target.value, 10) / 100)}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
            <span>−20%</span>
            <span>Actual</span>
            <span>+50%</span>
            <span>+100%</span>
            <span>+150%</span>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 120 }}>
          <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 32, fontVariantNumeric: "tabular-nums", color: "var(--accent)", lineHeight: 1 }}>
            {mult >= 1 ? "+" : ""}{Math.round((mult - 1) * 100)}%
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            gasto: {fmtMoney(gSim, currency)}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Zonas de fondo */}
        {gOptObj > 0 && gOptObj <= gMax && (
          <rect x={mL} y={mT} width={xScale(gOptObj) - mL} height={plotH} fill="var(--good)" opacity="0.07" />
        )}
        {gBreakEven > gOptObj && gBreakEven <= gMax && (
          <rect x={xScale(Math.max(gOptObj, 0))} y={mT} width={xScale(gBreakEven) - xScale(Math.max(gOptObj, 0))} height={plotH} fill="var(--warn)" opacity="0.07" />
        )}
        {gBreakEven < gMax && (
          <rect x={xScale(gBreakEven)} y={mT} width={xScale(gMax) - xScale(gBreakEven)} height={plotH} fill="var(--bad)" opacity="0.07" />
        )}

        {/* Grid horizontal */}
        {Array.from({ length: 6 }, (_, i) => {
          const y = mT + (i / 5) * plotH;
          return <line key={i} x1={mL} x2={mL + plotW} y1={y} y2={y} stroke="var(--rule)" strokeWidth="0.5" strokeDasharray="2,3" />;
        })}

        {/* Área bajo curva de ventas */}
        <path d={ventasArea} fill="var(--accent)" opacity="0.08" />
        {/* Curva ventas */}
        <path d={ventasPath} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        {/* Curva ROAS */}
        <path d={roasPath} fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="5,4" />

        {/* Línea ROAS objetivo */}
        <line x1={mL} x2={mL + plotW} y1={yRoas(ROBJ)} y2={yRoas(ROBJ)} stroke="var(--good)" strokeWidth="1" strokeDasharray="3,3" />
        <text x={mL + plotW - 4} y={yRoas(ROBJ) - 4} fill="var(--good)" fontSize="10" textAnchor="end" fontWeight="600">
          ROAS objetivo {fmtRoas(ROBJ)}
        </text>

        {/* Línea break-even */}
        <line x1={mL} x2={mL + plotW} y1={yRoas(1)} y2={yRoas(1)} stroke="var(--bad)" strokeWidth="0.5" strokeDasharray="2,3" opacity="0.6" />
        <text x={mL + plotW - 4} y={yRoas(1) - 4} fill="var(--bad)" fontSize="10" textAnchor="end" opacity="0.7">
          break-even (1×)
        </text>

        {/* Marcador HOY (fijo) */}
        <line x1={xScale(g0)} x2={xScale(g0)} y1={mT} y2={mT + plotH} stroke="var(--ink)" strokeWidth="1.5" opacity="0.4" />
        <circle cx={xScale(g0)} cy={yVentas(ventasAt(g0))} r="4" fill="var(--ink)" opacity="0.4" />
        <text x={xScale(g0)} y={mT - 8} fill="var(--ink)" fontSize="10" textAnchor="middle" opacity="0.6">
          HOY
        </text>

        {/* Marcador SIMULADO (móvil) */}
        <line x1={xScale(gSim)} x2={xScale(gSim)} y1={mT} y2={mT + plotH} stroke="var(--accent)" strokeWidth="2" />
        <circle cx={xScale(gSim)} cy={yVentas(vSim)} r="7" fill="var(--accent)" stroke="var(--paper)" strokeWidth="2.5" />
        <circle cx={xScale(gSim)} cy={yRoas(rSim)} r="5" fill="var(--ink)" stroke="var(--paper)" strokeWidth="2" />

        {/* Tooltip flotante con valor simulado */}
        <g transform={`translate(${xScale(gSim) + (gSim > gMax * 0.7 ? -130 : 12)}, ${yVentas(vSim) - 30})`}>
          <rect x={0} y={0} width={125} height={44} rx={4} fill="var(--ink)" opacity="0.92" />
          <text x={8} y={16} fill="var(--paper)" fontSize="11" fontWeight="700">
            Ventas: {fmtMoney(vSim, currency)}
          </text>
          <text x={8} y={32} fill="var(--paper)" fontSize="10" opacity="0.85">
            ROAS: {fmtRoas(rSim)} · CAC: {fmtMoney(cacSim, currency)}
          </text>
        </g>

        {/* Óptimo y break-even */}
        {gOptObj > g0 * 0.1 && gOptObj < gMax && (
          <>
            <line x1={xScale(gOptObj)} x2={xScale(gOptObj)} y1={mT + plotH - 30} y2={mT + plotH} stroke="var(--good)" strokeWidth="1" strokeDasharray="3,2" />
            <text x={xScale(gOptObj)} y={mT + plotH - 34} fill="var(--good)" fontSize="10" textAnchor="middle" fontWeight="600">
              óptimo
            </text>
          </>
        )}
        {gBreakEven > 0 && gBreakEven < gMax && (
          <>
            <line x1={xScale(gBreakEven)} x2={xScale(gBreakEven)} y1={mT + plotH - 30} y2={mT + plotH} stroke="var(--bad)" strokeWidth="1" strokeDasharray="3,2" opacity="0.7" />
            <text x={xScale(gBreakEven)} y={mT + plotH - 34} fill="var(--bad)" fontSize="10" textAnchor="middle" fontWeight="600">
              límite
            </text>
          </>
        )}

        {/* Eje X ticks */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={xScale(t.g)} x2={xScale(t.g)} y1={mT + plotH} y2={mT + plotH + 4} stroke="var(--rule)" />
            <text x={xScale(t.g)} y={mT + plotH + 16} fill="var(--muted)" fontSize="10" textAnchor="middle">
              {t.label}
            </text>
            <text x={xScale(t.g)} y={mT + plotH + 30} fill="var(--muted)" fontSize="9" textAnchor="middle" opacity="0.7">
              {fmtMoney(t.g, currency).replace(/\s/g, "").replace(/,00$/, "")}
            </text>
          </g>
        ))}

        {/* Eje Y izquierdo (ventas) */}
        {Array.from({ length: 6 }, (_, i) => {
          const v = (i / 5) * ventasMax;
          return (
            <text key={i} x={mL - 8} y={yVentas(v) + 3} fill="var(--accent)" fontSize="9" textAnchor="end">
              {fmtMoney(v, currency).replace(/\s/g, "").replace(/,00$/, "")}
            </text>
          );
        })}
        <text x={mL - 8} y={mT - 10} fill="var(--accent)" fontSize="10" textAnchor="end" fontWeight="700">
          VENTAS
        </text>

        {/* Eje Y derecho (ROAS) */}
        {Array.from({ length: 6 }, (_, i) => {
          const r = (i / 5) * roasMax;
          return (
            <text key={i} x={mL + plotW + 8} y={yRoas(r) + 3} fill="var(--ink)" fontSize="9" textAnchor="start">
              {r.toFixed(1)}×
            </text>
          );
        })}
        <text x={mL + plotW + 8} y={mT - 10} fill="var(--ink)" fontSize="10" textAnchor="start" fontWeight="700">
          ROAS
        </text>

        <line x1={mL} x2={mL + plotW} y1={mT + plotH} y2={mT + plotH} stroke="var(--rule)" />
      </svg>

      {/* Resultados numéricos del punto simulado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginTop: 20, paddingTop: 16, borderTop: "1px dashed var(--rule)" }}>
        <ResultCard label="Gasto simulado" value={fmtMoney(gSim, currency)} sub={mult !== 1 ? `${gExtra >= 0 ? "+" : ""}${fmtMoney(gExtra, currency)}` : "base"} />
        <ResultCard label="Ventas proyectadas" value={fmtMoney(vSim, currency)} sub={mult !== 1 ? `${vExtra >= 0 ? "+" : ""}${fmtMoney(vExtra, currency)}` : "base"} color="var(--accent)" />
        <ResultCard label="ROAS total" value={fmtRoas(rSim)} sub={`vs ${fmtRoas(R0)} actual`} />
        <ResultCard label="ROAS marginal" value={mult === 1 ? "—" : fmtRoas(roasMarginal)} pill={mult !== 1 ? { cls: marginalCls, text: marginalCls === "good" ? "escalable" : marginalCls === "warn" ? "límite" : "no conviene" } : undefined} />
        <ResultCard label="Compras · CAC" value={`${comprasSim} · ${fmtMoney(cacSim, currency)}`} sub={`vs CAC ${fmtMoney(CAC0, currency)} actual`} />
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--rule)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
        <b>Cómo leerlo:</b> zona verde = ROAS ≥ objetivo · amarilla = rentable pero debajo · roja = pérdida.
        Movés el slider y el punto naranja se mueve sobre la curva mostrándote las ventas y ROAS esperados a ese nivel de gasto.
        {lastUpdate && (
          <><br /><b>Última data:</b> {lastUpdate} · el modelo se recalcula automáticamente en cada visita con la data más reciente de tu Sheet.</>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  label, value, sub, color, pill,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  pill?: { cls: string; text: string };
}) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 18, fontVariantNumeric: "tabular-nums", color: color ?? "var(--ink)" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{sub}</div>
      )}
      {pill && (
        <div style={{ marginTop: 6 }}>
          <span className={`pill ${pill.cls}`} style={{ fontSize: 10 }}>{pill.text}</span>
        </div>
      )}
    </div>
  );
}
