# LinkedIn Excel importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni uploads the Excel LinkedIn exports from her content analytics and Conidolly saves each post's impressions and interactions on its piece (origin `excel`), with a weekly reminder on Inicio, replacing WAV's weekly email.

**Architecture:** A pure reader turns the sheet rows into posts, a pure matcher pairs them with Conidolly's LinkedIn pieces (URN first, then day for hand uploads), and one `security definer` RPC writes posts and followers in one transaction, never over an `api` row. A thin adapter (`read-excel-file`) turns the uploaded `File` into rows; a Server Action wires it to Métricas. Inicio reuses `leerLinkedinParaAnotar` + `sinNumerosEstaSemana` for the reminder; the nightly `numerosLinkedin` step goes away.

**Tech Stack:** Next.js 16.4.5 (App Router, Server Actions with `FormData`), Supabase Postgres (RLS, plpgsql), `read-excel-file@9.3.12` (dependency), `write-excel-file@4.1.1` (dev only, fixture), zod 4.6.5, Vitest 4 (jsdom unit, node integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-excel-linkedin-design.md`. Excel format: issue #15, comment «B7 cerrado» (`gh issue view 15 --comments`).

---

## Ground rules (every task)

- Work only in `/Users/fede/Projects/estudio-coni/.worktrees/excel-linkedin` (branch `feat/excel-linkedin`). The worktree has no `node_modules` yet: run `pnpm install` once before Task 1.
- Strict TDD: failing test first, watch it fail, minimal code, watch it pass, one commit per cycle.
- No `as any`, no `@ts-expect-error`, no non-null assertions (`!`), no silent `catch`. Narrow with `if` or `?.`/`??`.
- Biome only in safe mode: `pnpm exec biome check --write <files>`; never `--unsafe`. After it runs on a client component, confirm line 1 is still `"use client"`.
- Copy for Coni: Chile Spanish, tú, no em dash (U+2014) anywhere, also not in code comments or docs. Before each commit: `git diff --cached | grep -n $'\xe2\x80\x94'` must print nothing.
- Stage files explicitly (`git add <path> ...`), never `git add -A` or `.`.
- Commit messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Unit suite: `pnpm exec vitest run --exclude '.worktrees/**' --exclude 'tests/e2e/**' --exclude 'tests/integration/**'`.
- Integration (local Supabase, Docker): `pnpm db:start` once, `pnpm db:reset` after a new migration, then `pnpm test:db <file>`.
- Types: `pnpm type`. Lint: `pnpm lint`.

## Facts this plan relies on (checked in the code on 2026-11-09)

- `metricas_linkedin` and `metricas_linkedin_cuenta` come from `supabase/migrations/20261017000300_metricas_linkedin.sql`. Their `origen` checks are inline column checks, so Postgres named them `metricas_linkedin_origen_check` and `metricas_linkedin_cuenta_origen_check` (Task 1 Step 1 verifies the names before dropping them).
- The view `metricas_linkedin_ultima` is read by `lib/datos/metricas.ts` (`leerDatosDeMetricas`) and `lib/datos/metricas-linkedin.ts` (`leerLinkedinParaAnotar`). Both select named columns, so appending `interacciones` breaks nothing.
- `publicaciones.post_urn` matches `^urn:li:(share|ugcPost):[0-9]+$` (`20261007000110_linkedin_publicacion.sql`); a `publicado` LinkedIn row always has one; `subido_a_mano` rows normally do not. Coni can select `publicaciones` (policy «coni lee publicaciones»); the maintainer cannot.
- `postsPorAnotar` (`lib/metricas/linkedin.ts`) drops a post whose row of this week is not `manual` and keeps a manual one with its numbers; `sinNumerosEstaSemana` then gives the posts of the last 4 weeks with no row this week. An `excel` row this week therefore clears the reminder.
- Server Actions: `comoConi(nombre, esquema, entrada, trabajo)` in `lib/acciones/servidor.ts` validates with zod and opens Coni's session; `aResultado` in `lib/acciones/resultado.ts` turns a `Falla` into its message and anything else into `ERROR_GENERICO` («Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos.») after `console.error`.
- Screen error notice to WAV: `avisarErrorDePantalla(deps: { avisos: () => Notificador; ahora: () => string }, { registro, digest? })` in `lib/acciones/error-de-pantalla.ts`. The registro must match `/^[\p{L} ]{1,120}$/u` when it comes from the client; here it is called on the server.
- The nightly step lives in a Trigger.dev task: `trigger/mantenimiento.ts` runs `mantenimientoNocturno` from `lib/mantenimiento/ejecutar.ts`. Removing `numerosLinkedin` only stops the email after a **Trigger deploy**, which needs Federico's OK.
- `read-excel-file@9.3.12` (published 2026-10-07; 9.3.13/9.3.14 are under three weeks old): `import readXlsxFile, { InvalidInputError, InvalidSpreadsheetError } from "read-excel-file/node"`; `readXlsxFile(buffer)` returns `{ sheet: string; data: (string | number | boolean | Date | null)[][] }[]`. Empty cells come back as `null` and rows are padded; a non-xlsx input throws `InvalidInputError`. Verified on Node 24.15 with a workbook written by `write-excel-file@4.1.1`: sheet names with accents and 31-character truncation (`INFORMACIÓN DETALLADA DEL PÚBLI`) round-trip.
- `next.config.ts` has no `experimental` block yet; Next 16.4.5 keeps `experimental.serverActions.bodySizeLimit`.
- URN numbers have 19 digits: they stay strings (a JavaScript number loses digits past 2^53).

## File map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20261110000100_excel_linkedin.sql` | create | `excel` origin, `interacciones`, view, RPC `importar_excel_linkedin` |
| `lib/supabase/database.types.ts` | regenerate | `pnpm db:types` |
| `lib/metricas/excel-linkedin/leer.ts` | create | rows per sheet to periodo, posts, followers, cap (pure) |
| `lib/metricas/excel-linkedin/cruzar.ts` | create | Excel posts to pieces: safe, doubtful, foreign, missing (pure) |
| `lib/metricas/excel-linkedin/resumen.ts` | create | every sentence Coni reads about the import (pure) |
| `lib/metricas/excel-linkedin/archivo.ts` | create | uploaded `Blob` to text rows per sheet (`read-excel-file`) |
| `tests/fixtures/excel-linkedin.ts`, `tests/fixtures/excel-linkedin.xlsx` | create | synthetic export (fake URLs and numbers) |
| `scripts/excel-linkedin-de-prueba.ts` | create | writes the fixture `.xlsx` |
| `scripts/revisar-excel-linkedin.ts` | create | reads a real export locally and prints what the importer sees, saves nothing |
| `lib/datos/excel-linkedin.ts` | create | read LinkedIn publications, call the RPC |
| `lib/acciones/excel-linkedin.ts` | create | import and doubtful-picks actions (testable core) |
| `app/(app)/metricas/acciones.ts` | modify | the two Server Actions |
| `app/(app)/metricas/importar-excel-de-linkedin.tsx` | create | button, summary, doubtful picker |
| `app/(app)/metricas/page.tsx` | modify | importer section; manual form under «Más opciones» |
| `lib/metricas/modelo.ts`, `lib/datos/metricas.ts` | modify | «N interacciones» when only the total exists |
| `lib/inicio/modelo.ts`, `app/(app)/page.tsx` | modify | «Sube el Excel de LinkedIn» reminder |
| `lib/mantenimiento/numeros-linkedin.ts` | delete | WAV email step |
| `lib/mantenimiento/ejecutar.ts`, `lib/metricas/linkedin.ts` | modify | drop the step and `asuntoDelRecordatorio` |
| `next.config.ts` | modify | `bodySizeLimit: "2mb"`, `read-excel-file` external |
| `package.json`, `pnpm-lock.yaml` | modify | pinned deps, `fixture:excel-linkedin` and `revisar:excel-linkedin` scripts |
| `docs/TRASPASO.md` | modify | handover |

## Batches (subagent-driven execution)

| Batch | Tasks | Depends on | Notes |
|---|---|---|---|
| A: database | 1 | nothing | needs local Supabase |
| B: pure logic | 2, 3, 4 | nothing | can run in parallel with A |
| C: file adapter | 5, 6 | B (Task 2) | adds dependencies |
| D: server | 7, 8, 9, 10 | A, B, C | integration tests need A's migration |
| E: screens | 11, 12, 13, 14 | D | Task 11 needs A's regenerated types |
| F: remove WAV email | 15 | E (Task 14 reuses `sinNumerosEstaSemana`) | |
| G: end to end and docs | 16, 17, 18 | all | visual baselines on this Mac (darwin) |
| H: release | 19 | merged review | Federico's OKs inside |

Review between batches: spec compliance first, then code quality (`caveman:cavecrew-reviewer`), as in the project's usual flow.

---

## Batch A: database

### Task 1: Migration and RPC `importar_excel_linkedin`

**Files:**
- Create: `supabase/migrations/20261110000100_excel_linkedin.sql`
- Create: `tests/integration/excel-linkedin-esquema.test.ts`
- Regenerate: `lib/supabase/database.types.ts`

- [ ] **Step 1: Confirm the constraint names the migration drops**

Run (local stack up, `pnpm db:start`):

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54422/postgres" -Atc "select conrelid::regclass, conname from pg_constraint where conrelid in ('public.metricas_linkedin'::regclass, 'public.metricas_linkedin_cuenta'::regclass) and contype = 'c' and pg_get_constraintdef(oid) like '%origen%'"
```

Expected:
```
metricas_linkedin|metricas_linkedin_origen_check
metricas_linkedin_cuenta|metricas_linkedin_cuenta_origen_check
```
If the names differ, use the printed ones in Step 3.

- [ ] **Step 2: Write the failing integration test**

`tests/integration/excel-linkedin-esquema.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

type Cliente = Parameters<Parameters<typeof como>[1]>[0]

async function nuevaPieza(c: Cliente): Promise<string> {
  const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Post') returning id")
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  return id
}

const IMPORTAR = "select public.importar_excel_linkedin($1::date, $2::jsonb, $3::date, $4::integer) as escritas"
const posts = (...lista: { pieza_id: string; impresiones: number | null; interacciones: number | null }[]) =>
  JSON.stringify(lista)
const FILA =
  "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen) values ($1, '2026-10-30', 1200, 14, 3, 1, $2)"

describe("importar_excel_linkedin", () => {
  it("lets only Coni run it: the maintainer is refused with sin_permiso", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoMantenedor)
      const error = await fallaCon(c, IMPORTAR, [
        "2026-10-30",
        posts({ pieza_id: pieza, impresiones: 1, interacciones: 1 }),
        "2026-10-26",
        null,
      ])
      expect([error.code, error.message]).toEqual(["42501", "sin_permiso"])
    })
  })

  it("does not let anyone signed out or the service role execute it", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query(
        `select has_function_privilege('anon', 'public.importar_excel_linkedin(date, jsonb, date, integer)', 'execute') as anon,
                has_function_privilege('service_role', 'public.importar_excel_linkedin(date, jsonb, date, integer)', 'execute') as servicio,
                has_function_privilege('authenticated', 'public.importar_excel_linkedin(date, jsonb, date, integer)', 'execute') as sesion`,
      )
      expect(rows).toEqual([{ anon: false, servicio: false, sesion: true }])
    })
  })

  it("writes each post with origin excel, seals Coni and returns how many rows it wrote", async () => {
    await como(comoPostgres, async (c) => {
      const a = await nuevaPieza(c)
      const b = await nuevaPieza(c)
      await asumir(c, comoConi)
      const { rows } = await c.query(IMPORTAR, [
        "2026-10-30",
        posts({ pieza_id: a, impresiones: 1200, interacciones: 12 }, { pieza_id: b, impresiones: null, interacciones: 4 }),
        "2026-10-26",
        null,
      ])
      expect(rows).toEqual([{ escritas: 2 }])
      await asumir(c, comoPostgres)
      const filas = await c.query(
        "select impresiones, interacciones, origen, anotado_por from public.metricas_linkedin order by interacciones desc",
      )
      expect(filas.rows).toEqual([
        { impresiones: 1200, interacciones: 12, origen: "excel", anotado_por: CONI },
        { impresiones: null, interacciones: 4, origen: "excel", anotado_por: CONI },
      ])
    })
  })

  it("never touches a row that came from the API (nor Metricool) and does not count it", async () => {
    await como(comoPostgres, async (c) => {
      const api = await nuevaPieza(c)
      const metricool = await nuevaPieza(c)
      await c.query(FILA, [api, "api"])
      await c.query(FILA, [metricool, "metricool"])
      await asumir(c, comoConi)
      const { rows } = await c.query(IMPORTAR, [
        "2026-10-30",
        posts(
          { pieza_id: api, impresiones: 5, interacciones: 5 },
          { pieza_id: metricool, impresiones: 5, interacciones: 5 },
        ),
        "2026-10-26",
        null,
      ])
      expect(rows).toEqual([{ escritas: 0 }])
      await asumir(c, comoPostgres)
      const filas = await c.query("select impresiones, interacciones, origen from public.metricas_linkedin order by origen")
      expect(filas.rows).toEqual([
        { impresiones: 1200, interacciones: null, origen: "api" },
        { impresiones: 1200, interacciones: null, origen: "metricool" },
      ])
    })
  })

  it("overwrites a manual row and keeps a figure the Excel does not bring", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(FILA, [pieza, "manual"])
      await asumir(c, comoConi)
      await c.query(IMPORTAR, ["2026-10-30", posts({ pieza_id: pieza, impresiones: null, interacciones: 20 }), "2026-10-26", null])
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select impresiones, interacciones, reacciones, origen from public.metricas_linkedin")
      expect(rows).toEqual([{ impresiones: 1200, interacciones: 20, reacciones: 14, origen: "excel" }])
    })
  })

  it("upserts the week's followers with origin excel, but never over the API's", async () => {
    await como(comoPostgres, async (c) => {
      await asumir(c, comoConi)
      await c.query(IMPORTAR, ["2026-10-30", "[]", "2026-10-26", 830])
      await c.query(IMPORTAR, ["2026-10-30", "[]", "2026-10-26", 840])
      await asumir(c, comoPostgres)
      await c.query(
        "insert into public.metricas_linkedin_cuenta (semana, seguidores, origen) values ('2026-10-19', 700, 'api')",
      )
      await asumir(c, comoConi)
      await c.query(IMPORTAR, ["2026-10-23", "[]", "2026-10-19", 999])
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        "select semana::text, seguidores, origen from public.metricas_linkedin_cuenta order by semana",
      )
      expect(rows).toEqual([
        { semana: "2026-10-19", seguidores: 700, origen: "api" },
        { semana: "2026-10-26", seguidores: 840, origen: "excel" },
      ])
    })
  })

  it("writes nothing of the posts when the followers cannot be saved (one transaction)", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      // A week that does not start on Monday breaks the followers' check after the posts were inserted.
      const error = await fallaCon(c, IMPORTAR, [
        "2026-10-30",
        posts({ pieza_id: pieza, impresiones: 1, interacciones: 1 }),
        "2026-10-27",
        830,
      ])
      expect(error.code).toBe("23514")
      await asumir(c, comoPostgres)
      expect((await c.query("select * from public.metricas_linkedin")).rowCount).toBe(0)
    })
  })

  it("gives interacciones as the last column of the newest reading", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      await c.query(IMPORTAR, ["2026-10-30", posts({ pieza_id: pieza, impresiones: 9, interacciones: 3 }), "2026-10-26", null])
      const { rows, fields } = await c.query("select * from public.metricas_linkedin_ultima")
      expect(fields.at(-1)?.name).toBe("interacciones")
      expect(rows[0]).toMatchObject({ impresiones: 9, interacciones: 3, origen: "excel" })
    })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test:db tests/integration/excel-linkedin-esquema.test.ts`
Expected: FAIL, `function public.importar_excel_linkedin(...) does not exist`.

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261110000100_excel_linkedin.sql`:

