# Biblioteca batch 5: Semana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni opens `/biblioteca/semana` and sees the latest run of the weekly engine (its week, state, ideas and cost), what it crossed with links to the topics, the crossings that did not work folded, and what to upload next; «Proponer ahora», with its estimated cost under it, asks the engine for this week.

**Architecture:** No migration, no Trigger change, no Ingesta PR. A pure domain module (`lib/dominio/biblioteca/semana.ts`) holds the shapes, Coni's words, the cost estimate and the "can she ask now" rule. A reader (`lib/datos/semana.ts`, ported from Ingesta's `lib/ingesta/semana.ts`) reads the latest `motor_corridas` row, its `motor` theories and the names it needs, with Coni's client. One action (`lib/acciones/semana.ts`) checks Coni again, applies the rule for this week (`domingoDeSemana`) and starts `motor-manual` through `disparosDeBibliotecaDeLaApp().motor(semana)` (key `motor:<semana>`), answering in her words; its server wrapper never redirects. The screen is a server page with one client button that redraws with `useRedibujar`; phone in one column, desktop with the Biblioteca's `md:grid-cols-[minmax(0,1fr)_20rem]` and a sticky side panel. «Semana» joins `NavDeBiblioteca` after Temas.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript strict, Supabase Postgres (RLS), `@supabase/supabase-js`, Zod 4, Vitest 4 (jsdom unit, node integration against the local Supabase), Playwright + `@axe-core/playwright`, Biome (safe mode only), Tailwind v4 semantic tokens, Phosphor icons through `ICONO`.

