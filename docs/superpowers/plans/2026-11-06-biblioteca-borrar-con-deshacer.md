# Biblioteca batch 4: delete with "Deshacer" (change 29, stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni taps «Borrar material» or «Borrar autor», the row disappears from every Biblioteca screen at once, the list shows Conidolly's 8 second notice with «Deshacer», and the ten-minute maintenance deletes it for real (row, ideas and R2 folder) a minute after the mark.

**Architecture:** One additive migration (Coni's `borrar_desde` columns, indexes, `*_visibles` views and three functions, plus `temas_resumen` filtered and the deletions logged). Every Biblioteca reader and every action that reads before acting in `lib/datos/biblioteca.ts` and `lib/acciones/biblioteca.ts` filters marked rows (`.is("borrar_desde", null)` on the table, `materiales!inner(borrar_desde)` on ideas). Four new actions call the two mark RPCs and map their errors to Coni's words; the delete actions answer the destination, and the screens go there with `useIrA`. The list pages always draw `AvisoDeBorrado`, which reads `?aviso=borrado&id=<id>` once and keeps its toast while `TrasElAviso` takes the note out of the address. `mantenimiento-frecuente` gains a first step `borrado` (`borrar_lo_marcado(now - 1 min)` and the R2 folders); `procesar-material` stops on a marked material before spending. A separate Ingesta PR hides marked rows there too and is merged first.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript strict, Supabase Postgres (RLS, security definer RPCs, security invoker views), `@supabase/supabase-js`, Zod 4, Trigger.dev v4, Vitest 4 (jsdom unit, node integration against the local Supabase), Playwright + `@axe-core/playwright`, Biome (safe mode only), Tailwind v4 semantic tokens.

**Spec:** `docs/superpowers/specs/2026-11-06-biblioteca-borrar-con-deshacer-design.md` (issue WAV-WaAreVision/estudio-coni#17, pedido 29b, batch 4 of 7). Coni's SQL: `docs/pedido-coni-2026-10-31/pedido-original.md:253-322` (markdown-escaped; the SQL below is already unescaped). Plans whose style and helpers this one reuses: `docs/superpowers/plans/2026-11-04-biblioteca-autores-temas.md`, `docs/superpowers/plans/2026-11-03-biblioteca-subir.md`, `docs/superpowers/plans/2026-11-05-borradores-de-pilares.md` (`useIrA`, `?aviso=`).

---

## Where to work

- Conidolly worktree: `/Users/fede/Projects/estudio-coni/.worktrees/borrar-con-deshacer`, branch `feat/biblioteca-borrar-con-deshacer` (holds the spec). Below, **`CONIDOLLY`** is that path; every Conidolly command runs from it.

  ```bash
  cd /Users/fede/Projects/estudio-coni/.worktrees/borrar-con-deshacer && pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it (.env* is ignored)
  ```

- Ingesta: `/Users/fede/Projects/conidolly-ingesta` (its own git repo), branch `feat/borrado-diferido` created in Lote 6. Below, **`INGESTA`**. Leave its untracked `.claude/` and `agent-os/` alone.
- Local Supabase of estudio-coni (`pnpm db:start` once): API `127.0.0.1:54421`, database `54422`. After writing or changing the migration: `pnpm db:reset` then `pnpm db:types` (regenerates `lib/supabase/database.types.ts`; never edit it by hand). Ingesta's integration tests and its `pnpm db:types` run against this same local database, so they need the migration applied (Lote 1 first).
- Read `CONIDOLLY/CLAUDE.md` and `INGESTA/CLAUDE.md` before their first task.

## Rules for every task

- **TDD strict:** write the failing test, run it and see it fail for the reason written in the step, write the minimum code, run it green. One task is one commit.
- Commit messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes only, **never `--unsafe`**), then `head -1` every client file the task touched: it must still be `"use client"`.
- No `any`, no `@ts-expect-error`, no non-null `!`, no silent `catch`. No hex colour outside `app/globals.css`. No `text-[...]` sizes; `text-error` only through `LineaDeError` (`tests/unit/diseno-reglas.test.ts` walks every file of `app/` and `components/`).
- Copy for Coni in Spanish of Chile, tú, quotes as «», **no em dash anywhere** (code, copy, comments, this plan's outputs).
- Code identifiers in Spanish like the codebase; comments in English, sparse, only for "why".
- Navigation after an action: the action answers `{ destino }`, the client calls `ir(destino, origen)` from `useIrA` (`components/use-ir-a.ts`). **Never `redirect()`** in a new action.
- From Lote 2 on, run `pnpm test:run` (all unit tests) before each commit.

## Facts fixed before planning

Checked on 2026-11-06 at `1163dc2`.

- **F1. Migrations.** The latest is `supabase/migrations/20261105000200_angulos_de_pilar.sql`; this batch adds `20261106000100_biblioteca_borrado_diferido.sql`. Coni named hers `20261101000100_...`, but `20261101000100_registro_de_datos.sql` already exists and the timestamp must come after the latest.
- **F2. `temas_resumen`** is defined once, in `20261003000310_afirmaciones_temas.sql:77-106` (not 85-106), and read by `temas_de_pilar`, `temas_de_red` (`20261104000300_temas_tratados.sql:57-60`, behind `listarTemas`), the motor (`20261003000410`, `20261104000240`) and Ingesta's `/temas`. `temas_de_pilar` returns `setof public.temas_resumen`, so `create or replace view` must keep its 12 columns, names and order.
- **F3. Foreign keys.** `afirmaciones.material_id` and `fichas.material_id` and `materiales_archivos.material_id` are `on delete cascade`; `materiales.autor_id` and `afirmaciones.autor_id` are `on delete restrict`. Coni's author is the row with `tipo = 'coni'`.
- **F4. `registro_de_borrados`** (`20261101000100_registro_de_datos.sql:87`): `regla` must match `^[a-z][a-z_]{2,39}$`, `cantidad > 0`; written today only by the nightly run in TypeScript (`lib/datos-personales/borrados.ts`). An unknown `regla` reads as «elementos de <regla con espacios>» in Ajustes (`lib/datos-personales/presentar.ts:38`).
- **F5. Readers** in `lib/datos/biblioteca.ts`: `listarMateriales` :84, `contarPorEstado` :119, `leerMaterialConFicha` :146, `leerMapaDelMaterial` :167, `leerPanelDelMaterial` :190 (goes through `leerMaterialConFicha`), `listarAutores` :216, `resumirAutores` :227, `leerAutor` :255, `listarTemas` :312 (through `temas_de_red`, so through `temas_resumen`), `leerTema` :383. `leerTemasPrincipales` :59 reads ideas of material ids `listarMateriales` already filtered.
- **F6. Actions** in `lib/acciones/biblioteca.ts`: `editarMaterial` :134, `crearAutor` :183 (`crear_autor` answers the existing author when the name or an alias matches, marked or not), `pedirTextoOriginal` :210, `confirmarMaterial` :362, `unirAutores` :425 (reads the origin only). **A private helper named `borrarMaterial` already exists at :239** (deletes a `procesando` row after a failed upload): Task 10 renames it to `borrarMaterialSinSubir` so the new exported action can take the spec's name.
- **F7. The server wrappers** are in `app/(app)/biblioteca/acciones.ts` (`refrescar` + `conSesionDeConi(nombre, Esquema, entrada, (db, d) => accion(...))`). `conSesionDeConi` answers `ERROR_SOLICITUD`, `ERROR_SESION_VENCIDA`, `ERROR_SOLO_CONI`; `aResultado` turns a `Falla` into her message and anything else into `ERROR_GENERICO` (logged).
- **F8. `?aviso=`.** `conAviso` / `leerAviso` (`lib/dominio/biblioteca/borradores.ts:72-80`) whitelist the draft notes, drawn as a quiet `LineaDeEstado`. A deletion's note is a toast with «Deshacer», so it gets its own reader (`leerBorrado`) and key `borrado`. `TrasElAviso` (`app/(app)/biblioteca/tras-el-aviso.tsx`) removes one parameter; Task 16 lets it remove `id` too. `useIrA`'s screen comparison ignores `aviso` and finishes on `EVENTO_DE_LLEGADA`, which `TrasElAviso` fires.
- **F9. The toast** `Aviso` (`components/ui/aviso.tsx`): 8 s, `alDeshacer`, `deshaciendo` (tracked undo: stays with «Deshaciendo…» until the caller changes it), `enfocarDeshacer` (used by `app/(app)/ideas/eleccion-de-ideas.tsx:202` the same way). It is an `<output>`, so its role is `status`.
- **F10. Maintenance.** `mantenimientoFrecuente` (`lib/mantenimiento/ejecutar.ts:83`) runs `enSerie({ arranques, renders, voces, gastos, temas })`; `DepsFrecuente` (:47) has no `almacen`; `depsFrecuente` (`lib/produccion/deps-reales.ts:157-171`) builds it; `almacenReal()` is already used by `depsNocturno` (:237) and `depsTemas`. `almacen.borrarCarpeta(materialId)` (`lib/proveedores/almacen.ts:404`) lists and deletes `materiales/<id>/`. Objects that build a `DepsFrecuente`: `tests/unit/mantenimiento-ejecutar.test.ts:75`, `tests/integration/arranques.test.ts:191,204` (the second asserts the job order), `tests/integration/conciliar.test.ts:338`, `tests/integration/mantenimiento-temas.test.ts:248` and the next test.
- **F11. Processing.** `procesarMaterial` (`lib/ingesta/procesar.ts:612`) reads the row with `leerMaterial` (:129, throws `No existe el material` when missing, pinned by `tests/integration/procesar-material.test.ts:418`), then every paid step calls `exigirMaterial` (`lib/ingesta/gasto-material.ts:45`, through `existeMaterial` :38), which throws `MaterialBorrado`; the catch returns `{ resultado: "borrado" }`. A `procesando` row with a `motivo_fallo` offers «Reintentar» (`lib/dominio/biblioteca/estado.ts:26`, `reintentar_material` accepts it).
- **F12. Test styles to mirror:** SQL as actors with `como(sesion, fn)` / `fallaCon` / `asumir` (`tests/integration/db.ts`, transaction always rolled back; `tests/integration/autores.test.ts`); readers and actions against the local database with `clienteDeConi()` / `clienteDelMantenedor()` (`tests/integration/sesion-coni.ts`) and `tests/integration/siembra-biblioteca.ts`; service client `clienteDeServicio()` (`tests/integration/servicio.ts`); server wrappers with `conSesionDeConi` mocked (`tests/unit/biblioteca-acciones-servidor.test.ts`); client components with the actions module and `next/navigation` mocked (`tests/unit/biblioteca-pagina-borradores.test.tsx:155-200`); pages in node by walking their element tree (`tests/unit/biblioteca-pagina-materiales.test.tsx`); E2E with `sembrarAutoresYTemas()` (`tests/e2e/biblioteca-escena.ts`, the run owns the Biblioteca), `bloquearRedExterna`, `tocarHastaLlegar`, `revisarConAxe` (`tests/e2e/ayudas.ts`). Playwright: one worker; project `app` is the phone (390 x 844) and runs `*.spec.ts`; `escritorio` (1280 x 900) runs `*.escritorio.ts`.
- **F13. The E2E scene** (`sembrarAutoresYTemas`): `escena.listo` («Burnout y teletrabajo: revisión 2024», by Daniela Ruiz, 2 ideas in «Carga mental», 1 in «Pausas activas»); `escena.esperaOk` («Charla larga sobre el síndrome del impostor», Daniela, `procesando` waiting for cost, no ideas); Daniela has 2 materials and 3 ideas; «Carga mental» has 3 ideas from 2 authors (one is Coni's); `escena.sinMaterial` («Instituto del Descanso») has nothing; `escena.coni` is Coni's card. The quick filter reads «Procesando · 2».
- **F14. Ingesta** (`39f9887`): readers and actions in `lib/ingesta/materiales.ts`, `autores.ts`, `temas.ts`, `subir.ts`; tests in `tests/integration/*.test.ts` with `clienteDeConi()`, `clienteDeWav()`, `clienteDeServicio()` from `tests/integration/sesion.ts`; `leerTodas(nombre, (desde, hasta) => ...range(desde, hasta))`; types with `pnpm db:types` against the local database at 54422. Its own «Borrar» is a hard delete and stays (spec decision 6).
- **F15. Commands:** unit `pnpm exec vitest run <file>`, all unit `pnpm test:run`, integration `pnpm test:db <file>`, E2E phone `pnpm exec playwright test <file>`, desktop `pnpm exec playwright test --project escritorio <file>`, gate `pnpm lint`, `pnpm type`, `pnpm build`, `pnpm test:run`, `pnpm test:db`, `pnpm test:e2e`.

## Decisions taken while planning (spec ambiguities resolved)

- **D1. Filters, not views, in the readers.** The spec allows "the views or the same filter". Every reader (both repos) filters the base table with `.is("borrar_desde", null)` and ideas with `materiales!inner(borrar_desde)` + `.is("materiales.borrar_desde", null)`: the embeds (`autores ( nombre )`, `fichas (...)`) and the generated types stay exactly as they are. The views are still created as Coni wrote them (for later batches and SQL).
- **D2. `temas_resumen` filters its evidence subquery too.** The spec says "plus `and m.borrar_desde is null` in its join"; the `evidencia` subquery reads `afirmaciones` without that join, so a marked material's evidence would still count. Both get the filter.
- **D3. Log names.** `borrar_lo_marcado` writes `materiales_de_biblioteca` and `autores_de_biblioteca` to `registro_de_borrados`, one row each only when it deleted something (Ajustes reads «Se borraron 2 elementos de materiales de biblioteca»; naming them nicer is out of scope).
- **D4. Idempotent marks.** `no_se_pudo_marcar` means "already in that state, or gone". The actions look at the row: a second «Borrar» of a marked row and a second «Deshacer» of a visible row succeed; a missing row is «No encontré ese material.» / «Ese autor ya no existe.» on delete and «Ya no se puede recuperar: se borró del todo.» on undo. Any other database error is logged and answered «No pude borrarlo. Prueba de nuevo.» / «No pude recuperarlo. Prueba de nuevo.». Coni's own card refused by the RPC (a race) reads «Tu propia ficha no se puede borrar.».
- **D5. `crearAutor` brings a marked author back.** `crear_autor` matches by name or alias and answers the marked row; the unique index forbids a new one. Typing the name of an author she just deleted means she wants it: the action unmarks it (`marcar_autor_para_borrar(id, false)`) and answers it. Same in Ingesta.
- **D6. Where the note lives.** `?aviso=borrado&id=<uuid>` on `/biblioteca` (material) or `/biblioteca/autores` (author); filters and the open panel are not kept. The page reads the name of the marked row (`leerNombreDeLoBorrado`, which returns null once the row is no longer marked or gone, so a forged or stale address shows nothing). `AvisoDeBorrado` is drawn on every render of the list (with `borrado={null}` when there is no note) so its state survives `TrasElAviso` taking the note out and the refresh after «Deshacer»; a new id starts a new toast. Text: «Borré «<título>».», «Lo borré.» for a material without title; after «Deshacer»: «Lo recuperé.» or the error, in a second toast without «Deshacer».
- **D7. Where the button lives.** «Borrar material» is a quiet button (`variante="callado"`) at the end of the material page (phone column and desktop side column, as every other action there) and at the end of the list's desktop side panel (`PanelDeMaterial`) before «Cerrar el panel». «Borrar autor» only on the author page, only when `sePuedeBorrarAutor` (not Coni's card, 0 live materials, 0 visible and 0 hidden ideas). No confirmation dialog (spec).
- **D8. A run stopped by a mark leaves a retryable row.** If she deletes a `procesando` material and then taps «Deshacer», the stopped run would leave it `procesando` with no run and no reason: stuck. When `procesar-material` stops on a marked row it releases its claim and writes the reason «Paré de procesarlo porque lo borraste. Toca Reintentar para seguir.» (only while still `procesando`), so «Reintentar» appears if she brings it back. A missing row is left alone. The existing test that pinned "missing material is a configuration problem" changes to "missing material ends as borrado" (spec decision 5).
- **D9. Maintenance step tested against the local database.** `borrarLoMarcado` is one RPC plus the folders; its margin, its R2 failure and its log are integration tests (`pnpm test:db`), and `mantenimiento-ejecutar.test.ts` mocks it to check it runs first.
- **D10. Accepted, not built:** an `editarMaterial` race that assigns an author marked in another tab (the picker hides marked authors; the author then stays marked and referenced); Ingesta's `semana.ts` and Conidolly's `lib/datos/reclasificacion.ts`, `lib/mantenimiento/temas.ts`, `lib/motor/semanal.ts`, `lib/datos/pilares-por-red.ts` (spec decision 4).

## File structure

New (paths from `CONIDOLLY`):

| File | Responsibility |
|---|---|
| `supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql` | columns, indexes, views, three functions, `temas_resumen` |
| `lib/dominio/biblioteca/borrado.ts` | `LoBorrado`, `hrefTrasBorrar`, `leerBorrado`, `avisoTrasBorrar`, Coni's words, `sePuedeBorrarAutor` |
| `lib/mantenimiento/borrado-diferido.ts` | `MARGEN_DE_BORRADO_MS`, `DepsBorrado`, `borrarLoMarcado` |
| `app/(app)/biblioteca/boton-borrar.tsx` | «Borrar material» / «Borrar autor», error line, `useIrA` |
| `app/(app)/biblioteca/aviso-de-borrado.tsx` | the toast with «Deshacer» on the list |
| `tests/integration/borrado-diferido-esquema.test.ts` | SQL |
| `tests/integration/borrado-diferido-lecturas.test.ts` | readers |
| `tests/integration/acciones-borrado-diferido.test.ts` | actions |
| `tests/integration/borrado-diferido-mantenimiento.test.ts` | maintenance step |
| `tests/unit/biblioteca-borrado.test.ts` | pure domain |
| `tests/unit/biblioteca-boton-borrar.test.tsx`, `tests/unit/biblioteca-aviso-de-borrado.test.tsx` | client components |
| `tests/e2e/biblioteca-borrar.spec.ts`, `tests/e2e/biblioteca-borrar.escritorio.ts` | phone and desktop E2E |

Modified: `lib/supabase/database.types.ts` (generated), `lib/datos/biblioteca.ts`, `lib/acciones/biblioteca.ts`, `app/(app)/biblioteca/acciones.ts`, `lib/mantenimiento/ejecutar.ts`, `lib/produccion/deps-reales.ts`, `lib/ingesta/gasto-material.ts`, `lib/ingesta/procesar.ts`, `app/(app)/biblioteca/tras-el-aviso.tsx`, `app/(app)/biblioteca/page.tsx`, `app/(app)/biblioteca/panel-de-material.tsx`, `app/(app)/biblioteca/materiales/[id]/page.tsx`, `app/(app)/biblioteca/autores/page.tsx`, `app/(app)/biblioteca/autores/[id]/page.tsx`, and the tests named in F10, F11 and Tasks 12, 16, 19 to 21.

Ingesta (paths from `INGESTA`): `lib/supabase/database.types.ts`, `lib/ingesta/materiales.ts`, `lib/ingesta/autores.ts`, `lib/ingesta/temas.ts`, `lib/ingesta/subir.ts`, new `tests/integration/borrado-diferido.test.ts`.

Not touched: `components/nav-inferior.tsx`, `app/ir-a-biblioteca/`, every existing migration, `trigger/*.ts` (the task files keep calling the same functions), Ingesta's hard delete.

## Lotes

| Lote | Tasks | Theme | Reviewer checkpoint |
|---|---|---|---|
| 1 | 1 to 5 | the migration and its SQL tests, types | after Task 5 |
| 2 | 6 to 12 | domain words, readers, actions, server wrappers | after Task 12 |
| 3 | 13 to 15 | maintenance and processing (Trigger code) | after Task 15 |
| 4 | 16 to 21 | screens | after Task 21 |
| 5 | 22 to 24 | E2E phone and desktop, axe | after Task 24 |
| 6 | 25 to 27 | Ingesta PR (separate repo; may start right after Lote 1) | after Task 27 |
| 7 | 28 to 29 | full gate and shipping | Federico |

At each checkpoint: run the lote's tests plus `pnpm test:run` and `pnpm type`, then dispatch `superpowers:code-reviewer` on the lote's commits (`git log --oneline <first>^..HEAD`) with the spec and this plan; fix findings with a failing test first, one commit per fix, before the next lote.

---

# Lote 1: the migration

### Task 1: columns, indexes and the two views

**Files:**
- Create: `supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql`
- Create: `tests/integration/borrado-diferido-esquema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/borrado-diferido-esquema.test.ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoOtra, comoPostgres, pool, type Sesion } from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

/** Rows are written as the owner (members cannot insert authors), then the test goes back to `sesion`. */
async function comoDueno<T>(c: Cliente, sesion: Sesion, fn: () => Promise<T>): Promise<T> {
  await asumir(c, comoPostgres)
  const resultado = await fn()
  await asumir(c, sesion)
  return resultado
}

async function uno(c: Cliente, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó: ${sql.slice(0, 60)}`)
  return id
}

