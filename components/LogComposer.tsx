"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RawRow } from "@/lib/types";

const TIPOS = [
  { key: "insight", label: "💡 Insight" },
  { key: "creativo", label: "🎨 Pedí creativo" },
  { key: "add", label: "➕ Agregué" },
  { key: "edit", label: "✏️ Edité" },
  { key: "pause", label: "⏸️ Pausé" },
  { key: "test", label: "🧪 Test" },
  { key: "note", label: "📝 Nota" },
];

export default function LogComposer({
  clientId,
  campaigns,
  adsets,
  ads,
}: {
  clientId: string;
  campaigns: { id: string; name: string }[];
  adsets: { id: string; name: string; parent: string }[];
  ads: { id: string; name: string; parent: string }[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState("insight");
  const [scope, setScope] = useState("cuenta");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);

  const scopeOptions: { value: string; label: string }[] = [
    { value: "cuenta", label: "🏢 Cuenta general" },
    ...campaigns.map((c) => ({ value: `campaign:${c.id}`, label: `🎯 ${c.name}` })),
    ...adsets.map((a) => ({ value: `adset:${a.id}`, label: `📦 ${a.name}` })),
    ...ads.map((a) => ({ value: `ad:${a.id}`, label: `🎬 ${a.name}` })),
  ];

  async function submit() {
    if (!texto.trim()) return;
    setBusy(true);
    const opt = scopeOptions.find((s) => s.value === scope)!;
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          tipo,
          scope,
          scope_label: opt.label,
          texto,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setTexto("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="log-composer">
      <h3>Registrar una nueva entrada</h3>
      <div className="type-chips">
        {TIPOS.map((t) => (
          <button
            key={t.key}
            className={`type-chip ${tipo === t.key ? "active" : ""}`}
            onClick={() => setTipo(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="composer-row">
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          {scopeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <textarea
          placeholder="Ej: Le pedí a Diseño 3 nuevos UGC para reemplazar 'Fundador presenta' que viene cayendo hace 5 días…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button className="btn" onClick={submit} disabled={busy || !texto.trim()}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
