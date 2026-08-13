import EmptyState from "@/components/EmptyState";
import LogComposer from "@/components/LogComposer";
import { loadDashboard } from "@/lib/dashboard-data";
import { safeReadObjects } from "@/lib/sheets";
import type { LogEntry, PeriodKey, RawRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatDay(d: Date): string {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function daysDiff(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function humanDay(iso: string): { label: string; today: boolean; yesterday: boolean } {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dDay = new Date(d);
  dDay.setHours(0, 0, 0, 0);
  const diff = daysDiff(today, dDay);
  if (diff === 0) return { label: "Hoy · " + formatDay(dDay), today: true, yesterday: false };
  if (diff === 1) return { label: "Ayer · " + formatDay(dDay), today: false, yesterday: true };
  return { label: formatDay(dDay), today: false, yesterday: false };
}

function initials(name: string): string {
  return (name || "?").trim().substring(0, 1).toUpperCase();
}

export default async function LogPage({
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

  const { client, allRows } = ctx;

  // Traer bitácora (pestaña "Bitacora" en cada Sheet cliente)
  const entriesRaw = await safeReadObjects<LogEntry>(client.sheet_id, "Bitacora!A1:F");
  const entries = entriesRaw.reverse(); // recientes primero

  // Extraer campañas/adsets/ads únicos para el composer
  const campMap = new Map<string, string>();
  const adsetMap = new Map<string, { name: string; parent: string }>();
  const adMap = new Map<string, { name: string; parent: string }>();
  for (const r of allRows) {
    campMap.set(r.campaign_id, r.campaign_name);
    adsetMap.set(r.adset_id, { name: r.adset_name, parent: r.campaign_name });
    adMap.set(r.ad_id, { name: r.ad_name, parent: r.adset_name });
  }

  const campaigns = Array.from(campMap.entries()).map(([id, name]) => ({ id, name }));
  const adsets = Array.from(adsetMap.entries()).map(([id, v]) => ({ id, name: v.name, parent: v.parent }));
  const ads = Array.from(adMap.entries()).map(([id, v]) => ({ id, name: v.name, parent: v.parent }));

  // Agrupar entradas por día
  const grouped = new Map<string, typeof entries>();
  for (const e of entries) {
    const day = (e.timestamp || "").substring(0, 10);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(e);
  }

  return (
    <>
      <header className="view-head">
        <div>
          <div className="eyebrow">{client.nombre} · Historial de decisiones</div>
          <h1>Bitácora de la cuenta</h1>
        </div>
        <div className="view-right">
          <div className="caption">{entries.length} entradas · última: {entries[0]?.timestamp?.substring(0, 16).replace("T", " ") ?? "—"}</div>
        </div>
      </header>

      <LogComposer clientId={client.id} campaigns={campaigns} adsets={adsets} ads={ads} />

      {entries.length === 0 ? (
        <EmptyState
          title="Sin entradas aún"
          hint="Agregá la primera con el formulario de arriba — hipótesis, decisiones, cambios que hiciste."
        />
      ) : (
        <div className="timeline">
          {Array.from(grouped.entries()).map(([day, dayEntries]) => {
            const h = humanDay(day);
            return (
              <div key={day}>
                <div className={`timeline-day ${h.today ? "today" : ""}`}>
                  {h.label}
                </div>
                {dayEntries.map((e, i) => (
                  <div key={i} className={`log-entry`}>
                    <div className="log-time">
                      {e.timestamp?.substring(11, 16) ?? ""}
                    </div>
                    <div>
                      <div className="log-header">
                        <span className={`entry-type ${e.tipo}`}>{tipoLabel(e.tipo)}</span>
                        <span className={`scope-tag ${e.scope === "cuenta" ? "general" : ""}`}>
                          {e.scope_label || e.scope}
                        </span>
                      </div>
                      <div className="log-text">{e.texto}</div>
                    </div>
                    <div className="log-author">
                      <div className="avatar">{initials(e.autor)}</div>
                      <span>{e.autor}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function tipoLabel(t: string): string {
  const map: Record<string, string> = {
    insight: "💡 Insight",
    creativo: "🎨 Creativo",
    add: "➕ Agregado",
    edit: "✏️ Edición",
    pause: "⏸️ Pausa",
    test: "🧪 Test",
    note: "📝 Nota",
  };
  return map[t] || t;
}
