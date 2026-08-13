import { google, sheets_v4 } from "googleapis";

// ============================================================
// Service Account auth · lee todos los sheets con permiso de Viewer.
// El JSON entero (con \n en la private_key) viene en GOOGLE_SERVICE_ACCOUNT_JSON.
// ============================================================
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no está seteado");
  const creds = JSON.parse(raw);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

let cachedSheets: sheets_v4.Sheets | null = null;
export function sheetsClient() {
  if (!cachedSheets) {
    cachedSheets = google.sheets({ version: "v4", auth: getAuth() });
  }
  return cachedSheets;
}

// ============================================================
// Lee un rango de un sheet como matriz de strings.
// ============================================================
export async function readRange(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const res = await sheetsClient().spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (res.data.values as string[][]) ?? [];
}

// ============================================================
// Convierte una matriz [header, ...rows] a array de objetos.
// ============================================================
export function toObjects<T = Record<string, unknown>>(matrix: string[][]): T[] {
  if (matrix.length === 0) return [];
  const [header, ...rows] = matrix;
  return rows.map((r) => {
    const obj: Record<string, unknown> = {};
    header.forEach((h, i) => {
      obj[h.trim()] = r[i] ?? "";
    });
    return obj as T;
  });
}

// ============================================================
// Append de una fila (para Bitácora).
// ============================================================
export async function appendRow(
  spreadsheetId: string,
  range: string,
  values: (string | number)[]
) {
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

// ============================================================
// Helper: intenta un fetch, si falla devuelve fallback (para dev).
// ============================================================
export async function safeReadObjects<T>(
  spreadsheetId: string,
  range: string,
  fallback: T[] = []
): Promise<T[]> {
  try {
    const matrix = await readRange(spreadsheetId, range);
    return toObjects<T>(matrix);
  } catch (e) {
    console.error(`Sheets read failed for ${spreadsheetId}!${range}:`, e);
    return fallback;
  }
}
