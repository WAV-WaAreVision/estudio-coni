# Biblioteca batch 1: foundations and Materiales (change 29b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni's Materiales screen lives in Conidolly at `/biblioteca` (reachable only by its address in this batch): quick filters and "Más filtros", phone cards, a desktop table with a side panel (`?m=<id>`), the full detail with author, role, card, map of ideas, reprocess and retry, and the signed download of the original text, with Coni's fixes 4b, 4c, 4f, 4h, 4j, 4m and 4n.

**Architecture:** Ported from Ingesta, rewritten to Conidolly's layers. Pure rules in `lib/dominio/biblioteca/`; readers in `lib/datos/biblioteca.ts` (Coni's client, throw on error, main topic aggregated in TypeScript over paged claims); actions in `lib/acciones/biblioteca.ts` (injected deps, `es_coni` checked again inside each one) wrapped by the `"use server"` module `app/(app)/biblioteca/acciones.ts` (`conSesionDeConi` + Zod + `revalidatePath("/biblioteca", "layout")`). The section is the route `app/(app)/biblioteca/`: its layout gates with `exigirConi()` and marks itself with `data-ancho="biblioteca"`, which lets the `(app)` column widen on `md:` through a `:has()` variant. Processing starts through a new `DisparosDeBiblioteca` port (`procesar-material` with a per-attempt key, `motor-manual`); R2 gets `tamano`, `borrarCarpeta`, `urlDeTexto` and an `R2_ENDPOINT` override that the E2E points at a fake S3.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, `@supabase/supabase-js` 2.105, Zod 4, Tailwind v4, `@aws-sdk/client-s3` + `s3-request-presigner`, `@trigger.dev/sdk` 4.6, Phosphor (`@phosphor-icons/react`, SSR entry in server modules), Vitest 4 (jsdom unit, node integration against the local Supabase), MSW 2, Playwright 1.59 + `@axe-core/playwright`, Biome 2.2 (safe mode only).

**Spec:** `docs/superpowers/specs/2026-11-02-biblioteca-materiales-design.md` (issue WAV-WaAreVision/estudio-coni#17, pedido 29b, batch 1 of 7). Source to port from: Ingesta `/Users/fede/Projects/conidolly-ingesta` (main, `39f9887`, read only).

---

## Where to work

- Worktree: `/Users/fede/Projects/estudio-coni/.worktrees/biblioteca-materiales`, branch `feat/biblioteca-materiales` (already holds the spec). Below, **`CONIDOLLY`** means that path. Every command runs from it.

  ```bash
  cd /Users/fede/Projects/estudio-coni/.worktrees/biblioteca-materiales && pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it (.env* is ignored)
  ```

- Local Supabase of estudio-coni must be running (`cd /Users/fede/Projects/estudio-coni && pnpm db:start`): API `127.0.0.1:54421`, database `54422`, Mailpit `54424`. **Do not run `pnpm db:reset`** while another worktree is using the stack; this batch adds no migration, so it never needs one.
- Ingesta is read only: open its files to port them, never edit, commit or push there.
- Read `CONIDOLLY/CLAUDE.md` and `/Users/fede/Projects/conidolly-ingesta/CLAUDE.md` before Task 1.

## Rules for every task

- **TDD strict:** write the failing test, run it and see it fail for the reason written in the step, write the minimum code, run it green. A task is one commit.
- Commit messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes only, **never `--unsafe`**), then `head -1` every client file the task touched: it must still be `"use client"`.
- No `any`, no `@ts-expect-error`, no non-null `!`, no silent `catch` (a `catch` logs and rethrows, or turns the error into a message for Coni). No hex colour outside `app/globals.css`. Icons are Phosphor, sized through `ICONO` (`components/ui/icono.ts`), from `@phosphor-icons/react/dist/ssr` in server modules and `@phosphor-icons/react` in client ones. No `text-[...]` sizes, no `min-h-11..16`, no `text-aviso`/`text-ok`, and `text-error` only through `LineaDeError`, `PildoraDeEstado` or the destructive button (all enforced by `tests/unit/diseno-reglas.test.ts`).
- Copy for Coni in Spanish of Chile, tú, no em dashes, quotes as «». Technical words go under "Detalle para WAV" (fix 4h).
- **Coni only:** every page under `/biblioteca` calls `exigirConi()`; every action goes through `conSesionDeConi` and checks `es_coni` again inside `lib/acciones/biblioteca.ts`.
- **Never send file bytes through a server action**: a download is a 302 to a signed R2 URL.
- **The bar's tab does not change in this batch:** `components/nav-inferior.tsx` is not touched; its "Biblioteca" tab keeps going to `/ir-a-biblioteca` (Ingesta).
- **Ingesta is not modified.** No migration, no Trigger.dev deploy, no new env var in Vercel.
- Run `pnpm test:run` (all unit tests, not only the new file) before each commit from Task 4 on: the design-rule test scans every new file in `app/` and `components/`.

## Facts fixed before planning

Each was checked in the code on 2026-11-02 (CONIDOLLY at `b5fc43a`, Ingesta at `39f9887`).

- **F1. The `(app)` layout pins the column:** `app/(app)/layout.tsx` wraps every screen in `div.mx-auto.flex.max-w-[560px]` and renders `BarraSinConexion`, `main` and `NavInferior` inside it. A nested `app/(app)/biblioteca/layout.tsx` renders inside `main`, so it cannot widen its parent by itself.
- **F2. `Disparos` is implemented by object literals in tests:** `tests/integration/acciones-piezas.test.ts:99`, `acciones-carrusel.test.ts:46`, `acciones-guion.test.ts:70`, `grabar.test.ts:1254` (typed `Disparos`) and others build `{ producir, grabar, voz, armar }`. `tsconfig.json` includes `**/*.ts`, so adding required methods to `Disparos` breaks `pnpm type` in those files.
- **F3. `dispararProcesarMaterial` (lib/acciones/disparos-entorno.ts:92) has no caller** besides `tests/unit/disparos.test.ts` (`grep -rn dispararProcesarMaterial lib app trigger scripts tests`), and it has no attempt: its key is `procesar-material:<id>` for ten minutes.
- **F4. A material has no score.** `puntaje` and `nivel_evidencia` are columns of `teorias` (`lib/supabase/database.types.ts` around line 1582), shown by Ingesta's Semana (`app/(app)/semana/vista-de-semana.tsx:71-73`). `materiales` has neither (`database.types.ts`, `materiales.Row`). What a material has for WAV: `rol` (code), the evidence kinds of its claims (`afirmaciones.evidencia`: estudio, clinica, opinion, testimonio), `costo_estimado_usd`, `costo_confirmado_en`, `motivo_fallo`, `id`, `autor_id`.
- **F5. Row level security lets the maintainer act on materials:** policies "coni y wav editan materiales/fichas" (`supabase/migrations/20261003000100_ingesta.sql:87,106`), and every RPC of this batch starts with `if not (public.es_coni() or public.es_mantenedor())` (`20261003000140_disparo_fallido.sql`, `..._170_confirmar_costo.sql`, `..._330_reprocesar_material.sql`, `..._300_autores.sql:63`); `tests/integration/reintentar-material.test.ts` pins "lets the maintainer retry". So "WAV is refused" comes from `es_coni`: `conSesionDeConi` (`lib/acciones/servidor.ts:43`) and, for the integration tests, a check inside each lib action, as `lib/acciones/guion.ts:84` (`exigirConi`) and `lib/acciones/piezas.ts:961` do.
- **F6. RPC answers:** `reintentar_material`, `reprocesar_material`, `confirmar_costo_material` raise `22023` (`no_reintentable`, `no_reprocesable`, `no_confirmable`) when the material is not in the right state; `crear_autor` returns the existing author's id for the same normalised name or alias and raises `22023 tipo_coni_reservado` for `coni`; `marcar_disparo_fallido` sets `motivo_fallo = 'No pude iniciar el procesamiento. Reintenta.'` on a material still `procesando` without a reason. Column grants: `materiales (autor_id, rol)` and `fichas (resumen, ideas_clave, citas, fuente)` (`..._300_autores.sql:54`, `..._100_ingesta.sql:78`).
- **F7. Storage:** Conidolly's `Almacen` (`lib/proveedores/almacen.ts`) has `subir, bajar, borrar, urlFirmada, urlDeSubida, existe, listar`; `urlFirmada` throws for a missing object and is used by production and the screens' media. Ingesta's (`lib/almacen/almacen.ts`) adds `tamano`, `borrarCarpeta(materialId)`, a `urlFirmada` restricted to `materiales/<uuid>/texto-original.txt` that answers `null` when missing, and `almacenDeEntorno` that refuses `R2_ENDPOINT` with `VERCEL`. The text is written by Conidolly's task at `materiales/<id>/texto-original.txt` (`lib/ingesta/procesar.ts:111`).
- **F8. The E2E has no R2:** `playwright.config.ts` sets no `R2_*` variable; screens sign media through `lib/acciones/medios.ts`, which answers fake `https://almacen.test/...` links under `DISPARO_DE_PRUEBA=1`. Ports in use: app `3200`, fake services `3201`, the https front of the two-app run `3202` (`URL_SEGURA_DE_LA_APP`), Ingesta `3300/3301`. `3203` is free.
- **F9. The E2E run-log parser only knows piece runs:** `tests/e2e/ayudas.ts:57` parses each line with `tarea: z.enum(["producir", "grabar", "voz", "armar"])` and a required `piezaId`; a `procesar-material` line would make `disparosRegistrados()` throw.
- **F10. Design rules that Ingesta's markup breaks:** `tests/unit/diseno-reglas.test.ts` bans `text-[<digit>`, `min-h-(11|12|13|14|16)`, the utilities `text-aviso`/`bg-aviso`/... ("Calma suiza" names) and `text-error` outside `components/ui/{bloque,estado,clases-de-boton,linea-de-error}` and two listed files. Ingesta's `estado-de-material.ts` (`text-aviso`, `text-ok`), `boton-*.tsx` (`text-[1rem] text-error`) and `selector-de-autor.tsx` (`min-h-13`) cannot be copied as they are.
- **F11. Conidolly's pieces:** `PildoraDeEstado` (`components/ui/estado.tsx`) draws `ok` with `Check`, `aviso` with `Warning`, `error` with `WarningCircle` and **`neutro` with no icon**; `Pestanas` (`components/ui/pestanas.tsx`) takes `{ valor, etiqueta, href }` and **no icon**; `Chip` (`components/chip.tsx`) is a client `button` with `aria-pressed`; `MasOpciones` is a native `details`; `DetalleParaWav({ lineas, proveedor })` folds strings (each line is its own React key); `Eleccion` (`components/ui/filas.tsx`) is a radio row for a container with the class `elecciones`; `ConfirmacionEnLinea` (`trato: "gasto" | "destructivo" | "neutro"`) shows its `error` only for `destructivo`; `useAccion` (`components/use-accion.ts`) runs a server action with its pending state, error and the expired-session redirect. No table and no side-panel piece exists.
- **F12. Test styles to mirror:** pure modules and components in `tests/unit` (jsdom; `// @vitest-environment node` for node-only ones); client components import their server actions directly and the tests `vi.mock` the actions module and `next/navigation` (`tests/unit/descartar-pieza.test.tsx`); readers and actions are tested against the local database in `tests/integration` with `clienteDeConi()` / `clienteDelMantenedor()` (`tests/integration/sesion-coni.ts`) and the `pool` of `tests/integration/db.ts` (`tests/integration/datos-pilares.test.ts`, `acciones-ideas.test.ts`); no unit test fakes a Supabase client. MSW blocks every unhandled request (`tests/setup-msw.ts`), except the local Supabase.
- **F13. Schema for seeding:** `temas.centroide` is `vector(1024) not null` (`..._310_afirmaciones_temas.sql:8`); `afirmaciones` needs `material_id, autor_id, tramo, ubicacion, texto (<= 280), cita, tipo, evidencia`; `materiales` needs one of `origen_url, archivo_clave, texto_pegado` (`material_con_contenido`), `rol` defaults to `referente`; `autores.nombre_normalizado` is unique; Coni's author is the row with `tipo = 'coni'`. No E2E spec touches `materiales` today (`grep -ln materiales tests/e2e/*.ts` is empty).
- **F14. Pages read searchParams as a promise** (`app/(app)/calendario/page.tsx:16`), `next.config.ts` has no `cacheComponents` (so `Date.now()` in a server component is allowed), and the proxy already sends a visitor without a session to `/ingreso` for every page.

## Decisions taken while planning (not in the spec)

