# Biblioteca batch 3: Autores and Temas (change 29, stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni opens two new sections of the Biblioteca in Conidolly, Autores (`/biblioteca/autores`) and Temas (`/biblioteca/temas`), each with its detail page: she searches authors, joins two that are the same person, filters topics by coverage and pillar, hides an idea from a topic and shows it again from its author, and every material links to its topic and its author (fixes 4h, 4i, quick filters on Temas).

**Architecture:** Ported from Ingesta's `app/(app)/autores/*`, `app/(app)/temas/*`, `lib/ingesta/autores.ts`, `lib/ingesta/temas.ts` (commit `39f9887`), rewritten to Conidolly's layers as batches 1 and 2 did. Pure rules in `lib/dominio/biblioteca/` (counts without zeros, the authors' summary and order, ideas grouped by topic and by author, the topics' order, the merged-topic chain, the coverage filter and its addresses); readers in `lib/datos/biblioteca.ts` (keyset paging through `leerTodas`); the two actions `unirAutores` and `ocultarIdea` in `lib/acciones/biblioteca.ts` (`es_coni` checked inside), wrapped by the `"use server"` module `app/(app)/biblioteca/acciones.ts` (`conSesionDeConi` + Zod + `revalidatePath("/biblioteca", "layout")`). Screens follow the Materiales rule: cards on the phone, a table plus a sticky side panel opened by `?a=` / `?t=` on a computer. **No migration, no Trigger.dev change, no change to the bar or to Ingesta.**

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, `@supabase/supabase-js` 2.105, Zod 4, Tailwind v4, Phosphor (`@phosphor-icons/react` in client modules, `/dist/ssr` in server ones), Vitest 4 (jsdom unit, node integration against the local Supabase), Playwright 1.59 + `@axe-core/playwright`, Biome 2.2 (safe mode only).

**Spec:** `docs/superpowers/specs/2026-11-04-biblioteca-autores-temas-design.md` (issue WAV-WaAreVision/estudio-coni#17, pedido 29b, batch 3 of 7). Batch plans whose style and helpers this one reuses: `docs/superpowers/plans/2026-11-02-biblioteca-materiales.md`, `docs/superpowers/plans/2026-11-03-biblioteca-subir.md`. Where the spec and the code disagree: `docs/superpowers/plans/2026-11-04-biblioteca-autores-temas-desvios.md` (summarised in "Spec and code disagree" below).

---

## Spec and code disagree (read first)

The database supports everything this batch reads and writes: **no migration is needed** (F1 to F4). These are the places where the spec assumes something the code does not do; each one is handled without a migration, and the full reasoning is in the deviations note.

1. **Hiding the last idea of a topic deletes the topic.** `excluir_afirmacion` detaches the hidden idea (`tema_id = null`) and `recalcular_tema` deletes a topic left with no idea (`20261003000347_recalcular_tema.sql`, `..._351_centroide_promedio.sql`). After hiding the last idea her page would be a 404. The plan sends her to the Temas list with its own quiet note (D6).
2. **"Mostrar" brings an idea back without a topic.** The same RPC leaves `tema_id` null when showing it again, until a maintenance run places it. On the author's page it reappears under "Sin tema todavía", not under its old topic (D6). The spec's note "La puedes volver a mostrar desde su autor" stays true.
3. **Authors' order.** The spec says "Order as Ingesta (most ideas first, then name)", but Ingesta's `resumirAutores` keeps `listarAutores`' alphabetical order. The plan follows the rule the spec spells out: most ideas first, then name (D3).
4. **A phone card is one link.** `TarjetaDeMaterial` wraps its whole text, topic included, in a link to the material; a second link inside it would be a nested anchor. The topic links in the desktop table cell and in the "Temas" rows of the material's detail (the phone's path: card, detail, topic). The card keeps the topic as text (D9).
5. **The topic of a material has no id.** `TemaPrincipal` is `{ nombre, otros }`. Task 22 adds `id` (pure function, reader unchanged, fixtures updated).
6. **The material panel already has the author's id.** `MaterialLeido` carries `autor_id` (the readers' `COLUMNAS`); the author link needs no reader change (Task 23).
7. **Pillars.** Conidolly's `categorias` holds non-pillar rows too (`es_pilar`, migration `20261017000100`); Ingesta filtered only `activa`. The plan reads `es_pilar and activa`, ordered by `orden`, with the id (`leerPilares` has none, as the spec says).
8. **Paging.** Conidolly's `leerTodas` is keyset by `id` (Ingesta's used `range`); rows are ordered by date in memory, and the view `temas_resumen` types its `id` as nullable, so the reader narrows it.
9. **No score yet.** The spec lists "score" inside "Detalle para WAV"; the score arrives with Semana (batch 5). Each idea's detail shows its type, evidence and id.
10. **"Ya lo traté"** is the view's `cubierto_por_coni`: some visible idea of the topic comes from a material whose role is `voz_propia` ("Lo dijo Coni"), not "an idea by the author Coni". The badge follows the view, as the spec says.
11. **Three section tabs at 390 px.** With one tab the nav was `compacta` (hugging). Three tabs with icons fill the phone row and, at large text, cannot fit one row: `Pestanas` in its compact form wraps instead of pushing the page sideways (Task 12).

## Where to work

- Worktree: `/Users/fede/Projects/estudio-coni/.worktrees/biblioteca-autores-temas`, branch `feat/biblioteca-autores-temas` (already holds the spec, on top of batch 2). Below, **`CONIDOLLY`** means that path. Every command runs from it.

  ```bash
  cd /Users/fede/Projects/estudio-coni/.worktrees/biblioteca-autores-temas && pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it (.env* is ignored)
  ```

- Local Supabase of estudio-coni must be running (`cd /Users/fede/Projects/estudio-coni && pnpm db:start`): API `127.0.0.1:54421`, database `54422`, Mailpit `54424`. **Do not run `pnpm db:reset`**: this batch adds no migration, so it never needs one.
- Ingesta is read only: open its files to port them, never edit, commit or push there.
- Read `CONIDOLLY/CLAUDE.md` before Task 1.

## Rules for every task

- **TDD strict:** write the failing test, run it and see it fail for the reason written in the step, write the minimum code, run it green. A task is one commit.
- Commit messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes only, **never `--unsafe`**), then `head -1` every client file the task touched: it must still be `"use client"`.
- No `any`, no `@ts-expect-error`, no non-null `!`, no silent `catch`. No hex colour outside `app/globals.css`. Icons are Phosphor, sized through `ICONO` (`components/ui/icono.ts`). No `text-[...]` sizes, no `min-h-11..16`, `text-error` only through `LineaDeError` (all enforced by `tests/unit/diseno-reglas.test.ts`, which walks every file of `app/` and `components/`, so it covers the new files with no change).
- Copy for Coni in Spanish of Chile, tú, no em dashes, quotes as «». "Ideas sacadas", never "afirmaciones"; "¿Quién es para ti?" for the role; type of idea and evidence only inside "Detalle para WAV" (`tests/unit/biblioteca-palabras.test.ts` scans every file of `app/(app)/biblioteca/`, so it covers the new folders with no change; the words "Tipo de idea:" and "Evidencia:" live in `lib/dominio/biblioteca/detalle.ts`, outside the scanned folder, as batch 1 did).
- Code identifiers in Spanish like the codebase; comments in English, sparse, only for "why".
- **Coni only:** every page calls `exigirConi()`; both actions go through `conSesionDeConi` and check `es_coni` again inside `lib/acciones/biblioteca.ts` (the RPCs also let WAV in, F3).
- **Not touched:** `components/nav-inferior.tsx` (the bar's tab keeps opening Ingesta until batch 7), `app/ir-a-biblioteca/`, `supabase/`, `trigger/`, Ingesta.
- Run `pnpm test:run` (all unit tests, not only the new file) before each commit from Task 11 on.
- From Task 12 on, three visual baselines of batches 1 and 2 differ (F11); until Task 29 retakes them, run the E2E by file, never the whole `pnpm test:e2e`.

## Facts fixed before planning

Each was checked in the code on 2026-11-04 (CONIDOLLY at `00ddcf4`, Ingesta at `39f9887`).

- **F1. Reading needs nothing new.** `autores`, `temas`, `afirmaciones` and `categorias` are readable by Coni and WAV (`"coni y wav leen ..."` policies in `20261003000300_autores.sql:19`, `..._310_afirmaciones_temas.sql:50-53`, `..._100_ingesta.sql:80`). `temas_resumen` (`..._310:77`) is `security_invoker`, excludes merged topics (`fusionado_en is null`) and gives `id, nombre, descripcion, categoria_id, alias, afirmaciones, autores, evidencia, cubierto_por_coni, ultima_afirmacion` counting only visible ideas; every column is typed nullable in `lib/supabase/database.types.ts:1853`.
- **F2. `fusionar_autores(p_origen uuid, p_destino uuid)`**, final form in `20261003000346_proteger_autor_coni.sql`: definer; `42501 sin_permiso` unless `es_coni() or es_mantenedor()`; `22023 autor_coni_protegido` when the origin is Coni's own row (`tipo = 'coni'`); `22023 autores_iguales`; `P0002 autor_inexistente` for a missing origin or destination; moves the materials and ideas to the destination, appends the origin's name and aliases to the destination's aliases, deletes the origin. Executable by `authenticated`.
- **F3. `excluir_afirmacion(p_id uuid, p_excluida boolean)`**, final form in `20261003000347_recalcular_tema.sql:41`: definer; `42501` unless Coni or WAV; `P0002 afirmacion_inexistente`; hiding sets `excluida = true, tema_id = null` and calls `recalcular_tema(old)`, which deletes the topic (and the topics merged into it) when no idea points at it any more; showing sets `excluida = false` and leaves `tema_id` as it is (null). WAV is refused only by `es_coni` inside the action, as batch 1 did.
- **F4. Topics merge by `temas.fusionado_en`** (`..._310:35`), `on delete set null`; Coni's own author row is the one with `tipo = 'coni'` (`Constanza del Rosario`, `..._300:12`); a material's `autor_id` is not null; an idea's `autor_id` is not null and `tema_id` nullable.
- **F5. Pillars are `categorias` rows with `es_pilar` and `activa`** (`20261017000100_pilares_como_datos.sql`); the first active one by `orden` is `ia-salud-mental` "IA y salud mental". `leerPilares` (`lib/datos/pilares.ts`) returns slugs, not ids.
- **F6. Pieces to reuse:** `exigirConi()` (`lib/sesion/coni.ts`), `leerTodas` (`lib/datos/paginas.ts`, keyset on `id`, pages of 1000), `listarAutores(db)` (alphabetical, with aliases), `buscarAutores` and `normalizar` (`lib/dominio/biblioteca/autores.ts`), `ideasSacadas` and `PALABRAS` (`palabras.ts`), `TIPO_DE_AFIRMACION` and `EVIDENCIA` (`etiquetas.ts`), `ETIQUETA_DE_TIPO_DE_AUTOR` and `esTipoDeAutorNuevo` (`modelo.ts`), `RUTA_DE_SUBIR` (`borrador-de-subida.ts`), `FocoDelPanel` (works for any id: rows carry `data-abre-panel`, the panel heading is `#panel-titulo` with `tabIndex -1`, the close link carries `data-cierra-panel`), `FORMA_DE_CHIP` + `TRANSICION_DE_CHIP`, `MasOpciones`, `Campo` + `CLASES_DE_CAMPO`, `Boton`, `clasesDeBoton`, `ConfirmacionEnLinea` (`trato="destructivo"` with `error`), `LineaDeError`, `LineaDeEstado tipo="neutro"`, `Volver`, `Panel`, `Seccion`, `DetalleParaWav`, `useAccion`, `useRedibujar` (in jsdom it calls `router.replace("/?v=N", { scroll: false })`).
- **F7. The server wrappers' pattern:** `refrescar(await conSesionDeConi(nombre, Esquema, entrada, (db, d) => accion({ db }, d)))` in `app/(app)/biblioteca/acciones.ts`; `conSesionDeConi` answers `ERROR_SOLICITUD` for a bad entry, `ERROR_SESION_VENCIDA`, `ERROR_SOLO_CONI`; inside, `aResultado` turns a `Falla` into Coni's message and anything else into `ERROR_GENERICO` (logged).
- **F8. The phone card is one link** (`tarjeta-de-material.tsx`), the desktop table's topic cell is not (`tabla-de-materiales.tsx`), the panel prints the author as text (`panel-de-material.tsx`), and the material detail lists its topics in `MapaDelMaterial`'s "Temas" rows with their ids (`mapa.temas[].id`).
- **F9. `TemaPrincipal` has no id;** fixtures that build one: `tests/unit/biblioteca-temas-y-fechas.test.ts`, `biblioteca-piezas.test.tsx:46`, `biblioteca-tabla.test.tsx:19`, `biblioteca-tarjeta.test.tsx:26`, `tests/integration/datos-biblioteca.test.ts:73,80`.
- **F10. Test styles to mirror:** client components in `tests/unit` with the actions module mocked (`biblioteca-editar-autor-y-rol.test.tsx`, `biblioteca-botones.test.tsx`); pages in node by walking their element tree (`biblioteca-pagina-materiales.test.tsx`); server wrappers with `conSesionDeConi` mocked (`biblioteca-acciones-servidor.test.ts`); readers and actions against the local database with `clienteDeConi()` / `clienteDelMantenedor()`, `pool` and `tests/integration/siembra-biblioteca.ts`; E2E with `sembrarBiblioteca()` (`tests/e2e/biblioteca-escena.ts`; the run owns the Biblioteca and empties `materiales`), `tocarHastaLlegar`, `revisarConAxe`, `conLetraGrande`, `entrarComo`, `bloquearRedExterna` (`tests/e2e/ayudas.ts`). MSW blocks every unhandled request in unit tests. Playwright runs one worker; the phone project `app` is 390 x 844, `escritorio` 1280 x 900 and matches `*.escritorio.ts`.
- **F11. Baselines that move:** `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png` (the nav gains two tabs), `biblioteca-detalle-app-darwin.png` (topic rows become links), `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png` (nav, topic cell link, author link). Subir has no nav: its two baselines do not move.
- **F12. Commands:** unit `pnpm exec vitest run <file>`, all unit `pnpm test:run`, integration `pnpm test:db <file>`, E2E phone `pnpm exec playwright test <file>`, desktop `pnpm exec playwright test --project escritorio <file>`, gate `pnpm lint`, `pnpm type`, `pnpm build`, `pnpm test:run`, `pnpm test:db`, `pnpm test:e2e`.

## Decisions taken while planning (not in the spec)

- **D1. Two layers, as batches 1 and 2.** Plain actions in `lib/acciones/biblioteca.ts` (`Pick<DepsBiblioteca, "db">`, `es_coni` inside, callable as WAV from the integration tests); `"use server"` wrappers in `app/(app)/biblioteca/acciones.ts` with the Zod schemas `UnionDeAutores` and `CambioDeIdea`.
- **D2. Pure first.** The summary, the grouping, the orders, the coverage filter and the merged chain are pure functions in `lib/dominio/biblioteca/` (unit tested); the readers only fetch rows and call them. `seguirFusiones(id, leer)` takes the row reader as a function, so the chain and the loop are unit tested and `destinoDeTema(db, id)` is three lines.
- **D3. Orders.** Authors: most visible ideas first, then name (`es` collation). Topics: most authors, then most ideas, then name. Ideas: oldest first, then id. An author's topic groups: most ideas first, then name, "Sin tema todavía" last. A topic's author groups: most ideas first, then name. An author's three top topics: most ideas, then name.
- **D4. Desktop selection in the address:** `?a=<id>` on Autores and `?t=<id>` on Temas, as `?m=` on Materiales (`leerSeleccion(params, clave)`); the panel is built from the list already read, no extra query. The topic's filters are `?pilar=<uuid>&cobertura=<valor>&t=<id>` in that order (`hrefDeTemas`).
- **D5. The search filters on the client.** `ListaDeAutores` is a client component holding the text; it filters both the phone cards and the desktop table with `buscarAutores` (made generic so it keeps `AutorResumido`). The same search, with up to six results, picks the author to join with.
- **D6. After Ocultar the page goes to an address of its own** with `?oculta=<idea id>` (unique per idea, so it never races the cached screen): the topic's own page while it keeps ideas, the Temas list when that was its last one (F3). Each page says its quiet note (`LineaDeEstado tipo="neutro"`): "La oculté. La puedes volver a mostrar desde su autor." or "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor.". "Mostrar" on the author's page redraws in place (`useRedibujar`); the idea comes back under "Sin tema todavía". Filter links drop `oculta`.
- **D7. Join.** "Unir con otro autor" opens a search ("Buscar por nombre", six results named `<nombre>, <credencial>`); choosing one shows a destructive in-line confirmation naming both: "Uno a «origen» con «destino»: sus materiales y sus ideas sacadas pasan a «destino», y «origen» sale de la lista. No se puede deshacer." (written with the names, no quotes), "Sí, unir" and "Elegir otro". It is never drawn on Coni's own page (`sePuedeUnir`); Coni may be the one that stays. The action refuses Coni as origin before the RPC ("Tu propia ficha no se puede unir a otro autor."), the same author twice ("Elige otro autor para unirlos.") and a missing author ("Ese autor ya no existe.", also mapped from the RPC's `P0002`).
- **D8. Each idea** is a card on `piedra-alta`: its text in «», its action (Ocultar or Mostrar) when there is one, and its own folded "Detalle para WAV" with `Tipo de idea: <etiqueta>`, `Evidencia: <etiqueta>`, `Idea: <id>`. The button points at the idea's text with `aria-describedby`, so many "Ocultar" read apart. Quote, location and audience of an idea are not shown (the spec does not ask; YAGNI).
- **D9. Links from a material:** the table's topic cell (`TemaDelMaterial` with `href`), the detail's "Temas" rows (`MapaDelMaterial`), and the side panel's author name. The phone card stays as it is (deviation 4).
- **D10. Words:** the section h1 stays "Biblioteca" (as Materiales), the nav says Materiales, Autores, Temas; the quick filters' group is "Filtrar temas"; the pillar select is "Pilar"; "Quitar este filtro"; an author's kind reads "Coni", "Persona", "Cuenta de redes" or "Institución"; the empty Temas list says "Los temas aparecen solos cuando varias ideas sacadas hablan de lo mismo. Sube más material de distintos autores."; a filtered empty list "Ningún tema coincide con esos filtros."; the side panel hints "Elige un autor de la tabla para ver aquí sus temas y sus ideas sacadas." and "Elige un tema de la tabla para ver aquí cuántas ideas sacadas tiene y de quiénes."
- **D11. E2E:** one new scene `sembrarAutoresYTemas()` on top of `sembrarBiblioteca()` (batch 1's files keep their five materials); three phone files (`biblioteca-autores.spec.ts`, `biblioteca-temas.spec.ts`, `biblioteca-enlaces.spec.ts`) and one desktop file (`biblioteca-autores-temas.escritorio.ts`).

## File structure

New (all paths from `CONIDOLLY`):

| File | Responsibility |
|---|---|
| `lib/dominio/biblioteca/cuentas.ts` | `conCuenta`, `cuentasDeAutor`, `cuentasDeTema` (4i) |
| `lib/dominio/biblioteca/ideas.ts` | `IdeaLeida`, `agruparPorTema`, `agruparPorAutor` |
| `lib/dominio/biblioteca/filtros-de-temas.ts` | coverage values, `leerFiltrosDeTemas`, `filtrarPorCobertura`, `contarCoberturas`, `hrefDeTemas`, `hrefDeTema`, the notes after hiding, `hrefTrasOcultar`, `leerIdeaOculta` |
| `app/(app)/biblioteca/lista-de-ideas.tsx` | ideas in her words, each with its folded detail for WAV |
| `app/(app)/biblioteca/boton-ocultar.tsx` | Ocultar and Mostrar |
| `app/(app)/biblioteca/autores/sin-material.tsx` | "Todavía no hay material de esta persona. Súbelo desde Subir." |
| `app/(app)/biblioteca/autores/tarjeta-de-autor.tsx` | an author on the phone |
| `app/(app)/biblioteca/autores/tabla-de-autores.tsx` | the authors on a computer |
| `app/(app)/biblioteca/autores/lista-de-autores.tsx` | the search, the cards and the table |
| `app/(app)/biblioteca/autores/panel-de-autor.tsx` | the desktop side panel of an author |
| `app/(app)/biblioteca/autores/page.tsx` | Autores |
| `app/(app)/biblioteca/autores/[id]/unir-autores.tsx` | "Unir con otro autor" |
| `app/(app)/biblioteca/autores/[id]/page.tsx` | an author |
| `app/(app)/biblioteca/temas/insignias.tsx` | "Ya lo traté", "Un solo autor" |
| `app/(app)/biblioteca/temas/tarjeta-de-tema.tsx` | a topic on the phone |
| `app/(app)/biblioteca/temas/tabla-de-temas.tsx` | the topics on a computer |
| `app/(app)/biblioteca/temas/panel-de-tema.tsx` | the desktop side panel of a topic |
| `app/(app)/biblioteca/temas/filtros-de-cobertura.tsx` | the four quick filters |
| `app/(app)/biblioteca/temas/mas-filtros-de-temas.tsx` | the pillar |
| `app/(app)/biblioteca/temas/page.tsx` | Temas |
| `app/(app)/biblioteca/temas/[id]/page.tsx` | a topic |
| `tests/unit/biblioteca-cuentas.test.ts`, `biblioteca-resumen-de-autores.test.ts`, `biblioteca-ideas.test.ts`, `biblioteca-orden-de-temas.test.ts`, `biblioteca-filtros-de-temas.test.ts`, `biblioteca-ideas-para-wav.test.ts`, `biblioteca-ideas-y-ocultar.test.tsx`, `biblioteca-lista-de-autores.test.tsx`, `biblioteca-panel-de-autor.test.tsx`, `biblioteca-unir-autores.test.tsx`, `biblioteca-pagina-autores.test.tsx`, `biblioteca-temas-piezas.test.tsx`, `biblioteca-filtros-de-temas-pantalla.test.tsx`, `biblioteca-pagina-temas.test.tsx` | unit tests |
| `tests/integration/datos-autores-temas.test.ts`, `tests/integration/acciones-autores-temas.test.ts` | readers and actions against the local database |
| `tests/e2e/biblioteca-autores.spec.ts`, `biblioteca-temas.spec.ts`, `biblioteca-enlaces.spec.ts`, `biblioteca-autores-temas.escritorio.ts` | phone and desktop E2E |

Modified: `lib/dominio/biblioteca/autores.ts` (Task 2), `modelo.ts` (Task 1), `temas.ts` (Tasks 4, 22), `filtros.ts` (Task 5), `detalle.ts` (Task 6), `lib/datos/biblioteca.ts` (Tasks 7, 8), `lib/acciones/biblioteca.ts` (Tasks 9, 10), `app/(app)/biblioteca/acciones.ts` (Task 11), `filtros-rapidos.tsx` (Task 1), `nav-de-biblioteca.tsx` and `components/ui/pestanas.tsx` (Task 12), `formulario-de-filtros.tsx` (Task 19), `tema-del-material.tsx`, `tabla-de-materiales.tsx`, `materiales/[id]/mapa-del-material.tsx` (Task 22), `panel-de-material.tsx` (Task 23), the unit tests named in F9 (Task 22), `tests/unit/biblioteca-acciones-servidor.test.ts` (Task 11), `biblioteca-piezas.test.tsx` and `pestanas.test.tsx` (Task 12), `biblioteca-tabla.test.tsx`, `biblioteca-mapa-y-reprocesar.test.tsx` (Task 22), `biblioteca-panel.test.tsx` (Task 23), `tests/integration/datos-biblioteca.test.ts` (Task 22), `tests/e2e/biblioteca-escena.ts` (Task 24), `tests/e2e/visual.spec.ts` and snapshots (Task 29).

Not touched: `components/nav-inferior.tsx`, `app/ir-a-biblioteca/`, `supabase/`, `trigger/`, `tarjeta-de-material.tsx`, `playwright.config.ts`, Ingesta.

## Suggested implementer batches

| Batch | Tasks | Theme |
|---|---|---|
| A | 1 to 6 | pure domain |
| B | 7 to 11 | readers, actions and server wrappers |
| C | 12 to 17 | nav, shared idea pieces, Autores |
| D | 18 to 21 | Temas |
| E | 22, 23 | links from a material |
| F | 24 to 28 | E2E phone and desktop, axe, large text |
| Release | 29, 30 | baselines after Federico looks, full gate |

---

# Part A: pure domain

### Task 1: counts without zeros, and an author's kind in words (4i)

**Files:**
- Create: `lib/dominio/biblioteca/cuentas.ts`
- Modify: `lib/dominio/biblioteca/modelo.ts`, `app/(app)/biblioteca/filtros-rapidos.tsx`
- Test: `tests/unit/biblioteca-cuentas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-cuentas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { conCuenta, cuentasDeAutor, cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import { etiquetaDeTipoDeAutor } from "@/lib/dominio/biblioteca/modelo"

describe("counts without zeros (4i)", () => {
  it("adds a count to a quick filter only when there is something to count", () => {
    expect(conCuenta("Sin tratar", 2)).toBe("Sin tratar · 2")
    expect(conCuenta("Sin tratar", 0)).toBe("Sin tratar")
  })

  it.each([
    [{ materiales: 3, ideas: 12 }, "3 materiales · 12 ideas sacadas"],
    [{ materiales: 1, ideas: 1 }, "1 material · 1 idea sacada"],
    [{ materiales: 1, ideas: 0 }, "1 material"],
    [{ materiales: 0, ideas: 0 }, null],
  ])("says what an author gave: %j is %s", (cuentas, texto) => {
    expect(cuentasDeAutor(cuentas)).toBe(texto)
  })

  it.each([
    [{ ideas: 12, autores: 3 }, "12 ideas sacadas · 3 autores"],
    [{ ideas: 1, autores: 1 }, "1 idea sacada · 1 autor"],
    [{ ideas: 0, autores: 0 }, null],
  ])("says what a topic holds: %j is %s", (cuentas, texto) => {
    expect(cuentasDeTema(cuentas)).toBe(texto)
  })
})

describe("etiquetaDeTipoDeAutor", () => {
  it.each([
    ["coni", "Coni"],
    ["persona", "Persona"],
    ["cuenta", "Cuenta de redes"],
    ["institucion", "Institución"],
    ["otra", "otra"],
  ])("says %s as «%s»", (tipo, etiqueta) => {
    expect(etiquetaDeTipoDeAutor(tipo)).toBe(etiqueta)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-cuentas.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/biblioteca/cuentas"`.

- [ ] **Step 3: Write the module.** Create `lib/dominio/biblioteca/cuentas.ts`:

```ts
import { ideasSacadas } from "./palabras"

/** A count only when there is something to count (4i): "Procesando · 2", or just "Procesando". */
export const conCuenta = (texto: string, cantidad: number) => (cantidad > 0 ? `${texto} · ${cantidad}` : texto)

const plural = (cantidad: number, uno: string, varios: string) => `${cantidad} ${cantidad === 1 ? uno : varios}`

/** The parts that are not zero, joined; null when every count is zero, so the screen says why instead. */
function sinCeros(partes: readonly (string | null)[]): string | null {
  const quedan = partes.filter((parte): parte is string => parte !== null)
  return quedan.length === 0 ? null : quedan.join(" · ")
}

/** "3 materiales · 12 ideas sacadas", "1 material", or null. */
export function cuentasDeAutor({ materiales, ideas }: { materiales: number; ideas: number }): string | null {
  return sinCeros([
    materiales > 0 ? plural(materiales, "material", "materiales") : null,
    ideas > 0 ? ideasSacadas(ideas) : null,
  ])
}

/** "12 ideas sacadas · 3 autores", or null. */
export function cuentasDeTema({ ideas, autores }: { ideas: number; autores: number }): string | null {
  return sinCeros([ideas > 0 ? ideasSacadas(ideas) : null, autores > 0 ? plural(autores, "autor", "autores") : null])
}
```

Append to `lib/dominio/biblioteca/modelo.ts`:

```ts
/** Coni's own card says "Coni"; every other kind uses the words of "Autor nuevo". */
export function etiquetaDeTipoDeAutor(tipo: string): string {
  if (tipo === "coni") return "Coni"
  return esTipoDeAutorNuevo(tipo) ? ETIQUETA_DE_TIPO_DE_AUTOR[tipo] : tipo
}
```

In `app/(app)/biblioteca/filtros-rapidos.tsx`, delete the local `conCuenta` (its comment and the `const` line) and add the import `import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"`.

- [ ] **Step 4: Run it green, and the filters' own tests.**

Run: `pnpm exec vitest run tests/unit/biblioteca-cuentas.test.ts tests/unit/biblioteca-filtros-pantalla.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/cuentas.ts lib/dominio/biblioteca/modelo.ts "app/(app)/biblioteca/filtros-rapidos.tsx" tests/unit/biblioteca-cuentas.test.ts
git add lib/dominio/biblioteca/cuentas.ts lib/dominio/biblioteca/modelo.ts "app/(app)/biblioteca/filtros-rapidos.tsx" tests/unit/biblioteca-cuentas.test.ts
git commit -m "$(cat <<'EOF'
Add the Biblioteca's counts without zeros and an author's kind in words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: the authors' summary, order and search

**Files:**
- Modify: `lib/dominio/biblioteca/autores.ts`
- Test: `tests/unit/biblioteca-resumen-de-autores.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-resumen-de-autores.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  type AutorDeLista,
  armarResumenDeAutores,
  buscarAutores,
  descripcionDeAutor,
  hrefDeAutor,
  hrefDeAutores,
  sePuedeUnir,
} from "@/lib/dominio/biblioteca/autores"

