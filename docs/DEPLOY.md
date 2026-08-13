# Deploy a producción

## Paso 1 · Subir el código a GitHub

```bash
cd pedime-tablero
git init
git add .
git commit -m "initial commit"
gh repo create pedime-tablero --private --source=. --push
```

Si no tenés `gh` CLI: creá el repo en github.com manualmente y hacé `git remote add origin ... && git push`.

## Paso 2 · Deploy a Vercel

1. Andá a https://vercel.com y logueate con GitHub
2. Click **Add New → Project**
3. Seleccioná el repo `pedime-tablero`
4. Framework Preset: **Next.js** (detecta automático)
5. **NO clickees Deploy todavía** — antes andá a **Environment Variables** y agregá:

| Variable | Valor |
|---|---|
| `AUTH_GOOGLE_ID` | Client ID del paso 3 de SETUP |
| `AUTH_GOOGLE_SECRET` | Client Secret del paso 3 de SETUP |
| `AUTH_SECRET` | corrélo local: `openssl rand -base64 32` |
| `AUTH_URL` | `https://tudominio.com` (o el URL de Vercel por ahora) |
| `AUTH_ALLOWED_EMAILS` | Tu email de Google |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Todo el JSON del service account en UNA LÍNEA** (copiá el archivo entero y pegalo tal cual) |
| `MASTER_SHEET_ID` | ID de la Master Sheet del paso 5 |

6. Click **Deploy**
7. Cuando termine, Vercel te da una URL tipo `pedime-tablero-xxx.vercel.app`

## Paso 3 · Conectar tu dominio

1. En Vercel → tu proyecto → **Settings → Domains**
2. Add domain → escribí `tudominio.com`
3. Vercel te muestra los DNS records que hay que agregar
4. Andá a tu registrar (Namecheap/Cloudflare) y agregá:
   - Un registro **A** para `@` apuntando a `76.76.21.21`
   - Un registro **CNAME** para `www` apuntando a `cname.vercel-dns.com`
5. Esperá 10-30 min a que propague. Vercel te confirma con ✅ cuando está.

## Paso 4 · Actualizar redirect de Google OAuth

Volvé a Google Cloud Console → OAuth Client ID → agregá:
```
https://tudominio.com/api/auth/callback/google
```

En Vercel, actualizá la env var `AUTH_URL` a `https://tudominio.com` y redeployá (Settings → Deployments → 3 puntitos → Redeploy).

## Paso 5 · Primer login

1. Abrí `https://tudominio.com`
2. Te redirige a `/login`
3. Click "Continuar con Google"
4. Elegí tu cuenta
5. Deberías ver el tablero con tus clientes cargados

## n8n

### Opción A · n8n Cloud (recomendado, gratis para empezar)

1. Andá a https://n8n.cloud → crea cuenta
2. En tu workspace: Workflows → Import from file
3. Subí `n8n/master-workflow.json`
4. Cambiá el placeholder `YOUR_MASTER_SHEET_ID` por el ID real de tu Master Sheet
5. Configurá credenciales:
   - **Google Sheets OAuth2**: connect con la misma cuenta de Google que tenga permiso a los Sheets
6. Ejecutá manualmente una vez para probar
7. Activá el workflow (toggle arriba a la derecha) → arranca el cron 7 AM

### Opción B · n8n Self-hosted

Si ya tenés uno corriendo (parece que sí, es el tuyo actual):
- Import → subí `n8n/master-workflow.json`
- Mismos pasos que arriba

## Actualizar el sistema después de cambios

```bash
git add .
git commit -m "cambios"
git push
```

Vercel deploya automáticamente en ~1 min. La versión anterior queda archivada por si querés rollback.

## Troubleshooting

**"No aparecen clientes en el selector"**
- Verificá que el service account tiene acceso al Master Sheet (rol Viewer mínimo)
- Verificá que la pestaña se llama exactamente **Clientes** (con C mayúscula)
- Verificá que la cabecera tiene los nombres exactos: `id, nombre, sheet_id, presupuesto, meta_ventas, moneda, roas_objetivo, logo_url, color`

**"Login me devuelve al login"**
- Verificá que tu email está en `AUTH_ALLOWED_EMAILS`
- Verificá que agregaste tu email como Test User en el OAuth consent screen

**"Sin datos aunque el Sheet tiene filas"**
- Verificá que el Sheet del cliente tiene la pestaña **Raw** (con R mayúscula)
- Verificá que las cabeceras coinciden exactamente con lo que trae n8n
