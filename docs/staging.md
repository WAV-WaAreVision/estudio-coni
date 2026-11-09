# Staging (issue #7)

Las vistas previas de PR corren contra la rama `staging` de Supabase, con datos de prueba, su propio ambiente de Trigger
y su propio bucket. Comparten con producción solo la llave de Resend: sus correos llevan `[staging]` y claves propias, y
los avisos para Coni van a Federico.

| Pieza | Staging |
|---|---|
| Base | Rama persistente `staging` de `estudio-coni`, ref `omvvgywjyuoqjjfpbpsy` (sa-east-1, ~US$ 10/mes) |
| Migraciones | `.github/workflows/staging.yml` hace `db push` a staging en cada merge a `main` que toque `supabase/migrations/`. Producción sigue a mano. |
| Datos | `supabase/staging/semilla.sql` (escenas de las E2E; se regenera con `pnpm exec tsx scripts/staging/generar-semilla.ts`, que siembra la base local, la vuelca y traduce los ids de las filas que crean las migraciones) |
| Cuentas | `coni` = correo real de Coni; `mantenedor` = `hola@wearevision.cl` |
| Vistas previas | Variables Preview de Vercel apuntan a staging; un build de vista previa con la base de producción se corta (`lib/entorno/preview.ts`) |
| Tareas | Ambiente `staging` de Trigger (`--env staging`); Claude lo despliega sin pedir OK |
| Archivos | Bucket R2 `estudio-coni-staging` |
| Correos | `CONIDOLLY_AMBIENTE=staging` (ya puesta en Preview): asunto con `[staging]` y claves de Resend con `staging:`. `AVISOS_CORREO_CONI` de Preview = Federico. Sin `VAPID_*` en staging, así que no hay push. |

Desde el 09-11-2026 la Coni de staging usa el correo de Federico: `CORREO_CONI` de Preview y el usuario `coni` de
staging (`c0000000-0000-4000-8000-000000000001`) son `federico@wearevision.cl`, así que el código para entrar a una
vista previa le llega a él. Para que Coni pruebe una vista previa, cambia los dos a su correo.

## Pasos de Federico (una vez, desde la Terminal de macOS)

Las llaves nunca se pegan en la terminal de la app de Claude.

1. **Vercel, ambiente Preview** (Settings → Environment Variables, solo «Preview»):
   - `SUPABASE_SERVICE_ROLE_KEY`: llave `service_role` de la rama staging (Supabase → rama `staging` → Settings → API).
   - `TRIGGER_SECRET_KEY`: llave secreta del ambiente **Staging** de Trigger (`tr_stg_...`).
   - `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`: token de R2 con permiso de lectura y escritura **solo** sobre
     `estudio-coni-staging`.
   - `RESEND_API_KEY`: la misma de producción.
   - No agregues `VAPID_*` a Preview. `CONIDOLLY_AMBIENTE`, `AVISOS_CORREO_CONI` (tu correo), las URL y la llave
     pública ya están puestas.
2. **GitHub** (repo → Settings → Secrets → Actions): `STAGING_DB_URL` = cadena de conexión del pooler de la rama
   staging (Supabase → rama `staging` → Connect → Session pooler).
3. **Trigger.dev, ambiente Staging** (Project → Environment variables → Staging): `SUPABASE_URL`
   (`https://omvvgywjyuoqjjfpbpsy.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (staging), `R2_ACCOUNT_ID`,
   `R2_BUCKET=estudio-coni-staging`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (token de staging), `RESEND_API_KEY`,
   `AVISOS_REMITENTE`, `AVISOS_CORREO_WAV`, `AVISOS_CORREO_CONI` (tu correo), `CONIDOLLY_AMBIENTE=staging` y
   `RESPALDO_DB_URL` (la misma cadena de staging). Sin variables de LinkedIn, Meta ni `VAPID_*`.
4. **Correo de la rama** (desde `~/Projects/estudio-coni`):
   ```bash
   RESEND_API_KEY=... pnpm exec supabase config push --project-ref omvvgywjyuoqjjfpbpsy
   ```
5. **Datos de prueba**:
   ```bash
   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/staging/semilla.sql
   ```
6. Avísale a Claude: redeploya una vista previa y comprueba los puntos de «Done when» del spec
   (`docs/superpowers/specs/2026-11-08-staging-design.md`).
