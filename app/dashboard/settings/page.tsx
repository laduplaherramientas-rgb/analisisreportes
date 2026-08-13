import { getSession } from "@/lib/auth";
import { getClients } from "@/lib/clients";
import EmptyState from "@/components/EmptyState";
import { fmtMoney, fmtRoas } from "@/lib/data";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const clients = await getClients();

  return (
    <>
      <header className="view-head">
        <div>
          <div className="eyebrow">Panel · Configuración</div>
          <h1>Ajustes</h1>
        </div>
        <div className="view-right">
          <div className="caption">Logueado como <b>{session?.user}</b></div>
        </div>
      </header>

      <div className="section-label">Clientes cargados</div>

      {clients.length === 0 ? (
        <EmptyState
          title="No hay clientes"
          hint="Agregá filas en la Master Sheet (pestaña 'Clientes') y refrescá la página."
        />
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Presupuesto</th>
                  <th>Meta ventas</th>
                  <th>ROAS obj.</th>
                  <th>Moneda</th>
                  <th>Sheet</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td><code style={{ fontSize: 11 }}>{c.id}</code></td>
                    <td><b>{c.nombre}</b></td>
                    <td>{fmtMoney(c.presupuesto, c.moneda)}</td>
                    <td>{fmtMoney(c.meta_ventas, c.moneda)}</td>
                    <td>{fmtRoas(c.roas_objetivo)}</td>
                    <td>{c.moneda}</td>
                    <td>
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${c.sheet_id}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--accent)", fontSize: 12 }}
                      >
                        Abrir ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section-label">Cómo agregar un cliente nuevo</div>
      <div className="callout">
        <span className="icon">i</span>
        <span>
          <b>1.</b> Abrí la Master Sheet y agregá una fila en la pestaña <b>Clientes</b>: id, nombre, sheet_id, presupuesto, meta_ventas, moneda, roas_objetivo.<br />
          <b>2.</b> Compartí el nuevo Sheet del cliente con el email del service account (rol Editor).<br />
          <b>3.</b> Creá pestañas <b>Raw</b> (25 columnas) y <b>Bitacora</b> (6 columnas) en el Sheet del cliente.<br />
          <b>4.</b> Agregá el cliente en la Master Sheet del workflow n8n para que el cron diario lo pulle automáticamente.
        </span>
      </div>

      <div className="section-label">Sesión</div>
      <div className="panel" style={{ padding: 20 }}>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Estás logueado como <b style={{ color: "var(--ink)" }}>{session?.user}</b>.
        </p>
        <LogoutButton />
      </div>
    </>
  );
}
