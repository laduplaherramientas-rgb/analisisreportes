# Agregar un cliente nuevo

Después del setup inicial, agregar un cliente lleva ~5 minutos y **no requiere tocar código ni redeployar**.

## Paso 1 · Crear su Google Sheet

1. Crear un Sheet nuevo (ejemplo: `Cliente XYZ · Meta Ads Raw`)
2. Renombrar la primera pestaña a **Raw**
3. Pegar la cabecera de 25 columnas en A1 (ver [SETUP.md paso 6](SETUP.md#paso-6--sheet-de-cada-cliente))
4. Crear una pestaña **Bitacora** con su cabecera de 6 columnas
5. Compartir el Sheet con el email del service account (rol **Editor**)
6. Copiar el ID del Sheet (parte de la URL entre `/d/` y `/edit`)

## Paso 2 · Registrar en la Master Sheet

Agregar una fila nueva en la pestaña `Clientes` de la Master Sheet:

| Campo | Ejemplo | Notas |
|---|---|---|
| id | `cliente_xyz` | slug único, sin espacios ni tildes |
| nombre | `Cliente XYZ` | como querés que aparezca en el selector |
| sheet_id | `1abc...xyz` | ID del Sheet del paso 1 |
| presupuesto | `500000` | ARS mensual |
| meta_ventas | `3000000` | ARS mensual |
| moneda | `ARS` | o USD |
| roas_objetivo | `6.00` | |
| logo_url | (opcional) | URL a un PNG cuadrado |
| color | `#2E5C8A` | (opcional) color de acento |

## Paso 3 · Registrar en n8n

Abrí el workflow `Master Multi-cliente` en n8n. La pestaña de configuración de clientes está también en la Master Sheet — el workflow la lee al arrancar. Solo necesitás asegurarte de que la fila tenga:

- `meta_ad_account_id` (formato `act_XXXXXXXXX`)
- `meta_token` (System User Token de larga duración)

Podés agregar estas columnas a la misma Master Sheet (recomendado) o mantenerlas en una hoja aparte.

**Recomendado**: extender la Master Sheet con 2 columnas más:
| meta_ad_account_id | meta_token |
|---|---|
| act_1234567890 | EAAxxxxxxxxxxx |

El workflow de n8n las tomará automáticamente en la próxima corrida a las 7 AM (o podés dispararlo manualmente para el primer pull).

## Paso 4 · Verificar en el tablero

1. Abrí el tablero
2. En el selector de cliente arriba a la izquierda debería aparecer el nuevo
3. Si no aparece, esperá ~1 minuto (caché) o refrescá con Ctrl+Shift+R

## Paso 5 · Backfill histórico (opcional)

Si querés traer data pasada del cliente:
1. En el workflow n8n, cambiar temporalmente el nodo "Agregar fecha" al modo chunks (ver README del workflow original)
2. Correr manualmente
3. Restaurar al modo diario

## Sacar un cliente

Simplemente borrá su fila de la Master Sheet. El tablero deja de mostrarlo. El Sheet queda intacto por si querés recuperarlo.
