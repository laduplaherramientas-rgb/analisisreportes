# Tracker Adspend & Ventas · Panel de agencia

Sistema para gestionar tableros de Meta Ads de múltiples clientes desde un solo login. Cada cliente tiene su propio Google Sheet donde n8n vuelca los datos diariamente, y el tablero los consume live vía Google Sheets API.

## Cómo funciona

```
n8n (7 AM diario)
  ↓ lee Master Sheet (Clientes)
  ↓ itera cada cliente
  ↓ pulla Meta Ads API con su ad_account_id + token
  ↓ upsert al Sheet de cada cliente (pestaña Raw)

Next.js (Vercel)
  ↑ tu login (Google, restringido a tu email)
  ↑ selector de cliente
  ↑ selector de período (hoy / mes / 12 meses / custom)
  ↑ lee Master Sheet + Sheet del cliente activo vía service account
  ↑ renderiza tablero, desglose, heatmaps, estacionalidad, bitácora
```

## Antes de deployar — creá estas cuentas

1. **Google Cloud Console** (para OAuth + Service Account).
2. **Vercel** — para hostear el sitio.
3. **Namecheap** (o cualquier registrar) — para el dominio.
4. **Google Sheets** — la Master Sheet y una Sheet por cada cliente.

Los pasos concretos están en [docs/SETUP.md](docs/SETUP.md).

## Cómo agregar un cliente nuevo

Está en [docs/ADD_CLIENT.md](docs/ADD_CLIENT.md).
Resumen: agregás una fila en la Master Sheet, compartís el Sheet del cliente con el service account, y listo. Sin tocar código.

## Deploy a Vercel

Está en [docs/DEPLOY.md](docs/DEPLOY.md).

## Correr en local

```bash
npm install
cp .env.example .env.local
# Editar .env.local con tus credenciales
npm run dev
```

Abrí http://localhost:3000

## Estructura del proyecto

```
pedime-tablero/
├── app/                    # Next.js App Router
│   ├── login/              # Login con Google
│   ├── dashboard/          # Todas las vistas del tablero
│   │   ├── page.tsx        # Tablero principal
│   │   ├── desglose/       # Árbol Campaña → Conjunto → Anuncio
│   │   ├── daily/          # Heatmaps por día
│   │   ├── seasonality/    # Análisis histórico (día semana, mes)
│   │   ├── log/            # Bitácora de decisiones
│   │   └── settings/       # Config + logout
│   └── api/                # Endpoints server-side
├── components/             # React reutilizables (Nav, Toolbar, KpiCard, Heatmap...)
├── lib/                    # Lógica pura (auth, sheets, agregaciones, período)
├── n8n/                    # Workflow master (import a n8n)
└── docs/                   # Guías detalladas
```

## Stack

- Next.js 15 (App Router + Server Components)
- NextAuth v5 (Google OAuth, single-email allowlist)
- Google Sheets API (via `googleapis`, service account)
- TypeScript
- CSS puro (sin frameworks — palette y componentes propios)

## Costos operativos

- **Vercel Hobby**: gratis hasta 100GB de tráfico/mes
- **Google Cloud** (Sheets API): gratis dentro de cuota (300 reads/min por proyecto — más que suficiente)
- **Dominio**: ~$10-15/año
- **Total**: ~$15/año

Escala a 20+ clientes sin cambiar de tier.
