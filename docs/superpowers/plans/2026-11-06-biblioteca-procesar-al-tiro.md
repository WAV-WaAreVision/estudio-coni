# Biblioteca batch 6: process at once and say the cost (4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `procesar-material` never stops to ask for the cost: it writes every material's estimate right after the extraction and goes on, and the Biblioteca says «Lo estoy procesando. Costará cerca de US$ 0,40.» on the material page and in the desktop side panel, with no «Espera tu OK» state and no «Procesar por ~US$ X» button left.

**Architecture:** No migration, no Ingesta PR. In the task code (`lib/ingesta/procesar.ts`) the gate `esperaConfirmacion`, its result `esperando_confirmacion` and `UMBRAL_CONFIRMACION_USD` go, and a new step `anotarEstimado` writes `costo_estimado_usd = estimarCostoRestante(partes, rol)` without a reason and without freeing the claim. The domain (`lib/dominio/biblioteca/estado.ts`) gains `avisoDeProceso` (built from `AVISO_TRAS_SUBIR` and `dolares`) and loses the waiting state; the screens draw the notice as a quiet `LineaDeEstado`; `BotonConfirmarCosto`, `confirmarCostoAccion` and `confirmarCosto` are deleted; the list's `trabajando` count stops excluding materials with an estimate. Conidolly stops reading `costo_confirmado_en`; the column, the `confirmar_costo_material` RPC and the reset inside `reprocesar_material` stay for Ingesta.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript strict, Supabase Postgres, `@supabase/supabase-js`, Zod 4, Trigger.dev v4, Vitest 4 (jsdom unit, node integration against the local Supabase), Playwright + `@axe-core/playwright`, Biome (safe mode only), Tailwind v4 semantic tokens.