**Spec:** `docs/superpowers/specs/2026-11-06-biblioteca-semana-design.md` (issue WAV-WaAreVision/estudio-coni#17, pedido 29b, batch 5 of 7). Port source (read, never import across repos): Ingesta `~/Projects/conidolly-ingesta/app/(app)/semana/*` and `lib/ingesta/semana.ts` at `a66aab7`. Plans whose style and helpers this one reuses: `docs/superpowers/plans/2026-11-06-biblioteca-borrar-con-deshacer.md`, `docs/superpowers/plans/2026-11-04-biblioteca-autores-temas.md`.

---

## Where to work

- Conidolly worktree: `/Users/fede/Projects/estudio-coni/.worktrees/biblioteca-semana`, branch `feat/biblioteca-semana` (holds the spec and this plan). Below, **`CONIDOLLY`** is that path; every command runs from it.

  ```bash
  cd /Users/fede/Projects/estudio-coni/.worktrees/biblioteca-semana && pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it (.env* is ignored)
  ```

- Local Supabase of estudio-coni (`pnpm db:start` once): API `127.0.0.1:54421`, database `54422`. No migration in this batch: `pnpm db:types` must not change `lib/supabase/database.types.ts`.
- Ingesta (`/Users/fede/Projects/conidolly-ingesta`) is only read, never changed. Its Semana keeps working on the same data.
- Read `CONIDOLLY/CLAUDE.md` before the first task.

## Rules for every task

- **TDD strict:** write the failing test, run it and see it fail for the reason written in the step, write the minimum code, run it green. One task is one commit.
- Commit messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by name (never `git add -A`). Before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes only, **never `--unsafe`**), then `head -1` every client file the task touched: it must still be `"use client"`.
- No `any`, no `@ts-expect-error`, no non-null `!`, no silent `catch`. No hex colour outside `app/globals.css`. No `text-[...]` sizes; `text-error` only through `LineaDeError` or `LineaDeEstado`/`Bloque`/`PildoraDeEstado` (`tests/unit/diseno-reglas.test.ts` walks every file of `app/` and `components/`).
- The words «Puntaje» and «Evidencia» never appear in a string or JSX text under `app/(app)/biblioteca` (`tests/unit/biblioteca-palabras.test.ts` scans it, comments in quotes included): they live in `lib/dominio`.
- Copy for Coni in Spanish of Chile, tú, quotes as «», **no em dash anywhere** (code, copy, comments, this plan's outputs).
- Code identifiers in Spanish like the codebase; comments in English, sparse, only for "why".
- **Never `redirect()`** in the new action or its wrapper; the client redraws with `useRedibujar` (`components/use-redibujar.ts`).
- From Lote 2 on, run `pnpm test:run` (all unit tests) before each commit.

## Facts fixed before planning

Checked on 2026-11-06 at `757acc1d`.

- **F1. Sessions.** Pages: `exigirConi()` (`lib/sesion/coni.ts:24`) answers the session with `db`, redirects to sign in, or `notFound()` for anyone else; the Biblioteca layout calls it too. Actions: `conSesionDeConi(nombre, esquema, entrada, (db, datos) => ...)` (`lib/acciones/servidor.ts:29`) validates, checks the session and `es_coni`, and answers `ERROR_SESION_VENCIDA` / `ERROR_SOLO_CONI` / `ERROR_GENERICO`. Actions with no input pass `z.object({})` and `{}` (`app/(app)/calendario/acciones.ts:18`). Inside an action, `exigirConi(db)` (`lib/acciones/biblioteca.ts:77`) checks `es_coni` again and throws `Falla(ERROR_SOLO_CONI)`; `aResultado(nombre, trabajo)` (`lib/acciones/resultado.ts`) turns a `Falla` into her message and anything else into a logged `ERROR_GENERICO`. `Resultado<T>` is `({ ok: true } & T) | { ok: false; error: string }`.
- **F2. The engine's starter.** The spec says `disparosDeLaApp` / `motor(semana)`; in the code it is `disparosDeBibliotecaDeLaApp().motor(semana)` (`lib/acciones/servidor.ts:67`, `DisparosDeBiblioteca.motor` at `lib/acciones/disparos.ts:66`). Real mode triggers `motor-manual` with key `claveMotor(semana)` = `motor:<semana>` (`disparos.ts:75`, `disparos-entorno.ts:98-104`); test mode (`DISPARO_DE_PRUEBA=1`, the E2E) appends `{ tarea: "motor-manual", semana, clave }` to the runs file (`disparos-entorno.ts:113`). `tests/e2e/ayudas.ts:73` already parses that line (`DisparoDelMotor`) but exports no reader for it.
- **F3. The week.** `domingoDeSemana(fecha)` (`lib/motor/semana.ts:7`) gives the Sunday that closes the Monday to Sunday week in Santiago; it keys `motor_corridas.semana`. `semanaDe(ms, zona)` (`lib/dominio/fechas.ts:234`) writes «2 al 8 de noviembre» (Inicio's «Semana del ...»).
- **F4. The data.** `motor_corridas` (`supabase/migrations/20261003000400_motor.sql:51`): `semana date unique`, `estado` in `corriendo | lista | fallida`, `resumen jsonb`, `costo_usd numeric`, `motivo_fallo`, `creada_en`; Coni and WAV read it, only the service role writes. The engine writes `resumen` = `{ cruces, teorias, descartadas, lotesFallidos, ideas, archivadas, queSubir: { unSoloAutor: <topic names>, pilaresSinMaterial: <pillar slugs> } }` and adds `manual` only on a `lista` run (`lib/motor/semanal.ts:46-55, 343, 471`); the slugs come from `pilaresDeRedes(...).filter((p) => !p.esCapa)` (`semanal.ts:343-346`, `lib/motor/puntaje.ts:153`). It retakes a `corriendo` run when `creada_en < now - 30 min` (strictly) and any `fallida` one (`semanal.ts:69, 415-420`). `teorias`: `origen` `manual | motor`, `estado` in `sintetizando | borrador | guardada | fallida | descartada_por_motor`, `semana date`, `temas uuid[]` (no foreign key), `puntaje numeric`, `nivel_evidencia` in `alto | medio | debil`, `motivo_fallo` (the reason of a discarded crossing). `temas.nombre` is unique through `nombre_normalizado`; a merged topic keeps its row with `fusionado_en`, and `/biblioteca/temas/<id>` redirects it to the one that stayed (`app/(app)/biblioteca/temas/[id]/page.tsx:33-38`).
- **F5. The failure reasons are already in her words:** «No pude armar las ideas de esta semana. Avisamos al equipo; puedes volver a intentarlo.» (`semanal.ts:71`) and `TEXTO_LIMITE` «Llegaste a tu límite de este mes. Reactívalo en Ajustes.» (`lib/presupuesto/limite.ts:13`).
- **F6. Pillars.** `leerPilares(db)` (`lib/datos/pilares.ts:28`) reads the whole catalog; `pilaresDeRedes(catalogo)` (`lib/dominio/pilares.ts:105`) keeps the active ones with a network as `{ id, slug, nombreCorto, red, esCapa }`; `NOMBRE_DE_RED` (`:5`) names the network. In the seed: `psicologia-en-la-mesa` is «Psicología en la mesa» in LinkedIn, `inteligencia-emocional` «Inteligencia emocional» in Instagram, `capa-tdah` a layer, `ia-salud-mental` active without a network, `pareja` retired.
- **F7. Paging.** `leerTodas(descripcion, (despuesDe, limite) => consulta)` (`lib/datos/paginas.ts:16`) pages by keyset on `id`: the query must `.order("id")`, apply `.gt("id", despuesDe)` when not null and `.limit(limite)`. Ingesta's `leerTodas` has another signature (offset ranges): the port sorts by score in memory.
- **F8. Screens.** The list layout is `grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8` with an `aside` `md:sticky md:top-24 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto` (`app/(app)/biblioteca/page.tsx:61, 104-107`); each section's `h1` is «Biblioteca» followed by `NavDeBiblioteca` (`app/(app)/biblioteca/autores/page.tsx`). `NavDeBiblioteca` (`app/(app)/biblioteca/nav-de-biblioteca.tsx`) lists Materiales, Autores, Temas with Phosphor SSR icons; `tests/unit/biblioteca-piezas.test.tsx:9-27` pins three links. The Biblioteca's `loading.tsx`, `error.tsx`, `not-found.tsx` cover every child route (`tests/unit/biblioteca-pantallas-propias.test.tsx`). Materiales draws its list twice (`md:hidden` cards, `hidden md:block` table): the same trick serves Semana (D1).
- **F9. UI pieces.** `Boton` (`components/ui/boton.tsx`: `cargando`, `deshabilitado`, rest props reach the `<button>`), `LineaDeSaldo` (`components/ui/costo.tsx`: a meta line under an action, `data-snapshot="varia"`), `LineaDeError` (`role="alert"`), `LineaDeEstado` (`neutro` is an `<output>`; `error` with `anunciada` is a block that is not announced, `tituloEnTinta` keeps a message in ink), `PildoraDeEstado` (`components/ui/estado.tsx`: `tipo` `ok | aviso | error | neutro`, `icono`, draws check and warning circle itself), `MasOpciones` (`components/ui/mas-opciones.tsx`, a native `<details>`), `DetalleParaWav` (`components/ui/detalle-para-wav.tsx`, folded «Detalle para WAV»), `Panel`, `FORMA_DE_CHIP` / `TRANSICION_DE_CHIP` (`components/ui/clases-de-chip.ts`), `ICONO`. `useAccion()` gives `{ pendiente, error, ejecutar }` and sends an expired session to `/ingreso`; `useRedibujar()` returns `redibujar()` (replaces the address with a fresh `?v=`). `dolares(n)` (`lib/formato.ts`) writes «US$ 0,25».
- **F10. The budget screen** (`app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx:461`) says «Corren sin que los pidas. Apagados no gastan. «Proponer ahora» en Ingesta sigue funcionando.»; once Semana ships the button lives in the Biblioteca too, and Ingesta goes away in batch 7, so the line is updated (Task 14). `tests/unit/pantalla-de-presupuesto.test.tsx` does not pin it today.
- **F11. Test styles to mirror:** readers and actions against the local database with `clienteDeConi()` / `clienteDelMantenedor()` (`tests/integration/sesion-coni.ts`), `pool` (`tests/integration/db.ts`, postgres), `sembrarTema` / `borrarSembrado` (`tests/integration/siembra-biblioteca.ts`), `vaciarMotor()` (`tests/integration/siembra.ts:203`, deletes every `motor_corridas` row and the `motor` theories); integration files run one after another (`vitest.integration.config.ts`, `fileParallelism: false`). Server wrappers with `conSesionDeConi` mocked (`tests/unit/biblioteca-acciones-servidor.test.ts`). Client components with the actions module and `next/navigation` mocked (`tests/unit/biblioteca-botones.test.tsx`). Pages in node by walking their element tree (`tests/unit/biblioteca-pagina-autores.test.tsx`). E2E: `sembrarAutoresYTemas()` (`tests/e2e/biblioteca-escena.ts:248`, calls `vaciarBiblioteca` which calls `vaciarMotor`), `bloquearRedExterna`, `limpiarDisparos`, `alerta`, `abrirDesplegable`, `conLetraGrande`, `revisarConAxe`, `tocarHastaLlegar`, `entrarComo` (`tests/e2e/ayudas.ts`), `cajaDe`, `sobraDeAncho` (`tests/e2e/medidas-de-escritorio.ts`), `CORREO_DEL_MANTENEDOR` (`tests/e2e/entorno.ts`). Playwright: one worker; project `app` is the phone (390 x 844) and runs `*.spec.ts`; `escritorio` (1280 x 900) runs `*.escritorio.ts`; the phone visual spec masks `[data-snapshot="varia"]`.
- **F12. Scene names** (`tests/e2e/biblioteca-escena.ts`): `TEMA_PRINCIPAL` «Carga mental» (`escena.carga`), `OTRO_TEMA` «Pausas activas» (`escena.pausas`), `TEMA_DE_UN_AUTOR` «Descanso digital» (`escena.deUnAutor`).
- **F13. Commands:** unit `pnpm exec vitest run <file>`, all unit `pnpm test:run`, integration `pnpm test:db <file>`, E2E phone `pnpm exec playwright test <file>`, desktop `pnpm exec playwright test --project escritorio <file>`, gate `pnpm lint`, `pnpm type`, `pnpm build`, `pnpm test:run`, `pnpm test:db`, `pnpm test:e2e`.

## Decisions taken while planning (spec ambiguities resolved)

- **D1. Phone order and the sticky panel together.** The spec wants, on the phone, run and «Proponer ahora» first, then theories, crossings, what to upload; on a computer, theories left and a sticky right panel with run, button and what to upload. The DOM follows the phone order (title, panel, what was crossed, what to upload); grid placement puts the panel in the right column across both rows on `md:`. «Qué subir después» is drawn twice, once inside the panel (`hidden md:block`) and once at the end (`md:hidden`), as Materiales draws its cards and its table: only one is ever displayed, so only one is in the accessibility tree.
- **D2. What the left column says when there are no theories.** A `lista` run: the one line «Esta semana el motor no encontró cruces nuevos.» and no heading (spec 7, "no empty sections"). A `corriendo` run: «El motor todavía está trabajando en esta semana.» (not in the spec: the «no encontró» line would be false while it works). A `fallida` run: its reason (F5, already her words) as a quiet error block (`anunciada`, so a page load does not interrupt her), falling back to «El motor no terminó esta semana.» if a reason is ever missing. No run yet: «Todavía no corre el motor. La primera tanda llega el domingo a las 20:00.» Folded crossings still show when there are any.
- **D3. The run panel.** Heading «Semana del 2 al 8 de noviembre» (`semanaDe`; Ingesta wrote only the Sunday), the state pill, «A pedido» when `manual`, and only for a `lista` run «3 ideas nuevas · Costó US$ 0,21». No panel before the first run (the button stays).
- **D4. «Proponer ahora» rule at the boundary.** A `corriendo` run can be asked again only when it was created **more than** 30 minutes ago, the engine's own strict test (`creada_en < now - 30 min`); exactly 30 minutes still answers «ya propuso».
- **D5. The cost line** is `LineaDeSaldo` («Cuesta cerca de US$ 0,25», `data-snapshot="varia"`), and the button is described by it (`aria-describedby`). The reader asks for the latest 4 runs with `costo_usd > 0`, newest first; `estimarCostoDelMotor` filters `> 0` and takes 4 again so the rule lives in one tested place.
- **D6. What to upload.** Single-author topics: the engine stores names; the reader matches them to `temas.nombre` exactly. A match links to `/biblioteca/temas/<id>` (a merged topic too: its page redirects, F4); no match stays as plain text. Pillars: only `pilaresDeRedes` pillars that are not layers are named («Psicología en la mesa · LinkedIn», short name and network); a retired pillar, a layer or one without a network is dropped. «Por ahora no falta nada...» shows when both lists are empty after that.
- **D7. Theory topics.** An id with no `temas` row drops out of the links; a merged topic keeps its link (F4).
- **D8. Score and ids for WAV.** Each theory folds «Detalle para WAV» with «Puntaje: 0,82» (when there is a score) and «Teoría: <id>», built by `lineasDeTeoriaParaWav` in `lib/dominio` (the 4h word test). Crossings show their topics and reason only, as Ingesta did.
- **D9. Unknown values throw.** An unknown run state or evidence level is a schema change under us (both have check constraints): the domain throws, like `pilarVisible` does for an unknown slug.
- **D10. The action** takes `z.object({})` and `{}` (F1), reads this week's row with Coni's client, and revalidates only `/biblioteca/semana`. The success note stays in the button's state while `useRedibujar` redraws; the run row appears only when the task inserts it, so the redraw may show the same screen and the note is what tells her it is on its way. No automatic refresh while a run works (not in the spec).
- **D11. Icons.** Nav tab «Semana» `CalendarCheck`; «Trabajando» `HourglassMedium` (the Biblioteca's processing icon); «A pedido» `HandTap`; «Lista» and «Falló» take the pill's own check and warning circle.
- **D12. Budget copy (F10).** «Corren sin que los pidas. Apagados no gastan. «Proponer ahora» sigue funcionando en la Biblioteca, en Semana.»
- **D13. Baselines.** The fourth tab changes the nav on every Biblioteca screen, so every Biblioteca baseline (phone `tests/e2e/visual.spec.ts-snapshots/biblioteca-*-app-darwin.png` and the desktop `tests/e2e/biblioteca*.escritorio.ts-snapshots/*`) moves, and Semana adds two new ones. None is written to the repo until Federico sees the captures (Task 17 Step 3).

## File structure

New (paths from `CONIDOLLY`):

| File | Responsibility |
|---|---|
| `lib/dominio/biblioteca/semana.ts` | `RUTA_DE_SEMANA`, the shapes, Coni's words, `estimarCostoDelMotor`, `puedePedirMotor`, labels, `temasParaSubir`, `pilaresParaSubir` |
| `lib/datos/semana.ts` | `leerSemana(db)`, `leerCostosDelMotor(db)` |
| `lib/acciones/semana.ts` | `DepsSemana`, `proponerAhora(deps)` |
| `app/(app)/biblioteca/semana/acciones.ts` | `proponerAhoraAccion()` server wrapper |
| `app/(app)/biblioteca/semana/boton-proponer-ahora.tsx` | the button, its cost line, the note and the error (client) |
| `app/(app)/biblioteca/semana/vista-de-semana.tsx` | `CorridaDeLaSemana`, `QueSubir`, `LoQueCruzo`, `VistaDeSemana` |
| `app/(app)/biblioteca/semana/page.tsx` | the page |
| `app/(app)/biblioteca/semana/loading.tsx` | Semana's skeleton |
| `tests/unit/biblioteca-semana.test.ts` | domain |
| `tests/integration/datos-semana.test.ts`, `tests/integration/acciones-semana.test.ts` | reader, action |
| `tests/unit/biblioteca-semana-acciones.test.ts` | server wrapper |
| `tests/unit/biblioteca-boton-proponer-ahora.test.tsx`, `tests/unit/biblioteca-semana-vista.test.tsx`, `tests/unit/biblioteca-pagina-semana.test.tsx` | screens |
| `tests/e2e/biblioteca-semana.spec.ts`, `tests/e2e/biblioteca-semana.escritorio.ts` | phone and desktop E2E |

Modified: `app/(app)/biblioteca/nav-de-biblioteca.tsx`, `tests/unit/biblioteca-piezas.test.tsx`, `tests/unit/biblioteca-pantallas-propias.test.tsx`, `app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx`, `tests/unit/pantalla-de-presupuesto.test.tsx`, `tests/e2e/biblioteca-escena.ts` (`sembrarSemana`), `tests/e2e/ayudas.ts` (`disparosDelMotor`), `tests/e2e/visual.spec.ts`.

Not touched: migrations, `lib/supabase/database.types.ts`, `trigger/*`, `lib/motor/*`, `components/nav-inferior.tsx`, `app/ir-a-biblioteca/`, the Biblioteca's `error.tsx` / `not-found.tsx`, Ingesta.

## Lotes

| Lote | Tasks | Theme | Reviewer checkpoint |
|---|---|---|---|
| 1 | 1 to 7 | domain, reader, action, server wrapper | after Task 7 |
| 2 | 8 to 14 | nav, button, view, page, budget copy | after Task 14 |
| 3 | 15 to 16 | E2E phone and desktop, axe, large text, captures | after Task 16 |
| 4 | 17 to 18 | full gate and shipping | Federico |

At each checkpoint: run the lote's tests plus `pnpm test:run` and `pnpm type`, then dispatch `superpowers:code-reviewer` on the lote's commits (`git log --oneline <first>^..HEAD`) with the spec and this plan; fix findings with a failing test first, one commit per fix, before the next lote.

---

# Lote 1: domain, reader, action

### Task 1: the cost estimate (4a)

**Files:**
- Create: `lib/dominio/biblioteca/semana.ts`
- Create: `tests/unit/biblioteca-semana.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/biblioteca-semana.test.ts
import { describe, expect, it } from "vitest"
import {
  COSTO_SIN_HISTORIA_USD,
  estimarCostoDelMotor,
  RUTA_DE_SEMANA,
  textoDeCosto,
} from "@/lib/dominio/biblioteca/semana"

describe("the cost under «Proponer ahora» (4a)", () => {
  it("is the median of the latest four runs that cost something, to the cent", () => {
    expect(estimarCostoDelMotor([0.2, 0.4, 0.25, 0.3])).toBe(0.28)
    expect(estimarCostoDelMotor([0.21, 0.2, 0.25, 0.3])).toBe(0.23)
  })

  it("looks only at the latest four, newest first", () => {
    expect(estimarCostoDelMotor([0.1, 0.2, 0.3, 0.4, 9])).toBe(0.25)
  })

  it("takes the middle one of fewer than four, or the only one", () => {
    expect(estimarCostoDelMotor([0.31, 0.19, 0.22])).toBe(0.22)
    expect(estimarCostoDelMotor([0.4])).toBe(0.4)
  })

  it("ignores runs that cost nothing", () => {
    expect(estimarCostoDelMotor([0, 0.2, 0])).toBe(0.2)
  })

  it("says a fixed US$ 0,30 before any run cost something", () => {
    expect(COSTO_SIN_HISTORIA_USD).toBe(0.3)
    expect(estimarCostoDelMotor([])).toBe(0.3)
    expect(estimarCostoDelMotor([0, 0])).toBe(0.3)
  })

  it("is said in her words, under the button", () => {
    expect(textoDeCosto(0.25)).toBe("Cuesta cerca de US$ 0,25")
    expect(RUTA_DE_SEMANA).toBe("/biblioteca/semana")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/dominio/biblioteca/semana"`.

- [ ] **Step 3: Write the module**

```ts
// lib/dominio/biblioteca/semana.ts
import { dolares } from "@/lib/formato"

// Semana, the latest run of the weekly engine (spec 2026-11-06, batch 5). Ported from Ingesta's lib/ingesta/semana.ts.

export const RUTA_DE_SEMANA = "/biblioteca/semana"

/** What «Proponer ahora» is said to cost before any run cost something (spec decision 5). */
export const COSTO_SIN_HISTORIA_USD = 0.3
const CORRIDAS_PARA_ESTIMAR = 4

/** The median of the latest runs that cost something, to the cent (4a). `costos` comes newest first. */
export function estimarCostoDelMotor(costos: readonly number[]): number {
  const conCosto = costos
    .filter((costo) => costo > 0)
    .slice(0, CORRIDAS_PARA_ESTIMAR)
    .toSorted((a, b) => a - b)
  if (conCosto.length === 0) return COSTO_SIN_HISTORIA_USD
  const mitad = Math.floor(conCosto.length / 2)
  const mediana =
    conCosto.length % 2 === 1 ? (conCosto[mitad] ?? 0) : ((conCosto[mitad - 1] ?? 0) + (conCosto[mitad] ?? 0)) / 2
  return Math.round(mediana * 100) / 100
}

export function textoDeCosto(usd: number): string {
  return `Cuesta cerca de ${dolares(usd)}`
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/semana.ts tests/unit/biblioteca-semana.test.ts
git add lib/dominio/biblioteca/semana.ts tests/unit/biblioteca-semana.test.ts
git commit -m "Estimate what Proponer ahora costs from the engine's latest runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: can she ask the engine now

**Files:**
- Modify: `lib/dominio/biblioteca/semana.ts`
- Modify: `tests/unit/biblioteca-semana.test.ts`

- [ ] **Step 1: Write the failing test** (append; add `MOTOR_PEDIDO`, `NO_ARRANCO`, `puedePedirMotor`, `YA_PROPUSO` to the import)

```ts
describe("puedePedirMotor (spec decision 4)", () => {
  const AHORA = new Date("2026-11-04T15:00:00Z")
  const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000).toISOString()

  it("lets her ask when this week has no run yet", () => {
    expect(puedePedirMotor(null, AHORA)).toBe(true)
  })

  it("refuses a week that is ready", () => {
    expect(puedePedirMotor({ estado: "lista", creadaEn: hace(600) }, AHORA)).toBe(false)
  })

  it("refuses a run still alive, up to the engine's own 30 minutes, and allows one older than that", () => {
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(29) }, AHORA)).toBe(false)
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(30) }, AHORA)).toBe(false)
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(31) }, AHORA)).toBe(true)
  })

  it("lets her ask again after a failed run", () => {
    expect(puedePedirMotor({ estado: "fallida", creadaEn: hace(5) }, AHORA)).toBe(true)
  })

  it("answers in her words", () => {
    expect(YA_PROPUSO).toBe("El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes.")
    expect(NO_ARRANCO).toBe("No pude pedirle ideas al motor. Inténtalo de nuevo en unos minutos.")
    expect(MOTOR_PEDIDO).toBe("El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos.")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana.test.ts`
Expected: FAIL: `puedePedirMotor` is not exported (`TypeError: ... is not a function`).

- [ ] **Step 3: Append to `lib/dominio/biblioteca/semana.ts`**

```ts
export const YA_PROPUSO = "El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes."
export const NO_ARRANCO = "No pude pedirle ideas al motor. Inténtalo de nuevo en unos minutos."
export const MOTOR_PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."

/** The engine retakes a run stuck in `corriendo` once it is older than this (`MINUTOS_PARA_RETOMAR`, lib/motor/semanal.ts). */
const MINUTOS_DE_UNA_CORRIDA_VIVA = 30
const MS_POR_MINUTO = 60_000

export interface CorridaDeEstaSemana {
  estado: string
  creadaEn: string
}

/**
 * «Proponer ahora» (as Ingesta): never over a ready week or a run still alive; a failed week, or a run older than the
 * engine's retake window, can be asked again, because the engine retakes it. The boundary is the engine's: strictly older.
 */
export function puedePedirMotor(corrida: CorridaDeEstaSemana | null, ahora: Date): boolean {
  if (corrida === null) return true
  if (corrida.estado === "lista") return false
  if (corrida.estado === "corriendo") {
    return (ahora.getTime() - Date.parse(corrida.creadaEn)) / MS_POR_MINUTO > MINUTOS_DE_UNA_CORRIDA_VIVA
  }
  return true
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/semana.ts tests/unit/biblioteca-semana.test.ts
git add lib/dominio/biblioteca/semana.ts tests/unit/biblioteca-semana.test.ts
git commit -m "Decide when Coni can ask the engine for this week again

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: the shapes and Coni's words of Semana (4h, 4j, 4l)

**Files:**
- Modify: `lib/dominio/biblioteca/semana.ts`
- Modify: `tests/unit/biblioteca-semana.test.ts`

- [ ] **Step 1: Write the failing test** (append; add to the import `A_PEDIDO`, `crucesQueNoSirvieron`, `etiquetaDePilarParaSubir`, `lineasDeTeoriaParaWav`, `MOTOR_NO_TERMINO`, `NADA_QUE_SUBIR`, `nadaQueSubir`, `pilaresParaSubir`, `presentarCorrida`, `respaldoDeTeoria`, `resumenDeCorrida`, `SIN_CORRIDA`, `SIN_CORRIDAS`, `SIN_CRUCES`, `temasParaSubir`, `TITULO_DE_LO_CRUZADO`, `tituloDeSemana`, `TRABAJANDO`)

```ts
describe("the words of Semana", () => {
  it("names the run's state with a word and, where the pill has none, an icon (4j)", () => {
    expect(presentarCorrida("lista")).toEqual({ palabra: "Lista", tipo: "ok", icono: null })
    expect(presentarCorrida("corriendo")).toEqual({ palabra: "Trabajando", tipo: "neutro", icono: "reloj" })
    expect(presentarCorrida("fallida")).toEqual({ palabra: "Falló", tipo: "error", icono: null })
    expect(A_PEDIDO).toBe("A pedido")
  })

  it("throws on a state the database does not allow", () => {
    expect(() => presentarCorrida("x")).toThrow("Estado de corrida desconocido: x")
  })

  it("says the evidence level as backing, in her words (4h)", () => {
    expect(respaldoDeTeoria("alto")).toBe("Respaldo: fuerte")
    expect(respaldoDeTeoria("medio")).toBe("Respaldo: medio")
    expect(respaldoDeTeoria("debil")).toBe("Respaldo: débil")
    expect(respaldoDeTeoria(null)).toBeNull()
    expect(() => respaldoDeTeoria("x")).toThrow("Nivel de evidencia desconocido: x")
  })

  it("folds the score and the id for WAV, the score only when there is one", () => {
    expect(lineasDeTeoriaParaWav({ id: "t-1", puntaje: 0.8234 })).toEqual(["Puntaje: 0,82", "Teoría: t-1"])
    expect(lineasDeTeoriaParaWav({ id: "t-2", puntaje: null })).toEqual(["Teoría: t-2"])
  })

  it("names the week from Monday to Sunday, across a month too", () => {
    expect(tituloDeSemana("2026-11-08")).toBe("Semana del 2 al 8 de noviembre")
    expect(tituloDeSemana("2026-11-01")).toBe("Semana del 26 de octubre al 1 de noviembre")
  })

  it("sums up a ready run as ideas and what it cost", () => {
    expect(resumenDeCorrida({ ideas: 3, costoUsd: 0.21 })).toBe("3 ideas nuevas · Costó US$ 0,21")
    expect(resumenDeCorrida({ ideas: 1, costoUsd: 0 })).toBe("1 idea nueva · Costó US$ 0,00")
  })

  it("has her lines for every empty and failed case (4l)", () => {
    expect(TITULO_DE_LO_CRUZADO).toBe("Lo que el motor cruzó esta semana")
    expect(crucesQueNoSirvieron(2)).toBe("Cruces que no sirvieron (2)")
    expect(SIN_CRUCES).toBe("Esta semana el motor no encontró cruces nuevos.")
    expect(SIN_CORRIDAS).toBe("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00.")
    expect(TRABAJANDO).toBe("El motor todavía está trabajando en esta semana.")
    expect(MOTOR_NO_TERMINO).toBe("El motor no terminó esta semana.")
    expect(NADA_QUE_SUBIR).toBe("Por ahora no falta nada: cada tema tiene varios autores y cada pilar tiene material.")
    expect(SIN_CORRIDA).toEqual({ corrida: null, teorias: [], descartadas: [], queSubir: null })
  })
})

describe("what to upload next (spec decision 8)", () => {
  it("links a single-author topic it can match, and keeps one it cannot as plain text", () => {
    const ids = new Map([["Descanso digital", "tema-1"]])
    expect(temasParaSubir(["Descanso digital", "Sueño y pantallas"], ids)).toEqual([
      { nombre: "Descanso digital", id: "tema-1" },
      { nombre: "Sueño y pantallas", id: null },
    ])
  })

  it("names each pillar with its network, in the engine's order, and drops layers and unknown slugs", () => {
    const pilares = [
      { id: "p-1", slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", red: "linkedin" as const, esCapa: false },
      { id: "p-2", slug: "capa-tdah", nombreCorto: "Capa TDAH", red: "instagram" as const, esCapa: true },
      { id: "p-3", slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram" as const, esCapa: false },
    ]
    const leidos = pilaresParaSubir(["mi-nueva-partida", "pareja", "capa-tdah", "bienestar-e-impacto"], pilares)
    expect(leidos).toEqual([
      { slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram" },
      { slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", red: "linkedin" },
    ])
    expect(leidos.map(etiquetaDePilarParaSubir)).toEqual(["Mi nueva partida · Instagram", "Bienestar e impacto · LinkedIn"])
  })

  it("has nothing to ask for only when both lists are empty", () => {
    expect(nadaQueSubir({ unSoloAutor: [], pilaresSinMaterial: [] })).toBe(true)
    expect(nadaQueSubir({ unSoloAutor: [{ nombre: "x", id: null }], pilaresSinMaterial: [] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana.test.ts`
Expected: FAIL: `presentarCorrida` is not exported.

- [ ] **Step 3: Write the code.** In `lib/dominio/biblioteca/semana.ts`, add to the imports

```ts
import { semanaDe } from "@/lib/dominio/fechas"
import { NOMBRE_DE_RED, type PilarDeRed, type Red } from "@/lib/dominio/pilares"
```

and append:

```ts
const ZONA = "America/Santiago"

/** A topic a theory or a crossing names, when it still exists. */
export interface TemaDeTeoria {
  id: string
  nombre: string
}

export interface CorridaLeida {
  /** The Sunday that closes the week, `2026-11-08`. */
  semana: string
  estado: string
  costoUsd: number
  ideas: number
  manual: boolean
  motivoFallo: string | null
  creadaEn: string
}

export interface TeoriaEscrita {
  id: string
  titulo: string
  tesis: string
  puntaje: number | null
  nivelEvidencia: string | null
  temas: TemaDeTeoria[]
}

export interface CruceDescartado {
  id: string
  razon: string
  temas: TemaDeTeoria[]
}

/** A single-author topic as the engine named it; `id` when a topic of that name still exists. */
export interface TemaParaSubir {
  nombre: string
  id: string | null
}

export interface PilarParaSubir {
  slug: string
  nombreCorto: string
  red: Red
}

export interface QueSubirLeido {
  unSoloAutor: TemaParaSubir[]
  pilaresSinMaterial: PilarParaSubir[]
}

export interface SemanaLeida {
  corrida: CorridaLeida | null
  teorias: TeoriaEscrita[]
  descartadas: CruceDescartado[]
  queSubir: QueSubirLeido | null
}

export const SIN_CORRIDA: SemanaLeida = { corrida: null, teorias: [], descartadas: [], queSubir: null }

export const TITULO_DE_LO_CRUZADO = "Lo que el motor cruzó esta semana"
export const SIN_CRUCES = "Esta semana el motor no encontró cruces nuevos."
export const SIN_CORRIDAS = "Todavía no corre el motor. La primera tanda llega el domingo a las 20:00."
export const TRABAJANDO = "El motor todavía está trabajando en esta semana."
export const MOTOR_NO_TERMINO = "El motor no terminó esta semana."
export const NADA_QUE_SUBIR =
  "Por ahora no falta nada: cada tema tiene varios autores y cada pilar tiene material."
export const A_PEDIDO = "A pedido"

export function crucesQueNoSirvieron(cantidad: number): string {
  return `Cruces que no sirvieron (${cantidad})`
}

export interface CorridaVisible {
  palabra: string
  tipo: "ok" | "neutro" | "error"
  /** The pill draws check and warning circle itself; this one it is given. */
  icono: "reloj" | null
}

const CORRIDAS: Record<string, CorridaVisible> = {
  lista: { palabra: "Lista", tipo: "ok", icono: null },
  corriendo: { palabra: "Trabajando", tipo: "neutro", icono: "reloj" },
  fallida: { palabra: "Falló", tipo: "error", icono: null },
}

/** Icon and word, never colour only (4j). The column's check allows only these three. */
export function presentarCorrida(estado: string): CorridaVisible {
  const visible = CORRIDAS[estado]
  if (!visible) throw new Error(`Estado de corrida desconocido: ${estado}`)
  return visible
}

const RESPALDOS: Record<string, string> = { alto: "fuerte", medio: "medio", debil: "débil" }

/** The theory's evidence level in her words (4h); null when the engine gave none. */
export function respaldoDeTeoria(nivel: string | null): string | null {
  if (nivel === null) return null
  const respaldo = RESPALDOS[nivel]
  if (!respaldo) throw new Error(`Nivel de evidencia desconocido: ${nivel}`)
  return `Respaldo: ${respaldo}`
}

const dosDecimales = (valor: number) =>
  valor.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** What only WAV needs about a theory, folded under it (4h, as `lineasDeIdeaParaWav`). Each line is unique: it is a key. */
export function lineasDeTeoriaParaWav(teoria: { id: string; puntaje: number | null }): string[] {
  return [...(teoria.puntaje === null ? [] : [`Puntaje: ${dosDecimales(teoria.puntaje)}`]), `Teoría: ${teoria.id}`]
}

/** `semana` is the closing Sunday as a plain date: read at noon UTC so no timezone moves it a day. */
export function tituloDeSemana(semana: string): string {
  return `Semana del ${semanaDe(Date.parse(`${semana}T12:00:00Z`), ZONA)}`
}

export function resumenDeCorrida(corrida: { ideas: number; costoUsd: number }): string {
  const ideas = corrida.ideas === 1 ? "1 idea nueva" : `${corrida.ideas} ideas nuevas`
  return `${ideas} · Costó ${dolares(corrida.costoUsd)}`
}

/** The engine stores topic names: each keeps its place, with a link only when a topic of that name still exists. */
export function temasParaSubir(nombres: readonly string[], ids: ReadonlyMap<string, string>): TemaParaSubir[] {
  return nombres.map((nombre) => ({ nombre, id: ids.get(nombre) ?? null }))
}

/**
 * The engine stores pillar slugs. Only an active pillar of a network is worth asking material for: a retired one, a
 * layer or one without a network drops out (spec decision 8).
 */
export function pilaresParaSubir(slugs: readonly string[], pilares: readonly PilarDeRed[]): PilarParaSubir[] {
  return slugs.flatMap((slug) => {
    const pilar = pilares.find((candidato) => candidato.slug === slug && !candidato.esCapa)
    return pilar ? [{ slug, nombreCorto: pilar.nombreCorto, red: pilar.red }] : []
  })
}

export function etiquetaDePilarParaSubir(pilar: PilarParaSubir): string {
  return `${pilar.nombreCorto} · ${NOMBRE_DE_RED[pilar.red]}`
}

export function nadaQueSubir(queSubir: QueSubirLeido): boolean {
  return queSubir.unSoloAutor.length === 0 && queSubir.pilaresSinMaterial.length === 0
}
```

- [ ] **Step 4: Run it and the word rules**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana.test.ts tests/unit/biblioteca-palabras.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/semana.ts tests/unit/biblioteca-semana.test.ts
git add lib/dominio/biblioteca/semana.ts tests/unit/biblioteca-semana.test.ts
git commit -m "Add the shapes and Coni's words of Semana

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: `leerCostosDelMotor`

**Files:**
- Create: `lib/datos/semana.ts`
- Create: `tests/integration/datos-semana.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/datos-semana.test.ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerCostosDelMotor } from "@/lib/datos/semana"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { vaciarMotor } from "./siembra"
import { borrarSembrado } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)

let coni: SupabaseClient<Database>
const temas: string[] = []

interface CamposDeCorrida {
  estado?: "corriendo" | "lista" | "fallida"
  costo?: number
  resumen?: unknown
  motivo?: string | null
}

/** As postgres: only the service role writes runs from the app. */
async function corrida(semana: string, campos: CamposDeCorrida = {}): Promise<void> {
  await pool.query(
    "insert into public.motor_corridas (semana, estado, costo_usd, resumen, motivo_fallo) values ($1, $2, $3, $4::jsonb, $5)",
    [semana, campos.estado ?? "lista", campos.costo ?? 0, JSON.stringify(campos.resumen ?? {}), campos.motivo ?? null],
  )
}

/** The engine's runs and theories, and the manual theories this file wrote (vaciarMotor leaves those). */
async function limpiar(): Promise<void> {
  await vaciarMotor()
  await pool.query("delete from public.teorias where titulo like $1", [`%${SUFIJO}`])
}

beforeAll(async () => {
  coni = await clienteDeConi()
})

beforeEach(limpiar)

afterAll(async () => {
  await limpiar()
  await borrarSembrado([], temas, [])
  await pool.end()
})

describe("leerCostosDelMotor", () => {
  it("reads the cost of the latest four runs that cost something, newest first", async () => {
    await corrida("2026-10-04", { costo: 0.4 })
    await corrida("2026-10-11", { costo: 0.3 })
    await corrida("2026-10-18", { costo: 0, estado: "fallida", motivo: "x" })
    await corrida("2026-10-25", { costo: 0.25 })
    await corrida("2026-11-01", { costo: 0.2 })
    await corrida("2026-11-08", { costo: 0.21 })
    expect(await leerCostosDelMotor(coni)).toEqual([0.21, 0.2, 0.25, 0.3])
  })

  it("reads nothing before any run", async () => {
    expect(await leerCostosDelMotor(coni)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/datos-semana.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/datos/semana"`.

- [ ] **Step 3: Write the reader**

```ts
// lib/datos/semana.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** The runs `estimarCostoDelMotor` looks at: the latest that cost something, newest first (4a). */
const CORRIDAS_CON_COSTO = 4

export async function leerCostosDelMotor(db: Db): Promise<number[]> {
  const { data, error } = await db
    .from("motor_corridas")
    .select("costo_usd")
    .gt("costo_usd", 0)
    .order("semana", { ascending: false })
    .limit(CORRIDAS_CON_COSTO)
  if (error) throw new Error(`No pude leer lo que costó el motor: ${error.message}`, { cause: error })
  return data.map((fila) => Number(fila.costo_usd))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:db tests/integration/datos-semana.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/datos/semana.ts tests/integration/datos-semana.test.ts
git add lib/datos/semana.ts tests/integration/datos-semana.test.ts
git commit -m "Read what the engine's latest runs cost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: `leerSemana`, ported from Ingesta

**Files:**
- Modify: `lib/datos/semana.ts`
- Modify: `tests/integration/datos-semana.test.ts`

- [ ] **Step 1: Write the failing test.** Add `leerSemana` to the `@/lib/datos/semana` import, `SIN_CORRIDA` from `@/lib/dominio/biblioteca/semana`, `sembrarTema` to the `./siembra-biblioteca` import; add the topics to `beforeAll` and the theory helper after `corrida`; append the `describe`.

```ts
// beforeAll becomes:
beforeAll(async () => {
  coni = await clienteDeConi()
  carga = await sembrarTema(`Carga ${SUFIJO}`)
  pausas = await sembrarTema(`Pausas ${SUFIJO}`)
  solo = await sembrarTema(`Solo ${SUFIJO}`)
  temas.push(carga, pausas, solo)
})
```

```ts
// next to `let coni`:
const AUSENTE = "00000000-0000-4000-8000-000000000000"
let carga = ""
let pausas = ""
let solo = ""

interface CamposDeTeoria {
  titulo: string
  estado?: "guardada" | "descartada_por_motor" | "borrador"
  origen?: "motor" | "manual"
  puntaje?: number | null
  nivel?: "alto" | "medio" | "debil" | null
  motivo?: string | null
  temas?: string[]
}

/** Titles end with the file's suffix, so `limpiar` finds the manual ones too. */
async function teoria(semana: string, campos: CamposDeTeoria): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.teorias (titulo, tesis, origen, estado, semana, puntaje, nivel_evidencia, motivo_fallo, temas)
     values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9::uuid[]) returning id`,
    [
      `${campos.titulo} ${SUFIJO}`,
      `Tesis de ${campos.titulo}`,
      campos.origen ?? "motor",
      campos.estado ?? "guardada",
      semana,
      campos.puntaje ?? null,
      campos.nivel ?? null,
      campos.motivo ?? null,
      campos.temas ?? [],
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó la teoría ${campos.titulo}`)
  return id
}
```

```ts
describe("leerSemana", () => {
  it("reads nothing before the first run", async () => {
    expect(await leerSemana(coni)).toEqual(SIN_CORRIDA)
  })

  it("reads only the latest run: its engine theories by score, its discarded crossings, live topics only", async () => {
    await corrida("2026-10-25", { costo: 0.2 })
    await teoria("2026-10-25", { titulo: "Vieja", temas: [carga] })
    await corrida("2026-11-01", { costo: 0.21, resumen: { ideas: 3, manual: true, queSubir: null } })
    await teoria("2026-11-01", { titulo: "Media", puntaje: 0.61, nivel: "medio", temas: [carga] })
    const alta = await teoria("2026-11-01", { titulo: "Alta", puntaje: 0.82, nivel: "alto", temas: [carga, AUSENTE, pausas] })
    await teoria("2026-11-01", { titulo: "Sin puntaje" })
    const cruce = await teoria("2026-11-01", {
      titulo: "Cruce",
      estado: "descartada_por_motor",
      motivo: "No hay ideas de dos autores distintos.",
      puntaje: 0.3,
      temas: [pausas, AUSENTE],
    })
    await teoria("2026-11-01", { titulo: "Manual", origen: "manual" })
    await teoria("2026-11-01", { titulo: "Borrador", estado: "borrador" })

    const leida = await leerSemana(coni)
    expect(leida.corrida).toEqual({
      semana: "2026-11-01",
      estado: "lista",
      costoUsd: 0.21,
      ideas: 3,
      manual: true,
      motivoFallo: null,
      creadaEn: expect.any(String),
    })
    expect(leida.teorias.map((t) => t.titulo)).toEqual([`Alta ${SUFIJO}`, `Media ${SUFIJO}`, `Sin puntaje ${SUFIJO}`])
    expect(leida.teorias[0]).toEqual({
      id: alta,
      titulo: `Alta ${SUFIJO}`,
      tesis: "Tesis de Alta",
      puntaje: 0.82,
      nivelEvidencia: "alto",
      temas: [
        { id: carga, nombre: `Carga ${SUFIJO}` },
        { id: pausas, nombre: `Pausas ${SUFIJO}` },
      ],
    })
    expect(leida.descartadas).toEqual([
      { id: cruce, razon: "No hay ideas de dos autores distintos.", temas: [{ id: pausas, nombre: `Pausas ${SUFIJO}` }] },
    ])
    expect(leida.queSubir).toBeNull()
  })

  it("reads what to upload: topics matched to their ids, pillars named with their network, retired ones dropped", async () => {
    await corrida("2026-11-08", {
      resumen: {
        ideas: 0,
        queSubir: {
          unSoloAutor: [`Solo ${SUFIJO}`, `Ausente ${SUFIJO}`],
          pilaresSinMaterial: ["psicologia-en-la-mesa", "pareja", "capa-tdah", "ia-salud-mental", "inteligencia-emocional"],
        },
      },
    })
    expect((await leerSemana(coni)).queSubir).toEqual({
      unSoloAutor: [
        { nombre: `Solo ${SUFIJO}`, id: solo },
        { nombre: `Ausente ${SUFIJO}`, id: null },
      ],
      pilaresSinMaterial: [
        { slug: "psicologia-en-la-mesa", nombreCorto: "Psicología en la mesa", red: "linkedin" },
        { slug: "inteligencia-emocional", nombreCorto: "Inteligencia emocional", red: "instagram" },
      ],
    })
  })

  it("reads a failed run with its reason, and a summary of another shape as empty", async () => {
    await corrida("2026-11-08", {
      estado: "fallida",
      motivo: "No pude armar las ideas de esta semana.",
      resumen: { ideas: "tres", queSubir: "x" },
    })
    const { corrida: leida, queSubir } = await leerSemana(coni)
    expect(leida).toMatchObject({ estado: "fallida", motivoFallo: "No pude armar las ideas de esta semana.", ideas: 0 })
    expect(leida?.manual).toBe(false)
    expect(queSubir).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/datos-semana.test.ts`
Expected: FAIL: `leerSemana` is not exported.

- [ ] **Step 3: Write the reader.** In `lib/datos/semana.ts`, replace the imports with

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  pilaresParaSubir,
  type QueSubirLeido,
  type SemanaLeida,
  SIN_CORRIDA,
  type TemaDeTeoria,
  temasParaSubir,
} from "@/lib/dominio/biblioteca/semana"
import { pilaresDeRedes } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { leerTodas } from "./paginas"
import { leerPilares } from "./pilares"
```

and append:

```ts
const Resumen = z.object({
  ideas: z.number().catch(0),
  manual: z.boolean().catch(false),
  queSubir: z
    .object({ unSoloAutor: z.array(z.string()), pilaresSinMaterial: z.array(z.string()) })
    .nullable()
    .catch(null),
})

/** `jsonb` that is not the shape the engine writes is read as empty rather than breaking the whole screen (as Ingesta). */
const leerResumen = (valor: unknown) => Resumen.catch({ ideas: 0, manual: false, queSubir: null }).parse(valor)

/** id to name of the topics that still exist (a merged one too: its page leads to the one that stayed). */
async function nombresDeTemas(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const filas = await leerTodas("los temas de las teorías", (despuesDe, limite) => {
    const consulta = db.from("temas").select("id, nombre").in("id", unicos)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return new Map(filas.map((tema) => [tema.id, tema.nombre]))
}

/** name to id: the engine stores single-author topics by name (`temas.nombre` is unique). */
async function idsDeTemas(db: Db, nombres: readonly string[]): Promise<Map<string, string>> {
  if (nombres.length === 0) return new Map()
  const filas = await leerTodas("los temas de un solo autor", (despuesDe, limite) => {
    const consulta = db.from("temas").select("id, nombre").in("nombre", [...nombres])
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return new Map(filas.map((tema) => [tema.nombre, tema.id]))
}

async function leerQueSubir(
  db: Db,
  crudo: { unSoloAutor: string[]; pilaresSinMaterial: string[] } | null,
): Promise<QueSubirLeido | null> {
  if (crudo === null) return null
  const [ids, catalogo] = await Promise.all([
    idsDeTemas(db, crudo.unSoloAutor),
    crudo.pilaresSinMaterial.length === 0 ? [] : leerPilares(db),
  ])
  return {
    unSoloAutor: temasParaSubir(crudo.unSoloAutor, ids),
    pilaresSinMaterial: pilaresParaSubir(crudo.pilaresSinMaterial, pilaresDeRedes(catalogo)),
  }
}

const puntajeDe = (teoria: { puntaje: number | null }) => teoria.puntaje ?? Number.NEGATIVE_INFINITY

/**
 * The latest run of the engine with the theories and discarded crossings of its week, and what it says to upload next
 * (ported from Ingesta's `leerSemana`). Theories by score, the unscored last. A topic that no longer exists drops out of
 * its theory's links.
 */
export async function leerSemana(db: Db): Promise<SemanaLeida> {
  const { data: corridas, error } = await db
    .from("motor_corridas")
    .select("semana, estado, costo_usd, resumen, motivo_fallo, creada_en")
    .order("semana", { ascending: false })
    .limit(1)
  if (error) throw new Error(`No pude leer la última corrida del motor: ${error.message}`, { cause: error })
  const fila = corridas[0]
  if (!fila) return SIN_CORRIDA

  const resumen = leerResumen(fila.resumen)
  const filas = await leerTodas(`las teorías de la semana ${fila.semana}`, (despuesDe, limite) => {
    const consulta = db
      .from("teorias")
      .select("id, estado, titulo, tesis, puntaje, nivel_evidencia, motivo_fallo, temas")
      .eq("origen", "motor")
      .eq("semana", fila.semana)
      .in("estado", ["guardada", "descartada_por_motor"])
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  const ordenadas = filas.toSorted((a, b) =>
    puntajeDe(a) === puntajeDe(b) ? a.id.localeCompare(b.id) : puntajeDe(b) - puntajeDe(a),
  )
  const [nombres, queSubir] = await Promise.all([
    nombresDeTemas(
      db,
      ordenadas.flatMap((teoria) => teoria.temas),
    ),
    leerQueSubir(db, resumen.queSubir),
  ])
  const temasDe = (ids: string[]): TemaDeTeoria[] =>
    ids.flatMap((id) => {
      const nombre = nombres.get(id)
      return nombre === undefined ? [] : [{ id, nombre }]
    })

  return {
    corrida: {
      semana: fila.semana,
      estado: fila.estado,
      costoUsd: Number(fila.costo_usd),
      ideas: resumen.ideas,
      manual: resumen.manual,
      motivoFallo: fila.motivo_fallo,
      creadaEn: fila.creada_en,
    },
    teorias: ordenadas
      .filter((teoria) => teoria.estado === "guardada")
      .map((teoria) => ({
        id: teoria.id,
        titulo: teoria.titulo ?? "",
        tesis: teoria.tesis ?? "",
        puntaje: teoria.puntaje,
        nivelEvidencia: teoria.nivel_evidencia,
        temas: temasDe(teoria.temas),
      })),
    descartadas: ordenadas
      .filter((teoria) => teoria.estado === "descartada_por_motor")
      .map((teoria) => ({ id: teoria.id, razon: teoria.motivo_fallo ?? "", temas: temasDe(teoria.temas) })),
    queSubir,
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:db tests/integration/datos-semana.test.ts && pnpm type`
Expected: PASS (6 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/datos/semana.ts tests/integration/datos-semana.test.ts
git add lib/datos/semana.ts tests/integration/datos-semana.test.ts
git commit -m "Read the engine's latest run, its theories and what to upload next

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: `proponerAhora`

**Files:**
- Create: `lib/acciones/semana.ts`
- Create: `tests/integration/acciones-semana.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/acciones-semana.test.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { proponerAhora } from "@/lib/acciones/semana"
import { NO_ARRANCO, YA_PROPUSO } from "@/lib/dominio/biblioteca/semana"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { vaciarMotor } from "./siembra"

type Db = SupabaseClient<Database>

/** Wednesday 4 November at noon in Santiago: its week closes on Sunday the 8th. */
const AHORA = new Date("2026-11-04T15:00:00Z")
const SEMANA = "2026-11-08"
const SOLO_CONI = "Esta app es solo para Coni."

let coni: Db
let wav: Db

const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000).toISOString()

async function corrida(semana: string, estado: "corriendo" | "lista" | "fallida", creadaEn: string): Promise<void> {
  await pool.query("insert into public.motor_corridas (semana, estado, creada_en) values ($1, $2, $3)", [
    semana,
    estado,
    creadaEn,
  ])
}

function deps(db: Db, motor = vi.fn(async (_semana: string): Promise<void> => {})) {
  return { db, disparar: { motor }, ahora: () => AHORA, motor }
}

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
})

beforeEach(() => vaciarMotor())

afterAll(async () => {
  await vaciarMotor()
  await pool.end()
})

describe("proponerAhora", () => {
  it("refuses anyone who is not Coni and starts nothing", async () => {
    const d = deps(wav)
    expect(await proponerAhora(d)).toEqual({ ok: false, error: SOLO_CONI })
    expect(d.motor).not.toHaveBeenCalled()
  })

  it("asks the engine once for this week, keyed by its Sunday, when the week has no run yet", async () => {
    await corrida("2026-11-01", "lista", hace(60 * 24 * 3))
    const d = deps(coni)
    expect(await proponerAhora(d)).toEqual({ ok: true })
    expect(d.motor).toHaveBeenCalledTimes(1)
    expect(d.motor).toHaveBeenCalledWith(SEMANA)
  })

  it.each([
    ["a ready week", "lista" as const, 600],
    ["a run alive for 10 minutes", "corriendo" as const, 10],
  ])("answers that the engine already proposed on %s, and starts nothing", async (_caso, estado, minutos) => {
    await corrida(SEMANA, estado, hace(minutos))
    const d = deps(coni)
    expect(await proponerAhora(d)).toEqual({ ok: false, error: YA_PROPUSO })
    expect(d.motor).not.toHaveBeenCalled()
  })

  it.each([
    ["a failed week", "fallida" as const, 5],
    ["a run stuck for 31 minutes", "corriendo" as const, 31],
  ])("asks again on %s", async (_caso, estado, minutos) => {
    await corrida(SEMANA, estado, hace(minutos))
    const d = deps(coni)
    expect(await proponerAhora(d)).toEqual({ ok: true })
    expect(d.motor).toHaveBeenCalledWith(SEMANA)
  })

  it("says it could not ask when the run does not start, and logs why for WAV", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const d = deps(
      coni,
      vi.fn(async (_semana: string): Promise<void> => {
        throw new Error("Trigger caído")
      }),
    )
    expect(await proponerAhora(d)).toEqual({ ok: false, error: NO_ARRANCO })
    expect(registro).toHaveBeenCalledWith(`No pude iniciar el motor para la semana ${SEMANA}`, expect.any(Error))
    registro.mockRestore()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/acciones-semana.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/acciones/semana"`.

- [ ] **Step 3: Write the action**

```ts
// lib/acciones/semana.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { NO_ARRANCO, puedePedirMotor, YA_PROPUSO } from "@/lib/dominio/biblioteca/semana"
import { Falla } from "@/lib/dominio/falla"
import { domingoDeSemana } from "@/lib/motor/semana"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import type { DisparosDeBiblioteca } from "./disparos"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsSemana {
  /** Coni's client: row level security applies, and `es_coni` is checked again here. */
  db: Db
  /** `motor-manual`, keyed `motor:<semana>` (claveMotor), so a double tap starts one run. */
  disparar: Pick<DisparosDeBiblioteca, "motor">
  ahora: () => Date
}

/**
 * «Proponer ahora» (ported from Ingesta): asks the engine for this week unless the week is ready or a run is still
 * alive. The week is the Sunday that closes it, the same key the engine writes.
 */
export function proponerAhora(deps: DepsSemana): Promise<Resultado> {
  return aResultado("proponerAhora", async () => {
    await exigirConi(deps.db)
    const ahora = deps.ahora()
    const semana = domingoDeSemana(ahora)
    const { data, error } = await deps.db
      .from("motor_corridas")
      .select("estado, creada_en")
      .eq("semana", semana)
      .maybeSingle()
    if (error) {
      throw new Error(`No pude leer la corrida del motor de la semana ${semana}: ${error.message}`, { cause: error })
    }
    if (!puedePedirMotor(data ? { estado: data.estado, creadaEn: data.creada_en } : null, ahora)) {
      throw new Falla(YA_PROPUSO)
    }
    try {
      await deps.disparar.motor(semana)
    } catch (falla) {
      console.error(`No pude iniciar el motor para la semana ${semana}`, falla)
      throw new Falla(NO_ARRANCO)
    }
    return {}
  })
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:db tests/integration/acciones-semana.test.ts && pnpm type`
Expected: PASS (7 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/acciones/semana.ts tests/integration/acciones-semana.test.ts
git add lib/acciones/semana.ts tests/integration/acciones-semana.test.ts
git commit -m "Let Coni ask the engine for this week from Conidolly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: the server action

**Files:**
- Create: `app/(app)/biblioteca/semana/acciones.ts`
- Create: `tests/unit/biblioteca-semana-acciones.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/biblioteca-semana-acciones.test.ts
// @vitest-environment node
import type { z } from "zod"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }
interface DepsRecibidas {
  db: unknown
  disparar: unknown
  ahora: () => Date
}

const { conSesionDeConi, revalidatePath, redirect, proponerAhora, disparos } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  revalidatePath: vi.fn(),
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT")
  }),
  proponerAhora: vi.fn(async (_deps: DepsRecibidas): Promise<Respuesta> => ({ ok: true })),
  disparos: { material: vi.fn(), motor: vi.fn() },
}))
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi, disparosDeBibliotecaDeLaApp: () => disparos }))
vi.mock("@/lib/acciones/semana", () => ({ proponerAhora }))

import { proponerAhoraAccion } from "@/app/(app)/biblioteca/semana/acciones"

beforeEach(() => vi.clearAllMocks())

describe("proponerAhoraAccion", () => {
  it("checks Coni with no input, asks with her client, the app's starters and the clock, and redraws Semana", async () => {
    expect(await proponerAhoraAccion()).toEqual({ ok: true })
    const [nombre, esquema, entrada, trabajo] = conSesionDeConi.mock.calls[0] ?? []
    expect(nombre).toBe("proponerAhora")
    expect(entrada).toEqual({})
    expect((esquema as z.ZodType).safeParse({}).success).toBe(true)
    const db = {}
    await (trabajo as (db: unknown, d: unknown) => Promise<unknown>)(db, {})
    const recibidas = proponerAhora.mock.calls[0]?.[0]
    expect(recibidas?.db).toBe(db)
    expect(recibidas?.disparar).toBe(disparos)
    expect(recibidas?.ahora()).toBeInstanceOf(Date)
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca/semana")
    expect(redirect).not.toHaveBeenCalled()
  })

  it("answers a refusal as it came and redraws nothing", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "El motor ya propuso ideas esta semana." })
    expect(await proponerAhoraAccion()).toEqual({ ok: false, error: "El motor ya propuso ideas esta semana." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana-acciones.test.ts`
Expected: FAIL with `Failed to resolve import "@/app/(app)/biblioteca/semana/acciones"`.

- [ ] **Step 3: Write the wrapper**

```ts
// app/(app)/biblioteca/semana/acciones.ts
"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { proponerAhora } from "@/lib/acciones/semana"
import { conSesionDeConi, disparosDeBibliotecaDeLaApp } from "@/lib/acciones/servidor"
import { RUTA_DE_SEMANA } from "@/lib/dominio/biblioteca/semana"

/** No input: who asks is what the server checks. The client redraws (`useRedibujar`); never `redirect()`. */
export async function proponerAhoraAccion() {
  const resultado = await conSesionDeConi("proponerAhora", z.object({}), {}, (db) =>
    proponerAhora({ db, disparar: disparosDeBibliotecaDeLaApp(), ahora: () => new Date() }),
  )
  if (resultado.ok) revalidatePath(RUTA_DE_SEMANA)
  return resultado
}
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/semana/acciones.ts" tests/unit/biblioteca-semana-acciones.test.ts
head -1 "app/(app)/biblioteca/semana/acciones.ts"   # must print "use server"
git add "app/(app)/biblioteca/semana/acciones.ts" tests/unit/biblioteca-semana-acciones.test.ts
git commit -m "Expose Proponer ahora as a server action that never redirects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 1:** reviewer on Tasks 1 to 7 against the spec's decisions 2 to 5, 8, 9 and "Code" (reader, domain, action). Check: no write to the database anywhere in this batch, the reader uses Coni's client only, the action never calls `redirect()`, and the key reaching Trigger is `motor:<domingoDeSemana(ahora)>`.

---

# Lote 2: screens

### Task 8: «Semana» in the Biblioteca's nav

**Files:**
- Modify: `app/(app)/biblioteca/nav-de-biblioteca.tsx`
- Modify: `tests/unit/biblioteca-piezas.test.tsx:10-22`

- [ ] **Step 1: Change the test** (replace the first `it` of `describe("NavDeBiblioteca (4c)")`)

```tsx
  it("shows the four sections, Semana after Temas, each with an icon and its name", () => {
    render(<NavDeBiblioteca actual="semana" />)
    const nav = screen.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    const enlaces = within(nav).getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Materiales", "Autores", "Temas", "Semana"])
    expect(enlaces.map((enlace) => enlace.getAttribute("href"))).toEqual([
      "/biblioteca",
      "/biblioteca/autores",
      "/biblioteca/temas",
      "/biblioteca/semana",
    ])
    expect(enlaces[3]).toHaveAttribute("aria-current", "page")
    expect(nav.querySelectorAll("svg")).toHaveLength(4)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-piezas.test.tsx`
Expected: FAIL: three links instead of four (and a type error on `actual="semana"` under `pnpm type`).

- [ ] **Step 3: Add the tab.** In `app/(app)/biblioteca/nav-de-biblioteca.tsx`: import `CalendarCheck` with the other icons and `RUTA_DE_SEMANA` from `@/lib/dominio/biblioteca/semana`; replace the comment and the list with

```tsx
// The Biblioteca's sections in Conidolly (batches 3 and 5). The tab switch from Ingesta is batch 7.
const SECCIONES = [
  { valor: "materiales", etiqueta: "Materiales", href: RUTA_DE_MATERIALES, Icono: FileText },
  { valor: "autores", etiqueta: "Autores", href: RUTA_DE_AUTORES, Icono: Users },
  { valor: "temas", etiqueta: "Temas", href: RUTA_DE_TEMAS, Icono: Tag },
  { valor: "semana", etiqueta: "Semana", href: RUTA_DE_SEMANA, Icono: CalendarCheck },
] as const
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/nav-de-biblioteca.tsx" tests/unit/biblioteca-piezas.test.tsx
git add "app/(app)/biblioteca/nav-de-biblioteca.tsx" tests/unit/biblioteca-piezas.test.tsx
git commit -m "Add Semana to the Biblioteca's sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: `BotonProponerAhora`

**Files:**
- Create: `app/(app)/biblioteca/semana/boton-proponer-ahora.tsx`
- Create: `tests/unit/biblioteca-boton-proponer-ahora.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/biblioteca-boton-proponer-ahora.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { proponerAhoraAccion, push, replace } = vi.hoisted(() => ({
  proponerAhoraAccion: vi.fn(async (): Promise<Respuesta> => ({ ok: true })),
  push: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/semana/acciones", () => ({ proponerAhoraAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace }) }))

import { BotonProponerAhora } from "@/app/(app)/biblioteca/semana/boton-proponer-ahora"

const YA_PROPUSO = "El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes."
const PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."

beforeEach(() => vi.clearAllMocks())

describe("BotonProponerAhora", () => {
  it("says what it costs under the button, and the button is described by it (4a)", () => {
    render(<BotonProponerAhora costoUsd={0.25} />)
    expect(screen.getByRole("button", { name: "Proponer ahora" })).toHaveAccessibleDescription(
      "Cuesta cerca de US$ 0,25",
    )
  })

  it("asks the engine, says it is on its way and redraws the screen", async () => {
    render(<BotonProponerAhora costoUsd={0.25} />)
    fireEvent.click(screen.getByRole("button", { name: "Proponer ahora" }))
    expect(await screen.findByRole("status")).toHaveTextContent(PEDIDO)
    expect(proponerAhoraAccion).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/[?&]v=\d+/), { scroll: false })
  })

  it("says a refusal in an error line, with no note and no redraw", async () => {
    proponerAhoraAccion.mockResolvedValueOnce({ ok: false, error: YA_PROPUSO })
    render(<BotonProponerAhora costoUsd={0.25} />)
    fireEvent.click(screen.getByRole("button", { name: "Proponer ahora" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(YA_PROPUSO)
    expect(screen.queryByText(PEDIDO)).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it("sends her to sign in when the session ended", async () => {
    proponerAhoraAccion.mockResolvedValueOnce({ ok: false, error: "Tu sesión venció. Entra de nuevo." })
    render(<BotonProponerAhora costoUsd={0.25} />)
    fireEvent.click(screen.getByRole("button", { name: "Proponer ahora" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
  })

  it("ignores a second tap while the first is on its way", async () => {
    render(<BotonProponerAhora costoUsd={0.25} />)
    const boton = screen.getByRole("button", { name: "Proponer ahora" })
    fireEvent.click(boton)
    fireEvent.click(boton)
    await screen.findByRole("status")
    expect(proponerAhoraAccion).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-boton-proponer-ahora.test.tsx`
Expected: FAIL with `Failed to resolve import "@/app/(app)/biblioteca/semana/boton-proponer-ahora"`.

- [ ] **Step 3: Write the component**

```tsx
// app/(app)/biblioteca/semana/boton-proponer-ahora.tsx
"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeSaldo } from "@/components/ui/costo"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import { MOTOR_PEDIDO, textoDeCosto } from "@/lib/dominio/biblioteca/semana"
import { proponerAhoraAccion } from "./acciones"

const ID_DEL_COSTO = "costo-de-proponer-ahora"

/**
 * Asks the engine for this week. The estimate sits under it (4a); the note stays while the screen redraws, since the
 * run's row only appears once the task starts.
 */
export function BotonProponerAhora({ costoUsd }: { costoUsd: number }) {
  const { pendiente, error, ejecutar } = useAccion()
  const redibujar = useRedibujar()
  const [pedido, setPedido] = useState(false)
  return (
    <div className="grid justify-items-start gap-2">
      <Boton
        cargando={pendiente}
        aria-describedby={ID_DEL_COSTO}
        onClick={() => {
          setPedido(false)
          ejecutar(proponerAhoraAccion, () => {
            setPedido(true)
            redibujar()
          })
        }}
      >
        Proponer ahora
      </Boton>
      <LineaDeSaldo id={ID_DEL_COSTO}>{textoDeCosto(costoUsd)}</LineaDeSaldo>
      {pedido ? <LineaDeEstado tipo="neutro" titulo={MOTOR_PEDIDO} /> : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run it and the design rules**

Run: `pnpm exec vitest run tests/unit/biblioteca-boton-proponer-ahora.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm test:run
pnpm exec biome check --write "app/(app)/biblioteca/semana/boton-proponer-ahora.tsx" tests/unit/biblioteca-boton-proponer-ahora.test.tsx
head -1 "app/(app)/biblioteca/semana/boton-proponer-ahora.tsx"   # must print "use client"
git add "app/(app)/biblioteca/semana/boton-proponer-ahora.tsx" tests/unit/biblioteca-boton-proponer-ahora.test.tsx
git commit -m "Add Proponer ahora with its estimated cost under it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: the run panel and what to upload next

**Files:**
- Create: `app/(app)/biblioteca/semana/vista-de-semana.tsx`
- Create: `tests/unit/biblioteca-semana-vista.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/biblioteca-semana-vista.test.tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/biblioteca/semana/acciones", () => ({ proponerAhoraAccion: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { CorridaDeLaSemana, QueSubir } from "@/app/(app)/biblioteca/semana/vista-de-semana"
import type { CorridaLeida, QueSubirLeido } from "@/lib/dominio/biblioteca/semana"

const CORRIDA: CorridaLeida = {
  semana: "2026-11-08",
  estado: "lista",
  costoUsd: 0.21,
  ideas: 3,
  manual: false,
  motivoFallo: null,
  creadaEn: "2026-11-08T23:00:00Z",
}
const QUE_SUBIR: QueSubirLeido = {
  unSoloAutor: [
    { nombre: "Descanso digital", id: "55555555-5555-4555-8555-555555555555" },
    { nombre: "Sueño y pantallas", id: null },
  ],
  pilaresSinMaterial: [{ slug: "psicologia-en-la-mesa", nombreCorto: "Psicología en la mesa", red: "linkedin" }],
}

const iconosDe = (texto: string) => screen.getByText(texto, { exact: true }).parentElement?.querySelectorAll("svg")

describe("CorridaDeLaSemana", () => {
  it("names the week, its state as icon and word, and a ready run's ideas and cost", () => {
    render(<CorridaDeLaSemana corrida={CORRIDA} />)
    expect(screen.getByRole("heading", { name: "Semana del 2 al 8 de noviembre", level: 2 })).toBeInTheDocument()
    expect(iconosDe("Lista")).toHaveLength(1)
    expect(screen.getByText("3 ideas nuevas · Costó US$ 0,21")).toBeInTheDocument()
    expect(screen.queryByText("A pedido")).toBeNull()
  })

  it("marks a run she asked for", () => {
    render(<CorridaDeLaSemana corrida={{ ...CORRIDA, manual: true }} />)
    expect(iconosDe("A pedido")).toHaveLength(1)
  })

  it.each([
    ["corriendo", "Trabajando"],
    ["fallida", "Falló"],
  ])("draws a %s run as an icon and «%s», with no ideas line", (estado, palabra) => {
    render(<CorridaDeLaSemana corrida={{ ...CORRIDA, estado, ideas: 0, costoUsd: 0 }} />)
    expect(iconosDe(palabra)).toHaveLength(1)
    expect(screen.queryByText(/ideas nuevas/)).toBeNull()
  })
})

describe("QueSubir", () => {
  it("links the single-author topics it can, keeps the others as text, and names pillars with their network", () => {
    render(<QueSubir queSubir={QUE_SUBIR} />)
    const seccion = screen.getByRole("region", { name: "Qué subir después" })
    expect(within(seccion).getByRole("heading", { name: "Qué subir después", level: 2 })).toBeInTheDocument()
    expect(within(seccion).getByRole("link", { name: "Descanso digital" })).toHaveAttribute(
      "href",
      "/biblioteca/temas/55555555-5555-4555-8555-555555555555",
    )
    expect(within(seccion).getByText("Sueño y pantallas")).toBeInTheDocument()
    expect(within(seccion).queryByRole("link", { name: "Sueño y pantallas" })).toBeNull()
    expect(within(seccion).getByText("Psicología en la mesa · LinkedIn")).toBeInTheDocument()
  })

  it("says nothing is missing when both lists are empty, with no empty list", () => {
    render(<QueSubir queSubir={{ unSoloAutor: [], pilaresSinMaterial: [] }} />)
    expect(
      screen.getByText("Por ahora no falta nada: cada tema tiene varios autores y cada pilar tiene material."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("draws nothing when the run says nothing about it", () => {
    const { container } = render(<QueSubir queSubir={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana-vista.test.tsx`
Expected: FAIL with `Failed to resolve import "@/app/(app)/biblioteca/semana/vista-de-semana"`.

- [ ] **Step 3: Write the components**

```tsx
// app/(app)/biblioteca/semana/vista-de-semana.tsx
import { HandTap, HourglassMedium } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { PildoraDeEstado } from "@/components/ui/estado"
import { ICONO } from "@/components/ui/icono"
import { Panel } from "@/components/ui/panel"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import {
  A_PEDIDO,
  type CorridaLeida,
  etiquetaDePilarParaSubir,
  NADA_QUE_SUBIR,
  nadaQueSubir,
  presentarCorrida,
  type QueSubirLeido,
  resumenDeCorrida,
  type TemaDeTeoria,
  tituloDeSemana,
} from "@/lib/dominio/biblioteca/semana"
import { cn } from "@/lib/utils"

// Ported from Ingesta's app/(app)/semana/vista-de-semana.tsx, with fixes 4a, 4h, 4j and 4l (spec 2026-11-06).

const ICONO_DE_PILDORA = { "aria-hidden": true, size: ICONO.chico, weight: "bold", className: "shrink-0" } as const

/** Each topic as a chip that leads to its page (spec decision 9); nothing when none is left. */
function EnlacesDeTemas({ temas, etiqueta }: { temas: readonly TemaDeTeoria[]; etiqueta: string }) {
  if (temas.length === 0) return null
  return (
    <ul aria-label={etiqueta} className="flex flex-wrap gap-2">
      {temas.map((tema) => (
        <li key={tema.id}>
          <Link href={hrefDeTema(tema.id)} className={cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP)}>
            {tema.nombre}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The run: its week, its state as icon and word (4j), «A pedido», and a ready run's ideas and cost. */
export function CorridaDeLaSemana({ corrida }: { corrida: CorridaLeida }) {
  const estado = presentarCorrida(corrida.estado)
  return (
    <Panel className="grid gap-3">
      <h2 data-snapshot="varia" className="text-pieza text-balance">
        {tituloDeSemana(corrida.semana)}
      </h2>
      <div className="flex flex-wrap gap-2">
        <PildoraDeEstado
          tipo={estado.tipo}
          icono={estado.icono === "reloj" ? <HourglassMedium {...ICONO_DE_PILDORA} /> : undefined}
        >
          {estado.palabra}
        </PildoraDeEstado>
        {corrida.manual ? (
          <PildoraDeEstado tipo="neutro" icono={<HandTap {...ICONO_DE_PILDORA} />}>
            {A_PEDIDO}
          </PildoraDeEstado>
        ) : null}
      </div>
      {corrida.estado === "lista" ? (
        <p data-snapshot="varia" className="text-meta text-apagado">
          {resumenDeCorrida(corrida)}
        </p>
      ) : null}
    </Panel>
  )
}

/** What the run says to upload next (spec decision 8): one line when nothing is missing, no empty list (4l). */
export function QueSubir({ queSubir }: { queSubir: QueSubirLeido | null }) {
  if (queSubir === null) return null
  return (
    <section aria-label="Qué subir después" className="grid gap-3">
      <h2 className="text-pieza">Qué subir después</h2>
      {nadaQueSubir(queSubir) ? <p className="text-cuerpo text-apagado">{NADA_QUE_SUBIR}</p> : null}
      {queSubir.unSoloAutor.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-cuerpo font-semibold">Temas con un solo autor</h3>
          <ul className="grid gap-1.5 text-cuerpo">
            {queSubir.unSoloAutor.map((tema) => (
              <li key={tema.nombre}>
                {tema.id === null ? (
                  tema.nombre
                ) : (
                  <Link href={hrefDeTema(tema.id)} className="text-tinta underline decoration-1 underline-offset-4">
                    {tema.nombre}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {queSubir.pilaresSinMaterial.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-cuerpo font-semibold">Pilares sin material</h3>
          <ul className="grid gap-1.5 text-cuerpo">
            {queSubir.pilaresSinMaterial.map((pilar) => (
              <li key={pilar.slug}>{etiquetaDePilarParaSubir(pilar)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
```

`EnlacesDeTemas` is used from Task 11 on; if `pnpm lint` flags it as unused in this commit, export it (`export function EnlacesDeTemas`) rather than leaving a suppression.

- [ ] **Step 4: Run it and the rules**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana-vista.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm test:run
pnpm exec biome check --write "app/(app)/biblioteca/semana/vista-de-semana.tsx" tests/unit/biblioteca-semana-vista.test.tsx
git add "app/(app)/biblioteca/semana/vista-de-semana.tsx" tests/unit/biblioteca-semana-vista.test.tsx
git commit -m "Draw the engine's run and what to upload next

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: what the engine crossed, and the crossings that did not work

**Files:**
- Modify: `app/(app)/biblioteca/semana/vista-de-semana.tsx`
- Modify: `tests/unit/biblioteca-semana-vista.test.tsx`

- [ ] **Step 1: Write the failing test** (add `LoQueCruzo` to the vista import and `CruceDescartado`, `TeoriaEscrita` to the type import; append the fixtures, which Task 12 reuses, and the `describe`)

```tsx
const CARGA = { id: "11111111-1111-4111-8111-111111111111", nombre: "Carga mental" }
const PAUSAS = { id: "22222222-2222-4222-8222-222222222222", nombre: "Pausas activas" }
const TEORIA: TeoriaEscrita = {
  id: "33333333-3333-4333-8333-333333333333",
  titulo: "Repartir la carga también es descansar",
  tesis: "Quien reparte la carga mental descansa mejor.",
  puntaje: 0.82,
  nivelEvidencia: "alto",
  temas: [CARGA, PAUSAS],
}
const CRUCE: CruceDescartado = {
  id: "44444444-4444-4444-8444-444444444444",
  razon: "No hay ideas de dos autores distintos.",
  temas: [CARGA],
}

describe("LoQueCruzo", () => {
  const SIN_RESPALDO: TeoriaEscrita = {
    ...TEORIA,
    id: "66666666-6666-4666-8666-666666666666",
    titulo: "Sin respaldo",
    puntaje: null,
    nivelEvidencia: null,
    temas: [],
  }
  const OTRO_CRUCE: CruceDescartado = {
    id: "77777777-7777-4777-8777-777777777777",
    razon: "Repite lo que el motor cruzó la semana pasada.",
    temas: [PAUSAS],
  }

  it("lists each theory with its thesis, its backing in her words and its topics as links (4h, decision 9)", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[TEORIA, SIN_RESPALDO]} descartadas={[]} />)
    const region = screen.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
    expect(within(region).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      TEORIA.titulo,
      "Sin respaldo",
    ])
    expect(within(region).getByText(TEORIA.tesis)).toBeInTheDocument()
    expect(within(region).getByText("Respaldo: fuerte")).toBeInTheDocument()
    const temas = within(region).getByRole("list", { name: `Temas de «${TEORIA.titulo}»` })
    expect(
      within(temas)
        .getAllByRole("link")
        .map((enlace) => [enlace.textContent, enlace.getAttribute("href")]),
    ).toEqual([
      ["Carga mental", `/biblioteca/temas/${CARGA.id}`],
      ["Pausas activas", `/biblioteca/temas/${PAUSAS.id}`],
    ])
    expect(within(region).queryByRole("list", { name: "Temas de «Sin respaldo»" })).toBeNull()
  })

  it("folds the score and the id under Detalle para WAV", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[TEORIA]} descartadas={[]} />)
    const detalle = screen.getByText("Detalle para WAV").closest("details")
    expect(detalle?.open).toBe(false)
    expect(detalle).toHaveTextContent(`Puntaje: 0,82Teoría: ${TEORIA.id}`)
  })

  it("folds the crossings that did not work with their count, topics and reasons (4l)", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[TEORIA]} descartadas={[CRUCE, OTRO_CRUCE]} />)
    const cruces = screen.getByText("Cruces que no sirvieron (2)").closest("details")
    expect(cruces?.open).toBe(false)
    expect(cruces).toHaveTextContent(CRUCE.razon)
    expect(cruces).toHaveTextContent(OTRO_CRUCE.razon)
    const lista = within(cruces as HTMLElement).getByRole("list", { name: "Cruces que no sirvieron" })
    expect(within(lista).getAllByRole("link").map((enlace) => enlace.textContent)).toEqual([
      "Carga mental",
      "Pausas activas",
    ])
  })

  it("says a ready run that crossed nothing in one line, with no heading and no empty fold (4l)", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[]} descartadas={[]} />)
    expect(screen.getByText("Esta semana el motor no encontró cruces nuevos.")).toBeInTheDocument()
    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.queryByText(/Cruces que no sirvieron/)).toBeNull()
  })

  it("keeps the folded crossings under that line when there are some", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[]} descartadas={[CRUCE]} />)
    expect(screen.getByText("Esta semana el motor no encontró cruces nuevos.")).toBeInTheDocument()
    expect(screen.getByText("Cruces que no sirvieron (1)")).toBeInTheDocument()
  })

  it("says the engine is still working while it runs", () => {
    render(<LoQueCruzo corrida={{ ...CORRIDA, estado: "corriendo" }} teorias={[]} descartadas={[]} />)
    expect(screen.getByText("El motor todavía está trabajando en esta semana.")).toBeInTheDocument()
  })

  it("shows a failed run's reason, without interrupting her on load", () => {
    const motivo = "No pude armar las ideas de esta semana. Avisamos al equipo; puedes volver a intentarlo."
    render(<LoQueCruzo corrida={{ ...CORRIDA, estado: "fallida", motivoFallo: motivo }} teorias={[]} descartadas={[]} />)
    expect(screen.getByText(motivo)).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByText("Esta semana el motor no encontró cruces nuevos.")).toBeNull()
  })

  it("says when the first batch comes before any run", () => {
    render(<LoQueCruzo corrida={null} teorias={[]} descartadas={[]} />)
    expect(
      screen.getByText("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00."),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana-vista.test.tsx`
Expected: FAIL: `LoQueCruzo` is not exported (`Element type is invalid`).

- [ ] **Step 3: Write the component.** In `vista-de-semana.tsx` add to the imports `DetalleParaWav` (`@/components/ui/detalle-para-wav`), `LineaDeEstado` (`@/components/ui/linea-de-estado`), `MasOpciones` (`@/components/ui/mas-opciones`), and from `@/lib/dominio/biblioteca/semana`: `type CruceDescartado`, `crucesQueNoSirvieron`, `lineasDeTeoriaParaWav`, `MOTOR_NO_TERMINO`, `respaldoDeTeoria`, `SIN_CORRIDAS`, `SIN_CRUCES`, `type TeoriaEscrita`, `TITULO_DE_LO_CRUZADO`, `TRABAJANDO`. Append:

```tsx
const ID_DE_LO_CRUZADO = "lo-que-cruzo"

function Teoria({ teoria }: { teoria: TeoriaEscrita }) {
  const respaldo = respaldoDeTeoria(teoria.nivelEvidencia)
  return (
    <li data-contorno className="grid gap-3 rounded-panel bg-piedra-alta p-5">
      <h3 className="text-cuerpo font-semibold text-balance">{teoria.titulo}</h3>
      {teoria.tesis ? <p className="text-cuerpo">{teoria.tesis}</p> : null}
      {respaldo ? (
        <PildoraDeEstado tipo="neutro" className="w-fit">
          {respaldo}
        </PildoraDeEstado>
      ) : null}
      <EnlacesDeTemas temas={teoria.temas} etiqueta={`Temas de «${teoria.titulo}»`} />
      <DetalleParaWav lineas={lineasDeTeoriaParaWav(teoria)} proveedor={null} />
    </li>
  )
}

/** Folded, with their count (4l): the crossings the engine tried and dropped, and why. */
function CrucesQueNoSirvieron({ descartadas }: { descartadas: readonly CruceDescartado[] }) {
  if (descartadas.length === 0) return null
  return (
    <MasOpciones titulo={crucesQueNoSirvieron(descartadas.length)}>
      <ul aria-label="Cruces que no sirvieron" className="grid gap-4">
        {descartadas.map((cruce) => (
          <li key={cruce.id} className="grid gap-2">
            <EnlacesDeTemas temas={cruce.temas} etiqueta="Temas del cruce" />
            <p className="text-meta text-apagado">{cruce.razon}</p>
          </li>
        ))}
      </ul>
    </MasOpciones>
  )
}

/** What the run says in the left column when it wrote no theory, or why there is none yet (plan D2). */
function AvisoDeLaCorrida({ corrida, hayTeorias }: { corrida: CorridaLeida; hayTeorias: boolean }) {
  if (corrida.estado === "fallida") {
    return <LineaDeEstado tipo="error" titulo={corrida.motivoFallo ?? MOTOR_NO_TERMINO} tituloEnTinta anunciada />
  }
  if (corrida.estado === "corriendo") return <p className="text-cuerpo text-apagado">{TRABAJANDO}</p>
  return hayTeorias ? null : <p className="text-cuerpo text-apagado">{SIN_CRUCES}</p>
}

/** «Lo que el motor cruzó esta semana» (4h): the theories by score, then the folded crossings. Empty in one line (4l). */
export function LoQueCruzo({
  corrida,
  teorias,
  descartadas,
}: {
  corrida: CorridaLeida | null
  teorias: readonly TeoriaEscrita[]
  descartadas: readonly CruceDescartado[]
}) {
  if (corrida === null) return <p className="text-cuerpo text-apagado">{SIN_CORRIDAS}</p>
  const aviso = <AvisoDeLaCorrida corrida={corrida} hayTeorias={teorias.length > 0} />
  if (teorias.length === 0) {
    return (
      <div className="grid gap-4">
        {aviso}
        <CrucesQueNoSirvieron descartadas={descartadas} />
      </div>
    )
  }
  return (
    <section aria-labelledby={ID_DE_LO_CRUZADO} className="grid gap-4">
      <h2 id={ID_DE_LO_CRUZADO} className="text-pieza text-balance">
        {TITULO_DE_LO_CRUZADO}
      </h2>
      {aviso}
      <ul aria-labelledby={ID_DE_LO_CRUZADO} className="grid gap-4">
        {teorias.map((teoria) => (
          <Teoria key={teoria.id} teoria={teoria} />
        ))}
      </ul>
      <CrucesQueNoSirvieron descartadas={descartadas} />
    </section>
  )
}
```

- [ ] **Step 4: Run it and the rules**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana-vista.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm test:run
pnpm exec biome check --write "app/(app)/biblioteca/semana/vista-de-semana.tsx" tests/unit/biblioteca-semana-vista.test.tsx
git add "app/(app)/biblioteca/semana/vista-de-semana.tsx" tests/unit/biblioteca-semana-vista.test.tsx
git commit -m "Draw what the engine crossed, with the failed crossings folded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: `VistaDeSemana`, the layout on the phone and on a computer

**Files:**
- Modify: `app/(app)/biblioteca/semana/vista-de-semana.tsx`
- Modify: `tests/unit/biblioteca-semana-vista.test.tsx`

- [ ] **Step 1: Write the failing test** (add `VistaDeSemana` to the vista import; append)

```tsx
describe("VistaDeSemana (spec decision 10)", () => {
  const SEMANA = { corrida: CORRIDA, teorias: [TEORIA], descartadas: [CRUCE], queSubir: QUE_SUBIR }
  const sigue = (antes: Node, despues: Node) =>
    (antes.compareDocumentPosition(despues) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  it("puts the run, Proponer ahora and its cost in a sticky right panel that starts beside the title", () => {
    render(<VistaDeSemana encabezado={<h1>Biblioteca</h1>} semana={SEMANA} costoUsd={0.23} />)
    const panel = screen.getByRole("complementary", { name: "Corrida del motor" })
    expect(panel).toHaveClass("md:sticky", "md:top-24", "md:col-start-2", "md:row-start-1", "md:row-span-2")
    expect(within(panel).getByRole("heading", { name: "Semana del 2 al 8 de noviembre" })).toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: "Proponer ahora" })).toHaveAccessibleDescription(
      "Cuesta cerca de US$ 0,23",
    )
    const cruzado = screen.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
    expect(cruzado.parentElement).toHaveClass("md:col-start-1", "md:row-start-2", "min-w-0")
  })

  it("reads on the phone as title, run, what was crossed, then what to upload; the panel has its own copy for a computer", () => {
    render(<VistaDeSemana encabezado={<h1>Biblioteca</h1>} semana={SEMANA} costoUsd={0.23} />)
    const titulo = screen.getByRole("heading", { name: "Biblioteca", level: 1 })
    const panel = screen.getByRole("complementary", { name: "Corrida del motor" })
    const cruzado = screen.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
    const [enPanel, alFinal] = screen.getAllByRole("region", { name: "Qué subir después" })
    expect(panel).toContainElement(enPanel ?? null)
    expect(enPanel?.parentElement).toHaveClass("hidden", "md:block")
    expect(alFinal?.parentElement).toHaveClass("md:hidden")
    expect(sigue(titulo, panel)).toBe(true)
    expect(sigue(panel, cruzado)).toBe(true)
    expect(alFinal && sigue(cruzado, alFinal)).toBe(true)
  })

  it("before any run keeps only the button in the panel and says when the first batch comes", () => {
    render(
      <VistaDeSemana
        encabezado={<h1>Biblioteca</h1>}
        semana={{ corrida: null, teorias: [], descartadas: [], queSubir: null }}
        costoUsd={0.3}
      />,
    )
    const panel = screen.getByRole("complementary", { name: "Corrida del motor" })
    expect(within(panel).queryByRole("heading")).toBeNull()
    expect(within(panel).getByText("Cuesta cerca de US$ 0,30")).toBeInTheDocument()
    expect(
      screen.getByText("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Qué subir después" })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana-vista.test.tsx`
Expected: FAIL: `VistaDeSemana` is not exported.

- [ ] **Step 3: Write the layout.** In `vista-de-semana.tsx` import `type ReactNode` from `react`, `type SemanaLeida` from `@/lib/dominio/biblioteca/semana` and `BotonProponerAhora` from `./boton-proponer-ahora`; append:

```tsx
/**
 * The DOM follows the phone (title, run and «Proponer ahora», what was crossed, what to upload); on a computer the grid
 * puts the panel in a sticky right column beside everything (plan D1). «Qué subir después» is drawn twice, as Materiales
 * draws its cards and its table: only one is ever displayed.
 */
export function VistaDeSemana({
  encabezado,
  semana,
  costoUsd,
}: {
  encabezado: ReactNode
  semana: SemanaLeida
  costoUsd: number
}) {
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-x-8">
      <div className="grid min-w-0 gap-5 md:col-start-1 md:row-start-1">{encabezado}</div>
      <aside
        aria-label="Corrida del motor"
        className="grid content-start gap-5 md:sticky md:top-24 md:col-start-2 md:row-span-2 md:row-start-1 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
        {semana.corrida ? <CorridaDeLaSemana corrida={semana.corrida} /> : null}
        <BotonProponerAhora costoUsd={costoUsd} />
        <div className="hidden md:block">
          <QueSubir queSubir={semana.queSubir} />
        </div>
      </aside>
      <div className="grid min-w-0 content-start gap-5 md:col-start-1 md:row-start-2">
        <LoQueCruzo corrida={semana.corrida} teorias={semana.teorias} descartadas={semana.descartadas} />
      </div>
      <div className="md:hidden">
        <QueSubir queSubir={semana.queSubir} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run it and the rules**

Run: `pnpm exec vitest run tests/unit/biblioteca-semana-vista.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm test:run
pnpm exec biome check --write "app/(app)/biblioteca/semana/vista-de-semana.tsx" tests/unit/biblioteca-semana-vista.test.tsx
git add "app/(app)/biblioteca/semana/vista-de-semana.tsx" tests/unit/biblioteca-semana-vista.test.tsx
git commit -m "Lay Semana out in one column on the phone and with a sticky panel on a computer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: the page and its skeleton (4m)

**Files:**
- Create: `app/(app)/biblioteca/semana/page.tsx`
- Create: `app/(app)/biblioteca/semana/loading.tsx`
- Create: `tests/unit/biblioteca-pagina-semana.test.tsx`
- Modify: `tests/unit/biblioteca-pantallas-propias.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/biblioteca-pagina-semana.test.tsx
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    leerSemana: vi.fn(async (..._: unknown[]): Promise<unknown> => ({
      corrida: null,
      teorias: [],
      descartadas: [],
      queSubir: null,
    })),
    leerCostosDelMotor: vi.fn(async (..._: unknown[]): Promise<number[]> => [0.2, 0.25, 0.3]),
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "alguien@ejemplo.cl" } } }) },
    rpc: async () => ({ data: esConi.valor, error: null }),
  }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (ruta: string) => {
    throw new Error(`NEXT_REDIRECT ${ruta}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/lib/datos/semana", () => datos)
vi.mock("@/app/(app)/biblioteca/semana/acciones", () => ({ proponerAhoraAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import { NavDeBiblioteca } from "@/app/(app)/biblioteca/nav-de-biblioteca"
import Semana from "@/app/(app)/biblioteca/semana/page"
import { VistaDeSemana } from "@/app/(app)/biblioteca/semana/vista-de-semana"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

beforeEach(() => vi.clearAllMocks())

describe("the Semana page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Semana()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerSemana).not.toHaveBeenCalled()
  })

  it("reads the week and the costs with her client, estimates the cost and draws the Semana tab", async () => {
    esConi.valor = true
    const vista = elementos(await Semana()).find((elemento) => elemento.type === VistaDeSemana)
    expect(vista?.props.costoUsd).toBe(0.25)
    expect(vista?.props.semana).toEqual({ corrida: null, teorias: [], descartadas: [], queSubir: null })
    expect(datos.leerSemana).toHaveBeenCalledTimes(1)
    expect(datos.leerCostosDelMotor).toHaveBeenCalledTimes(1)
    const encabezado = elementos(vista?.props.encabezado as ReactNode)
    expect(encabezado.find((elemento) => elemento.type === "h1")?.props.children).toBe("Biblioteca")
    expect(encabezado.find((elemento) => elemento.type === NavDeBiblioteca)?.props.actual).toBe("semana")
  })
})
```

In `tests/unit/biblioteca-pantallas-propias.test.tsx` add the import `import CargandoLaSemana from "@/app/(app)/biblioteca/semana/loading"` and this test inside the `describe`:

```tsx
  it("loads Semana with a skeleton of its two columns, never a spinner", () => {
    render(<CargandoLaSemana />)
    const cargando = screen.getByRole("status", { name: "Cargando" })
    expect(cargando).toHaveClass("md:grid-cols-[minmax(0,1fr)_20rem]")
    expect(cargando.querySelectorAll(".esqueleto").length).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-semana.test.tsx tests/unit/biblioteca-pantallas-propias.test.tsx`
Expected: FAIL: `@/app/(app)/biblioteca/semana/page` and `.../semana/loading` do not resolve.

- [ ] **Step 3: Write the page and the skeleton**

```tsx
// app/(app)/biblioteca/semana/page.tsx
import { leerCostosDelMotor, leerSemana } from "@/lib/datos/semana"
import { estimarCostoDelMotor } from "@/lib/dominio/biblioteca/semana"
import { exigirConi } from "@/lib/sesion/coni"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { VistaDeSemana } from "./vista-de-semana"

/** The engine's latest run (ported from Ingesta's `semana/page.tsx`); only Coni enters (spec decision 1). */
export default async function Semana() {
  const { db } = await exigirConi()
  const [semana, costos] = await Promise.all([leerSemana(db), leerCostosDelMotor(db)])
  return (
    <VistaDeSemana
      encabezado={
        <>
          <h1 className="text-pantalla">Biblioteca</h1>
          <NavDeBiblioteca actual="semana" />
        </>
      }
      semana={semana}
      costoUsd={estimarCostoDelMotor(costos)}
    />
  )
}
```

```tsx
// app/(app)/biblioteca/semana/loading.tsx
// Brandkit 9.24: skeleton bars in the final shape (the run panel first on the phone, right on a computer), never a spinner.
export default function CargandoLaSemana() {
  return (
    <output aria-label="Cargando" className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-x-8">
      <div className="grid content-start gap-3 rounded-panel bg-piedra-alta p-5 md:col-start-2 md:row-start-1">
        <div className="esqueleto h-3 w-1/2" />
        <div className="esqueleto h-3 w-1/3" />
        <div className="esqueleto min-h-objetivo w-full" />
      </div>
      <div className="grid content-start gap-4 md:col-start-1 md:row-start-1">
        <div className="esqueleto h-3 w-1/3" />
        {[0, 1, 2].map((fila) => (
          <div key={fila} className="grid gap-2 rounded-panel bg-piedra-alta p-5">
            <div className="esqueleto h-3 w-4/5" />
            <div className="esqueleto h-3 w-3/5" />
          </div>
        ))}
      </div>
    </output>
  )
}
```

- [ ] **Step 4: Run all unit tests and the build**

Run: `pnpm test:run && pnpm type && pnpm build`
Expected: PASS; the build lists `/biblioteca/semana` as a dynamic route (ƒ).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/semana/page.tsx" "app/(app)/biblioteca/semana/loading.tsx" tests/unit/biblioteca-pagina-semana.test.tsx tests/unit/biblioteca-pantallas-propias.test.tsx
git add "app/(app)/biblioteca/semana/page.tsx" "app/(app)/biblioteca/semana/loading.tsx" tests/unit/biblioteca-pagina-semana.test.tsx tests/unit/biblioteca-pantallas-propias.test.tsx
git commit -m "Open Semana at /biblioteca/semana, with its own skeleton

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: the budget screen points to Semana

**Files:**
- Modify: `app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx:461`
- Modify: `tests/unit/pantalla-de-presupuesto.test.tsx`

- [ ] **Step 1: Write the failing test** (inside `describe("PantallaDePresupuesto")`, after "switches off what spends by itself")

```tsx
  it("says «Proponer ahora» still works, and where it lives now", () => {
    mostrar()
    expect(
      screen.getByText(
        "Corren sin que los pidas. Apagados no gastan. «Proponer ahora» sigue funcionando en la Biblioteca, en Semana.",
      ),
    ).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/pantalla-de-presupuesto.test.tsx`
Expected: FAIL: the screen still says «... en Ingesta sigue funcionando.».

- [ ] **Step 3: Change the line** in `pantalla-de-presupuesto.tsx:460-462` to

```tsx
        <p className="text-meta text-apagado">
          Corren sin que los pidas. Apagados no gastan. «Proponer ahora» sigue funcionando en la Biblioteca, en Semana.
        </p>
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx" tests/unit/pantalla-de-presupuesto.test.tsx
head -1 "app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx"   # must print "use client"
git add "app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx" tests/unit/pantalla-de-presupuesto.test.tsx
git commit -m "Say in the budget that Proponer ahora now lives in the Biblioteca's Semana

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 2:** reviewer on Tasks 8 to 14 against the spec's decisions 1, 5 to 10 and "Screens". `pnpm build` must pass here, before the E2E. Check the words test, the design rules, `"use client"` on line 1 of the button, and that no new screen calls `redirect()`.

---

# Lote 3: end to end

### Task 15: Semana on the phone

**Files:**
- Modify: `tests/e2e/biblioteca-escena.ts` (append `sembrarSemana`)
- Modify: `tests/e2e/ayudas.ts` (add `disparosDelMotor`)
- Create: `tests/e2e/biblioteca-semana.spec.ts`

- [ ] **Step 1: The scene and the runs reader.** In `tests/e2e/ayudas.ts`, after `disparosDeMateriales`:

```ts
/** The engine runs «Proponer ahora» would have started, each with its key. */
export function disparosDelMotor(): z.infer<typeof DisparoDelMotor>[] {
  return leerDisparos().flatMap((disparo) => (disparo.tarea === "motor-manual" ? [disparo] : []))
}
```

In `tests/e2e/biblioteca-escena.ts` add `import { domingoDeSemana } from "@/lib/motor/semana"` and append:

```ts
export const TEORIA_PRINCIPAL = "Repartir la carga también es descansar"
export const TEORIA_DEBIL = "El descanso digital se aprende"
export const RAZON_DE_CRUCE = "No hay ideas de dos autores distintos."
export const OTRA_RAZON_DE_CRUCE = "Repite lo que el motor cruzó la semana pasada."
/** A single-author topic the engine named and that is gone since: listed without a link. */
export const TEMA_QUE_YA_NO_ESTA = "Sueño y pantallas"
export const MOTIVO_DE_FALLA = "No pude armar las ideas de esta semana. Avisamos al equipo; puedes volver a intentarlo."

export interface EscenaDeSemana extends EscenaDeAutoresYTemas {
  /** This week's closing Sunday, as the engine keys it. */
  semana: string
}

const MS_POR_SEMANA = 7 * 86_400_000

/**
 * Batch 5's scene on top of batch 3's: three earlier ready runs (US$ 0,20, 0,25 and 0,30, so the estimate reads US$ 0,25
 * without this week and US$ 0,23 with this week's US$ 0,21), and this week's run in the state asked. A ready week has two
 * theories, two discarded crossings and what to upload: Descanso digital (linked) and a topic that is gone, Psicología
 * en la mesa (LinkedIn) and a retired pillar that drops out. `estado: null` leaves no run at all (the fixed US$ 0,30).
 */
export async function sembrarSemana(opciones: {
  estado: "lista" | "corriendo" | "fallida" | null
  teorias?: boolean
}): Promise<EscenaDeSemana> {
  const base = await sembrarAutoresYTemas()
  const semana = domingoDeSemana(new Date())
  if (opciones.estado === null) return { ...base, semana }
  const domingo = Date.parse(`${semana}T12:00:00Z`)
  for (const [semanas, costo] of [
    [1, 0.2],
    [2, 0.25],
    [3, 0.3],
  ] as const) {
    const anterior = new Date(domingo - semanas * MS_POR_SEMANA).toISOString().slice(0, 10)
    await pool.query(
      "insert into public.motor_corridas (semana, estado, costo_usd, resumen, terminada_en) values ($1, 'lista', $2, '{}'::jsonb, now())",
      [anterior, costo],
    )
  }
  const lista = opciones.estado === "lista"
  const resumen = lista
    ? {
        ideas: 3,
        manual: false,
        queSubir: {
          unSoloAutor: [TEMA_DE_UN_AUTOR, TEMA_QUE_YA_NO_ESTA],
          pilaresSinMaterial: ["psicologia-en-la-mesa", "pareja"],
        },
      }
    : {}
  await pool.query(
    "insert into public.motor_corridas (semana, estado, costo_usd, resumen, motivo_fallo) values ($1, $2, $3, $4::jsonb, $5)",
    [
      semana,
      opciones.estado,
      lista ? 0.21 : 0,
      JSON.stringify(resumen),
      opciones.estado === "fallida" ? MOTIVO_DE_FALLA : null,
    ],
  )
  if (lista && opciones.teorias !== false) {
    const teorias: [string, string, string, number, string | null, string[], string | null][] = [
      ["guardada", TEORIA_PRINCIPAL, "Quien reparte la carga mental descansa mejor.", 0.82, "alto", [base.carga, base.pausas], null],
      ["guardada", TEORIA_DEBIL, "Apagar la pantalla es un hábito que se entrena.", 0.61, "debil", [base.deUnAutor, randomUUID()], null],
      ["descartada_por_motor", "Cruce uno", "", 0.3, null, [base.carga, base.deUnAutor], RAZON_DE_CRUCE],
      ["descartada_por_motor", "Cruce dos", "", 0.2, null, [base.pausas], OTRA_RAZON_DE_CRUCE],
    ]
    for (const [estado, titulo, tesis, puntaje, nivel, temas, motivo] of teorias) {
      await pool.query(
        `insert into public.teorias (titulo, tesis, origen, estado, semana, puntaje, nivel_evidencia, temas, motivo_fallo)
         values ($1, $2, 'motor', $3, $4::date, $5, $6, $7::uuid[], $8)`,
        [titulo, tesis, estado, semana, puntaje, nivel, temas, motivo],
      )
    }
  }
  return { ...base, semana }
}
```

Add `import { randomUUID } from "node:crypto"` at the top of `biblioteca-escena.ts`. `vaciarBiblioteca` (through `vaciarMotor`) already deletes every run and every `motor` theory, so the next scene and the teardown start clean.

- [ ] **Step 2: Write the tests**

```ts
// tests/e2e/biblioteca-semana.spec.ts
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import {
  abrirDesplegable,
  alerta,
  bloquearRedExterna,
  conLetraGrande,
  disparosDelMotor,
  entrarComo,
  limpiarDisparos,
  revisarConAxe,
  tocarHastaLlegar,
} from "./ayudas"
import {
  MOTIVO_DE_FALLA,
  OTRA_RAZON_DE_CRUCE,
  RAZON_DE_CRUCE,
  sembrarSemana,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
  TEMA_QUE_YA_NO_ESTA,
  TEORIA_DEBIL,
  TEORIA_PRINCIPAL,
} from "./biblioteca-escena"
import { CORREO_DEL_MANTENEDOR } from "./entorno"

const YA_PROPUSO = "El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes."
const PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."
const LO_CRUZADO = "Lo que el motor cruzó esta semana"

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  limpiarDisparos()
})

test("shows the run first, then what the engine crossed with its topics, the folded crossings and what to upload", async ({
  page,
}) => {
  const escena = await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  const corrida = page.getByRole("complementary", { name: "Corrida del motor" })
  await expect(corrida.getByText("Lista", { exact: true })).toBeVisible()
  await expect(corrida.getByText("3 ideas nuevas · Costó US$ 0,21")).toBeVisible()
  await expect(corrida.getByText("Cuesta cerca de US$ 0,23")).toBeVisible()

  const cruzado = page.getByRole("region", { name: LO_CRUZADO })
  await expect(cruzado.getByRole("heading", { level: 3 })).toHaveText([TEORIA_PRINCIPAL, TEORIA_DEBIL])
  await expect(cruzado.getByText("Respaldo: fuerte")).toBeVisible()
  await expect(cruzado.getByText("Respaldo: débil")).toBeVisible()
  await expect(cruzado.getByText("Puntaje: 0,82")).toBeHidden()
  const temas = cruzado.getByRole("list", { name: `Temas de «${TEORIA_PRINCIPAL}»` })
  await expect(temas.getByRole("link", { name: TEMA_PRINCIPAL })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.carga}`,
  )
  await expect(cruzado.getByRole("list", { name: `Temas de «${TEORIA_DEBIL}»` }).getByRole("link")).toHaveCount(1)

  await expect(page.getByText(RAZON_DE_CRUCE)).toBeHidden()
  await abrirDesplegable(page, "Cruces que no sirvieron (2)")
  await expect(page.getByText(RAZON_DE_CRUCE)).toBeVisible()
  await expect(page.getByText(OTRA_RAZON_DE_CRUCE)).toBeVisible()

  const subir = page.getByRole("region", { name: "Qué subir después" })
  await expect(subir.getByRole("link", { name: TEMA_DE_UN_AUTOR })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.deUnAutor}`,
  )
  await expect(subir.getByText(TEMA_QUE_YA_NO_ESTA)).toBeVisible()
  await expect(subir.getByRole("link", { name: TEMA_QUE_YA_NO_ESTA })).toHaveCount(0)
  await expect(subir.getByText("Psicología en la mesa · LinkedIn")).toBeVisible()
  await expect(subir.getByText(/Pareja/)).toHaveCount(0)

  // One column, in the phone's order.
  const [arriba, medio, abajo] = await Promise.all([corrida.boundingBox(), cruzado.boundingBox(), subir.boundingBox()])
  expect((arriba?.y ?? 0) < (medio?.y ?? 0) && (medio?.y ?? 0) < (abajo?.y ?? 0)).toBe(true)
  expect(await revisarConAxe(page, "semana con los cruces abiertos")).toEqual([])
})

test("Detalle para WAV opens on a theory with its score", async ({ page }) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  const teoria = page.getByRole("region", { name: LO_CRUZADO }).getByRole("listitem").filter({ hasText: TEORIA_PRINCIPAL })
  await abrirDesplegable(teoria, "Detalle para WAV")
  await expect(teoria.getByText("Puntaje: 0,82")).toBeVisible()
})

test("a theory's topic leads to the topic's page", async ({ page }) => {
  const escena = await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  await tocarHastaLlegar(
    page,
    page
      .getByRole("list", { name: `Temas de «${TEORIA_PRINCIPAL}»` })
      .getByRole("link", { name: TEMA_PRINCIPAL, exact: true }),
    new RegExp(`/biblioteca/temas/${escena.carga}$`),
  )
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
})

test("Proponer ahora on a ready week or a run still alive says the engine already proposed, and starts nothing", async ({
  page,
}) => {
  for (const estado of ["lista", "corriendo"] as const) {
    await sembrarSemana({ estado })
    await page.goto("/biblioteca/semana")
    await page.getByRole("button", { name: "Proponer ahora" }).click()
    await expect(alerta(page, YA_PROPUSO)).toBeVisible()
  }
  expect(disparosDelMotor()).toEqual([])
})

test("a failed week shows its reason and can be asked again: the note says the ideas are on their way", async ({
  page,
}) => {
  const escena = await sembrarSemana({ estado: "fallida" })
  await page.goto("/biblioteca/semana")
  await expect(page.getByText("Falló", { exact: true })).toBeVisible()
  await expect(page.getByText(MOTIVO_DE_FALLA)).toBeVisible()
  await expect(page.getByText("Cuesta cerca de US$ 0,25")).toBeVisible()
  await page.getByRole("button", { name: "Proponer ahora" }).click()
  await expect(page.getByRole("status").filter({ hasText: PEDIDO })).toBeVisible()
  expect(disparosDelMotor()).toEqual([
    { tarea: "motor-manual", semana: escena.semana, clave: `motor:${escena.semana}` },
  ])
  expect(await revisarConAxe(page, "semana fallida tras pedir de nuevo")).toEqual([])
})

test("a run stuck for more than half an hour can be asked again", async ({ page }) => {
  const escena = await sembrarSemana({ estado: "corriendo" })
  await pool.query("update public.motor_corridas set creada_en = now() - interval '31 minutes' where semana = $1", [
    escena.semana,
  ])
  await page.goto("/biblioteca/semana")
  await expect(page.getByText("Trabajando", { exact: true })).toBeVisible()
  await expect(page.getByText("El motor todavía está trabajando en esta semana.")).toBeVisible()
  await page.getByRole("button", { name: "Proponer ahora" }).click()
  await expect(page.getByRole("status").filter({ hasText: PEDIDO })).toBeVisible()
  expect(disparosDelMotor()).toHaveLength(1)
})

test("a run that crossed nothing reads in one line, and before any run one line says when the first comes", async ({
  page,
}) => {
  await sembrarSemana({ estado: "lista", teorias: false })
  await page.goto("/biblioteca/semana")
  await expect(page.getByText("Esta semana el motor no encontró cruces nuevos.")).toBeVisible()
  await expect(page.getByRole("heading", { name: LO_CRUZADO })).toHaveCount(0)
  await expect(page.getByText(/Cruces que no sirvieron/)).toHaveCount(0)

  await sembrarSemana({ estado: null })
  await page.goto("/biblioteca/semana")
  await expect(page.getByText("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00.")).toBeVisible()
  await expect(page.getByText("Cuesta cerca de US$ 0,30")).toBeVisible()
  await expect(page.getByRole("region", { name: "Qué subir después" })).toHaveCount(0)
})

test("the nav reaches Semana from Temas and marks it as the open section", async ({ page }) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/temas")
  const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
  await tocarHastaLlegar(page, nav.getByRole("link", { name: "Semana" }), /\/biblioteca\/semana(?:[?&]v=\d+)?$/)
  await expect(nav.getByRole("link", { name: "Semana" })).toHaveAttribute("aria-current", "page")
})

test("at 375 px with large text the tabs, the button and the theories fit, 44 px or more, nothing scrolls sideways (4n)", async ({
  page,
}) => {
  await sembrarSemana({ estado: "lista" })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/biblioteca/semana")
  await conLetraGrande(page)
  const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
  for (const nombre of ["Materiales", "Autores", "Temas", "Semana"]) {
    expect((await nav.getByRole("link", { name: nombre }).boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  const boton = page.getByRole("button", { name: "Proponer ahora" })
  await expect(boton).toBeVisible()
  expect((await boton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole("heading", { name: TEORIA_PRINCIPAL, level: 3 })).toBeVisible()
  const sinDesborde = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(sinDesborde).toBe(true)
  expect(await revisarConAxe(page, "semana con letra grande")).toEqual([])
})

test("only Coni: without a session it asks to sign in, and the maintainer is refused", async ({ browser }) => {
  await sembrarSemana({ estado: "lista" })
  const sinSesion = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const visitante = await sinSesion.newPage()
  await visitante.goto("/biblioteca/semana")
  await expect(visitante).toHaveURL(/\/ingreso$/)
  await sinSesion.close()

  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const wav = await contexto.newPage()
  await wav.goto("/biblioteca/semana")
  await expect(wav.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
  await expect(wav.getByText(TEORIA_PRINCIPAL)).toHaveCount(0)
  await contexto.close()
})
```

- [ ] **Step 3: Run them**

Run: `pnpm build && pnpm exec playwright test tests/e2e/biblioteca-semana.spec.ts`
Expected: PASS (10 tests). A failure here is a real bug in Lotes 1 or 2: fix it with a failing unit or integration test first, in its own commit.

- [ ] **Step 4: Run the other Biblioteca E2E by file** (the nav gained a tab)

Run: `pnpm exec playwright test tests/e2e/biblioteca-enlaces.spec.ts tests/e2e/biblioteca.spec.ts tests/e2e/biblioteca-autores.spec.ts tests/e2e/biblioteca-temas.spec.ts`
Expected: PASS. If a nav check fails only because there are now four tabs, fix that spec in this commit with the new fact (four tabs, still one row) and say so in the commit body.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-escena.ts tests/e2e/ayudas.ts tests/e2e/biblioteca-semana.spec.ts
git add tests/e2e/biblioteca-escena.ts tests/e2e/ayudas.ts tests/e2e/biblioteca-semana.spec.ts
git commit -m "Cover Semana on the phone end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: Semana on a computer, and the captures

**Files:**
- Create: `tests/e2e/biblioteca-semana.escritorio.ts`
- Modify: `tests/e2e/visual.spec.ts` (one test; `sembrarSemana` added to its `./biblioteca-escena` import)

- [ ] **Step 1: Write the tests**

```ts
// tests/e2e/biblioteca-semana.escritorio.ts
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, disparosDelMotor, limpiarDisparos, revisarConAxe } from "./ayudas"
import { sembrarSemana, TEORIA_PRINCIPAL } from "./biblioteca-escena"
import { cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Runs only in the `escritorio` project (1280 x 900).
const PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  limpiarDisparos()
})

test("the run, Proponer ahora and what to upload sit in a sticky right panel; what the engine crossed takes the rest", async ({
  page,
}) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  const panel = page.getByRole("complementary", { name: "Corrida del motor" })
  await expect(panel).toHaveCSS("position", "sticky")
  await expect(panel.getByRole("button", { name: "Proponer ahora" })).toBeVisible()
  await expect(panel.getByText("Cuesta cerca de US$ 0,23")).toBeVisible()
  await expect(panel.getByRole("region", { name: "Qué subir después" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Qué subir después" })).toHaveCount(1)

  const cruzado = page.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
  await expect(cruzado.getByRole("heading", { name: TEORIA_PRINCIPAL, level: 3 })).toBeVisible()
  const titulo = page.getByRole("heading", { name: "Biblioteca", level: 1 })
  const [izquierda, derecha, arriba] = await Promise.all([cajaDe(cruzado), cajaDe(panel), cajaDe(titulo)])
  expect(izquierda.right).toBeLessThanOrEqual(derecha.left)
  expect(izquierda.width).toBeGreaterThanOrEqual(600)
  expect(Math.abs(derecha.top - arriba.top)).toBeLessThanOrEqual(8)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "semana en el computador")).toEqual([])
})

test("a failed week is asked again from the panel", async ({ page }) => {
  const escena = await sembrarSemana({ estado: "fallida" })
  await page.goto("/biblioteca/semana")
  const panel = page.getByRole("complementary", { name: "Corrida del motor" })
  await panel.getByRole("button", { name: "Proponer ahora" }).click()
  await expect(panel.getByRole("status").filter({ hasText: PEDIDO })).toBeVisible()
  expect(disparosDelMotor()).toEqual([
    { tarea: "motor-manual", semana: escena.semana, clave: `motor:${escena.semana}` },
  ])
})

async function capturaDeEscritorio(page: Page, nombre: string): Promise<void> {
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, nombre), fullPage: true })
    return
  }
  // The week and the cost change with the calendar: masked, as the phone's visual spec does.
  await expect(page).toHaveScreenshot(nombre, { fullPage: true, mask: [page.locator('[data-snapshot="varia"]')] })
}

test("visual: Semana on a computer", async ({ page }) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  await expect(page.getByRole("region", { name: "Lo que el motor cruzó esta semana" })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-semana-escritorio.png")
})
```

In `tests/e2e/visual.spec.ts`, after the test "biblioteca: Autores and Temas on the phone, and an author's and a topic's page":

```ts
test("biblioteca: Semana on the phone", async ({ page }) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  await expect(page.getByRole("region", { name: "Lo que el motor cruzó esta semana" })).toBeVisible()
  await capturaDe(page, "biblioteca-semana")
})
```

- [ ] **Step 2: Run the functional tests**

Run: `pnpm exec playwright test --project escritorio tests/e2e/biblioteca-semana.escritorio.ts -g "panel"`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the captures, without writing baselines into the repo**

Run: `VISUAL_FINALES=/tmp/semana-capturas pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca" && VISUAL_FINALES=/tmp/semana-capturas pnpm exec playwright test --project escritorio tests/e2e/biblioteca-semana.escritorio.ts tests/e2e/biblioteca.escritorio.ts tests/e2e/biblioteca-autores-temas.escritorio.ts -g "visual"`
Expected: PASS; the captures land in `/tmp/semana-capturas` (the two new Semana ones and every Biblioteca screen with the fourth tab, D13). Do **not** run `--update-snapshots` and do not commit any `*-snapshots/*.png` here: Task 17 Step 3 does it after Federico looks. Without `VISUAL_FINALES`, the Semana visual tests fail with "A snapshot doesn't exist" and the other Biblioteca ones differ by the nav: that is expected until then.

- [ ] **Step 4: Commit**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-semana.escritorio.ts tests/e2e/visual.spec.ts
git add tests/e2e/biblioteca-semana.escritorio.ts tests/e2e/visual.spec.ts
git commit -m "Cover Semana on a computer and add its visual checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 3:** reviewer on Tasks 15 and 16 against the spec's "Testing / E2E" (ask now and see the note; «ya propuso» on a ready week; a failed week asks again; empty run in one line; crossings folded and opening; links to topics; axe and large text on both). Confirm no snapshot file is staged: `git diff origin/main --name-only -- '*.png'` prints nothing.

---

# Lote 4: gate and shipping

### Task 17: the full gate

**Files:** none new, except visual baselines if Federico approves them (Step 3).

- [ ] **Step 1: Every check**

Run: `pnpm lint && pnpm type && pnpm build && pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: all green except the visual baselines named in D13 (the new Semana ones missing, the other Biblioteca ones differing by the nav).

- [ ] **Step 2: Banned patterns and scope**

```bash
git diff origin/main -U0 -- app lib components tests | grep '^+' | grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|$(printf '\342\200\224')|text-\[[0-9]|catch \{\s*\}|redirect\("
git diff origin/main --stat -- supabase lib/supabase/database.types.ts trigger lib/motor components/nav-inferior.tsx app/ir-a-biblioteca
grep -rn "$(printf '\342\200\224')" docs/superpowers/plans/2026-11-06-biblioteca-semana.md docs/superpowers/specs/2026-11-06-biblioteca-semana-design.md
pnpm db:types && git diff --stat -- lib/supabase/database.types.ts
```

Expected: the first prints nothing (it looks only at the lines this batch added); the second prints nothing (no migration, no types, no Trigger, no engine, no main nav); the third prints nothing; the fourth prints nothing (the types did not change).

- [ ] **Step 3: Baselines, only after Federico looks.** Show Federico the captures from Task 16 Step 3 (`/tmp/semana-capturas`: Semana on the phone and on a computer, and every Biblioteca screen with the fourth tab). **Stop here until he answers.** Only on his OK: `pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca" --update-snapshots && pnpm exec playwright test --project escritorio tests/e2e/biblioteca-semana.escritorio.ts tests/e2e/biblioteca.escritorio.ts tests/e2e/biblioteca-autores-temas.escritorio.ts tests/e2e/biblioteca-borradores.escritorio.ts tests/e2e/biblioteca-subir.escritorio.ts -g "visual" --update-snapshots`, check with `git status` that only `biblioteca*` PNGs changed or appeared, and commit them in one commit of their own, staging each file by name: "Take the Semana baselines and retake the Biblioteca ones with its tab". If he asks for changes, they go first (failing test first), and the captures are taken again.

- [ ] **Step 4: Review the whole branch** with `superpowers:requesting-code-review`. Fix findings with a failing test first, one commit per fix, and rerun Step 1.

### Task 18: release (controller; not executed by implementer subagents)

Federico's standing authorization (memory "Salida a producción autorizada") covers these steps when its conditions hold (issue, green CI, reviews). There is no migration (`supabase db push` is not run) and no Trigger deploy: Semana starts the `motor-manual` task already deployed.

1. **Issue and board.** Work on #17 (board WAV-WaAreVision/projects/1, status kept up to date). Push `feat/biblioteca-semana` and open the PR: title "Biblioteca: Semana (batch 5)", body with the summary, the deviations D1 to D13 and "Part of #17." (never "Closes"), ending with the PR attribution line.
2. **CI green, review approved** (Task 17 Step 4 plus the PR review). Watch CI in the background and act as soon as it finishes.
3. **Merge** the PR (Vercel publishes `main`). Wait for the production deployment to be ready.
4. **Live checks.** Without a session `https://conidolly.vercel.app/biblioteca/semana` redirects to sign in (curl the status and `Location`). With Coni's account (Federico), by address: the page shows the latest run and «Proponer ahora» with «Cuesta cerca de US$ ...»; the Biblioteca's nav has «Semana». Do **not** tap «Proponer ahora» in production as a check: it spends. Ingesta's Semana still loads (https://conidolly-ingesta.vercel.app/semana). Still reachable only by address until batch 7.
5. **Board:** comment on #17 with the release date of batch 5, the PR and the live checks; #17 stays open (batches 6 and 7).

---

## Self-review against the spec

| Spec section | Where |
|---|---|
| What it is: latest run (week, state, ideas, cost), theories with topics, discarded crossings and why, what to upload; «Proponer ahora» for this week | Tasks 3, 5, 10 to 12, 15 |
| Decision 1: `/biblioteca/semana`, «Semana» after Temas in `NavDeBiblioteca`, only by address, only Coni (`exigirConi`, `conSesionDeConi`) | Tasks 7, 8, 13, 15 (nav, only Coni) |
| Decision 2: no migration, no Trigger change, no Ingesta PR; reads `motor_corridas`, `teorias`, `temas`, the pillar catalog; triggers `motor-manual` keyed `motor:<semana>` | Tasks 4 to 7 (F2); Task 17 Step 2; Task 18 |
| Decision 3: the week key is `domingoDeSemana(ahora)` | Task 6; Task 15 (key in the runs file) |
| Decision 4: refuse a `lista` week or a `corriendo` one under 30 min with her words; `fallida` or stale can ask; trigger failure; success note and redraw | Tasks 2, 6, 9; Task 15 (D4) |
| Decision 5: «Cuesta cerca de US$ 0,25», median of the latest 4 with cost, fixed US$ 0,30 without; pure `estimarCostoDelMotor`; no hard-limit check | Tasks 1, 4, 9, 13; Tasks 15, 16 (D5) |
| Decision 6: «Lo que el motor cruzó esta semana»; score folded in «Detalle para WAV»; «Respaldo: fuerte / medio / débil»; «Cruces que no sirvieron (N)» folded with topics and reason; state icon plus word, «A pedido» | Tasks 3, 10, 11; Task 15 (D8, D11) |
| Decision 7: empty run in one line, no empty sections; before any run; a failed run shows its reason | Tasks 3, 11, 12; Task 15 (D2) |
| Decision 8: single-author topics linked when they still exist, kept otherwise; pillars with their network from the catalog, retired dropped; nothing missing line | Tasks 3, 5, 10; Task 15 (D6) |
| Decision 9: theory topics link to `/biblioteca/temas/<id>`; a missing topic drops out | Tasks 5, 11; Task 15 (D7) |
| Decision 10: phone one column, run and button on top; desktop `md:grid-cols-[minmax(0,1fr)_20rem]` with a sticky right panel (run, button with cost, what to upload) | Task 12; Task 16 (D1) |
| Code: reader `leerSemana`, `leerCostosDelMotor`; domain `estimarCostoDelMotor`, labels, `puedePedirMotor`; action `proponerAhora` through `conSesionDeConi` and its wrapper; screens with `useAccion`, `useRedibujar`, never `redirect()`; `loading.tsx` (error and not found from the Biblioteca) | Tasks 1 to 13 |
| Testing, units: cost (4, fewer, none, zeros), `puedePedirMotor` (lista, corriendo fresh and stale, fallida, none), labels, the view (one-line empty, folded crossings with count, Detalle para WAV folded, pillar with network, state icon plus word) | Tasks 1 to 3, 9 to 13 |
| Testing, integration: latest run only, theory states, missing topics dropped, retired pillars dropped; `proponerAhora` refuses a non-Coni session and triggers `motor:<domingo>` once | Tasks 4 to 6 |
| Testing, E2E phone and desktop: ask now and see the note; «ya propuso» on a ready week; a failed week asks again; empty run in one line; crossings folded and opening; links to topics; axe and large text; visual baselines after Federico sees the captures | Tasks 15 to 17 (Task 17 Step 3 is the stop) |
| The budget screen's «Proponer ahora» line (requested with the plan) | Task 14 (D12) |
| Out of scope: Ingesta changes, the engine, the hard limit on manual runs, «Para leer después», the tab switch | Not planned |

Names across tasks: `RUTA_DE_SEMANA`, `COSTO_SIN_HISTORIA_USD`, `estimarCostoDelMotor`, `textoDeCosto` (Task 1) are what Tasks 7, 8, 9, 13 import; `YA_PROPUSO`, `NO_ARRANCO`, `MOTOR_PEDIDO`, `puedePedirMotor`, `CorridaDeEstaSemana` (Task 2) are what Tasks 6 and 9 use; `TemaDeTeoria`, `CorridaLeida`, `TeoriaEscrita`, `CruceDescartado`, `TemaParaSubir`, `PilarParaSubir`, `QueSubirLeido`, `SemanaLeida`, `SIN_CORRIDA`, `TITULO_DE_LO_CRUZADO`, `SIN_CRUCES`, `SIN_CORRIDAS`, `TRABAJANDO`, `MOTOR_NO_TERMINO`, `NADA_QUE_SUBIR`, `A_PEDIDO`, `crucesQueNoSirvieron`, `presentarCorrida`, `respaldoDeTeoria`, `lineasDeTeoriaParaWav`, `tituloDeSemana`, `resumenDeCorrida`, `temasParaSubir`, `pilaresParaSubir`, `etiquetaDePilarParaSubir`, `nadaQueSubir` (Task 3) are what Tasks 5, 10, 11, 12 use; `leerCostosDelMotor` (Task 4) and `leerSemana` (Task 5) are what Task 13 calls and mocks; `DepsSemana`, `proponerAhora` (Task 6) are what Task 7 wraps as `proponerAhoraAccion`, which Task 9 calls and Tasks 10 to 13 mock; `BotonProponerAhora { costoUsd }` (Task 9) is what Task 12 draws; `CorridaDeLaSemana`, `QueSubir`, `EnlacesDeTemas` (Task 10), `LoQueCruzo` (Task 11) and `VistaDeSemana { encabezado, semana, costoUsd }` (Task 12) are what Task 13 renders; `sembrarSemana`, `EscenaDeSemana`, `TEORIA_PRINCIPAL`, `TEORIA_DEBIL`, `RAZON_DE_CRUCE`, `OTRA_RAZON_DE_CRUCE`, `TEMA_QUE_YA_NO_ESTA`, `MOTIVO_DE_FALLA` and `disparosDelMotor` (Task 15) are what Tasks 15 and 16 import.
