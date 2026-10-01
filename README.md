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

## Layout

- `lib/dominio/`: pure domain logic (no network, no database, no implicit clock).
- `lib/proveedores/`: providers (HeyGen, ElevenLabs, Anthropic, Meta, R2).
- `tests/unit/`: Vitest unit tests.
- `docs/superpowers/plans/`: build plans.

## Design

Decisions live in `~/Projects/coni-heygen/docs/designs/plataforma-coni.md`; the "Cambios aceptados"
section takes precedence over the body. `PRODUCT.md` and `DESIGN.md` sit next to it.
