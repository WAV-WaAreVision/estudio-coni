# Pillars per network (15b): the Temas row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/biblioteca/temas` Coni's row `[ Sin tratar · N ] [ LinkedIn ▾ ] [ Instagram ▾ ]` with the chosen network's pillars under it, count "tratado" per network (a piece out on that network), remember the last network she used, and move "Ya los traté" and "Un solo autor" into "Más filtros", without changing any existing row and without a Trigger deploy.

**Architecture:** A security-invoker view `temas_tratados(tema_id, red)` follows publication → piece → idea → theory → `teorias.temas`, each id resolved along `fusionado_en` (five merges at most). A security-invoker function `temas_de_red(p_red, p_pilar)` returns the `temas_resumen` rows plus `tratado`, narrowed by a main pillar or a layer of that network; the app stops calling `temas_de_pilar` (kept until a later cleanup). `ajustes.ultima_red` stores the last network, written through the existing "coni edita ajustes" policy by a `recordarRed` action that a small client component calls after mount. The pure filter model moves to `lib/dominio/biblioteca/fila-de-temas.ts` (every value in the address), and the row, "Más filtros", the badges, the table, the panel and the page read it.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (RLS, SQL functions, views), Zod 4, Vitest (unit, and integration against local Supabase), Playwright (projects `app` phone and `escritorio`), Biome (safe mode only), Tailwind v4 semantic tokens, Phosphor icons through `ICONO`.

---

## Read before starting

- Spec (approved): `docs/superpowers/specs/2026-11-04-temas-por-red-design.md`. Coni's source: `docs/pedido-coni-2026-10-31/respuesta-coni-temas-pilares-2026-11-04.md`, part 1 (the row, section 7's acceptance list). What 15a left: `docs/superpowers/specs/2026-11-04-pilares-por-red-design.md` and the Decisions of `docs/superpowers/plans/2026-11-04-pilares-por-red.md`.
- Work in the worktree `/Users/fede/Projects/estudio-coni/.worktrees/temas-por-red` (branch `feat/temas-por-red`). Every command below runs from that directory.
- Local stack: `pnpm db:start` once. After writing a migration: `pnpm db:reset` (rebuilds the local DB from `supabase/migrations` + `supabase/seed.sql`) then `pnpm db:types` (regenerates `lib/supabase/database.types.ts`; never edit that file by hand).
- Test commands: `pnpm test:run <files>` (unit), `pnpm test:db <files>` (integration against the local DB; `como(sesion, fn)` in `tests/integration/db.ts` runs inside a transaction that is always rolled back), `pnpm test:e2e` (Playwright; `--project=app` phone, `--project=escritorio` desktop; one worker, specs run one after another).
- `pnpm type` (next typegen + tsc), `pnpm lint` (Biome check; to fix formatting use `pnpm check`, never `--unsafe`; after any Biome fix, `head -1` of every client file you touched still prints `"use client"`).
- Code rules: TDD strict, no `any`, no `@ts-expect-error`, no silent catch. Copy for Coni: Spanish (Chile), "tú", **no em dashes** (`tests/unit/diseno-reglas.test.ts` scans every file of `app/` and `components/`), semantic Tailwind tokens only (no hex), Phosphor icons from `@phosphor-icons/react/dist/ssr` in server modules, sized with `ICONO`. Targets use `min-h-objetivo` (44 px).
- No code may name a pillar slug: `tests/unit/sin-slugs-de-pilar.test.ts` scans `lib`, `app`, `components`, `trigger`, `scripts`. Tests, the E2E scene (by short name) and SQL may. Network names (`"linkedin"`, `"instagram"`) are not slugs.
- Patterns to copy: chip links `app/(app)/biblioteca/filtros-rapidos.tsx:18-47`; a write that row level security answers with "no rows" for WAV `lib/acciones/avisos.ts:86-95`; an action that checks Coni first `lib/acciones/biblioteca.ts:65-69` and `:471-489`; a server action `app/(app)/biblioteca/acciones.ts:157-161`; an effect after mount `app/(app)/biblioteca/tras-el-aviso.tsx:17-27`; a security-invoker function `supabase/migrations/20261104000250_temas_de_pilar.sql`; a security-invoker view `supabase/migrations/20261003000310_afirmaciones_temas.sql:77-107`; the merge bound `lib/dominio/biblioteca/temas.ts:66-86` (`PASOS_MAXIMOS_DE_FUSION = 5`); an action tested as Coni and WAV `tests/integration/acciones-pilares-de-tema.test.ts:1-30`.
- Commit after every task with `git add <files>` and `git commit -m "<English imperative sentence>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Do not push, do not run anything against production.

## Decisions where the spec is silent

> **Override (Federico's review, 2026-11-04): the row's network order is Instagram, then LinkedIn**, as Coni wrote it (`[Sin tratar] [Instagram ▾] [LinkedIn ▾]`). This replaces decision 8 below wherever the plan's code or tests order the networks; the default network when nothing is stored stays LinkedIn.

1. **`ultima_red` is written through the existing ajustes path, not a new RPC.** Coni already edits `ajustes` through the policy "coni edita ajustes" (`supabase/migrations/20261001000200_acceso.sql:47`), as `guardarAjuste` and `marcarAvatarVisto` do. So the second migration only adds the column with a named check `ultima_red_valida`; `recordarRed` (`lib/acciones/biblioteca.ts`) checks `es_coni` first (WAV gets `ERROR_SOLO_CONI`) and treats "no row updated" as an error. The audit trigger on `ajustes` logs each change, as for every setting. The spec's test "`recordar_red` works for Coni and refuses WAV" is run against `recordarRed` and against a raw update as WAV (0 rows).
2. **The page records whenever the network on screen differs from the stored one**, including the first visit (nothing stored, LinkedIn shown, `linkedin` stored). A network that comes from the stored value is never written again.
3. **WAV sees no topic as treated.** `publicaciones` is readable only by Coni (`20261006000100_destinos.sql:55`) and both new objects are security invoker. WAV never opens Temas (`exigirConi`), so nothing on screen changes; the integration tests pin it.
4. **`temas_de_red` returns every `temas_resumen` column plus `tratado`** (an explicit `returns table`), so `temas_resumen` and `temas_de_pilar` stay untouched. `p_red` is not validated: an unknown network gives every topic untreated, and with a pillar, nothing.
5. **"Tratado" counts any piece type** (reel or carousel) whose `publicaciones` row is `publicado` or `subido_a_mano`; the piece's own `estado` is not read.
6. **The switches survive a network change; the pillar does not.** "Sin tratar", "Ya los traté" and "Un solo autor" stay on when she taps the other network or the same one; the pillar is cleared in both cases (the same network again means "Todos los pilares").
7. **Address reading:** a switch is on only with the value `1` (`?sin-tratar=1`); any other value is absent. An address with both `sin-tratar` and `tratados` (new or old keys) is contradictory and reads as neither. `?red=` other than `linkedin`/`instagram` is absent. A `?pilar=` that is not a pillar or layer of the chosen network is dropped; without `?red`, a valid `?pilar=` (15a) gives its own network, before `ajustes.ultima_red`.
8. **Counts:** "Sin tratar", "Ya los traté" and "Un solo autor" each count over the topics of the network and pillar, whatever switch is on (as batch 3 counted over the pillar), and `conCuenta` drops a zero.
9. **"Más filtros" holds two toggle links, no form.** The 15a select leaves; `FormularioDeFiltros` goes back to Materiales only (its `seccion` prop and its Temas entry are removed, YAGNI).
10. **Row semantics and look.** The row stays a `<fieldset aria-label="Filtrar temas">` as in batch 3 (Biome's `useSemanticElements` prefers it to `role="group"`; both expose a group). Inside it, one list for "Sin tratar" and the networks and one list for the pillars, named "Pilares de LinkedIn" / "Pilares de Instagram". The chosen network has `aria-current="true"` and looks pressed (sunk: `bg-piedra-honda shadow-hundido`), with a caret; the chosen pillar and the switches on have `aria-current="page"` and the ink look of `FiltrosRapidos` with a check. Two links with `aria-current="page"` would both read as "current page", so the network uses `"true"`. The layer is outlined (`border-campo`, no relief). Both lists **wrap** at large text (no sliding track).
11. **The filter model moves to `lib/dominio/biblioteca/fila-de-temas.ts`**; `filtros-de-temas.ts` keeps the routes and the Ocultar/Mostrar helpers. The new module and the new components are added first (Tasks 6 to 9) and the switch happens in one task (Task 10), so every commit type-checks.
12. **`TemaResumido.cubiertoPorConi` becomes `tratado`.** Only the Temas screens read it. The engine's `novedad` (`lib/motor/puntaje.ts:136`) keeps reading `motor_temas.cubierto_por_coni` ("Coni has her own voice on it"): changing it would change the engine's scoring, so it is not changed (spec section 1).
13. **Layers come last in the row by rule** (`pilaresDeLaRed`), whatever their `orden`. This supersedes 15a's Decision 6 (the select's grouping) now that the select leaves.
14. **The E2E scene publishes Carga mental on LinkedIn only** through a motor theory, an idea and a piece in state `idea` (so Inicio and the calendar, which skip `idea` and `descartado`, never list it), with a `subido_a_mano` row; `vaciarBiblioteca` deletes that piece before `vaciarMotor` deletes the idea it points at, and resets `ajustes.ultima_red` to null. Descanso digital gets a main pillar in Instagram and Pausas activas the TDAH layer, so each network's row has a topic to show. The counts of the default view stay batch 3's (Sin tratar · 2, Ya los traté · 1, Un solo autor · 2).
15. **Row order follows the spec, not Coni's text:** LinkedIn before Instagram (`REDES` order), as every other list of the app. "+ Agregar red" and "+ Agregar pilar" are 15c.
16. **A failed `recordarRed` shows nothing** (it is a convenience) and is logged with `console.error` in the browser; a non-`Falla` error is also logged on the server by `aResultado`.

## File structure

**Create**

| File | Responsibility |
|---|---|
| `supabase/migrations/20261104000300_temas_tratados.sql` | View `temas_tratados` and function `temas_de_red` |
| `supabase/migrations/20261104000310_ultima_red.sql` | `ajustes.ultima_red` with its check |
| `lib/dominio/biblioteca/fila-de-temas.ts` | Pure: the row's filters, reading the address (old addresses too), links, switches, counts |
| `app/(app)/biblioteca/temas/fila-de-temas.tsx` | Server: the row, its networks and the chosen network's pillars |
| `app/(app)/biblioteca/temas/recordar-red.tsx` | Client: records the network on screen after mount |
| `tests/integration/temas-por-red.test.ts` | The view and the function, RLS |
| `tests/integration/ultima-red.test.ts` | The column, its RLS write, `recordarRed`, `leerUltimaRed` |
| `tests/unit/biblioteca-fila-de-temas.test.ts` | The pure filter model |
| `tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx` | `FilaDeTemas` |
| `tests/unit/biblioteca-recordar-red.test.tsx` | `RecordarRed` |
| `tests/e2e/biblioteca-temas-por-red.spec.ts` | Coni's acceptance list on the phone, axe, large text |
| `tests/e2e/biblioteca-temas-por-red.escritorio.ts` | The row with the table and the side panel, axe |

**Modify**

| File | Change |
|---|---|
| `lib/supabase/database.types.ts` | Regenerated (view, function, column) |
| `lib/dominio/biblioteca/temas.ts` | `TemaResumido.tratado` replaces `cubiertoPorConi` |
| `lib/datos/biblioteca.ts` | `listarTemas(db, { red, pilar })` reads `temas_de_red`; `leerUltimaRed` |
| `lib/acciones/biblioteca.ts`, `app/(app)/biblioteca/acciones.ts` | `RedElegida`, `recordarRed`, `recordarRedAccion` |
| `lib/dominio/pilares.ts` | `pilaresDeLaRed` |
| `components/ui/clases-de-chip.ts` | `CHIP_ELEGIDO` |
| `lib/dominio/biblioteca/filtros-de-temas.ts` | Loses the old filter model (keeps routes, Ocultar/Mostrar) |
| `app/(app)/biblioteca/temas/page.tsx` | Reads the network, the row, Más filtros, `RecordarRed` |
| `app/(app)/biblioteca/temas/mas-filtros-de-temas.tsx` | Two toggle links instead of the pillar select |
| `app/(app)/biblioteca/temas/insignias.tsx`, `tabla-de-temas.tsx`, `panel-de-tema.tsx` | `tratado`; the new filter model |
| `app/(app)/biblioteca/formulario-de-filtros.tsx` | Materiales only |
| `tests/e2e/biblioteca-escena.ts` | Carga mental out on LinkedIn, pillars for Descanso digital and Pausas activas, `ultima_red` reset |
| `tests/e2e/biblioteca-temas.spec.ts`, `biblioteca-enlaces.spec.ts`, `biblioteca-pilares.spec.ts`, `biblioteca-pilares.escritorio.ts`, `biblioteca-autores-temas.escritorio.ts` | Follow the row |
| Unit and integration tests listed in each task | Follow the new shapes |
| `tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png`, `tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-temas-escritorio-escritorio-darwin.png` | Retaken only in Task 13, after Federico's OK |

**Delete**

| File | Why |
|---|---|
| `app/(app)/biblioteca/temas/filtros-de-cobertura.tsx` | Replaced by `fila-de-temas.tsx` |

---

# Phase 1: data

### Task 1: The view `temas_tratados`

**Files:**
- Create: `supabase/migrations/20261104000300_temas_tratados.sql`
- Create: `tests/integration/temas-por-red.test.ts`
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/temas-por-red.test.ts`:

```ts
import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, pool } from "./db"

const SUFIJO = randomUUID().slice(0, 8)
const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

type Red = "linkedin" | "instagram"
type Estado = "esperando" | "para_subir" | "subido_a_mano" | "publicado"

afterAll(async () => {
  await pool.end()
})

async function tema(c: pg.PoolClient, nombre: string, fusionadoEn: string | null = null): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.temas (nombre, centroide, fusionado_en) values ($1, $2::extensions.vector, $3) returning id",
    [`${nombre} ${SUFIJO}`, CENTROIDE, fusionadoEn],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el tema ${nombre}`)
  return id
}

/**
 * A piece whose idea's theory lists `temas` (or, without a theory, an idea of her own), with one `publicaciones` row
 * per destination. LinkedIn's `publicado` needs a post URN, made up from the piece id as `marcarPublicacion` does.
 */
