# estudio-coni — Claude Code instructions

> Generado por wnew el 2026-10-01.
> Este archivo extiende `~/.claude/CLAUDE.md` (global). Lee ambos.

## Proyecto

**estudio-coni** es App móvil donde Coni del Rosario aprueba y publica el contenido de su avatar digital.

Tipo: **Web app autenticada (ERP-style)**

## Stack (igual a tu default global)

- Next.js 16 (App Router) + TypeScript strict
- Supabase (DB + Auth + Storage + RLS)
- Tailwind v4 + shadcn/ui
- Motion: solo CSS, feedback de estado de 150 a 250 ms (sin pack de animación)
- Biome (linter + formatter)
- Vitest (unit) + Playwright (E2E)
- pnpm 12.6 / Node 24

## Comandos

```bash
pnpm dev              # dev server (Turbopack)
pnpm build            # production build
pnpm type             # next typegen + tsc --noEmit
pnpm test             # vitest watch
pnpm test:run         # vitest single run (CI)
pnpm test:e2e         # playwright
pnpm lint             # biome check
pnpm format           # biome format --write
pnpm db:start         # local Supabase (Docker, ports 54420-54429)
pnpm db:reset         # rebuild the local database from migrations + seed
pnpm test:db          # integration tests against the local database
pnpm db:types         # regenerate lib/supabase/database.types.ts
```

## Workflow

Para features nuevas (recomendado):

1. `superpowers:brainstorming` para explorar el problema
2. `superpowers:writing-plans` para convertir en plan estructurado
3. `superpowers:subagent-driven-development` con TDD strict
4. `superpowers:requesting-code-review`
5. `superpowers:finishing-a-development-branch`

Para bugs o tweaks rápidos: invocar `triage-lead` agent (global).

## Hard rules de este proyecto

- **Mapa:** las decisiones viven en `~/Projects/coni-heygen/docs/designs/plataforma-coni.md`
  ("Cambios aceptados" manda sobre el cuerpo), `PRODUCT.md` y `DESIGN.md` del mismo directorio.
  Planes de construcción en `docs/superpowers/plans/`.
- **Capas:** `lib/dominio/` es puro (sin red, sin base, sin reloj implícito: la hora entra como
  parámetro). `lib/proveedores/` habla con HeyGen, ElevenLabs, Anthropic, Meta y R2.
- **Dos puertas humanas:** solo Coni aprueba (guion + voz en la puerta 1; video, texto y fecha en
  la puerta 2). Ninguna tarea con `service_role` escribe aprobaciones. Antes de gastar créditos de
  video o publicar, la tarea compara el artefacto actual con el aprobado (`puedeGrabar`,
  `puedePublicar`).
- **Nunca se publica a una hora no aprobada:** más de 30 min de atraso vuelve a aprobación.
- **Subtítulos:** el port de `coni.py` tiene goldens de 2 reels reales; si cambian, se regeneran
  con `coni.py` y se explica por qué en el commit.
- **Llaves fuera del repo** (`.env*` está ignorado). Fechas en UTC; se muestran en
  `America/Santiago`.
- **Textos para Coni:** español de Chile, tú, sin rayas largas (em dash). Colores y tipos solo desde
  los tokens de `DESIGN.md`.
- **Biome solo en modo seguro** (`biome check --write`); nunca `--unsafe`.

## Reference

- Global rules: `~/.claude/CLAUDE.md`
- Agents universales: `~/.claude/agents/`
- Plans/specs de este proyecto: `docs/superpowers/`