const autor = (id: string, nombre: string, extra: Partial<AutorDeLista> = {}): AutorDeLista => ({
  id,
  nombre,
  credencial: null,
  tipo: "persona",
  alias: [],
  ...extra,
})
const AUTORES = [autor("a", "Ana"), autor("b", "Bruno"), autor("c", "Carla"), autor("d", "Dante")]
const idea = (autorId: string, temaId: string | null, tema = temaId ? `Tema ${temaId}` : "") => ({ autorId, temaId, tema })

describe("armarResumenDeAutores", () => {
  it("counts each author's materials and visible ideas", () => {
    const [primero] = armarResumenDeAutores(AUTORES, [{ autorId: "b" }, { autorId: "b" }], [idea("b", "t1")])
    expect(primero).toMatchObject({ id: "b", materiales: 2, ideas: 1 })
  })

  it("orders by most ideas first, then by name in Spanish order", () => {
    const resumen = armarResumenDeAutores(
      [autor("1", "Zoe"), autor("2", "Álvaro"), autor("3", "Bea")],
      [],
      [idea("1", null), idea("1", null), idea("3", null), idea("2", null)],
    )
    expect(resumen.map((a) => a.nombre)).toEqual(["Zoe", "Álvaro", "Bea"])
  })

  it("keeps an author with nothing, with zero counts and no topics", () => {
    const resumen = armarResumenDeAutores(AUTORES, [], [])
    expect(resumen.find((a) => a.id === "d")).toEqual({ ...AUTORES[3], materiales: 0, ideas: 0, temas: [] })
  })

  it("gives the three topics with most ideas, ties by name, leaving out ideas without a topic or a name", () => {
    const [ana] = armarResumenDeAutores(
      [AUTORES[0] ?? autor("a", "Ana")],
      [],
      [
        idea("a", "t1", "Sueño"),
        idea("a", "t2", "Ánimo"),
        idea("a", "t3", "Carga mental"),
        idea("a", "t3", "Carga mental"),
        idea("a", "t4", "Pausas"),
        idea("a", null),
        idea("a", "t5", "  "),
      ],
    )
    expect(ana?.ideas).toBe(7)
    expect(ana?.temas).toEqual([
      { id: "t3", nombre: "Carga mental", ideas: 2 },
      { id: "t2", nombre: "Ánimo", ideas: 1 },
      { id: "t4", nombre: "Pausas", ideas: 1 },
    ])
  })
})

describe("buscarAutores on the summary", () => {
  it("keeps the summary's fields, matching name or alias without accents or case", () => {
    const resumen = armarResumenDeAutores([autor("1", "Daniela Ruiz", { alias: ["D. Ruiz"] }), autor("2", "Ana")], [], [])
    const encontrados = buscarAutores(resumen, "RUÍZ")
    expect(encontrados.map((a) => a.id)).toEqual(["1"])
    expect(encontrados[0]?.materiales).toBe(0)
    expect(buscarAutores(resumen, "d. ruiz").map((a) => a.id)).toEqual(["1"])
    expect(buscarAutores(resumen, "zzz")).toEqual([])
  })
})

