# estudio-coni

Mobile web app where Coni del Rosario, a Chilean clinical psychologist, approves and publishes the
content of her AI avatar. Every video passes two human gates: Coni approves the script and voice
first, then the finished video, caption and publish date. Nothing is rendered or published without
her explicit approval.

## Requirements

- Node 24
- pnpm 12.6

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the Supabase values
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm type` | `next typegen` + `tsc --noEmit` |
| `pnpm test` | Vitest in watch mode |
| `pnpm test:run` | Vitest single run (CI) |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm lint` | Biome check (read only) |
| `pnpm check` | Biome check with safe fixes (`--write`) |
| `pnpm db:start` | Start the local Supabase stack (Docker) |
| `pnpm db:reset` | Rebuild the local database from `supabase/migrations` and `supabase/seed.sql` |
| `pnpm test:db` | Integration tests against the local database |
| `pnpm db:types` | Regenerate `lib/supabase/database.types.ts` |
| `pnpm test:eval` | Evals against the real Claude API (they cost money: skipped unless `RUN_EVALS=1` and `ANTHROPIC_API_KEY` are set) |

## Layout

- `app/`: the Next.js app. `app/ingreso/` signs in with an emailed code; `app/(app)/` is Coni's side (Inicio, Guion,
  Video, and the Server Actions in `app/(app)/piezas/acciones.ts`). `proxy.ts` refreshes the session.
- `components/`: screen components; `components/ui/` holds the base ones from `docs/DESIGN.md`.
- `lib/acciones/`: what the Server Actions do, with the database client and the Trigger.dev runs injected.
- `lib/dominio/`: pure domain logic (no network, no database, no implicit clock).
- `lib/proveedores/`: providers (HeyGen, ElevenLabs, Anthropic, Meta, R2).
- `lib/datos/`: mapping between database rows and the domain, and the typed reads and writes the tasks use.
- `lib/produccion/`: task orchestration with injected dependencies (`producirPieza`).
- `trigger/`: Trigger.dev v4 tasks, thin wrappers over `lib/produccion/`.
- `supabase/`: local stack config, migrations and the local-only seed.
- `tests/integration/`: tests that talk to the local database.
- `tests/e2e/`: Playwright on an iPhone-sized viewport against `next start` and the local stack.
- `tests/unit/`: Vitest unit tests. Every external HTTP call is intercepted by MSW (`tests/msw.ts`) and an unmocked one fails.
- `tests/eval/`: evals that call the real API.
- `docs/superpowers/plans/`: build plans.

## End-to-end tests

`pnpm test:e2e` builds the app, starts it on port 3200 and drives it with Playwright at 390 x 844. It needs the local
Supabase stack (`pnpm db:start`) and owns its database for the run: it empties `piezas` and `ideas`. Nothing real is
called: the sign-in code is read from the local mail catcher (port 54424), the runs the app would start in Trigger.dev
are written to `test-results/disparos.jsonl` (`DISPARO_DE_PRUEBA=1`, refused on Vercel) and the voice and video are two
small files served in place of the signed R2 links. Screenshots land in `test-results/capturas/`. If the Chromium this
Playwright version wants is not installed, set `PLAYWRIGHT_CHROMIUM_PATH` to one that is.

## Database

Postgres 17 through the Supabase CLI (Docker must be running). The ports are 54420 to 54429, so the stack
can run next to another Supabase project that uses the default 54321 to 54324.

```bash
pnpm db:start    # first run pulls images and can take several minutes
pnpm db:reset    # migrations + seed (three @estudio.test users: Coni, a maintainer, an unrelated user)
pnpm test:db     # integration tests, one file at a time
pnpm db:types    # regenerate lib/supabase/database.types.ts after changing a migration
```

The database enforces the two human gates on its own: only Coni can approve or move a piece into
`en_render` or `programado`, every write is audited with its actor, the monthly spend cap is reserved
atomically (`reservar_gasto`) and Coni's API keys live in Vault, readable only by `service_role`.
Set `SUPABASE_DB_URL` to point the tests at another database. The tests that run a task read the service-role
key of the local stack from `supabase status`, or from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when set.

## Design

Decisions live in `~/Projects/coni-heygen/docs/designs/plataforma-coni.md`; the "Cambios aceptados"
section takes precedence over the body. `PRODUCT.md` and `DESIGN.md` sit next to it.