```sql
-- LinkedIn Excel importer (issue 15, spec 2026-11-09): Coni uploads the Excel LinkedIn exports and each number lands on
-- its piece with origin `excel`. Nothing is dropped: `metricool` stays for old rows, and `recordatorios_linkedin`
-- stays unused until a later change removes it with Federico's OK.

alter table public.metricas_linkedin drop constraint metricas_linkedin_origen_check;
alter table public.metricas_linkedin
  add constraint metricas_linkedin_origen_check check (origen in ('manual', 'api', 'metricool', 'excel')),
  -- The Excel brings one total per post, without reactions, comments or shares.
  add column interacciones integer check (interacciones >= 0);

alter table public.metricas_linkedin_cuenta drop constraint metricas_linkedin_cuenta_origen_check;
alter table public.metricas_linkedin_cuenta
  add constraint metricas_linkedin_cuenta_origen_check check (origen in ('manual', 'api', 'metricool', 'excel'));

-- As in 20261017000300, with `interacciones` appended: create or replace view can only add columns at the end.
create or replace view public.metricas_linkedin_ultima with (security_invoker = true) as
  select distinct on (pieza_id) pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen,
         interacciones
  from public.metricas_linkedin
  order by pieza_id, medido_en desc;

-- Coni's import (decisions 1 and 4): the matched posts and the week's followers in one transaction. Definer rights so
-- the `excel` rows need no new policy; the check below keeps it hers alone (A6: the maintainer does not import).
-- A row from the API or Metricool is never changed; a manual or excel row is replaced, and a figure the Excel does not
-- bring (null) keeps the stored one. Returns the post rows written.
create function public.importar_excel_linkedin(
  p_medido_en date,
  p_posts jsonb,
  p_semana date,
  p_seguidores integer default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_escritas integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  insert into public.metricas_linkedin as m (pieza_id, medido_en, impresiones, interacciones, origen)
  select (post ->> 'pieza_id')::uuid, p_medido_en, (post ->> 'impresiones')::integer,
         (post ->> 'interacciones')::integer, 'excel'
    from jsonb_array_elements(coalesce(p_posts, '[]'::jsonb)) as post
  on conflict (pieza_id, medido_en) do update
    set impresiones = coalesce(excluded.impresiones, m.impresiones),
        interacciones = coalesce(excluded.interacciones, m.interacciones),
        origen = 'excel'
    where m.origen in ('manual', 'excel');
  get diagnostics v_escritas = row_count;
  if p_seguidores is not null then
    insert into public.metricas_linkedin_cuenta as c (semana, seguidores, origen)
    values (p_semana, p_seguidores, 'excel')
    on conflict (semana) do update set seguidores = excluded.seguidores, origen = 'excel'
      where c.origen in ('manual', 'excel');
  end if;
  return v_escritas;
end $$;

revoke all on function public.importar_excel_linkedin(date, jsonb, date, integer) from public, anon, service_role;
grant execute on function public.importar_excel_linkedin(date, jsonb, date, integer) to authenticated;
```

- [ ] **Step 5: Apply and run the test**

Run: `pnpm db:reset && pnpm test:db tests/integration/excel-linkedin-esquema.test.ts tests/integration/metricas-linkedin-esquema.test.ts`
Expected: PASS (both files; the old schema test proves nothing regressed).

- [ ] **Step 6: Regenerate the types and check them**

Run: `pnpm db:types && pnpm type`
Expected: `lib/supabase/database.types.ts` now has `importar_excel_linkedin` with `Args: { p_medido_en: string; p_posts: Json; p_semana: string; p_seguidores?: number }` and `Returns: number`, and `interacciones: number | null` on `metricas_linkedin` and `metricas_linkedin_ultima`. `pnpm type` passes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261110000100_excel_linkedin.sql tests/integration/excel-linkedin-esquema.test.ts lib/supabase/database.types.ts
git commit -m "Add the excel origin, interactions and Coni's import RPC for LinkedIn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch B: pure logic

### Task 2: `leerExcelDeLinkedin`

**Files:**
- Create: `lib/metricas/excel-linkedin/leer.ts`
- Test: `tests/unit/excel-linkedin-leer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { type HojasDelExcel, leerExcelDeLinkedin, leerFecha } from "@/lib/metricas/excel-linkedin/leer"

type Fila = [string, string, string]
const VACIA: Fila = ["", "", ""]
const ENCABEZADO = [
  "URL de la publicación",
  "Fecha de publicación",
  "Interacciones",
  "",
  "URL de la publicación",
  "Fecha de publicación",
  "Impresiones",
]
const url = (tipo: string, numero: string, titulo = "la-terapia-no-es-un-chat") =>
  `https://www.linkedin.com/posts/constanza-del-rosario_${titulo}-${tipo}-${numero}-AbCd`

function hojas(
  opciones: {
    periodo?: string
    interacciones?: Fila[]
    impresiones?: Fila[]
    seguidores?: string[] | null
  } = {},
): HojasDelExcel {
  const { interacciones = [], impresiones = [] } = opciones
  const largo = Math.max(interacciones.length, impresiones.length)
  const filas = Array.from({ length: largo }, (_, i) => [...(interacciones[i] ?? VACIA), "", ...(impresiones[i] ?? VACIA)])
  const resultado = new Map<string, string[][]>([
    ["DESCUBRIMIENTO", [["Rendimiento general", opciones.periodo ?? "1/10/2026 - 30/10/2026"], ["Impresiones", "5400"]]],
    ["INTERACCIÓN", [["Fecha", "Impresiones", "Interacciones"]]],
    [
      "PUBLICACIONES PRINCIPALES",
      [["Esta lista puede incluir 50 publicaciones como máximo"], [], ENCABEZADO, ...filas],
    ],
  ])
  if (opciones.seguidores !== null) {
    resultado.set("SEGUIDORES", [opciones.seguidores ?? ["Total de seguidores el 30/10/2026", "830"]])
  }
  return resultado
}

describe("leerFecha", () => {
  it("reads D/M/AAAA without leading zeros and refuses a day that does not exist", () => {
    expect(leerFecha("9/11/2026")).toBe("2026-11-09")
    expect(leerFecha("31/12/2026")).toBe("2026-12-31")
    expect(leerFecha("31/2/2026")).toBeNull()
    expect(leerFecha("2026-11-09")).toBeNull()
  })
})

