# Staging (issue #7, phase 2c)

Decided by Federico on 2026-11-08: approve the persistent Supabase branch (~US$ 10/month) and point the Vercel PR previews
at it. No Cloudflare hosting (#6 stays out); the staging bucket lives in R2 like production's.

## Goal

Every PR preview runs against a copy of the schema with test data only, so Coni (or Federico) can sign, record and publish
freely on a preview without touching production data, money or her real accounts.

## What exists already (2026-11-08)

- Persistent branch `staging` of `estudio-coni`: ref `omvvgywjyuoqjjfpbpsy`, sa-east-1, created empty with every
  migration up to `20261109000200`. Cost US$ 0.01344/hour.
- Vercel Preview today points at **production**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are production values. Preview has no `TRIGGER_SECRET_KEY`, R2 keys or `RESEND_API_KEY`.
- Provider keys (Claude, Voyage, ElevenLabs, HeyGen, Meta, LinkedIn) live in the database (`guardar_secreto`), not in env.
  The staging branch has none, so nothing can spend or publish until someone saves a key there on purpose.

## Design

### 1. Database

- **Migrations on merge.** New workflow `.github/workflows/staging.yml`: on push to `main` that touches
  `supabase/migrations/**` (and on `workflow_dispatch`), run `supabase db push --db-url "$STAGING_DB_URL"`. Production
  stays a manual `db push` after merge, as today, so staging always gets a migration first.
- **Seed.** `supabase/staging/semilla.sql`, idempotent (`on conflict do nothing`), run by hand once and again whenever
  wanted (`psql "$STAGING_DB_URL" -f supabase/staging/semilla.sql`). It inserts the `ajustes` row and fixture content: a
  few materials with cards, pillars, ideas and pieces in every state Coni can open (gate 1, gate 2, rendering, failed,
  scheduled, published, carousel). No production copy (personal data, change 26). `supabase/seed.sql` stays as it is
  for local tests.
- **Users.** One `coni` (the index allows only one): Coni's real email, decided by Federico on 2026-11-08, so she reviews previews with her own sign-in; Vercel Preview `CORREO_CONI` is set to that email. Plus the `mantenedor`.
  Created by `scripts/staging-usuarios.ts` with the staging service role (Federico runs it from the macOS Terminal);
  no real email in a versioned file.
- **Auth.** `[remotes.staging]` in `supabase/config.toml` (project_id `omvvgywjyuoqjjfpbpsy`): `site_url` and
  `additional_redirect_urls` for the preview domains, sign-up off, OTP length as production, SMTP through Resend with
  the password read from `env(...)`. Applied with `supabase config push --project-ref omvvgywjyuoqjjfpbpsy`.

### 2. Vercel previews

Preview environment variables switch to staging:

| Variable | Value | Who sets it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | `https://omvvgywjyuoqjjfpbpsy.supabase.co` | Claude (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging publishable key | Claude (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role | Federico |
| `TRIGGER_SECRET_KEY` | Trigger `staging` secret key | Federico |
| `R2_BUCKET` | `estudio-coni-staging` | Claude |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | token scoped to the staging bucket | Federico |
| `RESEND_API_KEY` | same key; `AVISOS_CORREO_*` and `CORREO_CONI` Preview stay as they are | Federico |

The four Supabase variables change in one go (a staging URL with a production service role would fail every call).

**Guard (code, TDD).** On a Vercel preview (`VERCEL_ENV=preview`) the server refuses a `SUPABASE_URL` or
`NEXT_PUBLIC_SUPABASE_URL` that contains the production ref `mvfytttfxmzzjajecsch`, with a clear error. A forgotten
variable then fails loudly instead of writing to production.

### 3. Trigger.dev

- Environment `staging` of the same project, deployed with `--env staging`. Claude deploys staging without asking
  (decided by Federico on 2026-11-08: no real accounts there); production deploys keep needing his OK.
- Its env vars (Federico, dashboard): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (staging), `R2_*` (staging bucket),
  `RESEND_API_KEY`, `AVISOS_*`, `VAPID_*`. No `RESPALDO_DB_URL` (no nightly dump of staging) and no LinkedIn or Meta
  variables. The nightly backup step must skip cleanly without it.
- Precondition: the Trigger plan includes a `staging` environment. Checked before task 1.

### 4. R2

Bucket `estudio-coni-staging` (Claude creates it), same CORS as production's, and an API token limited to that bucket
(Federico creates it in the dashboard).

## Not in scope

- Staging for Ingesta (`conidolly-ingesta`): it keeps writing to production.
- Copying production data. PITR. Cloudflare hosting.

## Done when

1. A PR preview signs in with the staging Coni, shows the seed pieces and its writes land in staging, not in production
   (checked with a row count on both).
2. A migration merged to `main` reaches staging through the workflow.
3. A task started from a preview runs in Trigger `staging` and stores files in the staging bucket.
4. The preview guard has a unit test, and the full suite is green.