async function pieza(
  c: pg.PoolClient,
  temas: readonly string[],
  salidas: readonly { destino: Red; estado: Estado }[],
  conTeoria = true,
): Promise<string> {
  let teoria: string | null = null
  if (conTeoria) {
    const { rows } = await c.query<{ id: string }>(
      "insert into public.teorias (titulo, tesis, origen, temas) values ('Teoría', 'Tesis', 'motor', $1::uuid[]) returning id",
      [temas],
    )
    teoria = rows[0]?.id ?? null
  }
  const { rows: idea } = await c.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, formato, fuerza, estado, origen, teoria_id)
     values ('bienestar-e-impacto', 'Gancho', 'Carrusel', 'alta', 'usada', $1, $2) returning id`,
    [conTeoria ? "motor" : "propia", teoria],
  )
  const { rows: creada } = await c.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Pieza') returning id",
    [idea[0]?.id],
  )
  const id = creada[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  for (const { destino, estado } of salidas) {
    await c.query(
      `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
       values ($1::uuid, $2::text, $3::text, now(),
               case when $2::text = 'linkedin' and $3::text = 'publicado' then 'urn:li:share:' || abs(hashtext($1::text)) end)`,
      [id, destino, estado],
    )
  }
  return id
}

async function tratados(c: pg.PoolClient, temas: readonly string[]) {
  const { rows } = await c.query<{ tema_id: string; red: string }>(
    "select tema_id, red from public.temas_tratados where tema_id = any($1::uuid[]) order by red, tema_id",
    [temas],
  )
  return rows
}

describe("temas_tratados", () => {
  it("counts a topic as treated on the network where a piece went out, and only there", async () => {
    await como(comoPostgres, async (c) => {
      const carga = await tema(c, "Carga")
      await pieza(c, [carga], [
        { destino: "linkedin", estado: "publicado" },
        { destino: "instagram", estado: "para_subir" },
      ])
      await asumir(c, comoConi)
      expect(await tratados(c, [carga])).toEqual([{ tema_id: carga, red: "linkedin" }])
    })
  })

  it("counts a piece uploaded by hand, never one still waiting or to upload", async () => {
    await como(comoPostgres, async (c) => {
      const aMano = await tema(c, "A mano")
      const pendiente = await tema(c, "Pendiente")
      await pieza(c, [aMano], [{ destino: "instagram", estado: "subido_a_mano" }])
      await pieza(c, [pendiente], [
        { destino: "linkedin", estado: "esperando" },
        { destino: "instagram", estado: "para_subir" },
      ])
      await asumir(c, comoConi)
      expect(await tratados(c, [aMano, pendiente])).toEqual([{ tema_id: aMano, red: "instagram" }])
    })
  })

  it("counts a merged topic for the one that stayed, through five merges at most, as destinoDeTema", async () => {
    await como(comoPostgres, async (c) => {
      const vivo = await tema(c, "Vivo")
      const cadena = [vivo]
      for (let paso = 1; paso <= 6; paso++) cadena.unshift(await tema(c, `Paso ${paso}`, cadena[0] ?? null))
      // cadena[0] is six merges away from the live topic, cadena[1] five.
      await pieza(c, [cadena[0] ?? ""], [{ destino: "linkedin", estado: "publicado" }])
      await asumir(c, comoConi)
      expect(await tratados(c, cadena)).toEqual([])
      await asumir(c, comoPostgres)
      await pieza(c, [cadena[1] ?? ""], [{ destino: "linkedin", estado: "publicado" }])
      await asumir(c, comoConi)
      expect(await tratados(c, cadena)).toEqual([{ tema_id: vivo, red: "linkedin" }])
    })
  })

  it("does not count an idea without a theory yet", async () => {
    await como(comoPostgres, async (c) => {
      const propio = await tema(c, "Propio")
      await pieza(c, [propio], [{ destino: "linkedin", estado: "publicado" }], false)
      await asumir(c, comoConi)
      expect(await tratados(c, [propio])).toEqual([])
    })
  })

  it("is read through row level security: Coni sees it, WAV sees nothing because only Coni reads publicaciones", async () => {
    await como(comoPostgres, async (c) => {
      const carga = await tema(c, "Leído")
      await pieza(c, [carga], [{ destino: "linkedin", estado: "subido_a_mano" }])
      await asumir(c, comoConi)
      expect(await tratados(c, [carga])).toEqual([{ tema_id: carga, red: "linkedin" }])
      await asumir(c, comoMantenedor)
      expect(await tratados(c, [carga])).toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/temas-por-red.test.ts`
Expected: FAIL, every test: `relation "public.temas_tratados" does not exist`.

- [ ] **Step 3: Write the view**

Create `supabase/migrations/20261104000300_temas_tratados.sql`:

```sql
-- "Tratado" per network (spec 2026-11-04, part 15b, section 1): a live topic is treated on a network when some piece
-- went out there (`publicado` or `subido_a_mano`). Today the only path from a piece to a topic is its idea's theory
-- (`teorias.temas`: no foreign key, not moved by merges), so each id is followed along `fusionado_en`, five merges at
-- most like `destinoDeTema`; a merged topic counts for the one that stayed. An idea without a theory does not count
-- yet: a stored link can replace this body later without changing its columns. Security invoker: only Coni reads
-- `publicaciones`, so WAV sees no row.
create view public.temas_tratados with (security_invoker = true) as
with recursive
  salidas as (
    select distinct p.destino as red, u.tema_id
      from public.publicaciones p
      join public.piezas pz on pz.id = p.pieza_id
      join public.ideas i on i.id = pz.idea_id
      join public.teorias t on t.id = i.teoria_id
      cross join lateral unnest(t.temas) as u (tema_id)
     where p.estado in ('publicado', 'subido_a_mano')
  ),
  camino (red, tema_id, fusionado_en, pasos) as (
    select s.red, tm.id, tm.fusionado_en, 0
      from salidas s
      join public.temas tm on tm.id = s.tema_id
    union all
    select c.red, tm.id, tm.fusionado_en, c.pasos + 1
      from camino c
      join public.temas tm on tm.id = c.fusionado_en
     where c.pasos < 5
  )
select distinct tema_id, red
  from camino
 where fusionado_en is null;

revoke all on public.temas_tratados from anon, authenticated;
grant select on public.temas_tratados to authenticated;
```

- [ ] **Step 4: Rebuild, regenerate the types and run**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/temas-por-red.test.ts`
Expected: PASS (5 tests). `git diff --stat lib/supabase/database.types.ts` shows the new view `temas_tratados`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261104000300_temas_tratados.sql tests/integration/temas-por-red.test.ts lib/supabase/database.types.ts
git commit -m "Count a topic as treated on the network where a piece went out" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The function `temas_de_red`

**Files:**
- Modify: `supabase/migrations/20261104000300_temas_tratados.sql` (append; not in production yet)
- Modify: `tests/integration/temas-por-red.test.ts`
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/temas-por-red.test.ts`:

```ts
async function darPilar(c: pg.PoolClient, temaId: string, slug: string, fuerza: "alta" | "media" | null) {
  await c.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select $1::uuid, c.id, c.red, c.es_capa, $3::text, 'coni' from public.categorias c where c.slug = $2`,
    [temaId, slug, fuerza],
  )
}

async function pilarDe(c: pg.PoolClient, slug: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.categorias where slug = $1", [slug])
  const id = rows[0]?.id
  if (!id) throw new Error(`Falta el pilar ${slug}`)
  return id
}

async function deRed(c: pg.PoolClient, red: string, pilar: string | null, temas: readonly string[]) {
  const { rows } = await c.query<{ id: string; tratado: boolean }>(
    "select id, tratado from public.temas_de_red($1::text, $2::uuid) where id = any($3::uuid[]) order by nombre",
    [red, pilar, temas],
  )
  return rows
}

/** Four live topics (by name order) and a merged one; only the first went out, on LinkedIn. */
async function escena(c: pg.PoolClient) {
  const principal = await tema(c, "A principal")
  const secundario = await tema(c, "B secundario")
  const conCapa = await tema(c, "C capa")
  const sinPilares = await tema(c, "D sin pilares")
  const fusionado = await tema(c, "E fusionado", principal)
  await darPilar(c, principal, "bienestar-e-impacto", "alta")
  await darPilar(c, secundario, "diagnostico-doble", "alta")
  await darPilar(c, secundario, "bienestar-e-impacto", "media")
  await darPilar(c, conCapa, "capa-tdah", null)
  await pieza(c, [principal], [{ destino: "linkedin", estado: "subido_a_mano" }])
  return { principal, secundario, conCapa, sinPilares, todos: [principal, secundario, conCapa, sinPilares, fusionado] }
}

