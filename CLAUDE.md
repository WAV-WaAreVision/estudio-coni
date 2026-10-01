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
- Animation: GSAP, Lenis, Three R3F, Drei, Framer Motion, Lottie
- Biome (linter + formatter)
- Vitest (unit) + Playwright (E2E)
- pnpm 11+ / Node 24+

## Comandos

```bash
pnpm dev              # dev server (Turbopack)
pnpm build            # production build
pnpm test             # vitest watch
pnpm test:run         # vitest single run (CI)
pnpm test:e2e         # playwright
pnpm lint             # biome check
pnpm format           # biome format --write
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

(Edita esta sección cuando descubras traps específicos.)

- TBD

## Reference

- Global rules: `~/.claude/CLAUDE.md`
- Agents universales: `~/.claude/agents/`
- Plans/specs de este proyecto: `docs/superpowers/`
