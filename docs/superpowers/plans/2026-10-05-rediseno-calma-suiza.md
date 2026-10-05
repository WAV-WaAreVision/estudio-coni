# Rediseño «Calma suiza» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin and restructure the Conidolly app to the approved «Calma suiza» design system (warm stone + ink, Geist, raspberry only on the signature), screen by screen, without changing any flow, data, server action or (unless the brandkit says so) any visible copy.

**Architecture:** Phase 1 swaps the token layer in `app/globals.css` for `final/tokens.css` with transition aliases, so the whole app turns stone/ink/Geist in one reversible commit. Phase 2 rebuilds the shared primitives in `components/` and `components/ui/` against the brandkit sections (9.x). Phase 3 recomposes each screen from those primitives following the mockups. Phase 4 adds a guard rail (static scans, axe, 44 px targets, `toHaveScreenshot` baselines at 390 px). Phase 5 deletes the aliases and ships to Vercel.

**Tech Stack:** Next.js 16.2 (App Router, RSC), React 19.2, Tailwind v4 (`@theme inline`), `geist` (font), `@phosphor-icons/react` (icons), Vitest + Testing Library (jsdom), Playwright 1.59 (Chromium at 390 x 844), `@axe-core/playwright` (new, dev), Biome 2.2 (safe mode only).

---

## 0. Read before starting

**Sources of truth (copied into the repo in Task 0, so the plan never points outside it):**

| What | Repo path after Task 0 | Original |
|---|---|---|
| Brandkit (every component spec, sections 0 to 13) | `docs/rediseno/brandkit.md` | `~/Projects/conidolly-rediseno/final/brandkit.md` |
| Tokens (light, dark, reduced motion) | `docs/rediseno/tokens.css` | `final/tokens.css` |
| Token migration map (old name -> new name, usage counts) | `docs/rediseno/mapeo-tokens.md` | `final/mapeo-tokens.md` |
| Mockups (HTML + PNG, 13 boards) | `docs/rediseno/pantallas/*.{html,png}` | `final/pantallas/` |
| Audit synthesis (non-negotiables, sección 3) | `docs/rediseno/sintesis.md` | `auditoria/sintesis.md` |
| Copy inventory | `docs/rediseno/inventario.md` | `inventario.md` |

The mockup PNGs are **boards**, not screenshots: each one stacks several states with grey caption bands
(«1 · AL ABRIR», «2 · LO VISTE COMPLETO»…) and `calendario.png` is three phones side by side (1242 px wide).
They cannot be pixel-diffed against the app. See Task 33 for the approach.

**Non-negotiables (from `sintesis.md` §3, enforced by tests in this plan):**
- Only dragging the thumb approves. A tap on the track never approves (today it does: `input type=range`).
- Raspberry (`firma`) appears only on the approve slider and the committed date «sale el …».
- Destructive actions are never filled, never raspberry; confirmed in line or undoable.
- Cost and balance next to every spending action, left aligned, tabular. Blocks as `aviso` status lines.
- WCAG 2.2 AA text, 3:1 control outlines, 44 px targets, 18 px base, reduced motion, safe areas, `dvh` only.

**House rules for every task:**
- TDD where there is logic. Pure styling tasks verify with (a) a component test of semantics and ARIA, never of class names except where the class *is* the contract (e.g. `min-h-13`), and (b) a screenshot review step.
- No hex literals in `app/**` or `components/**` (except `lib/diseno/marca.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, which receive their colours from `marca.ts`). Enforced from Task 1 by `tests/unit/diseno-reglas.test.ts`.
- No `as any`, no `@ts-expect-error`.
- Biome: `pnpm check` (safe `--write`) only. Never `--unsafe`. After any task that edits imports, run the `"use client"` check (Task 1 adds it to the rules test) and **load the real route** (`pnpm build && pnpm start`, or the e2e run) before committing: type + build stay green when a client component loses its directive (hard-won lesson, `~/.claude/rules/hard-won-lessons.md`).
- Copy: es-CL, tú, no em dash (U+2014) and no en dash used as a dash. Visible labels change **only** where the brandkit says so; each such change is listed in the task and the e2e spec is updated in the same commit.
- One commit per task, message in English, ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After each task: `pnpm test:run && pnpm lint && pnpm type`. After each Phase 3 task also run the e2e spec of that screen (`pnpm test:e2e tests/e2e/<pantalla>.spec.ts`), which needs `supabase start` (no migrations in this plan).

**Commands:**
```bash
pnpm test:run                                  # unit (jsdom)
pnpm lint && pnpm type                         # biome + next typegen + tsc
pnpm test:e2e tests/e2e/guion.spec.ts          # one e2e spec (needs `supabase start`)
pnpm test:e2e tests/e2e/visual.spec.ts         # screenshots (Task 33)
pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots   # only after a reviewed visual change
```

---

## File structure

**New files**

| File | Responsibility |
|---|---|
| `docs/rediseno/**` | Design sources (Task 0) |
| `tests/unit/diseno-reglas.test.ts` | Static scans: no hex, no em dash, `firma` only where allowed, `"use client"` first line, no `lucide-react` (after Task 5), no old tokens (after Task 34) |
| `lib/diseno/deslizador.ts` | Pure slider math: progress from a drag, approval on release |
| `components/ui/linea-de-estado.tsx` | Status line (brandkit 9.6), replaces `Nota` |
| `components/ui/confirmacion-en-linea.tsx` | In-line confirmation (9.5): spend, destructive, neutral |
| `components/ui/filas.tsx` | `FilaNavegacion`, `FilaConValor`, `FilaConInterruptor`, `FilaConCheck` (9.3) |
| `components/ui/interruptor.tsx` | Switch, `role=switch` (9.10) |
| `components/ui/casilla.tsx` | Round checkbox (9.10) |
| `components/ui/pestanas.tsx` | View tabs as links with `aria-current` (9.10), replaces `Segmentado` in Calendario |
| `components/ui/costo.tsx` | `CostoDeAccion` (amount 24/600 + unit) and `LineaDeSaldo` (9.14) |
| `components/ui/medidor.tsx` | Monthly spend meter, `aviso` from 80 % (9.15) |
| `components/ui/barra-de-firma.tsx` | The fixed elevated bar of Guion and Video (9.13) |
| `components/ui/punto-trabajando.tsx` | The 8 px pulsing "working" dot (8, 9.3) |
| `components/ui/wordmark.tsx` | `conidolly` with the raspberry dot (2) |
| `lib/diseno/medidor.ts` | Pure: meter tone from spent / cap |
| `app/(app)/ajustes/cuentas/page.tsx` | «Cuentas conectadas» as its own level (9.21) |
| `tests/e2e/visual.spec.ts` | `toHaveScreenshot` at 390 px per screen (Task 33) |
| `tests/e2e/accesibilidad.spec.ts` | axe WCAG 2.x AA + 44 px targets per screen (Task 32) |
| `tests/e2e/visual.spec.ts-snapshots/` | Baselines (committed, darwin only) |
| `scripts/hoja-de-comparacion.ts` | Builds a side-by-side review sheet: app capture next to the mockup board (Task 33) |

**Modified (main ones; each task lists its exact files):** `app/globals.css`, `app/layout.tsx`, `lib/diseno/marca.ts`, `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/l/page.tsx`, every `components/*.tsx` and `components/ui/*.tsx`, every screen under `app/(app)/**` and `app/ingreso/**`, `package.json`, `playwright.config.ts`, and the unit and e2e tests named in each task.

**Deleted (Task 34):** `components/nota.tsx`, `components/ui/pildora-pilar.tsx`, `components/ui/segmentado.tsx`, `components/chip-de-alerta.tsx`, `components/panel-de-comparacion.tsx` (folded into Métricas), `tests/unit/ui-pildora-pilar.test.tsx`, the `.deslizador` CSS and all alias tokens.

---

## Phase 0. Design sources in the repo

### Task 0: Import the design sources

**Files:**
- Create: `docs/rediseno/brandkit.md`, `docs/rediseno/tokens.css`, `docs/rediseno/mapeo-tokens.md`, `docs/rediseno/sintesis.md`, `docs/rediseno/inventario.md`, `docs/rediseno/pantallas/*.html`, `docs/rediseno/pantallas/*.png`, `docs/rediseno/img/look-estudio.jpg`, `docs/rediseno/img/look-terraza.jpg`

- [ ] **Step 1: Copy**

```bash
R=~/Projects/conidolly-rediseno
mkdir -p docs/rediseno/pantallas docs/rediseno/img
cp $R/final/brandkit.md $R/final/tokens.css $R/final/mapeo-tokens.md docs/rediseno/
cp $R/auditoria/sintesis.md $R/inventario.md docs/rediseno/
cp $R/final/pantallas/*.html $R/final/pantallas/*.png docs/rediseno/pantallas/
cp $R/final/img/*.jpg docs/rediseno/img/
du -sh docs/rediseno   # expect about 7 MB
```

The HTML mockups reference `../tokens.css`, `../fonts/` and `../img/`; `tokens.css` and `img/` sit at the same relative place. The font is not copied (it comes from `geist` in Task 2), so the mockup HTML falls back to the system font when opened from the repo; the PNGs are the reference.

- [ ] **Step 2: Commit**

```bash
git add docs/rediseno
git commit -m "docs: add the approved Calma suiza design sources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 1. Tokens, fonts, brand, dark mode

### Task 1: New tokens with transition aliases, plus the design rules test

Implements `mapeo-tokens.md` §10 step 1 («piel sin tocar la estructura»): new values, old names kept as aliases so every existing class still compiles.

**Files:**
- Create: `tests/unit/diseno-reglas.test.ts`
- Modify: `app/globals.css` (whole file)

- [ ] **Step 1: Write the failing rules test**

```ts
// tests/unit/diseno-reglas.test.ts
// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = join(__dirname, "..", "..")

function archivos(carpeta: string, extensiones: readonly string[]): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(join(RAIZ, carpeta))) {
    const ruta = join(carpeta, nombre)
    if (statSync(join(RAIZ, ruta)).isDirectory()) salida.push(...archivos(ruta, extensiones))
    else if (extensiones.some((ext) => nombre.endsWith(ext))) salida.push(ruta)
  }
  return salida
}

const CODIGO = [...archivos("app", [".tsx", ".ts"]), ...archivos("components", [".tsx", ".ts"])]
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf-8")

// Files that must carry literal colours because the OS reads them before any CSS (marca.ts feeds them).
const CON_COLOR_LITERAL = new Set(["app/icon.tsx", "app/apple-icon.tsx"])

describe("design rules", () => {
  it("has no hex colour literal in app/ or components/", () => {
    const culpables = CODIGO.filter((ruta) => !CON_COLOR_LITERAL.has(ruta)).filter((ruta) =>
      /["'`\s(]#[0-9a-fA-F]{3,8}\b/.test(leer(ruta)),
    )
    expect(culpables).toEqual([])
  })

  it("has no em dash in app/ or components/", () => {
    const culpables = CODIGO.filter((ruta) => leer(ruta).includes("\u2014"))
    expect(culpables).toEqual([])
  })

  it("keeps 'use client' as the very first line of every client module", () => {
    const culpables = CODIGO.filter((ruta) => leer(ruta).includes('"use client"')).filter(
      (ruta) => !leer(ruta).startsWith('"use client"'),
    )
    expect(culpables).toEqual([])
  })

  it("defines every Calma suiza token in globals.css", () => {
    const css = leer("app/globals.css")
    for (const token of ["--fondo: #f7f6f3", "--tinta: #1d1b18", "--firma: #a8285a", "--campo: #8a847b", "--pista: #ebe8e2"]) {
      expect(css).toContain(token)
    }
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(':root[data-theme="dark"]')
  })

  it("lists the files it scans (sanity: the walk found code)", () => {
    expect(CODIGO.map((ruta) => relative(".", ruta)).length).toBeGreaterThan(50)
  })
})
```

- [ ] **Step 2: Run it, expect the token test to FAIL** (`--fondo: #f7f6f3` missing) and the other three to pass. If the hex test fails today, list the offenders in the commit message and fix them in this task (replace with the token class).

Run: `pnpm vitest run tests/unit/diseno-reglas.test.ts`

- [ ] **Step 3: Rewrite `app/globals.css`**

Structure, top to bottom:
1. `@import "tailwindcss";`
2. The `:root`, dark (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`), `:root[data-theme="dark"]` and reduced-motion blocks from `docs/rediseno/tokens.css`, **verbatim, without the `@font-face`** (Geist comes from `next/font` in Task 2). Replace `--letra: "Geist", …` with `--letra: var(--font-geist-sans), ui-sans-serif, -apple-system, system-ui, sans-serif;`.
3. Transition aliases (removed in Task 34):

```css
/* Transition aliases (mapeo-tokens.md §10.1). Removed in Task 34 of the redesign plan. */
:root {
  --hundido: var(--pista);
  --acento: var(--tinta);
  --acento-profundo: var(--tinta);
  --acento-suave: var(--pista);
  --acento-claro: var(--sobre-tinta);
  --sobre-acento: var(--sobre-principal);
  --ok-tinta: var(--exito);
  --ok-fondo: var(--fondo);
  --aviso-tinta: var(--aviso);
  --aviso-fondo: var(--fondo);
  --error-tinta: var(--error);
  --error-fondo: var(--fondo);
}
[data-pilar] {
  --p-tinte: var(--fondo);
  --p-tinte-fuerte: var(--pista);
  --p-tinta: var(--apagado);
  --p-punto: var(--apagado);
}
```

Note `:root` aliases must come **after** the dark block in source order is irrelevant: they reference the variables, so they follow the theme automatically.

4. `@theme inline` = the block of `mapeo-tokens.md` §9 **without** the four `initial` lines (they arrive in Task 34), **plus** the old names so existing classes compile:

```css
  --color-hundido: var(--hundido);
  --color-acento: var(--acento);
  --color-acento-profundo: var(--acento-profundo);
  --color-acento-suave: var(--acento-suave);
  --color-acento-claro: var(--acento-claro);
  --color-sobre-acento: var(--sobre-acento);
  --color-ok-tinta: var(--ok-tinta);
  --color-ok-fondo: var(--ok-fondo);
  --color-aviso-tinta: var(--aviso-tinta);
  --color-aviso-fondo: var(--aviso-fondo);
  --color-error-tinta: var(--error-tinta);
  --color-error-fondo: var(--error-fondo);
  --color-pilar-tinte: var(--p-tinte);
  --color-pilar-tinte-fuerte: var(--p-tinte-fuerte);
  --color-pilar-tinta: var(--p-tinta);
  --color-pilar-punto: var(--p-punto);
  --font-serif: var(--font-sans);
  --radius-sm: var(--r-12);
  --radius-md: var(--r-12);
  --radius-lg: var(--r-12);
  --radius-xl: var(--r-12);
  --text-display: var(--t-pantalla);
  --text-display--line-height: var(--i-pantalla);
  --text-title: var(--t-pieza);
  --text-title--line-height: var(--i-pieza);
  --text-script: var(--t-guion);
  --text-script--line-height: var(--i-guion);
  --text-body: var(--t-cuerpo);
  --text-body--line-height: var(--i-cuerpo);
  --text-label: var(--t-meta);
  --text-label--line-height: var(--i-meta);
  --shadow-flotante: var(--sombra-flotante);
  --ease-fuerte: var(--curva-salida);
```

Until Task 2 lands, `--font-sans` in `@theme` reads `var(--font-geist-sans), ui-sans-serif, …`; `--font-geist-sans` is undefined, so the system font shows. That is expected for one commit.

5. Global rules, rewritten per `mapeo-tokens.md` §6:

```css
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--fondo);
  color: var(--tinta);
  font-family: var(--letra);
  font-size: var(--t-cuerpo);
  line-height: var(--i-cuerpo);
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid transparent; box-shadow: var(--anillo-foco); }
.aviso { transition: transform var(--dur-media) var(--curva-salida), opacity var(--dur-media) var(--curva-salida); }
@starting-style { .aviso { transform: translateY(8px); opacity: 0; } }
@keyframes latido { 50% { opacity: 0.55; } }
.esqueleto { animation: latido var(--latido) ease-in-out infinite; background: var(--pista); border-radius: var(--r-circulo); }
@keyframes trabajando { 50% { opacity: 0.25; } }
.punto-trabajando { animation: trabajando var(--latido) ease-in-out infinite; }
.carta-idea { transition: transform var(--dur-larga) var(--curva-salida), opacity var(--dur-larga) var(--curva-salida); }
@starting-style { .carta-idea { transform: translateY(8px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .esqueleto, .punto-trabajando { animation: none; }
  @starting-style { .aviso, .carta-idea { transform: none; } }
}
body:has([data-superficie="marca"]) { background: var(--firma); }
```

Keep the existing `.deslizador` block but change the thumb background from `var(--acento)` to `var(--firma)` and the track from `var(--acento-suave)` to `var(--pista)` (it dies in Task 12).

- [ ] **Step 4: Run** `pnpm vitest run tests/unit/diseno-reglas.test.ts` -> PASS. Then `pnpm test:run && pnpm lint && pnpm type`.

- [ ] **Step 5: Look at the real app.** `pnpm build && pnpm start`, open `/ingreso`, `/`, a guion and `/l` at 390 px. Expected: stone background, ink text, ink primary buttons, raspberry only on the slider thumb and on `/l`. Save captures to `test-results/capturas/` for the PR (do not commit them).

- [ ] **Step 6: Commit** `feat(diseno): swap to Calma suiza tokens behind transition aliases`

### Task 2: Geist through `next/font`

**Files:**
- Modify: `package.json` (add `geist`), `app/layout.tsx`
- Test: `tests/e2e/accesibilidad.spec.ts` gets its first test here (created now, extended in Task 32)

- [ ] **Step 1: Install** `pnpm add geist`. Confirm `node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2` exists and that `geist/font/sans` exports `GeistSans` with `.variable === "--font-geist-sans"` (read `node_modules/geist/dist/sans.js`). If the variable name differs, use the real name in Task 1's `--letra` and `--font-sans` and in this test.

- [ ] **Step 2: Write the failing e2e test**

```ts
// tests/e2e/accesibilidad.spec.ts
import { expect, test } from "@playwright/test"

test("the app text is set in Geist, one family", async ({ page }) => {
  await page.goto("/")
  const familia = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(familia).toMatch(/Geist/i)
  expect(familia).not.toMatch(/Hanken|Young/i)
  // The approx sign is in the npm Geist and not in the Google subset (brandkit §4).
  const cargada = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].some((f) => /geist/i.test(f.family) && f.status === "loaded")
  })
  expect(cargada).toBe(true)
})
```

Run: `pnpm test:e2e tests/e2e/accesibilidad.spec.ts` -> FAIL (`Hanken` in the family).

- [ ] **Step 3: Edit `app/layout.tsx`**

```tsx
import { GeistSans } from "geist/font/sans"
// remove: import { Hanken_Grotesk, Young_Serif } from "next/font/google" and the two consts
…
<html lang="es-CL" className={GeistSans.variable}>
```

- [ ] **Step 4: Run** the e2e test -> PASS. `pnpm build` must not fetch Google Fonts any more (`grep -r fonts.googleapis .next/server | wc -l` -> 0).

- [ ] **Step 5: Commit** `feat(diseno): set the app in Geist from the geist package`

### Task 3: Brand constants, theme-color per scheme, manifest, app icon

**Files:**
- Modify: `lib/diseno/marca.ts`, `app/layout.tsx` (`viewport`), `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/l/page.tsx` (only its `themeColor`), `tests/unit/manifest.test.ts`
- Create: `tests/unit/marca.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/unit/marca.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { viewport } from "@/app/layout"
import { COLOR_DE_FIRMA, COLOR_DE_FONDO, COLOR_DE_FONDO_OSCURO, COLOR_SOBRE_FIRMA, COLOR_DE_TINTA } from "@/lib/diseno/marca"

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf-8")