describe("temas_de_red", () => {
  it("without a pillar lists every live topic, saying whether it went out on that network", async () => {
    await como(comoPostgres, async (c) => {
      const { principal, secundario, conCapa, sinPilares, todos } = await escena(c)
      await asumir(c, comoConi)
      expect(await deRed(c, "linkedin", null, todos)).toEqual([
        { id: principal, tratado: true },
        { id: secundario, tratado: false },
        { id: conCapa, tratado: false },
        { id: sinPilares, tratado: false },
      ])
      expect((await deRed(c, "instagram", null, todos)).map((fila) => fila.tratado)).toEqual([
        false,
        false,
        false,
        false,
      ])
    })
  })

  it("with a pillar of that network lists the topics it is the main pillar of, never one it is a secondary of", async () => {
    await como(comoPostgres, async (c) => {
      const { principal, todos } = await escena(c)
      const bienestar = await pilarDe(c, "bienestar-e-impacto")
      await asumir(c, comoConi)
      expect(await deRed(c, "linkedin", bienestar, todos)).toEqual([{ id: principal, tratado: true }])
    })
  })

  it("with a layer lists the topics that carry it", async () => {
    await como(comoPostgres, async (c) => {
      const { conCapa, todos } = await escena(c)
      const capa = await pilarDe(c, "capa-tdah")
      await asumir(c, comoConi)
      expect(await deRed(c, "instagram", capa, todos)).toEqual([{ id: conCapa, tratado: false }])
    })
  })

  it("with a pillar of the other network or an unknown one lists nothing", async () => {
    await como(comoPostgres, async (c) => {
      const { todos } = await escena(c)
      const bienestar = await pilarDe(c, "bienestar-e-impacto")
      const capa = await pilarDe(c, "capa-tdah")
      await asumir(c, comoConi)
      expect(await deRed(c, "instagram", bienestar, todos)).toEqual([])
      expect(await deRed(c, "linkedin", capa, todos)).toEqual([])
      expect(await deRed(c, "linkedin", randomUUID(), todos)).toEqual([])
    })
  })

  it("leaves temas_de_pilar as it was, for the old code until the cleanup", async () => {
    await como(comoPostgres, async (c) => {
      const { principal, todos } = await escena(c)
      const bienestar = await pilarDe(c, "bienestar-e-impacto")
      await asumir(c, comoConi)
      const { rows } = await c.query<{ id: string }>(
        "select id from public.temas_de_pilar($1::uuid) where id = any($2::uuid[])",
        [bienestar, todos],
      )
      expect(rows).toEqual([{ id: principal }])
    })
  })

  it("is read through row level security: WAV gets every topic, none treated", async () => {
    await como(comoPostgres, async (c) => {
      const { todos } = await escena(c)
      await asumir(c, comoMantenedor)
      expect((await deRed(c, "linkedin", null, todos)).map((fila) => fila.tratado)).toEqual([
        false,
        false,
        false,
        false,
      ])
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/temas-por-red.test.ts`
Expected: the 5 `temas_tratados` tests PASS; five `temas_de_red` tests FAIL with `function public.temas_de_red(text, uuid) does not exist`. "leaves temas_de_pilar as it was" calls only the old function and PASSES already: it stays as the guard that 15b leaves `temas_de_pilar` alone.

- [ ] **Step 3: Append the function to the migration**

Append to `supabase/migrations/20261104000300_temas_tratados.sql`:

```sql

-- The topics of Temas on a network (spec 2026-11-04, part 15b, section 1): every `temas_resumen` row plus `tratado`
-- for `p_red`. A pillar of that network narrows to the topics whose main pillar there it is; a layer, to those with
-- its lens; a pillar of the other network or an unknown one, to nothing. It replaces `temas_de_pilar` in the app; that
-- one stays while the old Vercel code can call it (dropped by a later cleanup migration). Read with keyset paging, so
-- no list of ids travels in the URL. Security invoker: the RLS of every table under it still applies.
create function public.temas_de_red(p_red text, p_pilar uuid default null)
returns table (
  id uuid,
  nombre text,
  descripcion text,
  categoria_id uuid,
  alias text[],
  creado_en timestamptz,
  actualizado_en timestamptz,
  afirmaciones integer,
  autores integer,
  evidencia jsonb,
  cubierto_por_coni boolean,
  ultima_afirmacion timestamptz,
  tratado boolean
)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.nombre, r.descripcion, r.categoria_id, r.alias, r.creado_en, r.actualizado_en, r.afirmaciones,
         r.autores, r.evidencia, r.cubierto_por_coni, r.ultima_afirmacion, x.tema_id is not null as tratado
    from public.temas_resumen r
    left join public.temas_tratados x on x.tema_id = r.id and x.red = p_red
   where p_pilar is null
      or exists (
        select 1
          from public.tema_pilares p
         where p.tema_id = r.id
           and p.pilar_id = p_pilar
           and p.red = p_red
           and (p.es_capa or p.fuerza = 'alta')
      )
$$;

revoke all on function public.temas_de_red(text, uuid) from public, anon;
grant execute on function public.temas_de_red(text, uuid) to authenticated;
```

- [ ] **Step 4: Rebuild, regenerate the types and run**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/temas-por-red.test.ts tests/integration/datos-autores-temas.test.ts`
Expected: PASS (11 tests in the first file; the second still passes: nothing reads the new function yet). `lib/supabase/database.types.ts` now has `temas_de_red` under `Functions`, with `Args: { p_red: string; p_pilar?: string }`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261104000300_temas_tratados.sql tests/integration/temas-por-red.test.ts lib/supabase/database.types.ts
git commit -m "List the topics of a network with whether they went out there" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `ajustes.ultima_red`

**Files:**
- Create: `supabase/migrations/20261104000310_ultima_red.sql`
- Create: `tests/integration/ultima-red.test.ts`
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/ultima-red.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { como, comoConi, comoMantenedor, fallaCon, pool } from "./db"

let antes: string | null = null

beforeAll(async () => {
  const { rows } = await pool.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
  antes = rows[0]?.ultima_red ?? null
})

afterAll(async () => {
  await pool.query("update public.ajustes set ultima_red = $1", [antes])
  await pool.end()
})

describe("ajustes.ultima_red", () => {
  it("is empty until a network is stored, and takes only LinkedIn or Instagram", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set ultima_red = null")
      const { rows } = await c.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
      expect(rows).toEqual([{ ultima_red: null }])
      const error = await fallaCon(c, "update public.ajustes set ultima_red = 'youtube'")
      expect(error.code).toBe("23514")
      expect(error.constraint).toBe("ultima_red_valida")
    })
  })

  it("is written by Coni through row level security; WAV's session changes no row", async () => {
    await como(comoMantenedor, async (c) => {
      const { rowCount } = await c.query("update public.ajustes set ultima_red = 'instagram'")
      expect(rowCount).toBe(0)
    })
    await como(comoConi, async (c) => {
      const { rows } = await c.query("update public.ajustes set ultima_red = 'instagram' returning ultima_red")
      expect(rows).toEqual([{ ultima_red: "instagram" }])
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/ultima-red.test.ts`
Expected: FAIL at `beforeAll`: `column "ultima_red" does not exist`.

- [ ] **Step 3: Add the column**

Create `supabase/migrations/20261104000310_ultima_red.sql`:

```sql
-- The network Temas opened on last (spec 2026-11-04, part 15b, section 2). Null until Coni first opens Temas, which then
-- shows LinkedIn. She writes it like every other setting, through the policy "coni edita ajustes" (`recordarRed` in
-- lib/acciones/biblioteca.ts); WAV's session updates no row. Only a column is added: no existing row changes.
alter table public.ajustes
  add column ultima_red text constraint ultima_red_valida check (ultima_red in ('linkedin', 'instagram'));
```

- [ ] **Step 4: Rebuild, regenerate the types and run**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/ultima-red.test.ts && pnpm type`
Expected: PASS; `ajustes` `Row` in `lib/supabase/database.types.ts` has `ultima_red: string | null`; `pnpm type` passes (`guardarAjuste` reads `select("*")` and is unaffected).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261104000310_ultima_red.sql tests/integration/ultima-red.test.ts lib/supabase/database.types.ts
git commit -m "Store the network Temas opened on last" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Phase 2: readers and the write

### Task 4: `listarTemas` reads a network, and a topic says `tratado`

**Files:**
- Modify: `lib/dominio/biblioteca/temas.ts`
- Modify: `lib/datos/biblioteca.ts`
- Modify: `lib/dominio/biblioteca/filtros-de-temas.ts` (mechanical rename only)
- Modify: `app/(app)/biblioteca/temas/insignias.tsx`
- Modify: `app/(app)/biblioteca/temas/page.tsx` (interim: the network of the chosen pillar)
- Modify: `tests/integration/datos-autores-temas.test.ts`
- Modify: `tests/unit/biblioteca-orden-de-temas.test.ts`, `tests/unit/biblioteca-filtros-de-temas.test.ts`, `tests/unit/biblioteca-temas-piezas.test.tsx`, `tests/unit/biblioteca-pagina-temas.test.tsx`

- [ ] **Step 1: Write the failing integration test**

In `tests/integration/datos-autores-temas.test.ts`:

1. After `let pilar = ""` add:

```ts
let teoria = ""
let ideaPublicada = ""
let pieza = ""
```

2. At the end of `beforeAll`, after `materiales.push(deLaAutora, deConi, deOtra)`, add:

```ts
  // Carga went out on LinkedIn by hand: the only path from a piece to a topic is its idea's theory (spec 15b).
  const { rows: deTeoria } = await pool.query<{ id: string }>(
    "insert into public.teorias (titulo, tesis, origen, temas) values ($1, 'Tesis', 'motor', $2::uuid[]) returning id",
    [`Teoría ${SUFIJO}`, [carga]],
  )
  teoria = deTeoria[0]?.id ?? ""
  const { rows: deIdea } = await pool.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, formato, fuerza, estado, origen, teoria_id)
     values ('bienestar-e-impacto', $1, 'Carrusel', 'alta', 'usada', 'motor', $2) returning id`,
    [`Gancho ${SUFIJO}`, teoria],
  )
  ideaPublicada = deIdea[0]?.id ?? ""
  const { rows: dePieza } = await pool.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, $2) returning id",
    [ideaPublicada, `Pieza ${SUFIJO}`],
  )
  pieza = dePieza[0]?.id ?? ""
  if (!teoria || !ideaPublicada || !pieza) throw new Error("No se publicó la pieza de Carga")
  await pool.query(
    "insert into public.publicaciones (pieza_id, destino, estado, marcado_en) values ($1, 'linkedin', 'subido_a_mano', now())",
    [pieza],
  )
```

3. Replace the `afterAll` with:

```ts
afterAll(async () => {
  // The piece points at the idea and the idea at the theory: they go in that order, before the topics.
  await pool.query("delete from public.piezas where id = $1", [pieza])
  await pool.query("delete from public.ideas where id = $1", [ideaPublicada])
  await pool.query("delete from public.teorias where id = $1", [teoria])
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})
```

4. Replace the whole `describe("listarTemas", ...)` block with:

```ts
describe("listarTemas", () => {
  it("counts visible ideas and distinct authors, says whether it went out on the network, orders by most authors, leaves merged out", async () => {
    const nuestros = (await listarTemas(coni, { red: "linkedin" })).filter((t) => temas.includes(t.id))
    expect(nuestros.map((t) => t.id)).toEqual([carga, solo, pausas])
    expect(nuestros[0]).toEqual({
      id: carga,
      nombre: `Carga ${SUFIJO}`,
      descripcion: null,
      pilarId: pilar,
      ideas: 3,
      autores: 2,
      tratado: true,
    })
    expect(nuestros[1]).toMatchObject({ ideas: 2, autores: 1, tratado: false })
    const enInstagram = (await listarTemas(coni, { red: "instagram" })).filter((t) => temas.includes(t.id))
    expect(enInstagram.map((t) => [t.id, t.tratado])).toEqual([
      [carga, false],
      [solo, false],
      [pausas, false],
    ])
  })

  it("narrows to the topics whose main pillar it is in that network, not those it is only a secondary of", async () => {
    const nuestros = (await listarTemas(coni, { red: "linkedin", pilar })).filter((t) => temas.includes(t.id))
    expect(nuestros.map((t) => t.id)).toEqual([carga])
    const enLaOtra = (await listarTemas(coni, { red: "instagram", pilar })).filter((t) => temas.includes(t.id))
    expect(enLaOtra).toEqual([])
  })

  it("narrows by a layer to the topics with its lens, and to nothing for a pillar without topics", async () => {
    const { rows } = await pool.query<{ slug: string; id: string }>(
      "select slug, id from public.categorias where slug in ('capa-tdah', 'game-over-impostora')",
    )
    const idDe = (slug: string) => rows.find((r) => r.slug === slug)?.id ?? ""
    const conCapa = (await listarTemas(coni, { red: "instagram", pilar: idDe("capa-tdah") })).filter((t) =>
      temas.includes(t.id),
    )
    expect(conCapa.map((t) => t.id)).toEqual([carga])
    const vacio = (await listarTemas(coni, { red: "instagram", pilar: idDe("game-over-impostora") })).filter((t) =>
      temas.includes(t.id),
    )
    expect(vacio).toEqual([])
  })

  it("pages past the 1000-row limit: every topic of a pillar with more main topics than that, never naming them in the request", async () => {
    const { rows: elegido } = await pool.query<{ id: string }>(
      "select id from public.categorias where slug = 'psicologia-en-la-mesa'",
    )
    const muchoPilar = elegido[0]?.id ?? ""
    const { rows: creados } = await pool.query<{ id: string }>(
      `insert into public.temas (nombre, centroide)
       select 'Muchos ' || $1 || ' ' || n, (select centroide from public.temas where id = $2)
         from generate_series(1, 1050) as n
       returning id`,
      [SUFIJO, carga],
    )
    const muchos = creados.map((r) => r.id)
    temas.push(...muchos)
    await pool.query(
      `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
       select t, c.id, c.red, c.es_capa, 'alta', 'coni' from unnest($1::uuid[]) as t, public.categorias c where c.id = $2`,
      [muchos, muchoPilar],
    )
    const listados = (await listarTemas(coni, { red: "linkedin", pilar: muchoPilar })).map((t) => t.id)
    expect(listados.toSorted()).toEqual(muchos.toSorted())
  }, 60_000)
})
```

- [ ] **Step 2: Update the unit fixtures and the page test (they fail the same way)**

1. `tests/unit/biblioteca-orden-de-temas.test.ts` line 16: `cubiertoPorConi: false,` becomes `tratado: false,`.
2. `tests/unit/biblioteca-filtros-de-temas.test.ts`: the helper at lines 26-34 becomes

```ts
const tema = (id: string, autores: number, tratado: boolean): TemaResumido => ({
  id,
  nombre: id,
  descripcion: null,
  pilarId: null,
  ideas: autores,
  autores,
  tratado,
})
```

3. `tests/unit/biblioteca-temas-piezas.test.tsx`: in `carga`, `cubiertoPorConi: true,` becomes `tratado: true,`; in `pausas`, `cubiertoPorConi: false,` becomes `tratado: false,`.
4. `tests/unit/biblioteca-pagina-temas.test.tsx`: in `carga` and `pausas`, `cubiertoPorConi` becomes `tratado` (same values), and the test "narrows by an active pillar, and ignores one that is not" ends with

```ts
    await Temas(conParams({ pilar: PILAR }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { red: "linkedin", pilar: PILAR })
    await Temas(conParams({ pilar: OTRO }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { red: "linkedin", pilar: undefined })
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm test:db tests/integration/datos-autores-temas.test.ts && pnpm test:run tests/unit/biblioteca-temas-piezas.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx tests/unit/biblioteca-filtros-de-temas.test.ts`
Expected: FAIL. Integration: the rows still carry `cubiertoPorConi` and no `tratado`, the other-network pillar still lists Carga, and the 1050 test lists 1050 only through `temas_de_pilar` (it may pass; the others fail). Unit: "says «Ya lo traté»" fails (the badge reads `cubiertoPorConi`), the coverage filter keeps the wrong ids, the page is called without `red`.

- [ ] **Step 4: Implement**

1. `lib/dominio/biblioteca/temas.ts`, in `TemaResumido`, replace the last field and its comment with:

```ts
  /** Some piece of it went out on the network Temas shows (`temas_de_red.tratado`, spec 2026-11-04, part 15b). */
  tratado: boolean
```

2. `lib/datos/biblioteca.ts`: the import from `@/lib/dominio/pilares` becomes

```ts
import {
  esFuerza,
  type PilarDeRed,
  type PilaresDeTema,
  pilaresDeRedes,
  pilaresDeTema,
  type Red,
} from "@/lib/dominio/pilares"
```

and `listarTemas` (with its doc comment) becomes:

```ts
/**
 * The topics of Temas on a network (ported from Ingesta's `listarTemas`), ordered by `ordenarTemas`, each saying
 * whether it went out there. A pillar or layer of that network narrows them (spec 2026-11-04, part 15b):
 * `temas_de_red` joins in the DB, so no list of ids travels in the URL.
 */
export async function listarTemas(db: Db, filtros: { red: Red; pilar?: string }): Promise<TemaResumido[]> {
  const { red, pilar } = filtros
  const filas = await leerTodas(`los temas de ${red}`, (despuesDe, limite) => {
    const todas = db
      .rpc("temas_de_red", { p_red: red, p_pilar: pilar })
      .select("id, nombre, descripcion, categoria_id, afirmaciones, autores, tratado")
    return (despuesDe === null ? todas : todas.gt("id", despuesDe))
      .order("id")
      .limit(limite)
      .then(({ data, error }) => ({ data: data?.map(conIdYNombre) ?? null, error }))
  })
  return ordenarTemas(
    filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      pilarId: fila.categoria_id,
      ideas: fila.afirmaciones ?? 0,
      autores: fila.autores ?? 0,
      tratado: fila.tratado === true,
    })),
  )
}
```

3. `lib/dominio/biblioteca/filtros-de-temas.ts` (the whole model is replaced in Task 10; here only the field): line 8's comment becomes `/** Coni's option 1: by coverage. "Sin tratar" and "Ya los traté" split on `tratado`. */`, and in `CUMPLE` `!tema.cubiertoPorConi` becomes `!tema.tratado` and `tema.cubiertoPorConi` becomes `tema.tratado`.

4. `app/(app)/biblioteca/temas/insignias.tsx`, the component becomes:

```tsx
/** Ported from Ingesta's `TarjetaDeTema`. "Ya lo traté" follows the chosen network (`tratado`, spec 15b). */
export function Insignias({ tema }: { tema: Pick<TemaResumido, "tratado" | "autores"> }) {
  if (!tema.tratado && tema.autores !== 1) return null
  return (
    <span className="flex flex-wrap gap-2">
      {tema.tratado ? <Insignia texto="Ya lo traté" /> : null}
      {tema.autores === 1 ? <Insignia texto="Un solo autor" /> : null}
    </span>
  )
}
```

5. `app/(app)/biblioteca/temas/page.tsx`, replace

```ts
  // The pillar narrows what is read; the coverage splits it, so its counts are the pillar's.
  const temas = await listarTemas(db, { pilar: filtros.pilar })
```

with

```ts
  // Until the row arrives (Task 10) the network is the chosen pillar's, LinkedIn without one.
  const red = pilares.find((pilar) => pilar.id === filtros.pilar)?.red ?? "linkedin"
  // The pillar narrows what is read; the coverage splits it, so its counts are the pillar's.
  const temas = await listarTemas(db, { red, pilar: filtros.pilar })
```

- [ ] **Step 5: Run**

Run: `pnpm test:db tests/integration/datos-autores-temas.test.ts && pnpm test:run tests/unit/biblioteca-orden-de-temas.test.ts tests/unit/biblioteca-filtros-de-temas.test.ts tests/unit/biblioteca-temas-piezas.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx && pnpm type && grep -rn "cubiertoPorConi" app lib components tests`
Expected: PASS; `pnpm type` passes; the `grep` prints nothing (the engine's `cubierto_por_coni` in `lib/motor/*` is snake case and stays).

- [ ] **Step 6: Commit**

```bash
git add lib/dominio/biblioteca/temas.ts lib/datos/biblioteca.ts lib/dominio/biblioteca/filtros-de-temas.ts \
  "app/(app)/biblioteca/temas/insignias.tsx" "app/(app)/biblioteca/temas/page.tsx" \
  tests/integration/datos-autores-temas.test.ts tests/unit/biblioteca-orden-de-temas.test.ts \
  tests/unit/biblioteca-filtros-de-temas.test.ts tests/unit/biblioteca-temas-piezas.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx
git commit -m "Read Temas per network and say a topic is treated when it went out there" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: `leerUltimaRed`, `recordarRed` and its server action

**Files:**
- Modify: `lib/datos/biblioteca.ts`
- Modify: `lib/acciones/biblioteca.ts`
- Modify: `app/(app)/biblioteca/acciones.ts`
- Modify: `tests/integration/ultima-red.test.ts`
- Modify: `tests/unit/biblioteca-acciones-servidor.test.ts`

- [ ] **Step 1: Write the failing tests**

1. In `tests/integration/ultima-red.test.ts`, replace the first two import lines with:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { recordarRed } from "@/lib/acciones/biblioteca"
import { ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { leerUltimaRed } from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { como, comoConi, comoMantenedor, fallaCon, pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

let coni: SupabaseClient<Database>
let wav: SupabaseClient<Database>
```

make `beforeAll` start with `coni = await clienteDeConi()` and `wav = await clienteDelMantenedor()`, and append:

```ts
describe("recordarRed and leerUltimaRed", () => {
  it("as Coni stores the network on screen and reads it back", async () => {
    expect(await recordarRed({ db: coni }, { red: "instagram" })).toEqual({ ok: true })
    expect(await leerUltimaRed(coni)).toBe("instagram")
    expect(await recordarRed({ db: coni }, { red: "linkedin" })).toEqual({ ok: true })
    expect(await leerUltimaRed(coni)).toBe("linkedin")
  })

  it("refuses WAV and leaves the stored network as it was", async () => {
    await pool.query("update public.ajustes set ultima_red = 'linkedin'")
    expect(await recordarRed({ db: wav }, { red: "instagram" })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
    expect(await leerUltimaRed(coni)).toBe("linkedin")
  })

  it("reads nothing stored as null", async () => {
    await pool.query("update public.ajustes set ultima_red = null")
    expect(await leerUltimaRed(coni)).toBeNull()
  })
})
```

2. In `tests/unit/biblioteca-acciones-servidor.test.ts`, add `recordarRedAccion` to the import from `@/app/(app)/biblioteca/acciones` and `RedElegida` to the import from `@/lib/acciones/biblioteca`, and append inside `describe("the server actions of Autores and Temas", ...)`:

```ts
  it("recordarRed checks Coni with its schema and refreshes nothing: the stored network is a convenience", async () => {
    expect(await recordarRedAccion({ red: "instagram" })).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenCalledWith("recordarRed", RedElegida, { red: "instagram" }, expect.any(Function))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(RedElegida.safeParse({ red: "youtube" }).success).toBe(false)
  })
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test:db tests/integration/ultima-red.test.ts && pnpm test:run tests/unit/biblioteca-acciones-servidor.test.ts`
Expected: FAIL: `recordarRed is not a function` / `leerUltimaRed is not a function`; the unit test fails on `recordarRedAccion is not a function`.

- [ ] **Step 3: Implement**

1. `lib/datos/biblioteca.ts`: add `esRed,` to the import from `@/lib/dominio/pilares` (it already imports `type Red`), and after `listarPilaresDeTemas` add:

```ts
/** The network Temas opens on without `?red` (spec 2026-11-04, part 15b); null until Coni first opens it. */
export async function leerUltimaRed(db: Db): Promise<Red | null> {
  const { data, error } = await db.from("ajustes").select("ultima_red").maybeSingle()
  if (error) throw new Error(`No pude leer la última red de Temas: ${error.message}`, { cause: error })
  const red = data?.ultima_red ?? null
  if (red === null || esRed(red)) return red
  // The column's check lets only the two networks in: anything else means the schema changed under us.
  throw new Error(`La última red de Temas es desconocida: ${red}.`)
}
```

2. `lib/acciones/biblioteca.ts`: the import `import { FUERZAS } from "@/lib/dominio/pilares"` becomes `import { FUERZAS, REDES } from "@/lib/dominio/pilares"`; after `CambioDePilares` add

```ts
export const RedElegida = z.object({ red: z.enum(REDES) })
```

and at the end of the file add:

```ts
/**
 * The network Temas showed, so it opens there next time (spec 2026-11-04, part 15b). Written like every setting,
 * through the policy "coni edita ajustes"; row level security answers "no rows" to anybody else, which is an error.
 */
export function recordarRed(
  deps: Pick<DepsBiblioteca, "db">,
  elegida: z.output<typeof RedElegida>,
): Promise<Resultado> {
  return aResultado("recordarRed", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("ajustes")
      .update({ ultima_red: elegida.red })
      .eq("id", true)
      .select("ultima_red")
      .maybeSingle()
    if (error) throw new Error(`No pude recordar la red ${elegida.red}: ${error.message}`, { cause: error })
    if (!data) throw new Error("La base no guardó la red de Temas.")
    return {}
  })
}
```

3. `app/(app)/biblioteca/acciones.ts`: add `RedElegida,` and `recordarRed,` to the import from `@/lib/acciones/biblioteca` (alphabetical order: after `ocultarIdea,` comes `RedElegida,`, `recordarRed,`, `reintentarMaterial,`), and append:

```ts
/** Temas' last network (spec 15b): nothing on screen depends on it now, so nothing is refreshed. */
export async function recordarRedAccion(elegida: z.input<typeof RedElegida>) {
  return conSesionDeConi("recordarRed", RedElegida, elegida, (db, d) => recordarRed({ db }, d))
}
```

- [ ] **Step 4: Run**

Run: `pnpm test:db tests/integration/ultima-red.test.ts && pnpm test:run tests/unit/biblioteca-acciones-servidor.test.ts && pnpm type && pnpm lint`
Expected: PASS (5 integration tests). If Biome reorders the imports, run `pnpm check` (safe) and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/biblioteca.ts lib/acciones/biblioteca.ts "app/(app)/biblioteca/acciones.ts" \
  tests/integration/ultima-red.test.ts tests/unit/biblioteca-acciones-servidor.test.ts
git commit -m "Read and record the network Temas opens on" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint, phases 1 and 2:** two migrations, nothing existing changed; `listarTemas` reads a network with `tratado`; Coni can store her last network and WAV cannot. The screen still shows batch 3's chips.

# Phase 3: the row

### Task 6: The row's filter model

**Files:**
- Create: `lib/dominio/biblioteca/fila-de-temas.ts`
- Create: `tests/unit/biblioteca-fila-de-temas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-fila-de-temas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  alternarSinTratar,
  alternarTratados,
  alternarUnAutor,
  conPilar,
  conRed,
  contarFiltros,
  type FiltrosDeTemas,
  filtrarTemas,
  hayFiltrosDeTemas,
  hrefDeTemas,
  leerFiltrosDeTemas,
  RED_POR_DEFECTO,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import type { PilarDeRed, Red } from "@/lib/dominio/pilares"

const DE_LINKEDIN = "11111111-2222-4333-8444-555555555555"
const DE_INSTAGRAM = "22222222-2222-4333-8444-555555555555"
const CAPA = "33333333-2222-4333-8444-555555555555"
const TEMA = "44444444-2222-4333-8444-555555555555"
const DESCONOCIDO = "55555555-2222-4333-8444-555555555555"
const PILARES: PilarDeRed[] = [
  { id: DE_LINKEDIN, slug: "diagnostico-doble", nombreCorto: "Diagnóstico doble", red: "linkedin", esCapa: false },
  { id: DE_INSTAGRAM, slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram", esCapa: false },
  { id: CAPA, slug: "capa-tdah", nombreCorto: "Capa TDAH", red: "instagram", esCapa: true },
]

const leer = (params: Record<string, string>, ultimaRed: Red | null = null) =>
  leerFiltrosDeTemas(params, { pilares: PILARES, ultimaRed })

describe("leerFiltrosDeTemas", () => {
  it("opens on the stored network, LinkedIn when nothing is stored, and the address wins over both", () => {
    expect(RED_POR_DEFECTO).toBe("linkedin")
    expect(leer({})).toEqual({ red: "linkedin" })
    expect(leer({}, "instagram")).toEqual({ red: "instagram" })
    expect(leer({ red: "linkedin" }, "instagram")).toEqual({ red: "linkedin" })
  })

  it("reads an unknown network as absent", () => {
    expect(leer({ red: "youtube" }, "instagram")).toEqual({ red: "instagram" })
    expect(leer({ red: "LinkedIn" })).toEqual({ red: "linkedin" })
  })

  it("keeps a pillar or layer of the chosen network and drops one of the other network, an unknown one or a non-id", () => {
    expect(leer({ red: "instagram", pilar: CAPA })).toEqual({ red: "instagram", pilar: CAPA })
    expect(leer({ red: "instagram", pilar: DE_LINKEDIN })).toEqual({ red: "instagram" })
    expect(leer({ red: "linkedin", pilar: DESCONOCIDO })).toEqual({ red: "linkedin" })
    expect(leer({ red: "linkedin", pilar: "no-es-un-id" })).toEqual({ red: "linkedin" })
  })

  it("gives 15a's ?pilar= without ?red its own network, before the stored one", () => {
    expect(leer({ pilar: DE_INSTAGRAM }, "linkedin")).toEqual({ red: "instagram", pilar: DE_INSTAGRAM })
  })

  it.each([
    ["sin-tratar", { sinTratar: true }],
    ["tratados", { tratados: true }],
    ["un-autor", { unAutor: true }],
  ] as const)("reads ?%s=1 as on and any other value as off", (clave, encendido) => {
    expect(leer({ [clave]: "1" })).toEqual({ red: "linkedin", ...encendido })
    expect(leer({ [clave]: "si" })).toEqual({ red: "linkedin" })
  })

  it.each([
    ["sin-tratar", { sinTratar: true }],
    ["tratados", { tratados: true }],
    ["un-autor", { unAutor: true }],
    ["otra", {}],
  ] as const)("reads batch 3's ?cobertura=%s as its switch", (cobertura, encendido) => {
    expect(leer({ cobertura })).toEqual({ red: "linkedin", ...encendido })
  })

  it("reads «Sin tratar» and «Ya los traté» together as neither: they exclude each other", () => {
    expect(leer({ "sin-tratar": "1", tratados: "1", "un-autor": "1" })).toEqual({ red: "linkedin", unAutor: true })
    expect(leer({ cobertura: "tratados", "sin-tratar": "1" })).toEqual({ red: "linkedin" })
  })

  it("ignores the note and the selection", () => {
    expect(leer({ oculta: TEMA, t: TEMA })).toEqual({ red: "linkedin" })
  })
})

describe("the row's links", () => {
  const base: FiltrosDeTemas = { red: "instagram", pilar: CAPA, unAutor: true }

  it("writes the network first, then the pillar, the switches and the side panel", () => {
    expect(hrefDeTemas({ red: "linkedin" })).toBe("/biblioteca/temas?red=linkedin")
    expect(hrefDeTemas({ red: "instagram", pilar: CAPA, sinTratar: true, unAutor: true }, TEMA)).toBe(
      `/biblioteca/temas?red=instagram&pilar=${CAPA}&sin-tratar=1&un-autor=1&t=${TEMA}`,
    )
    expect(hrefDeTemas({ red: "linkedin", tratados: true })).toBe("/biblioteca/temas?red=linkedin&tratados=1")
  })

  it("«Sin tratar» is one tap on and one tap off, and turning it on clears «Ya los traté»", () => {
    expect(alternarSinTratar({ ...base, tratados: true })).toEqual({ ...base, sinTratar: true })
    expect(alternarSinTratar({ ...base, sinTratar: true })).toEqual(base)
  })

  it("«Ya los traté» clears «Sin tratar», and «Un solo autor» combines with everything", () => {
    expect(alternarTratados({ ...base, sinTratar: true })).toEqual({ ...base, tratados: true })
    expect(alternarTratados({ ...base, tratados: true })).toEqual(base)
    expect(alternarUnAutor({ red: "linkedin", sinTratar: true })).toEqual({
      red: "linkedin",
      sinTratar: true,
      unAutor: true,
    })
    expect(alternarUnAutor(base)).toEqual({ red: "instagram", pilar: CAPA })
  })

  it("another network closes this one's pillars, the chosen one again goes back to every pillar, switches kept", () => {
    expect(conRed(base, "linkedin")).toEqual({ red: "linkedin", unAutor: true })
    expect(conRed(base, "instagram")).toEqual({ red: "instagram", unAutor: true })
  })

  it("a pillar replaces the chosen one and «Todos los pilares» takes it out", () => {
    expect(conPilar(base, DE_INSTAGRAM)).toEqual({ ...base, pilar: DE_INSTAGRAM })
    expect(conPilar(base, undefined)).toEqual({ red: "instagram", unAutor: true })
  })

  it("does not count the network alone as a filter", () => {
    expect(hayFiltrosDeTemas({ red: "instagram" })).toBe(false)
    expect(hayFiltrosDeTemas({ red: "instagram", pilar: CAPA })).toBe(true)
    expect(hayFiltrosDeTemas({ red: "linkedin", sinTratar: true })).toBe(true)
    expect(hayFiltrosDeTemas({ red: "linkedin", unAutor: true })).toBe(true)
  })
})

const tema = (id: string, autores: number, tratado: boolean): TemaResumido => ({
  id,
  nombre: id,
  descripcion: null,
  pilarId: null,
  ideas: autores,
  autores,
  tratado,
})
const TEMAS = [tema("tratado", 2, true), tema("solo", 1, false), tema("solo-tratado", 1, true), tema("varios", 3, false)]

describe("the switches over the topics of the network and pillar", () => {
  it.each([
    [{}, ["tratado", "solo", "solo-tratado", "varios"]],
    [{ sinTratar: true }, ["solo", "varios"]],
    [{ tratados: true }, ["tratado", "solo-tratado"]],
    [{ unAutor: true }, ["solo", "solo-tratado"]],
    [{ sinTratar: true, unAutor: true }, ["solo"]],
  ] as const)("%j keeps %j", (interruptores, ids) => {
    expect(filtrarTemas(TEMAS, { red: "linkedin", ...interruptores }).map((t) => t.id)).toEqual(ids)
  })

  it("counts each switch over the list it gets, whatever is on", () => {
    expect(contarFiltros(TEMAS)).toEqual({ sinTratar: 2, tratados: 2, unAutor: 2 })
    expect(contarFiltros([])).toEqual({ sinTratar: 0, tratados: 0, unAutor: 0 })
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-fila-de-temas.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/dominio/biblioteca/fila-de-temas"`.

- [ ] **Step 3: Implement**

Create `lib/dominio/biblioteca/fila-de-temas.ts`:

```ts
import { z } from "zod"
import { esRed, type PilarDeRed, type Red } from "@/lib/dominio/pilares"
import { RUTA_DE_TEMAS } from "./filtros-de-temas"
import type { TemaResumido } from "./temas"

/** Without `?red` and with nothing stored, Temas opens on LinkedIn (spec 2026-11-04, part 15b, section 2). */
export const RED_POR_DEFECTO: Red = "linkedin"

/**
 * Coni's row (spec 15b): always a network, maybe a pillar or layer of it, and three switches. Every value lives in the
 * address. A switch is present only when on, so two equal choices are equal objects.
 */
export interface FiltrosDeTemas {
  red: Red
  /** A pillar or layer of `red`. */
  pilar?: string
  /** Nothing out on `red` yet. Excludes `tratados`. */
  sinTratar?: true
  /** At least one piece out on `red` («Ya los traté»). Excludes `sinTratar`. */
  tratados?: true
  /** Backed by one author («Un solo autor»); combines with everything. */
  unAutor?: true
}

export interface ContextoDeTemas {
  /** Every network's pillars and layers, as `listarPilaresDeTemas` gives them. */
  pilares: readonly PilarDeRed[]
  /** `ajustes.ultima_red`. */
  ultimaRed: Red | null
}

/** How many topics of the network and pillar each switch would leave. */
export interface ConteosDeTemas {
  sinTratar: number
  tratados: number
  unAutor: number
}

type Params = Record<string, string | string[] | undefined>

interface Interruptores {
  sinTratar: boolean
  tratados: boolean
  unAutor: boolean
}

const ENCENDIDO = "1"

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)?.trim()

function armar(red: Red, pilar: string | undefined, { sinTratar, tratados, unAutor }: Interruptores): FiltrosDeTemas {
  const filtros: FiltrosDeTemas = { red }
  if (pilar) filtros.pilar = pilar
  if (sinTratar) filtros.sinTratar = true
  if (tratados) filtros.tratados = true
  if (unAutor) filtros.unAutor = true
  return filtros
}

const interruptores = (filtros: FiltrosDeTemas): Interruptores => ({
  sinTratar: filtros.sinTratar === true,
  tratados: filtros.tratados === true,
  unAutor: filtros.unAutor === true,
})

/** The row from the address; an invalid value reads as absent, never as an error. */
export function leerFiltrosDeTemas(params: Params, { pilares, ultimaRed }: ContextoDeTemas): FiltrosDeTemas {
  const pedida = primero(params.red)
  const id = z.uuid().safeParse(primero(params.pilar))
  const pilar = id.success ? pilares.find((candidato) => candidato.id === id.data) : undefined
  // 15a's addresses carried `?pilar=` alone: the pillar says its network.
  const red = esRed(pedida) ? pedida : (pilar?.red ?? ultimaRed ?? RED_POR_DEFECTO)
  // Batch 3's addresses (`?cobertura=`) read as the switch they named.
  const cobertura = primero(params.cobertura)
  const encendido = (clave: "sin-tratar" | "tratados" | "un-autor") =>
    primero(params[clave]) === ENCENDIDO || cobertura === clave
  const sinTratar = encendido("sin-tratar")
  const tratados = encendido("tratados")
  // The two exclude each other: an address with both is contradictory and reads as neither.
  return armar(red, pilar?.red === red ? pilar.id : undefined, {
    sinTratar: sinTratar && !tratados,
    tratados: tratados && !sinTratar,
    unAutor: encendido("un-autor"),
  })
}

/** A network alone is where she is, not a filter: the empty list says so only when something narrows it. */
export function hayFiltrosDeTemas(filtros: FiltrosDeTemas): boolean {
  return Boolean(filtros.pilar || filtros.sinTratar || filtros.tratados || filtros.unAutor)
}

/** Temas with these filters (and the side panel open on `seleccion`): linkable, Back undoes it. */
export function hrefDeTemas(filtros: FiltrosDeTemas, seleccion: string | null = null): string {
  const params = new URLSearchParams({ red: filtros.red })
  if (filtros.pilar) params.set("pilar", filtros.pilar)
  if (filtros.sinTratar) params.set("sin-tratar", ENCENDIDO)
  if (filtros.tratados) params.set("tratados", ENCENDIDO)
  if (filtros.unAutor) params.set("un-autor", ENCENDIDO)
  if (seleccion) params.set("t", seleccion)
  return `${RUTA_DE_TEMAS}?${params}`
}

export function alternarSinTratar(filtros: FiltrosDeTemas): FiltrosDeTemas {
  return armar(filtros.red, filtros.pilar, {
    ...interruptores(filtros),
    sinTratar: !filtros.sinTratar,
    tratados: false,
  })
}

export function alternarTratados(filtros: FiltrosDeTemas): FiltrosDeTemas {
  return armar(filtros.red, filtros.pilar, {
    ...interruptores(filtros),
    tratados: !filtros.tratados,
    sinTratar: false,
  })
}

export function alternarUnAutor(filtros: FiltrosDeTemas): FiltrosDeTemas {
  return armar(filtros.red, filtros.pilar, { ...interruptores(filtros), unAutor: !filtros.unAutor })
}

/** Another network closes this one's pillars; the chosen one again goes back to «Todos los pilares». */
export function conRed(filtros: FiltrosDeTemas, red: Red): FiltrosDeTemas {
  return armar(red, undefined, interruptores(filtros))
}

/** A pillar or layer of the chosen network; undefined is «Todos los pilares». */
export function conPilar(filtros: FiltrosDeTemas, pilar: string | undefined): FiltrosDeTemas {
  return armar(filtros.red, pilar, interruptores(filtros))
}

/** The switches over the topics already read for the network and pillar. */
export function filtrarTemas(temas: readonly TemaResumido[], filtros: FiltrosDeTemas): TemaResumido[] {
  return temas.filter(
    (tema) =>
      (!filtros.sinTratar || !tema.tratado) &&
      (!filtros.tratados || tema.tratado) &&
      (!filtros.unAutor || tema.autores === 1),
  )
}

export function contarFiltros(temas: readonly TemaResumido[]): ConteosDeTemas {
  return {
    sinTratar: temas.filter((tema) => !tema.tratado).length,
    tratados: temas.filter((tema) => tema.tratado).length,
    unAutor: temas.filter((tema) => tema.autores === 1).length,
  }
}
```

- [ ] **Step 4: Run**

Run: `pnpm test:run tests/unit/biblioteca-fila-de-temas.test.ts tests/unit/sin-slugs-de-pilar.test.ts && pnpm type && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/biblioteca/fila-de-temas.ts tests/unit/biblioteca-fila-de-temas.test.ts
git commit -m "Model the Temas row with every choice in the address" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: A network's pillars for the row, layers last

**Files:**
- Modify: `lib/dominio/pilares.ts`
- Modify: `tests/unit/pilares.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/pilares.test.ts`, add `pilaresDeLaRed,` to the import (after `pilaresDeEleccion,`), and add inside `describe("catálogo de pilares", ...)`, after the test "gives the pillars and layers of a network, with their id, for the topic screens":

```ts
  it("gives a network's row for Temas: its pillars in the order given, then its layers", () => {
    const opciones = pilaresDeRedes(PILARES_DE_PRUEBA)
    expect(pilaresDeLaRed(opciones, "instagram").map((p) => p.nombreCorto)).toEqual([
      "Game Over Impostora",
      "Mi nueva partida",
      "Inteligencia emocional",
      "Capa TDAH",
    ])
    // A layer ordered before the pillars still goes last: it is not a pillar.
    expect(pilaresDeLaRed(opciones.toReversed(), "instagram").map((p) => p.nombreCorto)).toEqual([
      "Inteligencia emocional",
      "Mi nueva partida",
      "Game Over Impostora",
      "Capa TDAH",
    ])
    expect(pilaresDeLaRed(opciones, "linkedin").map((p) => p.nombreCorto)).toEqual([
      "Diagnóstico doble",
      "Bienestar e impacto",
      "Psicología en la mesa",
      "Mujeres líderes",
    ])
  })
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test:run tests/unit/pilares.test.ts`
Expected: FAIL: `pilaresDeLaRed is not a function`.

- [ ] **Step 3: Implement**

In `lib/dominio/pilares.ts`, after `pilaresDeRedes`, add:

```ts
/** A network's row in Temas: its pillars in the order given (the catalog's), then its layers, which are not pillars. */
export function pilaresDeLaRed(pilares: readonly PilarDeRed[], red: Red): PilarDeRed[] {
  const deLaRed = pilares.filter((pilar) => pilar.red === red)
  return [...deLaRed.filter((pilar) => !pilar.esCapa), ...deLaRed.filter((pilar) => pilar.esCapa)]
}
```

- [ ] **Step 4: Run**

Run: `pnpm test:run tests/unit/pilares.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/pilares.ts tests/unit/pilares.test.ts
git commit -m "List a network's pillars for the Temas row with its layer last" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: `FilaDeTemas`

**Files:**
- Modify: `components/ui/clases-de-chip.ts`
- Create: `app/(app)/biblioteca/temas/fila-de-temas.tsx`
- Create: `tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FilaDeTemas } from "@/app/(app)/biblioteca/temas/fila-de-temas"
import type { PilarDeRed } from "@/lib/dominio/pilares"

const DIAGNOSTICO = "11111111-2222-4333-8444-555555555555"
const BIENESTAR = "22222222-2222-4333-8444-555555555555"
const PARTIDA = "33333333-2222-4333-8444-555555555555"
const CAPA = "44444444-2222-4333-8444-555555555555"
// The layer first on purpose: the row still puts it last.
const PILARES: PilarDeRed[] = [
  { id: CAPA, slug: "capa-tdah", nombreCorto: "Capa TDAH", red: "instagram", esCapa: true },
  { id: DIAGNOSTICO, slug: "diagnostico-doble", nombreCorto: "Diagnóstico doble", red: "linkedin", esCapa: false },
  { id: BIENESTAR, slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", red: "linkedin", esCapa: false },
  { id: PARTIDA, slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram", esCapa: false },
]

const textos = (enlaces: HTMLElement[]) => enlaces.map((enlace) => enlace.textContent)

describe("FilaDeTemas", () => {
  it("is one group: «Sin tratar», LinkedIn and Instagram, the chosen network pressed and only its pillars open", () => {
    render(<FilaDeTemas filtros={{ red: "linkedin" }} pilares={PILARES} sinTratar={2} />)
    const fila = screen.getByRole("group", { name: "Filtrar temas" })
    expect(textos(within(fila).getAllByRole("link"))).toEqual([
      "Sin tratar · 2",
      "LinkedIn",
      "Instagram",
      "Todos los pilares",
      "Diagnóstico doble",
      "Bienestar e impacto",
    ])
    expect(within(fila).getByRole("link", { name: "LinkedIn" })).toHaveAttribute("aria-current", "true")
    expect(within(fila).getByRole("link", { name: "Instagram" })).not.toHaveAttribute("aria-current")
    const pilares = within(fila).getByRole("list", { name: "Pilares de LinkedIn" })
    expect(within(pilares).getByRole("link", { name: "Todos los pilares" })).toHaveAttribute("aria-current", "page")
    expect(within(fila).queryByRole("list", { name: "Pilares de Instagram" })).toBeNull()
  })

  it("links each choice to its address: the switch on, the other network, the same one back to every pillar, a pillar", () => {
    render(<FilaDeTemas filtros={{ red: "linkedin", pilar: BIENESTAR }} pilares={PILARES} sinTratar={0} />)
    const fila = screen.getByRole("group", { name: "Filtrar temas" })
    const sinTratar = within(fila).getByRole("link", { name: "Sin tratar" })
    expect(sinTratar).toHaveAttribute("href", `/biblioteca/temas?red=linkedin&pilar=${BIENESTAR}&sin-tratar=1`)
    expect(sinTratar).not.toHaveAttribute("aria-current")
    expect(within(fila).getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "/biblioteca/temas?red=instagram")
    expect(within(fila).getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "/biblioteca/temas?red=linkedin")
    expect(within(fila).getByRole("link", { name: "Diagnóstico doble" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?red=linkedin&pilar=${DIAGNOSTICO}`,
    )
    expect(within(fila).getByRole("link", { name: "Bienestar e impacto" })).toHaveAttribute("aria-current", "page")
    expect(within(fila).getByRole("link", { name: "Todos los pilares" })).not.toHaveAttribute("aria-current")
  })

  it("on Instagram puts the TDAH layer last, and «Sin tratar» on turns off in one tap keeping the pillar", () => {
    render(<FilaDeTemas filtros={{ red: "instagram", pilar: CAPA, sinTratar: true }} pilares={PILARES} sinTratar={3} />)
    const pilares = screen.getByRole("list", { name: "Pilares de Instagram" })
    expect(textos(within(pilares).getAllByRole("link"))).toEqual(["Todos los pilares", "Mi nueva partida", "Capa TDAH"])
    expect(within(pilares).getByRole("link", { name: "Capa TDAH" })).toHaveAttribute("aria-current", "page")
    expect(within(pilares).getByRole("link", { name: "Todos los pilares" })).toHaveAttribute(
      "href",
      "/biblioteca/temas?red=instagram&sin-tratar=1",
    )
    const sinTratar = screen.getByRole("link", { name: "Sin tratar · 3" })
    expect(sinTratar).toHaveAttribute("aria-current", "page")
    expect(sinTratar).toHaveAttribute("href", `/biblioteca/temas?red=instagram&pilar=${CAPA}`)
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "/biblioteca/temas?red=linkedin&sin-tratar=1")
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx`
Expected: FAIL: `Failed to resolve import "@/app/(app)/biblioteca/temas/fila-de-temas"`.

- [ ] **Step 3: Implement**

1. Append to `components/ui/clases-de-chip.ts`:

```ts
/** A chip link that is the current filter: ink with light text, as Materiales' quick filters. */
export const CHIP_ELEGIDO = "aria-[current=page]:bg-tinta aria-[current=page]:text-luz"
```

2. Create `app/(app)/biblioteca/temas/fila-de-temas.tsx`:

```tsx
import { CaretDown, Check } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { CHIP_ELEGIDO, FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import {
  alternarSinTratar,
  conPilar,
  conRed,
  type FiltrosDeTemas,
  hrefDeTemas,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import { NOMBRE_DE_RED, type PilarDeRed, pilaresDeLaRed, REDES } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

const CHIP = cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP)
// The chosen network looks pressed: sunk into the stone, with its pillars open under the row.
const RED_ELEGIDA = "aria-[current=true]:bg-piedra-honda aria-[current=true]:shadow-hundido"
// Coni asked for the layer to read as not a pillar: outlined, without relief.
const CAPA = "border border-campo bg-transparent shadow-none aria-[current=page]:border-tinta"

interface Propiedades {
  filtros: FiltrosDeTemas
  /** Every network's pillars and layers; the row shows the chosen network's. */
  pilares: readonly PilarDeRed[]
  /** Topics of the network and pillar with nothing out there yet. */
  sinTratar: number
}

/**
 * Coni's row (spec 2026-11-04, part 15b, section 2): «Sin tratar», then one button per network, and under them the
 * chosen network's pillars, «Todos los pilares» first and the TDAH layer last. Every button is a link to its address,
 * so Back and a shared link work without scripts. At large text both lines wrap; the page never scrolls sideways.
 */
export function FilaDeTemas({ filtros, pilares, sinTratar }: Propiedades) {
  const opcionesDePilar = [
    { id: undefined, nombre: "Todos los pilares", esCapa: false },
    ...pilaresDeLaRed(pilares, filtros.red).map((pilar) => ({
      id: pilar.id,
      nombre: pilar.nombreCorto,
      esCapa: pilar.esCapa,
    })),
  ]
  return (
    <fieldset aria-label="Filtrar temas" className="m-0 grid min-w-0 gap-3 border-0 p-0">
      <ul className="flex min-w-0 flex-wrap gap-2">
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
        {REDES.map((red) => (
          <li key={red}>
            <Link
              href={hrefDeTemas(conRed(filtros, red))}
              scroll={false}
              aria-current={filtros.red === red ? "true" : undefined}
              className={cn(CHIP, RED_ELEGIDA)}
            >
              {NOMBRE_DE_RED[red]}
              <CaretDown aria-hidden="true" weight="bold" size={ICONO.chico} />
            </Link>
          </li>
        ))}
      </ul>
      <ul aria-label={`Pilares de ${NOMBRE_DE_RED[filtros.red]}`} className="flex min-w-0 flex-wrap gap-2">
        {opcionesDePilar.map(({ id, nombre, esCapa }) => {
          const actual = filtros.pilar === id
          return (
            <li key={id ?? "todos"}>
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
        })}
      </ul>
    </fieldset>
  )
}
```

- [ ] **Step 4: Run**

Run: `pnpm test:run tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts tests/unit/sin-slugs-de-pilar.test.ts && pnpm type && pnpm lint`
Expected: PASS (the design rules scan the new file: no hex, no em dash, Phosphor through the SSR entry, sizes through `ICONO`, `min-h-objetivo` via `FORMA_DE_CHIP`).

- [ ] **Step 5: Commit**

```bash
git add components/ui/clases-de-chip.ts "app/(app)/biblioteca/temas/fila-de-temas.tsx" tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx
git commit -m "Draw Coni's Temas row with the chosen network's pillars" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: `RecordarRed`

**Files:**
- Create: `app/(app)/biblioteca/temas/recordar-red.tsx`
- Create: `tests/unit/biblioteca-recordar-red.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/biblioteca-recordar-red.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { recordarRedAccion } = vi.hoisted(() => ({
  recordarRedAccion: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ recordarRedAccion }))

import { RecordarRed } from "@/app/(app)/biblioteca/temas/recordar-red"

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

describe("RecordarRed", () => {
  it("records the network on screen after mount when it differs from the stored one", async () => {
    render(<RecordarRed red="instagram" recordada="linkedin" />)
    await waitFor(() => expect(recordarRedAccion).toHaveBeenCalledWith({ red: "instagram" }))
    expect(recordarRedAccion).toHaveBeenCalledTimes(1)
  })

  it("records the first network too, when nothing is stored yet", async () => {
    render(<RecordarRed red="linkedin" recordada={null} />)
    await waitFor(() => expect(recordarRedAccion).toHaveBeenCalledWith({ red: "linkedin" }))
  })

  it("writes nothing when the network on screen is the stored one", () => {
    const { rerender } = render(<RecordarRed red="linkedin" recordada="linkedin" />)
    rerender(<RecordarRed red="linkedin" recordada="linkedin" />)
    expect(recordarRedAccion).not.toHaveBeenCalled()
  })

  it("shows nothing when it fails, but logs the refusal and the error", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined)
    recordarRedAccion.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    const { container } = render(<RecordarRed red="instagram" recordada={null} />)
    await waitFor(() =>
      expect(consola).toHaveBeenCalledWith("No pude recordar la red instagram: Esta app es solo para Coni."),
    )
    expect(container).toBeEmptyDOMElement()
    recordarRedAccion.mockRejectedValueOnce(new Error("sin red"))
    render(<RecordarRed red="linkedin" recordada={null} />)
    await waitFor(() => expect(consola).toHaveBeenCalledWith("No pude recordar la red linkedin", expect.any(Error)))
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test:run tests/unit/biblioteca-recordar-red.test.tsx`
Expected: FAIL: `Failed to resolve import "@/app/(app)/biblioteca/temas/recordar-red"`.

- [ ] **Step 3: Implement**

Create `app/(app)/biblioteca/temas/recordar-red.tsx`:

```tsx
"use client"

import { useEffect } from "react"
import type { Red } from "@/lib/dominio/pilares"
import { recordarRedAccion } from "../acciones"

/**
 * Temas opens on the last network Coni used (spec 2026-11-04, part 15b). After mount, never during the server render,
 * a network on screen that is not the stored one is recorded. It is a convenience: a failure shows nothing, but it is
 * logged.
 */
export function RecordarRed({ red, recordada }: { red: Red; recordada: Red | null }) {
  useEffect(() => {
    if (red === recordada) return
    recordarRedAccion({ red }).then(
      (resultado) => {
        if (!resultado.ok) console.error(`No pude recordar la red ${red}: ${resultado.error}`)
      },
      (error: unknown) => console.error(`No pude recordar la red ${red}`, error),
    )
  }, [red, recordada])
  return null
}
```

- [ ] **Step 4: Run**

Run: `pnpm test:run tests/unit/biblioteca-recordar-red.test.tsx tests/unit/diseno-reglas.test.ts && pnpm type && pnpm lint && head -1 "app/(app)/biblioteca/temas/recordar-red.tsx"`
Expected: PASS; `head` prints `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/recordar-red.tsx" tests/unit/biblioteca-recordar-red.test.tsx
git commit -m "Record the network Temas shows after it opens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The switch: Más filtros, the table, the panel and the page

**Files:**
- Modify: `app/(app)/biblioteca/temas/mas-filtros-de-temas.tsx` (rewrite)
- Modify: `app/(app)/biblioteca/temas/tabla-de-temas.tsx`, `app/(app)/biblioteca/temas/panel-de-tema.tsx` (import path)
- Modify: `app/(app)/biblioteca/temas/page.tsx` (rewrite)
- Modify: `app/(app)/biblioteca/formulario-de-filtros.tsx` (rewrite, Materiales only)
- Modify: `lib/dominio/biblioteca/filtros-de-temas.ts` (rewrite, the old model leaves)
- Delete: `app/(app)/biblioteca/temas/filtros-de-cobertura.tsx`
- Modify: `tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx` (rewrite), `tests/unit/biblioteca-filtros-de-temas.test.ts` (rewrite), `tests/unit/biblioteca-temas-piezas.test.tsx`, `tests/unit/biblioteca-pagina-temas.test.tsx`

- [ ] **Step 1: Write the failing tests**

1. Replace `tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx` with:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn() }) }))

import { FormularioDeFiltros } from "@/app/(app)/biblioteca/formulario-de-filtros"
import { MasFiltrosDeTemas } from "@/app/(app)/biblioteca/temas/mas-filtros-de-temas"

const PILAR = "11111111-2222-4333-8444-555555555555"

beforeEach(() => vi.clearAllMocks())

describe("MasFiltrosDeTemas", () => {
  it("folds «Ya los traté» and «Un solo autor» as links with their counts, no zeros, keeping network and pillar", () => {
    const { container } = render(
      <MasFiltrosDeTemas
        filtros={{ red: "instagram", pilar: PILAR, sinTratar: true }}
        conteos={{ sinTratar: 2, tratados: 0, unAutor: 1 }}
      />,
    )
    expect(screen.getByText("Más filtros")).toBeInTheDocument()
    expect(container.querySelector("details")).not.toHaveAttribute("open")
    const lista = screen.getByRole("list", { name: "Más filtros de temas" })
    expect(
      within(lista)
        .getAllByRole("link")
        .map((enlace) => enlace.textContent),
    ).toEqual(["Ya los traté", "Un solo autor · 1"])
    // «Ya los traté» is the opposite of «Sin tratar» in the same network: choosing it clears the other.
    expect(within(lista).getByRole("link", { name: "Ya los traté" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?red=instagram&pilar=${PILAR}&tratados=1`,
    )
    expect(within(lista).getByRole("link", { name: "Un solo autor · 1" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?red=instagram&pilar=${PILAR}&sin-tratar=1&un-autor=1`,
    )
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("with a switch on comes open, says how many, marks it and takes it out in one tap", () => {
    const { container } = render(
      <MasFiltrosDeTemas filtros={{ red: "linkedin", unAutor: true }} conteos={{ sinTratar: 2, tratados: 1, unAutor: 2 }} />,
    )
    expect(screen.getByText("Más filtros · 1")).toBeInTheDocument()
    expect(container.querySelector("details")).toHaveAttribute("open")
    const solo = screen.getByRole("link", { name: "Un solo autor · 2" })
    expect(solo).toHaveAttribute("aria-current", "page")
    expect(solo).toHaveAttribute("href", "/biblioteca/temas?red=linkedin")
    expect(screen.getByRole("link", { name: "Ya los traté · 1" })).not.toHaveAttribute("aria-current")
  })
})

describe("FormularioDeFiltros", () => {
  it("sends Materiales' filters to Materiales' own address", () => {
    const { container } = render(
      <FormularioDeFiltros>
        <input type="hidden" name="estado" value="listo" />
      </FormularioDeFiltros>,
    )
    const formulario = container.querySelector("form")
    if (!formulario) throw new Error("Falta el formulario")
    expect(formulario).toHaveAttribute("action", "/biblioteca")
    fireEvent.submit(formulario)
    expect(push).toHaveBeenCalledWith("/biblioteca?estado=listo", { scroll: false })
  })
})
```

2. Replace `tests/unit/biblioteca-filtros-de-temas.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import {
  AVISO_TRAS_MOSTRAR,
  AVISO_TRAS_OCULTAR,
  AVISO_TRAS_OCULTAR_LA_ULTIMA,
  destinoTrasOcultar,
  hrefDeTema,
  hrefTrasMostrar,
  hrefTrasOcultar,
  leerIdeaMostrada,
  leerIdeaOculta,
} from "@/lib/dominio/biblioteca/filtros-de-temas"

const TEMA = "33333333-2222-4333-8444-555555555555"
const IDEA = "44444444-2222-4333-8444-555555555555"

describe("the addresses of Temas", () => {
  it("leads to a topic's page", () => {
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

describe("destinoTrasOcultar", () => {
  it("keeps an address of the Biblioteca, with its note", () => {
    expect(destinoTrasOcultar(`/biblioteca/temas/${TEMA}?oculta=${IDEA}`)).toBe(
      `/biblioteca/temas/${TEMA}?oculta=${IDEA}`,
    )
    expect(destinoTrasOcultar(`/biblioteca/temas?oculta=${IDEA}`)).toBe(`/biblioteca/temas?oculta=${IDEA}`)
    expect(destinoTrasOcultar(`/biblioteca/autores/${TEMA}?mostrada=${IDEA}`)).toBe(
      `/biblioteca/autores/${TEMA}?mostrada=${IDEA}`,
    )
  })

  it.each([
    ["an external address", "https://evil.example/biblioteca/temas"],
    ["a protocol-relative address", "//evil.example/biblioteca/temas"],
    ["a doubled slash inside", "/biblioteca//evil.example"],
    ["a backslash", "/biblioteca/\\evil.example"],
    ["a scheme", "javascript:alert(1)"],
    ["a climb out", "/biblioteca/../ingreso"],
    ["an encoded climb out", "/biblioteca/%2e%2e/ingreso"],
    ["another section", "/agenda"],
    ["the section's prefix without its slash", "/bibliotecas/temas"],
    ["a relative path", "biblioteca/temas"],
    ["an empty address", ""],
    ["something that is not text", 42],
  ])("falls back to the Temas list for %s, so it never becomes an open redirect", (_, destino) => {
    expect(destinoTrasOcultar(destino)).toBe("/biblioteca/temas")
  })
})

describe("after Mostrar", () => {
  it("goes back to the author with the idea in the address, and says where it went (deviation 2)", () => {
    expect(hrefTrasMostrar(TEMA, IDEA)).toBe(`/biblioteca/autores/${TEMA}?mostrada=${IDEA}`)
    expect(leerIdeaMostrada({ mostrada: IDEA })).toBe(IDEA)
    expect(leerIdeaMostrada({ mostrada: "1" })).toBeNull()
    expect(leerIdeaMostrada({})).toBeNull()
    expect(AVISO_TRAS_MOSTRAR).toBe("La volví a mostrar. Está en «Sin tema todavía».")
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

3. In `tests/unit/biblioteca-temas-piezas.test.tsx`, the `TablaDeTemas` test renders and expects

```tsx
    render(
      <TablaDeTemas temas={[carga, pausas]} filtros={{ red: "linkedin", tratados: true, pilar: PILAR }} seleccion={CARGA} />,
    )
```

```ts
    expect(fila).toHaveAttribute("href", `/biblioteca/temas?red=linkedin&pilar=${PILAR}&tratados=1&t=${CARGA}`)
```

and the `PanelDeTema` test renders `<PanelDeTema tema={carga} filtros={{ red: "linkedin", tratados: true }} />` and expects `cerrar` to have `href` `"/biblioteca/temas?red=linkedin&tratados=1"`.

4. In `tests/unit/biblioteca-pagina-temas.test.tsx`, replace everything from the first line through the end of `describe("the Temas page", ...)` (the line before `const UNA = ...`) with:

```tsx
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    listarTemas: vi.fn(async (..._: unknown[]): Promise<unknown[]> => []),
    listarPilaresDeTemas: vi.fn(async (): Promise<unknown[]> => []),
    leerUltimaRed: vi.fn(async (): Promise<unknown> => null),
    leerTema: vi.fn(async (): Promise<unknown> => null),
    destinoDeTema: vi.fn(async (): Promise<string | null> => null),
    leerPilaresDeTema: vi.fn(
      async (): Promise<unknown> => ({
        linkedin: { principal: null, secundarios: [], capa: null },
        instagram: { principal: null, secundarios: [], capa: null },
      }),
    ),
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
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  unirAutoresAccion: vi.fn(),
  ocultarIdeaAccion: vi.fn(),
  cambiarPilaresAccion: vi.fn(),
  recordarRedAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import DetalleDeTema from "@/app/(app)/biblioteca/temas/[id]/page"
import { PilaresDelTema } from "@/app/(app)/biblioteca/temas/[id]/pilares-del-tema"
import { FilaDeTemas } from "@/app/(app)/biblioteca/temas/fila-de-temas"
import { MasFiltrosDeTemas } from "@/app/(app)/biblioteca/temas/mas-filtros-de-temas"
import Temas from "@/app/(app)/biblioteca/temas/page"
import { PanelDeTema } from "@/app/(app)/biblioteca/temas/panel-de-tema"
import { RecordarRed } from "@/app/(app)/biblioteca/temas/recordar-red"
import { TarjetaDeTema } from "@/app/(app)/biblioteca/temas/tarjeta-de-tema"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { AVISO_TRAS_OCULTAR, AVISO_TRAS_OCULTAR_LA_ULTIMA } from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { IdeaLeida } from "@/lib/dominio/biblioteca/ideas"

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
const PILARES = [
  { id: PILAR, slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", red: "linkedin", esCapa: false },
  { id: OTRO, slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram", esCapa: false },
]
const carga = {
  id: CARGA,
  nombre: "Carga mental",
  descripcion: null,
  pilarId: PILAR,
  ideas: 3,
  autores: 2,
  tratado: true,
}
const pausas = {
  id: PAUSAS,
  nombre: "Pausas",
  descripcion: null,
  pilarId: null,
  ideas: 1,
  autores: 1,
  tratado: false,
}
const conParams = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) })
const textos = (arbol: Elemento[]) =>
  arbol.map((elemento) => elemento.props.children).filter((c) => typeof c === "string")
const ids = (arbol: Elemento[]) =>
  arbol.filter((elemento) => elemento.type === TarjetaDeTema).map((tarjeta) => (tarjeta.props.tema as { id: string }).id)

beforeEach(() => vi.clearAllMocks())

describe("the Temas page", () => {
  beforeEach(() => {
    datos.listarPilaresDeTemas.mockResolvedValue(PILARES)
    datos.leerUltimaRed.mockResolvedValue(null)
  })

  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Temas(conParams({}))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.listarTemas).not.toHaveBeenCalled()
    expect(datos.listarPilaresDeTemas).not.toHaveBeenCalled()
    expect(datos.leerUltimaRed).not.toHaveBeenCalled()
  })

  it("opens on the stored network, LinkedIn when none, and hands RecordarRed the shown and the stored one", async () => {
    esConi.valor = true
    let arbol = elementos(await Temas(conParams({})))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { red: "linkedin", pilar: undefined })
    expect(arbol.find((elemento) => elemento.type === RecordarRed)?.props).toEqual({ red: "linkedin", recordada: null })

    datos.leerUltimaRed.mockResolvedValue("instagram")
    arbol = elementos(await Temas(conParams({})))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { red: "instagram", pilar: undefined })
    expect(arbol.find((elemento) => elemento.type === RecordarRed)?.props).toEqual({
      red: "instagram",
      recordada: "instagram",
    })

    arbol = elementos(await Temas(conParams({ red: "linkedin" })))
    expect(arbol.find((elemento) => elemento.type === RecordarRed)?.props).toEqual({
      red: "linkedin",
      recordada: "instagram",
    })
  })

  it("narrows by a pillar of the chosen network, ignores one of the other, and gives 15a's ?pilar= its network", async () => {
    esConi.valor = true
    await Temas(conParams({ red: "linkedin", pilar: PILAR }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { red: "linkedin", pilar: PILAR })
    await Temas(conParams({ red: "linkedin", pilar: OTRO }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { red: "linkedin", pilar: undefined })
    await Temas(conParams({ pilar: OTRO }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { red: "instagram", pilar: OTRO })
  })

  it("shows the topics of the switches on, counting every switch over the network and pillar's topics", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga, pausas])
    const arbol = elementos(await Temas(conParams({ red: "linkedin", "sin-tratar": "1" })))
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBeNull()
    expect(ids(arbol)).toEqual([PAUSAS])
    expect(arbol.find((elemento) => elemento.type === FilaDeTemas)?.props).toMatchObject({
      filtros: { red: "linkedin", sinTratar: true },
      pilares: PILARES,
      sinTratar: 1,
    })
    expect(arbol.find((elemento) => elemento.type === MasFiltrosDeTemas)?.props.conteos).toEqual({
      sinTratar: 1,
      tratados: 1,
      unAutor: 1,
    })
  })

  it("reads batch 3's ?cobertura= as its switch", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga, pausas])
    expect(ids(elementos(await Temas(conParams({ cobertura: "tratados" }))))).toEqual([CARGA])
  })

  it("says why the list is empty, with filters and without", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([pausas])
    expect(textos(elementos(await Temas(conParams({ tratados: "1" }))))).toContain(
      "Ningún tema coincide con esos filtros.",
    )
    datos.listarTemas.mockResolvedValueOnce([])
    expect(textos(elementos(await Temas(conParams({ red: "instagram" }))))).toContain(
      "Los temas aparecen solos cuando varias ideas sacadas hablan de lo mismo. Sube más material de distintos autores.",
    )
  })

  it("says the note after hiding a topic's last idea, and opens the chosen topic in the side panel", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga])
    const arbol = elementos(await Temas(conParams({ oculta: IDEA, t: CARGA })))
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBe(AVISO_TRAS_OCULTAR_LA_ULTIMA)
    // A new page: the focus the button gave the old note is gone, so the note takes it on arrival.
    expect(arbol.find((elemento) => elemento.type === TrasElAviso)?.props).toEqual({ parametro: "oculta" })
    expect(arbol.find((elemento) => elemento.type === PanelDeTema)?.props.tema).toEqual(carga)
  })

  it("has nothing to do after the note when there is none", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga])
    expect(elementos(await Temas(conParams({}))).some((elemento) => elemento.type === TrasElAviso)).toBe(false)
  })
})
```

(The rest of the file, `const UNA = ...` and `describe("a topic's page", ...)`, stays as it is.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test:run tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx tests/unit/biblioteca-filtros-de-temas.test.ts tests/unit/biblioteca-temas-piezas.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx`
Expected: FAIL: `MasFiltrosDeTemas` still draws the pillar select (no list "Más filtros de temas"); the table and panel write `?pilar=...&cobertura=...`; the page never calls `leerUltimaRed` and draws `FiltrosDeCobertura`, not `FilaDeTemas`. (`FormularioDeFiltros`' Materiales test and `biblioteca-filtros-de-temas.test.ts` pass already: they only lost tests.)

- [ ] **Step 3: Implement**

1. Replace `app/(app)/biblioteca/temas/mas-filtros-de-temas.tsx` with:

```tsx
import { Check, Funnel } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { CHIP_ELEGIDO, FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import {
  alternarTratados,
  alternarUnAutor,
  type ConteosDeTemas,
  type FiltrosDeTemas,
  hrefDeTemas,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import { cn } from "@/lib/utils"

/**
 * Coni's «Más filtros» (spec 2026-11-04, part 15b): «Ya los traté» in the chosen network, the opposite of «Sin tratar»,
 * and «Un solo autor». Links like the row, folded behind a chip; open when one is on.
 */
export function MasFiltrosDeTemas({ filtros, conteos }: { filtros: FiltrosDeTemas; conteos: ConteosDeTemas }) {
  const opciones = [
    {
      clave: "tratados",
      texto: conCuenta("Ya los traté", conteos.tratados),
      actual: filtros.tratados === true,
      href: hrefDeTemas(alternarTratados(filtros)),
    },
    {
      clave: "un-autor",
      texto: conCuenta("Un solo autor", conteos.unAutor),
      actual: filtros.unAutor === true,
      href: hrefDeTemas(alternarUnAutor(filtros)),
    },
  ]
  const activos = opciones.filter((opcion) => opcion.actual).length
  return (
    <MasOpciones
      titulo={activos === 0 ? "Más filtros" : `Más filtros · ${activos}`}
      forma="boton"
      icono={<Funnel aria-hidden="true" size={ICONO.chico} />}
      abiertaAlInicio={activos > 0}
      className="[&>summary]:w-fit [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:text-meta"
    >
      <ul aria-label="Más filtros de temas" className="flex min-w-0 flex-wrap gap-2">
        {opciones.map(({ clave, texto, actual, href }) => (
          <li key={clave}>
            <Link
              href={href}
              scroll={false}
              aria-current={actual ? "page" : undefined}
              className={cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP, CHIP_ELEGIDO)}
            >
              {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
              {texto}
            </Link>
          </li>
        ))}
      </ul>
    </MasOpciones>
  )
}
```

2. In `app/(app)/biblioteca/temas/tabla-de-temas.tsx` line 2 and in `app/(app)/biblioteca/temas/panel-de-tema.tsx` line 4, the filters come from the new module:
   - `tabla-de-temas.tsx`: `import { type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/fila-de-temas"`.
   - `panel-de-tema.tsx`: `import { type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/fila-de-temas"` and `import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"`.

3. Replace `app/(app)/biblioteca/temas/page.tsx` with:

```tsx
import { Panel } from "@/components/ui/panel"
import { leerUltimaRed, listarPilaresDeTemas, listarTemas } from "@/lib/datos/biblioteca"
import {
  contarFiltros,
  filtrarTemas,
  hayFiltrosDeTemas,
  leerFiltrosDeTemas,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { AVISO_TRAS_OCULTAR_LA_ULTIMA, leerIdeaOculta } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeIdeas } from "../aviso-de-ideas"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { TrasElAviso } from "../tras-el-aviso"
import { FilaDeTemas } from "./fila-de-temas"
import { MasFiltrosDeTemas } from "./mas-filtros-de-temas"
import { PanelDeTema } from "./panel-de-tema"
import { RecordarRed } from "./recordar-red"
import { TablaDeTemas } from "./tabla-de-temas"
import { TarjetaDeTema } from "./tarjeta-de-tema"

export default async function Temas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const [pilares, ultimaRed] = await Promise.all([listarPilaresDeTemas(db), leerUltimaRed(db)])
  const filtros = leerFiltrosDeTemas(params, { pilares, ultimaRed })
  const seleccion = leerSeleccion(params, "t")
  // The network and the pillar narrow what is read; the switches split it, so their counts are the pillar's.
  const temas = await listarTemas(db, { red: filtros.red, pilar: filtros.pilar })
  const visibles = filtrarTemas(temas, filtros)
  const conteos = contarFiltros(temas)
  const elegido = seleccion ? (temas.find((tema) => tema.id === seleccion) ?? null) : null
  const ocultaLaUltima = leerIdeaOculta(params) !== null

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <RecordarRed red={filtros.red} recordada={ultimaRed} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
        <AvisoDeIdeas texto={ocultaLaUltima ? AVISO_TRAS_OCULTAR_LA_ULTIMA : null} />
        {ocultaLaUltima ? <TrasElAviso parametro="oculta" /> : null}
        <NavDeBiblioteca actual="temas" />
        <div className="grid min-w-0 gap-3">
          <FilaDeTemas filtros={filtros} pilares={pilares} sinTratar={conteos.sinTratar} />
          <MasFiltrosDeTemas filtros={filtros} conteos={conteos} />
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

4. Replace `app/(app)/biblioteca/formulario-de-filtros.tsx` with:

```tsx
"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { hrefDeLista, leerFiltros, RUTA_DE_MATERIALES } from "@/lib/dominio/biblioteca/filtros"

type Params = Record<string, string>

/**
 * Materiales' «Más filtros»: a GET form that works without scripts; with them, it goes to Materiales' own address, so
 * an empty select ("Todos") stays out of the URL and the order of the params is the one every link uses. Temas filters
 * with links only (spec 2026-11-04, part 15b).
 */
export function FormularioDeFiltros({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <form
      method="get"
      action={RUTA_DE_MATERIALES}
      className={className}
      onSubmit={(evento) => {
        evento.preventDefault()
        const params: Params = {}
        for (const [clave, valor] of new FormData(evento.currentTarget)) {
          if (typeof valor === "string") params[clave] = valor
        }
        router.push(hrefDeLista(leerFiltros(params)), { scroll: false })
      }}
    >
      {children}
    </form>
  )
}
```

5. Replace `lib/dominio/biblioteca/filtros-de-temas.ts` with (the filter model now lives in `fila-de-temas.ts`; everything below is unchanged from the current file):

```ts
import { z } from "zod"
import { hrefDeAutor } from "./autores"

export const RUTA_DE_TEMAS = "/biblioteca/temas"
export const hrefDeTema = (id: string) => `${RUTA_DE_TEMAS}/${id}`

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

export const AVISO_TRAS_OCULTAR = "La oculté. La puedes volver a mostrar desde su autor."
export const AVISO_TRAS_OCULTAR_LA_ULTIMA =
  "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor."

/**
 * Where Ocultar goes (D6). The hidden idea leaves its topic, and a topic left without ideas is deleted by the database
 * (`recalcular_tema`), so the last one goes to the list. The count is the topic's ideas before hiding; the idea's id
 * makes each address new.
 */
export function hrefTrasOcultar(temaId: string, ideaId: string, ideasAntesDeOcultar: number): string {
  return ideasAntesDeOcultar > 1 ? `${hrefDeTema(temaId)}?oculta=${ideaId}` : `${RUTA_DE_TEMAS}?oculta=${ideaId}`
}

// A path inside the Biblioteca and a plain query: no scheme, host, dot, backslash, percent or doubled slash passes.
const DESTINO_DE_LA_BIBLIOTECA = /^\/biblioteca(?:\/[A-Za-z0-9_-]+)+(?:\?[A-Za-z0-9_=&-]*)?$/

/**
 * Where the server goes after Ocultar or Mostrar. The address comes from the client, so only one of the Biblioteca's
 * own is kept; anything else lands on the Temas list, never on another site.
 */
export function destinoTrasOcultar(destino: unknown): string {
  return typeof destino === "string" && DESTINO_DE_LA_BIBLIOTECA.test(destino) ? destino : RUTA_DE_TEMAS
}

/** The idea just hidden (`?oculta=<id>`), so the page says its note; anything else is no note. */
export function leerIdeaOculta(params: Params): string | null {
  const leida = z.uuid().safeParse(primero(params.oculta)?.trim())
  return leida.success ? leida.data : null
}

export const AVISO_TRAS_MOSTRAR = "La volví a mostrar. Está en «Sin tema todavía»."

/**
 * Where Mostrar goes: back to the author, with the idea in the address so the page says its note. Shown again, the idea
 * has no topic until the next maintenance run places it (deviation 2).
 */
export const hrefTrasMostrar = (autorId: string, ideaId: string) => `${hrefDeAutor(autorId)}?mostrada=${ideaId}`

/** The idea just shown again (`?mostrada=<id>`); anything else is no note. */
export function leerIdeaMostrada(params: Params): string | null {
  const leida = z.uuid().safeParse(primero(params.mostrada)?.trim())
  return leida.success ? leida.data : null
}
```

6. Delete the old chips: `git rm "app/(app)/biblioteca/temas/filtros-de-cobertura.tsx"`.

- [ ] **Step 4: Run**

Run: `pnpm test:run && pnpm type && pnpm lint && head -1 "app/(app)/biblioteca/formulario-de-filtros.tsx" && grep -rn --exclude=database.types.ts "filtros-de-cobertura\|FiltrosDeCobertura\|contarCoberturas\|filtrarPorCobertura\|seccion=\"temas\"\|temas_de_pilar" app lib components`
Expected: every unit test PASSES (the whole suite, since the data and shapes changed); type and lint pass; `head` prints `"use client"`; the `grep` prints nothing and so exits 1, which is the pass here (the app no longer calls `temas_de_pilar`; the generated types still list it, hence the exclude).

- [ ] **Step 5: See it in the browser once**

Run: `pnpm dev`, sign in as Coni locally and open `http://localhost:3000/biblioteca/temas`. Check: LinkedIn pressed with its four pillars under it, "Todos los pilares" marked; tapping Instagram shows its three pillars and "Capa TDAH" outlined last; "Sin tratar" toggles; "Más filtros" has two chips and no select; Back undoes each tap; the browser console shows no "No pude recordar la red". Stop the server.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/biblioteca/temas/mas-filtros-de-temas.tsx" "app/(app)/biblioteca/temas/tabla-de-temas.tsx" \
  "app/(app)/biblioteca/temas/panel-de-tema.tsx" "app/(app)/biblioteca/temas/page.tsx" \
  "app/(app)/biblioteca/formulario-de-filtros.tsx" lib/dominio/biblioteca/filtros-de-temas.ts \
  tests/unit/biblioteca-filtros-de-temas-pantalla.test.tsx tests/unit/biblioteca-filtros-de-temas.test.ts \
  tests/unit/biblioteca-temas-piezas.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx
git commit -m "Put Coni's network row on Temas and move the coverage chips under Más filtros" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint, phase 3:** the page opens on the stored network (LinkedIn the first time), records a different one after mount, the row and its pillars are links with the state in the address, the old addresses still read, and every unit test passes.

# Phase 4: end to end and visuals

### Task 11: The scene and Coni's acceptance list

**Files:**
- Modify: `tests/e2e/biblioteca-escena.ts`
- Create: `tests/e2e/biblioteca-temas-por-red.spec.ts`
- Create: `tests/e2e/biblioteca-temas-por-red.escritorio.ts`
- Modify: `tests/e2e/biblioteca-temas.spec.ts`, `tests/e2e/biblioteca-enlaces.spec.ts`, `tests/e2e/biblioteca-pilares.spec.ts`, `tests/e2e/biblioteca-pilares.escritorio.ts`, `tests/e2e/biblioteca-autores-temas.escritorio.ts`

- [ ] **Step 1: Give the scene a published topic and a topic per network**

In `tests/e2e/biblioteca-escena.ts`:

1. After `export const PILAR_SECUNDARIO = "Diagnóstico doble"` add:

```ts
/** Descanso digital's pillar in Instagram, and the layer Pausas activas carries (spec 2026-11-04, part 15b). */
export const PILAR_DE_INSTAGRAM = "Inteligencia emocional"
export const CAPA = "Capa TDAH"
/** The piece that went out on LinkedIn with Carga mental: vaciarBiblioteca finds it by this title. */
const TITULO_DE_LA_PIEZA_PUBLICADA = "Repartir la carga mental, en LinkedIn"
```

2. `vaciarBiblioteca` starts with:

```ts
  // The scene's published piece points at an engine idea: it goes before vaciarMotor deletes that idea.
  await pool.query("delete from public.piezas where titulo = $1", [TITULO_DE_LA_PIEZA_PUBLICADA])
  // Temas opens on the stored network: every scene starts with none, as `pnpm db:reset` leaves it.
  await pool.query("update public.ajustes set ultima_red = null")
```

3. In the doc comment of `sembrarAutoresYTemas`, the "Topics:" line becomes:

```ts
 *   Topics: Carga mental 3 ideas · 2 autores (out on LinkedIn only, pilar) · Descanso digital 2 · 1 (pilar in
 *   Instagram) · Pausas activas 1 · 1 (Capa TDAH).
```

4. In `sembrarAutoresYTemas`, right before `return {`, add:

```ts
  // Each network's row has a topic to list: Descanso digital's pillar in Instagram, the TDAH layer on Pausas activas.
  await pool.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select f.tema_id, c.id, c.red, c.es_capa, case when c.es_capa then null else 'alta' end, 'coni'
       from (values ($1::uuid, $2::text), ($3::uuid, $4::text)) as f (tema_id, nombre_corto)
       join public.categorias c on c.nombre_corto = f.nombre_corto and c.red is not null and c.activa`,
    [deUnAutor, PILAR_DE_INSTAGRAM, pausas, CAPA],
  )
  // Carga mental went out on LinkedIn only, uploaded by hand: «Ya lo traté» there, «Sin tratar» on Instagram. The only
  // path from a piece to a topic is its idea's theory. The piece stays in `idea`, so Inicio and the calendar never
  // list it.
  const teoria = await uno(
    "insert into public.teorias (titulo, tesis, origen, temas) values ($1, $2, 'motor', $3::uuid[]) returning id",
    ["Nombrar la carga mental", "Repartirla empieza por nombrarla.", [carga]],
  )
  const idea = await uno(
    `insert into public.ideas (pilar, gancho, formato, fuerza, estado, origen, teoria_id)
     select c.slug, $1, 'Carrusel', 'alta', 'usada', 'motor', $2
       from public.categorias c where c.nombre_corto = $3 and c.red is not null and c.activa
     returning id`,
    ["La carga mental se reparte", teoria, PILAR],
  )
  const pieza = await uno("insert into public.piezas (idea_id, titulo) values ($1, $2) returning id", [
    idea,
    TITULO_DE_LA_PIEZA_PUBLICADA,
  ])
  await pool.query(
    "insert into public.publicaciones (pieza_id, destino, estado, marcado_en) values ($1, 'linkedin', 'subido_a_mano', now())",
    [pieza],
  )
