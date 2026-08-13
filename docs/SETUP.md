# Setup inicial (una sola vez)

Este documento explica los pasos que hacés **una sola vez** al principio para dejar todo listo. Después, agregar clientes nuevos es una fila en un Sheet.

Tiempo estimado: 45-60 min.

## Paso 1 · Comprar dominio

Ejemplo con **Namecheap**:
1. Andá a namecheap.com
2. Buscá tu dominio (ej: `mattio.agency`, `pedime.app`, `tudominio.com`)
3. Compralo (~$10-15/año)
4. Guardá los datos de acceso — vas a apuntarlo a Vercel más adelante.

Alternativas: Cloudflare Registrar (más barato pero requiere más setup), Google Domains, Porkbun.

## Paso 2 · Crear proyecto en Google Cloud

Vas a necesitarlo para 2 cosas: OAuth (tu login) y Service Account (leer los Sheets).

1. Abrí https://console.cloud.google.com
2. Arriba a la izquierda "Select a project" → "New Project"
3. Nombre: `pedime-tablero` (o el que quieras). Click Create.
4. Con el proyecto seleccionado, andá al menú lateral: **APIs & Services → Library**
5. Habilitá estas 2 APIs (buscalas y clickeá Enable):
   - **Google Sheets API**
   - **Google Drive API** (necesaria para que la Sheets API funcione bien)

## Paso 3 · Crear credencial OAuth (para tu login)

1. Menú lateral: **APIs & Services → OAuth consent screen**
2. User type: **External** → Create
3. Completá:
   - App name: `Tracker Adspend`
   - User support email: tu email
   - Developer contact: tu email
4. Scopes: no toques nada, siguiente.
5. Test users: agregá **tu propio email de Google** (y de cualquier otra persona que vaya a acceder).
6. Volvé a **Credentials → Create Credentials → OAuth client ID**
7. Application type: **Web application**
8. Name: `Tracker Web`
9. Authorized redirect URIs: agregá 2 líneas:
   ```
   http://localhost:3000/api/auth/callback/google
   https://tudominio.com/api/auth/callback/google
   ```
   (reemplazá `tudominio.com` por el tuyo real)
10. Copiá el **Client ID** y **Client Secret** que te muestra — los vas a poner en `.env` después.

## Paso 4 · Crear Service Account (para leer Sheets)

1. Menú lateral: **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Name: `tablero-reader`
4. Skip los pasos opcionales, click **Done**
5. Ya creada, clickeála → pestaña **Keys** → **Add Key → Create new key → JSON**
6. Se descarga un archivo `.json`. **Guardalo bien**, es la credencial.
7. Abrí el JSON en un editor de texto — vas a copiar todo el contenido en una sola línea después.
8. Anotá el `client_email` del JSON (algo tipo `tablero-reader@pedime-tablero.iam.gserviceaccount.com`). Este es el email que tenés que compartir con los Sheets.

## Paso 5 · Crear Master Sheet

1. Abrí https://sheets.google.com y creá un Sheet nuevo.
2. Renombralo a `Master · Clientes Tracker` (o lo que prefieras).
3. Renombrá la primera pestaña a **Clientes**.
4. Pegá esta cabecera en la fila 1 (una celda por columna, tabuladas):
   ```
   id	nombre	sheet_id	presupuesto	meta_ventas	moneda	roas_objetivo	logo_url	color
   ```
5. Agregá tu primer cliente (fila 2). Ejemplo:
   | id | nombre | sheet_id | presupuesto | meta_ventas | moneda | roas_objetivo | logo_url | color |
   |---|---|---|---|---|---|---|---|---|
   | felipe | Felipe · Ropa | 1jewTak... | 1500000 | 8000000 | ARS | 5.00 | | #B44A1E |
6. Compartí este Master Sheet con el email del service account (paso 4.8) con rol **Viewer**.
7. Copiá el ID del Sheet (está en la URL, entre `/d/` y `/edit`).

Adicional: agregá pestañas para el cliente n8n (opcional, si querés que n8n también lea de acá). Ver [ADD_CLIENT.md](ADD_CLIENT.md).

## Paso 6 · Sheet de cada cliente

Para cada cliente, creás un Sheet aparte con 2 pestañas:

**Pestaña Raw** — la que llena n8n. Fila 1 con esta cabecera (25 columnas):
```
unique_id	fecha	campaign_id	campaign_name	adset_id	adset_name	ad_id	ad_name	gasto	cpc	ctr_general	ctr_enlace	frecuencia	visitas_pagina	costo_visita_pagina	agregados_carrito	costo_agregado_carrito	valor_agregado_carrito	pagos_iniciados	costo_pago_iniciado	valor_pago_iniciado	compras	valor_compra	costo_compra	roas
```

**Pestaña Bitacora** — donde el tablero guarda las notas que vos agregás. Fila 1:
```
timestamp	tipo	scope	scope_label	texto	autor
```

Compartí el Sheet con el service account con rol **Editor** (necesita escritura para la Bitácora).

## Paso 7 · Deploy a Vercel

Está en [DEPLOY.md](DEPLOY.md).

## Paso 8 · Configurar n8n

Está en [DEPLOY.md#n8n](DEPLOY.md#n8n).
