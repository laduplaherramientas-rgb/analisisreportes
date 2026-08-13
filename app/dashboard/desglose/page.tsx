import EmptyState from "@/components/EmptyState";
import { loadDashboard } from "@/lib/dashboard-data";
import {
  aggregate,
  detectObjetivo,
  fmtMoney,
  fmtNum,
  fmtRoas,
  groupBy,
} from "@/lib/data";
import type { PeriodKey, RawRow } from "@/lib/types";
import type { Objetivo as ObjT } from "@/lib/data";

export const dynamic = "force-dynamic";

const OBJ_META: Record<ObjT, { num: string; label: string; hint: string }> = {
  presentacion: {
    num: "1",
    label: "Presentación",
    hint: "optimiza por visitas al sitio · construir audiencia · ROAS moderado",
  },
  evaluacion: {
    num: "2",
    label: "Evaluación",
    hint: "optimiza por Add to Cart + Compras · ya te conocen · ROAS medio-alto",
  },
  conversion: {
    num: "3",
    label: "Conversión",
    hint: "optimiza 100% por compras · pixel busca compradores · ROAS más alto",
  },
};

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

  // Agrupar por campaign, luego adset, luego ad
  const byCamp = groupBy(rows, "campaign_id");

  type CampSum = {
    id: string;
    name: string;
    objetivo: ObjT;
    agg: ReturnType<typeof aggregate>;
    adsets: {
      id: string;
      name: string;
      agg: ReturnType<typeof aggregate>;
      ads: { id: string; name: string; agg: ReturnType<typeof aggregate> }[];
    }[];
  };

  const campaigns: CampSum[] = Array.from(byCamp.entries()).map(([id, crs]) => {
    const name = crs[0]?.campaign_name ?? id;
    const objetivo = detectObjetivo(name);
    const byAdset = groupBy(crs, "adset_id");
    const adsets = Array.from(byAdset.entries()).map(([aid, ars]) => {
      const aname = ars[0]?.adset_name ?? aid;
      const byAd = groupBy(ars, "ad_id");
      const ads = Array.from(byAd.entries()).map(([adid, drs]) => ({
        id: adid,
        name: drs[0]?.ad_name ?? adid,
        agg: aggregate(drs),
      }));
      return { id: aid, name: aname, agg: aggregate(ars), ads };
    });
    return { id, name, objetivo, agg: aggregate(crs), adsets };
  });

  // Agrupar campañas por objetivo
  const objBuckets: Record<ObjT, CampSum[]> = {
    presentacion: [],
    evaluacion: [],
    conversion: [],
  };
  for (const c of campaigns) objBuckets[c.objetivo].push(c);

  const totalAgg = aggregate(rows);

  const objList: ObjT[] = ["presentacion", "evaluacion", "conversion"];

  return (
    <>
      <Header client={client} period={period.label} />

      <div className="panel">
        <div className="panel-head">
          <h3>Estructura de la cuenta</h3>
          <span className="hint">
            {campaigns.length} campañas · {campaigns.reduce((s, c) => s + c.adsets.length, 0)} conjuntos ·{" "}
            {campaigns.reduce((s, c) => s + c.adsets.reduce((ss, a) => ss + a.ads.length, 0), 0)} anuncios
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "34%" }}>Nombre</th>
                <th>Inv</th>
                <th>Ventas</th>
                <th>ROAS</th>
                <th>CPA</th>
                <th>Compras</th>
                <th>CTR</th>
                <th>Frec</th>
              </tr>
            </thead>
            <tbody>
              {objList.flatMap((obj) => {
                const camps = objBuckets[obj];
                if (camps.length === 0) return [];
                const meta = OBJ_META[obj];
                const objAgg = aggregate(camps.flatMap((c) => rowsOf(byCamp, c.id)));
                const objRoas = camps.some((c) => c.objetivo === "conversion")
                  ? fmtRoas(objAgg.roas)
                  : "—";
                return [
                  <tr className="row-objective" key={`obj-${obj}`}>
                    <td colSpan={8}>
                      <span className="obj-num">{meta.num}</span>{meta.label}
                      <small>{meta.hint}</small>
                    </td>
                  </tr>,
                  ...camps.map((camp) => (
                    <RowCampaign key={camp.id} camp={camp} currency={currency} roasObjetivo={client.roas_objetivo} />
                  )),
                  <tr className="row-subtotal" key={`sub-${obj}`}>
                    <td className="name">
                      Subtotal · {meta.label} ({camps.length} {camps.length === 1 ? "campaña" : "campañas"})
                    </td>
                    <td>{fmtMoney(objAgg.gasto, currency)}</td>
                    <td>{fmtMoney(objAgg.ventas, currency)}</td>
                    <td>{objRoas}</td>
                    <td>{objAgg.compras > 0 ? fmtMoney(objAgg.cpa, currency) : "—"}</td>
                    <td>{fmtNum(objAgg.compras)}</td>
                    <td>—</td>
                    <td>{objAgg.frecuencia.toFixed(2)}</td>
                  </tr>,
                ];
              })}

              <tr className="total">
                <td className="name" style={{ textAlign: "left" }}>Total cuenta</td>
                <td>{fmtMoney(totalAgg.gasto, currency)}</td>
                <td>{fmtMoney(totalAgg.ventas, currency)}</td>
                <td>{fmtRoas(totalAgg.roas)}</td>
                <td>{totalAgg.compras > 0 ? fmtMoney(totalAgg.cpa, currency) : "—"}</td>
                <td>{fmtNum(totalAgg.compras)}</td>
                <td>—</td>
                <td>{totalAgg.frecuencia.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function rowsOf(byCamp: Map<string, RawRow[]>, campId: string): RawRow[] {
  return byCamp.get(campId) ?? [];
}

function Header({ client, period }: { client: { nombre: string }; period: string }) {
  return (
    <header className="view-head">
      <div>
        <div className="eyebrow">{client.nombre} · {period}</div>
        <h1>Desglose por campaña, conjunto y anuncio</h1>
      </div>
      <div className="view-right">
        <div className="caption">Agrupado por objetivo de campaña</div>
      </div>
    </header>
  );
}

function RowCampaign({
  camp,
  currency,
  roasObjetivo,
}: {
  camp: {
    id: string;
    name: string;
    objetivo: ObjT;
    agg: ReturnType<typeof aggregate>;
    adsets: {
      id: string;
      name: string;
      agg: ReturnType<typeof aggregate>;
      ads: { id: string; name: string; agg: ReturnType<typeof aggregate> }[];
    }[];
  };
  currency: string;
  roasObjetivo: number;
}) {
  const isConv = camp.objetivo === "conversion";
  const badge = camp.objetivo === "presentacion" ? "pre" : camp.objetivo === "evaluacion" ? "eval" : "conv";
  const badgeLabel = badge.toUpperCase();

  // Para Presentación las columnas ROAS/CPA/Compras se reemplazan por
  // Visitas/CPV/CTR (métricas propias del objetivo de tráfico).
  const cellRoas = (agg: ReturnType<typeof aggregate>) =>
    isConv ? fmtRoas(agg.roas) : (
      <span title="Visitas a la página (LPV)">{fmtNum(agg.visitas_pagina)} <small style={{ color: "var(--muted)" }}>vis.</small></span>
    );
  const cellCpa = (agg: ReturnType<typeof aggregate>) => {
    if (isConv) return agg.compras > 0 ? fmtMoney(agg.cpa, currency) : "—";
    // CPV = gasto / visitas
    if (agg.visitas_pagina > 0) {
      return <span title="Costo por visita (CPV)">{fmtMoney(agg.gasto / agg.visitas_pagina, currency)} <small style={{ color: "var(--muted)" }}>CPV</small></span>;
    }
    return "—";
  };
  const cellCompras = (agg: ReturnType<typeof aggregate>) =>
    isConv ? fmtNum(agg.compras) : (
      <span title="Add to cart">{fmtNum(agg.agregados_carrito)} <small style={{ color: "var(--muted)" }}>ATC</small></span>
    );

  const trs: React.ReactElement[] = [
    <tr className="row-campaign" key={`c-${camp.id}`}>
      <td className="name">
        <span className={`badge-type ${badge}`}>{badgeLabel}</span>
        {camp.name}
      </td>
      <td>{fmtMoney(camp.agg.gasto, currency)}</td>
      <td>{fmtMoney(camp.agg.ventas, currency)}</td>
      <td>{cellRoas(camp.agg)}</td>
      <td>{cellCpa(camp.agg)}</td>
      <td>{cellCompras(camp.agg)}</td>
      <td>—</td>
      <td>{camp.agg.frecuencia.toFixed(2)}</td>
    </tr>,
  ];

  for (const a of camp.adsets) {
    trs.push(
      <tr className="row-adset" key={`as-${a.id}`}>
        <td className="name">📦 {a.name}</td>
        <td>{fmtMoney(a.agg.gasto, currency)}</td>
        <td>{fmtMoney(a.agg.ventas, currency)}</td>
        <td>{cellRoas(a.agg)}</td>
        <td>{cellCpa(a.agg)}</td>
        <td>{cellCompras(a.agg)}</td>
        <td>—</td>
        <td>{a.agg.frecuencia.toFixed(2)}</td>
      </tr>
    );
    for (const ad of a.ads) {
      trs.push(
        <tr className="row-ad" key={`ad-${ad.id}`}>
          <td className="name">🎬 {ad.name}</td>
          <td>{fmtMoney(ad.agg.gasto, currency)}</td>
          <td>{fmtMoney(ad.agg.ventas, currency)}</td>
          <td>{cellRoas(ad.agg)}</td>
          <td>{cellCpa(ad.agg)}</td>
          <td>{cellCompras(ad.agg)}</td>
          <td>—</td>
          <td>{ad.agg.frecuencia.toFixed(2)}</td>
        </tr>
      );
    }
  }

  return <>{trs}</>;
}
