# Pillars per network (15c): drafts Coni approves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Temas `[ + Agregar red ]` at the end of the network row and `[ + Agregar pilar ]` among the chosen network's pillars (before the Capa TDAH), both opening short forms that save drafts; list the drafts in "Borradores", where Coni edits, discards or approves a pillar draft while redistributing that network's weights in every stage; an approved pillar becomes an active `categorias` pillar that every reader already picks up, without a Trigger deploy.

**Architecture:** One additive migration adds `borradores_de_pilar` and `borradores_de_red` (row level security: Coni writes and edits only drafts in `borrador`, WAV reads, nobody deletes) and the security-definer RPC `aprobar_borrador_de_pilar(p_borrador, p_pesos)`, which in one transaction refuses a decided draft, a name in use, a weight of another network, inserts the pillar (slug from its name, next `orden`), writes the weights of every stage of that network (today in America/Santiago and each later `desde` it already has) and marks the draft approved. Drafts never touch `categorias`, so nothing that reads pillars can see one. A pure module `lib/dominio/biblioteca/borradores.ts` holds the forms' validation, the weights editor, the routes and the notes; `lib/datos/borradores.ts` reads, `lib/acciones/borradores.ts` writes, and `app/(app)/biblioteca/temas/borradores/acciones.ts` holds the server actions, which redirect with a `?aviso=` note that `TrasElAviso` takes out of the address.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (RLS, column grants, a security-definer function), Zod 4, Vitest (unit, and integration against local Supabase), Playwright (projects `app` phone and `escritorio`), Biome (safe mode only), Tailwind v4 semantic tokens, Phosphor icons through `ICONO`.

---

## Read before starting

- Spec (approved by Federico, 2026-11-05): `docs/superpowers/specs/2026-11-05-borradores-de-pilares-design.md`. Coni's source: `docs/pedido-coni-2026-10-31/respuesta-coni-temas-pilares-2026-11-04.md`, part 1, sections 3 and 7. What 15a and 15b left: `docs/superpowers/plans/2026-11-04-pilares-por-red.md`, `docs/superpowers/plans/2026-11-04-temas-por-red.md` (their Decisions, and 15b's override: the row is Instagram, then LinkedIn).
- Work in the worktree `/Users/fede/Projects/estudio-coni/.worktrees/borradores-de-pilares` (branch `feat/borradores-de-pilares`). Every command below runs from that directory.
- Local stack: `pnpm db:start` once. After writing or changing the migration: `pnpm db:reset` (rebuilds the local DB from `supabase/migrations` + `supabase/seed.sql`) then `pnpm db:types` (regenerates `lib/supabase/database.types.ts`; never edit that file by hand).
- Test commands: `pnpm test:run <files>` (unit), `pnpm test:db <files>` (integration against the local DB, files one after another; `como(sesion, fn)` in `tests/integration/db.ts` runs inside a transaction that is always rolled back; `fallaCon` returns a statement's error behind a savepoint), `pnpm test:e2e` (Playwright; `--project=app` phone, `--project=escritorio` desktop; one worker).
- `pnpm type` (next typegen + tsc), `pnpm lint` (Biome check; to fix formatting use `pnpm check`, never `--unsafe`; after any Biome fix, `head -1` of every client file you touched still prints `"use client"`).
- Code rules: TDD strict, no `any`, no `@ts-expect-error`, no silent catch. Copy for Coni: Spanish (Chile), "tú", **no em dashes** (`tests/unit/diseno-reglas.test.ts` scans `app/` and `components/`), semantic Tailwind tokens only (no hex), Phosphor icons from `@phosphor-icons/react/dist/ssr` in server modules and `@phosphor-icons/react` in client ones, sized with `ICONO`. Targets use `min-h-objetivo` (44 px).
- No code may name a pillar slug (`tests/unit/sin-slugs-de-pilar.test.ts` scans `lib`, `app`, `components`, `trigger`, `scripts`). Tests, the E2E scene and SQL may.
- Patterns to copy:
  - a Coni-only definer RPC with named errors: `supabase/migrations/20261104000200_cambiar_pilares_de_tema.sql:69-84`;
  - a slug from a name with a retry: `crear_categoria` in `supabase/migrations/20261003000100_ingesta.sql:129-162`;
  - a table sealed by a trigger, read by Coni and WAV: `supabase/migrations/20261017000300_metricas_linkedin.sql`;
  - an action that checks Coni first and turns the database's refusals into her words: `cambiarPilaresDeTema` in `lib/acciones/biblioteca.ts:444-466`;
  - a write that row level security answers with "no rows": `recordarRed` in `lib/acciones/biblioteca.ts:472-490`;
  - a server action that redirects after success: `unirAutoresAccion` in `app/(app)/biblioteca/acciones.ts:136-143`;
  - a client form with a pure validator, field errors and `useAccion`: `app/(app)/metricas/numeros-de-linkedin.tsx` (and `Campo` in `app/(app)/biblioteca/campo.tsx`);
  - a note said once after a redirect: `AvisoDeIdeas` + `TrasElAviso` in `app/(app)/biblioteca/`;
  - an inline destructive confirmation: `BotonQuePregunta` (`app/(app)/biblioteca/boton-que-pregunta.tsx`) with `ConfirmacionEnLinea` `trato="destructivo"`;
  - a page test that walks the element tree: `tests/unit/biblioteca-pagina-temas.test.tsx`;
  - an action tested as Coni and WAV with real clients: `tests/integration/acciones-pilares-de-tema.test.ts`.
- Commit after every task with `git add <files>` and `git commit -m "<English imperative sentence>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Do not push, do not run anything against production.

## Decisions where the spec is silent

1. **Errors are `Falla` constants in `lib/acciones/borradores.ts`, not entries of `PALABRAS`.** The spec says errors are shown "in words (`PALABRAS`)"; `PALABRAS` (`lib/dominio/biblioteca/palabras.ts`) only holds Coni's vocabulary replacements (`papel`, `afirmaciones`...). Every Biblioteca action writes its refusals as `Falla` messages next to the action (`TEMA_INEXISTENTE`, `PILARES_QUE_NO_CALZAN`), so these follow that pattern. The form's own messages live in the domain module.
2. **A name in use is checked both ways, normalized.** `categorias.nombre_normalizado` only covers `nombre`; there is no normalized short name. The RPC compares the draft's name and short name, each normalized like `nombre_normalizado` (`unaccent_inmutable(lower(btrim(...)))`), with every row's `nombre_normalizado` and normalized `nombre_corto`, of any state. A draft whose name equals its own short name (as "Game Over Impostora") is fine.
3. **Approvals run one at a time** (`pg_advisory_xact_lock`), so the slug, the `orden` and the name check cannot race.
4. **Slug:** the normalized name, every run of non `[a-z0-9]` as `-`, cut at 60 characters, trimmed of `-`; `pilar` if nothing is left; `-2`, `-3`... on collision with any `categorias.slug`.
5. **`orden`** is one more than the highest `orden` of every pillar row of that network (active, retired and the layer). On Instagram it lands after the Capa TDAH's number; the row still puts layers last by rule (`pilaresDeLaRed`).
6. **`p_pesos` is `{"<desde YYYY-MM-DD>": {"<pilar_id>" | "nuevo": peso}}`.** Stage keys are dates written `YYYY-MM-DD`; today's key is today's date in Chile (`current_date` at America/Santiago, as the page computes it with `diaLocal`). A stage key that is not today or an existing later `desde` of the network is `etapa_invalida`; a page opened before midnight, or before someone changed the stages, gets it and says "recarga". A stage may be absent (the new pillar still gets the draft's weight there). Any pillar key other than `"nuevo"` that is not an active, non-layer pillar of the draft's network (the other network's, the Capa TDAH, a retired pillar, a non-id) is `pilar_de_otra_red`. Values must be JSON objects of JSON numbers over 0 and up to 100 after rounding to two decimals, else `peso_invalido` (also for a `p_pesos` that is not an object). A missing draft is `borrador_inexistente`. WAV gets `sin_permiso` (42501) like every Coni-only RPC; the app refuses WAV before with `ERROR_SOLO_CONI`. Checks run in this order: weights' shape, draft, stages, pillars, name.
7. **The form sends every weight of every stage; the RPC writes stage by stage, oldest first,** only the weights that differ from the pillar's effective weight on that stage's date at that moment (and always the new pillar's). Oldest first matters: if she lowers a pillar today and keeps its old value in a later stage where it had no row, today's write would otherwise silently carry into that stage; compared after today's write, the later stage gets its own row with the value the screen showed. Each stage lists the pillars `calcularPesosDeRed` gives on its date (every active pillar has a weight; every approved one gets one in every stage).
8. **Stages (Federico, 2026-11-05, option A).** A network's stages are today plus every later `desde` its active, non-layer pillars have (LinkedIn's seed: 2027-01-01 and 2027-07-01 while they are ahead; Instagram: none). The approval screen shows one block per stage ("Hoy", "Desde el 1 de enero de 2027"...), columns from md up and blocks one under another on the phone, each with every pillar and the new one (prefilled with the draft's weight), its own live total (an `<output>`) and its own warning when it is not 100, which never blocks. Approval writes today's changed weights and the new pillar's row of today, and for each later stage the new pillar's row on that `desde` plus the changed weights on that `desde` (replacing that day's row). Nothing is deleted.
9. **`pesosDeRed` grows an `id` per pillar** (the editor sends ids) and **`etapasDeRed(db, red, hoy)`** (`calcularEtapasDeRed` in `lib/dominio/pilares.ts`) gives today's weights and each later stage's. Additive; `pesosDeRed`'s two tests follow.
10. **One edit route for both kinds:** `/biblioteca/temas/borradores/[id]/editar` looks the id up among pillar drafts, then network drafts (uuids never collide). A decided or missing draft is not found, as is `/aprobar` of a network draft.
11. **Borradores lists only drafts in `borrador`**: pillar drafts grouped by network in `REDES` order (LinkedIn, Instagram, as every list but the Temas row), then network drafts, each oldest first. Approved and discarded drafts leave the screen and stay in the tables for WAV.
12. **Notes travel in one `?aviso=` parameter** with five fixed keys, said by `AvisoDeIdeas` and taken out of the address by `TrasElAviso` (its `parametro` grows `"aviso"`). Saving a pillar draft returns to Temas on its network; saving a network draft returns to Temas on the stored network; edits and discards return to Borradores; approval returns to Temas with the new pillar chosen and the note "Aprobé el pilar. Ya aparece en Temas." Every server action redirects with `"replace"`, so Back from the destination skips the form.
13. **Lengths:** name 120, short name 40, definition 1500, network name 60, each network note 4000. The database checks them (and trimmed, non-empty text); the form says them in her words. A weight is typed "15", "12,5" or "12.5" (two decimals at most).
14. **The "+" is a Plus icon;** the accessible names are "Agregar pilar" and "Agregar red". Both are chips outlined with a dashed border and no relief (they open a form, they filter nothing) and never carry `aria-current`. "Agregar pilar" is a list item with a stable key inside the pillar track that 15b keys by network only, so choosing a pillar keeps the same track, the same "Agregar pilar" node and the keyboard focus.
15. **"Borradores · N" is a plain link right after the row,** outside the "Filtrar temas" group (it filters nothing), hidden at zero.
16. **No name check when a draft is saved.** The spec puts it at approval; the draft form saves any name. The approval screen tells her if it is taken.
17. **Conexión asks for no passwords** in its hint: it is a plain text column WAV reads by SQL.
18. **The server actions live in `app/(app)/biblioteca/temas/borradores/acciones.ts`**, not in the Biblioteca's `acciones.ts` (one concern per file); `exigirConi` of `lib/acciones/biblioteca.ts` is exported so the new actions reuse it.
19. **Test cleanup restores the seed weights.** Approvals through real clients commit (integration action tests, E2E). `limpiarBorradores()` (`tests/integration/limpiar-borradores.ts`) deletes every draft and every pillar a draft became, and puts `pilar_pesos` back to the migration's 15 seed rows; `vaciarBiblioteca` calls it, so every scene and the run's teardown start clean.
20. **The visual scene approves on Instagram,** which has no later stage at any date, so its approval baseline shows only "Hoy". The LinkedIn stage editing is covered by integration and non-visual E2E tests that seed their own later stage at today + 400 days (always ahead of the seed's 2027 stages, so the tests name it by its own date and never count stages).

## File structure

**Create**

| File | Responsibility |
|---|---|
| `supabase/migrations/20261105000100_borradores_de_pilares.sql` | The two draft tables, their trigger, grants and policies, and `aprobar_borrador_de_pilar` |
| `lib/dominio/biblioteca/borradores.ts` | Pure: draft types, lengths, routes, notes, the two forms' validation, the weights editor |
| `lib/datos/borradores.ts` | `contarBorradores`, `listarBorradores`, `leerBorrador` |
| `lib/acciones/borradores.ts` | Schemas, refusals in her words, save / edit / discard / approve |
| `app/(app)/biblioteca/temas/borradores/acciones.ts` | Server actions: session, refresh, redirect with the note |
| `app/(app)/biblioteca/temas/enlace-a-borradores.tsx` | Server: "Borradores · N" |
| `app/(app)/biblioteca/temas/formulario-de-pilar.tsx` | Client: the pillar draft form (new and edit) |
| `app/(app)/biblioteca/temas/formulario-de-red.tsx` | Client: the network draft form (new and edit) |
| `app/(app)/biblioteca/temas/pilar-nuevo/page.tsx` | Page: a new pillar draft of the network in the address |
| `app/(app)/biblioteca/temas/red-nueva/page.tsx` | Page: a new network draft |
| `app/(app)/biblioteca/temas/borradores/page.tsx` | Page: the drafts |
| `app/(app)/biblioteca/temas/borradores/tarjetas-de-borrador.tsx` | Server: a pillar draft's and a network draft's card |
| `app/(app)/biblioteca/temas/borradores/boton-descartar.tsx` | Client: Descartar with its inline confirmation |
| `app/(app)/biblioteca/temas/borradores/[id]/editar/page.tsx` | Page: either form, prefilled |
| `app/(app)/biblioteca/temas/borradores/[id]/aprobar/page.tsx` | Page: the approval of a pillar draft |
| `app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar.tsx` | Client: the weights editor and "Aprobar pilar" |
| `tests/integration/borradores-esquema.test.ts` | The tables, their policies and checks |
| `tests/integration/aprobar-borrador.test.ts` | The RPC |
| `tests/integration/limpiar-borradores.ts` | Test helper: drafts out, approved pillars out, seed weights back |
| `tests/integration/acciones-borradores.test.ts` | Actions and readers with real Coni and WAV clients |
| `tests/unit/biblioteca-borradores.test.ts` | The pure module |
| `tests/unit/biblioteca-acciones-borradores.test.ts` | The server actions |
| `tests/unit/biblioteca-formulario-de-pilar.test.tsx` | `FormularioDePilar` |
| `tests/unit/biblioteca-formulario-de-red.test.tsx` | `FormularioDeRed` |
| `tests/unit/biblioteca-pagina-borradores.test.tsx` | The Borradores, editar and aprobar pages, the cards, `BotonDescartar` |
| `tests/unit/biblioteca-aprobar-pilar.test.tsx` | `AprobarPilar` |
| `tests/e2e/biblioteca-borradores.spec.ts` | Coni's acceptance line on the phone, network drafts, edit and discard, axe, large text |
| `tests/e2e/biblioteca-borradores.escritorio.ts` | The approval on the computer, axe, the two desktop baselines |

**Modify**

| File | Change |
|---|---|
| `lib/supabase/database.types.ts` | Regenerated (two tables, one function) |
| `lib/dominio/pilares.ts` | `PesosDeRed`: `id` per pillar; `calcularEtapasDeRed` |
| `lib/datos/pilares.ts` | `etapasDeRed` |
| `lib/acciones/biblioteca.ts` | `exigirConi` exported |
| `app/(app)/biblioteca/temas/fila-de-temas.tsx` | "Agregar red" closes the networks; "Agregar pilar" before the layers |
| `app/(app)/biblioteca/temas/page.tsx` | Counts drafts, shows "Borradores · N", says a form's note |
| `app/(app)/biblioteca/tras-el-aviso.tsx` | `parametro` also takes `"aviso"` |
| `tests/unit/pilares.test.ts`, `tests/integration/datos-pilares.test.ts` | `pesosDeRed`'s `id`, the network's stages |
| `tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx`, `tests/unit/biblioteca-pagina-temas.test.tsx`, `tests/unit/biblioteca-tras-el-aviso.test.tsx` | The row's new links, the page's count and note |
| `tests/e2e/biblioteca-escena.ts` | `sembrarBorradores`, `BORRADOR_DE_INSTAGRAM`, `RED_EN_BORRADOR`; `vaciarBiblioteca` cleans drafts |
| `tests/e2e/biblioteca-temas-por-red.spec.ts` | The pillar lists include "Agregar pilar" |
| `tests/e2e/visual.spec.ts` | The three new phone screens |
| `tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png`, `tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-temas-escritorio-escritorio-darwin.png` | Retaken only in Task 15, after Federico's OK |

---

# Phase 1: data

### Task 1: The draft tables

**Files:**
- Create: `tests/integration/borradores-esquema.test.ts`
- Create: `supabase/migrations/20261105000100_borradores_de_pilares.sql`
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/borradores-esquema.test.ts`:

```ts
import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoServicio, fallaCon, pool } from "./db"

afterAll(async () => {
  await pool.end()
})

const SUFIJO = randomUUID().slice(0, 8)

async function borradorDePilar(c: pg.PoolClient): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
     values ('linkedin', $1, $2, 'Una definición.', 10) returning id`,
    [`Pilar de prueba ${SUFIJO}`, `Prueba ${SUFIJO}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el borrador de pilar")
  return id
}

async function borradorDeRed(c: pg.PoolClient): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.borradores_de_red (nombre) values ($1) returning id",
    [`Red ${SUFIJO}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el borrador de red")
  return id
}

describe("borradores_de_pilar", () => {
  it("Coni saves a draft sealed with her and no decision, and edits it", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDePilar(c)
      const { rows } = await c.query(
        "select estado, creado_por, decidido_en, pilar_id from public.borradores_de_pilar where id = $1",
        [id],
      )
      expect(rows).toEqual([{ estado: "borrador", creado_por: CONI, decidido_en: null, pilar_id: null }])
      const editado = await c.query(
        "update public.borradores_de_pilar set nombre_corto = 'Otro corto', peso = 12.5 where id = $1",
        [id],
      )
      expect(editado.rowCount).toBe(1)
    })
  })

  it("WAV reads it and cannot write it, nobody deletes it, and anyone else sees nothing", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDePilar(c)
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.borradores_de_pilar where id = $1", [id])).rowCount).toBe(1)
      const deWav = await c.query("update public.borradores_de_pilar set nombre = 'De WAV' where id = $1", [id])
      expect(deWav.rowCount).toBe(0)
      const insertado = await fallaCon(
        c,
        `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
         values ('linkedin', 'De WAV', 'WAV', 'Definición.', 5)`,
      )
      expect(insertado.code).toBe("42501")
      for (const sesion of [comoConi, comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        const borrado = await fallaCon(c, "delete from public.borradores_de_pilar where id = $1", [id])
        expect(borrado.code).toBe("42501")
      }
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.borradores_de_pilar where id = $1", [id])).rowCount).toBe(0)
    })
  })

  it("a draft is approved only by the RPC, and once discarded gets its date and cannot be edited or brought back", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDePilar(c)
      // Row level security or the `aprobado_con_pilar` check, whichever Postgres runs first.
      const aprobado = await fallaCon(c, "update public.borradores_de_pilar set estado = 'aprobado' where id = $1", [id])
      expect(["42501", "23514"]).toContain(aprobado.code)
      const conPilar = await fallaCon(
        c,
        "update public.borradores_de_pilar set pilar_id = (select id from public.categorias limit 1) where id = $1",
        [id],
      )
      expect(conPilar.code).toBe("42501")
      await c.query("update public.borradores_de_pilar set estado = 'descartado' where id = $1", [id])
      const { rows } = await c.query<{ decidido: boolean }>(
        "select decidido_en is not null as decidido from public.borradores_de_pilar where id = $1",
        [id],
      )
      expect(rows).toEqual([{ decidido: true }])
      expect(
        (await c.query("update public.borradores_de_pilar set estado = 'borrador' where id = $1", [id])).rowCount,
      ).toBe(0)
      expect(
        (await c.query("update public.borradores_de_pilar set nombre = 'Otra vez' where id = $1", [id])).rowCount,
      ).toBe(0)
    })
  })

  it("keeps the network one of the two, names trimmed, not empty and short enough, and the weight over 0 and up to 100", async () => {
    await como(comoConi, async (c) => {
      const casos: [string, string, string, number][] = [
        ["youtube", "Nombre", "Corto", 10],
        ["linkedin", "", "Corto", 10],
        ["linkedin", " Nombre", "Corto", 10],
        ["linkedin", "Nombre", "x".repeat(41), 10],
        ["linkedin", "Nombre", "Corto", 0],
        ["linkedin", "Nombre", "Corto", 100.01],
      ]
      for (const [red, nombre, corto, peso] of casos) {
        const error = await fallaCon(
          c,
          `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
           values ($1, $2, $3, 'Definición.', $4)`,
          [red, nombre, corto, peso],
        )
        expect(error.code, `${red} ${nombre} ${corto} ${peso}`).toBe("23514")
      }
    })
  })
})

describe("borradores_de_red", () => {
  it("Coni saves a network with empty notes, edits and discards it; then it is closed", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDeRed(c)
      const { rows } = await c.query(
        "select manual, receta, conexion, estado, creado_por from public.borradores_de_red where id = $1",
        [id],
      )
      expect(rows).toEqual([{ manual: "", receta: "", conexion: "", estado: "borrador", creado_por: CONI }])
      expect(
        (await c.query("update public.borradores_de_red set manual = 'Videos cortos.' where id = $1", [id])).rowCount,
      ).toBe(1)
      const aprobada = await fallaCon(c, "update public.borradores_de_red set estado = 'aprobado' where id = $1", [id])
      expect(["42501", "23514"]).toContain(aprobada.code)
      await c.query("update public.borradores_de_red set estado = 'descartado' where id = $1", [id])
      expect(
        (await c.query("update public.borradores_de_red set nombre = 'Otra' where id = $1", [id])).rowCount,
      ).toBe(0)
    })
  })

  it("WAV reads it and cannot write it; nobody deletes it", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDeRed(c)
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.borradores_de_red where id = $1", [id])).rowCount).toBe(1)
      expect((await c.query("update public.borradores_de_red set nombre = 'De WAV' where id = $1", [id])).rowCount).toBe(0)
      expect((await fallaCon(c, "insert into public.borradores_de_red (nombre) values ('De WAV')")).code).toBe("42501")
      for (const sesion of [comoConi, comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        expect((await fallaCon(c, "delete from public.borradores_de_red where id = $1", [id])).code).toBe("42501")
      }
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/borradores-esquema.test.ts`
Expected: FAIL: `relation "public.borradores_de_pilar" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261105000100_borradores_de_pilares.sql`:

```sql
-- Pillars per network, part 15c (spec 2026-11-05): "+ Agregar pilar" and "+ Agregar red" save drafts that Coni
-- approves later, as a second step. Drafts live in their own tables, so nothing that reads `categorias` (the engine,
-- the pillar proposals, "Cambiar pilares", the Temas row) ever sees one. Additive: no existing row changes.

create table public.borradores_de_pilar (
  id uuid primary key default gen_random_uuid(),
  red text not null check (red in ('linkedin', 'instagram')),
  -- Trimmed and not empty; the lengths are the form's (`LARGOS` in lib/dominio/biblioteca/borradores.ts).
  nombre text not null check (nombre = btrim(nombre) and nombre <> '' and char_length(nombre) <= 120),
  nombre_corto text not null
    check (nombre_corto = btrim(nombre_corto) and nombre_corto <> '' and char_length(nombre_corto) <= 40),
  descripcion text not null
    check (descripcion = btrim(descripcion) and descripcion <> '' and char_length(descripcion) <= 1500),
  peso numeric(5, 2) not null check (peso > 0 and peso <= 100),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'descartado')),
  -- The pillar it became: only an approved draft has one.
  pilar_id uuid references public.categorias (id),
  creado_por uuid references auth.users (id),
  creado_en timestamptz not null default now(),
  decidido_en timestamptz,
  constraint aprobado_con_pilar check ((estado = 'aprobado') = (pilar_id is not null)),
  constraint decidido_con_fecha check ((estado = 'borrador') = (decidido_en is null))
);

-- A network is development work (manual, recipe, connection, publishing): its draft only keeps her idea and is never
-- approved here. WAV reads it by SQL when the network is built.
create table public.borradores_de_red (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (nombre = btrim(nombre) and nombre <> '' and char_length(nombre) <= 60),
  manual text not null default '' check (manual = btrim(manual) and char_length(manual) <= 4000),
  receta text not null default '' check (receta = btrim(receta) and char_length(receta) <= 4000),
  conexion text not null default '' check (conexion = btrim(conexion) and char_length(conexion) <= 4000),
  estado text not null default 'borrador' check (estado in ('borrador', 'descartado')),
  creado_por uuid references auth.users (id),
  creado_en timestamptz not null default now(),
  decidido_en timestamptz,
  constraint decidido_con_fecha check ((estado = 'borrador') = (decidido_en is null))
);

-- Who wrote a draft, and when it was approved or discarded, are sealed here, never sent.
create function public.sellar_borrador() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
  elsif new.estado is distinct from old.estado then
    new.decidido_en := now();
  end if;
  return new;
end $$;

create trigger sellar before insert or update on public.borradores_de_pilar
  for each row execute function public.sellar_borrador();
create trigger sellar before insert or update on public.borradores_de_red
  for each row execute function public.sellar_borrador();

alter table public.borradores_de_pilar enable row level security;
alter table public.borradores_de_red enable row level security;

-- Coni writes the fields of a draft and its state; who, when and the pillar it became are not hers to send. Nobody
-- deletes: discarding is a state, so the history stays.
revoke all on public.borradores_de_pilar, public.borradores_de_red from anon, authenticated, service_role;
grant select on public.borradores_de_pilar, public.borradores_de_red to authenticated, service_role;
grant insert (red, nombre, nombre_corto, descripcion, peso) on public.borradores_de_pilar to authenticated;
grant update (nombre, nombre_corto, descripcion, peso, estado) on public.borradores_de_pilar to authenticated;
grant insert (nombre, manual, receta, conexion) on public.borradores_de_red to authenticated;
grant update (nombre, manual, receta, conexion, estado) on public.borradores_de_red to authenticated;

create policy "coni y wav leen borradores de pilar" on public.borradores_de_pilar for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni guarda borradores de pilar" on public.borradores_de_pilar for insert to authenticated
  with check (public.es_coni() and estado = 'borrador');
-- Only a draft still in `borrador` changes, and only to `borrador` or `descartado`: approving is the RPC's.
create policy "coni edita o descarta borradores de pilar" on public.borradores_de_pilar for update to authenticated
  using (public.es_coni() and estado = 'borrador')
  with check (public.es_coni() and estado in ('borrador', 'descartado'));

