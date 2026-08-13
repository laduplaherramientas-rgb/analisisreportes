import { Suspense } from "react";
import Nav from "@/components/Nav";
import Toolbar from "@/components/Toolbar";
import { getClients } from "@/lib/clients";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clients = await getClients();

  return (
    <>
      <Nav />
      <div className="page">
        <Suspense fallback={<div className="toolbar">Cargando…</div>}>
          <Toolbar clients={clients} />
        </Suspense>
        {children}
      </div>
    </>
  );
}
