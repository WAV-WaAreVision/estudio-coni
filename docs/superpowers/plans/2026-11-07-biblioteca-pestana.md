# Biblioteca batch 7: the tab opens the Biblioteca Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bottom bar's «Biblioteca» tab opens Conidolly's own `/biblioteca` and stays current under it; `/ir-a-biblioteca` becomes a plain redirect; the bridge to Ingesta and everything that only served it goes away; Ideas with an empty bank offers «Subir material».

**Architecture:** No migration, no Trigger change, no Ingesta change. `RUTA_DE_LA_BIBLIOTECA` becomes `/biblioteca` and the tab a normal Next `<Link>` (the `sale` flag disappears, so the generic `estaActiva` marks it current on `/biblioteca` and every route under it). The route handler keeps its two session answers and redirects Coni with `irA`. `lib/sesion/puente.ts`, the page `app/(app)/biblioteca-no-abrio/`, the two-app E2E run (`playwright.biblioteca.config.ts`, `tests/e2e-biblioteca/`) and the `INGESTA_URL` plumbing are deleted with their tests.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript strict, Vitest 4 (jsdom unit, node for route handlers), Playwright (projects `app` phone 390 x 844, `escritorio` 1280 x 900), Biome (safe mode only).

**Spec:** `docs/superpowers/specs/2026-11-07-biblioteca-pestana-design.md` (issue WAV-WaAreVision/estudio-coni#17, pedido 29b, batch 7 of 7). Style reference: `docs/superpowers/plans/2026-11-06-biblioteca-semana.md`.

---

## Where to work

- Worktree `/Users/fede/Projects/estudio-coni/.worktrees/pestana-biblioteca`, branch `feat/biblioteca-pestana`. Every command runs from it.

  ```bash
  pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it
  ```

- Local Supabase of estudio-coni must be up (`pnpm db:start`). **Never `supabase db reset`.**

## Rules for every task

- **TDD strict:** failing test first, see it fail for the reason in the step, minimal code, green. One task is one commit.
- Commit messages in English ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by name (deletions with `git rm`). Before each commit `pnpm exec biome check --write <files>` (never `--unsafe`), then `head -1 components/nav-inferior.tsx app/(app)/ideas/banco-de-ideas.tsx` must print `"use client"`.
- No `any`, `@ts-expect-error`, non-null `!`, silent `catch`, hex colour, `text-[...]`. Copy in Spanish of Chile, tú, no em dash.
- Removed code takes its tests with it; a test that pinned the bridge is rewritten to pin the redirect.
- Run `pnpm test:run` before each commit.

## Facts fixed before planning

Checked on 2026-11-07 at `e49c2613`.

- **F1. The tab.** `components/nav-inferior.tsx` (client) has `PESTANAS` with `sale: true` on Biblioteca, rendered as a plain `<a>` (so nothing prefetches the minting handler); `estaActiva` returns `false` for `sale` and otherwise `ruta === href || ruta.startsWith(href + "/")`. Inicio stays current on `/ideas` and `/calendario`.
- **F2. The constant.** `lib/sesion/rutas.ts`: `RUTA_DE_LA_BIBLIOTECA = "/ir-a-biblioteca"`. Used only by the nav and `app/(app)/biblioteca-no-abrio/page.tsx`.
- **F3. The handler.** `app/ir-a-biblioteca/route.ts`: `leerSesion()`; `sin_sesion` -> `irA("/ingreso")`, `otra_persona` -> `irA("/")`, Coni -> `abrirPuente` with `clienteDeServicio().auth.admin` and `INGESTA_URL`, failure -> `irA("/biblioteca-no-abrio")`. `irA` (`lib/sesion/redireccion.ts`) answers 307 with a relative `Location`. `proxy.ts` sends a request without session to `/ingreso` before the handler runs; the handler keeps its own check anyway.
- **F4. Bridge tests.** `tests/unit/ir-a-biblioteca.test.ts` (7 cases, mocks `leerSesion` and `clienteDeServicio`), `tests/unit/puente.test.ts`, `tests/unit/biblioteca-no-abrio.test.tsx`, `tests/integration/puente-biblioteca.test.ts` (mints through the local Auth and checks no mail is sent), the two-app run `playwright.biblioteca.config.ts` + `tests/e2e-biblioteca/{biblioteca.spec.ts,frente-tls.ts}` (script `test:e2e:biblioteca`, needs an Ingesta checkout; not run by `pnpm test:e2e`). `tests/e2e/entorno.ts` exports `PUERTO_DE_INGESTA`, `URL_DIRECTA_DE_INGESTA`, `URL_DE_INGESTA`, `URL_SEGURA_DE_LA_APP` for that run only; `playwright.config.ts` passes `INGESTA_URL: URL_DE_INGESTA` to the app. `.env.example` documents `INGESTA_URL`. `CLAUDE.md` and `docs/TRASPASO.md` mention `test:e2e:biblioteca`.
- **F5. Unit nav test** `tests/unit/nav-inferior.test.tsx` pins href `/ir-a-biblioteca`, never current, and «plain link, not a Next link».
- **F6. E2E pins.** `tests/e2e/biblioteca.spec.ts:59-62` asserts the bar's tab href `/ir-a-biblioteca`; `tests/e2e/ideas.spec.ts:216-221` asserts the empty bank's «Abrir Conidolly Ingesta». On `/biblioteca` there are two navs: the bar (`navigation` «Secciones», use `exact: true`) and «Secciones de la Biblioteca».
- **F7. Ideas.** `app/(app)/ideas/banco-de-ideas.tsx` (client): `URL_DE_INGESTA` constant, empty bank text «El motor propone ideas cada domingo a las 20:00. Mientras, sube material en Conidolly Ingesta.» and a plain `<a href={process.env.NEXT_PUBLIC_URL_INGESTA || URL_DE_INGESTA}>Abrir Conidolly Ingesta</a>` with `clasesDeBoton({ variante: "secundario", tamano: "chico" })`. Unit `tests/unit/banco-de-ideas.test.tsx` «BancoDeIdeas: banco vacío» (2 cases) does not mock `next/link` (the real Link renders an `<a>` in jsdom).
- **F8. Baselines.** Phone `tests/e2e/visual.spec.ts-snapshots/biblioteca-*-app-darwin.png` are full-page with the bar; the desktop `tests/e2e/biblioteca*.escritorio.ts-snapshots/*` show the top bar. With the tab current, those move.

## Decisions taken while planning

- **D1. Order keeps every commit green.** Task 1 turns the handler into a redirect with a literal `"/biblioteca"` and deletes the bridge (the tab still points at `/ir-a-biblioteca`, which now redirects). Task 2 moves the constant and the tab, and the handler takes the constant.
- **D2. No `cache-control` on the redirect.** A 307 from a dynamic handler is not cached by Vercel; the old `no-store` protected a token that no longer exists.
- **D3. The two-app run goes** (Task 3): it only tested the bridge. Its `entorno` constants and `INGESTA_URL` in `playwright.config.ts` and `.env.example` go with it; `CLAUDE.md` drops «(+ :biblioteca, ver TRASPASO)»; TRASPASO's 29a section gets one line saying batch 7 retired it.
- **D4. The empty bank's link is a Next `<Link>`** to `/biblioteca/subir` with the same button classes.
- **D5. E2E.** One phone spec `tests/e2e/biblioteca-pestana.spec.ts` and one desktop spec `tests/e2e/biblioteca-pestana.escritorio.ts`; the existing pins (F6) are rewritten. The unit tests are the RED of each cycle; the E2E are added in the same commit and run green (each Playwright run builds the app, about 5 min).
- **D6. Baselines are not retaken** in this batch: the gate lists the ones that differ; Federico sees captures first.

## File structure

| File | Change |
|---|---|
| `app/ir-a-biblioteca/route.ts` | redirect only |
| `lib/sesion/rutas.ts` | `RUTA_DE_LA_BIBLIOTECA = "/biblioteca"` |
| `components/nav-inferior.tsx` | no `sale`; all tabs are `<Link>` |
| `app/(app)/ideas/banco-de-ideas.tsx` | empty bank copy and link |
| `lib/sesion/puente.ts`, `app/(app)/biblioteca-no-abrio/page.tsx` | deleted |
| `playwright.biblioteca.config.ts`, `tests/e2e-biblioteca/*` | deleted |
| `tests/e2e/entorno.ts`, `playwright.config.ts`, `.env.example`, `package.json`, `CLAUDE.md`, `docs/TRASPASO.md` | Ingesta plumbing out |
| `tests/unit/ir-a-biblioteca.test.ts`, `tests/unit/nav-inferior.test.tsx`, `tests/unit/banco-de-ideas.test.tsx` | rewritten cases |
| `tests/unit/puente.test.ts`, `tests/unit/biblioteca-no-abrio.test.tsx`, `tests/integration/puente-biblioteca.test.ts` | deleted |
| `tests/e2e/biblioteca-pestana.spec.ts`, `tests/e2e/biblioteca-pestana.escritorio.ts` | new |
| `tests/e2e/biblioteca.spec.ts`, `tests/e2e/ideas.spec.ts` | rewritten pins |

---

### Task 1: `/ir-a-biblioteca` redirects to `/biblioteca`; the bridge goes

**Files:** Modify `app/ir-a-biblioteca/route.ts`, `tests/unit/ir-a-biblioteca.test.ts`. Delete `lib/sesion/puente.ts`, `app/(app)/biblioteca-no-abrio/page.tsx`, `tests/unit/puente.test.ts`, `tests/unit/biblioteca-no-abrio.test.tsx`, `tests/integration/puente-biblioteca.test.ts`.

- [ ] **Step 1: Rewrite the unit test** `tests/unit/ir-a-biblioteca.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const leerSesion = vi.hoisted(() => vi.fn())
vi.mock("@/lib/sesion/coni", () => ({ leerSesion }))

afterEach(() => {
  leerSesion.mockReset()
})

// Old links, the iPhone home-screen icon and the history still open /ir-a-biblioteca (batch 7).
describe("/ir-a-biblioteca", () => {
  it("sends someone without a session to sign in", async () => {
    leerSesion.mockResolvedValue({ estado: "sin_sesion" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe("/ingreso")
  })

  it("sends anyone who is not Coni, the maintainer included, back to the app", async () => {
    leerSesion.mockResolvedValue({ estado: "otra_persona" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe("/")
  })

  it("sends Coni to her Biblioteca inside the app, with no page of its own", async () => {
    leerSesion.mockResolvedValue({ estado: "coni", db: {}, userId: "c0000000-0000-4000-8000-000000000001", correo: "coni@estudio.test" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe("/biblioteca")
    expect(await respuesta.text()).toBe("")
  })
})
```

- [ ] **Step 2: Run, see it fail.** `pnpm exec vitest run tests/unit/ir-a-biblioteca.test.ts`. Expected: the Coni case FAILS (status 200 or a failure redirect: the bridge still runs).

- [ ] **Step 3: Rewrite the handler** `app/ir-a-biblioteca/route.ts`:

```ts
import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

export const dynamic = "force-dynamic"

// The old Biblioteca tab (change 29a) kept for old links and the home-screen icon: the Biblioteca lives in the app now.
export async function GET() {
  const sesion = await leerSesion()
  if (sesion.estado === "sin_sesion") return irA(RUTA_DE_INGRESO)
  if (sesion.estado === "otra_persona") return irA("/")
  return irA("/biblioteca")
}
```

- [ ] **Step 4: Delete the bridge and its tests.**

```bash
git rm lib/sesion/puente.ts "app/(app)/biblioteca-no-abrio/page.tsx" tests/unit/puente.test.ts tests/unit/biblioteca-no-abrio.test.tsx tests/integration/puente-biblioteca.test.ts
grep -rn "puente\"\|lib/sesion/puente\|biblioteca-no-abrio" app components lib tests --include=*.ts --include=*.tsx
```

Expected: the grep prints only `tests/e2e-biblioteca/biblioteca.spec.ts` lines (removed in Task 3).

- [ ] **Step 5: Green.** `pnpm exec vitest run tests/unit/ir-a-biblioteca.test.ts && pnpm type && pnpm test:run`. Expected: PASS.

- [ ] **Step 6: Commit** `git add app/ir-a-biblioteca/route.ts tests/unit/ir-a-biblioteca.test.ts` then commit «Redirect /ir-a-biblioteca to the Biblioteca and remove the bridge to Ingesta».

### Task 2: the tab opens `/biblioteca` and stays current under it

**Files:** Modify `lib/sesion/rutas.ts`, `components/nav-inferior.tsx`, `app/ir-a-biblioteca/route.ts`, `tests/unit/nav-inferior.test.tsx`, `tests/e2e/biblioteca.spec.ts:59-62`. Create `tests/e2e/biblioteca-pestana.spec.ts`, `tests/e2e/biblioteca-pestana.escritorio.ts`.

- [ ] **Step 1: Rewrite the Biblioteca cases** of `tests/unit/nav-inferior.test.tsx`. Replace the two cases «leaves the app for the Biblioteca and never marks it current» and «keeps the Biblioteca a plain link...» with:

```tsx
  it("opens the Biblioteca inside the app, as a Next link like every other tab", () => {
    render(<NavInferior />)

    const biblioteca = screen.getByRole("link", { name: "Biblioteca" })
    expect(biblioteca).toHaveAttribute("href", "/biblioteca")
    expect(biblioteca).toHaveAttribute("data-next-link")
    expect(biblioteca).not.toHaveAttribute("aria-current")
    expect(biblioteca).toHaveClass("text-apagado", "min-h-nav")
  })

  it.each([
    "/biblioteca",
    "/biblioteca/materiales/abc",
    "/biblioteca/autores",
    "/biblioteca/autores/abc",
    "/biblioteca/temas",
    "/biblioteca/temas/abc",
    "/biblioteca/temas/borradores",
    "/biblioteca/semana",
    "/biblioteca/subir",
  ])("keeps the Biblioteca current on %s, and only it", (ruta) => {
    usePathname.mockReturnValue(ruta)
    render(<NavInferior />)

    expect(screen.getByRole("link", { name: "Biblioteca" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Biblioteca" })).toHaveClass("bg-piedra-honda", "shadow-hundido")
    for (const otra of ["Inicio", "Métricas", "Ajustes"]) {
      expect(screen.getByRole("link", { name: otra })).not.toHaveAttribute("aria-current")
    }
  })

  it.each(["/", "/ideas", "/ajustes/datos-personales", "/bibliotecas", "/ir-a-biblioteca"])(
    "does not mark the Biblioteca current on %s",
    (ruta) => {
      usePathname.mockReturnValue(ruta)
      render(<NavInferior />)

      expect(screen.getByRole("link", { name: "Biblioteca" })).not.toHaveAttribute("aria-current")
    },
  )
```

Update the `next/link` mock comment to «Marks every Next <Link>: every tab is one.».

- [ ] **Step 2: Run, see it fail.** `pnpm exec vitest run tests/unit/nav-inferior.test.tsx`. Expected: FAIL (href `/ir-a-biblioteca`, no `data-next-link`, never current).

- [ ] **Step 3: Implement.** `lib/sesion/rutas.ts`:

```ts
/** The Biblioteca tab (batch 7 of change 29b): the Biblioteca lives in the app. */
export const RUTA_DE_LA_BIBLIOTECA = "/biblioteca"
```

`components/nav-inferior.tsx`: drop the `sale` comment and field, `estaActiva` loses its `sale` line, and the map renders only the `<Link>`:

```tsx
const PESTANAS = [
  { href: "/", etiqueta: "Inicio", icono: House },
  { href: "/metricas", etiqueta: "Métricas", icono: ChartBar },
  { href: "/ajustes", etiqueta: "Ajustes", icono: GearSix },
  { href: RUTA_DE_LA_BIBLIOTECA, etiqueta: "Biblioteca", icono: Books },
] as const
...
function estaActiva(ruta: string, pestana: (typeof PESTANAS)[number]): boolean {
  if (pestana.href === "/") {
    return ruta === "/" || RUTAS_QUE_CUELGAN_DE_INICIO.some((raiz) => ruta === raiz || ruta.startsWith(`${raiz}/`))
  }
  return ruta === pestana.href || ruta.startsWith(`${pestana.href}/`)
}
...
        const Icono = pestana.icono
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "grid min-h-nav content-center justify-items-center gap-0.5 rounded-control py-2 text-meta transition-shadow duration-[var(--dur-corta)] ease-salida",
              activa ? "bg-piedra-honda font-semibold text-tinta shadow-hundido" : "font-medium text-apagado",
            )}
          >
            <Icono aria-hidden="true" size={ICONO.grande} />
            <span className="nav-etiqueta">{pestana.etiqueta}</span>
          </Link>
        )
```

`app/ir-a-biblioteca/route.ts`: import `RUTA_DE_LA_BIBLIOTECA` with `RUTA_DE_INGRESO` and `return irA(RUTA_DE_LA_BIBLIOTECA)`.

- [ ] **Step 4: Green.** `pnpm exec vitest run tests/unit/nav-inferior.test.tsx tests/unit/ir-a-biblioteca.test.ts && pnpm test:run`.

- [ ] **Step 5: E2E.** In `tests/e2e/biblioteca.spec.ts` replace the comment «The bar's tab still goes to Ingesta in this batch.» and its assertion with:

```ts
  // The bar's tab is the Biblioteca's own (batch 7).
  const pestana = page.getByRole("navigation", { name: "Secciones", exact: true }).getByRole("link", { name: "Biblioteca" })
  await expect(pestana).toHaveAttribute("href", "/biblioteca")
  await expect(pestana).toHaveAttribute("aria-current", "page")
```

Create `tests/e2e/biblioteca-pestana.spec.ts` (phone):

```ts
import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeBiblioteca, sembrarBiblioteca } from "./biblioteca-escena"

// Batch 7: the bar's «Biblioteca» opens the app's own Biblioteca and stays current inside it.
let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
})

const pestana = (page: Page) =>
  page.getByRole("navigation", { name: "Secciones", exact: true }).getByRole("link", { name: "Biblioteca" })

test("tapping «Biblioteca» lands on the Biblioteca with the tab current, and it stays current inside", async ({
  page,
}) => {
  await page.goto("/")
  await expect(pestana(page)).not.toHaveAttribute("aria-current")
  await tocarHastaLlegar(page, pestana(page), /\/biblioteca$/)
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(pestana(page)).toHaveAttribute("aria-current", "page")

  for (const ruta of ["/biblioteca/autores", "/biblioteca/temas", "/biblioteca/semana", `/biblioteca/materiales/${escena.listo}`]) {
    await page.goto(ruta)
    await expect(pestana(page)).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("navigation", { name: "Secciones", exact: true }).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current")
  }
})

test("an old /ir-a-biblioteca link lands on the Biblioteca", async ({ page }) => {
  await page.goto("/ir-a-biblioteca")
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(pestana(page)).toHaveAttribute("aria-current", "page")
})
```

Create `tests/e2e/biblioteca-pestana.escritorio.ts` (desktop, the bar is on top): the same first test with `test.describe` omitted, same imports, checking also that the bar sits above the heading:

```ts
test("on a computer the top bar's «Biblioteca» opens the Biblioteca and stays current inside", async ({ page }) => {
  await page.goto("/")
  await tocarHastaLlegar(page, pestana(page), /\/biblioteca$/)
  await expect(pestana(page)).toHaveAttribute("aria-current", "page")
  const barra = await page.getByRole("navigation", { name: "Secciones", exact: true }).boundingBox()
  const titulo = await page.getByRole("heading", { name: "Biblioteca", level: 1 }).boundingBox()
  expect(barra && titulo && barra.y < titulo.y).toBe(true)
  for (const ruta of ["/biblioteca/autores", "/biblioteca/temas", "/biblioteca/semana", `/biblioteca/materiales/${escena.listo}`]) {
    await page.goto(ruta)
    await expect(pestana(page)).toHaveAttribute("aria-current", "page")
  }
})
```

Run: `pnpm exec playwright test tests/e2e/biblioteca-pestana.spec.ts tests/e2e/biblioteca-pestana.escritorio.ts tests/e2e/biblioteca.spec.ts`. Expected: PASS.

- [ ] **Step 6: Commit** «Make the Biblioteca tab open the Biblioteca inside the app» with the six files.

### Task 3: retire the two-app bridge run and `INGESTA_URL`

**Files:** Delete `playwright.biblioteca.config.ts`, `tests/e2e-biblioteca/biblioteca.spec.ts`, `tests/e2e-biblioteca/frente-tls.ts`. Modify `tests/e2e/entorno.ts` (drop the Ingesta block, lines 45-59), `playwright.config.ts` (drop `URL_DE_INGESTA` import and the `INGESTA_URL` env with its comment), `.env.example` (drop the `INGESTA_URL` block), `package.json` (drop `test:e2e:biblioteca`), `CLAUDE.md` (`pnpm test:e2e         # playwright`), `docs/TRASPASO.md` (one bullet at the end of the 29a section: «Retirado en el lote 7 de la etapa 2 (#17): la pestaña abre `/biblioteca` de Conidolly, `/ir-a-biblioteca` solo redirige, el puente, `/biblioteca-no-abrio` y `pnpm test:e2e:biblioteca` ya no existen y `INGESTA_URL` ya no se lee (se puede borrar de Vercel después de publicar).»).

Removal only, no new behaviour: the check is that nothing still names them.

- [ ] **Step 1:** make the changes, then `grep -rnE "INGESTA_URL|URL_DE_INGESTA|URL_SEGURA_DE_LA_APP|PUERTO_DE_INGESTA|e2e-biblioteca|e2e:biblioteca" --exclude-dir=node_modules --exclude-dir=docs .` prints nothing (TRASPASO's history lines are allowed).
- [ ] **Step 2:** `pnpm lint && pnpm type && pnpm test:run`.
- [ ] **Step 3: Commit** «Remove the two-app bridge run and the INGESTA_URL setting».

### Task 4: Ideas with an empty bank offers «Subir material»

**Files:** Modify `app/(app)/ideas/banco-de-ideas.tsx`, `tests/unit/banco-de-ideas.test.tsx` («BancoDeIdeas: banco vacío»), `tests/e2e/ideas.spec.ts:216-221`.

- [ ] **Step 1: Rewrite the describe** in `tests/unit/banco-de-ideas.test.tsx`:

```tsx
describe("BancoDeIdeas: banco vacío", () => {
  it("tells her when the engine proposes and offers to upload material to her Biblioteca", () => {
    mostrar({}, [])

    expect(
      screen.getByText("El motor propone ideas cada domingo a las 20:00. Mientras, sube material a tu Biblioteca."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Subir material" })).toHaveAttribute("href", "/biblioteca/subir")
    expect(screen.queryByText(/Ingesta/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, see it fail.** `pnpm exec vitest run tests/unit/banco-de-ideas.test.tsx -t "banco vacío"`. Expected: FAIL (text still says Conidolly Ingesta).

- [ ] **Step 3: Implement.** Delete `const URL_DE_INGESTA = ...`; add `import Link from "next/link"`; the empty bank becomes:

```tsx
          <p className="text-cuerpo font-semibold">
            El motor propone ideas cada domingo a las 20:00. Mientras, sube material a tu Biblioteca.
          </p>
          <Link href="/biblioteca/subir" className={clasesDeBoton({ variante: "secundario", tamano: "chico" })}>
            Subir material
          </Link>
```

- [ ] **Step 4: Green.** `pnpm exec vitest run tests/unit/banco-de-ideas.test.tsx && pnpm test:run`.

- [ ] **Step 5: E2E.** In `tests/e2e/ideas.spec.ts` the empty bank test becomes «an empty bank says when the engine proposes and offers to upload material», asserting the new sentence and `getByRole("link", { name: "Subir material" })` with href `/biblioteca/subir`, then tapping it with `tocarHastaLlegar(page, enlace, /\/biblioteca\/subir$/)` (import it from `./ayudas`). Run `pnpm exec playwright test tests/e2e/ideas.spec.ts`.

- [ ] **Step 6: Commit** «Offer Subir material in the Biblioteca when the idea bank is empty».

### Task 5: gate and captures

- [ ] `pnpm lint && pnpm type && pnpm build && npx vitest run && pnpm test:db`.
- [ ] `pnpm exec playwright test --global-timeout=0`; new and changed specs also with `--repeat-each=3`. If a run is interrupted, run a short spec to completion so the teardown cleans the database.
- [ ] Do not update any PNG baseline: list the ones that differ (expected per F8: phone `biblioteca-*` and desktop Biblioteca snapshots). Move any PNG Playwright writes into the repo out so `git status` shows none.
- [ ] Captures for Federico (local test data): phone `/biblioteca` with the bar showing «Biblioteca» current, phone Semana, phone Ideas with an empty bank, desktop `/biblioteca` with the top bar.

## Self-review

- Spec 1 (tab, current on every Biblioteca route, constant): Task 2. Spec 2 (old route, three answers): Tasks 1-2. Spec 3 (bridge, failure page, service role, `INGESTA_URL`): Tasks 1 and 3. Spec 4 (empty bank): Task 4. Spec 5-6 (Datos personales, no migration/Trigger/Ingesta): nothing touched. Testing section: units in Tasks 1, 2, 4; E2E phone and desktop in Tasks 2 and 4; baselines in Task 5.