describe("brand constants", () => {
  it("repeat the light and dark page colours and the signature of globals.css", () => {
    expect(css).toContain(`--fondo: ${COLOR_DE_FONDO}`)
    expect(css).toContain(`--fondo: ${COLOR_DE_FONDO_OSCURO}`)
    expect(css).toContain(`--firma: ${COLOR_DE_FIRMA}`)
    expect(css).toContain(`--superficie: ${COLOR_SOBRE_FIRMA}`)
    expect(css).toContain(`--tinta: ${COLOR_DE_TINTA}`)
  })

  it("gives iOS one theme-color per colour scheme and allows dark", () => {
    expect(viewport.colorScheme).toBe("light dark")
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: COLOR_DE_FONDO },
      { media: "(prefers-color-scheme: dark)", color: COLOR_DE_FONDO_OSCURO },
    ])
  })
})
```

Run -> FAIL (missing exports).

- [ ] **Step 2: Implement**

```ts
// lib/diseno/marca.ts
// The manifest, the viewport and the icons are read by the OS before any stylesheet loads, so they need literal
// colours. They repeat app/globals.css (tests/unit/marca.test.ts keeps them in sync).
export const COLOR_DE_FONDO = "#f7f6f3"
export const COLOR_DE_FONDO_OSCURO = "#161513"
export const COLOR_DE_TINTA = "#1d1b18"
export const COLOR_DE_FIRMA = "#a8285a"
export const COLOR_SOBRE_FIRMA = "#fcfbf9"
export const NOMBRE_DE_LA_APP = "Conidolly"
export const URL_DE_LA_APP = "https://conidolly.vercel.app"
```

`app/layout.tsx` viewport: `themeColor: [{ media: "(prefers-color-scheme: light)", color: COLOR_DE_FONDO }, { media: "(prefers-color-scheme: dark)", color: COLOR_DE_FONDO_OSCURO }]`, `colorScheme: "light dark"`.

`app/l/page.tsx`: `COLOR_DE_ACENTO` -> `COLOR_DE_FIRMA`. `app/manifest.ts` unchanged (it already uses `COLOR_DE_FONDO`; the manifest test keeps passing).

`app/icon.tsx` (512) and `app/apple-icon.tsx` (180), brandkit §2: square in `COLOR_DE_TINTA`, lowercase «c» Geist 600 in `COLOR_DE_FONDO`, a `COLOR_DE_FIRMA` circle at x-height to its right. `ImageResponse` needs the font as data:

```tsx
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { COLOR_DE_FIRMA, COLOR_DE_FONDO, COLOR_DE_TINTA } from "@/lib/diseno/marca"

export const size = { width: 512, height: 512 }
export const contentType = "image/png"

// The app mark (brandkit §2): a lowercase c in Geist and the raspberry dot that signs. It does not follow the theme.
export default async function Icono() {
  const geist = await readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf"))
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 20, background: COLOR_DE_TINTA }}>
      <span style={{ fontFamily: "Geist", fontWeight: 600, fontSize: 330, lineHeight: 1, color: COLOR_DE_FONDO }}>c</span>
      <span style={{ width: 72, height: 72, borderRadius: 999, background: COLOR_DE_FIRMA, marginTop: 110 }} />
    </div>,
    { ...size, fonts: [{ name: "Geist", data: geist, weight: 600, style: "normal" }] },
  )
}
```

Before writing, `ls node_modules/geist/dist/fonts/geist-sans/` and use the real static 600 file name (`ImageResponse` does not take woff2; it takes ttf/otf/woff). `apple-icon.tsx` is the same with `size = { width: 180, height: 180 }` and every dimension scaled by 180/512 (fontSize 116, gap 7, dot 25, marginTop 39). Verify `outputFileTracingIncludes` is not needed: run `pnpm build && pnpm start` and `curl -s localhost:3000/icon -o /tmp/icon.png`; if it 500s on Vercel-style tracing, add `outputFileTracingIncludes: { "/icon": ["node_modules/geist/dist/fonts/**"], "/apple-icon": [same] }` to `next.config.ts` (check `tests/unit/next-config.test.ts` still passes).

- [ ] **Step 3: Run** `pnpm vitest run tests/unit/marca.test.ts tests/unit/manifest.test.ts` -> PASS. Grep: `grep -rn "COLOR_DE_ACENTO\|COLOR_SOBRE_ACENTO" app components lib` -> nothing.

- [ ] **Step 4: Look:** open `/icon` and `/apple-icon` in the browser; compare with brandkit §2 (ink square, light «c», raspberry dot at x-height).

- [ ] **Step 5: Commit** `feat(marca): stone theme-color per scheme and the c-and-dot app icon`

### Task 4: Dark mode is wired and stays AA

**Files:**
- Modify: `tests/e2e/accesibilidad.spec.ts`

Dark mode already compiles from Task 1. This task proves it.

- [ ] **Step 1: Test**

```ts
test("dark mode follows iOS and data-theme can force light", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await page.goto("/")
  const fondoOscuro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(fondoOscuro).toBe("rgb(22, 21, 19)") // #161513
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"))
  const fondoForzado = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(fondoForzado).toBe("rgb(247, 246, 243)") // #f7f6f3
})
```

- [ ] **Step 2: Run** -> PASS (if it fails, the dark block was pasted wrong in Task 1: fix there).
- [ ] **Step 3: Look** at `/`, a guion and a video in dark (`page.emulateMedia`), confirm titles at 500, principal `#d6d2cb`, video not dimmed. Note anything that still uses an alias that reads wrong in dark (for example `bg-tinta/65` overlays): those are fixed by their component task, list them in the commit body.
- [ ] **Step 4: Commit** `test(diseno): dark mode follows the system and can be forced`

### Task 5: Phosphor replaces Lucide

**Files:**
- Modify: `package.json` (add `@phosphor-icons/react`, remove `lucide-react`), the 16 files that import `lucide-react` (`grep -rl lucide-react app components`), `tests/unit/diseno-reglas.test.ts`

- [ ] **Step 1: Failing rule** (append to `diseno-reglas.test.ts`):

```ts
  it("draws icons with Phosphor only, through the SSR entry in server modules", () => {
    expect(CODIGO.filter((ruta) => leer(ruta).includes("lucide-react"))).toEqual([])
    const servidorConIconoCliente = CODIGO.filter(
      (ruta) => !leer(ruta).startsWith('"use client"') && /from "@phosphor-icons\/react"/.test(leer(ruta)),
    )
    expect(servidorConIconoCliente).toEqual([])
  })
```

Run -> FAIL.

- [ ] **Step 2: Swap.** `pnpm add @phosphor-icons/react && pnpm remove lucide-react`. Mapping (mapeo §7 and brandkit §7): `House`->`House`, `ChartColumn`->`ChartBar`, `Settings`->`GearSix`, `ChevronLeft`->`CaretLeft`, `ChevronRight`->`CaretRight`, `Search`->`MagnifyingGlass`, `Plus`, `Minus`, `Play`/`Pause` -> same with `weight="fill"`, `ExternalLink`->`ArrowUpRight`, `ArrowRight`, `Check`, `Share`->`Export`, `SquarePlus`->`PlusSquare`. Lucide's `size`/`strokeWidth` -> Phosphor `size` (20 next to 18 text, 16 next to 15, 24 in nav) and no stroke width (Regular weight). Client modules import from `@phosphor-icons/react`; server modules (no `"use client"`) from `@phosphor-icons/react/dist/ssr` (the default entry uses React context and breaks in RSC).
- [ ] **Step 3:** `pnpm test:run && pnpm lint && pnpm type`, then the client-directive check is in the rules test; then `pnpm build && pnpm start` and load `/`, `/ideas`, `/calendario`, `/metricas`, `/ajustes`, `/guion/<id>`, `/video/<id>` (or run the whole e2e suite) to catch RSC boundary errors at request time.
- [ ] **Step 4: Commit** `refactor(iconos): switch from Lucide to Phosphor regular`

---

## Phase 2. Primitives

Every primitive: a unit test of behaviour and semantics first; classes only where they are the contract.

### Task 6: Buttons (principal, secundaria, texto, destructiva)

Brandkit 9.4. Keep the prop names already used across the app (`primario`, `linea`, `callado`) to avoid churn, add `destructiva`, left-aligned label with an optional trailing icon.

**Files:**
- Modify: `components/ui/clases-de-boton.ts`, `components/ui/boton.tsx`, `tests/unit/ui-boton.test.tsx`

- [ ] **Step 1: Add failing tests** to `tests/unit/ui-boton.test.tsx`:

```tsx
  it("puts the label on the left and the icon that says what happens on the right", () => {
    render(<Boton icono={<span data-testid="icono" />}>Grabar video</Boton>)
    const boton = screen.getByRole("button", { name: "Grabar video" })
    expect(boton).toHaveClass("justify-between")
    expect(boton.lastElementChild).toBe(screen.getByTestId("icono"))
  })

  it("draws a destructive action as text in the error ink, never filled", () => {
    render(<Boton variante="destructiva">Pedir cambios</Boton>)
    const boton = screen.getByRole("button", { name: "Pedir cambios" })
    expect(boton).toHaveClass("text-error")
    expect(boton.className).not.toMatch(/\bbg-(principal|firma|error)\b/)
  })

  it("swaps the icon for the working dot while loading", () => {
    render(<Boton cargando icono={<span data-testid="icono" />}>Guardando…</Boton>)
    expect(screen.queryByTestId("icono")).toBeNull()
    expect(screen.getByRole("button", { name: "Guardando…" }).querySelector(".punto-trabajando")).not.toBeNull()
  })
```

Run -> FAIL.

- [ ] **Step 2: Implement**

```ts
// components/ui/clases-de-boton.ts
// Not a client module: Server Components use these classes too, for links that look like buttons.
import { cva } from "class-variance-authority"

/** Brandkit 9.4: one principal per view, label on the left, icon on the right. */
export const clasesDeBoton = cva(
  [
    "inline-flex items-center gap-3 rounded-12 text-left text-cuerpo font-semibold",
    "transition-[transform,opacity] duration-[var(--dur-corta)] ease-salida active:scale-[0.98]",
    "aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 motion-reduce:active:scale-100",
  ],
  {
    variants: {
      variante: {
        primario:
          "justify-between bg-principal px-4 text-sobre-principal [@media(hover:hover)]:hover:opacity-92 aria-disabled:bg-pista aria-disabled:text-apagado aria-disabled:hover:opacity-100",
        linea: "justify-between border border-campo px-4 text-tinta aria-disabled:border-linea aria-disabled:text-apagado",
        callado: "justify-start text-tinta aria-disabled:text-apagado",
        destructiva: "justify-start text-error aria-disabled:text-apagado",
      },
      tamano: {
        grande: "min-h-13",
        chico: "min-h-11",
      },
      ancho: { completo: "w-full", contenido: "w-auto" },
    },
    compoundVariants: [
      { variante: "primario", tamano: "grande", ancho: undefined, class: "w-full" },
    ],
    defaultVariants: { variante: "primario", tamano: "grande" },
  },
)
```

`boton.tsx` gets `icono?: ReactNode`, renders `<span>{children}</span>` and, after it, `cargando ? <PuntoTrabajando /> : icono`. `PuntoTrabajando` comes from Task 19; create it now (it is 6 lines) in `components/ui/punto-trabajando.tsx`:

```tsx
/** The 8 px dot that pulses while something real is happening (brandkit §8). Still under reduced motion. */
export function PuntoTrabajando() {
  return <span aria-hidden="true" className="punto-trabajando inline-block size-2 shrink-0 rounded-full bg-current" />
}
```

Old classes `text-[1.0625rem]`, `px-4.5`, `rounded-md` disappear. The existing «is 52 px tall» and «44 px when small» tests keep passing (`min-h-13`, `min-h-11`).

- [ ] **Step 3: Run** `pnpm vitest run tests/unit/ui-boton.test.tsx` -> PASS; full `pnpm test:run` (other component tests may assert old classes; fix the assertion to the semantic one, never the other way).
- [ ] **Step 4: Look** at Inicio (`Escribir 3 guiones`) and Ingreso: label left, ink fill.
- [ ] **Step 5: Commit** `feat(ui): Calma suiza buttons with a destructive variant`

### Task 7: Status line (replaces `Nota`)

Brandkit 9.6.

**Files:**
- Create: `components/ui/linea-de-estado.tsx`, `tests/unit/ui-linea-de-estado.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"

describe("LineaDeEstado", () => {
  it("interrupts with role=alert when it is an error", () => {
    render(<LineaDeEstado tipo="error" titulo="No pude cargar esta pantalla." detalle="Puede ser la conexión." />)
    expect(screen.getByRole("alert")).toHaveTextContent("No pude cargar esta pantalla.Puede ser la conexión.")
  })

  it("waits politely (status) for the other tones", () => {
    render(<LineaDeEstado tipo="exito" titulo="Guardado" />)
    expect(screen.getByRole("status")).toHaveTextContent("Guardado")
  })

  it("colours the title when it is the state itself and keeps a message in ink", () => {
    const { rerender } = render(<LineaDeEstado tipo="exito" titulo="Lo viste completo" />)
    expect(screen.getByText("Lo viste completo")).toHaveClass("text-exito")
    rerender(<LineaDeEstado tipo="aviso" rotulo="Para confirmar:" titulo="La fuente es débil." tituloEnTinta />)
    expect(screen.getByText("Para confirmar:")).toHaveClass("text-aviso")
    expect(screen.getByText("La fuente es débil.")).toHaveClass("text-tinta")
  })

  it("never paints a background or a box", () => {
    const { container } = render(<LineaDeEstado tipo="aviso" titulo="Saldo bajo" />)
    expect(container.firstElementChild?.className).not.toMatch(/\bbg-|\bborder\b|rounded/)
  })

  it("renders its optional action aligned with the text", () => {
    render(<LineaDeEstado tipo="neutro" titulo="Puedes decir que no" accion={<a href="/x">Revisar la frase</a>} />)
    expect(screen.getByRole("link", { name: "Revisar la frase" }).parentElement).toHaveClass("col-start-2")
  })
})
```