```

- [ ] **Step 2: Write the phone acceptance spec**

Create `tests/e2e/biblioteca-temas-por-red.spec.ts`:

```ts
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, capturar, conLetraGrande, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  CAPA,
  OTRO_TEMA,
  PILAR,
  PILAR_DE_INSTAGRAM,
  sembrarAutoresYTemas,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

// Coni's acceptance list (respuesta-coni-temas-pilares-2026-11-04.md, part 1, section 7), without 15c's buttons.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
})

const fila = (page: Page) => page.getByRole("group", { name: "Filtrar temas" })
const red = (page: Page, nombre: "LinkedIn" | "Instagram") => fila(page).getByRole("link", { name: nombre, exact: true })
const pilaresDe = (page: Page, nombre: "LinkedIn" | "Instagram") => page.getByRole("list", { name: `Pilares de ${nombre}` })
const tarjetas = (page: Page) => page.getByRole("list", { name: "Temas" }).getByRole("listitem")
const UN_PILAR = "[0-9a-f-]{36}"

async function ultimaRed(): Promise<string | null> {
  const { rows } = await pool.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
  return rows[0]?.ultima_red ?? null
}

test("Temas opens on the last network she used, LinkedIn the first time, and remembers the one she picks", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas")
  await expect(red(page, "LinkedIn")).toHaveAttribute("aria-current", "true")
  await expect(red(page, "Instagram")).not.toHaveAttribute("aria-current")
  await expect.poll(ultimaRed).toBe("linkedin")

  await tocarHastaLlegar(page, red(page, "Instagram"), /\/biblioteca\/temas\?red=instagram(?:&v=\d+)?$/)
  await expect.poll(ultimaRed).toBe("instagram")
  await page.goto("/biblioteca/temas")
  await expect(red(page, "Instagram")).toHaveAttribute("aria-current", "true")
  await expect(pilaresDe(page, "Instagram")).toBeVisible()
  await expect(pilaresDe(page, "LinkedIn")).toHaveCount(0)
})

