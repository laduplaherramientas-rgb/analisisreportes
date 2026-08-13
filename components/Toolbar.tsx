"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Client, PeriodKey } from "@/lib/types";
import { allPeriodOptions } from "@/lib/period";

export default function Toolbar({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const currentClientId = search?.get("client") ?? clients[0]?.id ?? "";
  const currentPeriod = (search?.get("period") as PeriodKey) ?? "thisMonth";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(search?.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="toolbar">
      <span className="toolbar-label">Cliente</span>
      <select
        className="select-plain"
        value={currentClientId}
        onChange={(e) => updateParam("client", e.target.value)}
      >
        {clients.length === 0 && <option value="">— sin clientes cargados —</option>}
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      <span className="toolbar-label" style={{ marginLeft: 16 }}>Período</span>
      <select
        className="select-plain"
        value={currentPeriod}
        onChange={(e) => updateParam("period", e.target.value)}
      >
        {allPeriodOptions().map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>

      <div className="toolbar-spacer" />

      <span style={{ fontSize: 11, color: "var(--muted)" }}>
        {clients.length} {clients.length === 1 ? "cliente cargado" : "clientes cargados"}
      </span>
    </div>
  );
}
