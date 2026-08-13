// ============================================================
// Cliente (fila de la Master Sheet)
// ============================================================
export type Client = {
  id: string;
  nombre: string;
  sheet_id: string;
  presupuesto: number;
  meta_ventas: number;
  moneda: string;
  roas_objetivo: number;
  logo_url?: string;
  color?: string;
};

// ============================================================
// Row cruda del Sheet del cliente (pestaña Raw)
// ============================================================
export type RawRow = {
  unique_id: string;
  fecha: string; // "YYYY-MM-DD"
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  gasto: number;
  cpc: number;
  ctr_general: number;
  ctr_enlace: number;
  frecuencia: number;
  visitas_pagina: number;
  costo_visita_pagina: number;
  agregados_carrito: number;
  costo_agregado_carrito: number;
  valor_agregado_carrito: number;
  pagos_iniciados: number;
  costo_pago_iniciado: number;
  valor_pago_iniciado: number;
  compras: number;
  valor_compra: number;
  costo_compra: number;
  roas: number;
};

// ============================================================
// Entrada de Bitácora
// ============================================================
export type LogEntry = {
  timestamp: string; // ISO
  tipo: string; // "insight" | "creativo" | "add" | "edit" | "pause" | "test" | "note"
  scope: string; // "cuenta" | "campaign:XXX" | "adset:XXX" | "ad:XXX"
  scope_label: string;
  texto: string;
  autor: string;
};

// ============================================================
// KPI agregado
// ============================================================
export type Kpi = {
  gasto: number;
  ventas: number;
  compras: number;
  roas: number;
  cpa: number;
  ticket: number;
  frecuencia: number;
  visitas_pagina: number;
  agregados_carrito: number;
  pagos_iniciados: number;
  dias_con_datos: number;
};

// ============================================================
// Período seleccionable
// ============================================================
export type PeriodKey =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "last12Months"
  | "custom";

export type Period = {
  key: PeriodKey;
  label: string;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  previous?: { since: string; until: string; label: string };
};