test("each network opens its own pillars in order, Capa TDAH last and only outlined; the same network again shows all", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=linkedin")
  await expect(pilaresDe(page, "LinkedIn").getByRole("link")).toHaveText([
    "Todos los pilares",
    "Diagnóstico doble",
    "Bienestar e impacto",
    "Psicología en la mesa",
    "Mujeres líderes",
  ])
  await tocarHastaLlegar(page, red(page, "Instagram"), /\?red=instagram(?:&v=\d+)?$/)
  const deInstagram = pilaresDe(page, "Instagram").getByRole("link")
  await expect(deInstagram).toHaveText([
    "Todos los pilares",
    "Game Over Impostora",
    "Mi nueva partida",
    "Inteligencia emocional",
    CAPA,
  ])
  await expect(pilaresDe(page, "LinkedIn")).toHaveCount(0)
  await expect(deInstagram.last()).toHaveCSS("box-shadow", "none")
  await expect(deInstagram.last()).toHaveCSS("border-top-style", "solid")
  expect(await deInstagram.nth(1).evaluate((enlace) => getComputedStyle(enlace).boxShadow)).not.toBe("none")
  await capturar(page, "temas-instagram")

  await tocarHastaLlegar(page, deInstagram.last(), new RegExp(`\\?red=instagram&pilar=${UN_PILAR}(?:&v=\\d+)?$`))
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(OTRO_TEMA)
  await tocarHastaLlegar(page, red(page, "Instagram"), /\?red=instagram(?:&v=\d+)?$/)
  await expect(tarjetas(page)).toHaveCount(3)
})