**Spec:** `docs/superpowers/specs/2026-11-06-biblioteca-procesar-al-tiro-design.md` (issue WAV-WaAreVision/estudio-coni#17, pedido 29b, batch 6 of 7). Plans whose style and helpers this one reuses: `docs/superpowers/plans/2026-11-06-biblioteca-semana.md`, `docs/superpowers/plans/2026-11-06-biblioteca-borrar-con-deshacer.md`.

---

## Where to work

- Conidolly worktree: `/Users/fede/Projects/estudio-coni/.worktrees/procesar-al-tiro`, branch `feat/biblioteca-procesar-al-tiro` (from `main` at `b577ada8`; holds the spec and this plan). Below, **`CONIDOLLY`** is that path; every command runs from it.

  ```bash
  cd /Users/fede/Projects/estudio-coni/.worktrees/procesar-al-tiro && pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it (.env* is ignored)
  ```

- Local Supabase of estudio-coni (`pnpm db:start` once): API `127.0.0.1:54421`, database `54422`. No migration in this batch: `pnpm db:types` must not change `lib/supabase/database.types.ts`.
- Ingesta (`/Users/fede/Projects/conidolly-ingesta`) is not touched. It keeps its own «Procesar por» button, which never shows once no material waits.
- Read `CONIDOLLY/CLAUDE.md` before the first task.

## Rules for every task

- **TDD strict:** write the failing test, run it and see it fail for the reason written in the step, write the minimum code, run it green. One task is one commit.
- Commit messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by name (never `git add -A`; a deleted file is staged with `git rm`). Before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes only, **never `--unsafe`**), then `head -1` every client file the task touched: it must still be `"use client"`.
- No `any`, no `as any`, no `@ts-expect-error`, no non-null `!`, no silent `catch`. No hex colour outside `app/globals.css`. No `text-[...]` sizes (`tests/unit/diseno-reglas.test.ts` walks every file of `app/` and `components/`).
- The words «Puntaje» and «Evidencia» never appear in a string or JSX text under `app/(app)/biblioteca` (`tests/unit/biblioteca-palabras.test.ts`).
- Copy for Coni in Spanish of Chile, tú, quotes as «», **no em dash anywhere** (code, copy, comments, this plan's outputs).
- Code identifiers in Spanish like the codebase; comments in English, sparse, only for "why".
- **Never `redirect()`** in new code. No new action in this batch.
- From Lote 2 on, run `pnpm test:run` (all unit tests) and `pnpm type` before each commit: removing exports breaks importers at compile time, and tests are type-checked (`tsconfig.json` includes `**/*.ts`).

## Facts fixed before planning

Checked on 2026-11-06 at `9b46a6d3` (spec commit on top of `main` `b577ada8`).

- **F1. The gate in the task** (`lib/ingesta/procesar.ts`): `ResultadoProcesar` (:78) has `{ resultado: "esperando_confirmacion" }`; `UMBRAL_CONFIRMACION_USD = 1` (:90); `estimarCostoRestante(partes, rol)` (:573) is the card for `estrategia` and `estimarAfirmaciones` otherwise; `formatoUsd` (:579) is used only by the gate's reason; `esperaConfirmacion(ctx, original)` (:585) returns false when `costo_confirmado_en` is set or the estimate is at most US$ 1, otherwise writes `costo_estimado_usd`, the reason «Este material es largo: procesarlo cuesta cerca de US$ X. Confírmalo para seguir.» and `LIBRE`, and stops. `procesar(ctx)` (:604): `extraccionDe` (limit there goes to `detenidoPorLimite`), then the gate, then `guardarTexto` of the original text, `idioma_original`, then `fichaDe` or `afirmacionesDe`; a limit after that also goes to `detenidoPorLimite` (:624, writes `TEXTO_LIMITE` and `LIBRE`, tells Coni once a month). The extraction is stored as `materiales/<id>/partes-original.json` (`{ idioma?, titulo, partes }`). `actualizarMaterial(db, id, cambios)` (:159) is the plain update helper. `trigger/procesar-material.ts` only calls `procesarMaterial(...)` and returns its result: no change there, but its deploy carries the new code.
- **F2. The gate in the database** (not changed, spec decision 5): `confirmar_costo_material` (`20261003000170_confirmar_costo.sql`) sets `costo_confirmado_en` and clears the reason; pinned by `tests/integration/confirmar-costo.test.ts`, which stays (Ingesta still calls it). `reintentar_material` (`20261003000130`) accepts any `procesando` row with a non-null reason and never touched the cost columns. `reprocesar_material` (latest in `20261003000347_recalcular_tema.sql:63`) sets `costo_estimado_usd = null, costo_confirmado_en = null`; pinned by `tests/integration/reprocesar.test.ts:64-84`. Conidolly's TypeScript resets nothing itself: `moverYProcesar` (`lib/acciones/biblioteca.ts:115`) only calls the RPC and starts the run.
- **F3. The gate in Conidolly's domain:** `lib/dominio/biblioteca/estado.ts`: `EstadoDeProceso` has `costo_confirmado_en`; `esperaConfirmacion` (:19); `sePuedeReintentar` refuses a waiting one (:27); `IconoDeEstado` includes `"mano"` (:37), used only by `presentarEstado`'s «Espera tu OK» (:46) and by `ICONOS` in `app/(app)/biblioteca/estado-de-material.tsx:6` (`HandPalm`). `lib/dominio/biblioteca/detalle.ts:26-29` writes «Costo estimado: US$ 1,20 (sin confirmar | confirmado)».
- **F4. The gate in data and actions:** `lib/datos/biblioteca.ts`: `MaterialDeLista.costo_confirmado_en` (:49) and `COLUMNAS` (:54); `contarPorEstado` (:119) counts `trabajando` with `.or("costo_estimado_usd.is.null,costo_confirmado_en.not.is.null")` (:131), so once every material gets an estimate the list would stop asking again while it works. `lib/acciones/biblioteca.ts`: `RpcDeMaterial` includes `"confirmar_costo_material"` (:112); `confirmarCosto` (:146-152). `lib/acciones/disparos.ts:64` mentions «"Procesar por ~US$ X"» in a comment. `app/(app)/biblioteca/acciones.ts`: imports `confirmarCosto` (:14), `confirmarCostoAccion` (:87-93).
- **F5. Screens:** `BotonConfirmarCosto` (`app/(app)/biblioteca/boton-confirmar-costo.tsx`) is drawn by `tarjeta-de-material.tsx:30-32`, `panel-de-material.tsx:73-75` and `materiales/[id]/page.tsx:40-42` (inside `arrancar`, which the page draws twice: phone header and desktop aside). The page header is `h1`, the meta line, `<div><EstadoDeMaterial /></div>`, then `arrancar` (phone only). The panel is a `section` named by its `h2#panel-titulo`. The table (`tabla-de-materiales.tsx`) draws only `EstadoDeMaterial`.
- **F6. The notice pieces to reuse:** `AVISO_TRAS_SUBIR = "Lo estoy procesando."` (`lib/dominio/biblioteca/borrador-de-subida.ts:16`, drawn by `app/(app)/biblioteca/page.tsx:77` as `<LineaDeEstado tipo="neutro" titulo={AVISO_TRAS_SUBIR} />` after an upload). `dolares(n)` (`lib/formato.ts:8`) writes «US$ 0,40» (es-CL, two decimals) and is already imported by `lib/dominio/saldos.ts` and `lib/dominio/biblioteca/semana.ts`. `LineaDeEstado tipo="neutro"` (`components/ui/linea-de-estado.tsx`) is an `<output>` (role `status`) with the Info icon.
- **F7. Tests that pin the gate today** (each is rewritten to pin the new behavior, or deleted only where the thing it pinned no longer exists):
  - integration: `tests/integration/procesar-confirmacion.test.ts` (4 tests), `procesar-afirmaciones.test.ts:292-321` («compuerta de costo»), `reprocesar.test.ts:242-257` («asks for the cost confirmation again»), `acciones-biblioteca.test.ts:5,65,132-163,241-262` (`confirmarCosto`, the WAV test's `caro`), `acciones-borrado-diferido.test.ts:7,133-144`, `datos-biblioteca.test.ts:111-145` (`trabajando`);
  - unit: `tests/unit/estimar-costo-restante.test.ts:6,31-33` (`UMBRAL_CONFIRMACION_USD`), `biblioteca-estado.test.ts`, `biblioteca-piezas.test.tsx:7,125`, `biblioteca-botones.test.tsx` (`BotonConfirmarCosto`), `biblioteca-acciones-servidor.test.ts:32,76`, `biblioteca-tarjeta.test.tsx:58-63`, `biblioteca-palabras.test.ts:79-107`, `pildora-y-pestana-con-icono.test.tsx:18-27` (uses «Espera tu OK» as a sample label); fixtures with `costo_confirmado_en: null` in `biblioteca-tabla`, `biblioteca-tarjeta`, `biblioteca-panel`, `biblioteca-pagina-detalle`; mocks with `confirmarCostoAccion` in `biblioteca-tarjeta`, `biblioteca-panel`, `biblioteca-pagina-detalle`, `biblioteca-pagina-materiales`;
  - E2E: `tests/e2e/biblioteca-escena.ts:55,183-191,217` seeds `esperaOk` («Charla larga sobre el síndrome del impostor», by Daniela, `procesando`, `costo 1.2`, no reason); `tests/e2e/biblioteca.spec.ts:51` («Espera tu OK» on its card) and `:121-128` («Procesar por ~US$ 1,20» starts a run); `tests/e2e/biblioteca-borrar.spec.ts:59,124,147,155,157` use `escena.esperaOk` only as a material to delete. `tests/e2e-biblioteca/` does not mention it.
  - visual baselines showing that card or row: phone `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png` (test "biblioteca: the phone list and a material's detail", `visual.spec.ts:687`) and desktop `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png` (test "visual: the table with the side panel open", `biblioteca.escritorio.ts:181`, the panel of `escena.listo` beside the table). No author, topic or detail screen draws a material's state.
- **F8. Hard limit and marked material in the task, already covered:** `tests/integration/procesar-material.test.ts:319-372` (limit stops with `TEXTO_LIMITE`, calls no provider, tells Coni) and `:523-620` («material borrado»). They keep passing unchanged and are part of Lote 1's run.
- **F9. Test styles to mirror:** the task with `procesar-comun.ts` (`crearMaterial`, `deps`, `simularClaude`, `almacenEnMemoria`, `texto`, `gastos`, `material`, `limpiar`; default role `referente`); actions against the local database with `clienteDeConi()` / `clienteDelMantenedor()` and `sembrarMaterial({ estado, motivo, costo })` (`tests/integration/siembra-biblioteca.ts`); server wrappers with `conSesionDeConi` mocked; client components with the actions module and `next/navigation` mocked; pages in node by walking their element tree (`tests/unit/biblioteca-pagina-detalle.test.tsx`, `textos()` collects `children` and `titulo` strings); E2E with `sembrarBiblioteca()`, `bloquearRedExterna`, `limpiarDisparos`, `disparosDeMateriales`, `revisarConAxe` (`tests/e2e/ayudas.ts`). Playwright: one worker; project `app` is the phone (390 x 844) and runs `*.spec.ts`; `escritorio` (1280 x 900) runs `*.escritorio.ts`.
- **F10. Commands:** unit `pnpm exec vitest run <file>`, all unit `pnpm test:run`, integration `pnpm test:db <file>`, E2E phone `pnpm exec playwright test <file>`, desktop `pnpm exec playwright test --project escritorio <file>`, gate `pnpm lint`, `pnpm type`, `pnpm build`, `pnpm test:run`, `pnpm test:db`, `pnpm test:e2e`. Trigger deploy: `TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check` (after `pnpm install`); production is at `20261106.1` (`docs/TRASPASO.md:19`).

## Decisions taken while planning (spec ambiguities resolved)

- **D1. The reset inside `reprocesar_material` stays.** Spec decision 6 says "any reset of it they do today is removed", but the only reset is SQL (F2) and decision 5 forbids a migration. Conidolly's code resets nothing and stops reading the column. The SQL keeps clearing `costo_estimado_usd` on reprocess, which is what the notice wants: «Lo estoy procesando.» until the new run writes its new estimate. `tests/integration/reprocesar.test.ts:64-84` and `confirmar-costo.test.ts` stay as they are.
- **D2. `trabajando` is every processing material without a reason.** With an estimate written on every material, the old filter (estimate null or confirmed) would stop the list asking again while it works. The new filter is `estado = 'procesando' and motivo_fallo is null` (and not marked).
- **D3. Where the notice is drawn.** `avisoDeProceso(material)` in `lib/dominio/biblioteca/estado.ts` returns null unless `estaProcesando` (processing without a reason); then `AVISO_TRAS_SUBIR`, plus « Costará cerca de US$ X.» when there is an estimate. The material page draws it once, in the header under the state pill (that column shows on both widths), and the side panel under its title, both as `<LineaDeEstado tipo="neutro" titulo={aviso} />`. The card and the table keep only the state, as the spec says.
- **D4. The estimate is written on every run, right after the extraction**, in its own update before the original text and the language are saved, for every role, also on a retry or a rerun (it overwrites with the same or a fresher value).
- **D5. Conidolly forgets `costo_confirmado_en`.** It leaves `EstadoDeProceso`, `MaterialParaWav`, `MaterialDeLista` and `COLUMNAS`; the column stays in the schema and in the generated types.
- **D6. A row the old gate left waiting** (reason «Este material es largo... Confírmalo para seguir.», never confirmed) now reads «En pausa» with «Reintentar», and Reintentar runs it to the end. There are 0 in production (spec); an integration test pins that Reintentar picks one up.
- **D7. The E2E scene keeps the same five materials.** `esperaOk` becomes `conEstimado`: same title, author, `procesando`, `costo 1.2`, no reason. It now reads «Procesando» and its page and panel say «Lo estoy procesando. Costará cerca de US$ 1,20.»; «Procesando · 2» and every count stay.
- **D8. The `UMBRAL_CONFIRMACION_USD` unit test is deleted**, not rewritten: the constant is gone and the new behavior (no stop at any size) is pinned by the integration tests of Task 1.
- **D9. File rename:** `tests/integration/procesar-confirmacion.test.ts` becomes `tests/integration/procesar-estimado.test.ts` (`git mv`), rewritten as "a long material runs to listo and writes its estimate".
- **D10. Baselines:** only the phone list and the desktop table move (F7). Task 13 captures every Biblioteca screen anyway, to show that nothing else moved. Nothing is written to the repo until Federico sees them (Task 14).
- **D11. The window between the Trigger deploy and the merge** (spec Shipping, Trigger first). The old app's `esperaConfirmacion` sees "estimate and no confirmation" on **every** material once the new task wrote its estimate, so for those minutes a working material shows «Espera tu OK» and «Procesar por ~US$ X», and the list stops asking again (old `trabajando`). A tap is harmless: `confirmar_costo_material` clears nothing that matters and the second run finds the claim held (`en_curso`), or the material is already `listo` and the RPC answers 22023. So the merge follows the deploy at once (Task 16).
- **D12. Trigger is deployed from the PR head, not from `main`** (the task code lives in this repo and the spec forbids merging first): only after the branch contains `origin/main`, CI is green on that exact head and Federico said OK; then the merge. If the merge cannot follow, Trigger is redeployed from a clean `main` checkout (Task 16).
- **D13. The Trigger version goes into `docs/TRASPASO.md` in a follow-up PR**, as `fea0386c` (#86) did for `20261106.1`.

## File structure

Paths from `CONIDOLLY`.

| File | Change |
|---|---|
| `lib/ingesta/procesar.ts` | gate out, `anotarEstimado` in |
| `lib/dominio/biblioteca/estado.ts` | `avisoDeProceso` in; `esperaConfirmacion`, «Espera tu OK», `"mano"`, `costo_confirmado_en` out |
| `lib/dominio/biblioteca/detalle.ts` | «Costo estimado: US$ X» without «(confirmado / sin confirmar)» |
| `lib/datos/biblioteca.ts` | `trabajando` filter; `costo_confirmado_en` out of `COLUMNAS` and `MaterialDeLista` |
| `lib/acciones/biblioteca.ts`, `lib/acciones/disparos.ts` | `confirmarCosto` out; comment |
| `app/(app)/biblioteca/acciones.ts` | `confirmarCostoAccion` out |
| `app/(app)/biblioteca/boton-confirmar-costo.tsx` | deleted |
| `app/(app)/biblioteca/materiales/[id]/page.tsx`, `panel-de-material.tsx` | notice in, button out |
| `app/(app)/biblioteca/tarjeta-de-material.tsx` | button out |
| `app/(app)/biblioteca/estado-de-material.tsx` | `mano` icon out |
| `tests/integration/procesar-estimado.test.ts` | renamed from `procesar-confirmacion.test.ts`, rewritten |
| `tests/integration/procesar-afirmaciones.test.ts`, `reprocesar.test.ts`, `acciones-biblioteca.test.ts`, `acciones-borrado-diferido.test.ts`, `datos-biblioteca.test.ts` | rewritten where F7 says |
| `tests/unit/estimar-costo-restante.test.ts`, `biblioteca-estado.test.ts`, `biblioteca-piezas.test.tsx`, `pildora-y-pestana-con-icono.test.tsx`, `biblioteca-botones.test.tsx`, `biblioteca-acciones-servidor.test.ts`, `biblioteca-tarjeta.test.tsx`, `biblioteca-panel.test.tsx`, `biblioteca-pagina-detalle.test.tsx`, `biblioteca-pagina-materiales.test.tsx`, `biblioteca-tabla.test.tsx`, `biblioteca-palabras.test.ts` | rewritten where F7 says |
| `tests/e2e/biblioteca-escena.ts`, `biblioteca.spec.ts`, `biblioteca-borrar.spec.ts`, `biblioteca.escritorio.ts` | scene and E2E |
| `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png`, `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png` | retaken only after Federico's OK |
| `docs/TRASPASO.md` | Trigger version, in a follow-up PR after the release |

Not touched: `supabase/migrations/*`, `lib/supabase/database.types.ts`, `trigger/*.ts`, `lib/ingesta/afirmar.ts`, `tests/integration/confirmar-costo.test.ts`, the SQL part of `tests/integration/reprocesar.test.ts`, Ingesta.

## Lotes

| Lote | Tasks | Theme | Reviewer checkpoint |
|---|---|---|---|
| 1 | 1 | the task: no gate, the estimate for every material (Trigger code) | after Task 1 |
| 2 | 2 to 11 | domain, screens, actions, reader, word guard | after Task 11 |
| 3 | 12 to 13 | E2E phone and desktop, captures | after Task 13 |
| 4 | 14 to 16 | **stop for baselines**, full gate, release | Federico |

At each checkpoint: run the lote's tests plus `pnpm test:run` and `pnpm type`, then dispatch `superpowers:code-reviewer` on the lote's commits (`git log --oneline <first>^..HEAD`) with the spec and this plan; fix findings with a failing test first, one commit per fix, before the next lote.

---

# Lote 1: the task

### Task 1: a long material runs to the end and every material gets its estimate

**Files:**
- Rename and rewrite: `tests/integration/procesar-confirmacion.test.ts` to `tests/integration/procesar-estimado.test.ts`
- Modify: `tests/integration/procesar-afirmaciones.test.ts:292-321`
- Modify: `tests/integration/reprocesar.test.ts:242-257`
- Modify: `tests/unit/estimar-costo-restante.test.ts`
- Modify: `lib/ingesta/procesar.ts`

- [ ] **Step 1: Rename the test file**

```bash
git mv tests/integration/procesar-confirmacion.test.ts tests/integration/procesar-estimado.test.ts
```

- [ ] **Step 2: Write the failing tests**

Replace the whole content of `tests/integration/procesar-estimado.test.ts`:

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { buscarFfmpegBasico } from "@/lib/ingesta/fotogramas"
import { estimarCostoRestante, procesarMaterial } from "@/lib/ingesta/procesar"
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { pool } from "./db"
import {
  almacenEnMemoria,
  conFfmpeg,
  crearMaterial,
  deps,
  gastos,
  limpiar,
  material,
  simularClaude,
  simularScribe,
  TEXTO_CHILENO,
  texto,
} from "./procesar-comun"

afterEach(limpiar)
afterAll(() => pool.end())

const FFMPEG = await buscarFfmpegBasico()
// About 41 chunks: one claim request each, more than the one dollar the old gate stopped at.
const PARRAFO = "Hablar de lo que cada persona necesita ayuda a la pareja. ".repeat(88)
const TEXTO_LARGO = `${PARRAFO}\n\n`.repeat(98)

async function estado(id: string) {
  const { rows } = await pool.query<{
    estado: string
    motivo_fallo: string | null
    costo_estimado_usd: string | null
    corrida_id: string | null
  }>("select estado, motivo_fallo, costo_estimado_usd, corrida_id from public.materiales where id = $1", [id])
  const fila = rows[0]
  if (!fila) throw new Error("sin fila")
  return fila
}

/** What the steps after the extraction cost, from the extraction the task stored. */
function estimadoDe(almacen: ReturnType<typeof almacenEnMemoria>, id: string, rol = "referente"): number {
  const partes = JSON.parse(texto(almacen, id, "partes-original.json") ?? "null").partes
  return estimarCostoRestante(partes, rol)
}

describe("el costo estimado, sin compuerta", () => {
  it("runs a long material to listo without a stop, with its estimate written and no reason", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_LARGO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    const fila = await estado(id)
    expect(fila).toMatchObject({ estado: "listo", motivo_fallo: null, corrida_id: null })
    const costo = Number(fila.costo_estimado_usd)
    expect(costo).toBeGreaterThan(1)
    expect(costo).toBeCloseTo(estimadoDe(almacen, id), 6)
    expect(claude.afirmaciones.length).toBeGreaterThan(0)
    expect((await gastos(id)).length).toBeGreaterThan(0)
  })

  it("writes the estimate of a small material too", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    const costo = Number((await estado(id)).costo_estimado_usd)
    expect(costo).toBeGreaterThan(0)
    expect(costo).toBeLessThan(1)
    expect(costo).toBeCloseTo(estimadoDe(almacen, id), 6)
  })

  it("writes the card's estimate for a strategy material", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO, rol: "estrategia" })

    expect(await procesarMaterial(await deps(almacen), id)).toEqual({ resultado: "listo" })
    expect(Number((await estado(id)).costo_estimado_usd)).toBeCloseTo(estimadoDe(almacen, id, "estrategia"), 6)
  })

  it("still stops a long material at the hard limit, with its reason and its estimate, calling no provider", async () => {
    await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_LARGO })
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.0001")
    try {
      const resultado = await procesarMaterial(await deps(almacen), id)

      expect(resultado).toEqual({ resultado: "limite" })
      const fila = await estado(id)
      expect(fila).toMatchObject({ estado: "procesando", motivo_fallo: TEXTO_LIMITE, corrida_id: null })
      expect(Number(fila.costo_estimado_usd)).toBeGreaterThan(1)
      expect(claude.total).toBe(0)
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })

  it.skipIf(!FFMPEG)("pays the transcription once and goes on to the claims in the same run", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const palabras: [string, number][] = Array.from({ length: 50_000 }, (_, i) => ["ordenador", i * 0.1])
    const scribe = simularScribe("spa", palabras)
    const audio = await conFfmpeg(
      FFMPEG ?? "ffmpeg",
      ["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "libmp3lame"],
      "salida.mp3",
    )
    const id = await crearMaterial(almacen, {
      tipo: "audio",
      archivo: { extension: "mp3", tipo: "audio/mpeg", datos: audio },
    })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(scribe.n).toBe(1)
    expect((await gastos(id)).filter((g) => g.paso === "transcripcion")).toHaveLength(1)
    expect(claude.afirmaciones.length).toBeGreaterThan(0)
    expect(Number((await estado(id)).costo_estimado_usd)).toBeGreaterThan(1)
    expect((await material(id)).estado).toBe("listo")
  })
})
```

In `tests/integration/procesar-afirmaciones.test.ts`, replace the whole `describe("compuerta de costo", ...)` block (lines 292-321) with:

```ts
describe("sin compuerta de costo", () => {
  it("asks for the claims of every chunk of a 490,000-character text, without a stop", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: `${PARRAFO}\n\n`.repeat(98) })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    const partes = JSON.parse(texto(almacen, id, "partes-original.json") ?? "null").partes
    expect(claude.afirmaciones).toHaveLength(aTramos(partes).length)
    expect((await material(id)).estado).toBe("listo")
  })

  it("runs a 20,000-character text to the end as before", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      texto_pegado: `${PARRAFO}\n\n${PARRAFO}\n\n${PARRAFO}`,
    })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
  })
})
```

In `tests/integration/reprocesar.test.ts`, replace the test "asks for the cost confirmation again, as a long material does" (lines 242-257) with:

```ts
  it("runs a reprocessed long material to the end again, its estimate cleared and written again", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      texto_pegado: "Hablar de lo que se necesita. ".repeat(20_000),
    })
    expect(await procesarMaterial(await deps(almacen), id)).toEqual({ resultado: "listo" })
    const estimado = async () =>
      (await pool.query<{ c: string | null }>("select costo_estimado_usd::text as c from public.materiales where id = $1", [id]))
        .rows[0]?.c ?? null
    const primero = await estimado()
    expect(Number(primero)).toBeGreaterThan(1)

    await reprocesarComoConi(id)
    // reprocesar_material clears it (F2, D1): the notice says «Lo estoy procesando.» until the new run writes it.
    expect(await estimado()).toBeNull()
    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(await estimado()).toBe(primero)
    expect((await material(id)).estado).toBe("listo")
  })