describe("an author's words and addresses", () => {
  it("says the kind and the credential", () => {
    expect(descripcionDeAutor(autor("1", "Daniela", { credencial: "investigadora" }))).toBe("Persona · investigadora")
    expect(descripcionDeAutor(autor("2", "Coni", { tipo: "coni" }))).toBe("Coni")
  })

  it("links the detail and the side panel", () => {
    expect(hrefDeAutor("a-1")).toBe("/biblioteca/autores/a-1")
    expect(hrefDeAutores("a-1")).toBe("/biblioteca/autores?a=a-1")
    expect(hrefDeAutores()).toBe("/biblioteca/autores")
  })

  it("never offers Coni's own card as the one that disappears", () => {
    expect(sePuedeUnir({ tipo: "coni" })).toBe(false)
    expect(sePuedeUnir({ tipo: "persona" })).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-resumen-de-autores.test.ts`
Expected: FAIL, `armarResumenDeAutores is not a function` (and the other new names undefined).

- [ ] **Step 3: Write the code.** In `lib/dominio/biblioteca/autores.ts`, replace `buscarAutores` with the generic form (same body) and append the rest:

```ts
/** The authors whose name or alias contains what was typed; with nothing typed, all of them in the order given. */
export function buscarAutores<T extends AutorDeLista>(autores: T[], texto: string): T[] {
  const buscado = normalizar(texto)
  if (buscado === "") return autores
  return autores.filter((autor) => nombresDe(autor).some((nombre) => nombre.includes(buscado)))
}
```

Add the import at the top: `import { etiquetaDeTipoDeAutor } from "./modelo"`. Append:

```ts
export const RUTA_DE_AUTORES = "/biblioteca/autores"
export const hrefDeAutor = (id: string) => `${RUTA_DE_AUTORES}/${id}`

/** Autores with the desktop side panel open on `seleccion` (`?a=<id>`, D4). */
export function hrefDeAutores(seleccion: string | null = null): string {
  return seleccion ? `${RUTA_DE_AUTORES}?a=${seleccion}` : RUTA_DE_AUTORES
}

/** "Persona · investigadora de confianza", or just the kind. */
export function descripcionDeAutor(autor: Pick<AutorDeLista, "tipo" | "credencial">): string {
  return [etiquetaDeTipoDeAutor(autor.tipo), autor.credencial].filter(Boolean).join(" · ")
}

/** Joining makes the author of the page disappear: never Coni's own card. */
export const sePuedeUnir = (autor: Pick<AutorDeLista, "tipo">) => autor.tipo !== "coni"

export const TEMAS_POR_AUTOR = 3

export interface TemaContado {
  id: string
  nombre: string
  ideas: number
}

export interface AutorResumido extends AutorDeLista {
  materiales: number
  /** Visible ideas only: the hidden ones are the author's page's business. */
  ideas: number
  temas: TemaContado[]
}

export interface IdeaDeAutor {
  autorId: string
  temaId: string | null
  tema: string
}

const masIdeasPrimero = (a: { ideas: number; nombre: string }, b: { ideas: number; nombre: string }) =>
  b.ideas - a.ideas || a.nombre.localeCompare(b.nombre, "es")

/**
 * Ported from Ingesta's `resumirAutores` (D2): how much each author gave and the topics it speaks of most. The order is
 * the spec's (D3): most ideas first, then name.
 */
export function armarResumenDeAutores(
  autores: readonly AutorDeLista[],
  materiales: readonly { autorId: string }[],
  ideas: readonly IdeaDeAutor[],
): AutorResumido[] {
  const materialesPorAutor = new Map<string, number>()
  for (const { autorId } of materiales) materialesPorAutor.set(autorId, (materialesPorAutor.get(autorId) ?? 0) + 1)
  const porAutor = new Map<string, { total: number; temas: Map<string, TemaContado> }>()
  for (const idea of ideas) {
    const delAutor = porAutor.get(idea.autorId) ?? { total: 0, temas: new Map<string, TemaContado>() }
    delAutor.total += 1
    // A topic row the reader could not join has a blank name: it would show as an empty chip.
    if (idea.temaId !== null && idea.tema.trim() !== "") {
      const tema = delAutor.temas.get(idea.temaId) ?? { id: idea.temaId, nombre: idea.tema, ideas: 0 }
      tema.ideas += 1
      delAutor.temas.set(idea.temaId, tema)
    }
    porAutor.set(idea.autorId, delAutor)
  }
  return autores
    .map((autor) => ({
      ...autor,
      materiales: materialesPorAutor.get(autor.id) ?? 0,
      ideas: porAutor.get(autor.id)?.total ?? 0,
      temas: [...(porAutor.get(autor.id)?.temas.values() ?? [])].sort(masIdeasPrimero).slice(0, TEMAS_POR_AUTOR),
    }))
    .sort(masIdeasPrimero)
}
```

- [ ] **Step 4: Run it green, with the existing author tests.**

Run: `pnpm exec vitest run tests/unit/biblioteca-resumen-de-autores.test.ts tests/unit/biblioteca-autores-y-mapa.test.ts tests/unit/biblioteca-selector-de-autor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/autores.ts tests/unit/biblioteca-resumen-de-autores.test.ts
git add lib/dominio/biblioteca/autores.ts tests/unit/biblioteca-resumen-de-autores.test.ts
git commit -m "$(cat <<'EOF'
Summarise and order the authors, and keep the summary through the search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: ideas grouped by topic and by author

**Files:**
- Create: `lib/dominio/biblioteca/ideas.ts`
- Test: `tests/unit/biblioteca-ideas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-ideas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  agruparPorAutor,
  agruparPorTema,
  type FilaDeIdeaDeAutor,
  type FilaDeIdeaDeTema,
} from "@/lib/dominio/biblioteca/ideas"

const deAutor = (
  id: string,
  temaId: string | null,
  tema: string,
  creadaEn: string,
  excluida = false,
): FilaDeIdeaDeAutor => ({ id, texto: `Idea ${id}`, tipo: "dato", evidencia: "estudio", excluida, temaId, tema, creadaEn })

const deTema = (id: string, autorId: string, autor: string, creadaEn: string): FilaDeIdeaDeTema => ({
  id,
  texto: `Idea ${id}`,
  tipo: "dato",
  evidencia: "estudio",
  autorId,
  autor,
  credencial: autorId === "a1" ? "investigadora" : null,
  creadaEn,
})

describe("agruparPorTema", () => {
  it("groups by topic, most ideas first, ties by name, and the ideas without topic last", () => {
    const { grupos } = agruparPorTema([
      deAutor("1", null, "", "2026-11-01T10:00:00Z"),
      deAutor("2", "t-s", "Sueño", "2026-11-01T10:00:01Z"),
      deAutor("3", "t-c", "Carga mental", "2026-11-01T10:00:02Z"),
      deAutor("4", "t-c", "Carga mental", "2026-11-01T10:00:03Z"),
      deAutor("5", "t-a", "Ánimo", "2026-11-01T10:00:04Z"),
    ])
    expect(grupos.map((grupo) => grupo.tema?.nombre ?? null)).toEqual(["Carga mental", "Ánimo", "Sueño", null])
    expect(grupos[0]?.tema).toEqual({ id: "t-c", nombre: "Carga mental" })
  })

  it("keeps each group oldest first, then by id, whatever order the rows came in", () => {
    const { grupos } = agruparPorTema([
      deAutor("b", "t", "Sueño", "2026-11-01T10:00:00Z"),
      deAutor("c", "t", "Sueño", "2026-10-01T10:00:00Z"),
      deAutor("a", "t", "Sueño", "2026-11-01T10:00:00Z"),
    ])
    expect(grupos[0]?.ideas.map((idea) => idea.id)).toEqual(["c", "a", "b"])
  })

  it("puts the hidden ideas apart, and reads a topic without a name as no topic", () => {
    const { grupos, ocultas } = agruparPorTema([
      deAutor("1", "t", "Sueño", "2026-11-01T10:00:00Z"),
      deAutor("2", null, "", "2026-11-01T10:00:01Z", true),
      deAutor("3", "t-vacio", " ", "2026-11-01T10:00:02Z"),
    ])
    expect(ocultas).toEqual([{ id: "2", texto: "Idea 2", tipo: "dato", evidencia: "estudio" }])
    expect(grupos.map((grupo) => grupo.tema?.id ?? null)).toEqual(["t", null])
  })
})

describe("agruparPorAutor", () => {
  it("groups by author, most ideas first, ties by name, with the credential", () => {
    const grupos = agruparPorAutor([
      deTema("1", "a2", "Bruno", "2026-11-01T10:00:00Z"),
      deTema("2", "a1", "Ana", "2026-11-01T10:00:01Z"),
      deTema("3", "a3", "Ángela", "2026-11-01T10:00:02Z"),
      deTema("4", "a2", "Bruno", "2026-10-01T10:00:00Z"),
    ])
    expect(grupos.map((grupo) => grupo.autor.nombre)).toEqual(["Bruno", "Ana", "Ángela"])
    expect(grupos[0]?.ideas.map((idea) => idea.id)).toEqual(["4", "1"])
    expect(grupos[1]?.autor).toEqual({ id: "a1", nombre: "Ana", credencial: "investigadora" })
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-ideas.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/biblioteca/ideas"`.

- [ ] **Step 3: Write the module.** Create `lib/dominio/biblioteca/ideas.ts`:

```ts
// Ported from the grouping inside Ingesta's `leerAutor` and `leerTema` (lib/ingesta/autores.ts, temas.ts), pure (D2).

/** What the detail pages show of an idea: her words, and what goes to "Detalle para WAV". */
export interface IdeaLeida {
  id: string
  texto: string
  tipo: string
  evidencia: string
}

interface ConFecha {
  id: string
  creadaEn: string
}

/** Oldest first, then by id. The readers page by id (keyset), so the reading order is set here. */
function enOrden<T extends ConFecha>(filas: readonly T[]): T[] {
  return filas.toSorted((a, b) => a.creadaEn.localeCompare(b.creadaEn) || a.id.localeCompare(b.id))
}

const comoIdea = ({ id, texto, tipo, evidencia }: IdeaLeida): IdeaLeida => ({ id, texto, tipo, evidencia })

export interface FilaDeIdeaDeAutor extends IdeaLeida, ConFecha {
  excluida: boolean
  temaId: string | null
  /** The topic's name; blank when the topic could not be joined. */
  tema: string
}

export interface GrupoPorTema {
  tema: { id: string; nombre: string } | null
  ideas: IdeaLeida[]
}

/** An author's ideas by topic (D3), and apart the hidden ones, which only its page shows again. */
export function agruparPorTema(filas: readonly FilaDeIdeaDeAutor[]): { grupos: GrupoPorTema[]; ocultas: IdeaLeida[] } {
  const grupos = new Map<string | null, GrupoPorTema>()
  const ocultas: IdeaLeida[] = []
  for (const fila of enOrden(filas)) {
    if (fila.excluida) {
      ocultas.push(comoIdea(fila))
      continue
    }
    const temaId = fila.temaId !== null && fila.tema.trim() !== "" ? fila.temaId : null
    const grupo = grupos.get(temaId) ?? { tema: temaId === null ? null : { id: temaId, nombre: fila.tema }, ideas: [] }
    grupo.ideas.push(comoIdea(fila))
    grupos.set(temaId, grupo)
  }
  return {
    grupos: [...grupos.values()].sort(
      (a, b) =>
        Number(a.tema === null) - Number(b.tema === null) ||
        b.ideas.length - a.ideas.length ||
        (a.tema?.nombre ?? "").localeCompare(b.tema?.nombre ?? "", "es"),
    ),
    ocultas,
  }
}

export interface FilaDeIdeaDeTema extends IdeaLeida, ConFecha {
  autorId: string
  autor: string
  credencial: string | null
}

export interface GrupoPorAutor {
  autor: { id: string; nombre: string; credencial: string | null }
  ideas: IdeaLeida[]
}

/** A topic's ideas by author, the author with most ideas first, then by name (D3). */
export function agruparPorAutor(filas: readonly FilaDeIdeaDeTema[]): GrupoPorAutor[] {
  const grupos = new Map<string, GrupoPorAutor>()
  for (const fila of enOrden(filas)) {
    const grupo = grupos.get(fila.autorId) ?? {
      autor: { id: fila.autorId, nombre: fila.autor, credencial: fila.credencial },
      ideas: [],
    }
    grupo.ideas.push(comoIdea(fila))
    grupos.set(fila.autorId, grupo)
  }
  return [...grupos.values()].sort(
    (a, b) => b.ideas.length - a.ideas.length || a.autor.nombre.localeCompare(b.autor.nombre, "es"),
  )
}
```

- [ ] **Step 4: Run it green.**

Run: `pnpm exec vitest run tests/unit/biblioteca-ideas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/ideas.ts tests/unit/biblioteca-ideas.test.ts
git add lib/dominio/biblioteca/ideas.ts tests/unit/biblioteca-ideas.test.ts
git commit -m "$(cat <<'EOF'
Group an author's ideas by topic and a topic's ideas by author

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: the topics' order and the merged-topic chain

**Files:**
- Modify: `lib/dominio/biblioteca/temas.ts`
- Test: `tests/unit/biblioteca-orden-de-temas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-orden-de-temas.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { ordenarTemas, PASOS_MAXIMOS_DE_FUSION, seguirFusiones, type TemaResumido } from "@/lib/dominio/biblioteca/temas"

const tema = (id: string, nombre: string, autores: number, ideas: number): TemaResumido => ({
  id,
  nombre,
  descripcion: null,
  pilarId: null,
  ideas,
  autores,
  cubiertoPorConi: false,
})

describe("ordenarTemas", () => {
  it("puts the topics with most authors first, then most ideas, then by name", () => {
    const orden = ordenarTemas([
      tema("1", "Sueño", 1, 9),
      tema("2", "Carga mental", 3, 2),
      tema("3", "Ánimo", 3, 2),
      tema("4", "Pausas", 3, 5),
    ])
    expect(orden.map((t) => t.nombre)).toEqual(["Pausas", "Ánimo", "Carga mental", "Sueño"])
  })
})

describe("seguirFusiones", () => {
  const filas = new Map<string, { id: string; fusionadoEn: string | null }>([
    ["vivo", { id: "vivo", fusionadoEn: null }],
    ["a", { id: "a", fusionadoEn: "b" }],
    ["b", { id: "b", fusionadoEn: "vivo" }],
    ["bucle-1", { id: "bucle-1", fusionadoEn: "bucle-2" }],
    ["bucle-2", { id: "bucle-2", fusionadoEn: "bucle-1" }],
    ["roto", { id: "roto", fusionadoEn: "no-existe" }],
  ])
  const leer = vi.fn(async (id: string) => filas.get(id) ?? null)

  it("answers a live topic itself", async () => {
    expect(await seguirFusiones("vivo", leer)).toBe("vivo")
  })

  it("follows a merged topic to the one that stayed, step by step", async () => {
    expect(await seguirFusiones("a", leer)).toBe("vivo")
  })

  it("answers null for a missing topic, a broken chain or a loop", async () => {
    expect(await seguirFusiones("no-existe", leer)).toBeNull()
    expect(await seguirFusiones("roto", leer)).toBeNull()
    leer.mockClear()
    expect(await seguirFusiones("bucle-1", leer)).toBeNull()
    expect(leer).toHaveBeenCalledTimes(PASOS_MAXIMOS_DE_FUSION + 1)
  })

  it("follows at most five merges", async () => {
    const cadena = new Map<string, { id: string; fusionadoEn: string | null }>()
    for (let paso = 0; paso < 7; paso++) cadena.set(`t${paso}`, { id: `t${paso}`, fusionadoEn: `t${paso + 1}` })
    cadena.set("t7", { id: "t7", fusionadoEn: null })
    const leerCadena = async (id: string) => cadena.get(id) ?? null
    expect(await seguirFusiones("t2", leerCadena)).toBe("t7")
    expect(await seguirFusiones("t1", leerCadena)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-orden-de-temas.test.ts`
Expected: FAIL, `ordenarTemas is not a function`.

- [ ] **Step 3: Write the code.** Append to `lib/dominio/biblioteca/temas.ts`:

```ts
/** A topic of Temas: the view `temas_resumen`, counting only visible ideas. */
export interface TemaResumido {
  id: string
  nombre: string
  descripcion: string | null
  pilarId: string | null
  ideas: number
  autores: number
  /** Some visible idea comes from a material whose role is "Lo dijo Coni" (the view's `cubierto_por_coni`). */
  cubiertoPorConi: boolean
}

/** Most authors first, then most ideas, then name (D3, as Ingesta). */
export function ordenarTemas(temas: readonly TemaResumido[]): TemaResumido[] {
  return temas.toSorted(
    (a, b) => b.autores - a.autores || b.ideas - a.ideas || a.nombre.localeCompare(b.nombre, "es"),
  )
}

/** How many merges an old address may go through before it counts as a loop. */
export const PASOS_MAXIMOS_DE_FUSION = 5

export type PasoDeFusion = { id: string; fusionadoEn: string | null } | null

/**
 * The topic alive where `id` leads (ported from Ingesta's `destinoDeTema`): itself, or the one that absorbed it through
 * `fusionado_en`. Null when a step is missing or the chain does not end within five merges (a loop).
 */
export async function seguirFusiones(id: string, leer: (id: string) => Promise<PasoDeFusion>): Promise<string | null> {
  let actual = id
  for (let paso = 0; paso <= PASOS_MAXIMOS_DE_FUSION; paso++) {
    const fila = await leer(actual)
    if (fila === null) return null
    if (fila.fusionadoEn === null) return fila.id
    actual = fila.fusionadoEn
  }
  return null
}
```

- [ ] **Step 4: Run it green, with the existing topic tests.**

Run: `pnpm exec vitest run tests/unit/biblioteca-orden-de-temas.test.ts tests/unit/biblioteca-temas-y-fechas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/temas.ts tests/unit/biblioteca-orden-de-temas.test.ts
git add lib/dominio/biblioteca/temas.ts tests/unit/biblioteca-orden-de-temas.test.ts
git commit -m "$(cat <<'EOF'
Order the topics and follow a merged topic to the one that stayed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: the topics' filters and addresses

**Files:**
- Create: `lib/dominio/biblioteca/filtros-de-temas.ts`
- Modify: `lib/dominio/biblioteca/filtros.ts` (`leerSeleccion` takes the key)
- Test: `tests/unit/biblioteca-filtros-de-temas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-filtros-de-temas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import {
  AVISO_TRAS_OCULTAR,
  AVISO_TRAS_OCULTAR_LA_ULTIMA,
  contarCoberturas,
  filtrarPorCobertura,
  hayFiltrosDeTemas,
  hrefDeTema,
  hrefDeTemas,
  hrefTrasOcultar,
  leerFiltrosDeTemas,
  leerIdeaOculta,
} from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"

const PILAR = "11111111-2222-4333-8444-555555555555"
const OTRO = "99999999-2222-4333-8444-555555555555"
const TEMA = "33333333-2222-4333-8444-555555555555"
const IDEA = "44444444-2222-4333-8444-555555555555"

const tema = (id: string, autores: number, cubiertoPorConi: boolean): TemaResumido => ({
  id,
  nombre: id,
  descripcion: null,
  pilarId: null,
  ideas: autores,
  autores,
  cubiertoPorConi,
})
const TEMAS = [tema("tratado", 2, true), tema("solo", 1, false), tema("solo-tratado", 1, true), tema("varios", 3, false)]

describe("leerFiltrosDeTemas", () => {
  it.each([
    ["sin-tratar", "sin-tratar"],
    ["tratados", "tratados"],
    ["un-autor", "un-autor"],
    ["otra", undefined],
  ])("reads cobertura=%s as %s", (valor, cobertura) => {
    expect(leerFiltrosDeTemas({ cobertura: valor }).cobertura).toBe(cobertura)
  })

  it("keeps a pillar only when it is an active one, or any uuid when the list is not given", () => {
    expect(leerFiltrosDeTemas({ pilar: PILAR }, [PILAR])).toEqual({ pilar: PILAR })
    expect(leerFiltrosDeTemas({ pilar: OTRO }, [PILAR])).toEqual({})
    expect(leerFiltrosDeTemas({ pilar: "no-es-un-id" })).toEqual({})
    expect(leerFiltrosDeTemas({ pilar: OTRO })).toEqual({ pilar: OTRO })
  })

  it("ignores the note and the selection", () => {
    expect(leerFiltrosDeTemas({ oculta: IDEA, t: TEMA })).toEqual({})
    expect(hayFiltrosDeTemas({})).toBe(false)
    expect(hayFiltrosDeTemas({ cobertura: "tratados" })).toBe(true)
  })
})

describe("the coverage filter", () => {
  it.each([
    [undefined, ["tratado", "solo", "solo-tratado", "varios"]],
    ["sin-tratar", ["solo", "varios"]],
    ["tratados", ["tratado", "solo-tratado"]],
    ["un-autor", ["solo", "solo-tratado"]],
  ] as const)("%s keeps %j", (cobertura, ids) => {
    expect(filtrarPorCobertura(TEMAS, cobertura).map((t) => t.id)).toEqual(ids)
  })

  it("counts each value over the list it gets, the pillar already applied", () => {
    expect(contarCoberturas(TEMAS)).toEqual({ "sin-tratar": 2, tratados: 2, "un-autor": 2 })
    expect(contarCoberturas([])).toEqual({ "sin-tratar": 0, tratados: 0, "un-autor": 0 })
  })
})

describe("the addresses of Temas", () => {
  it("writes pillar, coverage and the side panel in one order", () => {
    expect(hrefDeTemas({})).toBe("/biblioteca/temas")
    expect(hrefDeTemas({ cobertura: "un-autor", pilar: PILAR }, TEMA)).toBe(
      `/biblioteca/temas?pilar=${PILAR}&cobertura=un-autor&t=${TEMA}`,
    )
    expect(hrefDeTema(TEMA)).toBe(`/biblioteca/temas/${TEMA}`)
  })

  it("after hiding goes to the topic while it keeps ideas, and to the list after its last one (D6)", () => {
    expect(hrefTrasOcultar(TEMA, IDEA, 2)).toBe(`/biblioteca/temas/${TEMA}?oculta=${IDEA}`)
    expect(hrefTrasOcultar(TEMA, IDEA, 1)).toBe(`/biblioteca/temas?oculta=${IDEA}`)
    expect(leerIdeaOculta({ oculta: IDEA })).toBe(IDEA)
    expect(leerIdeaOculta({ oculta: "1" })).toBeNull()
    expect(AVISO_TRAS_OCULTAR).toBe("La oculté. La puedes volver a mostrar desde su autor.")
    expect(AVISO_TRAS_OCULTAR_LA_ULTIMA).toBe(
      "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor.",
    )
  })
})

describe("leerSeleccion", () => {
  it("reads the side panel of each section by its own key", () => {
    expect(leerSeleccion({ m: TEMA })).toBe(TEMA)
    expect(leerSeleccion({ a: TEMA }, "a")).toBe(TEMA)
    expect(leerSeleccion({ t: "no-es-un-id" }, "t")).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-filtros-de-temas.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/biblioteca/filtros-de-temas"`.

- [ ] **Step 3: Write the code.** In `lib/dominio/biblioteca/filtros.ts`, replace `leerSeleccion` with:

```ts
/** The row open in the desktop side panel: `?m=<id>` on Materiales, `?a=` on Autores, `?t=` on Temas (D4). */
export function leerSeleccion(params: Params, clave = "m"): string | null {
  return leer(z.uuid(), params[clave]) ?? null
}
```

Create `lib/dominio/biblioteca/filtros-de-temas.ts`:

```ts
import { z } from "zod"
import type { TemaResumido } from "./temas"

export const RUTA_DE_TEMAS = "/biblioteca/temas"
export const hrefDeTema = (id: string) => `${RUTA_DE_TEMAS}/${id}`

/** Coni's option 1: by coverage. "Sin tratar" and "Ya los traté" split on `cubierto_por_coni`. */
export const COBERTURAS = ["sin-tratar", "tratados", "un-autor"] as const
export type Cobertura = (typeof COBERTURAS)[number]

export interface FiltrosDeTemas {
  cobertura?: Cobertura
  pilar?: string
}

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

/**
 * The filters of Temas from the URL; an unknown value is ignored, never an error. A pillar that is not among
 * `pilaresActivos` is dropped too, so the list never filters by one the select cannot show; the client, which has no
 * list, passes none and leaves that check to the page.
 */
export function leerFiltrosDeTemas(params: Params, pilaresActivos?: readonly string[]): FiltrosDeTemas {
  const filtros: FiltrosDeTemas = {}
  const cobertura = z.enum(COBERTURAS).safeParse(primero(params.cobertura)?.trim())
  if (cobertura.success) filtros.cobertura = cobertura.data
  const pilar = z.uuid().safeParse(primero(params.pilar)?.trim())
  if (pilar.success && (pilaresActivos === undefined || pilaresActivos.includes(pilar.data))) {
    filtros.pilar = pilar.data
  }
  return filtros
}

export function hayFiltrosDeTemas(filtros: FiltrosDeTemas): boolean {
  return Boolean(filtros.cobertura || filtros.pilar)
}

const CUMPLE: Record<Cobertura, (tema: TemaResumido) => boolean> = {
  "sin-tratar": (tema) => !tema.cubiertoPorConi,
  tratados: (tema) => tema.cubiertoPorConi,
  "un-autor": (tema) => tema.autores === 1,
}

export function filtrarPorCobertura(temas: readonly TemaResumido[], cobertura?: Cobertura): TemaResumido[] {
  return cobertura ? temas.filter(CUMPLE[cobertura]) : [...temas]
}

/** The quick filters' counts, over the topics of the chosen pillar. */
export function contarCoberturas(temas: readonly TemaResumido[]): Record<Cobertura, number> {
  return {
    "sin-tratar": temas.filter(CUMPLE["sin-tratar"]).length,
    tratados: temas.filter(CUMPLE.tratados).length,
    "un-autor": temas.filter(CUMPLE["un-autor"]).length,
  }
}

const ORDEN = ["pilar", "cobertura"] as const

/** Temas with these filters (and the side panel open on `seleccion`): linkable, Back undoes it. */
export function hrefDeTemas(filtros: FiltrosDeTemas, seleccion: string | null = null): string {
  const params = new URLSearchParams()
  for (const clave of ORDEN) {
    const valor = filtros[clave]
    if (valor) params.set(clave, valor)
  }
  if (seleccion) params.set("t", seleccion)
  const consulta = params.toString()
  return consulta ? `${RUTA_DE_TEMAS}?${consulta}` : RUTA_DE_TEMAS
}

export const AVISO_TRAS_OCULTAR = "La oculté. La puedes volver a mostrar desde su autor."
export const AVISO_TRAS_OCULTAR_LA_ULTIMA =
  "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor."

/**
 * Where Ocultar goes (D6). The hidden idea leaves its topic, and a topic left without ideas is deleted by the database
 * (`recalcular_tema`), so the last one goes to the list. The idea's id makes each address new.
 */
export function hrefTrasOcultar(temaId: string, ideaId: string, ideasDelTema: number): string {
  return ideasDelTema > 1 ? `${hrefDeTema(temaId)}?oculta=${ideaId}` : `${RUTA_DE_TEMAS}?oculta=${ideaId}`
}

/** The idea just hidden (`?oculta=<id>`), so the page says its note; anything else is no note. */
export function leerIdeaOculta(params: Params): string | null {
  const leida = z.uuid().safeParse(primero(params.oculta)?.trim())
  return leida.success ? leida.data : null
}
```

- [ ] **Step 4: Run it green, with the Materiales filters' tests.**

Run: `pnpm exec vitest run tests/unit/biblioteca-filtros-de-temas.test.ts tests/unit/biblioteca-filtros.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/filtros-de-temas.ts lib/dominio/biblioteca/filtros.ts tests/unit/biblioteca-filtros-de-temas.test.ts
git add lib/dominio/biblioteca/filtros-de-temas.ts lib/dominio/biblioteca/filtros.ts tests/unit/biblioteca-filtros-de-temas.test.ts
git commit -m "$(cat <<'EOF'
Add the topics' coverage filter, their addresses and where Ocultar goes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 6: what only WAV reads about an idea

**Files:**
- Modify: `lib/dominio/biblioteca/detalle.ts`
- Test: `tests/unit/biblioteca-ideas-para-wav.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-ideas-para-wav.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { lineasDeIdeaParaWav } from "@/lib/dominio/biblioteca/detalle"

describe("lineasDeIdeaParaWav (4h)", () => {
  it("folds the type of idea, its evidence and its id, each line unique", () => {
    expect(lineasDeIdeaParaWav({ id: "i-1", tipo: "mito", evidencia: "clinica" })).toEqual([
      "Tipo de idea: Mito",
      "Evidencia: Clínica",
      "Idea: i-1",
    ])
  })

  it("says the code when a value has no word", () => {
    expect(lineasDeIdeaParaWav({ id: "i-2", tipo: "nuevo", evidencia: "otra" })).toEqual([
      "Tipo de idea: nuevo",
      "Evidencia: otra",
      "Idea: i-2",
    ])
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-ideas-para-wav.test.ts`
Expected: FAIL, `lineasDeIdeaParaWav is not a function`.

- [ ] **Step 3: Write the code.** In `lib/dominio/biblioteca/detalle.ts`, change the import to `import { EVIDENCIA, TIPO_DE_AFIRMACION } from "./etiquetas"` and append:

```ts
/** What only WAV needs about one idea, folded under it (4h, D8). The score arrives with Semana (batch 5). */
export function lineasDeIdeaParaWav(idea: { id: string; tipo: string; evidencia: string }): string[] {
  return [
    `Tipo de idea: ${TIPO_DE_AFIRMACION[idea.tipo] ?? idea.tipo}`,
    `Evidencia: ${EVIDENCIA[idea.evidencia] ?? idea.evidencia}`,
    `Idea: ${idea.id}`,
  ]
}
```

- [ ] **Step 4: Run it green, with the words test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-ideas-para-wav.test.ts tests/unit/biblioteca-palabras.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/detalle.ts tests/unit/biblioteca-ideas-para-wav.test.ts
git add lib/dominio/biblioteca/detalle.ts tests/unit/biblioteca-ideas-para-wav.test.ts
git commit -m "$(cat <<'EOF'
Fold an idea's type, evidence and id for WAV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part B: readers and actions

### Task 7: read the authors and an author

**Files:**
- Modify: `lib/datos/biblioteca.ts`
- Test: `tests/integration/datos-autores-temas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/integration/datos-autores-temas.test.ts` (Task 8 adds the Temas half to this same file):

```ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { leerAutor, resumirAutores } from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarIdeas, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: SupabaseClient<Database>
let autora = ""
let otra = ""
let vacia = ""
let coniAutora = ""
let carga = ""
let pausas = ""
let solo = ""
let viejo = ""
let pilar = ""
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Daniela ${SUFIJO}`, "investigadora")
  otra = await sembrarAutor(`Otra ${SUFIJO}`)
  vacia = await sembrarAutor(`Vacía ${SUFIJO}`)
  autores.push(autora, otra, vacia)
  const { rows: delaConi } = await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
  coniAutora = delaConi[0]?.id ?? ""
  const { rows: pilares } = await pool.query<{ id: string }>(
    "select id from public.categorias where es_pilar and activa order by orden limit 1",
  )
  pilar = pilares[0]?.id ?? ""
  if (!coniAutora || !pilar) throw new Error("Falta la autora Coni o un pilar activo")

  carga = await sembrarTema(`Carga ${SUFIJO}`)
  pausas = await sembrarTema(`Pausas ${SUFIJO}`)
  solo = await sembrarTema(`Solo ${SUFIJO}`)
  viejo = await sembrarTema(`Viejo ${SUFIJO}`)
  temas.push(carga, pausas, solo, viejo)
  await pool.query("update public.temas set categoria_id = $1 where id = $2", [pilar, carga])
  await pool.query("update public.temas set fusionado_en = $1 where id = $2", [carga, viejo])

  const deLaAutora = await sembrarMaterial({ titulo: `De Daniela ${SUFIJO}`, autorId: autora })
  await sembrarIdeas(deLaAutora, autora, carga, 2, { texto: "Carga" })
  await sembrarIdeas(deLaAutora, autora, pausas, 1, { texto: "Pausa", evidencia: "opinion" })
  await sembrarIdeas(deLaAutora, autora, null, 1, { texto: "Oculta", excluida: true })
  const deConi = await sembrarMaterial({ titulo: `De Coni ${SUFIJO}`, autorId: coniAutora, rol: "voz_propia" })
  await sembrarIdeas(deConi, coniAutora, carga, 1, { texto: "De Coni" })
  const deOtra = await sembrarMaterial({ titulo: `De Otra ${SUFIJO}`, autorId: otra })
  await sembrarIdeas(deOtra, otra, solo, 2, { texto: "Sola" })
  materiales.push(deLaAutora, deConi, deOtra)
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("resumirAutores", () => {
  it("counts materials and visible ideas, gives the top topics, and orders by most ideas", async () => {
    const nuestros = (await resumirAutores(coni)).filter((a) => autores.includes(a.id))
    expect(nuestros.map((a) => a.id)).toEqual([autora, otra, vacia])
    expect(nuestros[0]).toMatchObject({
      materiales: 1,
      ideas: 3,
      temas: [
        { id: carga, nombre: `Carga ${SUFIJO}`, ideas: 2 },
        { id: pausas, nombre: `Pausas ${SUFIJO}`, ideas: 1 },
      ],
      credencial: "investigadora",
    })
    expect(nuestros[2]).toMatchObject({ materiales: 0, ideas: 0, temas: [] })
  })
})

describe("leerAutor", () => {
  it("groups the visible ideas by topic, oldest first, and keeps the hidden ones apart", async () => {
    const leido = await leerAutor(coni, autora)
    expect(leido?.autor).toMatchObject({ id: autora, nombre: `Daniela ${SUFIJO}`, tipo: "persona" })
    expect(leido?.materiales).toBe(1)
    expect(leido?.ideas).toBe(3)
    expect(leido?.grupos.map((g) => g.tema?.id ?? null)).toEqual([carga, pausas])
    expect(leido?.grupos[0]?.ideas.map((i) => i.texto)).toEqual(["Carga 1", "Carga 2"])
    expect(leido?.grupos[1]?.ideas[0]).toMatchObject({ texto: "Pausa 1", tipo: "dato", evidencia: "opinion" })
    expect(leido?.ocultas.map((i) => i.texto)).toEqual(["Oculta 1"])
  })

  it("is null for an author that does not exist", async () => {
    expect(await leerAutor(coni, AUSENTE)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm test:db tests/integration/datos-autores-temas.test.ts`
Expected: FAIL, `resumirAutores is not a function` (the import resolves, the names do not exist).

- [ ] **Step 3: Write the readers.** In `lib/datos/biblioteca.ts`, extend the imports:

```ts
import { type AutorDeLista, type AutorResumido, armarResumenDeAutores } from "@/lib/dominio/biblioteca/autores"
import { agruparPorTema, type GrupoPorTema, type IdeaLeida } from "@/lib/dominio/biblioteca/ideas"
```

(replacing the existing `import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"`) and append:

```ts
const COLUMNAS_DE_AUTOR = "id, nombre, credencial, tipo, alias"

/** Every author with what it gave (ported from Ingesta's `resumirAutores`): most visible ideas first (D3). */
export async function resumirAutores(db: Db): Promise<AutorResumido[]> {
  const [autores, materiales, ideas] = await Promise.all([
    listarAutores(db),
    leerTodas("los materiales de los autores", (despuesDe, limite) => {
      const consulta = db.from("materiales").select("id, autor_id")
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
    leerTodas("las ideas de los autores", (despuesDe, limite) => {
      const consulta = db.from("afirmaciones").select("id, autor_id, tema_id, temas ( nombre )").eq("excluida", false)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
  ])
  return armarResumenDeAutores(
    autores,
    materiales.map((material) => ({ autorId: material.autor_id })),
    ideas.map((idea) => ({ autorId: idea.autor_id, temaId: idea.tema_id, tema: idea.temas?.nombre ?? "" })),
  )
}

export interface AutorLeido {
  autor: AutorDeLista
  materiales: number
  /** Visible ideas. */
  ideas: number
  grupos: GrupoPorTema[]
  ocultas: IdeaLeida[]
}

/** One author with its ideas by topic and its hidden ones; null when it does not exist or is not hers to see. */
export async function leerAutor(db: Db, id: string): Promise<AutorLeido | null> {
  const { data: autor, error } = await db.from("autores").select(COLUMNAS_DE_AUTOR).eq("id", id).maybeSingle()
  if (error) throw new Error(`No pude leer el autor ${id}: ${error.message}`, { cause: error })
  if (!autor) return null
  const [conteo, filas] = await Promise.all([
    db.from("materiales").select("id", { count: "exact", head: true }).eq("autor_id", id),
    leerTodas(`las ideas del autor ${id}`, (despuesDe, limite) => {
      const consulta = db
        .from("afirmaciones")
        .select("id, texto, tipo, evidencia, excluida, tema_id, creada_en, temas ( nombre )")
        .eq("autor_id", id)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
  ])
  if (conteo.error) {
    throw new Error(`No pude contar los materiales del autor ${id}: ${conteo.error.message}`, { cause: conteo.error })
  }
  const { grupos, ocultas } = agruparPorTema(
    filas.map((fila) => ({
      id: fila.id,
      texto: fila.texto,
      tipo: fila.tipo,
      evidencia: fila.evidencia,
      excluida: fila.excluida,
      temaId: fila.tema_id,
      tema: fila.temas?.nombre ?? "",
      creadaEn: fila.creada_en,
    })),
  )
  return {
    autor,
    materiales: conteo.count ?? 0,
    ideas: grupos.reduce((total, grupo) => total + grupo.ideas.length, 0),
    grupos,
    ocultas,
  }
}
```

- [ ] **Step 4: Run it green, with batch 1's readers.**

Run: `pnpm test:db tests/integration/datos-autores-temas.test.ts tests/integration/datos-biblioteca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/datos/biblioteca.ts tests/integration/datos-autores-temas.test.ts
git add lib/datos/biblioteca.ts tests/integration/datos-autores-temas.test.ts
git commit -m "$(cat <<'EOF'
Read the authors' summary and one author's ideas by topic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 8: read the topics, the pillars, a topic and where a merged one went

**Files:**
- Modify: `lib/datos/biblioteca.ts`, `tests/integration/datos-autores-temas.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/integration/datos-autores-temas.test.ts`, change the reader import to

```ts
import {
  destinoDeTema,
  leerAutor,
  leerTema,
  listarPilaresDeTemas,
  listarTemas,
  resumirAutores,
} from "@/lib/datos/biblioteca"
```

and append:

```ts
describe("listarTemas", () => {
  it("counts visible ideas and distinct authors, says who covered it, orders by most authors, leaves merged out", async () => {
    const nuestros = (await listarTemas(coni, {})).filter((t) => temas.includes(t.id))
    expect(nuestros.map((t) => t.id)).toEqual([carga, solo, pausas])
    expect(nuestros[0]).toEqual({
      id: carga,
      nombre: `Carga ${SUFIJO}`,
      descripcion: null,
      pilarId: pilar,
      ideas: 3,
      autores: 2,
      cubiertoPorConi: true,
    })
    expect(nuestros[1]).toMatchObject({ ideas: 2, autores: 1, cubiertoPorConi: false })
  })

  it("narrows to one pillar", async () => {
    const nuestros = (await listarTemas(coni, { pilar })).filter((t) => temas.includes(t.id))
    expect(nuestros.map((t) => t.id)).toEqual([carga])
  })
})

describe("listarPilaresDeTemas", () => {
  it("gives the active pillars with their id, in their order", async () => {
    const pilares = await listarPilaresDeTemas(coni)
    expect(pilares[0]?.id).toBe(pilar)
    const { rows } = await pool.query<{ id: string }>(
      "select id from public.categorias where not (es_pilar and activa)",
    )
    expect(pilares.some((p) => rows.some((fila) => fila.id === p.id))).toBe(false)
  })
})

describe("leerTema", () => {
  it("groups the visible ideas by author, most ideas first, with the credential", async () => {
    const leido = await leerTema(coni, carga)
    expect(leido?.tema).toEqual({ id: carga, nombre: `Carga ${SUFIJO}`, descripcion: null })
    expect(leido?.ideas).toBe(3)
    expect(leido?.autores.map((g) => g.autor.id)).toEqual([autora, coniAutora])
    expect(leido?.autores[0]?.autor.credencial).toBe("investigadora")
    expect(leido?.autores[0]?.ideas.map((i) => i.texto)).toEqual(["Carga 1", "Carga 2"])
  })

  it("is null for a merged or missing topic", async () => {
    expect(await leerTema(coni, viejo)).toBeNull()
    expect(await leerTema(coni, AUSENTE)).toBeNull()
  })
})

describe("destinoDeTema", () => {
  it("follows a merged topic to the one that stayed, and is null for a missing one", async () => {
    expect(await destinoDeTema(coni, viejo)).toBe(carga)
    expect(await destinoDeTema(coni, carga)).toBe(carga)
    expect(await destinoDeTema(coni, AUSENTE)).toBeNull()
  })

  it("is null for a loop", async () => {
    const [uno, dos] = [await sembrarTema(`Bucle 1 ${SUFIJO}`), await sembrarTema(`Bucle 2 ${SUFIJO}`)]
    temas.push(uno, dos)
    await pool.query("update public.temas set fusionado_en = $1 where id = $2", [dos, uno])
    await pool.query("update public.temas set fusionado_en = $1 where id = $2", [uno, dos])
    expect(await destinoDeTema(coni, uno)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm test:db tests/integration/datos-autores-temas.test.ts`
Expected: FAIL, `listarTemas is not a function`.

- [ ] **Step 3: Write the readers.** In `lib/datos/biblioteca.ts`, extend the imports:

```ts
import { agruparPorAutor, agruparPorTema, type GrupoPorAutor, type GrupoPorTema, type IdeaLeida } from "@/lib/dominio/biblioteca/ideas"
import {
  ordenarTemas,
  seguirFusiones,
  type TemaPrincipal,
  type TemaResumido,
  temasPrincipales,
} from "@/lib/dominio/biblioteca/temas"
```

(replacing the Task 7 `ideas` import and the existing `temas` import) and append:

```ts
/** The topics of Temas (ported from Ingesta's `listarTemas`), a pillar narrowing them; ordered by `ordenarTemas`. */
export async function listarTemas(db: Db, filtros: { pilar?: string }): Promise<TemaResumido[]> {
  const filas = await leerTodas("los temas", (despuesDe, limite) => {
    const todas = db
      .from("temas_resumen")
      .select("id, nombre, descripcion, categoria_id, afirmaciones, autores, cubierto_por_coni")
    const delPilar = filtros.pilar ? todas.eq("categoria_id", filtros.pilar) : todas
    return (despuesDe === null ? delPilar : delPilar.gt("id", despuesDe))
      .order("id")
      .limit(limite)
      .then(({ data, error }) => ({
        // The view types every column nullable; a topic row always has its id and name.
        data:
          data?.flatMap((fila) =>
            fila.id === null || fila.nombre === null ? [] : [{ ...fila, id: fila.id, nombre: fila.nombre }],
          ) ?? null,
        error,
      }))
  })
  return ordenarTemas(
    filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      pilarId: fila.categoria_id,
      ideas: fila.afirmaciones ?? 0,
      autores: fila.autores ?? 0,
      cubiertoPorConi: fila.cubierto_por_coni === true,
    })),
  )
}

export interface Pilar {
  id: string
  nombre: string
}

/** The pillars a topic can be filtered by: active pillar rows only, in their order (`leerPilares` has no id). */
export async function listarPilaresDeTemas(db: Db): Promise<Pilar[]> {
  const { data, error } = await db
    .from("categorias")
    .select("id, nombre")
    .eq("es_pilar", true)
    .eq("activa", true)
    .order("orden")
  if (error) throw new Error(`No pude leer los pilares: ${error.message}`, { cause: error })
  return data
}

export interface TemaLeido {
  tema: { id: string; nombre: string; descripcion: string | null }
  /** Visible ideas. */
  ideas: number
  autores: GrupoPorAutor[]
}

/** One live topic with its visible ideas by author; null when it is missing or was merged into another. */
export async function leerTema(db: Db, id: string): Promise<TemaLeido | null> {
  const { data: tema, error } = await db
    .from("temas")
    .select("id, nombre, descripcion, fusionado_en")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el tema ${id}: ${error.message}`, { cause: error })
  if (!tema || tema.fusionado_en !== null) return null
  const filas = await leerTodas(`las ideas del tema ${id}`, (despuesDe, limite) => {
    const consulta = db
      .from("afirmaciones")
      .select("id, texto, tipo, evidencia, creada_en, autor_id, autores ( nombre, credencial )")
      .eq("tema_id", id)
      .eq("excluida", false)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return {
    tema: { id: tema.id, nombre: tema.nombre, descripcion: tema.descripcion },
    ideas: filas.length,
    autores: agruparPorAutor(
      filas.map((fila) => ({
        id: fila.id,
        texto: fila.texto,
        tipo: fila.tipo,
        evidencia: fila.evidencia,
        creadaEn: fila.creada_en,
        autorId: fila.autor_id,
        autor: fila.autores?.nombre ?? "",
        credencial: fila.autores?.credencial ?? null,
      })),
    ),
  }
}

/** The live topic an address leads to (D2): itself, the one a merge kept, or null. */
export function destinoDeTema(db: Db, id: string): Promise<string | null> {
  return seguirFusiones(id, async (actual) => {
    const { data, error } = await db.from("temas").select("id, fusionado_en").eq("id", actual).maybeSingle()
    if (error) throw new Error(`No pude leer el tema ${actual}: ${error.message}`, { cause: error })
    return data ? { id: data.id, fusionadoEn: data.fusionado_en } : null
  })
}
```

- [ ] **Step 4: Run it green.**

Run: `pnpm test:db tests/integration/datos-autores-temas.test.ts tests/integration/datos-biblioteca.test.ts && pnpm type`
Expected: PASS, and `tsc` clean (the `.then` keeps `leerTodas`' `{ id: string }` constraint).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/datos/biblioteca.ts tests/integration/datos-autores-temas.test.ts
git add lib/datos/biblioteca.ts tests/integration/datos-autores-temas.test.ts
git commit -m "$(cat <<'EOF'
Read the topics, their pillars, one topic by author and where a merged one went

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 9: `unirAutores`, Coni only and never Coni as the one that disappears

**Files:**
- Modify: `lib/acciones/biblioteca.ts`
- Test: `tests/integration/acciones-autores-temas.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/integration/acciones-autores-temas.test.ts` (Task 10 adds `ocultarIdea` to it):

```ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { unirAutores } from "@/lib/acciones/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarIdeas, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const SOLO_CONI = "Esta app es solo para Coni."
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: Db
let wav: Db
let coniAutora = ""
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []

async function autor(nombre: string): Promise<string> {
  const id = await sembrarAutor(`${nombre} ${SUFIJO}`)
  autores.push(id)
  return id
}

async function material(autorId: string): Promise<string> {
  const id = await sembrarMaterial({ titulo: `Acción ${SUFIJO}`, autorId })
  materiales.push(id)
  return id
}

const existe = async (id: string) =>
  (await pool.query("select 1 from public.autores where id = $1", [id])).rowCount === 1

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  const { rows } = await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
  coniAutora = rows[0]?.id ?? ""
  if (!coniAutora) throw new Error("Falta la autora Coni")
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("unirAutores", () => {
  it("as Coni moves the materials and ideas to the one that stays, keeps the name as alias, and drops the other", async () => {
    const [origen, destino] = [await autor("D. Ruiz"), await autor("Daniela Ruiz")]
    const delOrigen = await material(origen)
    const tema = await sembrarTema(`Unir ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delOrigen, origen, tema, 2)

    expect(await unirAutores({ db: coni }, { origen, destino })).toEqual({ ok: true })

    expect(await existe(origen)).toBe(false)
    const { rows: deMaterial } = await pool.query("select autor_id from public.materiales where id = $1", [delOrigen])
    expect(deMaterial[0]?.autor_id).toBe(destino)
    const { rows: ideas } = await pool.query("select count(*)::int as n from public.afirmaciones where autor_id = $1", [
      destino,
    ])
    expect(ideas[0]?.n).toBe(2)
    const { rows: alias } = await pool.query("select alias from public.autores where id = $1", [destino])
    expect(alias[0]?.alias).toContain(`D. Ruiz ${SUFIJO}`)
  })

  it("refuses Coni's own card as the one that disappears, before the database is asked", async () => {
    const destino = await autor("Destino")
    expect(await unirAutores({ db: coni }, { origen: coniAutora, destino })).toEqual({
      ok: false,
      error: "Tu propia ficha no se puede unir a otro autor.",
    })
    expect(await existe(coniAutora)).toBe(true)
  })

  it("lets Coni be the one that stays", async () => {
    const origen = await autor("Coni de nuevo")
    expect(await unirAutores({ db: coni }, { origen, destino: coniAutora })).toEqual({ ok: true })
    expect(await existe(origen)).toBe(false)
    // Coni's row is the seed's, shared by every test: the alias the join added must not stay behind.
    await pool.query("update public.autores set alias = array_remove(alias, $1) where id = $2", [
      `Coni de nuevo ${SUFIJO}`,
      coniAutora,
    ])
  })

  it("refuses the same author twice and a missing one, in plain words", async () => {
    const uno = await autor("Uno")
    expect(await unirAutores({ db: coni }, { origen: uno, destino: uno })).toEqual({
      ok: false,
      error: "Elige otro autor para unirlos.",
    })
    expect(await unirAutores({ db: coni }, { origen: AUSENTE, destino: uno })).toEqual({
      ok: false,
      error: "Ese autor ya no existe.",
    })
    expect(await unirAutores({ db: coni }, { origen: uno, destino: AUSENTE })).toEqual({
      ok: false,
      error: "Ese autor ya no existe.",
    })
    expect(await existe(uno)).toBe(true)
  })

  it("refuses WAV, although the database would let it", async () => {
    const [origen, destino] = [await autor("Origen WAV"), await autor("Destino WAV")]
    expect(await unirAutores({ db: wav }, { origen, destino })).toEqual({ ok: false, error: SOLO_CONI })
    expect(await existe(origen)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm test:db tests/integration/acciones-autores-temas.test.ts`
Expected: FAIL, `unirAutores is not a function`.

- [ ] **Step 3: Write the action.** In `lib/acciones/biblioteca.ts`, next to the other schemas, add:

```ts
export const UnionDeAutores = z.object({ origen: z.uuid(), destino: z.uuid() })
```

next to the other codes add:

```ts
const NO_EXISTE = "P0002"
const AUTOR_INEXISTENTE = "Ese autor ya no existe."
```

and append:

```ts
/**
 * Joins `origen` into `destino` with `fusionar_autores` (ported from Ingesta's `fusionarAutores`): its materials and
 * ideas pass to the one that stays and it disappears, so Coni's own card is refused here before the database (D7).
 */
export function unirAutores(
  deps: Pick<DepsBiblioteca, "db">,
  union: z.output<typeof UnionDeAutores>,
): Promise<Resultado> {
  return aResultado("unirAutores", async () => {
    await exigirConi(deps.db)
    if (union.origen === union.destino) throw new Falla("Elige otro autor para unirlos.")
    const { data: origen, error } = await deps.db.from("autores").select("tipo").eq("id", union.origen).maybeSingle()
    if (error) throw new Error(`No pude leer el autor ${union.origen}: ${error.message}`, { cause: error })
    if (!origen) throw new Falla(AUTOR_INEXISTENTE)
    if (origen.tipo === "coni") throw new Falla("Tu propia ficha no se puede unir a otro autor.")
    const { error: errorDeUnion } = await deps.db.rpc("fusionar_autores", {
      p_origen: union.origen,
      p_destino: union.destino,
    })
    if (errorDeUnion) {
      if (errorDeUnion.code === NO_EXISTE) throw new Falla(AUTOR_INEXISTENTE)
      throw new Error(`No pude unir el autor ${union.origen} con ${union.destino}: ${errorDeUnion.message}`, {
        cause: errorDeUnion,
      })
    }
    return {}
  })
}
```

- [ ] **Step 4: Run it green.**

Run: `pnpm test:db tests/integration/acciones-autores-temas.test.ts tests/integration/acciones-biblioteca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/acciones/biblioteca.ts tests/integration/acciones-autores-temas.test.ts
git add lib/acciones/biblioteca.ts tests/integration/acciones-autores-temas.test.ts
git commit -m "$(cat <<'EOF'
Join two authors as Coni, never her own card as the one that disappears

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 10: `ocultarIdea`, and where a hidden idea goes

**Files:**
- Modify: `lib/acciones/biblioteca.ts`, `tests/integration/acciones-autores-temas.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/integration/acciones-autores-temas.test.ts`, change the imports to

```ts
import { ocultarIdea, unirAutores } from "@/lib/acciones/biblioteca"
import { destinoDeTema, leerAutor, leerTema } from "@/lib/datos/biblioteca"
```

and append:

```ts
async function ideasDe(materialId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    "select id from public.afirmaciones where material_id = $1 order by creada_en, id",
    [materialId],
  )
  return rows.map((fila) => fila.id)
}

describe("ocultarIdea", () => {
  it("takes an idea out of its topic, and its author shows it under the hidden ones", async () => {
    const autora = await autor("Oculta")
    const delaAutora = await material(autora)
    const tema = await sembrarTema(`Ocultar ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delaAutora, autora, tema, 2)
    const [primera] = await ideasDe(delaAutora)
    if (!primera) throw new Error("Faltan ideas")

    expect(await ocultarIdea({ db: coni }, { id: primera, oculta: true })).toEqual({ ok: true })

    const leido = await leerTema(coni, tema)
    expect(leido?.ideas).toBe(1)
    expect(leido?.autores[0]?.ideas.map((i) => i.id)).not.toContain(primera)
    expect((await leerAutor(coni, autora))?.ocultas.map((i) => i.id)).toEqual([primera])
  })

  it("Mostrar brings it back without a topic, under «Sin tema todavía» (D6)", async () => {
    const autora = await autor("Mostrar")
    const delaAutora = await material(autora)
    const tema = await sembrarTema(`Mostrar ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delaAutora, autora, tema, 2)
    const [primera] = await ideasDe(delaAutora)
    if (!primera) throw new Error("Faltan ideas")
    await ocultarIdea({ db: coni }, { id: primera, oculta: true })

    expect(await ocultarIdea({ db: coni }, { id: primera, oculta: false })).toEqual({ ok: true })

    const leido = await leerAutor(coni, autora)
    expect(leido?.ocultas).toEqual([])
    expect(leido?.grupos.find((g) => g.tema === null)?.ideas.map((i) => i.id)).toEqual([primera])
  })

  it("hiding the last idea of a topic deletes the topic (deviation 1)", async () => {
    const autora = await autor("Última")
    const delaAutora = await material(autora)
    const tema = await sembrarTema(`Última ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delaAutora, autora, tema, 1)
    const [unica] = await ideasDe(delaAutora)
    if (!unica) throw new Error("Falta la idea")

    expect(await ocultarIdea({ db: coni }, { id: unica, oculta: true })).toEqual({ ok: true })
    expect(await destinoDeTema(coni, tema)).toBeNull()
  })

  it("says an idea that is gone in plain words", async () => {
    expect(await ocultarIdea({ db: coni }, { id: AUSENTE, oculta: true })).toEqual({
      ok: false,
      error: "Esa idea ya no existe.",
    })
  })

  it("refuses WAV, although the database would let it", async () => {
    const autora = await autor("Idea WAV")
    const delaAutora = await material(autora)
    await sembrarIdeas(delaAutora, autora, null, 1)
    const [idea] = await ideasDe(delaAutora)
    if (!idea) throw new Error("Falta la idea")
    expect(await ocultarIdea({ db: wav }, { id: idea, oculta: true })).toEqual({ ok: false, error: SOLO_CONI })
    const { rows } = await pool.query("select excluida from public.afirmaciones where id = $1", [idea])
    expect(rows[0]?.excluida).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm test:db tests/integration/acciones-autores-temas.test.ts`
Expected: FAIL, `ocultarIdea is not a function`.

- [ ] **Step 3: Write the action.** In `lib/acciones/biblioteca.ts`, next to `UnionDeAutores` add:

```ts
export const CambioDeIdea = z.object({ id: z.uuid(), oculta: z.boolean() })
```

and append:

```ts
/**
 * Hides or shows an idea with `excluir_afirmacion` (ported from Ingesta's `excluirAfirmacion`). Hiding takes it out of
 * its topic, and a topic left without ideas goes away; shown again it waits without topic for the next maintenance run.
 */
export function ocultarIdea(deps: Pick<DepsBiblioteca, "db">, cambio: z.output<typeof CambioDeIdea>): Promise<Resultado> {
  return aResultado("ocultarIdea", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("excluir_afirmacion", { p_id: cambio.id, p_excluida: cambio.oculta })
    if (error) {
      if (error.code === NO_EXISTE) throw new Falla("Esa idea ya no existe.")
      throw new Error(`No pude cambiar la idea ${cambio.id}: ${error.message}`, { cause: error })
    }
    return {}
  })
}
```

- [ ] **Step 4: Run it green.**

Run: `pnpm test:db tests/integration/acciones-autores-temas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/acciones/biblioteca.ts tests/integration/acciones-autores-temas.test.ts
git add lib/acciones/biblioteca.ts tests/integration/acciones-autores-temas.test.ts
git commit -m "$(cat <<'EOF'
Hide and show an idea as Coni

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 11: the server actions of Autores and Temas

**Files:**
- Modify: `app/(app)/biblioteca/acciones.ts`, `tests/unit/biblioteca-acciones-servidor.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/unit/biblioteca-acciones-servidor.test.ts`, replace the two import blocks under the mocks with:

```ts
import {
  confirmarCostoAccion,
  confirmarMaterialAccion,
  crearAutorAccion,
  crearMaterialAccion,
  descartarMaterialAccion,
  editarFichaAccion,
  editarMaterialAccion,
  ocultarIdeaAccion,
  reintentarMaterialAccion,
  reprocesarMaterialAccion,
  unirAutoresAccion,
} from "@/app/(app)/biblioteca/acciones"
import {
  AutorNuevo,
  CambioDeIdea,
  descartarMaterial,
  EdicionDeMaterial,
  SobreMaterial,
  UnionDeAutores,
} from "@/lib/acciones/biblioteca"
```

and append at the end of the file:

```ts
describe("the server actions of Autores and Temas", () => {
  it.each([
    [
      "unirAutores",
      () => unirAutoresAccion({ origen: ID, destino: AUTOR }),
      UnionDeAutores,
      { origen: ID, destino: AUTOR },
    ],
    ["ocultarIdea", () => ocultarIdeaAccion({ id: ID, oculta: true }), CambioDeIdea, { id: ID, oculta: true }],
  ] as const)(
    "%s checks Coni with its schema and refreshes the three sections, so their counts agree",
    async (nombre, accion, esquema, entrada) => {
      expect(await accion()).toEqual({ ok: true })
      expect(conSesionDeConi).toHaveBeenCalledWith(nombre, esquema, entrada, expect.any(Function))
      expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
    },
  )

  it("refreshes nothing when joining is refused", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    expect(await unirAutoresAccion({ origen: ID, destino: AUTOR })).toEqual({
      ok: false,
      error: "Esta app es solo para Coni.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("the schemas refuse what is not an id or a yes/no", () => {
    expect(UnionDeAutores.safeParse({ origen: "1", destino: AUTOR }).success).toBe(false)
    expect(CambioDeIdea.safeParse({ id: ID, oculta: "si" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-acciones-servidor.test.ts`
Expected: FAIL, `unirAutoresAccion is not a function`.

- [ ] **Step 3: Write the wrappers.** In `app/(app)/biblioteca/acciones.ts`, add `CambioDeIdea`, `ocultarIdea`, `UnionDeAutores` and `unirAutores` to the import from `@/lib/acciones/biblioteca` (alphabetical, as Biome orders them) and append:

```ts
/** Joining moves materials and ideas: the three sections' counts change. */
export async function unirAutoresAccion(union: z.input<typeof UnionDeAutores>) {
  return refrescar(await conSesionDeConi("unirAutores", UnionDeAutores, union, (db, d) => unirAutores({ db }, d)))
}

/** Hiding changes a topic, its author and the materials' main topics. */
export async function ocultarIdeaAccion(cambio: z.input<typeof CambioDeIdea>) {
  return refrescar(await conSesionDeConi("ocultarIdea", CambioDeIdea, cambio, (db, d) => ocultarIdea({ db }, d)))
}
```

- [ ] **Step 4: Run it green, and every unit test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-acciones-servidor.test.ts && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/acciones.ts" tests/unit/biblioteca-acciones-servidor.test.ts
head -1 "app/(app)/biblioteca/acciones.ts"   # must print "use server"
git add "app/(app)/biblioteca/acciones.ts" tests/unit/biblioteca-acciones-servidor.test.ts
git commit -m "$(cat <<'EOF'
Add the server actions to join authors and hide an idea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
# Part C: the nav, the shared idea pieces, Autores

### Task 12: three sections in the Biblioteca's nav

**Files:**
- Modify: `app/(app)/biblioteca/nav-de-biblioteca.tsx`, `components/ui/pestanas.tsx`
- Test: `tests/unit/biblioteca-piezas.test.tsx`, `tests/unit/pestanas.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/biblioteca-piezas.test.tsx`, change the first import to `import { render, screen, within } from "@testing-library/react"` and replace the whole `describe("NavDeBiblioteca (4c)", ...)` block with:

```tsx
describe("NavDeBiblioteca (4c)", () => {
  it("shows the three sections already in Conidolly, each with an icon and its name", () => {
    render(<NavDeBiblioteca actual="autores" />)
    const nav = screen.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    const enlaces = within(nav).getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Materiales", "Autores", "Temas"])
    expect(enlaces.map((enlace) => enlace.getAttribute("href"))).toEqual([
      "/biblioteca",
      "/biblioteca/autores",
      "/biblioteca/temas",
    ])
    expect(enlaces[1]).toHaveAttribute("aria-current", "page")
    expect(nav.querySelectorAll("svg")).toHaveLength(3)
  })

  it("hugs its tabs and wraps them instead of pushing the page sideways", () => {
    render(<NavDeBiblioteca actual="materiales" />)
    expect(screen.getByRole("list")).toHaveClass("w-fit", "max-w-full", "flex-wrap")
  })
})
```

Append to `tests/unit/pestanas.test.tsx`:

```tsx
describe("Pestanas compactas", () => {
  it("wrap instead of pushing the page sideways, with a tighter tab, and the shared ones keep theirs", () => {
    const opciones = [
      { valor: "a", etiqueta: "Una", href: "/a" },
      { valor: "b", etiqueta: "Otra", href: "/b" },
    ]
    const { unmount } = render(<Pestanas etiqueta="Secciones" actual="a" compacta opciones={opciones} />)
    expect(screen.getByRole("list")).toHaveClass("flex-wrap", "max-w-full")
    expect(screen.getAllByRole("link")[0]).toHaveClass("gap-1.5", "px-2.5")
    unmount()
    render(<Pestanas etiqueta="Vistas" actual="a" opciones={opciones} />)
    expect(screen.getByRole("list")).not.toHaveClass("flex-wrap")
    expect(screen.getAllByRole("link")[0]).toHaveClass("gap-2", "px-3")
  })
})
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-piezas.test.tsx tests/unit/pestanas.test.tsx`
Expected: FAIL: the nav has one link (`["Materiales"]`), and the compact list has no `flex-wrap`. (TypeScript also flags `actual="autores"`; Vitest still runs.)

- [ ] **Step 3: Write the code.** Replace `app/(app)/biblioteca/nav-de-biblioteca.tsx` with:

```tsx
import { FileText, Tag, Users } from "@phosphor-icons/react/dist/ssr"
import { ICONO } from "@/components/ui/icono"
import { Pestanas } from "@/components/ui/pestanas"
import { RUTA_DE_AUTORES } from "@/lib/dominio/biblioteca/autores"
import { RUTA_DE_MATERIALES } from "@/lib/dominio/biblioteca/filtros"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"

// The sections already in Conidolly (batch 3: Materiales, Autores, Temas). Semana is added by its batch.
const SECCIONES = [
  { valor: "materiales", etiqueta: "Materiales", href: RUTA_DE_MATERIALES, Icono: FileText },
  { valor: "autores", etiqueta: "Autores", href: RUTA_DE_AUTORES, Icono: Users },
  { valor: "temas", etiqueta: "Temas", href: RUTA_DE_TEMAS, Icono: Tag },
] as const

type Seccion = (typeof SECCIONES)[number]["valor"]

export function NavDeBiblioteca({ actual }: { actual: Seccion }) {
  return (
    <Pestanas
      etiqueta="Secciones de la Biblioteca"
      actual={actual}
      compacta
      opciones={SECCIONES.map(({ Icono, ...seccion }) => ({
        ...seccion,
        icono: <Icono aria-hidden="true" size={ICONO.medio} />,
      }))}
    />
  )
}
```

In `components/ui/pestanas.tsx`, update the `compacta` doc comment and the two class lists:

```tsx
  /**
   * The track hugs its options instead of sharing the width, with tighter tabs; when they do not fit one row (large
   * text) they wrap instead of pushing the page sideways (WCAG 1.4.10).
   */
  compacta?: boolean
```

```tsx
      <ul
        className={cn(
          compacta ? "inline-flex w-fit max-w-full flex-wrap" : "flex",
          "gap-1 rounded-control bg-piedra-honda p-1 shadow-hundido",
        )}
      >
```

```tsx
                className={cn(
                  "flex min-h-objetivo items-center justify-center rounded-control text-cuerpo transition-shadow duration-[var(--dur-corta)] ease-salida",
                  compacta ? "gap-1.5 px-2.5" : "gap-2 px-3",
                  esActual ? "bg-piedra font-semibold text-tinta shadow-relieve" : "font-medium text-apagado",
                )}
```

- [ ] **Step 4: Run them green, and every unit test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-piezas.test.tsx tests/unit/pestanas.test.tsx tests/unit/pildora-y-pestana-con-icono.test.tsx && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/nav-de-biblioteca.tsx" components/ui/pestanas.tsx tests/unit/biblioteca-piezas.test.tsx tests/unit/pestanas.test.tsx
git add "app/(app)/biblioteca/nav-de-biblioteca.tsx" components/ui/pestanas.tsx tests/unit/biblioteca-piezas.test.tsx tests/unit/pestanas.test.tsx
git commit -m "$(cat <<'EOF'
Add Autores and Temas to the Biblioteca's nav, wrapping instead of scrolling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 13: an idea in her words, and Ocultar / Mostrar

**Files:**
- Create: `app/(app)/biblioteca/lista-de-ideas.tsx`, `app/(app)/biblioteca/boton-ocultar.tsx`
- Modify: `lib/dominio/biblioteca/ideas.ts` (`idDeIdea`)
- Test: `tests/unit/biblioteca-ideas-y-ocultar.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-ideas-y-ocultar.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { ocultarIdeaAccion, replace } = vi.hoisted(() => ({
  ocultarIdeaAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  replace: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ ocultarIdeaAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))

import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import { idDeIdea } from "@/lib/dominio/biblioteca/ideas"

const ID = "11111111-2222-4333-8444-555555555555"
const IDEAS = [{ id: ID, texto: "Las pausas acordadas protegen.", tipo: "consejo", evidencia: "estudio" }]

beforeEach(() => vi.clearAllMocks())

describe("ListaDeIdeas (4h)", () => {
  it("shows each idea in her words, with its type and evidence folded under Detalle para WAV", () => {
    const { container } = render(<ListaDeIdeas etiqueta="Ideas de Daniela" ideas={IDEAS} />)
    const lista = screen.getByRole("list", { name: "Ideas de Daniela" })
    expect(within(lista).getByText("«Las pausas acordadas protegen.»")).toHaveAttribute("id", idDeIdea(ID))
    const detalle = container.querySelector("details")
    expect(detalle).not.toHaveAttribute("open")
    expect(detalle).toHaveTextContent("Detalle para WAV")
    expect(detalle).toHaveTextContent("Tipo de idea: Consejo")
    expect(detalle).toHaveTextContent("Evidencia: Estudio")
    expect(screen.queryByText(/Afirmaci/)).toBeNull()
  })

  it("draws each idea's action when there is one", () => {
    render(
      <ListaDeIdeas
        etiqueta="Ideas"
        ideas={IDEAS}
        accion={(idea) => <button type="button">{`Acción ${idea.id}`}</button>}
      />,
    )
    expect(screen.getByRole("button", { name: `Acción ${ID}` })).toBeInTheDocument()
  })
})

describe("BotonOcultar", () => {
  it("Ocultar hides the idea and goes to the address after hiding (D6)", async () => {
    render(<BotonOcultar ideaId={ID} oculta={false} despues={`/biblioteca/temas/t?oculta=${ID}`} />)
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }))
    await waitFor(() => expect(ocultarIdeaAccion).toHaveBeenCalledWith({ id: ID, oculta: true }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/biblioteca/temas/t?oculta=${ID}`, { scroll: false }))
  })

  it("Mostrar shows it again and redraws the page in place", async () => {
    render(<BotonOcultar ideaId={ID} oculta despues={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }))
    await waitFor(() => expect(ocultarIdeaAccion).toHaveBeenCalledWith({ id: ID, oculta: false }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/\?v=\d+$/), { scroll: false }))
  })

  it("points at the idea's text, so many of them read apart", () => {
    render(<BotonOcultar ideaId={ID} oculta={false} despues={null} />)
    expect(screen.getByRole("button", { name: "Ocultar" })).toHaveAttribute("aria-describedby", idDeIdea(ID))
  })

  it("says a refusal and goes nowhere", async () => {
    ocultarIdeaAccion.mockResolvedValueOnce({ ok: false, error: "Esa idea ya no existe." })
    render(<BotonOcultar ideaId={ID} oculta={false} despues="/biblioteca/temas" />)
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa idea ya no existe.")
    expect(replace).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-ideas-y-ocultar.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/boton-ocultar"`.

- [ ] **Step 3: Write the code.** Append to `lib/dominio/biblioteca/ideas.ts` (a plain module: the server list and the client button both use it):

```ts
/** The id of an idea's text on screen: its button points at it (D8). */
export const idDeIdea = (id: string) => `idea-${id}`
```

Create `app/(app)/biblioteca/lista-de-ideas.tsx`:

```tsx
import type { ReactNode } from "react"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { lineasDeIdeaParaWav } from "@/lib/dominio/biblioteca/detalle"
import { type IdeaLeida, idDeIdea } from "@/lib/dominio/biblioteca/ideas"

interface Propiedades {
  etiqueta: string
  ideas: readonly IdeaLeida[]
  /** Ocultar on a topic, Mostrar among an author's hidden ones. */
  accion?: (idea: IdeaLeida) => ReactNode
}

/** Ideas in her words (4h, D8): the text she reads, its action, and WAV's detail folded under each. */
export function ListaDeIdeas({ etiqueta, ideas, accion }: Propiedades) {
  return (
    <ul aria-label={etiqueta} className="grid gap-3">
      {ideas.map((idea) => (
        <li key={idea.id} className="grid gap-2 rounded-panel bg-piedra-alta p-4">
          <p id={idDeIdea(idea.id)} className="text-cuerpo">{`«${idea.texto}»`}</p>
          {accion ? accion(idea) : null}
          <DetalleParaWav lineas={lineasDeIdeaParaWav(idea)} proveedor={null} />
        </li>
      ))}
    </ul>
  )
}
```

Create `app/(app)/biblioteca/boton-ocultar.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import { idDeIdea } from "@/lib/dominio/biblioteca/ideas"
import { ocultarIdeaAccion } from "./acciones"

interface Propiedades {
  ideaId: string
  /** Whether it is hidden now: the button does the opposite. */
  oculta: boolean
  /** Where to go after it worked (`hrefTrasOcultar`); null redraws the page where it is. */
  despues: string | null
}

/** Ported from Ingesta's `boton-ocultar.tsx` (D6). Hiding is undone from the author's page, so it does not ask. */
export function BotonOcultar({ ideaId, oculta, despues }: Propiedades) {
  const router = useRouter()
  const redibujar = useRedibujar()
  const { pendiente, error, ejecutar } = useAccion()
  return (
    <div className="grid justify-items-start gap-1">
      <Boton
        variante="callado"
        cargando={pendiente}
        aria-describedby={idDeIdea(ideaId)}
        onClick={() =>
          ejecutar(
            () => ocultarIdeaAccion({ id: ideaId, oculta: !oculta }),
            () => {
              if (despues) router.replace(despues, { scroll: false })
              else redibujar()
            },
          )
        }
      >
        {oculta ? "Mostrar" : "Ocultar"}
      </Boton>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run it green, with the words and design rules.**

Run: `pnpm exec vitest run tests/unit/biblioteca-ideas-y-ocultar.test.tsx tests/unit/biblioteca-palabras.test.ts tests/unit/diseno-reglas.test.ts && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/lista-de-ideas.tsx" "app/(app)/biblioteca/boton-ocultar.tsx" lib/dominio/biblioteca/ideas.ts tests/unit/biblioteca-ideas-y-ocultar.test.tsx
head -1 "app/(app)/biblioteca/boton-ocultar.tsx"   # must print "use client"
git add "app/(app)/biblioteca/lista-de-ideas.tsx" "app/(app)/biblioteca/boton-ocultar.tsx" lib/dominio/biblioteca/ideas.ts tests/unit/biblioteca-ideas-y-ocultar.test.tsx
git commit -m "$(cat <<'EOF'
Show ideas in her words with WAV's detail folded, and hide or show one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 14: the authors as cards and as a table, with the search

**Files:**
- Create: `app/(app)/biblioteca/autores/sin-material.tsx`, `tarjeta-de-autor.tsx`, `tabla-de-autores.tsx`, `lista-de-autores.tsx`
- Test: `tests/unit/biblioteca-lista-de-autores.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-lista-de-autores.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ListaDeAutores } from "@/app/(app)/biblioteca/autores/lista-de-autores"
import type { AutorResumido } from "@/lib/dominio/biblioteca/autores"

const DANIELA = "11111111-2222-4333-8444-555555555555"
const ANA = "22222222-2222-4333-8444-555555555555"
const INSTITUTO = "33333333-2222-4333-8444-555555555555"
const AUTORES: AutorResumido[] = [
  {
    id: DANIELA,
    nombre: "Daniela Ruiz",
    credencial: "investigadora",
    tipo: "persona",
    alias: ["D. Ruiz"],
    materiales: 3,
    ideas: 12,
    temas: [
      { id: "t1", nombre: "Carga mental", ideas: 8 },
      { id: "t2", nombre: "Pausas", ideas: 4 },
    ],
  },
  { id: ANA, nombre: "Ana Pérez", credencial: null, tipo: "cuenta", alias: [], materiales: 1, ideas: 0, temas: [] },
  {
    id: INSTITUTO,
    nombre: "Instituto del Descanso",
    credencial: null,
    tipo: "institucion",
    alias: [],
    materiales: 0,
    ideas: 0,
    temas: [],
  },
]

function tarjeta(indice: number): HTMLElement {
  const encontrada = within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")[indice]
  if (!encontrada) throw new Error(`No hay tarjeta ${indice}`)
  return encontrada
}

describe("ListaDeAutores", () => {
  it("shows each author on the phone with kind, counts without zeros and top topics, and opens its page", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={null} />)
    expect(within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")).toHaveLength(3)
    expect(tarjeta(0)).toHaveTextContent("Persona · investigadora")
    expect(tarjeta(0)).toHaveTextContent("3 materiales · 12 ideas sacadas")
    expect(tarjeta(0)).toHaveTextContent("Carga mental · Pausas")
    expect(within(tarjeta(0)).getByRole("link")).toHaveAttribute("href", `/biblioteca/autores/${DANIELA}`)
    expect(tarjeta(1)).toHaveTextContent("Cuenta de redes")
    expect(tarjeta(1)).toHaveTextContent("1 material")
    expect(tarjeta(1)).not.toHaveTextContent("ideas sacadas")
  })

  it("says how to give an author material when it has none", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={null} />)
    expect(tarjeta(2)).toHaveTextContent("Todavía no hay material de esta persona. Súbelo desde Subir.")
    expect(within(tarjeta(2)).getByRole("link", { name: "Subir" })).toHaveAttribute("href", "/biblioteca/subir")
  })

  it("filters the cards and the table as she types, by name or alias, without accents or case (D5)", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={null} />)
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "D. RUÍZ" } })
    expect(within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")).toHaveLength(1)
    expect(within(screen.getByRole("table", { name: "Autores" })).getAllByRole("row")).toHaveLength(2)
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "zzz" } })
    expect(screen.getByText("Nadie se llama así todavía.")).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Autores" })).toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "" } })
    expect(within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")).toHaveLength(3)
  })

  it("on a computer is a table whose rows open the side panel with ?a, writing no zeros", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={DANIELA} />)
    const tabla = screen.getByRole("table", { name: "Autores" })
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((celda) => celda.textContent),
    ).toEqual(["Autor", "Tipo", "Temas", "Materiales", "Ideas sacadas"])
    const fila = within(tabla).getByRole("link", { name: "Daniela Ruiz" })
    expect(fila).toHaveAttribute("href", `/biblioteca/autores?a=${DANIELA}`)
    expect(fila).toHaveAttribute("data-abre-panel", DANIELA)
    expect(fila).toHaveAttribute("aria-current", "true")
    expect(within(tabla).getByRole("row", { name: /Instituto del Descanso/ })).not.toHaveTextContent("0")
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-lista-de-autores.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/autores/lista-de-autores"`.

- [ ] **Step 3: Write the four pieces.** Create `app/(app)/biblioteca/autores/sin-material.tsx`:

```tsx
import Link from "next/link"
import { RUTA_DE_SUBIR } from "@/lib/dominio/biblioteca/borrador-de-subida"

/** An author with no material and no idea (4i): instead of zeros, the way to give it some. */
export function SinMaterial() {
  return (
    <p className="text-meta text-apagado">
      Todavía no hay material de esta persona. Súbelo desde{" "}
      <Link href={RUTA_DE_SUBIR} className="font-semibold text-tinta underline decoration-1 underline-offset-4">
        Subir
      </Link>
      .
    </p>
  )
}
```

Create `app/(app)/biblioteca/autores/tarjeta-de-autor.tsx`:

```tsx
import Link from "next/link"
import { type AutorResumido, descripcionDeAutor, hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import { SinMaterial } from "./sin-material"

/** An author on the phone: the text opens its page; the way to give it material sits outside that link. */
export function TarjetaDeAutor({ autor }: { autor: AutorResumido }) {
  const cuentas = cuentasDeAutor(autor)
  return (
    <li className="grid gap-2 rounded-panel bg-piedra p-4 shadow-relieve">
      <Link href={hrefDeAutor(autor.id)} className="grid gap-1">
        <span className="text-cuerpo font-semibold text-balance text-tinta">{autor.nombre}</span>
        <span className="text-meta text-apagado">{descripcionDeAutor(autor)}</span>
        {cuentas ? <span className="text-meta text-apagado">{cuentas}</span> : null}
        {autor.temas.length > 0 ? (
          <span className="text-meta text-apagado">{autor.temas.map((tema) => tema.nombre).join(" · ")}</span>
        ) : null}
      </Link>
      {cuentas === null ? <SinMaterial /> : null}
    </li>
  )
}
```

Create `app/(app)/biblioteca/autores/tabla-de-autores.tsx`:

```tsx
import Link from "next/link"
import { type AutorResumido, hrefDeAutores } from "@/lib/dominio/biblioteca/autores"
import { etiquetaDeTipoDeAutor } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { cn } from "@/lib/utils"

// As the Materiales table: fixed widths for the short columns, the name takes the rest.
const COLUMNAS = [
  { nombre: "Autor", ancho: undefined },
  { nombre: "Tipo", ancho: "w-[8rem]" },
  { nombre: "Temas", ancho: "w-[12rem]" },
  { nombre: "Materiales", ancho: "w-[6.5rem]" },
  { nombre: PALABRAS.afirmaciones, ancho: "w-[7rem]" },
] as const
const CELDA = "px-2 py-3 text-cuerpo"
const NUMERO = `${CELDA} tabular-nums`

/** A zero is not written (4i). */
const cifra = (cantidad: number) => (cantidad > 0 ? cantidad : null)

/** The computer's authors: each row is a link to `?a=<id>`, so it opens the side panel and Back closes it. */
export function TablaDeAutores({ autores, seleccion }: { autores: AutorResumido[]; seleccion: string | null }) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Autores</caption>
      <colgroup>
        {COLUMNAS.map((columna) => (
          <col key={columna.nombre} className={columna.ancho} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b border-tinta">
          {COLUMNAS.map((columna) => (
            <th key={columna.nombre} scope="col" className="px-2 py-2 text-meta font-medium text-apagado">
              {columna.nombre}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {autores.map((autor) => {
          const elegido = autor.id === seleccion
          return (
            <tr key={autor.id} className={cn("border-b border-hilo", elegido && "bg-piedra-alta")}>
              <th scope="row" className={cn(CELDA, "px-3 font-semibold")}>
                <Link
                  href={hrefDeAutores(autor.id)}
                  scroll={false}
                  aria-current={elegido ? "true" : undefined}
                  data-abre-panel={autor.id}
                  className="text-balance text-tinta underline-offset-4 hover:underline"
                >
                  {autor.nombre}
                </Link>
              </th>
              <td className={CELDA}>{etiquetaDeTipoDeAutor(autor.tipo)}</td>
              <td className={CELDA}>{autor.temas.map((tema) => tema.nombre).join(" · ")}</td>
              <td className={NUMERO}>{cifra(autor.materiales)}</td>
              <td className={NUMERO}>{cifra(autor.ideas)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

Create `app/(app)/biblioteca/autores/lista-de-autores.tsx`:

```tsx
"use client"

import { useState } from "react"
import { type AutorResumido, buscarAutores } from "@/lib/dominio/biblioteca/autores"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { TablaDeAutores } from "./tabla-de-autores"
import { TarjetaDeAutor } from "./tarjeta-de-autor"

/** The search filters on the client (D5): one list read by the page, no request per key. */
export function ListaDeAutores({ autores, seleccion }: { autores: AutorResumido[]; seleccion: string | null }) {
  const [texto, setTexto] = useState("")
  const visibles = buscarAutores(autores, texto)
  return (
    <div className="grid gap-4">
      <div className="md:max-w-sm">
        <Campo id="buscar-autor" etiqueta="Buscar por nombre">
          <input
            id="buscar-autor"
            type="search"
            autoComplete="off"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
      </div>
      {visibles.length === 0 ? (
        <output className="text-cuerpo text-apagado">Nadie se llama así todavía.</output>
      ) : (
        <>
          <ul aria-label="Autores" className="grid gap-3 md:hidden">
            {visibles.map((autor) => (
              <TarjetaDeAutor key={autor.id} autor={autor} />
            ))}
          </ul>
          <div className="hidden md:block">
            <TablaDeAutores autores={visibles} seleccion={seleccion} />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run it green, with the words and design rules.**

Run: `pnpm exec vitest run tests/unit/biblioteca-lista-de-autores.test.tsx tests/unit/biblioteca-palabras.test.ts tests/unit/diseno-reglas.test.ts && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/autores" tests/unit/biblioteca-lista-de-autores.test.tsx
head -1 "app/(app)/biblioteca/autores/lista-de-autores.tsx"   # must print "use client"
git add "app/(app)/biblioteca/autores" tests/unit/biblioteca-lista-de-autores.test.tsx
git commit -m "$(cat <<'EOF'
List the authors as cards and as a table, with a search that stays on the page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 15: an author's side panel, and the Autores page

**Files:**
- Create: `app/(app)/biblioteca/autores/panel-de-autor.tsx`, `app/(app)/biblioteca/autores/page.tsx`
- Test: `tests/unit/biblioteca-panel-de-autor.test.tsx`, `tests/unit/biblioteca-pagina-autores.test.tsx`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/biblioteca-panel-de-autor.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PanelDeAutor } from "@/app/(app)/biblioteca/autores/panel-de-autor"
import type { AutorResumido } from "@/lib/dominio/biblioteca/autores"

const ID = "11111111-2222-4333-8444-555555555555"
const autor: AutorResumido = {
  id: ID,
  nombre: "Daniela Ruiz",
  credencial: "investigadora",
  tipo: "persona",
  alias: [],
  materiales: 3,
  ideas: 12,
  temas: [{ id: "t1", nombre: "Carga mental", ideas: 8 }],
}

describe("PanelDeAutor", () => {
  it("is a region named by the author, with kind, counts and its top topics as links", () => {
    render(<PanelDeAutor autor={autor} />)
    const region = screen.getByRole("region", { name: "Daniela Ruiz" })
    expect(region).toHaveTextContent("Persona · investigadora")
    expect(region).toHaveTextContent("3 materiales · 12 ideas sacadas")
    expect(within(region).getByRole("link", { name: "Carga mental" })).toHaveAttribute("href", "/biblioteca/temas/t1")
    expect(within(region).getByRole("link", { name: "Ver todo de Daniela Ruiz" })).toHaveAttribute(
      "href",
      `/biblioteca/autores/${ID}`,
    )
  })

  it("has its own close control and a heading the focus can land on", () => {
    render(<PanelDeAutor autor={autor} />)
    expect(screen.getByRole("link", { name: "Cerrar el panel" })).toHaveAttribute("href", "/biblioteca/autores")
    expect(screen.getByRole("link", { name: "Cerrar el panel" })).toHaveAttribute("data-cierra-panel", ID)
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "panel-titulo")
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("tabindex", "-1")
  })

  it("says how to give it material when it has none", () => {
    render(<PanelDeAutor autor={{ ...autor, materiales: 0, ideas: 0, temas: [] }} />)
    expect(screen.getByText(/Todavía no hay material de esta persona/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Temas" })).toBeNull()
  })
})
```

Create `tests/unit/biblioteca-pagina-autores.test.tsx` (Task 17 adds the detail page to it):

```tsx
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    resumirAutores: vi.fn(async (): Promise<unknown[]> => []),
    leerAutor: vi.fn(async (): Promise<unknown> => null),
    listarAutores: vi.fn(async (): Promise<unknown[]> => []),
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
vi.mock("@/lib/datos/biblioteca", () => datos)
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ unirAutoresAccion: vi.fn(), ocultarIdeaAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import { ListaDeAutores } from "@/app/(app)/biblioteca/autores/lista-de-autores"
import Autores from "@/app/(app)/biblioteca/autores/page"
import { PanelDeAutor } from "@/app/(app)/biblioteca/autores/panel-de-autor"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const ID = "11111111-2222-4333-8444-555555555555"
const AUTOR = {
  id: ID,
  nombre: "Daniela Ruiz",
  credencial: null,
  tipo: "persona",
  alias: [],
  materiales: 1,
  ideas: 2,
  temas: [],
}

beforeEach(() => vi.clearAllMocks())

describe("the Autores page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Autores({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.resumirAutores).not.toHaveBeenCalled()
  })

  it("gives the summary to the list, with the row chosen in the address", async () => {
    esConi.valor = true
    datos.resumirAutores.mockResolvedValueOnce([AUTOR])
    const arbol = elementos(await Autores({ searchParams: Promise.resolve({ a: ID }) }))
    const lista = arbol.find((elemento) => elemento.type === ListaDeAutores)
    expect(lista?.props.autores).toEqual([AUTOR])
    expect(lista?.props.seleccion).toBe(ID)
    expect(arbol.find((elemento) => elemento.type === PanelDeAutor)?.props.autor).toEqual(AUTOR)
  })

  it("says it found nobody for a chosen row that is not in the list, and hints with none", async () => {
    esConi.valor = true
    datos.resumirAutores.mockResolvedValue([AUTOR])
    const otro = elementos(
      await Autores({ searchParams: Promise.resolve({ a: "99999999-2222-4333-8444-555555555555" }) }),
    )
    expect(otro.some((elemento) => elemento.type === PanelDeAutor)).toBe(false)
    expect(otro.some((e) => e.props.children === "No encontré a esa persona. Elige otra de la tabla.")).toBe(true)
    const ninguno = elementos(await Autores({ searchParams: Promise.resolve({}) }))
    expect(
      ninguno.some(
        (e) => e.props.children === "Elige un autor de la tabla para ver aquí sus temas y sus ideas sacadas.",
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-panel-de-autor.test.tsx tests/unit/biblioteca-pagina-autores.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/autores/panel-de-autor"` (and `.../autores/page`).

- [ ] **Step 3: Write the panel and the page.** Create `app/(app)/biblioteca/autores/panel-de-autor.tsx`:

```tsx
import Link from "next/link"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import {
  type AutorResumido,
  descripcionDeAutor,
  hrefDeAutor,
  RUTA_DE_AUTORES,
} from "@/lib/dominio/biblioteca/autores"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { SinMaterial } from "./sin-material"

/** The computer's side panel of an author, built from the list already read (D4). */
export function PanelDeAutor({ autor }: { autor: AutorResumido }) {
  const cuentas = cuentasDeAutor(autor)
  return (
    <section aria-labelledby="panel-titulo" className="grid gap-6 rounded-panel bg-piedra-alta p-5">
      <p className="text-meta text-apagado">{descripcionDeAutor(autor)}</p>
      <h2 id="panel-titulo" tabIndex={-1} className="text-pieza text-balance">
        {autor.nombre}
      </h2>
      {cuentas ? <p className="text-cuerpo">{cuentas}</p> : <SinMaterial />}
      {autor.temas.length > 0 ? (
        <Seccion titulo="Temas" id="panel-temas" espacio="ninguno" nivel={3}>
          <ul className="grid">
            {autor.temas.map((tema) => (
              <li key={tema.id}>
                <Link href={hrefDeTema(tema.id)} className={clasesDeBoton({ variante: "callado" })}>
                  {tema.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}
      <Link href={hrefDeAutor(autor.id)} className={clasesDeBoton({ variante: "callado" })}>
        {`Ver todo de ${autor.nombre}`}
      </Link>
      <Link
        href={RUTA_DE_AUTORES}
        scroll={false}
        data-cierra-panel={autor.id}
        className={clasesDeBoton({ variante: "callado" })}
      >
        Cerrar el panel
      </Link>
    </section>
  )
}
```

Create `app/(app)/biblioteca/autores/page.tsx`:

```tsx
import { Panel } from "@/components/ui/panel"
import { resumirAutores } from "@/lib/datos/biblioteca"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { exigirConi } from "@/lib/sesion/coni"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { ListaDeAutores } from "./lista-de-autores"
import { PanelDeAutor } from "./panel-de-autor"

export default async function Autores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const seleccion = leerSeleccion(params, "a")
  const autores = await resumirAutores(db)
  const elegido = seleccion ? (autores.find((autor) => autor.id === seleccion) ?? null) : null

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
        <NavDeBiblioteca actual="autores" />
        <ListaDeAutores autores={autores} seleccion={seleccion} />
      </div>
      <aside
        aria-label="Autor elegido"
        className="hidden md:sticky md:top-24 md:block md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
        {elegido ? (
          <PanelDeAutor autor={elegido} />
        ) : (
          <Panel>
            <p className="text-cuerpo text-apagado">
              {seleccion
                ? "No encontré a esa persona. Elige otra de la tabla."
                : "Elige un autor de la tabla para ver aquí sus temas y sus ideas sacadas."}
            </p>
          </Panel>
        )}
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Run them green, and every unit test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-panel-de-autor.test.tsx tests/unit/biblioteca-pagina-autores.test.tsx && pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/autores" tests/unit/biblioteca-panel-de-autor.test.tsx tests/unit/biblioteca-pagina-autores.test.tsx
git add "app/(app)/biblioteca/autores" tests/unit/biblioteca-panel-de-autor.test.tsx tests/unit/biblioteca-pagina-autores.test.tsx
git commit -m "$(cat <<'EOF'
Add the Autores page with its desktop side panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 16: "Unir con otro autor"

**Files:**
- Create: `app/(app)/biblioteca/autores/[id]/unir-autores.tsx`
- Test: `tests/unit/biblioteca-unir-autores.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-unir-autores.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { unirAutoresAccion, push } = vi.hoisted(() => ({
  unirAutoresAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  push: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ unirAutoresAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))

import { UnirAutores } from "@/app/(app)/biblioteca/autores/[id]/unir-autores"

const ORIGEN = { id: "11111111-2222-4333-8444-555555555555", nombre: "D. Ruiz" }
const DANIELA = "22222222-2222-4333-8444-555555555555"
const CONI = "33333333-2222-4333-8444-555555555555"
const OTROS = [
  { id: DANIELA, nombre: "Daniela Ruiz", credencial: "investigadora", tipo: "persona", alias: [] },
  { id: CONI, nombre: "Constanza del Rosario", credencial: null, tipo: "coni", alias: ["Coni"] },
]

beforeEach(() => vi.clearAllMocks())

function elegir(texto: string, nombre: string) {
  fireEvent.click(screen.getByRole("button", { name: "Unir con otro autor" }))
  fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: texto } })
  fireEvent.click(within(screen.getByRole("list", { name: "Con quién unir" })).getByRole("button", { name: nombre }))
}

describe("UnirAutores (D7)", () => {
  it("opens a search, focused, that shows nothing until she types and says when nobody matches", async () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    fireEvent.click(screen.getByRole("button", { name: "Unir con otro autor" }))
    await waitFor(() => expect(screen.getByLabelText("Buscar por nombre")).toHaveFocus())
    expect(screen.queryByRole("list", { name: "Con quién unir" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "zzz" } })
    expect(screen.getByText("Nadie se llama así todavía.")).toBeInTheDocument()
  })

  it("asks before joining, naming both and saying it cannot be undone, then goes to the one that stayed", async () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("daniela", "Daniela Ruiz, investigadora")
    expect(
      screen.getByText(
        "Uno a D. Ruiz con Daniela Ruiz: sus materiales y sus ideas sacadas pasan a Daniela Ruiz, y D. Ruiz sale de la lista. No se puede deshacer.",
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, unir" }))
    await waitFor(() => expect(unirAutoresAccion).toHaveBeenCalledWith({ origen: ORIGEN.id, destino: DANIELA }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/biblioteca/autores/${DANIELA}`))
  })

  it("lets Coni be the one that stays, found by her alias", () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("coni", "Constanza del Rosario")
    expect(screen.getByRole("button", { name: "Sí, unir" })).toBeInTheDocument()
  })

  it("Elegir otro goes back to the search without joining", () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("daniela", "Daniela Ruiz, investigadora")
    fireEvent.click(screen.getByRole("button", { name: "Elegir otro" }))
    expect(screen.getByLabelText("Buscar por nombre")).toBeInTheDocument()
    expect(unirAutoresAccion).not.toHaveBeenCalled()
  })

  it("says a refusal inside the question and stays", async () => {
    unirAutoresAccion.mockResolvedValueOnce({ ok: false, error: "Ese autor ya no existe." })
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("daniela", "Daniela Ruiz, investigadora")
    fireEvent.click(screen.getByRole("button", { name: "Sí, unir" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese autor ya no existe.")
    expect(push).not.toHaveBeenCalled()
  })

  it("Cancelar closes it and gives the focus back", async () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    fireEvent.click(screen.getByRole("button", { name: "Unir con otro autor" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Unir con otro autor" })).toHaveFocus())
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-unir-autores.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/autores/[id]/unir-autores"`.

- [ ] **Step 3: Write the component.** Create `app/(app)/biblioteca/autores/[id]/unir-autores.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { useAccion } from "@/components/use-accion"
import { type AutorDeLista, buscarAutores, hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { unirAutoresAccion } from "../../acciones"
import { Campo, CLASES_DE_CAMPO } from "../../campo"

const MAXIMO_DE_RESULTADOS = 6

const descripcion = (autor: AutorDeLista) => (autor.credencial ? `${autor.nombre}, ${autor.credencial}` : autor.nombre)

const pregunta = (origen: string, destino: string) =>
  `Uno a ${origen} con ${destino}: sus materiales y sus ideas sacadas pasan a ${destino}, y ${origen} sale de la lista. No se puede deshacer.`

interface Propiedades {
  /** The author of the page: the one that disappears. Never Coni's own card (the page checks `sePuedeUnir`). */
  origen: { id: string; nombre: string }
  /** Every other author; Coni may be the one that stays. */
  otros: AutorDeLista[]
}

/** Ported from Ingesta's `unir-autores.tsx`, with the search instead of a select (D7). */
export function UnirAutores({ origen, otros }: Propiedades) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const [destino, setDestino] = useState<AutorDeLista | null>(null)
  // The element to focus only exists after the render that shows it.
  const [enfocar, setEnfocar] = useState<"busqueda" | "abrir" | null>(null)
  const busqueda = useRef<HTMLInputElement>(null)
  const abrir = useRef<HTMLButtonElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  useEffect(() => {
    const elemento = enfocar === "busqueda" ? busqueda.current : enfocar === "abrir" ? abrir.current : null
    if (!elemento) return
    elemento.focus()
    setEnfocar(null)
  }, [enfocar])

  function cerrar() {
    setAbierto(false)
    setTexto("")
    setDestino(null)
    limpiarError()
    setEnfocar("abrir")
  }

  if (!abierto) {
    return (
      <Boton
        ref={abrir}
        variante="secundario"
        tamano="chico"
        className="w-fit"
        onClick={() => {
          setAbierto(true)
          setEnfocar("busqueda")
        }}
      >
        Unir con otro autor
      </Boton>
    )
  }

  if (destino) {
    return (
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta={pregunta(origen.nombre, destino.nombre)}
        confirmar="Sí, unir"
        volver="Elegir otro"
        cargando={pendiente}
        error={error}
        alConfirmar={() =>
          ejecutar(
            () => unirAutoresAccion({ origen: origen.id, destino: destino.id }),
            () => router.push(hrefDeAutor(destino.id)),
          )
        }
        alVolver={() => {
          limpiarError()
          setDestino(null)
          setEnfocar("busqueda")
        }}
      />
    )
  }

  const buscado = texto.trim()
  const resultados = buscado === "" ? [] : buscarAutores(otros, buscado).slice(0, MAXIMO_DE_RESULTADOS)
  return (
    <section aria-label="Unir con otro autor" className="grid gap-3 rounded-panel bg-piedra-alta p-4">
      <p className="text-meta text-apagado">{`Elige con quién unir a ${origen.nombre}: la misma persona escrita de otra forma.`}</p>
      <Campo id="unir-buscar" etiqueta="Buscar por nombre">
        <input
          ref={busqueda}
          id="unir-buscar"
          type="search"
          autoComplete="off"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      {buscado === "" ? null : resultados.length === 0 ? (
        <output className="text-meta text-apagado">Nadie se llama así todavía.</output>
      ) : (
        <ul aria-label="Con quién unir" className="grid gap-2">
          {resultados.map((autor) => (
            <li key={autor.id}>
              <Boton variante="secundario" tamano="chico" className="w-full" onClick={() => setDestino(autor)}>
                {descripcion(autor)}
              </Boton>
            </li>
          ))}
        </ul>
      )}
      <Boton variante="callado" onClick={cerrar}>
        Cancelar
      </Boton>
    </section>
  )
}
```

- [ ] **Step 4: Run it green.**

Run: `pnpm exec vitest run tests/unit/biblioteca-unir-autores.test.tsx tests/unit/diseno-reglas.test.ts && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/autores/[id]/unir-autores.tsx" tests/unit/biblioteca-unir-autores.test.tsx
head -1 "app/(app)/biblioteca/autores/[id]/unir-autores.tsx"   # must print "use client"
git add "app/(app)/biblioteca/autores/[id]/unir-autores.tsx" tests/unit/biblioteca-unir-autores.test.tsx
git commit -m "$(cat <<'EOF'
Join an author with another found by the same search, after a question that names both

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 17: an author's page

**Files:**
- Create: `app/(app)/biblioteca/autores/[id]/page.tsx`
- Modify: `tests/unit/biblioteca-pagina-autores.test.tsx`

- [ ] **Step 1: Write the failing test.** In `tests/unit/biblioteca-pagina-autores.test.tsx`, add these imports next to the others:

```tsx
import DetalleDeAutor from "@/app/(app)/biblioteca/autores/[id]/page"
import { UnirAutores } from "@/app/(app)/biblioteca/autores/[id]/unir-autores"
import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import { MasOpciones } from "@/components/ui/mas-opciones"
import type { IdeaLeida } from "@/lib/dominio/biblioteca/ideas"
```

and append:

```tsx
const OTRO = "99999999-2222-4333-8444-555555555555"
const IDEA = { id: "i-1", texto: "Una idea", tipo: "dato", evidencia: "estudio" }
const OCULTA = { id: "i-2", texto: "Una oculta", tipo: "mito", evidencia: "opinion" }
const leido = (tipo: string) => ({
  autor: { id: ID, nombre: "Daniela Ruiz", credencial: null, tipo, alias: [] },
  materiales: 1,
  ideas: 1,
  grupos: [{ tema: { id: "t1", nombre: "Carga mental" }, ideas: [IDEA] }],
  ocultas: [OCULTA],
})
const LISTA = [
  { id: ID, nombre: "Daniela Ruiz", credencial: null, tipo: "persona", alias: [] },
  { id: OTRO, nombre: "D. Ruiz", credencial: null, tipo: "persona", alias: [] },
]
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

describe("an author's page", () => {
  it("refuses what is not an id before reading, and an author that does not exist", async () => {
    esConi.valor = true
    await expect(DetalleDeAutor(conId("no-es-un-id"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerAutor).not.toHaveBeenCalled()
    datos.leerAutor.mockResolvedValueOnce(null)
    await expect(DetalleDeAutor(conId(ID))).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("offers joining on another author's page, with everyone else to pick from", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("persona"))
    datos.listarAutores.mockResolvedValueOnce(LISTA)
    const unir = elementos(await DetalleDeAutor(conId(ID))).find((elemento) => elemento.type === UnirAutores)
    expect(unir?.props.origen).toEqual({ id: ID, nombre: "Daniela Ruiz" })
    expect((unir?.props.otros as { id: string }[]).map((autor) => autor.id)).toEqual([OTRO])
  })

  it("never offers joining on Coni's own page", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("coni"))
    const arbol = elementos(await DetalleDeAutor(conId(ID)))
    expect(arbol.some((elemento) => elemento.type === UnirAutores)).toBe(false)
  })

  it("folds the hidden ideas under «Ideas ocultas (N)», each with Mostrar that redraws in place", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("persona"))
    const arbol = elementos(await DetalleDeAutor(conId(ID)))
    expect(arbol.find((elemento) => elemento.type === MasOpciones)?.props.titulo).toBe("Ideas ocultas (1)")
    const ocultas = arbol.find((elemento) => elemento.type === ListaDeIdeas && elemento.props.etiqueta === "Ideas ocultas")
    const accion = ocultas?.props.accion as (idea: IdeaLeida) => Elemento
    const boton = accion(OCULTA)
    expect(boton.type).toBe(BotonOcultar)
    expect(boton.props).toEqual({ ideaId: "i-2", oculta: true, despues: null })
    const visibles = arbol.find(
      (elemento) => elemento.type === ListaDeIdeas && elemento.props.etiqueta === "Ideas sobre Carga mental",
    )
    expect(visibles?.props.accion).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-autores.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/autores/[id]/page"`.

- [ ] **Step 3: Write the page.** Create `app/(app)/biblioteca/autores/[id]/page.tsx`:

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Volver } from "@/components/ui/volver"
import { leerAutor, listarAutores } from "@/lib/datos/biblioteca"
import { descripcionDeAutor, RUTA_DE_AUTORES, sePuedeUnir } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { BotonOcultar } from "../../boton-ocultar"
import { ListaDeIdeas } from "../../lista-de-ideas"
import { SinMaterial } from "../sin-material"
import { UnirAutores } from "./unir-autores"

/** One author (ported from Ingesta's `autores/[id]/page.tsx`): its ideas by topic, the hidden ones, and joining. */
export default async function DetalleDeAutor({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const [leido, autores] = await Promise.all([leerAutor(db, valido.data), listarAutores(db)])
  if (!leido) notFound()
  const { autor, materiales, ideas, grupos, ocultas } = leido
  const cuentas = cuentasDeAutor({ materiales, ideas })

  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_AUTORES}>Autores</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">{autor.nombre}</h1>
        <p className="text-meta text-apagado">{descripcionDeAutor(autor)}</p>
        {cuentas ? <p className="text-cuerpo">{cuentas}</p> : <SinMaterial />}
      </header>

      {grupos.map((grupo) => {
        const idDelTitulo = `grupo-${grupo.tema?.id ?? "sin-tema"}`
        return (
          <section key={idDelTitulo} aria-labelledby={idDelTitulo} className="grid gap-3">
            <h2 id={idDelTitulo} className="text-pieza text-balance">
              {grupo.tema ? (
                <Link href={hrefDeTema(grupo.tema.id)} className="underline decoration-1 underline-offset-4">
                  {grupo.tema.nombre}
                </Link>
              ) : (
                "Sin tema todavía"
              )}
            </h2>
            <ListaDeIdeas
              etiqueta={grupo.tema ? `Ideas sobre ${grupo.tema.nombre}` : "Ideas sin tema todavía"}
              ideas={grupo.ideas}
            />
          </section>
        )
      })}

      {ocultas.length > 0 ? (
        <MasOpciones titulo={`Ideas ocultas (${ocultas.length})`}>
          <div className="pb-4">
            <ListaDeIdeas
              etiqueta="Ideas ocultas"
              ideas={ocultas}
              accion={(idea) => <BotonOcultar ideaId={idea.id} oculta despues={null} />}
            />
          </div>
        </MasOpciones>
      ) : null}

      {sePuedeUnir(autor) ? (
        <UnirAutores
          origen={{ id: autor.id, nombre: autor.nombre }}
          otros={autores.filter((otro) => otro.id !== autor.id)}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run it green, and every unit test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-autores.test.tsx && pnpm test:run && pnpm type`
Expected: PASS. (The tree test reaches `ListaDeIdeas` through `MasOpciones`' `children` and the extra `div`, both plain props.)

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/autores/[id]/page.tsx" tests/unit/biblioteca-pagina-autores.test.tsx
git add "app/(app)/biblioteca/autores/[id]/page.tsx" tests/unit/biblioteca-pagina-autores.test.tsx
git commit -m "$(cat <<'EOF'
Add an author's page: its ideas by topic, the hidden ones and joining

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part D: Temas

### Task 18: a topic as a card, as a row and in the side panel

**Files:**
- Create: `app/(app)/biblioteca/temas/insignias.tsx`, `tarjeta-de-tema.tsx`, `tabla-de-temas.tsx`, `panel-de-tema.tsx`
- Test: `tests/unit/biblioteca-temas-piezas.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-temas-piezas.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PanelDeTema } from "@/app/(app)/biblioteca/temas/panel-de-tema"
import { TablaDeTemas } from "@/app/(app)/biblioteca/temas/tabla-de-temas"
import { TarjetaDeTema } from "@/app/(app)/biblioteca/temas/tarjeta-de-tema"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"

const CARGA = "11111111-2222-4333-8444-555555555555"
const PAUSAS = "22222222-2222-4333-8444-555555555555"
const PILAR = "33333333-2222-4333-8444-555555555555"
const carga: TemaResumido = {
  id: CARGA,
  nombre: "Carga mental",
  descripcion: "El peso de lo que nadie ve.",
  pilarId: PILAR,
  ideas: 12,
  autores: 3,
  cubiertoPorConi: true,
}
const pausas: TemaResumido = {
  id: PAUSAS,
  nombre: "Pausas activas",
  descripcion: null,
  pilarId: null,
  ideas: 1,
  autores: 1,
  cubiertoPorConi: false,
}

const enLista = (tema: TemaResumido) =>
  render(
    <ul>
      <TarjetaDeTema tema={tema} />
    </ul>,
  )

describe("TarjetaDeTema", () => {
  it("shows the name and the counts without zeros, and opens the topic", () => {
    enLista(carga)
    const tarjeta = screen.getByRole("listitem")
    expect(tarjeta).toHaveTextContent("12 ideas sacadas · 3 autores")
    expect(within(tarjeta).getByRole("link")).toHaveAttribute("href", `/biblioteca/temas/${CARGA}`)
  })

  it("says «Ya lo traté» and «Un solo autor» only when they apply", () => {
    const { unmount } = enLista(carga)
    expect(screen.getByText("Ya lo traté")).toBeInTheDocument()
    expect(screen.queryByText("Un solo autor")).toBeNull()
    unmount()
    enLista(pausas)
    expect(screen.getByRole("listitem")).toHaveTextContent("1 idea sacada · 1 autor")
    expect(screen.getByText("Un solo autor")).toBeInTheDocument()
    expect(screen.queryByText("Ya lo traté")).toBeNull()
  })
})

describe("TablaDeTemas", () => {
  it("has three columns, rows that open the side panel with ?t keeping the filters, and badges under the name", () => {
    render(
      <TablaDeTemas temas={[carga, pausas]} filtros={{ cobertura: "tratados", pilar: PILAR }} seleccion={CARGA} />,
    )
    const tabla = screen.getByRole("table", { name: "Temas" })
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((celda) => celda.textContent),
    ).toEqual(["Tema", "Ideas sacadas", "Autores"])
    const fila = within(tabla).getByRole("link", { name: "Carga mental" })
    expect(fila).toHaveAttribute("href", `/biblioteca/temas?pilar=${PILAR}&cobertura=tratados&t=${CARGA}`)
    expect(fila).toHaveAttribute("data-abre-panel", CARGA)
    expect(fila).toHaveAttribute("aria-current", "true")
    expect(within(tabla).getByRole("row", { name: /Carga mental/ })).toHaveTextContent("Ya lo traté")
  })
})

describe("PanelDeTema", () => {
  it("is a region named by the topic, with its description, counts, badges and the way to its ideas", () => {
    render(<PanelDeTema tema={carga} filtros={{ cobertura: "tratados" }} />)
    const region = screen.getByRole("region", { name: "Carga mental" })
    expect(region).toHaveTextContent("El peso de lo que nadie ve.")
    expect(region).toHaveTextContent("12 ideas sacadas · 3 autores")
    expect(region).toHaveTextContent("Ya lo traté")
    expect(within(region).getByRole("link", { name: "Ver sus ideas" })).toHaveAttribute(
      "href",
      `/biblioteca/temas/${CARGA}`,
    )
    const cerrar = within(region).getByRole("link", { name: "Cerrar el panel" })
    expect(cerrar).toHaveAttribute("href", "/biblioteca/temas?cobertura=tratados")
    expect(cerrar).toHaveAttribute("data-cierra-panel", CARGA)
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "panel-titulo")
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("tabindex", "-1")
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-temas-piezas.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/temas/panel-de-tema"`.

- [ ] **Step 3: Write the four pieces.** Create `app/(app)/biblioteca/temas/insignias.tsx`:

```tsx
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"

function Insignia({ texto }: { texto: string }) {
  return (
    <span className="w-fit rounded-casilla bg-piedra-honda px-2.5 py-1 text-meta font-semibold text-tinta">{texto}</span>
  )
}

/** Ported from Ingesta's `TarjetaDeTema`. "Ya lo traté" is the view's `cubierto_por_coni`. */
export function Insignias({ tema }: { tema: Pick<TemaResumido, "cubiertoPorConi" | "autores"> }) {
  if (!tema.cubiertoPorConi && tema.autores !== 1) return null
  return (
    <span className="flex flex-wrap gap-2">
      {tema.cubiertoPorConi ? <Insignia texto="Ya lo traté" /> : null}
      {tema.autores === 1 ? <Insignia texto="Un solo autor" /> : null}
    </span>
  )
}
```

Create `app/(app)/biblioteca/temas/tarjeta-de-tema.tsx`:

```tsx
import Link from "next/link"
import { cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import { Insignias } from "./insignias"

/** A topic on the phone: the text opens its page. */
export function TarjetaDeTema({ tema }: { tema: TemaResumido }) {
  return (
    <li className="grid gap-2 rounded-panel bg-piedra p-4 shadow-relieve">
      <Link href={hrefDeTema(tema.id)} className="grid gap-1">
        <span className="text-cuerpo font-semibold text-balance text-tinta">{tema.nombre}</span>
        <span className="text-meta text-apagado">{cuentasDeTema(tema)}</span>
      </Link>
      <Insignias tema={tema} />
    </li>
  )
}
```

Create `app/(app)/biblioteca/temas/tabla-de-temas.tsx`:

```tsx
import Link from "next/link"
import { type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import { cn } from "@/lib/utils"
import { Insignias } from "./insignias"

const COLUMNAS = [
  { nombre: "Tema", ancho: undefined },
  { nombre: PALABRAS.afirmaciones, ancho: "w-[8rem]" },
  { nombre: "Autores", ancho: "w-[6.5rem]" },
] as const
const CELDA = "px-2 py-3 text-cuerpo"

interface Propiedades {
  temas: TemaResumido[]
  filtros: FiltrosDeTemas
  seleccion: string | null
}

/** The computer's topics: each row is a link to `?t=<id>` that keeps the filters, so Back closes the panel. */
export function TablaDeTemas({ temas, filtros, seleccion }: Propiedades) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Temas</caption>
      <colgroup>
        {COLUMNAS.map((columna) => (
          <col key={columna.nombre} className={columna.ancho} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b border-tinta">
          {COLUMNAS.map((columna) => (
            <th key={columna.nombre} scope="col" className="px-2 py-2 text-meta font-medium text-apagado">
              {columna.nombre}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {temas.map((tema) => {
          const elegido = tema.id === seleccion
          return (
            <tr key={tema.id} className={cn("border-b border-hilo", elegido && "bg-piedra-alta")}>
              <th scope="row" className={cn(CELDA, "px-3 font-semibold")}>
                {/* The grid lives inside the cell: a grid on the th itself would take it out of the table's layout. */}
                <div className="grid gap-1.5">
                  <Link
                    href={hrefDeTemas(filtros, tema.id)}
                    scroll={false}
                    aria-current={elegido ? "true" : undefined}
                    data-abre-panel={tema.id}
                    className="w-fit text-balance text-tinta underline-offset-4 hover:underline"
                  >
                    {tema.nombre}
                  </Link>
                  <Insignias tema={tema} />
                </div>
              </th>
              <td className={`${CELDA} tabular-nums`}>{tema.ideas}</td>
              <td className={`${CELDA} tabular-nums`}>{tema.autores}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

Create `app/(app)/biblioteca/temas/panel-de-tema.tsx`:

```tsx
import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import { type FiltrosDeTemas, hrefDeTema, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import { Insignias } from "./insignias"

/** The computer's side panel of a topic, built from the list already read (D4); closing keeps the filters. */
export function PanelDeTema({ tema, filtros }: { tema: TemaResumido; filtros: FiltrosDeTemas }) {
  return (
    <section aria-labelledby="panel-titulo" className="grid gap-6 rounded-panel bg-piedra-alta p-5">
      <h2 id="panel-titulo" tabIndex={-1} className="text-pieza text-balance">
        {tema.nombre}
      </h2>
      {tema.descripcion ? <p className="text-cuerpo">{tema.descripcion}</p> : null}
      <p className="text-meta text-apagado">{cuentasDeTema(tema)}</p>
      <Insignias tema={tema} />
      <Link href={hrefDeTema(tema.id)} className={clasesDeBoton({ variante: "callado" })}>
        Ver sus ideas
      </Link>
      <Link
        href={hrefDeTemas(filtros)}
        scroll={false}
        data-cierra-panel={tema.id}
        className={clasesDeBoton({ variante: "callado" })}
      >
        Cerrar el panel
      </Link>
    </section>
  )
}
```

- [ ] **Step 4: Run it green, with the words and design rules.**

Run: `pnpm exec vitest run tests/unit/biblioteca-temas-piezas.test.tsx tests/unit/biblioteca-palabras.test.ts tests/unit/diseno-reglas.test.ts && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/temas" tests/unit/biblioteca-temas-piezas.test.tsx
git add "app/(app)/biblioteca/temas" tests/unit/biblioteca-temas-piezas.test.tsx
git commit -m "$(cat <<'EOF'
Draw a topic as a card, a table row and a side panel, with its badges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 19: the quick filters by coverage, and the pillar under "Más filtros"

**Files:**
- Create: `app/(app)/biblioteca/temas/filtros-de-cobertura.tsx`, `app/(app)/biblioteca/temas/mas-filtros-de-temas.tsx`
- Modify: `app/(app)/biblioteca/formulario-de-filtros.tsx`
- Test: `tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn() }) }))

import { FormularioDeFiltros } from "@/app/(app)/biblioteca/formulario-de-filtros"
import { FiltrosDeCobertura } from "@/app/(app)/biblioteca/temas/filtros-de-cobertura"
import { MasFiltrosDeTemas } from "@/app/(app)/biblioteca/temas/mas-filtros-de-temas"

const PILAR = "11111111-2222-4333-8444-555555555555"
const OTRO = "22222222-2222-4333-8444-555555555555"
const PILARES = [
  { id: PILAR, nombre: "IA y salud mental" },
  { id: OTRO, nombre: "Ética y regulación" },
]
const CONTEOS = { "sin-tratar": 2, tratados: 0, "un-autor": 1 }

beforeEach(() => vi.clearAllMocks())

describe("FiltrosDeCobertura (Coni's option 1)", () => {
  it("offers the four in one tap each, with counts and no zeros, keeping the pillar", () => {
    render(<FiltrosDeCobertura filtros={{ pilar: PILAR }} conteos={CONTEOS} />)
    const grupo = screen.getByRole("group", { name: "Filtrar temas" })
    expect(
      within(grupo)
        .getAllByRole("link")
        .map((enlace) => enlace.textContent),
    ).toEqual(["Todos", "Sin tratar · 2", "Ya los traté", "Un solo autor · 1"])
    expect(within(grupo).getByRole("link", { name: "Sin tratar · 2" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?pilar=${PILAR}&cobertura=sin-tratar`,
    )
    expect(within(grupo).getByRole("link", { name: "Todos" })).toHaveAttribute("href", `/biblioteca/temas?pilar=${PILAR}`)
    expect(within(grupo).getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")
  })

  it("marks the one in the address", () => {
    render(<FiltrosDeCobertura filtros={{ cobertura: "un-autor" }} conteos={CONTEOS} />)
    expect(screen.getByRole("link", { name: "Un solo autor · 1" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current")
  })
})

describe("MasFiltrosDeTemas", () => {
  it("folds the active pillars and carries the coverage as a hidden field", () => {
    const { container } = render(<MasFiltrosDeTemas filtros={{ cobertura: "tratados" }} pilares={PILARES} />)
    expect(screen.getByText("Más filtros")).toBeInTheDocument()
    expect(container.querySelector("details")).not.toHaveAttribute("open")
    expect(
      within(screen.getByLabelText("Pilar"))
        .getAllByRole("option")
        .map((opcion) => opcion.textContent),
    ).toEqual(["Todos", "IA y salud mental", "Ética y regulación"])
    expect(container.querySelector('input[type="hidden"][name="cobertura"]')).toHaveAttribute("value", "tratados")
    expect(screen.queryByRole("link", { name: "Quitar este filtro" })).toBeNull()
  })

  it("with a pillar on comes open, says how many, and takes it out keeping the coverage", () => {
    const { container } = render(
      <MasFiltrosDeTemas filtros={{ cobertura: "tratados", pilar: PILAR }} pilares={PILARES} />,
    )
    expect(screen.getByText("Más filtros · 1")).toBeInTheDocument()
    expect(container.querySelector("details")).toHaveAttribute("open")
    expect(screen.getByLabelText("Pilar")).toHaveValue(PILAR)
    expect(screen.getByRole("link", { name: "Quitar este filtro" })).toHaveAttribute(
      "href",
      "/biblioteca/temas?cobertura=tratados",
    )
  })
})

describe("FormularioDeFiltros", () => {
  it("sends Temas' filters to Temas' own address, leaving an empty select out", () => {
    const { container } = render(
      <FormularioDeFiltros seccion="temas">
        <input type="hidden" name="cobertura" value="tratados" />
        <select name="pilar" defaultValue="">
          <option value="">Todos</option>
        </select>
      </FormularioDeFiltros>,
    )
    const formulario = container.querySelector("form")
    if (!formulario) throw new Error("Falta el formulario")
    expect(formulario).toHaveAttribute("action", "/biblioteca/temas")
    fireEvent.submit(formulario)
    expect(push).toHaveBeenCalledWith("/biblioteca/temas?cobertura=tratados", { scroll: false })
  })

  it("still sends Materiales' filters to Materiales by default", () => {
    const { container } = render(
      <FormularioDeFiltros>
        <input type="hidden" name="estado" value="listo" />
      </FormularioDeFiltros>,
    )
    const formulario = container.querySelector("form")
    if (!formulario) throw new Error("Falta el formulario")
    fireEvent.submit(formulario)
    expect(push).toHaveBeenCalledWith("/biblioteca?estado=listo", { scroll: false })
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/temas/filtros-de-cobertura"`.

- [ ] **Step 3: Write the code.** Replace `app/(app)/biblioteca/formulario-de-filtros.tsx` with:

```tsx
"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { hrefDeLista, leerFiltros, RUTA_DE_MATERIALES } from "@/lib/dominio/biblioteca/filtros"
import { hrefDeTemas, leerFiltrosDeTemas, RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"

type Params = Record<string, string>

// A server component cannot pass a function to this client form, so each section is named instead.
const SECCIONES = {
  materiales: { ruta: RUTA_DE_MATERIALES, href: (params: Params) => hrefDeLista(leerFiltros(params)) },
  temas: { ruta: RUTA_DE_TEMAS, href: (params: Params) => hrefDeTemas(leerFiltrosDeTemas(params)) },
} as const

interface Propiedades {
  className?: string
  /** Whose filters these are: Materiales unless said. */
  seccion?: keyof typeof SECCIONES
  children: ReactNode
}

/**
 * A GET form that works without scripts; with them, it goes to the section's own address, so an empty select
 * ("Todos") stays out of the URL and the order of the params is the one every link uses.
 */
export function FormularioDeFiltros({ className, seccion = "materiales", children }: Propiedades) {
  const router = useRouter()
  const { ruta, href } = SECCIONES[seccion]
  return (
    <form
      method="get"
      action={ruta}
      className={className}
      onSubmit={(evento) => {
        evento.preventDefault()
        const params: Params = {}
        for (const [clave, valor] of new FormData(evento.currentTarget)) {
          if (typeof valor === "string") params[clave] = valor
        }
        router.push(href(params), { scroll: false })
      }}
    >
      {children}
    </form>
  )
}
```

Create `app/(app)/biblioteca/temas/filtros-de-cobertura.tsx`:

```tsx
import { Check } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import { type Cobertura, type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { cn } from "@/lib/utils"

interface Propiedades {
  filtros: FiltrosDeTemas
  conteos: Record<Cobertura, number>
}

/** Coni's option 1, one tap each, as Materiales' quick filters: links that keep the pillar and close the panel. */
export function FiltrosDeCobertura({ filtros, conteos }: Propiedades) {
  const opciones: { cobertura: Cobertura | undefined; texto: string }[] = [
    { cobertura: undefined, texto: "Todos" },
    { cobertura: "sin-tratar", texto: conCuenta("Sin tratar", conteos["sin-tratar"]) },
    { cobertura: "tratados", texto: conCuenta("Ya los traté", conteos.tratados) },
    { cobertura: "un-autor", texto: conCuenta("Un solo autor", conteos["un-autor"]) },
  ]
  return (
    <fieldset aria-label="Filtrar temas" className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      {opciones.map(({ cobertura, texto }) => {
        const actual = filtros.cobertura === cobertura
        return (
          <Link
            key={cobertura ?? "todos"}
            href={hrefDeTemas({ ...filtros, cobertura })}
            scroll={false}
            aria-current={actual ? "page" : undefined}
            className={cn(
              FORMA_DE_CHIP,
              TRANSICION_DE_CHIP,
              "aria-[current=page]:bg-tinta aria-[current=page]:text-luz",
            )}
          >
            {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
            {texto}
          </Link>
        )
      })}
    </fieldset>
  )
}
```

Create `app/(app)/biblioteca/temas/mas-filtros-de-temas.tsx`:

```tsx
import { Funnel } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { MasOpciones } from "@/components/ui/mas-opciones"
import type { Pilar } from "@/lib/datos/biblioteca"
import { type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { FormularioDeFiltros } from "../formulario-de-filtros"

/** The pillar, folded behind a chip in the row of the quick filters (as Materiales' "Más filtros"). */
export function MasFiltrosDeTemas({ filtros, pilares }: { filtros: FiltrosDeTemas; pilares: Pilar[] }) {
  const activos = filtros.pilar ? 1 : 0
  return (
    <MasOpciones
      titulo={activos === 0 ? "Más filtros" : `Más filtros · ${activos}`}
      forma="boton"
      icono={<Funnel aria-hidden="true" size={ICONO.chico} />}
      abiertaAlInicio={activos > 0}
      className="open:basis-full [&>summary]:w-fit [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:text-meta"
    >
      {/* The select is uncontrolled: a new key remounts it when the URL changes. */}
      <FormularioDeFiltros key={JSON.stringify(filtros)} seccion="temas" className="grid gap-3 md:max-w-sm">
        {filtros.cobertura ? <input type="hidden" name="cobertura" value={filtros.cobertura} /> : null}
        <Campo id="filtro-pilar" etiqueta="Pilar">
          <select id="filtro-pilar" name="pilar" defaultValue={filtros.pilar ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {pilares.map((pilar) => (
              <option key={pilar.id} value={pilar.id}>
                {pilar.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Boton type="submit" variante="secundario" tamano="chico">
          Filtrar
        </Boton>
        {filtros.pilar ? (
          <Link href={hrefDeTemas({ cobertura: filtros.cobertura })} className={clasesDeBoton({ variante: "callado" })}>
            Quitar este filtro
          </Link>
        ) : null}
      </FormularioDeFiltros>
    </MasOpciones>
  )
}
```

(`import type { Pilar } from "@/lib/datos/biblioteca"` is type only: nothing of the reader reaches the screen's bundle.)

- [ ] **Step 4: Run it green, with Materiales' filters.**

Run: `pnpm exec vitest run tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx tests/unit/biblioteca-filtros-pantalla.test.tsx && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/formulario-de-filtros.tsx" "app/(app)/biblioteca/temas" tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx
head -1 "app/(app)/biblioteca/formulario-de-filtros.tsx"   # must print "use client"
git add "app/(app)/biblioteca/formulario-de-filtros.tsx" "app/(app)/biblioteca/temas" tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx
git commit -m "$(cat <<'EOF'
Filter the topics by coverage in one tap and by pillar under Más filtros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 20: the Temas page

**Files:**
- Create: `app/(app)/biblioteca/temas/page.tsx`
- Test: `tests/unit/biblioteca-pagina-temas.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-pagina-temas.test.tsx` (Task 21 adds the topic's page to it):

```tsx
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    listarTemas: vi.fn(async (..._: unknown[]): Promise<unknown[]> => []),
    listarPilaresDeTemas: vi.fn(async (): Promise<unknown[]> => []),
    leerTema: vi.fn(async (): Promise<unknown> => null),
    destinoDeTema: vi.fn(async (): Promise<string | null> => null),
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
vi.mock("@/lib/datos/biblioteca", () => datos)
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ unirAutoresAccion: vi.fn(), ocultarIdeaAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import { FiltrosDeCobertura } from "@/app/(app)/biblioteca/temas/filtros-de-cobertura"
import Temas from "@/app/(app)/biblioteca/temas/page"
import { PanelDeTema } from "@/app/(app)/biblioteca/temas/panel-de-tema"
import { TarjetaDeTema } from "@/app/(app)/biblioteca/temas/tarjeta-de-tema"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { AVISO_TRAS_OCULTAR_LA_ULTIMA } from "@/lib/dominio/biblioteca/filtros-de-temas"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const PILAR = "11111111-2222-4333-8444-555555555555"
const OTRO = "99999999-2222-4333-8444-555555555555"
const CARGA = "22222222-2222-4333-8444-555555555555"
const PAUSAS = "33333333-2222-4333-8444-555555555555"
const IDEA = "44444444-2222-4333-8444-555555555555"
const carga = { id: CARGA, nombre: "Carga mental", descripcion: null, pilarId: PILAR, ideas: 3, autores: 2, cubiertoPorConi: true }
const pausas = { id: PAUSAS, nombre: "Pausas", descripcion: null, pilarId: null, ideas: 1, autores: 1, cubiertoPorConi: false }
const conParams = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) })
const textos = (arbol: Elemento[]) => arbol.map((elemento) => elemento.props.children).filter((c) => typeof c === "string")

beforeEach(() => vi.clearAllMocks())

describe("the Temas page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Temas(conParams({}))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.listarTemas).not.toHaveBeenCalled()
    expect(datos.listarPilaresDeTemas).not.toHaveBeenCalled()
  })

  it("narrows by an active pillar, and ignores one that is not", async () => {
    esConi.valor = true
    datos.listarPilaresDeTemas.mockResolvedValue([{ id: PILAR, nombre: "IA y salud mental" }])
    await Temas(conParams({ pilar: PILAR }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { pilar: PILAR })
    await Temas(conParams({ pilar: OTRO }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { pilar: undefined })
  })

  it("shows the topics of the coverage chosen, counting the coverages over the pillar's topics", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga, pausas])
    const arbol = elementos(await Temas(conParams({ cobertura: "tratados" })))
    const tarjetas = arbol.filter((elemento) => elemento.type === TarjetaDeTema)
    expect(tarjetas.map((tarjeta) => (tarjeta.props.tema as { id: string }).id)).toEqual([CARGA])
    expect(arbol.find((elemento) => elemento.type === FiltrosDeCobertura)?.props.conteos).toEqual({
      "sin-tratar": 1,
      tratados: 1,
      "un-autor": 1,
    })
  })

  it("says why the list is empty, with filters and without", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([pausas])
    expect(textos(elementos(await Temas(conParams({ cobertura: "tratados" }))))).toContain(
      "Ningún tema coincide con esos filtros.",
    )
    datos.listarTemas.mockResolvedValueOnce([])
    expect(textos(elementos(await Temas(conParams({}))))).toContain(
      "Los temas aparecen solos cuando varias ideas sacadas hablan de lo mismo. Sube más material de distintos autores.",
    )
  })

  it("says the note after hiding a topic's last idea, and opens the chosen topic in the side panel", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga])
    const arbol = elementos(await Temas(conParams({ oculta: IDEA, t: CARGA })))
    expect(arbol.find((elemento) => elemento.type === LineaDeEstado)?.props.titulo).toBe(AVISO_TRAS_OCULTAR_LA_ULTIMA)
    expect(arbol.find((elemento) => elemento.type === PanelDeTema)?.props.tema).toEqual(carga)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-temas.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/temas/page"`.

- [ ] **Step 3: Write the page.** Create `app/(app)/biblioteca/temas/page.tsx`:

```tsx
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { listarPilaresDeTemas, listarTemas } from "@/lib/datos/biblioteca"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import {
  AVISO_TRAS_OCULTAR_LA_ULTIMA,
  contarCoberturas,
  filtrarPorCobertura,
  hayFiltrosDeTemas,
  leerFiltrosDeTemas,
  leerIdeaOculta,
} from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { FiltrosDeCobertura } from "./filtros-de-cobertura"
import { MasFiltrosDeTemas } from "./mas-filtros-de-temas"
import { PanelDeTema } from "./panel-de-tema"
import { TablaDeTemas } from "./tabla-de-temas"
import { TarjetaDeTema } from "./tarjeta-de-tema"

export default async function Temas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const pilares = await listarPilaresDeTemas(db)
  const filtros = leerFiltrosDeTemas(
    params,
    pilares.map((pilar) => pilar.id),
  )
  const seleccion = leerSeleccion(params, "t")
  // The pillar narrows what is read; the coverage splits it, so its counts are the pillar's.
  const temas = await listarTemas(db, { pilar: filtros.pilar })
  const visibles = filtrarPorCobertura(temas, filtros.cobertura)
  const elegido = seleccion ? (temas.find((tema) => tema.id === seleccion) ?? null) : null

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
        {leerIdeaOculta(params) ? <LineaDeEstado tipo="neutro" titulo={AVISO_TRAS_OCULTAR_LA_ULTIMA} /> : null}
        <NavDeBiblioteca actual="temas" />
        <div className="flex flex-wrap items-start gap-2">
          <FiltrosDeCobertura filtros={filtros} conteos={contarCoberturas(temas)} />
          <MasFiltrosDeTemas filtros={filtros} pilares={pilares} />
        </div>
        {visibles.length === 0 ? (
          <p className="text-cuerpo text-apagado">
            {hayFiltrosDeTemas(filtros)
              ? "Ningún tema coincide con esos filtros."
              : "Los temas aparecen solos cuando varias ideas sacadas hablan de lo mismo. Sube más material de distintos autores."}
          </p>
        ) : (
          <>
            <ul aria-label="Temas" className="grid gap-3 md:hidden">
              {visibles.map((tema) => (
                <TarjetaDeTema key={tema.id} tema={tema} />
              ))}
            </ul>
            <div className="hidden md:block">
              <TablaDeTemas temas={visibles} filtros={filtros} seleccion={seleccion} />
            </div>
          </>
        )}
      </div>
      <aside
        aria-label="Tema elegido"
        className="hidden md:sticky md:top-24 md:block md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
        {elegido ? (
          <PanelDeTema tema={elegido} filtros={filtros} />
        ) : (
          <Panel>
            <p className="text-cuerpo text-apagado">
              {seleccion
                ? "No encontré ese tema. Elige otro de la tabla."
                : "Elige un tema de la tabla para ver aquí cuántas ideas sacadas tiene y de quiénes."}
            </p>
          </Panel>
        )}
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Run it green, and every unit test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-temas.test.tsx && pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/temas/page.tsx" tests/unit/biblioteca-pagina-temas.test.tsx
git add "app/(app)/biblioteca/temas/page.tsx" tests/unit/biblioteca-pagina-temas.test.tsx
git commit -m "$(cat <<'EOF'
Add the Temas page with its quick filters, pillar and desktop side panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 21: a topic's page, its merged addresses, and Ocultar

**Files:**
- Create: `app/(app)/biblioteca/temas/[id]/page.tsx`
- Modify: `tests/unit/biblioteca-pagina-temas.test.tsx`

- [ ] **Step 1: Write the failing test.** In `tests/unit/biblioteca-pagina-temas.test.tsx`, add these imports next to the others:

```tsx
import DetalleDeTema from "@/app/(app)/biblioteca/temas/[id]/page"
import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import { AVISO_TRAS_OCULTAR } from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { IdeaLeida } from "@/lib/dominio/biblioteca/ideas"
```

(merge `AVISO_TRAS_OCULTAR` into the existing `filtros-de-temas` import) and append:

```tsx
const UNA = { id: "i-1", texto: "Una", tipo: "dato", evidencia: "estudio" }
const DOS = { id: "i-2", texto: "Dos", tipo: "dato", evidencia: "estudio" }
const leido = (ideas: IdeaLeida[]) => ({
  tema: { id: CARGA, nombre: "Carga mental", descripcion: "El peso de lo que nadie ve." },
  ideas: ideas.length,
  autores: [{ autor: { id: "a-1", nombre: "Daniela Ruiz", credencial: null }, ideas }],
})
const abrir = (id: string, params: Record<string, string> = {}) =>
  DetalleDeTema({ params: Promise.resolve({ id }), searchParams: Promise.resolve(params) })

describe("a topic's page", () => {
  it("refuses what is not an id before reading", async () => {
    esConi.valor = true
    await expect(abrir("no-es-un-id")).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.destinoDeTema).not.toHaveBeenCalled()
  })

  it("sends a merged topic's address to the one that stayed", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValueOnce(CARGA)
    await expect(abrir(PAUSAS)).rejects.toThrow(`NEXT_REDIRECT /biblioteca/temas/${CARGA}`)
    expect(datos.leerTema).not.toHaveBeenCalled()
  })

  it("is not found for a missing topic, a loop, or one gone meanwhile", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValueOnce(null)
    await expect(abrir(CARGA)).rejects.toThrow("NEXT_NOT_FOUND")
    datos.destinoDeTema.mockResolvedValueOnce(CARGA)
    datos.leerTema.mockResolvedValueOnce(null)
    await expect(abrir(CARGA)).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("gives each idea Ocultar, going to the topic while it keeps ideas and to the list after the last (D6)", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValue(CARGA)
    datos.leerTema.mockResolvedValueOnce(leido([UNA, DOS]))
    const lista = elementos(await abrir(CARGA)).find((elemento) => elemento.type === ListaDeIdeas)
    expect(lista?.props.etiqueta).toBe("Ideas de Daniela Ruiz")
    const boton = (lista?.props.accion as (idea: IdeaLeida) => Elemento)(UNA)
    expect(boton.type).toBe(BotonOcultar)
    expect(boton.props).toEqual({ ideaId: "i-1", oculta: false, despues: `/biblioteca/temas/${CARGA}?oculta=i-1` })

    datos.leerTema.mockResolvedValueOnce(leido([UNA]))
    const sola = elementos(await abrir(CARGA)).find((elemento) => elemento.type === ListaDeIdeas)
    expect((sola?.props.accion as (idea: IdeaLeida) => Elemento)(UNA).props.despues).toBe("/biblioteca/temas?oculta=i-1")
  })

  it("says the quiet note after hiding", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValue(CARGA)
    datos.leerTema.mockResolvedValueOnce(leido([UNA]))
    const arbol = elementos(await abrir(CARGA, { oculta: IDEA }))
    expect(arbol.find((elemento) => elemento.type === LineaDeEstado)?.props.titulo).toBe(AVISO_TRAS_OCULTAR)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-temas.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/temas/[id]/page"`.

- [ ] **Step 3: Write the page.** Create `app/(app)/biblioteca/temas/[id]/page.tsx`:

```tsx
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Volver } from "@/components/ui/volver"
import { destinoDeTema, leerTema } from "@/lib/datos/biblioteca"
import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import {
  AVISO_TRAS_OCULTAR,
  hrefDeTema,
  hrefTrasOcultar,
  leerIdeaOculta,
  RUTA_DE_TEMAS,
} from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { BotonOcultar } from "../../boton-ocultar"
import { ListaDeIdeas } from "../../lista-de-ideas"

/** One topic (ported from Ingesta's `temas/[id]/page.tsx`): its ideas by author, each with Ocultar. */
export default async function DetalleDeTema({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, { id }, consulta] = await Promise.all([exigirConi(), params, searchParams])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  // A merged topic's address leads to the one that stayed; a missing one or a loop is not found.
  const destino = await destinoDeTema(db, valido.data)
  if (destino === null) notFound()
  if (destino !== valido.data) redirect(hrefDeTema(destino))
  const leido = await leerTema(db, destino)
  if (!leido) notFound()
  const { tema, ideas, autores } = leido
  const cuentas = cuentasDeTema({ ideas, autores: autores.length })

  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">{tema.nombre}</h1>
        {tema.descripcion ? <p className="text-cuerpo">{tema.descripcion}</p> : null}
        {cuentas ? <p className="text-meta text-apagado">{cuentas}</p> : null}
      </header>
      {leerIdeaOculta(consulta) ? <LineaDeEstado tipo="neutro" titulo={AVISO_TRAS_OCULTAR} /> : null}

      {autores.map((grupo) => {
        const idDelTitulo = `autor-${grupo.autor.id}`
        return (
          <section key={grupo.autor.id} aria-labelledby={idDelTitulo} className="grid gap-3">
            <div className="grid gap-0.5">
              <h2 id={idDelTitulo} className="text-pieza text-balance">
                <Link href={hrefDeAutor(grupo.autor.id)} className="underline decoration-1 underline-offset-4">
                  {grupo.autor.nombre}
                </Link>
              </h2>
              {grupo.autor.credencial ? <p className="text-meta text-apagado">{grupo.autor.credencial}</p> : null}
            </div>
            <ListaDeIdeas
              etiqueta={`Ideas de ${grupo.autor.nombre}`}
              ideas={grupo.ideas}
              accion={(idea) => (
                <BotonOcultar ideaId={idea.id} oculta={false} despues={hrefTrasOcultar(tema.id, idea.id, ideas)} />
              )}
            />
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run it green, and every unit test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-temas.test.tsx && pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/temas/[id]/page.tsx" tests/unit/biblioteca-pagina-temas.test.tsx
git add "app/(app)/biblioteca/temas/[id]/page.tsx" tests/unit/biblioteca-pagina-temas.test.tsx
git commit -m "$(cat <<'EOF'
Add a topic's page: its ideas by author, Ocultar, and merged addresses that land on the one that stayed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part E: links from a material

### Task 22: a material's topic links to its page

**Files:**
- Modify: `lib/dominio/biblioteca/temas.ts`, `app/(app)/biblioteca/tema-del-material.tsx`, `app/(app)/biblioteca/tabla-de-materiales.tsx`, `app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx`
- Test: `tests/unit/biblioteca-temas-y-fechas.test.ts`, `tests/unit/biblioteca-piezas.test.tsx`, `tests/unit/biblioteca-tabla.test.tsx`, `tests/unit/biblioteca-tarjeta.test.tsx`, `tests/unit/biblioteca-mapa-y-reprocesar.test.tsx`, `tests/integration/datos-biblioteca.test.ts`

- [ ] **Step 1: Write the failing tests.** Every fixture of a main topic gains its id (F9):

In `tests/unit/biblioteca-temas-y-fechas.test.ts`, change the expected values of `temasPrincipales`, in order: `{ id: "t2", nombre: "Carga mental", otros: 2 }`, `{ id: "t2", nombre: "Ánimo", otros: 1 }`, `{ id: "t1", nombre: "Sueño", otros: 0 }` (excluded and topicless), `{ id: "t3", nombre: "Sueño", otros: 0 }` (blank names), `{ id: "t1", nombre: "Sueño", otros: 0 }` and `{ id: "t2", nombre: "Ánimo", otros: 0 }` (materials apart), `{ id: "t1", nombre: "Sueño", otros: 1 }` (a thousand ideas); and in the `textoDeTema` calls add `id: "t"` to each object (`{ id: "t", nombre: "Carga mental", otros: 2 }`, and so on).

In `tests/unit/biblioteca-tabla.test.tsx` and `tests/unit/biblioteca-tarjeta.test.tsx`, the fixture's `tema` becomes `{ id: "t1", nombre: "Carga mental", otros: 0 }` and `{ id: "t1", nombre: "Carga mental", otros: 1 }`. Append inside `describe("TablaDeMateriales", ...)`:

```tsx
  it("links each main topic to its page (D9)", () => {
    render(<TablaDeMateriales materiales={materiales} filtros={{}} seleccion={null} ahora={AHORA} />)
    const temas = screen.getAllByRole("link", { name: "Carga mental" })
    expect(temas).toHaveLength(2)
    expect(temas[0]).toHaveAttribute("href", "/biblioteca/temas/t1")
  })
```

Append inside `describe("TarjetaDeMaterial", ...)`:

```tsx
  it("keeps the topic as text inside its one link, never a link inside a link (deviation 4)", () => {
    const li = tarjeta(material)
    expect(within(li).getAllByRole("link")).toHaveLength(1)
  })
```

In `tests/unit/biblioteca-piezas.test.tsx`, replace the `describe("TemaDelMaterial", ...)` block with:

```tsx
describe("TemaDelMaterial", () => {
  it("shows +N and reads it in words", () => {
    const { container } = render(<TemaDelMaterial tema={{ id: "t1", nombre: "Carga mental", otros: 2 }} />)
    expect(screen.getByText("Carga mental +2")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Carga mental y 2 temas más")).toHaveClass("sr-only")
    expect(container.textContent).toContain("Carga mental +2")
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("links to the topic when asked, named in words", () => {
    render(<TemaDelMaterial tema={{ id: "t1", nombre: "Carga mental", otros: 2 }} conEnlace />)
    expect(screen.getByRole("link", { name: "Carga mental y 2 temas más" })).toHaveAttribute(
      "href",
      "/biblioteca/temas/t1",
    )
  })

  it("never links a material without a topic", () => {
    render(<TemaDelMaterial tema={null} conEnlace />)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getAllByText("Sin tema todavía")).toHaveLength(2)
  })
})
```

Append inside `describe("MapaDelMaterial (4h)", ...)` of `tests/unit/biblioteca-mapa-y-reprocesar.test.tsx`:

```tsx
  it("links each topic row to its page, and not «Sin tema todavía» (D9)", () => {
    render(<MapaDelMaterial mapa={MAPA} estado="listo" />)
    const temas = screen.getByRole("list", { name: "Temas" })
    expect(within(temas).getByRole("link", { name: /Carga mental/ })).toHaveAttribute("href", "/biblioteca/temas/t1")
    expect(within(temas).getAllByRole("link")).toHaveLength(1)
    expect(within(screen.getByRole("list", { name: "Qué tipo de idea es" })).queryByRole("link")).toBeNull()
  })
```

In `tests/integration/datos-biblioteca.test.ts`, the two main-topic expectations become `toEqual({ id: temas[0], nombre: \`Carga mental ${SUFIJO}\`, otros: 1 })` (line 73, `carga` is `temas[0]`) and `toEqual({ id: temas[3], nombre: \`Ánimo ${SUFIJO}\`, otros: 1 })` (line 80, `animo` is `temas[3]`).

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-temas-y-fechas.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tabla.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-mapa-y-reprocesar.test.tsx`
Expected: FAIL: `temasPrincipales` gives no `id`, there is no topic link in the table, the map or `TemaDelMaterial`. (The card's new test already passes: it pins the card as it is.)

- [ ] **Step 3: Write the code.** In `lib/dominio/biblioteca/temas.ts`, `TemaPrincipal` gains the id and `temasPrincipales` keeps it:

```ts
export interface TemaPrincipal {
  /** The topic's id: the list links to its page (D9). */
  id: string
  nombre: string
  /** How many other topics the material's ideas belong to: the list shows "+N". */
  otros: number
}
```

```ts
export function temasPrincipales(ideas: readonly IdeaConTema[]): Map<string, TemaPrincipal> {
  const porMaterial = new Map<string, Map<string, { id: string; nombre: string; ideas: number }>>()
  for (const idea of ideas) {
    // A blank name (a topic row the reader could not join) would show as an empty main topic: it is left out.
    if (idea.excluida || idea.temaId === null || idea.nombre.trim() === "") continue
    const temas = porMaterial.get(idea.materialId) ?? new Map<string, { id: string; nombre: string; ideas: number }>()
    const tema = temas.get(idea.temaId) ?? { id: idea.temaId, nombre: idea.nombre, ideas: 0 }
    tema.ideas += 1
    temas.set(idea.temaId, tema)
    porMaterial.set(idea.materialId, temas)
  }
  const principales = new Map<string, TemaPrincipal>()
  for (const [materialId, temas] of porMaterial) {
    const [primero] = [...temas.values()].sort((a, b) => b.ideas - a.ideas || a.nombre.localeCompare(b.nombre, "es"))
    if (primero) principales.set(materialId, { id: primero.id, nombre: primero.nombre, otros: temas.size - 1 })
  }
  return principales
}
```

Replace `app/(app)/biblioteca/tema-del-material.tsx` with:

```tsx
import Link from "next/link"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { type TemaPrincipal, textoDeTema } from "@/lib/dominio/biblioteca/temas"

/**
 * "Carga mental +2" on screen; "Carga mental y 2 temas más" for a screen reader. `conEnlace` links it to the topic
 * (D9): only where it is not already inside a link, as the phone card is (deviation 4).
 */
export function TemaDelMaterial({ tema, conEnlace = false }: { tema: TemaPrincipal | null; conEnlace?: boolean }) {
  const { visible, leido } = textoDeTema(tema)
  const texto = (
    <>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{leido}</span>
    </>
  )
  if (!conEnlace || tema === null) return texto
  return (
    <Link href={hrefDeTema(tema.id)} className="text-tinta underline decoration-1 underline-offset-4">
      {texto}
    </Link>
  )
}
```

In `app/(app)/biblioteca/tabla-de-materiales.tsx`, the topic cell becomes `<TemaDelMaterial tema={material.tema} conEnlace />`.

In `app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx`, add `import Link from "next/link"` and `import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"`, and replace `Recuento` and the topic rows:

```tsx
interface FilaDeRecuento {
  clave: string
  texto: string
  cantidad: number
  /** A topic row opens the topic (D9). */
  href?: string
}

const CONTENIDO_DE_FILA = "flex min-h-objetivo w-full items-center justify-between gap-3 text-cuerpo"

function Recuento({ titulo, id, filas }: { titulo: string; id: string; filas: FilaDeRecuento[] }) {
  return (
    <Seccion titulo={titulo} id={id}>
      <ul aria-label={titulo} className="divide-y divide-hilo rounded-panel bg-piedra-alta px-[18px]">
        {filas.map((fila) => {
          const contenido = (
            <>
              <span>{fila.texto}</span>
              <span className="text-meta font-semibold text-apagado tabular-nums">{fila.cantidad}</span>
            </>
          )
          return (
            <li key={fila.clave}>
              {fila.href ? (
                <Link href={fila.href} className={`${CONTENIDO_DE_FILA} underline-offset-4 hover:underline`}>
                  {contenido}
                </Link>
              ) : (
                <div className={CONTENIDO_DE_FILA}>{contenido}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Seccion>
  )
}
```

```tsx
            filas={[
              ...mapa.temas.map((tema) => ({
                clave: tema.id,
                texto: tema.nombre,
                cantidad: tema.afirmaciones,
                href: hrefDeTema(tema.id),
              })),
              ...(mapa.sinTema > 0 ? [{ clave: "sin-tema", texto: "Sin tema todavía", cantidad: mapa.sinTema }] : []),
            ]}
```

- [ ] **Step 4: Run them green, every unit test, and batch 1's readers.**

Run: `pnpm exec vitest run tests/unit/biblioteca-temas-y-fechas.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tabla.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-mapa-y-reprocesar.test.tsx && pnpm test:run && pnpm test:db tests/integration/datos-biblioteca.test.ts && pnpm type`
Expected: PASS (the map's row text stays "Carga mental3", which batch 1's test reads).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/temas.ts "app/(app)/biblioteca/tema-del-material.tsx" "app/(app)/biblioteca/tabla-de-materiales.tsx" "app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx" tests/unit/biblioteca-temas-y-fechas.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tabla.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-mapa-y-reprocesar.test.tsx tests/integration/datos-biblioteca.test.ts
git add lib/dominio/biblioteca/temas.ts "app/(app)/biblioteca/tema-del-material.tsx" "app/(app)/biblioteca/tabla-de-materiales.tsx" "app/(app)/biblioteca/materiales/[id]/mapa-del-material.tsx" tests/unit/biblioteca-temas-y-fechas.test.ts tests/unit/biblioteca-piezas.test.tsx tests/unit/biblioteca-tabla.test.tsx tests/unit/biblioteca-tarjeta.test.tsx tests/unit/biblioteca-mapa-y-reprocesar.test.tsx tests/integration/datos-biblioteca.test.ts
git commit -m "$(cat <<'EOF'
Link a material's topic to its page from the table and the material's detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 23: the author in the material's side panel links to its page

**Files:**
- Modify: `app/(app)/biblioteca/panel-de-material.tsx`
- Test: `tests/unit/biblioteca-panel.test.tsx`

- [ ] **Step 1: Write the failing test.** The name becomes a link, so the line's text is split across two nodes and `getByText` (which reads an element's own text nodes) no longer finds it whole. In `tests/unit/biblioteca-panel.test.tsx`, in the test "says who she is for you with the credential, ...", replace

```tsx
    expect(screen.getByText("Daniela Ruiz · investigadora de confianza")).toBeInTheDocument()
```

with

```tsx
    const quien = screen.getByRole("heading", { name: "¿Quién es para ti?", level: 3 }).closest("section")
    expect(quien).toHaveTextContent("Daniela Ruiz · investigadora de confianza")
```

and append inside `describe("PanelDeMaterial", ...)`:

```tsx
  it("links the author to its page; the reader already gives its id (deviation 6)", () => {
    render(<PanelDeMaterial panel={panel} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Daniela Ruiz" })).toHaveAttribute("href", "/biblioteca/autores/a-1")
  })
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-panel.test.tsx`
Expected: FAIL, `Unable to find an accessible element with the role "link" and name "Daniela Ruiz"`.

- [ ] **Step 3: Write the code.** In `app/(app)/biblioteca/panel-de-material.tsx`, add `import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"`, delete the `const quien = ...` line, and make the first line of the "¿Quién es para ti?" section:

```tsx
        <p className="text-cuerpo">
          <Link href={hrefDeAutor(material.autor_id)} className="font-semibold underline decoration-1 underline-offset-4">
            {material.autor}
          </Link>
          {material.credencial ? ` · ${material.credencial}` : null}
        </p>
```

- [ ] **Step 4: Run it green, and every unit test.**

Run: `pnpm exec vitest run tests/unit/biblioteca-panel.test.tsx && pnpm test:run`
Expected: PASS (the section's text is still "Daniela Ruiz · investigadora de confianza", which batch 1's desktop E2E reads with `toContainText`).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/panel-de-material.tsx" tests/unit/biblioteca-panel.test.tsx
git add "app/(app)/biblioteca/panel-de-material.tsx" tests/unit/biblioteca-panel.test.tsx
git commit -m "$(cat <<'EOF'
Link the author in a material's side panel to its page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part F: end to end

### Task 24: the scene of Autores and Temas, and Autores on the phone

**Files:**
- Modify: `tests/e2e/biblioteca-escena.ts`
- Create: `tests/e2e/biblioteca-autores.spec.ts`

- [ ] **Step 1: Write the failing spec.** Create `tests/e2e/biblioteca-autores.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, tocarHastaLlegar } from "./ayudas"
import {
  AUTORA,
  CREDENCIAL,
  type EscenaDeAutoresYTemas,
  OTRA_AUTORA,
  OTRO_TEMA,
  SIN_MATERIAL,
  sembrarAutoresYTemas,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("Autores shows each author with kind, counts without zeros and top topics, most ideas first (4i)", async ({
  page,
}) => {
  await page.goto("/biblioteca/autores")
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(
    page.getByRole("navigation", { name: "Secciones de la Biblioteca" }).getByRole("link", { name: "Autores" }),
  ).toHaveAttribute("aria-current", "page")

  const tarjetas = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(4)
  await expect(tarjetas.nth(0)).toContainText(AUTORA)
  await expect(tarjetas.nth(0)).toContainText(`Persona · ${CREDENCIAL}`)
  await expect(tarjetas.nth(0)).toContainText("2 materiales · 3 ideas sacadas")
  await expect(tarjetas.nth(0)).toContainText(`${TEMA_PRINCIPAL} · ${OTRO_TEMA}`)
  await expect(tarjetas.nth(1)).toContainText(OTRA_AUTORA)
  await expect(tarjetas.nth(1)).toContainText("1 material · 2 ideas sacadas")
  await expect(tarjetas.nth(2)).toContainText(escena.nombreDeConi)
  await expect(tarjetas.nth(2)).toContainText("Coni")
  await expect(tarjetas.nth(2)).toContainText("4 materiales · 1 idea sacada")
  const vacia = tarjetas.nth(3)
  await expect(vacia).toContainText(SIN_MATERIAL)
  await expect(vacia).toContainText("Todavía no hay material de esta persona. Súbelo desde Subir.")
  await expect(vacia.getByRole("link", { name: "Subir", exact: true })).toHaveAttribute("href", "/biblioteca/subir")

  await tocarHastaLlegar(
    page,
    tarjetas.nth(0).getByRole("link", { name: new RegExp(AUTORA) }),
    new RegExp(`/biblioteca/autores/${escena.autora}$`),
  )
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
})

test("the search finds by name or alias, ignoring accents and case, and says when nobody matches", async ({
  page,
}) => {
  await page.goto("/biblioteca/autores")
  const tarjetas = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  const buscar = page.getByLabel("Buscar por nombre")
  await buscar.fill("RUÍZ")
  await expect(tarjetas).toHaveCount(2)
  await buscar.fill("rosario")
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(escena.nombreDeConi)
  await buscar.fill("zzz")
  await expect(page.getByText("Nadie se llama así todavía.")).toBeVisible()
  await expect(tarjetas).toHaveCount(0)
  await buscar.fill("")
  await expect(tarjetas).toHaveCount(4)
})

test("an author's page groups its ideas by topic, links each topic, and folds the detail for WAV (4h)", async ({
  page,
}) => {
  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByRole("link", { name: "Autores", exact: true })).toHaveAttribute("href", "/biblioteca/autores")
  await expect(page.getByText("2 materiales · 3 ideas sacadas")).toBeVisible()
  const titulos = await page.getByRole("heading", { level: 2 }).allTextContents()
  expect(titulos.indexOf(TEMA_PRINCIPAL)).toBeGreaterThanOrEqual(0)
  expect(titulos.indexOf(TEMA_PRINCIPAL)).toBeLessThan(titulos.indexOf(OTRO_TEMA))
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 2 }).getByRole("link")).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.carga}`,
  )

  const ideas = page.getByRole("list", { name: `Ideas sobre ${TEMA_PRINCIPAL}` }).getByRole("listitem")
  await expect(ideas).toHaveCount(2)
  await expect(ideas.nth(0)).toContainText("«El aislamiento pesa más que las horas extra.»")
  const detalle = ideas.nth(0).locator("details")
  expect(await detalle.evaluate((nodo) => (nodo as HTMLDetailsElement).open)).toBe(false)
  await ideas.nth(0).getByText("Detalle para WAV").click()
  await expect(detalle).toContainText("Tipo de idea: Dato")
  await expect(detalle).toContainText("Evidencia: Estudio")
  await expect(page.getByText(/Afirmaci/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Unir con otro autor" })).toBeVisible()
})

test("Coni's own page never offers joining", async ({ page }) => {
  await page.goto(`/biblioteca/autores/${escena.coni}`)
  await expect(page.getByRole("heading", { name: escena.nombreDeConi, level: 1 })).toBeVisible()
  await expect(page.getByRole("button", { name: "Unir con otro autor" })).toHaveCount(0)
})

test("joining two authors names both, says it cannot be undone, and lands on the one that stayed", async ({
  page,
}) => {
  await page.goto(`/biblioteca/autores/${escena.otraAutora}`)
  await page.getByRole("button", { name: "Unir con otro autor" }).click()
  await expect(page.getByLabel("Buscar por nombre")).toBeFocused()
  await page.getByLabel("Buscar por nombre").fill("daniela")
  await page
    .getByRole("list", { name: "Con quién unir" })
    .getByRole("button", { name: `${AUTORA}, ${CREDENCIAL}` })
    .click()
  const pregunta = page.getByText(/No se puede deshacer\./)
  await expect(pregunta).toContainText(`Uno a ${OTRA_AUTORA} con ${AUTORA}`)
  await page.getByRole("button", { name: "Sí, unir" }).click()

  await expect(page).toHaveURL(new RegExp(`/biblioteca/autores/${escena.autora}$`))
  await expect(page.getByText("3 materiales · 5 ideas sacadas")).toBeVisible()
  await expect(page.getByRole("heading", { name: TEMA_DE_UN_AUTOR, level: 2 })).toBeVisible()
  const { rows } = await pool.query<{ alias: string[] }>("select alias from public.autores where id = $1", [
    escena.autora,
  ])
  expect(rows[0]?.alias).toContain(OTRA_AUTORA)

  // The joined name is now an alias: the search still finds her by it.
  await page.goto("/biblioteca/autores")
  const tarjetas = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(3)
  await page.getByLabel("Buscar por nombre").fill("d. ruiz")
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(AUTORA)
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec playwright test tests/e2e/biblioteca-autores.spec.ts`
Expected: FAIL to load: `sembrarAutoresYTemas` (and the other new names) are not exported by `./biblioteca-escena`.

- [ ] **Step 3: Write the scene.** In `tests/e2e/biblioteca-escena.ts`, export the second topic's name and use it in `TEMAS`:

```ts
export const TEMA_PRINCIPAL = "Carga mental"
export const OTRO_TEMA = "Pausas activas"
const TEMAS = [TEMA_PRINCIPAL, OTRO_TEMA]
```

and append:

```ts
export const OTRA_AUTORA = "D. Ruiz"
export const SIN_MATERIAL = "Instituto del Descanso"
export const TEMA_DE_UN_AUTOR = "Descanso digital"
export const TEMA_FUSIONADO = "Pausas cortas"
export const PILAR = "IA y salud mental"
export const IDEA_DE_CONI = "Repartir la carga mental empieza por nombrarla."
/** One of the two ideas of Daniela in Carga mental (sembrarBiblioteca). */
export const IDEA_QUE_SE_OCULTA = "Las pausas acordadas protegen."
/** The only idea of Pausas activas (sembrarBiblioteca). */
export const IDEA_UNICA_DE_PAUSAS = "Una pausa corta cada hora ayuda."

export interface EscenaDeAutoresYTemas extends EscenaDeBiblioteca {
  autora: string
  otraAutora: string
  sinMaterial: string
  coni: string
  nombreDeConi: string
  carga: string
  pausas: string
  deUnAutor: string
  fusionado: string
  pilar: string
}

/**
 * Batch 3's scene, on top of batch 1's five materials (whose specs keep counting five): a second author to join, one
 * with nothing, an idea of Coni's own (so Carga mental reads "Ya lo traté"), a pillar on Carga mental, a topic of one
 * author and a topic merged into Pausas activas.
 *   Topics: Carga mental 3 ideas · 2 autores (tratado, pilar) · Descanso digital 2 · 1 · Pausas activas 1 · 1.
 *   Authors: Daniela 2 materiales · 3 ideas · D. Ruiz 1 · 2 · Coni 4 · 1 · Instituto del Descanso nothing.
 */
export async function sembrarAutoresYTemas(): Promise<EscenaDeAutoresYTemas> {
  const base = await sembrarBiblioteca()
  // The run owns the Biblioteca (D16): an author or a topic nothing of this scene uses is another run's leftover.
  await pool.query(
    `delete from public.autores a where a.tipo <> 'coni'
       and not exists (select 1 from public.materiales m where m.autor_id = a.id)
       and not exists (select 1 from public.afirmaciones f where f.autor_id = a.id)`,
  )
  await pool.query(
    "delete from public.temas t where not exists (select 1 from public.afirmaciones f where f.tema_id = t.id)",
  )

  const autora = await uno("select id from public.autores where nombre = $1", [AUTORA])
  const { rows: deConi } = await pool.query<{ id: string; nombre: string }>(
    "select id, nombre from public.autores where tipo = 'coni'",
  )
  const coni = deConi[0]
  if (!coni) throw new Error("La escena no encontró a la autora Coni")
  const carga = await uno("select id from public.temas where nombre = $1", [TEMA_PRINCIPAL])
  const pausas = await uno("select id from public.temas where nombre = $1", [OTRO_TEMA])
  const pilar = await uno("select id from public.categorias where nombre = $1 and es_pilar and activa", [PILAR])
  await pool.query("update public.temas set categoria_id = $1 where id = $2", [pilar, carga])

  const charla = await material({
    titulo: "Charla: la carga mental en casa",
    tipo: "documento",
    autorId: coni.id,
    rol: "voz_propia",
    estado: "listo",
    hace: "5 days",
  })
  await ideas(charla, coni.id, carga, [IDEA_DE_CONI], "clinica")

  const otraAutora = await uno("insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [
    OTRA_AUTORA,
  ])
  const deUnAutor = await uno(
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [TEMA_DE_UN_AUTOR, CENTROIDE],
  )
  const notas = await material({
    titulo: "Notas sobre descanso digital",
    tipo: "documento",
    autorId: otraAutora,
    rol: "referente",
    estado: "listo",
    hace: "6 days",
  })
  await ideas(
    notas,
    otraAutora,
    deUnAutor,
    ["Apagar las notificaciones de noche ayuda a dormir.", "Una hora sin pantalla antes de dormir."],
    "opinion",
  )
  const sinMaterial = await uno(
    "insert into public.autores (nombre, tipo) values ($1, 'institucion') returning id",
    [SIN_MATERIAL],
  )
  const fusionado = await uno(
    "insert into public.temas (nombre, centroide, fusionado_en) values ($1, $2::extensions.vector, $3) returning id",
    [TEMA_FUSIONADO, CENTROIDE, pausas],
  )
  return {
    ...base,
    autora,
    otraAutora,
    sinMaterial,
    coni: coni.id,
    nombreDeConi: coni.nombre,
    carga,
    pausas,
    deUnAutor,
    fusionado,
    pilar,
  }
}

/** Two topics merged into each other: an address that never ends, for the not-found check. */
export async function sembrarTemasEnBucle(): Promise<string> {
  const primero = await uno(
    "insert into public.temas (nombre, centroide) values ('Bucle uno', $1::extensions.vector) returning id",
    [CENTROIDE],
  )
  const segundo = await uno(
    "insert into public.temas (nombre, centroide, fusionado_en) values ('Bucle dos', $1::extensions.vector, $2) returning id",
    [CENTROIDE, primero],
  )
  await pool.query("update public.temas set fusionado_en = $1 where id = $2", [segundo, primero])
  return primero
}
```

- [ ] **Step 4: Run it green, and batch 1's phone spec (its five materials).**

Run: `pnpm exec playwright test tests/e2e/biblioteca-autores.spec.ts tests/e2e/biblioteca.spec.ts`
Expected: PASS (batch 1's spec never calls the new scene).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca-autores.spec.ts
git add tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca-autores.spec.ts
git commit -m "$(cat <<'EOF'
Seed Autores and Temas for the E2E, and check Autores on the phone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 25: Temas on the phone

**Files:**
- Create: `tests/e2e/biblioteca-temas.spec.ts`

- [ ] **Step 1: Write the spec.** Create `tests/e2e/biblioteca-temas.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, tocarHastaLlegar } from "./ayudas"
import {
  AUTORA,
  type EscenaDeAutoresYTemas,
  IDEA_DE_CONI,
  IDEA_QUE_SE_OCULTA,
  IDEA_UNICA_DE_PAUSAS,
  OTRO_TEMA,
  PILAR,
  sembrarAutoresYTemas,
  sembrarTemasEnBucle,
  TEMA_DE_UN_AUTOR,
  TEMA_FUSIONADO,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

const NOTA = "La oculté. La puedes volver a mostrar desde su autor."
const NOTA_DE_LA_ULTIMA =
  "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor."
const UNA_IDEA = "[0-9a-f-]{36}"

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("Temas shows each topic with counts without zeros and its badges, most authors first; merged ones stay out", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas")
  await expect(
    page.getByRole("navigation", { name: "Secciones de la Biblioteca" }).getByRole("link", { name: "Temas" }),
  ).toHaveAttribute("aria-current", "page")
  const tarjetas = page.getByRole("list", { name: "Temas" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(3)
  await expect(tarjetas.nth(0)).toContainText(TEMA_PRINCIPAL)
  await expect(tarjetas.nth(0)).toContainText("3 ideas sacadas · 2 autores")
  await expect(tarjetas.nth(0)).toContainText("Ya lo traté")
  await expect(tarjetas.nth(0)).not.toContainText("Un solo autor")
  await expect(tarjetas.nth(1)).toContainText(TEMA_DE_UN_AUTOR)
  await expect(tarjetas.nth(1)).toContainText("2 ideas sacadas · 1 autor")
  await expect(tarjetas.nth(1)).toContainText("Un solo autor")
  await expect(tarjetas.nth(2)).toContainText(OTRO_TEMA)
  await expect(tarjetas.nth(2)).toContainText("1 idea sacada · 1 autor")
  await expect(page.getByText(TEMA_FUSIONADO)).toHaveCount(0)
})

test("the quick filters split by coverage in one tap, live in the URL, and an unknown value reads as Todos", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas")
  const tarjetas = page.getByRole("list", { name: "Temas" }).getByRole("listitem")
  const filtros = page.getByRole("group", { name: "Filtrar temas" })
  await expect(filtros.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")

  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Sin tratar · 2" }),
    /\/biblioteca\/temas\?cobertura=sin-tratar(?:[?&]v=\d+)?$/,
  )
  await expect(tarjetas).toHaveCount(2)
  await expect(page.getByRole("list", { name: "Temas" })).not.toContainText(TEMA_PRINCIPAL)

  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Ya los traté · 1" }),
    /\/biblioteca\/temas\?cobertura=tratados(?:[?&]v=\d+)?$/,
  )
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(TEMA_PRINCIPAL)

  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Un solo autor · 2" }),
    /\/biblioteca\/temas\?cobertura=un-autor(?:[?&]v=\d+)?$/,
  )
  await expect(tarjetas).toHaveCount(2)

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?cobertura=tratados(?:[?&]v=\d+)?$/)
  await expect(tarjetas).toHaveCount(1)

  await page.goto("/biblioteca/temas?cobertura=otra")
  await expect(filtros.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")
  await expect(tarjetas).toHaveCount(3)
})

test("the pillar under Más filtros combines with the coverage, and its counts follow it", async ({ page }) => {
  await page.goto("/biblioteca/temas?cobertura=tratados")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("Pilar").selectOption({ label: PILAR })
  await page.getByRole("button", { name: "Filtrar" }).click()

  await expect(page).toHaveURL(
    new RegExp(`/biblioteca/temas\\?pilar=${escena.pilar}&cobertura=tratados(?:[?&]v=\\d+)?$`),
  )
  const tarjetas = page.getByRole("list", { name: "Temas" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(TEMA_PRINCIPAL)
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()

  const filtros = page.getByRole("group", { name: "Filtrar temas" })
  // Under this pillar nothing is untreated: the chip drops its zero.
  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Sin tratar", exact: true }),
    new RegExp(`/biblioteca/temas\\?pilar=${escena.pilar}&cobertura=sin-tratar(?:[?&]v=\\d+)?$`),
  )
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()

  await page.getByRole("link", { name: "Quitar este filtro" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?cobertura=sin-tratar(?:[?&]v=\d+)?$/)
  await expect(tarjetas).toHaveCount(2)
})

test("a topic's page groups its ideas by author; Ocultar takes one out with a quiet note, and its author shows it again", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
  await expect(page.getByText("3 ideas sacadas · 2 autores")).toBeVisible()
  await expect(page.getByRole("heading", { name: AUTORA, level: 2 }).getByRole("link")).toHaveAttribute(
    "href",
    `/biblioteca/autores/${escena.autora}`,
  )
  await expect(page.getByRole("list", { name: `Ideas de ${escena.nombreDeConi}` })).toContainText(IDEA_DE_CONI)
  const deDaniela = page.getByRole("list", { name: `Ideas de ${AUTORA}` }).getByRole("listitem")
  await expect(deDaniela).toHaveCount(2)

  await deDaniela.filter({ hasText: IDEA_QUE_SE_OCULTA }).getByRole("button", { name: "Ocultar" }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/temas/${escena.carga}\\?oculta=${UNA_IDEA}$`))
  await expect(page.getByText(NOTA)).toBeVisible()
  await expect(page.getByText(IDEA_QUE_SE_OCULTA)).toHaveCount(0)
  await expect(page.getByText("2 ideas sacadas · 2 autores")).toBeVisible()

  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await page.getByText("Ideas ocultas (1)").click()
  const oculta = page.getByRole("list", { name: "Ideas ocultas" }).getByRole("listitem")
  await expect(oculta).toContainText(IDEA_QUE_SE_OCULTA)
  await oculta.getByRole("button", { name: "Mostrar" }).click()
  // Shown again it has no topic until the next maintenance run places it (deviation 2).
  await expect(page.getByRole("list", { name: "Ideas sin tema todavía" })).toContainText(IDEA_QUE_SE_OCULTA, {
    timeout: 15_000,
  })
  await expect(page.getByText("Ideas ocultas (1)")).toHaveCount(0)
})

test("hiding the last idea of a topic lands on the list with its own note, the topic gone (deviation 1)", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.pausas}`)
  await page
    .getByRole("listitem")
    .filter({ hasText: IDEA_UNICA_DE_PAUSAS })
    .getByRole("button", { name: "Ocultar" })
    .click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/temas\\?oculta=${UNA_IDEA}$`))
  await expect(page.getByText(NOTA_DE_LA_ULTIMA)).toBeVisible()
  const lista = page.getByRole("list", { name: "Temas" })
  await expect(lista.getByRole("listitem")).toHaveCount(2)
  await expect(lista).not.toContainText(OTRO_TEMA)
})

test("a merged topic's address lands on the one that stayed; a loop, a missing topic or a bad id is not found", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.fusionado}`)
  await expect(page).toHaveURL(new RegExp(`/biblioteca/temas/${escena.pausas}$`))
  await expect(page.getByRole("heading", { name: OTRO_TEMA, level: 1 })).toBeVisible()

  const bucle = await sembrarTemasEnBucle()
  for (const ruta of [
    `/biblioteca/temas/${bucle}`,
    "/biblioteca/temas/00000000-0000-4000-8000-000000000000",
    "/biblioteca/temas/no-es-un-id",
    "/biblioteca/autores/00000000-0000-4000-8000-000000000000",
    "/biblioteca/autores/no-es-un-id",
  ]) {
    await page.goto(ruta)
    await expect(page.getByRole("heading", { name: "No encontré lo que buscabas" }), ruta).toBeVisible()
  }
})
```

- [ ] **Step 2: Run it.** These checks run against code already built in Tasks 18 to 21, so the first run is the check itself: any red is a bug of those tasks. Fix it with a unit test first (Rules), not by loosening the spec.

Run: `pnpm exec playwright test tests/e2e/biblioteca-temas.spec.ts`
Expected: PASS. If a step fails, write the failing unit test for it in the task's test file, fix, and rerun.

- [ ] **Step 3: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-temas.spec.ts
git add tests/e2e/biblioteca-temas.spec.ts
git commit -m "$(cat <<'EOF'
Check Temas on the phone: filters, pillar, hiding an idea and merged addresses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 26: links from a material, the nav, only Coni, accessibility and large text on the phone

**Files:**
- Create: `tests/e2e/biblioteca-enlaces.spec.ts`

- [ ] **Step 1: Write the spec.** Create `tests/e2e/biblioteca-enlaces.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, conLetraGrande, entrarComo, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { AUTORA, type EscenaDeAutoresYTemas, sembrarAutoresYTemas, TEMA_PRINCIPAL } from "./biblioteca-escena"
import { CORREO_DEL_MANTENEDOR } from "./entorno"

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("a material's detail links each of its topics to the topic's page (D9)", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  await tocarHastaLlegar(
    page,
    page.getByRole("list", { name: "Temas" }).getByRole("link", { name: new RegExp(TEMA_PRINCIPAL) }),
    new RegExp(`/biblioteca/temas/${escena.carga}$`),
  )
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
})

test("the nav moves between the three sections, and at 390 px nothing scrolls sideways", async ({ page }) => {
  await page.goto("/biblioteca")
  const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
  await tocarHastaLlegar(page, nav.getByRole("link", { name: "Autores" }), /\/biblioteca\/autores(?:[?&]v=\d+)?$/)
  await tocarHastaLlegar(page, nav.getByRole("link", { name: "Temas" }), /\/biblioteca\/temas(?:[?&]v=\d+)?$/)
  await tocarHastaLlegar(page, nav.getByRole("link", { name: "Materiales" }), /\/biblioteca(?:[?&]v=\d+)?$/)
  for (const ruta of ["/biblioteca", "/biblioteca/autores", "/biblioteca/temas"]) {
    await page.goto(ruta)
    const sinDesborde = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(sinDesborde, ruta).toBe(true)
  }
})

test("only Coni: without a session it asks to sign in, and the maintainer is refused both sections and their pages", async ({
  browser,
}) => {
  const rutas = [
    "/biblioteca/autores",
    `/biblioteca/autores/${escena.autora}`,
    "/biblioteca/temas",
    `/biblioteca/temas/${escena.carga}`,
  ]
  const sinSesion = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const visitante = await sinSesion.newPage()
  for (const ruta of rutas) {
    await visitante.goto(ruta)
    await expect(visitante, ruta).toHaveURL(/\/ingreso$/)
  }
  await sinSesion.close()

  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const wav = await contexto.newPage()
  for (const ruta of rutas) {
    await wav.goto(ruta)
    await expect(wav.getByRole("heading", { name: "Esta app es solo para Coni." }), ruta).toBeVisible()
    await expect(wav.getByText(AUTORA), ruta).toHaveCount(0)
    await expect(wav.getByText(TEMA_PRINCIPAL), ruta).toHaveCount(0)
  }
  await contexto.close()
})

test("Autores, Temas and their pages pass WCAG 2.x AA (4n)", async ({ page }) => {
  const hallazgos: string[] = []
  await page.goto("/biblioteca/autores")
  hallazgos.push(...(await revisarConAxe(page, "autores")))
  await page.getByLabel("Buscar por nombre").fill("zzz")
  await expect(page.getByText("Nadie se llama así todavía.")).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "autores sin resultados")))

  await page.goto(`/biblioteca/autores/${escena.otraAutora}`)
  hallazgos.push(...(await revisarConAxe(page, "autor")))
  await page.getByRole("button", { name: "Unir con otro autor" }).click()
  await page.getByLabel("Buscar por nombre").fill("daniela")
  hallazgos.push(...(await revisarConAxe(page, "uniendo, buscando")))
  await page.getByRole("list", { name: "Con quién unir" }).getByRole("button").first().click()
  await expect(page.getByRole("button", { name: "Sí, unir" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "uniendo, preguntando")))

  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await page.getByText("Detalle para WAV").first().click()
  hallazgos.push(...(await revisarConAxe(page, "autor con el detalle para WAV abierto")))

  await page.goto("/biblioteca/temas")
  hallazgos.push(...(await revisarConAxe(page, "temas")))
  await page.getByText("Más filtros", { exact: true }).click()
  await expect(page.getByLabel("Pilar")).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "temas con más filtros")))

  await page.goto(`/biblioteca/temas/${escena.carga}`)
  hallazgos.push(...(await revisarConAxe(page, "tema")))
  await page.goto(`/biblioteca/temas/${escena.pausas}`)
  await page.getByRole("button", { name: "Ocultar" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?oculta=/)
  hallazgos.push(...(await revisarConAxe(page, "temas tras ocultar la última idea")))
  expect(hallazgos).toEqual([])
})

test("at 375 px with large text the tabs, the search and the quick filters fit, 44 px or more, nothing scrolls sideways (4c)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const ruta of ["/biblioteca/autores", "/biblioteca/temas"]) {
    await page.goto(ruta)
    await conLetraGrande(page)
    const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    for (const nombre of ["Materiales", "Autores", "Temas"]) {
      const pestana = nav.getByRole("link", { name: nombre })
      await expect(pestana).toBeVisible()
      expect((await pestana.boundingBox())?.height ?? 0, `${ruta} ${nombre}`).toBeGreaterThanOrEqual(44)
    }
    const sinDesborde = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(sinDesborde, ruta).toBe(true)
    expect(await revisarConAxe(page, `${ruta} con letra grande`)).toEqual([])
  }

  await page.goto("/biblioteca/autores")
  await conLetraGrande(page)
  await expect(page.getByLabel("Buscar por nombre")).toBeVisible()
  await expect(page.getByRole("list", { name: "Autores" }).getByRole("listitem").first()).toBeVisible()

  await page.goto("/biblioteca/temas")
  await conLetraGrande(page)
  const filtros = page.getByRole("group", { name: "Filtrar temas" })
  for (const nombre of ["Todos", "Sin tratar · 2", "Ya los traté · 1", "Un solo autor · 2"]) {
    const chip = filtros.getByRole("link", { name: nombre })
    await expect(chip).toBeVisible()
    expect((await chip.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  const masFiltros = page.getByText("Más filtros", { exact: true })
  expect((await masFiltros.boundingBox())?.height ?? 0, "Más filtros").toBeGreaterThanOrEqual(44)
})
```

- [ ] **Step 2: Run it.** As Task 25, this checks code already built; a red step is fixed test first in the unit test of the piece that failed.

Run: `pnpm exec playwright test tests/e2e/biblioteca-enlaces.spec.ts tests/e2e/biblioteca.spec.ts`
Expected: PASS (batch 1's large-text test keeps its own nav and chips green with the three tabs).

- [ ] **Step 3: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-enlaces.spec.ts
git add tests/e2e/biblioteca-enlaces.spec.ts
git commit -m "$(cat <<'EOF'
Check the links from a material, the nav, only Coni, axe and large text for Autores and Temas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 27: Autores and Temas on a computer

**Files:**
- Create: `tests/e2e/biblioteca-autores-temas.escritorio.ts`

- [ ] **Step 1: Write the spec.** Create `tests/e2e/biblioteca-autores-temas.escritorio.ts`:

```ts
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  AUTORA,
  type EscenaDeAutoresYTemas,
  SIN_MATERIAL,
  sembrarAutoresYTemas,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
  TITULO_LISTO,
} from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let escena: EscenaDeAutoresYTemas

const PISTA_DE_AUTORES = "Elige un autor de la tabla para ver aquí sus temas y sus ideas sacadas."
const PISTA_DE_TEMAS = "Elige un tema de la tabla para ver aquí cuántas ideas sacadas tiene y de quiénes."

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("Autores is a table; a row opens its summary in the sticky side panel with ?a, and Back closes it", async ({
  page,
}) => {
  await page.goto("/biblioteca/autores")
  await expect(page.getByRole("list", { name: "Autores" })).toBeHidden()
  const tabla = page.getByRole("table", { name: "Autores" })
  await expect(tabla.getByRole("columnheader")).toHaveText(["Autor", "Tipo", "Temas", "Materiales", "Ideas sacadas"])
  await expect(page.getByText(PISTA_DE_AUTORES)).toBeVisible()

  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: AUTORA, exact: true }),
    new RegExp(`/biblioteca/autores\\?a=${escena.autora}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: AUTORA })
  await expect(panel.getByRole("heading", { name: AUTORA, level: 2 })).toBeFocused()
  await expect(panel).toContainText("2 materiales · 3 ideas sacadas")
  await expect(panel.getByRole("link", { name: TEMA_PRINCIPAL })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.carga}`,
  )
  await expect(panel.getByRole("link", { name: `Ver todo de ${AUTORA}` })).toHaveAttribute(
    "href",
    `/biblioteca/autores/${escena.autora}`,
  )
  await expect(page.getByRole("complementary", { name: "Autor elegido" })).toHaveCSS("position", "sticky")

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\/autores(?:[?&]v=\d+)?$/)
  await expect(page.getByText(PISTA_DE_AUTORES)).toBeVisible()

  await page.getByLabel("Buscar por nombre").fill("instituto")
  await expect(tabla.getByRole("row")).toHaveCount(2)
  await expect(tabla).toContainText(SIN_MATERIAL)
})

test("Temas is a table that keeps its filters; a row opens the side panel, and closing gives the focus back", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?cobertura=un-autor")
  const tabla = page.getByRole("table", { name: "Temas" })
  await expect(tabla.getByRole("columnheader")).toHaveText(["Tema", "Ideas sacadas", "Autores"])
  await expect(tabla.getByRole("row")).toHaveCount(3)
  await expect(page.getByText(PISTA_DE_TEMAS)).toBeVisible()

  const fila = tabla.getByRole("link", { name: TEMA_DE_UN_AUTOR, exact: true })
  await tocarHastaLlegar(
    page,
    fila,
    new RegExp(`/biblioteca/temas\\?cobertura=un-autor&t=${escena.deUnAutor}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: TEMA_DE_UN_AUTOR })
  await expect(panel.getByRole("heading", { name: TEMA_DE_UN_AUTOR, level: 2 })).toBeFocused()
  await expect(panel).toContainText("2 ideas sacadas · 1 autor")
  await expect(panel).toContainText("Un solo autor")
  await expect(panel.getByRole("link", { name: "Ver sus ideas" })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.deUnAutor}`,
  )

  await panel.getByRole("link", { name: "Cerrar el panel" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?cobertura=un-autor(?:[?&]v=\d+)?$/)
  await expect(page.getByText(PISTA_DE_TEMAS)).toBeVisible()
  await expect(fila).toBeFocused()
})

test("from Materiales, the table's topic and the panel's author lead to their pages (D9)", async ({ page }) => {
  await page.goto("/biblioteca")
  const tema = page.getByRole("table", { name: "Materiales" }).getByRole("link", { name: `${TEMA_PRINCIPAL} y 1 tema más` })
  await expect(tema).toHaveAttribute("href", `/biblioteca/temas/${escena.carga}`)

  await page.goto(`/biblioteca?m=${escena.listo}`)
  const panel = page.getByRole("region", { name: TITULO_LISTO })
  await tocarHastaLlegar(
    page,
    panel.getByRole("link", { name: AUTORA, exact: true }),
    new RegExp(`/biblioteca/autores/${escena.autora}$`),
  )
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
})

test("the tables and their side panels pass WCAG 2.x AA", async ({ page }) => {
  await page.goto(`/biblioteca/autores?a=${escena.autora}`)
  await expect(page.getByRole("region", { name: AUTORA })).toBeVisible()
  expect(await revisarConAxe(page, "autores con el panel")).toEqual([])
  await page.goto(`/biblioteca/temas?t=${escena.carga}`)
  await expect(page.getByRole("region", { name: TEMA_PRINCIPAL })).toBeVisible()
  expect(await revisarConAxe(page, "temas con el panel")).toEqual([])
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  expect(await revisarConAxe(page, "tema en el computador")).toEqual([])
})
```

- [ ] **Step 2: Run it**, and batch 1's desktop file (its panel now links the author; its text is unchanged).

Run: `pnpm exec playwright test --project escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts tests/e2e/biblioteca.escritorio.ts --grep-invert "visual:"`
Expected: PASS. (`--grep-invert` leaves batch 1's `visual:` test out until Task 29 retakes its baseline, F11: Playwright matches `-g` against the project and file names too, so the exclusion is by the test's own words.) A red step is fixed test first, as Task 25.

- [ ] **Step 3: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-autores-temas.escritorio.ts
git add tests/e2e/biblioteca-autores-temas.escritorio.ts
git commit -m "$(cat <<'EOF'
Check Autores and Temas on a computer: tables, side panels and the links from Materiales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 28: the whole Biblioteca E2E together, by file

**Files:** none new.

- [ ] **Step 1: Run every Biblioteca E2E file in one go** (one worker, so the scenes never overlap), still leaving out the three baselines that move until Task 29.

Run:

```bash
pnpm exec playwright test tests/e2e/biblioteca.spec.ts tests/e2e/biblioteca-subir.spec.ts tests/e2e/biblioteca-autores.spec.ts tests/e2e/biblioteca-temas.spec.ts tests/e2e/biblioteca-enlaces.spec.ts
pnpm exec playwright test --project escritorio --grep-invert "visual:"
```

Expected: PASS. A scene that leaks into another file (a topic or an author left over) shows here: fix it in `tests/e2e/biblioteca-escena.ts` and commit as `Keep the Biblioteca's E2E scenes apart`.

- [ ] **Step 2: Nothing to commit** unless Step 1 led to a fix.

---

# Release

### Task 29: visual baselines of Autores and Temas, and the three that moved retaken, only after Federico looks

**Commit only after Federico approves the captures.** Do not generate or commit any baseline before Step 3. The new baselines, the three retaken ones (F11) and the tests that take them go in one commit of their own.

**Files:**
- Modify: `tests/e2e/visual.spec.ts`, `tests/e2e/biblioteca-autores-temas.escritorio.ts`
- Create (Step 3 only): `tests/e2e/visual.spec.ts-snapshots/biblioteca-autores-app-darwin.png`, `biblioteca-autor-app-darwin.png`, `biblioteca-temas-app-darwin.png`, `biblioteca-tema-app-darwin.png`; `tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-autores-escritorio-escritorio-darwin.png`, `biblioteca-autor-escritorio-escritorio-darwin.png`, `biblioteca-temas-escritorio-escritorio-darwin.png`, `biblioteca-tema-escritorio-escritorio-darwin.png`
- Retake (Step 3 only): `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png`, `biblioteca-detalle-app-darwin.png`, `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png`

- [ ] **Step 1: Add the captures (not committed yet).** In `tests/e2e/visual.spec.ts`, change the scene import to `import { AUTORA, sembrarAutoresYTemas, sembrarBiblioteca, TEMA_PRINCIPAL, TITULO_LISTO } from "./biblioteca-escena"` and append:

```ts
test("biblioteca: Autores and Temas on the phone, and an author's and a topic's page", async ({ page }) => {
  const escena = await sembrarAutoresYTemas()
  await page.goto("/biblioteca/autores")
  await expect(page.getByRole("list", { name: "Autores" })).toBeVisible()
  await capturaDe(page, "biblioteca-autores")
  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
  await capturaDe(page, "biblioteca-autor")
  await page.goto("/biblioteca/temas")
  await expect(page.getByRole("list", { name: "Temas" })).toBeVisible()
  await capturaDe(page, "biblioteca-temas")
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
  await capturaDe(page, "biblioteca-tema")
})
```

In `tests/e2e/biblioteca-autores-temas.escritorio.ts`, add `import { mkdirSync } from "node:fs"`, `import { join } from "node:path"`, add `type Page` to the `@playwright/test` import, and append:

```ts
async function capturaDeEscritorio(page: Page, nombre: string): Promise<void> {
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, nombre), fullPage: true })
    return
  }
  await expect(page).toHaveScreenshot(nombre, { fullPage: true })
}

test("visual: Autores and Temas with their side panels, and an author's and a topic's page", async ({ page }) => {
  await page.goto(`/biblioteca/autores?a=${escena.autora}`)
  await expect(page.getByRole("region", { name: AUTORA })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-autores-escritorio.png")
  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-autor-escritorio.png")
  await page.goto(`/biblioteca/temas?t=${escena.carga}`)
  await expect(page.getByRole("region", { name: TEMA_PRINCIPAL })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-temas-escritorio.png")
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-tema-escritorio.png")
})
```

- [ ] **Step 2: Write review captures for Federico.**

```bash
VISUAL_FINALES=test-results/finales-autores-temas pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca"
VISUAL_FINALES=test-results/finales-autores-temas pnpm exec playwright test --project escritorio -g "visual"
open test-results/finales-autores-temas
```

Expected: at 390 px `biblioteca-autores.png`, `biblioteca-autor.png`, `biblioteca-temas.png`, `biblioteca-tema.png`, plus `biblioteca-lista.png` (three tabs in the nav), `biblioteca-detalle.png` (topic rows are links) and `biblioteca-subir.png` (unchanged); at 1280 px `biblioteca-autores-escritorio.png`, `biblioteca-autor-escritorio.png`, `biblioteca-temas-escritorio.png`, `biblioteca-tema-escritorio.png`, `biblioteca-escritorio.png` (nav, topic cell and author links) and `biblioteca-subir-escritorio.png` (unchanged). **Stop: ask Federico to look and say OK**, pointing him at the three tabs on the phone (deviation 11) and the author link in the Materiales panel. Fix what he asks for (test first where it is behaviour), regenerate the review captures, and ask again.

- [ ] **Step 3: After Federico's OK, take the baselines.**

```bash
pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca" --update-snapshots
pnpm exec playwright test --project escritorio -g "visual" --update-snapshots
pnpm exec playwright test tests/e2e/visual.spec.ts
pnpm exec playwright test --project escritorio
git status --short tests/e2e
```

Expected: the last two runs pass without `--update-snapshots`; `git status` shows only the eight new PNGs, the three retaken ones (`biblioteca-lista`, `biblioteca-detalle`, `biblioteca-escritorio`) and the two spec files. A changed Subir baseline, or any other one, means a screen outside this batch moved: stop and find why.

- [ ] **Step 4: Commit them alone.**

```bash
pnpm exec biome check --write tests/e2e/visual.spec.ts tests/e2e/biblioteca-autores-temas.escritorio.ts
git add tests/e2e/visual.spec.ts tests/e2e/biblioteca-autores-temas.escritorio.ts \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-autores-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-autor-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-tema-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-detalle-app-darwin.png \
  tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots \
  tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png
git commit -m "$(cat <<'EOF'
Add the visual baselines of Autores and Temas and retake the three that moved, reviewed by Federico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 30: the full gate

**Files:** none new.

- [ ] **Step 1: Run every check.**

Run: `pnpm lint && pnpm type && pnpm build && pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: all green (the E2E runs the `app` and `escritorio` projects, visual baselines included).

- [ ] **Step 2: Grep the new code for the banned patterns.**

Run: `git diff origin/main --name-only -- app lib components | xargs grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|—|text-\[[0-9]|min-h-1[1-6]\b|text-error|catch \{\s*\}"`
Expected: no output. (Only the app's own code: batch 1's unit tests assert `text-error` on the error pill and would match.)

Run: `grep -rnE "\"[^\"]*(Afirmaciones|afirmaciones|Papel|Puntaje)[^\"]*\"" "app/(app)/biblioteca"`
Expected: no output (the words test covers it too; this is the quick look).

- [ ] **Step 3: Check what must not change.**

```bash
git diff --stat origin/main -- components/nav-inferior.tsx app/ir-a-biblioteca supabase trigger "app/(app)/biblioteca/tarjeta-de-material.tsx" playwright.config.ts
git -C /Users/fede/Projects/conidolly-ingesta status --short && git -C /Users/fede/Projects/conidolly-ingesta log -1 --format=%h
```

Expected: the first prints nothing (no change to the bar, the bridge, the database, the tasks, the phone card or the run's config); the second prints nothing and then `39f9887` (Ingesta untouched).

- [ ] **Step 4: Nothing to commit** unless Step 2 or 3 led to a fix (commit it with its task's message style and rerun Step 1).

## Release (controller, not plan tasks)

The controller does these after Task 30 and the code review, under Federico's standing release authorization: the PR ("Part of #17", never "Closes"), CI, merge, and the production check: without a session `/biblioteca/autores` and `/biblioteca/temas` redirect to sign-in. Then Federico opens both with Coni's account by the address. **No migration, no Trigger deploy, no env var, no CORS.** The bar's tab still opens Ingesta (batch 7).

---

## Self-review against the spec

| Spec section | Where |
|---|---|
| Context: no migration, no Trigger deploy; `temas_resumen`, `fusionar_autores`, `excluir_afirmacion` already there; `borrar_autor` waits | F1 to F4; Rules; Task 30 Step 3 |
| 1. Two sections in `NavDeBiblioteca`, each with its detail page, `exigirConi()`, the section's loading/error/not-found, only by address | Task 12; Tasks 15, 17, 20, 21; Task 25 (not found), Task 26 (only Coni) |
| 1. Phone cards; desktop table plus sticky side panel (`md:grid-cols-[minmax(0,1fr)_20rem]`, `md:sticky md:top-24`); a row opens its summary with the link to its page; a phone card goes to the page | Tasks 14, 15, 18, 20 (D4); Task 27 |
| 1. The topic of a material links to its topic; the author in the material panel links to its author | Tasks 22, 23 (D9, deviations 4 to 6); Tasks 26, 27 |
| 2. Autores list: name, type, 3 top topics, counts without zeros; empty author's sentence with the Subir link; order | Tasks 1, 2, 7, 14 (D3, deviation 3); Task 24 |
| 2. Search "Buscar por nombre", name and alias with `buscarAutores`, on the client; "Nadie se llama así todavía." | Tasks 2, 14 (D5); Task 24 |
| 2. Detail: name, type, credential, counts; ideas by topic, most first, "Sin tema todavía" last, headings link to the topic; "Ideas ocultas (N)" with "Mostrar" | Tasks 3, 7, 13, 17; Tasks 24, 25 |
| 2. Unir con otro autor: same search, confirmation that names both and says it cannot be undone; never on Coni's card, never Coni as the one that disappears; goes to the one that stayed | Tasks 9, 16, 17 (D7); Task 24 |
| 3. Temas list: name, "N ideas sacadas · N autores" without zeros, "Ya lo traté", "Un solo autor"; order | Tasks 1, 4, 8, 18 (deviation 10); Task 25 |
| 3. Quick filters "Todos", "Sin tratar", "Ya los traté", "Un solo autor" with counts, `?cobertura=`, unknown reads Todos | Tasks 5, 19, 20; Task 25 |
| 3. Más filtros: pillar select of the active pillars with their id, `?pilar=<uuid>`, combined with coverage; no pillar chips | Tasks 5, 8, 19, 20 (deviation 7); Task 25 |
| 3. Detail: name, description, ideas by author (most first), headings link to the author, "Ocultar" on each; the quiet note after hiding | Tasks 3, 8, 13, 21 (D6, deviations 1 and 2); Task 25 |
| 3. Merged topics redirect to the one that stayed (at most 5 steps); missing or loop is `notFound()` | Tasks 4, 8, 21; Task 25 |
| 4. `PALABRAS`: "ideas sacadas", "¿Quién es para ti?"; type, evidence and score only inside "Detalle para WAV", folded, on each idea of both detail pages; the words test on every new file | Tasks 6, 13 (D8, deviation 9); Rules; Tasks 24, 26 |
| 5. `unirAutores({ origen, destino })` refusing Coni as origin before the RPC, a missing author in plain words; `ocultarIdea({ id, oculta })` mapping `P0002`; both through `conSesionDeConi` with Zod and `revalidatePath("/biblioteca", "layout")` | Tasks 9, 10, 11 (D1) |
| 6. Unit: counts and wording, coverage filter (each value, unknown, with pillar), orders, grouping, search, merged chain and loop | Tasks 1 to 6, 14, 19, 20, 21 |
| 6. Integration: lists and details as Coni; both actions as Coni; WAV refused on both; Coni refused as origin; hiding removes from the topic and shows under the author's hidden ones | Tasks 7 to 10 |
| 6. E2E phone and desktop: each section and detail; each quick filter and the pillar; search; join; hide and show; merged address; links from a material; axe; large text; design rules on every new file | Tasks 24 to 28; Rules (`diseno-reglas` walks `app/`) |
| 6. Visual baselines of both lists and both details, phone and desktop, committed after Federico looks | Task 29 (plus the three retaken ones, F11) |
| 7. Release: merge only; production redirect check; Federico opens both with Coni's account | Release (controller) |
| Out of scope: deleting an author, pillar chips, rating topics, aliases, merging topics by hand, the tab switch | Not planned; Task 30 Step 3 checks the tab is unchanged |

Type and name check across tasks: `conCuenta`, `cuentasDeAutor`, `cuentasDeTema` (Task 1) are what Tasks 14, 15, 17, 18, 19, 21 call; `etiquetaDeTipoDeAutor` (Task 1) feeds `descripcionDeAutor` (Task 2) and `TablaDeAutores` (Task 14); `AutorResumido`, `armarResumenDeAutores`, `buscarAutores<T>`, `hrefDeAutor`, `hrefDeAutores`, `RUTA_DE_AUTORES`, `sePuedeUnir`, `descripcionDeAutor` (Task 2) match Tasks 7, 12, 14 to 17, 21, 23; `IdeaLeida`, `agruparPorTema`, `agruparPorAutor`, `GrupoPorTema`, `GrupoPorAutor` (Task 3) and `idDeIdea` (Task 13) match Tasks 7, 8, 13, 17, 21; `TemaResumido`, `ordenarTemas`, `seguirFusiones`, `PASOS_MAXIMOS_DE_FUSION` (Task 4) match Tasks 8, 18 to 20; `FiltrosDeTemas`, `Cobertura`, `leerFiltrosDeTemas`, `filtrarPorCobertura`, `contarCoberturas`, `hayFiltrosDeTemas`, `hrefDeTemas`, `hrefDeTema`, `RUTA_DE_TEMAS`, `hrefTrasOcultar`, `leerIdeaOculta`, `AVISO_TRAS_OCULTAR`, `AVISO_TRAS_OCULTAR_LA_ULTIMA` and `leerSeleccion(params, clave)` (Task 5) match Tasks 12, 15, 17 to 22; `lineasDeIdeaParaWav` (Task 6) is what `ListaDeIdeas` folds (Task 13); `resumirAutores`, `leerAutor`, `AutorLeido` (Task 7) and `listarTemas`, `listarPilaresDeTemas`, `Pilar`, `leerTema`, `TemaLeido`, `destinoDeTema` (Task 8) are what the pages and their mocks use (Tasks 15, 17, 19 to 21); `UnionDeAutores`, `CambioDeIdea`, `unirAutores`, `ocultarIdea` (Tasks 9, 10) match Task 11's wrappers `unirAutoresAccion`, `ocultarIdeaAccion`, which Tasks 13, 16 and the page mocks call; `TemaPrincipal.id` (Task 22) is what `TemaDelMaterial conEnlace` links; `sembrarAutoresYTemas`, `sembrarTemasEnBucle`, `EscenaDeAutoresYTemas`, `OTRO_TEMA`, `OTRA_AUTORA`, `SIN_MATERIAL`, `TEMA_DE_UN_AUTOR`, `TEMA_FUSIONADO`, `PILAR`, `IDEA_DE_CONI`, `IDEA_QUE_SE_OCULTA`, `IDEA_UNICA_DE_PAUSAS` (Task 24) are what Tasks 25 to 27 and 29 import.