- [ ] **Step 2: Run** -> FAIL (module missing).
- [ ] **Step 3: Implement**

```tsx
import { CalendarBlank, CheckCircle, Info, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type TipoDeEstado = "exito" | "aviso" | "error" | "neutro" | "fecha"

const TINTA: Record<TipoDeEstado, string> = {
  exito: "text-exito",
  aviso: "text-aviso",
  error: "text-error",
  neutro: "text-tinta",
  fecha: "text-tinta",
}
const ICONO = { exito: CheckCircle, aviso: Warning, error: WarningCircle, neutro: Info, fecha: CalendarBlank } as const

interface PropiedadesDeLinea {
  tipo: TipoDeEstado
  titulo: ReactNode
  /** «Para confirmar:», «Hay que corregirlo:»: the only coloured part when the title is a message. */
  rotulo?: string
  /** The title is a name or a long message: ink, and only the rotulo carries the colour. */
  tituloEnTinta?: boolean
  detalle?: ReactNode
  accion?: ReactNode
  className?: string
}

/** Brandkit 9.6: icon in the state's ink, text at x = 56, no box. */
export function LineaDeEstado({ tipo, titulo, rotulo, tituloEnTinta = false, detalle, accion, className }: PropiedadesDeLinea) {
  const Icono = ICONO[tipo]
  const contenido = (
    <>
      <Icono aria-hidden="true" size={20} className={cn("mt-0.5 justify-self-center", TINTA[tipo])} />
      <p className="text-cuerpo">
        {rotulo ? <span className={cn("font-semibold", TINTA[tipo])}>{rotulo} </span> : null}
        <span className={tituloEnTinta || rotulo ? "text-tinta" : TINTA[tipo]}>{titulo}</span>
      </p>
      {detalle ? <p className="col-start-2 text-meta text-tinta">{detalle}</p> : null}
      {accion ? <div className="col-start-2">{accion}</div> : null}
    </>
  )
  const clases = cn("grid grid-cols-[24px_1fr] gap-x-3 gap-y-1", className)
  return tipo === "error" ? (
    <div role="alert" className={clases}>{contenido}</div>
  ) : (
    <output className={clases}>{contenido}</output>
  )
}
```

`<output>` has the implicit role `status` (same as `Nota` today). The test for «text-tinta» on `rotulo` + title: the title span gets `text-tinta`.

- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(ui): status line that replaces the tinted note boxes`

`Nota` stays until its callers migrate (Phase 3) and is deleted in Task 34.

### Task 8: Section with the ink rule

Brandkit 9.2.

**Files:**
- Modify: `components/seccion.tsx`
- Create: `tests/unit/seccion.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Seccion } from "@/components/seccion"

describe("Seccion", () => {
  it("is a region named by its label, with the figure on the right of the same line", () => {
    render(<Seccion id="firma" titulo="Necesita tu firma" cifra="2"><p>x</p></Seccion>)
    const region = screen.getByRole("region", { name: "Necesita tu firma" })
    expect(region).toHaveTextContent("Necesita tu firma2x")
    expect(screen.getByText("2")).toHaveClass("tabular-nums")
  })

  it("opens with a 1 px ink rule, not a box", () => {
    render(<Seccion id="s" titulo="Guion"><p>x</p></Seccion>)
    const cabecera = screen.getByRole("heading", { name: "Guion" }).parentElement
    expect(cabecera).toHaveClass("border-t", "border-tinta")
  })
})
```

- [ ] **Step 2: Run** -> FAIL (no `cifra`, label apagado).
- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from "react"

interface PropiedadesDeSeccion {
  titulo: string
  id: string
  /** The figure on the right axis: «2», «123 palabras · ≈ 52 s». Text or a node (for «Bien» with its check). */
  cifra?: ReactNode
  children: ReactNode
}

/** Brandkit 9.2: a 1 px ink rule opens the section; label 15/600 left, figure 15 apagado right. */
export function Seccion({ titulo, id, cifra, children }: PropiedadesDeSeccion) {
  return (
    <section aria-labelledby={id} className="mt-10 grid gap-2 first:mt-0">
      <div className="flex items-baseline justify-between gap-4 border-t border-tinta pt-3">
        <h2 id={id} className="text-meta font-semibold text-tinta">{titulo}</h2>
        {cifra !== undefined ? <span className="text-meta text-apagado tabular-nums">{cifra}</span> : null}
      </div>
      {children}
    </section>
  )
}
```

- [ ] **Step 4: Run** -> PASS. `grep -rn "<Seccion" app components` and confirm no caller breaks (new prop is optional).
- [ ] **Step 5: Commit** `feat(ui): sections open with an ink rule and a right figure axis`

### Task 9: Rows (piece, navigation, value, switch, check) and the switch

Brandkit 9.3, 9.10.

**Files:**
- Modify: `components/fila-pieza.tsx`
- Create: `components/ui/filas.tsx`, `components/ui/interruptor.tsx`, `tests/unit/filas.test.tsx`, `tests/unit/interruptor.test.tsx`, `tests/unit/fila-pieza.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
// tests/unit/fila-pieza.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FilaPieza } from "@/components/fila-pieza"

describe("FilaPieza", () => {
  it("reads pillar, title and state, and links when there is something to do", () => {
    render(<ul><FilaPieza pilar="deseo" titulo="El deseo no se apaga" estado="Guion · 52 s" href="/guion/1" /></ul>)
    expect(screen.getByRole("link")).toHaveAccessibleName(/Deseo y sexualidad.*El deseo no se apaga.*Guion · 52 s/)
  })

  it("is not a link while working, and says so with the pulsing dot", () => {
    render(<ul><FilaPieza pilar={null} titulo="¿Te achicas?" estado="Escribiendo el guion · te aviso" trabajando /></ul>)
    expect(screen.queryByRole("link")).toBeNull()
    expect(document.querySelector(".punto-trabajando")).not.toBeNull()
    expect(document.querySelector(".esqueleto")).toBeNull()
  })

  it("hangs an unread dot in the margin with a screen-reader word", () => {
    render(<ul><FilaPieza pilar={null} titulo="X" estado="Video · 48 s" href="/video/1" sinLeer /></ul>)
    expect(screen.getByText("Sin leer")).toHaveClass("sr-only")
  })

  it("shows the real video thumbnail only when given", () => {
    render(<ul><FilaPieza pilar={null} titulo="X" estado="Video · 48 s" href="/video/1" miniatura="https://almacen.test/m.jpg" /></ul>)
    expect(screen.getByRole("img", { hidden: true })).toHaveAttribute("src", "https://almacen.test/m.jpg")
  })
})
```

```tsx
// tests/unit/interruptor.test.tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilaConInterruptor } from "@/components/ui/filas"

describe("FilaConInterruptor", () => {
  it("is a switch named by its row, and the whole row toggles it", () => {
    const alCambiar = vi.fn()
    render(<FilaConInterruptor etiqueta="Resumen diario a las 08:30" encendido={false} alCambiar={alCambiar} />)
    const interruptor = screen.getByRole("switch", { name: "Resumen diario a las 08:30" })
    expect(interruptor).toHaveAttribute("aria-checked", "false")
    fireEvent.click(screen.getByText("Resumen diario a las 08:30"))
    expect(alCambiar).toHaveBeenCalledWith(true)
  })
})
```

```tsx
// tests/unit/filas.test.tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilaConCheck, FilaConValor, FilaNavegacion } from "@/components/ui/filas"

describe("filas", () => {
  it("FilaNavegacion is a 56 px link with a caret", () => {
    render(<FilaNavegacion href="/calendario">Ver calendario</FilaNavegacion>)
    expect(screen.getByRole("link", { name: "Ver calendario" })).toHaveClass("min-h-14")
  })

  it("FilaConValor puts the native select over the whole row so iOS shows its own wheel", () => {
    const alCambiar = vi.fn()
    render(
      <FilaConValor etiqueta="Meta de este mes" valor="consultas" opciones={[{ valor: "consultas", etiqueta: "Consultas" }, { valor: "seguidores", etiqueta: "Seguidores" }]} alCambiar={alCambiar} />,
    )
    const select = screen.getByRole("combobox", { name: "Meta de este mes" })
    expect(select).toHaveClass("absolute", "inset-0", "opacity-0")
    fireEvent.change(select, { target: { value: "seguidores" } })
    expect(alCambiar).toHaveBeenCalledWith("seguidores")
    expect(screen.getByText("Consultas")).toBeVisible()
  })

  it("FilaConCheck is a radio with the check on the chosen one", () => {
    render(<FilaConCheck nombre="fecha" valor="a" elegido etiqueta="jueves 8 de octubre · 19:00" alElegir={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "jueves 8 de octubre · 19:00" })).toBeChecked()
  })
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement.** `FilaPieza` new props: `pilar: Pilar | null`, `titulo`, `estado` (rename of `meta`; update the 3 callers: `app/(app)/page.tsx`, `components/agenda-del-calendario.tsx`, `app/(app)/ideas-semana.tsx` if it uses it, found with `grep -rn "<FilaPieza" app components`), `href?`, `trabajando?` (rename of `ocupada`), `sinLeer?`, `miniatura?`. Layout per 9.3: grid `[1fr_auto_auto]`, pillar word 15 apagado (`NOMBRE_DE_PILAR`), title 18/600 `tracking-[-0.004em]`, state 15/500 ink preceded by `<PuntoTrabajando />` when `trabajando`; thumbnail `<img alt="" className="h-16 w-12 rounded-12 object-cover">` (decorative; the row text names it); `CaretRight size={20}` apagado when `href`; unread dot `absolute -left-3.5 top-[calc(…)] size-2 rounded-full bg-tinta` + `<span className="sr-only">Sin leer</span>`; `min-h-16 py-3 border-b border-linea last:border-b-0`. Drop `data-pilar` styling and `bg-pilar-punto`; keep `data-pilar` as a data attribute only.

`components/ui/interruptor.tsx` (client): a `<button role="switch" aria-checked>` 52 x 32, `rounded-full`; off: `bg-pista ring-[1.5px] ring-campo` + knob `size-6 bg-campo`; on: `bg-tinta` + knob `bg-sobre-tinta translate-x-5`; `transition-transform duration-[var(--dur-corta)]`.

`components/ui/filas.tsx` (client, because of the select and switch handlers):
- `FilaNavegacion({ href, children })`: `Link` `flex min-h-14 items-center justify-between border-t border-linea text-cuerpo font-medium` + `CaretRight`.
- `FilaConValor<T extends string>({ etiqueta, valor, opciones, alCambiar, tipo?: "select" | "time" })`: `relative flex min-h-14 items-center justify-between border-b border-linea`; label 18/400; value 18 apagado tabular + `CaretUpDown size={20}`; the native `<select aria-label={etiqueta}>` (or `<input type="time" aria-label>`) `absolute inset-0 opacity-0 cursor-pointer`. The visible value is the label of the selected option.
- `FilaConInterruptor({ etiqueta, detalle?, encendido, alCambiar })`: a `<label>`-like row; clicking anywhere calls `alCambiar(!encendido)`; the switch's accessible name is `etiqueta` via `aria-labelledby`.
- `FilaConCheck({ nombre, valor, elegido, etiqueta, alElegir })`: `<label className="flex min-h-14 items-center justify-between border-b border-linea">` with `<input type="radio" className="sr-only peer">` and `Check size={20}` visible only when `elegido`; focus ring through `peer-focus-visible:shadow-[var(--anillo-foco)]` on the label.

- [ ] **Step 4: Run** the three tests -> PASS; full suite.
- [ ] **Step 5: Commit** `feat(ui): flat rows, value rows with native pickers and the switch`

### Task 10: Fields, code boxes and the round checkbox

Brandkit 9.8, 9.10.

**Files:**
- Modify: `components/casillas-codigo.tsx`, `tests/unit/casillas-codigo.test.tsx`
- Create: `components/ui/casilla.tsx`, `tests/unit/casilla.test.tsx`
- Modify: `app/globals.css` (add the `.campo` rule below)

- [ ] **Step 1: Failing tests**

```tsx
// tests/unit/casilla.test.tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Casilla } from "@/components/ui/casilla"

describe("Casilla", () => {
  it("is a checkbox and the whole 56 px row is its target", () => {
    const alCambiar = vi.fn()
    render(<Casilla etiqueta="Lo revisé y está bien" marcada={false} alCambiar={alCambiar} />)
    const casilla = screen.getByRole("checkbox", { name: "Lo revisé y está bien" })
    expect(casilla.closest("label")).toHaveClass("min-h-14")
    fireEvent.click(screen.getByText("Lo revisé y está bien"))
    expect(alCambiar).toHaveBeenCalledWith(true)
  })

  it("stays focusable and reads as disabled at the limit", () => {
    render(<Casilla etiqueta="Idea 6" marcada={false} deshabilitada alCambiar={vi.fn()} />)
    const casilla = screen.getByRole("checkbox", { name: "Idea 6" })
    expect(casilla).toHaveAttribute("aria-disabled", "true")
    expect(casilla).not.toBeDisabled()
  })
})
```

Add to `tests/unit/casillas-codigo.test.tsx`:

```tsx
  it("marks all six boxes as invalid and says the error once", () => {
    render(<CasillasCodigo /* existing required props */ error="Ese código no sirve." />)
    for (const caja of screen.getAllByRole("textbox")) expect(caja).toHaveAttribute("aria-invalid", "true")
    expect(screen.getAllByText("Ese código no sirve.")).toHaveLength(1)
  })
```

(Read `components/casillas-codigo.tsx` first and use its real prop names; if it does not take `error`, the error is rendered by `formulario-ingreso.tsx`, and this test moves to Task 20.)

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement.** `globals.css`:

```css
/* Brandkit 9.8: fields grow with their text, never scroll inside. */
.campo {
  background: var(--superficie);
  border: var(--trazo) solid var(--campo);
  border-radius: var(--r-12);
  padding: var(--e-4);
  min-height: var(--alto-boton);
  field-sizing: content;
}
.campo[aria-invalid="true"] { border: var(--trazo-seleccion) solid var(--error); }
.campo::placeholder { color: var(--apagado); }
```

`Casilla`: `<label className="grid min-h-14 grid-cols-[24px_1fr] items-center gap-x-3">` with a visually hidden native `input type=checkbox` and a 24 px circle: empty `ring-[1.5px] ring-campo bg-superficie`, checked `bg-tinta` with `<Check weight="bold" size={14} className="text-sobre-tinta">`, disabled `ring-linea` and text `text-apagado`, `aria-disabled` instead of `disabled`.

`CasillasCodigo`: each box `campo h-16 w-full text-center text-pieza tabular-nums` (24/600), 8 px gap, `aria-invalid` when in error, labels «Número N de 6» unchanged, group label «Código de 6 números» unchanged.

- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(ui): 3:1 fields, round checkbox and the code boxes`

### Task 11: Chip and view tabs

Brandkit 9.10. `Segmentado` is replaced by `Pestanas` (Calendario) and by chips (days in Ajustes).

**Files:**
- Modify: `components/chip.tsx`
- Create: `components/ui/pestanas.tsx`, `tests/unit/pestanas.test.tsx`, `tests/unit/chip.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
// tests/unit/pestanas.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Pestanas } from "@/components/ui/pestanas"

describe("Pestanas", () => {
  it("are links and the current one carries aria-current", () => {
    render(<Pestanas etiqueta="Vistas" actual="agenda" opciones={[{ valor: "mes", etiqueta: "Mes", href: "/calendario?vista=mes" }, { valor: "agenda", etiqueta: "Agenda", href: "/calendario?vista=agenda" }]} />)
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Mes" })).not.toHaveAttribute("aria-current")
  })
})
```