test("a pillar with «Sin tratar» shows only that pillar's topics with nothing out on that network", async ({ page }) => {
  await page.goto("/biblioteca/temas?red=linkedin")
  await tocarHastaLlegar(
    page,
    pilaresDe(page, "LinkedIn").getByRole("link", { name: PILAR, exact: true }),
    new RegExp(`\\?red=linkedin&pilar=${UN_PILAR}(?:&v=\\d+)?$`),
  )
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(TEMA_PRINCIPAL)
  await expect(tarjetas(page).nth(0)).toContainText("Ya lo traté")
  // Carga mental went out on LinkedIn: under its pillar nothing is untreated, and the chip drops its zero.
  await tocarHastaLlegar(
    page,
    fila(page).getByRole("link", { name: "Sin tratar", exact: true }),
    /&sin-tratar=1(?:&v=\d+)?$/,
  )
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
  await expect(fila(page).getByRole("link", { name: "Sin tratar", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  )

  // The switch stays on across networks; the pillar does not.
  await tocarHastaLlegar(page, red(page, "Instagram"), /\?red=instagram&sin-tratar=1(?:&v=\d+)?$/)
  await tocarHastaLlegar(
    page,
    pilaresDe(page, "Instagram").getByRole("link", { name: PILAR_DE_INSTAGRAM, exact: true }),
    new RegExp(`\\?red=instagram&pilar=${UN_PILAR}&sin-tratar=1(?:&v=\\d+)?$`),
  )
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(TEMA_DE_UN_AUTOR)
  // One tap off.
  await tocarHastaLlegar(
    page,
    fila(page).getByRole("link", { name: /^Sin tratar/ }),
    new RegExp(`\\?red=instagram&pilar=${UN_PILAR}(?:&v=\\d+)?$`),
  )
  await expect(fila(page).getByRole("link", { name: /^Sin tratar/ })).not.toHaveAttribute("aria-current")
})

test("a topic out on LinkedIn and not on Instagram is «sin tratar» on Instagram and not on LinkedIn", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=linkedin&sin-tratar=1")
  await expect(tarjetas(page)).toHaveCount(2)
  await expect(page.getByRole("list", { name: "Temas" })).not.toContainText(TEMA_PRINCIPAL)
  await page.goto("/biblioteca/temas?red=instagram&sin-tratar=1")
  await expect(tarjetas(page)).toHaveCount(3)
  await expect(tarjetas(page).filter({ hasText: TEMA_PRINCIPAL })).not.toContainText("Ya lo traté")
  await page.goto("/biblioteca/temas?red=linkedin")
  await expect(tarjetas(page).filter({ hasText: TEMA_PRINCIPAL })).toContainText("Ya lo traté")
})

test("under Más filtros «Ya los traté» clears «Sin tratar» and «Un solo autor» combines; old addresses still read", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=linkedin&sin-tratar=1")
  await page.getByText("Más filtros", { exact: true }).click()
  await tocarHastaLlegar(
    page,
    page.getByRole("link", { name: "Ya los traté · 1" }),
    /\?red=linkedin&tratados=1(?:&v=\d+)?$/,
  )
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(fila(page).getByRole("link", { name: /^Sin tratar/ })).not.toHaveAttribute("aria-current")
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()
  await tocarHastaLlegar(
    page,
    page.getByRole("link", { name: /^Un solo autor/ }),
    /\?red=linkedin&tratados=1&un-autor=1(?:&v=\d+)?$/,
  )
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
  await page.goBack()
  await expect(tarjetas(page)).toHaveCount(1)

  // Batch 3's ?cobertura= and 15a's ?pilar= without ?red.
  await page.goto("/biblioteca/temas?cobertura=un-autor")
  await expect(tarjetas(page)).toHaveCount(2)
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()
  const { rows } = await pool.query<{ id: string }>(
    "select id from public.categorias where nombre_corto = $1 and red is not null",
    [PILAR_DE_INSTAGRAM],
  )
  await page.goto(`/biblioteca/temas?pilar=${rows[0]?.id ?? ""}`)
  await expect(red(page, "Instagram")).toHaveAttribute("aria-current", "true")
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(TEMA_DE_UN_AUTOR)
  // An invalid value reads as absent: the stored network, no switch.
  await expect.poll(ultimaRed).toBe("instagram")
  await page.goto("/biblioteca/temas?red=youtube&sin-tratar=si")
  await expect(red(page, "Instagram")).toHaveAttribute("aria-current", "true")
  await expect(tarjetas(page)).toHaveCount(3)
})

