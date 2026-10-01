# create-wav-app

Template oficial para nuevos proyectos de Federico / WAV.

## Uso

No clones este repo directamente. Usa el wizard `wnew`:

```bash
wnew
```

El wizard te preguntará nombre + tipo, clonará este template a `~/Projects/<nombre>`, personalizará `CLAUDE.md`, y abrirá Claude Code para iniciar brainstorming.

## Stack incluido

- **Next.js 16** (App Router) + **TypeScript** strict
- **Tailwind v4** (sin config JS, runtime CSS)
- **Biome** (linter + formatter)
- **Supabase** (clients para browser, server component, server action)
- **Animation pack**: GSAP + ScrollTrigger + Lenis + Three.js + R3F + Drei + Framer Motion + Lottie
- **Testing**: Vitest (unit) + Playwright (E2E)
- **CI**: GitHub Actions con docs-only workflow para PRs de documentación

## Filosofía

**Todo preinstalado.** Las deps que no usas no estorban: son 50 MB de `node_modules`, irrelevantes para producción. El bundle final solo incluye lo que importas. Eliminar deps después es trivial; agregarlas con consistencia con el resto del setup es lo que paga.

## Estructura

```
create-wav-app/
├── app/                    # Next.js App Router
├── components/ui/          # shadcn primitives (vacío, llenar con pnpm dlx shadcn@latest add ...)
├── lib/
│   ├── supabase/           # browser/server/action clients
│   ├── animation/          # GSAP + Lenis helpers
│   └── utils.ts            # cn() helper
├── tests/
│   ├── unit/               # Vitest
│   └── e2e/                # Playwright
├── .claude/
│   └── CLAUDE.md.template  # wnew lo personaliza al crear proyecto
├── .github/workflows/
│   ├── ci.yml
│   └── docs-only.yml
└── .env.example
```

## pnpm 11

Este template usa la sintaxis nueva de pnpm 11 en `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  sharp: true
  '@biomejs/biome': true
  unrs-resolver: true
```

Si copias esto a un proyecto con pnpm 10, usa la sintaxis legacy (`onlyBuiltDependencies` en package.json).

## Ver también

- `~/.claude/CLAUDE.md` — reglas universales
- Wizard `wnew` (Fase 3b del setup global)