```

In `tests/unit/estimar-costo-restante.test.ts`, remove `UMBRAL_CONFIRMACION_USD,` from the import and delete the whole test "starts asking for confirmation above one dollar" (D8). The import becomes:

```ts
import { ESTIMADO_POR_TRAMO_USD, estimarCostoRestante, estimarFicha } from "@/lib/ingesta/procesar"
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test:db tests/integration/procesar-estimado.test.ts tests/integration/procesar-afirmaciones.test.ts tests/integration/reprocesar.test.ts`
Expected: FAIL. The long-material tests get `{ resultado: "esperando_confirmacion" }` instead of `listo`; the small and strategy ones get `costo_estimado_usd` null (`Number(null)` is 0, not greater than 0); the hard-limit one gets `esperando_confirmacion`; the reprocess one stops at `esperando_confirmacion`.

- [ ] **Step 4: Write the minimal implementation**

In `lib/ingesta/procesar.ts`:

1. Remove the line `  | { resultado: "esperando_confirmacion" }` from `ResultadoProcesar`.
2. Delete the constant and its comment:

```ts
/** Above this estimate (the claims of every chunk, or the card, in USD) a person confirms the cost before the run spends it. */
export const UMBRAL_CONFIRMACION_USD = 1
```

3. Replace everything from `const formatoUsd = new Intl.NumberFormat(...)` through the end of `esperaConfirmacion` (lines 579-596) with:

```ts
/**
 * Every material gets what the rest will cost, right after the extraction and before the paid steps, and the run goes
 * on: the Biblioteca says it while it works (spec 2026-11-06, decisions 1 and 2). Runaway spend is held by the spend
 * alarm and the hard limit, not by a stop here.
 */
async function anotarEstimado(ctx: Contexto, original: Extraccion): Promise<void> {
  await actualizarMaterial(ctx.deps.db, ctx.material.id, {
    costo_estimado_usd: estimarCostoRestante(original.partes, ctx.material.rol),
  })
}
```

4. In `procesar`, replace the line

```ts
  if (await esperaConfirmacion(ctx, original)) return { resultado: "esperando_confirmacion" }
```

with

```ts
  await anotarEstimado(ctx, original)
```

- [ ] **Step 5: Run them to verify they pass, with the rest of the task's tests**

Run: `pnpm test:db tests/integration/procesar-estimado.test.ts tests/integration/procesar-afirmaciones.test.ts tests/integration/reprocesar.test.ts tests/integration/procesar-material.test.ts tests/integration/procesar-medios.test.ts tests/integration/confirmar-costo.test.ts && pnpm exec vitest run tests/unit/estimar-costo-restante.test.ts`
Expected: PASS. `procesar-material.test.ts` still passes its «límite del mes» and «material borrado» blocks (F8); `confirmar-costo.test.ts` is untouched and green (F2).

- [ ] **Step 6: No reference to the gate is left in the task code**

Run: `grep -rnE "esperando_confirmacion|UMBRAL_CONFIRMACION|esperaConfirmacion|Confírmalo|formatoUsd" lib trigger tests/integration tests/unit/estimar-costo-restante.test.ts`
Expected: only the UI's `esperaConfirmacion` in `lib/dominio/biblioteca/estado.ts` (removed in Task 8). Then `pnpm type` passes (nothing else imported `UMBRAL_CONFIRMACION_USD` or matched on `esperando_confirmacion`).

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write lib/ingesta/procesar.ts tests/integration/procesar-estimado.test.ts tests/integration/procesar-afirmaciones.test.ts tests/integration/reprocesar.test.ts tests/unit/estimar-costo-restante.test.ts
git add lib/ingesta/procesar.ts tests/integration/procesar-estimado.test.ts tests/integration/procesar-afirmaciones.test.ts tests/integration/reprocesar.test.ts tests/unit/estimar-costo-restante.test.ts
git commit -m "Process every material at once and write its estimate

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git mv` already staged the rename; `git add` stages its new content.)