```tsx
// tests/unit/chip.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Chip } from "@/components/chip"

describe("Chip", () => {
  it("is a 44 px toggle; pressed fills with ink, never raspberry", () => {
    render(<Chip presionado>Pareja</Chip>)
    const chip = screen.getByRole("button", { name: "Pareja" })
    expect(chip).toHaveAttribute("aria-pressed", "true")
    expect(chip).toHaveClass("min-h-11", "aria-pressed:bg-tinta")
    expect(chip.className).not.toMatch(/firma|acento/)
  })
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement.** `Chip`: `min-h-11 rounded-12 border border-campo px-3.5 text-meta font-medium text-tinta aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-sobre-tinta active:scale-[0.98]`. `Pestanas` (server-safe, no hooks): `<nav aria-label={etiqueta}>` flex with 24 px gap and `border-b border-linea`; each `Link` `min-h-11 text-cuerpo`; current `font-semibold text-tinta` with `after:` 2 px ink underline; others `font-medium text-apagado`.

Check what `components/vistas-del-calendario.tsx` uses today (links named «Mes», «Agenda» per the e2e). Read it; if it already renders links, `Pestanas` replaces its markup and keeps the hrefs it uses.

- [ ] **Step 4: Run** -> PASS. `pnpm test:e2e tests/e2e/calendario.spec.ts` (the links «Mes» and «Agenda» are asserted).
- [ ] **Step 5: Commit** `feat(ui): ink chips and underlined view tabs`

### Task 12: The approve slider (drag only)

Brandkit 9.12, critical #2. Keeps `role="slider"`, name, `aria-valuenow`, `aria-valuetext`, keyboard. Changes: a tap never approves; approves on **release** at >= 96.

**Files:**
- Create: `lib/diseno/deslizador.ts`, `tests/unit/deslizador-modelo.test.ts`
- Modify: `components/deslizar-para-aprobar.tsx` (rewrite), `tests/unit/deslizar-aprobar.test.tsx` (rewrite), `app/globals.css` (delete `.deslizador*`)

- [ ] **Step 1: Failing model test**

```ts
// tests/unit/deslizador-modelo.test.ts
import { describe, expect, it } from "vitest"
import { apruebaAlSoltar, progresoDeArrastre, UMBRAL_DE_APROBACION } from "@/lib/diseno/deslizador"

describe("slider model", () => {
  it("follows the finger 1 to 1 over the free travel", () => {
    expect(progresoDeArrastre({ inicioX: 10, actualX: 160, recorrido: 300 })).toBe(50)
  })
  it("clamps to 0 and 100", () => {
    expect(progresoDeArrastre({ inicioX: 100, actualX: 0, recorrido: 300 })).toBe(0)
    expect(progresoDeArrastre({ inicioX: 0, actualX: 999, recorrido: 300 })).toBe(100)
  })
  it("never divides by a zero travel", () => {
    expect(progresoDeArrastre({ inicioX: 0, actualX: 50, recorrido: 0 })).toBe(0)
  })
  it("approves only from 96 percent, on release", () => {
    expect(UMBRAL_DE_APROBACION).toBe(96)
    expect(apruebaAlSoltar(95.9)).toBe(false)
    expect(apruebaAlSoltar(96)).toBe(true)
  })
})
```

Run -> FAIL.

- [ ] **Step 2: Implement the model**

```ts
// lib/diseno/deslizador.ts
/** Where the thumb counts as "approved" (brandkit 9.12: 96 percent of the travel). */
export const UMBRAL_DE_APROBACION = 96

/** Percent of the free travel the thumb has moved since the finger went down (1 to 1, no curve). */
export function progresoDeArrastre({ inicioX, actualX, recorrido }: { inicioX: number; actualX: number; recorrido: number }): number {
  if (recorrido <= 0) return 0
  return Math.min(100, Math.max(0, ((actualX - inicioX) / recorrido) * 100))
}

export function apruebaAlSoltar(progreso: number): boolean {
  return progreso >= UMBRAL_DE_APROBACION
}
```

Run model test -> PASS.

- [ ] **Step 3: Rewrite the component test** (`tests/unit/deslizar-aprobar.test.tsx`). The label becomes «Desliza para aprobar el guion» (the one the app uses). jsdom has no layout: stub the track width.

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"

const ETIQUETA = "Desliza para aprobar el guion"
const deslizador = () => screen.getByRole("slider", { name: ETIQUETA })

beforeEach(() => {
  // Track 356 px, thumb 48 px, 4 px inset on each side: free travel 300 px.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 356, left: 0, right: 356, top: 0, bottom: 56, height: 56, x: 0, y: 0, toJSON: () => ({}) })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

function arrastrar(hasta: number) {
  fireEvent.pointerDown(deslizador(), { pointerId: 1, clientX: 0 })
  fireEvent.pointerMove(deslizador(), { pointerId: 1, clientX: hasta })
  fireEvent.pointerUp(deslizador(), { pointerId: 1, clientX: hasta })
}

describe("DeslizarParaAprobar", () => {
  it("starts as not approved", () => {
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={vi.fn()} />)
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
    expect(deslizador()).toHaveAttribute("aria-valuetext", "No aprobado")
  })

  it("does not approve when the track is tapped, anywhere", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    const pista = screen.getByTestId("pista-deslizador")
    fireEvent.pointerDown(pista, { pointerId: 1, clientX: 350 })
    fireEvent.pointerUp(pista, { pointerId: 1, clientX: 350 })
    fireEvent.click(pista, { clientX: 350 })
    expect(alAprobar).not.toHaveBeenCalled()
  })

  it("does not approve when the thumb is tapped without dragging", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    arrastrar(0)
    expect(alAprobar).not.toHaveBeenCalled()
  })

  it("does not approve while dragging past the end, only on release", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    fireEvent.pointerDown(deslizador(), { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(deslizador(), { pointerId: 1, clientX: 300 })
    expect(alAprobar).not.toHaveBeenCalled()
    fireEvent.pointerUp(deslizador(), { pointerId: 1, clientX: 300 })
    expect(alAprobar).toHaveBeenCalledTimes(1)
    expect(deslizador()).toHaveAttribute("aria-valuetext", "Aprobado")
  })

  it("springs back when released before 96 percent", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    arrastrar(280) // 93 %
    expect(alAprobar).not.toHaveBeenCalled()
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
  })

  it("approves only once", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={alAprobar} />)
    arrastrar(300)
    arrastrar(300)
    expect(alAprobar).toHaveBeenCalledTimes(1)
  })

  it("ignores drags and End while disabled, and says why", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado={false} motivo="Falta confirmar la revisión." alAprobar={alAprobar} />)
    arrastrar(300)
    fireEvent.keyDown(deslizador(), { key: "End" })
    expect(alAprobar).not.toHaveBeenCalled()
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(deslizador()).toHaveAccessibleDescription("Falta confirmar la revisión.")
  })

  it("approves with End and moves with the arrows and Home", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    fireEvent.keyDown(deslizador(), { key: "ArrowRight" })
    expect(deslizador()).toHaveAttribute("aria-valuenow", "4")
    fireEvent.keyDown(deslizador(), { key: "Home" })
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
    fireEvent.keyDown(deslizador(), { key: "End" })
    expect(alAprobar).toHaveBeenCalledTimes(1)
  })

  it("goes back to zero when the approval did not go through", () => {
    const { rerender } = render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={vi.fn()} />)
    arrastrar(300)
    rerender(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando alAprobar={vi.fn()} />)
    expect(deslizador()).toHaveAttribute("aria-valuenow", "100")
    rerender(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={vi.fn()} />)
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
  })
})
```

Note the keyboard: the e2e specs only use `End` (verified in `tests/e2e/guion.spec.ts:87-99, 174-180, 298` and `video.spec.ts:31-35`), so arrows reaching 96 do **not** approve until release-equivalent; keyboard approval is `End` only (an arrow walk to 96 sets the value; approving needs `End` or `Enter` at >= 96). Add that line to the docstring.

Run -> FAIL.

- [ ] **Step 4: Implement the component**

```tsx
"use client"

import { ArrowRight, Check, Info } from "@phosphor-icons/react"
import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from "react"
import { apruebaAlSoltar, progresoDeArrastre } from "@/lib/diseno/deslizador"
import { cn } from "@/lib/utils"

export { UMBRAL_DE_APROBACION } from "@/lib/diseno/deslizador"

const PASO = 4
const PULGAR = 48
const MARGEN = 4

interface PropiedadesDeDeslizar {
  etiqueta: string
  habilitado: boolean
  motivo?: string
  enviando?: boolean
  alAprobar: () => void
}

/**
 * The one gesture that approves, on both gates (brandkit 9.12). Pointer events captured on the thumb: tapping the
 * track or the thumb does nothing, approval happens on release at the end. Keyboard: arrows and Home move, End approves.
 */
export function DeslizarParaAprobar({ etiqueta, habilitado, motivo, enviando = false, alAprobar }: PropiedadesDeDeslizar) {
  const [valor, setValor] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const aprobado = useRef(false)
  const inicio = useRef<{ x: number; recorrido: number } | null>(null)
  const pista = useRef<HTMLDivElement>(null)
  const idMotivo = useId()
  const activo = habilitado && !enviando

  useEffect(() => {
    if (!enviando) {
      aprobado.current = false
      setValor((actual) => (actual >= 96 ? 0 : actual))
    }
  }, [enviando])

  function aprobar() {
    if (aprobado.current) return
    aprobado.current = true
    setValor(100)
    alAprobar()
  }

  function alBajar(evento: PointerEvent<HTMLDivElement>) {
    if (!activo || aprobado.current || !pista.current) return
    evento.currentTarget.setPointerCapture(evento.pointerId)
    const ancho = pista.current.getBoundingClientRect().width
    inicio.current = { x: evento.clientX, recorrido: ancho - PULGAR - 2 * MARGEN }
    setArrastrando(true)
  }

  function alMover(evento: PointerEvent<HTMLDivElement>) {
    if (!inicio.current) return
    setValor(progresoDeArrastre({ inicioX: inicio.current.x, actualX: evento.clientX, recorrido: inicio.current.recorrido }))
  }

  function alSoltar(evento: PointerEvent<HTMLDivElement>) {
    if (!inicio.current) return
    const final = progresoDeArrastre({ inicioX: inicio.current.x, actualX: evento.clientX, recorrido: inicio.current.recorrido })
    inicio.current = null
    setArrastrando(false)
    if (apruebaAlSoltar(final)) aprobar()
    else setValor(0)
  }

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (aprobado.current) return
    const pasos: Record<string, number> = { ArrowRight: PASO, ArrowUp: PASO, ArrowLeft: -PASO, ArrowDown: -PASO }
    if (evento.key === "End") {
      evento.preventDefault()
      if (activo) aprobar()
    } else if (evento.key === "Home") {
      evento.preventDefault()
      setValor(0)
    } else if (evento.key in pasos) {
      evento.preventDefault()
      if (activo) setValor((actual) => Math.min(100, Math.max(0, actual + pasos[evento.key])))
    }
  }

  const listo = valor >= 96 && aprobado.current
  return (
    <div className="grid gap-2">
      <div ref={pista} data-testid="pista-deslizador" className="relative h-14 touch-pan-y rounded-full bg-pista">
        <div
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 rounded-full", listo ? "bg-firma" : "bg-firma-rastro", !arrastrando && "transition-[width] duration-[var(--dur-larga)] ease-vuelta")}
          style={{ width: valor === 0 ? 0 : `calc(${MARGEN + PULGAR / 2}px + (100% - ${PULGAR + 2 * MARGEN}px) * ${valor / 100})` }}
        />
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-y-0 right-4 left-14 grid place-items-center text-cuerpo font-semibold", listo ? "text-sobre-firma" : activo ? "text-tinta" : "text-apagado")}
          style={{ opacity: listo ? 1 : Math.max(0, 1 - valor / 60) }}
        >
          {listo ? "Aprobado" : etiqueta}
        </span>
        <div
          role="slider"
          tabIndex={0}
          aria-label={etiqueta}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(valor)}
          aria-valuetext={valor >= 96 ? "Aprobado" : "No aprobado"}
          aria-disabled={!activo}
          aria-describedby={!habilitado && motivo ? idMotivo : undefined}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onKeyDown={alTeclear}
          className={cn(
            "absolute top-1 grid size-12 touch-none place-items-center rounded-full",
            !arrastrando && "transition-[left] duration-[var(--dur-larga)] ease-vuelta",
            listo ? "bg-sobre-firma text-firma" : activo ? "cursor-grab bg-firma text-sobre-firma active:cursor-grabbing" : "cursor-not-allowed bg-superficie text-apagado ring-[1.5px] ring-apagado ring-inset",
          )}
          style={{ left: `calc(${MARGEN}px + (100% - ${PULGAR + 2 * MARGEN}px) * ${valor / 100})` }}
        >
          {listo ? <Check aria-hidden="true" weight="bold" size={24} /> : <ArrowRight aria-hidden="true" size={24} />}
        </div>
      </div>
      {!habilitado && motivo ? (
        <p id={idMotivo} className="flex items-start gap-2 text-meta font-medium text-tinta">
          <Info aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          {motivo}
        </p>
      ) : null}
    </div>
  )
}
```

`listo` reads a ref during render; that is acceptable here because every change of `aprobado.current` is followed by `setValor`, which re-renders. If Biome or React Compiler lint complains, move `aprobado` into state (`const [aprobadoEstado, setAprobado] = useState(false)` mirrored with the ref used for the double-approval guard).

Delete the `.deslizador` rules from `globals.css`. Reduced motion: the transitions use the duration tokens, which drop to 0.

- [ ] **Step 5: Run** unit tests -> PASS. Then e2e: `pnpm test:e2e tests/e2e/guion.spec.ts tests/e2e/video.spec.ts` -> PASS (same role, name, `aria-disabled`, `aria-valuetext`, `End`).
- [ ] **Step 6: Add an e2e regression for the tap** at the end of `tests/e2e/guion.spec.ts`, in the test that reaches an enabled slider (after `elegirAvatar`):

```ts
  // A tap at the end of the track never approves (brandkit 9.12).
  const caja = await deslizador.locator("..").boundingBox()
  if (!caja) throw new Error("The slider track has no box")
  await page.mouse.click(caja.x + caja.width - 8, caja.y + caja.height / 2)
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
  // A real drag does.
  const pulgar = await deslizador.boundingBox()
  if (!pulgar) throw new Error("The thumb has no box")
  await page.mouse.move(pulgar.x + 24, pulgar.y + 24)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width, pulgar.y + 24, { steps: 12 })
  await page.mouse.up()
```

Put it in a new test (copy the setup of the test at line ~170 that ends with `deslizador.focus(); End`), asserting the state becomes `guion_aprobado` after the drag.

- [ ] **Step 7: Commit** `feat(firma): drag-only approve slider, approves on release`

### Task 13: Voice player

Brandkit 9.16.

**Files:**
- Modify: `components/reproductor-voz.tsx`, `tests/unit/reproductor-voz.test.tsx`

- [ ] **Step 1: Failing tests** (append):

```tsx
  it("draws play as an outline so the principal stays the only filled shape", () => {
    render(/* existing render call of this file */)
    expect(screen.getByRole("button", { name: /Escuchar|Reproducir/ })).not.toHaveClass("bg-principal")
  })

  it("lets her seek with a slider and reads the time in tabular figures", () => {
    render(/* existing render call */)
    expect(screen.getByRole("slider", { name: "Avance de la voz" })).toBeInTheDocument()
    expect(screen.getByText(/0:00 \/ /)).toHaveClass("tabular-nums")
  })
```

Read the file first and keep its existing button names (the e2e asserts «Escuchar la voz» in `guion.spec.ts:90`); the regex covers both.

- [ ] **Step 2: Run** -> FAIL (no seek slider).
- [ ] **Step 3: Implement.** Grid `[48px_1fr_auto] gap-3`. Play: `size-12 rounded-full ring-[1.5px] ring-tinta` with `Play/Pause weight="fill" size={20}`. Seek: `<input type="range" aria-label="Avance de la voz" min={0} max={duracion} step={0.1} value={tiempo}>` styled as a 2 px `campo` rail with a 14 px ink knob (add a `.avance` rule in `globals.css`: `appearance:none; height:44px; background: linear-gradient(var(--tinta),var(--tinta)) 0 50%/var(--p,0%) 2px no-repeat, linear-gradient(var(--campo),var(--campo)) 0 50%/100% 2px no-repeat;` and the thumb pseudo-elements at 14 px ink). Seeking sets `elemento.current.currentTime`; expose `buscar(segundos)` from `useReproduccion` (add it there; do not change the watched logic: seeking forward must not count as watched, `lib/medios/visionado.ts` already tracks real progress, confirm its tests still pass). State line below at x = 80: «Escucha cómo suena antes de grabar» apagado / «Ya la escuchaste» exito + `Check` / error line.
- [ ] **Step 4: Run** -> PASS; `pnpm vitest run tests/unit/visionado.test.ts`.
- [ ] **Step 5: Commit** `feat(ui): outlined voice player with seeking`

### Task 14: Video player at the available height

Brandkit 9.17, critical #1.