test("the row passes WCAG 2.x AA, keeps 44 px targets and wraps at large text without sideways scroll", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=instagram")
  expect(await revisarConAxe(page, "temas en instagram")).toEqual([])
  await page.getByText("Más filtros", { exact: true }).click()
  await expect(page.getByRole("link", { name: /^Un solo autor/ })).toBeVisible()
  expect(await revisarConAxe(page, "temas con más filtros")).toEqual([])
  await conLetraGrande(page)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true)
  for (const enlace of await fila(page).getByRole("link").all()) {
    const nombre = (await enlace.textContent()) ?? ""
    expect((await enlace.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  expect(await revisarConAxe(page, "temas con letra grande")).toEqual([])
  await capturar(page, "temas-letra-grande", { completa: true })
})
```

- [ ] **Step 3: Write the desktop spec**

Create `tests/e2e/biblioteca-temas-por-red.escritorio.ts`:

```ts
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeAutoresYTemas, sembrarAutoresYTemas, TEMA_PRINCIPAL } from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("on the computer the row filters the table, the badge follows the network and the side panel keeps it", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=instagram&sin-tratar=1")
  const tabla = page.getByRole("table", { name: "Temas" })
  await expect(tabla.getByRole("row")).toHaveCount(4)
  await expect(tabla.getByRole("row", { name: new RegExp(TEMA_PRINCIPAL) })).not.toContainText("Ya lo traté")
  expect(await revisarConAxe(page, "temas en instagram en el computador")).toEqual([])

  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: TEMA_PRINCIPAL, exact: true }),
    new RegExp(`/biblioteca/temas\\?red=instagram&sin-tratar=1&t=${escena.carga}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: TEMA_PRINCIPAL })
  await expect(panel).not.toContainText("Ya lo traté")
  expect(await revisarConAxe(page, "temas en instagram con el panel")).toEqual([])
  await panel.getByRole("link", { name: "Cerrar el panel" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?red=instagram&sin-tratar=1(?:[?&]v=\d+)?$/)

  await page.goto("/biblioteca/temas?red=linkedin")
  await expect(tabla.getByRole("row", { name: new RegExp(TEMA_PRINCIPAL) })).toContainText("Ya lo traté")
})
```

- [ ] **Step 4: Run them to see them fail before the other specs follow**

Run: `pnpm test:e2e --project=app tests/e2e/biblioteca-temas-por-red.spec.ts tests/e2e/biblioteca-temas.spec.ts tests/e2e/biblioteca-enlaces.spec.ts tests/e2e/biblioteca-pilares.spec.ts`
Expected: the new spec PASSES (Tasks 1 to 10 already built the row). FAIL in the old specs: `biblioteca-temas.spec.ts` "the quick filters split by coverage" and "the pillar under Más filtros" (no "Todos" chip, no select), `biblioteca-enlaces.spec.ts` (looks for `getByLabel("Pilar")` and the "Todos" chip), `biblioteca-pilares.spec.ts` "Cambiar pilares changes the pillar..." (its helper uses the select).

- [ ] **Step 5: Make the older specs follow the row**

1. `tests/e2e/biblioteca-temas.spec.ts`: delete the tests "the quick filters split by coverage in one tap, live in the URL, and an unknown value reads as Todos" and "the pillar under Más filtros combines with the coverage, and its counts follow it" (the new spec covers both); delete the now unused `filtrosDe` function; the imports become

```ts
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna } from "./ayudas"
import {
  AUTORA,
  type EscenaDeAutoresYTemas,
  IDEA_DE_CONI,
  IDEA_QUE_SE_OCULTA,
  IDEA_UNICA_DE_PAUSAS,
  OTRO_TEMA,
  sembrarAutoresYTemas,
  sembrarTemasEnBucle,
  TEMA_DE_UN_AUTOR,
  TEMA_FUSIONADO,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"
```

(Its first test still expects "Ya lo traté" on Carga mental: the default network is LinkedIn, where it went out.)

2. `tests/e2e/biblioteca-enlaces.spec.ts`:
   - replace `await expect(page.getByLabel("Pilar")).toBeVisible()` with `await expect(page.getByRole("link", { name: /^Un solo autor/ })).toBeVisible()`;
   - in the 375 px test, replace the loop over `["Todos", "Sin tratar · 2", "Ya los traté · 1", "Un solo autor · 2"]` with

```ts
  for (const nombre of ["Sin tratar · 2", "LinkedIn", "Instagram", "Todos los pilares", "Bienestar e impacto"]) {
    const chip = filtros.getByRole("link", { name: nombre, exact: true })
    await expect(chip).toBeVisible()
    expect((await chip.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
```

3. `tests/e2e/biblioteca-pilares.spec.ts`: add `tocarHastaLlegar` to the import from `./ayudas`, and replace `filtrarPorPilar` with

```ts
async function filtrarPorPilar(page: Page, nombre: string) {
  await page.goto("/biblioteca/temas?red=linkedin")
  await tocarHastaLlegar(
    page,
    page.getByRole("list", { name: "Pilares de LinkedIn" }).getByRole("link", { name: nombre, exact: true }),
    /\?red=linkedin&pilar=[0-9a-f-]{36}(?:&v=\d+)?$/,
  )
}
```

4. `tests/e2e/biblioteca-pilares.escritorio.ts`: add `tocarHastaLlegar` to the import from `./ayudas`, and replace the four lines from `await page.goto("/biblioteca/temas")` to `await page.getByRole("button", { name: "Filtrar" }).click()` with

```ts
  await page.goto("/biblioteca/temas?red=instagram")
  await tocarHastaLlegar(
    page,
    page.getByRole("list", { name: "Pilares de Instagram" }).getByRole("link", { name: "Game Over Impostora", exact: true }),
    /\?red=instagram&pilar=[0-9a-f-]{36}(?:&v=\d+)?$/,
  )
```

5. `tests/e2e/biblioteca-autores-temas.escritorio.ts`, test "Temas is a table that keeps its filters...": `page.goto("/biblioteca/temas?cobertura=un-autor")` becomes `page.goto("/biblioteca/temas?red=linkedin&un-autor=1")`; the `tocarHastaLlegar` address becomes ``new RegExp(`/biblioteca/temas\\?red=linkedin&un-autor=1&t=${escena.deUnAutor}(?:&v=\\d+)?$`)``; the address after closing becomes `/\/biblioteca\/temas\?red=linkedin&un-autor=1(?:[?&]v=\d+)?$/`.

- [ ] **Step 6: Run the Biblioteca specs on both projects**

Run: `pnpm test:e2e --project=app tests/e2e/biblioteca-temas-por-red.spec.ts tests/e2e/biblioteca-temas.spec.ts tests/e2e/biblioteca-enlaces.spec.ts tests/e2e/biblioteca-pilares.spec.ts tests/e2e/biblioteca-autores.spec.ts && pnpm test:e2e --project=escritorio tests/e2e/biblioteca-temas-por-red.escritorio.ts tests/e2e/biblioteca-pilares.escritorio.ts tests/e2e/biblioteca-autores-temas.escritorio.ts --grep-invert visual`
Expected: PASS. (The desktop visual test is left out with `--grep-invert`; the visuals are Task 12.) Open `test-results/capturas/temas-instagram.png` and `test-results/capturas/temas-letra-grande.png` and check them by eye: Capa TDAH outlined last; at large text both lines wrap inside the screen.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca-temas-por-red.spec.ts tests/e2e/biblioteca-temas-por-red.escritorio.ts \
  tests/e2e/biblioteca-temas.spec.ts tests/e2e/biblioteca-enlaces.spec.ts tests/e2e/biblioteca-pilares.spec.ts \
  tests/e2e/biblioteca-pilares.escritorio.ts tests/e2e/biblioteca-autores-temas.escritorio.ts
git commit -m "Run Coni's acceptance list for the Temas row on the phone and the computer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Review captures for Federico, then stop

**Files:** none (captures go to `/tmp`, outside the repo)

- [ ] **Step 1: Confirm exactly the two Temas list baselines change**

Run: `pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "Autores and Temas on the phone"; pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts -g "visual"`
Expected: both tests FAIL on their Temas list comparison (`biblioteca-temas.png` on the phone, `biblioteca-temas-escritorio.png` on the desktop), after `biblioteca-autores` and `biblioteca-autor` matched. A test stops at its first mismatching screenshot, so the topic page (`biblioteca-tema`) is not compared here; Task 13 Step 1 confirms it did not move. If a failure names any other file, something else moved: stop and find it. This step writes no baseline (`git status` shows no snapshot changed).

- [ ] **Step 2: Write the review captures**

Run:

```bash
rm -rf /tmp/temas-por-red-visual
VISUAL_FINALES=/tmp/temas-por-red-visual pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "Autores and Temas on the phone"
VISUAL_FINALES=/tmp/temas-por-red-visual pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts -g "visual"
ls /tmp/temas-por-red-visual
```

Expected: both PASS (this mode compares nothing) and the folder holds `biblioteca-temas.png` and `biblioteca-temas-escritorio.png` among the others.

- [ ] **Step 3: STOP for Federico**

Send Federico these four images and wait: `/tmp/temas-por-red-visual/biblioteca-temas.png` (phone), `/tmp/temas-por-red-visual/biblioteca-temas-escritorio.png` (desktop, with the side panel), `test-results/capturas/temas-instagram.png` (Instagram open, Capa TDAH outlined last) and `test-results/capturas/temas-letra-grande.png` (large text). Say what to look at: the row `[ Sin tratar · 2 ] [ LinkedIn ▾ ] [ Instagram ▾ ]` with LinkedIn pressed, the four LinkedIn pillars under it with "Todos los pilares" marked, "Más filtros" closed under the row, "Ya lo traté" on Carga mental. **Do not start Task 13 until Federico answers OK in the conversation.** If he asks for changes, make them with a failing test first, run Task 11 Step 6 and this task again.

### Task 13: Take the two baselines (only after Federico's OK)

**Files:**
- Modify (baselines): `tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png`, `tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-temas-escritorio-escritorio-darwin.png`

- [ ] **Step 1: Retake them**

Run:

```bash
pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "Autores and Temas on the phone" --update-snapshots
pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts -g "visual" --update-snapshots
git status --short tests/e2e
```

Expected: `git status` lists exactly `M tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png` and `M tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-temas-escritorio-escritorio-darwin.png`. If any other snapshot changed, restore it with `git checkout -- <file>` and find why before going on.

- [ ] **Step 2: Compare them again without updating**

Run: `pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "biblioteca" && pnpm test:e2e --project=escritorio tests/e2e/biblioteca-autores-temas.escritorio.ts -g "visual"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-app-darwin.png \
  tests/e2e/biblioteca-autores-temas.escritorio.ts-snapshots/biblioteca-temas-escritorio-escritorio-darwin.png
git commit -m "Retake the Temas list baselines with the network row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Full gate

**Files:** none new (fixes only if a step fails, each with its own failing test first)

- [ ] **Step 1: Clean rebuild of the local DB from the migrations**

Run: `pnpm db:reset && pnpm db:types && git diff --exit-code lib/supabase/database.types.ts`
Expected: exit 0.

- [ ] **Step 2: Lint, types, build**

Run: `pnpm lint && pnpm type && pnpm build`
Expected: PASS.

- [ ] **Step 3: Every suite**

Run: `pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: PASS, all three (the E2E run includes every visual comparison and the specs that run after the Biblioteca ones, which must not see the scene's piece: it stays in `idea`).

- [ ] **Step 4: Guards of this feature**

Run:

```bash
pnpm test:run tests/unit/sin-slugs-de-pilar.test.ts tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts
grep -rn "—" "app/(app)/biblioteca/temas" lib/dominio/biblioteca/fila-de-temas.ts components/ui/clases-de-chip.ts
grep -rn --exclude=database.types.ts "temas_de_pilar" app lib components
grep -rn "temas_de_red\|temas_tratados\|ultima_red\|fila-de-temas\|recordarRed\|leerUltimaRed\|listarTemas" trigger lib/motor lib/ingesta lib/produccion lib/publicacion lib/metricas lib/mantenimiento lib/avisos
git diff origin/main --stat -- supabase/migrations
```

Expected: the tests pass; every `grep` prints nothing (no em dash; the app no longer calls `temas_de_pilar`; no Trigger task reaches a changed reader, so no Trigger deploy); the stat lists exactly the two new files `20261104000300_temas_tratados.sql` and `20261104000310_ultima_red.sql` and no modified one.

- [ ] **Step 5: Request review**

Use superpowers:requesting-code-review on the branch. Fix findings with a failing test first, one commit per fix.

## Release steps (listed, not executed by this plan)

Federico's standing authorization (memory "Salida a producción autorizada") covers steps 1 to 5 when its conditions hold (issue, green CI, reviews, dry-run); nothing here needs a Trigger deploy.

1. **Issue and CI.** The work is on issue #18 of the board (WAV-WaAreVision/projects/1, change 15, part 15b); the PR is open from `feat/temas-por-red`; CI is green; the code review is approved; Federico gave his OK on the captures (Task 12) and the two baselines were taken (Task 13).
2. **Read-only pre-checks on production** (Supabase SQL editor or `psql "$PROD_DB_URL"`):

```sql
select count(*) from public.publicaciones where estado in ('publicado', 'subido_a_mano');     -- Expected: 1 (LinkedIn).
select count(*) from information_schema.columns
 where table_schema = 'public' and table_name = 'ajustes' and column_name = 'ultima_red';     -- Expected: 0.
select to_regclass('public.temas_tratados');                                                    -- Expected: null.
select count(*) from pg_proc where proname = 'temas_de_red';                                    -- Expected: 0.
select count(*) from pg_proc where proname = 'temas_de_pilar';                                  -- Expected: 1 (stays).
```

3. **`supabase db push --dry-run`** against production. Expected: exactly `20261104000300_temas_tratados.sql` and `20261104000310_ultima_red.sql`. Then **`supabase db push`**. Neither changes an existing row.
4. **Merge the PR**, only after step 3 (Vercel publishes `main`). Between the push and the merge the old Vercel code keeps calling `temas_de_pilar`, which is why 15b keeps it.
5. **Live check:** confirm the new code is served (the Temas HTML for Coni contains "Todos los pilares"; Vercel's alias lags 15 to 45 s; if Coni's screen looks old, it is her cache: hard refresh). Then, read-only: `select t.nombre, x.red from public.temas_tratados x join public.temas t on t.id = x.tema_id;` lists the topics of the one LinkedIn piece on `linkedin`, and after Coni (or Federico as Coni) opens Temas, `select ultima_red from public.ajustes;` gives `linkedin`.
6. **No Trigger deploy:** Task 14 Step 4 showed no task imports a changed reader; the engine keeps `cubierto_por_coni`; Ingesta is untouched.
7. **Later, its own issue and PR:** a cleanup migration `drop function public.temas_de_pilar(uuid);` once the new code is live in production. Not part of this plan.
8. **Board:** #18 stays En Curso (15c and 15d remain). Comment on #18 with the release date of 15b and the result of step 5.