**Checkpoint Lote 1:** reviewer on Task 1 against spec decisions 1 and 2 and the task half of "Testing". This changes the Trigger task `procesar-material` (the only Trigger file that reaches `lib/ingesta/procesar.ts`: confirm with `grep -rln "ingesta/procesar" trigger lib/produccion`), deployed in Task 16.

---

# Lote 2: domain, screens, actions, reader

### Task 2: the notice while it works (`avisoDeProceso`)

**Files:**
- Modify: `lib/dominio/biblioteca/estado.ts`
- Test: `tests/unit/biblioteca-estado.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/biblioteca-estado.test.ts`, add `avisoDeProceso,` to the import from `@/lib/dominio/biblioteca/estado` and append:

```ts
describe("avisoDeProceso (spec decision 3)", () => {
  it("says what it will cost once the task wrote the estimate, two decimals in Chilean Spanish", () => {
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 0.4 })).toBe("Lo estoy procesando. Costará cerca de US$ 0,40.")
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 1.2345 })).toBe(
      "Lo estoy procesando. Costará cerca de US$ 1,23.",
    )
  })

  it("says only «Lo estoy procesando.» before the extraction ends", () => {
    expect(avisoDeProceso(base)).toBe("Lo estoy procesando.")
  })

  it("says nothing when it is not working: paused with a reason, ready or failed", () => {
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 0.4, motivo_fallo: "tope_mensual" })).toBeNull()
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 0.4, estado: "listo" })).toBeNull()
    expect(avisoDeProceso({ ...base, estado: "fallido", motivo_fallo: "sin_texto" })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-estado.test.ts`
Expected: FAIL with "avisoDeProceso is not a function" (not exported).

- [ ] **Step 3: Write the minimal implementation**

At the top of `lib/dominio/biblioteca/estado.ts`, after the first comment line, add:

```ts
import { dolares } from "@/lib/formato"
import { AVISO_TRAS_SUBIR } from "./borrador-de-subida"
```

After `estaProcesando`, add:

```ts
/** What she reads while it works (spec decision 3): the estimate once the task wrote it; null when it is not working. */
export function avisoDeProceso(material: EstadoDeProceso): string | null {
  if (!estaProcesando(material)) return null
  if (material.costo_estimado_usd === null) return AVISO_TRAS_SUBIR
  return `${AVISO_TRAS_SUBIR} Costará cerca de ${dolares(material.costo_estimado_usd)}.`
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/biblioteca-estado.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/estado.ts tests/unit/biblioteca-estado.test.ts
git add lib/dominio/biblioteca/estado.ts tests/unit/biblioteca-estado.test.ts
git commit -m "Say what a material will cost while it is processing

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: the material page says it, with no price button

**Files:**
- Modify: `app/(app)/biblioteca/materiales/[id]/page.tsx`
- Test: `tests/unit/biblioteca-pagina-detalle.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/biblioteca-pagina-detalle.test.tsx`, inside `describe("the material detail page", ...)` (after the last test, before its closing `})`):

```ts
  describe("while it is processing (spec decision 3)", () => {
    const AVISO_CON_COSTO = "Lo estoy procesando. Costará cerca de US$ 0,40."
    const avisos = (arbol: { props: Record<string, unknown> }[]) =>
      textos(arbol).filter((texto) => String(texto).startsWith("Lo estoy procesando."))

    it("says once what it will cost, and offers no button to confirm it", async () => {
      esConi.valor = true
      datos.leerMaterialConFicha.mockResolvedValueOnce({
        material: { ...MATERIAL, estado: "procesando", costo_estimado_usd: 0.4 },
        ficha: null,
      })
      const arbol = elementos(await DetalleDeMaterial(conId(ID)))
      expect(avisos(arbol)).toEqual([AVISO_CON_COSTO])
      expect(arbol.some((elemento) => "costoUsd" in elemento.props)).toBe(false)
    })

    it("says only «Lo estoy procesando.» before the task wrote the estimate", async () => {
      esConi.valor = true
      datos.leerMaterialConFicha.mockResolvedValueOnce({ material: { ...MATERIAL, estado: "procesando" }, ficha: null })
      expect(avisos(elementos(await DetalleDeMaterial(conId(ID))))).toEqual(["Lo estoy procesando."])
    })

    it("says nothing of it when the material is ready or paused with a reason", async () => {
      esConi.valor = true
      datos.leerMaterialConFicha.mockResolvedValueOnce({
        material: { ...MATERIAL, costo_estimado_usd: 0.4 },
        ficha: null,
      })
      expect(avisos(elementos(await DetalleDeMaterial(conId(ID))))).toEqual([])
      datos.leerMaterialConFicha.mockResolvedValueOnce({
        material: { ...MATERIAL, estado: "procesando", motivo_fallo: "tope_mensual", costo_estimado_usd: 0.4 },
        ficha: null,
      })
      expect(avisos(elementos(await DetalleDeMaterial(conId(ID))))).toEqual([])
    })
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-detalle.test.tsx`
Expected: FAIL: the first test finds no notice (`[]`) and finds `BotonConfirmarCosto`'s `costoUsd`; the second finds no notice.

- [ ] **Step 3: Write the minimal implementation**

In `app/(app)/biblioteca/materiales/[id]/page.tsx`:

1. Replace the imports

```ts
import { esperaConfirmacion, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
```

with

```ts
import { avisoDeProceso, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
```

and delete `import { BotonConfirmarCosto } from "../../boton-confirmar-costo"`.

2. Replace the `arrancar` constant with:

```tsx
  const arrancar = sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null
  const aviso = avisoDeProceso(material)
```

3. In the header, right after

```tsx
          <div>
            <EstadoDeMaterial material={material} />
          </div>
```

add

```tsx
          {aviso ? <LineaDeEstado tipo="neutro" titulo={aviso} /> : null}
```

(`LineaDeEstado` is already imported. The header lives in the principal column, shown on both widths, so the notice is drawn once.)

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-detalle.test.tsx && pnpm type`
Expected: PASS (the earlier tests of the file too, including the Reintentar one: `arrancar` still draws `BotonReintentar` in both places).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/materiales/[id]/page.tsx" tests/unit/biblioteca-pagina-detalle.test.tsx
git add "app/(app)/biblioteca/materiales/[id]/page.tsx" tests/unit/biblioteca-pagina-detalle.test.tsx
git commit -m "Show the processing notice on the material page instead of the price button

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: the desktop side panel says it, with no price button

**Files:**
- Modify: `app/(app)/biblioteca/panel-de-material.tsx`
- Test: `tests/unit/biblioteca-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/biblioteca-panel.test.tsx`:

```ts
describe("PanelDeMaterial while it is processing (spec decision 3)", () => {
  const procesando = (extra: Partial<PanelDelMaterial["material"]>) => ({
    ...panel,
    material: { ...panel.material, estado: "procesando", ...extra },
    ideas: { total: 0, primeras: [] },
  })

  it("says under its title what it will cost, and offers no button to confirm it", () => {
    render(<PanelDeMaterial panel={procesando({ costo_estimado_usd: 0.4 })} filtros={{}} ahora={AHORA} />)
    const region = screen.getByRole("region", { name: "Burnout y teletrabajo: revisión 2024" })
    expect(within(region).getByRole("status")).toHaveTextContent("Lo estoy procesando. Costará cerca de US$ 0,40.")
    expect(within(region).getByText("Procesando")).toBeInTheDocument()
    expect(within(region).queryByRole("button", { name: /^Procesar por/ })).toBeNull()
  })

  it("says only «Lo estoy procesando.» before the estimate, and nothing once it is ready", () => {
    const { unmount } = render(<PanelDeMaterial panel={procesando({})} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("status")).toHaveTextContent(/^Lo estoy procesando\.$/)
    unmount()
    render(<PanelDeMaterial panel={{ ...panel, material: { ...panel.material, costo_estimado_usd: 0.4 } }} filtros={{}} ahora={AHORA} />)
    expect(screen.queryByText(/^Lo estoy procesando/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-panel.test.tsx`
Expected: FAIL: no `status` in the region (the first test also finds the «Procesar por ~US$ 0,40» button).

- [ ] **Step 3: Write the minimal implementation**

In `app/(app)/biblioteca/panel-de-material.tsx`:

1. Add `import { LineaDeEstado } from "@/components/ui/linea-de-estado"` with the other `@/components/ui` imports; replace

```ts
import { esperaConfirmacion, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
```

with

```ts
import { avisoDeProceso, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
```

and delete `import { BotonConfirmarCosto } from "./boton-confirmar-costo"`.

2. In `PanelDeMaterial`, after `const { material, ideas, evidencia } = panel`, add:

```ts
  const aviso = avisoDeProceso(material)
```

3. Right after the `</h2>` of the title, add:

```tsx
      {aviso ? <LineaDeEstado tipo="neutro" titulo={aviso} /> : null}
```

4. Delete the block

```tsx
      {esperaConfirmacion(material) && material.costo_estimado_usd !== null ? (
        <BotonConfirmarCosto materialId={material.id} costoUsd={material.costo_estimado_usd} />
      ) : null}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/biblioteca-panel.test.tsx && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/panel-de-material.tsx" tests/unit/biblioteca-panel.test.tsx
git add "app/(app)/biblioteca/panel-de-material.tsx" tests/unit/biblioteca-panel.test.tsx
git commit -m "Show the processing notice in the desktop side panel instead of the price button

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: the phone card keeps only the state

**Files:**
- Modify: `app/(app)/biblioteca/tarjeta-de-material.tsx`
- Test: `tests/unit/biblioteca-tarjeta.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/biblioteca-tarjeta.test.tsx`, replace the test "keeps the price button on a card that waits for her OK" with the test below. The state word («Espera tu OK» until Task 8) is asserted in Task 8, which adds `expect(li).toHaveTextContent("Procesando")` to this same test.

```ts
  it("draws a processing material with an estimate with no button and no price (spec decision 3)", () => {
    const li = tarjeta({ ...material, estado: "procesando", costo_estimado_usd: 1.2, titulo: null })
    expect(within(li).queryByRole("button")).toBeNull()
    expect(li).toHaveTextContent("Sin título")
    expect(li).not.toHaveTextContent("US$")
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-tarjeta.test.tsx`
Expected: FAIL: the card has the «Procesar por ~US$ 1,20» button (a button, and «US$» in its label).

- [ ] **Step 3: Write the minimal implementation**

In `app/(app)/biblioteca/tarjeta-de-material.tsx`: replace

```ts
import { esperaConfirmacion, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
```

with

```ts
import { sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
```

delete `import { BotonConfirmarCosto } from "./boton-confirmar-costo"`, and delete the block

```tsx
      {esperaConfirmacion(material) && material.costo_estimado_usd !== null ? (
        <BotonConfirmarCosto materialId={material.id} costoUsd={material.costo_estimado_usd} />
      ) : null}
```

Update the component's doc comment to: `/** A material on the phone list: the text opens the detail; Reintentar stays on the card. */`

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/biblioteca-tarjeta.test.tsx && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/tarjeta-de-material.tsx" tests/unit/biblioteca-tarjeta.test.tsx
git add "app/(app)/biblioteca/tarjeta-de-material.tsx" tests/unit/biblioteca-tarjeta.test.tsx
git commit -m "Take the price button off the phone card

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: no price button and no server action for it

**Files:**
- Delete: `app/(app)/biblioteca/boton-confirmar-costo.tsx`
- Modify: `app/(app)/biblioteca/acciones.ts`
- Test: `tests/unit/biblioteca-acciones-servidor.test.ts`, `tests/unit/biblioteca-botones.test.tsx`
- Modify (mocks only): `tests/unit/biblioteca-tarjeta.test.tsx`, `tests/unit/biblioteca-panel.test.tsx`, `tests/unit/biblioteca-pagina-detalle.test.tsx`, `tests/unit/biblioteca-pagina-materiales.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/biblioteca-acciones-servidor.test.ts`: remove `confirmarCostoAccion,` from the import of `@/app/(app)/biblioteca/acciones`, remove the row `["confirmarCosto", () => confirmarCostoAccion(ID), SobreMaterial, { materialId: ID }],` from the first `it.each`, and add inside `describe("the Biblioteca's server actions", ...)`:

```ts
  it("offers no cost confirmation: the task never waits for one (batch 6)", async () => {
    const acciones = await import("@/app/(app)/biblioteca/acciones")
    expect(Object.keys(acciones)).not.toContain("confirmarCostoAccion")
  })
```

In `tests/unit/biblioteca-botones.test.tsx`: delete the whole `describe("BotonConfirmarCosto", ...)` and the test "Procesar por redraws the screen on its own address"; remove `import { BotonConfirmarCosto } ...`; the hoisted block and the mock become:

```ts
const { reintentarMaterialAccion, push, replace } = vi.hoisted(() => ({
  reintentarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  push: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ reintentarMaterialAccion }))
```

In the `vi.mock("@/app/(app)/biblioteca/acciones", ...)` factories of `biblioteca-tarjeta.test.tsx`, `biblioteca-panel.test.tsx`, `biblioteca-pagina-detalle.test.tsx` and `biblioteca-pagina-materiales.test.tsx`, delete the line `confirmarCostoAccion: vi.fn(),`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-acciones-servidor.test.ts`
Expected: FAIL: the module still exports `confirmarCostoAccion`.

- [ ] **Step 3: Write the minimal implementation**

```bash
git rm "app/(app)/biblioteca/boton-confirmar-costo.tsx"
```

In `app/(app)/biblioteca/acciones.ts`, delete the whole function

```ts
export async function confirmarCostoAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("confirmarCosto", SobreMaterial, { materialId }, (db, d) =>
      confirmarCosto(depsDeBiblioteca(db), d.materialId),
    ),
  )
}
```

and remove `confirmarCosto,` from its import of `@/lib/acciones/biblioteca`.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm exec vitest run tests/unit/biblioteca-acciones-servidor.test.ts tests/unit/biblioteca-botones.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-panel.test.tsx tests/unit/biblioteca-pagina-detalle.test.tsx tests/unit/biblioteca-pagina-materiales.test.tsx && pnpm test:run && pnpm type`
Expected: PASS. `grep -rn "BotonConfirmarCosto\|confirmarCostoAccion\|boton-confirmar-costo" app tests` prints nothing.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/acciones.ts" tests/unit/biblioteca-acciones-servidor.test.ts tests/unit/biblioteca-botones.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-panel.test.tsx tests/unit/biblioteca-pagina-detalle.test.tsx tests/unit/biblioteca-pagina-materiales.test.tsx
git add "app/(app)/biblioteca/acciones.ts" tests/unit/biblioteca-acciones-servidor.test.ts tests/unit/biblioteca-botones.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-panel.test.tsx tests/unit/biblioteca-pagina-detalle.test.tsx tests/unit/biblioteca-pagina-materiales.test.tsx
git commit -m "Remove the Procesar por button and its server action

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` already staged the deletion.)

### Task 7: no `confirmarCosto` action; Reintentar picks up an old waiting row

**Files:**
- Modify: `lib/acciones/biblioteca.ts`, `lib/acciones/disparos.ts:64`
- Test: `tests/integration/acciones-biblioteca.test.ts`, `tests/integration/acciones-borrado-diferido.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/integration/acciones-biblioteca.test.ts`:

1. Remove `confirmarCosto,` from the named import of `@/lib/acciones/biblioteca` and add below that import:

```ts
import * as accionesDeBiblioteca from "@/lib/acciones/biblioteca"
```

2. In `fila`, select `"select estado, motivo_fallo, rol, autor_id from public.materiales where id = $1"` (D5).
3. Replace `describe("reprocesarMaterial and confirmarCosto", ...)`'s title with `"reprocesarMaterial, and no cost confirmation (batch 6)"`, and replace its last two tests ("confirms the cost of a long material and starts its run" and "says a material that does not wait for her OK any more does not") with:

```ts
  it("picks up with Reintentar a material the old cost gate left paused, never asking to confirm it (D6)", async () => {
    const id = await material({ estado: "procesando", costo: 1.2, motivo: "Este material es largo." })
    expect(await reintentarMaterial(deps(coni), id)).toEqual({ ok: true })
    expect(await fila(id)).toMatchObject({ estado: "procesando", motivo_fallo: null })
    expect(disparos.map((d) => d.materialId)).toEqual([id])
  })

  it("has no action to confirm a cost any more", () => {
    expect(Object.keys(accionesDeBiblioteca)).not.toContain("confirmarCosto")
  })
```

4. In "WAV is refused on every action ...": delete `const caro = await material({ estado: "procesando", costo: 1.2 })` and the row `await confirmarCosto(deps(wav), caro),`; the three `[fila(fallido), fila(listo), fila(caro)]` become `[fila(fallido), fila(listo)]`; `Array.from({ length: 7 }, ...)` becomes `Array.from({ length: 6 }, ...)`.

In `tests/integration/acciones-borrado-diferido.test.ts`: remove `confirmarCosto,` from the import; the test "reintentarMaterial, reprocesarMaterial and confirmarCosto answer not found and start nothing" becomes:

```ts
  it("reintentarMaterial and reprocesarMaterial answer not found and start nothing", async () => {
    const fallido = await material({ estado: "fallido", motivo: "Se cayó" })
    const listo = await material({ estado: "listo" })
    for (const id of [fallido, listo]) await marcar("materiales", id)

    expect(await reintentarMaterial(conDisparos(), fallido)).toEqual({ ok: false, error: NO_ENCONTRE })
    expect(await reprocesarMaterial(conDisparos(), listo)).toEqual({ ok: false, error: NO_ENCONTRE })
    expect(disparados).toEqual([])
    expect([await estado(fallido), await estado(listo)]).toEqual(["fallido", "listo"])
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/acciones-biblioteca.test.ts tests/integration/acciones-borrado-diferido.test.ts`
Expected: FAIL only in "has no action to confirm a cost any more" (`confirmarCosto` is still exported). The D6 test passes already: `reintentar_material` accepts any reason (F2); it pins that it keeps working once the gate is gone.

- [ ] **Step 3: Write the minimal implementation**

In `lib/acciones/biblioteca.ts`:

```ts
type RpcDeMaterial = "reintentar_material" | "reprocesar_material"
```

and delete

```ts
/** "Procesar por ~US$ X": the task already stored the extraction, so it only spends on what is left. */
export const confirmarCosto = moverYProcesar(
  "confirmarCosto",
  "confirmar_costo_material",
  "Ese material ya no espera confirmación.",
  "confirmar el costo de",
)
```

In `lib/acciones/disparos.ts:64`, the comment becomes:

```ts
  /** `intento`: Reintentar and Reprocesar each pass a new one, so a failed run is never reused. */
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:db tests/integration/acciones-biblioteca.test.ts tests/integration/acciones-borrado-diferido.test.ts && pnpm test:run && pnpm type`
Expected: PASS. `grep -rn "confirmarCosto\|confirmar_costo_material" lib app` prints nothing (the RPC stays in the database and in `tests/integration/confirmar-costo.test.ts`, F2).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/acciones/biblioteca.ts lib/acciones/disparos.ts tests/integration/acciones-biblioteca.test.ts tests/integration/acciones-borrado-diferido.test.ts
git add lib/acciones/biblioteca.ts lib/acciones/disparos.ts tests/integration/acciones-biblioteca.test.ts tests/integration/acciones-borrado-diferido.test.ts
git commit -m "Remove the confirmarCosto action; Reintentar picks up an old waiting material

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: no «Espera tu OK» state

**Files:**
- Modify: `lib/dominio/biblioteca/estado.ts`, `app/(app)/biblioteca/estado-de-material.tsx`
- Test: `tests/unit/biblioteca-estado.test.ts`, `tests/unit/biblioteca-piezas.test.tsx`, `tests/unit/biblioteca-tarjeta.test.tsx`, `tests/unit/pildora-y-pestana-con-icono.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/biblioteca-estado.test.ts`:

1. Remove `esperaConfirmacion,` from the import; `base` becomes:

```ts
const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null }
```

2. Replace the tests "waits for her OK while a long material has an estimate and no confirmation" and "can be retried when it failed or was paused with a reason, never while it waits for her OK" with:

```ts
  it("treats a processing material with an estimate as working, never as waiting (batch 6)", () => {
    const conEstimado = { ...base, costo_estimado_usd: 1.2 }
    expect(estaProcesando(conEstimado)).toBe(true)
    expect(sePuedeReintentar(conEstimado)).toBe(false)
    expect(presentarEstado(conEstimado)).toEqual({ palabra: "Procesando", tipo: "neutro", icono: "reloj" })
  })

  it("can be retried when it failed or was paused with a reason, an old waiting one too (D6)", () => {
    expect(sePuedeReintentar({ ...base, estado: "fallido", motivo_fallo: "sin_texto" })).toBe(true)
    expect(sePuedeReintentar({ ...base, motivo_fallo: "tope_mensual" })).toBe(true)
    expect(sePuedeReintentar(base)).toBe(false)
    const viejo = { ...base, costo_estimado_usd: 1.2, motivo_fallo: "Este material es largo." }
    expect(sePuedeReintentar(viejo)).toBe(true)
    expect(presentarEstado(viejo)).toEqual({ palabra: "En pausa", tipo: "aviso", icono: "pausa" })
  })
```

3. In `presentarEstado`'s `it.each`, delete the row `[{ ...base, costo_estimado_usd: 1.2 }, { palabra: "Espera tu OK", tipo: "aviso", icono: "mano" }]`.

In `tests/unit/biblioteca-piezas.test.tsx`: `base` becomes `{ estado: "procesando", motivo_fallo: null, costo_estimado_usd: null }` and the row `[{ ...base, costo_estimado_usd: 1.2 }, "Espera tu OK"]` becomes `[{ ...base, costo_estimado_usd: 1.2 }, "Procesando"]`.

In `tests/unit/biblioteca-tarjeta.test.tsx`, the test of Task 5 gets back its state line:

```ts
  it("draws a processing material with an estimate as «Procesando», with no button and no price (spec decision 3)", () => {
    const li = tarjeta({ ...material, estado: "procesando", costo_estimado_usd: 1.2, titulo: null })
    expect(within(li).queryByRole("button")).toBeNull()
    expect(li).toHaveTextContent("Sin título")
    expect(li).toHaveTextContent("Procesando")
    expect(li).not.toHaveTextContent("US$")
  })
```

In `tests/unit/pildora-y-pestana-con-icono.test.tsx`, the sample label of "uses it instead of the warning of an aviso pill, never both" becomes a state that still exists:

```tsx
    render(
      <PildoraDeEstado tipo="aviso" icono={<svg data-testid="pausa" />}>
        En pausa
      </PildoraDeEstado>,
    )
    const pildora = screen.getByText("En pausa").parentElement
    expect(pildora?.querySelectorAll("svg")).toHaveLength(1)
    expect(pildora?.querySelector("[data-testid=pausa]")).not.toBeNull()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/biblioteca-estado.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tarjeta.test.tsx`
Expected: FAIL: a processing material with an estimate is still «Espera tu OK» (not working, icon `mano`) and the old waiting one is not retryable.

- [ ] **Step 3: Write the minimal implementation**

In `lib/dominio/biblioteca/estado.ts`:

1. `EstadoDeProceso` becomes:

```ts
export interface EstadoDeProceso {
  estado: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
}
```

2. Delete `esperaConfirmacion` and its comment.
3. `sePuedeReintentar` becomes:

```ts
/** A material that failed, or one stopped with a reason (the monthly limit, a run that could not start): retryable. */
export function sePuedeReintentar(material: EstadoDeProceso): boolean {
  return material.estado === "fallido" || (material.estado === "procesando" && marcadoConMotivo(material.motivo_fallo))
}
```

4. `estaProcesando`'s comment becomes `/** Really working on it: the list keeps asking while any material is. A paused one does not. */`
5. The icon type and its comment:

```ts
/** The icons the pill draws itself (check, warning circle) are `null` here; these two it is given. */
export type IconoDeEstado = "reloj" | "pausa" | null
```

6. Delete the first line of `presentarEstado`: `if (esperaConfirmacion(material)) return { palabra: "Espera tu OK", tipo: "aviso", icono: "mano" }`.

In `app/(app)/biblioteca/estado-de-material.tsx`:

```ts
import { HourglassMedium, PauseCircle } from "@phosphor-icons/react/dist/ssr"
```

```ts
const ICONOS = { reloj: HourglassMedium, pausa: PauseCircle } as const
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm exec vitest run tests/unit/biblioteca-estado.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/pildora-y-pestana-con-icono.test.tsx && pnpm test:run && pnpm type`
Expected: PASS. `grep -rn "esperaConfirmacion\|Espera tu OK\|HandPalm\|\"mano\"" app lib components tests/unit` prints nothing.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/estado.ts "app/(app)/biblioteca/estado-de-material.tsx" tests/unit/biblioteca-estado.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/pildora-y-pestana-con-icono.test.tsx
git add lib/dominio/biblioteca/estado.ts "app/(app)/biblioteca/estado-de-material.tsx" tests/unit/biblioteca-estado.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/pildora-y-pestana-con-icono.test.tsx
git commit -m "Drop the Espera tu OK state: a material with an estimate is processing

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: «Costo estimado» in «Detalle para WAV» without the confirmation

**Files:**
- Modify: `lib/dominio/biblioteca/detalle.ts`
- Test: `tests/unit/biblioteca-palabras.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/biblioteca-palabras.test.ts`, inside `describe("lineasParaWav (D10)", ...)`: delete `costo_confirmado_en: null,` from `material`, and replace the test "adds the reason and the estimated cost when there are" with:

```ts
  it("adds the reason and the estimated cost when there are, with nothing about a confirmation (batch 6)", () => {
    expect(lineasParaWav({ ...material, motivo_fallo: "tope_mensual", costo_estimado_usd: 1.2 }, {})).toEqual([
      "Papel: referente",
      "Motivo: tope_mensual",
      "Costo estimado: US$ 1,20",
      "Material: m-1",
      "Autor: a-1",
    ])
    expect(lineasParaWav({ ...material, costo_estimado_usd: 0.5 }, {})).toContain("Costo estimado: US$ 0,50")
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-palabras.test.ts`
Expected: FAIL: the line reads «Costo estimado: US$ 1,20 (sin confirmar)».

- [ ] **Step 3: Write the minimal implementation**

In `lib/dominio/biblioteca/detalle.ts`, delete `costo_confirmado_en: string | null` from `MaterialParaWav`, and replace

```ts
  if (material.costo_estimado_usd !== null) {
    const confirmado = material.costo_confirmado_en ? "confirmado" : "sin confirmar"
    lineas.push(`Costo estimado: ${dolares(material.costo_estimado_usd)} (${confirmado})`)
  }
```

with

```ts
  if (material.costo_estimado_usd !== null) lineas.push(`Costo estimado: ${dolares(material.costo_estimado_usd)}`)
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/biblioteca-palabras.test.ts tests/unit/biblioteca-estado.test.ts && pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/detalle.ts tests/unit/biblioteca-palabras.test.ts
git add lib/dominio/biblioteca/detalle.ts tests/unit/biblioteca-palabras.test.ts
git commit -m "Say the estimated cost for WAV without a confirmation

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: the list keeps asking while a material with an estimate works

**Files:**
- Modify: `lib/datos/biblioteca.ts`
- Test: `tests/integration/datos-biblioteca.test.ts:111-145`
- Modify (fixtures only, D5): `tests/unit/biblioteca-tabla.test.tsx`, `tests/unit/biblioteca-tarjeta.test.tsx`, `tests/unit/biblioteca-panel.test.tsx`, `tests/unit/biblioteca-pagina-detalle.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/integration/datos-biblioteca.test.ts`, replace the test "counts apart the materials really working: not paused, not waiting for her OK" with:

```ts
  it("counts as working every processing material without a reason, with or without an estimate (D2)", async () => {
    const otra = await sembrarAutor(`Otra autora ${SUFIJO}`)
    autores.push(otra)
    const pausado = await sembrarMaterial({
      titulo: `Pausa ${SUFIJO}`,
      autorId: otra,
      estado: "procesando",
      motivo: "tope_mensual",
    })
    const conEstimado = await sembrarMaterial({
      titulo: `Con estimado ${SUFIJO}`,
      autorId: otra,
      estado: "procesando",
      costo: 1.2,
    })
    const sinEstimado = await sembrarMaterial({ titulo: `Sin estimado ${SUFIJO}`, autorId: otra, estado: "procesando" })
    materiales.push(pausado, conEstimado, sinEstimado)

    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from public.materiales
        where estado = 'procesando' and motivo_fallo is null and borrar_desde is null`,
    )
    const conteos = await contarPorEstado(coni)
    expect(conteos.trabajando).toBe(rows[0]?.n)
    // conEstimado and sinEstimado work; pausado is counted under Procesando but does not work.
    expect(conteos.trabajando).toBeGreaterThanOrEqual(2)
    expect(conteos.procesando - conteos.trabajando).toBeGreaterThanOrEqual(1)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/datos-biblioteca.test.ts -t "counts as working"`
Expected: FAIL: `trabajando` is one less than the query (the material with an estimate and no confirmation is left out).

- [ ] **Step 3: Write the minimal implementation**

In `lib/datos/biblioteca.ts`:

1. Delete `costo_confirmado_en: string | null` from `MaterialDeLista`, and `COLUMNAS` becomes:

```ts
const COLUMNAS = "id, titulo, autor_id, rol, tipo, estado, motivo_fallo, costo_estimado_usd, creado_en"
```

2. `contarPorEstado`'s comment and its third count:

```ts
/**
 * The quick filters' counts, and `trabajando`: the materials really working (processing with no reason). "Procesando"
 * counts the paused ones too; only a working one keeps the list asking.
 */
```

```ts
    contar("trabajando", cuantos().eq("estado", "procesando").is("motivo_fallo", null)),
```

In the fixtures of `tests/unit/biblioteca-tabla.test.tsx`, `biblioteca-tarjeta.test.tsx`, `biblioteca-panel.test.tsx` and `biblioteca-pagina-detalle.test.tsx`, delete the line `costo_confirmado_en: null,` (typed `MaterialDeLista` / `PanelDelMaterial` literals would not compile with it).

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:db tests/integration/datos-biblioteca.test.ts && pnpm test:run && pnpm type`
Expected: PASS. `grep -rn "costo_confirmado_en" app lib components tests/unit` prints only `lib/supabase/database.types.ts` (generated; D5).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/datos/biblioteca.ts tests/integration/datos-biblioteca.test.ts tests/unit/biblioteca-tabla.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-panel.test.tsx tests/unit/biblioteca-pagina-detalle.test.tsx
git add lib/datos/biblioteca.ts tests/integration/datos-biblioteca.test.ts tests/unit/biblioteca-tabla.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-panel.test.tsx tests/unit/biblioteca-pagina-detalle.test.tsx
git commit -m "Keep the list asking while a material with an estimate works

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: a word guard so the gate does not come back

**Files:**
- Test: `tests/unit/biblioteca-palabras.test.ts`

This is a guard over the files Tasks 1 to 10 cleaned: it is green when written. The first `it` proves the matcher bites, in the style of the file's existing "finds the old words" test.

- [ ] **Step 1: Write the test**

Append to `tests/unit/biblioteca-palabras.test.ts`:

```ts
const RAIZ = join(__dirname, "..", "..")
/** Where the cost gate lived: the Biblioteca's screens, its domain, the actions, the task and the shared pieces. */
const DONDE_VIVIA_LA_PUERTA = [
  SECCION,
  join(RAIZ, "lib", "dominio", "biblioteca"),
  join(RAIZ, "lib", "acciones"),
  join(RAIZ, "lib", "ingesta"),
  join(RAIZ, "components"),
]
const PALABRAS_DE_LA_PUERTA = /Espera tu OK|Procesar por|Confírmalo/

describe("no cost gate any more (batch 6, spec decision 4)", () => {
  it("finds the gate's words anywhere in a file, comments included", () => {
    expect(PALABRAS_DE_LA_PUERTA.test("{`Procesar por ~${dolares(costoUsd)}`}")).toBe(true)
    expect(PALABRAS_DE_LA_PUERTA.test('return { palabra: "Espera tu OK" }')).toBe(true)
    expect(PALABRAS_DE_LA_PUERTA.test("/** Confírmalo para seguir. */")).toBe(true)
    expect(PALABRAS_DE_LA_PUERTA.test("Lo estoy procesando. Costará cerca de US$ 0,40.")).toBe(false)
  })

  it("keeps «Espera tu OK», «Procesar por» and «Confírmalo» out of every file where the gate lived", () => {
    const conLaPuerta = DONDE_VIVIA_LA_PUERTA.flatMap(archivos).filter((ruta) =>
      PALABRAS_DE_LA_PUERTA.test(readFileSync(ruta, "utf-8")),
    )
    expect(conLaPuerta).toEqual([])
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run tests/unit/biblioteca-palabras.test.ts`
Expected: PASS. If the second test lists a file, a step of Tasks 1 to 10 was missed there: fix that file (not the test) and run again.

- [ ] **Step 3: Commit**

```bash
pnpm exec biome check --write tests/unit/biblioteca-palabras.test.ts
git add tests/unit/biblioteca-palabras.test.ts
git commit -m "Guard against the cost gate's words coming back

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 2:** reviewer on Tasks 2 to 11 against spec decisions 3, 4 and 6 and the "Domain and screens" testing line: the notice with and without an estimate on the page and the panel; the list keeps «Procesando»; no «Espera tu OK» and no «Procesar por» anywhere; the «Costo estimado» line stays without «(confirmado / sin confirmar)»; Reintentar and Reprocesar keep working. Also: `grep -rn "costo_confirmado_en" app lib components` prints only the generated types, and `pnpm db:types && git diff --stat -- lib/supabase/database.types.ts` prints nothing.

---

# Lote 3: end to end

### Task 12: the scene and the phone

**Files:**
- Modify: `tests/e2e/biblioteca-escena.ts`
- Modify: `tests/e2e/biblioteca.spec.ts`
- Modify: `tests/e2e/biblioteca-borrar.spec.ts`

- [ ] **Step 1: Change the scene (D7)**

In `tests/e2e/biblioteca-escena.ts`:

1. In `EscenaDeBiblioteca`, replace `esperaOk: string` with:

```ts
  /** Processing with the estimate the task writes after the extraction (US$ 1,20), no reason: it is working. */
  conEstimado: string
```

2. In `sembrarBiblioteca`, rename the constant `esperaOk` to `conEstimado` (its fields stay: «Charla larga sobre el síndrome del impostor», Daniela, `procesando`, `costo: 1.2`, `hace: "3 days"`), and the return becomes `return { listo, procesando, conError, conEstimado, estrategia }`.
3. The doc comment of `sembrarBiblioteca` becomes: `/** Five materials (ready, two processing, one of them with its estimate, failed) plus a strategy card. Titles are the mockup's. */`

In `tests/e2e/biblioteca-borrar.spec.ts`, replace every `escena.esperaOk` with `escena.conEstimado` (lines 59, 124, 147, 155, 157). Nothing else changes there.

- [ ] **Step 2: Write the phone tests**

In `tests/e2e/biblioteca.spec.ts`:

1. Add at the top `import { mkdirSync } from "node:fs"` and `import { join } from "node:path"`, and below `const CLAVE_CON_INTENTO = ...` (still used by the Reprocesar and Reintentar tests of the file):

```ts
const AVISO_CON_COSTO = "Lo estoy procesando. Costará cerca de US$ 1,20."
```

2. In "the phone list shows each material as a card ...", replace the line with «Espera tu OK» with:

```ts
  const charla = lista.getByRole("listitem").filter({ hasText: "síndrome del impostor" })
  await expect(charla).toContainText("Procesando")
  await expect(charla.getByRole("button")).toHaveCount(0)
```

3. Replace the whole test "Procesar por ~US$ 1,20 on a card starts the run with a key of its own" with:

```ts
test("a material's page says it is processing and, once the task estimated it, what it will cost; nothing to confirm", async ({
  page,
}) => {
  await page.goto(`/biblioteca/materiales/${escena.conEstimado}`)
  await expect(page.getByRole("heading", { name: "Charla larga sobre el síndrome del impostor", level: 1 })).toBeVisible()
  await expect(page.getByRole("status").filter({ hasText: AVISO_CON_COSTO })).toHaveText(AVISO_CON_COSTO)
  await expect(page.getByText("Procesando", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Procesar por/ })).toHaveCount(0)
  expect(await revisarConAxe(page, "material procesando con su costo")).toEqual([])
  // For Federico (Task 14): not a baseline, only a picture of the notice.
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, "material-procesando-telefono.png"), fullPage: true })
  }

  await page.goto(`/biblioteca/materiales/${escena.procesando}`)
  await expect(page.getByRole("status").filter({ hasText: "Lo estoy procesando." })).toHaveText("Lo estoy procesando.")

  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  await expect(page.getByText(/^Lo estoy procesando/)).toHaveCount(0)
  expect(disparosDeMateriales()).toEqual([])
})
```

- [ ] **Step 3: Run them**

Run: `pnpm exec playwright test tests/e2e/biblioteca.spec.ts tests/e2e/biblioteca-borrar.spec.ts`
Expected: PASS. (Run before Step 1 and 2, the phone list test would fail on «Espera tu OK» no longer being there: the screens already changed in Lote 2. `CLAVE_CON_INTENTO` is still used by the Reprocesar test of the file; if Biome reports it unused, check that test still reads it rather than deleting it blindly.)

- [ ] **Step 4: Commit**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca.spec.ts tests/e2e/biblioteca-borrar.spec.ts
git add tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca.spec.ts tests/e2e/biblioteca-borrar.spec.ts
git commit -m "Cover the processing notice on the phone end to end

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: the desktop panel, and the captures

**Files:**
- Modify: `tests/e2e/biblioteca.escritorio.ts`

- [ ] **Step 1: Write the desktop test**

In `tests/e2e/biblioteca.escritorio.ts`, add after the test "Reintentar in the side panel starts the run ...":

```ts
test("the side panel of a processing material says what it will cost, with nothing to confirm", async ({ page }) => {
  const titulo = "Charla larga sobre el síndrome del impostor"
  const aviso = "Lo estoy procesando. Costará cerca de US$ 1,20."
  await page.goto(`/biblioteca?m=${escena.conEstimado}`)
  const panel = page.getByRole("region", { name: titulo })
  await expect(panel.getByRole("status").filter({ hasText: aviso })).toHaveText(aviso)
  await expect(panel.getByText("Procesando", { exact: true })).toBeVisible()
  await expect(panel.getByRole("button", { name: /^Procesar por/ })).toHaveCount(0)
  const fila = page.getByRole("table", { name: "Materiales" }).getByRole("row").filter({ hasText: titulo })
  await expect(fila).toContainText("Procesando")
  expect(await revisarConAxe(page, "panel de un material procesando")).toEqual([])
  // For Federico (Task 14): not a baseline, only a picture of the notice (mkdirSync and join are already imported).
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, "panel-procesando-escritorio.png"), fullPage: true })
  }
})
```

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test --project escritorio tests/e2e/biblioteca.escritorio.ts -g "processing material"`
Expected: PASS.

- [ ] **Step 3: Take the captures, without writing baselines into the repo**

Run: `VISUAL_FINALES=/tmp/procesar-al-tiro-capturas pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca" && VISUAL_FINALES=/tmp/procesar-al-tiro-capturas pnpm exec playwright test --project escritorio tests/e2e/biblioteca.escritorio.ts tests/e2e/biblioteca-autores-temas.escritorio.ts tests/e2e/biblioteca-borradores.escritorio.ts tests/e2e/biblioteca-subir.escritorio.ts tests/e2e/biblioteca-semana.escritorio.ts -g "visual|processing material" && VISUAL_FINALES=/tmp/procesar-al-tiro-capturas pnpm exec playwright test tests/e2e/biblioteca.spec.ts -g "processing and"`
Expected: PASS; the captures land in `/tmp/procesar-al-tiro-capturas`, including `material-procesando-telefono.png` and `panel-procesando-escritorio.png`. Then, without `VISUAL_FINALES`, run the same two commands: exactly `biblioteca-lista` (phone, the Charla card says «Procesando» and has no button) and `biblioteca-escritorio` (the Charla row says «Procesando») differ (D10); every other Biblioteca baseline passes. If any other one differs, stop and find out why before going on. Do **not** run `--update-snapshots` and do not stage any `*-snapshots/*.png` here: Task 14 does it after Federico looks.

- [ ] **Step 4: Commit**

```bash
pnpm exec biome check --write tests/e2e/biblioteca.escritorio.ts
git add tests/e2e/biblioteca.escritorio.ts
git commit -m "Cover the processing notice in the desktop side panel

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 3:** reviewer on Tasks 12 and 13 against the spec's "E2E" line (the scenes stop seeding a material waiting for its cost; a processing material shows «Costará cerca de US$ X» on its page on the phone and in the side panel on a computer). Confirm no snapshot file is staged: `git diff origin/main --name-only -- '*.png'` prints nothing.

---

# Lote 4: baselines, gate and shipping

### Task 14: STOP until Federico sees the captures (visual baselines)

**Files:** `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png`, `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png`, only on his OK.

- [ ] **Step 1: Show the captures.** Send Federico `/tmp/procesar-al-tiro-capturas/biblioteca-lista.png` and `/tmp/procesar-al-tiro-capturas/biblioteca-escritorio.png` (the two that move, D10), plus `material-procesando-telefono.png` and `panel-procesando-escritorio.png` from the same folder (Task 13 Step 3), and say in Spanish what changed: «Espera tu OK» and «Procesar por ~US$ 1,20» are gone, the material reads «Procesando», and its page and panel say «Lo estoy procesando. Costará cerca de US$ 1,20.».
- [ ] **Step 2: Stop here until he answers.** No baseline is written, no PR is opened for merge, no Trigger deploy. If he asks for changes, they go first (failing test first, one commit each), and Task 13 Step 3 is run again.
- [ ] **Step 3: Only on his OK, take the two baselines:**

```bash
pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca: the phone list" --update-snapshots
pnpm exec playwright test --project escritorio tests/e2e/biblioteca.escritorio.ts -g "visual" --update-snapshots
git status --short -- '*.png'
```

Expected: exactly the two files of D10 modified. Commit them alone:

```bash
git add tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png
git commit -m "Retake the Biblioteca list baselines without the cost gate

Part of #17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: the full gate

**Files:** none.

- [ ] **Step 1: Every check**

Run: `pnpm lint && pnpm type && pnpm build && pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: all green.

- [ ] **Step 2: Banned patterns and scope**

```bash
git diff origin/main -U0 -- app lib components tests | grep '^+' | grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|$(printf '\342\200\224')|text-\[[0-9]|catch \{\s*\}|redirect\("
git diff origin/main --stat -- supabase lib/supabase/database.types.ts trigger tests/integration/confirmar-costo.test.ts
grep -rn "$(printf '\342\200\224')" docs/superpowers/plans/2026-11-06-biblioteca-procesar-al-tiro.md docs/superpowers/specs/2026-11-06-biblioteca-procesar-al-tiro-design.md
grep -rnE "esperaConfirmacion|esperando_confirmacion|UMBRAL_CONFIRMACION|confirmarCosto|BotonConfirmarCosto|Espera tu OK|Procesar por" app lib components trigger tests
pnpm db:types && git diff --stat -- lib/supabase/database.types.ts
```

Expected: the first prints nothing (only lines this batch added are looked at); the second prints nothing (no migration, no types, no Trigger file, the RPC's SQL test untouched); the third prints nothing; the fourth prints nothing; the fifth prints nothing.

- [ ] **Step 3: Review the whole branch** with `superpowers:requesting-code-review`. Fix findings with a failing test first, one commit per fix, and rerun Step 1.

### Task 16: release (controller; not executed by implementer subagents)

Federico's standing authorization (memory "Salida a producción autorizada") covers the PR, CI and the merge when its conditions hold (issue, green CI, reviews). **The Trigger deploy needs Federico's explicit OK in the conversation.** No migration (`supabase db push` is not run), no Ingesta change. Order is reversed on purpose (spec Shipping): **Trigger first, then the merge.** The Trigger task code lives in this repo and the spec forbids merging first, so Trigger is deployed from the worktree at the PR head (D12).

1. **Issue and PR.** Work on #17 (board WAV-WaAreVision/projects/1, status kept up to date). Push `feat/biblioteca-procesar-al-tiro` and open the PR: title "Biblioteca: process at once and say the cost (batch 6)", body with the summary, the decisions D1 to D13, the release order (Trigger from the PR head, then merge) and "Part of #17." (never "Closes"), ending with the PR attribution line.
2. **The head must contain `main`.** `git fetch origin && git merge-base --is-ancestor origin/main HEAD`. If it fails, `git merge origin/main` (no rebase of pushed commits), rerun Task 15 Step 1, push, and wait for CI again. Deploying a head without `main`'s latest Trigger code would roll that code back in production.
3. **CI green and review approved on that exact head.** `gh pr view --json headRefOid,statusCheckRollup` and `git rev-parse HEAD` must give the same commit, all checks green. Watch CI in the background and act as soon as it finishes.
4. **Federico's explicit OK for the Trigger deploy**, saying it changes `procesar-material` (no stop for the cost, the estimate for every material) and that, for the minutes until the merge, the app still in production shows «Espera tu OK» and «Procesar por» on materials being processed (D11; a tap is harmless). Then, from `CONIDOLLY` at that head, with a clean tree (`git status --short` prints nothing):

```bash
pnpm install --frozen-lockfile
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

   Note the new version (`2026110X.N`) the deploy prints.
5. **Merge the PR at once** (Vercel publishes `main`), and wait for the production deployment to be ready. If the merge cannot happen right after the deploy (a check turns red, a conflict), roll Trigger back: from a clean checkout of `origin/main` (`git worktree add /tmp/estudio-coni-main origin/main && cd /tmp/estudio-coni-main && pnpm install --frozen-lockfile`) run the same deploy command, so Trigger and the app agree again, and tell Federico.
6. **Live checks.** Without a session, `https://conidolly.vercel.app/biblioteca` redirects to sign-in (curl the status and `Location`). With Coni's account (Federico), by address: no material shows «Espera tu OK» or «Procesar por»; a material being processed says «Lo estoy procesando.» and, after its extraction, «Costará cerca de US$ ...» on its page and in the side panel. Do **not** upload a material in production as a check: it spends. Read-only on the database: `select count(*) from public.materiales where estado = 'procesando' and motivo_fallo like 'Este material es largo%'` is 0 (D6). The first real upload after the release confirms the task wrote `costo_estimado_usd` without a stop (Trigger run output `{ "resultado": "listo" }`).
7. **Record the Trigger version** in `docs/TRASPASO.md` (the «Tareas» row, line 19: the new version, «desde la `2026110X.N`, del DD-11-2026 (the deploy's day), `procesar-material` ya no se detiene por el costo: anota el estimado de cada material y sigue»), in a follow-up branch and PR of its own, as `fea0386c` (#86) did, merged under the same authorization.
8. **Board:** comment on #17 with the release date of batch 6, the PR, the Trigger version and the live checks; #17 stays open (batch 7).

---

## Self-review against the spec

| Spec section | Where |
|---|---|
| Decision 1: no cost gate; the spend alarm and the hard limit hold spend; the hard limit stops with its reason (`detenidoPorLimite`) | Task 1 (hard-limit test in `procesar-estimado`; `procesar-material` «límite del mes», F8) |
| Decision 2: the estimate for every material after the extraction, before the paid steps, no reason, the claim kept, the run goes on | Task 1 (`anotarEstimado`, long, small and strategy tests; D4) |
| Decision 3: the notice with the estimate «Lo estoy procesando. Costará cerca de US$ 0,40.» (two decimals, es-CL) and without it «Lo estoy procesando.»; on the material page and the desktop side panel; the list keeps «Procesando» with its icon | Tasks 2, 3, 4, 5, 8; Tasks 12, 13 (D3) |
| Decision 4: `BotonConfirmarCosto`, `confirmarCosto` / `confirmarCostoAccion`, «Espera tu OK», `esperaConfirmacion` and `esperando_confirmacion`, `UMBRAL_CONFIRMACION_USD` go; «Costo estimado» stays without «(confirmado / sin confirmar)» | Tasks 1, 3 to 9; Task 11 (guard); Task 15 Step 2 |
| Decision 5: no migration; `costo_confirmado_en` stays in the schema, unused by Conidolly; no Ingesta PR | Task 10 (D5); Task 15 Step 2; F2 |
| Decision 6: retry, reprocess and the deletion stop keep working, not reading `costo_confirmado_en`; resets removed | Tasks 1 (reprocess test), 7 (Reintentar on an old waiting row), 8; `procesar-material` «material borrado» (F8); the SQL reset stays (D1) |
| Decision 7: out of scope (folders and batches with a prior estimate, the real cost after the run) | Not planned |
| Shipping: Trigger first with Federico's OK, then the merge; no migration, no Ingesta change | Task 16 (D11, D12, D13) |
| Testing, task: a long material runs to `listo` with its estimate; a small one gets its estimate; the hard limit still stops; a marked material still stops | Task 1; F8 |
| Testing, domain and screens: the notice with and without an estimate; no «Espera tu OK» and no «Procesar por» anywhere (a word test) | Tasks 2 to 5, 8, 11 |
| Testing, E2E: the scenes stop seeding a waiting material; «Costará cerca de US$ X» on the page (phone) and in the side panel (desktop); baselines retaken after Federico sees the captures | Tasks 12, 13, 14 (Task 14 is the stop) |

Names across tasks: `anotarEstimado` (Task 1) is private to `lib/ingesta/procesar.ts`; `estimarCostoRestante` keeps its export and is what the Task 1 tests call; `avisoDeProceso` (Task 2) is what Tasks 3 and 4 import; `EstadoDeProceso` loses `costo_confirmado_en` in Task 8, `MaterialParaWav` in Task 9, `MaterialDeLista` and `COLUMNAS` in Task 10, and the fixtures follow in the same task; `escena.conEstimado` (Task 12) is what Tasks 12 and 13 and `biblioteca-borrar.spec.ts` read; `/tmp/procesar-al-tiro-capturas` (Task 13) is what Task 14 shows.