const autor = (c: Cliente, nombre: string) =>
  uno(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [nombre])

const material = (c: Cliente, autorId: string, subidoPor = CONI) =>
  uno(
    c,
    `insert into public.materiales (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('Borrable', 'documento', $1, 'referente', 'hola', now(), $2) returning id`,
    [autorId, subidoPor],
  )

const marcar = (c: Cliente, tabla: "materiales" | "autores", id: string, hace = "0 seconds") =>
  c.query(`update public.${tabla} set borrar_desde = now() - $2::interval where id = $1`, [id, hace])

describe("the views of what is not marked", () => {
  it("hide a marked material and a marked author from Coni, and show nothing to anyone else", async () => {
    await como(comoConi, async (c) => {
      const [visible, marcado, autorMarcado] = await comoDueno(c, comoConi, async () => {
        const a = await autor(c, "Autora de las vistas")
        const otro = await autor(c, "Autor marcado de las vistas")
        const m1 = await material(c, a)
        const m2 = await material(c, a)
        await marcar(c, "materiales", m2)
        await marcar(c, "autores", otro)
        return [m1, m2, otro]
      })
      const materiales = await c.query<{ id: string }>("select id from public.materiales_visibles where id = any($1)", [
        [visible, marcado],
      ])
      expect(materiales.rows.map((fila) => fila.id)).toEqual([visible])
      const autores = await c.query("select 1 from public.autores_visibles where id = $1", [autorMarcado])
      expect(autores.rowCount).toBe(0)
      // The base table still holds both: only maintenance deletes for real.
      const base = await c.query("select 1 from public.materiales where id = any($1)", [[visible, marcado]])
      expect(base.rowCount).toBe(2)
    })
    await como(comoOtra, async (c) => {
      expect((await c.query("select 1 from public.materiales_visibles")).rowCount).toBe(0)
      expect((await c.query("select 1 from public.autores_visibles")).rowCount).toBe(0)
    })
  })

  it("index the marked rows for the maintenance sweep", async () => {
    const { rows } = await pool.query<{ indexname: string }>(
      "select indexname from pg_indexes where indexname in ('materiales_por_borrar', 'autores_por_borrar') order by 1",
    )
    expect(rows.map((fila) => fila.indexname)).toEqual(["autores_por_borrar", "materiales_por_borrar"])
  })
})
```

Tasks 2 to 5 append to this file; each adds to the `./db` import exactly the names it starts using (`comoMantenedor`, `comoServicio`, `fallaCon`, `MANTENEDOR`), so no import or helper is unused at any commit.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/borrado-diferido-esquema.test.ts`
Expected: FAIL with `column "borrar_desde" of relation "materiales" does not exist`.

- [ ] **Step 3: Write the migration's first part**

```sql
-- supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql
-- Borrar con «Deshacer» (pedido 29, punto 4g; Coni's SQL, docs/pedido-coni-2026-10-31/pedido-original.md:253-322):
-- a row is marked, hidden everywhere Coni looks, and the ten-minute maintenance deletes it a minute later. Adds only.
alter table public.materiales add column borrar_desde timestamptz;
alter table public.autores add column borrar_desde timestamptz;
create index materiales_por_borrar on public.materiales (borrar_desde) where borrar_desde is not null;
create index autores_por_borrar on public.autores (borrar_desde) where borrar_desde is not null;

-- What is marked is not seen in the Biblioteca's lists.
create view public.materiales_visibles with (security_invoker = true) as
select * from public.materiales where borrar_desde is null;
create view public.autores_visibles with (security_invoker = true) as
select * from public.autores where borrar_desde is null;
grant select on public.materiales_visibles, public.autores_visibles to authenticated;
```

- [ ] **Step 4: Apply it and run the test**

Run: `pnpm db:reset && pnpm test:db tests/integration/borrado-diferido-esquema.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql tests/integration/borrado-diferido-esquema.test.ts
git commit -m "Add the deletion mark and the views that hide marked rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `marcar_material_para_borrar`

**Files:**
- Modify: `supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql` (append)
- Modify: `tests/integration/borrado-diferido-esquema.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; add `comoMantenedor`, `fallaCon`, `MANTENEDOR` to the `./db` import)

```ts
const marcaDe = async (c: Cliente, tabla: "materiales" | "autores", id: string) =>
  (await c.query<{ marcado: boolean }>(`select borrar_desde is not null as marcado from public.${tabla} where id = $1`, [id]))
    .rows[0]?.marcado

describe("marcar_material_para_borrar", () => {
  it("lets Coni mark any material and unmark it again", async () => {
    await como(comoConi, async (c) => {
      const id = await comoDueno(c, comoConi, async () => material(c, await autor(c, "Autora de Coni"), MANTENEDOR))
      await c.query("select public.marcar_material_para_borrar($1, true)", [id])
      expect(await marcaDe(c, "materiales", id)).toBe(true)
      await c.query("select public.marcar_material_para_borrar($1, false)", [id])
      expect(await marcaDe(c, "materiales", id)).toBe(false)
    })
  })

  it("lets the maintainer mark only what the maintainer uploaded", async () => {
    await como(comoMantenedor, async (c) => {
      const [suyo, deConi] = await comoDueno(c, comoMantenedor, async () => {
        const a = await autor(c, "Autora del mantenedor")
        return [await material(c, a, MANTENEDOR), await material(c, a, CONI)]
      })
      await c.query("select public.marcar_material_para_borrar($1, true)", [suyo])
      expect(await marcaDe(c, "materiales", suyo)).toBe(true)
      const ajeno = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [deConi])
      expect([ajeno.code, ajeno.message]).toEqual(["22023", "no_se_pudo_marcar"])
    })
  })

  it("refuses anyone who is not Coni or the maintainer", async () => {
    await como(comoOtra, async (c) => {
      const id = await comoDueno(c, comoOtra, async () => material(c, await autor(c, "Autora ajena")))
      const error = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [id])
      expect([error.code, error.message]).toEqual(["42501", "sin_permiso"])
    })
  })

  it("says no_se_pudo_marcar for a second mark, an unmark of a visible row and a missing row", async () => {
    await como(comoConi, async (c) => {
      const id = await comoDueno(c, comoConi, async () => material(c, await autor(c, "Autora repetida")))
      const visible = await fallaCon(c, "select public.marcar_material_para_borrar($1, false)", [id])
      expect(visible.message).toBe("no_se_pudo_marcar")
      await c.query("select public.marcar_material_para_borrar($1, true)", [id])
      const segunda = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [id])
      expect(segunda.message).toBe("no_se_pudo_marcar")
      const falta = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [
        "00000000-0000-4000-8000-000000000000",
      ])
      expect([falta.code, falta.message]).toEqual(["22023", "no_se_pudo_marcar"])
    })
  })

  it("is not callable by anon and is callable by authenticated", async () => {
    const { rows } = await pool.query<{ anon: boolean; autenticado: boolean }>(
      `select has_function_privilege('anon', 'public.marcar_material_para_borrar(uuid, boolean)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.marcar_material_para_borrar(uuid, boolean)', 'execute') as autenticado`,
    )
    expect(rows[0]).toEqual({ anon: false, autenticado: true })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido-esquema.test.ts -t marcar_material_para_borrar`
Expected: FAIL with `function public.marcar_material_para_borrar(uuid, boolean) does not exist`.

- [ ] **Step 3: Append the function** (Coni's, without the `ya_volviste_a_subir` branch: spec, Deviations)

```sql

-- Coni, or whoever uploaded the material, marks it. Same rule as today's delete policy.
create function public.marcar_material_para_borrar(p_id uuid, p_borrar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales set borrar_desde = case when p_borrar then now() end
  where id = p_id and (public.es_coni() or subido_por = auth.uid())
    and (p_borrar = (borrar_desde is null));
  if not found then
    raise exception using errcode = '22023', message = 'no_se_pudo_marcar';
  end if;
end $$;

revoke execute on function public.marcar_material_para_borrar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.marcar_material_para_borrar(uuid, boolean) to authenticated;
```

- [ ] **Step 4: Apply and run**

Run: `pnpm db:reset && pnpm test:db tests/integration/borrado-diferido-esquema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql tests/integration/borrado-diferido-esquema.test.ts
git commit -m "Let Coni and the uploader mark a material for deletion and unmark it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `marcar_autor_para_borrar`

**Files:**
- Modify: `supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql` (append)
- Modify: `tests/integration/borrado-diferido-esquema.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append)

```ts
const idea = (c: Cliente, materialId: string, autorId: string, temaId: string | null, evidencia = "estudio") =>
  uno(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, 'Una idea', 'cita', 'dato', $4, $3) returning id`,
    [materialId, autorId, temaId, evidencia],
  )

describe("marcar_autor_para_borrar", () => {
  it("marks and unmarks an author with nothing live", async () => {
    await como(comoConi, async (c) => {
      const id = await comoDueno(c, comoConi, () => autor(c, "Autor vacío"))
      await c.query("select public.marcar_autor_para_borrar($1, true)", [id])
      expect(await marcaDe(c, "autores", id)).toBe(true)
      await c.query("select public.marcar_autor_para_borrar($1, false)", [id])
      expect(await marcaDe(c, "autores", id)).toBe(false)
    })
  })

  it("never marks Coni's own card", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
      const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [rows[0]?.id])
      expect([error.code, error.message]).toEqual(["22023", "autor_coni_protegido"])
    })
  })

  it("refuses an author with a live material or a live idea, and allows it once they are marked", async () => {
    await como(comoConi, async (c) => {
      const [conMaterial, conIdea, materialPropio, materialAjeno] = await comoDueno(c, comoConi, async () => {
        const a = await autor(c, "Autor con material")
        const b = await autor(c, "Autor con idea")
        const otro = await autor(c, "Autor del material ajeno")
        const propio = await material(c, a)
        const ajeno = await material(c, otro)
        await idea(c, ajeno, b, null)
        return [a, b, propio, ajeno]
      })
      for (const id of [conMaterial, conIdea]) {
        const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [id])
        expect([error.code, error.message]).toEqual(["22023", "autor_con_materiales"])
      }
      await c.query("select public.marcar_material_para_borrar($1, true)", [materialPropio])
      await c.query("select public.marcar_material_para_borrar($1, true)", [materialAjeno])
      await c.query("select public.marcar_autor_para_borrar($1, true)", [conMaterial])
      await c.query("select public.marcar_autor_para_borrar($1, true)", [conIdea])
      expect(await marcaDe(c, "autores", conMaterial)).toBe(true)
      expect(await marcaDe(c, "autores", conIdea)).toBe(true)
    })
  })

  it("refuses anyone who is not Coni or the maintainer, and says no_se_pudo_marcar for a missing author", async () => {
    await como(comoOtra, async (c) => {
      const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [
        "00000000-0000-4000-8000-000000000000",
      ])
      expect([error.code, error.message]).toEqual(["42501", "sin_permiso"])
    })
    await como(comoMantenedor, async (c) => {
      const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [
        "00000000-0000-4000-8000-000000000000",
      ])
      expect([error.code, error.message]).toEqual(["22023", "no_se_pudo_marcar"])
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido-esquema.test.ts -t marcar_autor_para_borrar`
Expected: FAIL with `function public.marcar_autor_para_borrar(uuid, boolean) does not exist`.

- [ ] **Step 3: Append the function** (Coni's, as written)

```sql

create function public.marcar_autor_para_borrar(p_id uuid, p_borrar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if exists (select 1 from public.autores where id = p_id and tipo = 'coni') then
    raise exception using errcode = '22023', message = 'autor_coni_protegido';
  end if;
  if p_borrar and (
    exists (select 1 from public.materiales where autor_id = p_id and borrar_desde is null)
    or exists (select 1 from public.afirmaciones f join public.materiales m on m.id = f.material_id
               where f.autor_id = p_id and m.borrar_desde is null)
  ) then
    raise exception using errcode = '22023', message = 'autor_con_materiales';
  end if;
  update public.autores set borrar_desde = case when p_borrar then now() end
  where id = p_id and (p_borrar = (borrar_desde is null));
  if not found then
    raise exception using errcode = '22023', message = 'no_se_pudo_marcar';
  end if;
end $$;

revoke execute on function public.marcar_autor_para_borrar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.marcar_autor_para_borrar(uuid, boolean) to authenticated;
```

- [ ] **Step 4: Apply and run**

Run: `pnpm db:reset && pnpm test:db tests/integration/borrado-diferido-esquema.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql tests/integration/borrado-diferido-esquema.test.ts
git commit -m "Let Coni mark an author with nothing live for deletion, never her own card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: `borrar_lo_marcado`, with the deletion log

**Files:**
- Modify: `supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql` (append)
- Modify: `tests/integration/borrado-diferido-esquema.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; add `comoServicio` to the `./db` import)

```ts
describe("borrar_lo_marcado", () => {
  it("deletes only what was marked before the cut, with its ideas, and returns the deleted materials", async () => {
    await como(comoServicio, async (c) => {
      const { viejo, reciente, vivo, ideaVieja } = await comoDueno(c, comoServicio, async () => {
        const a = await autor(c, "Autora del barrido")
        const m1 = await material(c, a)
        const m2 = await material(c, a)
        const m3 = await material(c, a)
        const i = await idea(c, m1, a, null)
        await marcar(c, "materiales", m1, "10 minutes")
        await marcar(c, "materiales", m2, "10 seconds")
        return { viejo: m1, reciente: m2, vivo: m3, ideaVieja: i }
      })
      const { rows } = await c.query<{ borrados: string[] }>(
        "select public.borrar_lo_marcado(now() - interval '1 minute') as borrados",
      )
      expect(rows[0]?.borrados).toContain(viejo)
      expect(rows[0]?.borrados).not.toContain(reciente)
      await asumir(c, comoPostgres)
      const quedan = await c.query<{ id: string }>("select id from public.materiales where id = any($1) order by id", [
        [viejo, reciente, vivo],
      ])
      expect(quedan.rows.map((fila) => fila.id).sort()).toEqual([reciente, vivo].sort())
      expect((await c.query("select 1 from public.afirmaciones where id = $1", [ideaVieja])).rowCount).toBe(0)
    })
  })

  it("deletes a marked author nothing points at, keeps one still referenced, and never Coni's", async () => {
    await como(comoServicio, async (c) => {
      const { suelto, referido } = await comoDueno(c, comoServicio, async () => {
        const s = await autor(c, "Autor suelto")
        const r = await autor(c, "Autor todavía citado")
        await material(c, r)
        await marcar(c, "autores", s, "10 minutes")
        // Only as the owner: the function refuses this mark, the sweep must still be safe if one exists.
        await marcar(c, "autores", r, "10 minutes")
        await c.query("update public.autores set borrar_desde = now() - interval '10 minutes' where tipo = 'coni'")
        return { suelto: s, referido: r }
      })
      await c.query("select public.borrar_lo_marcado(now() - interval '1 minute')")
      await asumir(c, comoPostgres)
      expect((await c.query("select 1 from public.autores where id = $1", [suelto])).rowCount).toBe(0)
      expect((await c.query("select 1 from public.autores where id = $1", [referido])).rowCount).toBe(1)
      expect((await c.query("select 1 from public.autores where tipo = 'coni'")).rowCount).toBe(1)
    })
  })

  it("writes how many materials and authors it deleted in the deletion log, and nothing when it deleted nothing", async () => {
    await como(comoServicio, async (c) => {
      await comoDueno(c, comoServicio, async () => {
        const a = await autor(c, "Autora del registro")
        const s = await autor(c, "Autor del registro")
        const m = await material(c, a)
        await marcar(c, "materiales", m, "10 minutes")
        await marcar(c, "autores", s, "10 minutes")
      })
      await asumir(c, comoPostgres)
      const antes = await c.query<{ regla: string; cantidad: number }>(
        "select regla, cantidad from public.registro_de_borrados where borrado_en = now()",
      )
      expect(antes.rowCount).toBe(0)
      await asumir(c, comoServicio)
      await c.query("select public.borrar_lo_marcado(now() - interval '1 minute')")
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ regla: string; cantidad: number }>(
        "select regla, cantidad from public.registro_de_borrados where borrado_en = now() order by regla",
      )
      expect(rows.map((fila) => fila.regla)).toEqual(["autores_de_biblioteca", "materiales_de_biblioteca"])
      expect(rows.every((fila) => fila.cantidad >= 1)).toBe(true)
      await asumir(c, comoServicio)
      await c.query("select public.borrar_lo_marcado(now() - interval '1 minute')")
      await asumir(c, comoPostgres)
      const despues = await c.query("select 1 from public.registro_de_borrados where borrado_en = now()")
      expect(despues.rowCount).toBe(2)
    })
  })

  it("runs only as service_role", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.borrar_lo_marcado(now())")
      expect(error.code).toBe("42501")
    })
  })
})
```

(Inside one transaction `now()` is constant, which is why the log rows are found with `borrado_en = now()`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido-esquema.test.ts -t borrar_lo_marcado`
Expected: FAIL with `function public.borrar_lo_marcado(timestamp with time zone) does not exist`.