**Files:**
- Modify: `components/reproductor-video.tsx`, `components/use-reproduccion.ts` (uses `buscar` from Task 13)
- Create: `tests/unit/reproductor-video.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReproductorVideo } from "@/components/reproductor-video"

describe("ReproductorVideo", () => {
  it("plays or pauses when the frame is tapped anywhere", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v" zonas={false} alVerCompleto={vi.fn()} />)
    fireEvent.click(screen.getByTestId("reproductor-video"))
    expect(play).toHaveBeenCalled()
  })

  it("keeps the labelled play button and the Avatar IA label", () => {
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v" zonas={false} alVerCompleto={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Reproducir el video" })).toBeInTheDocument()
    expect(screen.getByText("Avatar IA")).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Avance del video" })).toBeInTheDocument()
  })

  it("says a load failure under the video, not in the middle of the frame", () => {
    render(<ReproductorVideo src={null} clave="v" zonas={false} alVerCompleto={vi.fn()} />)
    const alerta = screen.getByRole("alert")
    expect(alerta).toHaveTextContent("No pude cargar el video. Recarga la pantalla.")
    expect(screen.getByTestId("reproductor-video").contains(alerta)).toBe(false)
  })
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement.** Wrapper fragment: the frame + the error `LineaDeEstado tipo="error"` after it. Frame size:

```tsx
// Brandkit 9.17: the whole 9:16 and its play fit above the sign bar on load. 44 back + 8 + 104 bar + 16, plus safe areas.
const ALTO = "min(calc((100vw - 40px) * 16 / 9), calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 172px))"
<div data-testid="reproductor-video" onClick={alternar} className="relative mx-auto aspect-[9/16] overflow-hidden rounded-12 bg-tinta text-sobre-video" style={{ height: ALTO }}>
```

(column max 560 at tablet: use `min(100%, 560px)` for the width part via `calc((min(100vw, 560px) - 40px) * 16 / 9)`.) Centre play: 64 px disc `bg-velo-video`, `Play weight="fill" size={28}`, hidden while playing; `onClick` stops propagation. Bottom: 96 px gradient `bg-gradient-to-t from-velo-video to-transparent`, seek range `aria-label="Avance del video"` (same `.avance` rule with a `sobre-video` variant), time 15 tabular. «Avatar IA»: `absolute top-3 left-3 rounded-12 bg-velo-video px-2 h-7 text-meta font-semibold`. Zones: dashed 1.5 px `border-sobre-video`, caption on `bg-velo-video`. No `bg-tinta/65` or `/80` opacity modifiers left (they were alias-based). Seek must not mark watched (same note as Task 13).
- [ ] **Step 4: Run** unit -> PASS; `pnpm test:e2e tests/e2e/video.spec.ts`. Then measure at 390 x 844 in the e2e (added permanently in Task 25): the play button's box bottom is above the bar's top.
- [ ] **Step 5: Commit** `feat(video): 9:16 at the available height, tap to play, seekable`

### Task 15: Cost, balance and the monthly meter

Brandkit 9.14, 9.15.

**Files:**
- Create: `components/ui/costo.tsx`, `components/ui/medidor.tsx`, `lib/diseno/medidor.ts`, `tests/unit/medidor.test.ts`, `tests/unit/costo.test.tsx`

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/medidor.test.ts
import { describe, expect, it } from "vitest"
import { tonoDelMedidor } from "@/lib/diseno/medidor"

describe("tonoDelMedidor", () => {
  it("is ink below 80 percent of the cap", () => expect(tonoDelMedidor(31.99, 40)).toEqual({ tono: "tinta", porcentaje: 79.975, alTope: false }))
  it("turns to aviso from 80 percent", () => expect(tonoDelMedidor(32, 40).tono).toBe("aviso"))
  it("says the cap is reached at 100 percent and clamps the bar", () => expect(tonoDelMedidor(45, 40)).toEqual({ tono: "aviso", porcentaje: 100, alTope: true }))
  it("handles a zero cap without dividing by zero", () => expect(tonoDelMedidor(0, 0)).toEqual({ tono: "tinta", porcentaje: 0, alTope: false }))
})
```

```tsx
// tests/unit/costo.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CostoDeAccion, LineaDeSaldo } from "@/components/ui/costo"

describe("costo", () => {
  it("shows the amount at 24/600 tabular with its unit, right aligned", () => {
    render(<CostoDeAccion monto="US$ 1,16" unidad="~52 s" />)
    expect(screen.getByText("US$ 1,16")).toHaveClass("text-pieza", "tabular-nums")
    expect(screen.getByText("~52 s").parentElement).toHaveClass("text-right")
  })
  it("keeps the balance explanation with its figure, left aligned, never centred", () => {
    render(<LineaDeSaldo>ElevenLabs: te quedan 99.000 de 100.000 caracteres.</LineaDeSaldo>)
    expect(screen.getByText(/te quedan/)).not.toHaveClass("text-center")
  })
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement**

```ts
// lib/diseno/medidor.ts
export interface TonoDelMedidor { tono: "tinta" | "aviso"; porcentaje: number; alTope: boolean }