- **D1. Two layers for actions.** `lib/acciones/biblioteca.ts` is a plain module (deps injected, `aResultado`, `es_coni` checked inside) so the integration tests can run it as Coni and as WAV; `app/(app)/biblioteca/acciones.ts` is the `"use server"` module (`conSesionDeConi` + Zod + `revalidatePath`). This is how `lib/acciones/ideas.ts` and `app/(app)/ideas/acciones.ts` are split. The spec's single `"use server"` `lib/acciones/biblioteca.ts` would leave nothing a test can call as WAV.
- **D2. `DisparosDeBiblioteca` is its own port** (`material(materialId, intento?)`, `motor(semana)`), built by `disparosDeBibliotecaDeEntorno()` and `disparosDeBibliotecaDeLaApp()` next to the existing ones (F2). `dispararProcesarMaterial` is replaced by it (F3). The keys are pure functions: `claveProcesarMaterial(id, intento?)` = `procesar-material:<id>[:<intento>]`, `claveMotor(semana)` = `motor:<semana>`, both with a 10-minute TTL. Each "Reintentar", "Reprocesar" and "Procesar por ~US$ X" passes `crypto.randomUUID()` as the attempt. Test mode writes `{ tarea, materialId, clave }` / `{ tarea, semana, clave }`.
- **D3. A new `urlDeTexto(materialId, segundos)` on `Almacen`** (null when the text is not there, at most one hour, always downloads as `texto-original.txt`), instead of changing `urlFirmada` (F7). `borrarCarpeta(materialId)` takes the id and only ever touches `materiales/<uuid>/`.
- **D4. Widening:** the `(app)` wrapper gets `md:has-[[data-ancho=biblioteca]]:max-w-[70rem]`; the Biblioteca layout renders `<div data-ancho="biblioteca">`. Every other screen keeps 560 px. The bar widens with the column on a computer, as in the mockup.
- **D5. Layout = gate + marker.** The h1 "Biblioteca" and the section nav (`Pestanas` with one entry, "Materiales", icon + name) live in the list page; the detail page has the back link instead ("← Materiales", 4f). `Pestanas` and `PildoraDeEstado` each gain one optional `icono` prop.
- **D6. State words (4j):** Listo (`ok`, check), Con error (`error`, warning circle), Procesando (`neutro`, hourglass), En pausa (`aviso`, pause: `procesando` with a reason, such as the monthly cap or a run that could not start), Espera tu OK (`aviso`, hand: cost waiting for confirmation). The quick filters show a count only above zero ("Procesando · 2"; "Procesando" when none, fix 4i).
- **D7. Upload dates** in `America/Santiago`: "Hoy", "Ayer", "Hace N días" (2 to 6), then "20 de octubre", and "24 de diciembre de 2025" in another year. The mockup's "Lunes" is not used: with "Hace 2 días" in the same column, a weekday would make two ways of saying the same distance.
- **D8. Main topic:** over the non-excluded claims with a topic, the topic with the most claims; a tie goes to the name first in Spanish order; "+N" counts the other topics. The pure function receives `excluida` and ignores those rows, so the rule lives in one tested place; the reader passes every claim of the listed materials, paged by id. A claim of a merged topic counts under the topic id it points to (as Ingesta's map does).
- **D9. The side panel's "Ideas sacadas"** are the material's non-excluded claims (count and the first two by `creada_en`); for a material of role `estrategia`, which has a card instead of claims, they are the card's key ideas.
- **D10. "Detalle para WAV"** of a material (panel and detail): `Papel: <code>`, `Evidencia: Estudio 3 · Opinión 2`, `Motivo: <motivo_fallo>`, `Costo estimado: US$ 1,20 (confirmado | sin confirmar)`, `Material: <id>`, `Autor: <id>`. There is no "Puntaje" line (F4): it arrives with Semana (batch 5). The phone card shows no `motivo_fallo` (it can be a code).
- **D11. "Reintentar" and "Reprocesar" confirm in line** (`ConfirmacionEnLinea`, `trato="gasto"`), one shared client piece `BotonQuePregunta`; "Procesar por ~US$ X" is its own confirmation (the price is on the button). On a computer the table rows carry no buttons: they are in the side panel.
- **D12. Download:** a plain `<a href="/biblioteca/materiales/<id>/texto">` (no `Link` prefetch) to a route handler that checks Coni with `conSesionDeConi` and answers `302` to the signed URL, or `404` with the reason in plain text, both `cache-control: no-store` (as Ingesta's `texto/route.ts`).
- **D13. The error page is tested in a unit test.** No E2E hook can make a reader fail on demand without adding a test switch to production code; the not-found page is tested in E2E.
- **D14. E2E fake S3** = Ingesta's `tests/e2e/almacen-falso.ts`, split into `almacen-falso-servidor.ts` (exports `crearAlmacenFalso()`, unit-tested against the real `almacenR2`) and `almacen-falso.ts` (listens on `PUERTO + 3`, 3203). The app of the run gets `R2_ACCOUNT_ID=cuenta-e2e`, `R2_ACCESS_KEY_ID=llave-e2e`, `R2_SECRET_ACCESS_KEY=secreto-e2e`, `R2_BUCKET=conidolly-e2e`, `R2_ENDPOINT=http://127.0.0.1:3203`.
- **D15. Desktop E2E project** `escritorio`: files `tests/e2e/*.escritorio.ts` (so the phone project's `*.spec.ts` never runs them), Chromium at 1280 x 900, Coni's stored session.
- **D16. The E2E run owns `materiales`:** `vaciarBiblioteca()` deletes every material and the scene's topics and author; the scene calls it first and the global teardown last.
- **D17. Author picker** lives in `app/(app)/biblioteca/selector-de-autor.tsx` (Subir reuses it in batch 2), with a small `campo.tsx` (label, field, hint) ported from Ingesta's `components/campo.tsx`.
- **D18. Simple words (4h)** in `lib/dominio/biblioteca/palabras.ts`: "Papel" → "¿Quién es para ti?", "Afirmaciones" → "Ideas sacadas", "Tipos de afirmación" → "Qué tipo de idea es" (from the pedido's `PALABRAS_SIMPLES`); "Puntaje" and "Evidencia" only inside "Detalle para WAV". A unit test also scans `app/(app)/biblioteca/` for the old words in visible text.

## File structure

New (all paths from `CONIDOLLY`):

| File | Responsibility |
|---|---|
| `lib/dominio/biblioteca/modelo.ts` | types, roles and their labels (Coni's from Ingesta), type labels, kinds of new author |
| `lib/dominio/biblioteca/estado.ts` | waiting for OK, retryable, processing; `presentarEstado` (word + pill kind + icon) |
| `lib/dominio/biblioteca/filtros.ts` | filters and selection from the URL, `hrefDeLista` |
| `lib/dominio/biblioteca/etiquetas.ts` | words for claim types and evidence kinds |
| `lib/dominio/biblioteca/ficha.ts` | the card's shape, quote location, adaptation line, edit validation |
| `lib/dominio/biblioteca/autores.ts` | `AutorDeLista`, search and look-alikes |
| `lib/dominio/biblioteca/mapa.ts` | `armarMapa`, `masFrecuentesPrimero` |
| `lib/dominio/biblioteca/temas.ts` | `temasPrincipales`, `textoDeTema` |
| `lib/dominio/biblioteca/fechas.ts` | `subidoHace`, `subidoEnFrase`, `ZONA_DE_LA_BIBLIOTECA` |
| `lib/dominio/biblioteca/palabras.ts` | fix 4h words, `ideasSacadas` |
| `lib/dominio/biblioteca/detalle.ts` | `lineasParaWav` |
| `lib/datos/paginas.ts` | `leerTodas` past PostgREST's 1000 rows |
| `lib/datos/biblioteca.ts` | `listarMateriales`, `contarPorEstado`, `leerMaterialConFicha`, `leerMapaDelMaterial`, `leerPanelDelMaterial`, `listarAutores` |
| `lib/acciones/biblioteca.ts` | the actions with injected deps and their Zod schemas |
| `app/(app)/biblioteca/acciones.ts` | `"use server"` wrappers |
| `app/(app)/biblioteca/layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` | the section shell |
| `app/(app)/biblioteca/page.tsx` | Materiales: list, table, panel |
| `app/(app)/biblioteca/nav-de-biblioteca.tsx` | section nav |
| `app/(app)/biblioteca/estado-de-material.tsx`, `tema-del-material.tsx` | the state pill, the main topic |
| `app/(app)/biblioteca/filtros-rapidos.tsx`, `mas-filtros.tsx`, `campo.tsx` | filters |
| `app/(app)/biblioteca/boton-que-pregunta.tsx`, `boton-reintentar.tsx`, `boton-confirmar-costo.tsx` | buttons that start processing |
| `app/(app)/biblioteca/tarjeta-de-material.tsx`, `tabla-de-materiales.tsx`, `panel-de-material.tsx` | phone card, desktop table, side panel |
| `app/(app)/biblioteca/selector-de-autor.tsx` | pick or add an author |
| `app/(app)/biblioteca/materiales/[id]/page.tsx` | full detail |
| `app/(app)/biblioteca/materiales/[id]/{editar-autor-y-rol,ficha-editable,mapa-del-material,boton-reprocesar}.tsx` | detail pieces |
| `app/(app)/biblioteca/materiales/[id]/texto/route.ts` | signed download of the original text |
| `tests/e2e/almacen-falso-servidor.ts`, `tests/e2e/almacen-falso.ts` | fake S3 of the run |
| `tests/e2e/biblioteca-escena.ts` | the run's materials |
| `tests/e2e/biblioteca.spec.ts`, `tests/e2e/biblioteca.escritorio.ts` | phone and desktop E2E |
| `tests/integration/siembra-biblioteca.ts` | seeding helpers for the integration tests |

Modified: `lib/acciones/disparos.ts`, `lib/acciones/disparos-entorno.ts`, `lib/acciones/servidor.ts`, `lib/proveedores/almacen.ts`, `components/ui/estado.tsx`, `components/ui/pestanas.tsx`, `app/(app)/layout.tsx`, `playwright.config.ts`, `tests/e2e/entorno.ts`, `tests/e2e/ayudas.ts`, `tests/e2e/limpiar.ts`, `tests/unit/disparos.test.ts`, `tests/unit/almacen.test.ts`, `tests/unit/almacen-r2.test.ts`, `.env.example`, `docs/TRASPASO.md`; later `tests/e2e/visual.spec.ts` and snapshots (Task 32).

Not touched: `components/nav-inferior.tsx`, `app/ir-a-biblioteca/`, `supabase/`, `trigger/`, Ingesta.

## Suggested implementer batches

| Batch | Tasks | Theme |
|---|---|---|
| A | 1, 2, 3 | ports: disparos, almacén, fake S3 |
| B | 4, 5, 6, 7, 8, 9 | pure domain |
| C | 10, 11, 12, 13 | readers, actions, server actions and download route |
| D | 14, 15, 16 | shell |
| E | 17, 18, 19, 20, 21, 22 | Materiales list, table and panel |
| F | 23, 24, 25, 26, 27 | full detail |
| G | 28, 29, 30, 31 | E2E (phone, desktop, axe, large text, design rules) |
| Release | 32 to 35 | baselines after Federico looks, gate, review, release |

---

# Part A: Foundations

### Task 1: the Biblioteca's runs, with a key per attempt

**Files:**
- Modify: `lib/acciones/disparos.ts`
- Modify: `lib/acciones/disparos-entorno.ts`
- Modify: `lib/acciones/servidor.ts`
- Test: `tests/unit/disparos.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/disparos.test.ts`, replace the two import lines of `@/lib/acciones/disparos` and `@/lib/acciones/disparos-entorno` with:

```ts
import {
  claveArmar,
  claveGrabar,
  claveMotor,
  claveProcesarMaterial,
  claveProducir,
  claveVoz,
} from "@/lib/acciones/disparos"
import { disparosDeBibliotecaDeEntorno, disparosDeEntorno } from "@/lib/acciones/disparos-entorno"
```

and replace the whole `describe("dispararProcesarMaterial", ...)` block with:

```ts
describe("claveProcesarMaterial", () => {
  const ID = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

  it("is one key per material, and one per attempt when an attempt is given", () => {
    expect(claveProcesarMaterial(ID)).toBe(`procesar-material:${ID}`)
    expect(claveProcesarMaterial(ID, "intento-1")).toBe(`procesar-material:${ID}:intento-1`)
  })

  it("gives two attempts two keys, so a retry within ten minutes never reuses the run that failed", () => {
    expect(claveProcesarMaterial(ID, "intento-1")).not.toBe(claveProcesarMaterial(ID, "intento-2"))
    expect(claveProcesarMaterial(ID, "intento-1")).not.toBe(claveProcesarMaterial(ID))
  })
})

describe("claveMotor", () => {
  it("is one key per week", () => {
    expect(claveMotor("2026-11-02")).toBe("motor:2026-11-02")
    expect(claveMotor("2026-11-09")).not.toBe(claveMotor("2026-11-02"))
  })
})

describe("disparosDeBibliotecaDeEntorno", () => {
  const ID = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

  it("records each attempt with its own key instead of starting it when DISPARO_DE_PRUEBA is on", async () => {
    const archivo = join(mkdtempSync(join(tmpdir(), "disparos-")), "registro.jsonl")
    const disparos = disparosDeBibliotecaDeEntorno({ DISPARO_DE_PRUEBA: "1", DISPARO_DE_PRUEBA_ARCHIVO: archivo })

    await disparos.material(ID, "intento-1")
    await disparos.material(ID, "intento-2")
    await disparos.motor("2026-11-02")

    const lineas = readFileSync(archivo, "utf-8").trim().split("\n")
    expect(lineas.map((linea) => JSON.parse(linea))).toEqual([
      { tarea: "procesar-material", materialId: ID, clave: `procesar-material:${ID}:intento-1` },
      { tarea: "procesar-material", materialId: ID, clave: `procesar-material:${ID}:intento-2` },
      { tarea: "motor-manual", semana: "2026-11-02", clave: "motor:2026-11-02" },
    ])
  })

  it("never records instead of starting when it runs on Vercel", () => {
    expect(() => disparosDeBibliotecaDeEntorno({ DISPARO_DE_PRUEBA: "1", VERCEL: "1" })).toThrow(FallaDeConfiguracion)
  })

  it("asks for the Trigger.dev key before starting anything for real", () => {
    expect(() => disparosDeBibliotecaDeEntorno({})).toThrow(FallaDeConfiguracion)
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `pnpm exec vitest run tests/unit/disparos.test.ts`
Expected: FAIL, `claveProcesarMaterial is not a function` (and the same for `claveMotor` and `disparosDeBibliotecaDeEntorno`).

- [ ] **Step 3: Add the port and the keys.** Append to `lib/acciones/disparos.ts`:

```ts
/**
 * The runs of the Biblioteca (change 29b): process a material, and the weekly engine by hand (used from batch 5).
 * Apart from `Disparos`, so the pieces' starters and their test doubles stay as they are.
 */
export interface DisparosDeBiblioteca {
  /** `intento`: Reintentar, Reprocesar and "Procesar por ~US$ X" each pass a new one, so a failed run is never reused. */
  material(materialId: string, intento?: string): Promise<void>
  motor(semana: string): Promise<void>
}

/** Ingesta's key (`lib/ingesta/disparo.ts`): ten minutes per material, plus the attempt when there is one. */
export function claveProcesarMaterial(materialId: string, intento?: string): string {
  return `procesar-material:${materialId}${intento ? `:${intento}` : ""}`
}

/** "Proponer ahora": one run per week for ten minutes; the engine itself answers a finished week with nothing to do. */
export function claveMotor(semana: string): string {
  return `motor:${semana}`
}
```

- [ ] **Step 4: Replace `dispararProcesarMaterial` with the Biblioteca's starters.** In `lib/acciones/disparos-entorno.ts`:
  - add `import type { motorManualTask } from "@/trigger/motor-semanal"` next to the other `@/trigger` type imports;
  - change `import type { Disparos } from "./disparos"` to `import { claveMotor, claveProcesarMaterial, type Disparos, type DisparosDeBiblioteca } from "./disparos"`;
  - delete the whole `dispararProcesarMaterial` function and its comment, and append:

```ts
function disparosDeBibliotecaReales(): DisparosDeBiblioteca {
  return {
    async material(materialId, intento) {
      await tasks.trigger<typeof procesarMaterialTask>(
        "procesar-material",
        { materialId },
        { idempotencyKey: await claveGlobal(claveProcesarMaterial(materialId, intento)), idempotencyKeyTTL: "10m" },
      )
    },
    async motor(semana) {
      await tasks.trigger<typeof motorManualTask>(
        "motor-manual",
        { manual: true },
        { idempotencyKey: await claveGlobal(claveMotor(semana)), idempotencyKeyTTL: "10m" },
      )
    },
  }
}

function disparosDeBibliotecaDePrueba(archivo: string): DisparosDeBiblioteca {
  const anotar = (linea: Record<string, unknown>) => appendFileSync(archivo, `${JSON.stringify(linea)}\n`)
  return {
    material: async (materialId, intento) =>
      anotar({ tarea: "procesar-material", materialId, clave: claveProcesarMaterial(materialId, intento) }),
    motor: async (semana) => anotar({ tarea: "motor-manual", semana, clave: claveMotor(semana) }),
  }
}

/** Trigger.dev in production; a file when `DISPARO_DE_PRUEBA=1`, which a deployed app refuses. */
export function disparosDeBibliotecaDeEntorno(entorno: Entorno = process.env): DisparosDeBiblioteca {
  const archivo = archivoDeDisparoDePrueba(entorno)
  if (archivo) return disparosDeBibliotecaDePrueba(archivo)
  exigirLlaveDeTrigger(entorno)
  return disparosDeBibliotecaReales()
}
```

- [ ] **Step 5: Resolve them on use in the app.** In `lib/acciones/servidor.ts` change the two imports to `import type { Disparos, DisparosDeBiblioteca } from "./disparos"` and `import { disparosDeBibliotecaDeEntorno, disparosDeEntorno } from "./disparos-entorno"`, and add after `disparosDeLaApp`:

```ts
/** The Biblioteca's starters, resolved on use like `disparosDeLaApp`. */
export function disparosDeBibliotecaDeLaApp(): DisparosDeBiblioteca {
  return {
    material: (materialId, intento) => disparosDeBibliotecaDeEntorno().material(materialId, intento),
    motor: (semana) => disparosDeBibliotecaDeEntorno().motor(semana),
  }
}
```

- [ ] **Step 6: Run it green, and type-check.**

Run: `pnpm exec vitest run tests/unit/disparos.test.ts && pnpm type`
Expected: PASS; `tsc` without errors (no other file used `dispararProcesarMaterial`, F3).

- [ ] **Step 7: Commit.**

```bash
pnpm exec biome check --write lib/acciones/disparos.ts lib/acciones/disparos-entorno.ts lib/acciones/servidor.ts tests/unit/disparos.test.ts
git add lib/acciones/disparos.ts lib/acciones/disparos-entorno.ts lib/acciones/servidor.ts tests/unit/disparos.test.ts
git commit -m "$(cat <<'EOF'
Start material runs with a key per attempt, and the manual engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: the store measures, signs the original text, deletes a material's folder, and takes a local endpoint

**Files:**
- Modify: `lib/proveedores/almacen.ts`
- Modify: `.env.example`
- Test: `tests/unit/almacen.test.ts`, `tests/unit/almacen-r2.test.ts`

- [ ] **Step 1: Write the failing in-memory tests.** Append to `tests/unit/almacen.test.ts`:

```ts
describe("almacenEnMemoria for the Biblioteca", () => {
  const ID = "11111111-2222-4333-8444-555555555555"
  const OTRO = "99999999-2222-4333-8444-555555555555"
  const TEXTO = `materiales/${ID}/texto-original.txt`

  it("measures an object and answers null for one that is not there", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir(TEXTO, MP3, "text/plain")

    expect(await almacen.tamano(TEXTO)).toBe(MP3.byteLength)
    expect(await almacen.tamano("nada")).toBeNull()
  })

  it("deletes every object of one material and nothing else", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir(TEXTO, MP3, "text/plain")
    await almacen.subir(claveMaterial(ID, "pdf"), MP3, "application/pdf")
    await almacen.subir(`materiales/${OTRO}/texto-original.txt`, MP3, "text/plain")

    expect(await almacen.borrarCarpeta(ID)).toBe(2)
    expect(almacen.claves()).toEqual([`materiales/${OTRO}/texto-original.txt`])
  })

  it("refuses a folder that is not a material's", async () => {
    await expect(almacenEnMemoria().borrarCarpeta("../voces")).rejects.toThrow(FallaDeConfiguracion)
  })

  it("signs the download of the original text, always as texto-original.txt", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir(TEXTO, MP3, "text/plain")

    expect(await almacen.urlDeTexto(ID, 300)).toBe(`https://almacen.test/${TEXTO}?expira=300&descarga=texto-original.txt`)
  })

  it("answers null while the text is not there, and refuses an expiry over an hour or an id that is not a UUID", async () => {
    const almacen = almacenEnMemoria()

    expect(await almacen.urlDeTexto(ID, 300)).toBeNull()
    await expect(almacen.urlDeTexto(ID, 3601)).rejects.toThrow(FallaDeConfiguracion)
    await expect(almacen.urlDeTexto("../x", 300)).rejects.toThrow(FallaDeConfiguracion)
  })
})
```

- [ ] **Step 2: Write the failing R2 tests.** In `tests/unit/almacen-r2.test.ts` (which already imports `http`, `HttpResponse`, `servidor`, `FallaDeConfiguracion`, `almacenR2`, `almacenReal` and defines `capturando`, `errorS3`, `rechazo`, `r2`, `CUENTA`, `LLAVE`, `SECRETO`, `BALDE`), append before `describe("almacenReal", ...)`:

```ts
describe("almacenR2 for the Biblioteca", () => {
  const ID = "11111111-2222-4333-8444-555555555555"
  const TEXTO = `materiales/${ID}/texto-original.txt`
  const LISTA = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>${TEXTO}</Key><Size>3</Size></Contents><Contents><Key>materiales/${ID}/original.pdf</Key><Size>9</Size></Contents></ListBucketResult>`

  it("tamano asks with HEAD and reads the length", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 200, headers: { "Content-Length": "42" } }))

    expect(await r2().tamano(TEXTO)).toBe(42)
    expect(capturas.map((c) => c.metodo)).toEqual(["HEAD"])
  })

  it("tamano answers null for an object that is not there", async () => {
    capturando(() => new HttpResponse(null, { status: 404 }))
    expect(await r2().tamano(TEXTO)).toBeNull()
  })

  it("tamano rejects any other failure without the secret", async () => {
    capturando(errorS3("InternalError", `boom ${SECRETO}`, 500))
    const error = await rechazo(r2().tamano(TEXTO))
    expect(error.message).not.toContain(SECRETO)
  })

  it("borrarCarpeta lists the material's folder and deletes each key in it", async () => {
    let llamadas = 0
    const { capturas } = capturando(() =>
      llamadas++ === 0
        ? new HttpResponse(LISTA, { status: 200, headers: { "Content-Type": "application/xml" } })
        : new HttpResponse(null, { status: 204 }),
    )

    expect(await r2().borrarCarpeta(ID)).toBe(2)
    expect(capturas[0]?.url.searchParams.get("prefix")).toBe(`materiales/${ID}/`)
    expect(capturas.slice(1).map((c) => `${c.metodo} ${c.url.pathname}`)).toEqual([
      `DELETE /${BALDE}/${TEXTO}`,
      `DELETE /${BALDE}/materiales/${ID}/original.pdf`,
    ])
  })

  it("borrarCarpeta refuses an id that is not a UUID without calling R2", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 204 }))
    await expect(r2().borrarCarpeta("../voces")).rejects.toThrow(FallaDeConfiguracion)
    expect(capturas).toEqual([])
  })

  it("urlDeTexto checks the text with HEAD and signs a GET that downloads as texto-original.txt", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))

    const url = new URL((await r2().urlDeTexto(ID, 300)) ?? "")

    expect(url.pathname).toBe(`/${BALDE}/${TEXTO}`)
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300")
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="texto-original.txt"')
    expect(url.href).not.toContain(SECRETO)
    expect(capturas.map((c) => c.metodo)).toEqual(["HEAD"])
  })

  it("urlDeTexto answers null while the text is not there", async () => {
    capturando(() => new HttpResponse(null, { status: 404 }))
    expect(await r2().urlDeTexto(ID, 300)).toBeNull()
  })

  it("urlDeTexto refuses an expiry over an hour and an id that is not a UUID, without calling R2", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))
    await expect(r2().urlDeTexto(ID, 3601)).rejects.toThrow(FallaDeConfiguracion)
    await expect(r2().urlDeTexto("../voces", 300)).rejects.toThrow(FallaDeConfiguracion)
    expect(capturas).toEqual([])
  })
})

describe("almacenR2 with a local endpoint (the E2E fake)", () => {
  const ID = "11111111-2222-4333-8444-555555555555"

  it("talks to the endpoint given instead of the account's host", async () => {
    const pedidos: string[] = []
    servidor.use(
      http.all("http://127.0.0.1:9999/*", ({ request }) => {
        pedidos.push(`${request.method} ${new URL(request.url).pathname}`)
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const almacen = almacenR2({ cuenta: CUENTA, llave: LLAVE, secreto: SECRETO, balde: BALDE, endpoint: "http://127.0.0.1:9999" })

    const url = new URL((await almacen.urlDeTexto(ID, 300)) ?? "")

    expect(url.host).toBe("127.0.0.1:9999")
    expect(pedidos).toEqual([`HEAD /${BALDE}/materiales/${ID}/texto-original.txt`])
  })
})
```

and inside the existing `describe("almacenReal", ...)`, after the `it.each(...)`, add:

```ts
  it("uses R2_ENDPOINT for a local run", async () => {
    const pedidos: string[] = []
    servidor.use(
      http.all("http://127.0.0.1:9999/*", ({ request }) => {
        pedidos.push(request.method)
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const url = new URL(
      (await almacenReal({ ...VARIABLES, R2_ENDPOINT: "http://127.0.0.1:9999" }).urlDeTexto(
        "11111111-2222-4333-8444-555555555555",
        60,
      )) ?? "",
    )
    expect(url.host).toBe("127.0.0.1:9999")
    expect(pedidos).toEqual(["HEAD"])
  })

  it("refuses R2_ENDPOINT on Vercel: nothing would reach the real bucket", () => {
    expect(() => almacenReal({ ...VARIABLES, R2_ENDPOINT: "http://127.0.0.1:9999", VERCEL: "1" })).toThrow(
      FallaDeConfiguracion,
    )
  })
```

- [ ] **Step 3: Run them and see them fail.**

Run: `pnpm exec vitest run tests/unit/almacen.test.ts tests/unit/almacen-r2.test.ts`
Expected: FAIL, `almacen.tamano is not a function`, `borrarCarpeta is not a function`, `urlDeTexto is not a function`, and `pnpm type` would report `endpoint` unknown in `OpcionesR2` and `almacenReal` taking no argument.

- [ ] **Step 4: Implement.** In `lib/proveedores/almacen.ts`:

  a. Add to `interface Almacen`:

```ts
  /** The size in bytes of the object, `null` when it is not there; any other failure rejects. */
  tamano(clave: string): Promise<number | null>
  /** Deletes every object under `materiales/<id>/` and says how many; it touches no other folder. */
  borrarCarpeta(materialId: string): Promise<number>
  /**
   * A signed GET of a material's original text (`materiales/<id>/texto-original.txt`) that downloads as
   * `texto-original.txt`, for at most an hour; `null` while the text is not there. Nothing else is signed this way.
   */
  urlDeTexto(materialId: string, segundos: number): Promise<string | null>
```

  b. After `exigirNombreDeDescarga`, add:

```ts
/** A download link is for right now: an hour is the most it may ask. */
const VIGENCIA_MAXIMA_DESCARGA_SEGUNDOS = 60 * 60
const ARCHIVO_DE_TEXTO = "texto-original.txt"

function exigirVigenciaDeDescarga(segundos: number): void {
  if (!Number.isInteger(segundos) || segundos <= 0 || segundos > VIGENCIA_MAXIMA_DESCARGA_SEGUNDOS) {
    throw new FallaDeConfiguracion(
      `Un link de descarga necesita una vigencia de 1 a ${VIGENCIA_MAXIMA_DESCARGA_SEGUNDOS} segundos enteros: ${segundos}`,
    )
  }
}

/** The folder of a material, with the id checked: the only prefix the Biblioteca ever deletes. */
function carpetaDeMaterial(materialId: string): string {
  if (!UUID_DE_MATERIAL.test(materialId)) {
    throw new FallaDeConfiguracion(`El id del material no es un UUID: ${materialId}`)
  }
  return `${PREFIJO_DE_MATERIALES}${materialId.toLowerCase()}/`
}

function claveDeTexto(materialId: string): string {
  return `${carpetaDeMaterial(materialId)}${ARCHIVO_DE_TEXTO}`
}
```

  and right after `const ORDEN_MAXIMO = 20` add `const UUID_DE_MATERIAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (the later `UUID` constant is declared after these helpers, so the folder check gets its own).

  c. In `almacenEnMemoria()`, add these members to the returned object (after `listar`):

```ts
    async tamano(clave) {
      return objetos.get(clave)?.datos.byteLength ?? null
    },
    async borrarCarpeta(materialId) {
      const prefijo = carpetaDeMaterial(materialId)
      const claves = [...objetos.keys()].filter((clave) => clave.startsWith(prefijo))
      for (const clave of claves) objetos.delete(clave)
      return claves.length
    },
    async urlDeTexto(materialId, segundos) {
      const clave = claveDeTexto(materialId)
      exigirVigenciaDeDescarga(segundos)
      if (!objetos.has(clave)) return null
      return `https://almacen.test/${clave}?expira=${segundos}&descarga=${ARCHIVO_DE_TEXTO}`
    },
```

  d. In `OpcionesR2` add `/** Only for local runs: a fake S3 on this machine instead of the account's R2 host. */ endpoint?: string`; in `almacenR2` destructure `endpoint` and use `endpoint: endpoint ?? \`https://${cuenta}.r2.cloudflarestorage.com\`` in the `S3Client`; add these members to the returned object (after `listar`):

```ts
    tamano: async (clave) => {
      try {
        const { ContentLength } = await cliente.send(new HeadObjectCommand({ Bucket: balde, Key: clave }))
        return ContentLength ?? 0
      } catch (error) {
        if (esNoEncontrado(error)) return null
        throw fallaDeR2("medir", clave, error, secretos)
      }
    },
    borrarCarpeta: async (materialId) => {
      const prefijo = carpetaDeMaterial(materialId)
      const claves = await envolver("listar", prefijo, async () => {
        // https://developers.cloudflare.com/r2/api/s3/api/ : ListObjectsV2 with `prefix` and `continuation-token`.
        const encontradas: string[] = []
        let siguiente: string | undefined
        do {
          const pagina = await cliente.send(
            new ListObjectsV2Command({ Bucket: balde, Prefix: prefijo, ContinuationToken: siguiente }),
          )
          for (const objeto of pagina.Contents ?? []) {
            if (objeto.Key?.startsWith(prefijo)) encontradas.push(objeto.Key)
          }
          siguiente = pagina.IsTruncated ? pagina.NextContinuationToken : undefined
        } while (siguiente !== undefined)
        return encontradas
      })
      for (const clave of claves) {
        await envolver("borrar", clave, async () => {
          await cliente.send(new DeleteObjectCommand({ Bucket: balde, Key: clave }))
        })
      }
      return claves.length
    },
    urlDeTexto: async (materialId, segundos) => {
      const clave = claveDeTexto(materialId)
      exigirVigenciaDeDescarga(segundos)
      try {
        // The same contract as the in-memory store: no link for a text that is not there.
        await cliente.send(new HeadObjectCommand({ Bucket: balde, Key: clave }))
      } catch (error) {
        if (esNoEncontrado(error)) return null
        throw fallaDeR2("firmar", clave, error, secretos)
      }
      return envolver("firmar", clave, () =>
        getSignedUrl(
          cliente,
          new GetObjectCommand({
            Bucket: balde,
            Key: clave,
            ResponseContentDisposition: `attachment; filename="${ARCHIVO_DE_TEXTO}"`,
          }),
          { expiresIn: segundos },
        ),
      )
    },
```

  e. Replace `almacenReal` with:

```ts
/**
 * The store of the tasks and the app, from the R2 variables. `R2_ENDPOINT` (a fake S3 for the local E2E run) is
 * refused on Vercel, where nothing would then reach the real bucket.
 */
export function almacenReal(entorno: Record<string, string | undefined> = process.env): Almacen {
  if (entorno.R2_ENDPOINT && entorno.VERCEL) {
    throw new FallaDeConfiguracion("R2_ENDPOINT no puede estar activo en Vercel: nada llegaría al bucket real.")
  }
  return almacenR2({
    cuenta: exigirEnv("R2_ACCOUNT_ID", entorno.R2_ACCOUNT_ID),
    llave: exigirEnv("R2_ACCESS_KEY_ID", entorno.R2_ACCESS_KEY_ID),
    secreto: exigirEnv("R2_SECRET_ACCESS_KEY", entorno.R2_SECRET_ACCESS_KEY),
    balde: exigirEnv("R2_BUCKET", entorno.R2_BUCKET),
    endpoint: entorno.R2_ENDPOINT || undefined,
  })
}
```

  f. In `.env.example`, under `R2_BUCKET=`, add:

```
# Only for the local E2E run: a fake S3 on this machine (playwright.config.ts sets it). Refused on Vercel.
# R2_ENDPOINT=
```

- [ ] **Step 5: Run green, plus everything that uses the store.**

Run: `pnpm exec vitest run tests/unit/almacen.test.ts tests/unit/almacen-r2.test.ts && pnpm type && pnpm test:run`
Expected: PASS; no type error (callers of `almacenReal()` keep working with the default).

- [ ] **Step 6: Commit.**

```bash
pnpm exec biome check --write lib/proveedores/almacen.ts tests/unit/almacen.test.ts tests/unit/almacen-r2.test.ts
git add lib/proveedores/almacen.ts tests/unit/almacen.test.ts tests/unit/almacen-r2.test.ts .env.example
git commit -m "$(cat <<'EOF'
Measure, sign the original text and delete a material's folder in R2

Adds R2_ENDPOINT for the local E2E fake, refused on Vercel.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: the fake S3 of the E2E run, and the run's logs of material runs

**Files:**
- Create: `tests/e2e/almacen-falso-servidor.ts`, `tests/e2e/almacen-falso.ts`
- Modify: `tests/e2e/entorno.ts`, `playwright.config.ts`, `tests/e2e/ayudas.ts`
- Test: `tests/unit/almacen-falso.test.ts`

- [ ] **Step 1: Write the failing round-trip test.** Create `tests/unit/almacen-falso.test.ts`:

```ts
// @vitest-environment node
import type { Server } from "node:http"
import { http, passthrough } from "msw"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { almacenR2, claveMaterial } from "@/lib/proveedores/almacen"
import { crearAlmacenFalso } from "../e2e/almacen-falso-servidor"
import { servidor } from "../msw"

const ID = "11111111-2222-4333-8444-555555555555"
let falso: Server
let puerto = 0

beforeAll(async () => {
  falso = crearAlmacenFalso()
  await new Promise<void>((listo) => falso.listen(0, "127.0.0.1", listo))
  const direccion = falso.address()
  if (direccion === null || typeof direccion === "string") throw new Error("El almacén falso no tiene puerto")
  puerto = direccion.port
})

afterAll(async () => {
  await new Promise<void>((cerrado) => falso.close(() => cerrado()))
})

// MSW blocks every request it does not know: this one is the fake on this machine.
beforeEach(() => servidor.use(http.all(`http://127.0.0.1:${puerto}/*`, () => passthrough())))

describe("the fake S3 of the E2E run", () => {
  it("takes a presigned PUT, then the real store code measures, signs the text download, serves it and deletes the folder", async () => {
    const almacen = almacenR2({
      cuenta: "cuenta-e2e",
      llave: "llave-e2e",
      secreto: "secreto-e2e",
      balde: "conidolly-e2e",
      endpoint: `http://127.0.0.1:${puerto}`,
    })
    const original = claveMaterial(ID, "pdf")

    const subida = await almacen.urlDeSubida(original, 600, "application/pdf")
    const puesto = await fetch(subida, { method: "PUT", body: "pdf", headers: { "content-type": "application/pdf" } })
    expect(puesto.status).toBe(200)
    expect(await almacen.tamano(original)).toBe(3)

    await almacen.subir(`materiales/${ID}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    const descarga = await fetch((await almacen.urlDeTexto(ID, 300)) ?? "")
    expect(await descarga.text()).toBe("hola")
    expect(descarga.headers.get("content-disposition")).toBe('attachment; filename="texto-original.txt"')

    expect(await almacen.borrarCarpeta(ID)).toBe(2)
    expect(await almacen.tamano(original)).toBeNull()
    expect(await almacen.urlDeTexto(ID, 300)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `pnpm exec vitest run tests/unit/almacen-falso.test.ts`
Expected: FAIL, `Failed to resolve import "../e2e/almacen-falso-servidor"`.

- [ ] **Step 3: Port Ingesta's fake as a factory.** Create `tests/e2e/almacen-falso-servidor.ts` with the body of Ingesta's `tests/e2e/almacen-falso.ts` (`/Users/fede/Projects/conidolly-ingesta/tests/e2e/almacen-falso.ts`), wrapped in a function that returns the server instead of listening:

```ts
// The R2 of the E2E run (ported from Ingesta's tests/e2e/almacen-falso.ts): a tiny S3 on this machine that accepts the
// browser's presigned PUT, answers HEAD, serves GET (honouring response-content-disposition), lists a prefix and
// deletes a key, so the app signs, measures, downloads and deletes with its real code and nothing real is reachable.
// GET /__objetos lists what it holds with the size and content type of each object.
import { createServer, type Server } from "node:http"

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "PUT, HEAD, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-expose-headers": "etag",
}

export function crearAlmacenFalso(): Server {
  const objetos = new Map<string, { bytes: number; tipo: string; firmada: boolean; datos: Buffer }>()

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const clave = decodeURIComponent(url.pathname)

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (url.pathname === "/__salud") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end('{"ok":true}')
      return
    }
    if (url.pathname === "/__objetos") {
      res.writeHead(200, { "content-type": "application/json", ...CORS })
      res.end(
        JSON.stringify(
          Object.fromEntries([...objetos].map(([k, { bytes, tipo, firmada }]) => [k, { bytes, tipo, firmada }])),
        ),
      )
      return
    }
    if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
      // ListObjectsV2 of one bucket: the keys under `prefix`, without the bucket in front.
      const base = `${url.pathname.replace(/\/$/, "")}/`
      const prefijo = url.searchParams.get("prefix") ?? ""
      const contenidos = [...objetos]
        .filter(([k]) => k.startsWith(`${base}${prefijo}`))
        .map(([k, { bytes }]) => `<Contents><Key>${k.slice(base.length)}</Key><Size>${bytes}</Size></Contents>`)
      res.writeHead(200, { "content-type": "application/xml", ...CORS })
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated>${contenidos.join("")}</ListBucketResult>`,
      )
      return
    }
    if (req.method === "GET") {
      const objeto = objetos.get(clave)
      if (!objeto) {
        res.writeHead(404, CORS)
        res.end()
        return
      }
      const descarga = url.searchParams.get("response-content-disposition")
      res.writeHead(200, {
        ...CORS,
        "content-type": objeto.tipo || "application/octet-stream",
        "content-length": String(objeto.bytes),
        ...(descarga ? { "content-disposition": descarga } : {}),
      })
      res.end(objeto.datos)
      return
    }
    if (req.method === "DELETE") {
      objetos.delete(clave)
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method === "PUT") {
      const trozos: Buffer[] = []
      req.on("data", (trozo: Buffer) => {
        trozos.push(trozo)
      })
      req.on("end", () => {
        const datos = Buffer.concat(trozos)
        objetos.set(clave, {
          bytes: datos.byteLength,
          tipo: req.headers["content-type"] ?? "",
          firmada: url.searchParams.has("X-Amz-Signature"),
          datos,
        })
        res.writeHead(200, { ...CORS, etag: '"falso"' })
        res.end()
      })
      return
    }
    if (req.method === "HEAD") {
      const objeto = objetos.get(clave)
      res.writeHead(objeto ? 200 : 404, objeto ? { ...CORS, "content-length": String(objeto.bytes) } : CORS)
      res.end()
      return
    }
    res.writeHead(405, CORS)
    res.end()
  })
}
```

Create `tests/e2e/almacen-falso.ts`:

```ts
// Started by playwright.config.ts as a web server of the run (see almacen-falso-servidor.ts).
import { crearAlmacenFalso } from "./almacen-falso-servidor"

const PUERTO = Number(process.env.PUERTO_ALMACEN_FALSO ?? 3203)

crearAlmacenFalso().listen(PUERTO, "127.0.0.1", () => {
  console.log(`almacén falso en http://127.0.0.1:${PUERTO}`)
})
```

- [ ] **Step 4: Run it green.**

Run: `pnpm exec vitest run tests/unit/almacen-falso.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the run.** In `tests/e2e/entorno.ts`, after `URL_SERVICIOS`, add:

```ts
/** The fake R2 of the run (tests/e2e/almacen-falso.ts): the Biblioteca signs, measures and downloads against it. */
export const PUERTO_ALMACEN = Number(process.env.E2E_PUERTO_ALMACEN ?? PUERTO + 3)
export const URL_DEL_ALMACEN = `http://127.0.0.1:${PUERTO_ALMACEN}`
export const BALDE_DE_PRUEBA = "conidolly-e2e"
```

In `playwright.config.ts`: import `BALDE_DE_PRUEBA`, `PUERTO_ALMACEN` and `URL_DEL_ALMACEN` from `./tests/e2e/entorno`; add this entry to `webServer` right after the fake services:

```ts
    {
      // The R2 of the run: the Biblioteca's signed links, sizes and downloads go to this machine only.
      command: "node --import tsx tests/e2e/almacen-falso.ts",
      gracefulShutdown: { signal: "SIGTERM", timeout: 3000 },
      url: `${URL_DEL_ALMACEN}/__salud`,
      env: { PUERTO_ALMACEN_FALSO: String(PUERTO_ALMACEN) },
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
      timeout: 60_000,
    },
```

and add to the app's `env`, after `INGESTA_URL`:

```ts
        // The Biblioteca's store is the real R2 code against the fake S3 above (R2_ENDPOINT is refused on Vercel).
        R2_ACCOUNT_ID: "cuenta-e2e",
        R2_ACCESS_KEY_ID: "llave-e2e",
        R2_SECRET_ACCESS_KEY: "secreto-e2e",
        R2_BUCKET: BALDE_DE_PRUEBA,
        R2_ENDPOINT: URL_DEL_ALMACEN,
```

In `tests/e2e/ayudas.ts`, replace the `Disparo` schema and `disparosRegistrados` with:

```ts
const Disparo = z.object({
  tarea: z.enum(["producir", "grabar", "voz", "armar"]),
  piezaId: z.string(),
  clave: z.string(),
  nueva: z.boolean().optional(),
  intento: z.number().optional(),
  retraso: z.string().optional(),
})

const DisparoDeMaterial = z.object({
  tarea: z.literal("procesar-material"),
  materialId: z.string(),
  clave: z.string(),
})

const DisparoDelMotor = z.object({ tarea: z.literal("motor-manual"), semana: z.string(), clave: z.string() })

const CualquierDisparo = z.union([Disparo, DisparoDeMaterial, DisparoDelMotor])

function leerDisparos(): z.infer<typeof CualquierDisparo>[] {
  if (!existsSync(ARCHIVO_DE_DISPAROS)) return []
  return readFileSync(ARCHIVO_DE_DISPAROS, "utf-8")
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .map((linea) => CualquierDisparo.parse(JSON.parse(linea)))
}

/** The piece runs the app would have started (Trigger.dev is never called in tests). */
export function disparosRegistrados(): z.infer<typeof Disparo>[] {
  return leerDisparos().flatMap((disparo) =>
    disparo.tarea === "procesar-material" || disparo.tarea === "motor-manual" ? [] : [disparo],
  )
}

/** The material runs the Biblioteca would have started, each with its key. */
export function disparosDeMateriales(): z.infer<typeof DisparoDeMaterial>[] {
  return leerDisparos().flatMap((disparo) => (disparo.tarea === "procesar-material" ? [disparo] : []))
}
```

and append the axe helper the Biblioteca specs share:

```ts
/** WCAG 2.x AA findings of the page as it is now, one line each, named after the state being checked. */
export async function revisarConAxe(page: Page, estado: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  return violations.map((v) => `${estado}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
}
```

with `import AxeBuilder from "@axe-core/playwright"` at the top of `ayudas.ts`.

- [ ] **Step 6: Check the run still starts and the old specs still parse their runs.**

Run: `pnpm type && pnpm exec playwright test tests/e2e/descartar.spec.ts`
Expected: `tsc` clean; the spec passes (its runs are piece runs, read through the new union). The web-server list now shows "almacén falso en http://127.0.0.1:3203".

- [ ] **Step 7: Commit.**

```bash
pnpm exec biome check --write tests/e2e/almacen-falso-servidor.ts tests/e2e/almacen-falso.ts tests/e2e/entorno.ts tests/e2e/ayudas.ts playwright.config.ts tests/unit/almacen-falso.test.ts
git add tests/e2e/almacen-falso-servidor.ts tests/e2e/almacen-falso.ts tests/e2e/entorno.ts tests/e2e/ayudas.ts playwright.config.ts tests/unit/almacen-falso.test.ts
git commit -m "$(cat <<'EOF'
Add the fake S3 of the E2E run and read material runs from its log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

# Part B: Pure domain (`lib/dominio/biblioteca/`)

Every module here is pure: no network, no database, no implicit clock (the time comes in as a parameter).

### Task 4: the model and the state of a material (4j)

**Files:**
- Create: `lib/dominio/biblioteca/modelo.ts`, `lib/dominio/biblioteca/estado.ts`
- Test: `tests/unit/biblioteca-modelo.test.ts`, `tests/unit/biblioteca-estado.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/biblioteca-modelo.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  ETIQUETA_DE_ROL,
  esRol,
  esTipoDeAutorNuevo,
  etiquetaDeRol,
  etiquetaDeTipo,
  ROLES,
  TIPOS_DE_MATERIAL,
} from "@/lib/dominio/biblioteca/modelo"

describe("the material model", () => {
  it("keeps Coni's role labels from Ingesta", () => {
    expect(ROLES.map((rol) => ETIQUETA_DE_ROL[rol])).toEqual([
      "Lo dijo Coni",
      "Referente",
      "Estudio o libro",
      "Estrategia interna",
    ])
  })

  it("says each type in a word, and an unknown type or role as it comes", () => {
    expect(TIPOS_DE_MATERIAL.map(etiquetaDeTipo)).toEqual(["Documento", "Enlace", "Audio", "Video", "Imagen", "Post"])
    expect(etiquetaDeTipo("podcast")).toBe("podcast")
    expect(etiquetaDeRol("evidencia")).toBe("Estudio o libro")
    expect(etiquetaDeRol("otro")).toBe("otro")
  })

  it("tells a role and a kind of new author from any other text", () => {
    expect(esRol("estrategia")).toBe(true)
    expect(esRol("coni")).toBe(false)
    expect(esTipoDeAutorNuevo("institucion")).toBe(true)
    expect(esTipoDeAutorNuevo("coni")).toBe(false)
  })
})
```

Create `tests/unit/biblioteca-estado.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  esperaConfirmacion,
  estaProcesando,
  presentarEstado,
  sePuedeReintentar,
} from "@/lib/dominio/biblioteca/estado"

const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null, costo_confirmado_en: null }

describe("the state of a material", () => {
  it("waits for her OK while a long material has an estimate and no confirmation", () => {
    expect(esperaConfirmacion({ ...base, costo_estimado_usd: 1.2 })).toBe(true)
    expect(esperaConfirmacion({ ...base, costo_estimado_usd: 1.2, costo_confirmado_en: "2026-11-02T12:00:00Z" })).toBe(
      false,
    )
  })

  it("can be retried when it failed or was paused with a reason, never while it waits for her OK", () => {
    expect(sePuedeReintentar({ ...base, estado: "fallido", motivo_fallo: "sin_texto" })).toBe(true)
    expect(sePuedeReintentar({ ...base, motivo_fallo: "tope_mensual" })).toBe(true)
    expect(sePuedeReintentar(base)).toBe(false)
    expect(sePuedeReintentar({ ...base, costo_estimado_usd: 1.2, motivo_fallo: "x" })).toBe(false)
  })

  it("is really working only while it processes without a reason", () => {
    expect(estaProcesando(base)).toBe(true)
    expect(estaProcesando({ ...base, motivo_fallo: "tope_mensual" })).toBe(false)
    expect(estaProcesando({ ...base, estado: "listo" })).toBe(false)
  })
})

describe("presentarEstado (4j: always a word and an icon, never only a colour)", () => {
  it.each([
    [{ ...base, estado: "listo" }, { palabra: "Listo", tipo: "ok", icono: null }],
    [{ ...base, estado: "fallido", motivo_fallo: "sin_texto" }, { palabra: "Con error", tipo: "error", icono: null }],
    [base, { palabra: "Procesando", tipo: "neutro", icono: "reloj" }],
    [{ ...base, motivo_fallo: "tope_mensual" }, { palabra: "En pausa", tipo: "aviso", icono: "pausa" }],
    [{ ...base, costo_estimado_usd: 1.2 }, { palabra: "Espera tu OK", tipo: "aviso", icono: "mano" }],
  ])("says %j as %j", (material, visible) => {
    expect(presentarEstado(material)).toEqual(visible)
  })

  it("says an unknown state as it comes", () => {
    expect(presentarEstado({ ...base, estado: "raro" })).toEqual({ palabra: "raro", tipo: "neutro", icono: null })
  })
})
```

- [ ] **Step 2: Run them and see them fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-modelo.test.ts tests/unit/biblioteca-estado.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/biblioteca/modelo"` (and `estado`).

- [ ] **Step 3: Implement.** Create `lib/dominio/biblioteca/modelo.ts`:

```ts
// Ported from Ingesta's lib/ingesta/modelo.ts (change 29b). Coni chose these role labels; keep them.

export const TIPOS_DE_MATERIAL = ["documento", "link", "audio", "video", "imagen", "post"] as const
export type TipoDeMaterial = (typeof TIPOS_DE_MATERIAL)[number]

export const ROLES = ["voz_propia", "referente", "evidencia", "estrategia"] as const
export type Rol = (typeof ROLES)[number]

export const ETIQUETA_DE_ROL: Record<Rol, string> = {
  voz_propia: "Lo dijo Coni",
  referente: "Referente",
  evidencia: "Estudio o libro",
  estrategia: "Estrategia interna",
}

export const AYUDA_DE_ROL: Record<Rol, string> = {
  voz_propia: "Una charla, audio o texto de ella: sus ideas con sus palabras.",
  referente: "Alguien a quien Coni sigue: sirve para ver cómo lo explica.",
  evidencia: "Un estudio, libro o artículo que respalda con datos lo que se dice.",
  estrategia: "Un plan, una guía o un documento del equipo, no una afirmación sobre el tema.",
}

export const ETIQUETA_DE_TIPO: Record<TipoDeMaterial, string> = {
  documento: "Documento",
  link: "Enlace",
  audio: "Audio",
  video: "Video",
  imagen: "Imagen",
  post: "Post",
}

/** Coni herself is created by the seed, so `coni` is not a kind a person can pick. */
export const TIPOS_DE_AUTOR_NUEVO = ["persona", "cuenta", "institucion"] as const
export type TipoDeAutorNuevo = (typeof TIPOS_DE_AUTOR_NUEVO)[number]

export const ETIQUETA_DE_TIPO_DE_AUTOR: Record<TipoDeAutorNuevo, string> = {
  persona: "Persona",
  cuenta: "Cuenta de redes",
  institucion: "Institución",
}

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor)
}

export function esTipoDeAutorNuevo(valor: string): valor is TipoDeAutorNuevo {
  return (TIPOS_DE_AUTOR_NUEVO as readonly string[]).includes(valor)
}

function esTipo(valor: string): valor is TipoDeMaterial {
  return (TIPOS_DE_MATERIAL as readonly string[]).includes(valor)
}

export function etiquetaDeRol(rol: string): string {
  return esRol(rol) ? ETIQUETA_DE_ROL[rol] : rol
}

export function etiquetaDeTipo(tipo: string): string {
  return esTipo(tipo) ? ETIQUETA_DE_TIPO[tipo] : tipo
}
```

Create `lib/dominio/biblioteca/estado.ts`:

```ts
// Ported from Ingesta's app/(app)/estado-de-material.ts, with fix 4j: a word and an icon, never only a colour.

export interface EstadoDeProceso {
  estado: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
  costo_confirmado_en: string | null
}

/** A long material the task stopped before spending: it waits for her to confirm what it will cost. */
export function esperaConfirmacion(material: EstadoDeProceso): boolean {
  return (
    material.estado === "procesando" && material.costo_estimado_usd !== null && material.costo_confirmado_en === null
  )
}

/** A material that failed, or one stopped with a reason (the monthly cap, a run that could not start): retryable. */
export function sePuedeReintentar(material: EstadoDeProceso): boolean {
  if (esperaConfirmacion(material)) return false
  return material.estado === "fallido" || (material.estado === "procesando" && material.motivo_fallo !== null)
}

/** Really working on it: the list keeps asking while any material is. A paused or waiting one does not. */
export function estaProcesando(material: EstadoDeProceso): boolean {
  return material.estado === "procesando" && material.motivo_fallo === null
}

/** The icons the pill draws itself (check, warning circle) are `null` here; these three it is given. */
export type IconoDeEstado = "reloj" | "pausa" | "mano" | null

export interface EstadoVisible {
  palabra: string
  tipo: "ok" | "aviso" | "error" | "neutro"
  icono: IconoDeEstado
}

export function presentarEstado(material: EstadoDeProceso): EstadoVisible {
  if (esperaConfirmacion(material)) return { palabra: "Espera tu OK", tipo: "aviso", icono: "mano" }
  if (material.estado === "listo") return { palabra: "Listo", tipo: "ok", icono: null }
  if (material.estado === "fallido") return { palabra: "Con error", tipo: "error", icono: null }
  if (material.estado === "procesando" && material.motivo_fallo !== null) {
    return { palabra: "En pausa", tipo: "aviso", icono: "pausa" }
  }
  if (material.estado === "procesando") return { palabra: "Procesando", tipo: "neutro", icono: "reloj" }
  return { palabra: material.estado, tipo: "neutro", icono: null }
}
```

- [ ] **Step 4: Run green.** Run: `pnpm exec vitest run tests/unit/biblioteca-modelo.test.ts tests/unit/biblioteca-estado.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca tests/unit/biblioteca-modelo.test.ts tests/unit/biblioteca-estado.test.ts
git add lib/dominio/biblioteca tests/unit/biblioteca-modelo.test.ts tests/unit/biblioteca-estado.test.ts
git commit -m "$(cat <<'EOF'
Add the Biblioteca's material model and state words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: the list's filters and selection in the URL (4b)

**Files:**
- Create: `lib/dominio/biblioteca/filtros.ts`
- Test: `tests/unit/biblioteca-filtros.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-filtros.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  hayFiltros,
  hayFiltrosPlegados,
  hrefDeLista,
  leerFiltros,
  leerSeleccion,
} from "@/lib/dominio/biblioteca/filtros"

const AUTOR = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"
const MATERIAL = "11111111-2222-4333-8444-555555555555"

describe("leerFiltros", () => {
  it("reads the valid filters of the URL and ignores everything else, never failing", () => {
    expect(leerFiltros({ autor: AUTOR, rol: "referente", tipo: "audio", estado: "fallido" })).toEqual({
      autor: AUTOR,
      rol: "referente",
      tipo: "audio",
      estado: "fallido",
    })
    expect(leerFiltros({ autor: "x", rol: "coni", tipo: "", estado: ["listo", "fallido"], otro: "1" })).toEqual({
      estado: "listo",
    })
  })

  it("tells any filter from the folded ones", () => {
    expect(hayFiltros({})).toBe(false)
    expect(hayFiltros({ estado: "listo" })).toBe(true)
    expect(hayFiltrosPlegados({ estado: "listo" })).toBe(false)
    expect(hayFiltrosPlegados({ estado: "listo", tipo: "audio" })).toBe(true)
  })
})

describe("leerSeleccion", () => {
  it("is the material of ?m, or null when it is not an id", () => {
    expect(leerSeleccion({ m: MATERIAL })).toBe(MATERIAL)
    expect(leerSeleccion({ m: "../x" })).toBeNull()
    expect(leerSeleccion({})).toBeNull()
  })
})

describe("hrefDeLista", () => {
  it("writes the filters in a fixed order, and the selected material last", () => {
    expect(hrefDeLista({})).toBe("/biblioteca")
    expect(hrefDeLista({ estado: "procesando", autor: AUTOR })).toBe(`/biblioteca?autor=${AUTOR}&estado=procesando`)
    expect(hrefDeLista({ estado: "listo" }, MATERIAL)).toBe(`/biblioteca?estado=listo&m=${MATERIAL}`)
  })

  it("drops a filter set to nothing", () => {
    expect(hrefDeLista({ estado: undefined, tipo: "video" })).toBe("/biblioteca?tipo=video")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-filtros.test.ts` → FAIL, cannot resolve `@/lib/dominio/biblioteca/filtros`.

- [ ] **Step 3: Implement.** Create `lib/dominio/biblioteca/filtros.ts`:

```ts
import { z } from "zod"
import { ROLES, type Rol, TIPOS_DE_MATERIAL, type TipoDeMaterial } from "./modelo"

export const RUTA_DE_MATERIALES = "/biblioteca"

export const ESTADOS_DE_MATERIAL = ["procesando", "listo", "fallido"] as const
export type EstadoDeMaterial = (typeof ESTADOS_DE_MATERIAL)[number]

export interface FiltrosDeMateriales {
  autor?: string
  rol?: Rol
  tipo?: TipoDeMaterial
  estado?: EstadoDeMaterial
}

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

function leer<T>(esquema: z.ZodType<T>, valor: string | string[] | undefined): T | undefined {
  const leido = esquema.safeParse(primero(valor)?.trim())
  return leido.success ? leido.data : undefined
}

/** The filters of the list from the URL's search params; whatever is not a valid value is ignored, never an error. */
export function leerFiltros(params: Params): FiltrosDeMateriales {
  const filtros: FiltrosDeMateriales = {}
  const autor = leer(z.uuid(), params.autor)
  const rol = leer(z.enum(ROLES), params.rol)
  const tipo = leer(z.enum(TIPOS_DE_MATERIAL), params.tipo)
  const estado = leer(z.enum(ESTADOS_DE_MATERIAL), params.estado)
  if (autor) filtros.autor = autor
  if (rol) filtros.rol = rol
  if (tipo) filtros.tipo = tipo
  if (estado) filtros.estado = estado
  return filtros
}

/** The material open in the desktop side panel (`?m=<id>`). */
export function leerSeleccion(params: Params): string | null {
  return leer(z.uuid(), params.m) ?? null
}

export function hayFiltros(filtros: FiltrosDeMateriales): boolean {
  return Object.values(filtros).some(Boolean)
}

/** The filters folded under "Más filtros": the state has its own quick buttons. */
export function hayFiltrosPlegados(filtros: FiltrosDeMateriales): boolean {
  return Boolean(filtros.autor || filtros.rol || filtros.tipo)
}

const ORDEN = ["autor", "rol", "tipo", "estado"] as const

/** The list's address with these filters (and the side panel open on `seleccion`): linkable, Back undoes it. */
export function hrefDeLista(filtros: FiltrosDeMateriales, seleccion: string | null = null): string {
  const params = new URLSearchParams()
  for (const clave of ORDEN) {
    const valor = filtros[clave]
    if (valor) params.set(clave, valor)
  }
  if (seleccion) params.set("m", seleccion)
  const consulta = params.toString()
  return consulta ? `${RUTA_DE_MATERIALES}?${consulta}` : RUTA_DE_MATERIALES
}
```

- [ ] **Step 4: Run green.** Run: `pnpm exec vitest run tests/unit/biblioteca-filtros.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/filtros.ts tests/unit/biblioteca-filtros.test.ts
git add lib/dominio/biblioteca/filtros.ts tests/unit/biblioteca-filtros.test.ts
git commit -m "$(cat <<'EOF'
Read the Biblioteca's filters and selected material from the URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 6: labels of ideas and the editable card

**Files:**
- Create: `lib/dominio/biblioteca/etiquetas.ts`, `lib/dominio/biblioteca/ficha.ts`
- Test: `tests/unit/biblioteca-ficha.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-ficha.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { EVIDENCIA, TIPO_DE_AFIRMACION } from "@/lib/dominio/biblioteca/etiquetas"
import { adaptacionDe, leerEdicion, leerFicha, textoDeUbicacion } from "@/lib/dominio/biblioteca/ficha"

const MATERIAL = "11111111-2222-4333-8444-555555555555"
const IDEAS = ["Una", "Dos", "Tres", "Cuatro", "Cinco"]

describe("the words of ideas", () => {
  it("says every claim type and evidence kind the task writes", () => {
    expect(Object.keys(TIPO_DE_AFIRMACION)).toEqual([
      "definicion",
      "causa",
      "consecuencia",
      "mito",
      "consejo",
      "dato",
      "experiencia",
    ])
    expect(EVIDENCIA).toEqual({ estudio: "Estudio", clinica: "Clínica", opinion: "Opinión", testimonio: "Testimonio" })
  })
})

describe("leerFicha", () => {
  it("reads the json columns the task writes, and null when they have another shape", () => {
    const fila = {
      resumen: "R",
      ideas_clave: IDEAS,
      citas: [{ texto: "c", ubicacion: { pagina: 3 } }],
      fuente: { autor: null, anio: 2024, enlace: null },
    }
    expect(leerFicha(fila)).toEqual({
      resumen: "R",
      ideasClave: IDEAS,
      citas: [{ texto: "c", ubicacion: { pagina: 3 } }],
      fuente: { autor: null, anio: 2024, enlace: null },
    })
    expect(leerFicha({ ...fila, ideas_clave: "no" })).toBeNull()
  })
})

describe("textoDeUbicacion and adaptacionDe", () => {
  it("says where a quote is as she reads it", () => {
    expect(textoDeUbicacion({ pagina: 12 })).toBe("página 12")
    expect(textoDeUbicacion({ segundo: 75.4, pista: "voz" })).toBe("1:15")
    expect(textoDeUbicacion({ imagen: 3 })).toBe("imagen 3")
    expect(textoDeUbicacion({ pagina: null })).toBeNull()
  })

  it("says whether the card was translated", () => {
    expect(adaptacionDe("es")).toBe("Adaptado a la voz de Coni")
    expect(adaptacionDe("en")).toBe("Traducido del inglés y adaptado a la voz de Coni")
    expect(adaptacionDe("sv")).toBe("Traducido de otro idioma y adaptado a la voz de Coni")
  })
})

describe("leerEdicion", () => {
  const edicion = {
    materialId: MATERIAL,
    resumen: " Resumen ",
    ideasClave: [...IDEAS, ""],
    citas: [{ texto: "", ubicacion: { pagina: 1 } }],
    fuente: { autor: " ", anio: null, enlace: "https://ejemplo.cl" },
  }

  it("trims, drops blank ideas and quotes, and keeps the rest", () => {
    expect(leerEdicion(edicion)).toEqual({
      ok: true,
      datos: { ...edicion, resumen: "Resumen", ideasClave: IDEAS, citas: [], fuente: { autor: null, anio: null, enlace: "https://ejemplo.cl" } },
    })
  })

  it("says what is wrong in her words", () => {
    expect(leerEdicion({ ...edicion, resumen: " " })).toEqual({ ok: false, error: "El resumen no puede quedar vacío." })
    expect(leerEdicion({ ...edicion, ideasClave: ["Una"] })).toEqual({
      ok: false,
      error: "Deja entre 5 y 10 ideas clave.",
    })
    expect(leerEdicion({ ...edicion, fuente: { autor: null, anio: null, enlace: "ftp://x" } })).toEqual({
      ok: false,
      error: "El enlace de la fuente no es válido.",
    })
    expect(leerEdicion({ materialId: "x" })).toEqual({
      ok: false,
      error: "No entendí esa solicitud. Vuelve a abrir la pantalla.",
    })
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-ficha.test.ts` → FAIL, cannot resolve `@/lib/dominio/biblioteca/etiquetas`.

- [ ] **Step 3: Implement.** Create `lib/dominio/biblioteca/etiquetas.ts` (ported from Ingesta's `lib/ingesta/etiquetas.ts`, without the evidence levels of Semana):

```ts
export const TIPO_DE_AFIRMACION: Record<string, string> = {
  definicion: "Definición",
  causa: "Causa",
  consecuencia: "Consecuencia",
  mito: "Mito",
  consejo: "Consejo",
  dato: "Dato",
  experiencia: "Experiencia",
}

export const EVIDENCIA: Record<string, string> = {
  estudio: "Estudio",
  clinica: "Clínica",
  opinion: "Opinión",
  testimonio: "Testimonio",
}
```

Create `lib/dominio/biblioteca/ficha.ts`:

```ts
import { z } from "zod"

// The shape of the card that `procesar-material` writes into `fichas` (lib/ingesta/partes.ts and procesar.ts).
// Ported from Ingesta's lib/ingesta/ficha.ts; the columns come in as `unknown`, so this module needs no database types.

export const ERROR_SOLICITUD = "No entendí esa solicitud. Vuelve a abrir la pantalla."

export const Ubicacion = z.union([
  z.object({ pagina: z.number().nullable() }).strict(),
  z.object({ segundo: z.number(), pista: z.enum(["voz", "pantalla"]) }).strict(),
  z.object({ imagen: z.number() }).strict(),
])
export type Ubicacion = z.infer<typeof Ubicacion>

export interface FichaLeida {
  resumen: string
  ideasClave: string[]
  citas: { texto: string; ubicacion: Ubicacion }[]
  fuente: { autor: string | null; anio: number | null; enlace: string | null }
}

const Columnas = z.object({
  resumen: z.string(),
  ideas_clave: z.array(z.string()),
  citas: z.array(z.object({ texto: z.string(), ubicacion: Ubicacion })),
  fuente: z.object({ autor: z.string().nullable(), anio: z.number().nullable(), enlace: z.string().nullable() }),
})

/** The card from its json columns, null when they do not have the shape the task writes. */
export function leerFicha(fila: { resumen: string; ideas_clave: unknown; citas: unknown; fuente: unknown }): FichaLeida | null {
  const leida = Columnas.safeParse(fila)
  if (!leida.success) return null
  const { resumen, ideas_clave, citas, fuente } = leida.data
  return { resumen, ideasClave: ideas_clave, citas, fuente }
}

/** Where a quote lives in its source, as Coni reads it: "página 12", "1:15" or "imagen 3"; null when it has none. */
export function textoDeUbicacion(ubicacion: Ubicacion): string | null {
  if ("segundo" in ubicacion) {
    const total = Math.floor(ubicacion.segundo)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
  }
  if ("imagen" in ubicacion) return `imagen ${ubicacion.imagen}`
  return ubicacion.pagina === null ? null : `página ${ubicacion.pagina}`
}

/** Each name goes after "del": the languages Coni's references come in. */
const IDIOMAS: Record<string, string> = {
  en: "inglés",
  pt: "portugués",
  fr: "francés",
  de: "alemán",
  it: "italiano",
  ca: "catalán",
  nl: "neerlandés",
  ru: "ruso",
  ja: "japonés",
  zh: "chino",
  ko: "coreano",
  ar: "árabe",
}

/** How the card was made: translated and adapted to Coni's voice, or only adapted when the original is Spanish. */
export function adaptacionDe(idiomaOriginal: string | null): string {
  if (idiomaOriginal === null || idiomaOriginal === "es") return "Adaptado a la voz de Coni"
  const idioma = IDIOMAS[idiomaOriginal]
  return `Traducido ${idioma ? `del ${idioma}` : "de otro idioma"} y adaptado a la voz de Coni`
}

export const MINIMO_DE_IDEAS = 5
export const MAXIMO_DE_IDEAS = 10

const texto = (maximo: number) => z.string().trim().max(maximo)
const textoONulo = z
  .string()
  .nullable()
  .transform((valor) => valor?.trim() || null)

export const EsquemaDeEdicionDeFicha = z.object({
  materialId: z.uuid(),
  resumen: texto(5000),
  ideasClave: z.array(texto(500)).max(MAXIMO_DE_IDEAS + 10),
  citas: z.array(z.object({ texto: texto(2000), ubicacion: Ubicacion })).max(20),
  fuente: z.object({ autor: textoONulo, anio: z.number().int().min(0).max(3000).nullable(), enlace: textoONulo }),
})

export type EdicionDeFicha = z.output<typeof EsquemaDeEdicionDeFicha>
export type EdicionLeida = { ok: true; datos: EdicionDeFicha } | { ok: false; error: string }

function esEnlaceWeb(enlace: string): boolean {
  if (!URL.canParse(enlace)) return false
  const { protocol } = new URL(enlace)
  return protocol === "http:" || protocol === "https:"
}

/** Validates an edit of a card; blank ideas and quotes are dropped before counting. The error is for her. */
export function leerEdicion(entrada: unknown): EdicionLeida {
  const leida = EsquemaDeEdicionDeFicha.safeParse(entrada)
  if (!leida.success) return { ok: false, error: ERROR_SOLICITUD }
  const datos = {
    ...leida.data,
    ideasClave: leida.data.ideasClave.filter((idea) => idea !== ""),
    citas: leida.data.citas.filter((cita) => cita.texto !== ""),
  }
  if (datos.resumen === "") return { ok: false, error: "El resumen no puede quedar vacío." }
  if (datos.ideasClave.length < MINIMO_DE_IDEAS || datos.ideasClave.length > MAXIMO_DE_IDEAS) {
    return { ok: false, error: `Deja entre ${MINIMO_DE_IDEAS} y ${MAXIMO_DE_IDEAS} ideas clave.` }
  }
  if (datos.fuente.enlace !== null && !esEnlaceWeb(datos.fuente.enlace)) {
    return { ok: false, error: "El enlace de la fuente no es válido." }
  }
  return { ok: true, datos }
}
```

(`URL.canParse` exists in Node 24 and the browsers Coni uses; it replaces Ingesta's `try/catch` around `new URL`.)

- [ ] **Step 4: Run green.** Run: `pnpm exec vitest run tests/unit/biblioteca-ficha.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/etiquetas.ts lib/dominio/biblioteca/ficha.ts tests/unit/biblioteca-ficha.test.ts
git add lib/dominio/biblioteca/etiquetas.ts lib/dominio/biblioteca/ficha.ts tests/unit/biblioteca-ficha.test.ts
git commit -m "$(cat <<'EOF'
Port the card rules and the words of ideas to the Biblioteca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 7: authors and the map of a material

**Files:**
- Create: `lib/dominio/biblioteca/autores.ts`, `lib/dominio/biblioteca/mapa.ts`
- Test: `tests/unit/biblioteca-autores-y-mapa.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-autores-y-mapa.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { type AutorDeLista, autoresParecidos, buscarAutores, normalizar } from "@/lib/dominio/biblioteca/autores"
import { armarMapa, masFrecuentesPrimero } from "@/lib/dominio/biblioteca/mapa"

const autor = (id: string, nombre: string, alias: string[] = []): AutorDeLista => ({
  id,
  nombre,
  credencial: null,
  tipo: "persona",
  alias,
})
const AUTORES = [autor("1", "Esther Perel", ["@estherperel"]), autor("2", "Instituto Gottman"), autor("3", "Ana")]

describe("authors", () => {
  it("compares names without accents, case or extra spaces", () => {
    expect(normalizar("  Ánima   Ruiz ")).toBe("anima ruiz")
  })

  it("finds by name or alias, and lists everyone with nothing typed", () => {
    expect(buscarAutores(AUTORES, "perel").map((a) => a.id)).toEqual(["1"])
    expect(buscarAutores(AUTORES, "@esther").map((a) => a.id)).toEqual(["1"])
    expect(buscarAutores(AUTORES, " ")).toHaveLength(3)
  })

  it("suggests look-alikes for a new name, never for two letters", () => {
    expect(autoresParecidos(AUTORES, "gottman").map((a) => a.id)).toEqual(["2"])
    expect(autoresParecidos(AUTORES, "an")).toEqual([])
  })
})

describe("armarMapa", () => {
  const fila = (tema: string | null, tipo: string, evidencia: string) => ({
    tema_id: tema,
    tipo,
    evidencia,
    temas: tema ? { nombre: tema === "t1" ? "Sueño" : "Ánimo" } : null,
  })

  it("counts ideas by topic (most first, then by name), by type and by evidence, and those without a topic", () => {
    const mapa = armarMapa([
      fila("t1", "dato", "estudio"),
      fila("t2", "mito", "opinion"),
      fila("t1", "dato", "estudio"),
      fila(null, "consejo", "estudio"),
    ])
    expect(mapa).toEqual({
      total: 4,
      temas: [
        { id: "t1", nombre: "Sueño", afirmaciones: 2 },
        { id: "t2", nombre: "Ánimo", afirmaciones: 1 },
      ],
      sinTema: 1,
      tipos: { dato: 2, mito: 1, consejo: 1 },
      evidencia: { estudio: 3, opinion: 1 },
    })
  })

  it("orders counts most first with their words", () => {
    expect(masFrecuentesPrimero({ mito: 1, dato: 2, raro: 1 }, { mito: "Mito", dato: "Dato" })).toEqual([
      { clave: "dato", texto: "Dato", cantidad: 2 },
      { clave: "mito", texto: "Mito", cantidad: 1 },
      { clave: "raro", texto: "raro", cantidad: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-autores-y-mapa.test.ts` → FAIL, cannot resolve `@/lib/dominio/biblioteca/autores`.

- [ ] **Step 3: Implement.** Create `lib/dominio/biblioteca/autores.ts` with the body of Ingesta's `lib/ingesta/buscar-autor.ts` (interface `AutorDeLista`, `LARGO_MINIMO_PARA_SUGERIR = 3`, `normalizar`, `nombresDe`, `buscarAutores`, `autoresParecidos`), unchanged:

```ts
export interface AutorDeLista {
  id: string
  nombre: string
  credencial: string | null
  tipo: string
  alias: string[]
}

const LARGO_MINIMO_PARA_SUGERIR = 3

/** Lowercase, without accents and with single spaces: how two spellings of a name are compared. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

const nombresDe = (autor: AutorDeLista) => [autor.nombre, ...autor.alias].map(normalizar)

/** The authors whose name or alias contains what was typed; with nothing typed, all of them in the order given. */
export function buscarAutores(autores: AutorDeLista[], texto: string): AutorDeLista[] {
  const buscado = normalizar(texto)
  if (buscado === "") return autores
  return autores.filter((autor) => nombresDe(autor).some((nombre) => nombre.includes(buscado)))
}

/**
 * The authors a new name may be the same person as: the name or an alias is the typed one, or one contains the other.
 * Very short text suggests nobody: two letters match half the list.
 */
export function autoresParecidos(autores: AutorDeLista[], nombre: string): AutorDeLista[] {
  const tipeado = normalizar(nombre)
  if (tipeado.length < LARGO_MINIMO_PARA_SUGERIR) return []
  return autores.filter((autor) =>
    nombresDe(autor).some(
      (existente) =>
        existente.length >= LARGO_MINIMO_PARA_SUGERIR && (existente.includes(tipeado) || tipeado.includes(existente)),
    ),
  )
}
```

Create `lib/dominio/biblioteca/mapa.ts`:

```ts
// Ported from `armarMapa` of Ingesta's lib/ingesta/materiales.ts.

export interface MapaDelMaterial {
  total: number
  /** The topics its ideas belong to, the most ideas first. */
  temas: { id: string; nombre: string; afirmaciones: number }[]
  sinTema: number
  tipos: Record<string, number>
  evidencia: Record<string, number>
}

export interface FilaDeAfirmacion {
  tema_id: string | null
  tipo: string
  evidencia: string
  temas: { nombre: string } | null
}

const sumar = (cuentas: Record<string, number>, clave: string) => {
  cuentas[clave] = (cuentas[clave] ?? 0) + 1
}

/** Counts the ideas of one material by topic, by type and by kind of evidence. */
export function armarMapa(filas: FilaDeAfirmacion[]): MapaDelMaterial {
  const temas = new Map<string, { id: string; nombre: string; afirmaciones: number }>()
  const mapa: MapaDelMaterial = { total: filas.length, temas: [], sinTema: 0, tipos: {}, evidencia: {} }
  for (const fila of filas) {
    sumar(mapa.tipos, fila.tipo)
    sumar(mapa.evidencia, fila.evidencia)
    if (fila.tema_id === null) {
      mapa.sinTema += 1
      continue
    }
    const tema = temas.get(fila.tema_id) ?? { id: fila.tema_id, nombre: fila.temas?.nombre ?? "", afirmaciones: 0 }
    tema.afirmaciones += 1
    temas.set(fila.tema_id, tema)
  }
  mapa.temas = [...temas.values()].sort(
    (a, b) => b.afirmaciones - a.afirmaciones || a.nombre.localeCompare(b.nombre, "es"),
  )
  return mapa
}

/** Counts as rows, the most frequent first, each with its word (or its code when it has none). */
export function masFrecuentesPrimero(
  cuentas: Record<string, number>,
  etiquetas: Record<string, string>,
): { clave: string; texto: string; cantidad: number }[] {
  return Object.entries(cuentas)
    .sort(([claveA, a], [claveB, b]) => b - a || claveA.localeCompare(claveB))
    .map(([clave, cantidad]) => ({ clave, texto: etiquetas[clave] ?? clave, cantidad }))
}
```

- [ ] **Step 4: Run green.** Run: `pnpm exec vitest run tests/unit/biblioteca-autores-y-mapa.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/autores.ts lib/dominio/biblioteca/mapa.ts tests/unit/biblioteca-autores-y-mapa.test.ts
git add lib/dominio/biblioteca/autores.ts lib/dominio/biblioteca/mapa.ts tests/unit/biblioteca-autores-y-mapa.test.ts
git commit -m "$(cat <<'EOF'
Port author search and the map of a material to the Biblioteca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 8: the main topic and the upload date

**Files:**
- Create: `lib/dominio/biblioteca/temas.ts`, `lib/dominio/biblioteca/fechas.ts`
- Test: `tests/unit/biblioteca-temas-y-fechas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-temas-y-fechas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { subidoEnFrase, subidoHace, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { temasPrincipales, textoDeTema } from "@/lib/dominio/biblioteca/temas"

const idea = (materialId: string, temaId: string | null, nombre: string, excluida = false) => ({
  materialId,
  temaId,
  nombre,
  excluida,
})

describe("temasPrincipales (D8)", () => {
  it("picks the topic with the most ideas and counts the others", () => {
    const temas = temasPrincipales([
      idea("m", "t1", "Sueño"),
      idea("m", "t2", "Carga mental"),
      idea("m", "t2", "Carga mental"),
      idea("m", "t3", "Ánimo"),
    ])
    expect(temas.get("m")).toEqual({ nombre: "Carga mental", otros: 2 })
  })

  it("breaks a tie by the name first in Spanish order", () => {
    const temas = temasPrincipales([idea("m", "t1", "Sueño"), idea("m", "t2", "Ánimo")])
    expect(temas.get("m")).toEqual({ nombre: "Ánimo", otros: 1 })
  })

  it("leaves out excluded ideas and ideas without a topic", () => {
    const temas = temasPrincipales([
      idea("m", "t1", "Sueño"),
      idea("m", "t2", "Ánimo", true),
      idea("m", "t2", "Ánimo", true),
      idea("m", null, ""),
      idea("m", null, ""),
    ])
    expect(temas.get("m")).toEqual({ nombre: "Sueño", otros: 0 })
  })

  it("has nothing for a material without ideas, and keeps materials apart", () => {
    const temas = temasPrincipales([idea("a", "t1", "Sueño"), idea("b", "t2", "Ánimo"), idea("c", "t1", "Sueño", true)])
    expect(temas.get("a")).toEqual({ nombre: "Sueño", otros: 0 })
    expect(temas.get("b")).toEqual({ nombre: "Ánimo", otros: 0 })
    expect(temas.has("c")).toBe(false)
    expect(temas.has("d")).toBe(false)
  })

  it("counts more than a thousand ideas of one material", () => {
    const filas = [...Array.from({ length: 1001 }, () => idea("m", "t1", "Sueño")), idea("m", "t2", "Ánimo")]
    expect(temasPrincipales(filas).get("m")).toEqual({ nombre: "Sueño", otros: 1 })
  })
})

describe("textoDeTema", () => {
  it("shows +N and reads it out in words", () => {
    expect(textoDeTema({ nombre: "Carga mental", otros: 2 })).toEqual({
      visible: "Carga mental +2",
      leido: "Carga mental y 2 temas más",
    })
    expect(textoDeTema({ nombre: "Sueño", otros: 1 })).toEqual({ visible: "Sueño +1", leido: "Sueño y 1 tema más" })
    expect(textoDeTema({ nombre: "Sueño", otros: 0 })).toEqual({ visible: "Sueño", leido: "Sueño" })
    expect(textoDeTema(null)).toEqual({ visible: "Sin tema todavía", leido: "Sin tema todavía" })
  })
})

describe("subidoHace (D7, America/Santiago)", () => {
  // 2 Nov 2026, 12:00 in Santiago (UTC-3 since the first Sunday of September).
  const AHORA = Date.parse("2026-11-02T15:00:00Z")

  it.each([
    ["2026-11-02T03:30:00Z", "Hoy"],
    ["2026-11-02T02:30:00Z", "Ayer"],
    ["2026-10-31T12:00:00Z", "Hace 2 días"],
    ["2026-10-27T12:00:00Z", "Hace 6 días"],
    ["2026-10-20T12:00:00Z", "20 de octubre"],
    ["2025-12-24T12:00:00Z", "24 de diciembre de 2025"],
  ])("says %s as «%s»", (instante, texto) => {
    expect(subidoHace(instante, AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe(texto)
  })

  it("puts it in a sentence for the side panel", () => {
    expect(subidoEnFrase("2026-10-31T12:00:00Z", AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe("subido hace 2 días")
    expect(subidoEnFrase("2026-11-02T12:00:00Z", AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe("subido hoy")
    expect(subidoEnFrase("2026-10-20T12:00:00Z", AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe("subido el 20 de octubre")
  })

  it("refuses an instant it cannot read", () => {
    expect(() => subidoHace("ayer", AHORA, ZONA_DE_LA_BIBLIOTECA)).toThrow(/ilegible/)
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-temas-y-fechas.test.ts` → FAIL, cannot resolve `@/lib/dominio/biblioteca/fechas`.

- [ ] **Step 3: Implement.** Create `lib/dominio/biblioteca/temas.ts`:

```ts
export interface TemaPrincipal {
  nombre: string
  /** How many other topics the material's ideas belong to: the list shows "+N". */
  otros: number
}

export interface IdeaConTema {
  materialId: string
  temaId: string | null
  nombre: string
  excluida: boolean
}

/**
 * The main topic of each material (spec 1, D8): over its ideas that were not excluded and have a topic, the topic with
 * the most ideas; a tie goes to the name first in Spanish order. A material without such ideas has no entry.
 */
export function temasPrincipales(ideas: readonly IdeaConTema[]): Map<string, TemaPrincipal> {
  const porMaterial = new Map<string, Map<string, { nombre: string; ideas: number }>>()
  for (const idea of ideas) {
    if (idea.excluida || idea.temaId === null) continue
    const temas = porMaterial.get(idea.materialId) ?? new Map<string, { nombre: string; ideas: number }>()
    const tema = temas.get(idea.temaId) ?? { nombre: idea.nombre, ideas: 0 }
    tema.ideas += 1
    temas.set(idea.temaId, tema)
    porMaterial.set(idea.materialId, temas)
  }
  const principales = new Map<string, TemaPrincipal>()
  for (const [materialId, temas] of porMaterial) {
    const [primero] = [...temas.values()].sort((a, b) => b.ideas - a.ideas || a.nombre.localeCompare(b.nombre, "es"))
    if (primero) principales.set(materialId, { nombre: primero.nombre, otros: temas.size - 1 })
  }
  return principales
}

/** What the list shows ("Carga mental +2") and what a screen reader says instead ("Carga mental y 2 temas más"). */
export function textoDeTema(tema: TemaPrincipal | null): { visible: string; leido: string } {
  if (tema === null) return { visible: "Sin tema todavía", leido: "Sin tema todavía" }
  if (tema.otros === 0) return { visible: tema.nombre, leido: tema.nombre }
  return {
    visible: `${tema.nombre} +${tema.otros}`,
    leido: `${tema.nombre} y ${tema.otros} ${tema.otros === 1 ? "tema" : "temas"} más`,
  }
}
```

Create `lib/dominio/biblioteca/fechas.ts`:

```ts
import { diaLocal } from "@/lib/dominio/fechas"

/** Dates are stored in UTC and shown in Chile (CLAUDE.md). */
export const ZONA_DE_LA_BIBLIOTECA = "America/Santiago"

const UN_DIA_MS = 24 * 60 * 60 * 1000

/** Midnight UTC of a calendar day `2026-10-31`: subtracting two of them counts calendar days, DST aside. */
const inicioDelDia = (dia: string) => Date.parse(`${dia}T00:00:00Z`)

/** When a material was uploaded, in calendar days of `zona` (D7): Hoy, Ayer, Hace N días, then the date. */
export function subidoHace(instante: string, ahora: number, zona: string): string {
  const ms = Date.parse(instante)
  if (Number.isNaN(ms)) throw new Error(`Instante ilegible: ${instante}`)
  const dia = diaLocal(ms, zona)
  const hoy = diaLocal(ahora, zona)
  const dias = Math.round((inicioDelDia(hoy) - inicioDelDia(dia)) / UN_DIA_MS)
  if (dias <= 0) return "Hoy"
  if (dias === 1) return "Ayer"
  if (dias < 7) return `Hace ${dias} días`
  const mismoAnio = dia.slice(0, 4) === hoy.slice(0, 4)
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: zona,
    day: "numeric",
    month: "long",
    ...(mismoAnio ? {} : { year: "numeric" }),
  }).format(ms)
}

/** The same, inside a sentence: "subido hoy", "subido hace 2 días", "subido el 20 de octubre". */
export function subidoEnFrase(instante: string, ahora: number, zona: string): string {
  const texto = subidoHace(instante, ahora, zona)
  return /^\d/.test(texto) ? `subido el ${texto}` : `subido ${texto.toLowerCase()}`
}
```

- [ ] **Step 4: Run green.** Run: `pnpm exec vitest run tests/unit/biblioteca-temas-y-fechas.test.ts` → PASS. If the year case prints `24 de diciembre de 2025` with another separator on this Node's ICU, the test is right and the formatter must be changed to build the string from `formatToParts` (`day`, `month`, `year`), not the test.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/temas.ts lib/dominio/biblioteca/fechas.ts tests/unit/biblioteca-temas-y-fechas.test.ts
git add lib/dominio/biblioteca/temas.ts lib/dominio/biblioteca/fechas.ts tests/unit/biblioteca-temas-y-fechas.test.ts
git commit -m "$(cat <<'EOF'
Pick each material's main topic and say its upload day in words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 9: Coni's words (4h) and the lines for WAV

**Files:**
- Create: `lib/dominio/biblioteca/palabras.ts`, `lib/dominio/biblioteca/detalle.ts`
- Test: `tests/unit/biblioteca-palabras.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-palabras.test.ts`:

```ts
// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import { ideasSacadas, PALABRAS, REEMPLAZOS, SOLO_PARA_WAV } from "@/lib/dominio/biblioteca/palabras"

const SECCION = join(__dirname, "..", "..", "app", "(app)", "biblioteca")

function archivos(carpeta: string): string[] {
  if (!existsSync(carpeta)) return []
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

describe("Coni's words (4h)", () => {
  it("replaces the technical words with hers", () => {
    expect(REEMPLAZOS).toEqual([
      { antes: "Papel", ahora: "¿Quién es para ti?" },
      { antes: "Afirmaciones", ahora: "Ideas sacadas" },
      { antes: "Tipos de afirmación", ahora: "Qué tipo de idea es" },
    ])
    expect(PALABRAS.detalle).toBe("Detalle para WAV")
    expect(SOLO_PARA_WAV).toEqual(["Puntaje", "Evidencia"])
  })

  it("counts ideas in words", () => {
    expect(ideasSacadas(1)).toBe("1 idea sacada")
    expect(ideasSacadas(12)).toBe("12 ideas sacadas")
  })

  it("keeps the old words out of the text of every Biblioteca screen", () => {
    const viejas = /["'>]\s*(Papel|Afirmaciones|Tipos de afirmación|Puntaje|Evidencia)\b/
    expect(archivos(SECCION).filter((ruta) => viejas.test(readFileSync(ruta, "utf-8")))).toEqual([])
  })
})

describe("lineasParaWav (D10)", () => {
  const material = {
    id: "m-1",
    autor_id: "a-1",
    rol: "referente",
    motivo_fallo: null,
    costo_estimado_usd: null,
    costo_confirmado_en: null,
  }

  it("folds the role code, the evidence most first, and the ids", () => {
    expect(lineasParaWav(material, { opinion: 2, estudio: 3 })).toEqual([
      "Papel: referente",
      "Evidencia: Estudio 3 · Opinión 2",
      "Material: m-1",
      "Autor: a-1",
    ])
  })

  it("adds the reason and the estimated cost when there are", () => {
    expect(
      lineasParaWav(
        { ...material, motivo_fallo: "tope_mensual", costo_estimado_usd: 1.2, costo_confirmado_en: null },
        {},
      ),
    ).toEqual([
      "Papel: referente",
      "Motivo: tope_mensual",
      "Costo estimado: US$ 1,20 (sin confirmar)",
      "Material: m-1",
      "Autor: a-1",
    ])
    expect(
      lineasParaWav({ ...material, costo_estimado_usd: 0.5, costo_confirmado_en: "2026-11-02T12:00:00Z" }, {}),
    ).toContain("Costo estimado: US$ 0,50 (confirmado)")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-palabras.test.ts` → FAIL, cannot resolve `@/lib/dominio/biblioteca/detalle`.

- [ ] **Step 3: Implement.** Create `lib/dominio/biblioteca/palabras.ts`:

```ts
/**
 * Fix 4h: Coni reads her words; the technical ones go under "Detalle para WAV". From the pedido's PALABRAS_SIMPLES
 * and the spec of 29b. A unit test keeps the old words out of every screen of app/(app)/biblioteca.
 */
export const PALABRAS = {
  papel: "¿Quién es para ti?",
  afirmaciones: "Ideas sacadas",
  tiposDeAfirmacion: "Qué tipo de idea es",
  detalle: "Detalle para WAV",
} as const

export const REEMPLAZOS: readonly { antes: string; ahora: string }[] = [
  { antes: "Papel", ahora: PALABRAS.papel },
  { antes: "Afirmaciones", ahora: PALABRAS.afirmaciones },
  { antes: "Tipos de afirmación", ahora: PALABRAS.tiposDeAfirmacion },
]

/** Words that only ever appear inside "Detalle para WAV" (the score arrives with Semana, batch 5). */
export const SOLO_PARA_WAV = ["Puntaje", "Evidencia"] as const

export function ideasSacadas(cantidad: number): string {
  return cantidad === 1 ? "1 idea sacada" : `${cantidad} ideas sacadas`
}
```

Create `lib/dominio/biblioteca/detalle.ts`:

```ts
import { EVIDENCIA } from "./etiquetas"

interface MaterialParaWav {
  id: string
  autor_id: string
  rol: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
  costo_confirmado_en: string | null
}

const dolares = (monto: number) =>
  `US$ ${monto.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** What only WAV needs about a material (D10), folded under "Detalle para WAV". Each line is unique: it is a key. */
export function lineasParaWav(material: MaterialParaWav, evidencia: Record<string, number>): string[] {
  const lineas = [`Papel: ${material.rol}`]
  const respaldo = Object.entries(evidencia)
    .sort(([claveA, a], [claveB, b]) => b - a || claveA.localeCompare(claveB))
    .map(([clave, cantidad]) => `${EVIDENCIA[clave] ?? clave} ${cantidad}`)
  if (respaldo.length > 0) lineas.push(`Evidencia: ${respaldo.join(" · ")}`)
  if (material.motivo_fallo) lineas.push(`Motivo: ${material.motivo_fallo}`)
  if (material.costo_estimado_usd !== null) {
    const confirmado = material.costo_confirmado_en ? "confirmado" : "sin confirmar"
    lineas.push(`Costo estimado: ${dolares(material.costo_estimado_usd)} (${confirmado})`)
  }
  lineas.push(`Material: ${material.id}`, `Autor: ${material.autor_id}`)
  return lineas
}
```

(`lib/formato.ts` has the same `dolares`; it is not imported here so `lib/dominio` keeps depending only on itself.)

- [ ] **Step 4: Run green.** Run: `pnpm exec vitest run tests/unit/biblioteca-palabras.test.ts` → PASS (the folder scan finds no file yet; Tasks 14 to 27 keep it green).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/palabras.ts lib/dominio/biblioteca/detalle.ts tests/unit/biblioteca-palabras.test.ts
git add lib/dominio/biblioteca/palabras.ts lib/dominio/biblioteca/detalle.ts tests/unit/biblioteca-palabras.test.ts
git commit -m "$(cat <<'EOF'
Put Coni's words in the Biblioteca and fold the technical ones for WAV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

# Part C: Readers and actions

### Task 10: read past PostgREST's 1000 rows

**Files:**
- Create: `lib/datos/paginas.ts`
- Test: `tests/unit/paginas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/paginas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { FILAS_POR_PAGINA, leerTodas } from "@/lib/datos/paginas"

describe("leerTodas", () => {
  it("reads page after page until a short one, asking for contiguous ranges", async () => {
    const pedidos: [number, number][] = []
    const filas = await leerTodas("las pruebas", async (desde, hasta) => {
      pedidos.push([desde, hasta])
      const cantidad = desde === 0 ? FILAS_POR_PAGINA : 5
      return { data: Array.from({ length: cantidad }, (_, i) => desde + i), error: null }
    })
    expect(filas).toHaveLength(1005)
    expect(filas.at(-1)).toBe(1004)
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it("asks once more after a full last page and stops on an empty one", async () => {
    let llamadas = 0
    const filas = await leerTodas("las pruebas", async (desde) => {
      llamadas += 1
      return { data: desde === 0 ? Array.from({ length: FILAS_POR_PAGINA }, () => 1) : [], error: null }
    })
    expect(filas).toHaveLength(1000)
    expect(llamadas).toBe(2)
  })

  it("says what it could not read", async () => {
    await expect(leerTodas("las pruebas", async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow(
      "No pude leer las pruebas: boom",
    )
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/paginas.test.ts` → FAIL, cannot resolve `@/lib/datos/paginas`.

- [ ] **Step 3: Implement.** Create `lib/datos/paginas.ts` (Ingesta's `lib/ingesta/paginas.ts`):

```ts
/** PostgREST answers at most this many rows per request (`max_rows`), so long reads go page by page. */
export const FILAS_POR_PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Reads every row of a query, a page at a time; `pagina` must order its rows so the pages do not overlap. */
export async function leerTodas<T>(descripcion: string, pagina: (desde: number, hasta: number) => Pagina<T>) {
  const filas: T[] = []
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const { data, error } = await pagina(desde, desde + FILAS_POR_PAGINA - 1)
    if (error || !data) {
      throw new Error(`No pude leer ${descripcion}: ${error?.message ?? "sin datos"}`, { cause: error })
    }
    filas.push(...data)
    if (data.length < FILAS_POR_PAGINA) return filas
  }
}
```

- [ ] **Step 4: Run green.** Run: `pnpm exec vitest run tests/unit/paginas.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/datos/paginas.ts tests/unit/paginas.test.ts
git add lib/datos/paginas.ts tests/unit/paginas.test.ts
git commit -m "$(cat <<'EOF'
Read long queries page by page past PostgREST's row limit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 11: the Biblioteca's readers

**Files:**
- Create: `lib/datos/biblioteca.ts`, `tests/integration/siembra-biblioteca.ts`
- Test: `tests/integration/datos-biblioteca.test.ts`

- [ ] **Step 1: Write the seeding helpers.** Create `tests/integration/siembra-biblioteca.ts` (test support, used by Tasks 11 and 12):

```ts
import { CONI, pool } from "./db"

/** Any 1024-dimension vector: topics need a centroid, and these tests never search by meaning. */
const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

export async function sembrarAutor(nombre: string, credencial: string | null = null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.autores (nombre, credencial, tipo) values ($1, $2, 'persona') returning id",
    [nombre, credencial],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el autor ${nombre}`)
  return id
}

export interface MaterialDePrueba {
  titulo: string
  autorId: string
  estado?: "procesando" | "listo" | "fallido"
  rol?: "voz_propia" | "referente" | "evidencia" | "estrategia"
  tipo?: "documento" | "link" | "audio" | "video" | "imagen" | "post"
  motivo?: string | null
  costo?: number | null
  /** ISO instant; now when not given. */
  creadoEn?: string
}

export async function sembrarMaterial(m: MaterialDePrueba): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.materiales
       (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado, motivo_fallo,
        costo_estimado_usd, creado_en)
     values ($1, $2, $3, $4, 'texto de prueba', now(), $5, $6, $7, $8, coalesce($9::timestamptz, now()))
     returning id`,
    [
      m.titulo,
      m.tipo ?? "documento",
      m.autorId,
      m.rol ?? "referente",
      CONI,
      m.estado ?? "listo",
      m.motivo ?? null,
      m.costo ?? null,
      m.creadoEn ?? null,
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el material ${m.titulo}`)
  return id
}

export async function sembrarTema(nombre: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [nombre, CENTROIDE],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el tema ${nombre}`)
  return id
}

/** `cantidad` ideas of one material, taken a millisecond apart in the order given ("Idea 1", "Idea 2", ...). */
export async function sembrarIdeas(
  materialId: string,
  autorId: string,
  temaId: string | null,
  cantidad: number,
  extra: { excluida?: boolean; texto?: string; evidencia?: string } = {},
): Promise<void> {
  await pool.query(
    `insert into public.afirmaciones
       (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, excluida, creada_en)
     select $1::uuid, $2::uuid, 0, '{"pagina":1}'::jsonb, $5::text || ' ' || g, 'cita', 'dato', $6::text, $3::uuid,
            $4::boolean, now() + g * interval '1 millisecond'
       from generate_series(1, $7::int) g`,
    [materialId, autorId, temaId, extra.excluida ?? false, extra.texto ?? "Idea", extra.evidencia ?? "estudio", cantidad],
  )
}

/** One idea with a chosen id: `ffffffff-...` sorts after every other, so only a paged read ever reaches it. */
export async function sembrarIdeaConId(id: string, materialId: string, autorId: string, temaId: string): Promise<void> {
  await pool.query(
    `insert into public.afirmaciones (id, material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id)
     values ($1, $2, $3, 0, '{"pagina":1}'::jsonb, 'La última', 'cita', 'dato', 'estudio', $4)`,
    [id, materialId, autorId, temaId],
  )
}

export async function sembrarFicha(materialId: string, ideas: string[]): Promise<void> {
  await pool.query(
    `insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente)
     values ($1, 'Un resumen', $2::jsonb, '[]'::jsonb, '{"autor":null,"anio":null,"enlace":null}'::jsonb)`,
    [materialId, JSON.stringify(ideas)],
  )
}

/** Materials first: their ideas go with them, and only then can their topics and authors go. */
export async function borrarSembrado(materiales: string[], temas: string[], autores: string[]): Promise<void> {
  await pool.query("delete from public.materiales where id = any($1::uuid[])", [materiales])
  await pool.query("delete from public.temas where id = any($1::uuid[])", [temas])
  await pool.query("delete from public.autores where id = any($1::uuid[])", [autores])
}
```

- [ ] **Step 2: Write the failing integration test.** Create `tests/integration/datos-biblioteca.test.ts`:

```ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  contarPorEstado,
  leerMapaDelMaterial,
  leerMaterialConFicha,
  leerPanelDelMaterial,
  listarAutores,
  listarMateriales,
} from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import {
  borrarSembrado,
  sembrarAutor,
  sembrarFicha,
  sembrarIdeaConId,
  sembrarIdeas,
  sembrarMaterial,
  sembrarTema,
} from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const AUTORA = `Daniela Ruiz ${SUFIJO}`
const ULTIMA_IDEA = "ffffffff-ffff-4fff-bfff-ffffffffffff"

let coni: SupabaseClient<Database>
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []
let autor = ""
let empate = ""
let largo = ""
let vacio = ""
let estrategia = ""

beforeAll(async () => {
  coni = await clienteDeConi()
  autor = await sembrarAutor(AUTORA, "investigadora de confianza")
  autores.push(autor)
  const [carga, pausas, sueno, animo] = await Promise.all(
    ["Carga mental", "Pausas", "Sueño", "Ánimo"].map((nombre) => sembrarTema(`${nombre} ${SUFIJO}`)),
  )
  if (!carga || !pausas || !sueno || !animo) throw new Error("Faltan temas")
  temas.push(carga, pausas, sueno, animo)

  empate = await sembrarMaterial({ titulo: `Empate ${SUFIJO}`, autorId: autor })
  await sembrarIdeas(empate, autor, pausas, 2, { texto: "Primera" })
  await sembrarIdeas(empate, autor, carga, 2, { evidencia: "opinion" })
  await sembrarIdeas(empate, autor, sueno, 3, { excluida: true })
  await sembrarIdeas(empate, autor, null, 4)

  largo = await sembrarMaterial({ titulo: `Largo ${SUFIJO}`, autorId: autor })
  await sembrarIdeas(largo, autor, animo, 1000)
  await sembrarIdeaConId(ULTIMA_IDEA, largo, autor, carga)

  vacio = await sembrarMaterial({ titulo: `Vacío ${SUFIJO}`, autorId: autor, estado: "procesando" })
  estrategia = await sembrarMaterial({ titulo: `Plan ${SUFIJO}`, autorId: autor, rol: "estrategia" })
  await sembrarFicha(estrategia, ["Una", "Dos", "Tres", "Cuatro", "Cinco"])
  materiales.push(empate, largo, vacio, estrategia)
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("listarMateriales", () => {
  it("gives each material its main topic: most ideas, ties by name, excluded and topicless ideas left out", async () => {
    const lista = await listarMateriales(coni, { autor })
    expect(lista.find((m) => m.id === empate)?.tema).toEqual({ nombre: `Carga mental ${SUFIJO}`, otros: 1 })
    expect(lista.find((m) => m.id === vacio)?.tema).toBeNull()
  })

  it("reads every idea of the listed materials past the 1000 rows PostgREST answers at once", async () => {
    // The idea of the other topic sorts last by id: without paging it is never read and "+1" would be missing.
    const lista = await listarMateriales(coni, { autor })
    expect(lista.find((m) => m.id === largo)?.tema).toEqual({ nombre: `Ánimo ${SUFIJO}`, otros: 1 })
  })

  it("brings the author's name and the upload date, newest first", async () => {
    const lista = await listarMateriales(coni, { autor })
    expect(lista.map((m) => m.id)).toEqual([estrategia, vacio, largo, empate])
    expect(lista[0]).toMatchObject({ autor: AUTORA, autor_id: autor, rol: "estrategia", tipo: "documento" })
    expect(Number.isNaN(Date.parse(lista[0]?.creado_en ?? ""))).toBe(false)
  })

  it("filters by state, role and type", async () => {
    expect((await listarMateriales(coni, { autor, estado: "procesando" })).map((m) => m.id)).toEqual([vacio])
    expect((await listarMateriales(coni, { autor, rol: "estrategia" })).map((m) => m.id)).toEqual([estrategia])
    expect(await listarMateriales(coni, { autor, tipo: "video" })).toEqual([])
  })
})

describe("contarPorEstado", () => {
  it("counts the materials processing and with an error, as the quick filters say them", async () => {
    const { rows } = await pool.query<{ estado: string; n: number }>(
      "select estado, count(*)::int as n from public.materiales group by estado",
    )
    const cuenta = (estado: string) => rows.find((fila) => fila.estado === estado)?.n ?? 0
    expect(await contarPorEstado(coni)).toEqual({ procesando: cuenta("procesando"), fallido: cuenta("fallido") })
  })
})

describe("leerMaterialConFicha", () => {
  it("reads one material with its author's credential and its card", async () => {
    const leido = await leerMaterialConFicha(coni, estrategia)
    expect(leido?.material).toMatchObject({ id: estrategia, autor: AUTORA, credencial: "investigadora de confianza" })
    expect(leido?.ficha?.ideasClave).toEqual(["Una", "Dos", "Tres", "Cuatro", "Cinco"])
  })

  it("answers null for a material that does not exist", async () => {
    expect(await leerMaterialConFicha(coni, randomUUID())).toBeNull()
  })
})

describe("leerMapaDelMaterial", () => {
  it("counts only the ideas that were not excluded", async () => {
    const mapa = await leerMapaDelMaterial(coni, empate)
    expect(mapa.total).toBe(8)
    expect(mapa.sinTema).toBe(4)
    expect(mapa.temas.map((tema) => tema.afirmaciones)).toEqual([2, 2])
    expect(mapa.evidencia).toEqual({ estudio: 6, opinion: 2 })
  })
})

describe("leerPanelDelMaterial", () => {
  it("brings the count and the first two ideas in the order they were taken", async () => {
    const panel = await leerPanelDelMaterial(coni, empate)
    expect(panel?.ideas).toEqual({ total: 8, primeras: ["Primera 1", "Primera 2"] })
    expect(panel?.evidencia).toEqual({ estudio: 6, opinion: 2 })
  })

  it("uses the card's key ideas for a strategy material (D9)", async () => {
    const panel = await leerPanelDelMaterial(coni, estrategia)
    expect(panel?.ideas).toEqual({ total: 5, primeras: ["Una", "Dos"] })
  })

  it("answers null for a material that does not exist", async () => {
    expect(await leerPanelDelMaterial(coni, randomUUID())).toBeNull()
  })
})

describe("listarAutores", () => {
  it("lists the authors alphabetically with their credential and aliases", async () => {
    const lista = await listarAutores(coni)
    expect(lista.find((a) => a.id === autor)).toEqual({
      id: autor,
      nombre: AUTORA,
      credencial: "investigadora de confianza",
      tipo: "persona",
      alias: [],
    })
    const nombres = lista.map((a) => a.nombre)
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, "es")))
  })
})
```

- [ ] **Step 3: Run it and see it fail.**

Run: `pnpm test:db tests/integration/datos-biblioteca.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/datos/biblioteca"`.

- [ ] **Step 4: Implement.** Create `lib/datos/biblioteca.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import { type FichaLeida, leerFicha } from "@/lib/dominio/biblioteca/ficha"
import type { FiltrosDeMateriales } from "@/lib/dominio/biblioteca/filtros"
import { armarMapa, type FilaDeAfirmacion, type MapaDelMaterial } from "@/lib/dominio/biblioteca/mapa"
import { type TemaPrincipal, temasPrincipales } from "@/lib/dominio/biblioteca/temas"
import type { Database } from "@/lib/supabase/database.types"
import { leerTodas } from "./paginas"

type Db = SupabaseClient<Database>

/** The list shows the latest hundred: search (change 1) is how she reaches older ones. */
export const MAXIMO_DE_MATERIALES = 100

export interface MaterialDeLista {
  id: string
  titulo: string | null
  autor_id: string
  autor: string
  rol: string
  tipo: string
  estado: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
  costo_confirmado_en: string | null
  creado_en: string
  tema: TemaPrincipal | null
}

const COLUMNAS =
  "id, titulo, autor_id, rol, tipo, estado, motivo_fallo, costo_estimado_usd, costo_confirmado_en, creado_en"

/** The main topic of each listed material, from all their ideas, paged by id past the 1000-row limit (D8). */
async function leerTemasPrincipales(db: Db, ids: string[]): Promise<Map<string, TemaPrincipal>> {
  if (ids.length === 0) return new Map()
  const filas = await leerTodas("los temas de los materiales", (desde, hasta) =>
    db
      .from("afirmaciones")
      .select("material_id, tema_id, excluida, temas ( nombre )")
      .in("material_id", ids)
      .order("id")
      .range(desde, hasta),
  )
  return temasPrincipales(
    filas.map((fila) => ({
      materialId: fila.material_id,
      temaId: fila.tema_id,
      nombre: fila.temas?.nombre ?? "",
      excluida: fila.excluida,
    })),
  )
}

/** The latest materials, newest first, with their author and main topic; the filters are the ones of the URL. */
export async function listarMateriales(db: Db, filtros: FiltrosDeMateriales): Promise<MaterialDeLista[]> {
  let consulta = db
    .from("materiales")
    .select(`${COLUMNAS}, autores ( nombre )`)
    .order("creado_en", { ascending: false })
    .order("id")
    .limit(MAXIMO_DE_MATERIALES)
  if (filtros.autor) consulta = consulta.eq("autor_id", filtros.autor)
  if (filtros.rol) consulta = consulta.eq("rol", filtros.rol)
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo)
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado)
  const { data, error } = await consulta
  if (error) throw new Error(`No pude leer los materiales: ${error.message}`, { cause: error })
  const temas = await leerTemasPrincipales(
    db,
    data.map((material) => material.id),
  )
  return data.map(({ autores, ...material }) => ({
    ...material,
    autor: autores?.nombre ?? "",
    tema: temas.get(material.id) ?? null,
  }))
}

/** How many materials are processing and how many failed: the counts of the quick filters (4b). */
export async function contarPorEstado(db: Db): Promise<{ procesando: number; fallido: number }> {
  const contar = async (estado: "procesando" | "fallido") => {
    const { count, error } = await db.from("materiales").select("id", { count: "exact", head: true }).eq("estado", estado)
    if (error) throw new Error(`No pude contar los materiales ${estado}: ${error.message}`, { cause: error })
    return count ?? 0
  }
  const [procesando, fallido] = await Promise.all([contar("procesando"), contar("fallido")])
  return { procesando, fallido }
}

export interface MaterialLeido extends Omit<MaterialDeLista, "tema"> {
  credencial: string | null
  idioma_original: string | null
  origen_url: string | null
}

/** One material with its author and its card (null while it has none, or when the card cannot be read). */
export async function leerMaterialConFicha(
  db: Db,
  id: string,
): Promise<{ material: MaterialLeido; ficha: FichaLeida | null } | null> {
  const { data, error } = await db
    .from("materiales")
    .select(
      `${COLUMNAS}, idioma_original, origen_url, autores ( nombre, credencial ), fichas ( resumen, ideas_clave, citas, fuente )`,
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el material ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  const { autores, fichas, ...material } = data
  const fila = Array.isArray(fichas) ? fichas[0] : fichas
  const ficha = fila ? leerFicha(fila) : null
  if (fila && !ficha) console.error(`La ficha del material ${id} no tiene la forma que escribe la tarea`)
  return {
    material: { ...material, autor: autores?.nombre ?? "", credencial: autores?.credencial ?? null },
    ficha,
  }
}

/** The map of a material: what its ideas are about and how they are backed. Excluded ideas are not part of it. */
export async function leerMapaDelMaterial(db: Db, materialId: string): Promise<MapaDelMaterial> {
  const filas: FilaDeAfirmacion[] = await leerTodas(`las ideas del material ${materialId}`, (desde, hasta) =>
    db
      .from("afirmaciones")
      .select("tema_id, tipo, evidencia, temas ( nombre )")
      .eq("material_id", materialId)
      .eq("excluida", false)
      .order("id")
      .range(desde, hasta),
  )
  return armarMapa(filas)
}

export interface PanelDelMaterial {
  material: MaterialLeido
  ideas: { total: number; primeras: string[] }
  evidencia: Record<string, number>
}

/** What the desktop side panel shows (D9): the ideas taken (count and first two) and the evidence for WAV. */
export async function leerPanelDelMaterial(db: Db, id: string): Promise<PanelDelMaterial | null> {
  const leido = await leerMaterialConFicha(db, id)
  if (!leido) return null
  const { material, ficha } = leido
  if (material.rol === "estrategia") {
    const ideas = ficha?.ideasClave ?? []
    return { material, ideas: { total: ideas.length, primeras: ideas.slice(0, 2) }, evidencia: {} }
  }
  const [mapa, primeras] = await Promise.all([
    leerMapaDelMaterial(db, id),
    db
      .from("afirmaciones")
      .select("texto")
      .eq("material_id", id)
      .eq("excluida", false)
      .order("creada_en")
      .order("id")
      .limit(2),
  ])
  if (primeras.error) {
    throw new Error(`No pude leer las ideas del material ${id}: ${primeras.error.message}`, { cause: primeras.error })
  }
  return {
    material,
    ideas: { total: mapa.total, primeras: primeras.data.map((fila) => fila.texto) },
    evidencia: mapa.evidencia,
  }
}

/** The authors in alphabetical order. Row level security shows nothing to someone who is not Coni or WAV. */
export async function listarAutores(db: Db): Promise<AutorDeLista[]> {
  const { data, error } = await db.from("autores").select("id, nombre, credencial, tipo, alias")
  if (error) throw new Error(`No pude leer los autores: ${error.message}`, { cause: error })
  return data.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}
```

If `pnpm type` reads the embedded `autores`/`fichas` relations as arrays (it reads them as single objects for the to-one `materiales.autor_id` and `fichas.material_id` foreign keys in Ingesta, which has the same generated types), keep the `Array.isArray` guard for `fichas` only, as above.

- [ ] **Step 5: Run green.**

Run: `pnpm test:db tests/integration/datos-biblioteca.test.ts && pnpm type`
Expected: PASS; no type error.

- [ ] **Step 6: Commit.**

```bash
pnpm exec biome check --write lib/datos/biblioteca.ts tests/integration/siembra-biblioteca.ts tests/integration/datos-biblioteca.test.ts
git add lib/datos/biblioteca.ts tests/integration/siembra-biblioteca.ts tests/integration/datos-biblioteca.test.ts
git commit -m "$(cat <<'EOF'
Read the Biblioteca's materials with their main topic, counts and panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 12: the Biblioteca's actions, Coni only

**Files:**
- Create: `lib/acciones/biblioteca.ts`
- Test: `tests/integration/acciones-biblioteca.test.ts`, `tests/unit/acciones-biblioteca-esquemas.test.ts`

- [ ] **Step 1: Write the failing schema test.** Create `tests/unit/acciones-biblioteca-esquemas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { AutorNuevo, EdicionDeMaterial, SobreMaterial } from "@/lib/acciones/biblioteca"

const ID = "11111111-2222-4333-8444-555555555555"

describe("the Biblioteca's action inputs", () => {
  it("take a material id and nothing that is not one", () => {
    expect(SobreMaterial.safeParse({ materialId: ID }).success).toBe(true)
    expect(SobreMaterial.safeParse({ materialId: "../x" }).success).toBe(false)
  })

  it("take an author and one of the four roles", () => {
    expect(EdicionDeMaterial.safeParse({ materialId: ID, autorId: ID, rol: "evidencia" }).success).toBe(true)
    expect(EdicionDeMaterial.safeParse({ materialId: ID, autorId: ID, rol: "coni" }).success).toBe(false)
  })

  it("take a new author of a kind she can pick, with short texts", () => {
    expect(AutorNuevo.safeParse({ nombre: "Ana", credencial: "", tipo: "persona" }).success).toBe(true)
    expect(AutorNuevo.safeParse({ nombre: "Ana", credencial: "", tipo: "coni" }).success).toBe(false)
    expect(AutorNuevo.safeParse({ nombre: "x".repeat(201), credencial: "", tipo: "persona" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Write the failing integration test.** Create `tests/integration/acciones-biblioteca.test.ts`:

```ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  confirmarCosto,
  crearAutor,
  type DepsBiblioteca,
  editarFicha,
  editarMaterial,
  pedirTextoOriginal,
  reintentarMaterial,
  reprocesarMaterial,
} from "@/lib/acciones/biblioteca"
import { claveProcesarMaterial } from "@/lib/acciones/disparos"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, type MaterialDePrueba, sembrarAutor, sembrarFicha, sembrarMaterial } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const SOLO_CONI = "Esta app es solo para Coni."
const IDEAS = ["Una", "Dos", "Tres", "Cuatro", "Cinco"]

let coni: Db
let wav: Db
let autor = ""
let otroAutor = ""
const materiales: string[] = []
const autores: string[] = []
const disparos: { materialId: string; intento: string | undefined }[] = []
const almacen = almacenEnMemoria()
let siguiente = 0

function deps(db: Db, fallo?: Error): DepsBiblioteca {
  return {
    db,
    disparar: {
      async material(materialId, intento) {
        if (fallo) throw fallo
        disparos.push({ materialId, intento })
      },
    },
    nuevoId: () => `intento-${++siguiente}`,
    almacen,
  }
}

async function material(extra: Partial<MaterialDePrueba> = {}): Promise<string> {
  const id = await sembrarMaterial({ titulo: `Acción ${SUFIJO}`, autorId: autor, ...extra })
  materiales.push(id)
  return id
}

async function fila(id: string) {
  const { rows } = await pool.query(
    "select estado, motivo_fallo, rol, autor_id, costo_confirmado_en from public.materiales where id = $1",
    [id],
  )
  return rows[0]
}

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  autor = await sembrarAutor(`Autora ${SUFIJO}`)
  otroAutor = await sembrarAutor(`Otra autora ${SUFIJO}`)
  autores.push(autor, otroAutor)
})

beforeEach(() => {
  disparos.length = 0
})

afterAll(async () => {
  await pool.query("delete from public.autores where nombre = $1", [`Nueva ${SUFIJO}`])
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

describe("reintentarMaterial", () => {
  it("puts a failed material back to processing and starts a run under a new attempt", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })

    expect(await reintentarMaterial(deps(coni), id)).toEqual({ ok: true })

    expect(await fila(id)).toMatchObject({ estado: "procesando", motivo_fallo: null })
    expect(disparos).toEqual([{ materialId: id, intento: `intento-${siguiente}` }])
  })

  it("starts two runs with two keys when she retries twice", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })
    await reintentarMaterial(deps(coni), id)
    await pool.query("update public.materiales set estado = 'fallido', motivo_fallo = 'sin_texto' where id = $1", [id])
    await reintentarMaterial(deps(coni), id)

    const claves = disparos.map((d) => claveProcesarMaterial(d.materialId, d.intento))
    expect(claves).toHaveLength(2)
    expect(new Set(claves).size).toBe(2)
  })

  it("says a ready material cannot be retried, and starts nothing", async () => {
    const id = await material({ estado: "listo" })
    expect(await reintentarMaterial(deps(coni), id)).toEqual({ ok: false, error: "Ese material ya no se puede reintentar." })
    expect(disparos).toEqual([])
  })

  it("leaves the material retryable and tells her when the run cannot start", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })
    expect(await reintentarMaterial(deps(coni, new Error("Trigger caído")), id)).toEqual({
      ok: false,
      error: "No pude iniciar el procesamiento. Toca Reintentar en un rato.",
    })
    expect(await fila(id)).toMatchObject({
      estado: "procesando",
      motivo_fallo: "No pude iniciar el procesamiento. Reintenta.",
    })
  })
})

describe("reprocesarMaterial and confirmarCosto", () => {
  it("sends a ready material through the whole process again under a new attempt", async () => {
    const id = await material({ estado: "listo" })
    expect(await reprocesarMaterial(deps(coni), id)).toEqual({ ok: true })
    expect((await fila(id))?.estado).toBe("procesando")
    expect(disparos).toEqual([{ materialId: id, intento: `intento-${siguiente}` }])
  })

  it("says a material still processing cannot be reprocessed now", async () => {
    const id = await material({ estado: "procesando" })
    expect(await reprocesarMaterial(deps(coni), id)).toEqual({
      ok: false,
      error: "Ese material no se puede reprocesar ahora.",
    })
  })

  it("confirms the cost of a long material and starts its run", async () => {
    const id = await material({ estado: "procesando", costo: 1.2 })
    expect(await confirmarCosto(deps(coni), id)).toEqual({ ok: true })
    expect((await fila(id))?.costo_confirmado_en).not.toBeNull()
    expect(disparos.map((d) => d.materialId)).toEqual([id])
  })

  it("says a material that does not wait for her OK any more does not", async () => {
    const id = await material({ estado: "listo" })
    expect(await confirmarCosto(deps(coni), id)).toEqual({ ok: false, error: "Ese material ya no espera confirmación." })
  })
})

describe("editarMaterial and editarFicha", () => {
  it("changes who a material is by and who it is for her", async () => {
    const id = await material()
    expect(await editarMaterial(deps(coni), { materialId: id, autorId: otroAutor, rol: "evidencia" })).toEqual({
      ok: true,
    })
    expect(await fila(id)).toMatchObject({ autor_id: otroAutor, rol: "evidencia" })
  })

  it("says so when the author was deleted meanwhile, or the material is not there", async () => {
    const id = await material()
    expect(await editarMaterial(deps(coni), { materialId: id, autorId: randomUUID(), rol: "referente" })).toEqual({
      ok: false,
      error: "Ese autor ya no existe. Elígelo de nuevo.",
    })
    expect(await editarMaterial(deps(coni), { materialId: randomUUID(), autorId: autor, rol: "referente" })).toEqual({
      ok: false,
      error: "No encontré ese material.",
    })
  })

  it("saves the four fields of a card and refuses fewer than five key ideas", async () => {
    const id = await material({ rol: "estrategia" })
    await sembrarFicha(id, IDEAS)
    const edicion = {
      materialId: id,
      resumen: "Otro resumen",
      ideasClave: [...IDEAS, "Seis"],
      citas: [],
      fuente: { autor: "Gottman", anio: 2015, enlace: null },
    }

    expect(await editarFicha(deps(coni), edicion)).toEqual({ ok: true })
    const { rows } = await pool.query("select resumen, ideas_clave from public.fichas where material_id = $1", [id])
    expect(rows[0]).toEqual({ resumen: "Otro resumen", ideas_clave: [...IDEAS, "Seis"] })

    expect(await editarFicha(deps(coni), { ...edicion, ideasClave: ["Una"] })).toEqual({
      ok: false,
      error: "Deja entre 5 y 10 ideas clave.",
    })
  })
})

describe("crearAutor", () => {
  it("adds an author, and answers the existing one for the same name", async () => {
    const primero = await crearAutor(deps(coni), { nombre: `Nueva ${SUFIJO}`, credencial: "Sexóloga", tipo: "persona" })
    const segundo = await crearAutor(deps(coni), { nombre: ` nueva ${SUFIJO} `, credencial: "", tipo: "persona" })
    expect(primero).toMatchObject({ ok: true, autor: { nombre: `Nueva ${SUFIJO}`, credencial: "Sexóloga" } })
    expect(segundo.ok && primero.ok && segundo.autor.id === primero.autor.id).toBe(true)
  })

  it("asks for a name", async () => {
    expect(await crearAutor(deps(coni), { nombre: "  ", credencial: "", tipo: "persona" })).toEqual({
      ok: false,
      error: "Escribe el nombre del autor.",
    })
  })
})

describe("pedirTextoOriginal", () => {
  it("signs the original text for five minutes, or says it is not there yet", async () => {
    const id = await material()
    expect(await pedirTextoOriginal(deps(coni), id)).toEqual({
      ok: false,
      error: "Ese texto todavía no está disponible.",
    })
    await almacen.subir(`materiales/${id}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    expect(await pedirTextoOriginal(deps(coni), id)).toEqual({
      ok: true,
      url: `https://almacen.test/materiales/${id}/texto-original.txt?expira=300&descarga=texto-original.txt`,
    })
  })
})

describe("WAV is refused on every action (es_coni), even where row level security would let it", () => {
  it("changes nothing, starts nothing and signs nothing", async () => {
    const fallido = await material({ estado: "fallido", motivo: "sin_texto" })
    const listo = await material({ estado: "listo", rol: "estrategia" })
    const caro = await material({ estado: "procesando", costo: 1.2 })
    await sembrarFicha(listo, IDEAS)
    await almacen.subir(`materiales/${listo}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    const antes = await Promise.all([fila(fallido), fila(listo), fila(caro)])

    const resultados = [
      await reintentarMaterial(deps(wav), fallido),
      await reprocesarMaterial(deps(wav), listo),
      await confirmarCosto(deps(wav), caro),
      await editarMaterial(deps(wav), { materialId: listo, autorId: otroAutor, rol: "evidencia" }),
      await editarFicha(deps(wav), {
        materialId: listo,
        resumen: "De WAV",
        ideasClave: IDEAS,
        citas: [],
        fuente: { autor: null, anio: null, enlace: null },
      }),
      await crearAutor(deps(wav), { nombre: `De WAV ${SUFIJO}`, credencial: "", tipo: "persona" }),
      await pedirTextoOriginal(deps(wav), listo),
    ]

    expect(resultados).toEqual(Array.from({ length: 7 }, () => ({ ok: false, error: SOLO_CONI })))
    expect(await Promise.all([fila(fallido), fila(listo), fila(caro)])).toEqual(antes)
    expect(disparos).toEqual([])
    const { rows } = await pool.query("select resumen from public.fichas where material_id = $1", [listo])
    expect(rows[0]?.resumen).toBe("Un resumen")
    const { rowCount } = await pool.query("select 1 from public.autores where nombre = $1", [`De WAV ${SUFIJO}`])
    expect(rowCount).toBe(0)
  })
})
```

- [ ] **Step 3: Run them and see them fail.**

Run: `pnpm exec vitest run tests/unit/acciones-biblioteca-esquemas.test.ts; pnpm test:db tests/integration/acciones-biblioteca.test.ts`
Expected: both FAIL, `Failed to resolve import "@/lib/acciones/biblioteca"`.

- [ ] **Step 4: Implement.** Create `lib/acciones/biblioteca.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import { leerEdicion } from "@/lib/dominio/biblioteca/ficha"
import { ROLES, TIPOS_DE_AUTOR_NUEVO } from "@/lib/dominio/biblioteca/modelo"
import { Falla } from "@/lib/dominio/falla"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import type { DisparosDeBiblioteca } from "./disparos"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsBiblioteca {
  /** Coni's client: row level security applies, and `es_coni` is checked again here (spec A6). */
  db: Db
  disparar: Pick<DisparosDeBiblioteca, "material">
  /** The attempt of each new run (D2): a fresh key, so the failed run is never reused. */
  nuevoId: () => string
  almacen: Pick<Almacen, "urlDeTexto">
}

export const SobreMaterial = z.object({ materialId: z.uuid() })
export const EdicionDeMaterial = z.object({ materialId: z.uuid(), autorId: z.uuid(), rol: z.enum(ROLES) })
export const AutorNuevo = z.object({
  nombre: z.string().max(200),
  credencial: z.string().max(200),
  tipo: z.enum(TIPOS_DE_AUTOR_NUEVO),
})

const SOLO_CONI = "Esta app es solo para Coni."
const NO_PUDE_INICIAR = "No pude iniciar el procesamiento. Toca Reintentar en un rato."
const NO_ENCONTRE = "No encontré ese material."
const NO_ES_EL_ESTADO = "22023"
const CLAVE_FORANEA = "23503"
/** A download link is for one tap. */
const SEGUNDOS_DE_DESCARGA = 5 * 60

/** Row level security lets WAV act on materials (F5); only Coni does it from Conidolly. */
async function exigirConi(db: Db): Promise<void> {
  const { data, error } = await db.rpc("es_coni")
  if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
  if (!data) throw new Falla(SOLO_CONI)
}

/**
 * Starts the run under a new attempt. When it cannot start, the material gets a reason so it stops polling and can be
 * retried; if even that fails the log says which material is stuck.
 */
async function iniciar(deps: DepsBiblioteca, materialId: string, cuando: string): Promise<void> {
  try {
    await deps.disparar.material(materialId, deps.nuevoId())
  } catch (error) {
    console.error(`No pude iniciar el procesamiento del material ${materialId} al ${cuando}`, error)
    const { error: errorAlMarcar } = await deps.db.rpc("marcar_disparo_fallido", { p_id: materialId })
    if (errorAlMarcar) {
      console.error(`El material ${materialId} quedó procesando sin motivo: no pude marcarlo`, errorAlMarcar)
    }
    throw new Falla(NO_PUDE_INICIAR)
  }
}

type RpcDeMaterial = "reintentar_material" | "reprocesar_material" | "confirmar_costo_material"

/** The database goes first: it is what refuses a second tap. Then the run starts under its own attempt. */
function moverYProcesar(nombre: string, rpc: RpcDeMaterial, siNoCorresponde: string, cuando: string) {
  return (deps: DepsBiblioteca, materialId: string): Promise<Resultado> =>
    aResultado(nombre, async () => {
      await exigirConi(deps.db)
      const { error } = await deps.db.rpc(rpc, { p_id: materialId })
      if (error) {
        if (error.code === NO_ES_EL_ESTADO) throw new Falla(siNoCorresponde)
        throw new Error(`No pude ${cuando} el material ${materialId}: ${error.message}`, { cause: error })
      }
      await iniciar(deps, materialId, cuando)
      return {}
    })
}

/** A failed material, or one paused with a reason, back to processing. */
export const reintentarMaterial = moverYProcesar(
  "reintentarMaterial",
  "reintentar_material",
  "Ese material ya no se puede reintentar.",
  "reintentar",
)

/** A ready material through the whole process again; `reprocesar_material` drops what the old run derived. */
export const reprocesarMaterial = moverYProcesar(
  "reprocesarMaterial",
  "reprocesar_material",
  "Ese material no se puede reprocesar ahora.",
  "reprocesar",
)

/** "Procesar por ~US$ X": the task already stored the extraction, so it only spends on what is left. */
export const confirmarCosto = moverYProcesar(
  "confirmarCosto",
  "confirmar_costo_material",
  "Ese material ya no espera confirmación.",
  "confirmar el costo de",
)

/** Changes who a material is by and who it is for her. The column grants allow only these two. */
export function editarMaterial(deps: DepsBiblioteca, edicion: z.output<typeof EdicionDeMaterial>): Promise<Resultado> {
  return aResultado("editarMaterial", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("materiales")
      .update({ autor_id: edicion.autorId, rol: edicion.rol })
      .eq("id", edicion.materialId)
      .select("id")
    if (error) {
      if (error.code === CLAVE_FORANEA) throw new Falla("Ese autor ya no existe. Elígelo de nuevo.")
      throw new Error(`No pude cambiar el material ${edicion.materialId}: ${error.message}`, { cause: error })
    }
    if (data.length === 0) throw new Falla(NO_ENCONTRE)
    return {}
  })
}

/** Saves what she changed on a card: only the four fields, validated with her words. */
export function editarFicha(deps: DepsBiblioteca, entrada: unknown): Promise<Resultado> {
  return aResultado("editarFicha", async () => {
    await exigirConi(deps.db)
    const leida = leerEdicion(entrada)
    if (!leida.ok) throw new Falla(leida.error)
    const { materialId, resumen, ideasClave, citas, fuente } = leida.datos
    const { data, error } = await deps.db
      .from("fichas")
      .update({ resumen, ideas_clave: ideasClave, citas, fuente })
      .eq("material_id", materialId)
      .select("material_id")
    if (error) throw new Error(`No pude guardar la ficha del material ${materialId}: ${error.message}`, { cause: error })
    if (data.length === 0) throw new Falla("Ese material todavía no tiene ficha.")
    return {}
  })
}

/** "Autor nuevo": `crear_autor` answers the existing one when the name or an alias was already taken. */
export function crearAutor(
  deps: Pick<DepsBiblioteca, "db">,
  nuevo: z.output<typeof AutorNuevo>,
): Promise<Resultado<{ autor: AutorDeLista }>> {
  return aResultado("crearAutor", async () => {
    await exigirConi(deps.db)
    const nombre = nuevo.nombre.trim()
    if (nombre === "") throw new Falla("Escribe el nombre del autor.")
    const { data: id, error } = await deps.db.rpc("crear_autor", {
      p_nombre: nombre,
      p_credencial: nuevo.credencial.trim(),
      p_tipo: nuevo.tipo,
    })
    if (error) throw new Error(`No pude crear el autor: ${error.message}`, { cause: error })
    const { data: autor, error: errorDeLectura } = await deps.db
      .from("autores")
      .select("id, nombre, credencial, tipo, alias")
      .eq("id", id)
      .single()
    if (errorDeLectura) throw new Error(`No pude leer el autor ${id}: ${errorDeLectura.message}`, { cause: errorDeLectura })
    return { autor }
  })
}

/** A five-minute link to the original text (the extraction, never a translation). The file never passes through here. */
export function pedirTextoOriginal(
  deps: Pick<DepsBiblioteca, "db" | "almacen">,
  materialId: string,
): Promise<Resultado<{ url: string }>> {
  return aResultado("pedirTextoOriginal", async () => {
    await exigirConi(deps.db)
    const url = await deps.almacen.urlDeTexto(materialId, SEGUNDOS_DE_DESCARGA)
    if (url === null) throw new Falla("Ese texto todavía no está disponible.")
    return { url }
  })
}
```

- [ ] **Step 5: Run green.**

Run: `pnpm exec vitest run tests/unit/acciones-biblioteca-esquemas.test.ts && pnpm test:db tests/integration/acciones-biblioteca.test.ts && pnpm type`
Expected: PASS. A row the integration test left behind is removed by its `afterAll`; if a run is interrupted, `delete from public.materiales where titulo like 'Acción %'` on the local database cleans it.

- [ ] **Step 6: Commit.**

```bash
pnpm exec biome check --write lib/acciones/biblioteca.ts tests/unit/acciones-biblioteca-esquemas.test.ts tests/integration/acciones-biblioteca.test.ts
git add lib/acciones/biblioteca.ts tests/unit/acciones-biblioteca-esquemas.test.ts tests/integration/acciones-biblioteca.test.ts
git commit -m "$(cat <<'EOF'
Add the Biblioteca's actions for Coni only, with a new run per attempt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 13: the server actions and the signed download route

**Files:**
- Create: `app/(app)/biblioteca/acciones.ts`, `app/(app)/biblioteca/materiales/[id]/texto/route.ts`
- Test: `tests/unit/biblioteca-texto-ruta.test.ts`

- [ ] **Step 1: Write the failing route test.** Create `tests/unit/biblioteca-texto-ruta.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { conSesionDeConi } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true; url: string } | { ok: false; error: string }> => ({
      ok: true,
      url: "https://r2.test/firmada",
    }),
  ),
}))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi }))

import { GET } from "@/app/(app)/biblioteca/materiales/[id]/texto/route"

const ID = "11111111-2222-4333-8444-555555555555"
const llamar = () => GET(new Request(`http://app.test/biblioteca/materiales/${ID}/texto`), { params: Promise.resolve({ id: ID }) })

beforeEach(() => vi.clearAllMocks())

describe("GET /biblioteca/materiales/[id]/texto", () => {
  it("checks Coni with the id and sends the browser to the signed text, never cached", async () => {
    const respuesta = await llamar()
    expect(conSesionDeConi).toHaveBeenCalledWith("pedirTextoOriginal", expect.anything(), { materialId: ID }, expect.any(Function))
    expect(respuesta.status).toBe(302)
    expect(respuesta.headers.get("location")).toBe("https://r2.test/firmada")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
  })

  it("answers the reason in plain text when it cannot sign", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Ese texto todavía no está disponible." })
    const respuesta = await llamar()
    expect(respuesta.status).toBe(404)
    expect(await respuesta.text()).toBe("Ese texto todavía no está disponible.")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-texto-ruta.test.ts` → FAIL, cannot resolve `@/app/(app)/biblioteca/materiales/[id]/texto/route`.

- [ ] **Step 3: Implement the route.** Create `app/(app)/biblioteca/materiales/[id]/texto/route.ts`:

```ts
import { pedirTextoOriginal, SobreMaterial } from "@/lib/acciones/biblioteca"
import { conSesionDeConi } from "@/lib/acciones/servidor"
import { almacenReal } from "@/lib/proveedores/almacen"

const SIN_CACHE = { "cache-control": "no-store" }

/**
 * Sends the browser to a five-minute signed download of the original text (D12). The person is checked here, not by
 * the page that links to it: a route handler is a public endpoint like a Server Action. The file goes from R2 to her.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const resultado = await conSesionDeConi("pedirTextoOriginal", SobreMaterial, { materialId: id }, (db, datos) =>
    pedirTextoOriginal({ db, almacen: { urlDeTexto: (m, s) => almacenReal().urlDeTexto(m, s) } }, datos.materialId),
  )
  if (!resultado.ok) {
    return new Response(resultado.error, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", ...SIN_CACHE },
    })
  }
  return new Response(null, { status: 302, headers: { location: resultado.url, ...SIN_CACHE } })
}
```

- [ ] **Step 4: Create the server actions.** Create `app/(app)/biblioteca/acciones.ts`:

```ts
"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  AutorNuevo,
  confirmarCosto,
  crearAutor,
  type DepsBiblioteca,
  EdicionDeMaterial,
  editarFicha,
  editarMaterial,
  reintentarMaterial,
  reprocesarMaterial,
  SobreMaterial,
} from "@/lib/acciones/biblioteca"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi, disparosDeBibliotecaDeLaApp } from "@/lib/acciones/servidor"
import { almacenReal } from "@/lib/proveedores/almacen"

function depsDeBiblioteca(db: DepsBiblioteca["db"]): DepsBiblioteca {
  return {
    db,
    disparar: disparosDeBibliotecaDeLaApp(),
    nuevoId: randomUUID,
    // Resolved on use: an action that signs nothing must not need the R2 variables.
    almacen: { urlDeTexto: (materialId, segundos) => almacenReal().urlDeTexto(materialId, segundos) },
  }
}

/** A change to a material changes the list, the side panel and its detail. */
async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/biblioteca", "layout")
  return resultado
}

export async function reintentarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("reintentarMaterial", SobreMaterial, { materialId }, (db, d) =>
      reintentarMaterial(depsDeBiblioteca(db), d.materialId),
    ),
  )
}

export async function reprocesarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("reprocesarMaterial", SobreMaterial, { materialId }, (db, d) =>
      reprocesarMaterial(depsDeBiblioteca(db), d.materialId),
    ),
  )
}

export async function confirmarCostoAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("confirmarCosto", SobreMaterial, { materialId }, (db, d) =>
      confirmarCosto(depsDeBiblioteca(db), d.materialId),
    ),
  )
}

export async function editarMaterialAccion(edicion: z.input<typeof EdicionDeMaterial>) {
  return refrescar(
    await conSesionDeConi("editarMaterial", EdicionDeMaterial, edicion, (db, d) =>
      editarMaterial(depsDeBiblioteca(db), d),
    ),
  )
}

/** The card is validated inside `editarFicha` with her words (a short card, a bad link), not here. */
export async function editarFichaAccion(edicion: unknown) {
  return refrescar(
    await conSesionDeConi("editarFicha", z.unknown(), edicion, (db, d) => editarFicha(depsDeBiblioteca(db), d)),
  )
}

export async function crearAutorAccion(nuevo: z.input<typeof AutorNuevo>) {
  return refrescar(await conSesionDeConi("crearAutor", AutorNuevo, nuevo, (db, d) => crearAutor({ db }, d)))
}
```

- [ ] **Step 5: Run green, and type-check.**

Run: `pnpm exec vitest run tests/unit/biblioteca-texto-ruta.test.ts && pnpm type`
Expected: PASS; no type error (`next typegen` validates the route's context type).

- [ ] **Step 6: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/acciones.ts" "app/(app)/biblioteca/materiales/[id]/texto/route.ts" tests/unit/biblioteca-texto-ruta.test.ts
head -1 "app/(app)/biblioteca/acciones.ts"   # must print "use server"
git add "app/(app)/biblioteca/acciones.ts" "app/(app)/biblioteca/materiales/[id]/texto/route.ts" tests/unit/biblioteca-texto-ruta.test.ts
git commit -m "$(cat <<'EOF'
Expose the Biblioteca's actions to Coni and sign the original text download

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

# Part D: The section shell

### Task 14: an icon for a pill and for a tab

**Files:**
- Modify: `components/ui/estado.tsx`, `components/ui/pestanas.tsx`
- Test: `tests/unit/pildora-y-pestana-con-icono.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/pildora-y-pestana-con-icono.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PildoraDeEstado } from "@/components/ui/estado"
import { Pestanas } from "@/components/ui/pestanas"

describe("PildoraDeEstado with an icon of its own (4j)", () => {
  it("draws the icon it is given on a neutral pill, which had none", () => {
    render(
      <PildoraDeEstado tipo="neutro" icono={<svg data-testid="reloj" />}>
        Procesando
      </PildoraDeEstado>,
    )
    const pildora = screen.getByText("Procesando").parentElement
    expect(pildora?.querySelector("[data-testid=reloj]")).not.toBeNull()
    expect(pildora).toHaveClass("bg-piedra-alta")
  })

  it("uses it instead of the warning of an aviso pill, never both", () => {
    render(
      <PildoraDeEstado tipo="aviso" icono={<svg data-testid="mano" />}>
        Espera tu OK
      </PildoraDeEstado>,
    )
    const pildora = screen.getByText("Espera tu OK").parentElement
    expect(pildora?.querySelectorAll("svg")).toHaveLength(1)
    expect(pildora?.querySelector("[data-testid=mano]")).not.toBeNull()
  })
})

describe("Pestanas with icons (4c)", () => {
  it("puts the icon before the name and keeps the name as the link's name", () => {
    render(
      <Pestanas
        etiqueta="Secciones de la Biblioteca"
        actual="materiales"
        opciones={[{ valor: "materiales", etiqueta: "Materiales", href: "/biblioteca", icono: <svg data-testid="icono" /> }]}
      />,
    )
    const enlace = screen.getByRole("link", { name: "Materiales" })
    expect(enlace).toHaveAttribute("aria-current", "page")
    expect(enlace.querySelector("[data-testid=icono]")).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/pildora-y-pestana-con-icono.test.tsx` → FAIL: the pill renders no `reloj` (and type-check would say `icono` is not a prop).

- [ ] **Step 3: Implement.** In `components/ui/estado.tsx`, change the component to:

```tsx
export function PildoraDeEstado({
  tipo,
  icono,
  children,
  className,
}: {
  tipo: TipoDePildora
  /** An icon that says this state better than the kind's own (the Biblioteca's processing hourglass, 4j). */
  icono?: ReactNode
  children: ReactNode
  className?: string
}) {
  const Icono = tipo === "neutro" ? null : ICONOS[tipo]
  const marca = icono ?? (Icono ? <Icono aria-hidden="true" size={ICONO.chico} weight="bold" className="shrink-0" /> : null)
  return (
    <span
      data-contorno
      className={cn(
        "pildora inline-flex min-h-pildora max-w-full items-center gap-2 rounded-control py-1 pr-3.5 pl-2.5 text-meta font-semibold",
        tipo === "neutro" ? cn("bg-piedra-alta", !marca && "pl-3.5") : "bg-piedra-honda",
        tipo === "error" ? "text-error" : "text-tinta",
        className,
      )}
    >
      {marca}
      <span>{children}</span>
    </span>
  )
}
```

In `components/ui/pestanas.tsx`: add `import type { ReactNode } from "react"`, add `icono?: ReactNode` to `OpcionDePestana`, add `gap-2` to the link's class list (`"flex min-h-objetivo items-center justify-center gap-2 rounded-control px-3 ..."`) and render `{opcion.icono}{opcion.etiqueta}` instead of `{opcion.etiqueta}`.

- [ ] **Step 4: Run green with every pill and tab test.** Run: `pnpm exec vitest run tests/unit/pildora-y-pestana-con-icono.test.tsx tests/unit/ui-estado.test.tsx tests/unit/pestanas.test.tsx` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write components/ui/estado.tsx components/ui/pestanas.tsx tests/unit/pildora-y-pestana-con-icono.test.tsx
git add components/ui/estado.tsx components/ui/pestanas.tsx tests/unit/pildora-y-pestana-con-icono.test.tsx
git commit -m "$(cat <<'EOF'
Let a state pill and a segmented tab carry an icon of their own

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 15: the Biblioteca's layout, width, loading, error and not-found pages (4m)

**Files:**
- Modify: `app/(app)/layout.tsx`
- Create: `app/(app)/biblioteca/layout.tsx`, `app/(app)/biblioteca/loading.tsx`, `app/(app)/biblioteca/error.tsx`, `app/(app)/biblioteca/not-found.tsx`
- Test: `tests/unit/biblioteca-armazon.test.tsx`, `tests/unit/biblioteca-pantallas-propias.test.tsx`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/biblioteca-armazon.test.tsx`:

```tsx
// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const { exigirConi } = vi.hoisted(() => ({ exigirConi: vi.fn(async () => ({ estado: "coni" })) }))
vi.mock("@/lib/sesion/coni", () => ({ leerSesion: async () => ({ estado: "coni" }), exigirConi }))
vi.mock("@/components/nav-inferior", () => ({ NavInferior: () => null }))
vi.mock("@/components/barra-sin-conexion", () => ({ BarraSinConexion: () => null }))
vi.mock("@/app/(app)/solo-para-coni", () => ({ SoloParaConi: () => null }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))

import DisenoDeLaApp from "@/app/(app)/layout"
import DisenoDeLaBiblioteca from "@/app/(app)/biblioteca/layout"

describe("the Biblioteca's width (D4)", () => {
  it("keeps every screen at 560 px and lets the column widen on md: only around the Biblioteca's marker", async () => {
    const html = renderToStaticMarkup(await DisenoDeLaApp({ children: <p>hola</p> }))
    expect(html).toContain("max-w-[560px]")
    expect(html).toContain("md:has-[[data-ancho=biblioteca]]:max-w-[70rem]")
  })

  it("gates with Coni's session and marks the section", async () => {
    const html = renderToStaticMarkup(await DisenoDeLaBiblioteca({ children: <p>hola</p> }))
    expect(exigirConi).toHaveBeenCalled()
    expect(html).toContain('data-ancho="biblioteca"')
    expect(html).toContain("hola")
  })
})
```

Create `tests/unit/biblioteca-pantallas-propias.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorDeLaBiblioteca from "@/app/(app)/biblioteca/error"
import CargandoLaBiblioteca from "@/app/(app)/biblioteca/loading"
import NoEncontradoEnLaBiblioteca from "@/app/(app)/biblioteca/not-found"

describe("the Biblioteca's own pages, in plain Spanish (4m)", () => {
  it("loads with a skeleton, never a spinner", () => {
    render(<CargandoLaBiblioteca />)
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument()
  })

  it("says it could not load, logs why for WAV and lets her try again", () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const reset = vi.fn()
    render(<ErrorDeLaBiblioteca error={new Error("boom")} reset={reset} />)
    expect(screen.getByText("No pude cargar la Biblioteca.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }))
    expect(reset).toHaveBeenCalled()
    expect(registro).toHaveBeenCalledWith("Una pantalla de la Biblioteca no pudo cargar", expect.any(Error))
    registro.mockRestore()
  })

  it("says it did not find it and where the way back goes, on the left (4f)", () => {
    render(<NoEncontradoEnLaBiblioteca />)
    expect(screen.getByRole("heading", { name: "No encontré lo que buscabas", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Materiales" })).toHaveAttribute("href", "/biblioteca")
  })
})
```

- [ ] **Step 2: Run them and see them fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-armazon.test.tsx tests/unit/biblioteca-pantallas-propias.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/layout` (and the other pages).

- [ ] **Step 3: Implement.** In `app/(app)/layout.tsx`, change the comment and the wrapper's class:

```tsx
// One centred column on every screen size; on a tablet or a computer the bar goes to the top (brandkit 5). The
// Biblioteca marks itself (data-ancho) so the column widens there on a computer, for its table and side panel.
```

```tsx
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col md:flex-col-reverse md:justify-end md:has-[[data-ancho=biblioteca]]:max-w-[70rem]">
```

Create `app/(app)/biblioteca/layout.tsx`:

```tsx
import { exigirConi } from "@/lib/sesion/coni"

// Only Coni enters the Biblioteca in Conidolly (A6). The marker lets the (app) column widen on a computer (D4).
export default async function DisenoDeLaBiblioteca({ children }: Readonly<{ children: React.ReactNode }>) {
  await exigirConi()
  return (
    <div data-ancho="biblioteca" className="grid gap-5">
      {children}
    </div>
  )
}
```

Create `app/(app)/biblioteca/loading.tsx`:

```tsx
// Brandkit 9.24: skeleton bars in the final shape (title, filters, rows), never a spinner.
export default function CargandoLaBiblioteca() {
  return (
    <output className="grid gap-6" aria-label="Cargando">
      <div className="esqueleto h-3 w-1/3" />
      <div className="flex gap-2">
        {[0, 1, 2].map((chip) => (
          <div key={chip} className="esqueleto h-3 w-20" />
        ))}
      </div>
      {[0, 1, 2, 3].map((fila) => (
        <div key={fila} className="grid gap-2 border-b border-hilo py-3">
          <div className="esqueleto h-3 w-4/5" />
          <div className="esqueleto h-3 w-2/5" />
        </div>
      ))}
    </output>
  )
}
```

Create `app/(app)/biblioteca/error.tsx`:

```tsx
"use client"

import { useEffect } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"

// A Biblioteca screen that could not load says why in one sentence and offers the way forward (brandkit 9.6, 4m).
export default function ErrorDeLaBiblioteca({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Una pantalla de la Biblioteca no pudo cargar", error)
  }, [error])

  return (
    <div className="grid gap-4">
      <LineaDeEstado
        tipo="error"
        titulo={<strong className="font-semibold">No pude cargar la Biblioteca.</strong>}
        tituloEnTinta
        detalle="Puede ser la conexión. Si sigue pasando, avísale a Federico."
      />
      <Boton variante="secundario" onClick={reset}>
        Intentar de nuevo
      </Boton>
    </div>
  )
}
```

Create `app/(app)/biblioteca/not-found.tsx`:

```tsx
import { Volver } from "@/components/ui/volver"

// What `notFound()` of any Biblioteca page shows (4m): plain words and the way back, on the left (4f).
export default function NoEncontradoEnLaBiblioteca() {
  return (
    <div className="grid gap-4">
      <Volver href="/biblioteca">Materiales</Volver>
      <h1 className="text-pantalla text-balance">No encontré lo que buscabas</h1>
      <p className="text-cuerpo text-apagado">
        Puede que el enlace esté incompleto o que ese material ya no esté en la Biblioteca.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run green, with the design rules and the words scan.** Run: `pnpm exec vitest run tests/unit/biblioteca-armazon.test.tsx tests/unit/biblioteca-pantallas-propias.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts tests/unit/error-de-pantalla.test.tsx` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/layout.tsx" "app/(app)/biblioteca" tests/unit/biblioteca-armazon.test.tsx tests/unit/biblioteca-pantallas-propias.test.tsx
head -1 "app/(app)/biblioteca/error.tsx"   # must print "use client"
git add "app/(app)/layout.tsx" "app/(app)/biblioteca/layout.tsx" "app/(app)/biblioteca/loading.tsx" "app/(app)/biblioteca/error.tsx" "app/(app)/biblioteca/not-found.tsx" tests/unit/biblioteca-armazon.test.tsx tests/unit/biblioteca-pantallas-propias.test.tsx
git commit -m "$(cat <<'EOF'
Add the Biblioteca's shell: Coni gate, wide column, loading, error and not-found

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 16: the section nav, the state pill and the main topic

**Files:**
- Create: `app/(app)/biblioteca/nav-de-biblioteca.tsx`, `app/(app)/biblioteca/estado-de-material.tsx`, `app/(app)/biblioteca/tema-del-material.tsx`
- Test: `tests/unit/biblioteca-piezas.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-piezas.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoDeMaterial } from "@/app/(app)/biblioteca/estado-de-material"
import { NavDeBiblioteca } from "@/app/(app)/biblioteca/nav-de-biblioteca"
import { TemaDelMaterial } from "@/app/(app)/biblioteca/tema-del-material"

const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null, costo_confirmado_en: null }

describe("NavDeBiblioteca (4c)", () => {
  it("shows only the sections already in Conidolly, each with an icon and its name", () => {
    render(<NavDeBiblioteca actual="materiales" />)
    const nav = screen.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    const enlaces = screen.getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Materiales"])
    expect(enlaces[0]).toHaveAttribute("href", "/biblioteca")
    expect(nav.querySelector("svg")).not.toBeNull()
  })
})

describe("EstadoDeMaterial (4j)", () => {
  it.each([
    [{ ...base }, "Procesando"],
    [{ ...base, motivo_fallo: "tope_mensual" }, "En pausa"],
    [{ ...base, costo_estimado_usd: 1.2 }, "Espera tu OK"],
    [{ ...base, estado: "listo" }, "Listo"],
    [{ ...base, estado: "fallido" }, "Con error"],
  ])("draws %j as an icon and «%s»", (material, palabra) => {
    render(<EstadoDeMaterial material={material} />)
    const pildora = screen.getByText(palabra).parentElement
    expect(pildora?.querySelectorAll("svg")).toHaveLength(1)
  })

  it("draws an error in the error colour, the only state with a colour of its own", () => {
    render(<EstadoDeMaterial material={{ ...base, estado: "fallido" }} />)
    expect(screen.getByText("Con error").parentElement).toHaveClass("text-error")
  })
})

describe("TemaDelMaterial", () => {
  it("shows +N and reads it in words", () => {
    const { container } = render(<TemaDelMaterial tema={{ nombre: "Carga mental", otros: 2 }} />)
    expect(screen.getByText("Carga mental +2")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Carga mental y 2 temas más")).toHaveClass("sr-only")
    expect(container.textContent).toContain("Carga mental +2")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-piezas.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/estado-de-material`.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/nav-de-biblioteca.tsx`:

```tsx
import { FileText } from "@phosphor-icons/react/dist/ssr"
import { ICONO } from "@/components/ui/icono"
import { Pestanas } from "@/components/ui/pestanas"

// Only the sections already in Conidolly (batch 1: Materiales). Autores, Temas and Semana are added by their batches.
const SECCIONES = [{ valor: "materiales", etiqueta: "Materiales", href: "/biblioteca" }] as const

type Seccion = (typeof SECCIONES)[number]["valor"]

export function NavDeBiblioteca({ actual }: { actual: Seccion }) {
  return (
    <Pestanas
      etiqueta="Secciones de la Biblioteca"
      actual={actual}
      opciones={SECCIONES.map((seccion) => ({
        ...seccion,
        icono: <FileText aria-hidden="true" size={ICONO.medio} />,
      }))}
    />
  )
}
```

Create `app/(app)/biblioteca/estado-de-material.tsx`:

```tsx
import { HandPalm, HourglassMedium, PauseCircle } from "@phosphor-icons/react/dist/ssr"
import { PildoraDeEstado } from "@/components/ui/estado"
import { ICONO } from "@/components/ui/icono"
import { type EstadoDeProceso, presentarEstado } from "@/lib/dominio/biblioteca/estado"

const ICONOS = { reloj: HourglassMedium, pausa: PauseCircle, mano: HandPalm } as const

/** The state of a material as a word with its icon (4j); the pill draws check and warning circle itself. */
export function EstadoDeMaterial({ material }: { material: EstadoDeProceso }) {
  const { palabra, tipo, icono } = presentarEstado(material)
  const Icono = icono ? ICONOS[icono] : null
  return (
    <PildoraDeEstado
      tipo={tipo}
      icono={Icono ? <Icono aria-hidden="true" size={ICONO.chico} weight="bold" className="shrink-0" /> : undefined}
    >
      {palabra}
    </PildoraDeEstado>
  )
}
```

Create `app/(app)/biblioteca/tema-del-material.tsx`:

```tsx
import { type TemaPrincipal, textoDeTema } from "@/lib/dominio/biblioteca/temas"

/** "Carga mental +2" on screen; "Carga mental y 2 temas más" for a screen reader. */
export function TemaDelMaterial({ tema }: { tema: TemaPrincipal | null }) {
  const { visible, leido } = textoDeTema(tema)
  return (
    <>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{leido}</span>
    </>
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-piezas.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/nav-de-biblioteca.tsx" "app/(app)/biblioteca/estado-de-material.tsx" "app/(app)/biblioteca/tema-del-material.tsx" tests/unit/biblioteca-piezas.test.tsx
git add "app/(app)/biblioteca/nav-de-biblioteca.tsx" "app/(app)/biblioteca/estado-de-material.tsx" "app/(app)/biblioteca/tema-del-material.tsx" tests/unit/biblioteca-piezas.test.tsx
git commit -m "$(cat <<'EOF'
Add the Biblioteca's section nav, state pill and main topic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

# Part E: Materiales (list, table, side panel)

Client components import their server actions from `app/(app)/biblioteca/acciones.ts`; their tests mock that module and `next/navigation` (F12). Server components are rendered directly in jsdom.

### Task 17: quick filters and "Más filtros" (4b)

**Files:**
- Create: `app/(app)/biblioteca/campo.tsx`, `app/(app)/biblioteca/filtros-rapidos.tsx`, `app/(app)/biblioteca/mas-filtros.tsx`
- Test: `tests/unit/biblioteca-filtros-pantalla.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-filtros-pantalla.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }))

import { FiltrosRapidos } from "@/app/(app)/biblioteca/filtros-rapidos"
import { MasFiltros } from "@/app/(app)/biblioteca/mas-filtros"

const AUTOR = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

beforeEach(() => vi.clearAllMocks())

describe("FiltrosRapidos", () => {
  it("is one row of one-tap filters, the current one pressed, with counts only above zero (4i)", () => {
    render(<FiltrosRapidos filtros={{ estado: "fallido" }} conteos={{ procesando: 0, fallido: 1 }} />)
    expect(screen.getByRole("group", { name: "Filtrar por estado" })).toBeInTheDocument()
    expect(screen.getAllByRole("button").map((boton) => boton.textContent)).toEqual([
      "Todos",
      "Procesando",
      "Listos",
      "Con error · 1",
    ])
    expect(screen.getByRole("button", { name: "Con error · 1" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps the folded filters and drops the open panel when it changes the state", () => {
    render(<FiltrosRapidos filtros={{ autor: AUTOR }} conteos={{ procesando: 2, fallido: 0 }} />)
    fireEvent.click(screen.getByRole("button", { name: "Procesando · 2" }))
    expect(replace).toHaveBeenCalledWith(`/biblioteca?autor=${AUTOR}&estado=procesando`, { scroll: false })
    fireEvent.click(screen.getByRole("button", { name: "Todos" }))
    expect(replace).toHaveBeenLastCalledWith(`/biblioteca?autor=${AUTOR}`, { scroll: false })
  })
})

describe("MasFiltros", () => {
  const autores = [{ id: AUTOR, nombre: "Daniela Ruiz" }]

  it("folds author, who she is for you and type into a GET form that keeps the quick filter", () => {
    const { container } = render(<MasFiltros filtros={{ estado: "listo" }} autores={autores} />)
    expect(container.querySelector("details")).not.toHaveAttribute("open")
    expect(screen.getByText("Más filtros")).toBeInTheDocument()
    const formulario = container.querySelector("form")
    expect(formulario).toHaveAttribute("method", "get")
    expect(formulario).toHaveAttribute("action", "/biblioteca")
    expect(container.querySelector("input[type=hidden][name=estado]")).toHaveAttribute("value", "listo")
    expect(screen.getByLabelText("Autor")).toHaveDisplayValue("Todos")
    expect(screen.getByLabelText("¿Quién es para ti?")).toBeInTheDocument()
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Quitar estos filtros" })).toBeNull()
  })

  it("opens by itself and offers to clear when a folded filter is on", () => {
    const { container } = render(<MasFiltros filtros={{ estado: "listo", rol: "evidencia" }} autores={autores} />)
    expect(container.querySelector("details")).toHaveAttribute("open")
    expect(screen.getByText("1 activo")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Quitar estos filtros" })).toHaveAttribute("href", "/biblioteca?estado=listo")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-filtros-pantalla.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/filtros-rapidos`.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/campo.tsx` (Ingesta's `components/campo.tsx`, D17):

```tsx
import type { ReactNode } from "react"

/** The sunken field of globals.css (`.campo`), full width, in body size. */
export const CLASES_DE_CAMPO = "campo w-full text-cuerpo"

interface PropiedadesDeCampo {
  id: string
  etiqueta: ReactNode
  /** A line under the field; the field points at it with `aria-describedby="<id>-ayuda"`. */
  ayuda?: string
  children: ReactNode
}

/** A label, the field and an optional hint. */
export function Campo({ id, etiqueta, ayuda, children }: PropiedadesDeCampo) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-cuerpo font-semibold">
        {etiqueta}
      </label>
      {children}
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-meta text-apagado">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}
```

Create `app/(app)/biblioteca/filtros-rapidos.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { Chip } from "@/components/chip"
import { type EstadoDeMaterial, type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"

interface Propiedades {
  filtros: FiltrosDeMateriales
  conteos: { procesando: number; fallido: number }
}

/** A count only when there is something to count (4i): "Procesando · 2", or just "Procesando". */
const conCuenta = (texto: string, cantidad: number) => (cantidad > 0 ? `${texto} · ${cantidad}` : texto)

/** Fix 4b: one tap per state; the state lives in the URL, the other filters stay as they were. */
export function FiltrosRapidos({ filtros, conteos }: Propiedades) {
  const router = useRouter()
  const opciones: { estado: EstadoDeMaterial | undefined; texto: string }[] = [
    { estado: undefined, texto: "Todos" },
    { estado: "procesando", texto: conCuenta("Procesando", conteos.procesando) },
    { estado: "listo", texto: "Listos" },
    { estado: "fallido", texto: conCuenta("Con error", conteos.fallido) },
  ]
  return (
    <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
      {opciones.map(({ estado, texto }) => (
        <Chip
          key={estado ?? "todos"}
          presionado={filtros.estado === estado}
          onClick={() => router.replace(hrefDeLista({ ...filtros, estado }), { scroll: false })}
        >
          {texto}
        </Chip>
      ))}
    </div>
  )
}
```

Create `app/(app)/biblioteca/mas-filtros.tsx`:

```tsx
import Link from "next/link"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { MasOpciones } from "@/components/ui/mas-opciones"
import {
  type FiltrosDeMateriales,
  hayFiltrosPlegados,
  hrefDeLista,
  RUTA_DE_MATERIALES,
} from "@/lib/dominio/biblioteca/filtros"
import { ETIQUETA_DE_ROL, ETIQUETA_DE_TIPO, ROLES, TIPOS_DE_MATERIAL } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { CLASES_DE_CAMPO, Campo } from "./campo"

interface Propiedades {
  filtros: FiltrosDeMateriales
  autores: { id: string; nombre: string }[]
}

/**
 * Fix 4b: what is not the state goes folded. A plain GET form: the filters live in the URL, survive a refresh and work
 * without scripts; the quick filter travels with it as a hidden field.
 */
export function MasFiltros({ filtros, autores }: Propiedades) {
  const activos = [filtros.autor, filtros.rol, filtros.tipo].filter(Boolean).length
  return (
    <MasOpciones
      titulo="Más filtros"
      resumen={activos === 0 ? undefined : activos === 1 ? "1 activo" : `${activos} activos`}
      abiertaAlInicio={activos > 0}
    >
      {/* The selects are uncontrolled: a new key remounts them when the URL changes. */}
      <form key={JSON.stringify(filtros)} method="get" action={RUTA_DE_MATERIALES} className="grid gap-3">
        {filtros.estado ? <input type="hidden" name="estado" value={filtros.estado} /> : null}
        <Campo id="filtro-autor" etiqueta="Autor">
          <select id="filtro-autor" name="autor" defaultValue={filtros.autor ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {autores.map((autor) => (
              <option key={autor.id} value={autor.id}>
                {autor.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="filtro-rol" etiqueta={PALABRAS.papel}>
          <select id="filtro-rol" name="rol" defaultValue={filtros.rol ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {ROLES.map((rol) => (
              <option key={rol} value={rol}>
                {ETIQUETA_DE_ROL[rol]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="filtro-tipo" etiqueta="Tipo">
          <select id="filtro-tipo" name="tipo" defaultValue={filtros.tipo ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {TIPOS_DE_MATERIAL.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETA_DE_TIPO[tipo]}
              </option>
            ))}
          </select>
        </Campo>
        <Boton type="submit" variante="secundario" tamano="chico">
          Filtrar
        </Boton>
        {hayFiltrosPlegados(filtros) ? (
          <Link href={hrefDeLista({ estado: filtros.estado })} className={clasesDeBoton({ variante: "callado" })}>
            Quitar estos filtros
          </Link>
        ) : null}
      </form>
    </MasOpciones>
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-filtros-pantalla.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/campo.tsx" "app/(app)/biblioteca/filtros-rapidos.tsx" "app/(app)/biblioteca/mas-filtros.tsx" tests/unit/biblioteca-filtros-pantalla.test.tsx
head -1 "app/(app)/biblioteca/filtros-rapidos.tsx"   # must print "use client"
git add "app/(app)/biblioteca/campo.tsx" "app/(app)/biblioteca/filtros-rapidos.tsx" "app/(app)/biblioteca/mas-filtros.tsx" tests/unit/biblioteca-filtros-pantalla.test.tsx
git commit -m "$(cat <<'EOF'
Add one-tap state filters and fold the rest under Más filtros (4b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 18: the buttons that start processing

**Files:**
- Create: `app/(app)/biblioteca/boton-que-pregunta.tsx`, `app/(app)/biblioteca/boton-reintentar.tsx`, `app/(app)/biblioteca/boton-confirmar-costo.tsx`
- Test: `tests/unit/biblioteca-botones.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-botones.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { reintentarMaterialAccion, confirmarCostoAccion, push } = vi.hoisted(() => ({
  reintentarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  confirmarCostoAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  push: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ reintentarMaterialAccion, confirmarCostoAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))

import { BotonConfirmarCosto } from "@/app/(app)/biblioteca/boton-confirmar-costo"
import { BotonReintentar, PREGUNTA_REINTENTAR } from "@/app/(app)/biblioteca/boton-reintentar"

const ID = "11111111-2222-4333-8444-555555555555"

beforeEach(() => vi.clearAllMocks())

describe("BotonReintentar", () => {
  it("asks first, since retrying costs, and retries on yes", async () => {
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(screen.getByText(PREGUNTA_REINTENTAR)).toBeInTheDocument()
    expect(reintentarMaterialAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }))
    await waitFor(() => expect(reintentarMaterialAccion).toHaveBeenCalledWith(ID))
  })

  it("Cancelar closes the question without retrying", () => {
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(reintentarMaterialAccion).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
  })

  it("says a refusal under the question", async () => {
    reintentarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Ese material ya no se puede reintentar." })
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese material ya no se puede reintentar.")
  })
})

describe("BotonConfirmarCosto", () => {
  it("shows the price on the button and confirms with one tap", async () => {
    render(<BotonConfirmarCosto materialId={ID} costoUsd={1.2} />)
    fireEvent.click(screen.getByRole("button", { name: "Procesar por ~US$ 1,20" }))
    await waitFor(() => expect(confirmarCostoAccion).toHaveBeenCalledWith(ID))
  })

  it("sends her to sign in when the session ended", async () => {
    confirmarCostoAccion.mockResolvedValueOnce({ ok: false, error: "Tu sesión venció. Entra de nuevo." })
    render(<BotonConfirmarCosto materialId={ID} costoUsd={1.2} />)
    fireEvent.click(screen.getByRole("button", { name: "Procesar por ~US$ 1,20" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-botones.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/boton-confirmar-costo`.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/boton-que-pregunta.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"

interface Propiedades {
  etiqueta: string
  pregunta: string
  confirmar: string
  alConfirmar: () => Promise<Resultado>
}

/** An action that spends (D11): the question appears in line, and a refusal is said under it. */
export function BotonQuePregunta({ etiqueta, pregunta, confirmar, alConfirmar }: Propiedades) {
  const [preguntando, setPreguntando] = useState(false)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  if (!preguntando) {
    return (
      <Boton variante="secundario" tamano="chico" className="w-fit" onClick={() => setPreguntando(true)}>
        {etiqueta}
      </Boton>
    )
  }
  return (
    <div className="grid gap-2">
      <ConfirmacionEnLinea
        trato="gasto"
        pregunta={pregunta}
        confirmar={confirmar}
        volver="Cancelar"
        cargando={pendiente}
        alConfirmar={() => ejecutar(alConfirmar, () => setPreguntando(false))}
        alVolver={() => {
          limpiarError()
          setPreguntando(false)
        }}
      />
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
```

Create `app/(app)/biblioteca/boton-reintentar.tsx`:

```tsx
"use client"

import { reintentarMaterialAccion } from "./acciones"
import { BotonQuePregunta } from "./boton-que-pregunta"

export const PREGUNTA_REINTENTAR =
  "Vuelvo a procesar este material desde donde falló. Puede costar más o menos lo mismo que la primera vez."

export function BotonReintentar({ materialId }: { materialId: string }) {
  return (
    <BotonQuePregunta
      etiqueta="Reintentar"
      pregunta={PREGUNTA_REINTENTAR}
      confirmar="Sí, reintentar"
      alConfirmar={() => reintentarMaterialAccion(materialId)}
    />
  )
}
```

Create `app/(app)/biblioteca/boton-confirmar-costo.tsx`:

```tsx
"use client"

import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { dolares } from "@/lib/formato"
import { confirmarCostoAccion } from "./acciones"

/** A long material waits for her OK: the price is on the button, so the tap is the confirmation (D11). */
export function BotonConfirmarCosto({ materialId, costoUsd }: { materialId: string; costoUsd: number }) {
  const { pendiente, error, ejecutar } = useAccion()
  return (
    <div className="grid gap-2">
      <Boton
        variante="secundario"
        tamano="chico"
        className="w-fit"
        cargando={pendiente}
        onClick={() => ejecutar(() => confirmarCostoAccion(materialId))}
      >
        {`Procesar por ~${dolares(costoUsd)}`}
      </Boton>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-botones.test.tsx tests/unit/diseno-reglas.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/boton-que-pregunta.tsx" "app/(app)/biblioteca/boton-reintentar.tsx" "app/(app)/biblioteca/boton-confirmar-costo.tsx" tests/unit/biblioteca-botones.test.tsx
for f in boton-que-pregunta boton-reintentar boton-confirmar-costo; do head -1 "app/(app)/biblioteca/$f.tsx"; done   # each "use client"
git add "app/(app)/biblioteca/boton-que-pregunta.tsx" "app/(app)/biblioteca/boton-reintentar.tsx" "app/(app)/biblioteca/boton-confirmar-costo.tsx" tests/unit/biblioteca-botones.test.tsx
git commit -m "$(cat <<'EOF'
Add Reintentar with its question and Procesar por ~US$ X to the Biblioteca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 19: the phone card

**Files:**
- Create: `app/(app)/biblioteca/tarjeta-de-material.tsx`
- Test: `tests/unit/biblioteca-tarjeta.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-tarjeta.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  reintentarMaterialAccion: vi.fn(),
  confirmarCostoAccion: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { TarjetaDeMaterial } from "@/app/(app)/biblioteca/tarjeta-de-material"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"

const AHORA = Date.parse("2026-11-02T15:00:00Z")
const material: MaterialDeLista = {
  id: "11111111-2222-4333-8444-555555555555",
  titulo: "Burnout y teletrabajo: revisión 2024",
  autor_id: "a",
  autor: "Daniela Ruiz",
  rol: "referente",
  tipo: "documento",
  estado: "listo",
  motivo_fallo: null,
  costo_estimado_usd: null,
  costo_confirmado_en: null,
  creado_en: "2026-10-31T12:00:00Z",
  tema: { nombre: "Carga mental", otros: 1 },
}

function tarjeta(m: MaterialDeLista) {
  render(
    <ul>
      <TarjetaDeMaterial material={m} ahora={AHORA} />
    </ul>,
  )
  return screen.getByRole("listitem")
}

describe("TarjetaDeMaterial", () => {
  it("shows title, type · author · role in simple words, main topic, state and upload day, and opens the detail", () => {
    const li = tarjeta(material)
    expect(within(li).getByRole("link", { name: /Burnout y teletrabajo/ })).toHaveAttribute(
      "href",
      `/biblioteca/materiales/${material.id}`,
    )
    expect(li).toHaveTextContent("Documento · Daniela Ruiz · Referente")
    expect(li).toHaveTextContent("Carga mental +1")
    expect(li).toHaveTextContent("Listo")
    expect(li).toHaveTextContent("Hace 2 días")
    expect(within(li).queryByRole("button")).toBeNull()
  })

  it("keeps Reintentar on a failed card, without its technical reason", () => {
    const li = tarjeta({ ...material, estado: "fallido", motivo_fallo: "sin_texto" })
    expect(within(li).getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
    expect(li).not.toHaveTextContent("sin_texto")
  })

  it("keeps the price button on a card that waits for her OK", () => {
    const li = tarjeta({ ...material, estado: "procesando", costo_estimado_usd: 1.2, titulo: null })
    expect(within(li).getByRole("button", { name: "Procesar por ~US$ 1,20" })).toBeInTheDocument()
    expect(li).toHaveTextContent("Sin título")
    expect(li).toHaveTextContent("Espera tu OK")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-tarjeta.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/tarjeta-de-material`.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/tarjeta-de-material.tsx`:

```tsx
import Link from "next/link"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"
import { esperaConfirmacion, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
import { subidoHace, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { etiquetaDeRol, etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { BotonConfirmarCosto } from "./boton-confirmar-costo"
import { BotonReintentar } from "./boton-reintentar"
import { EstadoDeMaterial } from "./estado-de-material"
import { TemaDelMaterial } from "./tema-del-material"

/** A material on the phone list: the text opens the detail; the buttons that start processing stay on the card. */
export function TarjetaDeMaterial({ material, ahora }: { material: MaterialDeLista; ahora: number }) {
  return (
    <li className="grid gap-2 rounded-panel bg-piedra p-4 shadow-relieve">
      <Link href={`/biblioteca/materiales/${material.id}`} className="grid gap-1">
        <span className="text-cuerpo font-semibold text-balance text-tinta">{material.titulo ?? "Sin título"}</span>
        <span className="text-meta text-apagado">
          {`${etiquetaDeTipo(material.tipo)} · ${material.autor} · ${etiquetaDeRol(material.rol)}`}
        </span>
        <span className="text-meta text-apagado">
          <TemaDelMaterial tema={material.tema} />
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <EstadoDeMaterial material={material} />
        <span data-snapshot="varia" className="text-meta text-apagado">
          {subidoHace(material.creado_en, ahora, ZONA_DE_LA_BIBLIOTECA)}
        </span>
      </div>
      {esperaConfirmacion(material) && material.costo_estimado_usd !== null ? (
        <BotonConfirmarCosto materialId={material.id} costoUsd={material.costo_estimado_usd} />
      ) : null}
      {sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null}
    </li>
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-tarjeta.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/tarjeta-de-material.tsx" tests/unit/biblioteca-tarjeta.test.tsx
git add "app/(app)/biblioteca/tarjeta-de-material.tsx" tests/unit/biblioteca-tarjeta.test.tsx
git commit -m "$(cat <<'EOF'
Add the Biblioteca's phone card with main topic and state words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 20: the desktop table

**Files:**
- Create: `app/(app)/biblioteca/tabla-de-materiales.tsx`
- Test: `tests/unit/biblioteca-tabla.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-tabla.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TablaDeMateriales } from "@/app/(app)/biblioteca/tabla-de-materiales"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"

const AHORA = Date.parse("2026-11-02T15:00:00Z")
const fila = (id: string, titulo: string, creado_en: string): MaterialDeLista => ({
  id,
  titulo,
  autor_id: "a",
  autor: "Daniela Ruiz",
  rol: "referente",
  tipo: "documento",
  estado: "listo",
  motivo_fallo: null,
  costo_estimado_usd: null,
  costo_confirmado_en: null,
  creado_en,
  tema: { nombre: "Carga mental", otros: 0 },
})
const UNO = "11111111-2222-4333-8444-555555555555"
const DOS = "99999999-2222-4333-8444-555555555555"
const materiales = [fila(UNO, "Burnout", "2026-10-31T12:00:00Z"), fila(DOS, "Pausas", "2026-11-02T12:00:00Z")]

describe("TablaDeMateriales", () => {
  it("has the six columns of the mockup and a caption", () => {
    render(<TablaDeMateriales materiales={materiales} filtros={{}} seleccion={null} ahora={AHORA} />)
    const tabla = screen.getByRole("table", { name: "Materiales" })
    expect(within(tabla).getAllByRole("columnheader").map((celda) => celda.textContent)).toEqual([
      "Material",
      "Tipo",
      "Autor",
      "Tema",
      "Estado",
      "Subido",
    ])
    expect(within(tabla).getAllByRole("row")).toHaveLength(3)
  })

  it("makes each row a link that opens the side panel with ?m, keeping the filters", () => {
    render(<TablaDeMateriales materiales={materiales} filtros={{ estado: "listo" }} seleccion={null} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Burnout" })).toHaveAttribute("href", `/biblioteca?estado=listo&m=${UNO}`)
    expect(screen.getByRole("row", { name: /Pausas/ })).toHaveTextContent("Hoy")
  })

  it("marks the selected row as current", () => {
    render(<TablaDeMateriales materiales={materiales} filtros={{}} seleccion={UNO} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Burnout" })).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("link", { name: "Pausas" })).not.toHaveAttribute("aria-current")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-tabla.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/tabla-de-materiales`.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/tabla-de-materiales.tsx`:

```tsx
import Link from "next/link"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"
import { subidoHace, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"
import { etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { cn } from "@/lib/utils"
import { EstadoDeMaterial } from "./estado-de-material"
import { TemaDelMaterial } from "./tema-del-material"

const COLUMNAS = ["Material", "Tipo", "Autor", "Tema", "Estado", "Subido"] as const
const CELDA = "px-3 py-3 text-cuerpo"

interface Propiedades {
  materiales: MaterialDeLista[]
  filtros: FiltrosDeMateriales
  seleccion: string | null
  ahora: number
}

/**
 * The computer's list (spec 3): a plain table whose rows are links to `?m=<id>`, so a row opens the side panel, the
 * address can be shared and Back closes it. The buttons live in the panel.
 */
export function TablaDeMateriales({ materiales, filtros, seleccion, ahora }: Propiedades) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Materiales</caption>
      <thead>
        <tr className="border-b border-tinta">
          {COLUMNAS.map((columna) => (
            <th key={columna} scope="col" className="px-3 py-2 text-meta font-medium text-apagado">
              {columna}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {materiales.map((material) => {
          const elegido = material.id === seleccion
          return (
            <tr key={material.id} className={cn("border-b border-hilo", elegido && "bg-piedra-honda")}>
              <th scope="row" className={cn(CELDA, "font-semibold")}>
                <Link
                  href={hrefDeLista(filtros, material.id)}
                  scroll={false}
                  aria-current={elegido ? "true" : undefined}
                  className="text-balance text-tinta underline-offset-4 hover:underline"
                >
                  {material.titulo ?? "Sin título"}
                </Link>
              </th>
              <td className={CELDA}>{etiquetaDeTipo(material.tipo)}</td>
              <td className={CELDA}>{material.autor}</td>
              <td className={CELDA}>
                <TemaDelMaterial tema={material.tema} />
              </td>
              <td className={CELDA}>
                <EstadoDeMaterial material={material} />
              </td>
              <td data-snapshot="varia" className="px-3 py-3 text-meta text-apagado">
                {subidoHace(material.creado_en, ahora, ZONA_DE_LA_BIBLIOTECA)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-tabla.test.tsx tests/unit/diseno-reglas.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/tabla-de-materiales.tsx" tests/unit/biblioteca-tabla.test.tsx
git add "app/(app)/biblioteca/tabla-de-materiales.tsx" tests/unit/biblioteca-tabla.test.tsx
git commit -m "$(cat <<'EOF'
Add the Biblioteca's desktop table whose rows open the side panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 21: the side panel

**Files:**
- Create: `app/(app)/biblioteca/panel-de-material.tsx`
- Test: `tests/unit/biblioteca-panel.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-panel.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  reintentarMaterialAccion: vi.fn(),
  confirmarCostoAccion: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { PanelDeMaterial, PistaDelPanel } from "@/app/(app)/biblioteca/panel-de-material"
import type { PanelDelMaterial } from "@/lib/datos/biblioteca"

const AHORA = Date.parse("2026-11-02T15:00:00Z")
const ID = "11111111-2222-4333-8444-555555555555"
const panel: PanelDelMaterial = {
  material: {
    id: ID,
    titulo: "Burnout y teletrabajo: revisión 2024",
    autor_id: "a-1",
    autor: "Daniela Ruiz",
    credencial: "investigadora de confianza",
    rol: "referente",
    tipo: "documento",
    estado: "listo",
    motivo_fallo: null,
    costo_estimado_usd: null,
    costo_confirmado_en: null,
    creado_en: "2026-10-31T12:00:00Z",
    idioma_original: "es",
    origen_url: null,
  },
  ideas: { total: 12, primeras: ["El aislamiento pesa más que las horas extra.", "Las pausas acordadas protegen."] },
  evidencia: { estudio: 9, opinion: 3 },
}

describe("PanelDeMaterial", () => {
  it("is a region named by its title, with type, upload day and state on top", () => {
    render(<PanelDeMaterial panel={panel} filtros={{ estado: "listo" }} ahora={AHORA} />)
    const region = screen.getByRole("region", { name: "Burnout y teletrabajo: revisión 2024" })
    expect(region).toHaveTextContent("Documento · subido hace 2 días")
    expect(within(region).getByText("Listo")).toBeInTheDocument()
  })

  it("shows the ideas taken with their count and the first two, and Ver todas opens the detail", () => {
    render(<PanelDeMaterial panel={panel} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("heading", { name: "Ideas sacadas" })).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("«El aislamiento pesa más que las horas extra.»")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", `/biblioteca/materiales/${ID}`)
  })

  it("says who she is for you with the credential, and folds the technical detail for WAV", () => {
    const { container } = render(<PanelDeMaterial panel={panel} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("heading", { name: "¿Quién es para ti?" })).toBeInTheDocument()
    expect(screen.getByText("Daniela Ruiz · investigadora de confianza")).toBeInTheDocument()
    expect(screen.getByText("Referente")).toBeInTheDocument()
    const detalle = container.querySelector("details")
    expect(detalle).not.toHaveAttribute("open")
    expect(detalle).toHaveTextContent("Detalle para WAV")
    expect(detalle).toHaveTextContent("Evidencia: Estudio 9 · Opinión 3")
    expect(detalle).toHaveTextContent(`Material: ${ID}`)
  })

  it("has its own close control that keeps the filters", () => {
    render(<PanelDeMaterial panel={panel} filtros={{ estado: "listo" }} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Cerrar el panel" })).toHaveAttribute("href", "/biblioteca?estado=listo")
  })

  it("carries Reintentar for a failed material, and says when there are no ideas yet", () => {
    render(
      <PanelDeMaterial
        panel={{ ...panel, material: { ...panel.material, estado: "fallido" }, ideas: { total: 0, primeras: [] } }}
        filtros={{}}
        ahora={AHORA}
      />,
    )
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
    expect(screen.getByText("Las ideas aparecen cuando termina de procesarse.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Ver todas" })).toBeNull()
  })
})

describe("PistaDelPanel", () => {
  it("says what the panel is for while nothing is selected", () => {
    render(<PistaDelPanel />)
    expect(screen.getByText("Elige un material de la tabla para ver aquí sus ideas y quién es para ti.")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-panel.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/panel-de-material`.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/panel-de-material.tsx`:

```tsx
import Link from "next/link"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { Panel } from "@/components/ui/panel"
import type { PanelDelMaterial } from "@/lib/datos/biblioteca"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import { esperaConfirmacion, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
import { subidoEnFrase, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"
import { etiquetaDeRol, etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { BotonConfirmarCosto } from "./boton-confirmar-costo"
import { BotonReintentar } from "./boton-reintentar"
import { EstadoDeMaterial } from "./estado-de-material"

interface Propiedades {
  panel: PanelDelMaterial
  filtros: FiltrosDeMateriales
  ahora: number
}

/** The computer's side panel (spec 3): what a material gave, who it is for her, and WAV's detail folded. */
export function PanelDeMaterial({ panel, filtros, ahora }: Propiedades) {
  const { material, ideas, evidencia } = panel
  const quien = material.credencial ? `${material.autor} · ${material.credencial}` : material.autor
  return (
    <section aria-labelledby="panel-titulo" className="grid gap-4 rounded-panel bg-piedra-alta p-5">
      <div className="flex flex-wrap items-center gap-2 text-meta text-apagado">
        <span data-snapshot="varia">
          {`${etiquetaDeTipo(material.tipo)} · ${subidoEnFrase(material.creado_en, ahora, ZONA_DE_LA_BIBLIOTECA)}`}
        </span>
        <EstadoDeMaterial material={material} />
      </div>
      <h2 id="panel-titulo" className="text-pieza text-balance">
        {material.titulo ?? "Sin título"}
      </h2>
      <Seccion titulo={PALABRAS.afirmaciones} id="panel-ideas" cifra={ideas.total}>
        {ideas.primeras.length === 0 ? (
          <p className="text-cuerpo text-apagado">
            {material.estado === "listo"
              ? "Este material no dejó ideas."
              : "Las ideas aparecen cuando termina de procesarse."}
          </p>
        ) : (
          <ul className="grid gap-2">
            {ideas.primeras.map((idea, indice) => (
              // The first two ideas are a fixed list, replaced whole on every render: the position is its identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <li key={indice} className="text-cuerpo">{`«${idea}»`}</li>
            ))}
          </ul>
        )}
        {ideas.total > 0 ? (
          <Link href={`/biblioteca/materiales/${material.id}`} className={clasesDeBoton({ variante: "callado" })}>
            Ver todas
          </Link>
        ) : null}
      </Seccion>
      <Seccion titulo={PALABRAS.papel} id="panel-quien">
        <p className="text-cuerpo">{quien}</p>
        <p className="text-meta text-apagado">{etiquetaDeRol(material.rol)}</p>
      </Seccion>
      {esperaConfirmacion(material) && material.costo_estimado_usd !== null ? (
        <BotonConfirmarCosto materialId={material.id} costoUsd={material.costo_estimado_usd} />
      ) : null}
      {sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null}
      <DetalleParaWav lineas={lineasParaWav(material, evidencia)} proveedor={null} />
      <Link href={hrefDeLista(filtros)} scroll={false} className={clasesDeBoton({ variante: "callado" })}>
        Cerrar el panel
      </Link>
    </section>
  )
}

/** With no `?m`, the panel says what it is for. */
export function PistaDelPanel() {
  return (
    <Panel>
      <p className="text-cuerpo text-apagado">Elige un material de la tabla para ver aquí sus ideas y quién es para ti.</p>
    </Panel>
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-panel.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/panel-de-material.tsx" tests/unit/biblioteca-panel.test.tsx
git add "app/(app)/biblioteca/panel-de-material.tsx" tests/unit/biblioteca-panel.test.tsx
git commit -m "$(cat <<'EOF'
Add the Biblioteca's side panel with ideas, who it is for her and WAV's detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 22: the Materiales page

**Files:**
- Create: `app/(app)/biblioteca/page.tsx`
- Test: covered end to end by Tasks 28 to 30 (an async server page that reads the database is not rendered in jsdom here; its pieces are unit-tested in Tasks 16 to 21).

- [ ] **Step 1: Write the failing check.** The page has no unit test of its own; the failing check is the build's route list:

Run: `pnpm build 2>&1 | grep -c "○ /biblioteca\|ƒ /biblioteca "`
Expected: `0` (no `/biblioteca` page yet).

- [ ] **Step 2: Implement.** Create `app/(app)/biblioteca/page.tsx`:

```tsx
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Panel } from "@/components/ui/panel"
import { contarPorEstado, leerPanelDelMaterial, listarAutores, listarMateriales } from "@/lib/datos/biblioteca"
import { estaProcesando } from "@/lib/dominio/biblioteca/estado"
import { hayFiltros, leerFiltros, leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { exigirConi } from "@/lib/sesion/coni"
import { FiltrosRapidos } from "./filtros-rapidos"
import { MasFiltros } from "./mas-filtros"
import { NavDeBiblioteca } from "./nav-de-biblioteca"
import { PanelDeMaterial, PistaDelPanel } from "./panel-de-material"
import { TablaDeMateriales } from "./tabla-de-materiales"
import { TarjetaDeMaterial } from "./tarjeta-de-material"

/** While anything is really processing, the list asks the server again every 10 s. */
const REFRESCO_MS = 10_000

export default async function Materiales({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const filtros = leerFiltros(params)
  const seleccion = leerSeleccion(params)
  const [materiales, conteos, autores, panel] = await Promise.all([
    listarMateriales(db, filtros),
    contarPorEstado(db),
    listarAutores(db),
    seleccion ? leerPanelDelMaterial(db, seleccion) : null,
  ])
  const ahora = Date.now()

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-8">
      <RefrescoAutomatico activo={materiales.some(estaProcesando)} cadaMs={REFRESCO_MS} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
        <NavDeBiblioteca actual="materiales" />
        <FiltrosRapidos filtros={filtros} conteos={conteos} />
        <MasFiltros filtros={filtros} autores={autores} />
        {materiales.length === 0 ? (
          <p className="text-cuerpo text-apagado">
            {hayFiltros(filtros) ? "Ningún material coincide con esos filtros." : "Aún no hay material en la Biblioteca."}
          </p>
        ) : (
          <>
            <ul aria-label="Materiales" className="grid gap-3 md:hidden">
              {materiales.map((material) => (
                <TarjetaDeMaterial key={material.id} material={material} ahora={ahora} />
              ))}
            </ul>
            <div className="hidden md:block">
              <TablaDeMateriales materiales={materiales} filtros={filtros} seleccion={seleccion} ahora={ahora} />
            </div>
          </>
        )}
      </div>
      <aside aria-label="Material elegido" className="hidden md:sticky md:top-24 md:block">
        {panel ? (
          <PanelDeMaterial panel={panel} filtros={filtros} ahora={ahora} />
        ) : seleccion ? (
          <Panel>
            <p className="text-cuerpo text-apagado">No encontré ese material. Elige otro de la tabla.</p>
          </Panel>
        ) : (
          <PistaDelPanel />
        )}
      </aside>
    </div>
  )
}
```

- [ ] **Step 3: Build and see the route.**

Run: `pnpm type && pnpm build 2>&1 | grep "/biblioteca"`
Expected: `ƒ /biblioteca` (dynamic) among the routes, plus `ƒ /biblioteca/materiales/[id]/texto`.

- [ ] **Step 4: Run every unit test (the rules scan the new page).** Run: `pnpm test:run` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/page.tsx"
git add "app/(app)/biblioteca/page.tsx"
git commit -m "$(cat <<'EOF'
Add the Biblioteca's Materiales page: cards on the phone, table and panel on a computer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

# Part F: The full detail `/biblioteca/materiales/[id]`

### Task 23: pick or add an author

**Files:**
- Create: `app/(app)/biblioteca/selector-de-autor.tsx`
- Test: `tests/unit/biblioteca-selector-de-autor.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-selector-de-autor.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SelectorDeAutor } from "@/app/(app)/biblioteca/selector-de-autor"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"

const autor = (id: string, nombre: string, credencial: string | null = null): AutorDeLista => ({
  id,
  nombre,
  credencial,
  tipo: "persona",
  alias: [],
})
const AUTORES = [autor("1", "Esther Perel", "Psicoterapeuta"), autor("2", "Instituto Gottman")]

describe("SelectorDeAutor", () => {
  it("shows the picked author and lets her change it", () => {
    const alElegir = vi.fn()
    render(<SelectorDeAutor autores={AUTORES} valor="1" alElegir={alElegir} alCrear={vi.fn()} />)
    expect(screen.getByText("Esther Perel")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor" }))
    fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "gott" } })
    fireEvent.click(screen.getByRole("button", { name: "Instituto Gottman" }))
    expect(alElegir).toHaveBeenCalledWith("2")
  })

  it("adds a new author inline, warning about a look-alike first", async () => {
    const alElegir = vi.fn()
    const alCrear = vi.fn(async () => ({ ok: true as const, autor: autor("3", "Esther Perel Jr") }))
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={alElegir} alCrear={alCrear} />)
    fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "Esther Perel Jr" } })
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    expect(screen.getByText("¿Es el mismo autor que Esther Perel?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Crear autor" }))
    await waitFor(() => expect(alCrear).toHaveBeenCalledWith({ nombre: "Esther Perel Jr", credencial: "", tipo: "persona" }))
    expect(alElegir).toHaveBeenCalledWith("3")
  })

  it("says why the author could not be created", async () => {
    const alCrear = vi.fn(async () => ({ ok: false as const, error: "Escribe el nombre del autor." }))
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={alCrear} />)
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    fireEvent.click(screen.getByRole("button", { name: "Crear autor" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe el nombre del autor.")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-selector-de-autor.test.tsx` → FAIL, cannot resolve `@/app/(app)/biblioteca/selector-de-autor`.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/selector-de-autor.tsx` (Ingesta's `components/selector-de-autor.tsx` rewritten to Conidolly's pieces: `min-h-objetivo` targets, `LineaDeError`, no `text-aviso`, and a typed kind of author):

```tsx
"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import type { Resultado } from "@/lib/acciones/resultado"
import { type AutorDeLista, autoresParecidos, buscarAutores } from "@/lib/dominio/biblioteca/autores"
import {
  ETIQUETA_DE_TIPO_DE_AUTOR,
  esTipoDeAutorNuevo,
  TIPOS_DE_AUTOR_NUEVO,
  type TipoDeAutorNuevo,
} from "@/lib/dominio/biblioteca/modelo"
import { CLASES_DE_CAMPO, Campo } from "./campo"

interface AutorNuevo {
  nombre: string
  credencial: string
  tipo: TipoDeAutorNuevo
}

interface Propiedades {
  autores: AutorDeLista[]
  /** The id of the picked author, "" while there is none. */
  valor: string
  alElegir: (id: string) => void
  alCrear: (datos: AutorNuevo) => Promise<Resultado<{ autor: AutorDeLista }>>
}

const MAXIMO_DE_RESULTADOS = 6

/** An Enter inside these fields must not send a form that contains them. */
const sinEnviar = (evento: { key: string; preventDefault: () => void }) => {
  if (evento.key === "Enter") evento.preventDefault()
}

const descripcion = (autor: AutorDeLista) => (autor.credencial ? `${autor.nombre}, ${autor.credencial}` : autor.nombre)

/** Search an author by name or alias, or add one ("Autor nuevo"); whoever holds it only ever sees the picked id. */
export function SelectorDeAutor({ autores: iniciales, valor, alElegir, alCrear }: Propiedades) {
  const [autores, setAutores] = useState(iniciales)
  const [texto, setTexto] = useState("")
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState("")
  const [credencial, setCredencial] = useState("")
  const [tipo, setTipo] = useState<TipoDeAutorNuevo>("persona")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cambiando, setCambiando] = useState(false)

  const elegido = autores.find((autor) => autor.id === valor)

  function elegir(id: string) {
    setCambiando(false)
    setCreando(false)
    setError(null)
    alElegir(id)
  }

  function empezarNuevo() {
    setNombre(texto.trim())
    setCredencial("")
    setTipo("persona")
    setError(null)
    setCreando(true)
  }

  async function crear() {
    setError(null)
    setGuardando(true)
    const resultado = await alCrear({ nombre, credencial, tipo })
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    const { autor } = resultado
    setAutores((actuales) => (actuales.some((actual) => actual.id === autor.id) ? actuales : [...actuales, autor]))
    setTexto("")
    elegir(autor.id)
  }

  if (elegido && !cambiando) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-bloque bg-piedra-honda p-3.5 shadow-hundido">
        <p className="grid text-cuerpo">
          <span className="font-semibold text-tinta">{elegido.nombre}</span>
          {elegido.credencial ? <span className="text-meta text-apagado">{elegido.credencial}</span> : null}
        </p>
        <Boton variante="callado" onClick={() => setCambiando(true)} aria-label="Cambiar autor">
          Cambiar
        </Boton>
      </div>
    )
  }

  if (creando) {
    const parecidos = autoresParecidos(autores, nombre)
    return (
      <div className="grid gap-3 rounded-bloque bg-piedra-honda p-3.5">
        <Campo id="autor-nombre" etiqueta="Nombre del autor" ayuda="Ej: Esther Perel, @cuenta o Instituto Gottman">
          <input
            id="autor-nombre"
            type="text"
            autoComplete="off"
            value={nombre}
            aria-describedby="autor-nombre-ayuda"
            onKeyDown={sinEnviar}
            onChange={(evento) => setNombre(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
        {parecidos.map((parecido) => (
          <div key={parecido.id} className="grid gap-2">
            <p className="text-cuerpo text-tinta">¿Es el mismo autor que {parecido.nombre}?</p>
            <Boton variante="secundario" tamano="chico" className="w-fit" onClick={() => elegir(parecido.id)}>
              Sí, es {parecido.nombre}
            </Boton>
          </div>
        ))}
        <Campo
          id="autor-credencial"
          etiqueta={
            <>
              Credencial <span className="font-normal text-apagado">(opcional)</span>
            </>
          }
          ayuda="Ej: Psicoterapeuta de parejas"
        >
          <input
            id="autor-credencial"
            type="text"
            autoComplete="off"
            value={credencial}
            aria-describedby="autor-credencial-ayuda"
            onKeyDown={sinEnviar}
            onChange={(evento) => setCredencial(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
        <Campo id="autor-tipo" etiqueta="Tipo de autor">
          <select
            id="autor-tipo"
            value={tipo}
            onChange={(evento) => {
              if (esTipoDeAutorNuevo(evento.target.value)) setTipo(evento.target.value)
            }}
            className={CLASES_DE_CAMPO}
          >
            {TIPOS_DE_AUTOR_NUEVO.map((opcion) => (
              <option key={opcion} value={opcion}>
                {ETIQUETA_DE_TIPO_DE_AUTOR[opcion]}
              </option>
            ))}
          </select>
        </Campo>
        {error ? <LineaDeError>{error}</LineaDeError> : null}
        <Boton variante="secundario" cargando={guardando} onClick={() => void crear()}>
          Crear autor
        </Boton>
        <Boton variante="callado" deshabilitado={guardando} onClick={() => setCreando(false)}>
          Volver a buscar
        </Boton>
      </div>
    )
  }

  const encontrados = buscarAutores(autores, texto)
  return (
    <div className="grid gap-3">
      <Campo id="autor-busqueda" etiqueta="Autor" ayuda="Busca por nombre o alias.">
        <input
          id="autor-busqueda"
          type="search"
          autoComplete="off"
          value={texto}
          aria-describedby="autor-busqueda-ayuda"
          onKeyDown={sinEnviar}
          onChange={(evento) => setTexto(evento.target.value)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      {encontrados.length === 0 ? (
        <p className="text-cuerpo text-apagado">Nadie se llama así todavía.</p>
      ) : (
        <ul className="grid gap-2">
          {encontrados.slice(0, MAXIMO_DE_RESULTADOS).map((autor) => (
            <li key={autor.id}>
              <button
                type="button"
                onClick={() => elegir(autor.id)}
                aria-label={descripcion(autor)}
                className="grid min-h-objetivo w-full content-center gap-0.5 rounded-bloque bg-piedra px-3.5 py-2.5 text-left shadow-relieve active:shadow-hundido"
              >
                <span className="font-semibold">{autor.nombre}</span>
                {autor.credencial ? <span className="text-meta text-apagado">{autor.credencial}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {encontrados.length > MAXIMO_DE_RESULTADOS ? (
        <p className="text-meta text-apagado">Escribe más del nombre para ver el resto.</p>
      ) : null}
      <Boton variante="secundario" tamano="chico" className="w-fit" onClick={empezarNuevo}>
        Autor nuevo
      </Boton>
    </div>
  )
}
```

The first test's search button is named "Instituto Gottman" (no credential) through `aria-label`; the picked author "Esther Perel" shows its name and credential.

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-selector-de-autor.test.tsx tests/unit/diseno-reglas.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/selector-de-autor.tsx" tests/unit/biblioteca-selector-de-autor.test.tsx
head -1 "app/(app)/biblioteca/selector-de-autor.tsx"   # must print "use client"
git add "app/(app)/biblioteca/selector-de-autor.tsx" tests/unit/biblioteca-selector-de-autor.test.tsx
git commit -m "$(cat <<'EOF'
Port the author picker with Autor nuevo to the Biblioteca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 24: change the author and who it is for her

**Files:**
- Create: `app/(app)/biblioteca/materiales/[id]/editar-autor-y-rol.tsx`
- Test: `tests/unit/biblioteca-editar-autor-y-rol.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-editar-autor-y-rol.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { editarMaterialAccion, crearAutorAccion } = vi.hoisted(() => ({
  editarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  crearAutorAccion: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ editarMaterialAccion, crearAutorAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { AVISO_REPROCESAR, EditarAutorYRol } from "@/app/(app)/biblioteca/materiales/[id]/editar-autor-y-rol"

const ID = "11111111-2222-4333-8444-555555555555"
const AUTORES = [{ id: "a-1", nombre: "Daniela Ruiz", credencial: null, tipo: "persona", alias: [] }]

beforeEach(() => vi.clearAllMocks())

describe("EditarAutorYRol", () => {
  it("asks who it is for her in her words and saves the role she picks", async () => {
    render(<EditarAutorYRol materialId={ID} autores={AUTORES} autorId="a-1" rol="referente" conIdeas />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    expect(screen.getByRole("group", { name: "¿Quién es para ti?" })).toBeInTheDocument()
    expect(screen.queryByText("Papel")).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "Estudio o libro" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() =>
      expect(editarMaterialAccion).toHaveBeenCalledWith({ materialId: ID, autorId: "a-1", rol: "evidencia" }),
    )
    expect(await screen.findByText(AVISO_REPROCESAR)).toBeInTheDocument()
  })

  it("Cancelar puts everything back without saving", () => {
    render(<EditarAutorYRol materialId={ID} autores={AUTORES} autorId="a-1" rol="referente" conIdeas={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    fireEvent.click(screen.getByRole("radio", { name: "Estudio o libro" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(editarMaterialAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    expect(screen.getByRole("radio", { name: "Referente" })).toBeChecked()
  })

  it("says a refusal", async () => {
    editarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Ese autor ya no existe. Elígelo de nuevo." })
    render(<EditarAutorYRol materialId={ID} autores={AUTORES} autorId="a-1" rol="referente" conIdeas={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese autor ya no existe. Elígelo de nuevo.")
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-editar-autor-y-rol.test.tsx` → FAIL, cannot resolve the module.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/materiales/[id]/editar-autor-y-rol.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Eleccion } from "@/components/ui/filas"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import { AYUDA_DE_ROL, ETIQUETA_DE_ROL, ROLES, type Rol } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { crearAutorAccion, editarMaterialAccion } from "../../acciones"
import { SelectorDeAutor } from "../../selector-de-autor"

export const AVISO_REPROCESAR = "Reprocesa el material para que sus ideas sacadas usen el cambio."

interface Propiedades {
  materialId: string
  autores: AutorDeLista[]
  autorId: string
  rol: Rol
  /** Its ideas were taken with the author and role it had: a change reaches them only by reprocessing. */
  conIdeas: boolean
}

export function EditarAutorYRol({ materialId, autores, autorId: inicial, rol: rolInicial, conIdeas }: Propiedades) {
  const [abierto, setAbierto] = useState(false)
  const [autorId, setAutorId] = useState(inicial)
  const [rol, setRol] = useState<Rol>(rolInicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  function guardar() {
    ejecutar(
      () => editarMaterialAccion({ materialId, autorId, rol }),
      () => {
        setAbierto(false)
        setAviso(conIdeas ? AVISO_REPROCESAR : null)
      },
    )
  }

  function cerrar() {
    setAutorId(inicial)
    setRol(rolInicial)
    limpiarError()
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <div className="grid gap-2">
        {aviso ? <LineaDeEstado tipo="aviso" titulo={aviso} /> : null}
        <Boton variante="secundario" tamano="chico" className="w-fit" onClick={() => setAbierto(true)}>
          Cambiar autor o quién es para ti
        </Boton>
      </div>
    )
  }

  return (
    <section aria-label="Autor y quién es para ti" className="grid gap-4 rounded-panel bg-piedra p-4 shadow-relieve">
      <SelectorDeAutor autores={autores} valor={autorId} alElegir={setAutorId} alCrear={crearAutorAccion} />
      <fieldset className="elecciones grid">
        <legend className="text-cuerpo font-semibold">{PALABRAS.papel}</legend>
        {ROLES.map((opcion) => (
          <Eleccion
            key={opcion}
            nombre="rol"
            valor={opcion}
            elegido={rol === opcion}
            etiqueta={ETIQUETA_DE_ROL[opcion]}
            detalle={AYUDA_DE_ROL[opcion]}
            alElegir={() => setRol(opcion)}
          />
        ))}
      </fieldset>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <Boton cargando={pendiente} onClick={guardar}>
        Guardar
      </Boton>
      <Boton variante="callado" deshabilitado={pendiente} onClick={cerrar}>
        Cancelar
      </Boton>
    </section>
  )
}
```

(A `fieldset` with a `legend` is a group named by its legend, which the test reads as `role="group"`.)

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-editar-autor-y-rol.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/materiales/[id]/editar-autor-y-rol.tsx" tests/unit/biblioteca-editar-autor-y-rol.test.tsx
head -1 "app/(app)/biblioteca/materiales/[id]/editar-autor-y-rol.tsx"   # must print "use client"
git add "app/(app)/biblioteca/materiales/[id]/editar-autor-y-rol.tsx" tests/unit/biblioteca-editar-autor-y-rol.test.tsx
git commit -m "$(cat <<'EOF'
Let Coni change a material's author and who it is for her (4h)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 25: the editable card of a strategy material

**Files:**
- Create: `app/(app)/biblioteca/materiales/[id]/ficha-editable.tsx`
- Test: `tests/unit/biblioteca-ficha-editable.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-ficha-editable.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { editarFichaAccion } = vi.hoisted(() => ({
  editarFichaAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ editarFichaAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { FichaEditable } from "@/app/(app)/biblioteca/materiales/[id]/ficha-editable"
import type { FichaLeida } from "@/lib/dominio/biblioteca/ficha"

const ID = "11111111-2222-4333-8444-555555555555"
const FICHA: FichaLeida = {
  resumen: "Un plan para noviembre.",
  ideasClave: ["Una", "Dos", "Tres", "Cuatro", "Cinco"],
  citas: [{ texto: "Una cita", ubicacion: { pagina: 4 } }],
  fuente: { autor: "Equipo", anio: 2026, enlace: null },
}

beforeEach(() => vi.clearAllMocks())

describe("FichaEditable", () => {
  it("reads the card: summary, key ideas, quotes with their place and the source", () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    expect(screen.getByRole("heading", { name: "Resumen" })).toBeInTheDocument()
    expect(screen.getByText("Un plan para noviembre.")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
    expect(screen.getByText("página 4")).toBeInTheDocument()
    expect(screen.getByText("Equipo · 2026")).toBeInTheDocument()
  })

  it("edits and saves only a valid card, saying what is wrong first", async () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitar la idea clave 5" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Deja entre 5 y 10 ideas clave.")
    expect(editarFichaAccion).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Agregar una idea clave" }))
    fireEvent.change(screen.getByLabelText("Idea clave 5"), { target: { value: "Cinco bis" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() =>
      expect(editarFichaAccion).toHaveBeenCalledWith(
        expect.objectContaining({ materialId: ID, ideasClave: ["Una", "Dos", "Tres", "Cuatro", "Cinco bis"] }),
      ),
    )
    expect(await screen.findByText("Cinco bis")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-ficha-editable.test.tsx` → FAIL, cannot resolve the module.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/materiales/[id]/ficha-editable.tsx` (Ingesta's `ficha-editable.tsx` with Conidolly's pieces: `useAccion`, `LineaDeError`, `campo` fields; the markup of the read view and the form is otherwise the same):

```tsx
"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { type FichaLeida, leerEdicion, MAXIMO_DE_IDEAS, textoDeUbicacion } from "@/lib/dominio/biblioteca/ficha"
import { editarFichaAccion } from "../../acciones"
import { CLASES_DE_CAMPO, Campo } from "../../campo"

const SUBTITULO = "text-pieza text-balance"

function Lectura({ ficha }: { ficha: FichaLeida }) {
  const { fuente } = ficha
  const autorYAnio = [fuente.autor, fuente.anio].filter((dato) => dato !== null).join(" · ")
  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h2 className={SUBTITULO}>Resumen</h2>
        <p className="whitespace-pre-line">{ficha.resumen}</p>
      </section>
      <section className="grid gap-2">
        <h2 className={SUBTITULO}>Ideas clave</h2>
        <ul className="grid list-disc gap-2 pl-5">
          {ficha.ideasClave.map((idea, indice) => (
            // The ideas are an ordered list that is only ever replaced whole: the position is its identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <li key={indice}>{idea}</li>
          ))}
        </ul>
      </section>
      {ficha.citas.length > 0 ? (
        <section className="grid gap-3">
          <h2 className={SUBTITULO}>Citas</h2>
          {ficha.citas.map((cita, indice) => {
            const lugar = textoDeUbicacion(cita.ubicacion)
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: quotes have no id; they are replaced whole
              <figure key={indice} className="grid gap-1 border-l-2 border-campo pl-3.5">
                <blockquote>{cita.texto}</blockquote>
                {lugar ? <figcaption className="text-meta text-apagado">{lugar}</figcaption> : null}
              </figure>
            )
          })}
        </section>
      ) : null}
      {autorYAnio || fuente.enlace ? (
        <section className="grid gap-2">
          <h2 className={SUBTITULO}>Fuente</h2>
          {autorYAnio ? <p>{autorYAnio}</p> : null}
          {fuente.enlace ? (
            <a href={fuente.enlace} className="break-all text-tinta underline" rel="noreferrer noopener">
              {fuente.enlace}
            </a>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

interface Borrador {
  resumen: string
  ideas: string[]
  citas: FichaLeida["citas"]
  autor: string
  anio: string
  enlace: string
}

function aBorrador(ficha: FichaLeida): Borrador {
  return {
    resumen: ficha.resumen,
    ideas: ficha.ideasClave,
    citas: ficha.citas,
    autor: ficha.fuente.autor ?? "",
    anio: ficha.fuente.anio === null ? "" : String(ficha.fuente.anio),
    enlace: ficha.fuente.enlace ?? "",
  }
}

export function FichaEditable({ materialId, ficha: inicial }: { materialId: string; ficha: FichaLeida }) {
  const [ficha, setFicha] = useState(inicial)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [errorDeLaFicha, setErrorDeLaFicha] = useState<string | null>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  if (borrador === null) {
    return (
      <div className="grid gap-5">
        <Lectura ficha={ficha} />
        <Boton
          variante="secundario"
          onClick={() => {
            setErrorDeLaFicha(null)
            limpiarError()
            setBorrador(aBorrador(ficha))
          }}
        >
          Editar
        </Boton>
      </div>
    )
  }

  const cambiar = (cambios: Partial<Borrador>) => setBorrador({ ...borrador, ...cambios })

  function guardar(actual: Borrador) {
    const anio = actual.anio.trim() === "" ? null : Number(actual.anio)
    const leida = leerEdicion({
      materialId,
      resumen: actual.resumen,
      ideasClave: actual.ideas,
      citas: actual.citas,
      fuente: { autor: actual.autor, anio: anio !== null && Number.isInteger(anio) ? anio : null, enlace: actual.enlace },
    })
    if (!leida.ok) {
      setErrorDeLaFicha(leida.error)
      return
    }
    setErrorDeLaFicha(null)
    ejecutar(
      () => editarFichaAccion(leida.datos),
      () => {
        const { resumen, ideasClave, citas, fuente } = leida.datos
        setFicha({ resumen, ideasClave, citas, fuente })
        setBorrador(null)
      },
    )
  }

  const aviso = errorDeLaFicha ?? error
  return (
    <form
      className="grid gap-5"
      onSubmit={(evento) => {
        evento.preventDefault()
        guardar(borrador)
      }}
    >
      <Campo id="ficha-resumen" etiqueta="Resumen">
        <textarea
          id="ficha-resumen"
          rows={6}
          className={CLASES_DE_CAMPO}
          value={borrador.resumen}
          onChange={(evento) => cambiar({ resumen: evento.target.value })}
        />
      </Campo>

      <section className="grid gap-3">
        <h2 className={SUBTITULO}>Ideas clave</h2>
        {borrador.ideas.map((idea, indice) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the ideas are plain strings edited in place by position
          <div key={indice} className="grid gap-2">
            <Campo id={`ficha-idea-${indice}`} etiqueta={`Idea clave ${indice + 1}`}>
              <textarea
                id={`ficha-idea-${indice}`}
                rows={2}
                className={CLASES_DE_CAMPO}
                value={idea}
                onChange={(evento) =>
                  cambiar({ ideas: borrador.ideas.map((actual, i) => (i === indice ? evento.target.value : actual)) })
                }
              />
            </Campo>
            <Boton
              variante="callado"
              aria-label={`Quitar la idea clave ${indice + 1}`}
              onClick={() => cambiar({ ideas: borrador.ideas.filter((_, i) => i !== indice) })}
            >
              Quitar
            </Boton>
          </div>
        ))}
        {borrador.ideas.length < MAXIMO_DE_IDEAS ? (
          <Boton
            variante="secundario"
            tamano="chico"
            className="w-fit"
            onClick={() => cambiar({ ideas: [...borrador.ideas, ""] })}
          >
            Agregar una idea clave
          </Boton>
        ) : null}
      </section>

      {borrador.citas.length > 0 ? (
        <section className="grid gap-3">
          <h2 className={SUBTITULO}>Citas</h2>
          {borrador.citas.map((cita, indice) => {
            const lugar = textoDeUbicacion(cita.ubicacion)
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: quotes have no id; they are edited in place by position
              <fieldset key={indice} className="grid gap-2">
                <legend className="text-cuerpo font-semibold">Cita {indice + 1}</legend>
                <textarea
                  aria-label={`Texto de la cita ${indice + 1}`}
                  rows={3}
                  className={CLASES_DE_CAMPO}
                  value={cita.texto}
                  onChange={(evento) =>
                    cambiar({
                      citas: borrador.citas.map((actual, i) =>
                        i === indice ? { ...actual, texto: evento.target.value } : actual,
                      ),
                    })
                  }
                />
                {lugar ? <p className="text-meta text-apagado">{lugar}</p> : null}
                <Boton
                  variante="callado"
                  aria-label={`Quitar la cita ${indice + 1}`}
                  onClick={() => cambiar({ citas: borrador.citas.filter((_, i) => i !== indice) })}
                >
                  Quitar
                </Boton>
              </fieldset>
            )
          })}
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className={SUBTITULO}>Fuente</h2>
        <Campo id="ficha-autor" etiqueta="Autor de la fuente">
          <input
            id="ficha-autor"
            className={CLASES_DE_CAMPO}
            value={borrador.autor}
            onChange={(evento) => cambiar({ autor: evento.target.value })}
          />
        </Campo>
        <Campo id="ficha-anio" etiqueta="Año">
          <input
            id="ficha-anio"
            type="number"
            inputMode="numeric"
            className={CLASES_DE_CAMPO}
            value={borrador.anio}
            onChange={(evento) => cambiar({ anio: evento.target.value })}
          />
        </Campo>
        <Campo id="ficha-enlace" etiqueta="Enlace">
          <input
            id="ficha-enlace"
            type="url"
            inputMode="url"
            className={CLASES_DE_CAMPO}
            value={borrador.enlace}
            onChange={(evento) => cambiar({ enlace: evento.target.value })}
          />
        </Campo>
      </section>

      {aviso ? <LineaDeError>{aviso}</LineaDeError> : null}
      <Boton type="submit" cargando={pendiente}>
        Guardar cambios
      </Boton>
      <Boton variante="callado" deshabilitado={pendiente} onClick={() => setBorrador(null)}>
        Cancelar
      </Boton>
    </form>
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-ficha-editable.test.tsx tests/unit/diseno-reglas.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/materiales/[id]/ficha-editable.tsx" tests/unit/biblioteca-ficha-editable.test.tsx
head -1 "app/(app)/biblioteca/materiales/[id]/ficha-editable.tsx"   # must print "use client"
git add "app/(app)/biblioteca/materiales/[id]/ficha-editable.tsx" tests/unit/biblioteca-ficha-editable.test.tsx
git commit -m "$(cat <<'EOF'
Port the editable card of strategy materials to the Biblioteca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 26: the map of ideas and "Reprocesar"

**Files:**
- Create: `app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx`, `app/(app)/biblioteca/materiales/[id]/boton-reprocesar.tsx`
- Test: `tests/unit/biblioteca-mapa-y-reprocesar.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-mapa-y-reprocesar.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { reprocesarMaterialAccion } = vi.hoisted(() => ({
  reprocesarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ reprocesarMaterialAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { BotonReprocesar, PREGUNTA_REPROCESAR } from "@/app/(app)/biblioteca/materiales/[id]/boton-reprocesar"
import { MapaDelMaterial } from "@/app/(app)/biblioteca/materiales/[id]/mapa-del-material"

const MAPA = {
  total: 5,
  temas: [{ id: "t1", nombre: "Carga mental", afirmaciones: 3 }],
  sinTema: 2,
  tipos: { dato: 4, mito: 1 },
  evidencia: { estudio: 5 },
}

describe("MapaDelMaterial (4h)", () => {
  it("says the ideas taken in her words: topics and what kind of idea, no evidence on the main text", () => {
    render(<MapaDelMaterial mapa={MAPA} estado="listo" />)
    expect(screen.getByRole("heading", { name: "Ideas sacadas" })).toBeInTheDocument()
    expect(screen.getByText("5 ideas sacadas")).toBeInTheDocument()
    const temas = screen.getByRole("list", { name: "Temas" })
    expect(within(temas).getAllByRole("listitem").map((fila) => fila.textContent)).toEqual([
      "Carga mental3",
      "Sin tema todavía2",
    ])
    expect(screen.getByRole("list", { name: "Qué tipo de idea es" })).toHaveTextContent("Dato4")
    expect(screen.queryByText(/Evidencia|Tipos de afirmación|afirmaciones/)).toBeNull()
  })

  it("says why there is nothing yet", () => {
    render(<MapaDelMaterial mapa={{ ...MAPA, total: 0, temas: [], sinTema: 0 }} estado="procesando" />)
    expect(screen.getByText("Las ideas aparecen cuando termina de procesarse.")).toBeInTheDocument()
  })
})

describe("BotonReprocesar", () => {
  it("asks first, saying what it costs and what it replaces, and reprocesses on yes", async () => {
    render(<BotonReprocesar materialId="m-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }))
    expect(screen.getByText(PREGUNTA_REPROCESAR)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, reprocesar" }))
    await waitFor(() => expect(reprocesarMaterialAccion).toHaveBeenCalledWith("m-1"))
  })
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec vitest run tests/unit/biblioteca-mapa-y-reprocesar.test.tsx` → FAIL, cannot resolve the modules.

- [ ] **Step 3: Implement.** Create `app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx`:

```tsx
import { Seccion } from "@/components/seccion"
import { TIPO_DE_AFIRMACION } from "@/lib/dominio/biblioteca/etiquetas"
import { type MapaDelMaterial as Mapa, masFrecuentesPrimero } from "@/lib/dominio/biblioteca/mapa"
import { ideasSacadas, PALABRAS } from "@/lib/dominio/biblioteca/palabras"

function Recuento({ titulo, id, filas }: { titulo: string; id: string; filas: { clave: string; texto: string; cantidad: number }[] }) {
  return (
    <Seccion titulo={titulo} id={id}>
      <ul aria-label={titulo} className="divide-y divide-hilo rounded-panel bg-piedra-alta px-[18px]">
        {filas.map((fila) => (
          <li key={fila.clave} className="flex min-h-objetivo items-center justify-between gap-3 text-cuerpo">
            <span>{fila.texto}</span>
            <span className="text-meta font-semibold text-apagado tabular-nums">{fila.cantidad}</span>
          </li>
        ))}
      </ul>
    </Seccion>
  )
}

/** What a material gave, in her words (4h): its topics and what kind of ideas. The evidence goes to WAV's detail. */
export function MapaDelMaterial({ mapa, estado }: { mapa: Mapa; estado: string }) {
  return (
    <section aria-labelledby="mapa-titulo" className="grid gap-4">
      <h2 id="mapa-titulo" className="text-pieza">
        {PALABRAS.afirmaciones}
      </h2>
      {mapa.total === 0 ? (
        <p className="text-cuerpo text-apagado">
          {estado === "listo" ? "Este material no dejó ideas." : "Las ideas aparecen cuando termina de procesarse."}
        </p>
      ) : (
        <>
          <p className="text-cuerpo font-semibold">{ideasSacadas(mapa.total)}</p>
          <Recuento
            titulo="Temas"
            id="mapa-temas"
            filas={[
              ...mapa.temas.map((tema) => ({ clave: tema.id, texto: tema.nombre, cantidad: tema.afirmaciones })),
              ...(mapa.sinTema > 0 ? [{ clave: "sin-tema", texto: "Sin tema todavía", cantidad: mapa.sinTema }] : []),
            ]}
          />
          <Recuento
            titulo={PALABRAS.tiposDeAfirmacion}
            id="mapa-tipos"
            filas={masFrecuentesPrimero(mapa.tipos, TIPO_DE_AFIRMACION)}
          />
        </>
      )}
    </section>
  )
}
```

(The list is drawn like `Grupo plano lista` but written out, because `Grupo` renders an unnamed `ul` and this list must be named after its section.)

Create `app/(app)/biblioteca/materiales/[id]/boton-reprocesar.tsx`:

```tsx
"use client"

import { reprocesarMaterialAccion } from "../../acciones"
import { BotonQuePregunta } from "../../boton-que-pregunta"

export const PREGUNTA_REPROCESAR =
  "Reprocesar cuesta más o menos lo mismo que la primera vez. Se borran las ideas sacadas de este material y se vuelven a sacar."

export function BotonReprocesar({ materialId }: { materialId: string }) {
  return (
    <BotonQuePregunta
      etiqueta="Reprocesar"
      pregunta={PREGUNTA_REPROCESAR}
      confirmar="Sí, reprocesar"
      alConfirmar={() => reprocesarMaterialAccion(materialId)}
    />
  )
}
```

- [ ] **Step 4: Run green with the rules.** Run: `pnpm exec vitest run tests/unit/biblioteca-mapa-y-reprocesar.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx" "app/(app)/biblioteca/materiales/[id]/boton-reprocesar.tsx" tests/unit/biblioteca-mapa-y-reprocesar.test.tsx
head -1 "app/(app)/biblioteca/materiales/[id]/boton-reprocesar.tsx"   # must print "use client"
git add "app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx" "app/(app)/biblioteca/materiales/[id]/boton-reprocesar.tsx" tests/unit/biblioteca-mapa-y-reprocesar.test.tsx
git commit -m "$(cat <<'EOF'
Show a material's ideas in Coni's words and confirm Reprocesar in line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 27: the detail page

**Files:**
- Create: `app/(app)/biblioteca/materiales/[id]/page.tsx`
- Test: covered end to end by Tasks 28 and 30 (an async server page reading the database; its pieces are unit-tested in Tasks 13 and 16 to 26).

- [ ] **Step 1: Write the failing check.** Run: `pnpm build 2>&1 | grep -c "/biblioteca/materiales/\[id\] "` → `0` (only the `texto` route exists so far).

- [ ] **Step 2: Implement.** Create `app/(app)/biblioteca/materiales/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { z } from "zod"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { Volver } from "@/components/ui/volver"
import { leerMapaDelMaterial, leerMaterialConFicha, listarAutores } from "@/lib/datos/biblioteca"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import { esperaConfirmacion, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
import { adaptacionDe } from "@/lib/dominio/biblioteca/ficha"
import { esRol, etiquetaDeRol, etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { exigirConi } from "@/lib/sesion/coni"
import { BotonConfirmarCosto } from "../../boton-confirmar-costo"
import { BotonReintentar } from "../../boton-reintentar"
import { EstadoDeMaterial } from "../../estado-de-material"
import { BotonReprocesar } from "./boton-reprocesar"
import { EditarAutorYRol } from "./editar-autor-y-rol"
import { FichaEditable } from "./ficha-editable"
import { MapaDelMaterial } from "./mapa-del-material"

export default async function DetalleDeMaterial({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const leido = await leerMaterialConFicha(db, valido.data)
  if (!leido) notFound()
  const { material, ficha } = leido
  const conFicha = material.rol === "estrategia"
  const [autores, mapa] = await Promise.all([
    listarAutores(db),
    conFicha ? null : leerMapaDelMaterial(db, material.id),
  ])

  return (
    <div className="grid gap-6">
      <Volver href="/biblioteca">Materiales</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">{material.titulo ?? "Sin título"}</h1>
        <p className="text-meta text-apagado">
          {`${etiquetaDeTipo(material.tipo)} · ${material.autor} · ${etiquetaDeRol(material.rol)}`}
        </p>
        <div>
          <EstadoDeMaterial material={material} />
        </div>
        {esperaConfirmacion(material) && material.costo_estimado_usd !== null ? (
          <BotonConfirmarCosto materialId={material.id} costoUsd={material.costo_estimado_usd} />
        ) : null}
        {sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null}
      </header>

      <EditarAutorYRol
        materialId={material.id}
        autores={autores}
        autorId={material.autor_id}
        rol={esRol(material.rol) ? material.rol : "referente"}
        conIdeas={(mapa?.total ?? 0) > 0}
      />

      {mapa ? (
        <MapaDelMaterial mapa={mapa} estado={material.estado} />
      ) : ficha ? (
        <>
          <p className="rounded-bloque bg-piedra-honda p-3.5 text-meta text-tinta">
            {adaptacionDe(material.idioma_original)}
          </p>
          <FichaEditable materialId={material.id} ficha={ficha} />
        </>
      ) : (
        <p className="text-cuerpo text-apagado">
          {material.estado === "listo"
            ? "No pude leer la ficha de este material. Avísale a Federico."
            : "La ficha aparece cuando termina de procesarse."}
        </p>
      )}

      {material.estado === "listo" ? (
        // A plain link (D12): a Link would prefetch the route handler and sign a download on every render.
        <a href={`/biblioteca/materiales/${material.id}/texto`} className={clasesDeBoton({ variante: "secundario" })}>
          Descargar texto original
        </a>
      ) : null}
      {material.estado === "listo" ? <BotonReprocesar materialId={material.id} /> : null}

      <DetalleParaWav lineas={lineasParaWav(material, mapa?.evidencia ?? {})} proveedor={null} />
    </div>
  )
}
```

- [ ] **Step 3: Build and see the route; run every unit test.**

Run: `pnpm type && pnpm build 2>&1 | grep "/biblioteca" && pnpm test:run`
Expected: `ƒ /biblioteca`, `ƒ /biblioteca/materiales/[id]` and `ƒ /biblioteca/materiales/[id]/texto`; all unit tests PASS (design rules and the 4h scan read the new page).

- [ ] **Step 4: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/materiales/[id]/page.tsx"
git add "app/(app)/biblioteca/materiales/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
Add the Biblioteca's material detail with honest back link and text download

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

# Part G: End to end

The E2E builds the app once (`next build && next start`, about 5 minutes). While iterating on a spec, start the stack yourself and reuse it: `E2E_REUSE_SERVER=1 pnpm exec playwright test <file>` (see `playwright.config.ts`). `PLAYWRIGHT_CHROMIUM_PATH` points at a local Chromium when the bundled one is not installed.

### Task 28: the run's Biblioteca, and the phone list with its filters

**Files:**
- Create: `tests/e2e/biblioteca-escena.ts`, `tests/e2e/biblioteca.spec.ts`
- Modify: `tests/e2e/limpiar.ts`

- [ ] **Step 1: Write the scene.** Create `tests/e2e/biblioteca-escena.ts`:

```ts
import { CONI, pool } from "../integration/db"
import { BALDE_DE_PRUEBA, URL_DEL_ALMACEN } from "./entorno"

// The run's Biblioteca: the run owns `materiales` (D16), so the scene empties it first and the teardown last.

export const AUTORA = "Daniela Ruiz"
export const CREDENCIAL = "investigadora de confianza"
export const TEMA_PRINCIPAL = "Carga mental"
const TEMAS = [TEMA_PRINCIPAL, "Pausas activas"]
const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

export interface EscenaDeBiblioteca {
  listo: string
  procesando: string
  conError: string
  esperaOk: string
  estrategia: string
}

async function uno(sql: string, params: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`La escena no pudo crear: ${sql.slice(0, 60)}`)
  return id
}

async function material(campos: {
  titulo: string
  tipo: string
  autorId: string
  rol: string
  estado: string
  motivo?: string
  costo?: number
  hace: string
}): Promise<string> {
  return uno(
    `insert into public.materiales
       (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado, motivo_fallo,
        costo_estimado_usd, creado_en)
     values ($1, $2, $3, $4, 'texto de prueba', now(), $5, $6, $7, $8, now() - $9::interval) returning id`,
    [
      campos.titulo,
      campos.tipo,
      campos.autorId,
      campos.rol,
      CONI,
      campos.estado,
      campos.motivo ?? null,
      campos.costo ?? null,
      campos.hace,
    ],
  )
}

async function ideas(materialId: string, autorId: string, temaId: string, textos: string[], evidencia: string) {
  for (const [indice, texto] of textos.entries()) {
    await pool.query(
      `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, creada_en)
       values ($1, $2, 0, '{"pagina":1}'::jsonb, $3, 'cita', 'dato', $4, $5, now() + $6 * interval '1 millisecond')`,
      [materialId, autorId, texto, evidencia, temaId, indice],
    )
  }
}

/** The original text the task would have written, put in the fake R2 with an unsigned PUT. */
async function textoOriginal(materialId: string, texto: string): Promise<void> {
  const respuesta = await fetch(`${URL_DEL_ALMACEN}/${BALDE_DE_PRUEBA}/materiales/${materialId}/texto-original.txt`, {
    method: "PUT",
    body: texto,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
  if (!respuesta.ok) throw new Error(`El almacén falso no guardó el texto: ${respuesta.status}`)
}

export async function vaciarBiblioteca(): Promise<void> {
  await pool.query("delete from public.materiales")
  await pool.query("delete from public.temas where nombre = any($1::text[])", [TEMAS])
  await pool.query("delete from public.autores where nombre = $1", [AUTORA])
}

/** Five materials, one per state the screens draw, plus a strategy card. Titles are the mockup's. */
export async function sembrarBiblioteca(): Promise<EscenaDeBiblioteca> {
  await vaciarBiblioteca()
  const autora = await uno(
    "insert into public.autores (nombre, credencial, tipo) values ($1, $2, 'persona') returning id",
    [AUTORA, CREDENCIAL],
  )
  const coni = await uno("select id from public.autores where tipo = 'coni'", [])
  const [carga, pausas] = await Promise.all(
    TEMAS.map((nombre) =>
      uno("insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id", [
        nombre,
        CENTROIDE,
      ]),
    ),
  )
  if (!carga || !pausas) throw new Error("La escena no creó sus temas")

  const listo = await material({
    titulo: "Burnout y teletrabajo: revisión 2024",
    tipo: "documento",
    autorId: autora,
    rol: "referente",
    estado: "listo",
    hace: "2 days",
  })
  await ideas(listo, autora, carga, ["El aislamiento pesa más que las horas extra.", "Las pausas acordadas protegen."], "estudio")
  await ideas(listo, autora, pausas, ["Una pausa corta cada hora ayuda."], "opinion")
  await textoOriginal(listo, "Texto original de la revisión.")

  const procesando = await material({
    titulo: "Liderar con IA sin perder a las personas",
    tipo: "link",
    autorId: coni,
    rol: "voz_propia",
    estado: "procesando",
    hace: "1 minute",
  })
  const conError = await material({
    titulo: "Notas del taller de TDAH adulto",
    tipo: "post",
    autorId: coni,
    rol: "voz_propia",
    estado: "fallido",
    motivo: "sin_texto",
    hace: "1 day",
  })
  const esperaOk = await material({
    titulo: "Charla larga sobre el síndrome del impostor",
    tipo: "audio",
    autorId: autora,
    rol: "referente",
    estado: "procesando",
    costo: 1.2,
    hace: "3 days",
  })
  const estrategia = await material({
    titulo: "Plan de contenidos de noviembre",
    tipo: "documento",
    autorId: coni,
    rol: "estrategia",
    estado: "listo",
    hace: "20 days",
  })
  await pool.query(
    `insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente)
     values ($1, 'Qué publicar en noviembre y por qué.', $2::jsonb, '[]'::jsonb, '{"autor":"Equipo","anio":2026,"enlace":null}'::jsonb)`,
    [estrategia, JSON.stringify(["Una", "Dos", "Tres", "Cuatro", "Cinco"])],
  )
  return { listo, procesando, conError, esperaOk, estrategia }
}
```

In `tests/e2e/limpiar.ts`, import `vaciarBiblioteca` from `./biblioteca-escena` and call `await vaciarBiblioteca()` before `await pool.end()`.

- [ ] **Step 2: Write the failing list spec.** Create `tests/e2e/biblioteca.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, disparosDeMateriales, limpiarDisparos } from "./ayudas"
import { AUTORA, type EscenaDeBiblioteca, sembrarBiblioteca, TEMA_PRINCIPAL } from "./biblioteca-escena"

let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
  limpiarDisparos()
})

test("the phone list shows each material as a card with its words, topic and state, and the bar is unchanged", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(
    page.getByRole("navigation", { name: "Secciones de la Biblioteca" }).getByRole("link", { name: "Materiales" }),
  ).toHaveAttribute("aria-current", "page")

  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(5)
  const burnout = lista.getByRole("listitem").filter({ hasText: "Burnout y teletrabajo" })
  await expect(burnout).toContainText(`Documento · ${AUTORA} · Referente`)
  await expect(burnout).toContainText(`${TEMA_PRINCIPAL} +1`)
  await expect(burnout).toContainText("Listo")
  await expect(burnout).toContainText("Hace 2 días")
  await expect(lista.getByRole("listitem").filter({ hasText: "Notas del taller" })).toContainText("Con error")
  await expect(lista.getByRole("listitem").filter({ hasText: "Liderar con IA" })).toContainText("Procesando")

  // The bar's tab still goes to Ingesta in this batch.
  await expect(
    page.getByRole("navigation", { name: "Secciones", exact: true }).getByRole("link", { name: "Biblioteca" }),
  ).toHaveAttribute("href", "/ir-a-biblioteca")
})

test("the quick filters change the list with one tap and live in the URL (4b)", async ({ page }) => {
  await page.goto("/biblioteca")
  const lista = page.getByRole("list", { name: "Materiales" })

  await page.getByRole("button", { name: "Con error · 1" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=fallido$/)
  await expect(page.getByRole("button", { name: "Con error · 1" })).toHaveAttribute("aria-pressed", "true")
  await expect(lista.getByRole("listitem")).toHaveCount(1)

  await page.getByRole("button", { name: "Procesando · 2" }).click()
  await expect(lista.getByRole("listitem")).toHaveCount(2)

  await page.getByRole("button", { name: "Todos" }).click()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(lista.getByRole("listitem")).toHaveCount(5)
})

test("Más filtros folds author, who she is for you and type, and keeps the quick filter", async ({ page }) => {
  await page.goto("/biblioteca?estado=listo")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("¿Quién es para ti?").selectOption({ label: "Estrategia interna" })
  await page.getByRole("button", { name: "Filtrar" }).click()

  await expect(page).toHaveURL(/estado=listo/)
  await expect(page).toHaveURL(/rol=estrategia/)
  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(1)
  await expect(lista).toContainText("Plan de contenidos de noviembre")

  await page.getByRole("link", { name: "Quitar estos filtros" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=listo$/)
})

test("Procesar por ~US$ 1,20 on a card starts the run with a key of its own", async ({ page }) => {
  await page.goto("/biblioteca")
  await page.getByRole("button", { name: "Procesar por ~US$ 1,20" }).click()
  await expect(page.getByRole("button", { name: "Procesar por ~US$ 1,20" })).toHaveCount(0)
  const disparos = disparosDeMateriales()
  expect(disparos.map((disparo) => disparo.materialId)).toEqual([escena.esperaOk])
  expect(disparos[0]?.clave).toMatch(new RegExp(`^procesar-material:${escena.esperaOk}:[0-9a-f-]{36}$`))
})
```

- [ ] **Step 3: Run it.** The screens exist since Task 27, so this spec pins them end to end; before Task 22 it fails with `/biblioteca` answering 404.

Run: `pnpm exec playwright test tests/e2e/biblioteca.spec.ts`
Expected: PASS (4 tests). If a test fails, fix the screen (not the expectation) unless the expectation contradicts the spec; the expectations here are the spec's.

- [ ] **Step 4: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca.spec.ts tests/e2e/limpiar.ts
git add tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca.spec.ts tests/e2e/limpiar.ts
git commit -m "$(cat <<'EOF'
Check the Biblioteca's phone list and quick filters end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 29: the detail end to end: edits, new run keys, download, not found, Coni only

**Files:**
- Modify: `tests/e2e/biblioteca.spec.ts`

- [ ] **Step 1: Write the tests.** Append to `tests/e2e/biblioteca.spec.ts` (add `import { pool } from "../integration/db"`, `import { entrarComo } from "./ayudas"` merged into the existing import, and `import { CORREO_DEL_MANTENEDOR } from "./entorno"`):

```ts
test("the detail goes back honestly, edits who she is for you, and Reprocesar records a new run", async ({ page }) => {
  await page.goto("/biblioteca")
  await page.getByRole("link", { name: /Burnout y teletrabajo/ }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/materiales/${escena.listo}$`))
  // 4f: the way back says where it goes and sits on the left.
  const volver = page.getByRole("link", { name: "Materiales" })
  await expect(volver).toHaveAttribute("href", "/biblioteca")
  expect((await volver.boundingBox())?.x ?? 999).toBeLessThan(40)
  // 4h: her words on the main text.
  await expect(page.getByRole("heading", { name: "Ideas sacadas" })).toBeVisible()
  await expect(page.getByText("Papel", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "Cambiar autor o quién es para ti" }).click()
  await page.getByRole("radio", { name: "Estudio o libro" }).check()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Reprocesa el material para que sus ideas sacadas usen el cambio.")).toBeVisible()
  const { rows } = await pool.query<{ rol: string }>("select rol from public.materiales where id = $1", [escena.listo])
  expect(rows[0]?.rol).toBe("evidencia")

  await page.getByRole("button", { name: "Reprocesar" }).click()
  await page.getByRole("button", { name: "Sí, reprocesar" }).click()
  await expect(page.getByText("Procesando", { exact: true })).toBeVisible()
  const disparos = disparosDeMateriales()
  expect(disparos.map((disparo) => disparo.materialId)).toEqual([escena.listo])
  expect(disparos[0]?.clave).toMatch(new RegExp(`^procesar-material:${escena.listo}:[0-9a-f-]{36}$`))
})

test("Reintentar twice records two runs with two keys", async ({ page }) => {
  for (const vuelta of [1, 2]) {
    await pool.query("update public.materiales set estado = 'fallido', motivo_fallo = 'sin_texto' where id = $1", [
      escena.conError,
    ])
    await page.goto(`/biblioteca/materiales/${escena.conError}`)
    await page.getByRole("button", { name: "Reintentar" }).click()
    await page.getByRole("button", { name: "Sí, reintentar" }).click()
    await expect(page.getByText("Procesando", { exact: true })).toBeVisible()
    expect(disparosDeMateriales()).toHaveLength(vuelta)
  }
  const claves = disparosDeMateriales().map((disparo) => disparo.clave)
  expect(new Set(claves).size).toBe(2)
})

test("Descargar texto original downloads the signed text straight from the store", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  const descarga = page.waitForEvent("download")
  await page.getByRole("link", { name: "Descargar texto original" }).click()
  const archivo = await descarga
  expect(archivo.suggestedFilename()).toBe("texto-original.txt")
  expect(archivo.url()).toContain(`/conidolly-e2e/materiales/${escena.listo}/texto-original.txt`)
  expect(archivo.url()).toContain("X-Amz-Signature=")
})

test("a strategy material shows its editable card", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.estrategia}`)
  await expect(page.getByText("Adaptado a la voz de Coni")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible()
  await expect(page.getByText("Qué publicar en noviembre y por qué.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible()
})

test("a material that is not there shows the section's own not-found page (4m)", async ({ page }) => {
  for (const ruta of ["/biblioteca/materiales/00000000-0000-4000-8000-000000000000", "/biblioteca/materiales/no-es-un-id"]) {
    await page.goto(ruta)
    await expect(page.getByRole("heading", { name: "No encontré lo que buscabas" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Materiales" })).toHaveAttribute("href", "/biblioteca")
  }
})

test("only Coni: without a session it asks to sign in, and the maintainer sees the app is Coni's", async ({ browser }) => {
  const sinSesion = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const visitante = await sinSesion.newPage()
  await visitante.goto("/biblioteca")
  await expect(visitante).toHaveURL(/\/ingreso$/)
  await sinSesion.close()

  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const wav = await contexto.newPage()
  for (const ruta of ["/biblioteca", `/biblioteca/materiales/${escena.listo}`]) {
    await wav.goto(ruta)
    await expect(wav.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
    await expect(wav.getByText("Burnout y teletrabajo")).toHaveCount(0)
  }
  await contexto.close()
})
```

- [ ] **Step 2: Run them.** Run: `pnpm exec playwright test tests/e2e/biblioteca.spec.ts` → PASS (10 tests). A failure in the download test that shows a `404` page instead of a download means the app did not get `R2_ENDPOINT` (Task 3, Step 5) or the scene's PUT went to another bucket.

- [ ] **Step 3: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca.spec.ts
git add tests/e2e/biblioteca.spec.ts
git commit -m "$(cat <<'EOF'
Check the Biblioteca's detail, run keys, signed download and access end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 30: the desktop project: wide column, table, side panel, Back

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/biblioteca.escritorio.ts`

- [ ] **Step 1: Write the desktop spec.** Create `tests/e2e/biblioteca.escritorio.ts`:

```ts
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import { AUTORA, CREDENCIAL, type EscenaDeBiblioteca, sembrarBiblioteca } from "./biblioteca-escena"

// Runs only in the `escritorio` project (D15): a computer, 1280 x 900.
let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
})

test("on a computer the column widens, and the table opens the side panel with ?m; Back closes it", async ({ page }) => {
  await page.goto("/biblioteca")
  const ancho = await page.locator("[data-ancho=biblioteca]").evaluate((nodo) => nodo.getBoundingClientRect().width)
  expect(ancho).toBeGreaterThan(900)
  await expect(page.getByRole("list", { name: "Materiales" })).toBeHidden()

  const tabla = page.getByRole("table", { name: "Materiales" })
  await expect(tabla.getByRole("columnheader")).toHaveText(["Material", "Tipo", "Autor", "Tema", "Estado", "Subido"])
  await expect(page.getByText("Elige un material de la tabla para ver aquí sus ideas y quién es para ti.")).toBeVisible()

  await tabla.getByRole("link", { name: "Burnout y teletrabajo: revisión 2024" }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca\\?m=${escena.listo}$`))
  const panel = page.getByRole("region", { name: "Burnout y teletrabajo: revisión 2024" })
  await expect(panel.getByRole("heading", { name: "Ideas sacadas" })).toBeVisible()
  await expect(panel).toContainText("«El aislamiento pesa más que las horas extra.»")
  await expect(panel).toContainText(`${AUTORA} · ${CREDENCIAL}`)
  await expect(panel.getByText("Detalle para WAV")).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(page.getByText("Elige un material de la tabla para ver aquí sus ideas y quién es para ti.")).toBeVisible()

  await tabla.getByRole("link", { name: "Burnout y teletrabajo: revisión 2024" }).click()
  await panel.getByRole("link", { name: "Ver todas" }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/materiales/${escena.listo}$`))
})

test("the panel closes with its own control and keeps the filter", async ({ page }) => {
  await page.goto(`/biblioteca?estado=listo&m=${escena.listo}`)
  await page.getByRole("link", { name: "Cerrar el panel" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=listo$/)
})

test("the table and the side panel pass WCAG 2.x AA", async ({ page }) => {
  await page.goto(`/biblioteca?m=${escena.listo}`)
  await expect(page.getByRole("region", { name: "Burnout y teletrabajo: revisión 2024" })).toBeVisible()
  expect(await revisarConAxe(page, "tabla y panel")).toEqual([])
  await page.getByText("Detalle para WAV").click()
  expect(await revisarConAxe(page, "panel con el detalle para WAV abierto")).toEqual([])
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm exec playwright test tests/e2e/biblioteca.escritorio.ts` → "No tests found" (no project matches `.escritorio.ts` yet).

- [ ] **Step 3: Add the project.** In `playwright.config.ts`, add after the `app` project:

```ts
    {
      // The Biblioteca on a computer (D15): its own files, so the phone project never runs them.
      name: "escritorio",
      dependencies: ["ingreso"],
      testMatch: /.*\.escritorio\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
        storageState: ESTADO_DE_SESION,
      },
    },
```

- [ ] **Step 4: Run green.** Run: `pnpm exec playwright test --project escritorio` → PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write playwright.config.ts tests/e2e/biblioteca.escritorio.ts
git add playwright.config.ts tests/e2e/biblioteca.escritorio.ts
git commit -m "$(cat <<'EOF'
Check the Biblioteca on a computer: wide column, table, side panel and Back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 31: accessibility and large text on the phone (4c, 4n)

**Files:**
- Modify: `tests/e2e/biblioteca.spec.ts`

- [ ] **Step 1: Write the tests.** Append to `tests/e2e/biblioteca.spec.ts` (add `conLetraGrande` and `revisarConAxe` to the `./ayudas` import):

```ts
test("the list, the detail and the card pass WCAG 2.x AA (4n)", async ({ page }) => {
  const hallazgos: string[] = []
  await page.goto("/biblioteca")
  hallazgos.push(...(await revisarConAxe(page, "lista")))
  await page.getByText("Más filtros", { exact: true }).click()
  hallazgos.push(...(await revisarConAxe(page, "lista con más filtros")))
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  hallazgos.push(...(await revisarConAxe(page, "detalle")))
  await page.getByRole("button", { name: "Reprocesar" }).click()
  hallazgos.push(...(await revisarConAxe(page, "detalle preguntando")))
  await page.goto(`/biblioteca/materiales/${escena.estrategia}`)
  await page.getByRole("button", { name: "Editar" }).click()
  hallazgos.push(...(await revisarConAxe(page, "ficha en edición")))
  await page.goto("/biblioteca/materiales/00000000-0000-4000-8000-000000000000")
  hallazgos.push(...(await revisarConAxe(page, "no encontrado")))
  expect(hallazgos).toEqual([])
})

test("at 375 px with large text the section tab and the quick filters fit, 44 px or more, nothing scrolls sideways (4c)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/biblioteca")
  await conLetraGrande(page)

  const pestana = page
    .getByRole("navigation", { name: "Secciones de la Biblioteca" })
    .getByRole("link", { name: "Materiales" })
  await expect(pestana).toBeVisible()
  expect((await pestana.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  for (const nombre of ["Todos", "Procesando · 2", "Listos", "Con error · 1"]) {
    const chip = page.getByRole("button", { name: nombre })
    await expect(chip).toBeVisible()
    expect((await chip.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  const sinDesborde = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(sinDesborde).toBe(true)
  expect(await revisarConAxe(page, "lista con letra grande")).toEqual([])
})
```

- [ ] **Step 2: Run them.** Run: `pnpm exec playwright test tests/e2e/biblioteca.spec.ts` → PASS (12 tests). A colour-contrast finding is fixed in the component with the existing tokens, never by excluding the node.

- [ ] **Step 3: The design rules on every new file.** Run: `pnpm exec vitest run tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts` → PASS.

- [ ] **Step 4: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca.spec.ts
git add tests/e2e/biblioteca.spec.ts
git commit -m "$(cat <<'EOF'
Check the Biblioteca with axe and with large text at 375 px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

# Part H: Baselines, gate, review, release

### Task 32: visual baselines of the Biblioteca, only after Federico looks

**Do not generate or commit any baseline of the Biblioteca before Step 3.** Its baselines and the tests that take them go in one commit of their own.

**Files:**
- Modify: `tests/e2e/visual.spec.ts`, `tests/e2e/biblioteca.escritorio.ts`
- Create (Step 4 only): `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png`, `biblioteca-detalle-app-darwin.png`, `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png`

- [ ] **Step 1: Add the captures (not committed yet).** In `tests/e2e/visual.spec.ts`, add `import { sembrarBiblioteca } from "./biblioteca-escena"` and append:

```ts
test("biblioteca: the phone list and a material's detail", async ({ page }) => {
  const escena = await sembrarBiblioteca()
  await page.goto("/biblioteca")
  await capturaDe(page, "biblioteca-lista")
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  await capturaDe(page, "biblioteca-detalle")
})
```

In `tests/e2e/biblioteca.escritorio.ts`, add `import { mkdirSync } from "node:fs"` and `import { join } from "node:path"` and append:

```ts
test("visual: the table with the side panel open", async ({ page }) => {
  await page.goto(`/biblioteca?m=${escena.listo}`)
  await page.evaluate(() => document.fonts.ready)
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, "biblioteca-escritorio.png"), fullPage: true })
    return
  }
  await expect(page).toHaveScreenshot("biblioteca-escritorio.png", {
    fullPage: true,
    // The honda stone of app/globals.css, as visual.spec.ts paints its masks.
    mask: [page.locator('[data-snapshot="varia"]')],
    maskColor: "#dcdcdb",
  })
})
```

- [ ] **Step 2: Write review captures for Federico.**

```bash
VISUAL_FINALES=test-results/finales-biblioteca pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca"
VISUAL_FINALES=test-results/finales-biblioteca pnpm exec playwright test --project escritorio -g "visual"
open test-results/finales-biblioteca
```

Expected: `biblioteca-lista.png`, `biblioteca-detalle.png` (390 px) and `biblioteca-escritorio.png` (1280 px). Put them next to the mockups `docs/pedido-coni-2026-10-31/media/image3.png` (phone) and `image4.png` (computer) and **stop: ask Federico to look and say OK**. Fix what he asks for (test first where it is behaviour), regenerate the review captures, and ask again.

- [ ] **Step 3: After Federico's OK, take the baselines.**

```bash
pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca" --update-snapshots
pnpm exec playwright test --project escritorio -g "visual" --update-snapshots
pnpm exec playwright test tests/e2e/visual.spec.ts --project escritorio
```

Expected: the last run passes without `--update-snapshots`, and the other visual baselines did not change (`git status` shows only the three new PNGs and the two spec files).

- [ ] **Step 4: Commit them alone.**

```bash
pnpm exec biome check --write tests/e2e/visual.spec.ts tests/e2e/biblioteca.escritorio.ts
git add tests/e2e/visual.spec.ts tests/e2e/biblioteca.escritorio.ts tests/e2e/visual.spec.ts-snapshots/biblioteca-*.png tests/e2e/biblioteca.escritorio.ts-snapshots
git commit -m "$(cat <<'EOF'
Add the visual baselines of the Biblioteca, reviewed by Federico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 33: the full gate

**Files:** none new.

- [ ] **Step 1: Run every check.**

Run: `pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build && pnpm test:e2e`
Expected: all green (the E2E runs the `app` and `escritorio` projects; about 6 minutes with the build).

- [ ] **Step 2: Grep the new code for the banned patterns.**

Run: `git diff origin/main --name-only -- '*.ts' '*.tsx' | xargs grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|—|text-\[[0-9]|min-h-1[1-6]\b|text-aviso|text-ok\b|catch \{\s*\}"`
Expected: no output.

- [ ] **Step 3: Check what must not change.**

```bash
git diff --stat origin/main -- components/nav-inferior.tsx app/ir-a-biblioteca supabase trigger
git -C /Users/fede/Projects/conidolly-ingesta status --short && git -C /Users/fede/Projects/conidolly-ingesta log -1 --format=%h
```

Expected: the first prints nothing (no change to the bar, the bridge, the database or the tasks); the second prints nothing and then `39f9887` (Ingesta untouched).

- [ ] **Step 4: Measure the main-topic cost (spec risk).** Run the phone list test with a trace and read the time of the `/biblioteca` document request:

```bash
pnpm exec playwright test tests/e2e/biblioteca.spec.ts -g "phone list" --trace on
pnpm exec playwright show-trace test-results/*phone-list*/trace.zip
```

Write the number in the PR description. If the document takes more than 1 s with the seed, open an issue on the board for the `security_invoker` view (later batch), as the spec says; do not add a migration here.

- [ ] **Step 5: Nothing to commit** unless Step 2 or 3 led to a fix (commit it with its task's message style and rerun Step 1).

### Task 34: review

**Files:** none new.

- [ ] **Step 1: Request code review** of `feat/biblioteca-materiales` with superpowers:requesting-code-review, pointing the reviewer at the spec, this plan and these risks: Coni only on every action and page (`exigirConi`, `conSesionDeConi`, `es_coni` inside `lib/acciones/biblioteca.ts`); the per-attempt key (Task 1) used by Reintentar, Reprocesar and "Procesar por ~US$ X"; the download as a 302 to a signed URL that never carries the file through the server, `no-store`, only `texto-original.txt`; `R2_ENDPOINT` refused on Vercel; the main-topic aggregation and its paging; the `(app)` width change (`:has()`), which must leave every other screen at 560 px; the design rules and 4h words.
- [ ] **Step 2: Address findings** test first, one commit per finding, then rerun Task 33 Step 1.

### Task 35: release (merge only)

Standing release authorization (Federico, 01-11-2026, in `CLAUDE.md`): Claude merges to `main` when the change has its issue on the board, tests and CI green and the reviews approved. **No migration, no Trigger.dev deploy, no new env var** in this batch.

- [ ] **Step 1: Check the production variables exist** (names only, never values):

```bash
cd /Users/fede/Projects/estudio-coni && vercel env ls production | grep -E "R2_(ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET)|TRIGGER_SECRET_KEY"
```

Expected: the five names. If one is missing, stop and tell Federico: the download and the runs need them (the spec assumed they exist).

- [ ] **Step 2: Board: #17 is En Curso** (it stays there after this batch: only batch 1 of 7 ships).

```bash
ITEM=$(gh project item-list 1 --owner WAV-WaAreVision --format json --limit 200 | python3 -c "import json,sys; print(next(i['id'] for i in json.load(sys.stdin)['items'] if i.get('content',{}).get('number')==17 and i['content'].get('repository','').endswith('estudio-coni')))")
gh project item-edit --project-id PVT_kwDOEFiqEs4Bps25 --id "$ITEM" --field-id PVTSSF_lADOEFiqEs4Bps25zhoHPq4 --single-select-option-id 47fc9ee4
```

- [ ] **Step 3: PR.** The body says "Part of #17", never "Closes #17": a closing keyword would close the issue that still has six batches.

```bash
cd /Users/fede/Projects/estudio-coni/.worktrees/biblioteca-materiales && git push -u origin feat/biblioteca-materiales
gh pr create --base main --head feat/biblioteca-materiales \
  --title "Biblioteca batch 1: foundations and Materiales (change 29b)" --body "$(cat <<'BODY'
Part of #17 (pedido 29b, batch 1 of 7). Spec: docs/superpowers/specs/2026-11-02-biblioteca-materiales-design.md. Plan: docs/superpowers/plans/2026-11-02-biblioteca-materiales.md.

- /biblioteca (Coni only): quick filters (Todos, Procesando, Listos, Con error) and "Más filtros"; phone cards with main topic and state words; desktop table with a side panel at ?m=<id>; loading, error and not-found pages.
- /biblioteca/materiales/[id]: author and "¿Quién es para ti?", editable card or map of ideas, Reprocesar and Reintentar with confirmation, "Descargar texto original" as a 302 to a signed R2 URL.
- Material runs get a key per attempt (procesar-material:<id>:<uuid>), so a retry within ten minutes starts a new run; motor-manual starter built for batch 5.
- R2: tamano, borrarCarpeta, urlDeTexto; R2_ENDPOINT for the local E2E fake, refused on Vercel.
- The bar's tab is unchanged (still Ingesta); Ingesta is unchanged. No migration, no Trigger deploy, no new env var.
- Main-topic cost with the E2E seed: <ms from Task 33 Step 4>.

Tests: unit, integration against the local Supabase (WAV refused on every action), E2E phone and desktop with axe and large text; visual baselines reviewed by Federico.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
gh pr checks --watch
```

Expected: CI green. After the reviews approve: `gh pr merge --merge` (Vercel publishes `main` on its own).

- [ ] **Step 4: Verify in production.**

```bash
sleep 45
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://conidolly.vercel.app/biblioteca?v=$(date +%s)"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://conidolly.vercel.app/biblioteca/materiales/00000000-0000-4000-8000-000000000000/texto?v=$(date +%s)"
```

Expected: both `307 https://conidolly.vercel.app/ingreso` (no session: the sign-in redirect; a `404` means the deploy does not have the section yet: wait 45 s and retry once). Then ask Federico to open `https://conidolly.vercel.app/biblioteca` signed in with Coni's test account (`federico@wearevision.cl`, TRASPASO) on his phone and on a computer: the list, a detail, the side panel, one text download; and to confirm the bar's "Biblioteca" tab still opens Ingesta. Coni sees nothing new until batch 7.

- [ ] **Step 5: Board and issue.** #17 stays **En Curso** (re-read the item to confirm). Comment on the issue so the board says what shipped:

```bash
gh issue comment 17 --body "Lote 1 de 7 en producción (PR #<n>): /biblioteca con Materiales (filtros rápidos, tarjetas, tabla con panel lateral, detalle, descarga del texto original). Solo por su dirección; la pestaña de la barra sigue abriendo Ingesta hasta el lote 7."
```

- [ ] **Step 6: Update `docs/TRASPASO.md`** on `main` of estudio-coni: in "Lo que está hecho" add one entry, in Spanish of Chile without em dashes:

```markdown
- **Biblioteca en Conidolly, lote 1: cimientos y Materiales** (cambio 29b del pedido de Coni, lote 1 de 7; spec `2026-11-02-biblioteca-materiales-design.md`, plan `2026-11-02-biblioteca-materiales.md`, tablero #17 sigue En Curso, en producción desde el <fecha>): `/biblioteca` solo para Coni y solo por su dirección (la pestaña de la barra sigue abriendo Ingesta hasta el lote 7). Filtros de un toque y «Más filtros», tarjetas en el celular, tabla con panel lateral (`?m=<id>`) en el computador, detalle con autor y «¿Quién es para ti?», ficha o mapa de ideas, «Reprocesar» y «Reintentar» con pregunta, y «Descargar texto original» firmado desde R2. Cada reintento dispara `procesar-material` con su propia llave (`procesar-material:<id>:<uuid>`). El E2E levanta un S3 falso en el puerto 3203 (`R2_ENDPOINT`, que Vercel rechaza) y tiene un proyecto `escritorio` (`tests/e2e/*.escritorio.ts`). Siguiente: lote 2, Subir.
```

```bash
cd /Users/fede/Projects/estudio-coni && git checkout main && git pull --ff-only
git add docs/TRASPASO.md
git commit -m "$(cat <<'EOF'
Record batch 1 of the Biblioteca in the handover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Push only with Federico's OK (a docs-only commit on `main` publishes nothing new but still deploys).

---

## Self-review against the spec

| Spec section | Where |
|---|---|
| Fixed: only Coni (A6), no `(biblioteca)` layout or `conSesionDeMiembro` for WAV | Task 15 (layout gate), Task 12 (`es_coni` in every action, WAV refused), Task 13 (`conSesionDeConi`), Task 29 (maintainer sees "solo para Coni") |
| Fixed: port, do not share; Ingesta not changed | Tasks 4 to 27 port into Conidolly's layers; Task 33 Step 3 checks Ingesta is untouched |
| Fixed: the bar's tab does not change until batch 7 | Rules; Task 28 (href stays `/ir-a-biblioteca`); Task 33 Step 3 |
| 1. Disparos `material(id, intento?)` with per-attempt key, TTL 10 min, `motor(semana)`, test mode records; two attempts two keys | Task 1 (D2), Task 12 (two retries, two keys), Task 29 (E2E keys) |
| 1. Almacén `tamano`, `borrarCarpeta`, signed GET of `texto-original.txt` only, `R2_ENDPOINT` refused on Vercel | Task 2 (D3) |
| 1. E2E fake S3 as a Playwright web server | Task 3 (D14) |
| 1. Pure domain: model and labels, status (icon + word), filters, tags, card rules, 4h words | Tasks 4, 5, 6, 7, 9 |
| 1. `listarMateriales` latest 100 with author, state, type, role, upload date and main topic (+N), paged past 1000, aggregated in TS, no migration | Tasks 8, 10, 11 (D8) |
| 1. `contarPorEstado`, `leerMaterialConFicha`, `leerMapaDelMaterial`, `listarAutores`; pillars only through `lib/datos/pilares.ts` | Task 11 (no pillar is shown in this batch, so nothing reads `categorias`) |
| 1. Actions: author and role, card, reprocess, retry, confirm cost, create author, signed text download; existing RPCs; no delete; `revalidatePath` `/biblioteca/...` | Tasks 12 and 13 (D1) |
| 2. Route group under `(app)`, keeps offline bar and nav, widens on `md:` | Task 15 (D4) |
| 2. Own `loading`, `error`, `not-found` in plain Spanish (4m); gate `exigirConi()` | Task 15; Task 29 (not-found E2E); error tested in unit (D13) |
| 2. Section nav with `Pestanas`, only Materiales, icon + name, fits at 375 px and large text (4c) | Tasks 14, 16, 31 |
| 2. Phone one column; desktop two columns, list/table left, panel right | Task 22; Tasks 28 and 30 |
| 3. Quick filters as `Chip`s with counts, `aria-pressed`, URL; author/role/type in "Más filtros"; no search box | Task 17; Task 28 |
| 3. Phone cards: title, type · author · role, main topic, status pill; confirm-cost and retry on the card; auto-refresh 10 s; opens the detail | Tasks 18, 19, 22; Task 28 |
| 3. Desktop table columns and relative upload day in America/Santiago; row opens panel with `?m`, linkable, Back closes | Tasks 8 (D7), 20, 22; Task 30 |
| 3. Panel: type · date · status, title, "Ideas sacadas" count + first two, "Ver todas", "¿Quién es para ti?", "Detalle para WAV" folded; own heading and close; hint without `?m` | Task 21 (D9, D10); Task 30 |
| 3. Full detail: header with status, card for `estrategia` or map, author and role editor with "Autor nuevo", "Descargar texto original", Reprocesar and Reintentar with confirmation, "← Materiales" on the left (4f), not found page | Tasks 23 to 27 (D11, D12); Task 29 |
| 3. Simple words (4h) in `palabras.ts` with a unit test; roles keep Coni's labels | Task 9 (D18), Task 4 |
| 4. Unit tests listed | Tasks 1, 2, 4 to 10, 12 (schemas), 13 to 27 |
| 4. Integration as Coni; WAV refused on every action | Tasks 11, 12 |
| 4. E2E phone and desktop: filters, table → panel → "Ver todas", detail edits and reprocess/retry with new keys, signed download, not-found (error in unit, D13), axe on list, panel and detail, large text, design rules on every new file | Tasks 28 to 31 |
| 4. Visual baselines committed separately after Federico looks | Task 32 |
| 5. Merge only; `/biblioteca` redirects to sign-in without a session; Federico checks by address; bar unchanged | Task 35 |
| Risks: main-topic cost measured; two UIs over one schema; desktop primitives new; design-rule test | Task 33 Step 4; no migration (Task 33 Step 3); Tasks 20 and 21; rules on every UI task |
| Board #17 stays En Curso; TRASPASO entry | Task 35 Steps 2, 5, 6 |