create policy "coni y wav leen borradores de red" on public.borradores_de_red for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni guarda borradores de red" on public.borradores_de_red for insert to authenticated
  with check (public.es_coni() and estado = 'borrador');
create policy "coni edita o descarta borradores de red" on public.borradores_de_red for update to authenticated
  using (public.es_coni() and estado = 'borrador')
  with check (public.es_coni() and estado in ('borrador', 'descartado'));

create trigger auditar after insert or update or delete on public.borradores_de_pilar
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.borradores_de_red
  for each row execute function public.registrar_evento();
```

- [ ] **Step 4: Rebuild the local DB, regenerate the types, run the test**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/borradores-esquema.test.ts`
Expected: PASS (6 tests). `git diff --stat lib/supabase/database.types.ts` shows the two tables added.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000100_borradores_de_pilares.sql lib/supabase/database.types.ts \
  tests/integration/borradores-esquema.test.ts
git commit -m "Add pillar and network drafts that only Coni writes and nobody deletes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `aprobar_borrador_de_pilar`

**Files:**
- Create: `tests/integration/aprobar-borrador.test.ts`
- Modify: `supabase/migrations/20261105000100_borradores_de_pilares.sql` (append; the migration is not on production yet, so it stays the one additive migration)
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/aprobar-borrador.test.ts`:

```ts
import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, fallaCon, pool } from "./db"

afterAll(async () => {
  await pool.end()
})

const SUFIJO = randomUUID().slice(0, 8)
const HOY = "(now() at time zone 'America/Santiago')::date"

async function hoy(c: pg.PoolClient, dias = 0): Promise<string> {
  const { rows } = await c.query<{ dia: string }>(`select (${HOY} + $1::int)::text as dia`, [dias])
  const dia = rows[0]?.dia
  if (!dia) throw new Error("No pude leer la fecha de hoy")
  return dia
}

async function borrador(
  c: pg.PoolClient,
  red: "linkedin" | "instagram",
  nombre: string,
  nombreCorto: string,
  peso = 10,
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
     values ($1, $2, $3, 'Una definición del pilar.', $4) returning id`,
    [red, nombre, nombreCorto, peso],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el borrador ${nombre}`)
  return id
}

async function idDe(c: pg.PoolClient, slug: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.categorias where slug = $1", [slug])
  const id = rows[0]?.id
  if (!id) throw new Error(`No existe la categoría ${slug}`)
  return id
}

/**
 * A later stage of LinkedIn of the test's own, 400 days ahead: after the seed's 2027 stages at any date, so no test
 * depends on today versus 2027 (decision 20). Only the pillars named get a row on it, at 25.
 */
async function etapaPropia(c: pg.PoolClient, slugs: readonly string[]): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ desde: string }>(
    `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
     select id, red, es_capa, ${HOY} + 400, 25 from public.categorias where slug = any($1::text[])
     returning desde::text as desde`,
    [slugs],
  )
  await asumir(c, comoConi)
  const desde = rows[0]?.desde
  if (!desde) throw new Error("No se creó la etapa propia")
  return desde
}

/** Today and every later `desde` of LinkedIn's active pillars, as the RPC computes them. */
async function etapasDeLinkedin(c: pg.PoolClient): Promise<string[]> {
  const { rows } = await c.query<{ desde: string }>(
    `select s.desde::text as desde from (
       select ${HOY} as desde
       union
       select w.desde from public.pilar_pesos w join public.categorias c on c.id = w.pilar_id
       where c.es_pilar and c.activa and not c.es_capa and c.red = 'linkedin' and w.desde > ${HOY}
     ) s order by s.desde`,
  )
  return rows.map((fila) => fila.desde)
}

async function aprobar(c: pg.PoolClient, id: string, pesos: unknown): Promise<string> {
  const { rows } = await c.query<{ pilar: string }>(
    "select public.aprobar_borrador_de_pilar($1, $2::jsonb) as pilar",
    [id, JSON.stringify(pesos)],
  )
  const pilar = rows[0]?.pilar
  if (!pilar) throw new Error("La aprobación no devolvió el pilar")
  return pilar
}

const rechazo = (c: pg.PoolClient, id: string, pesos: unknown) =>
  fallaCon(c, "select public.aprobar_borrador_de_pilar($1, $2::jsonb)", [id, JSON.stringify(pesos)])

/** The rows of a pillar written exactly on `desde`. */
async function filasEn(c: pg.PoolClient, pilar: string, desde: string): Promise<number[]> {
  const { rows } = await c.query<{ peso: number }>(
    "select peso::float8 as peso from public.pilar_pesos where pilar_id = $1 and desde = $2::date",
    [pilar, desde],
  )
  return rows.map((fila) => fila.peso)
}

/** A pillar's effective weight on a date: its row with the latest `desde` on or before it. */
async function pesoEn(c: pg.PoolClient, pilar: string, fecha: string): Promise<number> {
  const { rows } = await c.query<{ peso: number }>(
    `select peso::float8 as peso from public.pilar_pesos where pilar_id = $1 and desde <= $2::date
     order by desde desc limit 1`,
    [pilar, fecha],
  )
  const peso = rows[0]?.peso
  if (peso === undefined) throw new Error(`El pilar ${pilar} no tiene peso el ${fecha}`)
  return peso
}

async function filasDePeso(c: pg.PoolClient, pilar: string): Promise<number> {
  const { rows } = await c.query<{ n: number }>(
    "select count(*)::int as n from public.pilar_pesos where pilar_id = $1",
    [pilar],
  )
  return rows[0]?.n ?? 0
}