describe("leerExcelDeLinkedin", () => {
  it("joins the two rankings by URL and reads the period and the followers", () => {
    const lectura = leerExcelDeLinkedin(
      hojas({
        interacciones: [
          [url("share", "7380000000000000001"), "3/10/2026", "12"],
          [url("ugcPost", "7380000000000000002"), "7/10/2026", "40"],
        ],
        impresiones: [
          [url("ugcPost", "7380000000000000002"), "7/10/2026", "2.300"],
          [url("share", "7380000000000000001"), "3/10/2026", "1200"],
        ],
      }),
    )

    expect(lectura).toEqual({
      ok: true,
      excel: {
        periodo: { desde: "2026-10-01", hasta: "2026-10-30" },
        publicaciones: [
          { tipo: "share", numero: "7380000000000000001", fecha: "2026-10-03", impresiones: 1200, interacciones: 12 },
          { tipo: "ugcPost", numero: "7380000000000000002", fecha: "2026-10-07", impresiones: 2300, interacciones: 40 },
        ],
        seguidores: 830,
        llegoAlTope: false,
        sinIdentificar: 0,
      },
    })
  })

  it("keeps the other figure null for a post that is in one ranking only", () => {
    const lectura = leerExcelDeLinkedin(hojas({ impresiones: [[url("share", "1"), "3/10/2026", "90"]] }))
    expect(lectura.ok && lectura.excel.publicaciones).toEqual([
      { tipo: "share", numero: "1", fecha: "2026-10-03", impresiones: 90, interacciones: null },
    ])
  })

  it("finds the post in a percent-encoded URL", () => {
    const lectura = leerExcelDeLinkedin(
      hojas({ interacciones: [[url("share", "55", "qu%C3%A9-pasa-cuando-te-dicen"), "3/10/2026", "4"]] }),
    )
    expect(lectura.ok && lectura.excel.publicaciones.map((post) => post.numero)).toEqual(["55"])
  })

  it("counts a URL that names no share or ugcPost apart, without failing", () => {
    const lectura = leerExcelDeLinkedin(
      hojas({ interacciones: [["https://www.linkedin.com/posts/alguien_algo-activity-99-XyZ", "3/10/2026", "4"]] }),
    )
    expect(lectura.ok && [lectura.excel.publicaciones, lectura.excel.sinIdentificar]).toEqual([[], 1])
  })

  it("says the list reached LinkedIn's cap of 50", () => {
    const llenas = Array.from({ length: 50 }, (_, i): Fila => [url("share", String(i + 1)), "3/10/2026", "1"])
    const lectura = leerExcelDeLinkedin(hojas({ impresiones: llenas }))
    expect(lectura.ok && lectura.excel.llegoAlTope).toBe(true)
  })

  it("leaves the followers null when their sheet is missing", () => {
    const lectura = leerExcelDeLinkedin(hojas({ seguidores: null }))
    expect(lectura.ok && lectura.excel.seguidores).toBeNull()
  })

  it("refuses the same export with LinkedIn in English", () => {
    const enIngles = new Map([
      ["DISCOVERY", [["Overall performance", "10/1/2026 - 10/30/2026"]]],
      ["TOP POSTS", [["Post URL"]]],
    ])
    expect(leerExcelDeLinkedin(enIngles)).toEqual({ ok: false, error: "otro_idioma" })
  })

  it("refuses a workbook without the posts sheet", () => {
    const sinPublicaciones = new Map(hojas())
    sinPublicaciones.delete("PUBLICACIONES PRINCIPALES")
    expect(leerExcelDeLinkedin(sinPublicaciones)).toEqual({ ok: false, error: "no_es_el_excel" })
  })

  it("refuses a period it cannot read", () => {
    expect(leerExcelDeLinkedin(hojas({ periodo: "último mes" }))).toEqual({ ok: false, error: "periodo_ilegible" })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-leer.test.ts`
Expected: FAIL, cannot resolve `@/lib/metricas/excel-linkedin/leer`.

- [ ] **Step 3: Write the implementation**

`lib/metricas/excel-linkedin/leer.ts`:

```ts
import { leerCifra } from "@/lib/metricas/linkedin"

// The export LinkedIn gives from its content analytics, in Spanish (issue 15, comment of 2026-11-09). Pure: it gets the
// rows already read as text, so every case is tested without a binary file.

/** Text rows per sheet name. */
export type HojasDelExcel = ReadonlyMap<string, readonly (readonly string[])[]>

export type TipoDePost = "share" | "ugcPost"

export interface PostDelExcel {
  tipo: TipoDePost
  /** The number of the post's URN, as text: it has 19 digits, past what a JavaScript number keeps exactly. */
  numero: string
  /** `AAAA-MM-DD`, or null when LinkedIn wrote something else. */
  fecha: string | null
  impresiones: number | null
  interacciones: number | null
}

export interface ExcelDeLinkedin {
  periodo: { desde: string; hasta: string }
  publicaciones: PostDelExcel[]
  seguidores: number | null
  /** One of the two rankings is full: a post past the 50th is missing from the file. */
  llegoAlTope: boolean
  /** Rows whose URL names no share or ugcPost: not a post Conidolly could have published. */
  sinIdentificar: number
}

export type ErrorDelExcel = "no_es_el_excel" | "otro_idioma" | "periodo_ilegible"

export type LecturaDelExcel = { ok: true; excel: ExcelDeLinkedin } | { ok: false; error: ErrorDelExcel }

export const TOPE_POR_LISTA = 50

type Filas = readonly (readonly string[])[]

const HOJA_DEL_PERIODO = "DESCUBRIMIENTO"
const HOJA_DE_PUBLICACIONES = "PUBLICACIONES PRINCIPALES"
const HOJA_DE_SEGUIDORES = "SEGUIDORES"
/** The same export with LinkedIn in English: refused with the same words, told apart in the log. */
const HOJAS_EN_INGLES = ["DISCOVERY", "TOP POSTS", "FOLLOWERS"]
const COLUMNA_URL = "URL de la publicación"
const COLUMNA_FECHA = "Fecha de publicación"
/** The headers are on row 3 today; a note more or less above them should not break the import. */
const FILAS_ANTES_DEL_ENCABEZADO = 5

const FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const PERIODO = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})$/
const TOTAL_DE_SEGUIDORES = /^Total de seguidores el \d{1,2}\/\d{1,2}\/\d{4}$/
const POST_EN_URL = /-(share|ugcPost)-(\d+)-/

/** "9/11/2026" (no leading zeros) is "2026-11-09"; anything that is not a real day is null. */
export function leerFecha(texto: string): string | null {
  const partes = FECHA.exec(texto.trim())
  if (!partes) return null
  const dia = Number(partes[1])
  const mes = Number(partes[2])
  const anio = Number(partes[3])
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null
  return fecha.toISOString().slice(0, 10)
}

/** "1200" or "1.200"; a figure LinkedIn wrote some other way is unknown, not zero. */
function cifra(texto: string): number | null {
  const leida = leerCifra(texto)
  return leida === "invalida" ? null : leida
}

function celda(filas: Filas, fila: number, columna: number): string {
  return filas[fila]?.[columna]?.trim() ?? ""
}

function leerPeriodo(filas: Filas): { desde: string; hasta: string } | null {
  for (const texto of filas[0] ?? []) {
    const partes = PERIODO.exec(texto.trim())
    if (!partes) continue
    const desde = leerFecha(partes[1] ?? "")
    const hasta = leerFecha(partes[2] ?? "")
    if (desde && hasta && desde <= hasta) return { desde, hasta }
  }
  return null
}

function leerSeguidores(filas: Filas | undefined): number | null {
  const primera = filas?.[0] ?? []
  const indice = primera.findIndex((texto) => TOTAL_DE_SEGUIDORES.test(texto.trim()))
  return indice === -1 ? null : cifra(primera[indice + 1] ?? "")
}

interface Columnas {
  url: number
  fecha: number
  cifra: number
}

/** The two rankings sit side by side (interactions in A-C, impressions in E-G): found by their headers. */
function columnasDe(encabezado: readonly string[], titulo: string): Columnas | null {
  const columna = encabezado.findIndex((texto) => texto.trim() === titulo)
  if (columna < 2) return null
  if (encabezado[columna - 2]?.trim() !== COLUMNA_URL || encabezado[columna - 1]?.trim() !== COLUMNA_FECHA) return null
  return { url: columna - 2, fecha: columna - 1, cifra: columna }
}

export function leerExcelDeLinkedin(hojas: HojasDelExcel): LecturaDelExcel {
  const delPeriodo = hojas.get(HOJA_DEL_PERIODO)
  const deLasPublicaciones = hojas.get(HOJA_DE_PUBLICACIONES)
  if (!delPeriodo || !deLasPublicaciones) {
    return { ok: false, error: HOJAS_EN_INGLES.some((hoja) => hojas.has(hoja)) ? "otro_idioma" : "no_es_el_excel" }
  }
  const periodo = leerPeriodo(delPeriodo)
  if (!periodo) return { ok: false, error: "periodo_ilegible" }

  const filaDelEncabezado = deLasPublicaciones
    .slice(0, FILAS_ANTES_DEL_ENCABEZADO)
    .findIndex((fila) => fila.some((texto) => texto.trim() === COLUMNA_URL))
  const encabezado = deLasPublicaciones[filaDelEncabezado] ?? []
  const listas = [
    ["interacciones", columnasDe(encabezado, "Interacciones")],
    ["impresiones", columnasDe(encabezado, "Impresiones")],
  ] as const
  const posts = new Map<string, PostDelExcel>()
  const sinIdentificar = new Set<string>()
  let llegoAlTope = false
  for (const [campo, columnas] of listas) {
    if (filaDelEncabezado === -1 || !columnas) return { ok: false, error: "no_es_el_excel" }
    let largo = 0
    for (let fila = filaDelEncabezado + 1; fila < deLasPublicaciones.length; fila++) {
      const url = celda(deLasPublicaciones, fila, columnas.url)
      if (url === "") continue
      largo += 1
      const identificado = POST_EN_URL.exec(url)
      if (!identificado) {
        sinIdentificar.add(url)
        continue
      }
      const tipo: TipoDePost = identificado[1] === "share" ? "share" : "ugcPost"
      const numero = identificado[2] ?? ""
      const clave = `${tipo}:${numero}`
      const post = posts.get(clave) ?? { tipo, numero, fecha: null, impresiones: null, interacciones: null }
      post.fecha ??= leerFecha(celda(deLasPublicaciones, fila, columnas.fecha))
      post[campo] = cifra(celda(deLasPublicaciones, fila, columnas.cifra))
      posts.set(clave, post)
    }
    if (largo >= TOPE_POR_LISTA) llegoAlTope = true
  }
  return {
    ok: true,
    excel: {
      periodo,
      publicaciones: [...posts.values()],
      seguidores: leerSeguidores(hojas.get(HOJA_DE_SEGUIDORES)),
      llegoAlTope,
      sinIdentificar: sinIdentificar.size,
    },
  }
}
```

Note for the implementer: the first test expects the share post first and the ugcPost second because the interactions ranking is read first; keep that order.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-leer.test.ts && pnpm type`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/metricas/excel-linkedin/leer.ts tests/unit/excel-linkedin-leer.test.ts
git add lib/metricas/excel-linkedin/leer.ts tests/unit/excel-linkedin-leer.test.ts
git commit -m "Read LinkedIn's Excel export: period, both rankings joined by URL, followers and cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `cruzarConPiezas`

**Files:**
- Create: `lib/metricas/excel-linkedin/cruzar.ts`
- Test: `tests/unit/excel-linkedin-cruzar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { cruzarConPiezas, type PublicacionDeLinkedin } from "@/lib/metricas/excel-linkedin/cruzar"
import type { ExcelDeLinkedin, PostDelExcel, TipoDePost } from "@/lib/metricas/excel-linkedin/leer"

const ZONA = "America/Santiago"

const post = (tipo: TipoDePost, numero: string, fecha: string, impresiones = 1000, interacciones = 10): PostDelExcel => ({
  tipo,
  numero,
  fecha,
  impresiones,
  interacciones,
})

const excel = (publicaciones: PostDelExcel[], extra: Partial<ExcelDeLinkedin> = {}): ExcelDeLinkedin => ({
  periodo: { desde: "2026-10-01", hasta: "2026-10-30" },
  publicaciones,
  seguidores: 830,
  llegoAlTope: false,
  sinIdentificar: 0,
  ...extra,
})

// 15:00 UTC is noon in Santiago: the day stays the same.
const pieza = (piezaId: string, dia: string, postUrn: string | null = null): PublicacionDeLinkedin => ({
  piezaId,
  titulo: `Pieza ${piezaId}`,
  postUrn,
  publicadoEn: `${dia}T15:00:00.000Z`,
})

describe("cruzarConPiezas", () => {
  it("matches a post Conidolly published by the number of its share URN", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "71", "2026-10-03", 1200, 12)]),
      [pieza("a", "2026-10-03", "urn:li:share:71")],
      ZONA,
    )
    expect(cruce).toEqual({
      seguros: [{ piezaId: "a", impresiones: 1200, interacciones: 12 }],
      dudosos: [],
      ajenas: 0,
      faltanEnElPeriodo: 0,
    })
  })

  it("matches an ugcPost URN, and never mixes it with a share of the same number", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "72", "2026-10-07", 1), post("ugcPost", "72", "2026-10-07", 2300, 40)]),
      [pieza("a", "2026-10-07", "urn:li:ugcPost:72")],
      ZONA,
    )
    expect(cruce.seguros).toEqual([{ piezaId: "a", impresiones: 2300, interacciones: 40 }])
  })

  it("pairs a hand upload with the only free Excel post of its day", () => {
    const cruce = cruzarConPiezas(excel([post("share", "80", "2026-10-07", 500, 5)]), [pieza("m", "2026-10-07")], ZONA)
    expect(cruce.seguros).toEqual([{ piezaId: "m", impresiones: 500, interacciones: 5 }])
    expect(cruce.dudosos).toEqual([])
  })

  it("leaves two hand uploads of the same day doubtful, each offered that day's posts", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "81", "2026-10-07", 500, 5), post("share", "82", "2026-10-07", 700, 7)]),
      [pieza("m", "2026-10-07"), pieza("n", "2026-10-07")],
      ZONA,
    )
    const opciones = [
      { clave: "share:81", fecha: "2026-10-07", impresiones: 500, interacciones: 5 },
      { clave: "share:82", fecha: "2026-10-07", impresiones: 700, interacciones: 7 },
    ]
    expect(cruce.seguros).toEqual([])
    expect(cruce.dudosos).toEqual([
      { piezaId: "m", titulo: "Pieza m", fecha: "2026-10-07", opciones },
      { piezaId: "n", titulo: "Pieza n", fecha: "2026-10-07", opciones },
    ])
    expect(cruce.ajenas).toBe(0)
  })

  it("leaves a hand upload with no post that day doubtful, offering the posts of the day beside it", () => {
    const cruce = cruzarConPiezas(excel([post("share", "83", "2026-10-08", 300, 3)]), [pieza("m", "2026-10-07")], ZONA)
    expect(cruce.dudosos).toEqual([
      {
        piezaId: "m",
        titulo: "Pieza m",
        fecha: "2026-10-07",
        opciones: [{ clave: "share:83", fecha: "2026-10-08", impresiones: 300, interacciones: 3 }],
      },
    ])
  })

  it("never offers a post already claimed by a URN", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "84", "2026-10-07")]),
      [pieza("a", "2026-10-07", "urn:li:share:84"), pieza("m", "2026-10-07")],
      ZONA,
    )
    expect(cruce.dudosos).toEqual([])
    expect(cruce.faltanEnElPeriodo).toBe(1)
  })

  it("counts the Excel posts that are not Conidolly's, unidentified rows included", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "71", "2026-10-03"), post("share", "90", "2026-10-12"), post("ugcPost", "91", "2026-10-20")], {
        sinIdentificar: 1,
      }),
      [pieza("a", "2026-10-03", "urn:li:share:71")],
      ZONA,
    )
    expect(cruce.ajenas).toBe(3)
  })

  it("counts a Conidolly post of the period missing from the file, not one outside it", () => {
    const cruce = cruzarConPiezas(
      excel([]),
      [pieza("dentro", "2026-10-15", "urn:li:share:1"), pieza("fuera", "2026-09-15", "urn:li:share:2")],
      ZONA,
    )
    expect(cruce.faltanEnElPeriodo).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-cruzar.test.ts`
Expected: FAIL, cannot resolve `@/lib/metricas/excel-linkedin/cruzar`.

- [ ] **Step 3: Write the implementation**

`lib/metricas/excel-linkedin/cruzar.ts`:

```ts
import { diaLocal } from "@/lib/dominio/fechas"
import { sumarDias } from "@/lib/dominio/metricas"
import type { ExcelDeLinkedin, PostDelExcel } from "./leer"

// Which Excel post is which Conidolly piece (spec 2026-11-09, decision 2). Pure: the publications and the zone come in.

export interface PublicacionDeLinkedin {
  piezaId: string
  titulo: string
  /** `urn:li:share:<n>` or `urn:li:ugcPost:<n>` when Conidolly published it; null when she uploaded it herself. */
  postUrn: string | null
  /** ISO instant: the signed publishing time or, without one, when the row was marked. */
  publicadoEn: string
}

export interface NumerosDelExcel {
  piezaId: string
  impresiones: number | null
  interacciones: number | null
}

export interface OpcionDelExcel {
  /** `share:<n>` or `ugcPost:<n>`. */
  clave: string
  fecha: string | null
  impresiones: number | null
  interacciones: number | null
}

export interface Dudoso {
  piezaId: string
  titulo: string
  /** The piece's day in the app's zone. */
  fecha: string
  opciones: OpcionDelExcel[]
}

export interface Cruce {
  seguros: NumerosDelExcel[]
  dudosos: Dudoso[]
  /** Excel posts that are not Conidolly's: ignored. */
  ajenas: number
  /** Conidolly posts published inside the period that the file does not bring. */
  faltanEnElPeriodo: number
}

const URN = /^urn:li:(share|ugcPost):(\d+)$/
/**
 * A hand upload is dated by its signed time or by when she marked it, which can trail the real post by a day: a
 * doubtful one is offered the free posts of the day before and after too.
 */
const DIAS_DE_HOLGURA = 1

export const claveDePost = (post: Pick<PostDelExcel, "tipo" | "numero">): string => `${post.tipo}:${post.numero}`

const numerosDe = (piezaId: string, post: PostDelExcel): NumerosDelExcel => ({
  piezaId,
  impresiones: post.impresiones,
  interacciones: post.interacciones,
})

interface SubidaAMano {
  piezaId: string
  titulo: string
  dia: string
}

export function cruzarConPiezas(
  excel: ExcelDeLinkedin,
  publicaciones: readonly PublicacionDeLinkedin[],
  zona: string,
): Cruce {
  const { desde, hasta } = excel.periodo
  const enElPeriodo = (dia: string) => dia >= desde && dia <= hasta
  const porClave = new Map(excel.publicaciones.map((post) => [claveDePost(post), post]))
  const usadas = new Set<string>()
  const seguros: NumerosDelExcel[] = []
  const aMano: SubidaAMano[] = []
  let faltanEnElPeriodo = 0

  // 1. The URN Conidolly kept when it published names the post exactly.
  for (const publicacion of publicaciones) {
    const dia = diaLocal(Date.parse(publicacion.publicadoEn), zona)
    const urn = publicacion.postUrn ? URN.exec(publicacion.postUrn) : null
    if (!urn) {
      if (enElPeriodo(dia)) aMano.push({ piezaId: publicacion.piezaId, titulo: publicacion.titulo, dia })
      continue
    }
    const clave = `${urn[1]}:${urn[2]}`
    const post = porClave.get(clave)
    if (post) {
      usadas.add(clave)
      seguros.push(numerosDe(publicacion.piezaId, post))
    } else if (enElPeriodo(dia)) {
      faltanEnElPeriodo += 1
    }
  }

  // 2. A day with exactly one hand upload and exactly one free Excel post pairs them on its own.
  const porDia = new Map<string, SubidaAMano[]>()
  for (const subida of aMano) porDia.set(subida.dia, [...(porDia.get(subida.dia) ?? []), subida])
  const pendientes: SubidaAMano[] = []
  for (const [dia, subidas] of porDia) {
    const libres = excel.publicaciones.filter((post) => post.fecha === dia && !usadas.has(claveDePost(post)))
    const [subida] = subidas
    const [post] = libres
    if (subidas.length === 1 && libres.length === 1 && subida && post) {
      usadas.add(claveDePost(post))
      seguros.push(numerosDe(subida.piezaId, post))
    } else {
      pendientes.push(...subidas)
    }
  }

  // 3. Anything else is doubtful: Coni picks among the free posts of that day and the ones beside it.
  const dudosos: Dudoso[] = []
  const ofrecidas = new Set<string>()
  for (const subida of pendientes) {
    const cerca = new Set([sumarDias(subida.dia, -DIAS_DE_HOLGURA), subida.dia, sumarDias(subida.dia, DIAS_DE_HOLGURA)])
    const opciones = excel.publicaciones
      .filter((post) => post.fecha !== null && cerca.has(post.fecha) && !usadas.has(claveDePost(post)))
      .sort(
        (a, b) =>
          Number(b.fecha === subida.dia) - Number(a.fecha === subida.dia) ||
          (a.fecha ?? "").localeCompare(b.fecha ?? ""),
      )
      .map((post) => ({
        clave: claveDePost(post),
        fecha: post.fecha,
        impresiones: post.impresiones,
        interacciones: post.interacciones,
      }))
    if (opciones.length === 0) {
      faltanEnElPeriodo += 1
      continue
    }
    for (const opcion of opciones) ofrecidas.add(opcion.clave)
    dudosos.push({ piezaId: subida.piezaId, titulo: subida.titulo, fecha: subida.dia, opciones })
  }

  const libres = excel.publicaciones.filter((post) => {
    const clave = claveDePost(post)
    return !usadas.has(clave) && !ofrecidas.has(clave)
  })
  return {
    seguros,
    dudosos: dudosos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    ajenas: libres.length + excel.sinIdentificar,
    faltanEnElPeriodo,
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-cruzar.test.ts && pnpm type`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/metricas/excel-linkedin/cruzar.ts tests/unit/excel-linkedin-cruzar.test.ts
git add lib/metricas/excel-linkedin/cruzar.ts tests/unit/excel-linkedin-cruzar.test.ts
git commit -m "Match the Excel's posts to Conidolly's pieces: URN first, then the day of a hand upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The import's sentences (`resumen.ts`)

**Files:**
- Create: `lib/metricas/excel-linkedin/resumen.ts`
- Test: `tests/unit/excel-linkedin-resumen.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  diaEnPalabras,
  etiquetaDeOpcion,
  resumenDeDudosos,
  resumenDeImportacion,
} from "@/lib/metricas/excel-linkedin/resumen"

const BASE = { guardadas: 3, seguidores: 830, ajenas: 0, faltanEnElPeriodo: 0, llegoAlTope: false, dudosos: 0 }

describe("resumenDeImportacion", () => {
  it("says how many pieces got numbers and the followers saved", () => {
    expect(resumenDeImportacion(BASE)).toEqual(["Listo: 3 publicaciones con números.", "También guardé tus seguidores: 830."])
    expect(resumenDeImportacion({ ...BASE, guardadas: 1, seguidores: null })).toEqual([
      "Listo: 1 publicación con números.",
    ])
  })

  it("says how many Excel posts were not from Conidolly and were ignored", () => {
    expect(resumenDeImportacion({ ...BASE, ajenas: 1 })).toContain(
      "Ignoré 1 publicación del Excel que no salió de Conidolly.",
    )
    expect(resumenDeImportacion({ ...BASE, ajenas: 4 })).toContain(
      "Ignoré 4 publicaciones del Excel que no salieron de Conidolly.",
    )
  })

  it("says when the period has no Conidolly posts and only the followers were saved", () => {
    expect(resumenDeImportacion({ ...BASE, guardadas: 0, ajenas: 2 })).toEqual([
      "En ese período no hay publicaciones de Conidolly: guardé solo tus seguidores (830).",
      "Ignoré 2 publicaciones del Excel que no salieron de Conidolly.",
    ])
    expect(resumenDeImportacion({ ...BASE, guardadas: 0, seguidores: null })).toEqual([
      "En ese período no hay publicaciones de Conidolly. No guardé nada.",
    ])
  })

  it("asks for a shorter period only when a list is full and a Conidolly post is missing", () => {
    expect(resumenDeImportacion({ ...BASE, faltanEnElPeriodo: 2, llegoAlTope: true })).toContain(
      "Faltan 2 publicaciones de Conidolly: el Excel trae hasta 50 por lista. Descarga un período más corto (30 o 90 días) y súbelo de nuevo.",
    )
    expect(resumenDeImportacion({ ...BASE, faltanEnElPeriodo: 2, llegoAlTope: false }).join(" ")).not.toMatch(
      /período más corto/,
    )
  })

  it("tells her some hand uploads wait for her pick", () => {
    expect(resumenDeImportacion({ ...BASE, guardadas: 0, seguidores: null, dudosos: 1 })).toEqual([
      "Falta que elijas a qué post del Excel corresponde 1 publicación subida a mano.",
    ])
  })
})

describe("resumenDeDudosos", () => {
  it("counts what her picks saved", () => {
    expect(resumenDeDudosos(1)).toEqual(["Listo: 1 publicación más con números."])
    expect(resumenDeDudosos(2)).toEqual(["Listo: 2 publicaciones más con números."])
  })
})

describe("etiquetaDeOpcion", () => {
  it("names an Excel post by its day and its figures", () => {
    expect(diaEnPalabras("2026-10-07")).toBe("miércoles 7 de octubre")
    expect(etiquetaDeOpcion({ clave: "share:1", fecha: "2026-10-07", impresiones: 2300, interacciones: 40 })).toBe(
      "miércoles 7 de octubre · 2.300 impresiones · 40 interacciones",
    )
    expect(etiquetaDeOpcion({ clave: "share:1", fecha: null, impresiones: null, interacciones: 1 })).toBe(
      "Sin fecha · 1 interacción",
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-resumen.test.ts`
Expected: FAIL, cannot resolve `@/lib/metricas/excel-linkedin/resumen`.

- [ ] **Step 3: Write the implementation**

`lib/metricas/excel-linkedin/resumen.ts`:

```ts
import type { OpcionDelExcel } from "./cruzar"
import { TOPE_POR_LISTA } from "./leer"

// Every sentence Coni reads about the import, decided here so it is tested without a browser.

/** 2 MB: LinkedIn's export weighs tens of KB. Below Next's 2mb body limit, which also carries the form's overhead. */
export const TAMANO_MAXIMO = 2_000_000

export const COMO_DESCARGARLO = [
  "En LinkedIn, abre Estadísticas y luego Contenido.",
  "Toca Exportar, elige los últimos 30 días y sube aquí el archivo.",
] as const

export const ERROR_NO_ES_EL_EXCEL = `Este no es el Excel de estadísticas de LinkedIn en español. ${COMO_DESCARGARLO.join(" ")}`
export const ERROR_MUY_GRANDE = "Ese archivo pesa más de 2 MB. El Excel de LinkedIn pesa mucho menos: revisa que sea ese."

const numero = (valor: number) => valor.toLocaleString("es-CL")
const publicaciones = (cantidad: number) => `${numero(cantidad)} ${cantidad === 1 ? "publicación" : "publicaciones"}`

export interface DatosDelResumen {
  /** Post rows the database wrote. */
  guardadas: number
  seguidores: number | null
  ajenas: number
  faltanEnElPeriodo: number
  llegoAlTope: boolean
  /** Hand uploads waiting for her pick. */
  dudosos: number
}

export function resumenDeImportacion(datos: DatosDelResumen): string[] {
  const lineas: string[] = []
  if (datos.guardadas > 0) {
    lineas.push(`Listo: ${publicaciones(datos.guardadas)} con números.`)
    if (datos.seguidores !== null) lineas.push(`También guardé tus seguidores: ${numero(datos.seguidores)}.`)
  } else if (datos.dudosos === 0) {
    lineas.push(
      datos.seguidores === null
        ? "En ese período no hay publicaciones de Conidolly. No guardé nada."
        : `En ese período no hay publicaciones de Conidolly: guardé solo tus seguidores (${numero(datos.seguidores)}).`,
    )
  }
  if (datos.ajenas > 0) {
    lineas.push(
      datos.ajenas === 1
        ? "Ignoré 1 publicación del Excel que no salió de Conidolly."
        : `Ignoré ${numero(datos.ajenas)} publicaciones del Excel que no salieron de Conidolly.`,
    )
  }
  if (datos.faltanEnElPeriodo > 0 && datos.llegoAlTope) {
    const faltan = datos.faltanEnElPeriodo === 1 ? "Falta 1 publicación" : `Faltan ${publicaciones(datos.faltanEnElPeriodo)}`
    lineas.push(
      `${faltan} de Conidolly: el Excel trae hasta ${TOPE_POR_LISTA} por lista. Descarga un período más corto (30 o 90 días) y súbelo de nuevo.`,
    )
  }
  if (datos.dudosos > 0) {
    lineas.push(
      datos.dudosos === 1
        ? "Falta que elijas a qué post del Excel corresponde 1 publicación subida a mano."
        : `Falta que elijas a qué post del Excel corresponden ${publicaciones(datos.dudosos)} subidas a mano.`,
    )
  }
  return lineas
}

export function resumenDeDudosos(guardadas: number): string[] {
  return [`Listo: ${publicaciones(guardadas)} más con números.`]
}

/** "2026-10-07" is "miércoles 7 de octubre". Noon UTC keeps the calendar day whatever the zone. */
export function diaEnPalabras(dia: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dia}T12:00:00Z`))
  return texto.replace(",", "")
}

