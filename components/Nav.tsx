"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Tablero", key: "dashboard" },
  { href: "/dashboard/desglose", label: "Desglose", key: "desglose" },
  { href: "/dashboard/daily", label: "Rendimiento diario", key: "daily" },
  { href: "/dashboard/seasonality", label: "Estacionalidad", key: "seasonality" },
  { href: "/dashboard/log", label: "Bitácora", key: "log" },
  { href: "/dashboard/settings", label: "Ajustes", key: "settings" },
];

export default function Nav({ clientName }: { clientName?: string }) {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="brand">
          <span className="dot" />
          Tracker Adspend &amp; Ventas
          {clientName && <small>· {clientName}</small>}
        </div>
        <div className="tabs">
          {TABS.map((t) => {
            const active =
              t.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname?.startsWith(t.href);
            return (
              <Link
                key={t.key}
                href={t.href + (typeof window !== "undefined" ? window.location.search : "")}
                className={`tab ${active ? "active" : ""}`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <div className="navbar-right">
          <span className="sync-badge">
            <span className="pulse" />n8n
          </span>
        </div>
      </div>
    </nav>
  );
}