- [ ] **Step 3: Append the function** (Coni's, plus the log: spec, Database; D3)

```sql

-- service_role (ten-minute maintenance): deletes what was marked before p_antes and returns the deleted materials so
-- the task deletes their R2 folders. The counts go to the deletion log, as the nightly deletions do.
create function public.borrar_lo_marcado(p_antes timestamptz) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  borrados uuid[];
  autores_borrados integer;
begin
  with b as (delete from public.materiales where borrar_desde < p_antes returning id)
  select coalesce(array_agg(id), '{}') into borrados from b;
  -- afirmaciones.autor_id is on delete restrict: an author that still says something elsewhere is not deleted.
  delete from public.autores a where a.borrar_desde < p_antes and a.tipo <> 'coni'
    and not exists (select 1 from public.materiales m where m.autor_id = a.id)
    and not exists (select 1 from public.afirmaciones f where f.autor_id = a.id);
  get diagnostics autores_borrados = row_count;
  if cardinality(borrados) > 0 then
    insert into public.registro_de_borrados (regla, cantidad) values ('materiales_de_biblioteca', cardinality(borrados));
  end if;
  if autores_borrados > 0 then
    insert into public.registro_de_borrados (regla, cantidad) values ('autores_de_biblioteca', autores_borrados);
  end if;
  return borrados;
end $$;

revoke execute on function public.borrar_lo_marcado(timestamptz) from public, anon, authenticated;
grant execute on function public.borrar_lo_marcado(timestamptz) to service_role;
```

- [ ] **Step 4: Apply and run**

Run: `pnpm db:reset && pnpm test:db tests/integration/borrado-diferido-esquema.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql tests/integration/borrado-diferido-esquema.test.ts
git commit -m "Delete what was marked before a cut and log how much

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: `temas_resumen` drops marked materials; types regenerated

**Files:**
- Modify: `supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql` (append)
- Modify: `tests/integration/borrado-diferido-esquema.test.ts` (append)
- Modify: `lib/supabase/database.types.ts` (generated), plus any test fixture the compiler names (Step 6)

- [ ] **Step 1: Write the failing test** (append)

```ts
const tema = (c: Cliente, nombre: string) =>
  uno(
    c,
    `insert into public.temas (nombre, centroide)
     values ($1, (select array_agg(0.1)::extensions.vector from generate_series(1, 1024))) returning id`,
    [nombre],
  )

describe("temas_resumen", () => {
  it("counts neither the ideas, the authors nor the evidence of a marked material", async () => {
    await como(comoConi, async (c) => {
      const { temaId, marcado } = await comoDueno(c, comoConi, async () => {
        const a = await autor(c, "Autora del tema")
        const b = await autor(c, "Autor marcado del tema")
        const t = await tema(c, "Tema del resumen")
        const vivo = await material(c, a)
        const otro = await material(c, b)
        await idea(c, vivo, a, t, "estudio")
        await idea(c, otro, b, t, "clinica")
        await idea(c, otro, b, t, "clinica")
        return { temaId: t, marcado: otro }
      })
      const leer = async () =>
        (
          await c.query<{ afirmaciones: number; autores: number; evidencia: Record<string, number> }>(
            "select afirmaciones, autores, evidencia from public.temas_resumen where id = $1",
            [temaId],
          )
        ).rows[0]
      expect(await leer()).toEqual({ afirmaciones: 3, autores: 2, evidencia: { estudio: 1, clinica: 2 } })
      await c.query("select public.marcar_material_para_borrar($1, true)", [marcado])
      expect(await leer()).toEqual({ afirmaciones: 1, autores: 1, evidencia: { estudio: 1 } })
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/borrado-diferido-esquema.test.ts -t temas_resumen`
Expected: FAIL: the second read still has `afirmaciones: 3`.

- [ ] **Step 3: Append the view** (same 12 columns in the same order as `20261003000310:77-106`; `temas_de_pilar` returns its row type, F2; D2)

```sql

-- Topic counts (Temas in Conidolly through temas_de_red, Ingesta's /temas, the motor) drop a marked material at once.
-- Same body as 20261003000310, plus the mark in the join and in the evidence subquery.
create or replace view public.temas_resumen with (security_invoker = true) as
select
  t.id, t.nombre, t.descripcion, t.categoria_id, t.alias, t.creado_en, t.actualizado_en,
  coalesce(r.afirmaciones, 0) as afirmaciones,
  coalesce(r.autores, 0) as autores,
  coalesce(r.evidencia, '{}'::jsonb) as evidencia,
  coalesce(r.cubierto_por_coni, false) as cubierto_por_coni,
  r.ultima_afirmacion
from public.temas t
left join lateral (
  select
    count(*)::int as afirmaciones,
    count(distinct x.autor_id)::int as autores,
    (select jsonb_object_agg(e.evidencia, e.n)
     from (
       select a2.evidencia, count(*)::int as n
       from public.afirmaciones a2
       join public.materiales m2 on m2.id = a2.material_id
       where a2.tema_id = t.id and not a2.excluida and m2.borrar_desde is null
       group by a2.evidencia
     ) e) as evidencia,
    bool_or(x.rol = 'voz_propia') as cubierto_por_coni,
    max(x.creada_en) as ultima_afirmacion
  from (
    select a.autor_id, a.creada_en, m.rol
    from public.afirmaciones a
    join public.materiales m on m.id = a.material_id
    where a.tema_id = t.id and not a.excluida and m.borrar_desde is null
  ) x
) r on true
where t.fusionado_en is null;
```

- [ ] **Step 4: Apply, run the file and regenerate types**

Run: `pnpm db:reset && pnpm test:db tests/integration/borrado-diferido-esquema.test.ts && pnpm db:types`
Expected: PASS (16 tests); `git diff --stat lib/supabase/database.types.ts` shows `borrar_desde` on `materiales` and `autores`, the two `*_visibles` views and the three functions.

- [ ] **Step 5: Check nothing else in the database moved**

Run: `pnpm test:db`
Expected: all green. If a test pins every function's grants or every view, add the three functions and two views to its expectation in this commit (they are part of this migration).

- [ ] **Step 6: Type check**

Run: `pnpm type`
Expected: green. If a fixture typed as `Database["public"]["Tables"]["materiales"]["Row"]` (or `autores`) is now missing `borrar_desde`, add `borrar_desde: null` to it; nothing else.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql tests/integration/borrado-diferido-esquema.test.ts lib/supabase/database.types.ts
git add -u tests
git commit -m "Leave marked materials out of the topic summary and regenerate the types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 1:** dispatch the reviewer on Tasks 1 to 5 with the spec's "Database" and "Deviations" sections. The migration must add only (no `drop`, no `update`/`delete` of data).

---

# Lote 2: domain words, readers, actions

### Task 6: the words and addresses of a deletion

**Files:**
- Create: `lib/dominio/biblioteca/borrado.ts`
- Test: `tests/unit/biblioteca-borrado.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/biblioteca-borrado.test.ts
import { describe, expect, it } from "vitest"
import { avisoTrasBorrar, hrefTrasBorrar, leerBorrado, sePuedeBorrarAutor } from "@/lib/dominio/biblioteca/borrado"

const ID = "11111111-2222-4333-8444-555555555555"

describe("hrefTrasBorrar", () => {
  it("lands a material on Materiales and an author on Autores, with the note and the id", () => {
    expect(hrefTrasBorrar("material", ID)).toBe(`/biblioteca?aviso=borrado&id=${ID}`)
    expect(hrefTrasBorrar("autor", ID)).toBe(`/biblioteca/autores?aviso=borrado&id=${ID}`)
  })
})

describe("leerBorrado", () => {
  it("reads the id when the note is the deletion's", () => {
    expect(leerBorrado({ aviso: "borrado", id: ID })).toBe(ID)
    expect(leerBorrado({ aviso: ["borrado", "x"], id: [` ${ID} `] })).toBe(ID)
  })

  it("is null for another note, a missing or malformed id, or no note", () => {
    expect(leerBorrado({ aviso: "borrador-guardado", id: ID })).toBeNull()
    expect(leerBorrado({ aviso: "borrado" })).toBeNull()
    expect(leerBorrado({ aviso: "borrado", id: "../../x" })).toBeNull()
    expect(leerBorrado({})).toBeNull()
  })
})

describe("avisoTrasBorrar", () => {
  it("names what she deleted, or says it plainly when it had no title", () => {
    expect(avisoTrasBorrar("Charla larga")).toBe("Borré «Charla larga».")
    expect(avisoTrasBorrar(null)).toBe("Lo borré.")
  })
})

describe("sePuedeBorrarAutor", () => {
  const vacio = { materiales: 0, ideas: 0, ocultas: 0 }

  it("allows an author with no live material and no idea, visible or hidden", () => {
    expect(sePuedeBorrarAutor({ tipo: "persona" }, vacio)).toBe(true)
  })

  it("never offers it on Coni's own card", () => {
    expect(sePuedeBorrarAutor({ tipo: "coni" }, vacio)).toBe(false)
  })

  it.each([
    ["a material", { ...vacio, materiales: 1 }],
    ["a visible idea", { ...vacio, ideas: 1 }],
    ["a hidden idea", { ...vacio, ocultas: 1 }],
  ])("does not offer it for an author with %s, as Coni's function refuses it", (_, cuenta) => {
    expect(sePuedeBorrarAutor({ tipo: "persona" }, cuenta)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-borrado.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/dominio/biblioteca/borrado"`.

- [ ] **Step 3: Write the module**

```ts
// lib/dominio/biblioteca/borrado.ts
import { z } from "zod"
import { RUTA_DE_AUTORES } from "./autores"
import { RUTA_DE_MATERIALES } from "./filtros"

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

export type LoBorrado = "material" | "autor"

const LISTA_TRAS_BORRAR: Record<LoBorrado, string> = { material: RUTA_DE_MATERIALES, autor: RUTA_DE_AUTORES }

/** The list a deletion lands on, with the note that names what went (spec, «Notice on the next screen»). */
export function hrefTrasBorrar(tipo: LoBorrado, id: string): string {
  return `${LISTA_TRAS_BORRAR[tipo]}?aviso=borrado&id=${id}`
}

/** The id of what was just deleted when the address carries the deletion's note; anything else is no note. */
export function leerBorrado(params: Params): string | null {
  if (primero(params.aviso)?.trim() !== "borrado") return null
  const leido = z.uuid().safeParse(primero(params.id)?.trim())
  return leido.success ? leido.data : null
}

export function avisoTrasBorrar(nombre: string | null): string {
  return nombre ? `Borré «${nombre}».` : "Lo borré."
}

export const LO_RECUPERE = "Lo recuperé."
export const NO_PUDE_BORRAR = "No pude borrarlo. Prueba de nuevo."
export const NO_PUDE_RECUPERAR = "No pude recuperarlo. Prueba de nuevo."
export const YA_NO_SE_RECUPERA = "Ya no se puede recuperar: se borró del todo."
export const AUTOR_CON_MATERIALES = "Este autor todavía tiene materiales."
export const CONI_NO_SE_BORRA = "Tu propia ficha no se puede borrar."

/** As `marcar_autor_para_borrar` refuses: never Coni's card, nothing live by or from the author. */
export function sePuedeBorrarAutor(
  autor: { tipo: string },
  cuenta: { materiales: number; ideas: number; ocultas: number },
): boolean {
  return autor.tipo !== "coni" && cuenta.materiales === 0 && cuenta.ideas === 0 && cuenta.ocultas === 0
}
```

- [ ] **Step 4: Run it**

Run: `pnpm exec vitest run tests/unit/biblioteca-borrado.test.ts tests/unit/biblioteca-palabras.test.ts tests/unit/diseno-reglas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/biblioteca/borrado.ts tests/unit/biblioteca-borrado.test.ts
git commit -m "Add the words and addresses of deleting with Deshacer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: the material readers hide marked materials

**Files:**
- Modify: `lib/datos/biblioteca.ts` (`listarMateriales`, `contarPorEstado`, `leerMaterialConFicha`, `leerMapaDelMaterial`)
- Create: `tests/integration/borrado-diferido-lecturas.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/borrado-diferido-lecturas.test.ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  contarPorEstado,
  leerMapaDelMaterial,
  leerMaterialConFicha,
  leerPanelDelMaterial,
  listarMateriales,
} from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarIdeas, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)

let coni: SupabaseClient<Database>
let autora = ""
let marcada = ""
let vivo = ""
let marcado = ""
let tema = ""
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []

const marcar = (tabla: "materiales" | "autores", id: string) =>
  pool.query(`update public.${tabla} set borrar_desde = now() where id = $1`, [id])
const desmarcar = (tabla: "materiales" | "autores", id: string) =>
  pool.query(`update public.${tabla} set borrar_desde = null where id = $1`, [id])

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Autora borrable ${SUFIJO}`)
  marcada = await sembrarAutor(`Autora marcada ${SUFIJO}`)
  autores.push(autora, marcada)
  tema = await sembrarTema(`Tema borrable ${SUFIJO}`)
  temas.push(tema)
  vivo = await sembrarMaterial({ titulo: `Vivo ${SUFIJO}`, autorId: autora })
  marcado = await sembrarMaterial({ titulo: `Marcado ${SUFIJO}`, autorId: autora, estado: "procesando" })
  materiales.push(vivo, marcado)
  await sembrarIdeas(vivo, autora, tema, 1)
  await sembrarIdeas(marcado, autora, tema, 2)
  await sembrarIdeas(marcado, autora, tema, 1, { excluida: true })
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("the material readers", () => {
  it("leave a marked material out of the list and of the quick filters' counts", async () => {
    const antes = await contarPorEstado(coni)
    await marcar("materiales", marcado)
    try {
      const ids = (await listarMateriales(coni, {})).map((material) => material.id)
      expect(ids).toContain(vivo)
      expect(ids).not.toContain(marcado)
      const despues = await contarPorEstado(coni)
      expect(despues.procesando).toBe(antes.procesando - 1)
      expect(despues.trabajando).toBe(antes.trabajando - 1)
    } finally {
      await desmarcar("materiales", marcado)
    }
  })

  it("answer not found for a marked material's detail, panel and map", async () => {
    await marcar("materiales", marcado)
    try {
      expect(await leerMaterialConFicha(coni, marcado)).toBeNull()
      expect(await leerPanelDelMaterial(coni, marcado)).toBeNull()
      expect((await leerMapaDelMaterial(coni, marcado)).total).toBe(0)
      expect((await leerMapaDelMaterial(coni, vivo)).total).toBe(1)
    } finally {
      await desmarcar("materiales", marcado)
    }
    expect((await leerMapaDelMaterial(coni, marcado)).total).toBe(2)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido-lecturas.test.ts`
Expected: FAIL: the list still contains the marked material.

- [ ] **Step 3: Filter the four readers** in `lib/datos/biblioteca.ts`

In `listarMateriales`, add `.is("borrar_desde", null)` right after `.select(...)`:

```ts
  let consulta = db
    .from("materiales")
    .select(`${COLUMNAS}, autores ( nombre )`)
    .is("borrar_desde", null)
    .order("creado_en", { ascending: false })
```

In `contarPorEstado`, change the base query:

```ts
  // A marked material is gone for her: it neither counts nor keeps the list asking.
  const cuantos = () => db.from("materiales").select("id", { count: "exact", head: true }).is("borrar_desde", null)
```

In `leerMaterialConFicha`, add `.is("borrar_desde", null)` after `.eq("id", id)`:

```ts
    .eq("id", id)
    .is("borrar_desde", null)
    .maybeSingle()
```

In `leerMapaDelMaterial`, filter through the material and map the rows to `FilaDeAfirmacion` (`tema_id, tipo, evidencia, temas`, `lib/dominio/biblioteca/mapa.ts:12`) without the embed; the whole body becomes:

```ts
  const filas = await leerTodas(`las ideas del material ${materialId}`, (despuesDe, limite) => {
    const consulta = db
      .from("afirmaciones")
      .select("id, tema_id, tipo, evidencia, temas ( nombre ), materiales!inner ( borrar_desde )")
      .eq("material_id", materialId)
      .eq("excluida", false)
      .is("materiales.borrar_desde", null)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return armarMapa(
    filas.map(({ tema_id, tipo, evidencia, temas }): FilaDeAfirmacion => ({ tema_id, tipo, evidencia, temas })),
  )
```

- [ ] **Step 4: Run the tests and the existing readers' tests**

Run: `pnpm test:db tests/integration/borrado-diferido-lecturas.test.ts tests/integration/datos-biblioteca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/biblioteca.ts tests/integration/borrado-diferido-lecturas.test.ts
git commit -m "Hide marked materials from the material list, counts and detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: authors and topics hide marked rows; the name of what was deleted

**Files:**
- Modify: `lib/datos/biblioteca.ts` (`listarAutores`, `resumirAutores`, `leerAutor`, `leerTema`, new `leerNombreDeLoBorrado`)
- Modify: `tests/integration/borrado-diferido-lecturas.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; add `leerAutor`, `leerNombreDeLoBorrado`, `leerTema`, `listarAutores`, `listarTemas`, `resumirAutores` to the `@/lib/datos/biblioteca` import)

```ts
describe("the author and topic readers", () => {
  it("leave a marked author out of the lists and answer not found for its page", async () => {
    await marcar("autores", marcada)
    try {
      expect((await listarAutores(coni)).map((autor) => autor.id)).not.toContain(marcada)
      expect((await resumirAutores(coni)).map((autor) => autor.id)).not.toContain(marcada)
      expect(await leerAutor(coni, marcada)).toBeNull()
    } finally {
      await desmarcar("autores", marcada)
    }
  })

  it("count neither the materials nor the ideas of a marked material for its author", async () => {
    const contar = async () => {
      const resumen = (await resumirAutores(coni)).find((autor) => autor.id === autora)
      const leido = await leerAutor(coni, autora)
      return {
        resumen: { materiales: resumen?.materiales, ideas: resumen?.ideas },
        pagina: { materiales: leido?.materiales, ideas: leido?.ideas, ocultas: leido?.ocultas.length },
      }
    }
    expect(await contar()).toEqual({
      resumen: { materiales: 2, ideas: 3 },
      pagina: { materiales: 2, ideas: 3, ocultas: 1 },
    })
    await marcar("materiales", marcado)
    try {
      expect(await contar()).toEqual({
        resumen: { materiales: 1, ideas: 1 },
        pagina: { materiales: 1, ideas: 1, ocultas: 0 },
      })
    } finally {
      await desmarcar("materiales", marcado)
    }
  })

  it("leave a marked material's ideas out of its topic's page and of Temas", async () => {
    const enTemas = async () => (await listarTemas(coni, { red: "linkedin" })).find((t) => t.id === tema)?.ideas
    expect((await leerTema(coni, tema))?.ideas).toBe(3)
    expect(await enTemas()).toBe(3)
    await marcar("materiales", marcado)
    try {
      expect((await leerTema(coni, tema))?.ideas).toBe(1)
      expect(await enTemas()).toBe(1)
    } finally {
      await desmarcar("materiales", marcado)
    }
  })
})

describe("leerNombreDeLoBorrado", () => {
  it("names a marked material or author, and is null once it is visible again or gone", async () => {
    expect(await leerNombreDeLoBorrado(coni, "material", marcado)).toBeNull()
    await marcar("materiales", marcado)
    await marcar("autores", marcada)
    try {
      expect(await leerNombreDeLoBorrado(coni, "material", marcado)).toEqual({ nombre: `Marcado ${SUFIJO}` })
      expect(await leerNombreDeLoBorrado(coni, "autor", marcada)).toEqual({ nombre: `Autora marcada ${SUFIJO}` })
    } finally {
      await desmarcar("materiales", marcado)
      await desmarcar("autores", marcada)
    }
    expect(await leerNombreDeLoBorrado(coni, "autor", randomUUID())).toBeNull()
  })
})
```

`listarTemas` needs a network; if the topic of this file does not show on LinkedIn (it has no pillar there), read `temas_de_red`'s rule in `20261104000300_temas_tratados.sql:57-75` and pass the filters under which an unclassified topic is listed, or count through `pool.query("select afirmaciones from public.temas_resumen where id = $1")` as Coni instead. Do not change `listarTemas`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido-lecturas.test.ts`
Expected: FAIL: the file does not compile (`leerNombreDeLoBorrado` is not exported), and once it does the marked author is still listed.

- [ ] **Step 3: Filter the readers and add the name reader** in `lib/datos/biblioteca.ts`

Add the import:

```ts
import type { LoBorrado } from "@/lib/dominio/biblioteca/borrado"
```

`listarAutores`:

```ts
    const consulta = db.from("autores").select("id, nombre, credencial, tipo, alias").is("borrar_desde", null)
```

`resumirAutores`, the two paged reads:

```ts
    leerTodas("los materiales de los autores", (despuesDe, limite) => {
      const consulta = db.from("materiales").select("id, autor_id").is("borrar_desde", null)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
    leerTodas("las ideas de los autores", (despuesDe, limite) => {
      const consulta = db
        .from("afirmaciones")
        .select("id, autor_id, tema_id, temas ( nombre ), materiales!inner ( borrar_desde )")
        .eq("excluida", false)
        .is("materiales.borrar_desde", null)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
```

`leerAutor`:

```ts
  const { data: autor, error } = await db
    .from("autores")
    .select(COLUMNAS_DE_AUTOR)
    .eq("id", id)
    .is("borrar_desde", null)
    .maybeSingle()
```

```ts
    db.from("materiales").select("id", { count: "exact", head: true }).eq("autor_id", id).is("borrar_desde", null),
    leerTodas(`las ideas del autor ${id}`, (despuesDe, limite) => {
      const consulta = db
        .from("afirmaciones")
        .select("id, texto, tipo, evidencia, excluida, tema_id, creada_en, temas ( nombre ), materiales!inner ( borrar_desde )")
        .eq("autor_id", id)
        .is("materiales.borrar_desde", null)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
```

`leerTema`, the ideas:

```ts
    const consulta = db
      .from("afirmaciones")
      .select(
        "id, texto, tipo, evidencia, creada_en, autor_id, autores ( nombre, credencial ), materiales!inner ( borrar_desde )",
      )
      .eq("tema_id", id)
      .eq("excluida", false)
      .is("materiales.borrar_desde", null)
```

New reader, after `leerAutor`:

```ts
/**
 * The name of what Coni just deleted, for the list's notice; null once it is visible again or gone, so a stale or
 * forged address shows no notice (plan D6).
 */
export async function leerNombreDeLoBorrado(
  db: Db,
  tipo: LoBorrado,
  id: string,
): Promise<{ nombre: string | null } | null> {
  if (tipo === "material") {
    const { data, error } = await db
      .from("materiales")
      .select("titulo")
      .eq("id", id)
      .not("borrar_desde", "is", null)
      .maybeSingle()
    if (error) throw new Error(`No pude leer el material borrado ${id}: ${error.message}`, { cause: error })
    return data ? { nombre: data.titulo } : null
  }
  const { data, error } = await db
    .from("autores")
    .select("nombre")
    .eq("id", id)
    .not("borrar_desde", "is", null)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el autor borrado ${id}: ${error.message}`, { cause: error })
  return data ? { nombre: data.nombre } : null
}
```

- [ ] **Step 4: Run the readers' tests**

Run: `pnpm test:db tests/integration/borrado-diferido-lecturas.test.ts tests/integration/datos-biblioteca.test.ts tests/integration/datos-autores-temas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/biblioteca.ts tests/integration/borrado-diferido-lecturas.test.ts
git commit -m "Hide marked authors and marked materials' ideas from Autores and Temas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: actions that read before acting treat a marked row as not found

**Files:**
- Modify: `lib/acciones/biblioteca.ts` (`editarMaterial`, `crearAutor`, `pedirTextoOriginal`, `confirmarMaterial`, `unirAutores`)
- Create: `tests/integration/acciones-borrado-diferido.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/acciones-borrado-diferido.test.ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  confirmarMaterial,
  crearAutor,
  editarMaterial,
  pedirTextoOriginal,
  unirAutores,
} from "@/lib/acciones/biblioteca"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const NO_ENCONTRE = "No encontré ese material."
const AUTOR_INEXISTENTE = "Ese autor ya no existe."

let coni: Db
let autora = ""
let otra = ""
const materiales: string[] = []
const autores: string[] = []
const almacen = almacenEnMemoria()

const marcar = (tabla: "materiales" | "autores", id: string) =>
  pool.query(`update public.${tabla} set borrar_desde = now() where id = $1`, [id])

async function material(extra: { estado?: "procesando" | "listo" } = {}): Promise<string> {
  const id = await sembrarMaterial({ titulo: `Acción borrable ${SUFIJO}`, autorId: autora, ...extra })
  materiales.push(id)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Autora de acciones ${SUFIJO}`)
  otra = await sembrarAutor(`Otra de acciones ${SUFIJO}`)
  autores.push(autora, otra)
})

afterAll(async () => {
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

describe("actions on a marked material", () => {
  it("editarMaterial answers not found and changes nothing", async () => {
    const id = await material()
    await marcar("materiales", id)
    const deps = { db: coni, disparar: { material: async () => {} }, nuevoId: randomUUID, almacen }
    const edicion = { materialId: id, autorId: otra, rol: "evidencia" as const }
    expect(await editarMaterial(deps, edicion)).toEqual({ ok: false, error: NO_ENCONTRE })
    const { rows } = await pool.query("select autor_id from public.materiales where id = $1", [id])
    expect(rows[0]?.autor_id).toBe(autora)
  })

  it("pedirTextoOriginal signs nothing", async () => {
    const id = await material()
    await almacen.subir(`materiales/${id}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    await marcar("materiales", id)
    expect(await pedirTextoOriginal({ db: coni, almacen }, id)).toEqual({ ok: false, error: NO_ENCONTRE })
  })

  it("confirmarMaterial answers not found and starts nothing", async () => {
    // Seeded as uploaded by Coni (`sembrarMaterial`), so only the mark can hide it from her.
    const id = await material({ estado: "procesando" })
    await marcar("materiales", id)
    const disparados: string[] = []
    const resultado = await confirmarMaterial(
      {
        db: coni,
        almacen,
        disparar: { material: async (materialId) => void disparados.push(materialId) },
        nuevoId: randomUUID,
        ahora: () => new Date(),
      },
      id,
    )
    expect(resultado).toEqual({ ok: false, error: NO_ENCONTRE })
    expect(disparados).toEqual([])
  })
})

describe("actions on a marked author", () => {
  it("unirAutores refuses a marked origin and a marked destination", async () => {
    const origen = await sembrarAutor(`Origen marcado ${SUFIJO}`)
    const destino = await sembrarAutor(`Destino marcado ${SUFIJO}`)
    autores.push(origen, destino)
    await marcar("autores", origen)
    expect(await unirAutores({ db: coni }, { origen, destino: otra })).toEqual({ ok: false, error: AUTOR_INEXISTENTE })
    await marcar("autores", destino)
    expect(await unirAutores({ db: coni }, { origen: otra, destino })).toEqual({ ok: false, error: AUTOR_INEXISTENTE })
  })

  it("crearAutor with the name of an author she just deleted brings that author back (plan D5)", async () => {
    const nombre = `Vuelve ${SUFIJO}`
    const id = await sembrarAutor(nombre)
    autores.push(id)
    await marcar("autores", id)
    const resultado = await crearAutor({ db: coni }, { nombre, credencial: "", tipo: "persona" })
    expect(resultado).toMatchObject({ ok: true, autor: { id, nombre } })
    const { rows } = await pool.query("select borrar_desde from public.autores where id = $1", [id])
    expect(rows[0]?.borrar_desde).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/acciones-borrado-diferido.test.ts`
Expected: FAIL: `editarMaterial` answers `{ ok: true }`, `pedirTextoOriginal` signs, `confirmarMaterial` starts the run, `unirAutores` reaches the RPC, `crearAutor` answers the marked author still marked.

- [ ] **Step 3: Change the five actions** in `lib/acciones/biblioteca.ts`

`editarMaterial`: add `.is("borrar_desde", null)` after `.eq("id", edicion.materialId)`.

`pedirTextoOriginal`: `.from("materiales").select("id").eq("id", materialId).is("borrar_desde", null).maybeSingle()`.

`confirmarMaterial`: add `.is("borrar_desde", null)` after `.eq("subido_por", subidoPor)`.

`unirAutores`: read the origin only if visible and check the destination too:

```ts
    const { data: origen, error } = await deps.db
      .from("autores")
      .select("tipo")
      .eq("id", union.origen)
      .is("borrar_desde", null)
      .maybeSingle()
    if (error) throw new Error(`No pude leer el autor ${union.origen}: ${error.message}`, { cause: error })
    if (!origen) throw new Falla(AUTOR_INEXISTENTE)
    if (origen.tipo === "coni") throw new Falla(CONI_NO_SE_UNE)
    // A deleted author waiting for maintenance must not receive materials: it would stay hidden with them.
    const { data: destino, error: errorDeDestino } = await deps.db
      .from("autores")
      .select("id")
      .eq("id", union.destino)
      .is("borrar_desde", null)
      .maybeSingle()
    if (errorDeDestino) {
      throw new Error(`No pude leer el autor ${union.destino}: ${errorDeDestino.message}`, { cause: errorDeDestino })
    }
    if (!destino) throw new Falla(AUTOR_INEXISTENTE)
```

`crearAutor`: replace the read-back with:

```ts
    const { data: leido, error: errorDeLectura } = await deps.db
      .from("autores")
      .select("id, nombre, credencial, tipo, alias, borrar_desde")
      .eq("id", id)
      .single()
    if (errorDeLectura)
      throw new Error(`No pude leer el autor ${id}: ${errorDeLectura.message}`, { cause: errorDeLectura })
    const { borrar_desde, ...autor } = leido
    // `crear_autor` answers an author she just deleted when she types its name again: typing it is wanting it back.
    if (borrar_desde !== null) {
      const { error: errorAlRecuperar } = await deps.db.rpc("marcar_autor_para_borrar", { p_id: id, p_borrar: false })
      if (errorAlRecuperar) {
        throw new Error(`No pude recuperar el autor ${id}: ${errorAlRecuperar.message}`, { cause: errorAlRecuperar })
      }
    }
    return { autor }
```

- [ ] **Step 4: Run them and the existing action tests**

Run: `pnpm test:db tests/integration/acciones-borrado-diferido.test.ts tests/integration/acciones-biblioteca.test.ts tests/integration/acciones-subir.test.ts tests/integration/acciones-autores-temas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/biblioteca.ts tests/integration/acciones-borrado-diferido.test.ts
git commit -m "Treat a marked material or author as gone in the Biblioteca's actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: `borrarMaterial` and `recuperarMaterial`

**Files:**
- Modify: `lib/acciones/biblioteca.ts`
- Modify: `tests/integration/acciones-borrado-diferido.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; add `borrarMaterial, recuperarMaterial` to the import from `@/lib/acciones/biblioteca` and `clienteDelMantenedor` to the import from `./sesion-coni`)

```ts
const YA_NO_SE_RECUPERA = "Ya no se puede recuperar: se borró del todo."
const marcaDe = async (tabla: "materiales" | "autores", id: string) =>
  (await pool.query<{ marcado: boolean }>(`select borrar_desde is not null as marcado from public.${tabla} where id = $1`, [id]))
    .rows[0]?.marcado

describe("borrarMaterial and recuperarMaterial", () => {
  it("marks the material and answers the list with the note; Deshacer unmarks it", async () => {
    const id = await material()
    expect(await borrarMaterial({ db: coni }, id)).toEqual({ ok: true, destino: `/biblioteca?aviso=borrado&id=${id}` })
    expect(await marcaDe("materiales", id)).toBe(true)
    expect(await recuperarMaterial({ db: coni }, id)).toEqual({ ok: true })
    expect(await marcaDe("materiales", id)).toBe(false)
  })

  it("lets a second tap on either through: the row is already where she wants it (plan D4)", async () => {
    const id = await material()
    await borrarMaterial({ db: coni }, id)
    expect(await borrarMaterial({ db: coni }, id)).toEqual({ ok: true, destino: `/biblioteca?aviso=borrado&id=${id}` })
    await recuperarMaterial({ db: coni }, id)
    expect(await recuperarMaterial({ db: coni }, id)).toEqual({ ok: true })
  })

  it("says it can no longer be recovered once maintenance deleted it, and not found for a missing one", async () => {
    const id = await material()
    await borrarMaterial({ db: coni }, id)
    await pool.query("delete from public.materiales where id = $1", [id])
    expect(await recuperarMaterial({ db: coni }, id)).toEqual({ ok: false, error: YA_NO_SE_RECUPERA })
    expect(await borrarMaterial({ db: coni }, id)).toEqual({ ok: false, error: NO_ENCONTRE })
  })

  it("lets only Coni do it from Conidolly", async () => {
    const wav = await clienteDelMantenedor()
    const id = await material()
    expect(await borrarMaterial({ db: wav }, id)).toEqual({ ok: false, error: "Esta app es solo para Coni." })
    expect(await marcaDe("materiales", id)).toBe(false)
  })

  it("answers in her words, and logs for WAV, an error she cannot act on", async () => {
    // The server wrapper's Zod refuses a malformed id; called directly, Postgres answers 22P02, an unexpected code.
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(await borrarMaterial({ db: coni }, "no-es-un-uuid")).toEqual({
      ok: false,
      error: "No pude borrarlo. Prueba de nuevo.",
    })
    expect(await recuperarMaterial({ db: coni }, "no-es-un-uuid")).toEqual({
      ok: false,
      error: "No pude recuperarlo. Prueba de nuevo.",
    })
    expect(registro).toHaveBeenCalledWith(expect.stringContaining("no-es-un-uuid"), expect.anything())
    registro.mockRestore()
  })
})
```

(Add `vi` to the `vitest` import.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/acciones-borrado-diferido.test.ts -t "borrarMaterial and recuperarMaterial"`
Expected: FAIL: `borrarMaterial` is not exported (the module has a private function of that name, F6).

- [ ] **Step 3: Rename the private helper and write the actions**

Rename the private `async function borrarMaterial(db, materialId)` (F6, :239) to `borrarMaterialSinSubir`, and its three call sites in `crearMaterial` and `confirmarMaterial`:

```bash
grep -n "borrarMaterial(" lib/acciones/biblioteca.ts
```

Expected before the change: the definition and three calls; after it, the same lines read `borrarMaterialSinSubir(`.

Add to the imports:

```ts
import {
  hrefTrasBorrar,
  NO_PUDE_BORRAR,
  NO_PUDE_RECUPERAR,
  YA_NO_SE_RECUPERA,
} from "@/lib/dominio/biblioteca/borrado"
```

Add after `ocultarIdea`:

```ts
const NO_SE_PUDO_MARCAR = "no_se_pudo_marcar"

/** Where the row is now, read when a mark was refused: a refusal can mean it already is where she wants it (D4). */
async function marcaDe(db: Db, tabla: "materiales" | "autores", id: string): Promise<"marcado" | "visible" | null> {
  const { data, error } =
    tabla === "materiales"
      ? await db.from("materiales").select("borrar_desde").eq("id", id).maybeSingle()
      : await db.from("autores").select("borrar_desde").eq("id", id).maybeSingle()
  if (error) throw new Error(`No pude leer ${tabla} ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  return data.borrar_desde === null ? "visible" : "marcado"
}

/** An error she cannot act on is logged for WAV and answered in her words, so the button stays and she tries again. */
function fallaDeMarca(cuando: string, error: { message: string }, paraConi: string): Falla {
  console.error(`No pude ${cuando}`, error)
  return new Falla(paraConi)
}

/**
 * «Borrar material»: marks it, so every screen hides it at once and maintenance deletes it a minute later (spec).
 * Answers the list with the note that offers «Deshacer».
 */
export function borrarMaterial(
  deps: Pick<DepsBiblioteca, "db">,
  materialId: string,
): Promise<Resultado<{ destino: string }>> {
  return aResultado("borrarMaterial", async () => {
    await exigirConi(deps.db)
    const destino = hrefTrasBorrar("material", materialId)
    const { error } = await deps.db.rpc("marcar_material_para_borrar", { p_id: materialId, p_borrar: true })
    if (!error) return { destino }
    if (error.code === NO_ES_EL_ESTADO && error.message === NO_SE_PUDO_MARCAR) {
      const marca = await marcaDe(deps.db, "materiales", materialId)
      if (marca === "marcado") return { destino }
      if (marca === null) throw new Falla(NO_ENCONTRE)
    }
    throw fallaDeMarca(`marcar el material ${materialId}`, error, NO_PUDE_BORRAR)
  })
}

/** «Deshacer»: the material is back where it was, unless maintenance already deleted it. */
export function recuperarMaterial(deps: Pick<DepsBiblioteca, "db">, materialId: string): Promise<Resultado> {
  return aResultado("recuperarMaterial", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("marcar_material_para_borrar", { p_id: materialId, p_borrar: false })
    if (!error) return {}
    if (error.code === NO_ES_EL_ESTADO && error.message === NO_SE_PUDO_MARCAR) {
      const marca = await marcaDe(deps.db, "materiales", materialId)
      if (marca === "visible") return {}
      if (marca === null) throw new Falla(YA_NO_SE_RECUPERA)
    }
    throw fallaDeMarca(`recuperar el material ${materialId}`, error, NO_PUDE_RECUPERAR)
  })
}
```

- [ ] **Step 4: Run them and the existing action tests**

Run: `pnpm test:db tests/integration/acciones-borrado-diferido.test.ts tests/integration/acciones-subir.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/biblioteca.ts tests/integration/acciones-borrado-diferido.test.ts
git commit -m "Add borrarMaterial and recuperarMaterial over the deletion mark

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: `borrarAutor` and `recuperarAutor`

**Files:**
- Modify: `lib/acciones/biblioteca.ts`
- Modify: `tests/integration/acciones-borrado-diferido.test.ts` (append; add `borrarAutor, recuperarAutor` to the import)

- [ ] **Step 1: Write the failing tests**

```ts
describe("borrarAutor and recuperarAutor", () => {
  it("marks an author with nothing live, answers Autores with the note, and Deshacer unmarks it", async () => {
    const id = await sembrarAutor(`Borrable ${SUFIJO}`)
    autores.push(id)
    expect(await borrarAutor({ db: coni }, id)).toEqual({
      ok: true,
      destino: `/biblioteca/autores?aviso=borrado&id=${id}`,
    })
    expect(await marcaDe("autores", id)).toBe(true)
    expect(await recuperarAutor({ db: coni }, id)).toEqual({ ok: true })
    expect(await marcaDe("autores", id)).toBe(false)
  })

  it("refuses an author that still has materials, and Coni's own card, in her words", async () => {
    expect(await borrarAutor({ db: coni }, autora)).toEqual({
      ok: false,
      error: "Este autor todavía tiene materiales.",
    })
    const { rows } = await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
    expect(await borrarAutor({ db: coni }, rows[0]?.id ?? "")).toEqual({
      ok: false,
      error: "Tu propia ficha no se puede borrar.",
    })
  })

  it("says it can no longer be recovered once maintenance deleted it, and that a missing author no longer exists", async () => {
    const id = await sembrarAutor(`Se va ${SUFIJO}`)
    await borrarAutor({ db: coni }, id)
    await pool.query("delete from public.autores where id = $1", [id])
    expect(await recuperarAutor({ db: coni }, id)).toEqual({ ok: false, error: YA_NO_SE_RECUPERA })
    expect(await borrarAutor({ db: coni }, id)).toEqual({ ok: false, error: AUTOR_INEXISTENTE })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/acciones-borrado-diferido.test.ts -t "borrarAutor and recuperarAutor"`
Expected: FAIL: `borrarAutor` is not exported.

- [ ] **Step 3: Write the actions** (add `AUTOR_CON_MATERIALES, CONI_NO_SE_BORRA` to the `borrado` import; add `SobreAutor` next to `SobreMaterial`)

```ts
export const SobreAutor = z.object({ autorId: z.uuid() })
```

```ts
/** «Borrar autor»: only with nothing live by or from it, never Coni's card (the page offers it only then). */
export function borrarAutor(
  deps: Pick<DepsBiblioteca, "db">,
  autorId: string,
): Promise<Resultado<{ destino: string }>> {
  return aResultado("borrarAutor", async () => {
    await exigirConi(deps.db)
    const destino = hrefTrasBorrar("autor", autorId)
    const { error } = await deps.db.rpc("marcar_autor_para_borrar", { p_id: autorId, p_borrar: true })
    if (!error) return { destino }
    if (error.code === NO_ES_EL_ESTADO) {
      // Backstops for the page's own check, for a row that changed after the page was drawn.
      if (error.message === "autor_con_materiales") throw new Falla(AUTOR_CON_MATERIALES)
      if (error.message === "autor_coni_protegido") throw new Falla(CONI_NO_SE_BORRA)
      if (error.message === NO_SE_PUDO_MARCAR) {
        const marca = await marcaDe(deps.db, "autores", autorId)
        if (marca === "marcado") return { destino }
        if (marca === null) throw new Falla(AUTOR_INEXISTENTE)
      }
    }
    throw fallaDeMarca(`marcar el autor ${autorId}`, error, NO_PUDE_BORRAR)
  })
}

/** «Deshacer» for an author. */
export function recuperarAutor(deps: Pick<DepsBiblioteca, "db">, autorId: string): Promise<Resultado> {
  return aResultado("recuperarAutor", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("marcar_autor_para_borrar", { p_id: autorId, p_borrar: false })
    if (!error) return {}
    if (error.code === NO_ES_EL_ESTADO && error.message === NO_SE_PUDO_MARCAR) {
      const marca = await marcaDe(deps.db, "autores", autorId)
      if (marca === "visible") return {}
      if (marca === null) throw new Falla(YA_NO_SE_RECUPERA)
    }
    throw fallaDeMarca(`recuperar el autor ${autorId}`, error, NO_PUDE_RECUPERAR)
  })
}
```

- [ ] **Step 4: Run them**

Run: `pnpm test:db tests/integration/acciones-borrado-diferido.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/biblioteca.ts tests/integration/acciones-borrado-diferido.test.ts
git commit -m "Add borrarAutor and recuperarAutor over the deletion mark

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: the four server actions

**Files:**
- Modify: `app/(app)/biblioteca/acciones.ts`
- Modify: `tests/unit/biblioteca-acciones-servidor.test.ts`

- [ ] **Step 1: Write the failing tests** (add `borrarMaterial`, `recuperarMaterial`, `borrarAutor`, `recuperarAutor` to the `vi.mock("@/lib/acciones/biblioteca", ...)` overrides, each `vi.fn(async () => ({ ok: true, destino: "/x" }))` for the two delete ones and `vi.fn(async () => ({ ok: true }))` for the two undo ones; import the four `...Accion` wrappers, `SobreAutor`, and the four plain actions)

```ts
describe("the server actions of deleting with Deshacer", () => {
  it.each([
    ["borrarMaterial", () => borrarMaterialAccion(ID), SobreMaterial, { materialId: ID }, borrarMaterial, ID],
    ["recuperarMaterial", () => recuperarMaterialAccion(ID), SobreMaterial, { materialId: ID }, recuperarMaterial, ID],
    ["borrarAutor", () => borrarAutorAccion(AUTOR), SobreAutor, { autorId: AUTOR }, borrarAutor, AUTOR],
    ["recuperarAutor", () => recuperarAutorAccion(AUTOR), SobreAutor, { autorId: AUTOR }, recuperarAutor, AUTOR],
  ] as const)(
    "%s checks Coni with its schema, runs its own action and refreshes the whole section, never redirecting",
    async (nombre, accion, esquema, entrada, propia, id) => {
      await accion()
      const [recibido, conEsquema, conEntrada, alAccionar] = conSesionDeConi.mock.calls[0] ?? []
      expect([recibido, conEsquema, conEntrada]).toEqual([nombre, esquema, entrada])
      const db = {}
      await (alAccionar as (db: unknown, d: unknown) => Promise<unknown>)(db, entrada)
      expect(propia).toHaveBeenCalledWith({ db }, id)
      expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
      expect(redirect).not.toHaveBeenCalled()
    },
  )

  it("answers the destination the action gave, so the client goes there with useIrA", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: true, destino: `/biblioteca?aviso=borrado&id=${ID}` })
    expect(await borrarMaterialAccion(ID)).toEqual({ ok: true, destino: `/biblioteca?aviso=borrado&id=${ID}` })
  })
})
```

The mock's declared return type is `{ ok: true } | { ok: false; error: string }`; widen it in `vi.hoisted` to `Promise<{ ok: true; destino?: string } | { ok: false; error: string }>` so this test needs no cast.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/biblioteca-acciones-servidor.test.ts`
Expected: FAIL: `borrarMaterialAccion` is not exported.

- [ ] **Step 3: Add the wrappers** to `app/(app)/biblioteca/acciones.ts` (import `borrarAutor`, `borrarMaterial`, `recuperarAutor`, `recuperarMaterial`, `SobreAutor`)

```ts
// Deleting answers the list with its note and the client goes there (`useIrA`), never `redirect()` (15c, decision 21).

export async function borrarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("borrarMaterial", SobreMaterial, { materialId }, (db, d) => borrarMaterial({ db }, d.materialId)),
  )
}

export async function recuperarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("recuperarMaterial", SobreMaterial, { materialId }, (db, d) =>
      recuperarMaterial({ db }, d.materialId),
    ),
  )
}

export async function borrarAutorAccion(autorId: string) {
  return refrescar(await conSesionDeConi("borrarAutor", SobreAutor, { autorId }, (db, d) => borrarAutor({ db }, d.autorId)))
}

export async function recuperarAutorAccion(autorId: string) {
  return refrescar(
    await conSesionDeConi("recuperarAutor", SobreAutor, { autorId }, (db, d) => recuperarAutor({ db }, d.autorId)),
  )
}
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/acciones.ts" tests/unit/biblioteca-acciones-servidor.test.ts
git commit -m "Expose deleting and recovering a material or an author as server actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 2:** reviewer on Tasks 6 to 12 against the spec's "Code" (readers, actions) and "Errors, in her words". Check that every reader listed in the spec filters, and that no new action calls `redirect()`.

---

# Lote 3: maintenance and processing (Trigger code)

### Task 13: the maintenance step `borrarLoMarcado`

**Files:**
- Create: `lib/mantenimiento/borrado-diferido.ts`
- Create: `tests/integration/borrado-diferido-mantenimiento.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/borrado-diferido-mantenimiento.test.ts
import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it, vi } from "vitest"
import { borrarLoMarcado, MARGEN_DE_BORRADO_MS } from "@/lib/mantenimiento/borrado-diferido"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const materiales: string[] = []
const autores: string[] = []

afterAll(async () => {
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

async function marcado(hace: string): Promise<string> {
  const autor = await sembrarAutor(`Autora del barrido ${SUFIJO} ${randomUUID().slice(0, 4)}`)
  autores.push(autor)
  const id = await sembrarMaterial({ titulo: `Barrido ${SUFIJO}`, autorId: autor })
  materiales.push(id)
  await pool.query("update public.materiales set borrar_desde = now() - $2::interval where id = $1", [id, hace])
  return id
}

const existe = async (id: string) =>
  ((await pool.query("select 1 from public.materiales where id = $1", [id])).rowCount ?? 0) > 0

describe("borrarLoMarcado", () => {
  it("waits one minute after the mark", () => {
    expect(MARGEN_DE_BORRADO_MS).toBe(60_000)
  })

  it("deletes what was marked over a minute ago and its R2 folder, and leaves what was marked seconds ago", async () => {
    const viejo = await marcado("5 minutes")
    const reciente = await marcado("20 seconds")
    const almacen = almacenEnMemoria()
    for (const id of [viejo, reciente]) {
      await almacen.subir(`materiales/${id}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    }

    const resultado = await borrarLoMarcado({ db: clienteDeServicio(), almacen, ahora: () => new Date().toISOString() })

    expect(resultado.materiales).toBeGreaterThanOrEqual(1)
    expect(resultado.carpetasPendientes).toEqual([])
    expect(await existe(viejo)).toBe(false)
    expect(await existe(reciente)).toBe(true)
    expect(await almacen.listar(`materiales/${viejo}/`)).toEqual([])
    expect(await almacen.listar(`materiales/${reciente}/`)).toHaveLength(1)
  })

  it("keeps going when R2 fails: the rows are gone, the folder is logged as pending", async () => {
    const id = await marcado("5 minutes")
    const almacen = {
      borrarCarpeta: async (): Promise<number> => {
        throw new Error("R2 caído")
      },
    }
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await borrarLoMarcado({ db: clienteDeServicio(), almacen, ahora: () => new Date().toISOString() })

    expect(resultado.carpetasPendientes).toContain(id)
    expect(await existe(id)).toBe(false)
    expect(registro).toHaveBeenCalledWith(expect.stringContaining(id), expect.any(Error))
    registro.mockRestore()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido-mantenimiento.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/mantenimiento/borrado-diferido"`.

- [ ] **Step 3: Write the step**

```ts
// lib/mantenimiento/borrado-diferido.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"

/** How long after «Borrar» a row is deleted for real: past the 8 s of «Deshacer», one constant (spec, Deviations). */
export const MARGEN_DE_BORRADO_MS = 60_000

export interface DepsBorrado {
  /** A `service_role` client: only it may run `borrar_lo_marcado`. */
  db: SupabaseClient<Database>
  almacen: Pick<Almacen, "borrarCarpeta">
  ahora: () => string
}

/**
 * Deletes what Coni marked over a minute ago, then each deleted material's R2 folder. A folder that fails stays as an
 * orphan, named in the log, as Ingesta's delete already accepts: the rows are gone and the run must not fail for it.
 */
export async function borrarLoMarcado(deps: DepsBorrado): Promise<{ materiales: number; carpetasPendientes: string[] }> {
  const corte = new Date(Date.parse(deps.ahora()) - MARGEN_DE_BORRADO_MS).toISOString()
  const { data, error } = await deps.db.rpc("borrar_lo_marcado", { p_antes: corte })
  if (error) throw new Error(`No pude borrar lo marcado: ${error.message}`, { cause: error })
  const carpetasPendientes: string[] = []
  for (const materialId of data) {
    try {
      await deps.almacen.borrarCarpeta(materialId)
    } catch (errorDeAlmacen) {
      console.error(`El material ${materialId} se borró, pero sus archivos de R2 quedaron huérfanos`, errorDeAlmacen)
      carpetasPendientes.push(materialId)
    }
  }
  return { materiales: data.length, carpetasPendientes }
}
```

- [ ] **Step 4: Run them**

Run: `pnpm test:db tests/integration/borrado-diferido-mantenimiento.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/borrado-diferido.ts tests/integration/borrado-diferido-mantenimiento.test.ts
git commit -m "Add the maintenance step that deletes marked rows and their R2 folders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: the frequent run deletes first

**Files:**
- Modify: `lib/mantenimiento/ejecutar.ts`, `lib/produccion/deps-reales.ts`
- Modify: `tests/unit/mantenimiento-ejecutar.test.ts`, `tests/integration/arranques.test.ts`, `tests/integration/conciliar.test.ts`, `tests/integration/mantenimiento-temas.test.ts`

- [ ] **Step 1: Write the failing test** in `tests/unit/mantenimiento-ejecutar.test.ts`

Add the mock with the others:

```ts
vi.mock("@/lib/mantenimiento/borrado-diferido", () => ({
  borrarLoMarcado: vi.fn(async () => ({ materiales: 0, carpetasPendientes: [] })),
}))
```

Add `almacen: almacenEnMemoria(),` to `FRECUENTE`, and the test:

```ts
describe("the ten-minute run", () => {
  it("deletes what Coni marked first, with the run's store and clock", async () => {
    const { borrarLoMarcado } = await import("@/lib/mantenimiento/borrado-diferido")
    const resultado = await mantenimientoFrecuente(FRECUENTE)
    expect(Object.keys(resultado)[0]).toBe("borrado")
    expect(borrarLoMarcado).toHaveBeenCalledWith(FRECUENTE)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/mantenimiento-ejecutar.test.ts`
Expected: FAIL: type error on `almacen` in `FRECUENTE` under `pnpm type`, and the first key is `arranques`.

- [ ] **Step 3: Wire the step**

`lib/mantenimiento/ejecutar.ts`:

```ts
import { borrarLoMarcado, type DepsBorrado } from "./borrado-diferido"
```

```ts
export type DepsFrecuente = DepsConciliacion & DepsArranques & DepsBorrado & { temas: ConstructorDeTemas }
```

```ts
/** Every ten minutes: what Coni deleted (a minute after «Borrar»), runs that never started, renders that lost their callback, voices that never finished, reservations that outlived their run and the topics (embeddings, assignment, formation). */
export function mantenimientoFrecuente(deps: DepsFrecuente) {
  return enSerie({
    // First: a deleted material's ideas leave before the topics job reads them.
    borrado: () => borrarLoMarcado(deps),
    arranques: () => reanudarArranques(deps),
```

`lib/produccion/deps-reales.ts`, in `depsFrecuente`:

```ts
    db: clienteDeServicio(),
    almacen: almacenReal(),
    avisos: avisosReales(),
```

- [ ] **Step 4: Fix the other builders and the order test**

Run: `pnpm type`
Expected: errors only in `tests/integration/arranques.test.ts`, `conciliar.test.ts`, `mantenimiento-temas.test.ts` (F10). Add `almacen: almacenEnMemoria(),` (import it from `@/lib/proveedores/almacen`) to each object passed to `mantenimientoFrecuente` or typed `DepsFrecuente`. In `arranques.test.ts:212` change the expected order to:

```ts
    expect(Object.keys(resultado)).toEqual(["borrado", "arranques", "renders", "voces", "gastos", "temas"])
```

Then run: `pnpm type && pnpm exec vitest run tests/unit/mantenimiento-ejecutar.test.ts tests/unit/mantenimiento-task.test.ts && pnpm test:db tests/integration/arranques.test.ts tests/integration/conciliar.test.ts tests/integration/mantenimiento-temas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/ejecutar.ts lib/produccion/deps-reales.ts tests/unit/mantenimiento-ejecutar.test.ts tests/integration/arranques.test.ts tests/integration/conciliar.test.ts tests/integration/mantenimiento-temas.test.ts
git commit -m "Run the deferred deletion first in the ten-minute maintenance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: processing stops on a marked material

**Files:**
- Modify: `lib/ingesta/gasto-material.ts` (`existeMaterial`), `lib/ingesta/procesar.ts` (`leerMaterial`, `procesarMaterial`)
- Modify: `tests/integration/procesar-material.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the test at :418 with:

```ts
  it("ends a material that does not exist as deleted, without error (spec decision 5)", async () => {
    expect(await procesarMaterial(await deps(almacenEnMemoria()), crypto.randomUUID())).toEqual({ resultado: "borrado" })
  })
```

Append to `describe("material borrado", ...)`:

```ts
  it("stops before the paid step when the material is marked after the extraction, and leaves it retryable", async () => {
    const base = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(base, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    const almacen = {
      ...base,
      async subir(clave: string, datos: Uint8Array, tipo: string) {
        await base.subir(clave, datos, tipo)
        if (clave.endsWith("partes-original.json"))
          await pool.query("update public.materiales set borrar_desde = now() where id = $1", [id])
      },
    }

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "borrado" })
    expect(claude.total).toBe(0)
    expect(await gastos(id)).toEqual([])
    // «Deshacer» brings it back with «Reintentar», not stuck in «Procesando» (plan D8).
    const fila = await material(id)
    expect(fila.estado).toBe("procesando")
    expect(fila.motivo_fallo).toBe("Paré de procesarlo porque lo borraste. Toca Reintentar para seguir.")
    expect(await corridaDe(id)).toBeNull()
  })

  it("does not start on a material already marked, spends nothing and leaves it retryable", async () => {
    const claude = simularClaude()
    const id = await crearMaterial(almacenEnMemoria(), { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await pool.query("update public.materiales set borrar_desde = now() where id = $1", [id])

    expect(await procesarMaterial(await deps(almacenEnMemoria()), id)).toEqual({ resultado: "borrado" })
    expect(claude.total).toBe(0)
    expect((await material(id)).motivo_fallo).toBe("Paré de procesarlo porque lo borraste. Toca Reintentar para seguir.")
  })
```

(`material(id)` and `crearMaterial` come from `./procesar-comun`; `corridaDe` is defined in the same file at :424. Read `material`'s return type first: if it does not carry `motivo_fallo`, read it with `pool.query` as `corridaDe` does.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/procesar-material.test.ts -t "borrado|does not exist"`
Expected: FAIL: the missing material throws `No existe el material`; the marked one goes on and pays Claude.

- [ ] **Step 3: Change the processing**

`lib/ingesta/gasto-material.ts`:

```ts
/** A marked material (deleted with «Deshacer») is gone for the run too: it must not cost anything more. */
export async function existeMaterial(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from("materiales").select("id").eq("id", id).is("borrar_desde", null).maybeSingle()
```

`lib/ingesta/procesar.ts`, `leerMaterial` answers null instead of throwing:

```ts
async function leerMaterial(db: Db, id: string): Promise<Material | null> {
  const { data, error } = await db.from("materiales").select("*").eq("id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer el material", error)
  return data
}

export const MOTIVO_BORRADO_AL_PROCESAR = "Paré de procesarlo porque lo borraste. Toca Reintentar para seguir."

/**
 * Coni deleted it while it was processing. If she brings it back with «Deshacer» it must not wait for ever as
 * «Procesando»: the claim goes and a reason offers «Reintentar». A row already gone changes nothing.
 */
async function soltarPorBorrado(db: Db, id: string): Promise<{ resultado: "borrado" }> {
  const { error } = await db
    .from("materiales")
    .update({ motivo_fallo: MOTIVO_BORRADO_AL_PROCESAR, ...LIBRE })
    .eq("id", id)
    .eq("estado", "procesando")
  if (error) throw falloDeBase("No pude soltar el material borrado", error)
  return { resultado: "borrado" }
}
```

In `procesarMaterial`:

```ts
export async function procesarMaterial(deps: DepsProcesar, materialId: string): Promise<ResultadoProcesar> {
  const leido = await leerMaterial(deps.db, materialId)
  // Deleted, or marked with «Deshacer»: finished without error, nothing more spent (spec decision 5).
  if (leido === null) return { resultado: "borrado" }
  if (leido.borrar_desde !== null) return soltarPorBorrado(deps.db, materialId)
  if (leido.estado === "listo") return { resultado: "ya_listo" }
```

and in its catch:

```ts
    if (error instanceof MaterialBorrado || !(await existeMaterial(deps.db, materialId))) {
      return soltarPorBorrado(deps.db, materialId)
    }
```

Remove the `FallaDeConfiguracion` import only if nothing else in the file uses it (`ffmpegDe` does: keep it).

- [ ] **Step 4: Run the whole processing file and the failure hook**

Run: `pnpm test:db tests/integration/procesar-material.test.ts && pnpm exec vitest run tests/unit && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingesta/gasto-material.ts lib/ingesta/procesar.ts tests/integration/procesar-material.test.ts
git commit -m "Stop processing a material Coni deleted, and leave it retryable if she undoes it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 3:** reviewer on Tasks 13 to 15. These change two Trigger tasks (`mantenimiento-frecuente`, `procesar-material`); confirm with `grep -rln "borrado-diferido\|gasto-material\|ingesta/procesar" trigger lib/produccion` which task files reach the changed code, for the release's Trigger deploy.

---

# Lote 4: screens

### Task 16: `TrasElAviso` also takes the deleted id out of the address

**Files:**
- Modify: `app/(app)/biblioteca/tras-el-aviso.tsx`
- Modify: `tests/unit/biblioteca-tras-el-aviso.test.tsx`

- [ ] **Step 1: Write the failing test** (append to `describe("TrasElAviso", ...)`)

```ts
  it("takes the deleted id out with the deletion's note, keeping the rest", () => {
    en(`/biblioteca?estado=listo&aviso=borrado&id=${IDEA}`)
    render(<TrasElAviso parametro="aviso" tambien="id" />)
    expect(`${window.location.pathname}${window.location.search}`).toBe("/biblioteca?estado=listo")
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-tras-el-aviso.test.tsx`
Expected: FAIL: the address keeps `id=...` (and `pnpm type` rejects `tambien`).

- [ ] **Step 3: Add the prop**

```tsx
export function TrasElAviso({
  parametro,
  tambien,
}: {
  parametro: "oculta" | "mostrada" | "aviso"
  /** A second key that belongs to the same note: the deletion's `id` (`?aviso=borrado&id=`). */
  tambien?: "id"
}) {
```

In the effect, after `url.searchParams.delete(parametro)`:

```ts
    if (tambien) url.searchParams.delete(tambien)
```

and add `tambien` to the effect's dependency list (`[parametro, tambien, nota]`). Update the doc comment's first sentence to mention the deletion's note.

- [ ] **Step 4: Run it**

Run: `pnpm exec vitest run tests/unit/biblioteca-tras-el-aviso.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/tras-el-aviso.tsx" tests/unit/biblioteca-tras-el-aviso.test.tsx
git commit -m "Let TrasElAviso take the deleted id out with its note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: `BotonBorrar`

**Files:**
- Create: `app/(app)/biblioteca/boton-borrar.tsx`
- Create: `tests/unit/biblioteca-boton-borrar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/biblioteca-boton-borrar.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true; destino: string } | { ok: false; error: string }

const ID = "11111111-2222-4333-8444-555555555555"

const { acciones, replace } = vi.hoisted(() => ({
  replace: vi.fn(),
  acciones: {
    borrarMaterialAccion: vi.fn(
      async (..._: unknown[]): Promise<Respuesta> => ({ ok: true, destino: "/biblioteca?aviso=borrado&id=x" }),
    ),
    borrarAutorAccion: vi.fn(
      async (..._: unknown[]): Promise<Respuesta> => ({ ok: true, destino: "/biblioteca/autores?aviso=borrado&id=x" }),
    ),
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
vi.mock("@/app/(app)/biblioteca/acciones", () => acciones)

import { BotonBorrar } from "@/app/(app)/biblioteca/boton-borrar"

beforeEach(() => vi.clearAllMocks())

describe("BotonBorrar", () => {
  it("deletes a material at once, with no question, and goes to the list the action names", async () => {
    render(<BotonBorrar tipo="material" id={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Borrar material" }))
    await waitFor(() => expect(acciones.borrarMaterialAccion).toHaveBeenCalledWith(ID))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/biblioteca?aviso=borrado&id=x"))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("deletes an author with its own words and action", async () => {
    render(<BotonBorrar tipo="autor" id={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Borrar autor" }))
    await waitFor(() => expect(acciones.borrarAutorAccion).toHaveBeenCalledWith(ID))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/biblioteca/autores?aviso=borrado&id=x"))
  })

  it("stays, says why in an error line and can be tapped again when it failed", async () => {
    acciones.borrarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "No pude borrarlo. Prueba de nuevo." })
    render(<BotonBorrar tipo="material" id={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Borrar material" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("No pude borrarlo. Prueba de nuevo.")
    expect(replace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Borrar material" }))
    await waitFor(() => expect(acciones.borrarMaterialAccion).toHaveBeenCalledTimes(2))
  })

  it("ignores a second tap while the first is on its way", async () => {
    render(<BotonBorrar tipo="material" id={ID} />)
    const boton = screen.getByRole("button", { name: "Borrar material" })
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(acciones.borrarMaterialAccion).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-boton-borrar.test.tsx`
Expected: FAIL with `Failed to resolve import "@/app/(app)/biblioteca/boton-borrar"`.

- [ ] **Step 3: Write the component**

```tsx
// app/(app)/biblioteca/boton-borrar.tsx
"use client"

import { useRef } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useIrA } from "@/components/use-ir-a"
import type { LoBorrado } from "@/lib/dominio/biblioteca/borrado"
import { borrarAutorAccion, borrarMaterialAccion } from "./acciones"

const ETIQUETA: Record<LoBorrado, string> = { material: "Borrar material", autor: "Borrar autor" }

/**
 * A quiet «Borrar» with no question (change 28: only «Deshacer» after acting). The action marks the row and names the
 * list with its note; this goes there and checks it landed (Next can drop it). On a refusal the button stays.
 */
export function BotonBorrar({ tipo, id }: { tipo: LoBorrado; id: string }) {
  // What started the trip: a tap inside it does not end the watch (useIrA).
  const zona = useRef<HTMLDivElement>(null)
  const { pendiente, error, ejecutar } = useAccion()
  const { ir, yendo, error: errorAlIr } = useIrA()
  const problema = error ?? errorAlIr
  return (
    <div ref={zona} className="grid justify-items-start gap-2">
      <Boton
        variante="callado"
        cargando={(pendiente || yendo) && errorAlIr === null}
        // Deleted, and only the next screen failed: a second tap would only say it again.
        deshabilitado={errorAlIr !== null}
        onClick={() => {
          if (pendiente || yendo || errorAlIr !== null) return
          ejecutar<{ destino: string }>(
            () => (tipo === "material" ? borrarMaterialAccion(id) : borrarAutorAccion(id)),
            ({ destino }) => ir(destino, zona.current),
          )
        }}
      >
        {ETIQUETA[tipo]}
      </Boton>
      {problema ? <LineaDeError>{problema}</LineaDeError> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run it and the design rules**

Run: `pnpm exec vitest run tests/unit/biblioteca-boton-borrar.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/boton-borrar.tsx" tests/unit/biblioteca-boton-borrar.test.tsx
git commit -m "Add the quiet Borrar button that lands on the list with its note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: `AvisoDeBorrado`, the toast with «Deshacer»

**Files:**
- Create: `app/(app)/biblioteca/aviso-de-borrado.tsx`
- Create: `tests/unit/biblioteca-aviso-de-borrado.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/biblioteca-aviso-de-borrado.test.tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const ID = "11111111-2222-4333-8444-555555555555"
const OTRO = "22222222-2222-4333-8444-555555555555"

const { acciones, push } = vi.hoisted(() => ({
  push: vi.fn(),
  acciones: {
    recuperarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
    recuperarAutorAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/acciones", () => acciones)

import { AvisoDeBorrado } from "@/app/(app)/biblioteca/aviso-de-borrado"

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

const aviso = () => screen.findByRole("status")

describe("AvisoDeBorrado", () => {
  it("says what she deleted and offers Deshacer, focused", async () => {
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Charla larga" }} />)
    expect(await aviso()).toHaveTextContent("Borré «Charla larga».")
    await waitFor(() => expect(screen.getByRole("button", { name: "Deshacer" })).toHaveFocus())
  })

  it("shows nothing without a note", () => {
    render(<AvisoDeBorrado tipo="material" borrado={null} />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("recovers the material, waits while it does, then says Lo recuperé. without Deshacer", async () => {
    let soltar: (r: Respuesta) => void = () => {}
    acciones.recuperarMaterialAccion.mockImplementationOnce(() => new Promise((resolver) => (soltar = resolver)))
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Charla larga" }} />)
    await aviso()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(acciones.recuperarMaterialAccion).toHaveBeenCalledWith(ID)
    expect(screen.getByRole("button", { name: "Deshaciendo…" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Deshaciendo…" }))
    expect(acciones.recuperarMaterialAccion).toHaveBeenCalledTimes(1)
    await act(async () => soltar({ ok: true }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Lo recuperé."))
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
  })

  it("recovers an author with the author's action", async () => {
    render(<AvisoDeBorrado tipo="autor" borrado={{ id: ID, nombre: "Instituto" }} />)
    await aviso()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() => expect(acciones.recuperarAutorAccion).toHaveBeenCalledWith(ID))
  })

  it("says it can no longer be recovered when maintenance was first", async () => {
    acciones.recuperarMaterialAccion.mockResolvedValueOnce({
      ok: false,
      error: "Ya no se puede recuperar: se borró del todo.",
    })
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: null }} />)
    expect(await aviso()).toHaveTextContent("Lo borré.")
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Ya no se puede recuperar: se borró del todo."),
    )
  })

  it("keeps its toast when the note leaves the address, and starts again for a new deletion", async () => {
    const { rerender } = render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await aviso()
    rerender(<AvisoDeBorrado tipo="material" borrado={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("Borré «Uno».")
    rerender(<AvisoDeBorrado tipo="material" borrado={{ id: OTRO, nombre: "Dos" }} />)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Borré «Dos»."))
  })

  it("closes after 8 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await aviso()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("sends her to sign in when the session ended", async () => {
    acciones.recuperarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Tu sesión venció. Entra de nuevo." })
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await aviso()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/biblioteca-aviso-de-borrado.test.tsx`
Expected: FAIL with `Failed to resolve import "@/app/(app)/biblioteca/aviso-de-borrado"`.

- [ ] **Step 3: Write the component**

```tsx
// app/(app)/biblioteca/aviso-de-borrado.tsx
"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"
import { avisoTrasBorrar, LO_RECUPERE, type LoBorrado } from "@/lib/dominio/biblioteca/borrado"
import { recuperarAutorAccion, recuperarMaterialAccion } from "./acciones"

interface LoQueSeBorro {
  id: string
  nombre: string | null
}

interface Propiedades {
  tipo: LoBorrado
  /** What the address says was just deleted; null with no note, and once `TrasElAviso` took it out. */
  borrado: LoQueSeBorro | null
}

type Fase =
  | { tipo: "cerrado" }
  | ({ tipo: "borrado" | "deshaciendo" } & LoQueSeBorro)
  | { tipo: "final"; mensaje: string }

/**
 * Conidolly's toast after «Borrar» (spec): 8 s with «Deshacer», then «Lo recuperé.» or why not. The list draws it on
 * every render, so the toast outlives the note leaving the address and the list redrawn after «Deshacer».
 */
export function AvisoDeBorrado({ tipo, borrado }: Propiedades) {
  const router = useRouter()
  const [, empezar] = useTransition()
  const [visto, setVisto] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>({ tipo: "cerrado" })
  // Derived from the props during render on purpose: a new id is a new deletion and starts a new toast.
  if (borrado !== null && borrado.id !== visto) {
    setVisto(borrado.id)
    setFase({ tipo: "borrado", ...borrado })
  }
  const cerrar = useCallback(() => setFase({ tipo: "cerrado" }), [])

  if (fase.tipo === "cerrado") return null
  if (fase.tipo === "final") return <Aviso key="final" mensaje={fase.mensaje} alCerrar={cerrar} />
  const { id, nombre } = fase
  return (
    <Aviso
      key={id}
      mensaje={avisoTrasBorrar(nombre)}
      alCerrar={cerrar}
      enfocarDeshacer
      deshaciendo={fase.tipo === "deshaciendo"}
      alDeshacer={() => {
        if (fase.tipo === "deshaciendo") return
        setFase({ tipo: "deshaciendo", id, nombre })
        empezar(async () => {
          const resultado = tipo === "material" ? await recuperarMaterialAccion(id) : await recuperarAutorAccion(id)
          if (!resultado.ok && resultado.error === ERROR_SESION_VENCIDA) {
            router.push("/ingreso")
            return
          }
          setFase({ tipo: "final", mensaje: resultado.ok ? LO_RECUPERE : resultado.error })
        })
      }}
    />
  )
}
```

- [ ] **Step 4: Run it**

Run: `pnpm exec vitest run tests/unit/biblioteca-aviso-de-borrado.test.tsx tests/unit/ui-aviso.test.tsx tests/unit/diseno-reglas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/aviso-de-borrado.tsx" tests/unit/biblioteca-aviso-de-borrado.test.tsx
git commit -m "Add the toast that offers Deshacer after deleting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: «Borrar material» on the material page and the desktop panel

**Files:**
- Modify: `app/(app)/biblioteca/materiales/[id]/page.tsx`, `app/(app)/biblioteca/panel-de-material.tsx`
- Modify: `tests/unit/biblioteca-pagina-detalle.test.tsx`, `tests/unit/biblioteca-panel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/biblioteca-pagina-detalle.test.tsx` (node; it walks the element tree; read its helpers first and reuse its `elementos` and its default material fixture):

```tsx
  it("offers «Borrar material» once on the phone column and once in the desktop side column, at the end", async () => {
    esConi.valor = true
    const arbol = elementos(await DetalleDeMaterial({ params: Promise.resolve({ id: ID }) }))
    const botones = arbol.filter((elemento) => elemento.type === BotonBorrar)
    expect(botones.map((boton) => boton.props)).toEqual([
      { tipo: "material", id: ID },
      { tipo: "material", id: ID },
    ])
  })
```

(import `BotonBorrar` from `@/app/(app)/biblioteca/boton-borrar`; add `borrarMaterialAccion: vi.fn()` to the file's mock of `@/app/(app)/biblioteca/acciones`; `ID` is the id the file's fixture uses.)

In `tests/unit/biblioteca-panel.test.tsx` (jsdom; it renders `PanelDeMaterial`):

```tsx
  it("offers «Borrar material» in the side panel, before «Cerrar el panel»", () => {
    render(<PanelDeMaterial panel={panel()} filtros={{}} ahora={AHORA} />)
    const borrar = screen.getByRole("button", { name: "Borrar material" })
    const cerrar = screen.getByRole("link", { name: "Cerrar el panel" })
    expect(borrar.compareDocumentPosition(cerrar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
```

(use the file's own fixture builder and time constant; add `borrarMaterialAccion: vi.fn()` to its actions mock and mock `next/navigation`'s `useRouter` if the file does not already.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-detalle.test.tsx tests/unit/biblioteca-panel.test.tsx`
Expected: FAIL: no `BotonBorrar` in the tree; no «Borrar material» button.

- [ ] **Step 3: Add the button**

`app/(app)/biblioteca/materiales/[id]/page.tsx`: import `BotonBorrar` from `../../boton-borrar`, define next to `detalle`:

```tsx
  const borrar = <BotonBorrar tipo="material" id={material.id} />
```

and draw it last in the phone block (after `{detalle}` inside `<div className="contents md:hidden">`) and last in the `aside` (after `<div className="w-full">{detalle}</div>`):

```tsx
          {detalle}
          {borrar}
        </div>
```

```tsx
        <div className="w-full">{detalle}</div>
        {borrar}
      </aside>
```

`app/(app)/biblioteca/panel-de-material.tsx`: import `BotonBorrar` from `./boton-borrar` and draw it right before the «Cerrar el panel» link:

```tsx
      <DetalleParaWav lineas={lineasParaWav(material, evidencia)} proveedor={null} />
      <BotonBorrar tipo="material" id={material.id} />
      <Link
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test:run`
Expected: PASS. A page test that mocks `@/app/(app)/biblioteca/acciones` without the new key fails only if it renders and clicks; if one fails on import, add `borrarMaterialAccion: vi.fn()` to its mock.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/materiales/[id]/page.tsx" "app/(app)/biblioteca/panel-de-material.tsx" tests/unit/biblioteca-pagina-detalle.test.tsx tests/unit/biblioteca-panel.test.tsx
git commit -m "Offer Borrar material on the material page and the desktop panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: Materiales shows the toast after a deletion

**Files:**
- Modify: `app/(app)/biblioteca/page.tsx`
- Modify: `tests/unit/biblioteca-pagina-materiales.test.tsx`

- [ ] **Step 1: Write the failing tests** (add `leerNombreDeLoBorrado: vi.fn(async (): Promise<{ nombre: string | null } | null> => null)` to the hoisted `datos`; import `AvisoDeBorrado` and `TrasElAviso`)

```tsx
describe("the note after a deletion", () => {
  const ID = "11111111-2222-4333-8444-555555555555"

  it("draws the toast with the deleted material's name and takes the note and the id out of the address", async () => {
    esConi.valor = true
    datos.leerNombreDeLoBorrado.mockResolvedValueOnce({ nombre: "Charla larga" })
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ aviso: "borrado", id: ID }) }))
    expect(datos.leerNombreDeLoBorrado).toHaveBeenCalledWith(expect.anything(), "material", ID)
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({
      tipo: "material",
      borrado: { id: ID, nombre: "Charla larga" },
    })
    expect(arbol.find((e) => e.type === TrasElAviso)?.props).toEqual({ parametro: "aviso", tambien: "id" })
  })

  it("keeps the toast mounted without a note, and reads nothing", async () => {
    esConi.valor = true
    const arbol = elementos(await Materiales({ searchParams: sinFiltros() }))
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({ tipo: "material", borrado: null })
    expect(arbol.find((e) => e.type === TrasElAviso)).toBeUndefined()
    expect(datos.leerNombreDeLoBorrado).not.toHaveBeenCalled()
  })

  it("shows no toast when the material is no longer marked (a stale address), but still cleans the address", async () => {
    esConi.valor = true
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ aviso: "borrado", id: ID }) }))
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({ tipo: "material", borrado: null })
    expect(arbol.find((e) => e.type === TrasElAviso)).toBeDefined()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-materiales.test.tsx`
Expected: FAIL: no `AvisoDeBorrado` in the tree.

- [ ] **Step 3: Read the note on the page** (`app/(app)/biblioteca/page.tsx`; import `leerNombreDeLoBorrado`, `leerBorrado`, `AvisoDeBorrado`, `TrasElAviso`)

```tsx
  const seleccion = leerSeleccion(params)
  const borrado = leerBorrado(params)
  const [materiales, conteos, autores, panel, loBorrado] = await Promise.all([
    listarMateriales(db, filtros),
    contarPorEstado(db),
    listarAutores(db),
    seleccion ? leerPanelDelMaterial(db, seleccion) : null,
    borrado ? leerNombreDeLoBorrado(db, "material", borrado) : null,
  ])
```

and right after `<RefrescoAutomatico ... />`:

```tsx
      {borrado ? <TrasElAviso parametro="aviso" tambien="id" /> : null}
      {/* Always drawn: its toast outlives the note leaving the address (plan D6). */}
      <AvisoDeBorrado tipo="material" borrado={borrado && loBorrado ? { id: borrado, nombre: loBorrado.nombre } : null} />
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/page.tsx" tests/unit/biblioteca-pagina-materiales.test.tsx
git commit -m "Show the deletion toast with Deshacer on Materiales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: «Borrar autor» on the author page, and its toast on Autores

**Files:**
- Modify: `app/(app)/biblioteca/autores/[id]/page.tsx`, `app/(app)/biblioteca/autores/page.tsx`
- Modify: `tests/unit/biblioteca-pagina-autores.test.tsx`

- [ ] **Step 1: Write the failing tests** (read the file first: it mocks `@/lib/datos/biblioteca` with `resumirAutores`, `leerAutor`, `listarAutores`; add `leerNombreDeLoBorrado` to that mock, and `borrarAutorAccion: vi.fn()` to its actions mock; reuse its author fixtures)

```tsx
describe("deleting an author", () => {
  const ID = "11111111-2222-4333-8444-555555555555"
  const vacio = { autor: { id: ID, nombre: "Instituto", credencial: null, tipo: "institucion", alias: [] }, materiales: 0, ideas: 0, grupos: [], ocultas: [] }

  it("offers «Borrar autor» on an author with nothing", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(vacio)
    const arbol = elementos(await DetalleDeAutor({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) }))
    expect(arbol.find((e) => e.type === BotonBorrar)?.props).toEqual({ tipo: "autor", id: ID })
  })

  it.each([
    ["Coni's own card", { ...vacio, autor: { ...vacio.autor, tipo: "coni" } }],
    ["an author with a material", { ...vacio, materiales: 1 }],
    ["an author with only hidden ideas", { ...vacio, ocultas: [IDEA_OCULTA] }],
  ])("never offers it on %s", async (_, leido) => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido)
    const arbol = elementos(await DetalleDeAutor({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) }))
    expect(arbol.find((e) => e.type === BotonBorrar)).toBeUndefined()
  })

  it("draws the toast on Autores with the deleted author's name and cleans the address", async () => {
    esConi.valor = true
    datos.leerNombreDeLoBorrado.mockResolvedValueOnce({ nombre: "Instituto" })
    const arbol = elementos(await Autores({ searchParams: Promise.resolve({ aviso: "borrado", id: ID }) }))
    expect(datos.leerNombreDeLoBorrado).toHaveBeenCalledWith(expect.anything(), "autor", ID)
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({
      tipo: "autor",
      borrado: { id: ID, nombre: "Instituto" },
    })
    expect(arbol.find((e) => e.type === TrasElAviso)?.props).toEqual({ parametro: "aviso", tambien: "id" })
  })
})
```

(Type the mock's `leerAutor` as `vi.fn(async (..._: unknown[]): Promise<AutorLeido | null> => null)` if it is narrower. `IDEA_OCULTA` is one `IdeaLeida` fixture from the file, or `{ id: "i", texto: "x", tipo: "dato", evidencia: "estudio", creadaEn: "2026-11-01T00:00:00.000Z" }` shaped exactly as `IdeaLeida` in `lib/dominio/biblioteca/ideas.ts` declares; `DetalleDeAutor` and `Autores` are the two default exports.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-autores.test.tsx`
Expected: FAIL: no `BotonBorrar`, no `AvisoDeBorrado`.

- [ ] **Step 3: Change the two pages**

`app/(app)/biblioteca/autores/[id]/page.tsx` (import `sePuedeBorrarAutor` from `@/lib/dominio/biblioteca/borrado` and `BotonBorrar` from `../../boton-borrar`), last inside the root `div`, after the `UnirAutores` block:

```tsx
      {sePuedeBorrarAutor(autor, { materiales, ideas, ocultas: ocultas.length }) ? (
        <BotonBorrar tipo="autor" id={autor.id} />
      ) : null}
```

`app/(app)/biblioteca/autores/page.tsx` (import `leerNombreDeLoBorrado`, `leerBorrado`, `AvisoDeBorrado` from `../aviso-de-borrado`, `TrasElAviso` from `../tras-el-aviso`):

```tsx
  const seleccion = leerSeleccion(params, "a")
  const borrado = leerBorrado(params)
  const [autores, loBorrado] = await Promise.all([
    resumirAutores(db),
    borrado ? leerNombreDeLoBorrado(db, "autor", borrado) : null,
  ])
```

and right after `<FocoDelPanel seleccion={seleccion} />`:

```tsx
      {borrado ? <TrasElAviso parametro="aviso" tambien="id" /> : null}
      <AvisoDeBorrado tipo="autor" borrado={borrado && loBorrado ? { id: borrado, nombre: loBorrado.nombre } : null} />
```

- [ ] **Step 4: Run all unit tests and the build**

Run: `pnpm test:run && pnpm type && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/autores/[id]/page.tsx" "app/(app)/biblioteca/autores/page.tsx" tests/unit/biblioteca-pagina-autores.test.tsx
git commit -m "Offer Borrar autor on an author with nothing, with the toast on Autores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 4:** reviewer on Tasks 16 to 21 against the spec's "Coni's flow" and "Notice on the next screen". `pnpm build` must pass here, before the E2E.

---

# Lote 5: end to end

### Task 22: deleting a material on the phone

**Files:**
- Create: `tests/e2e/biblioteca-borrar.spec.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/e2e/biblioteca-borrar.spec.ts
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import {
  AUTORA,
  type EscenaDeAutoresYTemas,
  sembrarAutoresYTemas,
  TEMA_PRINCIPAL,
  TITULO_LISTO,
} from "./biblioteca-escena"

const CHARLA = "Charla larga sobre el síndrome del impostor"
let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

const aviso = (page: Page) => page.getByRole("status").filter({ hasText: /^Borré|^Lo borré/ })
const tarjetas = (page: Page) => page.getByRole("list", { name: "Materiales" }).getByRole("listitem")

async function borrarDesdeSuPagina(page: Page, id: string) {
  await page.goto(`/biblioteca/materiales/${id}`)
  await page.getByRole("button", { name: "Borrar material" }).click()
  await expect(page).toHaveURL(/\/biblioteca$/)
}

test("deletes a material from its page with no question; it leaves the list, the counts and its author, and Deshacer brings it back", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await expect(page.getByRole("link", { name: "Procesando · 2" })).toBeVisible()

  await borrarDesdeSuPagina(page, escena.esperaOk)
  await expect(aviso(page)).toHaveText(`Borré «${CHARLA}».Deshacer`)
  await expect(tarjetas(page).filter({ hasText: CHARLA })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Procesando · 1" })).toBeVisible()
  expect(await revisarConAxe(page, "lista con el aviso de borrado")).toEqual([])

  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Lo recuperé." })).toBeVisible()
  await expect(tarjetas(page).filter({ hasText: CHARLA })).toHaveCount(1)
  await expect(page.getByRole("link", { name: "Procesando · 2" })).toBeVisible()

  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByText("2 materiales · 3 ideas sacadas")).toBeVisible()
})

test("a deleted material is gone from its author's page, its topic and Temas until Deshacer", async ({ page }) => {
  await borrarDesdeSuPagina(page, escena.listo)
  await expect(aviso(page)).toContainText(`Borré «${TITULO_LISTO}».`)

  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
  await expect(page.getByText("1 material", { exact: true })).toBeVisible()
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(page.getByRole("heading", { name: AUTORA })).toHaveCount(0)
  await page.goto("/biblioteca/temas")
  const carga = page.getByRole("list", { name: "Temas" }).getByRole("listitem").filter({ hasText: TEMA_PRINCIPAL })
  await expect(carga).toContainText("1 idea sacada · 1 autor")
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  await expect(page.getByRole("heading", { name: "No encontré lo que buscabas", level: 1 })).toBeVisible()

  // The toast closed while she visited the other screens: unmark from the database's side to check they come back.
  await pool.query("update public.materiales set borrar_desde = null where id = $1", [escena.listo])
  await page.goto("/biblioteca/temas")
  await expect(carga).toContainText("3 ideas sacadas · 2 autores")
})

test("the notice does not come back on reload, and the address loses the note", async ({ page }) => {
  await borrarDesdeSuPagina(page, escena.esperaOk)
  await expect(aviso(page)).toBeVisible()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(aviso(page)).toHaveCount(0)
})

test("Deshacer after maintenance deleted it says it can no longer be recovered", async ({ page }) => {
  await borrarDesdeSuPagina(page, escena.esperaOk)
  await expect(aviso(page)).toBeVisible()
  await pool.query("delete from public.materiales where id = $1", [escena.esperaOk])
  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Ya no se puede recuperar: se borró del todo." })).toBeVisible()
})
```

- [ ] **Step 2: Run them**

Run: `pnpm build && pnpm exec playwright test tests/e2e/biblioteca-borrar.spec.ts`
Expected: PASS (4 tests). A failure here is a real bug in Lotes 1 to 4: fix it with a failing unit or integration test first, in its own commit.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/biblioteca-borrar.spec.ts
git commit -m "Cover deleting a material with Deshacer on the phone end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 23: deleting an author on the phone

**Files:**
- Modify: `tests/e2e/biblioteca-borrar.spec.ts` (append; import `SIN_MATERIAL`)

- [ ] **Step 1: Write the tests**

```ts
test("deletes an author with nothing from its page, lands on Autores, and Deshacer brings it back", async ({ page }) => {
  const autores = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  await page.goto("/biblioteca/autores")
  await expect(autores).toHaveCount(4)

  await page.goto(`/biblioteca/autores/${escena.sinMaterial}`)
  await page.getByRole("button", { name: "Borrar autor" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/autores$/)
  await expect(page.getByRole("status").filter({ hasText: `Borré «${SIN_MATERIAL}».` })).toBeVisible()
  await expect(autores).toHaveCount(3)
  expect(await revisarConAxe(page, "autores con el aviso de borrado")).toEqual([])

  await page.getByRole("status").getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Lo recuperé." })).toBeVisible()
  await expect(autores).toHaveCount(4)
})

test("never offers Borrar autor on an author with materials or on Coni's own card", async ({ page }) => {
  for (const id of [escena.autora, escena.coni]) {
    await page.goto(`/biblioteca/autores/${id}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("button", { name: "Borrar autor" })).toHaveCount(0)
  }
  expect(await revisarConAxe(page, "ficha de Coni")).toEqual([])
})
```

- [ ] **Step 2: Run them**

Run: `pnpm exec playwright test tests/e2e/biblioteca-borrar.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/biblioteca-borrar.spec.ts
git commit -m "Cover deleting an author with Deshacer on the phone end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24: deleting from the desktop side panel

**Files:**
- Create: `tests/e2e/biblioteca-borrar.escritorio.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/biblioteca-borrar.escritorio.ts
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeBiblioteca, sembrarBiblioteca, TITULO_LISTO } from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
})

test("deletes a material from the side panel, the row leaves the table, and Deshacer puts it back", async ({ page }) => {
  await page.goto("/biblioteca")
  const tabla = page.getByRole("table", { name: "Materiales" })
  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: TITULO_LISTO }),
    new RegExp(`/biblioteca\\?m=${escena.listo}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("complementary", { name: "Material elegido" })
  await panel.getByRole("button", { name: "Borrar material" }).click()

  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(page.getByRole("status").filter({ hasText: `Borré «${TITULO_LISTO}».` })).toBeVisible()
  await expect(tabla.getByRole("link", { name: TITULO_LISTO })).toHaveCount(0)
  expect(await revisarConAxe(page, "tabla con el aviso de borrado")).toEqual([])

  await page.getByRole("status").getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Lo recuperé." })).toBeVisible()
  await expect(tabla.getByRole("link", { name: TITULO_LISTO })).toHaveCount(1)
})

test("the material page's side column offers Borrar material too", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  const columna = page.getByRole("complementary", { name: "Acciones del material" })
  await columna.getByRole("button", { name: "Borrar material" }).click()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(page.getByRole("status").filter({ hasText: `Borré «${TITULO_LISTO}».` })).toBeVisible()
})
```

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test --project escritorio tests/e2e/biblioteca-borrar.escritorio.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the Biblioteca E2E by file** (the panel and the detail column gained a button: baselines may move)

Run: `pnpm exec playwright test tests/e2e/biblioteca.spec.ts tests/e2e/biblioteca-autores.spec.ts tests/e2e/biblioteca-temas.spec.ts tests/e2e/visual.spec.ts && pnpm exec playwright test --project escritorio tests/e2e/biblioteca.escritorio.ts tests/e2e/biblioteca-autores-temas.escritorio.ts`
Expected: functional tests PASS. If a visual baseline of the material detail, the desktop panel or an empty author page differs only by the new «Borrar» button, **do not update it yet**: list the files for Task 28.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/biblioteca-borrar.escritorio.ts
git commit -m "Cover deleting from the desktop panel and the material's side column

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint Lote 5:** reviewer on Tasks 22 to 24 against the spec's "Testing / E2E".

---

# Lote 6: the Ingesta PR (separate repo, merged before Conidolly's)

Needs the migration applied to the local database (Lote 1). Work in `INGESTA`.

### Task 25: Ingesta's readers hide marked rows

**Files (in `INGESTA`):**
- Modify: `lib/supabase/database.types.ts` (generated), `lib/ingesta/materiales.ts`, `lib/ingesta/autores.ts`, `lib/ingesta/temas.ts`
- Create: `tests/integration/borrado-diferido.test.ts`

- [ ] **Step 1: Branch and regenerate the types**

```bash
cd /Users/fede/Projects/conidolly-ingesta && git switch main && git pull --ff-only && git switch -c feat/borrado-diferido
pnpm install --frozen-lockfile && pnpm db:types && git diff --stat lib/supabase/database.types.ts
```

Expected: the diff adds `borrar_desde`, the two views and the three functions. Commit it alone:

```bash
git add lib/supabase/database.types.ts
git commit -m "Regenerate the types with the deletion mark

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/integration/borrado-diferido.test.ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { leerAutor, listarAutores, resumirAutores } from "@/lib/ingesta/autores"
import { leerMapaDelMaterial, leerMaterialConFicha, listarMateriales } from "@/lib/ingesta/materiales"
import { leerTema, listarTemas } from "@/lib/ingesta/temas"
import type { Database } from "@/lib/supabase/database.types"
import { clienteDeConi, clienteDeServicio } from "./sesion"

type Db = SupabaseClient<Database>

const servicio = clienteDeServicio()
const PREFIJO = "Prueba de borrado diferido "
const VECTOR_NULO = `[${new Array(1024).fill(0).join(",")}]`
const sufijo = () => randomUUID().slice(0, 6)

let coni: Db
let idConi = ""
let autora = ""
let marcada = ""
let vivo = ""
let marcado = ""
let tema = ""

async function falla<T>(promesa: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promesa
  if (error || data === null) throw new Error(error?.message ?? "La base no devolvió nada")
  return data
}

const marcar = (tabla: "materiales" | "autores", id: string, cuando: string | null) =>
  tabla === "materiales"
    ? falla(servicio.from("materiales").update({ borrar_desde: cuando }).eq("id", id).select("id"))
    : falla(servicio.from("autores").update({ borrar_desde: cuando }).eq("id", id).select("id"))

async function sembrarAutor(nombre: string): Promise<string> {
  const fila = await falla(
    servicio.from("autores").insert({ nombre: `${PREFIJO}${nombre} ${sufijo()}`, tipo: "persona" }).select("id").single(),
  )
  return fila.id
}

async function sembrarMaterial(autorId: string): Promise<string> {
  const id = randomUUID()
  await falla(
    servicio.from("materiales").insert({
      id,
      tipo: "documento",
      titulo: `${PREFIJO}material`,
      autor_id: autorId,
      rol: "referente",
      texto_pegado: "x",
      declaracion_sin_pacientes_en: new Date().toISOString(),
      subido_por: idConi,
      estado: "listo",
    }).select("id"),
  )
  return id
}

async function sembrarIdea(materialId: string, autorId: string, temaId: string): Promise<void> {
  await falla(
    servicio.from("afirmaciones").insert({
      material_id: materialId,
      autor_id: autorId,
      tema_id: temaId,
      tramo: 0,
      ubicacion: { pagina: 1 },
      texto: "Una idea",
      cita: "Una cita",
      tipo: "dato",
      evidencia: "opinion",
    }).select("id"),
  )
}

beforeAll(async () => {
  coni = await clienteDeConi()
  idConi = (await coni.auth.getUser()).data.user?.id ?? ""
  autora = await sembrarAutor("Autora")
  marcada = await sembrarAutor("Marcada")
  const filaDeTema = await falla(
    servicio.from("temas").insert({ nombre: `${PREFIJO}Tema ${sufijo()}`, centroide: VECTOR_NULO }).select("id").single(),
  )
  tema = filaDeTema.id
  vivo = await sembrarMaterial(autora)
  marcado = await sembrarMaterial(autora)
  await sembrarIdea(vivo, autora, tema)
  await sembrarIdea(marcado, autora, tema)
  await sembrarIdea(marcado, autora, tema)
  await marcar("materiales", marcado, new Date().toISOString())
  await marcar("autores", marcada, new Date().toISOString())
})

afterAll(async () => {
  await servicio.from("materiales").delete().in("id", [vivo, marcado])
  await servicio.from("temas").delete().like("nombre", `${PREFIJO}%`)
  await servicio.from("autores").delete().like("nombre", `${PREFIJO}%`)
})

describe("Ingesta hides what Conidolly marked for deletion", () => {
  it("in the materials list, the detail and the map", async () => {
    const ids = (await listarMateriales(coni, {})).map((material) => material.id)
    expect(ids).toContain(vivo)
    expect(ids).not.toContain(marcado)
    expect(await leerMaterialConFicha(coni, marcado)).toBeNull()
    expect((await leerMapaDelMaterial(coni, marcado)).total).toBe(0)
  })

  it("in the authors, their counts and their pages", async () => {
    expect((await listarAutores(coni)).map((autor) => autor.id)).not.toContain(marcada)
    const resumen = (await resumirAutores(coni)).find((autor) => autor.id === autora)
    expect(resumen).toMatchObject({ materiales: 1, afirmaciones: 1 })
    expect(await leerAutor(coni, marcada)).toBeNull()
    const leido = await leerAutor(coni, autora)
    expect(leido?.materiales).toBe(1)
    expect(leido?.grupos.flatMap((grupo) => grupo.afirmaciones)).toHaveLength(1)
  })

  it("in the topics and a topic's page", async () => {
    expect((await listarTemas(coni, {})).find((t) => t.id === tema)).toMatchObject({ afirmaciones: 1, autores: 1 })
    const leido = await leerTema(coni, tema)
    expect(leido?.autores.flatMap((grupo) => grupo.afirmaciones)).toHaveLength(1)
  })
})
```

If `leerAutor`'s returned ideas now carry a `materiales` key and an existing test compares whole objects, Step 4 strips it (see there).

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido.test.ts`
Expected: FAIL: the marked material is listed (`listarTemas` already passes: `temas_resumen` is shared).

- [ ] **Step 4: Filter the readers**

`lib/ingesta/materiales.ts`:
- `listarMateriales`: `.select(COLUMNAS_DE_LISTA).is("borrar_desde", null)` before `.order(...)`.
- `leerMaterialConFicha`: `.eq("id", id).is("borrar_desde", null).maybeSingle()`.
- `leerMapaDelMaterial`: select `"tema_id, tipo, evidencia, temas ( nombre ), materiales!inner ( borrar_desde )"`, add `.is("materiales.borrar_desde", null)`, and push `data.map(({ tema_id, tipo, evidencia, temas }) => ({ tema_id, tipo, evidencia, temas }))` instead of `data`.

`lib/ingesta/autores.ts`:
- `listarAutores`: `db.from("autores").select(COLUMNAS).is("borrar_desde", null)`.
- `resumirAutores`: materials `db.from("materiales").select("autor_id").is("borrar_desde", null).order("id").range(desde, hasta)`; ideas select `"autor_id, tema_id, temas ( nombre ), materiales!inner ( borrar_desde )"` with `.is("materiales.borrar_desde", null)`.
- `leerAutor`: author `.eq("id", id).is("borrar_desde", null).maybeSingle()`; count `.eq("autor_id", id).is("borrar_desde", null)`; ideas select gains `materiales!inner ( borrar_desde )` with `.is("materiales.borrar_desde", null)`, and the loop destructures it away: `for (const { excluida, tema_id, temas, ubicacion, materiales: _material, ...resto } of filas)`.

`lib/ingesta/temas.ts`, `leerTema`: `COLUMNAS_DE_AFIRMACION` stays; the query becomes `.select(`${COLUMNAS_DE_AFIRMACION}, materiales!inner ( borrar_desde )`)` with `.is("materiales.borrar_desde", null)`, and the loop destructures `materiales: _material` away the same way.

- [ ] **Step 5: Run Ingesta's tests**

Run: `pnpm test:db && pnpm test:run && pnpm type && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ingesta/materiales.ts lib/ingesta/autores.ts lib/ingesta/temas.ts tests/integration/borrado-diferido.test.ts
git commit -m "Hide what Conidolly marked for deletion from Ingesta's lists and pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 26: Ingesta's actions treat a marked row as not found

**Files (in `INGESTA`):**
- Modify: `lib/ingesta/materiales.ts` (`editarMaterial`), `lib/ingesta/subir.ts` (`confirmarMaterial`), `lib/ingesta/autores.ts` (`crearAutor`)
- Modify: `tests/integration/borrado-diferido.test.ts` (append; import `editarMaterial` from materiales, `confirmarMaterial` and `type DepsSubir` from subir, `crearAutor` from autores, `almacenEnMemoria` from `@/lib/almacen/almacen`)

- [ ] **Step 1: Write the failing tests**

```ts
const deps = (db: Db): DepsSubir => ({
  db,
  almacen: almacenEnMemoria(),
  disparar: async () => {},
  ahora: () => new Date("2026-11-06T12:00:00.000Z"),
  nuevoId: randomUUID,
})

describe("Ingesta's actions on a marked row", () => {
  it("editarMaterial and confirmarMaterial answer not found", async () => {
    expect(await editarMaterial(deps(coni), { materialId: marcado, autorId: autora, rol: "evidencia" })).toEqual({
      ok: false,
      error: "No encontré ese material.",
    })
    expect(await confirmarMaterial(deps(coni), { materialId: marcado })).toEqual({
      ok: false,
      error: "No encontré ese material.",
    })
  })

  it("crearAutor with a marked author's name brings it back", async () => {
    const { nombre } = await falla(servicio.from("autores").select("nombre").eq("id", marcada).single())
    const resultado = await crearAutor(deps(coni), { nombre, tipo: "persona" })
    expect(resultado).toMatchObject({ ok: true, autor: { id: marcada } })
    const { borrar_desde } = await falla(servicio.from("autores").select("borrar_desde").eq("id", marcada).single())
    expect(borrar_desde).toBeNull()
    await marcar("autores", marcada, new Date().toISOString())
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:db tests/integration/borrado-diferido.test.ts -t "actions on a marked row"`
Expected: FAIL: `editarMaterial` answers `{ ok: true }`; `crearAutor` leaves the author marked.

- [ ] **Step 3: Change the actions**

`editarMaterial`: `.eq("id", materialId).is("borrar_desde", null).select("id")`.

`confirmarMaterial` (`subir.ts`): `.eq("subido_por", userId).is("borrar_desde", null).maybeSingle()`.

`crearAutor` (`autores.ts`), after the read-back:

```ts
  const { data: leido, error: errorDeLectura } = await deps.db
    .from("autores")
    .select(`${COLUMNAS}, borrar_desde`)
    .eq("id", id)
    .single()
  if (errorDeLectura) {
    console.error("No pude leer el autor que creé", errorDeLectura)
    return { ok: false, error: ERROR_GENERICO }
  }
  const { borrar_desde, ...autor } = leido
  // `crear_autor` answers an author deleted from Conidolly a moment ago: typing its name is wanting it back.
  if (borrar_desde !== null) {
    const { error: errorAlRecuperar } = await deps.db.rpc("marcar_autor_para_borrar", { p_id: id, p_borrar: false })
    if (errorAlRecuperar) {
      console.error(`No pude recuperar el autor ${id}`, errorAlRecuperar)
      return { ok: false, error: ERROR_GENERICO }
    }
  }
  return { ok: true, autor }
```

- [ ] **Step 4: Run Ingesta's gate**

Run: `pnpm test:db && pnpm test:run && pnpm type && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingesta/materiales.ts lib/ingesta/subir.ts lib/ingesta/autores.ts tests/integration/borrado-diferido.test.ts
git commit -m "Treat a row marked for deletion as gone in Ingesta's actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 27: Ingesta's PR

- [ ] **Step 1: Check the scope**

Run: `git diff --stat main...HEAD && grep -rn "$(printf '\342\200\224')" lib tests/integration/borrado-diferido.test.ts`
Expected: only the files of Tasks 25 and 26; no em dash.

- [ ] **Step 2: Review** with `superpowers:requesting-code-review` on the branch (spec decision 6 and plan D1, D5).

- [ ] **Step 3: Push and open the PR** (private repo, `WAV-WaAreVision/conidolly-ingesta`). Title: "Hide rows Conidolly marked for deletion". Body: what changes, that it needs the estudio-coni migration `20261106000100_biblioteca_borrado_diferido.sql` in production first, that it merges and deploys **before** the Conidolly PR, "Part of WAV-WaAreVision/estudio-coni#17", ending with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. **Do not merge here**: merging is Task 29.

**Checkpoint Lote 6:** reviewer approved, CI green on the Ingesta PR.

---

# Lote 7: gate and shipping

### Task 28: the full gate

**Files:** none new, except visual baselines if Federico approves them (Step 3).

- [ ] **Step 1: Every check**

Run: `pnpm lint && pnpm type && pnpm build && pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: all green, except visual baselines listed in Task 24 Step 3.

- [ ] **Step 2: Banned patterns and scope**

```bash
git diff origin/main --name-only -- app lib components | xargs grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|$(printf '\342\200\224')|text-\[[0-9]|catch \{\s*\}|redirect\("
git diff origin/main --stat -- supabase/migrations
git diff origin/main --stat -- components/nav-inferior.tsx app/ir-a-biblioteca trigger
grep -rn "$(printf '\342\200\224')" docs/superpowers/plans/2026-11-06-biblioteca-borrar-con-deshacer.md supabase/migrations/20261106000100_biblioteca_borrado_diferido.sql
```

Expected: the first prints only the existing `redirect(` lines of `unirAutoresAccion` and `ocultarIdeaAccion` (none new); the second lists exactly one new file, `20261106000100_biblioteca_borrado_diferido.sql`, and no modified migration; the third prints nothing; the fourth prints nothing.

- [ ] **Step 3: Baselines, only after Federico looks.** If Task 24 listed moved baselines, take the captures (`pnpm exec playwright test tests/e2e/visual.spec.ts --update-snapshots` into a scratch copy, not the repo), show them to Federico, and only on his OK update and commit them in one commit of their own: "Retake the Biblioteca baselines with the Borrar button".

- [ ] **Step 4: Review the whole branch** with `superpowers:requesting-code-review`. Fix findings with a failing test first, one commit per fix, and rerun Step 1.

### Task 29: release (controller; not executed by implementer subagents)

Federico's standing authorization (memory "Salida a producción autorizada") covers steps 1 to 5 when its conditions hold (issue, green CI, reviews, dry-run). **Step 6, the Trigger deploy, needs Federico's explicit OK in the conversation.** Order matters: the database first (both apps' new code reads `borrar_desde`), then Ingesta, then Conidolly.

1. **Issue and CI.** Work on #17 (board WAV-WaAreVision/projects/1); Conidolly PR open from `feat/biblioteca-borrar-con-deshacer` ("Part of #17", never "Closes"), CI green, review approved; Ingesta PR green and approved (Task 27).
2. **Read-only pre-checks on production:**

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name in ('materiales', 'autores') and column_name = 'borrar_desde';  -- Expected: no rows.
select to_regclass('public.materiales_visibles'), to_regclass('public.autores_visibles');                    -- Expected: null, null.
select count(*) from public.temas_resumen;                                                                    -- Note it (step 3).
```

3. **`supabase db push --dry-run`** against production. Expected: exactly `20261106000100_biblioteca_borrado_diferido.sql`. Then **`supabase db push`**. Afterwards: both columns exist and are null everywhere (`select count(*) from public.materiales where borrar_desde is not null` is 0), and `temas_resumen` has the same row count as in step 2.
4. **Ingesta first:** merge its PR, then `vercel deploy --prod --yes` from its `main` (Ingesta publishes by hand, `INGESTA/CLAUDE.md`). Live check: https://conidolly-ingesta.vercel.app/ loads the materials list.
5. **Conidolly:** merge its PR (Vercel publishes `main`). Live check: without a session `/biblioteca` redirects to sign-in; the served HTML of a material page (Federico, Coni's account, by address) has «Borrar material». Still reachable only by address until batch 7 (spec, Shipping). Until step 6 runs, a deleted row stays hidden and is not deleted for real; processing does not stop on a mark.
6. **Trigger deploy, only with Federico's explicit OK:** it changes `mantenimiento-frecuente` (the `borrado` step) and `procesar-material` (stops on a mark). From the worktree on `main` after the merge:

```bash
pnpm install
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

   Afterwards: the next `mantenimiento-frecuente` run's output starts with `borrado`. Record the version in `docs/TRASPASO.md`.
7. **Board:** comment on #17 with the release date of batch 4, the Trigger version and the live checks; #17 stays open (batches 5 to 7).

---

## Self-review against the spec

| Spec section | Where |
|---|---|
| Decision 1: Coni's migration as the base, with the listed deviations | Tasks 1 to 4 (no `ya_volviste_a_subir`, signature unchanged) |
| Decision 2: marked is gone everywhere; detail pages answer not found | Tasks 7, 8 (every reader in the spec's list), 9 (actions), 22 (detail not found) |
| Decision 3: maintenance within minutes, 1 minute margin in TypeScript | Tasks 13, 14 (`MARGEN_DE_BORRADO_MS`, first step) |
| Decision 4: what still sees a marked row is accepted | D10; nothing built |
| Decision 5: processing stops on a marked or missing material | Task 15 (start and before each paid step; D8 leaves it retryable) |
| Decision 6: Ingesta hides marked rows, merged first; its hard delete stays | Lote 6; Task 29 steps 4 and 5 |
| Coni's flow, material: quiet button on the page and the desktop panel, no question, `useIrA`, toast 8 s, «Deshacer», «Lo recuperé.» | Tasks 17 to 20, 22, 24 |
| Coni's flow, author: only with nothing live, never Coni's card, lands on Autores | Tasks 6, 11, 21, 23 |
| Errors in her words: failure line; too late; author with materials | Tasks 6, 10, 11, 17, 18, 22 |
| Notice on the next screen: whitelisted `?aviso=borrado&id=`, `TrasElAviso` cleans it, «Deshacer» calls the unmark | Tasks 6, 16, 18, 20, 21, 22 (reload) |
| Database: columns, indexes, views, three functions, `temas_resumen`, the log, adds only, types | Tasks 1 to 5 (D2, D3); Task 28 Step 2 |
| Code: readers, actions with Zod and `conSesionDeConi`, maintenance with `almacen`, R2 failure logged, processing | Tasks 7 to 15 |
| Testing, SQL | Tasks 1 to 5 |
| Testing, units/integration: readers, actions' error codes, maintenance step (folders, R2 failure, margin), processing | Tasks 7 to 15 (Task 10 covers the unexpected-error mapping, Task 12 the wrappers) |
| Testing, E2E: page and desktop panel; list, counts, author page, topic page; undo in all; author delete and undo; no button on an author with materials or Coni's card; no notice on reload; axe on both screens | Tasks 22 to 24 |
| Shipping: dry-run shows only the new migration, Trigger deploy with Federico's OK, Ingesta first | Task 29 |
| Out of scope: deleting ideas or topics, trash screen, bulk delete, change 8, Semana, tab switch | Not planned |

Names across tasks: `LoBorrado`, `hrefTrasBorrar`, `leerBorrado`, `avisoTrasBorrar`, `LO_RECUPERE`, `NO_PUDE_BORRAR`, `NO_PUDE_RECUPERAR`, `YA_NO_SE_RECUPERA`, `AUTOR_CON_MATERIALES`, `CONI_NO_SE_BORRA`, `sePuedeBorrarAutor` (Task 6) are what Tasks 8, 10, 11, 17, 18, 20, 21 import; `leerNombreDeLoBorrado(db, tipo, id)` (Task 8) is what Tasks 20, 21 call and mock; `borrarMaterial`, `recuperarMaterial` (Task 10), `SobreAutor`, `borrarAutor`, `recuperarAutor` (Task 11) are what Task 12 wraps as `borrarMaterialAccion`, `recuperarMaterialAccion`, `borrarAutorAccion`, `recuperarAutorAccion`, which Tasks 17, 18 call; `borrarMaterialSinSubir` is the renamed private helper (Task 10); `MARGEN_DE_BORRADO_MS`, `DepsBorrado`, `borrarLoMarcado` (Task 13) are what Task 14 wires; `MOTIVO_BORRADO_AL_PROCESAR` (Task 15) is the text its tests pin; `TrasElAviso tambien="id"` (Task 16) is what Tasks 20, 21 draw; `BotonBorrar { tipo, id }` (Task 17) and `AvisoDeBorrado { tipo, borrado }` (Task 18) are what Tasks 19 to 21 draw and assert.