/** Brandkit 9.15: the spend meter turns to aviso from 80 percent of the cap. */
export function tonoDelMedidor(gastado: number, tope: number): TonoDelMedidor {
  if (tope <= 0) return { tono: "tinta", porcentaje: 0, alTope: false }
  const porcentaje = Math.min(100, (gastado / tope) * 100)
  return { tono: porcentaje >= 80 ? "aviso" : "tinta", porcentaje, alTope: gastado >= tope }
}
```

`CostoDeAccion({ monto, unidad })`: `<div className="grid text-right"><span className="text-pieza tabular-nums">{monto}</span><span className="text-meta text-apagado tabular-nums">{unidad}</span></div>`. `LineaDeSaldo({ children })`: `<p className="text-meta text-apagado">`. `Medidor({ gastado, tope, texto })` server component: `texto` («Llevas US$ 22,00 este mes», built by the caller from the existing copy), `Warning size={16}` before it in aviso, a 4 px `bg-pista rounded-full` track with an ink or aviso fill `style={{ width: \`${porcentaje}%\` }}`, `role="meter" aria-valuenow aria-valuemin={0} aria-valuemax={tope} aria-label="Gasto del mes"`, and when `alTope` a `LineaDeEstado tipo="aviso" titulo="Llegaste al tope de gasto de este mes."` (check the exact copy in `docs/rediseno/inventario.md`; if the app uses a different string today, keep the app's).
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(ui): cost and balance lines and the monthly spend meter`

### Task 16: Sign bar and in-line confirmation

Brandkit 9.5, 9.13.

**Files:**
- Create: `components/ui/barra-de-firma.tsx`, `components/ui/confirmacion-en-linea.tsx`, `tests/unit/confirmacion-en-linea.test.tsx`, `tests/unit/barra-de-firma.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
// tests/unit/confirmacion-en-linea.test.tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"

describe("ConfirmacionEnLinea", () => {
  it("confirms a spend with the principal and never with the signature colour", () => {
    const alConfirmar = vi.fn()
    render(<ConfirmacionEnLinea trato="gasto" pregunta="¿Grabar el video? Cuesta unos US$ 1,36." confirmar="Sí, grabar" volver="Volver" alConfirmar={alConfirmar} alVolver={vi.fn()} />)
    const si = screen.getByRole("button", { name: "Sí, grabar" })
    expect(si.className).not.toMatch(/firma/)
    fireEvent.click(si)
    expect(alConfirmar).toHaveBeenCalledTimes(1)
  })

  it("confirms a destructive action with an error outline, never filled", () => {
    render(<ConfirmacionEnLinea trato="destructivo" pregunta="Se escribe un guion nuevo y este se descarta. ¿Seguro?" confirmar="Sí, pedir cambios" volver="Volver" alConfirmar={vi.fn()} alVolver={vi.fn()} />)
    const si = screen.getByRole("button", { name: "Sí, pedir cambios" })
    expect(si).toHaveClass("border-error", "text-error")
    expect(si.className).not.toMatch(/\bbg-(principal|error|firma)\b/)
  })

  it("moves focus to the question so a screen reader hears it", () => {
    render(<ConfirmacionEnLinea trato="neutro" pregunta="¿Volver a la versión de Claude?" confirmar="Sí, volver" volver="Cancelar" alConfirmar={vi.fn()} alVolver={vi.fn()} />)
    expect(screen.getByText("¿Volver a la versión de Claude?")).toHaveFocus()
  })
})
```

```tsx
// tests/unit/barra-de-firma.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BarraDeFirma } from "@/components/ui/barra-de-firma"

describe("BarraDeFirma", () => {
  it("is a labelled region fixed at the bottom with one action and one line", () => {
    render(<BarraDeFirma etiqueta="Firma" linea="Aprobar no gasta nada."><button type="button">x</button></BarraDeFirma>)
    const barra = screen.getByRole("region", { name: "Firma" })
    expect(barra).toHaveClass("fixed", "bottom-0", "shadow-barra")
    expect(screen.getByText("Aprobar no gasta nada.")).toHaveClass("text-meta")
  })
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement.** `BarraDeFirma({ etiqueta, linea?, children })`: `<section aria-label={etiqueta} className="fixed inset-x-0 bottom-0 z-10 bg-superficie shadow-barra">` with inner `mx-auto max-w-[560px] grid gap-2 px-5 pt-3 pb-[calc(8px+env(safe-area-inset-bottom))]`; `linea` as `<p className="text-meta text-apagado">` (a node is accepted so the motive line with `Info` can be passed). A spacer is the screen's job: each piece screen adds `pb-[calc(var(--barra-max)+var(--final-pagina)+env(safe-area-inset-bottom))]` (Phase 3). `ConfirmacionEnLinea({ trato: "gasto" | "destructivo" | "neutro", pregunta, confirmar, volver, alConfirmar, alVolver, cargando? })`: `<div className="confirmacion grid gap-2">` with `<p tabIndex={-1} ref={…} className="text-cuerpo">` focused on mount, then `Boton variante={trato === "destructivo" ? "linea" : "primario"}` with `className={trato === "destructivo" ? "border-error text-error" : undefined}` and `Boton variante="callado"` for `volver`. Add `.confirmacion` to `globals.css` as the same `@starting-style` 8 px rise and fade in `--dur-media`.
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(ui): sign bar and in-line confirmations`

### Task 17: Bottom navigation

Brandkit 9.22. «Inicio» active on `/ideas` and `/calendario`.

**Files:**
- Modify: `components/nav-inferior.tsx`, `tests/unit/nav-inferior.test.tsx`

- [ ] **Step 1: Failing test** (append; mock `usePathname` the way the file already does):

```tsx
  it.each(["/ideas", "/calendario"])("keeps Inicio current on %s, which hang from it", (ruta) => {
    rutaActual = ruta // the variable the existing mock reads
    render(<NavInferior />)
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page")
  })
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement.** `estaActiva`: Inicio is active for `/`, `/ideas*`, `/calendario*`. Style: `sticky bottom-0 z-10 grid grid-cols-3 border-t border-linea bg-fondo pb-[env(safe-area-inset-bottom)]` (no surface, no shadow); each link `relative grid min-h-14 justify-items-center content-center gap-0.5 text-meta`; active `font-semibold text-tinta` with `before:absolute before:top-0 before:h-0.5 before:w-6 before:bg-tinta`; inactive `font-medium text-apagado`; icons `House`, `ChartBar`, `GearSix` at 24. Keep the tablet rule (`md:top-0 …`).
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(nav): flat bottom nav with an ink rule on the current tab`

### Task 18: Toast

Brandkit 9.23.

**Files:**
- Modify: `components/ui/aviso.tsx`, `tests/unit/ui-aviso.test.tsx`

- [ ] **Step 1: Failing test** (append):

```tsx
  it("stays 8 seconds by default", () => {
    vi.useFakeTimers()
    const alCerrar = vi.fn()
    render(<Aviso mensaje="Idea descartada" alCerrar={alCerrar} />)
    vi.advanceTimersByTime(7_999)
    expect(alCerrar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(alCerrar).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run** -> FAIL (4.5 s).
- [ ] **Step 3: Implement.** `DURACION_DEL_AVISO_MS = 8000`. Classes: `aviso fixed inset-x-5 bottom-[calc(56px+12px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[520px] items-center justify-between gap-3 rounded-12 bg-tinta px-4 py-3 text-cuerpo text-sobre-tinta shadow-flotante`; «Deshacer» `min-h-11 px-2 font-semibold underline text-sobre-tinta`. On Guion and Video the bar is 104 px instead of the nav's 56: accept a `sobreBarra?: boolean` prop that switches to `bottom-[calc(var(--barra-max)+12px+env(safe-area-inset-bottom))]`. Check e2e specs that wait on the toast with a fake clock (grep `DURACION_DEL_AVISO_MS`).
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(ui): ink toast that stays 8 seconds`

### Task 19: Wordmark and loading skeletons

Brandkit 2, 9.24.

**Files:**
- Create: `components/ui/wordmark.tsx`, `tests/unit/wordmark.test.tsx`
- Modify: `app/(app)/loading.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Wordmark } from "@/components/ui/wordmark"

describe("Wordmark", () => {
  it("reads as Conidolly and draws the dot of the i in the signature", () => {
    render(<Wordmark />)
    expect(screen.getByRole("img", { name: "Conidolly" })).toBeInTheDocument()
    expect(document.querySelector("[data-punto]")).toHaveClass("fill-firma")
  })
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement** as inline SVG with `role="img" aria-label="Conidolly"`, `<text>` «conıdolly» (U+0131) in `fill-tinta`, `font-family: var(--letra)`, weight 600, `letter-spacing: -0.03em`, `font-size: 20px`, and `<circle data-punto className="fill-firma">` placed over the dotless i. Position the circle by measuring once in the browser (`getBBox` on a test page) and hard-coding `cx`, `cy`, `r` (1.25 x the original dot); write the measured numbers in a comment. Brandkit asks for outlined text as the final asset: note it as a follow-up (open question 6), live text is acceptable because the font is the app's own.

`app/(app)/loading.tsx`: title bar half width, rows at 4/5 and 3/5, `esqueleto h-3`.
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(marca): conidolly wordmark with the signing dot`

---

## Phase 3. Screens

Every screen task follows the same loop:
1. Open the mockup PNG and HTML in `docs/rediseno/pantallas/` and the matching section of `brandkit.md` (named in the task).
2. Read the e2e spec of the screen; list every label it asserts. They stay, except the brandkit changes named in the task.
3. Write or extend the failing test (unit for the screen's own components; e2e for structure that only exists in the real route, such as order of sections or "the bar does not cover the play").
4. Recompose with the Phase 2 primitives. Replace old classes by this table (from `mapeo-tokens.md`):

| Old | New |
|---|---|
| `text-display` | `text-pantalla` (screen titles) or `text-pieza` (piece titles, idea hook) |
| `text-title` | `text-pantalla` for «Ideas», «Buscar ideas»; `text-pieza` for piece titles |
| `text-script` | `text-guion` |
| `text-body`, `text-[1rem]`, `text-[1.0625rem]` | `text-cuerpo` (message) or `text-meta` (detail) |
| `text-label` | `text-meta font-semibold text-tinta` |
| `font-serif` | nothing (Geist + role size) |
| `bg-acento` on buttons | `Boton variante="primario"` |
| `text-acento` | `text-tinta` (`text-exito` for «Guardado») |
| `border-acento`, `ring-acento` | `border-tinta`, `ring-tinta` |
| `bg-hundido` | `bg-pista` only where a fill remains; otherwise no box |
| `bg-*-fondo` + `text-*-tinta` boxes, `Nota` | `LineaDeEstado` |
| `rounded-sm/md/lg/xl`, `rounded-[9px]` | `rounded-12` |
| `PildoraPilar`, `bg-pilar-*`, `text-pilar-*` | pillar word, `text-meta text-apagado` |
| `text-center` on text | remove (only the slider label, media and cell figures are centred) |
| `shadow-flotante` on panels | remove (only bar, idea card, toast are raised) |
| `accent-acento` | `Casilla` or `FilaConCheck` |

5. Run unit + the screen's e2e. Then `pnpm build && pnpm start` and load the route (RSC boundary).
6. Screenshot at 390 x 844 (and full page) in light and dark; compare against the mockup board side by side with `scripts/hoja-de-comparacion.ts` (Task 33 creates it; for tasks before 33, open both images next to each other). Record differences that are intentional in the commit body.
7. Grep own output: `grep -rn $'\u2014' <files>`; no hex; no `firma` outside the slider and the committed date.
8. Commit.

### Task 20: Ingreso

Mockup `ingreso.png` / `ingreso.html`; brandkit 2, 9.8, §10 Ingreso.

**Files:**
- Modify: `app/ingreso/page.tsx`, `app/ingreso/formulario-ingreso.tsx`, `components/casillas-codigo.tsx` (if Task 10 left anything), `tests/unit/ingreso.test.ts` (only if it asserts markup)
- Test: `tests/e2e/ingreso.setup.ts` labels unchanged

- [ ] **Step 1: Failing e2e** (add to `tests/e2e/accesibilidad.spec.ts`, using a fresh context without session):

```ts
test("Ingreso shows the wordmark, says a wrong code once and offers a new one as a secondary", async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await contexto.newPage()
  await page.goto("/ingreso")
  await expect(page.getByRole("img", { name: "Conidolly" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Hola, Coni" })).toBeVisible()
  await contexto.close()
})
```

(The wrong-code half: read `tests/e2e/ingreso.setup.ts` and `tests/unit/ingreso.test.ts`; if a wrong-code flow can run against Mailpit, assert `getByRole("alert")` count 1 and «Mandar otro código» as a button with a visible border. If not reproducible in e2e, cover it in a unit test of `formulario-ingreso.tsx` with the action mocked at the module boundary.)

- [ ] **Step 2: Run** -> FAIL (no wordmark).
- [ ] **Step 3: Implement:** wordmark 20 px at the top with 64 px below, «Hola, Coni» `text-pantalla`, explanation 18 apagado with the email in ink 600, principal «Mandarme el código» with `ArrowRight`, six code boxes, error as one `LineaDeEstado tipo="error"`, «Mandar otro código» `variante="linea"` when in error. Remove `text-center`.
- [ ] **Step 4: Run** e2e (all: `ingreso.setup.ts` gates the rest) -> PASS.
- [ ] **Step 5: Screenshot review** vs `ingreso.png` (states: email, code, code error, light and dark).
- [ ] **Step 6: Commit** `feat(ingreso): Calma suiza sign-in with the wordmark`

### Task 21: Inicio

Mockups `inicio.png`, `inicio-vacio.png`; brandkit 9.1, 9.3, 9.25, §10 Inicio.

**Files:**
- Modify: `app/(app)/page.tsx`, `app/(app)/avisos-sin-leer.tsx`, `app/(app)/ideas-semana.tsx`, `app/(app)/consulta-nueva.tsx`, `components/mensaje-primera-vez.tsx`, `tests/unit/ideas-semana.test.tsx`, `tests/unit/avisos-sin-leer.test.tsx`, `tests/unit/consulta-nueva.test.tsx` (only assertions on removed classes)
- Test: `tests/e2e/inicio.spec.ts`

- [ ] **Step 1: Failing e2e** (append to `tests/e2e/inicio.spec.ts`, reusing its seeding helpers):

```ts
test("the screen title is the summary and the signature section starts in the first screenful", async ({ page }) => {
  // seed as the existing "03-inicio" test does
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/cosas? esperan? tu firma/)
  const firma = page.getByRole("region", { name: "Necesita tu firma" })
  const caja = await firma.boundingBox()
  expect(caja?.y ?? 9999).toBeLessThan(420) // brandkit: about 240 px without notes; 420 leaves room for one note
})
```

Before writing, read `app/(app)/page.tsx` to see whether «Hola, Coni» is the h1 today (`getByRole("heading", { name: "Hola, Coni" })` is asserted 4 times in e2e). **Label decision:** the brandkit moves «Hola, Coni» to the 15 px pair and makes the summary the 32 px title. Keep «Hola, Coni» as a heading (`<h1>` stays «Hola, Coni» visually small? No: make the pair `<p>` and the summary `<h1>`, and update the 4 e2e assertions to `getByText("Hola, Coni")`). This is a structural change mandated by brandkit §10 and sintesis C16; list it in the commit body.

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement** in this order: pair «Hola, Coni» / «Semana del 5 al 11 de octubre» (15, left 600 ink, right apagado); `h1 text-pantalla` «2 cosas esperan tu firma» with «unos 6 min» 18 apagado 4 px under it (split the existing string at « · »; read how `lib/` builds it, `tests/unit/inicio-modelo.test.ts` covers the model, add a test there if a new function splits it); piece notes as `LineaDeEstado` with title in ink 600 and text action; `Seccion` «Necesita tu firma» `cifra={n}` with `FilaPieza` (thumbnail for videos waiting gate 2, `sinLeer` for avisos pointing at a listed piece **only if** Federico confirms C9, otherwise avisos keep their own section after «Necesita tu firma»); «Para subir a Instagram»; «Avisos»; «En camino» + `FilaNavegacion` «Ver calendario» («Programado» rows link to Video); «Ideas de la semana» with `Casilla` rows, principal «Escribir 3 guiones», `FilaNavegacion` «Ver todas las ideas»; «Consultas» with «3 consultas en octubre» and secondary «Llegó una consulta» with `Plus`. Empty state per 9.25. Page bottom padding `pb-[var(--final-pagina)]`.
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/inicio.spec.ts tests/e2e/consultas.spec.ts tests/e2e/avisos.spec.ts` -> PASS.
- [ ] **Step 5: Screenshot review** vs `inicio.png` and `inicio-vacio.png`.
- [ ] **Step 6: Commit** `feat(inicio): summary title, flat sections and the signature first`

### Task 22: Ideas (deck, search, own idea, discard)

Mockup `ideas.png`; brandkit 9.18, 9.10, 9.11.

**Files:**
- Modify: `app/(app)/ideas/page.tsx`, `banco-de-ideas.tsx`, `carta-de-idea.tsx`, `busqueda-de-ideas.tsx`, `idea-propia.tsx`, `descartar-idea.tsx`, `components/chip-de-alerta.tsx` (callers move to `LineaDeEstado`), `tests/unit/banco-de-ideas.test.tsx`
- Test: `tests/e2e/ideas.spec.ts`

- [ ] **Step 1: Failing unit test** (append to `banco-de-ideas.test.tsx`):

```tsx
  it("keeps Después and Usar esta right under the hook, above Por qué", () => {
    // render as the file already does with one idea
    const usar = screen.getByRole("button", { name: "Usar esta" })
    const porQue = screen.getByRole("button", { name: /Por qué/ })
    expect(usar.compareDocumentPosition(porQue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("offers Deshacer after a discard instead of asking first", async () => {
    // discard flow as the existing test does
    expect(await screen.findByRole("button", { name: "Deshacer" })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run** -> FAIL on the order (today «Por qué» comes first).
- [ ] **Step 3: Implement:** «‹ Inicio» (`CaretLeft` + «Inicio», 18/500, 44 target), title «Ideas» `text-pantalla` with «Buscar» text button + `MagnifyingGlass` on the right; pair «Nuevas de la semana» / «Idea 1 de 3»; card `carta-idea rounded-12 bg-superficie p-5 shadow-flotante` with pillar word, hook `text-pieza`, topic 18 apagado, meta 15 («Fuerza alta · Mito o realidad · Respaldo débil»: «Respaldo débil» stops being a chip), alerts as `LineaDeEstado tipo="aviso"`, then «Después» (linea) + «Usar esta» (primario, `ArrowRight`) in a row, then «Por qué» with `CaretDown`. Outside: «Descartar» `variante="destructiva"`, reasons as `FilaConCheck`, toast with «Deshacer»; «Escribir una idea mía» `callado` + `Plus`. Search: chips in one horizontally scrolling row (`flex gap-2 overflow-x-auto`), no fades. Own idea: pillar as `FilaConCheck` rows; text fields `.campo`.
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/ideas.spec.ts` -> PASS.
- [ ] **Step 5: Screenshot review** vs `ideas.png` (deck, Por qué open, search, own idea, discard reasons).
- [ ] **Step 6: Commit** `feat(ideas): one neutral card, actions under the hook, undoable discard`

### Task 23: Guion por aprobar (gate 1)

Mockup `guion-por-aprobar.png`; brandkit 9.1, 9.6 (committed date), 9.7, 9.8, 9.9, 9.10 (avatar), 9.12, 9.13.

**Files:**
- Modify: `app/(app)/guion/[id]/page.tsx`, `pantalla-guion.tsx`, `components/editor-de-guion.tsx`, `components/ayuda-de-marcas.tsx`, `components/texto-de-instagram.tsx`, `components/elegir-avatar.tsx`, `components/ui/marca-revision.tsx`, `tests/unit/editor-de-guion.test.tsx`, `tests/unit/elegir-avatar.test.tsx`, `tests/unit/ui-marca-revision.test.tsx`
- Test: `tests/e2e/guion.spec.ts`

**Label changes in this task (brandkit 9.13, «una línea por defecto»):** the help «Aprobar no gasta nada. Después grabas la voz y el video.» splits: «Aprobar no gasta nada.» stays in the bar, «Después grabas la voz y el video.» goes under the committed date. Update `tests/e2e/guion.spec.ts:91` to two assertions. «Marcas que conozco» becomes a disclosure (copy nuevo, brandkit 13.2: keep the words, ask Federico, open question 2); `AYUDA_DE_MARCAS` text unchanged.

- [ ] **Step 1: Failing tests**

`tests/unit/editor-de-guion.test.tsx` (append):

```tsx
  it("grows with the script and never scrolls inside", () => {
    // render as the file does
    const guion = screen.getByRole("textbox", { name: "Guion" })
    expect(guion).toHaveClass("campo", "text-guion")
    expect(guion).not.toHaveAttribute("rows")
  })
```

`tests/e2e/guion.spec.ts` (new test, same seed as the «04-guion» test):

```ts
test("gate 1 shows the committed date in the signature colour and the whole script without inner scroll", async ({ page }) => {
  // seed + goto as in the first test
  const fecha = page.getByText(/^jueves|^lunes|^martes|^miércoles|^viernes|^sábado|^domingo/).first()
  await expect(fecha).toHaveCSS("color", "rgb(168, 40, 90)")
  const guion = page.getByRole("textbox", { name: "Guion", exact: true })
  const [alto, altoDelContenido] = await guion.evaluate((el) => [el.clientHeight, el.scrollHeight])
  expect(altoDelContenido).toBeLessThanOrEqual(alto + 1)
  const barra = page.getByRole("region", { name: "Firma" })
  expect((await barra.boundingBox())?.height ?? 999).toBeLessThanOrEqual(112 + 34) // +34 safe area of the iPhone 14 descriptor
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement** the piece skeleton (9.1): «‹ Inicio»; meta pair (pillar / «Mito o realidad · 52 s»); `h1 text-pieza`; status line `tipo="fecha"`: «Si lo apruebas hoy, sale el» + `<span className="whitespace-nowrap font-semibold text-firma tabular-nums">jueves 8 de octubre · 19:00</span>` + detail «Después grabas la voz y el video.». `Seccion` «Guion» with `cifra` «123 palabras · ≈ 52 s · Bien» (+ `Check` exito); editor `textarea.campo text-guion` with `field-sizing: content` and a JS fallback (`useLayoutEffect` sets `style.height = scrollHeight` on input when `CSS.supports("field-sizing","content")` is false); help 15 apagado; «Marcas que conozco» `<details>` with tone chips (`rounded-full bg-pista px-2 text-meta font-medium text-apagado`). `Seccion` «Así sale en Instagram» (18/28 ink). `Seccion` «Avatar» (photos 3:4, two columns, `brightness(var(--foto-brillo))`, ring 2 px ink at 3 px offset when chosen, `Casilla` visual top right; the `radio` role and names «Estudio»/«Terraza» unchanged). `Seccion` «Revisión» with `MarcaRevision` per 9.7 (labels «Para confirmar:», «Hay que corregirlo:», checkbox «Lo revisé y está bien» unchanged). «Pedir cambios» `destructiva` at the end with `ConfirmacionEnLinea trato="destructivo"` (existing copy «Sí, pedir cambios»). `BarraDeFirma etiqueta="Firma" linea="Aprobar no gasta nada."` with the slider; with unsaved changes the bar holds `Boton` «Guardar cambios» and the line «Guarda tus cambios antes de aprobar». Bottom padding for the bar. Tone marks while reading: render the text splitting on `/(\[[a-z ]+\])/` into chips (pure function `partirEnMarcas` in `lib/` with its own unit test if one does not exist; check `lib/voz/etiquetas*` first).
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/guion.spec.ts` -> PASS.
- [ ] **Step 5: Screenshot review** vs `guion-por-aprobar.png` (ready, disabled with motive, unsaved changes, review findings), light and dark.
- [ ] **Step 6: Commit** `feat(guion): gate 1 with the committed date, the whole script and the sign bar`

### Task 24: Guion aprobado, recording, error and simple states

Mockups `guion-aprobado-sin-voz.png`, `guion-con-voz.png`, `guion-grabando.png`, `guion-error.png`; brandkit 9.5 (spend), 9.13, 9.14, 9.16, 9.25.

**Files:**
- Modify: `app/(app)/guion/[id]/pantalla-guion.tsx`, `barra-de-grabacion.tsx`, `voz-suelta.tsx`, `app/(app)/estado-de-pieza.tsx`, `tests/unit/barra-de-grabacion.test.tsx`
- Create: `tests/unit/estado-de-pieza.test.tsx`
- Test: `tests/e2e/guion.spec.ts`

**Label changes:** «Volver a Inicio» at the bottom disappears (brandkit 9.1: one way back, «‹ Inicio» at the top). Grep e2e for it: none today (`grep -rn "Volver a Inicio" tests/e2e` is empty), so no spec changes. «Descartar esta pieza» gets a confirmation whose copy is **nuevo** (brandkit 13.2): use «Se descarta esta pieza y no sale. ¿Seguro?» + «Sí, descartar» + «Volver» as a placeholder **behind a constant** `PREGUNTA_DESCARTAR_PIEZA` in `estado-de-pieza.tsx`, flagged in the PR for Federico (open question 2). The e2e does not assert this flow today; add one.

- [ ] **Step 1: Failing tests**

```tsx
// tests/unit/estado-de-pieza.test.tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/piezas/acciones", () => ({
  descartarAccion: vi.fn(async () => ({ ok: true })),
  reintentarAccion: vi.fn(), reintentarGuionAccion: vi.fn(), cambiarFechaAccion: vi.fn(),
}))
import { descartarAccion } from "@/app/(app)/piezas/acciones"
import { AccionesDeEstado } from "@/app/(app)/estado-de-pieza"

describe("AccionesDeEstado", () => {
  it("asks before discarding a piece and draws discard as destructive text", () => {
    render(<AccionesDeEstado piezaId="p" version={1} acciones={["descartar"]} />)
    const descartar = screen.getByRole("button", { name: "Descartar esta pieza" })
    expect(descartar).toHaveClass("text-error")
    fireEvent.click(descartar)
    expect(descartarAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Sí, descartar" }))
    expect(descartarAccion).toHaveBeenCalledWith("p", 1)
  })
})
```

(Mocking the server-action module is a boundary mock: the action talks to the DB. Check the real return type of `descartarAccion` in `app/(app)/piezas/acciones.ts` and mirror it.)

`tests/unit/barra-de-grabacion.test.tsx` (append):

```tsx
  it("puts the cost right of the one principal and asks before spending", () => {
    // render with voice already recorded, as the file does
    fireEvent.click(screen.getByRole("button", { name: "Grabar video" }))
    expect(screen.getByText(/¿Grabar el video\? Cuesta unos US\$/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sí, grabar" })).toBeInTheDocument()
  })
```

Read the file first: if the spend confirmation already exists with other copy, keep the app's copy and assert that instead.

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement:** status line «Guion aprobado · falta grabar»; `Seccion` «Voz» with `ReproductorVoz` and, when the bar holds «Grabar video», «Volver a grabar voz» as `linea` + `CostoDeAccion`; script in reading mode with tone chips; Instagram text in ink; avatar thumbnail; «Volver a revisar el guion» `callado` at the end. `BarraDeFirma` with a grid `1fr auto`: the principal («Grabar voz» + `Microphone` or «Grabar video» + `VideoCamera`) and `CostoDeAccion`, then `LineaDeSaldo` (two lines allowed); spend confirmation replaces the bar content (`ConfirmacionEnLinea trato="gasto"`). Blocked by balance or cap: no bar, action disabled in the flow with its cost, `LineaDeEstado tipo="aviso"` 18 under the header. Recording / writing states: status line with `PuntoTrabajando`, no bar. Production error: `LineaDeEstado tipo="error"` and «Mientras tanto, puedes escuchar la voz.» above the player. `VolverAInicio` deleted; its callers removed.
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/guion.spec.ts` -> PASS. Add the discard-piece e2e (seed a piece in a simple state, discard, confirm, assert the row is gone from Inicio).
- [ ] **Step 5: Screenshot review** vs the four mockups.
- [ ] **Step 6: Commit** `feat(guion): approved and recording states with cost beside the one action`

### Task 25: Video por aprobar (gate 2)

Mockup `video-por-aprobar.png`; brandkit 9.17, 9.3 (check rows), 9.5 (Regrabar).

**Files:**
- Modify: `app/(app)/video/[id]/page.tsx`, `pantalla-video.tsx`, `components/mensaje-primera-vez.tsx`
- Test: `tests/e2e/video.spec.ts`

- [ ] **Step 1: Failing e2e** (append to `video.spec.ts`, same seed as its first test):

```ts
test("the whole video and its play are visible above the sign bar on load at 390 x 844", async ({ page }) => {
  // seed + goto as the first test
  const play = page.getByRole("button", { name: "Reproducir el video" })
  const barra = page.getByRole("region", { name: "Firma" })
  const [cajaPlay, cajaBarra, cajaVideo] = await Promise.all([play.boundingBox(), barra.boundingBox(), page.getByTestId("reproductor-video").boundingBox()])
  if (!cajaPlay || !cajaBarra || !cajaVideo) throw new Error("missing boxes")
  expect(cajaPlay.y + cajaPlay.height).toBeLessThan(cajaBarra.y)
  expect(cajaVideo.y + cajaVideo.height).toBeLessThanOrEqual(cajaBarra.y)
})
```

- [ ] **Step 2: Run** -> FAIL (today the controls fall under the bar).
- [ ] **Step 3: Implement** (9.17 order): «‹ Inicio», video first, then meta pair, `h1 text-pieza`, status line «Míralo completo para aprobar» -> «Lo viste completo» (exito), `callado` «Ver zonas de Instagram». After watching, flat flow: `Casilla` «Revisé labios, nombre, subtítulos y cortes» (existing label), `Seccion` «Así sale en Instagram» with «Editar el texto», `Seccion` «Fecha de publicación» as `FilaConValor`-like row «jueves 8 de octubre · 19:00» 600 + «Cambiar» opening `FilaConCheck` options, detail «Hora de Chile · próximo horario libre»; «Regrabar» `destructiva` with `ConfirmacionEnLinea trato="destructivo"` whose question carries the cost (existing copy). No elevated panel (delete the `shadow-flotante` panel). `BarraDeFirma` with the slider «Desliza para aprobar video y fecha» and its motive.
- [ ] **Step 4: Run** `pnpm test:e2e tests/e2e/video.spec.ts` -> PASS.
- [ ] **Step 5: Screenshot review** vs `video-por-aprobar.png` (on open, watched, date options, regrabar confirm), light and dark (video never dimmed in dark: assert `filter` is `none` on the `<video>` in the dark test of Task 4 if not already).
- [ ] **Step 6: Commit** `feat(video): gate 2 with the video above the bar and a flat review`

### Task 26: Upload by hand and closing moments

Brandkit 9.25 (momento de cierre), 9.4 (destructive never filled), sintesis §6 «Estados sencillos y finales».

**Files:**
- Modify: `app/(app)/video/[id]/subir-a-mano.tsx`, `pantalla-video.tsx` (scheduled, published states), `tests/unit/subir-a-mano.test.tsx`
- Test: `tests/e2e/subir-a-mano.spec.ts`

- [ ] **Step 1: Failing unit test** (append to `subir-a-mano.test.tsx`):

```tsx
  it("numbers the four steps as content and never fills a destructive button", () => {
    // render as the file does
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    for (const boton of screen.getAllByRole("button")) expect(boton.className).not.toMatch(/\bbg-(error|firma)\b/)
  })
```

- [ ] **Step 2: Run** -> FAIL if steps are not an `<ol>`.
- [ ] **Step 3: Implement:** steps as `<ol>` with 15/600 numbers in the icon column; «Descargar video», «Ya lo subí» (requires «Activé la etiqueta…» checkbox, unchanged); closing moments: `CheckCircle size={32}` exito, title 24/600, detail 18, 72 x 128 thumbnail, «Ver en Instagram» + `ArrowUpRight`.
- [ ] **Step 4: Run** `pnpm test:e2e tests/e2e/subir-a-mano.spec.ts` -> PASS.
- [ ] **Step 5: Screenshot review** vs `actual/video-para-subir.png`, `video-publicado.png` (structure) and brandkit 9.25.
- [ ] **Step 6: Commit** `feat(video): numbered upload steps and quiet closing moments`

### Task 27: Calendario (Mes, Agenda, Ritmo)

Mockup `calendario.png` (three phones); brandkit 9.19.

**Files:**
- Modify: `app/(app)/calendario/page.tsx`, `components/vistas-del-calendario.tsx`, `components/mes-del-calendario.tsx`, `components/agenda-del-calendario.tsx`, `components/ritmo-del-calendario.tsx`
- Create: `tests/unit/mes-del-calendario.test.tsx`
- Test: `tests/e2e/calendario.spec.ts`

- [ ] **Step 1: Failing unit test**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MesDelCalendario } from "@/components/mes-del-calendario"

describe("MesDelCalendario", () => {
  it("makes a day with a publication a link that a screen reader hears with its title", () => {
    // render with October 2026 and one publication on Thursday 8, using the component's real props
    expect(screen.getByRole("link", { name: /jueves 8: Pareja y conversación/ })).toBeInTheDocument()
  })
  it("marks today with aria-current", () => {
    expect(screen.getByText("6").closest("[aria-current]")).toHaveAttribute("aria-current", "date")
  })
})
```

Read the component's props and `tests/unit/calendario-modelo.test.ts` first; build the fixture from the model function the page already uses.

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement:** «‹ Inicio», title «Octubre», `Pestanas` Mes · Agenda · Ritmo (hrefs as today). Mes: initials 15/500 apagado, 7 columns gap 4, 48 high cells, number 15/500 tabular centred, past days apagado, today `size-9 rounded-full bg-tinta text-sobre-tinta font-semibold`, 6 px ink dots (max 2), day with publication is a `Link` to the Agenda on that day; then «Para subir» and «Próximos» sections with `FilaPieza`. Agenda: `Seccion` per week, rows grid `72px_1fr` with day 15/600 and time 15 apagado tabular, title 18/600, pillar word, state 15/500 with its 16 px icon and ink (Programado exito `CheckCircle`, Para subir aviso `Export`, Falta tu firma aviso `PenNib`, Algo falló error `WarningCircle`, Grabando ink + `PuntoTrabajando`); «Libre · elige una idea» 18/500 apagado + caret. Ritmo: grid `56px repeat(3,1fr)`, headers 15/600, week labels 15 apagado tabular (current ink 600), filled cell = first word of the pillar 15/500 over a 4 px ink bar, free = «libre» apagado over 1 px `campo` line.
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/calendario.spec.ts` -> PASS («Nada programado este mes.», «Mes», «Agenda» unchanged).
- [ ] **Step 5: Screenshot review** vs the three phones of `calendario.png`.
- [ ] **Step 6: Commit** `feat(calendario): ink month, flat agenda and line-and-bar rhythm`

### Task 28: Métricas

Mockup `metricas.png`; brandkit 9.20, sintesis C17.

**Files:**
- Modify: `app/(app)/metricas/page.tsx`, `components/barra-de-metrica.tsx`, `components/progreso-de-reels.tsx`, `components/panel-de-comparacion.tsx` (content moves inline; file deleted in Task 34)
- Create: `tests/unit/barra-de-metrica.test.tsx`
- Test: `tests/e2e/metricas.spec.ts`

**Copy nuevo:** «Ver todas» for the folded rest (brandkit 13.2). Implement the fold as `<details>` whose `<summary>` reuses the existing section title where possible; if a new string is unavoidable, use «Ver las demás» behind a constant and flag it (open question 2).

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BarraDeMetrica } from "@/components/barra-de-metrica"

describe("BarraDeMetrica", () => {
  it("draws a 4 px ink bar without a track and always says its sample", () => {
    // render with the component's real props: value 50.4, best 50.4, sample "121 guardados de 2.400 personas"
    expect(screen.getByText("50,4")).toHaveClass("text-pieza", "tabular-nums")
    expect(screen.getByText("121 guardados de 2.400 personas")).toBeInTheDocument()
    expect(document.querySelector("[data-pista]")).toBeNull()
  })
})
```

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement:** pair «Métricas» label over title «Octubre» (sintesis §6), summary; comparison as text with 8 reel segments (filled 4 px ink, empty 1 px `campo`); «Lo que sirvió» top 5 with figure 24/600 + unit 15 apagado, bar 4 px ink proportional to the best, sample line, pillar + count apagado; rest and «Semana a semana» folded. Empty: «Todavía no hay reels publicados.» + detail. No pillar colours.
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/metricas.spec.ts` -> PASS («Todavía es temprano para concluir» unchanged).
- [ ] **Step 5: Screenshot review** vs `metricas.png`.
- [ ] **Step 6: Commit** `feat(metricas): comparison first, top five, ink bars without tracks`

### Task 29: Ajustes and «Cuentas conectadas» as its own level

Mockup `ajustes.png`; brandkit 9.21, 9.15, 9.10.

**Files:**
- Modify: `app/(app)/ajustes/page.tsx`, `editor-de-ajustes.tsx`, `avisos-del-celular.tsx`, `bloque-de-estado.tsx`, `cuentas-conectadas.tsx`, `saldos.tsx`, `tests/unit/editor-de-ajustes.test.tsx`, `tests/unit/cuentas-conectadas.test.tsx`, `tests/unit/saldos-ajustes.test.tsx`, `tests/unit/avisos-del-celular.test.tsx`
- Create: `app/(app)/ajustes/cuentas/page.tsx`
- Modify: `tests/e2e/ajustes.spec.ts`, `tests/e2e/avisos.spec.ts` (navigation step only)

**Structure change:** accounts, keys and API balances move to `/ajustes/cuentas`, reached from a `FilaNavegacion` «Cuentas conectadas» on `/ajustes`. Labels inside («Conectar Instagram», «Guardar y comprobar», «US$ 50»…) unchanged; e2e specs that assert them on `/ajustes` gain one step: `await page.getByRole("link", { name: "Cuentas conectadas" }).click()`. The setup-status block («Estado de la configuración») stays on `/ajustes` only while something is missing and never repeats the accounts (brandkit 9.21). The Meta OAuth callback (`app/api/meta/callback/route.ts`) redirects somewhere today: read it; if it redirects to `/ajustes`, change it to `/ajustes/cuentas` and update its unit test (`tests/unit/instagram-oauth.test.ts` or similar) first.

- [ ] **Step 1: Failing tests**

`tests/unit/editor-de-ajustes.test.tsx` (append):

```tsx
  it("shows the publishing days as seven ink chips and the hour as a value row", () => {
    // render as the file does
    expect(screen.getAllByRole("button", { pressed: true }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/A las/)).toHaveAttribute("type", "time")
  })

  it("turns the spend meter to aviso from 80 percent of the cap", () => {
    // render with spent 32 and cap 40
    expect(screen.getByRole("meter", { name: "Gasto del mes" })).toHaveClass("text-aviso")
  })
```

`tests/e2e/ajustes.spec.ts`: add the navigation step before every assertion on account content; add `await expect(page).toHaveURL(/\/ajustes\/cuentas$/)`.

- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement:** flat iOS lists (no grouped cells): `Seccion` «Publicación» with 7 `Chip` (columns `grid-cols-7 gap-1`) and `FilaConValor tipo="time"` «A las · 19:00 hora de Chile»; «Meta de este mes» `FilaConValor`; «Tope de gasto al mes» with the stepper (two 44 px `linea` square buttons with `Minus`/`Plus` and the value 24/600 tabular) and `Medidor`; «Avisos» with `FilaConInterruptor` rows and the phone block as status lines + principal «Activar avisos»; setup status only while incomplete (steps with «Listo» exito / «Falta» aviso, text + icon right); `FilaNavegacion` «Cuentas conectadas»; «Cerrar sesión» `callado` at the end. New page `/ajustes/cuentas`: «‹ Ajustes», title «Cuentas conectadas», one row per account with its state as 15/500 text + icon in its ink (no chip), keys (password field + «Guardar y comprobar»), balances with their explanation. It reuses `cuentas-conectadas.tsx` and `saldos.tsx` as they are after restyle, and the same data loader the current page uses (move the loader call, do not duplicate the query).
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/ajustes.spec.ts tests/e2e/avisos.spec.ts` -> PASS. `pnpm build` and load both routes.
- [ ] **Step 5: Screenshot review** vs `ajustes.png`.
- [ ] **Step 6: Commit** `feat(ajustes): flat lists, spend meter and accounts on their own level`

### Task 30: `/l` public page

Brandkit 2 (`/l`), `--t-marca`.

**Files:**
- Modify: `app/l/page.tsx`
- Test: `tests/e2e/enlaces.spec.ts`

- [ ] **Step 1: Failing e2e** (append to `enlaces.spec.ts`):

```ts
test("/l is raspberry edge to edge with Coni's name in Geist 44, without the app wordmark", async ({ page }) => {
  await page.goto("/l")
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(168, 40, 90)")
  await expect(page.getByRole("img", { name: "Conidolly" })).toHaveCount(0)
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "44px")
})
```

- [ ] **Step 2: Run** -> FAIL on the font size or family.
- [ ] **Step 3: Implement:** `text-marca font-semibold tracking-[-0.022em] text-sobre-firma` for «Coni del Rosario», all text `text-sobre-firma` without opacity, links as rows with `ArrowUpRight`, focus ring visible on raspberry (the double ring already works). Labels «Agenda una consulta», «Ser tu propia diosa»… unchanged.
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Screenshot review** (no mockup board for `/l`; compare with brandkit §2 and `actual/enlace-publico.png` structure).
- [ ] **Step 6: Commit** `feat(l): public page in the shared raspberry and Geist`

### Task 31: Shared shells (error, offline bar, only-for-Coni, app layout)

Brandkit 9.6 (offline, screen error), 5 (margins 20, column 560, 96 px end).

**Files:**
- Modify: `app/(app)/layout.tsx`, `app/(app)/error.tsx`, `components/barra-sin-conexion.tsx`, `app/(app)/solo-para-coni.tsx`, `app/(app)/muy-pronto.tsx`, `components/refresco-automatico.tsx` (only if it renders UI), `tests/unit/barra-sin-conexion.test.tsx`

- [ ] **Step 1: Failing test** (append to `barra-sin-conexion.test.tsx`):

```tsx
  it("says it without painting a background", () => {
    // go offline as the file does
    const linea = screen.getByText("Sin conexión. Aprueba cuando vuelva.")
    expect(linea.closest("[role=status]")?.className ?? "").not.toMatch(/\bbg-/)
  })
```

- [ ] **Step 2: Run** -> FAIL if it paints today.
- [ ] **Step 3: Implement:** layout `px-5` (20 px), `max-w-[560px]`, `pb-[var(--final-pagina)]`; offline line 44 high, `WifiSlash` aviso, 15/600 ink, `border-b border-linea`; screen error = `LineaDeEstado tipo="error"` «No pude cargar esta pantalla.» + detail + `linea` «Intentar de nuevo» (existing copy, check `error.tsx`).
- [ ] **Step 4: Run** unit + `pnpm test:e2e tests/e2e/solo-coni.spec.ts` -> PASS.
- [ ] **Step 5: Commit** `feat(app): 20 px axis, flat offline line and screen error`

---

## Phase 4. Guard rails

### Task 32: Accessibility checks per screen (axe AA, 44 px targets)

**Files:**
- Modify: `package.json` (`pnpm add -D @axe-core/playwright`), `tests/e2e/accesibilidad.spec.ts`

- [ ] **Step 1: Write the tests** (they should pass if Phase 3 was done right; any failure is a real defect to fix in this task, one fix per finding, each with the test already red):

```ts
import AxeBuilder from "@axe-core/playwright"
import { expect, type Page, test } from "@playwright/test"
// import the seeding helpers the screen specs use to create one piece in each state: guion por aprobar, video por aprobar

async function rutas(page: Page): Promise<string[]> {
  const guion = await sembrarGuionPorAprobar(page) // reuse helpers from guion.spec.ts / ayudas.ts; move them to ayudas.ts if they live in a spec
  const video = await sembrarVideoPorAprobar(page)
  return ["/", "/ideas", "/calendario", "/calendario?vista=agenda", "/calendario?vista=ritmo", "/metricas", "/ajustes", "/ajustes/cuentas", `/guion/${guion}`, `/video/${video}`, "/l"]
}

for (const esquema of ["light", "dark"] as const) {
  test(`every screen passes WCAG 2.x AA in ${esquema}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: esquema })
    for (const ruta of await rutas(page)) {
      await page.goto(ruta)
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("video").analyze()
      expect(violations.map((v) => `${ruta}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([])
    }
  })
}

test("every control on every screen is at least 44 x 44", async ({ page }) => {
  for (const ruta of await rutas(page)) {
    await page.goto(ruta)
    const chicos = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button, [role=slider], [role=switch], input:not([type=hidden]), select, summary")]
        .filter((el) => el.offsetParent !== null && !el.closest("[aria-hidden=true]"))
        .map((el) => ({ el, caja: (el.closest("label") ?? el).getBoundingClientRect() }))
        .filter(({ caja }) => caja.width < 44 || caja.height < 44)
        .map(({ el, caja }) => `${el.tagName} "${el.textContent?.trim().slice(0, 30) || el.getAttribute("aria-label")}" ${Math.round(caja.width)}x${Math.round(caja.height)}`),
    )
    expect(chicos, ruta).toEqual([])
  }
})
```

Visually hidden inputs (`sr-only` radios and checkboxes) are measured through their `label` (the real target). Inline text links inside prose are exempt under WCAG 2.5.8 (inline); if any appear, exclude them with a `data-en-linea` attribute and say why in a comment.

- [ ] **Step 2: Run** `pnpm test:e2e tests/e2e/accesibilidad.spec.ts`. Fix each violation in the component that owns it (test stays red until fixed).
- [ ] **Step 3: Commit** `test(a11y): axe AA in both themes and 44 px targets on every screen`

### Task 33: Visual regression at 390 px against the mockups

**Approach (decided):** the mockups are annotated boards, not screenshots, so they cannot be the pixel baseline. Two layers:
1. **Human gate against the mockups:** `scripts/hoja-de-comparacion.ts` builds one PNG per screen with the app capture (390 wide, full page, light) on the left and the matching mockup board on the right, so the reviewer (Federico) approves each screen once.
2. **Machine gate against regressions:** after that approval, Playwright `toHaveScreenshot` baselines of the **app** are committed and every later run diffs against them (`maxDiffPixelRatio: 0.01`, animations disabled, caret hidden, dynamic regions masked).

Baselines are platform-specific: they are generated and checked on macOS (darwin) only, which is where e2e runs today (CI does not run e2e: `.github/workflows/ci.yml` only runs unit, lint, type, build). Snapshot file names carry `-darwin`.

**Files:**
- Create: `tests/e2e/visual.spec.ts`, `scripts/hoja-de-comparacion.ts`, `tests/e2e/visual.spec.ts-snapshots/*` (generated)
- Modify: `playwright.config.ts` (`expect.toHaveScreenshot` defaults), `package.json` (script `"comparar": "tsx scripts/hoja-de-comparacion.ts"`), `.gitignore` (`test-results/comparacion/`)

- [ ] **Step 1: Config**

```ts
// playwright.config.ts, inside defineConfig
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide", scale: "css" },
  },
```

- [ ] **Step 2: Write the spec**

```ts
// tests/e2e/visual.spec.ts
import { expect, type Page, test } from "@playwright/test"
// seeding helpers as in accesibilidad.spec.ts

const PANTALLAS = [
  { nombre: "inicio", ruta: () => "/" },
  { nombre: "ideas", ruta: () => "/ideas" },
  { nombre: "calendario-mes", ruta: () => "/calendario" },
  { nombre: "calendario-agenda", ruta: () => "/calendario?vista=agenda" },
  { nombre: "calendario-ritmo", ruta: () => "/calendario?vista=ritmo" },
  { nombre: "metricas", ruta: () => "/metricas" },
  { nombre: "ajustes", ruta: () => "/ajustes" },
  { nombre: "ajustes-cuentas", ruta: () => "/ajustes/cuentas" },
  { nombre: "l", ruta: () => "/l" },
] as const

async function estabilizar(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  // Server-rendered dates come from the seed; the client clock is frozen so relative labels do not move.
}

const mascaras = (page: Page) => [page.locator("video"), page.locator("img[src*='almacen.test']"), page.getByTestId("fecha-relativa")]

for (const esquema of ["light", "dark"] as const) {
  for (const pantalla of PANTALLAS) {
    test(`${pantalla.nombre} ${esquema}`, async ({ page }) => {
      await page.clock.install({ time: new Date("2026-10-06T10:30:00-03:00") })
      await page.emulateMedia({ colorScheme: esquema, reducedMotion: "reduce" })
      await page.goto(pantalla.ruta())
      await estabilizar(page)
      await expect(page).toHaveScreenshot(`${pantalla.nombre}-${esquema}.png`, { fullPage: true, mask: mascaras(page) })
    })
  }
  test(`guion por aprobar ${esquema}`, async ({ page }) => { /* seed, goto /guion/<id>, same three lines */ })
  test(`video por aprobar ${esquema}`, async ({ page }) => { /* seed, goto /video/<id>, same */ })
  test(`ingreso ${esquema}`, async ({ browser }) => { /* new context without session, goto /ingreso */ })
}
```

Write out the three seeded tests in full when implementing, using the same seeding helpers as `accesibilidad.spec.ts` (move shared seeders to `tests/e2e/ayudas.ts` once, in this task, if they live inside specs). The seed data must be deterministic: fixed titles from `docs/rediseno/inventario.md` §14, fixed dates relative to the frozen «martes 6 de octubre». If the server computes «hoy» with `new Date()`, server-rendered text can drift: wrap those nodes with `data-testid="fecha-relativa"` so they are masked, or seed with absolute dates. Read the spec setups first and pick the cheaper.

- [ ] **Step 3: Write the comparison sheet script**

```ts
// scripts/hoja-de-comparacion.ts
// Puts each app capture (left) next to its mockup board (right) for a one-time human review against the design.
import { mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

const CAPTURAS = join(process.cwd(), "tests", "e2e", "visual.spec.ts-snapshots")
const MOCKUPS = join(process.cwd(), "docs", "rediseno", "pantallas")
const SALIDA = join(process.cwd(), "test-results", "comparacion")
const PAREJAS: Record<string, string> = {
  "inicio-light": "inicio.png",
  "ideas-light": "ideas.png",
  "calendario-mes-light": "calendario.png",
  "metricas-light": "metricas.png",
  "ajustes-light": "ajustes.png",
  "guion-por-aprobar-light": "guion-por-aprobar.png",
  "video-por-aprobar-light": "video-por-aprobar.png",
  "ingreso-light": "ingreso.png",
}

async function main() {
  mkdirSync(SALIDA, { recursive: true })
  for (const archivo of readdirSync(CAPTURAS)) {
    const clave = Object.keys(PAREJAS).find((k) => archivo.startsWith(k))
    if (!clave) continue
    const izquierda = sharp(join(CAPTURAS, archivo))
    const derecha = sharp(join(MOCKUPS, PAREJAS[clave]))
    const [mi, md] = await Promise.all([izquierda.metadata(), derecha.metadata()])
    const alto = Math.max(mi.height ?? 0, md.height ?? 0)
    await sharp({ create: { width: (mi.width ?? 0) + 40 + (md.width ?? 0), height: alto, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([{ input: await izquierda.toBuffer(), left: 0, top: 0 }, { input: await derecha.toBuffer(), left: (mi.width ?? 0) + 40, top: 0 }])
      .png()
      .toFile(join(SALIDA, `${clave}.png`))
    console.log(`hoja: ${clave}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
```

`sharp` ships with Next (`node_modules/sharp`); if it is not resolvable as a direct import, `pnpm add -D sharp`.

- [ ] **Step 4: Generate the first baselines** `pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots`, then `pnpm comparar`. Review every sheet in `test-results/comparacion/` against the mockups and brandkit. Fix differences that are defects (each in its screen's files, re-run). Differences that are intentional (seed content differs, real data) are listed in the commit body.
- [ ] **Step 5: Gate:** **stop and ask Federico to review the sheets** (send the folder path; do not upload anywhere). Commit baselines only after his OK.
- [ ] **Step 6: Run** `pnpm test:e2e tests/e2e/visual.spec.ts` twice in a row -> PASS both (proves determinism).
- [ ] **Step 7: Commit** `test(visual): reviewed 390 px baselines per screen in both themes`

### Task 34: Remove aliases, pillar styles and old components; close the palette

`mapeo-tokens.md` §10.4.

**Files:**
- Modify: `app/globals.css`, `tests/unit/diseno-reglas.test.ts`
- Delete: `components/nota.tsx`, `components/ui/pildora-pilar.tsx`, `tests/unit/ui-pildora-pilar.test.tsx`, `components/ui/segmentado.tsx`, `components/chip-de-alerta.tsx`, `components/panel-de-comparacion.tsx` (only after `grep` shows no importers)

- [ ] **Step 1: Failing rule** (append):

```ts
  it("uses only Calma suiza token names", () => {
    const viejos = /\b(acento|hundido|ok-tinta|ok-fondo|aviso-fondo|error-fondo|aviso-tinta|error-tinta|pilar-tinte|pilar-tinta|pilar-punto|font-serif|text-display|text-title|text-script|text-body|text-label|rounded-(sm|md|lg|xl)|ease-fuerte)\b/
    expect(CODIGO.filter((ruta) => viejos.test(leer(ruta)))).toEqual([])
  })

  it("keeps the signature colour to the slider and the committed date", () => {
    const permitidos = new Set(["components/deslizar-para-aprobar.tsx", "app/(app)/guion/[id]/pantalla-guion.tsx", "app/(app)/video/[id]/pantalla-video.tsx", "components/ui/wordmark.tsx", "app/l/page.tsx"])
    expect(CODIGO.filter((ruta) => /\b(text|bg|fill|border|ring)-firma\b/.test(leer(ruta)) && !permitidos.has(ruta))).toEqual([])
  })
```

Adjust `permitidos` to the files where the committed date really lives (it may be a shared component after Task 23).

- [ ] **Step 2: Run** -> FAIL with the remaining offenders. Migrate each (they are leftovers of Phase 3).
- [ ] **Step 3:** Delete the alias block, `[data-pilar]` block and the old `@theme` names; add the four `initial` lines (`--color-*`, `--radius-*`, `--shadow-*`, `--text-*`) at the top of `@theme inline`. `pnpm build`: any forgotten default utility (`bg-white`, `rounded-lg`) now compiles to nothing; grep the CSS output for them is not needed because the rules test and the visual baselines catch it.
- [ ] **Step 4: Run** everything: `pnpm test:run && pnpm lint && pnpm type && pnpm test:e2e` (full suite, including visual: must be identical, the aliases resolved to the same values).
- [ ] **Step 5: Commit** `refactor(diseno): drop transition aliases and close the default palette`

---

## Phase 5. Verification and production

### Task 35: Final verification and Vercel production checklist

No migrations, no env changes, no secrets. Vercel only.

- [ ] **Step 1: Full local gate**

```bash
pnpm test:run
pnpm lint
NODE_OPTIONS=--max-old-space-size=4096 pnpm type
pnpm build
supabase start && pnpm test:e2e      # full suite, includes accesibilidad and visual
git diff --stat main~35..HEAD -- supabase/   # expect nothing: no migrations
grep -rn $'\u2014' app components lib docs/rediseno/*.md | grep -v "^docs/rediseno" ; echo "em dash check done"
```

- [ ] **Step 2: Real routes.** `pnpm start` and open every route at 390 x 844 in light and dark, plus 768 (tablet column 560) and with the browser text size at 200 % (rem scaling; brandkit 13.4: Dynamic Type is not promised). Check nothing overflows horizontally (`document.documentElement.scrollWidth <= innerWidth` in the console).
- [ ] **Step 3: WebKit check of the slider** (brandkit 13.1, sintesis C11, a non-negotiable): run the slider e2e once on WebKit: `pnpm exec playwright install webkit` (asks the user before downloading: name, source, size), then a one-off `--project` with `devices["iPhone 14"]` default WebKit for `guion.spec.ts`. Then on Coni's real iPhone via a Vercel **preview** deployment: tap the track end (nothing happens), drag to the end (approves on release), scroll the page starting on the track (page scrolls). Record the result in the PR.
- [ ] **Step 4: Preview deploy.** Push the branch (only when Federico says so), let Vercel build the preview, and check: `/icon` and `/apple-icon` render, `/manifest.webmanifest` colours, `<meta name="theme-color">` has two entries, Geist loads (no request to `fonts.googleapis.com`), `/l` raspberry. Use a cache-busted URL (`?v=1`) for every check.
- [ ] **Step 5: Production.** After Federico approves the preview: merge to `main` (Vercel deploys production). Confirm it is served: `curl -s https://conidolly.vercel.app/ingreso?v=$(date +%s) | grep -c "font-geist-sans"` -> 1 or more, and `curl -s https://conidolly.vercel.app/manifest.webmanifest | grep f7f6f3`. Prod alias lags 15 to 45 s.
- [ ] **Step 6: Installed PWA note for Coni.** iOS caches the home-screen icon: the new icon appears only after removing and re-adding the app to the home screen. `public/sw.js` may cache old CSS: read it; if it caches app shell assets by name, bump its cache version in this task with a test in `tests/unit/service-worker.test.ts`.
- [ ] **Step 7: Rollback plan.** Every task is one commit; the visual change is concentrated in Task 1 (tokens) and Phase 3. Rollback = Vercel "Promote previous deployment" (instant), then `git revert` the range.
- [ ] **Step 8: Update docs.** `docs/TRASPASO.md`: one paragraph pointing to `docs/rediseno/brandkit.md` as the design source and noting `docs/DESIGN.md` (if it exists) is superseded; update the comments in code that cite `DESIGN.md` sections only where touched.
- [ ] **Step 9: Commit** `docs: point the handover to the Calma suiza design system`

---

## Self-review

**Spec coverage (brandkit section -> task):** §2 brand -> 3, 19, 30 · §3 colour + dark -> 1, 4 · §4 type -> 1, 2 · §5 grid -> 31 · §6 shape, focus -> 1 · §7 icons -> 5 · §8 motion -> 1, 6, 12 · 9.1 skeleton -> 23 to 26 · 9.2 -> 8 · 9.3 -> 9 · 9.4 -> 6 · 9.5 -> 16 · 9.6 -> 7 · 9.7 -> 23 · 9.8 -> 10, 23 · 9.9 -> 23 · 9.10 -> 9, 10, 11 · 9.11 -> 9, 22, 34 · 9.12 -> 12 · 9.13 -> 16, 23, 24 · 9.14 -> 15, 24 · 9.15 -> 15, 29 · 9.16 -> 13 · 9.17 -> 14, 25 · 9.18 -> 22 · 9.19 -> 27 · 9.20 -> 28 · 9.21 -> 29 · 9.22 -> 17 · 9.23 -> 18 · 9.24 -> 19 · 9.25 -> 21, 26 · §11 a11y -> 32 · visual -> 33 · production -> 35.

**Known gaps by design:** WCAG 2.5.7 non-drag alternative for the slider (needs copy nuevo, open question 1); avisos merged as unread dots (C9, open question 3); Dynamic Type (13.4) not promised.

---

## Risks

1. **RSC boundary breakage** from icon and import rewrites (Task 5, every Phase 3 task): Phosphor's default entry is client-only. Mitigated by the rules test (`"use client"` first line, SSR entry in server modules) and loading the real route before each commit.
2. **The slider on WebKit** (pointer capture, `touch-action`, scroll vs drag on iOS Safari) is unverified; Chromium e2e passes do not prove it. Gate in Task 35 step 3, on Coni's phone.
3. **Visual baselines are flaky** if seeds or server dates move; they are darwin-only and not in CI. Mitigated by frozen clock, masks, reduced motion, and the double-run check.
4. **E2E label churn:** three brandkit-driven changes (split help line in gate 1, «Hola, Coni» stops being the h1, accounts move to `/ajustes/cuentas`) touch existing specs; everything else must stay byte-identical.
5. **`field-sizing: content`** support on Coni's iOS (13.7): JS fallback included in Task 23; verify on the device.
6. **Icon routes** need the Geist TTF at runtime on Vercel (file tracing); checked in Task 3 and on the preview.
7. **PWA caches:** home-screen icon and possibly the service worker keep the old look on Coni's phone (Task 35 step 6).
8. **Scope size:** 36 tasks touching nearly every UI file; the alias layer keeps the app shippable after every task, so the work can pause between phases.

## Open questions for Federico

1. Slider: approve the non-drag alternative for WCAG 2.5.7 (tap thumb + in-line confirm) and its copy, or ship drag-only plus keyboard `End`?
2. Copy nuevo to confirm: «Descartar esta pieza» confirmation (placeholder «Se descarta esta pieza y no sale. ¿Seguro?» / «Sí, descartar»), the «Marcas que conozco» disclosure label, Métricas «Ver las demás», the date in «Ya se publicó».
3. Inicio avisos: merge those pointing at a listed piece as unread dots (C9)?
4. Ship dark mode now (wired and tested) or light only at launch (brandkit 13.5)?
5. Bar at 124 px for long motives and the recording balance (13.6): accept, or shorten copy?
6. Wordmark as live text in Geist (plan) or outlined SVG asset (brandkit §2)?
7. «Cuentas conectadas» as a new route `/ajustes/cuentas` (plan) is a structural change; OK?
8. Inventory inconsistencies 15.2 (lunes 8:00 vs domingo 20:00, two cap texts) stay out of scope unless decided.