export function etiquetaDeOpcion(opcion: OpcionDelExcel): string {
  const partes = [opcion.fecha ? diaEnPalabras(opcion.fecha) : "Sin fecha"]
  if (opcion.impresiones !== null) {
    partes.push(`${numero(opcion.impresiones)} ${opcion.impresiones === 1 ? "impresión" : "impresiones"}`)
  }
  if (opcion.interacciones !== null) {
    partes.push(`${numero(opcion.interacciones)} ${opcion.interacciones === 1 ? "interacción" : "interacciones"}`)
  }
  return partes.join(" · ")
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-resumen.test.ts && pnpm type`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/metricas/excel-linkedin/resumen.ts tests/unit/excel-linkedin-resumen.test.ts
git add lib/metricas/excel-linkedin/resumen.ts tests/unit/excel-linkedin-resumen.test.ts
git diff --cached | grep -n $'\xe2\x80\x94'   # must print nothing
git commit -m "Word the LinkedIn import's summary, errors and doubtful options for Coni

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch C: file adapter

### Task 5: Dependencies, synthetic fixture and `leerHojas`

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `tests/fixtures/excel-linkedin.ts`, `scripts/excel-linkedin-de-prueba.ts`, `tests/fixtures/excel-linkedin.xlsx` (generated)
- Create: `lib/metricas/excel-linkedin/archivo.ts`
- Test: `tests/unit/excel-linkedin-archivo.test.ts`

- [ ] **Step 1: Pin the dependencies**

```bash
pnpm add --save-exact read-excel-file@9.3.12
pnpm add --save-dev --save-exact write-excel-file@4.1.1
```

Then add to `package.json` `scripts` (after `"comparar"`):

```json
    "fixture:excel-linkedin": "tsx scripts/excel-linkedin-de-prueba.ts",
    "revisar:excel-linkedin": "tsx scripts/revisar-excel-linkedin.ts"
```

- [ ] **Step 2: Write the fixture data and the script that writes the `.xlsx`**

`tests/fixtures/excel-linkedin.ts`:

```ts
import { join } from "node:path"

// A synthetic LinkedIn export (issue 15's format, fake URLs and numbers). Federico's real file never enters the repo.

/** Written by `pnpm fixture:excel-linkedin`; committed so the tests need no generator. */
export const EXCEL_DE_PRUEBA = join(__dirname, "excel-linkedin.xlsx")

/** Published by Conidolly through the API: `urn:li:share:<this>`. */
export const POST_COMPARTIDO = "7380000000000000001"
/** Uploaded by hand on 7 October: no URN, matched by its day. */
export const POST_UGC = "7380000000000000002"
/** Somebody else's repost: not Conidolly's. */
export const POST_AJENO = "7380000000000000003"

const url = (tipo: string, numero: string, titulo: string) =>
  `https://www.linkedin.com/posts/constanza-del-rosario_${titulo}-${tipo}-${numero}-AbCd`

export const HOJAS_DE_PRUEBA: { sheet: string; data: string[][] }[] = [
  {
    sheet: "DESCUBRIMIENTO",
    data: [
      ["Rendimiento general", "1/10/2026 - 30/10/2026"],
      ["Impresiones", "3800"],
      ["Miembros alcanzados", "2100"],
    ],
  },
  { sheet: "INTERACCIÓN", data: [["Fecha", "Impresiones", "Interacciones"], ["1/10/2026", "120", "4"]] },
  {
    sheet: "PUBLICACIONES PRINCIPALES",
    data: [
      ["Esta lista puede incluir 50 publicaciones como máximo"],
      [],
      [
        "URL de la publicación",
        "Fecha de publicación",
        "Interacciones",
        "",
        "URL de la publicación",
        "Fecha de publicación",
        "Impresiones",
      ],
      [
        url("ugcPost", POST_UGC, "qu%C3%A9-pasa-cuando-te-dicen"),
        "7/10/2026",
        "40",
        "",
        url("ugcPost", POST_UGC, "qu%C3%A9-pasa-cuando-te-dicen"),
        "7/10/2026",
        "2300",
      ],
      [
        url("share", POST_COMPARTIDO, "lo-que-firma-un-modelo"),
        "3/10/2026",
        "12",
        "",
        url("share", POST_COMPARTIDO, "lo-que-firma-un-modelo"),
        "3/10/2026",
        "1200",
      ],
      [url("share", POST_AJENO, "repost"), "20/10/2026", "5", "", url("share", POST_AJENO, "repost"), "20/10/2026", "300"],
    ],
  },
  {
    sheet: "SEGUIDORES",
    data: [["Total de seguidores el 30/10/2026", "830"], [], ["Fecha", "Nuevos seguidores"], ["1/10/2026", "3"]],
  },
  { sheet: "INFORMACIÓN DETALLADA DEL PÚBLI", data: [["Información detallada principal", "Valor", "Porcentaje"]] },
]
```

`scripts/excel-linkedin-de-prueba.ts`:

```ts
// Writes tests/fixtures/excel-linkedin.xlsx from tests/fixtures/excel-linkedin.ts: every cell as text and empty cells
// left blank, as LinkedIn writes them.
//   pnpm fixture:excel-linkedin
import writeExcelFile, { type Row } from "write-excel-file/node"
import { EXCEL_DE_PRUEBA, HOJAS_DE_PRUEBA } from "@/tests/fixtures/excel-linkedin"

const comoTexto = (fila: readonly string[]): Row =>
  fila.map((valor) => (valor === "" ? null : { value: valor, type: String }))

async function principal(): Promise<void> {
  await writeExcelFile(HOJAS_DE_PRUEBA.map(({ sheet, data }) => ({ sheet, data: data.map(comoTexto) }))).toFile(
    EXCEL_DE_PRUEBA,
  )
  console.log(`Escribí ${EXCEL_DE_PRUEBA}`)
}

principal().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
```

Run: `pnpm fixture:excel-linkedin`
Expected: `Escribí .../tests/fixtures/excel-linkedin.xlsx`, file of a few KB.

- [ ] **Step 3: Write the failing adapter test**

`tests/unit/excel-linkedin-archivo.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { leerHojas } from "@/lib/metricas/excel-linkedin/archivo"
import { leerExcelDeLinkedin } from "@/lib/metricas/excel-linkedin/leer"
import { EXCEL_DE_PRUEBA, POST_AJENO, POST_COMPARTIDO, POST_UGC } from "../fixtures/excel-linkedin"

describe("leerHojas", () => {
  it("reads the synthetic export end to end, blank cells as empty text", async () => {
    const leidas = await leerHojas(new Blob([new Uint8Array(readFileSync(EXCEL_DE_PRUEBA))]))
    if (!leidas.ok) throw new Error(leidas.error)
    expect(leidas.hojas.get("PUBLICACIONES PRINCIPALES")?.[1]?.every((texto) => texto === "")).toBe(true)

    const lectura = leerExcelDeLinkedin(leidas.hojas)
    if (!lectura.ok) throw new Error(lectura.error)
    expect(lectura.excel).toEqual({
      periodo: { desde: "2026-10-01", hasta: "2026-10-30" },
      publicaciones: [
        { tipo: "ugcPost", numero: POST_UGC, fecha: "2026-10-07", impresiones: 2300, interacciones: 40 },
        { tipo: "share", numero: POST_COMPARTIDO, fecha: "2026-10-03", impresiones: 1200, interacciones: 12 },
        { tipo: "share", numero: POST_AJENO, fecha: "2026-10-20", impresiones: 300, interacciones: 5 },
      ],
      seguidores: 830,
      llegoAlTope: false,
      sinIdentificar: 0,
    })
  })

  it("answers no_es_el_excel for a file that is not an xlsx", async () => {
    expect(await leerHojas(new Blob(["hola"]))).toEqual({ ok: false, error: "no_es_el_excel" })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-archivo.test.ts`
Expected: FAIL, cannot resolve `@/lib/metricas/excel-linkedin/archivo`.

- [ ] **Step 5: Write the adapter**

`lib/metricas/excel-linkedin/archivo.ts`:

```ts
import readXlsxFile, { InvalidInputError, InvalidSpreadsheetError } from "read-excel-file/node"
import type { HojasDelExcel } from "./leer"

export type HojasLeidas = { ok: true; hojas: HojasDelExcel } | { ok: false; error: "no_es_el_excel" }

/** LinkedIn writes every value as text; a cell some other tool typed is read the same way. Blank is "". */
function comoTexto(celda: unknown): string {
  if (celda === null || celda === undefined) return ""
  if (celda instanceof Date) return celda.toISOString().slice(0, 10)
  return String(celda).trim()
}

/** The uploaded file as text rows per sheet. A file that is not an .xlsx is an answer for Coni, not a failure. */
export async function leerHojas(archivo: Blob): Promise<HojasLeidas> {
  let hojas: Awaited<ReturnType<typeof readXlsxFile>>
  try {
    hojas = await readXlsxFile(Buffer.from(await archivo.arrayBuffer()))
  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof InvalidSpreadsheetError) {
      return { ok: false, error: "no_es_el_excel" }
    }
    throw error
  }
  return { ok: true, hojas: new Map(hojas.map(({ sheet, data }) => [sheet, data.map((fila) => fila.map(comoTexto))])) }
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/excel-linkedin-archivo.test.ts && pnpm type`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write lib/metricas/excel-linkedin/archivo.ts tests/unit/excel-linkedin-archivo.test.ts tests/fixtures/excel-linkedin.ts scripts/excel-linkedin-de-prueba.ts package.json
git add package.json pnpm-lock.yaml lib/metricas/excel-linkedin/archivo.ts tests/unit/excel-linkedin-archivo.test.ts tests/fixtures/excel-linkedin.ts tests/fixtures/excel-linkedin.xlsx scripts/excel-linkedin-de-prueba.ts
git commit -m "Read the uploaded xlsx into text rows with read-excel-file, tested on a synthetic export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Local check of a real export (no saving)

Done-when 5 asks for one validation with Coni's real export before she relies on it. This script lets Federico run the reader on that file locally; the file never enters the repo and nothing is written anywhere.

**Files:**
- Create: `scripts/revisar-excel-linkedin.ts`

- [ ] **Step 1: Write the script**

```ts
// Reads a LinkedIn export the way the importer does and prints what it sees. Writes nothing.
//   pnpm revisar:excel-linkedin <ruta al .xlsx>
import { readFileSync } from "node:fs"
import { leerHojas } from "@/lib/metricas/excel-linkedin/archivo"
import { leerExcelDeLinkedin } from "@/lib/metricas/excel-linkedin/leer"

async function principal(): Promise<void> {
  const [ruta] = process.argv.slice(2)
  if (!ruta) throw new Error("Uso: pnpm revisar:excel-linkedin <ruta al .xlsx>")
  const leidas = await leerHojas(new Blob([new Uint8Array(readFileSync(ruta))]))
  if (!leidas.ok) throw new Error(`No es un .xlsx: ${leidas.error}`)
  console.log(`Hojas: ${[...leidas.hojas.keys()].join(", ")}`)
  const lectura = leerExcelDeLinkedin(leidas.hojas)
  if (!lectura.ok) throw new Error(`El importador lo rechaza: ${lectura.error}`)
  const { periodo, publicaciones, seguidores, llegoAlTope, sinIdentificar } = lectura.excel
  console.log(`Período: ${periodo.desde} a ${periodo.hasta}`)
  console.log(`Publicaciones: ${publicaciones.length} (sin identificar: ${sinIdentificar}; lista llena: ${llegoAlTope})`)
  console.log(`Seguidores: ${seguidores ?? "no vienen"}`)
  for (const post of publicaciones.slice(0, 5)) console.log(JSON.stringify(post))
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run it on the fixture**

Run: `pnpm revisar:excel-linkedin tests/fixtures/excel-linkedin.xlsx`
Expected: `Período: 2026-10-01 a 2026-10-30`, `Publicaciones: 3 (sin identificar: 0; lista llena: false)`, `Seguidores: 830`.

- [ ] **Step 3: Commit**

```bash
pnpm exec biome check --write scripts/revisar-excel-linkedin.ts
git add scripts/revisar-excel-linkedin.ts
git commit -m "Add a local check that shows what the importer reads in a real LinkedIn export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch D: server

### Task 7: Data access (`lib/datos/excel-linkedin.ts`)

**Files:**
- Create: `lib/datos/excel-linkedin.ts`
- Test: `tests/integration/excel-linkedin-datos.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { guardarExcelDeLinkedin, leerPublicacionesDeLinkedin } from "@/lib/datos/excel-linkedin"
import { leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { sinNumerosEstaSemana } from "@/lib/metricas/linkedin"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>
const LUNES = Date.parse("2026-10-19T15:00:00.000Z") // Monday 19 Oct, 12:00 in Santiago

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_linkedin_cuenta")
}

async function enLinkedin(titulo: string, instante: string, estado: "publicado" | "subido_a_mano"): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin", estado)
  await moverHoraAprobada(id, instante)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("leerPublicacionesDeLinkedin", () => {
  it("gives every LinkedIn row that went out, with its URN or none for a hand upload", async () => {
    const api = await enLinkedin("Por la API", "2026-10-14T22:00:00.000Z", "publicado")
    const aMano = await enLinkedin("A mano", "2026-10-13T22:00:00.000Z", "subido_a_mano")
    const soloInstagram = await sembrarPieza("publicado", { titulo: "Solo Instagram", media_id: "m" })
    await moverHoraAprobada(soloInstagram, "2026-10-14T22:00:00.000Z")

    const publicaciones = await leerPublicacionesDeLinkedin(coni)

    expect(publicaciones.sort((a, b) => a.titulo.localeCompare(b.titulo))).toEqual([
      { piezaId: aMano, titulo: "A mano", postUrn: null, publicadoEn: expect.stringMatching(/^2026-10-13T22:00:00/) },
      {
        piezaId: api,
        titulo: "Por la API",
        postUrn: expect.stringMatching(/^urn:li:share:\d+$/),
        publicadoEn: expect.stringMatching(/^2026-10-14T22:00:00/),
      },
    ])
  })
})

describe("guardarExcelDeLinkedin", () => {
  it("writes the posts and the followers as Coni and clears this week's Inicio reminder", async () => {
    const post = await enLinkedin("Reciente", "2026-10-14T22:00:00.000Z", "publicado")
    expect(sinNumerosEstaSemana((await leerLinkedinParaAnotar(coni, LUNES)).posts)).toHaveLength(1)

    const escritas = await guardarExcelDeLinkedin(coni, {
      medidoEn: "2026-10-19",
      semana: "2026-10-19",
      posts: [{ piezaId: post, impresiones: 1200, interacciones: 12 }],
      seguidores: 830,
    })

    expect(escritas).toBe(1)
    const { rows } = await pool.query(
      "select impresiones, interacciones, origen, anotado_por from public.metricas_linkedin where pieza_id = $1",
      [post],
    )
    expect(rows).toEqual([{ impresiones: 1200, interacciones: 12, origen: "excel", anotado_por: CONI }])
    const cuenta = await pool.query("select seguidores, origen from public.metricas_linkedin_cuenta")
    expect(cuenta.rows).toEqual([{ seguidores: 830, origen: "excel" }])
    expect(sinNumerosEstaSemana((await leerLinkedinParaAnotar(coni, LUNES)).posts)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/excel-linkedin-datos.test.ts`
Expected: FAIL, cannot resolve `@/lib/datos/excel-linkedin`.

- [ ] **Step 3: Write the implementation**

`lib/datos/excel-linkedin.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NumerosDelExcel, PublicacionDeLinkedin } from "@/lib/metricas/excel-linkedin/cruzar"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

/** Every LinkedIn row that went out, through Coni's session (only she reads `publicaciones`). */
export async function leerPublicacionesDeLinkedin(db: Db): Promise<PublicacionDeLinkedin[]> {
  const { data, error } = await db
    .from("publicaciones")
    .select("pieza_id, post_urn, marcado_en, piezas(titulo, puerta2_publicar_en)")
    .eq("destino", "linkedin")
    .in("estado", ["publicado", "subido_a_mano"])
  if (error) throw fallo("No pude leer las publicaciones de LinkedIn", error)
  return data.flatMap((fila) => {
    const publicadoEn = fila.piezas?.puerta2_publicar_en ?? fila.marcado_en
    return fila.piezas && publicadoEn
      ? [{ piezaId: fila.pieza_id, titulo: fila.piezas.titulo, postUrn: fila.post_urn, publicadoEn }]
      : []
  })
}

/**
 * The matched posts and the week's followers in one transaction (`importar_excel_linkedin`). The database seals who
 * wrote them and never changes a row from the API. Answers the post rows written.
 */
export async function guardarExcelDeLinkedin(
  db: Db,
  entrada: { medidoEn: string; semana: string; posts: readonly NumerosDelExcel[]; seguidores: number | null },
): Promise<number> {
  const { data, error } = await db.rpc("importar_excel_linkedin", {
    p_medido_en: entrada.medidoEn,
    p_semana: entrada.semana,
    p_posts: entrada.posts.map((post) => ({
      pieza_id: post.piezaId,
      impresiones: post.impresiones,
      interacciones: post.interacciones,
    })),
    ...(entrada.seguidores === null ? {} : { p_seguidores: entrada.seguidores }),
  })
  if (error) throw fallo("No pude guardar el Excel de LinkedIn", error)
  return data
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:db tests/integration/excel-linkedin-datos.test.ts && pnpm type`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/datos/excel-linkedin.ts tests/integration/excel-linkedin-datos.test.ts
git add lib/datos/excel-linkedin.ts tests/integration/excel-linkedin-datos.test.ts
git commit -m "Read Conidolly's LinkedIn rows and save an Excel import through the RPC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Import action core (`importarExcelDeLinkedin`)

**Files:**
- Create: `lib/acciones/excel-linkedin.ts`
- Test: `tests/unit/acciones-excel-linkedin.test.ts`, `tests/integration/acciones-excel-linkedin.test.ts`

- [ ] **Step 1: Write the failing unit test (refusals and the notice to WAV)**

`tests/unit/acciones-excel-linkedin.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { importarExcelDeLinkedin } from "@/lib/acciones/excel-linkedin"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import { ERROR_MUY_GRANDE, ERROR_NO_ES_EL_EXCEL } from "@/lib/metricas/excel-linkedin/resumen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { EXCEL_DE_PRUEBA } from "../fixtures/excel-linkedin"
import { servidor } from "../msw"

const BASE = "http://127.0.0.1:9"

function deps() {
  const avisos = notificadorEnMemoria()
  return {
    avisos,
    deps: {
      db: createClient<Database>(BASE, "clave-de-prueba"),
      ahora: () => "2026-11-09T15:00:00.000Z",
      avisos: () => avisos,
    },
  }
}

describe("importarExcelDeLinkedin", () => {
  it("refuses a file over 2 MB before reading it", async () => {
    const { deps: d, avisos } = deps()
    const resultado = await importarExcelDeLinkedin(d, new Blob([new Uint8Array(2_000_001)]))
    expect(resultado).toEqual({ ok: false, error: ERROR_MUY_GRANDE })
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("says it is not LinkedIn's Excel in Spanish and saves nothing", async () => {
    const { deps: d } = deps()
    expect(await importarExcelDeLinkedin(d, new Blob(["hola"]))).toEqual({ ok: false, error: ERROR_NO_ES_EL_EXCEL })
  })

  it("asks her to retry and tells WAV through the screen error notice when the save fails", async () => {
    servidor.use(http.all(`${BASE}/*`, () => HttpResponse.json({ message: "caída" }, { status: 500 })))
    const { deps: d, avisos } = deps()

    const resultado = await importarExcelDeLinkedin(d, new Blob([new Uint8Array(readFileSync(EXCEL_DE_PRUEBA))]))

    expect(resultado).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: "Coni vio una pantalla de error",
        detalle: expect.stringContaining("Pantalla: Importar Excel de LinkedIn"),
        idempotencia: "pantalla:Importar Excel de LinkedIn:2026-11-09",
      },
    ])
  })
})
```

- [ ] **Step 2: Write the failing integration test (the happy path through Coni's session)**

`tests/integration/acciones-excel-linkedin.test.ts`:

```ts
import { readFileSync } from "node:fs"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { importarExcelDeLinkedin } from "@/lib/acciones/excel-linkedin"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { EXCEL_DE_PRUEBA, POST_COMPARTIDO, POST_UGC } from "../fixtures/excel-linkedin"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>
const avisos = notificadorEnMemoria()
const deps = () => ({ db: coni, ahora: () => "2026-11-09T15:00:00.000Z", avisos: () => avisos })
const archivo = () => new Blob([new Uint8Array(readFileSync(EXCEL_DE_PRUEBA))])

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_linkedin_cuenta")
}

async function enLinkedin(titulo: string, instante: string, urn: string | null): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin", urn ? "publicado" : "subido_a_mano")
  if (urn) {
    await pool.query("update public.publicaciones set post_urn = $2 where pieza_id = $1 and destino = 'linkedin'", [
      id,
      urn,
    ])
  }
  await moverHoraAprobada(id, instante)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("importarExcelDeLinkedin", () => {
  it("saves the safe posts and the followers, and returns the summary and the doubtful hand uploads", async () => {
    const porApi = await enLinkedin("Lo que firma un modelo", "2026-10-03T15:00:00.000Z", `urn:li:share:${POST_COMPARTIDO}`)
    const primera = await enLinkedin("Qué pasa cuando te dicen", "2026-10-07T15:00:00.000Z", null)
    const segunda = await enLinkedin("Otra del mismo día", "2026-10-07T18:00:00.000Z", null)

    const resultado = await importarExcelDeLinkedin(deps(), archivo())

    const opcion = { clave: `ugcPost:${POST_UGC}`, fecha: "2026-10-07", impresiones: 2300, interacciones: 40 }
    expect(resultado).toEqual({
      ok: true,
      medidoEn: "2026-10-30",
      resumen: [
        "Listo: 1 publicación con números.",
        "También guardé tus seguidores: 830.",
        "Ignoré 1 publicación del Excel que no salió de Conidolly.",
        "Falta que elijas a qué post del Excel corresponden 2 publicaciones subidas a mano.",
      ],
      dudosos: expect.arrayContaining([
        { piezaId: primera, titulo: "Qué pasa cuando te dicen", fecha: "2026-10-07", opciones: [opcion] },
        { piezaId: segunda, titulo: "Otra del mismo día", fecha: "2026-10-07", opciones: [opcion] },
      ]),
    })
    const { rows } = await pool.query(
      "select pieza_id, medido_en::text, impresiones, interacciones, origen from public.metricas_linkedin",
    )
    expect(rows).toEqual([
      { pieza_id: porApi, medido_en: "2026-10-30", impresiones: 1200, interacciones: 12, origen: "excel" },
    ])
    const cuenta = await pool.query("select semana::text, seguidores from public.metricas_linkedin_cuenta")
    expect(cuenta.rows).toEqual([{ semana: "2026-10-26", seguidores: 830 }])
    expect(avisos.aWavEnviados).toEqual([])
  })
})
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm exec vitest run tests/unit/acciones-excel-linkedin.test.ts; pnpm test:db tests/integration/acciones-excel-linkedin.test.ts`
Expected: FAIL, cannot resolve `@/lib/acciones/excel-linkedin`.

- [ ] **Step 4: Write the implementation**

`lib/acciones/excel-linkedin.ts`:

```ts
import { leerZona } from "@/lib/datos/metricas"
import { guardarExcelDeLinkedin, leerPublicacionesDeLinkedin } from "@/lib/datos/excel-linkedin"
import { Falla } from "@/lib/dominio/falla"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import { leerHojas } from "@/lib/metricas/excel-linkedin/archivo"
import { cruzarConPiezas, type Dudoso } from "@/lib/metricas/excel-linkedin/cruzar"
import { leerExcelDeLinkedin } from "@/lib/metricas/excel-linkedin/leer"
import {
  ERROR_MUY_GRANDE,
  ERROR_NO_ES_EL_EXCEL,
  resumenDeImportacion,
  TAMANO_MAXIMO,
} from "@/lib/metricas/excel-linkedin/resumen"
import type { Notificador } from "@/lib/proveedores/avisos"
import { avisarErrorDePantalla } from "./error-de-pantalla"
import type { DepsAcciones } from "./piezas"
import { aResultado, ERROR_GENERICO, type Resultado } from "./resultado"

export interface DepsExcelDeLinkedin extends Pick<DepsAcciones, "db" | "ahora"> {
  avisos: () => Notificador
}

export interface ImportacionDeLinkedin {
  /** The day the readings carry: the last day of the Excel's period. */
  medidoEn: string
  resumen: string[]
  dudosos: Dudoso[]
}

/** The line WAV reads in the email, as the error screens pass theirs (letters and spaces only). */
export const REGISTRO_DEL_IMPORTADOR = "Importar Excel de LinkedIn"

/** The Monday of a calendar day: noon UTC keeps the day whatever the zone. */
export const lunesDe = (dia: string): string => lunesDeLaSemana(Date.parse(`${dia}T12:00:00Z`), "UTC")

/** A failure of ours reaches WAV through the screen error notice (spec, Errors); hers (a wrong file) does not. */
export async function avisandoAWav<T extends object>(
  deps: DepsExcelDeLinkedin,
  resultado: Resultado<T>,
): Promise<Resultado<T>> {
  if (resultado.ok || resultado.error !== ERROR_GENERICO) return resultado
  const aviso = await avisarErrorDePantalla(deps, { registro: REGISTRO_DEL_IMPORTADOR })
  if (!aviso.ok) console.error("No pude avisarle a WAV del Excel de LinkedIn", aviso.error)
  return resultado
}

/** Decision 4: save directly what is safe, then summarise; the doubtful hand uploads go back for her to pick. */
export async function importarExcelDeLinkedin(
  deps: DepsExcelDeLinkedin,
  archivo: Blob,
): Promise<Resultado<ImportacionDeLinkedin>> {
  const resultado = await aResultado("importarExcelDeLinkedin", async () => {
    if (archivo.size > TAMANO_MAXIMO) throw new Falla(ERROR_MUY_GRANDE)
    const leidas = await leerHojas(archivo)
    if (!leidas.ok) throw new Falla(ERROR_NO_ES_EL_EXCEL)
    const lectura = leerExcelDeLinkedin(leidas.hojas)
    if (!lectura.ok) {
      // Same words for Coni whatever the cause; the cause stays in the log for WAV.
      console.warn(`El Excel de LinkedIn no se pudo leer: ${lectura.error}`)
      throw new Falla(ERROR_NO_ES_EL_EXCEL)
    }
    const { excel } = lectura
    const [zona, publicaciones] = await Promise.all([leerZona(deps.db), leerPublicacionesDeLinkedin(deps.db)])
    const cruce = cruzarConPiezas(excel, publicaciones, zona)
    const medidoEn = excel.periodo.hasta
    const guardadas = await guardarExcelDeLinkedin(deps.db, {
      medidoEn,
      semana: lunesDe(medidoEn),
      posts: cruce.seguros,
      seguidores: excel.seguidores,
    })
    return {
      medidoEn,
      dudosos: cruce.dudosos,
      resumen: resumenDeImportacion({
        guardadas,
        seguidores: excel.seguidores,
        ajenas: cruce.ajenas,
        faltanEnElPeriodo: cruce.faltanEnElPeriodo,
        llegoAlTope: excel.llegoAlTope,
        dudosos: cruce.dudosos.length,
      }),
    }
  })
  return avisandoAWav(deps, resultado)
}
```

- [ ] **Step 5: Run both to verify they pass**

Run: `pnpm exec vitest run tests/unit/acciones-excel-linkedin.test.ts && pnpm test:db tests/integration/acciones-excel-linkedin.test.ts && pnpm type`
Expected: PASS (3 unit, 1 integration).

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write lib/acciones/excel-linkedin.ts tests/unit/acciones-excel-linkedin.test.ts tests/integration/acciones-excel-linkedin.test.ts
git add lib/acciones/excel-linkedin.ts tests/unit/acciones-excel-linkedin.test.ts tests/integration/acciones-excel-linkedin.test.ts
git commit -m "Import LinkedIn's Excel: read, match, save the safe posts and tell WAV when saving fails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Doubtful picks action (`guardarDudososDeLinkedin`)

**Files:**
- Modify: `lib/acciones/excel-linkedin.ts`
- Test: `tests/integration/acciones-excel-linkedin.test.ts`, `tests/unit/acciones-excel-linkedin.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/acciones-excel-linkedin.test.ts`:

```ts
import { ESQUEMA_DE_DUDOSOS } from "@/lib/acciones/excel-linkedin"

describe("ESQUEMA_DE_DUDOSOS", () => {
  const elegido = (piezaId: string, clave: string) => ({ piezaId, clave, impresiones: 2300, interacciones: 40 })
  const A = "11111111-1111-4111-8111-111111111111"
  const B = "22222222-2222-4222-8222-222222222222"

  it("accepts one pick per piece and per Excel post", () => {
    expect(ESQUEMA_DE_DUDOSOS.safeParse({ medidoEn: "2026-10-30", elegidos: [elegido(A, "ugcPost:1")] }).success).toBe(true)
  })

  it("refuses one Excel post for two pieces, a piece twice, or nothing picked", () => {
    const mismoPost = { medidoEn: "2026-10-30", elegidos: [elegido(A, "share:1"), elegido(B, "share:1")] }
    const mismaPieza = { medidoEn: "2026-10-30", elegidos: [elegido(A, "share:1"), elegido(A, "share:2")] }
    expect(ESQUEMA_DE_DUDOSOS.safeParse(mismoPost).success).toBe(false)
    expect(ESQUEMA_DE_DUDOSOS.safeParse(mismaPieza).success).toBe(false)
    expect(ESQUEMA_DE_DUDOSOS.safeParse({ medidoEn: "2026-10-30", elegidos: [] }).success).toBe(false)
  })
})
```

(Move the new `import` line up with the other imports.)

Append to `tests/integration/acciones-excel-linkedin.test.ts` (and add `guardarDudososDeLinkedin` to the import from `@/lib/acciones/excel-linkedin`):

```ts
describe("guardarDudososDeLinkedin", () => {
  it("saves the Excel post she picked for a hand upload on the import's day", async () => {
    const aMano = await enLinkedin("Qué pasa cuando te dicen", "2026-10-07T15:00:00.000Z", null)

    const resultado = await guardarDudososDeLinkedin(deps(), {
      medidoEn: "2026-10-30",
      elegidos: [{ piezaId: aMano, clave: `ugcPost:${POST_UGC}`, impresiones: 2300, interacciones: 40 }],
    })

    expect(resultado).toEqual({ ok: true, resumen: ["Listo: 1 publicación más con números."] })
    const { rows } = await pool.query(
      "select medido_en::text, impresiones, interacciones, origen from public.metricas_linkedin where pieza_id = $1",
      [aMano],
    )
    expect(rows).toEqual([{ medido_en: "2026-10-30", impresiones: 2300, interacciones: 40, origen: "excel" }])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/acciones-excel-linkedin.test.ts; pnpm test:db tests/integration/acciones-excel-linkedin.test.ts`
Expected: FAIL, `ESQUEMA_DE_DUDOSOS` and `guardarDudososDeLinkedin` are not exported.

- [ ] **Step 3: Write the implementation**

Add to `lib/acciones/excel-linkedin.ts` (imports: `import { z } from "zod"` and `resumenDeDudosos` from `@/lib/metricas/excel-linkedin/resumen`):

```ts
const CIFRA = z.number().int().min(0).max(999_999_999).nullable()

/** Her picks for the doubtful hand uploads: each piece once, each Excel post for one piece. */
export const ESQUEMA_DE_DUDOSOS = z.object({
  medidoEn: z.iso.date(),
  elegidos: z
    .array(
      z.object({
        piezaId: z.uuid(),
        clave: z.string().regex(/^(share|ugcPost):\d{1,20}$/),
        impresiones: CIFRA,
        interacciones: CIFRA,
      }),
    )
    .min(1)
    .max(100)
    .refine((elegidos) => new Set(elegidos.map((e) => e.piezaId)).size === elegidos.length, "Una publicación va una vez.")
    .refine((elegidos) => new Set(elegidos.map((e) => e.clave)).size === elegidos.length, "Un post va con una publicación."),
})

/** Saves what she picked through the same RPC as the import; the followers were already saved then. */
export async function guardarDudososDeLinkedin(
  deps: DepsExcelDeLinkedin,
  entrada: z.output<typeof ESQUEMA_DE_DUDOSOS>,
): Promise<Resultado<{ resumen: string[] }>> {
  const resultado = await aResultado("guardarDudososDeLinkedin", async () => {
    const guardadas = await guardarExcelDeLinkedin(deps.db, {
      medidoEn: entrada.medidoEn,
      semana: lunesDe(entrada.medidoEn),
      posts: entrada.elegidos.map(({ piezaId, impresiones, interacciones }) => ({ piezaId, impresiones, interacciones })),
      seguidores: null,
    })
    return { resumen: resumenDeDudosos(guardadas) }
  })
  return avisandoAWav(deps, resultado)
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm exec vitest run tests/unit/acciones-excel-linkedin.test.ts && pnpm test:db tests/integration/acciones-excel-linkedin.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/acciones/excel-linkedin.ts tests/unit/acciones-excel-linkedin.test.ts tests/integration/acciones-excel-linkedin.test.ts
git add lib/acciones/excel-linkedin.ts tests/unit/acciones-excel-linkedin.test.ts tests/integration/acciones-excel-linkedin.test.ts
git commit -m "Save Coni's picks for the doubtful hand uploads through the same RPC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Server Actions and `next.config.ts`

**Files:**
- Modify: `app/(app)/metricas/acciones.ts`, `next.config.ts`
- Test: `tests/unit/next-config.test.ts`

- [ ] **Step 1: Write the failing config test**

Append inside the `describe("next.config", ...)` of `tests/unit/next-config.test.ts`:

```ts
  it("takes LinkedIn's Excel through a Server Action (2 MB) and leaves its reader to Node", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("2mb")
    expect(nextConfig.serverExternalPackages).toContain("read-excel-file")
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/next-config.test.ts`
Expected: FAIL, `expected undefined to be '2mb'`.

- [ ] **Step 3: Change `next.config.ts`**

Replace the `serverExternalPackages` line with:

```ts
  // Only the Trigger.dev render uses Chromium; if an import ever reached it, it stays out of the server bundle.
  // `read-excel-file` reads LinkedIn's Excel with Node streams and zip libraries: loaded by Node, not bundled.
  serverExternalPackages: ["playwright", "read-excel-file"],
  // LinkedIn's Excel arrives through a Server Action; the app refuses a file over 2,000,000 bytes before sending it.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
```

- [ ] **Step 4: Add the Server Actions**

`app/(app)/metricas/acciones.ts` becomes:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ESQUEMA_DE_DUDOSOS, guardarDudososDeLinkedin, importarExcelDeLinkedin } from "@/lib/acciones/excel-linkedin"
import { anotarNumerosDeLinkedin, ESQUEMA_DE_ANOTACION } from "@/lib/acciones/metricas-linkedin"
import { comoConi } from "@/lib/acciones/servidor"
import { avisosReales } from "@/lib/proveedores/avisos"

export async function anotarNumerosDeLinkedinAccion(entrada: z.input<typeof ESQUEMA_DE_ANOTACION>) {
  const resultado = await comoConi("anotarNumerosDeLinkedin", ESQUEMA_DE_ANOTACION, entrada, (deps, datos) =>
    anotarNumerosDeLinkedin(deps, datos),
  )
  if (resultado.ok) revalidatePath("/metricas")
  return resultado
}

const SobreElExcel = z.object({ archivo: z.file() })

/** Decision 1: the importer is Coni's. The numbers show on Métricas and clear the reminder on Inicio. */
export async function importarExcelDeLinkedinAccion(formulario: FormData) {
  const resultado = await comoConi(
    "importarExcelDeLinkedin",
    SobreElExcel,
    { archivo: formulario.get("archivo") },
    (deps, datos) => importarExcelDeLinkedin({ db: deps.db, ahora: deps.ahora, avisos: () => avisosReales() }, datos.archivo),
  )
  if (resultado.ok) {
    revalidatePath("/metricas")
    revalidatePath("/")
  }
  return resultado
}

export async function guardarDudososDeLinkedinAccion(entrada: z.input<typeof ESQUEMA_DE_DUDOSOS>) {
  const resultado = await comoConi("guardarDudososDeLinkedin", ESQUEMA_DE_DUDOSOS, entrada, (deps, datos) =>
    guardarDudososDeLinkedin({ db: deps.db, ahora: deps.ahora, avisos: () => avisosReales() }, datos),
  )
  if (resultado.ok) {
    revalidatePath("/metricas")
    revalidatePath("/")
  }
  return resultado
}
```

Note: `import type { z }` becomes a value import (`z.object`, `z.file`).

- [ ] **Step 5: Run the tests and the build**

Run: `pnpm exec vitest run tests/unit/next-config.test.ts tests/unit/metricas-pagina.test.tsx && pnpm type && pnpm build`
Expected: PASS and a successful build (the build is the check that `read-excel-file` loads as an external package).

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write "app/(app)/metricas/acciones.ts" next.config.ts tests/unit/next-config.test.ts
git add "app/(app)/metricas/acciones.ts" next.config.ts tests/unit/next-config.test.ts
git commit -m "Expose the LinkedIn Excel import and the doubtful picks as Coni's Server Actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch E: screens

### Task 11: «N interacciones» where only the total exists

**Files:**
- Modify: `lib/metricas/modelo.ts` (`LecturaDeLinkedin` ~L46, `muestraDeLinkedin` ~L103), `lib/datos/metricas.ts` (~L91 select, ~L124 mapping)
- Test: `tests/unit/metricas-modelo.test.ts`, `tests/integration/datos-metricas.test.ts`

- [ ] **Step 1: Write the failing unit test**

In `tests/unit/metricas-modelo.test.ts`, add `interacciones: null,` to the object returned by `lecturaLinkedin` (after `compartidos: 1,`), then add inside the top `describe`:

```ts
  it("shows the Excel's total of interactions when a post has no reactions, comments or shares", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [enLinkedin("a", "2026-10-13T22:00:00.000Z", "Del Excel")],
        lecturasLinkedin: [
          lecturaLinkedin("a", { reacciones: null, comentarios: null, compartidos: null, interacciones: 12 }),
        ],
      }),
    )

    expect(modelo.semanas[0]?.publicaciones[0]?.meta).toBe("LinkedIn · 1.200 impresiones · 12 interacciones")
    const barra = modelo.grupos.find((grupo) => grupo.red === "linkedin")?.barras[0]
    expect(barra?.muestra).toBe("12 interacciones")
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/metricas-modelo.test.ts`
Expected: FAIL (type error on `interacciones` in the helper, or the meta ends at `1.200 impresiones`).

- [ ] **Step 3: Implement**

`lib/metricas/modelo.ts`, in `LecturaDeLinkedin` add after `compartidos`:

```ts
  /** The Excel's total (reactions, comments, shares and clicks in one figure); null when it came another way. */
  interacciones: number | null
```

and in `muestraDeLinkedin`, before the `return`:

```ts
  // The Excel brings only a total: shown when there is no breakdown (spec 2026-11-09, Screens).
  if (partes.length === 0 && lectura.interacciones !== null) {
    partes.push(plural(lectura.interacciones, "interacción", "interacciones"))
  }
```

`lib/datos/metricas.ts`: add `interacciones` to the `metricas_linkedin_ultima` select (`"pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, interacciones"`) and `interacciones: fila.interacciones,` to the `lecturasLinkedin` mapping after `compartidos`.

- [ ] **Step 4: Extend the data test**

In `tests/integration/datos-metricas.test.ts`, find the test that inserts a `metricas_linkedin` row and asserts `lecturasLinkedin`; add `interacciones: null` to that expected object (the row has none). Run:

`pnpm exec vitest run tests/unit/metricas-modelo.test.ts && pnpm test:db tests/integration/datos-metricas.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/metricas/modelo.ts lib/datos/metricas.ts tests/unit/metricas-modelo.test.ts tests/integration/datos-metricas.test.ts
git add lib/metricas/modelo.ts lib/datos/metricas.ts tests/unit/metricas-modelo.test.ts tests/integration/datos-metricas.test.ts
git commit -m "Show the Excel's interactions total on a LinkedIn post without a breakdown

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: The importer component

**Files:**
- Create: `app/(app)/metricas/importar-excel-de-linkedin.tsx`
- Test: `tests/unit/importar-excel-de-linkedin.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ImportarExcelDeLinkedin } from "@/app/(app)/metricas/importar-excel-de-linkedin"
import { ERROR_MUY_GRANDE } from "@/lib/metricas/excel-linkedin/resumen"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const OPCION = { clave: "ugcPost:72", fecha: "2026-10-07", impresiones: 2300, interacciones: 40 }

function elegirArchivo(archivo: File) {
  fireEvent.change(screen.getByLabelText("Excel de LinkedIn"), { target: { files: [archivo] } })
}

const xlsx = (bytes = 10) => new File([new Uint8Array(bytes)], "AnalisisConjunto.xlsx")

describe("ImportarExcelDeLinkedin", () => {
  it("says how to download it, sends the chosen file and shows the summary in place", async () => {
    const alImportar = vi.fn(async (_formulario: FormData) => ({
      ok: true as const,
      medidoEn: "2026-10-30",
      resumen: ["Listo: 1 publicación con números.", "También guardé tus seguidores: 830."],
      dudosos: [],
    }))
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={vi.fn()} />)

    expect(screen.getByText("En LinkedIn, abre Estadísticas y luego Contenido.")).toBeInTheDocument()
    const archivo = xlsx()
    elegirArchivo(archivo)

    expect(await screen.findByText("Listo: 1 publicación con números.")).toBeInTheDocument()
    expect(screen.getByText("También guardé tus seguidores: 830.")).toBeInTheDocument()
    expect(alImportar.mock.calls[0]?.[0].get("archivo")).toBe(archivo)
  })

  it("refuses a file over 2 MB without sending it", async () => {
    const alImportar = vi.fn()
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={vi.fn()} />)

    elegirArchivo(xlsx(2_000_001))

    expect(await screen.findByText(ERROR_MUY_GRANDE)).toBeInTheDocument()
    expect(alImportar).not.toHaveBeenCalled()
  })

  it("lets her pick the Excel post of each doubtful piece, one post per piece, and saves the picks", async () => {
    const alImportar = vi.fn(async () => ({
      ok: true as const,
      medidoEn: "2026-10-30",
      resumen: ["Falta que elijas a qué post del Excel corresponden 2 publicaciones subidas a mano."],
      dudosos: [
        { piezaId: A, titulo: "Qué pasa cuando te dicen", fecha: "2026-10-07", opciones: [OPCION] },
        { piezaId: B, titulo: "Otra del mismo día", fecha: "2026-10-07", opciones: [OPCION] },
      ],
    }))
    const alGuardarDudosos = vi.fn(async () => ({ ok: true as const, resumen: ["Listo: 1 publicación más con números."] }))
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={alGuardarDudosos} />)
    elegirArchivo(xlsx())

    const primera = await screen.findByLabelText("Qué pasa cuando te dicen")
    fireEvent.change(primera, { target: { value: OPCION.clave } })
    const enLaOtra = within(screen.getByLabelText("Otra del mismo día")).getByRole("option", {
      name: "miércoles 7 de octubre · 2.300 impresiones · 40 interacciones",
      hidden: true,
    })
    expect(enLaOtra).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    expect(alGuardarDudosos).toHaveBeenCalledWith({
      medidoEn: "2026-10-30",
      elegidos: [{ piezaId: A, clave: OPCION.clave, impresiones: 2300, interacciones: 40 }],
    })
    expect(await screen.findByText("Listo: 1 publicación más con números.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Qué pasa cuando te dicen")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Otra del mismo día")).toBeInTheDocument()
  })

  it("shows the error the action returns", async () => {
    const alImportar = vi.fn(async () => ({ ok: false as const, error: "Este no es el Excel de estadísticas de LinkedIn en español." }))
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={vi.fn()} />)
    elegirArchivo(xlsx())
    expect(await screen.findByText(/Este no es el Excel de estadísticas de LinkedIn en español/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/importar-excel-de-linkedin.test.tsx`
Expected: FAIL, cannot resolve the component.

- [ ] **Step 3: Write the component**

`app/(app)/metricas/importar-excel-de-linkedin.tsx`:

```tsx
"use client"

import { UploadSimple } from "@phosphor-icons/react"
import { useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { ImportacionDeLinkedin } from "@/lib/acciones/excel-linkedin"
import type { Resultado } from "@/lib/acciones/resultado"
import {
  COMO_DESCARGARLO,
  diaEnPalabras,
  ERROR_MUY_GRANDE,
  etiquetaDeOpcion,
  TAMANO_MAXIMO,
} from "@/lib/metricas/excel-linkedin/resumen"

export interface EntradaDeDudosos {
  medidoEn: string
  elegidos: { piezaId: string; clave: string; impresiones: number | null; interacciones: number | null }[]
}

interface Propiedades {
  alImportar: (formulario: FormData) => Promise<Resultado<ImportacionDeLinkedin>>
  alGuardarDudosos: (entrada: EntradaDeDudosos) => Promise<Resultado<{ resumen: string[] }>>
}

const ACEPTA = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function Lineas({ lineas }: { lineas: readonly string[] }) {
  const [titulo, ...resto] = lineas
  if (!titulo) return null
  return (
    <LineaDeEstado
      tipo="neutro"
      titulo={titulo}
      detalle={
        resto.length > 0 ? (
          <span className="grid gap-1">
            {resto.map((linea) => (
              <span key={linea}>{linea}</span>
            ))}
          </span>
        ) : undefined
      }
    />
  )
}

/**
 * Change 13a: Coni uploads the Excel LinkedIn gives her and the numbers land on each piece. No confirm step
 * (decision 4); the doubtful hand uploads are picked here, inline, with no modal.
 */
export function ImportarExcelDeLinkedin({ alImportar, alGuardarDudosos }: Propiedades) {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [importacion, setImportacion] = useState<ImportacionDeLinkedin | null>(null)
  const [elegidas, setElegidas] = useState<Record<string, string>>({})
  const [guardado, setGuardado] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  function subir(archivo: File | undefined) {
    if (!archivo) return
    setImportacion(null)
    setGuardado(null)
    setElegidas({})
    if (archivo.size > TAMANO_MAXIMO) {
      setAviso(ERROR_MUY_GRANDE)
      return
    }
    setAviso(null)
    const formulario = new FormData()
    formulario.set("archivo", archivo)
    ejecutar(
      () => alImportar(formulario),
      (resultado) => setImportacion({ medidoEn: resultado.medidoEn, resumen: resultado.resumen, dudosos: resultado.dudosos }),
    )
  }

  function guardarDudosos() {
    if (!importacion) return
    const elegidos = importacion.dudosos.flatMap((dudoso) => {
      const opcion = dudoso.opciones.find((posible) => posible.clave === elegidas[dudoso.piezaId])
      return opcion
        ? [
            {
              piezaId: dudoso.piezaId,
              clave: opcion.clave,
              impresiones: opcion.impresiones,
              interacciones: opcion.interacciones,
            },
          ]
        : []
    })
    if (elegidos.length === 0) {
      setAviso("Elige el post del Excel de al menos una publicación.")
      return
    }
    setAviso(null)
    ejecutar(
      () => alGuardarDudosos({ medidoEn: importacion.medidoEn, elegidos }),
      (resultado) => {
        setGuardado(resultado.resumen)
        const resueltas = new Set(elegidos.map((elegido) => elegido.piezaId))
        setImportacion({ ...importacion, dudosos: importacion.dudosos.filter((d) => !resueltas.has(d.piezaId)) })
      },
    )
  }

  const tomadas = new Set(Object.values(elegidas).filter((clave) => clave !== ""))
  const mensaje = aviso ?? error

  return (
    <div className="grid gap-4">
      <p className="grid gap-1 text-meta text-apagado">
        {COMO_DESCARGARLO.map((linea) => (
          <span key={linea}>{linea}</span>
        ))}
      </p>
      {/* Never the native "Choose File" (as in Biblioteca): the button opens it. */}
      <input
        ref={entrada}
        type="file"
        hidden
        accept={ACEPTA}
        aria-label="Excel de LinkedIn"
        onChange={(evento) => {
          subir(evento.target.files?.[0])
          evento.target.value = ""
        }}
      />
      <Boton
        variante="secundario"
        cargando={pendiente}
        icono={<UploadSimple aria-hidden="true" size={ICONO.medio} />}
        onClick={() => entrada.current?.click()}
      >
        Importar Excel de LinkedIn
      </Boton>
      {mensaje ? <LineaDeEstado tipo="error" titulo={mensaje} tituloEnTinta /> : null}
      {importacion ? <Lineas lineas={importacion.resumen} /> : null}
      {importacion && importacion.dudosos.length > 0 ? (
        <div className="grid gap-4">
          <ul className="grid gap-4">
            {importacion.dudosos.map((dudoso) => {
              const campo = `${id}-${dudoso.piezaId}`
              return (
                <li key={dudoso.piezaId} className="grid gap-1">
                  <label htmlFor={campo} className="text-cuerpo font-semibold">
                    {dudoso.titulo}
                  </label>
                  <span className="text-meta text-apagado">{`Subida a mano el ${diaEnPalabras(dudoso.fecha)}`}</span>
                  <select
                    id={campo}
                    className="campo w-full text-cuerpo"
                    value={elegidas[dudoso.piezaId] ?? ""}
                    onChange={(evento) => setElegidas((antes) => ({ ...antes, [dudoso.piezaId]: evento.target.value }))}
                  >
                    <option value="">Elige el post del Excel</option>
                    {dudoso.opciones.map((opcion) => (
                      <option
                        key={opcion.clave}
                        value={opcion.clave}
                        disabled={tomadas.has(opcion.clave) && elegidas[dudoso.piezaId] !== opcion.clave}
                      >
                        {etiquetaDeOpcion(opcion)}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
          <Boton variante="secundario" cargando={pendiente} onClick={guardarDudosos}>
            Guardar
          </Boton>
        </div>
      ) : null}
      {guardado ? <Lineas lineas={guardado} /> : null}
    </div>
  )
}
```

Check before running: `UploadSimple` exists in `@phosphor-icons/react` (`grep -c "UploadSimple" node_modules/@phosphor-icons/react/dist/index.d.ts` prints a number above 0); `LineaDeEstado` takes `detalle` as a `ReactNode`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/importar-excel-de-linkedin.test.tsx && pnpm type`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/metricas/importar-excel-de-linkedin.tsx" tests/unit/importar-excel-de-linkedin.test.tsx
head -1 "app/(app)/metricas/importar-excel-de-linkedin.tsx"   # must print "use client"
git add "app/(app)/metricas/importar-excel-de-linkedin.tsx" tests/unit/importar-excel-de-linkedin.test.tsx
git commit -m "Add the LinkedIn Excel importer: button, summary in place and inline doubtful picks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Métricas page: importer section, manual form under «Más opciones»

**Files:**
- Modify: `app/(app)/metricas/page.tsx` (the `MasOpciones titulo="Para WAV"` block, ~L168-181)
- Test: `tests/unit/metricas-pagina.test.tsx`

- [ ] **Step 1: Write the failing page test**

In `tests/unit/metricas-pagina.test.tsx`, change the actions mock to:

```ts
vi.mock("@/app/(app)/metricas/acciones", () => ({
  anotarNumerosDeLinkedinAccion: vi.fn(),
  importarExcelDeLinkedinAccion: vi.fn(),
  guardarDudososDeLinkedinAccion: vi.fn(),
}))
```

and add (it reuses the file's `elementos` helper):

```ts
it("puts the LinkedIn importer in its own section and the manual form under «Más opciones»", async () => {
  const todos = elementos(await Metricas())
  const seccion = todos.find((elemento) => elemento.props.id === "excel-linkedin")
  expect(seccion?.props.titulo).toBe("Números de LinkedIn")
  const pliegue = todos.find((elemento) => elemento.props.titulo === "Más opciones")
  expect(pliegue?.props.resumen).toBe("Anotar a mano")
  expect(todos.some((elemento) => elemento.props.titulo === "Para WAV")).toBe(false)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/metricas-pagina.test.tsx`
Expected: FAIL, no element with id `excel-linkedin`.

- [ ] **Step 3: Change the page**

In `app/(app)/metricas/page.tsx`, import `guardarDudososDeLinkedinAccion` and `importarExcelDeLinkedinAccion` from `./acciones` and `ImportarExcelDeLinkedin` from `./importar-excel-de-linkedin`, update the comment above the bottom grid to "Week by week wide, LinkedIn's numbers in the side column on a computer.", and replace the whole `<MasOpciones ... titulo="Para WAV" ...>...</MasOpciones>` block with:

```tsx
        {/* Change 13a: Coni imports LinkedIn's Excel; typing the numbers stays as a fallback, folded. */}
        <div className="mt-8 md:mt-0">
          <Seccion titulo="Números de LinkedIn" id="excel-linkedin" espacio="ninguno">
            <ImportarExcelDeLinkedin
              alImportar={importarExcelDeLinkedinAccion}
              alGuardarDudosos={guardarDudososDeLinkedinAccion}
            />
          </Seccion>
          <MasOpciones className="mt-6" titulo="Más opciones" resumen="Anotar a mano">
            <NumerosDeLinkedin
              posts={paraAnotar.posts.map((post) => ({
                piezaId: post.piezaId,
                titulo: post.titulo,
                fecha: etiquetaDeFecha(post.publicadoEn, datos.zona, "corta"),
                estaSemana: post.estaSemana,
              }))}
              seguidores={paraAnotar.seguidores}
              seguidoresAutomaticos={paraAnotar.seguidoresAutomaticos}
              alGuardar={anotarNumerosDeLinkedinAccion}
            />
          </MasOpciones>
        </div>
```

Check `components/seccion.tsx`: `espacio="ninguno"` drops the section's own top margin so the wrapper's `mt-8 md:mt-0` keeps the old rhythm; confirm the `id` lands on an element the `#excel-linkedin` anchor can scroll to (if `Seccion` puts it on the heading, that is fine).

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run tests/unit/metricas-pagina.test.tsx tests/unit/numeros-de-linkedin.test.tsx && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write "app/(app)/metricas/page.tsx" tests/unit/metricas-pagina.test.tsx
git add "app/(app)/metricas/page.tsx" tests/unit/metricas-pagina.test.tsx
git commit -m "Put the LinkedIn importer on Métricas and fold the manual form under Más opciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Inicio reminder «Sube el Excel de LinkedIn»

**Files:**
- Modify: `lib/inicio/modelo.ts` (`Inicio` ~L73, `construirInicio` ~L335), `app/(app)/page.tsx`
- Test: `tests/unit/inicio-modelo.test.ts`

- [ ] **Step 1: Write the failing model test**

Append to `tests/unit/inicio-modelo.test.ts`:

```ts
describe("the LinkedIn Excel reminder", () => {
  it("asks for the Excel while a recent LinkedIn post has no reading this week, and counts it as attention", () => {
    const inicio = construirInicio({ piezas: [], ahora: AHORA, zona: ZONA, linkedinSinNumeros: 2 })

    expect(inicio.recordatorios).toEqual([
      {
        titulo: "Sube el Excel de LinkedIn",
        detalle: "2 publicaciones de las últimas 4 semanas todavía no tienen números de esta semana.",
        accion: { etiqueta: "Ir a Métricas", href: "/metricas#excel-linkedin" },
      },
    ])
    expect(inicio.titulo).toBe("Una cosa necesita tu atención")
  })

  it("words one post in the singular", () => {
    const inicio = construirInicio({ piezas: [], ahora: AHORA, zona: ZONA, linkedinSinNumeros: 1 })
    expect(inicio.recordatorios[0]?.detalle).toBe(
      "1 publicación de las últimas 4 semanas todavía no tiene números de esta semana.",
    )
  })

  it("says nothing once every recent post has this week's reading", () => {
    const inicio = construirInicio({ piezas: [], ahora: AHORA, zona: ZONA, linkedinSinNumeros: 0 })
    expect(inicio.recordatorios).toEqual([])
    expect(inicio.titulo).toBe("Esta semana está al día")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/inicio-modelo.test.ts`
Expected: FAIL, `recordatorios` is undefined.

- [ ] **Step 3: Implement the model**

In `lib/inicio/modelo.ts` add `import { SEMANAS_POR_ANOTAR } from "@/lib/metricas/linkedin"`, then:

```ts
export interface RecordatorioDeInicio {
  titulo: string
  detalle: string
  accion: { etiqueta: string; href: string }
}
```

In `Inicio`, after `pausas`:

```ts
  /** Weekly chores of hers that are not pieces (the LinkedIn Excel): plain lines in «Atención» with a way there. */
  recordatorios: RecordatorioDeInicio[]
```

In `construirInicio`'s entry type add:

```ts
  /** LinkedIn posts of the last 4 weeks without a reading this week (`sinNumerosEstaSemana`). */
  linkedinSinNumeros?: number
```

and in its body (destructure `linkedinSinNumeros = 0`):

```ts
  // Spec 2026-11-09, decision 3: from Monday, while a recent post has no reading this week. Gone once the Excel is in.
  const recordatorios: RecordatorioDeInicio[] =
    linkedinSinNumeros > 0
      ? [
          {
            titulo: "Sube el Excel de LinkedIn",
            detalle:
              linkedinSinNumeros === 1
                ? `1 publicación de las últimas ${SEMANAS_POR_ANOTAR} semanas todavía no tiene números de esta semana.`
                : `${linkedinSinNumeros} publicaciones de las últimas ${SEMANAS_POR_ANOTAR} semanas todavía no tienen números de esta semana.`,
            accion: { etiqueta: "Ir a Métricas", href: "/metricas#excel-linkedin" },
          },
        ]
      : []
```

Use `atencion.length + lineasDePausa.length + recordatorios.length` in both `tituloDeInicio(...)` and `lineaDeInicio(...)`, and return `recordatorios` after `pausas`.

- [ ] **Step 4: Wire Inicio**

In `app/(app)/page.tsx`: import `leerLinkedinParaAnotar` from `@/lib/datos/metricas-linkedin` and `sinNumerosEstaSemana` from `@/lib/metricas/linkedin`; read it with the rest:

```tsx
  const [datos, pilares, linkedin] = await Promise.all([
    leerDatosDeInicio(db, ahora),
    leerPilares(db),
    leerLinkedinParaAnotar(db, ahora),
  ])
  const inicio = construirInicio({
    piezas: datos.piezas,
    ahora,
    zona: datos.zona,
    pausas: datos.pausas,
    linkedinSinNumeros: sinNumerosEstaSemana(linkedin.posts).length,
  })
```

Change the section's condition to `inicio.pausas.length > 0 || inicio.recordatorios.length > 0 || principal`, and after the `inicio.pausas.map(...)` lines add:

```tsx
              {inicio.recordatorios.map((recordatorio) => (
                <LineaDeEstado
                  key={recordatorio.titulo}
                  tipo="aviso"
                  titulo={recordatorio.titulo}
                  detalle={recordatorio.detalle}
                  accion={<AccionDeAviso accion={recordatorio.accion} />}
                />
              ))}
```

- [ ] **Step 5: Run the tests**

Run: the unit suite (`pnpm exec vitest run --exclude '.worktrees/**' --exclude 'tests/e2e/**' --exclude 'tests/integration/**'`) and `pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write lib/inicio/modelo.ts "app/(app)/page.tsx" tests/unit/inicio-modelo.test.ts
git add lib/inicio/modelo.ts "app/(app)/page.tsx" tests/unit/inicio-modelo.test.ts
git commit -m "Remind Coni on Inicio to upload LinkedIn's Excel while this week's readings are missing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch F: remove the WAV email

### Task 15: Drop the nightly `numerosLinkedin` step

**Files:**
- Delete: `lib/mantenimiento/numeros-linkedin.ts`, `tests/integration/numeros-linkedin.test.ts`
- Modify: `lib/mantenimiento/ejecutar.ts` (import L15, `DepsNocturno` L66, step L139, doc comment L132), `lib/metricas/linkedin.ts` (`asuntoDelRecordatorio`), `tests/unit/mantenimiento-nocturno.test.ts`, `tests/unit/metricas-linkedin.test.ts`

- [ ] **Step 1: Change the test first**

In `tests/unit/mantenimiento-nocturno.test.ts`: delete the `vi.mock("@/lib/mantenimiento/numeros-linkedin", ...)` line, remove `"numerosLinkedin",` from the expected keys, and rename the test to `"runs no LinkedIn email (Coni imports the Excel), deletes the visitor hashes before the backup and checks the yearly review every night"`.

In `tests/unit/metricas-linkedin.test.ts`: delete the `describe("asuntoDelRecordatorio", ...)` block and `asuntoDelRecordatorio` from the import.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/mantenimiento-nocturno.test.ts`
Expected: FAIL, the keys still include `numerosLinkedin`.

- [ ] **Step 3: Remove the step**

```bash
git rm lib/mantenimiento/numeros-linkedin.ts tests/integration/numeros-linkedin.test.ts
```

In `lib/mantenimiento/ejecutar.ts`: delete `import { type DepsNumerosLinkedin, recordarNumerosDeLinkedin } from "./numeros-linkedin"`, delete `DepsNumerosLinkedin &` from `DepsNocturno`, delete `numerosLinkedin: () => recordarNumerosDeLinkedin(deps),`, and change the doc comment of `mantenimientoNocturno` to: `/** At 03:00 America/Santiago: file retention, Instagram's token, LinkedIn's expiry, the visitor hashes of /l, the backup of the database, the yearly review of the data register and the merges of topics. */`.

In `lib/metricas/linkedin.ts`: delete `asuntoDelRecordatorio`, and change the header comment to `// LinkedIn's numbers noted by hand (the fallback since Coni imports the Excel) and how its fields are read (spec 2026-10-17, decision 19).` and the doc of `sinNumerosEstaSemana` to `/** The posts still waiting for this week's numbers: what Inicio's reminder counts. */`.

- [ ] **Step 4: Verify nothing else uses it**

Run: `grep -rn "recordarNumerosDeLinkedin\|DepsNumerosLinkedin\|asuntoDelRecordatorio\|DETALLE_DEL_RECORDATORIO\|numeros-linkedin" app lib trigger tests components`
Expected: no output.

Run: the unit suite, `pnpm type`, `pnpm test:db tests/integration/mantenimiento-temas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write lib/mantenimiento/ejecutar.ts lib/metricas/linkedin.ts tests/unit/mantenimiento-nocturno.test.ts tests/unit/metricas-linkedin.test.ts
git add lib/mantenimiento/ejecutar.ts lib/metricas/linkedin.ts tests/unit/mantenimiento-nocturno.test.ts tests/unit/metricas-linkedin.test.ts
git commit -m "Stop emailing WAV for LinkedIn's numbers: Coni imports the Excel (A6)

The step ran in the nightly Trigger.dev task; the email stops with the next Trigger deploy.
recordatorios_linkedin stays, unused, until a later change drops it with Federico's OK.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch G: end to end, screens and docs

### Task 16: E2E import, accessibility and visual baselines

**Files:**
- Modify: `tests/e2e/metricas.spec.ts`, `tests/e2e/accesibilidad.spec.ts` (~L113-116, ~L419-431), `tests/e2e/visual.spec.ts-snapshots/*` (regenerated)

- [ ] **Step 1: Write the failing e2e test**

In `tests/e2e/metricas.spec.ts` import `EXCEL_DE_PRUEBA` and `POST_COMPARTIDO` from `../fixtures/excel-linkedin`, and add:

```ts
test("Coni imports LinkedIn's Excel and sees each post's impressions and interactions", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "etica-regulacion", gancho: "Lo que firma un modelo" })
  const id = await sembrarPieza("publicado", { titulo: "Lo que firma un modelo", idea_id: idea })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await pool.query("update public.publicaciones set post_urn = $2 where pieza_id = $1 and destino = 'linkedin'", [
    id,
    `urn:li:share:${POST_COMPARTIDO}`,
  ])
  await moverLaHoraAprobada(id, 2)

  await page.goto("/metricas")
  await expect(page.getByRole("button", { name: "Importar Excel de LinkedIn" })).toBeVisible()
  await page.locator('input[type="file"][aria-label="Excel de LinkedIn"]').setInputFiles(EXCEL_DE_PRUEBA)

  await expect(page.getByText("Listo: 1 publicación con números.")).toBeVisible()
  await expect(page.getByText("También guardé tus seguidores: 830.")).toBeVisible()
  await expect(page.getByText("Ignoré 2 publicaciones del Excel que no salieron de Conidolly.")).toBeVisible()
  await page.reload()
  await expect(page.getByText("1.200", { exact: true })).toBeVisible()
  await expect(page.getByText("12 interacciones").first()).toBeVisible()
  const { rows } = await pool.query(
    "select origen, interacciones, anotado_por is not null as sellado from public.metricas_linkedin where pieza_id = $1",
    [id],
  )
  expect(rows).toEqual([{ origen: "excel", interacciones: 12, sellado: true }])
  await capturar(page, "metricas-linkedin-excel")
})
```

(The fixture's ugcPost and foreign post both count as not Conidolly's here: no hand upload exists in this test.)

In the existing test `"WAV notes a LinkedIn post's numbers in Para WAV ..."`, rename it to `"numbers typed by hand under Más opciones show in what worked"` and change `abrirDesplegable(page, "Para WAV")` to `abrirDesplegable(page, "Más opciones")`.

- [ ] **Step 2: Run it to verify the new test fails only if something is missing**

Run: `pnpm test:e2e tests/e2e/metricas.spec.ts`
Expected: PASS once Batches A to E are in. If it fails on the upload, read the server log for the Server Action error before touching code (a body over the limit or a bundling error from `read-excel-file` shows there).

- [ ] **Step 3: Accessibility**

In `tests/e2e/accesibilidad.spec.ts`: for `/metricas` change the comment to `// LinkedIn's manual form folds under "Más opciones".` and `abrirDesplegable(page, "Para WAV")` to `abrirDesplegable(page, "Más opciones")`; in the Part 3 test, rename it to `"Métricas with LinkedIn, the importer and the manual form open, and the empty Ritmo, pass WCAG 2.x AA"`, update its comment and `abrirDesplegable` the same way. Leave the `/ajustes` «Para WAV» lines alone (Ajustes keeps that fold).

Run: `pnpm test:e2e tests/e2e/accesibilidad.spec.ts`
Expected: PASS with no axe findings (the hidden file input has `aria-label`; the selects have `<label for>`).

- [ ] **Step 4: Visual baselines**

Run: `pnpm test:e2e tests/e2e/visual.spec.ts`
Expected: diffs on `metricas` and `metricas-con-linkedin` (new section, «Más opciones»), and possibly on `inicio*` if a scene has a LinkedIn post of the last 4 weeks without a reading. Review each diff in `pnpm exec playwright show-report`: only the intended changes may appear. Then:

Run: `pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots`

- [ ] **Step 5: Desktop widths**

Run `pnpm test:e2e tests/e2e/paginas.escritorio.ts` and look at Métricas at 768, 1024 and 1280 px (project rule for desktop screens): the importer sits in the side column beside «Semana a semana», the button and the summary do not overflow 20 rem, and the doubtful selects wrap their option text. Fix in `page.tsx` or the component if not, then re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/metricas.spec.ts tests/e2e/accesibilidad.spec.ts tests/e2e/visual.spec.ts-snapshots/metricas-app-darwin.png tests/e2e/visual.spec.ts-snapshots/metricas-con-linkedin-app-darwin.png
# plus any inicio*-app-darwin.png that changed on purpose, named one by one
git commit -m "Cover the LinkedIn Excel import end to end and refresh the Métricas baselines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Full verification

- [ ] **Step 1:** `pnpm lint && pnpm type && pnpm build`
- [ ] **Step 2:** the unit suite command from Ground rules: all PASS.
- [ ] **Step 3:** `pnpm db:reset && pnpm test:db`: all PASS (data and config changes can break value tests elsewhere).
- [ ] **Step 4:** `pnpm test:e2e`: all PASS.
- [ ] **Step 5:** `git log --oneline main..HEAD | cat` and `git diff main --stat`; `git diff main | grep -n $'\xe2\x80\x94'` prints nothing; no `as any`, `@ts-expect-error` or `!.` in the diff (`git diff main | grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\." `).

### Task 18: Handover docs

**Files:**
- Modify: `docs/TRASPASO.md`

- [ ] **Step 1: Add a section** before `## Siguiente` (Spanish, no em dash):

```markdown
## Excel de LinkedIn (issue 15, cambio 13a, mitad LinkedIn)

Spec `docs/superpowers/specs/2026-11-09-excel-linkedin-design.md`, plan `docs/superpowers/plans/2026-11-09-excel-linkedin.md`.
Coni sube en Métricas, sección «Números de LinkedIn», el Excel que LinkedIn le deja descargar (Estadísticas, Contenido,
Exportar, últimos 30 días; solo en español). El servidor lo lee con `read-excel-file` (9.3.12, fijado), cruza cada post
con su pieza por el número de la URN (`publicaciones.post_urn`) y, para lo subido a mano, por el día (si ese día hay
exactamente una pieza a mano y un post libre del Excel; lo demás lo elige Coni en la misma pantalla, con los posts de
ese día y del día antes y después). Guarda con `importar_excel_linkedin` (solo Coni, una transacción, origen `excel`,
nunca toca filas `api` ni `metricool`, un número que el Excel no trae conserva el guardado) con `medido_en` = último día
del período y la semana de ese día para los seguidores. Por post solo hay impresiones e interacciones; donde no hay
desglose la línea dice «N interacciones». Inicio muestra «Sube el Excel de LinkedIn» mientras algún post de LinkedIn de
las últimas 4 semanas no tenga lectura esta semana. El formulario a mano sigue, plegado en «Más opciones» › «Anotar a
mano». El correo semanal a WAV (`numerosLinkedin`) ya no existe; `recordatorios_linkedin` quedó sin uso y se borra en
un cambio aparte con OK de Federico. Para revisar un Excel real sin guardar nada:
`pnpm revisar:excel-linkedin <ruta>`. El fixture sintético se regenera con `pnpm fixture:excel-linkedin`.
Migración `20261110000100`.
```

- [ ] **Step 2:** In the paragraph «Métricas y ritmo, parte 3» append: `Desde el cambio 13a (Excel de LinkedIn) el correo del lunes a WAV ya no existe y «Para WAV» de Métricas pasó a «Más opciones» › «Anotar a mano».`

- [ ] **Step 3: Commit**

```bash
git diff | grep -n $'\xe2\x80\x94'   # must print nothing
git add docs/TRASPASO.md
git commit -m "Document the LinkedIn Excel importer in the handover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch H: release

### Task 19: Deploy runbook

Order matters: the migration is additive (no data dropped or rewritten), so the database goes first and the app after; the Trigger deploy is last and independent.

- [ ] **Step 1: Before the merge.** Issue #15 is on the board (WAV-WaAreVision/projects/1) and in progress; PR from `feat/excel-linkedin` to `main` with green CI, spec review and code review approved.
- [ ] **Step 2: Migration dry run.** `supabase db push --dry-run` against production must list only `20261110000100_excel_linkedin.sql`. **Federico confirms** (the brief for this plan asks for his OK even though the 01-11 release authorization covers non-destructive migrations), then `supabase db push`.
- [ ] **Step 3: Verify the database live** (read-only SQL in the Supabase SQL editor or MCP `execute_sql`):

```sql
select pg_get_function_identity_arguments('public.importar_excel_linkedin'::regproc);
select has_function_privilege('anon', 'public.importar_excel_linkedin(date, jsonb, date, integer)', 'execute');
select column_name from information_schema.columns where table_name = 'metricas_linkedin_ultima' order by ordinal_position;
```

Expected: `p_medido_en date, p_posts jsonb, p_semana date, p_seguidores integer`; `false`; the view ends in `interacciones`.

- [ ] **Step 4: Merge to `main`.** Vercel publishes it. Confirm the deployment is Ready and served (`vercel ls estudio-coni` or the Vercel MCP), then open `https://conidolly.vercel.app/metricas` with Federico's test account (he signs in) and check the section «Números de LinkedIn» is there.
- [ ] **Step 5: Trigger deploy (needs Federico's OK).** The removed step lived in the nightly task `mantenimiento-nocturno` (`trigger/mantenimiento.ts`), so WAV keeps getting the Monday email until Trigger is deployed. With his OK: `pnpm install` then `TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check`. Next night, check the `mantenimiento-nocturno` run output has no `numerosLinkedin` key. Until then nothing breaks: the old step still works on the new schema, and an `excel` row this week already keeps it quiet.
- [ ] **Step 6: Real export (done-when 5).** Federico gets one export from Coni's account (or his own, LinkedIn in Spanish) and runs `pnpm revisar:excel-linkedin <ruta>` locally: the period, the post count and the followers must match what LinkedIn shows. Also note whether the period ends on the download day or the day before (see the open decision below). Then Coni uploads it on her phone and sees each Conidolly LinkedIn piece with impressions and interactions.
- [ ] **Step 7: Update `docs/TRASPASO.md`** «Producción»: migrations applied up to `20261110000100`, Trigger version if deployed, and move issue #15's LinkedIn half to done on the board (the Instagram half stays open).

---

## Open decision for Federico (does not block Batches A to G)

- **`medido_en` is the period's last day (spec).** If LinkedIn's export period ends the day before the download, an upload on a Monday dates the readings to Sunday, the previous week, and Inicio's reminder stays up until the next upload. Issue #15's sample suggests the period ends on the download day, but it is not confirmed. Task 19 Step 6 checks it with the real file; if it ends the day before, the fix is one line in `importarExcelDeLinkedin` (`medidoEn` = today in `ajustes.zona` when the period ends within the last 2 days) plus its test.

## Self-review against the spec

| Spec item | Task |
|---|---|
| Format: sheets, two rankings joined by URL, text values, D/M/AAAA, encoded URLs, only Spanish | 2, 5 |
| Decision 1: Coni imports (`exigirConi`/`es_coni()`), not the maintainer | 1 (RPC check), 10 (`comoConi`) |
| Decision 2: URN first, then one-to-one by day in `ajustes.zona`, rest doubtful and picked inline | 3, 8, 9, 12 |
| Decision 3: Inicio reminder, email step removed | 14, 15, 19 (Trigger) |
| Decision 4: save directly, summary with pieces, followers, ignored posts | 4, 8, 12 |
| Decision 5: cap does not reject; shorter period asked only when a period post is missing and a list is full | 2, 3, 4 |
| Decision 6: `read-excel-file`, pinned | 5 (9.3.12) |
| Data: `excel` origin, `interacciones`, view recreated, cuenta origin, RPC contract, grants | 1 |
| `recordatorios_linkedin` stays | 1 (comment), 15, 18 |
| `bodySizeLimit = '2mb'` | 10 |
| Screens: button + two lines, summary in place, doubtful selects, «Anotar a mano» under «Más opciones», «N interacciones», Inicio link | 11, 12, 13, 14 |
| Errors: wrong file or language, over 2 MB, period without posts, RPC failure (atomic, retry message, logged, WAV notice) | 1, 4, 8, 12 |
| Tests listed in the spec | 1, 2, 3, 5, 7, 8, 9, 11, 12, 14, 15, 16 |
| Done when 1 to 5 | 16, 1, 14 + 7, 15 + 19, 19 |
