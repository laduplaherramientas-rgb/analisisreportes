import type { Period, PeriodKey } from "./types";

// ============================================================
// Formateo YYYY-MM-DD con TZ Argentina fijo (evita drift por UTC).
// ============================================================
const TZ_OFFSET_MIN = -180; // Argentina (UTC-3)

function toDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00");
}

function fmt(d: Date) {
  const local = new Date(d.getTime() - TZ_OFFSET_MIN * 60 * 1000);
  return local.toISOString().split("T")[0];
}

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function today() {
  return new Date();
}

// ============================================================
// Devuelve un Period completo con since/until y período previo comparable.
// ============================================================
export function buildPeriod(
  key: PeriodKey,
  custom?: { since: string; until: string }
): Period {
  const now = today();

  switch (key) {
    case "today": {
      const s = fmt(now);
      const prev = fmt(addDays(now, -1));
      return {
        key,
        label: "Hoy",
        since: s,
        until: s,
        previous: { since: prev, until: prev, label: "Ayer" },
      };
    }

    case "yesterday": {
      const y = fmt(addDays(now, -1));
      const prev = fmt(addDays(now, -2));
      return {
        key,
        label: "Ayer",
        since: y,
        until: y,
        previous: { since: prev, until: prev, label: "Anteayer" },
      };
    }

    case "last7": {
      const until = fmt(addDays(now, -1));
      const since = fmt(addDays(now, -7));
      const prevUntil = fmt(addDays(now, -8));
      const prevSince = fmt(addDays(now, -14));
      return {
        key,
        label: "Últimos 7 días",
        since,
        until,
        previous: {
          since: prevSince,
          until: prevUntil,
          label: "7 días previos",
        },
      };
    }

    case "last30": {
      const until = fmt(addDays(now, -1));
      const since = fmt(addDays(now, -30));
      const prevUntil = fmt(addDays(now, -31));
      const prevSince = fmt(addDays(now, -60));
      return {
        key,
        label: "Últimos 30 días",
        since,
        until,
        previous: {
          since: prevSince,
          until: prevUntil,
          label: "30 días previos",
        },
      };
    }

    case "thisMonth": {
      const s = startOfMonth(now);
      const e = fmt(addDays(now, -1)); // hasta ayer
      const prev = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const prevEnd = endOfMonth(prev);
      return {
        key,
        label: "Este mes",
        since: fmt(s),
        until: e < fmt(s) ? fmt(s) : e,
        previous: {
          since: fmt(prev),
          until: fmt(prevEnd),
          label: "Mes pasado",
        },
      };
    }

    case "lastMonth": {
      const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const end = endOfMonth(start);
      const prevStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      const prevEnd = endOfMonth(prevStart);
      return {
        key,
        label: "Mes pasado",
        since: fmt(start),
        until: fmt(end),
        previous: {
          since: fmt(prevStart),
          until: fmt(prevEnd),
          label: "Mes anterior",
        },
      };
    }

    case "last3Months": {
      const until = fmt(addDays(now, -1));
      const since = fmt(addDays(now, -90));
      const prevUntil = fmt(addDays(now, -91));
      const prevSince = fmt(addDays(now, -181));
      return {
        key,
        label: "Últimos 3 meses",
        since,
        until,
        previous: { since: prevSince, until: prevUntil, label: "3 meses previos" },
      };
    }

    case "last12Months": {
      const until = fmt(addDays(now, -1));
      const since = fmt(addDays(now, -365));
      const prevUntil = fmt(addDays(now, -366));
      const prevSince = fmt(addDays(now, -730));
      return {
        key,
        label: "Últimos 12 meses",
        since,
        until,
        previous: { since: prevSince, until: prevUntil, label: "12 meses previos" },
      };
    }

    case "custom": {
      if (!custom) throw new Error("custom period requires since/until");
      const s = toDate(custom.since);
      const e = toDate(custom.until);
      const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
      const prevEnd = fmt(addDays(s, -1));
      const prevStart = fmt(addDays(s, -days));
      return {
        key,
        label: `${custom.since} → ${custom.until}`,
        since: custom.since,
        until: custom.until,
        previous: {
          since: prevStart,
          until: prevEnd,
          label: `${prevStart} → ${prevEnd}`,
        },
      };
    }
  }
}

// ============================================================
// Todos los períodos preconfigurados para el dropdown.
// ============================================================
export function allPeriodOptions(): { key: PeriodKey; label: string }[] {
  return [
    { key: "today", label: "Hoy" },
    { key: "yesterday", label: "Ayer" },
    { key: "last7", label: "Últimos 7 días" },
    { key: "last30", label: "Últimos 30 días" },
    { key: "thisMonth", label: "Este mes" },
    { key: "lastMonth", label: "Mes pasado" },
    { key: "last3Months", label: "Últimos 3 meses" },
    { key: "last12Months", label: "Últimos 12 meses" },
    { key: "custom", label: "Período personalizado" },
  ];
}
