import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracker Adspend & Ventas",
  description: "Panel de agencia · Meta Ads → Google Sheets → Tablero",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