describe("aprobar_borrador_de_pilar", () => {
  it("turns the draft into an active pillar of its network, next in order, with a slug from its name", async () => {
    await como(comoConi, async (c) => {
      const { rows: maximo } = await c.query<{ orden: number }>(
        "select max(orden)::int as orden from public.categorias where es_pilar and red = 'linkedin'",
      )
      const id = await borrador(c, "linkedin", `Liderazgo sereno ${SUFIJO}`, `Sereno ${SUFIJO}`)
      const pilar = await aprobar(c, id, {})
      const { rows } = await c.query(
        `select slug, nombre, nombre_corto, descripcion, red, orden::int as orden, es_pilar, activa, es_capa
         from public.categorias where id = $1`,
        [pilar],
      )
      expect(rows).toEqual([
        {
          slug: `liderazgo-sereno-${SUFIJO}`,
          nombre: `Liderazgo sereno ${SUFIJO}`,
          nombre_corto: `Sereno ${SUFIJO}`,
          descripcion: "Una definición del pilar.",
          red: "linkedin",
          orden: (maximo[0]?.orden ?? 0) + 1,
          es_pilar: true,
          activa: true,
          es_capa: false,
        },
      ])
      const { rows: decidido } = await c.query(
        "select estado, pilar_id, decidido_en is not null as decidido from public.borradores_de_pilar where id = $1",
        [id],
      )
      expect(decidido).toEqual([{ estado: "aprobado", pilar_id: pilar, decidido: true }])
    })
  })

  it("writes today's weight for the new pillar and only for the pillars whose weight changed; «nuevo» overrides the draft's", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const diagnostico = await idDe(c, "diagnostico-doble")
      const bienestar = await idDe(c, "bienestar-e-impacto")
      const filasDeBienestar = await filasDePeso(c, bienestar)
      const id = await borrador(c, "linkedin", `Con pesos ${SUFIJO}`, `Pesos ${SUFIJO}`, 10)
      const pilar = await aprobar(c, id, {
        [dia]: { [diagnostico]: 20, [bienestar]: await pesoEn(c, bienestar, dia), nuevo: 12 },
      })
      expect(await filasEn(c, pilar, dia)).toEqual([12])
      expect(await filasEn(c, diagnostico, dia)).toEqual([20])
      expect(await filasDePeso(c, bienestar)).toBe(filasDeBienestar)
    })
  })

  it("gives the new pillar a row on today and on every later stage of its network, the draft's weight where none is sent", async () => {
    await como(comoConi, async (c) => {
      await etapaPropia(c, ["diagnostico-doble", "bienestar-e-impacto", "psicologia-en-la-mesa", "mujeres-lideres"])
      const etapas = await etapasDeLinkedin(c)
      expect(etapas.length).toBeGreaterThanOrEqual(2)
      const pilar = await aprobar(c, await borrador(c, "linkedin", `Etapas ${SUFIJO}`, `Etapas ${SUFIJO}`, 10), {})
      const { rows } = await c.query<{ desde: string; peso: number }>(
        "select desde::text as desde, peso::float8 as peso from public.pilar_pesos where pilar_id = $1 order by desde",
        [pilar],
      )
      expect(rows).toEqual(etapas.map((desde) => ({ desde, peso: 10 })))
    })
  })

  it("writes a later stage's changes on its date, replacing that day's row, and keeps there the value the screen showed", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      // Mujeres líderes gets no row on the stage: its weight there comes from an earlier row.
      const etapa = await etapaPropia(c, ["diagnostico-doble", "bienestar-e-impacto", "psicologia-en-la-mesa"])
      const diagnostico = await idDe(c, "diagnostico-doble")
      const mujeres = await idDe(c, "mujeres-lideres")
      const mujeresEnLaEtapa = await pesoEn(c, mujeres, etapa)
      const pilar = await aprobar(c, await borrador(c, "linkedin", `Reparto ${SUFIJO}`, `Reparto ${SUFIJO}`, 10), {
        [dia]: { [diagnostico]: 20, [mujeres]: 5 },
        [etapa]: { [diagnostico]: 15, [mujeres]: mujeresEnLaEtapa, nuevo: 12 },
      })
      expect(await filasEn(c, diagnostico, dia)).toEqual([20])
      expect(await filasEn(c, diagnostico, etapa)).toEqual([15])
      expect(await pesoEn(c, mujeres, dia)).toBe(5)
      // Lowering it today must not carry into the stage, where she kept its value (decision 7).
      expect(await pesoEn(c, mujeres, etapa)).toBe(mujeresEnLaEtapa)
      expect(await filasEn(c, pilar, dia)).toEqual([10])
      expect(await filasEn(c, pilar, etapa)).toEqual([12])
    })
  })

  it("replaces a second change of the same day, and approves a draft only once", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const diagnostico = await idDe(c, "diagnostico-doble")
      const uno = await borrador(c, "linkedin", `Uno ${SUFIJO}`, `Uno ${SUFIJO}`)
      const dos = await borrador(c, "linkedin", `Dos ${SUFIJO}`, `Dos ${SUFIJO}`)
      await aprobar(c, uno, { [dia]: { [diagnostico]: 20 } })
      await aprobar(c, dos, { [dia]: { [diagnostico]: 18 } })
      expect(await filasEn(c, diagnostico, dia)).toEqual([18])
      const otraVez = await rechazo(c, uno, {})
      expect([otraVez.code, otraVez.message]).toEqual(["22023", "borrador_ya_decidido"])
      const descartado = await borrador(c, "linkedin", `Tres ${SUFIJO}`, `Tres ${SUFIJO}`)
      await c.query("update public.borradores_de_pilar set estado = 'descartado' where id = $1", [descartado])
      const tarde = await rechazo(c, descartado, {})
      expect([tarde.code, tarde.message]).toEqual(["22023", "borrador_ya_decidido"])
    })
  })

  it("accepts a network whose weights no longer add up to 100", async () => {
    await como(comoConi, async (c) => {
      await aprobar(c, await borrador(c, "linkedin", `Sobra ${SUFIJO}`, `Sobra ${SUFIJO}`, 10), {})
      const { rows } = await c.query<{ total: number }>(
        `select sum(w.peso)::float8 as total
         from public.categorias c
         cross join lateral (
           select p.peso from public.pilar_pesos p
           where p.pilar_id = c.id and p.desde <= ${HOY} order by p.desde desc limit 1
         ) w
         where c.es_pilar and c.activa and not c.es_capa and c.red = 'linkedin'`,
      )
      expect(rows[0]?.total).toBe(110)
    })
  })

  it("refuses a stage that is not today or a later date the network already has", async () => {
    await como(comoConi, async (c) => {
      const etapa = await etapaPropia(c, ["diagnostico-doble"])
      const id = await borrador(c, "linkedin", `Fechas ${SUFIJO}`, `Fechas ${SUFIJO}`)
      const { rows } = await c.query<{ siguiente: string }>("select ($1::date + 1)::text as siguiente", [etapa])
      for (const clave of [await hoy(c, -1), "2026-11-04", rows[0]?.siguiente ?? "", "hoy", "2026-13-45"]) {
        const error = await rechazo(c, id, { [clave]: { nuevo: 10 } })
        expect([error.code, error.message], clave).toEqual(["22023", "etapa_invalida"])
      }
    })
  })

  it("refuses a name or short name any category already has, retired or not, whatever its case and accents", async () => {
    await como(comoConi, async (c) => {
      const casos: [string, string][] = [
        ["PAREJA Y CONVERSACION", `Pareja ${SUFIJO}`],
        [`Límites nuevos ${SUFIJO}`, "LIMITES"],
        [`Categoría ${SUFIJO}`, "General"],
        ["Diagnóstico doble", `DD ${SUFIJO}`],
      ]
      for (const [nombre, corto] of casos) {
        const error = await rechazo(c, await borrador(c, "linkedin", nombre, corto), {})
        expect([error.code, error.message], `${nombre} / ${corto}`).toEqual(["23505", "nombre_en_uso"])
      }
    })
  })

  it("takes a slug with a number when its name's slug is taken", async () => {
    await como(comoConi, async (c) => {
      const pilar = await aprobar(c, await borrador(c, "linkedin", "Diagnóstico-doble", `Doble ${SUFIJO}`), {})
      const { rows } = await c.query("select slug from public.categorias where id = $1", [pilar])
      expect(rows).toEqual([{ slug: "diagnostico-doble-2" }])
    })
  })

  it("refuses a weight for a pillar of the other network, a layer, a retired pillar or no pillar at all", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const deLinkedin = await borrador(c, "linkedin", `Cruce ${SUFIJO}`, `Cruce ${SUFIJO}`)
      const deInstagram = await borrador(c, "instagram", `Capa ${SUFIJO}`, `Capa ${SUFIJO}`)
      const casos: [string, Record<string, Record<string, number>>][] = [
        [deLinkedin, { [dia]: { [await idDe(c, "mi-nueva-partida")]: 30 } }],
        [deInstagram, { [dia]: { [await idDe(c, "capa-tdah")]: 10 } }],
        [deLinkedin, { [dia]: { [await idDe(c, "pareja")]: 10 } }],
        [deLinkedin, { [dia]: { "no-es-un-id": 10 } }],
      ]
      for (const [id, pesos] of casos) {
        const error = await rechazo(c, id, pesos)
        expect([error.code, error.message], JSON.stringify(pesos)).toEqual(["22023", "pilar_de_otra_red"])
      }
    })
  })

  it("refuses weights that are not numbers over 0 and up to 100, or a stage that is not an object", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const id = await borrador(c, "linkedin", `Peso ${SUFIJO}`, `Peso ${SUFIJO}`)
      const casos = [
        { [dia]: { nuevo: 0 } },
        { [dia]: { nuevo: 100.5 } },
        { [dia]: { nuevo: "10" } },
        { [dia]: { nuevo: 0.001 } },
        { [dia]: 10 },
        [],
      ]
      for (const pesos of casos) {
        const error = await rechazo(c, id, pesos)
        expect([error.code, error.message], JSON.stringify(pesos)).toEqual(["22023", "peso_invalido"])
      }
    })
  })

  it("refuses WAV and a draft that does not exist", async () => {
    await como(comoConi, async (c) => {
      const id = await borrador(c, "linkedin", `Ajeno ${SUFIJO}`, `Ajeno ${SUFIJO}`)
      await asumir(c, comoMantenedor)
      const deWav = await rechazo(c, id, {})
      expect([deWav.code, deWav.message]).toEqual(["42501", "sin_permiso"])
      await asumir(c, comoConi)
      const ausente = await rechazo(c, "00000000-0000-4000-8000-000000000000", {})
      expect([ausente.code, ausente.message]).toEqual(["P0002", "borrador_inexistente"])
    })
  })

  it("leaves a draft out of every pillar: temas_de_red finds nothing for its id and categorias has no row of it", async () => {
    await como(comoConi, async (c) => {
      const id = await borrador(c, "linkedin", `Invisible ${SUFIJO}`, `Invisible ${SUFIJO}`)
      expect((await c.query("select 1 from public.temas_de_red('linkedin', $1)", [id])).rowCount).toBe(0)
      expect(
        (await c.query("select 1 from public.categorias where nombre = $1", [`Invisible ${SUFIJO}`])).rowCount,
      ).toBe(0)
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/aprobar-borrador.test.ts`
Expected: FAIL: `function public.aprobar_borrador_de_pilar(unknown, jsonb) does not exist` (the last test passes already).

- [ ] **Step 3: Append the RPC to the migration**

Append to `supabase/migrations/20261105000100_borradores_de_pilares.sql`:

```sql
-- Coni approves a pillar draft (spec section 1), redistributing that network's weights in every stage (decision 8).
-- The stages are today in Chile and every later `desde` the network's active pillars already have. `p_pesos` is
-- {"<desde YYYY-MM-DD>": {"<pilar_id>": peso, "nuevo": peso}}. Stages are written oldest first: in each, the new pillar
-- gets a row of that date (its "nuevo", else the draft's weight) and every pillar whose sent weight differs from its
-- effective one on that date gets a row of that date; a second change on the same day replaces it. Nothing is
-- deleted. The totals are not checked: the screen warns, the database accepts.
create function public.aprobar_borrador_de_pilar(p_borrador uuid, p_pesos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_borrador public.borradores_de_pilar;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_etapas date[];
  v_desde date;
  v_nombre text;
  v_corto text;
  v_base text;
  v_slug text;
  v_sufijo int := 1;
  v_pilar uuid := gen_random_uuid();
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_pesos is null or jsonb_typeof(p_pesos) <> 'object'
     or exists (select 1 from jsonb_each(p_pesos) e where jsonb_typeof(e.value) <> 'object') then
    raise exception using errcode = '22023', message = 'peso_invalido';
  end if;
  -- Every stage is an object by now, so its weights can be listed.
  if exists (
    select 1 from jsonb_each(p_pesos) e
    cross join lateral jsonb_each(e.value) w
    where case
      when jsonb_typeof(w.value) = 'number' then round((w.value)::numeric, 2) <= 0 or (w.value)::numeric > 100
      else true
    end
  ) then
    raise exception using errcode = '22023', message = 'peso_invalido';
  end if;
  -- One approval at a time: the slug, the order and the names are read and written in one go.
  perform pg_advisory_xact_lock(hashtext('aprobar_borrador_de_pilar'));
  select * into v_borrador from public.borradores_de_pilar where id = p_borrador for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'borrador_inexistente';
  end if;
  if v_borrador.estado <> 'borrador' then
    raise exception using errcode = '22023', message = 'borrador_ya_decidido';
  end if;
  select array_agg(distinct s.desde order by s.desde) into v_etapas
  from (
    select v_hoy as desde
    union all
    select w.desde
    from public.pilar_pesos w
    join public.categorias c on c.id = w.pilar_id
    where c.es_pilar and c.activa and not c.es_capa and c.red = v_borrador.red and w.desde > v_hoy
  ) s;
  -- A stage the screen showed that is gone, or a day that changed since it opened: she reloads (decision 6).
  if exists (
    select 1 from jsonb_object_keys(p_pesos) k
    where k not in (select to_char(e.desde, 'YYYY-MM-DD') from unnest(v_etapas) as e (desde))
  ) then
    raise exception using errcode = '22023', message = 'etapa_invalida';
  end if;
  -- A layer has no weight and a retired pillar no say: only the network's active pillars may be named.
  if exists (
    select 1 from jsonb_each(p_pesos) e
    cross join lateral jsonb_object_keys(e.value) k
    where k <> 'nuevo'
      and not exists (
        select 1 from public.categorias c
        where c.id::text = lower(k) and c.es_pilar and c.activa and not c.es_capa and c.red = v_borrador.red
      )
  ) then
    raise exception using errcode = '22023', message = 'pilar_de_otra_red';
  end if;
  -- Any row of any state, so a retired pillar's name cannot be shadowed; name and short name, both ways.
  v_nombre := public.unaccent_inmutable(lower(btrim(v_borrador.nombre)));
  v_corto := public.unaccent_inmutable(lower(btrim(v_borrador.nombre_corto)));
  if exists (
    select 1 from public.categorias c
    where c.nombre_normalizado in (v_nombre, v_corto)
       or public.unaccent_inmutable(lower(btrim(c.nombre_corto))) in (v_nombre, v_corto)
  ) then
    raise exception using errcode = '23505', message = 'nombre_en_uso';
  end if;
  v_base := coalesce(
    nullif(trim(both '-' from left(regexp_replace(v_nombre, '[^a-z0-9]+', '-', 'g'), 60)), ''),
    'pilar'
  );
  v_slug := v_base;
  while exists (select 1 from public.categorias where slug = v_slug) loop
    v_sufijo := v_sufijo + 1;
    v_slug := v_base || '-' || v_sufijo;
  end loop;
  insert into public.categorias
    (id, slug, nombre, nombre_corto, descripcion, orden, es_pilar, activa, red, es_capa, creada_por)
  select v_pilar, v_slug, v_borrador.nombre, v_borrador.nombre_corto, v_borrador.descripcion,
         (coalesce(max(c.orden), 0) + 1)::smallint, true, true, v_borrador.red, false, auth.uid()
  from public.categorias c
  where c.es_pilar and c.red = v_borrador.red;
  -- Oldest first (decision 7): each statement sees the stages already written, so a weight lowered today does not
  -- silently carry into a later stage whose value she kept.
  foreach v_desde in array v_etapas loop
    insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
    values (
      v_pilar, v_borrador.red, false, v_desde,
      coalesce(round((p_pesos -> to_char(v_desde, 'YYYY-MM-DD') ->> 'nuevo')::numeric, 2), v_borrador.peso)
    );
    insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
    select c.id, c.red, c.es_capa, v_desde, round((w.value)::numeric, 2)
    from jsonb_each(coalesce(p_pesos -> to_char(v_desde, 'YYYY-MM-DD'), '{}'::jsonb)) w
    join public.categorias c on c.id::text = lower(w.key)
    where w.key <> 'nuevo'
      and round((w.value)::numeric, 2) is distinct from (
        select x.peso from public.pilar_pesos x
        where x.pilar_id = c.id and x.desde <= v_desde
        order by x.desde desc
        limit 1
      )
    on conflict (pilar_id, desde) do update set peso = excluded.peso;
  end loop;
  update public.borradores_de_pilar set estado = 'aprobado', pilar_id = v_pilar where id = p_borrador;
  return v_pilar;
end $$;

revoke execute on function public.aprobar_borrador_de_pilar(uuid, jsonb) from public, anon;
grant execute on function public.aprobar_borrador_de_pilar(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Rebuild, regenerate, run the schema tests**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/aprobar-borrador.test.ts tests/integration/borradores-esquema.test.ts tests/integration/datos-pilares.test.ts tests/integration/pilares-por-red-esquema.test.ts`
Expected: PASS (13 + 6 tests, and the two existing pillar files unchanged: every approval and every own stage here was rolled back). `lib/supabase/database.types.ts` gains `aprobar_borrador_de_pilar: { Args: { p_borrador: string; p_pesos: Json }; Returns: string }`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000100_borradores_de_pilares.sql lib/supabase/database.types.ts \
  tests/integration/aprobar-borrador.test.ts
git commit -m "Approve a pillar draft into an active pillar with the weights of every stage in one transaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Phase 2: domain, readers and actions

### Task 3: The drafts' pure module: forms, routes and notes

**Files:**
- Create: `tests/unit/biblioteca-borradores.test.ts`
- Create: `lib/dominio/biblioteca/borradores.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-borradores.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  AVISOS,
  armarBorradorDePilar,
  armarBorradorDeRed,
  camposDeBorradorDePilar,
  camposDeBorradorDeRed,
  conAviso,
  ERRORES_DE_PILAR,
  FALTA_NOMBRE_DE_RED,
  formatoDePeso,
  hrefDeAprobarBorrador,
  hrefDeEditarBorrador,
  hrefDePilarNuevo,
  leerAviso,
  leerPeso,
  leerRedPedida,
  RUTA_DE_BORRADORES,
  RUTA_DE_RED_NUEVA,
} from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const CAMPOS = { nombre: "  Liderazgo sereno  ", nombreCorto: " Sereno ", descripcion: " Cómo decide. ", peso: "12,5" }

describe("leerPeso and formatoDePeso", () => {
  it.each([
    ["15", 15],
    ["12,5", 12.5],
    ["12.5", 12.5],
    [" 100 ", 100],
    ["0,01", 0.01],
  ])("reads %j as %s", (texto, peso) => {
    expect(leerPeso(texto)).toBe(peso)
  })

  it.each(["", "0", "100,01", "101", "12,345", "-5", "diez", "1e2", "12,"])("refuses %j", (texto) => {
    expect(leerPeso(texto)).toBeNull()
  })

  it("writes a weight as she does", () => {
    expect(formatoDePeso(110)).toBe("110")
    expect(formatoDePeso(12.5)).toBe("12,5")
    expect(formatoDePeso(0.01)).toBe("0,01")
  })
})

describe("armarBorradorDePilar", () => {
  it("trims every field and reads the weight", () => {
    expect(armarBorradorDePilar(CAMPOS)).toEqual({
      ok: true,
      datos: { nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: 12.5 },
    })
  })

  it.each([
    [{ ...CAMPOS, nombre: "  " }, ERRORES_DE_PILAR.nombre, "nombre"],
    [{ ...CAMPOS, nombre: "x".repeat(121) }, "El nombre puede tener hasta 120 caracteres.", "nombre"],
    [{ ...CAMPOS, nombreCorto: "" }, ERRORES_DE_PILAR.nombreCorto, "nombreCorto"],
    [{ ...CAMPOS, nombreCorto: "x".repeat(41) }, "El nombre corto puede tener hasta 40 caracteres.", "nombreCorto"],
    [{ ...CAMPOS, descripcion: "" }, ERRORES_DE_PILAR.descripcion, "descripcion"],
    [{ ...CAMPOS, descripcion: "x".repeat(1501) }, "La definición puede tener hasta 1500 caracteres.", "descripcion"],
    [{ ...CAMPOS, peso: "0" }, ERRORES_DE_PILAR.peso, "peso"],
    [{ ...CAMPOS, peso: "120" }, ERRORES_DE_PILAR.peso, "peso"],
  ])("says what is wrong and which field: %#", (campos, error, campo) => {
    expect(armarBorradorDePilar(campos)).toEqual({ ok: false, error, campo })
  })

  it("says the empty fields in her words", () => {
    expect(ERRORES_DE_PILAR).toEqual({
      nombre: "Escribe el nombre del pilar.",
      nombreCorto: "Escribe el nombre corto: es el texto del botón en Temas.",
      descripcion: "Escribe la definición del pilar.",
      peso: "Escribe el peso como un número mayor que 0 y hasta 100, por ejemplo 15 o 12,5.",
    })
  })

  it("prefills the form of a saved draft", () => {
    expect(
      camposDeBorradorDePilar({
        id: ID,
        red: "linkedin",
        nombre: "Liderazgo sereno",
        nombreCorto: "Sereno",
        descripcion: "Cómo decide.",
        peso: 12.5,
      }),
    ).toEqual({ nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: "12,5" })
  })
})

describe("armarBorradorDeRed", () => {
  it("needs only a name; the notes may stay empty", () => {
    expect(armarBorradorDeRed({ nombre: " TikTok ", manual: "", receta: " ", conexion: "" })).toEqual({
      ok: true,
      datos: { nombre: "TikTok", manual: "", receta: "", conexion: "" },
    })
  })

  it("says a missing name and a note too long", () => {
    expect(armarBorradorDeRed({ nombre: "", manual: "", receta: "", conexion: "" })).toEqual({
      ok: false,
      error: FALTA_NOMBRE_DE_RED,
      campo: "nombre",
    })
    expect(armarBorradorDeRed({ nombre: "TikTok", manual: "x".repeat(4001), receta: "", conexion: "" })).toEqual({
      ok: false,
      error: "El manual puede tener hasta 4000 caracteres.",
      campo: "manual",
    })
  })

  it("prefills the form of a saved draft", () => {
    expect(camposDeBorradorDeRed({ id: ID, nombre: "TikTok", manual: "M", receta: "", conexion: "C" })).toEqual({
      nombre: "TikTok",
      manual: "M",
      receta: "",
      conexion: "C",
    })
  })
})

describe("routes and notes", () => {
  it("gives every page of the drafts its address", () => {
    expect(hrefDePilarNuevo("instagram")).toBe("/biblioteca/temas/pilar-nuevo?red=instagram")
    expect(RUTA_DE_RED_NUEVA).toBe("/biblioteca/temas/red-nueva")
    expect(RUTA_DE_BORRADORES).toBe("/biblioteca/temas/borradores")
    expect(hrefDeEditarBorrador(ID)).toBe(`/biblioteca/temas/borradores/${ID}/editar`)
    expect(hrefDeAprobarBorrador(ID)).toBe(`/biblioteca/temas/borradores/${ID}/aprobar`)
  })

  it("takes the network of a new pillar from the address, else the last one she used, else LinkedIn", () => {
    expect(leerRedPedida({ red: "instagram" }, "linkedin")).toBe("instagram")
    expect(leerRedPedida({ red: "youtube" }, "instagram")).toBe("instagram")
    expect(leerRedPedida({ red: ["linkedin", "instagram"] }, null)).toBe("linkedin")
    expect(leerRedPedida({}, null)).toBe("linkedin")
  })

  it("adds a note to an address and reads it back; anything else is no note", () => {
    expect(conAviso("/biblioteca/temas?red=linkedin", "borrador-guardado")).toBe(
      "/biblioteca/temas?red=linkedin&aviso=borrador-guardado",
    )
    expect(conAviso("/biblioteca/temas/borradores", "borrador-descartado")).toBe(
      "/biblioteca/temas/borradores?aviso=borrador-descartado",
    )
    expect(leerAviso({ aviso: "borrador-guardado" })).toBe("Guardé el borrador. Apruébalo en Borradores cuando quieras.")
    expect(leerAviso({ aviso: "otra-cosa" })).toBeNull()
    expect(leerAviso({})).toBeNull()
    expect(Object.values(AVISOS).every((texto) => !texto.includes("\u2014"))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-borradores.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/dominio/biblioteca/borradores"`.

- [ ] **Step 3: Write the module**

Create `lib/dominio/biblioteca/borradores.ts`:

```ts
import { esRed, type Red } from "@/lib/dominio/pilares"
import { RED_POR_DEFECTO } from "./fila-de-temas"
import { RUTA_DE_TEMAS } from "./filtros-de-temas"

/** A pillar draft (spec 2026-11-05, part 15c): what Coni wrote, waiting for her approval. */
export interface BorradorDePilar {
  id: string
  red: Red
  nombre: string
  nombreCorto: string
  descripcion: string
  peso: number
}

/** A network draft: only her idea; WAV builds the network and reads it by SQL. */
export interface BorradorDeRed {
  id: string
  nombre: string
  manual: string
  receta: string
  conexion: string
}

export type BorradorLeido = { tipo: "pilar"; borrador: BorradorDePilar } | { tipo: "red"; borrador: BorradorDeRed }

/** The database's checks (20261105000100) repeat these. */
export const LARGOS = {
  nombre: 120,
  nombreCorto: 40,
  descripcion: 1500,
  nombreDeRed: 60,
  notaDeRed: 4000,
} as const

export const ESPERANDO_CONEXION = "Esperando conexión"

export const RUTA_DE_BORRADORES = `${RUTA_DE_TEMAS}/borradores`
export const RUTA_DE_RED_NUEVA = `${RUTA_DE_TEMAS}/red-nueva`
export const hrefDePilarNuevo = (red: Red) => `${RUTA_DE_TEMAS}/pilar-nuevo?red=${red}`
/** Both kinds: ids are uuids, so the page finds which one it is. */
export const hrefDeEditarBorrador = (id: string) => `${RUTA_DE_BORRADORES}/${id}/editar`
export const hrefDeAprobarBorrador = (id: string) => `${RUTA_DE_BORRADORES}/${id}/aprobar`

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)?.trim()

/** The network of «+ Agregar pilar»: from the address, else the last one she used in Temas, else LinkedIn. */
export function leerRedPedida(params: Params, ultimaRed: Red | null): Red {
  const pedida = primero(params.red)
  return esRed(pedida) ? pedida : (ultimaRed ?? RED_POR_DEFECTO)
}

export const CLAVES_DE_AVISO = [
  "borrador-guardado",
  "red-guardada",
  "borrador-editado",
  "borrador-descartado",
  "pilar-aprobado",
] as const
export type Aviso = (typeof CLAVES_DE_AVISO)[number]

/** The note a draft's form leaves on the page it returns to (`AvisoDeIdeas`, said once by `TrasElAviso`). */
export const AVISOS: Record<Aviso, string> = {
  "borrador-guardado": "Guardé el borrador. Apruébalo en Borradores cuando quieras.",
  "red-guardada": "Guardé el borrador de la red. Queda en Borradores, esperando conexión.",
  "borrador-editado": "Guardé los cambios del borrador.",
  "borrador-descartado": "Descarté el borrador.",
  "pilar-aprobado": "Aprobé el pilar. Ya aparece en Temas.",
}

export function leerAviso(params: Params): string | null {
  const pedido = primero(params.aviso)
  const aviso = CLAVES_DE_AVISO.find((clave) => clave === pedido)
  return aviso ? AVISOS[aviso] : null
}

export function conAviso(href: string, aviso: Aviso): string {
  return `${href}${href.includes("?") ? "&" : "?"}aviso=${aviso}`
}

const PESO = /^\d{1,3}(?:[.,]\d{1,2})?$/

/** "15", "12,5" or "12.5": a weight over 0 and up to 100, two decimals at most; anything else is null. */
export function leerPeso(texto: string): number | null {
  const limpio = texto.trim()
  if (!PESO.test(limpio)) return null
  const peso = Number(limpio.replace(",", "."))
  return peso > 0 && peso <= 100 ? peso : null
}

/** 110 is "110", 12.5 is "12,5": as she writes it. */
export const formatoDePeso = (peso: number) =>
  peso.toLocaleString("es-CL", { maximumFractionDigits: 2, useGrouping: false })

export type Armado<T, C extends string> = { ok: true; datos: T } | { ok: false; error: string; campo: C }

const muyLargo = (que: string, largo: number) => `${que} puede tener hasta ${largo} caracteres.`

export interface CamposDePilar {
  nombre: string
  nombreCorto: string
  descripcion: string
  peso: string
}
export type CampoDePilar = keyof CamposDePilar
export type BorradorDePilarArmado = Omit<BorradorDePilar, "id" | "red">

export const CAMPOS_DE_PILAR_VACIOS: CamposDePilar = { nombre: "", nombreCorto: "", descripcion: "", peso: "" }

export const ERRORES_DE_PILAR: Record<CampoDePilar, string> = {
  nombre: "Escribe el nombre del pilar.",
  nombreCorto: "Escribe el nombre corto: es el texto del botón en Temas.",
  descripcion: "Escribe la definición del pilar.",
  peso: "Escribe el peso como un número mayor que 0 y hasta 100, por ejemplo 15 o 12,5.",
}

/** The pillar form, checked in her words before anything is sent; the first field that fails is named. */
export function armarBorradorDePilar(campos: CamposDePilar): Armado<BorradorDePilarArmado, CampoDePilar> {
  const nombre = campos.nombre.trim()
  const nombreCorto = campos.nombreCorto.trim()
  const descripcion = campos.descripcion.trim()
  if (nombre === "") return { ok: false, error: ERRORES_DE_PILAR.nombre, campo: "nombre" }
  if (nombre.length > LARGOS.nombre) return { ok: false, error: muyLargo("El nombre", LARGOS.nombre), campo: "nombre" }
  if (nombreCorto === "") return { ok: false, error: ERRORES_DE_PILAR.nombreCorto, campo: "nombreCorto" }
  if (nombreCorto.length > LARGOS.nombreCorto) {
    return { ok: false, error: muyLargo("El nombre corto", LARGOS.nombreCorto), campo: "nombreCorto" }
  }
  if (descripcion === "") return { ok: false, error: ERRORES_DE_PILAR.descripcion, campo: "descripcion" }
  if (descripcion.length > LARGOS.descripcion) {
    return { ok: false, error: muyLargo("La definición", LARGOS.descripcion), campo: "descripcion" }
  }
  const peso = leerPeso(campos.peso)
  if (peso === null) return { ok: false, error: ERRORES_DE_PILAR.peso, campo: "peso" }
  return { ok: true, datos: { nombre, nombreCorto, descripcion, peso } }
}

export function camposDeBorradorDePilar(borrador: BorradorDePilar): CamposDePilar {
  return {
    nombre: borrador.nombre,
    nombreCorto: borrador.nombreCorto,
    descripcion: borrador.descripcion,
    peso: formatoDePeso(borrador.peso),
  }
}

export interface CamposDeRed {
  nombre: string
  manual: string
  receta: string
  conexion: string
}
export type CampoDeRed = keyof CamposDeRed
export type BorradorDeRedArmado = Omit<BorradorDeRed, "id">

export const CAMPOS_DE_RED_VACIOS: CamposDeRed = { nombre: "", manual: "", receta: "", conexion: "" }
export const FALTA_NOMBRE_DE_RED = "Escribe el nombre de la red."

const NOTAS_DE_RED = [
  ["manual", "El manual"],
  ["receta", "La receta"],
  ["conexion", "La conexión"],
] as const

/** The network form: a name, and three notes that may stay empty. */
export function armarBorradorDeRed(campos: CamposDeRed): Armado<BorradorDeRedArmado, CampoDeRed> {
  const datos = {
    nombre: campos.nombre.trim(),
    manual: campos.manual.trim(),
    receta: campos.receta.trim(),
    conexion: campos.conexion.trim(),
  }
  if (datos.nombre === "") return { ok: false, error: FALTA_NOMBRE_DE_RED, campo: "nombre" }
  if (datos.nombre.length > LARGOS.nombreDeRed) {
    return { ok: false, error: muyLargo("El nombre", LARGOS.nombreDeRed), campo: "nombre" }
  }
  for (const [campo, que] of NOTAS_DE_RED) {
    if (datos[campo].length > LARGOS.notaDeRed) return { ok: false, error: muyLargo(que, LARGOS.notaDeRed), campo }
  }
  return { ok: true, datos }
}

export function camposDeBorradorDeRed(borrador: BorradorDeRed): CamposDeRed {
  return { nombre: borrador.nombre, manual: borrador.manual, receta: borrador.receta, conexion: borrador.conexion }
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/biblioteca-borradores.test.ts tests/unit/sin-slugs-de-pilar.test.ts && pnpm type && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/biblioteca/borradores.ts tests/unit/biblioteca-borradores.test.ts
git commit -m "Check the pillar and network draft forms and name the drafts' pages and notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The stages of a network's weights and the weights editor

**Files:**
- Modify: `tests/unit/biblioteca-borradores.test.ts`, `tests/unit/pilares.test.ts`, `tests/integration/datos-pilares.test.ts`
- Modify: `lib/dominio/biblioteca/borradores.ts`, `lib/dominio/pilares.ts`, `lib/datos/pilares.ts`

- [ ] **Step 1: Write the failing tests**

1. Append to `tests/unit/biblioteca-borradores.test.ts` (and add `armarPesos, AVISO_DE_LA_GUIA, avisoDePesos, etapasDeAprobacion, etiquetaDeEtapa, NUEVO, totalDePesos,` to its import, keeping it alphabetical):

```ts
describe("the weights of an approval, stage by stage", () => {
  const BORRADOR = {
    id: ID,
    red: "linkedin" as const,
    nombre: "Liderazgo sereno: decidir con IA",
    nombreCorto: "Liderazgo sereno",
    descripcion: "Cómo decide.",
    peso: 10,
  }
  const HOY = "2026-11-05"
  const ETAPAS = etapasDeAprobacion(
    BORRADOR,
    [
      {
        desde: HOY,
        pesos: [
          { id: "a", nombreCorto: "Diagnóstico doble", peso: 30 },
          { id: "b", nombreCorto: "Bienestar e impacto", peso: 25 },
          { id: "c", nombreCorto: "Psicología en la mesa", peso: 30 },
          { id: "d", nombreCorto: "Mujeres líderes", peso: 15 },
        ],
      },
      {
        desde: "2027-01-01",
        pesos: [
          { id: "a", nombreCorto: "Diagnóstico doble", peso: 25 },
          { id: "b", nombreCorto: "Bienestar e impacto", peso: 25 },
          { id: "c", nombreCorto: "Psicología en la mesa", peso: 35 },
          { id: "d", nombreCorto: "Mujeres líderes", peso: 15 },
        ],
      },
    ],
    HOY,
  )
  const [DE_HOY, DE_ENERO] = ETAPAS
  if (!DE_HOY || !DE_ENERO) throw new Error("Faltan etapas")

  it("names a stage «Hoy» or by its date", () => {
    expect(etiquetaDeEtapa(HOY, HOY)).toBe("Hoy")
    expect(etiquetaDeEtapa("2027-07-01", HOY)).toBe("Desde el 1 de julio de 2027")
  })

  it("gives one stage per date, today first, each with the network's pillars and the new one at the draft's weight", () => {
    expect(ETAPAS.map((etapa) => [etapa.desde, etapa.esHoy, etapa.etiqueta])).toEqual([
      [HOY, true, "Hoy"],
      ["2027-01-01", false, "Desde el 1 de enero de 2027"],
    ])
    expect(DE_HOY.filas).toEqual([
      { clave: "a", nombre: "Diagnóstico doble", peso: "30" },
      { clave: "b", nombre: "Bienestar e impacto", peso: "25" },
      { clave: "c", nombre: "Psicología en la mesa", peso: "30" },
      { clave: "d", nombre: "Mujeres líderes", peso: "15" },
      { clave: NUEVO, nombre: "Liderazgo sereno", peso: "10" },
    ])
    expect(DE_ENERO.filas.map((fila) => fila.peso)).toEqual(["25", "25", "35", "15", "10"])
  })

  it("adds each stage's total and warns in her words only when it is not 100, naming a later stage's date", () => {
    expect(totalDePesos(DE_HOY.filas)).toBe(110)
    expect(avisoDePesos("linkedin", 110, DE_HOY)).toBe(
      "Los pesos de LinkedIn suman 110 %. Puedes aprobar igual y ajustarlos después.",
    )
    expect(avisoDePesos("linkedin", 110, DE_ENERO)).toBe(
      "Los pesos de LinkedIn desde el 1 de enero de 2027 suman 110 %. Puedes aprobar igual y ajustarlos después.",
    )
    expect(avisoDePesos("instagram", 99.5, DE_HOY)).toBe(
      "Los pesos de Instagram suman 99,5 %. Puedes aprobar igual y ajustarlos después.",
    )
    expect(avisoDePesos("instagram", 100, DE_ENERO)).toBeNull()
  })

  it("has no total while a weight cannot be read", () => {
    expect(totalDePesos(DE_HOY.filas.map((fila) => (fila.clave === "b" ? { ...fila, peso: "" } : fila)))).toBeNull()
  })

  it("sends every stage's weights as numbers, the new one under «nuevo», and names the first it cannot read with its stage", () => {
    expect(armarPesos(ETAPAS)).toEqual({
      ok: true,
      pesos: {
        [HOY]: { a: 30, b: 25, c: 30, d: 15, nuevo: 10 },
        "2027-01-01": { a: 25, b: 25, c: 35, d: 15, nuevo: 10 },
      },
    })
    const conError = [
      DE_HOY,
      { ...DE_ENERO, filas: DE_ENERO.filas.map((fila) => (fila.clave === "b" ? { ...fila, peso: "abc" } : fila)) },
    ]
    expect(armarPesos(conError)).toEqual({
      ok: false,
      error: "Escribe el peso de Bienestar e impacto (Desde el 1 de enero de 2027) como un número mayor que 0 y hasta 100.",
      desde: "2027-01-01",
      clave: "b",
    })
  })

  it("says that the guide is not updated by the app", () => {
    expect(AVISO_DE_LA_GUIA).toBe("La guía editorial no se actualiza sola: agrega a mano el texto de este pilar.")
  })
})
```

2. In `tests/unit/pilares.test.ts`, add `calcularEtapasDeRed,` to the import from `@/lib/dominio/pilares`; replace the body of `it("takes each pillar's row with the latest start on or before the date", ...)` with:

```ts
    expect(calcularPesosDeRed(PILARES_DE_PRUEBA, PESOS, "linkedin", "2026-12-31")).toEqual({
      pesos: [
        { id: id("diagnostico-doble"), slug: "diagnostico-doble", nombreCorto: "Diagnóstico doble", peso: 30 },
        { id: id("bienestar-e-impacto"), slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", peso: 25 },
        {
          id: id("psicologia-en-la-mesa"),
          slug: "psicologia-en-la-mesa",
          nombreCorto: "Psicología en la mesa",
          peso: 30,
        },
        { id: id("mujeres-lideres"), slug: "mujeres-lideres", nombreCorto: "Mujeres líderes", peso: 15 },
      ],
      total: 100,
      sumaCien: true,
    })
    expect(calcularPesosDeRed(PILARES_DE_PRUEBA, PESOS, "linkedin", "2027-01-01").pesos.map((p) => p.peso)).toEqual([
      25, 25, 35, 15,
    ])
```

replace the first `expect` of `it("flags a network whose weights do not add up to 100, ...")` with:

```ts
    expect(calcularPesosDeRed(PILARES_DE_PRUEBA, PESOS, "instagram", "2026-11-04")).toEqual({
      pesos: [{ id: id("mi-nueva-partida"), slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", peso: 40 }],
      total: 40,
      sumaCien: false,
    })
```

and append inside `describe("pesos por red", ...)`:

```ts
  it("gives a network's stages from a date on: that date, then every later start of its active pillars, in order", () => {
    const conAjena = [...PESOS, { pilarId: id("pareja"), desde: "2027-03-01", peso: 10 }]
    const etapas = calcularEtapasDeRed(PILARES_DE_PRUEBA, conAjena, "linkedin", "2026-12-31")
    expect(etapas.map((etapa) => [etapa.desde, etapa.pesos.map((p) => p.peso), etapa.sumaCien])).toEqual([
      ["2026-12-31", [30, 25, 30, 15], true],
      ["2027-01-01", [25, 25, 35, 15], true],
    ])
    expect(calcularEtapasDeRed(PILARES_DE_PRUEBA, PESOS, "instagram", "2026-11-04").map((e) => e.desde)).toEqual([
      "2026-11-04",
    ])
  })
```

3. In `tests/integration/datos-pilares.test.ts`, add `etapasDeRed,` to the import from `@/lib/datos/pilares`; inside `it("gives each stage's weights of a network, adding up to 100", ...)`, after `expect(hoy.sumaCien).toBe(true)` add:

```ts
    for (const peso of hoy.pesos) expect(peso.id).toMatch(/^[0-9a-f-]{36}$/)
```

and append inside `describe("pesosDeRed", ...)`:

```ts
  it("gives LinkedIn's stages from a date on, each adding up to 100", async () => {
    const etapas = await etapasDeRed(clienteDeServicio(), "linkedin", "2026-12-31")
    expect(etapas.map((etapa) => [etapa.desde, etapa.sumaCien])).toEqual([
      ["2026-12-31", true],
      ["2027-01-01", true],
      ["2027-07-01", true],
    ])
    expect((await etapasDeRed(clienteDeServicio(), "instagram", "2026-12-31")).map((e) => e.desde)).toEqual([
      "2026-12-31",
    ])
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/biblioteca-borradores.test.ts tests/unit/pilares.test.ts`
Expected: FAIL: `etapasDeAprobacion is not a function`, `calcularEtapasDeRed is not a function`, and the `calcularPesosDeRed` expectations miss `id`.

- [ ] **Step 3: Implement**

1. In `lib/dominio/pilares.ts`, replace `PesosDeRed` and `calcularPesosDeRed` with:

```ts
export interface PesosDeRed {
  pesos: { id: string; slug: string; nombreCorto: string; peso: number }[]
  total: number
  /** False when the network's weights on that date do not add up to 100: the 15c panel warns, nothing blocks. */
  sumaCien: boolean
}

/** Each pillar's weight on `fecha` (YYYY-MM-DD): its row with the latest `desde` on or before it. */
export function calcularPesosDeRed(
  catalogo: CatalogoDePilares,
  filas: readonly PesoDePilar[],
  red: Red,
  fecha: string,
): PesosDeRed {
  const pesos = pilaresParaElegir(catalogo)
    .filter((pilar) => pilar.red === red)
    .flatMap((pilar) => {
      const vigente = filas
        .filter((fila) => fila.pilarId === pilar.id && fila.desde <= fecha)
        .reduce<PesoDePilar | null>(
          (ultima, fila) => (ultima === null || fila.desde > ultima.desde ? fila : ultima),
          null,
        )
      return vigente ? [{ id: pilar.id, slug: pilar.slug, nombreCorto: pilar.nombreCorto, peso: vigente.peso }] : []
    })
  const total = Math.round(pesos.reduce((suma, pilar) => suma + pilar.peso, 0) * 100) / 100
  return { pesos, total, sumaCien: total === 100 }
}

/** One stage of a network's weights: the date it starts and the weights it gives. */
export interface EtapaDePesos extends PesosDeRed {
  desde: string
}

/**
 * A network's stages from `hoy` on (spec 15c, decision 8): `hoy`, then every later `desde` its active pillars have,
 * in order, each with the weights in force on its date. `aprobar_borrador_de_pilar` computes the same set.
 */
export function calcularEtapasDeRed(
  catalogo: CatalogoDePilares,
  filas: readonly PesoDePilar[],
  red: Red,
  hoy: string,
): EtapaDePesos[] {
  const ids = new Set(
    pilaresParaElegir(catalogo)
      .filter((pilar) => pilar.red === red)
      .map((pilar) => pilar.id),
  )
  const despues = new Set(filas.filter((fila) => ids.has(fila.pilarId) && fila.desde > hoy).map((fila) => fila.desde))
  return [hoy, ...[...despues].toSorted()].map((desde) => ({
    desde,
    ...calcularPesosDeRed(catalogo, filas, red, desde),
  }))
}
```

2. In `lib/datos/pilares.ts`, add `calcularEtapasDeRed,` and `type EtapaDePesos,` to the import from `@/lib/dominio/pilares`, and replace `pesosDeRed` with:

```ts
async function leerPesosYPilares(db: Db): Promise<[CatalogoDePilares, PesoDePilar[]]> {
  const [catalogo, pesos] = await Promise.all([leerPilares(db), db.from("pilar_pesos").select("pilar_id, desde, peso")])
  if (pesos.error)
    throw new Error(`No pude leer los pesos de los pilares: ${pesos.error.message}`, { cause: pesos.error })
  return [catalogo, pesos.data.map((fila) => ({ pilarId: fila.pilar_id, desde: fila.desde, peso: fila.peso }))]
}

/** A network's weights on a date (YYYY-MM-DD), with the flag the 15c panel warns on. */
export async function pesosDeRed(db: Db, red: Red, fecha: string): Promise<PesosDeRed> {
  const [catalogo, filas] = await leerPesosYPilares(db)
  return calcularPesosDeRed(catalogo, filas, red, fecha)
}

/** A network's weight stages from `hoy` on, for the approval of a pillar draft (spec 15c, decision 8). */
export async function etapasDeRed(db: Db, red: Red, hoy: string): Promise<EtapaDePesos[]> {
  const [catalogo, filas] = await leerPesosYPilares(db)
  return calcularEtapasDeRed(catalogo, filas, red, hoy)
}
```

   and add `type PesoDePilar,` to that import too.

3. In `lib/dominio/biblioteca/borradores.ts`, change the first import to `import { esRed, NOMBRE_DE_RED, type Red } from "@/lib/dominio/pilares"` and append:

```ts
/** The key of the new pillar's weight in a stage of `p_pesos`; every other key is a pillar id. */
export const NUEVO = "nuevo"

/** One weight of the approval screen, as she types it. */
export interface FilaDePeso {
  clave: string
  nombre: string
  peso: string
}

/** One stage of the approval screen (decision 8): «Hoy» or a later date, with every weight of that date. */
export interface EtapaEditable {
  desde: string
  esHoy: boolean
  etiqueta: string
  filas: FilaDePeso[]
}

const fechaLarga = (desde: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(
    Date.parse(`${desde}T12:00:00Z`),
  )

/** «Hoy», or «Desde el 1 de enero de 2027». */
export const etiquetaDeEtapa = (desde: string, hoy: string) =>
  desde === hoy ? "Hoy" : `Desde el ${fechaLarga(desde)}`

/** The network's stages (`etapasDeRed`), each with its pillars and, last, the new one at the draft's weight. */
export function etapasDeAprobacion(
  borrador: BorradorDePilar,
  etapas: readonly { desde: string; pesos: readonly { id: string; nombreCorto: string; peso: number }[] }[],
  hoy: string,
): EtapaEditable[] {
  return etapas.map((etapa) => ({
    desde: etapa.desde,
    esHoy: etapa.desde === hoy,
    etiqueta: etiquetaDeEtapa(etapa.desde, hoy),
    filas: [
      ...etapa.pesos.map((pilar) => ({ clave: pilar.id, nombre: pilar.nombreCorto, peso: formatoDePeso(pilar.peso) })),
      { clave: NUEVO, nombre: borrador.nombreCorto, peso: formatoDePeso(borrador.peso) },
    ],
  }))
}

/** A stage's live total; null while a weight cannot be read, so the screen says which one instead. */
export function totalDePesos(filas: readonly FilaDePeso[]): number | null {
  let total = 0
  for (const fila of filas) {
    const peso = leerPeso(fila.peso)
    if (peso === null) return null
    total += peso
  }
  return Math.round(total * 100) / 100
}

/** Spec 15c: a stage whose total is not 100 warns and never blocks. */
export function avisoDePesos(red: Red, total: number, etapa: Pick<EtapaEditable, "desde" | "esHoy">): string | null {
  if (total === 100) return null
  const cuando = etapa.esHoy ? "" : ` desde el ${fechaLarga(etapa.desde)}`
  return `Los pesos de ${NOMBRE_DE_RED[red]}${cuando} suman ${formatoDePeso(total)} %. Puedes aprobar igual y ajustarlos después.`
}

/** `p_pesos` of `aprobar_borrador_de_pilar`: `{desde: {pilar_id | "nuevo": peso}}`; the first unreadable weight is named. */
export function armarPesos(
  etapas: readonly EtapaEditable[],
):
  | { ok: true; pesos: Record<string, Record<string, number>> }
  | { ok: false; error: string; desde: string; clave: string } {
  const pesos: Record<string, Record<string, number>> = {}
  for (const etapa of etapas) {
    const deLaEtapa: Record<string, number> = {}
    for (const fila of etapa.filas) {
      const peso = leerPeso(fila.peso)
      if (peso === null) {
        return {
          ok: false,
          error: `Escribe el peso de ${fila.nombre} (${etapa.etiqueta}) como un número mayor que 0 y hasta 100.`,
          desde: etapa.desde,
          clave: fila.clave,
        }
      }
      deLaEtapa[fila.clave] = peso
    }
    pesos[etapa.desde] = deLaEtapa
  }
  return { ok: true, pesos }
}

export const AVISO_DE_LA_GUIA = "La guía editorial no se actualiza sola: agrega a mano el texto de este pilar."
```

- [ ] **Step 4: Run them**

Run: `pnpm test:run tests/unit/biblioteca-borradores.test.ts tests/unit/pilares.test.ts && pnpm test:db tests/integration/datos-pilares.test.ts && pnpm type && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/biblioteca/borradores.ts lib/dominio/pilares.ts lib/datos/pilares.ts \
  tests/unit/biblioteca-borradores.test.ts tests/unit/pilares.test.ts tests/integration/datos-pilares.test.ts
git commit -m "Read a network's weight stages and edit them stage by stage for an approval" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Read, save, edit and discard drafts

**Files:**
- Create: `tests/integration/limpiar-borradores.ts`
- Create: `tests/integration/acciones-borradores.test.ts`
- Create: `lib/datos/borradores.ts`
- Create: `lib/acciones/borradores.ts`
- Modify: `lib/acciones/biblioteca.ts` (export `exigirConi`)

- [ ] **Step 1: Write the cleanup helper**

Create `tests/integration/limpiar-borradores.ts`:

```ts
import { pool } from "./db"

/** `pilar_pesos` as 20261104000100_pilares_por_red.sql seeds it. */
const PESOS_DE_LA_SEMILLA = [
  ["diagnostico-doble", "2026-11-04", 30],
  ["diagnostico-doble", "2027-01-01", 25],
  ["diagnostico-doble", "2027-07-01", 25],
  ["bienestar-e-impacto", "2026-11-04", 25],
  ["bienestar-e-impacto", "2027-01-01", 25],
  ["bienestar-e-impacto", "2027-07-01", 20],
  ["psicologia-en-la-mesa", "2026-11-04", 30],
  ["psicologia-en-la-mesa", "2027-01-01", 35],
  ["psicologia-en-la-mesa", "2027-07-01", 30],
  ["mujeres-lideres", "2026-11-04", 15],
  ["mujeres-lideres", "2027-01-01", 15],
  ["mujeres-lideres", "2027-07-01", 25],
  ["game-over-impostora", "2026-11-04", 35],
  ["mi-nueva-partida", "2026-11-04", 40],
  ["inteligencia-emocional", "2026-11-04", 25],
].map(([slug, desde, peso]) => ({ slug, desde, peso }))

/**
 * Approvals through real clients commit (decision 19): every draft goes, every pillar a draft became goes with its
 * weights and topic rows, and `pilar_pesos` is back to the seed, so the counts other suites expect still hold.
 */
export async function limpiarBorradores(): Promise<void> {
  const { rows } = await pool.query<{ pilar_id: string }>(
    "select pilar_id from public.borradores_de_pilar where pilar_id is not null",
  )
  const aprobados = rows.map((fila) => fila.pilar_id)
  await pool.query("delete from public.tema_pilares where pilar_id = any($1::uuid[])", [aprobados])
  await pool.query("delete from public.pilar_pesos where pilar_id = any($1::uuid[])", [aprobados])
  await pool.query("delete from public.borradores_de_pilar")
  await pool.query("delete from public.borradores_de_red")
  await pool.query("delete from public.categorias where id = any($1::uuid[])", [aprobados])
  const semilla = JSON.stringify(PESOS_DE_LA_SEMILLA)
  await pool.query(
    `delete from public.pilar_pesos p using public.categorias c
     where c.id = p.pilar_id
       and not exists (
         select 1 from jsonb_to_recordset($1::jsonb) as s (slug text, desde date, peso numeric)
         where s.slug = c.slug and s.desde = p.desde
       )`,
    [semilla],
  )
  await pool.query(
    `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
     select c.id, c.red, c.es_capa, s.desde, s.peso
     from jsonb_to_recordset($1::jsonb) as s (slug text, desde date, peso numeric)
     join public.categorias c on c.slug = s.slug
     on conflict (pilar_id, desde) do update set peso = excluded.peso`,
    [semilla],
  )
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/integration/acciones-borradores.test.ts`:

```ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  BORRADOR_YA_DECIDIDO,
  descartarBorrador,
  editarBorradorDePilar,
  editarBorradorDeRed,
  guardarBorradorDePilar,
  guardarBorradorDeRed,
} from "@/lib/acciones/borradores"
import { ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { listarPilaresDeTemas } from "@/lib/datos/biblioteca"
import { contarBorradores, leerBorrador, listarBorradores } from "@/lib/datos/borradores"
import { pilaresActivos } from "@/lib/datos/pilares"
import type { Red } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { limpiarBorradores } from "./limpiar-borradores"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
let coni: Db
let wav: Db

const pilar = (nombreCorto: string, red: Red = "linkedin") => ({
  red,
  nombre: `${nombreCorto}: un pilar de prueba`,
  nombreCorto,
  descripcion: "Una definición de prueba.",
  peso: 10,
})

async function guardado(nuevo: ReturnType<typeof pilar>): Promise<string> {
  const resultado = await guardarBorradorDePilar({ db: coni }, nuevo)
  if (!resultado.ok) throw new Error(resultado.error)
  return resultado.id
}

beforeAll(async () => {
  await limpiarBorradores()
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
})

afterAll(async () => {
  await limpiarBorradores()
  await pool.end()
})

describe("drafts from the app", () => {
  it("saves Coni's pillar draft, lists, counts and reads it, and no pillar reader sees it", async () => {
    const corto = `Borrador ${SUFIJO}`
    const id = await guardado(pilar(corto))
    expect(await contarBorradores(coni)).toBe(1)
    const { pilares, redes } = await listarBorradores(coni)
    const esperado = {
      id,
      red: "linkedin",
      nombre: `${corto}: un pilar de prueba`,
      nombreCorto: corto,
      descripcion: "Una definición de prueba.",
      peso: 10,
    }
    expect(pilares).toEqual([esperado])
    expect(redes).toEqual([])
    expect(await leerBorrador(coni, id)).toEqual({ tipo: "pilar", borrador: esperado })
    expect((await pilaresActivos(coni)).map((p) => p.nombreCorto)).not.toContain(corto)
    expect((await listarPilaresDeTemas(coni)).map((p) => p.nombreCorto)).not.toContain(corto)
    const { data, error } = await coni.rpc("temas_de_red", { p_red: "linkedin", p_pilar: id })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("saves and edits a network draft with empty notes, and counts both kinds", async () => {
    const guardada = await guardarBorradorDeRed({ db: coni }, { nombre: `TikTok ${SUFIJO}`, manual: "", receta: "", conexion: "" })
    if (!guardada.ok) throw new Error(guardada.error)
    expect(await contarBorradores(coni)).toBe(2)
    expect(
      await editarBorradorDeRed(
        { db: coni },
        { id: guardada.id, nombre: `TikTok ${SUFIJO}`, manual: "Videos cortos.", receta: "", conexion: "" },
      ),
    ).toEqual({ ok: true })
    expect(await leerBorrador(coni, guardada.id)).toEqual({
      tipo: "red",
      borrador: { id: guardada.id, nombre: `TikTok ${SUFIJO}`, manual: "Videos cortos.", receta: "", conexion: "" },
    })
    expect((await listarBorradores(coni)).redes.map((red) => red.id)).toEqual([guardada.id])
  })

  it("edits a pillar draft until it is discarded; then it can be neither edited nor discarded again", async () => {
    const id = await guardado(pilar(`Editable ${SUFIJO}`, "instagram"))
    const edicion = { id, nombre: `Editable ${SUFIJO}`, nombreCorto: `Editado ${SUFIJO}`, descripcion: "Otra.", peso: 12.5 }
    expect(await editarBorradorDePilar({ db: coni }, edicion)).toEqual({ ok: true })
    expect(await leerBorrador(coni, id)).toEqual({ tipo: "pilar", borrador: { ...edicion, red: "instagram" } })
    expect(await descartarBorrador({ db: coni }, { tipo: "pilar", id })).toEqual({ ok: true })
    expect(await leerBorrador(coni, id)).toBeNull()
    expect(await editarBorradorDePilar({ db: coni }, edicion)).toEqual({ ok: false, error: BORRADOR_YA_DECIDIDO })
    expect(await descartarBorrador({ db: coni }, { tipo: "pilar", id })).toEqual({
      ok: false,
      error: BORRADOR_YA_DECIDIDO,
    })
  })

  it("refuses WAV from the app before the database is asked", async () => {
    const id = await guardado(pilar(`De Coni ${SUFIJO}`))
    expect(await guardarBorradorDePilar({ db: wav }, pilar(`De WAV ${SUFIJO}`))).toEqual({
      ok: false,
      error: ERROR_SOLO_CONI,
    })
    expect(await guardarBorradorDeRed({ db: wav }, { nombre: "De WAV", manual: "", receta: "", conexion: "" })).toEqual({
      ok: false,
      error: ERROR_SOLO_CONI,
    })
    expect(await descartarBorrador({ db: wav }, { tipo: "pilar", id })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
    expect((await leerBorrador(coni, id))?.tipo).toBe("pilar")
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm test:db tests/integration/acciones-borradores.test.ts`
Expected: FAIL: `Failed to load url @/lib/acciones/borradores`.

- [ ] **Step 4: Implement**

1. In `lib/acciones/biblioteca.ts`, change `async function exigirConi(db: Db): Promise<void> {` to `export async function exigirConi(db: Db): Promise<void> {` (nothing else).

2. Create `lib/datos/borradores.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { BorradorDePilar, BorradorDeRed, BorradorLeido } from "@/lib/dominio/biblioteca/borradores"
import { esRed } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

const DE_PILAR = "id, red, nombre, nombre_corto, descripcion, peso"
const DE_RED = "id, nombre, manual, receta, conexion"

interface FilaDePilar {
  id: string
  red: string
  nombre: string
  nombre_corto: string
  descripcion: string
  peso: number
}

function aBorradorDePilar(fila: FilaDePilar): BorradorDePilar {
  // The column's check lets only the two networks in: anything else means the schema changed under us.
  if (!esRed(fila.red)) throw new Error(`El borrador ${fila.id} tiene una red desconocida: ${fila.red}.`)
  return {
    id: fila.id,
    red: fila.red,
    nombre: fila.nombre,
    nombreCorto: fila.nombre_corto,
    descripcion: fila.descripcion,
    peso: fila.peso,
  }
}

/** Drafts still waiting, of both kinds: the count of «Borradores · N» in Temas. */
export async function contarBorradores(db: Db): Promise<number> {
  const [pilares, redes] = await Promise.all([
    db.from("borradores_de_pilar").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
    db.from("borradores_de_red").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
  ])
  if (pilares.error) {
    throw new Error(`No pude contar los borradores de pilar: ${pilares.error.message}`, { cause: pilares.error })
  }
  if (redes.error) throw new Error(`No pude contar los borradores de red: ${redes.error.message}`, { cause: redes.error })
  return (pilares.count ?? 0) + (redes.count ?? 0)
}

/** The drafts still waiting, oldest first (decision 11). */
export async function listarBorradores(db: Db): Promise<{ pilares: BorradorDePilar[]; redes: BorradorDeRed[] }> {
  const [pilares, redes] = await Promise.all([
    db.from("borradores_de_pilar").select(DE_PILAR).eq("estado", "borrador").order("creado_en"),
    db.from("borradores_de_red").select(DE_RED).eq("estado", "borrador").order("creado_en"),
  ])
  if (pilares.error) {
    throw new Error(`No pude leer los borradores de pilar: ${pilares.error.message}`, { cause: pilares.error })
  }
  if (redes.error) throw new Error(`No pude leer los borradores de red: ${redes.error.message}`, { cause: redes.error })
  return { pilares: pilares.data.map(aBorradorDePilar), redes: redes.data }
}

/** A draft still waiting, of either kind; null when it does not exist or was already decided. */
export async function leerBorrador(db: Db, id: string): Promise<BorradorLeido | null> {
  const [pilar, red] = await Promise.all([
    db.from("borradores_de_pilar").select(DE_PILAR).eq("id", id).eq("estado", "borrador").maybeSingle(),
    db.from("borradores_de_red").select(DE_RED).eq("id", id).eq("estado", "borrador").maybeSingle(),
  ])
  if (pilar.error) throw new Error(`No pude leer el borrador ${id}: ${pilar.error.message}`, { cause: pilar.error })
  if (red.error) throw new Error(`No pude leer el borrador ${id}: ${red.error.message}`, { cause: red.error })
  if (pilar.data) return { tipo: "pilar", borrador: aBorradorDePilar(pilar.data) }
  if (red.data) return { tipo: "red", borrador: red.data }
  return null
}
```

3. Create `lib/acciones/borradores.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { LARGOS } from "@/lib/dominio/biblioteca/borradores"
import { Falla } from "@/lib/dominio/falla"
import { REDES } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

/** Coni's client: row level security applies, and `es_coni` is checked again here (spec A6). */
export interface DepsBorradores {
  db: Db
}

const texto = (largo: number) => z.string().trim().min(1).max(largo)
const nota = z.string().trim().max(LARGOS.notaDeRed)
const peso = z.number().gt(0).lte(100)

const CamposDePilar = z.object({
  nombre: texto(LARGOS.nombre),
  nombreCorto: texto(LARGOS.nombreCorto),
  descripcion: texto(LARGOS.descripcion),
  peso,
})
export const BorradorDePilarNuevo = CamposDePilar.extend({ red: z.enum(REDES) })
export const EdicionDeBorradorDePilar = CamposDePilar.extend({ id: z.uuid() })
export const BorradorDeRedNuevo = z.object({
  nombre: texto(LARGOS.nombreDeRed),
  manual: nota,
  receta: nota,
  conexion: nota,
})
export const EdicionDeBorradorDeRed = BorradorDeRedNuevo.extend({ id: z.uuid() })
export const SobreBorrador = z.object({ tipo: z.enum(["pilar", "red"]), id: z.uuid() })

export const BORRADOR_YA_DECIDIDO = "Ese borrador ya no se puede cambiar: se aprobó o se descartó. Vuelve a Borradores."

/** Spec 15c: a draft waits until Coni approves it; nothing here touches the pillars. */
export function guardarBorradorDePilar(
  deps: DepsBorradores,
  nuevo: z.output<typeof BorradorDePilarNuevo>,
): Promise<Resultado<{ id: string }>> {
  return aResultado("guardarBorradorDePilar", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("borradores_de_pilar")
      .insert({
        red: nuevo.red,
        nombre: nuevo.nombre,
        nombre_corto: nuevo.nombreCorto,
        descripcion: nuevo.descripcion,
        peso: nuevo.peso,
      })
      .select("id")
      .single()
    if (error) throw new Error(`No pude guardar el borrador de pilar: ${error.message}`, { cause: error })
    return { id: data.id }
  })
}

/** Row level security only lets a draft still in `borrador` change: a decided or missing one answers no row. */
export function editarBorradorDePilar(
  deps: DepsBorradores,
  edicion: z.output<typeof EdicionDeBorradorDePilar>,
): Promise<Resultado> {
  return aResultado("editarBorradorDePilar", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("borradores_de_pilar")
      .update({
        nombre: edicion.nombre,
        nombre_corto: edicion.nombreCorto,
        descripcion: edicion.descripcion,
        peso: edicion.peso,
      })
      .eq("id", edicion.id)
      .eq("estado", "borrador")
      .select("id")
      .maybeSingle()
    if (error) throw new Error(`No pude editar el borrador ${edicion.id}: ${error.message}`, { cause: error })
    if (!data) throw new Falla(BORRADOR_YA_DECIDIDO)
    return {}
  })
}

export function guardarBorradorDeRed(
  deps: DepsBorradores,
  nuevo: z.output<typeof BorradorDeRedNuevo>,
): Promise<Resultado<{ id: string }>> {
  return aResultado("guardarBorradorDeRed", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db.from("borradores_de_red").insert(nuevo).select("id").single()
    if (error) throw new Error(`No pude guardar el borrador de red: ${error.message}`, { cause: error })
    return { id: data.id }
  })
}

export function editarBorradorDeRed(
  deps: DepsBorradores,
  edicion: z.output<typeof EdicionDeBorradorDeRed>,
): Promise<Resultado> {
  return aResultado("editarBorradorDeRed", async () => {
    await exigirConi(deps.db)
    const { id, ...campos } = edicion
    const { data, error } = await deps.db
      .from("borradores_de_red")
      .update(campos)
      .eq("id", id)
      .eq("estado", "borrador")
      .select("id")
      .maybeSingle()
    if (error) throw new Error(`No pude editar el borrador ${id}: ${error.message}`, { cause: error })
    if (!data) throw new Falla(BORRADOR_YA_DECIDIDO)
    return {}
  })
}

/** Discarding is a state, so the history stays (no one deletes a draft). */
export function descartarBorrador(
  deps: DepsBorradores,
  sobre: z.output<typeof SobreBorrador>,
): Promise<Resultado> {
  return aResultado("descartarBorrador", async () => {
    await exigirConi(deps.db)
    const { data, error } =
      sobre.tipo === "pilar"
        ? await deps.db
            .from("borradores_de_pilar")
            .update({ estado: "descartado" })
            .eq("id", sobre.id)
            .eq("estado", "borrador")
            .select("id")
            .maybeSingle()
        : await deps.db
            .from("borradores_de_red")
            .update({ estado: "descartado" })
            .eq("id", sobre.id)
            .eq("estado", "borrador")
            .select("id")
            .maybeSingle()
    if (error) throw new Error(`No pude descartar el borrador ${sobre.id}: ${error.message}`, { cause: error })
    if (!data) throw new Falla(BORRADOR_YA_DECIDIDO)
    return {}
  })
}
```

- [ ] **Step 5: Run it**

Run: `pnpm test:db tests/integration/acciones-borradores.test.ts tests/integration/datos-pilares.test.ts && pnpm type && pnpm lint`
Expected: PASS (4 + 3 tests). If Biome reorders imports, run `pnpm check` and re-run.

- [ ] **Step 6: Commit**

```bash
git add lib/datos/borradores.ts lib/acciones/borradores.ts lib/acciones/biblioteca.ts \
  tests/integration/limpiar-borradores.ts tests/integration/acciones-borradores.test.ts
git commit -m "Read, save, edit and discard pillar and network drafts as Coni" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Approve a draft from the app

**Files:**
- Modify: `tests/integration/acciones-borradores.test.ts`
- Modify: `lib/acciones/borradores.ts`

- [ ] **Step 1: Write the failing test**

In `tests/integration/acciones-borradores.test.ts`, add to the import from `@/lib/acciones/borradores`: `aprobarBorradorDePilar,`, `ETAPA_INVALIDA,`, `NOMBRE_EN_USO,`, `PILAR_DE_OTRA_RED,`; add `import { etapasDeRed, pesosDeRed, pilaresActivos } from "@/lib/datos/pilares"` (replacing the `pilaresActivos` import), `import { ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"` and `import { diaLocal } from "@/lib/dominio/fechas"`; and append:

```ts
const hoy = () => diaLocal(Date.now(), ZONA_DE_LA_BIBLIOTECA)

describe("approving a draft from the app", () => {
  it("makes it an active pillar every reader sees, accepts a total over 100 that pesosDeRed flags, and approves once", async () => {
    const corto = `Aprobado ${SUFIJO}`
    const id = await guardado(pilar(corto))
    const resultado = await aprobarBorradorDePilar({ db: coni }, { id, pesos: {} })
    expect(resultado).toEqual({ ok: true, pilarId: expect.stringMatching(/^[0-9a-f-]{36}$/), red: "linkedin" })
    expect((await pilaresActivos(coni)).find((p) => p.nombreCorto === corto)).toMatchObject({
      red: "linkedin",
      activa: true,
      esCapa: false,
      descripcion: "Una definición de prueba.",
    })
    expect((await listarPilaresDeTemas(coni)).map((p) => p.nombreCorto)).toContain(corto)
    const pesos = await pesosDeRed(coni, "linkedin", hoy())
    expect(pesos.pesos.find((p) => p.nombreCorto === corto)?.peso).toBe(10)
    expect(pesos.total).toBe(110)
    expect(pesos.sumaCien).toBe(false)
    expect(await leerBorrador(coni, id)).toBeNull()
    expect(await aprobarBorradorDePilar({ db: coni }, { id, pesos: {} })).toEqual({
      ok: false,
      error: BORRADOR_YA_DECIDIDO,
    })
  })

  it("gives the new pillar its weight in every stage of the network, whatever today's date is", async () => {
    const corto = `Etapas ${SUFIJO}`
    const id = await guardado(pilar(corto))
    const etapas = await etapasDeRed(coni, "linkedin", hoy())
    const pesos = Object.fromEntries(etapas.map((etapa) => [etapa.desde, { nuevo: 12 }]))
    expect((await aprobarBorradorDePilar({ db: coni }, { id, pesos })).ok).toBe(true)
    for (const etapa of await etapasDeRed(coni, "linkedin", hoy())) {
      expect(etapa.pesos.find((p) => p.nombreCorto === corto)?.peso, etapa.desde).toBe(12)
    }
  })

  it("says in her words a name already in use, a weight of the other network and a stage that is gone", async () => {
    const enUso = await guardado({ ...pilar(`Otro ${SUFIJO}`), nombre: "Pareja y conversación" })
    expect(await aprobarBorradorDePilar({ db: coni }, { id: enUso, pesos: {} })).toEqual({
      ok: false,
      error: NOMBRE_EN_USO,
    })
    const deLinkedin = await guardado(pilar(`Cruce ${SUFIJO}`))
    const deInstagram = (await pilaresActivos(coni)).find((p) => p.red === "instagram" && !p.esCapa)
    if (!deInstagram) throw new Error("No hay pilares de Instagram")
    expect(
      await aprobarBorradorDePilar({ db: coni }, { id: deLinkedin, pesos: { [hoy()]: { [deInstagram.id]: 30 } } }),
    ).toEqual({ ok: false, error: PILAR_DE_OTRA_RED })
    expect(
      await aprobarBorradorDePilar({ db: coni }, { id: deLinkedin, pesos: { "2020-01-01": { nuevo: 10 } } }),
    ).toEqual({ ok: false, error: ETAPA_INVALIDA })
  })

  it("refuses WAV before the database is asked", async () => {
    const id = await guardado(pilar(`Para WAV ${SUFIJO}`))
    expect(await aprobarBorradorDePilar({ db: wav }, { id, pesos: {} })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
    expect((await leerBorrador(coni, id))?.tipo).toBe("pilar")
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/acciones-borradores.test.ts`
Expected: FAIL: `aprobarBorradorDePilar is not a function`.

- [ ] **Step 3: Implement**

In `lib/acciones/borradores.ts`, change the pillar import to `import { esRed, REDES, type Red } from "@/lib/dominio/pilares"`, the result import to `import { aResultado, ERROR_SOLO_CONI, type Resultado } from "./resultado"`, add after `SobreBorrador`:

```ts
const PesosDeUnaEtapa = z
  .record(z.string().max(40), peso)
  // A network's pillars and the new one: a handful; 20 is far above any real network.
  .refine((pesos) => Object.keys(pesos).length <= 20)
export const AprobacionDePilar = z.object({
  id: z.uuid(),
  // `{desde: {pilar_id | "nuevo": peso}}` (decision 6); a network has today and a few planned stages.
  pesos: z
    .record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), PesosDeUnaEtapa)
    .refine((etapas) => Object.keys(etapas).length <= 12),
})
```

after `BORRADOR_YA_DECIDIDO`:

```ts
export const NOMBRE_EN_USO = "Ese nombre o nombre corto ya lo tiene otro pilar o categoría, aunque esté retirado. Edita el borrador y elige otro."
export const PILAR_DE_OTRA_RED = "Uno de esos pesos es de un pilar que ya no está en esa red. Recarga la página."
export const PESO_INVALIDO = "Uno de los pesos no es un número mayor que 0 y hasta 100."
export const BORRADOR_INEXISTENTE = "Ese borrador ya no existe. Vuelve a Borradores."
export const ETAPA_INVALIDA = "Las etapas de pesos de esa red cambiaron desde que abriste esta pantalla. Recarga la página."

/** `aprobar_borrador_de_pilar`'s refusals, in her words. */
const RECHAZOS_DE_APROBACION: Record<string, string> = {
  borrador_ya_decidido: BORRADOR_YA_DECIDIDO,
  nombre_en_uso: NOMBRE_EN_USO,
  pilar_de_otra_red: PILAR_DE_OTRA_RED,
  peso_invalido: PESO_INVALIDO,
  borrador_inexistente: BORRADOR_INEXISTENTE,
  etapa_invalida: ETAPA_INVALIDA,
  sin_permiso: ERROR_SOLO_CONI,
}
```

and append:

```ts
/**
 * Spec 15c section 1: the database checks and writes everything in one transaction. The new pillar's network comes
 * back so Temas opens on it with the pillar chosen.
 */
export function aprobarBorradorDePilar(
  deps: DepsBorradores,
  aprobacion: z.output<typeof AprobacionDePilar>,
): Promise<Resultado<{ pilarId: string; red: Red }>> {
  return aResultado("aprobarBorradorDePilar", async () => {
    await exigirConi(deps.db)
    const { data: pilarId, error } = await deps.db.rpc("aprobar_borrador_de_pilar", {
      p_borrador: aprobacion.id,
      p_pesos: aprobacion.pesos,
    })
    if (error) {
      const rechazo = RECHAZOS_DE_APROBACION[error.message]
      if (rechazo) throw new Falla(rechazo)
      throw new Error(`No pude aprobar el borrador ${aprobacion.id}: ${error.message}`, { cause: error })
    }
    const { data: pilar, error: errorAlLeer } = await deps.db.from("categorias").select("red").eq("id", pilarId).single()
    if (errorAlLeer) {
      throw new Error(`No pude leer el pilar aprobado ${pilarId}: ${errorAlLeer.message}`, { cause: errorAlLeer })
    }
    if (!esRed(pilar.red)) throw new Error(`El pilar aprobado ${pilarId} no tiene red.`)
    return { pilarId, red: pilar.red }
  })
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:db tests/integration/acciones-borradores.test.ts tests/integration/datos-pilares.test.ts tests/integration/pilares-por-red-esquema.test.ts && pnpm type && pnpm lint`
Expected: PASS (8 tests in the new file; the two pillar files still see 13 active pillars and 15 weight rows: `afterAll` cleaned up).

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/borradores.ts tests/integration/acciones-borradores.test.ts
git commit -m "Approve a pillar draft from the app and say each refusal in Coni's words" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: The server actions

**Files:**
- Create: `tests/unit/biblioteca-acciones-borradores.test.ts`
- Create: `app/(app)/biblioteca/temas/borradores/acciones.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-acciones-borradores.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: boolean; error?: string; id?: string; pilarId?: string; red?: string }

const { conSesionDeConi, revalidatePath, redirect } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  revalidatePath: vi.fn(),
  // Like Next's, it throws: nothing after it runs.
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT")
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi }))

import {
  aprobarBorradorDePilarAccion,
  descartarBorradorAccion,
  editarBorradorDePilarAccion,
  editarBorradorDeRedAccion,
  guardarBorradorDePilarAccion,
  guardarBorradorDeRedAccion,
} from "@/app/(app)/biblioteca/temas/borradores/acciones"
import {
  AprobacionDePilar,
  BorradorDePilarNuevo,
  BorradorDeRedNuevo,
  EdicionDeBorradorDePilar,
  EdicionDeBorradorDeRed,
  SobreBorrador,
} from "@/lib/acciones/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const PILAR = "22222222-3333-4444-8555-666666666666"
const pilar = { nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: 10 }
const red = { nombre: "TikTok", manual: "", receta: "", conexion: "" }

beforeEach(() => vi.clearAllMocks())

describe("the drafts' server actions", () => {
  it.each([
    [
      "guardarBorradorDePilar",
      () => guardarBorradorDePilarAccion({ ...pilar, red: "instagram" }),
      BorradorDePilarNuevo,
      { ...pilar, red: "instagram" },
      "/biblioteca/temas?red=instagram&aviso=borrador-guardado",
    ],
    [
      "editarBorradorDePilar",
      () => editarBorradorDePilarAccion({ ...pilar, id: ID }),
      EdicionDeBorradorDePilar,
      { ...pilar, id: ID },
      "/biblioteca/temas/borradores?aviso=borrador-editado",
    ],
    [
      "guardarBorradorDeRed",
      () => guardarBorradorDeRedAccion(red),
      BorradorDeRedNuevo,
      red,
      "/biblioteca/temas?aviso=red-guardada",
    ],
    [
      "editarBorradorDeRed",
      () => editarBorradorDeRedAccion({ ...red, id: ID }),
      EdicionDeBorradorDeRed,
      { ...red, id: ID },
      "/biblioteca/temas/borradores?aviso=borrador-editado",
    ],
    [
      "descartarBorrador",
      () => descartarBorradorAccion({ tipo: "red", id: ID }),
      SobreBorrador,
      { tipo: "red", id: ID },
      "/biblioteca/temas/borradores?aviso=borrador-descartado",
    ],
  ] as const)(
    "%s checks Coni with its schema, refreshes the section and goes to its page with the note",
    async (nombre, accion, esquema, entrada, destino) => {
      await expect(accion()).rejects.toThrow("NEXT_REDIRECT")
      expect(conSesionDeConi).toHaveBeenCalledWith(nombre, esquema, entrada, expect.any(Function))
      expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
      expect(redirect).toHaveBeenCalledWith(destino, "replace")
    },
  )

  it("aprobarBorradorDePilar goes to Temas on the pillar's network with the new pillar chosen and the note", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: true, pilarId: PILAR, red: "linkedin" })
    const pesos = { "2026-11-05": { nuevo: 10 } }
    await expect(aprobarBorradorDePilarAccion({ id: ID, pesos })).rejects.toThrow("NEXT_REDIRECT")
    expect(conSesionDeConi).toHaveBeenCalledWith(
      "aprobarBorradorDePilar",
      AprobacionDePilar,
      { id: ID, pesos },
      expect.any(Function),
    )
    expect(redirect).toHaveBeenCalledWith(`/biblioteca/temas?red=linkedin&pilar=${PILAR}&aviso=pilar-aprobado`, "replace")
  })

  it("a refusal answers with the error, refreshes nothing and goes nowhere", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    expect(await aprobarBorradorDePilarAccion({ id: ID, pesos: {} })).toEqual({
      ok: false,
      error: "Esta app es solo para Coni.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("the schemas refuse another network, an empty name, a weight out of range, a stage that is not a date and too many weights", () => {
    expect(BorradorDePilarNuevo.safeParse({ ...pilar, red: "youtube" }).success).toBe(false)
    expect(BorradorDePilarNuevo.safeParse({ ...pilar, red: "linkedin", nombre: "   " }).success).toBe(false)
    expect(BorradorDePilarNuevo.safeParse({ ...pilar, red: "linkedin", peso: 0 }).success).toBe(false)
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { "2026-11-05": { nuevo: 10 } } }).success).toBe(true)
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { "2026-11-05": { nuevo: 101 } } }).success).toBe(false)
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { hoy: { nuevo: 10 } } }).success).toBe(false)
    const muchos = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}`, 5]))
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { "2026-11-05": muchos } }).success).toBe(false)
    expect(SobreBorrador.safeParse({ tipo: "tema", id: ID }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-acciones-borradores.test.ts`
Expected: FAIL: `Failed to resolve import "@/app/(app)/biblioteca/temas/borradores/acciones"`.

- [ ] **Step 3: Implement**

Create `app/(app)/biblioteca/temas/borradores/acciones.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { z } from "zod"
import {
  AprobacionDePilar,
  aprobarBorradorDePilar,
  BorradorDePilarNuevo,
  BorradorDeRedNuevo,
  descartarBorrador,
  EdicionDeBorradorDePilar,
  EdicionDeBorradorDeRed,
  editarBorradorDePilar,
  editarBorradorDeRed,
  guardarBorradorDePilar,
  guardarBorradorDeRed,
  SobreBorrador,
} from "@/lib/acciones/borradores"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"
import { conAviso, RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { hrefDeTemas } from "@/lib/dominio/biblioteca/fila-de-temas"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"

/** A draft shows in Temas (its count) and in Borradores; an approval changes the pillars of the whole section. */
function refrescar<T extends object>(resultado: Resultado<T>): Resultado<T> {
  if (resultado.ok) revalidatePath("/biblioteca", "layout")
  return resultado
}

// Each action answers with the next screen itself (`redirect`, as `unirAutoresAccion`), with its note in the address;
// "replace" keeps the form out of Back. `redirect` throws, so it runs only after success and outside any catch.

export async function guardarBorradorDePilarAccion(nuevo: z.input<typeof BorradorDePilarNuevo>) {
  const resultado = refrescar(
    await conSesionDeConi("guardarBorradorDePilar", BorradorDePilarNuevo, nuevo, (db, d) =>
      guardarBorradorDePilar({ db }, d),
    ),
  )
  // Success means the schema passed: the network is one of the two.
  if (resultado.ok) {
    redirect(conAviso(hrefDeTemas({ red: BorradorDePilarNuevo.parse(nuevo).red }), "borrador-guardado"), "replace")
  }
  return resultado
}

export async function editarBorradorDePilarAccion(edicion: z.input<typeof EdicionDeBorradorDePilar>) {
  const resultado = refrescar(
    await conSesionDeConi("editarBorradorDePilar", EdicionDeBorradorDePilar, edicion, (db, d) =>
      editarBorradorDePilar({ db }, d),
    ),
  )
  if (resultado.ok) redirect(conAviso(RUTA_DE_BORRADORES, "borrador-editado"), "replace")
  return resultado
}

/** Temas without `?red` opens on the network she used last. */
export async function guardarBorradorDeRedAccion(nuevo: z.input<typeof BorradorDeRedNuevo>) {
  const resultado = refrescar(
    await conSesionDeConi("guardarBorradorDeRed", BorradorDeRedNuevo, nuevo, (db, d) => guardarBorradorDeRed({ db }, d)),
  )
  if (resultado.ok) redirect(conAviso(RUTA_DE_TEMAS, "red-guardada"), "replace")
  return resultado
}

export async function editarBorradorDeRedAccion(edicion: z.input<typeof EdicionDeBorradorDeRed>) {
  const resultado = refrescar(
    await conSesionDeConi("editarBorradorDeRed", EdicionDeBorradorDeRed, edicion, (db, d) =>
      editarBorradorDeRed({ db }, d),
    ),
  )
  if (resultado.ok) redirect(conAviso(RUTA_DE_BORRADORES, "borrador-editado"), "replace")
  return resultado
}

export async function descartarBorradorAccion(sobre: z.input<typeof SobreBorrador>) {
  const resultado = refrescar(
    await conSesionDeConi("descartarBorrador", SobreBorrador, sobre, (db, d) => descartarBorrador({ db }, d)),
  )
  if (resultado.ok) redirect(conAviso(RUTA_DE_BORRADORES, "borrador-descartado"), "replace")
  return resultado
}

/** Temas opens on the new pillar's network with it chosen (spec 15c, section 2). */
export async function aprobarBorradorDePilarAccion(aprobacion: z.input<typeof AprobacionDePilar>) {
  const resultado = refrescar(
    await conSesionDeConi("aprobarBorradorDePilar", AprobacionDePilar, aprobacion, (db, d) =>
      aprobarBorradorDePilar({ db }, d),
    ),
  )
  if (resultado.ok) {
    redirect(conAviso(hrefDeTemas({ red: resultado.red, pilar: resultado.pilarId }), "pilar-aprobado"), "replace")
  }
  return resultado
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/biblioteca-acciones-borradores.test.ts && pnpm type && pnpm lint`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/borradores/acciones.ts" tests/unit/biblioteca-acciones-borradores.test.ts
git commit -m "Add the drafts' server actions, each landing on its page with a note" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint, phases 1 and 2:** one migration; drafts are saved, edited, discarded and approved through actions that check Coni; no reader of pillars sees a draft. Nothing on screen changed yet.

# Phase 3: screens

### Task 8: The Temas row: "Agregar red", "Agregar pilar", "Borradores · N" and the notes

**Files:**
- Create: `app/(app)/biblioteca/temas/enlace-a-borradores.tsx`
- Modify: `app/(app)/biblioteca/temas/fila-de-temas.tsx`, `app/(app)/biblioteca/temas/page.tsx`, `app/(app)/biblioteca/tras-el-aviso.tsx`
- Modify: `tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx`, `tests/unit/biblioteca-pagina-temas.test.tsx`, `tests/unit/biblioteca-tras-el-aviso.test.tsx`

- [ ] **Step 1: Write the failing tests**

1. In `tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx`:
   - add `import { EnlaceABorradores } from "@/app/(app)/biblioteca/temas/enlace-a-borradores"` after the `FilaDeTemas` import;
   - in the first test, replace the expected array with
     `["Sin tratar · 2", "Instagram", "LinkedIn", "Agregar red", "Todos los pilares", "Diagnóstico doble", "Bienestar e impacto", "Agregar pilar"]`;
   - in `it("on Instagram puts the TDAH layer last, ...")`, replace the expected array with `["Todos los pilares", "Mi nueva partida", "Agregar pilar", "Capa TDAH"]`;
   - replace the file's last line (the `})` that closes `describe("FilaDeTemas", ...)`) with this block, which adds two tests to it, closes it, and adds a `describe` of its own:

```tsx
  it("closes the networks with «Agregar red» and puts «Agregar pilar» after the pillars, before the TDAH layer", () => {
    render(<FilaDeTemas filtros={{ red: "instagram" }} pilares={PILARES} sinTratar={0} />)
    const fila = screen.getByRole("group", { name: "Filtrar temas" })
    const [redes] = within(fila).getAllByRole("list")
    if (!redes) throw new Error("La fila no tiene lista de redes")
    expect(textos(within(redes).getAllByRole("link"))).toEqual(["Sin tratar", "Instagram", "LinkedIn", "Agregar red"])
    const agregarRed = within(redes).getByRole("link", { name: "Agregar red" })
    expect(agregarRed).toHaveAttribute("href", "/biblioteca/temas/red-nueva")
    expect(agregarRed).not.toHaveAttribute("aria-current")
    const pilares = within(fila).getByRole("list", { name: "Pilares de Instagram" })
    const agregarPilar = within(pilares).getByRole("link", { name: "Agregar pilar" })
    expect(agregarPilar).toHaveAttribute("href", "/biblioteca/temas/pilar-nuevo?red=instagram")
    expect(agregarPilar).not.toHaveAttribute("aria-current")
    // It slides with the pillars on the phone: an item of their track that does not shrink.
    expect(agregarPilar.closest("li")).toHaveClass("shrink-0")
    for (const agregar of [agregarRed, agregarPilar]) {
      expect(agregar.firstChild?.nodeName.toLowerCase()).toBe("svg")
      expect(agregar).toHaveClass("border-dashed")
    }
  })

  it("keeps «Agregar pilar» the same element when another pillar is chosen, so the keyboard focus is not lost", () => {
    const { rerender } = render(<FilaDeTemas filtros={{ red: "linkedin" }} pilares={PILARES} sinTratar={2} />)
    const antes = screen.getByRole("link", { name: "Agregar pilar" })
    rerender(<FilaDeTemas filtros={{ red: "linkedin", pilar: BIENESTAR }} pilares={PILARES} sinTratar={2} />)
    expect(screen.getByRole("link", { name: "Agregar pilar" })).toBe(antes)
  })
})

describe("EnlaceABorradores", () => {
  it("links to Borradores with the count, and is not there with none", () => {
    const { container, rerender } = render(<EnlaceABorradores cantidad={0} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<EnlaceABorradores cantidad={2} />)
    expect(screen.getByRole("link", { name: "Borradores · 2" })).toHaveAttribute("href", "/biblioteca/temas/borradores")
  })
})
```

2. In `tests/unit/biblioteca-pagina-temas.test.tsx`:
   - add after the `vi.hoisted` block:

```ts
const borradores = vi.hoisted(() => ({ contarBorradores: vi.fn(async (): Promise<number> => 0) }))
vi.mock("@/lib/datos/borradores", () => borradores)
```

   - add the imports `import { EnlaceABorradores } from "@/app/(app)/biblioteca/temas/enlace-a-borradores"` and `import { AVISOS } from "@/lib/dominio/biblioteca/borradores"`;
   - append inside `describe("the Temas page", ...)`:

```ts
  it("shows «Borradores · N» after the row and says the note a draft's form left, once", async () => {
    esConi.valor = true
    borradores.contarBorradores.mockResolvedValueOnce(2)
    let arbol = elementos(await Temas(conParams({ red: "linkedin", aviso: "borrador-guardado" })))
    expect(arbol.find((elemento) => elemento.type === EnlaceABorradores)?.props).toEqual({ cantidad: 2 })
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBe(AVISOS["borrador-guardado"])
    expect(arbol.find((elemento) => elemento.type === TrasElAviso)?.props).toEqual({ parametro: "aviso" })

    arbol = elementos(await Temas(conParams({ aviso: "otra-cosa" })))
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBeNull()
    expect(arbol.some((elemento) => elemento.type === TrasElAviso)).toBe(false)
    expect(arbol.find((elemento) => elemento.type === EnlaceABorradores)?.props).toEqual({ cantidad: 0 })
  })
```

   - in `it("refuses a session that is not Coni's on its own, before reading anything", ...)`, add `expect(borradores.contarBorradores).not.toHaveBeenCalled()` next to the existing "not called" assertions.

3. In `tests/unit/biblioteca-tras-el-aviso.test.tsx`, append inside `describe("TrasElAviso", ...)`:

```tsx
  it("takes a draft form's note out of the address too, keeping the rest", () => {
    en("/biblioteca/temas?red=linkedin&aviso=borrador-guardado")
    render(
      <>
        <AvisoDeIdeas texto="Guardé el borrador." />
        <TrasElAviso parametro="aviso" />
      </>,
    )
    expect(window.location.search).toBe("?red=linkedin")
    expect(document.getElementById(ID_DEL_AVISO_DE_IDEAS)).toHaveFocus()
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx tests/unit/biblioteca-tras-el-aviso.test.tsx`
Expected: FAIL: `enlace-a-borradores` does not resolve; the row has no "Agregar" links; `parametro="aviso"` does not type-check (vitest runs it anyway; `pnpm type` would fail).

- [ ] **Step 3: Implement**

1. Create `app/(app)/biblioteca/temas/enlace-a-borradores.tsx`:

```tsx
import Link from "next/link"
import { RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"

/** Spec 15c: after the row, only while drafts wait. It filters nothing, so it lives outside the row's group. */
export function EnlaceABorradores({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return null
  return (
    <p>
      <Link
        href={RUTA_DE_BORRADORES}
        className="inline-flex min-h-objetivo items-center text-cuerpo font-semibold underline decoration-1 underline-offset-4"
      >
        {conCuenta("Borradores", cantidad)}
      </Link>
    </p>
  )
}
```

2. Replace `app/(app)/biblioteca/temas/fila-de-temas.tsx` with:

```tsx
import { CaretDown, Check, Plus } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { CHIP_ELEGIDO, FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { PistaDePestanas } from "@/components/ui/pista-de-pestanas"
import { hrefDePilarNuevo, RUTA_DE_RED_NUEVA } from "@/lib/dominio/biblioteca/borradores"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import {
  alternarSinTratar,
  conPilar,
  conRed,
  type FiltrosDeTemas,
  hrefDeTemas,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import { NOMBRE_DE_RED, type PilarDeRed, pilaresDeLaRed, type Red } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

const CHIP = cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP)
// Coni wrote the row Instagram first (her answer of 2026-11-04); every other list of the app keeps `REDES`' order.
const REDES_DE_LA_FILA: readonly Red[] = ["instagram", "linkedin"]
// The chosen network looks pressed: sunk into the stone, with its pillars open under the row.
const RED_ELEGIDA = "aria-[current=true]:bg-piedra-honda aria-[current=true]:shadow-hundido"
// Coni asked for the layer to read as not a pillar: outlined, without relief.
const CAPA = "border border-campo bg-transparent shadow-none aria-[current=page]:border-tinta"
// «+ Agregar» opens a form and filters nothing (spec 15c): a dashed outline, without relief, never current.
const AGREGAR = "border border-dashed border-campo bg-transparent shadow-none"
// On the phone the pillars slide along one line in their own track, as the Biblioteca tabs do; from md up they wrap.
// The track bleeds into the page margin (main's px-5) and pads it back, so the chips' relief is not clipped.
const PISTA_DE_PILARES =
  "-mx-5 -my-5 flex min-w-0 flex-nowrap gap-2 overflow-x-auto px-5 py-5 scroll-px-5 md:mx-0 md:my-0 md:flex-wrap md:overflow-visible md:p-0"

interface Propiedades {
  filtros: FiltrosDeTemas
  /** Every network's pillars and layers; the row shows the chosen network's. */
  pilares: readonly PilarDeRed[]
  /** Topics of the network and pillar with nothing out there yet. */
  sinTratar: number
}

interface OpcionDePilar {
  id: string | undefined
  nombre: string
  esCapa: boolean
}

/**
 * Coni's row (spec 2026-11-04, part 15b, section 2, and 15c): «Sin tratar», Instagram and LinkedIn, «+ Agregar red»;
 * under them the chosen network's pillars, «Todos los pilares» first, «+ Agregar pilar» after the last pillar and the
 * TDAH layer last. Every button is a link to its address, so Back and a shared link work without scripts. The networks
 * wrap; on the phone the pillars slide in their own track (from md up they wrap); the page never scrolls sideways. The
 * track is keyed by network only and «+ Agregar pilar» keeps its key, so choosing a pillar keeps the focus.
 */
export function FilaDeTemas({ filtros, pilares, sinTratar }: Propiedades) {
  const deLaRed = pilaresDeLaRed(pilares, filtros.red)
  const aOpcion = (pilar: PilarDeRed): OpcionDePilar => ({ id: pilar.id, nombre: pilar.nombreCorto, esCapa: pilar.esCapa })
  const opcionesDePilar: OpcionDePilar[] = [
    { id: undefined, nombre: "Todos los pilares", esCapa: false },
    ...deLaRed.filter((pilar) => !pilar.esCapa).map(aOpcion),
  ]
  const capas = deLaRed.filter((pilar) => pilar.esCapa).map(aOpcion)
  const opcion = ({ id, nombre, esCapa }: OpcionDePilar) => {
    const actual = filtros.pilar === id
    return (
      <li key={id ?? "todos"} className="shrink-0">
        <Link
          href={hrefDeTemas(conPilar(filtros, id))}
          scroll={false}
          aria-current={actual ? "page" : undefined}
          className={cn(CHIP, esCapa && CAPA, CHIP_ELEGIDO)}
        >
          {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
          {nombre}
        </Link>
      </li>
    )
  }
  return (
    <fieldset aria-label="Filtrar temas" className="m-0 grid min-w-0 gap-3 border-0 p-0">
      {/* Above the pillar track, whose padding (kept for the chips' relief) reaches up into this row. */}
      <ul className="relative z-10 flex min-w-0 flex-wrap gap-2">
        <li>
          <Link
            href={hrefDeTemas(alternarSinTratar(filtros))}
            scroll={false}
            aria-current={filtros.sinTratar ? "page" : undefined}
            className={cn(CHIP, CHIP_ELEGIDO)}
          >
            {filtros.sinTratar ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
            {conCuenta("Sin tratar", sinTratar)}
          </Link>
        </li>
        {REDES_DE_LA_FILA.map((red) => (
          <li key={red}>
            <Link
              href={hrefDeTemas(conRed(filtros, red))}
              scroll={false}
              aria-current={filtros.red === red ? "true" : undefined}
              className={cn(CHIP, RED_ELEGIDA)}
            >
              {/* The relief vanishes in forced colors and reads weakly at low vision: the check says it too. */}
              {filtros.red === red ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
              {NOMBRE_DE_RED[red]}
              <CaretDown aria-hidden="true" weight="bold" size={ICONO.chico} />
            </Link>
          </li>
        ))}
        <li>
          <Link href={RUTA_DE_RED_NUEVA} className={cn(CHIP, AGREGAR)}>
            <Plus aria-hidden="true" weight="bold" size={ICONO.chico} />
            Agregar red
          </Link>
        </li>
      </ul>
      <PistaDePestanas
        key={filtros.red}
        actual={filtros.pilar ?? "todos"}
        etiqueta={`Pilares de ${NOMBRE_DE_RED[filtros.red]}`}
        className={PISTA_DE_PILARES}
      >
        {opcionesDePilar.map(opcion)}
        <li key="agregar-pilar" className="shrink-0">
          <Link href={hrefDePilarNuevo(filtros.red)} className={cn(CHIP, AGREGAR)}>
            <Plus aria-hidden="true" weight="bold" size={ICONO.chico} />
            Agregar pilar
          </Link>
        </li>
        {capas.map(opcion)}
      </PistaDePestanas>
    </fieldset>
  )
}
```

3. In `app/(app)/biblioteca/tras-el-aviso.tsx`, change the signature's type to `{ parametro: "oculta" | "mostrada" | "aviso" }` and add to its doc comment the sentence: `A draft's form (15c) leaves \`?aviso=\` the same way.`

4. In `app/(app)/biblioteca/temas/page.tsx`:
   - add the imports `import { contarBorradores } from "@/lib/datos/borradores"`, `import { leerAviso } from "@/lib/dominio/biblioteca/borradores"` and `import { EnlaceABorradores } from "./enlace-a-borradores"` (keep Biome's order);
   - replace `const [pilares, ultimaRed] = await Promise.all([listarPilaresDeTemas(db), leerUltimaRed(db)])` with:

```tsx
  const [pilares, ultimaRed, borradores] = await Promise.all([
    listarPilaresDeTemas(db),
    leerUltimaRed(db),
    contarBorradores(db),
  ])
```

   - after `const ocultaLaUltima = leerIdeaOculta(params) !== null` add:

```tsx
  // A draft's form (15c) came back with its note; hiding a topic's last idea says its own instead.
  const aviso = ocultaLaUltima ? null : leerAviso(params)
```

   - replace the two lines `<AvisoDeIdeas texto={ocultaLaUltima ? AVISO_TRAS_OCULTAR_LA_ULTIMA : null} />` and `{ocultaLaUltima ? <TrasElAviso parametro="oculta" /> : null}` with:

```tsx
        <AvisoDeIdeas texto={ocultaLaUltima ? AVISO_TRAS_OCULTAR_LA_ULTIMA : aviso} />
        {ocultaLaUltima ? <TrasElAviso parametro="oculta" /> : null}
        {aviso ? <TrasElAviso parametro="aviso" /> : null}
```

   - replace `<FilaDeTemas filtros={filtros} pilares={pilares} sinTratar={conteos.sinTratar} />` with:

```tsx
          <FilaDeTemas filtros={filtros} pilares={pilares} sinTratar={conteos.sinTratar} />
          <EnlaceABorradores cantidad={borradores} />
```

- [ ] **Step 4: Run them**

Run: `pnpm test:run tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx tests/unit/biblioteca-tras-el-aviso.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts && pnpm type && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/enlace-a-borradores.tsx" "app/(app)/biblioteca/temas/fila-de-temas.tsx" \
  "app/(app)/biblioteca/temas/page.tsx" "app/(app)/biblioteca/tras-el-aviso.tsx" \
  tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx \
  tests/unit/biblioteca-tras-el-aviso.test.tsx
git commit -m "Add «Agregar red», «Agregar pilar» and «Borradores · N» to the Temas row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: The pillar draft form and `/biblioteca/temas/pilar-nuevo`

**Files:**
- Create: `tests/unit/biblioteca-formulario-de-pilar.test.tsx`
- Create: `app/(app)/biblioteca/temas/formulario-de-pilar.tsx`
- Create: `app/(app)/biblioteca/temas/pilar-nuevo/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-formulario-de-pilar.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { guardarBorradorDePilarAccion, editarBorradorDePilarAccion } = vi.hoisted(() => ({
  guardarBorradorDePilarAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  editarBorradorDePilarAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => ({
  guardarBorradorDePilarAccion,
  editarBorradorDePilarAccion,
}))

import { FormularioDePilar } from "@/app/(app)/biblioteca/temas/formulario-de-pilar"
import { ERRORES_DE_PILAR } from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const CANCELAR = "/biblioteca/temas?red=linkedin"

beforeEach(() => vi.clearAllMocks())

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
}

function llenarTodo() {
  escribir("Nombre", "  Liderazgo sereno: decidir con IA ")
  escribir("Nombre corto", "Liderazgo sereno")
  escribir("Definición", "Cómo decide una líder cuando la IA acelera todo.")
  escribir("Peso (%)", "12,5")
}

describe("FormularioDePilar", () => {
  it("saves a new draft of the network it was opened for, trimmed and with the weight read her way", async () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    llenarTodo()
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(guardarBorradorDePilarAccion).toHaveBeenCalledWith({
        red: "linkedin",
        nombre: "Liderazgo sereno: decidir con IA",
        nombreCorto: "Liderazgo sereno",
        descripcion: "Cómo decide una líder cuando la IA acelera todo.",
        peso: 12.5,
      }),
    )
  })

  it("says what is missing, marks that field, gives it the focus and sends nothing", () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    llenarTodo()
    escribir("Nombre corto", "  ")
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    expect(screen.getByRole("alert")).toHaveTextContent(ERRORES_DE_PILAR.nombreCorto)
    const campo = screen.getByLabelText("Nombre corto")
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(campo).toHaveFocus()
    expect(campo.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").parentElement?.id ?? "-")
    expect(guardarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("refuses a weight that is not over 0 and up to 100", () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "instagram" }} cancelar={CANCELAR} />)
    llenarTodo()
    escribir("Peso (%)", "120")
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    expect(screen.getByRole("alert")).toHaveTextContent(ERRORES_DE_PILAR.peso)
    expect(screen.getByLabelText("Peso (%)")).toHaveFocus()
    expect(guardarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("edits a saved draft from its values", async () => {
    render(
      <FormularioDePilar
        modo={{ tipo: "editar", id: ID }}
        inicial={{ nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: "10" }}
        cancelar="/biblioteca/temas/borradores"
      />,
    )
    expect(screen.getByLabelText("Nombre corto")).toHaveValue("Sereno")
    escribir("Peso (%)", "15")
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(editarBorradorDePilarAccion).toHaveBeenCalledWith({
        id: ID,
        nombre: "Liderazgo sereno",
        nombreCorto: "Sereno",
        descripcion: "Cómo decide.",
        peso: 15,
      }),
    )
    expect(guardarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("says the server's refusal, and Cancelar is a link back that saves nothing", async () => {
    guardarBorradorDePilarAccion.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    llenarTodo()
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Esta app es solo para Coni."))
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", CANCELAR)
  })

  it("labels every field and explains the short name and the weight", () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    expect(screen.getByLabelText("Nombre corto")).toHaveAccessibleDescription("Es el texto del botón en Temas.")
    expect(screen.getByLabelText("Peso (%)")).toHaveAttribute("inputmode", "decimal")
    expect(screen.getByLabelText("Definición").tagName).toBe("TEXTAREA")
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-formulario-de-pilar.test.tsx`
Expected: FAIL: `Failed to resolve import "@/app/(app)/biblioteca/temas/formulario-de-pilar"`.

- [ ] **Step 3: Implement**

1. Create `app/(app)/biblioteca/temas/formulario-de-pilar.tsx`:

```tsx
"use client"

import Link from "next/link"
import { type ChangeEvent, type FormEvent, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import {
  armarBorradorDePilar,
  CAMPOS_DE_PILAR_VACIOS,
  type CampoDePilar,
  type CamposDePilar,
  LARGOS,
} from "@/lib/dominio/biblioteca/borradores"
import type { Red } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { editarBorradorDePilarAccion, guardarBorradorDePilarAccion } from "./borradores/acciones"

type Modo = { tipo: "nuevo"; red: Red } | { tipo: "editar"; id: string }

interface Propiedades {
  modo: Modo
  inicial?: CamposDePilar
  /** Where Cancelar goes: Temas on the network, or Borradores. */
  cancelar: string
}

/**
 * Spec 15c: a pillar draft (name, short name, definition, weight). It is checked here in her words before it is sent;
 * the field that failed says so and takes the focus. The action answers with the next screen itself.
 */
export function FormularioDePilar({ modo, inicial = CAMPOS_DE_PILAR_VACIOS, cancelar }: Propiedades) {
  const id = useId()
  const idDelError = `${id}-error`
  const [campos, setCampos] = useState(inicial)
  const [invalido, setInvalido] = useState<{ error: string; campo: CampoDePilar } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  const idDe = (campo: CampoDePilar) => `${id}-${campo}`
  const cambiar = (campo: CampoDePilar) => (evento: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCampos((actuales) => ({ ...actuales, [campo]: evento.target.value }))
  /** The field the error is about says so and points at it; its hint stays described too. */
  const marca = (campo: CampoDePilar, conAyuda = false) => {
    const conError = invalido?.campo === campo
    const descripcion = [conError ? idDelError : null, conAyuda ? `${idDe(campo)}-ayuda` : null]
      .filter((parte) => parte !== null)
      .join(" ")
    return {
      id: idDe(campo),
      "aria-invalid": conError || undefined,
      "aria-describedby": descripcion === "" ? undefined : descripcion,
    }
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const armado = armarBorradorDePilar(campos)
    if (!armado.ok) {
      setInvalido({ error: armado.error, campo: armado.campo })
      document.getElementById(idDe(armado.campo))?.focus()
      return
    }
    setInvalido(null)
    const { datos } = armado
    ejecutar<object>(() =>
      modo.tipo === "nuevo"
        ? guardarBorradorDePilarAccion({ ...datos, red: modo.red })
        : editarBorradorDePilarAccion({ ...datos, id: modo.id }),
    )
  }

  return (
    <form onSubmit={guardar} noValidate className="grid gap-5">
      <Campo id={idDe("nombre")} etiqueta="Nombre">
        <input
          type="text"
          autoComplete="off"
          maxLength={LARGOS.nombre}
          value={campos.nombre}
          onChange={cambiar("nombre")}
          {...marca("nombre")}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <Campo id={idDe("nombreCorto")} etiqueta="Nombre corto" ayuda="Es el texto del botón en Temas.">
        <input
          type="text"
          autoComplete="off"
          maxLength={LARGOS.nombreCorto}
          value={campos.nombreCorto}
          onChange={cambiar("nombreCorto")}
          {...marca("nombreCorto", true)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <Campo
        id={idDe("descripcion")}
        etiqueta="Definición"
        ayuda="Lo que el motor lee para proponer ideas de este pilar."
      >
        <textarea
          rows={5}
          maxLength={LARGOS.descripcion}
          value={campos.descripcion}
          onChange={cambiar("descripcion")}
          {...marca("descripcion", true)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <Campo
        id={idDe("peso")}
        etiqueta="Peso (%)"
        ayuda="Cuánto de la red le toca. Al aprobarlo puedes repartir los pesos de los demás."
      >
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={campos.peso}
          onChange={cambiar("peso")}
          {...marca("peso", true)}
          className={cn(CLASES_DE_CAMPO, "tabular-nums")}
        />
      </Campo>
      {invalido ? (
        <div id={idDelError}>
          <LineaDeError>{invalido.error}</LineaDeError>
        </div>
      ) : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={pendiente} className="md:w-auto">
          Guardar borrador
        </Boton>
        <Link href={cancelar} className={cn(clasesDeBoton({ variante: "secundario" }), "md:w-auto")}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
```

2. Create `app/(app)/biblioteca/temas/pilar-nuevo/page.tsx`:

```tsx
import { Volver } from "@/components/ui/volver"
import { leerUltimaRed } from "@/lib/datos/biblioteca"
import { leerRedPedida } from "@/lib/dominio/biblioteca/borradores"
import { hrefDeTemas } from "@/lib/dominio/biblioteca/fila-de-temas"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { FormularioDePilar } from "../formulario-de-pilar"

/** «+ Agregar pilar» (spec 15c): the network comes from the address and shows as text. */
export default async function PilarNuevo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const red = leerRedPedida(params, await leerUltimaRed(db))
  const volver = hrefDeTemas({ red })
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={volver}>Temas</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">Nuevo pilar</h1>
        <p className="text-cuerpo">{`Red: ${NOMBRE_DE_RED[red]}`}</p>
        <p className="text-meta text-apagado">
          Se guarda como borrador. Entra a la lista de Temas cuando lo apruebes en Borradores.
        </p>
      </header>
      <FormularioDePilar modo={{ tipo: "nuevo", red }} cancelar={volver} />
    </div>
  )
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/biblioteca-formulario-de-pilar.test.tsx tests/unit/diseno-reglas.test.ts && pnpm type && pnpm lint && head -1 "app/(app)/biblioteca/temas/formulario-de-pilar.tsx"`
Expected: PASS, and the last line prints `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/formulario-de-pilar.tsx" "app/(app)/biblioteca/temas/pilar-nuevo/page.tsx" \
  tests/unit/biblioteca-formulario-de-pilar.test.tsx
git commit -m "Add the pillar draft form behind «Agregar pilar»" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The network draft form and `/biblioteca/temas/red-nueva`

**Files:**
- Create: `tests/unit/biblioteca-formulario-de-red.test.tsx`
- Create: `app/(app)/biblioteca/temas/formulario-de-red.tsx`
- Create: `app/(app)/biblioteca/temas/red-nueva/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-formulario-de-red.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { guardarBorradorDeRedAccion, editarBorradorDeRedAccion } = vi.hoisted(() => ({
  guardarBorradorDeRedAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  editarBorradorDeRedAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => ({
  guardarBorradorDeRedAccion,
  editarBorradorDeRedAccion,
}))

import { FormularioDeRed } from "@/app/(app)/biblioteca/temas/formulario-de-red"
import { FALTA_NOMBRE_DE_RED } from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"

beforeEach(() => vi.clearAllMocks())

describe("FormularioDeRed", () => {
  it("saves a network with only its name; the three notes are optional and multi-line", async () => {
    render(<FormularioDeRed modo={{ tipo: "nuevo" }} cancelar="/biblioteca/temas" />)
    for (const etiqueta of ["Manual (opcional)", "Receta (opcional)", "Conexión (opcional)"]) {
      expect(screen.getByLabelText(etiqueta).tagName).toBe("TEXTAREA")
    }
    expect(screen.getByLabelText("Conexión (opcional)")).toHaveAccessibleDescription(
      "Qué cuenta usar para publicar. No escribas contraseñas aquí.",
    )
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " TikTok " } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(guardarBorradorDeRedAccion).toHaveBeenCalledWith({ nombre: "TikTok", manual: "", receta: "", conexion: "" }),
    )
  })

  it("says a missing name and focuses it", () => {
    render(<FormularioDeRed modo={{ tipo: "nuevo" }} cancelar="/biblioteca/temas" />)
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    expect(screen.getByRole("alert")).toHaveTextContent(FALTA_NOMBRE_DE_RED)
    expect(screen.getByLabelText("Nombre")).toHaveFocus()
    expect(guardarBorradorDeRedAccion).not.toHaveBeenCalled()
  })

  it("edits a saved network draft from its values", async () => {
    render(
      <FormularioDeRed
        modo={{ tipo: "editar", id: ID }}
        inicial={{ nombre: "TikTok", manual: "Videos cortos.", receta: "", conexion: "" }}
        cancelar="/biblioteca/temas/borradores"
      />,
    )
    expect(screen.getByLabelText("Manual (opcional)")).toHaveValue("Videos cortos.")
    fireEvent.change(screen.getByLabelText("Receta (opcional)"), { target: { value: "Un gancho y tres pasos." } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(editarBorradorDeRedAccion).toHaveBeenCalledWith({
        id: ID,
        nombre: "TikTok",
        manual: "Videos cortos.",
        receta: "Un gancho y tres pasos.",
        conexion: "",
      }),
    )
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/biblioteca/temas/borradores")
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-formulario-de-red.test.tsx`
Expected: FAIL: `Failed to resolve import "@/app/(app)/biblioteca/temas/formulario-de-red"`.

- [ ] **Step 3: Implement**

1. Create `app/(app)/biblioteca/temas/formulario-de-red.tsx`:

```tsx
"use client"

import Link from "next/link"
import { type ChangeEvent, type FormEvent, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import {
  armarBorradorDeRed,
  CAMPOS_DE_RED_VACIOS,
  type CampoDeRed,
  type CamposDeRed,
  LARGOS,
} from "@/lib/dominio/biblioteca/borradores"
import { cn } from "@/lib/utils"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { editarBorradorDeRedAccion, guardarBorradorDeRedAccion } from "./borradores/acciones"

type Modo = { tipo: "nuevo" } | { tipo: "editar"; id: string }

interface Propiedades {
  modo: Modo
  inicial?: CamposDeRed
  cancelar: string
}

const NOTAS: { campo: Exclude<CampoDeRed, "nombre">; etiqueta: string; ayuda: string }[] = [
  { campo: "manual", etiqueta: "Manual (opcional)", ayuda: "A quién le habla la red y qué pilares tendría." },
  { campo: "receta", etiqueta: "Receta (opcional)", ayuda: "Cómo se arma una pieza para esa red." },
  {
    campo: "conexion",
    etiqueta: "Conexión (opcional)",
    // Decision 17: a plain text column that WAV reads.
    ayuda: "Qué cuenta usar para publicar. No escribas contraseñas aquí.",
  },
]

/** Spec 15c: a network draft keeps her idea; WAV builds the network. Only the name is needed. */
export function FormularioDeRed({ modo, inicial = CAMPOS_DE_RED_VACIOS, cancelar }: Propiedades) {
  const id = useId()
  const idDelError = `${id}-error`
  const [campos, setCampos] = useState(inicial)
  const [invalido, setInvalido] = useState<{ error: string; campo: CampoDeRed } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  const idDe = (campo: CampoDeRed) => `${id}-${campo}`
  const cambiar = (campo: CampoDeRed) => (evento: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCampos((actuales) => ({ ...actuales, [campo]: evento.target.value }))
  const marca = (campo: CampoDeRed, conAyuda: boolean) => {
    const conError = invalido?.campo === campo
    const descripcion = [conError ? idDelError : null, conAyuda ? `${idDe(campo)}-ayuda` : null]
      .filter((parte) => parte !== null)
      .join(" ")
    return {
      id: idDe(campo),
      "aria-invalid": conError || undefined,
      "aria-describedby": descripcion === "" ? undefined : descripcion,
    }
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const armado = armarBorradorDeRed(campos)
    if (!armado.ok) {
      setInvalido({ error: armado.error, campo: armado.campo })
      document.getElementById(idDe(armado.campo))?.focus()
      return
    }
    setInvalido(null)
    const { datos } = armado
    ejecutar<object>(() =>
      modo.tipo === "nuevo" ? guardarBorradorDeRedAccion(datos) : editarBorradorDeRedAccion({ ...datos, id: modo.id }),
    )
  }

  return (
    <form onSubmit={guardar} noValidate className="grid gap-5">
      <Campo id={idDe("nombre")} etiqueta="Nombre">
        <input
          type="text"
          autoComplete="off"
          maxLength={LARGOS.nombreDeRed}
          value={campos.nombre}
          onChange={cambiar("nombre")}
          {...marca("nombre", false)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      {NOTAS.map(({ campo, etiqueta, ayuda }) => (
        <Campo key={campo} id={idDe(campo)} etiqueta={etiqueta} ayuda={ayuda}>
          <textarea
            rows={4}
            maxLength={LARGOS.notaDeRed}
            value={campos[campo]}
            onChange={cambiar(campo)}
            {...marca(campo, true)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
      ))}
      {invalido ? (
        <div id={idDelError}>
          <LineaDeError>{invalido.error}</LineaDeError>
        </div>
      ) : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={pendiente} className="md:w-auto">
          Guardar borrador
        </Boton>
        <Link href={cancelar} className={cn(clasesDeBoton({ variante: "secundario" }), "md:w-auto")}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
```

2. Create `app/(app)/biblioteca/temas/red-nueva/page.tsx`:

```tsx
import { Volver } from "@/components/ui/volver"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { FormularioDeRed } from "../formulario-de-red"

/** «+ Agregar red» (spec 15c): a draft that waits for WAV; it is never approved here. */
export default async function RedNueva() {
  await exigirConi()
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">Nueva red</h1>
        <p className="text-cuerpo">WAV conecta la red cuando esté lista. Este borrador solo guarda tu idea.</p>
      </header>
      <FormularioDeRed modo={{ tipo: "nuevo" }} cancelar={RUTA_DE_TEMAS} />
    </div>
  )
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/biblioteca-formulario-de-red.test.tsx tests/unit/diseno-reglas.test.ts && pnpm type && pnpm lint && head -1 "app/(app)/biblioteca/temas/formulario-de-red.tsx"`
Expected: PASS, and `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/formulario-de-red.tsx" "app/(app)/biblioteca/temas/red-nueva/page.tsx" \
  tests/unit/biblioteca-formulario-de-red.test.tsx
git commit -m "Add the network draft form behind «Agregar red»" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Borradores, its cards, Descartar and the edit page

**Files:**
- Create: `tests/unit/biblioteca-pagina-borradores.test.tsx`
- Create: `app/(app)/biblioteca/temas/borradores/page.tsx`
- Create: `app/(app)/biblioteca/temas/borradores/tarjetas-de-borrador.tsx`
- Create: `app/(app)/biblioteca/temas/borradores/boton-descartar.tsx`
- Create: `app/(app)/biblioteca/temas/borradores/[id]/editar/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-pagina-borradores.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { esConi, datos, acciones } = vi.hoisted(() => ({
  esConi: { valor: true },
  datos: {
    listarBorradores: vi.fn(async (): Promise<unknown> => ({ pilares: [], redes: [] })),
    leerBorrador: vi.fn(async (..._: unknown[]): Promise<unknown> => null),
    contarBorradores: vi.fn(async (): Promise<number> => 0),
  },
  acciones: {
    descartarBorradorAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
    guardarBorradorDePilarAccion: vi.fn(),
    editarBorradorDePilarAccion: vi.fn(),
    guardarBorradorDeRedAccion: vi.fn(),
    editarBorradorDeRedAccion: vi.fn(),
    aprobarBorradorDePilarAccion: vi.fn(),
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "coni@ejemplo.cl" } } }) },
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
vi.mock("@/lib/datos/borradores", () => datos)
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => acciones)

import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import EditarBorrador from "@/app/(app)/biblioteca/temas/borradores/[id]/editar/page"
import { BotonDescartar } from "@/app/(app)/biblioteca/temas/borradores/boton-descartar"
import Borradores from "@/app/(app)/biblioteca/temas/borradores/page"
import {
  TarjetaDeBorradorDePilar,
  TarjetaDeBorradorDeRed,
} from "@/app/(app)/biblioteca/temas/borradores/tarjetas-de-borrador"
import { FormularioDePilar } from "@/app/(app)/biblioteca/temas/formulario-de-pilar"
import { FormularioDeRed } from "@/app/(app)/biblioteca/temas/formulario-de-red"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { AVISOS, type BorradorDePilar, type BorradorDeRed } from "@/lib/dominio/biblioteca/borradores"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const textos = (arbol: Elemento[]) =>
  arbol.map((elemento) => elemento.props.children).filter((c): c is string => typeof c === "string")

const ID_1 = "11111111-2222-4333-8444-555555555555"
const ID_2 = "22222222-2222-4333-8444-555555555555"
const ID_3 = "33333333-2222-4333-8444-555555555555"
const DE_INSTAGRAM: BorradorDePilar = {
  id: ID_1,
  red: "instagram",
  nombre: "Cuerpo y pantalla",
  nombreCorto: "Cuerpo y pantalla",
  descripcion: "Lo que el cuerpo dice frente a la pantalla.",
  peso: 12.5,
}
const DE_LINKEDIN: BorradorDePilar = { ...DE_INSTAGRAM, id: ID_2, red: "linkedin", nombre: "Liderazgo sereno", nombreCorto: "Sereno" }
const RED: BorradorDeRed = { id: ID_3, nombre: "TikTok", manual: "Videos cortos.", receta: "", conexion: "" }
const conParams = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) })
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.clearAllMocks())

describe("the Borradores page", () => {
  it("groups pillar drafts by network, LinkedIn first, then the network drafts", async () => {
    datos.listarBorradores.mockResolvedValueOnce({ pilares: [DE_INSTAGRAM, DE_LINKEDIN], redes: [RED] })
    const arbol = elementos(await Borradores(conParams({})))
    expect(textos(arbol)).toEqual(expect.arrayContaining(["Borradores", "Pilares de LinkedIn", "Pilares de Instagram", "Redes"]))
    const tarjetas = arbol.filter((e) => e.type === TarjetaDeBorradorDePilar || e.type === TarjetaDeBorradorDeRed)
    expect(tarjetas.map((e) => (e.props.borrador as { id: string }).id)).toEqual([ID_2, ID_1, ID_3])
  })

  it("says there are none, and says the note an edit or a discard left", async () => {
    const arbol = elementos(await Borradores(conParams({ aviso: "borrador-descartado" })))
    expect(textos(arbol)).toContain("No tienes borradores. Agrega un pilar o una red desde Temas.")
    expect(arbol.find((e) => e.type === AvisoDeIdeas)?.props.texto).toBe(AVISOS["borrador-descartado"])
    expect(arbol.find((e) => e.type === TrasElAviso)?.props).toEqual({ parametro: "aviso" })
  })

  it("is not for anybody but Coni", async () => {
    esConi.valor = false
    await expect(Borradores(conParams({}))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.listarBorradores).not.toHaveBeenCalled()
    esConi.valor = true
  })
})

describe("the cards", () => {
  it("shows a pillar draft with Aprobar, Editar and Descartar, each named by the draft", () => {
    render(<TarjetaDeBorradorDePilar borrador={DE_INSTAGRAM} />)
    const tarjeta = screen.getByRole("article", { name: "Cuerpo y pantalla" })
    expect(tarjeta).toHaveTextContent("Nombre corto: Cuerpo y pantalla · Peso: 12,5 %")
    expect(tarjeta).toHaveTextContent("Lo que el cuerpo dice frente a la pantalla.")
    expect(screen.getByRole("link", { name: "Aprobar" })).toHaveAttribute("href", `/biblioteca/temas/borradores/${ID_1}/aprobar`)
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", `/biblioteca/temas/borradores/${ID_1}/editar`)
    expect(screen.getByRole("button", { name: "Descartar" })).toHaveAccessibleDescription("Cuerpo y pantalla")
  })

  it("shows a network draft waiting for its connection, with its notes, Editar and Descartar only", () => {
    render(<TarjetaDeBorradorDeRed borrador={RED} />)
    const tarjeta = screen.getByRole("article", { name: "TikTok" })
    expect(tarjeta).toHaveTextContent("Esperando conexión")
    expect(tarjeta).toHaveTextContent("Manual: Videos cortos.")
    expect(tarjeta).not.toHaveTextContent("Receta:")
    expect(screen.queryByRole("link", { name: "Aprobar" })).toBeNull()
    expect(screen.getByRole("link", { name: "Editar" })).toBeInTheDocument()
  })
})

describe("BotonDescartar", () => {
  it("asks before discarding, sends the draft, and Cancelar gives the focus back", async () => {
    render(<BotonDescartar tipo="pilar" id={ID_1} nombre="Cuerpo y pantalla" describe="titulo" />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    expect(screen.getByText("¿Descartar «Cuerpo y pantalla»? Ya no lo podrás aprobar ni editar.")).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Descartar" })).toHaveFocus())
    expect(acciones.descartarBorradorAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(acciones.descartarBorradorAccion).toHaveBeenCalledWith({ tipo: "pilar", id: ID_1 }))
  })
})

describe("the edit page", () => {
  it("opens the pillar form or the network form, prefilled, and returns to Borradores", async () => {
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "pilar", borrador: DE_LINKEDIN })
    let arbol = elementos(await EditarBorrador(conId(ID_2)))
    expect(arbol.find((e) => e.type === FormularioDePilar)?.props).toEqual({
      modo: { tipo: "editar", id: ID_2 },
      inicial: { nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: DE_LINKEDIN.descripcion, peso: "12,5" },
      cancelar: "/biblioteca/temas/borradores",
    })
    expect(textos(arbol)).toContain("Red: LinkedIn")
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "red", borrador: RED })
    arbol = elementos(await EditarBorrador(conId(ID_3)))
    expect(arbol.find((e) => e.type === FormularioDeRed)?.props.modo).toEqual({ tipo: "editar", id: ID_3 })
  })

  it("is not found for what is not an id, or a draft decided or gone", async () => {
    await expect(EditarBorrador(conId("no-es-un-id"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerBorrador).not.toHaveBeenCalled()
    await expect(EditarBorrador(conId(ID_1))).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-pagina-borradores.test.tsx`
Expected: FAIL: the pages and components do not resolve.

- [ ] **Step 3: Implement**

1. Create `app/(app)/biblioteca/temas/borradores/boton-descartar.tsx`:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { useAccion } from "@/components/use-accion"
import { descartarBorradorAccion } from "./acciones"

interface Propiedades {
  tipo: "pilar" | "red"
  id: string
  nombre: string
  /** The id of the card's title, so «Descartar» says which draft. */
  describe: string
}

/** Discarding cannot be undone from the app: it asks in line, as Desconectar does; the action lands on Borradores. */
export function BotonDescartar({ tipo, id, nombre, describe }: Propiedades) {
  const [preguntando, setPreguntando] = useState(false)
  // Cancelar unmounts the question, which held the focus: it goes back to the button that asked.
  const [devolverFoco, setDevolverFoco] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  useEffect(() => {
    if (!devolverFoco || preguntando) return
    boton.current?.focus()
    setDevolverFoco(false)
  }, [devolverFoco, preguntando])

  if (!preguntando) {
    return (
      <Boton
        ref={boton}
        variante="destructiva"
        tamano="chico"
        className="w-fit"
        aria-describedby={describe}
        onClick={() => setPreguntando(true)}
      >
        Descartar
      </Boton>
    )
  }
  return (
    <div className="basis-full">
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta={`¿Descartar «${nombre}»? Ya no lo podrás aprobar ni editar.`}
        confirmar="Descartar"
        volver="Cancelar"
        cargando={pendiente}
        error={error}
        alConfirmar={() => ejecutar(() => descartarBorradorAccion({ tipo, id }))}
        alVolver={() => {
          limpiarError()
          setPreguntando(false)
          setDevolverFoco(true)
        }}
      />
    </div>
  )
}
```

2. Create `app/(app)/biblioteca/temas/borradores/tarjetas-de-borrador.tsx`:

```tsx
import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import {
  type BorradorDePilar,
  type BorradorDeRed,
  ESPERANDO_CONEXION,
  formatoDePeso,
  hrefDeAprobarBorrador,
  hrefDeEditarBorrador,
} from "@/lib/dominio/biblioteca/borradores"
import { BotonDescartar } from "./boton-descartar"

const ACCIONES = "flex flex-wrap items-start gap-3"

/** A pillar draft as she wrote it, with what she can do with it (spec 15c, section 2). */
export function TarjetaDeBorradorDePilar({ borrador }: { borrador: BorradorDePilar }) {
  const titulo = `borrador-${borrador.id}`
  return (
    <article aria-labelledby={titulo}>
      <Panel className="grid gap-3">
        <h3 id={titulo} className="text-cuerpo font-semibold text-balance">
          {borrador.nombre}
        </h3>
        <p className="text-meta text-apagado">
          {`Nombre corto: ${borrador.nombreCorto} · Peso: ${formatoDePeso(borrador.peso)} %`}
        </p>
        <p className="text-cuerpo whitespace-pre-line">{borrador.descripcion}</p>
        <div className={ACCIONES}>
          <Link
            href={hrefDeAprobarBorrador(borrador.id)}
            aria-describedby={titulo}
            className={clasesDeBoton({ variante: "primario", tamano: "chico" })}
          >
            Aprobar
          </Link>
          <Link
            href={hrefDeEditarBorrador(borrador.id)}
            aria-describedby={titulo}
            className={clasesDeBoton({ variante: "secundario", tamano: "chico" })}
          >
            Editar
          </Link>
          <BotonDescartar tipo="pilar" id={borrador.id} nombre={borrador.nombre} describe={titulo} />
        </div>
      </Panel>
    </article>
  )
}

const NOTAS = [
  ["manual", "Manual"],
  ["receta", "Receta"],
  ["conexion", "Conexión"],
] as const

/** A network draft never gets «Aprobar» here: WAV builds the network (decision 3 of the spec). */
export function TarjetaDeBorradorDeRed({ borrador }: { borrador: BorradorDeRed }) {
  const titulo = `borrador-${borrador.id}`
  return (
    <article aria-labelledby={titulo}>
      <Panel className="grid gap-3">
        <h3 id={titulo} className="text-cuerpo font-semibold text-balance">
          {borrador.nombre}
        </h3>
        <LineaDeEstado tipo="neutro" titulo={ESPERANDO_CONEXION} enVivo={false} />
        {NOTAS.filter(([campo]) => borrador[campo] !== "").map(([campo, etiqueta]) => (
          <p key={campo} className="text-meta whitespace-pre-line">
            <span className="font-semibold">{`${etiqueta}: `}</span>
            {borrador[campo]}
          </p>
        ))}
        <div className={ACCIONES}>
          <Link
            href={hrefDeEditarBorrador(borrador.id)}
            aria-describedby={titulo}
            className={clasesDeBoton({ variante: "secundario", tamano: "chico" })}
          >
            Editar
          </Link>
          <BotonDescartar tipo="red" id={borrador.id} nombre={borrador.nombre} describe={titulo} />
        </div>
      </Panel>
    </article>
  )
}
```

3. Create `app/(app)/biblioteca/temas/borradores/page.tsx`:

```tsx
import { Volver } from "@/components/ui/volver"
import { listarBorradores } from "@/lib/datos/borradores"
import { leerAviso } from "@/lib/dominio/biblioteca/borradores"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { porRed } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeIdeas } from "../../aviso-de-ideas"
import { TrasElAviso } from "../../tras-el-aviso"
import { TarjetaDeBorradorDePilar, TarjetaDeBorradorDeRed } from "./tarjetas-de-borrador"

/** Spec 15c: the drafts that wait, pillars by network and then networks; approving is a second, separate step. */
export default async function Borradores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const { pilares, redes } = await listarBorradores(db)
  const aviso = leerAviso(params)
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <h1 className="text-pantalla">Borradores</h1>
      <AvisoDeIdeas texto={aviso} />
      {aviso ? <TrasElAviso parametro="aviso" /> : null}
      {pilares.length === 0 && redes.length === 0 ? (
        <p className="text-cuerpo text-apagado">No tienes borradores. Agrega un pilar o una red desde Temas.</p>
      ) : null}
      {porRed(pilares).map((grupo) => {
        const idDelTitulo = `borradores-${grupo.red ?? "sin-red"}`
        return (
          <section key={idDelTitulo} aria-labelledby={idDelTitulo} className="grid gap-3">
            <h2 id={idDelTitulo} className="text-pieza">
              {`Pilares de ${grupo.etiqueta}`}
            </h2>
            <ul className="grid gap-3">
              {grupo.pilares.map((borrador) => (
                <li key={borrador.id}>
                  <TarjetaDeBorradorDePilar borrador={borrador} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {redes.length > 0 ? (
        <section aria-labelledby="borradores-redes" className="grid gap-3">
          <h2 id="borradores-redes" className="text-pieza">
            Redes
          </h2>
          <ul className="grid gap-3">
            {redes.map((borrador) => (
              <li key={borrador.id}>
                <TarjetaDeBorradorDeRed borrador={borrador} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
```

4. Create `app/(app)/biblioteca/temas/borradores/[id]/editar/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { z } from "zod"
import { Volver } from "@/components/ui/volver"
import { leerBorrador } from "@/lib/datos/borradores"
import {
  camposDeBorradorDePilar,
  camposDeBorradorDeRed,
  RUTA_DE_BORRADORES,
} from "@/lib/dominio/biblioteca/borradores"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { FormularioDePilar } from "../../../formulario-de-pilar"
import { FormularioDeRed } from "../../../formulario-de-red"

/** Decision 10: one address for both kinds; a draft already decided cannot be edited (row level security agrees). */
export default async function EditarBorrador({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const leido = await leerBorrador(db, valido.data)
  if (!leido) notFound()
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_BORRADORES}>Borradores</Volver>
      {leido.tipo === "pilar" ? (
        <>
          <header className="grid gap-2">
            <h1 className="text-pantalla text-balance">Editar borrador de pilar</h1>
            <p className="text-cuerpo">{`Red: ${NOMBRE_DE_RED[leido.borrador.red]}`}</p>
          </header>
          <FormularioDePilar
            modo={{ tipo: "editar", id: leido.borrador.id }}
            inicial={camposDeBorradorDePilar(leido.borrador)}
            cancelar={RUTA_DE_BORRADORES}
          />
        </>
      ) : (
        <>
          <h1 className="text-pantalla text-balance">Editar borrador de red</h1>
          <FormularioDeRed
            modo={{ tipo: "editar", id: leido.borrador.id }}
            inicial={camposDeBorradorDeRed(leido.borrador)}
            cancelar={RUTA_DE_BORRADORES}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/biblioteca-pagina-borradores.test.tsx tests/unit/diseno-reglas.test.ts && pnpm type && pnpm lint && head -1 "app/(app)/biblioteca/temas/borradores/boton-descartar.tsx"`
Expected: PASS, and `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/borradores/page.tsx" "app/(app)/biblioteca/temas/borradores/tarjetas-de-borrador.tsx" \
  "app/(app)/biblioteca/temas/borradores/boton-descartar.tsx" "app/(app)/biblioteca/temas/borradores/[id]/editar/page.tsx" \
  tests/unit/biblioteca-pagina-borradores.test.tsx
git commit -m "List the drafts in Borradores, edit them and discard them after asking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: The approval screen, stage by stage

**Files:**
- Create: `tests/unit/biblioteca-aprobar-pilar.test.tsx`
- Create: `app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar.tsx`
- Create: `app/(app)/biblioteca/temas/borradores/[id]/aprobar/page.tsx`
- Modify: `tests/unit/biblioteca-pagina-borradores.test.tsx`

- [ ] **Step 1: Write the failing tests**

1. Create `tests/unit/biblioteca-aprobar-pilar.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { aprobarBorradorDePilarAccion } = vi.hoisted(() => ({
  aprobarBorradorDePilarAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => ({ aprobarBorradorDePilarAccion }))

import { AprobarPilar } from "@/app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar"
import { AVISO_DE_LA_GUIA, type EtapaEditable } from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const HOY = "2026-11-05"
const BORRADOR = {
  id: ID,
  red: "linkedin" as const,
  nombre: "Liderazgo sereno: decidir con IA",
  nombreCorto: "Liderazgo sereno",
  descripcion: "Cómo decide.",
  peso: 10,
}
const fila = (clave: string, nombre: string, peso: string) => ({ clave, nombre, peso })
const ETAPAS: EtapaEditable[] = [
  {
    desde: HOY,
    esHoy: true,
    etiqueta: "Hoy",
    filas: [
      fila("a", "Diagnóstico doble", "30"),
      fila("b", "Bienestar e impacto", "25"),
      fila("c", "Psicología en la mesa", "30"),
      fila("d", "Mujeres líderes", "15"),
      fila("nuevo", "Liderazgo sereno", "10"),
    ],
  },
  {
    desde: "2027-01-01",
    esHoy: false,
    etiqueta: "Desde el 1 de enero de 2027",
    filas: [
      fila("a", "Diagnóstico doble", "25"),
      fila("b", "Bienestar e impacto", "25"),
      fila("c", "Psicología en la mesa", "35"),
      fila("d", "Mujeres líderes", "15"),
      fila("nuevo", "Liderazgo sereno", "10"),
    ],
  },
]
const AVISO_DE_HOY = "Los pesos de LinkedIn suman 110 %. Puedes aprobar igual y ajustarlos después."
const AVISO_DE_ENERO =
  "Los pesos de LinkedIn desde el 1 de enero de 2027 suman 110 %. Puedes aprobar igual y ajustarlos después."

beforeEach(() => vi.clearAllMocks())

function abrir() {
  render(<AprobarPilar borrador={BORRADOR} etapas={ETAPAS} cancelar="/biblioteca/temas/borradores" />)
}

describe("AprobarPilar", () => {
  it("shows each stage as its own group with every weight and the new one, its live total and its warning", () => {
    abrir()
    const hoy = screen.getByRole("group", { name: "Hoy" })
    const enero = screen.getByRole("group", { name: "Desde el 1 de enero de 2027" })
    expect(within(hoy).getByLabelText("Liderazgo sereno · nuevo, Hoy")).toHaveValue("10")
    expect(within(enero).getByLabelText("Psicología en la mesa, Desde el 1 de enero de 2027")).toHaveValue("35")
    // Each total and each warning is a polite status (`<output>`): read by its text, inside its stage.
    expect(within(hoy).getByText("Total: 110 %").tagName).toBe("OUTPUT")
    expect(within(hoy).getByText(AVISO_DE_HOY)).toBeInTheDocument()
    expect(within(enero).getByText(AVISO_DE_ENERO)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Diagnóstico doble, Hoy"), { target: { value: "20" } })
    expect(within(hoy).getByText("Total: 100 %")).toBeInTheDocument()
    expect(within(hoy).queryByText(/suman/)).toBeNull()
    expect(within(enero).getByText("Total: 110 %")).toBeInTheDocument()
  })

  it("approves with every stage's weights as numbers, the new one under «nuevo», even when they do not add up to 100", async () => {
    abrir()
    fireEvent.change(screen.getByLabelText("Liderazgo sereno · nuevo, Desde el 1 de enero de 2027"), {
      target: { value: "12,5" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aprobar pilar" }))
    await waitFor(() =>
      expect(aprobarBorradorDePilarAccion).toHaveBeenCalledWith({
        id: ID,
        pesos: {
          [HOY]: { a: 30, b: 25, c: 30, d: 15, nuevo: 10 },
          "2027-01-01": { a: 25, b: 25, c: 35, d: 15, nuevo: 12.5 },
        },
      }),
    )
  })

  it("names the weight it cannot read with its stage, focuses it and approves nothing", () => {
    abrir()
    const campo = screen.getByLabelText("Bienestar e impacto, Desde el 1 de enero de 2027")
    fireEvent.change(campo, { target: { value: "" } })
    expect(
      within(screen.getByRole("group", { name: "Desde el 1 de enero de 2027" })).getByText(
        "Total: falta un peso válido",
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar pilar" }))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribe el peso de Bienestar e impacto (Desde el 1 de enero de 2027) como un número mayor que 0 y hasta 100.",
    )
    expect(campo).toHaveFocus()
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Bienestar e impacto, Hoy")).not.toHaveAttribute("aria-invalid")
    expect(aprobarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("says the guide is not updated by the app, and a refusal", async () => {
    aprobarBorradorDePilarAccion.mockResolvedValueOnce({ ok: false, error: "Ese nombre ya lo tiene otro pilar." })
    abrir()
    expect(screen.getByText(AVISO_DE_LA_GUIA)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar pilar" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ese nombre ya lo tiene otro pilar."))
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/biblioteca/temas/borradores")
  })
})
```

2. In `tests/unit/biblioteca-pagina-borradores.test.tsx`:
   - add to the hoisted block a `pilares` entry, `pilares: { etapasDeRed: vi.fn(async (..._: unknown[]): Promise<unknown> => []) },`, destructure it next to `datos`, and add `vi.mock("@/lib/datos/pilares", () => pilares)`;
   - import `import AprobarBorrador from "@/app/(app)/biblioteca/temas/borradores/[id]/aprobar/page"` and `import { AprobarPilar } from "@/app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar"`;
   - append:

```tsx
describe("the approval page", () => {
  it("hands the editor today's stage and each later one of the network, with the new pillar in every stage", async () => {
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "pilar", borrador: DE_LINKEDIN })
    // The page passes today's date in Chile: the first stage is that date, whatever day the test runs.
    pilares.etapasDeRed.mockImplementationOnce(async (...args: unknown[]) => [
      {
        desde: String(args[2]),
        pesos: [{ id: "a", slug: "x", nombreCorto: "Diagnóstico doble", peso: 30 }],
        total: 30,
        sumaCien: false,
      },
      {
        desde: "2099-01-01",
        pesos: [{ id: "a", slug: "x", nombreCorto: "Diagnóstico doble", peso: 25 }],
        total: 25,
        sumaCien: false,
      },
    ])
    const arbol = elementos(await AprobarBorrador(conId(ID_2)))
    expect(pilares.etapasDeRed).toHaveBeenCalledWith(
      expect.anything(),
      "linkedin",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    )
    const props = arbol.find((e) => e.type === AprobarPilar)?.props
    expect(props?.borrador).toEqual(DE_LINKEDIN)
    expect(props?.cancelar).toBe("/biblioteca/temas/borradores")
    expect(props?.etapas).toEqual([
      {
        desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        esHoy: true,
        etiqueta: "Hoy",
        filas: [
          { clave: "a", nombre: "Diagnóstico doble", peso: "30" },
          { clave: "nuevo", nombre: "Sereno", peso: "12,5" },
        ],
      },
      {
        desde: "2099-01-01",
        esHoy: false,
        etiqueta: "Desde el 1 de enero de 2099",
        filas: [
          { clave: "a", nombre: "Diagnóstico doble", peso: "25" },
          { clave: "nuevo", nombre: "Sereno", peso: "12,5" },
        ],
      },
    ])
  })

  it("is not found for a network draft, a decided draft or what is not an id", async () => {
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "red", borrador: RED })
    await expect(AprobarBorrador(conId(ID_3))).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(AprobarBorrador(conId(ID_1))).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(AprobarBorrador(conId("x"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(pilares.etapasDeRed).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/biblioteca-aprobar-pilar.test.tsx tests/unit/biblioteca-pagina-borradores.test.tsx`
Expected: FAIL: the approval page and `AprobarPilar` do not resolve.

- [ ] **Step 3: Implement**

1. Create `app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar.tsx`:

```tsx
"use client"

import Link from "next/link"
import { type FormEvent, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import {
  armarPesos,
  AVISO_DE_LA_GUIA,
  avisoDePesos,
  type BorradorDePilar,
  type EtapaEditable,
  formatoDePeso,
  NUEVO,
  totalDePesos,
} from "@/lib/dominio/biblioteca/borradores"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { CLASES_DE_CAMPO } from "../../../../campo"
import { aprobarBorradorDePilarAccion } from "../../acciones"

interface Propiedades {
  borrador: BorradorDePilar
  /** «Hoy» and each later stage of the network, the new pillar last in each (`etapasDeAprobacion`). */
  etapas: EtapaEditable[]
  cancelar: string
}

/**
 * Spec 15c, decision 8: every stage of the network's weights from today on, each with every pillar and the new one,
 * editable, its own live total and its own warning when it is not 100 (it never blocks). Columns on the computer,
 * blocks one under another on the phone. The database writes only what changed, on each stage's date.
 */
export function AprobarPilar({ borrador, etapas: iniciales, cancelar }: Propiedades) {
  const id = useId()
  const idDelError = `${id}-error`
  const [etapas, setEtapas] = useState(iniciales)
  const [invalido, setInvalido] = useState<{ error: string; desde: string; clave: string } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()
  const idDe = (desde: string, clave: string) => `${id}-${desde}-${clave}`

  function cambiar(desde: string, clave: string, peso: string) {
    setEtapas((actuales) =>
      actuales.map((etapa) =>
        etapa.desde !== desde
          ? etapa
          : { ...etapa, filas: etapa.filas.map((fila) => (fila.clave === clave ? { ...fila, peso } : fila)) },
      ),
    )
  }

  function aprobar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const armado = armarPesos(etapas)
    if (!armado.ok) {
      setInvalido({ error: armado.error, desde: armado.desde, clave: armado.clave })
      document.getElementById(idDe(armado.desde, armado.clave))?.focus()
      return
    }
    setInvalido(null)
    ejecutar(() => aprobarBorradorDePilarAccion({ id: borrador.id, pesos: armado.pesos }))
  }

  return (
    <form onSubmit={aprobar} noValidate className="grid gap-5">
      <h2 className="text-pieza">{`Pesos de ${NOMBRE_DE_RED[borrador.red]}`}</h2>
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] md:items-start">
        {etapas.map((etapa) => {
          const total = totalDePesos(etapa.filas)
          const aviso = total === null ? null : avisoDePesos(borrador.red, total, etapa)
          return (
            <div key={etapa.desde} data-contorno className="rounded-panel bg-piedra-alta p-4">
              <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
                <legend className="mb-1 text-cuerpo font-semibold">{etapa.etiqueta}</legend>
                {etapa.filas.map((fila) => {
                  const conError = invalido?.desde === etapa.desde && invalido.clave === fila.clave
                  return (
                    <div key={fila.clave} className="grid gap-1">
                      <label htmlFor={idDe(etapa.desde, fila.clave)} className="text-meta font-semibold">
                        {fila.nombre}
                        {fila.clave === NUEVO ? <span className="text-apagado"> · nuevo</span> : null}
                        {/* The same pillar is in every stage: the stage completes its name. */}
                        <span className="sr-only">{`, ${etapa.etiqueta}`}</span>
                      </label>
                      <input
                        id={idDe(etapa.desde, fila.clave)}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={fila.peso}
                        onChange={(evento) => cambiar(etapa.desde, fila.clave, evento.target.value)}
                        aria-invalid={conError || undefined}
                        aria-describedby={conError ? idDelError : undefined}
                        className={cn(CLASES_DE_CAMPO, "tabular-nums")}
                      />
                    </div>
                  )
                })}
                <output aria-live="polite" className="text-cuerpo font-semibold tabular-nums">
                  {total === null ? "Total: falta un peso válido" : `Total: ${formatoDePeso(total)} %`}
                </output>
                {aviso ? <LineaDeEstado tipo="aviso" titulo={aviso} /> : null}
              </fieldset>
            </div>
          )
        })}
      </div>
      <p className="text-meta text-apagado">{AVISO_DE_LA_GUIA}</p>
      {invalido ? (
        <div id={idDelError}>
          <LineaDeError>{invalido.error}</LineaDeError>
        </div>
      ) : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={pendiente} className="md:w-auto">
          Aprobar pilar
        </Boton>
        <Link href={cancelar} className={cn(clasesDeBoton({ variante: "secundario" }), "md:w-auto")}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
```

   Note: each stage's total is an `<output>` (implicit role `status`, polite). `LineaDeEstado` `tipo="aviso"` draws a `Bloque`, which is an `<output>` too, so a stage's warning is said politely after its total; neither interrupts (only an error does). The E2E specs read a total with `getByRole("group", { name }).getByRole("status").filter({ hasText: "Total:" })`.

2. Create `app/(app)/biblioteca/temas/borradores/[id]/aprobar/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { z } from "zod"
import { Volver } from "@/components/ui/volver"
import { leerBorrador } from "@/lib/datos/borradores"
import { etapasDeRed } from "@/lib/datos/pilares"
import { etapasDeAprobacion, RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { diaLocal } from "@/lib/dominio/fechas"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { AprobarPilar } from "./aprobar-pilar"

/** Spec 15c: approving a pillar draft, with every stage of its network's weights from today in Chile (the RPC's date). */
export default async function AprobarBorrador({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const leido = await leerBorrador(db, valido.data)
  // A network draft is never approved in 15c; a decided one is gone from the list.
  if (!leido || leido.tipo !== "pilar") notFound()
  const { borrador } = leido
  const hoy = diaLocal(Date.now(), ZONA_DE_LA_BIBLIOTECA)
  const etapas = await etapasDeRed(db, borrador.red, hoy)
  return (
    <div className="grid gap-6 md:max-w-[64rem]">
      <Volver href={RUTA_DE_BORRADORES}>Borradores</Volver>
      <header className="grid gap-2 md:max-w-[42rem]">
        <h1 className="text-pantalla text-balance">{`Aprobar «${borrador.nombreCorto}»`}</h1>
        <p className="text-cuerpo">{`${borrador.nombre}. Entra a ${NOMBRE_DE_RED[borrador.red]}.`}</p>
        <p className="text-meta text-apagado">
          Revisa los pesos de la red en cada etapa: puedes cambiar cualquiera.
        </p>
      </header>
      <AprobarPilar
        borrador={borrador}
        etapas={etapasDeAprobacion(borrador, etapas, hoy)}
        cancelar={RUTA_DE_BORRADORES}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run them**

Run: `pnpm test:run tests/unit/biblioteca-aprobar-pilar.test.tsx tests/unit/biblioteca-pagina-borradores.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/sin-slugs-de-pilar.test.ts && pnpm type && pnpm lint && head -1 "app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar.tsx"`
Expected: PASS, and `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar.tsx" \
  "app/(app)/biblioteca/temas/borradores/[id]/aprobar/page.tsx" \
  tests/unit/biblioteca-aprobar-pilar.test.tsx tests/unit/biblioteca-pagina-borradores.test.tsx
git commit -m "Approve a pillar draft while redistributing its network's weights in every stage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint, phase 3:** every screen exists and is unit-tested; `pnpm build` must pass now (`pnpm build`), before the E2E phase.

# Phase 4: acceptance, visuals, gate

### Task 13: The scene and Coni's acceptance line on the phone and the computer

**Files:**
- Modify: `tests/e2e/biblioteca-escena.ts`
- Create: `tests/e2e/biblioteca-borradores.spec.ts`
- Create: `tests/e2e/biblioteca-borradores.escritorio.ts`
- Modify: `tests/e2e/biblioteca-temas-por-red.spec.ts`
- Modify: `tests/e2e/visual.spec.ts`

- [ ] **Step 1: The scene**

In `tests/e2e/biblioteca-escena.ts`:
- add `import { limpiarBorradores } from "../integration/limpiar-borradores"` next to the other imports;
- after `export const CAPA = "Capa TDAH"` add:

```ts
/** The pillar draft of the scene (15c): on Instagram, whose weights have no later stage (decision 20). */
export const BORRADOR_DE_INSTAGRAM = {
  nombre: "Cuerpo y pantalla: lo que el cuerpo dice frente a la IA",
  nombreCorto: "Cuerpo y pantalla",
  descripcion: "Lo que el cuerpo avisa cuando pasamos el día frente a la pantalla y la IA, y cómo escucharlo.",
}
export const RED_EN_BORRADOR = "TikTok"
```

- make `vaciarBiblioteca` start with:

```ts
  // Approved drafts became pillars with weights: they go, and the seed's weights come back (15c, decision 19).
  await limpiarBorradores()
```

- append:

```ts
/** A pillar draft on Instagram (10 %) and a network draft, as Coni would leave them. */
export async function sembrarBorradores(): Promise<{ pilar: string; red: string }> {
  await limpiarBorradores()
  const pilar = await uno(
    `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
     values ('instagram', $1, $2, $3, 10) returning id`,
    [BORRADOR_DE_INSTAGRAM.nombre, BORRADOR_DE_INSTAGRAM.nombreCorto, BORRADOR_DE_INSTAGRAM.descripcion],
  )
  const red = await uno("insert into public.borradores_de_red (nombre, manual) values ($1, $2) returning id", [
    RED_EN_BORRADOR,
    "Videos cortos para mujeres líderes jóvenes.",
  ])
  return { pilar, red }
}

/**
 * A later weight stage of LinkedIn of the scene's own, 400 days ahead (after the seed's 2027 stages at any date), at
 * 25 % for each active pillar; `limpiarBorradores` takes it away with every row that is not the seed's.
 */
export async function sembrarEtapaDeLinkedin(): Promise<string> {
  const { rows } = await pool.query<{ desde: string }>(
    `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
     select id, red, es_capa, (now() at time zone 'America/Santiago')::date + 400, 25 from public.categorias
     where es_pilar and activa and not es_capa and red = 'linkedin'
     returning desde::text as desde`,
  )
  const desde = rows[0]?.desde
  if (!desde) throw new Error("La escena no pudo crear la etapa de LinkedIn")
  return desde
}
```

(`uno(sql, params)` is the scene's existing helper that returns the first row's `id`.)

- [ ] **Step 2: Write the phone spec**

Create `tests/e2e/biblioteca-borradores.spec.ts`:

```ts
import { expect, type Locator, type Page, test } from "@playwright/test"
import { etiquetaDeEtapa } from "@/lib/dominio/biblioteca/borradores"
import { pool } from "../integration/db"
import { bloquearRedExterna, capturar, conLetraGrande, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  BORRADOR_DE_INSTAGRAM,
  RED_EN_BORRADOR,
  sembrarAutoresYTemas,
  sembrarBorradores,
  sembrarEtapaDeLinkedin,
} from "./biblioteca-escena"

// Coni's acceptance line (respuesta-coni-temas-pilares-2026-11-04.md, part 1, section 7) and spec 15c, section 4.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
})

const NUEVO = {
  nombre: "Liderazgo sereno: decidir con IA sin perder la calma",
  corto: "Liderazgo sereno",
  definicion: "Cómo decide una líder cuando la IA acelera todo, sin perder el criterio ni la calma.",
}
const UN_ID = "[0-9a-f-]{36}"
const pilaresDe = (page: Page, nombre: "LinkedIn" | "Instagram") =>
  page.getByRole("list", { name: `Pilares de ${nombre}` })
const fila = (page: Page) => page.getByRole("group", { name: "Filtrar temas" })

test("«+ Agregar pilar» guarda un borrador que no aparece en la lista hasta que lo apruebo", async ({ page }) => {
  // A later stage of the scene's own, 400 days ahead: the test edits it whatever today's date is (decision 20).
  const etapaPropia = await sembrarEtapaDeLinkedin()
  await page.goto("/biblioteca/temas?red=linkedin")
  await tocarHastaLlegar(
    page,
    pilaresDe(page, "LinkedIn").getByRole("link", { name: "Agregar pilar" }),
    /\/biblioteca\/temas\/pilar-nuevo\?red=linkedin$/,
  )
  await expect(page.getByText("Red: LinkedIn")).toBeVisible()
  await page.getByLabel("Nombre", { exact: true }).fill(NUEVO.nombre)
  await page.getByLabel("Nombre corto").fill(NUEVO.corto)
  await page.getByLabel("Definición").fill(NUEVO.definicion)
  await page.getByLabel("Peso (%)").fill("10")
  await page.getByRole("button", { name: "Guardar borrador" }).click()

  // Back on Temas, on LinkedIn: the note is said once and leaves the address; the draft is not a pillar.
  await expect(page.getByText("Guardé el borrador. Apruébalo en Borradores cuando quieras.")).toBeVisible()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?red=linkedin(?:&v=\d+)?$/)
  await expect(pilaresDe(page, "LinkedIn").getByRole("link", { name: NUEVO.corto })).toHaveCount(0)
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Borradores · 1" }), /\/biblioteca\/temas\/borradores$/)

  const tarjeta = page.getByRole("article", { name: NUEVO.nombre })
  await tocarHastaLlegar(
    page,
    tarjeta.getByRole("link", { name: "Aprobar" }),
    new RegExp(`/biblioteca/temas/borradores/${UN_ID}/aprobar$`),
  )
  // LinkedIn adds up to 100 in every stage: with the new 10 each is 110 until she redistributes it.
  const hoy = page.getByRole("group", { name: "Hoy", exact: true })
  const propia = page.getByRole("group", { name: etiquetaDeEtapa(etapaPropia, ""), exact: true })
  const total = (etapa: Locator) => etapa.getByRole("status").filter({ hasText: "Total:" })
  await expect(total(hoy)).toHaveText("Total: 110 %")
  await expect(hoy.getByText("Los pesos de LinkedIn suman 110 %. Puedes aprobar igual y ajustarlos después.")).toBeVisible()
  await expect(total(propia)).toHaveText("Total: 110 %")
  const diagnostico = hoy.getByLabel(/^Diagnóstico doble/)
  const antes = Number((await diagnostico.inputValue()).replace(",", "."))
  await diagnostico.fill(String(antes - 10))
  await expect(total(hoy)).toHaveText("Total: 100 %")
  await expect(hoy.getByText(/suman/)).toHaveCount(0)
  // In her own later stage (25 each) the new pillar takes 15, all of it from Diagnóstico doble.
  await propia.getByLabel(/^Liderazgo sereno · nuevo/).fill("15")
  await propia.getByLabel(/^Diagnóstico doble/).fill("10")
  await expect(total(propia)).toHaveText("Total: 100 %")
  await expect(propia.getByText(/suman/)).toHaveCount(0)
  await page.getByRole("button", { name: "Aprobar pilar" }).click()

  // Temas on LinkedIn with the new pillar chosen: its topics filter works and shows nothing yet.
  await expect(page).toHaveURL(new RegExp(`/biblioteca/temas\\?red=linkedin&pilar=${UN_ID}(?:&v=\\d+)?$`))
  await expect(page.getByText("Aprobé el pilar. Ya aparece en Temas.")).toBeVisible()
  const nuevo = pilaresDe(page, "LinkedIn").getByRole("link", { name: NUEVO.corto, exact: true })
  await expect(nuevo).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
  await expect(page.getByRole("link", { name: /^Borradores/ })).toHaveCount(0)
  await expect(pilaresDe(page, "LinkedIn").getByRole("link")).toHaveText([
    "Todos los pilares",
    "Diagnóstico doble",
    "Bienestar e impacto",
    "Psicología en la mesa",
    "Mujeres líderes",
    NUEVO.corto,
    "Agregar pilar",
  ])
  const pesosEn = async (desde: string) => {
    const { rows } = await pool.query<{ nombre_corto: string; peso: number }>(
      `select c.nombre_corto, p.peso::float8 as peso
       from public.pilar_pesos p join public.categorias c on c.id = p.pilar_id
       where p.desde = $1::date and c.nombre_corto = any($2::text[])
       order by c.nombre_corto`,
      [desde, ["Diagnóstico doble", NUEVO.corto]],
    )
    return rows
  }
  const { rows: dia } = await pool.query<{ hoy: string }>(
    "select ((now() at time zone 'America/Santiago')::date)::text as hoy",
  )
  expect(await pesosEn(dia[0]?.hoy ?? "")).toEqual([
    { nombre_corto: "Diagnóstico doble", peso: antes - 10 },
    { nombre_corto: NUEVO.corto, peso: 10 },
  ])
  expect(await pesosEn(etapaPropia)).toEqual([
    { nombre_corto: "Diagnóstico doble", peso: 10 },
    { nombre_corto: NUEVO.corto, peso: 15 },
  ])
  // Every later stage of LinkedIn (the seed's ones still ahead, if any) gave the new pillar a weight.
  const { rows: sinPeso } = await pool.query(
    `select distinct w.desde from public.pilar_pesos w join public.categorias c on c.id = w.pilar_id
     where c.red = 'linkedin' and c.activa and not c.es_capa
       and w.desde > (now() at time zone 'America/Santiago')::date
       and not exists (
         select 1 from public.pilar_pesos n join public.categorias nc on nc.id = n.pilar_id
         where nc.nombre_corto = $1 and n.desde = w.desde
       )`,
    [NUEVO.corto],
  )
  expect(sinPeso).toEqual([])
})

test("«+ Agregar red» saves a draft that waits for its connection and can never be approved", async ({ page }) => {
  await page.goto("/biblioteca/temas")
  await tocarHastaLlegar(page, fila(page).getByRole("link", { name: "Agregar red" }), /\/biblioteca\/temas\/red-nueva$/)
  await page.getByLabel("Nombre", { exact: true }).fill(RED_EN_BORRADOR)
  await page.getByLabel("Manual (opcional)").fill("Videos cortos para líderes jóvenes.")
  await page.getByRole("button", { name: "Guardar borrador" }).click()
  await expect(page.getByText("Guardé el borrador de la red. Queda en Borradores, esperando conexión.")).toBeVisible()
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Borradores · 1" }), /\/biblioteca\/temas\/borradores$/)
  const tarjeta = page.getByRole("article", { name: RED_EN_BORRADOR })
  await expect(tarjeta.getByText("Esperando conexión")).toBeVisible()
  await expect(tarjeta.getByRole("link", { name: "Aprobar" })).toHaveCount(0)
  await expect(tarjeta.getByRole("link", { name: "Editar" })).toBeVisible()
  const { rows } = await pool.query("select nombre, manual, receta, conexion, estado from public.borradores_de_red")
  expect(rows).toEqual([
    { nombre: RED_EN_BORRADOR, manual: "Videos cortos para líderes jóvenes.", receta: "", conexion: "", estado: "borrador" },
  ])
})

test("a draft is edited from Borradores, says a missing field, and once discarded is gone and cannot be opened", async ({
  page,
}) => {
  const { pilar } = await sembrarBorradores()
  await page.goto("/biblioteca/temas/borradores")
  const tarjeta = page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre })
  await tocarHastaLlegar(
    page,
    tarjeta.getByRole("link", { name: "Editar" }),
    new RegExp(`/biblioteca/temas/borradores/${pilar}/editar$`),
  )
  await expect(page.getByText("Red: Instagram")).toBeVisible()
  const corto = page.getByLabel("Nombre corto")
  await expect(corto).toHaveValue(BORRADOR_DE_INSTAGRAM.nombreCorto)
  await corto.fill("")
  await page.getByRole("button", { name: "Guardar borrador" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Escribe el nombre corto" })).toBeVisible()
  await expect(corto).toBeFocused()
  await expect(corto).toHaveAttribute("aria-invalid", "true")
  await corto.fill(BORRADOR_DE_INSTAGRAM.nombreCorto)
  await page.getByLabel("Peso (%)").fill("12,5")
  await page.getByRole("button", { name: "Guardar borrador" }).click()

  await expect(page.getByText("Guardé los cambios del borrador.")).toBeVisible()
  await expect(tarjeta).toContainText("Peso: 12,5 %")
  await tarjeta.getByRole("button", { name: "Descartar" }).click()
  await expect(tarjeta.getByText(/¿Descartar «/)).toBeFocused()
  await tarjeta.getByRole("button", { name: "Descartar" }).click()
  await expect(page.getByText("Descarté el borrador.")).toBeVisible()
  await expect(page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre })).toHaveCount(0)
  await expect(page.getByRole("article", { name: RED_EN_BORRADOR })).toBeVisible()
  const { rows } = await pool.query("select estado, peso::float8 as peso from public.borradores_de_pilar where id = $1", [
    pilar,
  ])
  expect(rows).toEqual([{ estado: "descartado", peso: 12.5 }])
  await page.goto(`/biblioteca/temas/borradores/${pilar}/editar`)
  await expect(page.getByRole("heading", { name: "No encontré lo que buscabas", level: 1 })).toBeVisible()
})

test("«Agregar pilar» slides with the pillars on the phone and opens from the keyboard", async ({ page }) => {
  await page.goto("/biblioteca/temas?red=instagram")
  const pista = pilaresDe(page, "Instagram")
  await expect(pista.getByRole("link")).toHaveText([
    "Todos los pilares",
    "Game Over Impostora",
    "Mi nueva partida",
    "Inteligencia emocional",
    "Agregar pilar",
    "Capa TDAH",
  ])
  await expect
    .poll(async () => new Set(await pista.getByRole("link").evaluateAll((e) => e.map((x) => x.getBoundingClientRect().top))).size)
    .toBe(1)
  const agregar = pista.getByRole("link", { name: "Agregar pilar" })
  await agregar.focus()
  await expect(agregar).toBeInViewport({ ratio: 1 })
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/biblioteca\/temas\/pilar-nuevo\?red=instagram$/)
})

test("the drafts' pages pass WCAG 2.x AA, keep 44 px targets and fit the phone at large text", async ({ page }) => {
  const { pilar } = await sembrarBorradores()
  // Temas itself (with its hidden desktop table) is checked by biblioteca-temas-por-red.spec.ts, buttons included.
  const paginas = [
    ["/biblioteca/temas/pilar-nuevo?red=instagram", "pilar nuevo"],
    ["/biblioteca/temas/red-nueva", "red nueva"],
    ["/biblioteca/temas/borradores", "borradores"],
    [`/biblioteca/temas/borradores/${pilar}/aprobar`, "aprobar pilar"],
  ] as const
  for (const [direccion, estado] of paginas) {
    await page.goto(direccion)
    expect(await revisarConAxe(page, estado)).toEqual([])
    await conLetraGrande(page)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), {
        message: `${estado}: la página no se desliza`,
      })
      .toBe(true)
    const objetivos = page.locator("main").locator("a, button, input, textarea")
    for (const objetivo of await objetivos.all()) {
      const nombre = (await objetivo.getAttribute("aria-label")) ?? (await objetivo.textContent()) ?? ""
      expect((await objetivo.boundingBox())?.height ?? 0, `${estado}: ${nombre}`).toBeGreaterThanOrEqual(44)
    }
    expect(await revisarConAxe(page, `${estado} con letra grande`)).toEqual([])
  }
  await capturar(page, "aprobar-pilar-letra-grande", { completa: true })
})
```

- [ ] **Step 3: Write the desktop spec**

Create `tests/e2e/biblioteca-borradores.escritorio.ts`:

```ts
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { BORRADOR_DE_INSTAGRAM, sembrarAutoresYTemas, sembrarBorradores } from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let borradores: { pilar: string; red: string }

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
  borradores = await sembrarBorradores()
})

test("on the computer a pillar draft is approved from Borradores and opens Temas' table on it", async ({ page }) => {
  await page.goto("/biblioteca/temas?red=instagram")
  expect(await revisarConAxe(page, "temas con agregar en el computador")).toEqual([])
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Borradores · 2" }), /\/biblioteca\/temas\/borradores$/)
  expect(await revisarConAxe(page, "borradores en el computador")).toEqual([])
  await tocarHastaLlegar(
    page,
    page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre }).getByRole("link", { name: "Aprobar" }),
    new RegExp(`/borradores/${borradores.pilar}/aprobar$`),
  )
  // Instagram: 35 + 40 + 25, plus the draft's 10.
  await expect(page.getByRole("status").filter({ hasText: "Total:" })).toHaveText("Total: 110 %")
  expect(await revisarConAxe(page, "aprobar pilar en el computador")).toEqual([])
  await page.getByRole("button", { name: "Aprobar pilar" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?red=instagram&pilar=[0-9a-f-]{36}(?:&v=\d+)?$/)
  await expect(page.getByRole("list", { name: "Pilares de Instagram" }).getByRole("link")).toHaveText([
    "Todos los pilares",
    "Game Over Impostora",
    "Mi nueva partida",
    "Inteligencia emocional",
    BORRADOR_DE_INSTAGRAM.nombreCorto,
    "Agregar pilar",
    "Capa TDAH",
  ])
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
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
  await expect(page).toHaveScreenshot(nombre, { fullPage: true })
}

test("visual: Borradores and a pillar's approval on the computer", async ({ page }) => {
  await page.goto("/biblioteca/temas/borradores")
  await expect(page.getByRole("heading", { name: "Borradores", level: 1 })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-borradores-escritorio.png")
  await page.goto(`/biblioteca/temas/borradores/${borradores.pilar}/aprobar`)
  await expect(page.getByRole("status").filter({ hasText: "Total:" })).toHaveText("Total: 110 %")
  await capturaDeEscritorio(page, "biblioteca-aprobar-pilar-escritorio.png")
})
```

- [ ] **Step 4: Follow the new buttons in 15b's spec and add the phone visuals**

1. In `tests/e2e/biblioteca-temas-por-red.spec.ts`:
   - replace the comment `// Coni's acceptance list (respuesta-coni-temas-pilares-2026-11-04.md, part 1, section 7), without 15c's buttons.` with `// Coni's acceptance list (respuesta-coni-temas-pilares-2026-11-04.md, part 1, section 7); 15c's buttons are in biblioteca-borradores.spec.ts.`;
   - in `test("each network opens its own pillars in order, ...")`, the LinkedIn expectation becomes `["Todos los pilares", "Diagnóstico doble", "Bienestar e impacto", "Psicología en la mesa", "Mujeres líderes", "Agregar pilar"]` and the Instagram one `["Todos los pilares", "Game Over Impostora", "Mi nueva partida", "Inteligencia emocional", "Agregar pilar", CAPA]` (the layer stays `.last()`, the relief check on `.nth(1)` is unchanged).

2. In `tests/e2e/visual.spec.ts`, add `sembrarBorradores` to the import from `./biblioteca-escena` and add after the test `"biblioteca: Autores and Temas on the phone, and an author's and a topic's page"`:

```ts
test("biblioteca: a pillar draft's form, Borradores and its approval on the phone", async ({ page }) => {
  await sembrarAutoresYTemas()
  const borradores = await sembrarBorradores()
  await page.goto("/biblioteca/temas/pilar-nuevo?red=instagram")
  await expect(page.getByRole("heading", { name: "Nuevo pilar", level: 1 })).toBeVisible()
  await capturaDe(page, "biblioteca-pilar-nuevo")
  await page.goto("/biblioteca/temas/borradores")
  await expect(page.getByRole("heading", { name: "Borradores", level: 1 })).toBeVisible()
  await capturaDe(page, "biblioteca-borradores")
  await page.goto(`/biblioteca/temas/borradores/${borradores.pilar}/aprobar`)
  await expect(page.getByRole("status").filter({ hasText: "Total:" })).toHaveText("Total: 110 %")
  await capturaDe(page, "biblioteca-aprobar-pilar")
})
```

- [ ] **Step 5: Run the specs (no screenshot comparison yet)**

Run:

```bash
pnpm test:e2e --project=app tests/e2e/biblioteca-borradores.spec.ts tests/e2e/biblioteca-temas-por-red.spec.ts \
  tests/e2e/biblioteca-temas.spec.ts tests/e2e/biblioteca-enlaces.spec.ts tests/e2e/biblioteca-pilares.spec.ts
pnpm test:e2e --project=escritorio tests/e2e/biblioteca-borradores.escritorio.ts tests/e2e/biblioteca-pilares.escritorio.ts \
  tests/e2e/biblioteca-autores-temas.escritorio.ts --grep-invert "visual"
```

Expected: PASS. (The visual tests are left out with `--grep-invert` on the desktop and are not in the phone list; they are Task 14.) Open `test-results/capturas/aprobar-pilar-letra-grande.png` and check by eye: Instagram's one stage «Hoy» stacks readably, its total and warning are visible, the buttons fit.

- [ ] **Step 6: Confirm the drafts leave nothing behind**

Run: `pnpm test:db tests/integration/datos-pilares.test.ts tests/integration/pilares-por-red-esquema.test.ts`
Expected: PASS (13 active pillars and 15 weight rows: the E2E teardown called `vaciarBiblioteca`, which called `limpiarBorradores`).

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca-borradores.spec.ts tests/e2e/biblioteca-borradores.escritorio.ts \
  tests/e2e/biblioteca-temas-por-red.spec.ts tests/e2e/visual.spec.ts
git commit -m "Run Coni's acceptance line for pillar and network drafts on the phone and the computer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Review captures for Federico, then stop

**Files:** none (captures go to `/tmp`, outside the repo)

- [ ] **Step 1: Confirm exactly the Temas baselines change and the new ones are missing, writing none**

Run:

```bash
pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "biblioteca" --update-snapshots=none
pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts tests/e2e/biblioteca-borradores.escritorio.ts -g "visual" --update-snapshots=none
git status --short tests/e2e
```

Expected: on the phone, "Autores and Temas on the phone" FAILS on `biblioteca-temas.png` (after `biblioteca-autores` and `biblioteca-autor` matched) and "a pillar draft's form, Borradores and its approval" FAILS because `biblioteca-pilar-nuevo-app-darwin.png` does not exist; every other `biblioteca` visual passes. On the desktop, "Autores and Temas with their side panels" FAILS on `biblioteca-temas-escritorio.png` and "Borradores and a pillar's approval" FAILS on a missing `biblioteca-borradores-escritorio-escritorio-darwin.png`. `--update-snapshots=none` keeps Playwright from writing the missing ones: `git status` shows no snapshot file. If a failure names any other file, something else moved: stop and find it.

- [ ] **Step 2: Write the review captures**

Run:

```bash
rm -rf /tmp/borradores-de-pilares-visual
VISUAL_FINALES=/tmp/borradores-de-pilares-visual pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "biblioteca: Autores and Temas on the phone|biblioteca: a pillar draft"
VISUAL_FINALES=/tmp/borradores-de-pilares-visual pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts tests/e2e/biblioteca-borradores.escritorio.ts -g "visual"
ls /tmp/borradores-de-pilares-visual
```

Expected: PASS (this mode compares nothing) and the folder holds, among others, `biblioteca-temas.png`, `biblioteca-pilar-nuevo.png`, `biblioteca-borradores.png`, `biblioteca-aprobar-pilar.png`, `biblioteca-temas-escritorio.png`, `biblioteca-borradores-escritorio.png`, `biblioteca-aprobar-pilar-escritorio.png`.

- [ ] **Step 3: STOP for Federico**

Send Federico these images and wait:
- `/tmp/borradores-de-pilares-visual/biblioteca-temas.png` and `biblioteca-temas-escritorio.png`: the row `[ Sin tratar · 2 ] [ Instagram ▾ ] [ LinkedIn ▾ ] [ + Agregar red ]`, the LinkedIn pillars ending in a dashed `+ Agregar pilar`;
- `biblioteca-pilar-nuevo.png`: the form on Instagram, "Red: Instagram" as text, the hints of Nombre corto, Definición and Peso;
- `biblioteca-borradores.png` and `biblioteca-borradores-escritorio.png`: "Pilares de Instagram" with Cuerpo y pantalla (Aprobar, Editar, Descartar), then "Redes" with TikTok "Esperando conexión";
- `biblioteca-aprobar-pilar.png` and `biblioteca-aprobar-pilar-escritorio.png`: Instagram's one stage «Hoy» (Instagram has no later stage) with its three weights and the new one at 10, "Total: 110 %", the warning, the guide line. A network with later stages (LinkedIn) shows one block per stage on the phone and one column per stage on the computer; that layout is covered by the non-visual tests, and if Federico wants to see it, run the LinkedIn acceptance test of `biblioteca-borradores.spec.ts` with a `capturar(page, "aprobar-por-etapas")` added before «Aprobar pilar» (not committed);
- `test-results/capturas/aprobar-pilar-letra-grande.png`: the approval at large text.

**Do not start Task 15 until Federico answers OK in the conversation.** If he asks for changes, make them with a failing test first, run Task 13 Step 5 and this task again.

### Task 15: Take the baselines (only after Federico's OK)

**Files:**
- Modify (baselines): `tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png`, `tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-temas-escritorio-escritorio-darwin.png`
- Create (baselines): `tests/e2e/visual.spec.ts-snapshots/biblioteca-pilar-nuevo-app-darwin.png`, `tests/e2e/visual.spec.ts-snapshots/biblioteca-borradores-app-darwin.png`, `tests/e2e/visual.spec.ts-snapshots/biblioteca-aprobar-pilar-app-darwin.png`, `tests/e2e/biblioteca-borradores.escritorio.ts-snapshots/biblioteca-borradores-escritorio-escritorio-darwin.png`, `tests/e2e/biblioteca-borradores.escritorio.ts-snapshots/biblioteca-aprobar-pilar-escritorio-escritorio-darwin.png`

- [ ] **Step 1: Take them**

Run:

```bash
pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "biblioteca: Autores and Temas on the phone|biblioteca: a pillar draft" --update-snapshots
pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts tests/e2e/biblioteca-borradores.escritorio.ts -g "visual" --update-snapshots
git status --short tests/e2e
```

Expected: `git status` lists exactly the two `M` Temas baselines and the five `??` new ones named above. If any other snapshot changed, restore it with `git checkout -- <file>` and find why before going on.

- [ ] **Step 2: Compare them again without updating**

Run: `pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "biblioteca" && pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts tests/e2e/biblioteca-borradores.escritorio.ts -g "visual"`
Expected: PASS (the topic page `biblioteca-tema` did not move).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-pilar-nuevo-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-borradores-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-aprobar-pilar-app-darwin.png \
  tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-temas-escritorio-escritorio-darwin.png \
  tests/e2e/biblioteca-borradores.escritorio.ts-snapshots/biblioteca-borradores-escritorio-escritorio-darwin.png \
  tests/e2e/biblioteca-borradores.escritorio.ts-snapshots/biblioteca-aprobar-pilar-escritorio-escritorio-darwin.png
git commit -m "Take the baselines of the Temas row with its add buttons and of the drafts' screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: Full gate

**Files:** none new (fixes only if a step fails, each with its own failing test first)

- [ ] **Step 1: Clean rebuild of the local DB from the migrations**

Run: `pnpm db:reset && pnpm db:types && git diff --exit-code lib/supabase/database.types.ts`
Expected: exit 0.

- [ ] **Step 2: Lint, types, build**

Run: `pnpm lint && pnpm type && pnpm build`
Expected: PASS.

- [ ] **Step 3: Every suite**

Run: `pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: PASS, all three. After the E2E run, `pnpm test:db tests/integration/datos-pilares.test.ts` still passes (the teardown restored the pillars and weights).

- [ ] **Step 4: Guards of this feature**

Run:

```bash
pnpm test:run tests/unit/sin-slugs-de-pilar.test.ts tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts
grep -rn "—" "app/(app)/biblioteca/temas" lib/dominio/biblioteca/borradores.ts lib/acciones/borradores.ts lib/datos/borradores.ts
grep -rn "borradores\|aprobar_borrador\|pesosDeRed\|etapasDeRed" trigger lib/motor lib/ingesta lib/produccion lib/publicacion lib/metricas lib/mantenimiento lib/avisos scripts
grep -rn "from(\"categorias\")" lib/acciones/borradores.ts
git diff origin/main --stat -- supabase/migrations
```

Expected: the tests pass; the em dash `grep` prints nothing; the Trigger/engine `grep` prints nothing (no task reaches a changed module, so no Trigger deploy; tasks read active pillars at run time); the `categorias` `grep` prints exactly the one read of the approved pillar's network (drafts never write there from the app); the stat lists exactly one new file, `20261105000100_borradores_de_pilares.sql`, and no modified one.

- [ ] **Step 5: Request review**

Use superpowers:requesting-code-review on the branch. Fix findings with a failing test first, one commit per fix.

## Release steps (listed, not executed by this plan)

Federico's standing authorization (memory "Salida a producción autorizada") covers steps 1 to 5 when its conditions hold (issue, green CI, reviews, dry-run); nothing here needs a Trigger deploy.

1. **Issue and CI.** The work is on issue #18 of the board (WAV-WaAreVision/projects/1, change 15, part 15c); the PR is open from `feat/borradores-de-pilares`; CI is green; the code review is approved; Federico gave his OK on the captures (Task 14) and the baselines were taken (Task 15).
2. **Read-only pre-checks on production** (Supabase SQL editor or `psql "$PROD_DB_URL"`):

```sql
select to_regclass('public.borradores_de_pilar'), to_regclass('public.borradores_de_red');  -- Expected: null, null.
select count(*) from pg_proc where proname = 'aprobar_borrador_de_pilar';                      -- Expected: 0.
select count(*) from public.categorias where es_pilar and activa and red is not null;          -- Expected: 8 (note it).
select count(*) from public.pilar_pesos;                                                       -- Note it.
select count(*) from public.categorias where slug ~ '-[0-9]+$' and es_pilar;                    -- Note it (slug suffixes).
```

3. **`supabase db push --dry-run`** against production. Expected: exactly `20261105000100_borradores_de_pilares.sql`. Then **`supabase db push`**. It changes no existing row (the same three counts as step 2 afterwards).
4. **Merge the PR**, only after step 3 (Vercel publishes `main`). Between the push and the merge the old code simply does not read the new tables.
5. **Live check:** confirm the new code is served (the Temas HTML for Coni contains "Agregar pilar" and "Agregar red"; Vercel's alias lags 15 to 45 s; if Coni's screen looks old, it is her cache: hard refresh). Then read-only: `select count(*) from public.borradores_de_pilar;` and `select count(*) from public.borradores_de_red;` give 0 until Coni saves one.
6. **No Trigger deploy:** Task 16 Step 4 showed no task imports a changed module; the engine and `pilares:proponer` read active pillars at run time and pick up an approved pillar with its definition.
7. **Release notes record by hand:** a pillar approved in the app works in the app, but its manual text must be added to the editorial guide (v4) by hand; the approval screen says so. Also record that an approval writes the new pillar's weight into every stage of its network (LinkedIn: today and the planned stages still ahead), with any weight she changed on each stage's date (decision 8).
8. **Board:** #18 stays En Curso (15d remains). Comment on #18 with the release date of 15c and the result of step 5.
