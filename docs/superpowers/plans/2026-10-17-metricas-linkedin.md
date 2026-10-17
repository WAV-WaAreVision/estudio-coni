# Metrics and Rhythm (Part 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Métricas counts what went out from one source (`publicaciones`), per network and per stated period, shows LinkedIn next to Instagram with numbers WAV types in once a week (and a Monday reminder), and Ritmo/Agenda stop saying "0 de 0" and stop listing a wall of free slots.

**Architecture:** One migration adds `metricas_linkedin`, `metricas_linkedin_cuenta` and the view `metricas_linkedin_ultima` (RLS, manual rows sealed with the writer's id by a trigger). `lib/datos/metricas.ts` reads `publicaciones` (`publicado` | `subido_a_mano`) joined to the piece; the pure model `lib/metricas/modelo.ts` turns that into a header per network, two "Lo que sirvió" groups and the weeks, all over the same 12 weeks. A pure helper `lib/metricas/linkedin.ts` decides which LinkedIn posts still need this week's numbers; the Métricas page (inside "Para WAV") and the nightly maintenance (Mondays only, through `Notificador.aWav`) both use it. The calendar model gets `yaPublico` for Ritmo's teaching state and trims free Agenda slots to the next three.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres (RLS, views, plpgsql trigger), Trigger.dev v4 (`mantenimiento-nocturno` reuses `lib/`), Vitest + Testing Library, Playwright + axe, Biome, pnpm.

---

**Spec:** `docs/superpowers/specs/2026-10-17-conidolly-logica-design.md`, Part 3 only (decisions 15 to 22). Part 4 has
its own plan and branch. Decision 21 (API / Metricool errands) has no code here by design.

**Branch and worktree:** `feat/metricas-linkedin` in `.worktrees/metricas-linkedin`, from `main` at `cebdb73` (parts 1
and 2 merged and in production; pillars are data via `lib/datos/pilares.ts`; `tests/unit/sin-slugs-de-pilar.test.ts`
forbids pillar slugs in `lib`, `app`, `components`, `trigger`, `scripts`).

## Amendments to the spec (verified against `main` at cebdb73; where the spec and this block disagree, this block wins)

- **A1. Who writes the LinkedIn numbers (decision 18).** The app only opens for Coni's session: every page calls
  `exigirConi()` (`lib/sesion/coni.ts:23-28`, the maintainer gets a 404) and every Server Action goes through
  `conSesionDeConi`, which refuses anyone but Coni (`lib/acciones/servidor.ts:30-49`). WAV works on the desktop
  inside Coni's session ("the computer where WAV helps her", `app/(app)/acciones.ts:9`; Ajustes' "Para WAV" fold is in
  her session too). A write policy for `es_mantenedor()` only would make WAV's entry (decision 19) impossible. So:
  `insert`/`update` for `es_coni() or es_mantenedor()`, **only rows with `origen = 'manual'`**; `api` and `metricool`
  rows only from the service role; no `delete` for anyone authenticated. `anotado_por` and `anotado_en` are set by a
  `before insert or update` trigger from `auth.uid()` and `now()`, so a client cannot write someone else's id.
- **A2. Instagram keeps its measure (decision 17).** "Instagram (reach)" in the spec would replace today's measure,
  saves per 1,000 people reached (`guardadosPorMil`, `lib/dominio/metricas.ts:29`), which the theme comparison
  (`compararTemas`) and its caveats are built on. The Instagram group keeps saves per 1,000 and names it
  ("Guardados cada 1.000 personas que lo vieron."); reach stays the denominator in each sample line. The LinkedIn
  group measures impressions, as the spec says.
- **A3. "Published at" per network.** `publicaciones` has no publish timestamp, only `marcado_en` (set when the row
  turns `publicado` or `subido_a_mano`, `20261007000110_linkedin_publicacion.sql:97,148-161`). The moment a
  publication counts for is `piezas.puerta2_publicar_en` (the time Coni signed, as today) and, if missing,
  `marcado_en`. This keeps every existing test that moves `puerta2_publicar_en` meaningful.
- **A4. Free slots belong to the Agenda (decision 22, second half).** Ritmo's grid shows past weeks and must keep every
  cell; the rows that read "Libre · elige una idea" are the Agenda's (`components/agenda-del-calendario.tsx:48-63`).
  The rule lands there: across the four weeks only the first three free slots are listed; each week then says
  `y N libres más` (`y 1 libre más`) for its hidden ones, and "Sin espacios de publicación en lo que queda de esta
  semana." only shows when the week truly has none.
- **A5. "Before the first publication" (decision 22).** The calendar's `primeraPublicacion` counts `programado` too
  (`lib/datos/calendario.ts:43-50`), so it cannot tell "never published". Decision 15 makes `publicaciones` the source:
  `yaPublico` is true when any row is `publicado` or `subido_a_mano`. Without it Ritmo shows the teaching text and the
  Ajustes link instead of "van N de M", and no schedule advice; the grid still shows when something is scheduled.
- **A6. Schema details the spec leaves open (decision 18).** Both tables get `anotado_en timestamptz not null default
  now()`; figures are `integer check (>= 0)` and nullable (an API may omit one; the form requires all four);
  `metricas_linkedin_cuenta.semana` must be a Monday (`check (extract(isodow from semana) = 1)`); the "latest row per
  piece" is a `security_invoker` view `metricas_linkedin_ultima`, mirroring `metricas_reel_ultima`
  (`20261001001430_metricas_ultimas.sql`), so the screen never hits PostgREST's row cap.
- **A7. `publicaciones` stays readable by Coni only** (`20261006000100_destinos.sql:55-56`). The new tables are
  readable by Coni and the maintainer as the spec says; the Métricas screen runs as Coni, the nightly task as the
  service role, so nothing needs the maintainer to read `publicaciones`.
- **A8. "Pillars shown are the active ones" (decision 17), made concrete.** A bar or week row of a piece whose pillar
  is retired shows no pillar line; the theme comparison only counts reels of active pillars. Existing model tests that
  use retired slugs move to active ones (Task 7 gives the exact mapping).
- **A9. The comparison panel needs an Instagram reel.** Today it shows whenever anything is published
  (`lib/metricas/modelo.ts:302`). With LinkedIn-only history it would say "Cuando lleguen los números de tus reels".
  It now shows only when there is at least one Instagram reel published by the platform.
- **A10. The windows of WAV's entry and the reminder.** "This week" is the ISO week (Monday start) in `ajustes.zona`
  (`lunesDeLaSemana`); "the last 4 weeks" is published in the last 28 days up to now. A post is pending when its newest
  `metricas_linkedin` row is older than this week's Monday. On Monday at 03:00 that is every post of the last 28 days,
  which is what the reminder counts.
- **A11. The header keeps the contact numbers.** The spec's header line replaces today's
  `N reels publicados · N consultas · N toques en tu link` (`lib/metricas/modelo.ts:299`). Consultations and link taps
  move to a second line that also says its period: `Este mes también: N consultas · N toques en tu link`.
- **Facts that differ from the spec text:** the published-piece query is at `lib/datos/metricas.ts:86-93` (not 84-92);
  `reelsDelMes` is at `lib/metricas/modelo.ts:234` and the header at `:299`; `SEMANAS_A_MOSTRAR` at `:109`;
  `construirRitmo` at `lib/calendario/modelo.ts:353-397`. The nightly maintenance is `mantenimientoNocturno`
  (`lib/mantenimiento/ejecutar.ts:65-75`), scheduled `0 3 * * *` America/Santiago with `maxAttempts: 1`
  (`trigger/mantenimiento.ts:22-28`), so a Monday-only job runs once a week. "Existing notices to WAV" is
  `Notificador.aWav(asunto, detalle)` (`lib/proveedores/avisos.ts:27`), an email with no dedup key. Trigger.dev
  production is at `20261017.2`.

## Decisions for Federico (the plan picks the default in brackets and goes on)

- **D1. Coni's session may write manual LinkedIn numbers** (A1). [Yes: WAV only works in her session.] The other way
  is a maintainer-only screen, which does not exist and is out of scope.
- **D2. Instagram measure** (A2). [Keep saves per 1,000.] Switching to raw reach is one function plus its tests.
- **D3. Copy to confirm:** `Este mes también: ...` (A11); LinkedIn sample `14 reacciones · 3 comentarios · 1 vez
  compartido`; LinkedIn measure line `Impresiones: las veces que LinkedIn lo mostró.`; Ritmo's link `Cambiar días y
  hora`; the WAV fold `Guardar números`. [As written.]
- **D4. Followers are stored, not shown to Coni yet** (YAGNI until there is a view for them). [Not shown.]

## Lotes (batches for subagent-driven execution, one reviewer per lote)

| Lote | Tasks | Depends on | Parallel with |
|---|---|---|---|
| 0 Setup | 0 | none | none |
| 1 Schema | 1, 2 | 0 | 5 |
| 2 Métricas from `publicaciones` | 3, 4, 5, 6, 7, 8 | 1 | 5 |
| 3 WAV's entry | 9, 10, 11, 12, 13 | 2 | 5 |
| 4 Monday reminder | 14 | 10 | 5 |
| 5 Ritmo and Agenda | 15, 16, 17, 18 | 0 (Task 15 needs Task 2's helper) | 1, 2, 3, 4 |
| 6 Snapshots and axe | 19, 20 | 2, 3, 5 | none |
| 7 Docs and verification | 21, 22 | 1 to 6 | none |
| 8 Deploy runbook | 23 | 7 | none |

Lote 5 touches only `lib/calendario/`, `lib/datos/calendario.ts`, `components/ritmo-del-calendario.tsx`,
`components/agenda-del-calendario.tsx` and their tests; it can run beside Lotes 1 to 4. Task 15 uses
`marcarPublicacion` from Task 2: run Task 2 first or let Lote 5 start with Task 16. Each implementer stages only its
own paths (`git add <paths>`, never `git add -A`); the controller serializes commits. Reviewer per lote:
`superpowers:code-reviewer` with this plan's amendments and the lote's tasks.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20261017000300_metricas_linkedin.sql` | create | Two tables, sealing trigger, RLS, `metricas_linkedin_ultima` |
| `lib/supabase/database.types.ts` | regenerate | New tables and view |
| `tests/integration/siembra.ts` | modify | `marcarPublicacion`, `quitarPublicacion`, `moverHoraAprobada` |
| `lib/datos/metricas.ts` | modify | Read `publicaciones` per network and LinkedIn's newest readings |
| `lib/metricas/modelo.ts` | modify | Header per network, two groups, `sin números`, weeks over the same set, active pillars |
| `lib/metricas/linkedin.ts` | create | Pure: pending posts, reminder subject, parsing WAV's fields |
| `lib/datos/metricas-linkedin.ts` | create | Read what WAV has to note; write the rows |
| `lib/acciones/metricas-linkedin.ts` | create | `anotarNumerosDeLinkedin` (checks the posts are still pending) |
| `app/(app)/metricas/acciones.ts` | create | Server Action with zod |
| `app/(app)/metricas/numeros-de-linkedin.tsx` | create | WAV's form inside "Para WAV" (screen-local, not a design-system component) |
| `app/(app)/metricas/page.tsx` | modify | Header lines, periods, groups, weeks, "Para WAV" |
| `lib/mantenimiento/numeros-linkedin.ts` | create | Monday reminder |
| `lib/mantenimiento/ejecutar.ts` | modify | Nightly job `numerosLinkedin` |
| `lib/datos/calendario.ts` | modify | `yaPublico` |
| `lib/calendario/modelo.ts` | modify | Ritmo's teaching text; Agenda's three free slots and `libresMas` |
| `components/ritmo-del-calendario.tsx` | modify | Teaching state with the Ajustes link |
| `components/agenda-del-calendario.tsx` | modify | `y N libres más` |
| `docs/TRASPASO.md` | modify | Part 3 entry |
| Tests | create/modify | `tests/integration/metricas-linkedin-esquema.test.ts`, `tests/integration/datos-metricas.test.ts`, `tests/unit/metricas-modelo.test.ts`, `tests/unit/metricas-linkedin.test.ts`, `tests/integration/metricas-linkedin-datos.test.ts`, `tests/unit/numeros-de-linkedin.test.tsx`, `tests/integration/numeros-linkedin.test.ts`, `tests/integration/datos-calendario.test.ts`, `tests/unit/calendario-modelo.test.ts`, `tests/unit/ritmo-del-calendario.test.tsx`, `tests/e2e/metricas.spec.ts`, `tests/e2e/calendario.spec.ts`, `tests/e2e/visual.spec.ts`, `tests/e2e/accesibilidad.spec.ts` |

`docs/DESIGN.md` does not change: the only new UI is a screen-local form built from existing pieces (`campo`,
`Boton`, `LineaDeEstado`, `MasOpciones`); no design-system component is added. `docs/metricas-friccion.sql` does not
change: no event changes.

---

## Lote 0: Setup

### Task 0: Worktree and baseline

**Files:** none.

- [ ] **Step 1: Create the worktree from `main`**

```bash
cd /Users/fede/Projects/estudio-coni
git status --short   # only the untracked .impeccable/ folders and this plan's commit; nothing staged
git log --oneline -1 # the commit of this plan on main, after cebdb73
git worktree add .worktrees/metricas-linkedin -b feat/metricas-linkedin main
cd .worktrees/metricas-linkedin
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Local database and baseline**

```bash
supabase status || (colima start && pnpm db:start)
pnpm db:reset
pnpm type && pnpm test:run && pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-base-metricas.txt
```

Expected: all green. Write down the unit and integration counts (Task 22 compares). Root `pnpm lint` fails while
`.worktrees/*/biome.json` exist; always lint the code dirs.

- [ ] **Step 3: No commit** (nothing changed).

---

## Lote 1: Schema

### Task 1: Migration `20261017000300_metricas_linkedin.sql`

**Files:**
- Create: `supabase/migrations/20261017000300_metricas_linkedin.sql`
- Test: `tests/integration/metricas-linkedin-esquema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, describe, expect, it } from "vitest"
import {
  asumir,
  CONI,
  como,
  comoConi,
  comoMantenedor,
  comoOtra,
  comoPostgres,
  comoServicio,
  fallaCon,
  MANTENEDOR,
  pool,
} from "./db"

afterAll(() => pool.end())

async function nuevaPieza(c: Parameters<Parameters<typeof como>[1]>[0]): Promise<string> {
  const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Post') returning id")
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  return id
}

const NUMEROS =
  "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen) values ($1, $2, 1200, 14, 3, 1, $3)"
const SEGUIDORES =
  "insert into public.metricas_linkedin_cuenta (semana, seguidores, origen) values ($1, 830, $2)"

describe("métricas de LinkedIn", () => {
  it.each([
    ["Coni", comoConi, CONI],
    ["the maintainer", comoMantenedor, MANTENEDOR],
  ])("lets %s note manual numbers and seals them with their id", async (_nombre, sesion, id) => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, sesion)
      await c.query(NUMEROS, [pieza, "2026-10-19", "manual"])
      await c.query(SEGUIDORES, ["2026-10-19", "manual"])
      const { rows } = await c.query("select anotado_por, origen from public.metricas_linkedin")
      expect(rows).toEqual([{ anotado_por: id, origen: "manual" }])
      const cuenta = await c.query("select anotado_por from public.metricas_linkedin_cuenta")
      expect(cuenta.rows).toEqual([{ anotado_por: id }])
    })
  })

  it("ignores an anotado_por the client sends", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      await c.query(
        "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen, anotado_por) values ($1, '2026-10-19', 5, 'manual', $2)",
        [pieza, MANTENEDOR],
      )
      const { rows } = await c.query("select anotado_por from public.metricas_linkedin")
      expect(rows).toEqual([{ anotado_por: CONI }])
    })
  })

  it("keeps api and metricool rows for the service", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      const error = await fallaCon(c, NUMEROS, [pieza, "2026-10-19", "api"])
      expect(error.message).toMatch(/row-level security/)
      await asumir(c, comoServicio)
      await c.query(NUMEROS, [pieza, "2026-10-19", "metricool"])
      const { rows } = await c.query("select anotado_por from public.metricas_linkedin")
      expect(rows).toEqual([{ anotado_por: null }])
    })
  })

  it("shows nothing to a signed-in user who is not a member and does not let them write", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "api"])
      await asumir(c, comoOtra)
      expect((await c.query("select * from public.metricas_linkedin")).rowCount).toBe(0)
      expect((await c.query("select * from public.metricas_linkedin_ultima")).rowCount).toBe(0)
      const error = await fallaCon(c, SEGUIDORES, ["2026-10-19", "manual"])
      expect(error.message).toMatch(/row-level security/)
    })
  })

  it("lets nobody signed in delete a row", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "manual"])
      await asumir(c, comoConi)
      const error = await fallaCon(c, "delete from public.metricas_linkedin")
      expect(error.message).toMatch(/permission denied/)
    })
  })

  it("keeps one row per post per day, refuses negative figures and a week that does not start on Monday", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "manual"])
      expect((await fallaCon(c, NUMEROS, [pieza, "2026-10-19", "manual"])).code).toBe("23505")
      const negativa = await fallaCon(
        c,
        "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen) values ($1, '2026-10-20', -1, 'manual')",
        [pieza],
      )
      expect(negativa.code).toBe("23514")
      expect((await fallaCon(c, SEGUIDORES, ["2026-10-20", "manual"])).code).toBe("23514")
      expect((await fallaCon(c, NUMEROS, [pieza, "2026-10-21", "a mano"])).code).toBe("23514")
    })
  })

  it("gives the newest row of each post in the view", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-12", "manual"])
      await c.query(
        "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen) values ($1, '2026-10-19', 2000, 'manual')",
        [pieza],
      )
      await asumir(c, comoMantenedor)
      const { rows } = await c.query("select medido_en::text, impresiones from public.metricas_linkedin_ultima")
      expect(rows).toEqual([{ medido_en: "2026-10-19", impresiones: 2000 }])
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db tests/integration/metricas-linkedin-esquema.test.ts`
Expected: FAIL with `relation "public.metricas_linkedin" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- LinkedIn numbers, by hand now and from an API later (spec 2026-10-17, part 3, decisions 18 to 21; plan amendments
-- A1 and A6). WAV notes them inside Coni's session (the app only opens for her), so both members may write manual
-- rows; api and metricool rows come only from the service role. Who wrote a row is sealed by the trigger, never sent.

create table public.metricas_linkedin (
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  -- The day it was read, in the app's zone (`ajustes.zona`).
  medido_en date not null,
  -- An unknown figure stays null: "unknown" is not "zero". The form asks for all four.
  impresiones integer check (impresiones >= 0),
  reacciones integer check (reacciones >= 0),
  comentarios integer check (comentarios >= 0),
  compartidos integer check (compartidos >= 0),
  origen text not null check (origen in ('manual', 'api', 'metricool')),
  anotado_por uuid,
  anotado_en timestamptz not null default now(),
  primary key (pieza_id, medido_en)
);

create table public.metricas_linkedin_cuenta (
  -- The Monday of the week counted.
  semana date primary key check (extract(isodow from semana) = 1),
  seguidores integer not null check (seguidores >= 0),
  origen text not null check (origen in ('manual', 'api', 'metricool')),
  anotado_por uuid,
  anotado_en timestamptz not null default now()
);

create function public.sellar_anotacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Null for the service role: an automated row has no person behind it.
  new.anotado_por := auth.uid();
  new.anotado_en := now();
  return new;
end $$;

create trigger sellar before insert or update on public.metricas_linkedin
  for each row execute function public.sellar_anotacion();
create trigger sellar before insert or update on public.metricas_linkedin_cuenta
  for each row execute function public.sellar_anotacion();

alter table public.metricas_linkedin enable row level security;
alter table public.metricas_linkedin_cuenta enable row level security;

create policy "coni y wav leen metricas de linkedin" on public.metricas_linkedin for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav anotan metricas de linkedin" on public.metricas_linkedin for insert to authenticated
  with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');
create policy "coni y wav corrigen metricas de linkedin" on public.metricas_linkedin for update to authenticated
  using (public.es_coni() or public.es_mantenedor())
  with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');

create policy "coni y wav leen la cuenta de linkedin" on public.metricas_linkedin_cuenta for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav anotan la cuenta de linkedin" on public.metricas_linkedin_cuenta for insert
  to authenticated with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');
create policy "coni y wav corrigen la cuenta de linkedin" on public.metricas_linkedin_cuenta for update
  to authenticated using (public.es_coni() or public.es_mantenedor())
  with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');

revoke all on public.metricas_linkedin, public.metricas_linkedin_cuenta from anon;
revoke delete, truncate on public.metricas_linkedin, public.metricas_linkedin_cuenta from authenticated;
grant select, insert, update on public.metricas_linkedin, public.metricas_linkedin_cuenta to authenticated;

-- The newest reading of every post, read with the caller's rights (as metricas_reel_ultima).
create view public.metricas_linkedin_ultima with (security_invoker = true) as
  select distinct on (pieza_id) pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen
  from public.metricas_linkedin
  order by pieza_id, medido_en desc;

revoke all on public.metricas_linkedin_ultima from anon;
grant select on public.metricas_linkedin_ultima to authenticated, service_role;
```

- [ ] **Step 4: Apply and run the test**

```bash
pnpm db:reset
pnpm test:db tests/integration/metricas-linkedin-esquema.test.ts
```

Expected: PASS (7 tests). If the delete test reports `row-level security` instead of `permission denied`, the revoke
did not apply: check the `revoke delete` line before relaxing the regex.

- [ ] **Step 5: Regenerate the types and type-check**

```bash
pnpm db:types
pnpm type
```

Expected: `lib/supabase/database.types.ts` gains `metricas_linkedin`, `metricas_linkedin_cuenta` and the view; type
check green.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261017000300_metricas_linkedin.sql lib/supabase/database.types.ts tests/integration/metricas-linkedin-esquema.test.ts
git commit -m "Add LinkedIn metrics tables with manual rows sealed by their writer"
```

### Task 2: Seed helpers for publications

**Files:**
- Modify: `tests/integration/siembra.ts` (append)

These are test helpers used by Tasks 3, 10, 11, 13, 14, 15, 19; their behaviour is pinned by those tests.

- [ ] **Step 1: Append the helpers**

```ts
/**
 * Marks a destination of a piece as out, as the database owner (the publishing run or her upload would). LinkedIn's
 * `publicado` needs a post URN (`linkedin_publicado_con_urn`), so one is made up from the piece id.
 */
export async function marcarPublicacion(
  piezaId: string,
  destino: "instagram" | "linkedin",
  estado: "publicado" | "subido_a_mano" = "publicado",
): Promise<void> {
  await pool.query(
    `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
     values ($1, $2::text, $3::text, now(),
             case when $2::text = 'linkedin' and $3::text = 'publicado' then 'urn:li:share:' || $1::text end)
     on conflict (pieza_id, destino) do update
       set estado = excluded.estado, marcado_en = excluded.marcado_en, post_urn = excluded.post_urn`,
    [piezaId, destino, estado],
  )
}

/** Removes a destination row: for a piece that went out on one network only. */
export async function quitarPublicacion(piezaId: string, destino: "instagram" | "linkedin"): Promise<void> {
  await pool.query("delete from public.publicaciones where pieza_id = $1 and destino = $2", [piezaId, destino])
}

/**
 * Moves the signed publishing time. Only the owner can rewrite an approval, and only with the triggers off, so it is
 * done here on purpose, in one transaction.
 */
export async function moverHoraAprobada(piezaId: string, instante: string): Promise<void> {
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await cliente.query("set local session_replication_role = replica")
    await cliente.query("update public.piezas set puerta2_publicar_en = $2 where id = $1", [piezaId, instante])
    await cliente.query("commit")
  } catch (error) {
    await cliente.query("rollback")
    throw error
  } finally {
    cliente.release()
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm type`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/siembra.ts
git commit -m "Add seed helpers to mark a piece published per network"
```

---

## Lote 2: Métricas from `publicaciones`

### Task 3: Read publications per network (decision 15)

**Files:**
- Modify: `lib/metricas/modelo.ts` (types and the minimum to keep today's output)
- Modify: `lib/datos/metricas.ts:79-148`
- Modify: `tests/unit/metricas-modelo.test.ts` (fixture builders)
- Test: `tests/integration/datos-metricas.test.ts`

- [ ] **Step 1: Rewrite the reader tests (failing)**

In `tests/integration/datos-metricas.test.ts`: import `marcarPublicacion`, `quitarPublicacion` from `./siembra`, add
`await pool.query("delete from public.metricas_linkedin_cuenta")` to `limpiar()`, and replace the first test of
`describe("leerDatosDeMetricas")` and the whole `describe("reels subidos a mano")` with:

```ts
  it("reads each network a piece went out on, once per network, with her own uploads marked", async () => {
    const ambas = await sembrarPieza("publicado", { titulo: "En las dos", media_id: "media_1" })
    await marcarPublicacion(ambas, "linkedin")
    const soloLinkedin = await sembrarPieza("publicado", { titulo: "Solo LinkedIn" })
    await quitarPublicacion(soloLinkedin, "instagram")
    await marcarPublicacion(soloLinkedin, "linkedin")
    await sembrarPieza("publicado_a_mano", { titulo: "A mano" })
    await sembrarPieza("para_subir_a_mano", { titulo: "Sin subir" })

    const datos = await leerDatosDeMetricas(coni, AHORA)

    expect(
      datos.publicaciones
        .map((p) => [p.titulo, p.red, p.aMano])
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["A mano", "instagram", true],
      ["En las dos", "instagram", false],
      ["En las dos", "linkedin", false],
      ["Solo LinkedIn", "linkedin", false],
    ])
    expect(datos.publicaciones.every((p) => !Number.isNaN(Date.parse(p.publicadoEn)))).toBe(true)
  })

  it("reads the newest LinkedIn reading of each post", async () => {
    const post = await sembrarPieza("publicado", { titulo: "Post" })
    await marcarPublicacion(post, "linkedin")
    await pool.query(
      `insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen)
       values ($1, '2026-10-05', 300, 2, 0, 0, 'manual'), ($1, '2026-10-12', 1200, 14, 3, 1, 'manual')`,
      [post],
    )

    const datos = await leerDatosDeMetricas(coni, AHORA)

    expect(datos.lecturasLinkedin).toEqual([
      { piezaId: post, medidoEn: "2026-10-12", impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 },
    ])
  })
```

and

```ts
describe("reels subidos a mano", () => {
  it("reach the screen marked as hers, while the daily Instagram reading asks only for the platform's", async () => {
    await sembrarPieza("publicado_a_mano", { titulo: "Sin enlace" })
    await sembrarPieza("publicado_a_mano", {
      titulo: "Con enlace",
      permalink: "https://www.instagram.com/reel/DAbc123/",
    })
    await sembrarPieza("para_subir_a_mano", { titulo: "Todavía sin subir" })
    const publicada = await sembrarPieza("publicado", { titulo: "Publicada por la plataforma", media_id: "media_1" })

    const datos = await leerDatosDeMetricas(coni, AHORA)
    const paraLeer = await leerReelsPublicados(clienteDeServicioParaMetricas())

    expect(datos.publicaciones.map((p) => [p.titulo, p.aMano]).sort()).toEqual([
      ["Con enlace", true],
      ["Publicada por la plataforma", false],
      ["Sin enlace", true],
    ])
    expect(paraLeer).toEqual([{ piezaId: publicada, mediaId: "media_1" }])
  })
})
```

In the remaining tests of the file replace `datos.publicadas` with `datos.publicaciones`; in the theme test
`toMatchObject({ id: publicada, ... })` becomes `toMatchObject({ piezaId: publicada, red: "instagram", ... })`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db tests/integration/datos-metricas.test.ts`
Expected: FAIL (`publicaciones` is undefined / type errors on `lecturasLinkedin`).

- [ ] **Step 3: New entry types in the model, keeping today's output**

In `lib/metricas/modelo.ts`:

1. Add `import { type Destino } from "@/lib/dominio/destinos"` to the imports.
2. Replace `PiezaPublicada` and `EntradaDeMetricas` with:

```ts
/** One network a piece went out on (`publicaciones` in `publicado` or `subido_a_mano`, decision 15). */
export interface PublicacionMedible {
  piezaId: string
  titulo: string
  /** The slug of its idea's pillar. */
  pilar: string | null
  red: Destino
  /** She uploaded it herself (`subido_a_mano`): Instagram has no reel to ask about. */
  aMano: boolean
  /** The signed publishing time or, without one, when the row was marked (amendment A3), as an ISO instant. */
  publicadoEn: string
}

export interface LecturaDeLinkedin {
  piezaId: string
  medidoEn: string
  impresiones: number | null
  reacciones: number | null
  comentarios: number | null
  compartidos: number | null
}

export interface EntradaDeMetricas {
  publicaciones: readonly PublicacionMedible[]
  /** Instagram readings; the newest of each reel is the one shown. */
  lecturas: readonly LecturaDeReel[]
  /** The newest LinkedIn reading of each post. */
  lecturasLinkedin: readonly LecturaDeLinkedin[]
  /** When each consultation was noted. */
  consultas: readonly string[]
  /** Clicks on the links of `/l`, by day. */
  clics: readonly { dia: string; clics: number }[]
  zona: string
  ahora: number
  pilares: CatalogoDePilares
}
```

3. `reelMedido` takes a `PublicacionMedible`:

```ts
function reelMedido(pieza: PublicacionMedible, lectura: Omit<LecturaDeReel, "piezaId">): ReelMedido {
  return { piezaId: pieza.piezaId, titulo: pieza.titulo, pilar: pieza.pilar, publicadoEn: pieza.publicadoEn, ...lectura }
}
```

4. At the top of `construirMetricas`, after `const ultimas = ...`, add
   `const reels = entrada.publicaciones.filter((p) => p.red === "instagram" && !p.aMano)`; then replace every
   `entrada.publicadas` in the function with `reels`, every `(pieza: PiezaPublicada)` with
   `(pieza: PublicacionMedible)`, and `pieza.id` with `pieza.piezaId`. Output stays as today (Tasks 4 to 7 change it).

- [ ] **Step 4: The reader**

In `lib/datos/metricas.ts` add `import { esDestino } from "@/lib/dominio/destinos"`, and in `leerDatosDeMetricas`
replace the `piezas` query with two queries and the mapping:

```ts
  const [publicaciones, lecturas, lecturasLinkedin, consultas, clics, pilares] = await Promise.all([
    // Decision 15: what went out is a `publicaciones` row, once per network.
    db
      .from("publicaciones")
      .select("pieza_id, destino, estado, marcado_en, piezas(titulo, puerta2_publicar_en, ideas(pilar))")
      .in("estado", ["publicado", "subido_a_mano"]),
    // One row per reel (the newest): the table keeps a row per day and would hit the API's row cap in a few months.
    db
      .from("metricas_reel_ultima")
      .select("pieza_id, dia, alcance, guardados, compartidos, comentarios, tiempo_promedio"),
    db
      .from("metricas_linkedin_ultima")
      .select("pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos"),
    db
      .from("consultas")
      .select("anotada_en")
      .gte("anotada_en", new Date(ahora - DIAS_DE_HISTORIA * 86_400_000).toISOString()),
    db.from("clics_enlace_dia").select("dia, clics").gte("dia", sumarDias(hoy, -DIAS_DE_HISTORIA)),
    leerPilares(db),
  ])
  if (publicaciones.error) throw fallo("No pude leer lo publicado", publicaciones.error)
  if (lecturas.error) throw fallo("No pude leer las métricas", lecturas.error)
  if (lecturasLinkedin.error) throw fallo("No pude leer las métricas de LinkedIn", lecturasLinkedin.error)
  if (consultas.error) throw fallo("No pude leer las consultas", consultas.error)
  if (clics.error) throw fallo("No pude leer los clics", clics.error)
```

and in the returned object replace `publicadas: ...` with:

```ts
    publicaciones: publicaciones.data
      .flatMap((fila) => {
        const pieza = fila.piezas
        const publicadoEn = pieza?.puerta2_publicar_en ?? fila.marcado_en
        if (!pieza || !publicadoEn || !esDestino(fila.destino)) return []
        return [
          {
            piezaId: fila.pieza_id,
            titulo: pieza.titulo,
            pilar: pieza.ideas?.pilar ?? null,
            red: fila.destino,
            aMano: fila.estado === "subido_a_mano",
            publicadoEn,
          },
        ]
      })
      .sort((a, b) => Date.parse(b.publicadoEn) - Date.parse(a.publicadoEn)),
```

and after `lecturas: ...` add:

```ts
    // A view types every column as nullable; a row without its post or its day cannot come out of the primary key.
    lecturasLinkedin: lecturasLinkedin.data.flatMap((fila) =>
      fila.pieza_id && fila.medido_en
        ? [
            {
              piezaId: fila.pieza_id,
              medidoEn: fila.medido_en,
              impresiones: fila.impresiones,
              reacciones: fila.reacciones,
              comentarios: fila.comentarios,
              compartidos: fila.compartidos,
            },
          ]
        : [],
    ),
```

`leerReelsPublicados` stays as it is (the daily Instagram task asks only for reels with a media id).

- [ ] **Step 5: Unit fixtures follow the new entry**

In `tests/unit/metricas-modelo.test.ts`: in `entrada()` replace `publicadas: []` with `publicaciones: [],
lecturasLinkedin: []`; change the builder to

```ts
function publicada(id: string, pilar: string | null, publicadoEn: string, titulo = `Reel ${id}`) {
  return { piezaId: id, titulo, pilar, red: "instagram" as const, aMano: false, publicadoEn }
}
```

and run `sed -i '' 's/publicadas: \[/publicaciones: [/' tests/unit/metricas-modelo.test.ts`.

- [ ] **Step 6: Run the tests**

```bash
pnpm test:run tests/unit/metricas-modelo.test.ts
pnpm test:db tests/integration/datos-metricas.test.ts
pnpm type
```

Expected: PASS; the unit expectations are unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/metricas/modelo.ts lib/datos/metricas.ts tests/unit/metricas-modelo.test.ts tests/integration/datos-metricas.test.ts
git commit -m "Read what went out from publicaciones, once per network"
```

### Task 4: Header per network and period (decision 16, A11)

**Files:**
- Modify: `lib/metricas/modelo.ts` (`ModeloDeMetricas`, `construirMetricas`)
- Test: `tests/unit/metricas-modelo.test.ts`

- [ ] **Step 1: Failing tests**

Add a builder under `publicada` and replace the first two tests:

```ts
function enLinkedin(id: string, publicadoEn: string, titulo = `Post ${id}`, pilar: string | null = null) {
  return { piezaId: id, titulo, pilar, red: "linkedin" as const, aMano: false, publicadoEn }
}

  it("counts this month per network, singular included, and says the period of the contact numbers", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", "ia-salud-mental", "2026-10-08T22:00:00.000Z"),
          enLinkedin("a", "2026-10-08T22:00:00.000Z"),
          publicada("b", "practica-clinica", "2026-09-26T22:00:00.000Z"),
          { ...publicada("c", null, "2026-10-13T22:00:00.000Z"), aMano: true },
        ],
        consultas: ["2026-10-07T15:00:00.000Z", "2026-10-12T15:00:00.000Z", "2026-09-30T15:00:00.000Z"],
        clics: [
          { dia: "2026-10-06", clics: 8 },
          { dia: "2026-10-13", clics: 7 },
          { dia: "2026-09-29", clics: 40 },
        ],
      }),
    )

    expect(modelo.mes).toBe("octubre")
    expect(modelo.resumen).toBe("Este mes: 2 reels en Instagram · 1 post en LinkedIn")
    expect(modelo.contacto).toBe("Este mes también: 2 consultas · 15 toques en tu link")
    expect(modelo.periodo).toBe("Últimas 12 semanas")
  })

  it("says plainly that nothing is published yet, and still counts consultations", () => {
    const modelo = construirMetricas(entrada({ consultas: ["2026-10-07T15:00:00.000Z"] }))

    expect(modelo.vacio).toBe(true)
    expect(modelo.resumen).toBe("Este mes: 0 reels en Instagram · 0 posts en LinkedIn")
    expect(modelo.contacto).toBe("Este mes también: 1 consulta · 0 toques en tu link")
    expect(modelo.comparacion).toBeNull()
  })
```

(In the second test drop the old `expect(modelo.barras).toEqual([])`; Task 5 covers the groups.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run tests/unit/metricas-modelo.test.ts -t "this month per network|nothing is published"`
Expected: FAIL (`resumen` still "1 reel publicado ...", `contacto` undefined).

- [ ] **Step 3: Implement**

In `lib/metricas/modelo.ts`:

```ts
const SEMANAS_A_MOSTRAR = 12
/** Decision 16: every number says its period. */
export const PERIODO = `Últimas ${SEMANAS_A_MOSTRAR} semanas`
```

Add to `ModeloDeMetricas`:

```ts
  /** "Este mes: 2 reels en Instagram · 1 post en LinkedIn". */
  resumen: string
  /** "Este mes también: 2 consultas · 15 toques en tu link". */
  contacto: string
  /** The window of "Lo que sirvió" and "Semana a semana". */
  periodo: string
```

In `construirMetricas`, replace `reelsDelMes` with

```ts
  const delMes = (red: Destino) =>
    entrada.publicaciones.filter((p) => p.red === red && enElMes(Date.parse(p.publicadoEn))).length
```

and in the returned object

```ts
    resumen: `Este mes: ${plural(delMes("instagram"), "reel", "reels")} en Instagram · ${plural(delMes("linkedin"), "post", "posts")} en LinkedIn`,
    contacto: `Este mes también: ${plural(consultasDelMes, "consulta", "consultas")} · ${plural(clicsDelMes, "toque", "toques")} en tu link`,
    periodo: PERIODO,
    vacio: entrada.publicaciones.length === 0,
```

and (amendment A9) `comparacion: reels.length === 0 ? null : panelDeComparacion(comparacion, entrada.pilares),`.

- [ ] **Step 4: Run the file**

Run: `pnpm test:run tests/unit/metricas-modelo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/metricas/modelo.ts tests/unit/metricas-modelo.test.ts
git commit -m "Say this month per network in the Métricas header"
```

### Task 5: "Lo que sirvió" in two groups, with `sin números` (decisions 16, 17)

**Files:**
- Modify: `lib/metricas/modelo.ts` (`Barra`, `GrupoDeBarras`, `ModeloDeMetricas.grupos`)
- Test: `tests/unit/metricas-modelo.test.ts`

- [ ] **Step 1: Failing tests**

Add a LinkedIn reading builder and these tests; in the existing bar tests replace `modelo.barras` with
`modelo.grupos[0]?.barras ?? []` and `porMil` with `valor`:

```ts
function lecturaLinkedin(piezaId: string, extra: Partial<EntradaDeMetricas["lecturasLinkedin"][number]> = {}) {
  return { piezaId, medidoEn: "2026-10-12", impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1, ...extra }
}

  it("splits what worked by network, each with its measure, and never mixes them in one bar", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", "ia-salud-mental", "2026-10-06T22:00:00.000Z"),
          enLinkedin("a", "2026-10-06T22:00:00.000Z", "Reel a"),
          enLinkedin("b", "2026-10-08T22:00:00.000Z"),
        ],
        lecturas: [lectura("a", { guardados: 121, alcance: 2400 })],
        lecturasLinkedin: [lecturaLinkedin("a", { impresiones: 600 }), lecturaLinkedin("b")],
      }),
    )

    expect(modelo.grupos.map((g) => [g.red, g.titulo, g.cifra, g.medida])).toEqual([
      ["instagram", "Instagram", "1 reel", "Guardados cada 1.000 personas que lo vieron."],
      ["linkedin", "LinkedIn", "2 posts", "Impresiones: las veces que LinkedIn lo mostró."],
    ])
    const [instagram, linkedin] = modelo.grupos
    expect(instagram?.barras.map((b) => [b.piezaId, b.cifra])).toEqual([["a", "50,4"]])
    expect(linkedin?.barras.map((b) => [b.piezaId, b.cifra, b.unidad, b.ancho, b.muestra])).toEqual([
      ["b", "1.200", "impresiones", 100, "14 reacciones · 3 comentarios · 1 vez compartido"],
      ["a", "600", "impresiones", 50, "14 reacciones · 3 comentarios · 1 vez compartido"],
    ])
    expect(linkedin?.barras.every((b) => b.reelsDelTema === 0)).toBe(true)
  })

  it("lists a manual upload and a post without numbers as «sin números», without a bar", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          { ...publicada("a", null, "2026-10-06T22:00:00.000Z"), aMano: true },
          enLinkedin("b", "2026-10-08T22:00:00.000Z"),
        ],
      }),
    )

    const barras = modelo.grupos.flatMap((g) => g.barras)
    expect(barras.map((b) => [b.piezaId, b.texto, b.cifra, b.ancho, b.muestra])).toEqual([
      ["a", "sin números", null, 0, null],
      ["b", "sin números", null, 0, null],
    ])
  })

  it("leaves out a network with nothing in the last twelve weeks, and says so when neither has anything", () => {
    const modelo = construirMetricas(
      entrada({ publicaciones: [publicada("a", null, "2026-06-02T22:00:00.000Z")], lecturas: [lectura("a")] }),
    )

    expect(modelo.vacio).toBe(false)
    expect(modelo.grupos).toEqual([])
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run tests/unit/metricas-modelo.test.ts`
Expected: FAIL (`grupos` undefined).

- [ ] **Step 3: Implement**

In `lib/metricas/modelo.ts`: in `Barra` replace `porMil: number | null` with

```ts
  /** What the bar measures: saves per 1,000 on Instagram, impressions on LinkedIn. Null without numbers. */
  valor: number | null
```

add

```ts
export interface GrupoDeBarras {
  red: Destino
  /** "Instagram". */
  titulo: string
  /** "3 reels", "1 post". */
  cifra: string
  /** What the bars measure, in her words. */
  medida: string
  barras: Barra[]
}

const SIN_NUMEROS = "sin números"
const MEDIDA: Record<Destino, string> = {
  instagram: "Guardados cada 1.000 personas que lo vieron.",
  linkedin: "Impresiones: las veces que LinkedIn lo mostró.",
}

function muestraDeLinkedin(lectura: LecturaDeLinkedin): string | null {
  const partes: string[] = []
  if (lectura.reacciones !== null) partes.push(plural(lectura.reacciones, "reacción", "reacciones"))
  if (lectura.comentarios !== null) partes.push(plural(lectura.comentarios, "comentario", "comentarios"))
  if (lectura.compartidos !== null) partes.push(plural(lectura.compartidos, "vez compartido", "veces compartido"))
  return partes.length > 0 ? partes.join(" · ") : null
}

function anchoDe(valor: number | null, maximo: number): number {
  if (valor === null || maximo === 0) return 0
  return Math.max(valor > 0 ? 2 : 0, Math.round((valor / maximo) * 100))
}

const ordenDeBarras = (a: Barra & { publicadoEn: string }, b: Barra & { publicadoEn: string }) =>
  (b.valor ?? -1) - (a.valor ?? -1) || Date.parse(b.publicadoEn) - Date.parse(a.publicadoEn)
```

In `ModeloDeMetricas` replace `barras: Barra[]` with `grupos: GrupoDeBarras[]`. In `construirMetricas` replace the
block from `const visibles = ...` to the end of `const barras ...` with:

```ts
  const recientes = entrada.publicaciones.filter(reciente)
  const ultimasLinkedin = new Map(entrada.lecturasLinkedin.map((l) => [l.piezaId, l]))

  const deInstagram = recientes.filter((p) => p.red === "instagram")
  const valoresDeInstagram = deInstagram.map((pieza) => {
    const lectura = pieza.aMano ? undefined : ultimas.get(pieza.piezaId)
    return { pieza, lectura, valor: lectura ? guardadosPorMil(lectura.guardados, lectura.alcance) : null }
  })
  const maximoInstagram = Math.max(0, ...valoresDeInstagram.map((fila) => fila.valor ?? 0))
  const barrasDeInstagram = valoresDeInstagram
    .map(({ pieza, lectura, valor }) => {
      const muestra = muestraDeBarra(lectura, valor)
      return {
        publicadoEn: pieza.publicadoEn,
        piezaId: pieza.piezaId,
        titulo: pieza.titulo,
        pilar: pilarVisible(entrada.pilares, pieza.pilar),
        valor,
        ancho: anchoDe(valor, maximoInstagram),
        texto: pieza.aMano ? SIN_NUMEROS : textoDeBarra(lectura, valor),
        cifra: muestra === null || valor === null ? null : numero(valor),
        unidad: UNIDAD_DE_BARRA,
        muestra,
        reelsDelTema: pieza.pilar ? (reelsPorTema.get(pieza.pilar) ?? 0) : 0,
      }
    })
    .sort(ordenDeBarras)

  const deLinkedin = recientes.filter((p) => p.red === "linkedin")
  const maximoLinkedin = Math.max(0, ...deLinkedin.map((p) => ultimasLinkedin.get(p.piezaId)?.impresiones ?? 0))
  const barrasDeLinkedin = deLinkedin
    .map((pieza) => {
      const lectura = ultimasLinkedin.get(pieza.piezaId)
      const valor = lectura?.impresiones ?? null
      const muestra = lectura && valor !== null ? muestraDeLinkedin(lectura) : null
      return {
        publicadoEn: pieza.publicadoEn,
        piezaId: pieza.piezaId,
        titulo: pieza.titulo,
        pilar: pilarVisible(entrada.pilares, pieza.pilar),
        valor,
        ancho: anchoDe(valor, maximoLinkedin),
        texto: valor === null ? SIN_NUMEROS : `${numero(valor)} impresiones${muestra ? ` · ${muestra}` : ""}`,
        cifra: valor === null ? null : numero(valor),
        unidad: "impresiones",
        muestra,
        reelsDelTema: 0,
      }
    })
    .sort(ordenDeBarras)

  const sinFecha = ({ publicadoEn: _, ...barra }: Barra & { publicadoEn: string }): Barra => barra
  const grupos: GrupoDeBarras[] = []
  if (barrasDeInstagram.length > 0) {
    grupos.push({
      red: "instagram",
      titulo: "Instagram",
      cifra: plural(barrasDeInstagram.length, "reel", "reels"),
      medida: MEDIDA.instagram,
      barras: barrasDeInstagram.map(sinFecha),
    })
  }
  if (barrasDeLinkedin.length > 0) {
    grupos.push({
      red: "linkedin",
      titulo: "LinkedIn",
      cifra: plural(barrasDeLinkedin.length, "post", "posts"),
      medida: MEDIDA.linkedin,
      barras: barrasDeLinkedin.map(sinFecha),
    })
  }
```

In the weeks call (until Task 6 rewrites it) replace `visibles.map(...)` with
`recientes.filter((p) => p.red === "instagram" && !p.aMano).map(...)`, and return `grupos` instead of `barras`.
If Biome flags the unused `_` binding in `sinFecha`, write it as
`function sinFecha(barra: Barra & { publicadoEn: string }): Barra { const { publicadoEn, ...resto } = barra; void publicadoEn; return resto }`
only if the lint config rejects the first form; otherwise keep the first.

- [ ] **Step 4: Run**

```bash
pnpm test:run tests/unit/metricas-modelo.test.ts
pnpm type
```

Expected: the unit file passes; `pnpm type` fails only in `app/(app)/metricas/page.tsx` (fixed in Task 8). Do not
commit a red type check: go on to Task 6 and Task 8, or temporarily keep the page compiling by reading
`modelo.grupos[0]?.barras ?? []` where it read `modelo.barras`, in this same commit.

- [ ] **Step 5: Commit**

```bash
git add lib/metricas/modelo.ts tests/unit/metricas-modelo.test.ts app/\(app\)/metricas/page.tsx
git commit -m "Split what worked by network, naming each measure"
```

### Task 6: "Semana a semana" over the same set (decision 16)

**Files:**
- Modify: `lib/metricas/modelo.ts` (`Semana`, `FilaDeSemana`, weeks)
- Test: `tests/unit/metricas-modelo.test.ts`

- [ ] **Step 1: Failing test**

Rename `reels` to `publicaciones` in the existing week assertions (`semana.reels` becomes `semana.publicaciones`,
and each `meta` gains the network prefix `Instagram · `), then add:

```ts
  it("lists every publication of a week once per network, with the network and its numbers or «sin números»", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", null, "2026-10-13T22:00:00.000Z", "Las dos"),
          enLinkedin("a", "2026-10-13T22:00:00.000Z", "Las dos"),
          { ...publicada("b", null, "2026-10-14T22:00:00.000Z", "A mano"), aMano: true },
          enLinkedin("c", "2026-10-14T23:00:00.000Z", "Sin números"),
        ],
        lecturas: [lectura("a", { guardados: 12, alcance: 2400, tiempoPromedio: null })],
        lecturasLinkedin: [lecturaLinkedin("a", { comentarios: null, compartidos: null })],
      }),
    )

    expect(modelo.semanas[0]?.publicaciones.map((f) => [f.clave, f.titulo, f.meta])).toEqual([
      ["instagram:a", "Las dos", "Instagram · 12 guardados · 2.400 de alcance"],
      ["linkedin:a", "Las dos", "LinkedIn · 1.200 impresiones · 14 reacciones"],
      ["instagram:b", "A mano", "Instagram · sin números"],
      ["linkedin:c", "Sin números", "LinkedIn · sin números"],
    ])
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run tests/unit/metricas-modelo.test.ts -t "once per network"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace `ReelDeSemana` and `Semana`:

```ts
export interface FilaDeSemana {
  /** `instagram:<piece>`: a piece on both networks is two rows. */
  clave: string
  titulo: string
  pilar: PilarVisible | null
  meta: string
}

export interface Semana {
  titulo: string
  publicaciones: FilaDeSemana[]
  resumen: string
}

function metaDeFila(
  publicacion: PublicacionMedible,
  ultimas: Map<string, LecturaDeReel>,
  ultimasLinkedin: Map<string, LecturaDeLinkedin>,
): string {
  const red = nombreDeDestino(publicacion.red)
  if (publicacion.red === "linkedin") {
    const lectura = ultimasLinkedin.get(publicacion.piezaId)
    if (!lectura || lectura.impresiones === null) return `${red} · ${SIN_NUMEROS}`
    const muestra = muestraDeLinkedin(lectura)
    return `${red} · ${numero(lectura.impresiones)} impresiones${muestra ? ` · ${muestra}` : ""}`
  }
  if (publicacion.aMano) return `${red} · ${SIN_NUMEROS}`
  return `${red} · ${metaDeReel(ultimas.get(publicacion.piezaId))}`
}

const ORDEN_DE_RED: Record<Destino, number> = { instagram: 0, linkedin: 1 }
```

(Import `nombreDeDestino` from `@/lib/dominio/destinos`.) In `construirMetricas`, replace the `semanas` block:

```ts
  // Consultations and clicks come grouped by week; publications are added to the same weeks, both networks.
  const porLunes = new Map(
    agruparPorSemana({ reels: [], consultas: entrada.consultas, clics: entrada.clics, zona }).map((s) => [
      s.lunes,
      { lunes: s.lunes, consultas: s.consultas, clics: s.clics, publicaciones: [] as PublicacionMedible[] },
    ]),
  )
  for (const publicacion of recientes) {
    const lunes = lunesDeLaSemana(Date.parse(publicacion.publicadoEn), zona)
    const semana = porLunes.get(lunes) ?? { lunes, consultas: 0, clics: 0, publicaciones: [] }
    semana.publicaciones.push(publicacion)
    porLunes.set(lunes, semana)
  }
  const semanas = [...porLunes.values()]
    .filter((semana) => semana.lunes >= desde)
    .sort((a, b) => b.lunes.localeCompare(a.lunes))
```

and the `semanas:` field of the returned object:

```ts
    semanas: semanas.map((semana) => ({
      titulo: `Semana del ${semanaDe(instanteLocal({ ...partesDe(semana.lunes), hora: 12, minuto: 0 }, zona), zona)}`,
      publicaciones: [...semana.publicaciones]
        .sort(
          (a, b) =>
            Date.parse(a.publicadoEn) - Date.parse(b.publicadoEn) || ORDEN_DE_RED[a.red] - ORDEN_DE_RED[b.red],
        )
        .map((publicacion) => ({
          clave: `${publicacion.red}:${publicacion.piezaId}`,
          titulo: publicacion.titulo,
          pilar: pilarVisible(entrada.pilares, publicacion.pilar),
          meta: metaDeFila(publicacion, ultimas, ultimasLinkedin),
        })),
      resumen: resumenDeSemana(semana.consultas, semana.clics),
    })),
```

Remove the now unused `SIN_LECTURA`.

- [ ] **Step 2b (same task): make the page compile with the new names**

In `app/(app)/metricas/page.tsx` replace `semana.reels` with `semana.publicaciones` and the row with
`<FilaPieza key={fila.clave} titulo={fila.titulo} estado={fila.meta} pilar={fila.pilar} />` (the full page rewrite is
Task 8).

- [ ] **Step 4: Run**

```bash
pnpm test:run tests/unit/metricas-modelo.test.ts
pnpm type
```

Expected: PASS; type check green.

- [ ] **Step 5: Commit**

```bash
git add lib/metricas/modelo.ts tests/unit/metricas-modelo.test.ts app/\(app\)/metricas/page.tsx
git commit -m "Count both networks week by week over the same twelve weeks"
```

### Task 7: Only active pillars are shown and compared (decision 17, A8)

**Files:**
- Modify: `lib/metricas/modelo.ts`
- Test: `tests/unit/metricas-modelo.test.ts`

- [ ] **Step 1: Move the existing tests to active pillars**

`PILARES_DE_PRUEBA` keeps the five old pillars inactive. In `tests/unit/metricas-modelo.test.ts` map each retired slug
and name to an active one (slugs first, then names):

```bash
f=tests/unit/metricas-modelo.test.ts
sed -i '' -e 's/"pareja"/"ia-salud-mental"/g' -e 's/"deseo"/"practica-clinica"/g' \
  -e 's/"autoestima"/"etica-regulacion"/g' -e 's/"limites"/"acceso-salud-publica"/g' -e 's/"bienestar"/"caso-coni"/g' \
  -e 's/Pareja y conversación/IA y salud mental/g' -e 's/Deseo y sexualidad/Práctica clínica aumentada/g' \
  -e 's/Autoestima y "ser tu propia diosa"/Ética y regulación/g' -e 's/Género y límites/Acceso y salud pública/g' \
  -e 's/Bienestar emocional/Caso Coni: humana + avatar/g' $f
grep -nE 'pareja|deseo|autoestima|limites|bienestar|Pareja|Deseo y|Autoestima|Género|Bienestar' $f || echo "clean"
pnpm test:run $f
```

Expected: `clean` and PASS. If a comparison sentence fails only because the order of two names changed with the
rename (the comparison sorts by mean, not by name, so it should not), fix the expected sentence to the new names, not
the code.

- [ ] **Step 2: Failing test**

```ts
  it("hides a retired pillar on its bar and leaves its reels out of the comparison", () => {
    const viejas = Array.from({ length: 8 }, (_, i) =>
      publicada(`v${i}`, "pareja", `2026-09-0${(i % 8) + 1}T22:00:00.000Z`),
    )
    const modelo = construirMetricas(
      entrada({
        publicaciones: [...viejas, publicada("n", "ia-salud-mental", "2026-10-06T22:00:00.000Z")],
        lecturas: [...viejas.map((p) => lectura(p.piezaId)), lectura("n")],
      }),
    )

    const barras = modelo.grupos[0]?.barras ?? []
    expect(barras.find((b) => b.piezaId === "v0")?.pilar).toBeNull()
    expect(barras.find((b) => b.piezaId === "n")?.pilar?.slug).toBe("ia-salud-mental")
    expect(modelo.comparacion?.tipo).toBe("temprano")
    if (modelo.comparacion?.tipo === "temprano") {
      expect(modelo.comparacion.temas.map((t) => t.pilar.slug)).toEqual(["ia-salud-mental"])
    }
  })
```

(This test keeps `"pareja"` on purpose: it is the retired pillar under test. The guard test only scans code dirs.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test:run tests/unit/metricas-modelo.test.ts -t "retired pillar"`
Expected: FAIL (the bar shows "Pareja y conversación"; the comparison counts eight `pareja` reels).

- [ ] **Step 4: Implement**

```ts
/** Decision 17: a retired pillar is not shown or compared; its pieces stay, without a theme line. */
function pilarActivo(catalogo: CatalogoDePilares, slug: string | null): PilarVisible | null {
  const visible = pilarVisible(catalogo, slug)
  return visible && catalogo.some((pilar) => pilar.slug === visible.slug && pilar.activa) ? visible : null
}
```

Use `pilarActivo` instead of `pilarVisible` for the `pilar` of both bar builders and of the week rows. In the
`medidos` loop, push only reels whose pillar is active:

```ts
  for (const pieza of reels) {
    const lectura = ultimas.get(pieza.piezaId)
    if (lectura && pilarActivo(entrada.pilares, pieza.pilar)) medidos.push(reelMedido(pieza, lectura))
  }
```

`reelsPorTema` is built from `medidos`, so it follows.

- [ ] **Step 5: Run and commit**

```bash
pnpm test:run tests/unit/metricas-modelo.test.ts && pnpm test:run tests/unit/sin-slugs-de-pilar.test.ts
git add lib/metricas/modelo.ts tests/unit/metricas-modelo.test.ts
git commit -m "Show and compare only the active pillars in Métricas"
```

### Task 8: The Métricas page (decisions 16, 17)

**Files:**
- Modify: `app/(app)/metricas/page.tsx`
- Modify: `tests/e2e/metricas.spec.ts` (empty state copy)

- [ ] **Step 1: Update the e2e expectations (failing)**

In `tests/e2e/metricas.spec.ts`, test "without published reels it says so and still counts consultations":

```ts
  await expect(page.getByText("Todavía no hay publicaciones.")).toBeVisible()
  await expect(page.getByText("Este mes: 0 reels en Instagram · 0 posts en LinkedIn")).toBeVisible()
  await expect(page.getByText("Este mes también: 1 consulta · 0 toques en tu link")).toBeVisible()
```

and in the first test add, after the bars:

```ts
  await expect(page.getByRole("heading", { name: "Instagram" })).toBeVisible()
  await expect(page.getByText("Guardados cada 1.000 personas que lo vieron.")).toBeVisible()
  await expect(page.getByText("Últimas 12 semanas").first()).toBeVisible()
```

Run: `pnpm test:e2e tests/e2e/metricas.spec.ts`
Expected: FAIL on the new copy.

- [ ] **Step 2: Rewrite the page**

```tsx
import { CaretDown } from "@phosphor-icons/react/dist/ssr"
import { BarraDeMetrica } from "@/components/barra-de-metrica"
import { FilaPieza } from "@/components/fila-pieza"
import { PanelDeComparacion } from "@/components/panel-de-comparacion"
import { Seccion } from "@/components/seccion"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { leerDatosDeMetricas } from "@/lib/datos/metricas"
import { type Barra, construirMetricas } from "@/lib/metricas/modelo"
import { exigirConi } from "@/lib/sesion/coni"

const BARRAS_A_LA_VISTA = 5
// Copy nuevo (brandkit 13.2, open question 2): Federico confirms the words.
const VER_LAS_DEMAS = "Ver las demás"

const RESUMEN_PLEGABLE =
  "flex min-h-fila-baja cursor-pointer list-none items-center justify-between gap-2 border-b border-hilo text-cuerpo font-semibold [&::-webkit-details-marker]:hidden"

function ListaDeBarras({ barras }: { barras: readonly Barra[] }) {
  const principales = barras.slice(0, BARRAS_A_LA_VISTA)
  const restantes = barras.slice(BARRAS_A_LA_VISTA)
  return (
    <Panel className="py-1">
      <ul>
        {principales.map((barra) => (
          <BarraDeMetrica key={barra.piezaId} {...barra} />
        ))}
      </ul>
      {restantes.length > 0 ? (
        <details>
          <summary className={RESUMEN_PLEGABLE}>
            {VER_LAS_DEMAS}
            <CaretDown aria-hidden="true" size={ICONO.medio} className="text-apagado" />
          </summary>
          <ul>
            {restantes.map((barra) => (
              <BarraDeMetrica key={barra.piezaId} {...barra} />
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  )
}

export default async function Metricas() {
  const { db } = await exigirConi()
  const modelo = construirMetricas(await leerDatosDeMetricas(db, Date.now()))
  // The week with something to read is open; the others fold.
  const semanaAbierta = Math.max(
    0,
    modelo.semanas.findIndex((semana) => semana.publicaciones.length > 0),
  )

  return (
    <div>
      <header className="grid gap-1">
        <p className="text-meta font-semibold">Métricas</p>
        <h1 data-snapshot="varia" className="mt-4 text-pantalla capitalize">
          {modelo.mes}
        </h1>
        <p className="text-cuerpo">{modelo.resumen}</p>
        <p className="text-cuerpo text-apagado">{modelo.contacto}</p>
      </header>

      {modelo.aviso ? (
        <div className="mt-6">
          <LineaDeEstado tipo="aviso" titulo={modelo.aviso} tituloEnTinta />
        </div>
      ) : null}

      {modelo.comparacion ? <PanelDeComparacion panel={modelo.comparacion} /> : null}

      <Seccion titulo="Lo que sirvió" id="sirvio">
        {modelo.vacio ? (
          <div className="grid gap-1 py-1">
            <p className="text-cuerpo font-semibold">Todavía no hay publicaciones.</p>
            <p className="text-cuerpo text-apagado">
              Cuando salga la primera, aquí vas a ver qué le sirvió a la gente.
            </p>
          </div>
        ) : (
          <>
            <p className="text-meta text-apagado">{modelo.periodo}</p>
            {modelo.grupos.length === 0 ? (
              <p className="text-cuerpo text-apagado">Nada publicado en estas semanas.</p>
            ) : (
              modelo.grupos.map((grupo) => (
                <div key={grupo.red} className="grid gap-2">
                  <div className="mx-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-meta font-semibold text-tinta">{grupo.titulo}</h3>
                    <span className="text-meta font-medium text-apagado tabular-nums">{grupo.cifra}</span>
                  </div>
                  <p className="text-meta text-apagado">{grupo.medida}</p>
                  <ListaDeBarras barras={grupo.barras} />
                </div>
              ))
            )}
          </>
        )}
      </Seccion>

      <Seccion
        titulo="Semana a semana"
        id="semanas"
        cifra={modelo.semanas.length > 0 ? modelo.semanas.length : undefined}
      >
        <p className="text-meta text-apagado">
          {`${modelo.periodo}. Los toques en tu link cuentan una vez por persona, por link y por día.`}
        </p>
        {modelo.semanas.length === 0 ? (
          <p className="text-cuerpo text-apagado">
            Cuando haya publicaciones, consultas o clics, los verás aquí por semana.
          </p>
        ) : (
          <div>
            {modelo.semanas.map((semana, i) => (
              <details key={semana.titulo} open={i === semanaAbierta} aria-label={semana.titulo}>
                <summary className={RESUMEN_PLEGABLE}>
                  <span data-snapshot="varia">{semana.titulo}</span>
                  <CaretDown aria-hidden="true" size={ICONO.medio} className="text-apagado" />
                </summary>
                {semana.publicaciones.length > 0 ? (
                  <Grupo plano lista>
                    {semana.publicaciones.map((fila) => (
                      <FilaPieza key={fila.clave} titulo={fila.titulo} estado={fila.meta} pilar={fila.pilar} />
                    ))}
                  </Grupo>
                ) : null}
                <p className="py-3 text-meta text-apagado">{semana.resumen}</p>
              </details>
            ))}
          </div>
        )}
      </Seccion>
    </div>
  )
}
```

- [ ] **Step 3: Copy check and run**

```bash
grep -n "—" app/\(app\)/metricas/page.tsx lib/metricas/modelo.ts || echo "no long dashes"
pnpm type && pnpm test:run && pnpm test:e2e tests/e2e/metricas.spec.ts
```

Expected: `no long dashes`; green. The other existing e2e expectations of this file (bars order, panel, weeks) still
hold. Visual baselines are updated in Task 19, not here.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/metricas/page.tsx tests/e2e/metricas.spec.ts
git commit -m "Show Métricas per network with the period of every number"
```

---

## Lote 3: WAV's entry

### Task 9: Pure LinkedIn helpers

**Files:**
- Create: `lib/metricas/linkedin.ts`
- Test: `tests/unit/metricas-linkedin.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest"
import { armarAnotacion, asuntoDelRecordatorio, leerCifra, postsPorAnotar } from "@/lib/metricas/linkedin"

// Monday 19 Oct 2026, 03:00 in Santiago.
const LUNES = Date.parse("2026-10-19T06:00:00.000Z")
const ZONA = "America/Santiago"
const post = (piezaId: string, publicadoEn: string) => ({ piezaId, titulo: `Post ${piezaId}`, publicadoEn })

describe("postsPorAnotar", () => {
  it("asks for the posts of the last four weeks that have no row this week, newest first", () => {
    const pendientes = postsPorAnotar({
      posts: [
        post("viejo", "2026-09-20T22:00:00.000Z"), // 29 days ago
        post("a", "2026-09-22T22:00:00.000Z"),
        post("b", "2026-10-14T22:00:00.000Z"),
        post("anotado", "2026-10-15T22:00:00.000Z"),
        post("futuro", "2026-10-20T22:00:00.000Z"),
      ],
      medidos: [
        { piezaId: "a", medidoEn: "2026-10-12" }, // last week: pending again
        { piezaId: "anotado", medidoEn: "2026-10-19" },
      ],
      ahora: LUNES,
      zona: ZONA,
    })

    expect(pendientes.map((p) => p.piezaId)).toEqual(["b", "a"])
  })
})

describe("asuntoDelRecordatorio", () => {
  it("names how many posts, singular included", () => {
    expect(asuntoDelRecordatorio(1)).toBe("Anota los números de LinkedIn (1 post)")
    expect(asuntoDelRecordatorio(3)).toBe("Anota los números de LinkedIn (3 posts)")
  })
})

describe("leerCifra", () => {
  it.each([
    ["1200", 1200],
    ["1.200", 1200],
    [" 1 200 ", 1200],
    ["0", 0],
    ["", null],
    ["  ", null],
    ["12a", "invalida"],
    ["-3", "invalida"],
    ["1,5", "invalida"],
  ])("reads %j as %j", (texto, esperado) => {
    expect(leerCifra(texto)).toBe(esperado)
  })
})

describe("armarAnotacion", () => {
  const vacio = { impresiones: "", reacciones: "", comentarios: "", compartidos: "" }
  const lleno = { impresiones: "1.200", reacciones: "14", comentarios: "3", compartidos: "1" }

  it("keeps complete posts, skips empty ones and reads the followers", () => {
    expect(
      armarAnotacion(
        [
          { piezaId: "a", titulo: "A", campos: lleno },
          { piezaId: "b", titulo: "B", campos: vacio },
        ],
        "830",
      ),
    ).toEqual({
      ok: true,
      anotacion: {
        posts: [{ piezaId: "a", impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }],
        seguidores: 830,
      },
    })
  })

  it("refuses a half-filled post, naming it", () => {
    expect(armarAnotacion([{ piezaId: "a", titulo: "Si van", campos: { ...vacio, impresiones: "5" } }], "")).toEqual({
      ok: false,
      error: "Completa los cuatro números de «Si van» o déjalos todos vacíos.",
    })
  })

  it("refuses followers that are not a count, and an empty save", () => {
    expect(armarAnotacion([], "mil")).toEqual({
      ok: false,
      error: "Los seguidores van como un número, sin letras.",
    })
    expect(armarAnotacion([{ piezaId: "a", titulo: "A", campos: vacio }], "")).toEqual({
      ok: false,
      error: "Anota al menos un post o los seguidores.",
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run tests/unit/metricas-linkedin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { lunesDeLaSemana } from "@/lib/dominio/metricas"

// What WAV has to note on LinkedIn each week, and how its fields are read (spec 2026-10-17, decisions 19 and 20).

/** Posts published in the last four weeks are asked for (amendment A10). */
export const SEMANAS_POR_ANOTAR = 4

export interface PostPorAnotar {
  piezaId: string
  titulo: string
  /** ISO instant. */
  publicadoEn: string
}

/** A post is pending when its newest row is older than this week's Monday. Newest first. */
export function postsPorAnotar(entrada: {
  posts: readonly PostPorAnotar[]
  medidos: readonly { piezaId: string; medidoEn: string }[]
  ahora: number
  zona: string
}): PostPorAnotar[] {
  const semana = lunesDeLaSemana(entrada.ahora, entrada.zona)
  const desde = entrada.ahora - SEMANAS_POR_ANOTAR * 7 * 86_400_000
  const anotados = new Set(entrada.medidos.filter((m) => m.medidoEn >= semana).map((m) => m.piezaId))
  return entrada.posts
    .filter((post) => {
      const instante = Date.parse(post.publicadoEn)
      return instante >= desde && instante <= entrada.ahora && !anotados.has(post.piezaId)
    })
    .sort((a, b) => Date.parse(b.publicadoEn) - Date.parse(a.publicadoEn))
}

export function asuntoDelRecordatorio(cuantos: number): string {
  return `Anota los números de LinkedIn (${cuantos} ${cuantos === 1 ? "post" : "posts"})`
}

export interface CamposDePost {
  impresiones: string
  reacciones: string
  comentarios: string
  compartidos: string
}

export const CAMPOS_DE_POST: readonly { campo: keyof CamposDePost; etiqueta: string }[] = [
  { campo: "impresiones", etiqueta: "Impresiones" },
  { campo: "reacciones", etiqueta: "Reacciones" },
  { campo: "comentarios", etiqueta: "Comentarios" },
  { campo: "compartidos", etiqueta: "Compartidos" },
]

export interface NumerosDePost {
  piezaId: string
  impresiones: number
  reacciones: number
  comentarios: number
  compartidos: number
}

export interface Anotacion {
  posts: NumerosDePost[]
  seguidores: number | null
}

/** "1.200", "1200" or " 1 200 " is 1200 (as LinkedIn and Chile write it); empty is null; anything else is not a count. */
export function leerCifra(texto: string): number | null | "invalida" {
  const limpio = texto.replace(/[\s.]/g, "")
  if (limpio === "") return null
  if (!/^\d{1,9}$/.test(limpio)) return "invalida"
  return Number(limpio)
}

export function armarAnotacion(
  posts: readonly { piezaId: string; titulo: string; campos: CamposDePost }[],
  seguidores: string,
): { ok: true; anotacion: Anotacion } | { ok: false; error: string } {
  const listos: NumerosDePost[] = []
  for (const post of posts) {
    if (CAMPOS_DE_POST.every(({ campo }) => post.campos[campo].trim() === "")) continue
    const numeros: Partial<Record<keyof CamposDePost, number>> = {}
    for (const { campo } of CAMPOS_DE_POST) {
      const cifra = leerCifra(post.campos[campo])
      if (typeof cifra === "number") numeros[campo] = cifra
    }
    const { impresiones, reacciones, comentarios, compartidos } = numeros
    if (impresiones === undefined || reacciones === undefined || comentarios === undefined || compartidos === undefined) {
      return { ok: false, error: `Completa los cuatro números de «${post.titulo}» o déjalos todos vacíos.` }
    }
    listos.push({ piezaId: post.piezaId, impresiones, reacciones, comentarios, compartidos })
  }
  const cuenta = leerCifra(seguidores)
  if (cuenta === "invalida") return { ok: false, error: "Los seguidores van como un número, sin letras." }
  if (listos.length === 0 && cuenta === null) return { ok: false, error: "Anota al menos un post o los seguidores." }
  return { ok: true, anotacion: { posts: listos, seguidores: cuenta } }
}
```

- [ ] **Step 4: Run and commit**

```bash
pnpm test:run tests/unit/metricas-linkedin.test.ts
git add lib/metricas/linkedin.ts tests/unit/metricas-linkedin.test.ts
git commit -m "Decide which LinkedIn posts still need this week's numbers"
```

### Task 10: Read and write WAV's numbers

**Files:**
- Create: `lib/datos/metricas-linkedin.ts`
- Test: `tests/integration/metricas-linkedin-datos.test.ts`

- [ ] **Step 1: Failing test**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { guardarNumerosDeLinkedin, leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
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

async function postEnLinkedin(titulo: string, instante: string): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
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

describe("leerLinkedinParaAnotar", () => {
  it("lists the LinkedIn posts of the last four weeks without a row this week, and this week's followers", async () => {
    const reciente = await postEnLinkedin("Reciente", "2026-10-14T22:00:00.000Z")
    const anotado = await postEnLinkedin("Anotado", "2026-10-13T22:00:00.000Z")
    await postEnLinkedin("Viejo", "2026-09-01T22:00:00.000Z")
    const soloInstagram = await sembrarPieza("publicado", { titulo: "Solo Instagram", media_id: "m" })
    await moverHoraAprobada(soloInstagram, "2026-10-14T22:00:00.000Z")
    await pool.query(
      "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen) values ($1, '2026-10-19', 10, 'manual')",
      [anotado],
    )
    await pool.query(
      "insert into public.metricas_linkedin_cuenta (semana, seguidores, origen) values ('2026-10-19', 830, 'manual')",
    )

    const lista = await leerLinkedinParaAnotar(coni, LUNES)

    expect(lista.semana).toBe("2026-10-19")
    expect(lista.medidoEn).toBe("2026-10-19")
    expect(lista.pendientes.map((p) => [p.piezaId, p.titulo])).toEqual([[reciente, "Reciente"]])
    expect(lista.seguidores).toBe(830)
  })
})

describe("guardarNumerosDeLinkedin", () => {
  it("writes manual rows sealed with Coni's id, and a second save of the day replaces the first", async () => {
    const post = await postEnLinkedin("Post", "2026-10-14T22:00:00.000Z")
    const fila = { piezaId: post, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }

    await guardarNumerosDeLinkedin(coni, { medidoEn: "2026-10-19", semana: "2026-10-19", posts: [fila], seguidores: 830 })
    await guardarNumerosDeLinkedin(coni, {
      medidoEn: "2026-10-19",
      semana: "2026-10-19",
      posts: [{ ...fila, impresiones: 1300 }],
      seguidores: null,
    })

    const { rows } = await pool.query(
      "select impresiones, origen, anotado_por from public.metricas_linkedin where pieza_id = $1",
      [post],
    )
    expect(rows).toEqual([{ impresiones: 1300, origen: "manual", anotado_por: CONI }])
    const cuenta = await pool.query("select seguidores, anotado_por from public.metricas_linkedin_cuenta")
    expect(cuenta.rows).toEqual([{ seguidores: 830, anotado_por: CONI }])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db tests/integration/metricas-linkedin-datos.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerZona } from "@/lib/datos/metricas"
import { diaLocal } from "@/lib/dominio/fechas"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import { type NumerosDePost, type PostPorAnotar, postsPorAnotar } from "@/lib/metricas/linkedin"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

export interface LinkedinParaAnotar {
  /** This week's Monday in the app's zone (`metricas_linkedin_cuenta.semana`). */
  semana: string
  /** Today in the app's zone (`metricas_linkedin.medido_en`). */
  medidoEn: string
  pendientes: PostPorAnotar[]
  /** This week's followers, if already noted. */
  seguidores: number | null
}

/** What WAV still has to note this week. Read by Métricas (Coni's session) and the Monday reminder (service role). */
export async function leerLinkedinParaAnotar(db: Db, ahora: number): Promise<LinkedinParaAnotar> {
  const zona = await leerZona(db)
  const semana = lunesDeLaSemana(ahora, zona)
  const [posts, medidos, cuenta] = await Promise.all([
    db
      .from("publicaciones")
      .select("pieza_id, marcado_en, piezas(titulo, puerta2_publicar_en)")
      .eq("destino", "linkedin")
      .in("estado", ["publicado", "subido_a_mano"]),
    db.from("metricas_linkedin_ultima").select("pieza_id, medido_en"),
    db.from("metricas_linkedin_cuenta").select("seguidores").eq("semana", semana).maybeSingle(),
  ])
  if (posts.error) throw fallo("No pude leer los posts de LinkedIn", posts.error)
  if (medidos.error) throw fallo("No pude leer los números de LinkedIn", medidos.error)
  if (cuenta.error) throw fallo("No pude leer los seguidores de LinkedIn", cuenta.error)
  return {
    semana,
    medidoEn: diaLocal(ahora, zona),
    pendientes: postsPorAnotar({
      posts: posts.data.flatMap((fila) => {
        const publicadoEn = fila.piezas?.puerta2_publicar_en ?? fila.marcado_en
        return fila.piezas && publicadoEn ? [{ piezaId: fila.pieza_id, titulo: fila.piezas.titulo, publicadoEn }] : []
      }),
      // A view types every column as nullable; the primary key keeps both present.
      medidos: medidos.data.flatMap((fila) =>
        fila.pieza_id && fila.medido_en ? [{ piezaId: fila.pieza_id, medidoEn: fila.medido_en }] : [],
      ),
      ahora,
      zona,
    }),
    seguidores: cuenta.data?.seguidores ?? null,
  }
}

/** Manual rows only: `anotado_por` and `anotado_en` are sealed by the database. Saving twice in a day replaces. */
export async function guardarNumerosDeLinkedin(
  db: Db,
  entrada: { medidoEn: string; semana: string; posts: readonly NumerosDePost[]; seguidores: number | null },
): Promise<void> {
  if (entrada.posts.length > 0) {
    const { error } = await db.from("metricas_linkedin").upsert(
      entrada.posts.map((post) => ({
        pieza_id: post.piezaId,
        medido_en: entrada.medidoEn,
        impresiones: post.impresiones,
        reacciones: post.reacciones,
        comentarios: post.comentarios,
        compartidos: post.compartidos,
        origen: "manual",
      })),
      { onConflict: "pieza_id,medido_en" },
    )
    if (error) throw fallo("No pude guardar los números de LinkedIn", error)
  }
  if (entrada.seguidores !== null) {
    const { error } = await db
      .from("metricas_linkedin_cuenta")
      .upsert({ semana: entrada.semana, seguidores: entrada.seguidores, origen: "manual" }, { onConflict: "semana" })
    if (error) throw fallo("No pude guardar los seguidores de LinkedIn", error)
  }
}
```

The two writes are not one transaction: if the second fails, the action reports the error and saving again is safe
(both are upserts).

- [ ] **Step 4: Run and commit**

```bash
pnpm test:db tests/integration/metricas-linkedin-datos.test.ts && pnpm type
git add lib/datos/metricas-linkedin.ts tests/integration/metricas-linkedin-datos.test.ts
git commit -m "Read and write the LinkedIn numbers WAV notes each week"
```

### Task 11: The action

**Files:**
- Create: `lib/acciones/metricas-linkedin.ts`
- Create: `app/(app)/metricas/acciones.ts`
- Test: `tests/integration/acciones-metricas-linkedin.test.ts`

- [ ] **Step 1: Failing test**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { anotarNumerosDeLinkedin } from "@/lib/acciones/metricas-linkedin"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>
const deps = () => ({ db: coni, ahora: () => "2026-10-19T15:00:00.000Z" })

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_linkedin_cuenta")
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

async function postPendiente(): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo: "Post" })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await moverHoraAprobada(id, "2026-10-14T22:00:00.000Z")
  return id
}

const numeros = (piezaId: string) => ({ piezaId, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 })

describe("anotarNumerosDeLinkedin", () => {
  it("saves the numbers of a pending post and the week's followers", async () => {
    const post = await postPendiente()

    const resultado = await anotarNumerosDeLinkedin(deps(), { posts: [numeros(post)], seguidores: 830 })

    expect(resultado).toEqual({ ok: true, anotados: 1 })
    const { rows } = await pool.query("select medido_en::text from public.metricas_linkedin where pieza_id = $1", [post])
    expect(rows).toEqual([{ medido_en: "2026-10-19" }])
  })

  it("refuses a post that is no longer pending, in her words, and writes nothing", async () => {
    const post = await postPendiente()
    await anotarNumerosDeLinkedin(deps(), { posts: [numeros(post)], seguidores: null })

    const otra = await anotarNumerosDeLinkedin(deps(), { posts: [numeros(post)], seguidores: 900 })

    expect(otra).toEqual({
      ok: false,
      error: "Uno de esos posts ya tiene sus números de esta semana o salió de la lista. Vuelve a abrir Métricas.",
    })
    expect((await pool.query("select * from public.metricas_linkedin_cuenta")).rowCount).toBe(0)
  })

  it("refuses an empty save", async () => {
    expect(await anotarNumerosDeLinkedin(deps(), { posts: [], seguidores: null })).toEqual({
      ok: false,
      error: "Anota al menos un post o los seguidores.",
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db tests/integration/acciones-metricas-linkedin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the action**

`lib/acciones/metricas-linkedin.ts`:

```ts
import { guardarNumerosDeLinkedin, leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { Falla } from "@/lib/dominio/falla"
import type { Anotacion } from "@/lib/metricas/linkedin"
import type { DepsAcciones } from "./piezas"
import { aResultado, type Resultado } from "./resultado"

/** WAV's weekly LinkedIn numbers (decision 19). Only posts still pending this week; the database seals who wrote them. */
export async function anotarNumerosDeLinkedin(
  deps: Pick<DepsAcciones, "db" | "ahora">,
  anotacion: Anotacion,
): Promise<Resultado<{ anotados: number }>> {
  return aResultado("anotarNumerosDeLinkedin", async () => {
    if (anotacion.posts.length === 0 && anotacion.seguidores === null) {
      throw new Falla("Anota al menos un post o los seguidores.")
    }
    const lista = await leerLinkedinParaAnotar(deps.db, Date.parse(deps.ahora()))
    const enLista = new Set(lista.pendientes.map((post) => post.piezaId))
    if (anotacion.posts.some((post) => !enLista.has(post.piezaId))) {
      throw new Falla(
        "Uno de esos posts ya tiene sus números de esta semana o salió de la lista. Vuelve a abrir Métricas.",
      )
    }
    await guardarNumerosDeLinkedin(deps.db, { medidoEn: lista.medidoEn, semana: lista.semana, ...anotacion })
    return { anotados: anotacion.posts.length }
  })
}
```

`app/(app)/metricas/acciones.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { anotarNumerosDeLinkedin } from "@/lib/acciones/metricas-linkedin"
import { comoConi } from "@/lib/acciones/servidor"

const CIFRA = z.number().int().min(0).max(999_999_999)
const anotacion = z.object({
  posts: z
    .array(
      z.object({ piezaId: z.uuid(), impresiones: CIFRA, reacciones: CIFRA, comentarios: CIFRA, compartidos: CIFRA }),
    )
    .max(50),
  seguidores: CIFRA.nullable(),
})

export async function anotarNumerosDeLinkedinAccion(entrada: z.input<typeof anotacion>) {
  const resultado = await comoConi("anotarNumerosDeLinkedin", anotacion, entrada, (deps, datos) =>
    anotarNumerosDeLinkedin(deps, datos),
  )
  if (resultado.ok) revalidatePath("/metricas")
  return resultado
}
```

- [ ] **Step 4: Run and commit**

```bash
pnpm test:db tests/integration/acciones-metricas-linkedin.test.ts && pnpm type
git add lib/acciones/metricas-linkedin.ts app/\(app\)/metricas/acciones.ts tests/integration/acciones-metricas-linkedin.test.ts
git commit -m "Add the action that saves WAV's LinkedIn numbers"
```

### Task 12: The form inside "Para WAV" on Métricas (decision 19)

**Files:**
- Create: `app/(app)/metricas/numeros-de-linkedin.tsx`
- Modify: `app/(app)/metricas/page.tsx`
- Test: `tests/unit/numeros-de-linkedin.test.tsx`

- [ ] **Step 1: Failing component test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NumerosDeLinkedin } from "@/app/(app)/metricas/numeros-de-linkedin"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const PENDIENTES = [{ piezaId: "11111111-1111-4111-8111-111111111111", titulo: "Si van a discutir", fecha: "miércoles 14 · 19:00" }]

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
}

describe("NumerosDeLinkedin", () => {
  it("sends the four numbers of a post and the followers, then says it saved", async () => {
    const alGuardar = vi.fn(async () => ({ ok: true as const, anotados: 1 }))
    render(<NumerosDeLinkedin pendientes={PENDIENTES} seguidores={null} alGuardar={alGuardar} />)

    escribir("Impresiones de Si van a discutir", "1.200")
    escribir("Reacciones de Si van a discutir", "14")
    escribir("Comentarios de Si van a discutir", "3")
    escribir("Compartidos de Si van a discutir", "1")
    escribir("Seguidores esta semana", "830")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).toHaveBeenCalledWith({
      posts: [{ piezaId: PENDIENTES[0]?.piezaId, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }],
      seguidores: 830,
    })
    expect(await screen.findByText("Guardado: 1 post.")).toBeInTheDocument()
  })

  it("does not send a half-filled post and says which one", async () => {
    const alGuardar = vi.fn()
    render(<NumerosDeLinkedin pendientes={PENDIENTES} seguidores={null} alGuardar={alGuardar} />)

    escribir("Impresiones de Si van a discutir", "5")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).not.toHaveBeenCalled()
    expect(screen.getByText("Completa los cuatro números de «Si van a discutir» o déjalos todos vacíos.")).toBeInTheDocument()
  })

  it("says when every post already has this week's numbers and keeps the followers it knows", () => {
    render(<NumerosDeLinkedin pendientes={[]} seguidores={830} alGuardar={vi.fn()} />)

    expect(
      screen.getByText("Todos los posts de las últimas 4 semanas ya tienen sus números de esta semana."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Seguidores esta semana")).toHaveValue("830")
  })
})
```

(The repo has no `@testing-library/user-event`: `fireEvent` is what the other `.test.tsx` files use. The
`next/navigation` mock is the one `tests/unit/avisos-sin-leer.test.tsx` uses; copy its exact form if it differs.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run tests/unit/numeros-de-linkedin.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the form**

```tsx
"use client"

import { type FormEvent, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"
import { type Anotacion, armarAnotacion, CAMPOS_DE_POST, type CamposDePost, SEMANAS_POR_ANOTAR } from "@/lib/metricas/linkedin"

interface PostEnLista {
  piezaId: string
  titulo: string
  /** "miércoles 14 · 19:00". */
  fecha: string
}

interface PropiedadesDeNumeros {
  pendientes: readonly PostEnLista[]
  seguidores: number | null
  alGuardar: (anotacion: Anotacion) => Promise<Resultado<{ anotados: number }>>
}

const VACIOS: CamposDePost = { impresiones: "", reacciones: "", comentarios: "", compartidos: "" }
const CAMPO = "campo w-full text-cuerpo tabular-nums"

/** Decision 19: WAV copies each post's four numbers from LinkedIn once a week, plus the followers. Rows only. */
export function NumerosDeLinkedin({ pendientes, seguidores, alGuardar }: PropiedadesDeNumeros) {
  const [campos, setCampos] = useState<Record<string, CamposDePost>>({})
  const [textoDeSeguidores, setTextoDeSeguidores] = useState(seguidores === null ? "" : String(seguidores))
  const [invalido, setInvalido] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<string | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  function cambiar(piezaId: string, campo: keyof CamposDePost, valor: string) {
    setGuardado(null)
    setCampos((actuales) => ({ ...actuales, [piezaId]: { ...(actuales[piezaId] ?? VACIOS), [campo]: valor } }))
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setGuardado(null)
    const armada = armarAnotacion(
      pendientes.map((post) => ({ piezaId: post.piezaId, titulo: post.titulo, campos: campos[post.piezaId] ?? VACIOS })),
      textoDeSeguidores,
    )
    if (!armada.ok) {
      setInvalido(armada.error)
      return
    }
    setInvalido(null)
    ejecutar(
      () => alGuardar(armada.anotacion),
      (resultado) => {
        setCampos({})
        setGuardado(resultado.anotados === 1 ? "Guardado: 1 post." : `Guardado: ${resultado.anotados} posts.`)
      },
    )
  }

  return (
    <form onSubmit={guardar} className="grid gap-6 pb-5">
      <p className="text-meta text-apagado">
        {`Posts de LinkedIn de las últimas ${SEMANAS_POR_ANOTAR} semanas sin números de esta semana. Cópialos de las estadísticas de cada publicación.`}
      </p>
      {pendientes.length === 0 ? (
        <p className="text-cuerpo">
          {`Todos los posts de las últimas ${SEMANAS_POR_ANOTAR} semanas ya tienen sus números de esta semana.`}
        </p>
      ) : (
        <ul className="grid gap-6">
          {pendientes.map((post) => (
            <li key={post.piezaId} className="grid gap-3">
              <p className="grid gap-0.5">
                <span className="text-cuerpo font-semibold">{post.titulo}</span>
                <span data-snapshot="varia" className="text-meta text-apagado">
                  {post.fecha}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {CAMPOS_DE_POST.map(({ campo, etiqueta }) => (
                  <label key={campo} className="grid gap-1">
                    <span className="text-meta font-semibold">{etiqueta}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={`${etiqueta} de ${post.titulo}`}
                      value={(campos[post.piezaId] ?? VACIOS)[campo]}
                      onChange={(evento) => cambiar(post.piezaId, campo, evento.target.value)}
                      className={CAMPO}
                    />
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <label className="grid gap-1">
        <span className="text-meta font-semibold">Seguidores esta semana</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={textoDeSeguidores}
          onChange={(evento) => {
            setGuardado(null)
            setTextoDeSeguidores(evento.target.value)
          }}
          className={CAMPO}
        />
      </label>
      {invalido ? <LineaDeEstado tipo="error" titulo={invalido} /> : null}
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      {guardado ? <LineaDeEstado tipo="exito" titulo={guardado} /> : null}
      <Boton type="submit" variante="secundario" cargando={pendiente}>
        Guardar números
      </Boton>
    </form>
  )
}
```

- [ ] **Step 4: Mount it in the page**

In `app/(app)/metricas/page.tsx` add the imports

```tsx
import { MasOpciones } from "@/components/ui/mas-opciones"
import { leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { etiquetaDeFecha } from "@/lib/dominio/fechas"
import { anotarNumerosDeLinkedinAccion } from "./acciones"
import { NumerosDeLinkedin } from "./numeros-de-linkedin"
```

read both in parallel

```tsx
  const { db } = await exigirConi()
  const ahora = Date.now()
  const [datos, paraAnotar] = await Promise.all([leerDatosDeMetricas(db, ahora), leerLinkedinParaAnotar(db, ahora)])
  const modelo = construirMetricas(datos)
```

and add after the "Semana a semana" section:

```tsx
      {/* Decision 19: WAV's weekly LinkedIn numbers, folded out of her way as in Ajustes. */}
      <MasOpciones className="mt-8" titulo="Para WAV" resumen="Números de LinkedIn">
        <NumerosDeLinkedin
          pendientes={paraAnotar.pendientes.map((post) => ({
            piezaId: post.piezaId,
            titulo: post.titulo,
            fecha: etiquetaDeFecha(post.publicadoEn, datos.zona, "corta"),
          }))}
          seguidores={paraAnotar.seguidores}
          alGuardar={anotarNumerosDeLinkedinAccion}
        />
      </MasOpciones>
```

- [ ] **Step 5: Run and commit**

```bash
pnpm test:run tests/unit/numeros-de-linkedin.test.tsx && pnpm type && pnpm test:run
grep -n "—" app/\(app\)/metricas/*.tsx lib/metricas/linkedin.ts || echo "no long dashes"
git add app/\(app\)/metricas/numeros-de-linkedin.tsx app/\(app\)/metricas/page.tsx tests/unit/numeros-de-linkedin.test.tsx
git commit -m "Let WAV note LinkedIn numbers inside Para WAV on Métricas"
```

### Task 13: E2E of WAV's entry

**Files:**
- Modify: `tests/e2e/metricas.spec.ts`

- [ ] **Step 1: Write the test** (it fails until Lotes 1 to 3 are in; run it now to confirm it passes)

Add `marcarPublicacion`, `quitarPublicacion` to the `siembra` import, add
`await pool.query("delete from public.metricas_linkedin_cuenta")` to `limpiar()`, then:

```ts
test("WAV notes a LinkedIn post's numbers in Para WAV and Coni sees them in what worked", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "etica-regulacion", gancho: "Lo que firma un modelo" })
  const id = await sembrarPieza("publicado", { titulo: "Lo que firma un modelo", idea_id: idea })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await moverLaHoraAprobada(id, 2)

  await page.goto("/metricas")
  await expect(page.getByRole("heading", { name: "LinkedIn" })).toBeVisible()
  await expect(page.getByText("sin números").first()).toBeVisible()

  await abrirDesplegable(page, "Para WAV")
  await page.getByLabel("Impresiones de Lo que firma un modelo").fill("1.200")
  await page.getByLabel("Reacciones de Lo que firma un modelo").fill("14")
  await page.getByLabel("Comentarios de Lo que firma un modelo").fill("3")
  await page.getByLabel("Compartidos de Lo que firma un modelo").fill("1")
  await page.getByLabel("Seguidores esta semana").fill("830")
  await page.getByRole("button", { name: "Guardar números" }).click()

  await expect(page.getByText("Guardado: 1 post.")).toBeVisible()
  await expect(page.getByText("Todos los posts de las últimas 4 semanas ya tienen sus números de esta semana.")).toBeVisible()
  await expect(page.getByText("1.200", { exact: true })).toBeVisible()
  await expect(page.getByText("14 reacciones · 3 comentarios · 1 vez compartido").first()).toBeVisible()
  const { rows } = await pool.query(
    "select origen, anotado_por is not null as sellado from public.metricas_linkedin where pieza_id = $1",
    [id],
  )
  expect(rows).toEqual([{ origen: "manual", sellado: true }])
  await capturar(page, "metricas-linkedin-anotado")
})
```

(`abrirDesplegable` comes from `./ayudas`; add it to the import.)

- [ ] **Step 2: Run**

Run: `pnpm test:e2e tests/e2e/metricas.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/metricas.spec.ts
git commit -m "Cover WAV's LinkedIn entry end to end"
```

---

## Lote 4: Monday reminder

### Task 14: `Anota los números de LinkedIn (N posts)` on Mondays (decision 20)

**Files:**
- Create: `lib/mantenimiento/numeros-linkedin.ts`
- Modify: `lib/mantenimiento/ejecutar.ts:50-75`
- Test: `tests/integration/numeros-linkedin.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { DETALLE_DEL_RECORDATORIO, recordarNumerosDeLinkedin } from "@/lib/mantenimiento/numeros-linkedin"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

const LUNES = "2026-10-19T06:00:00.000Z" // 03:00 in Santiago, when the nightly run starts
const MARTES = "2026-10-20T06:00:00.000Z"

const deps = (ahora: string, avisos = notificadorEnMemoria()) => ({ db: clienteDeServicio(), avisos, ahora: () => ahora })

async function postEnLinkedin(instante: string): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo: "Post" })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await moverHoraAprobada(id, instante)
  return id
}

beforeEach(vaciarPiezasEIdeas)
afterAll(async () => {
  await vaciarPiezasEIdeas()
  await pool.end()
})

describe("recordarNumerosDeLinkedin", () => {
  it("tells WAV on Monday how many posts wait for their numbers", async () => {
    await postEnLinkedin("2026-10-14T22:00:00.000Z")
    await postEnLinkedin("2026-10-08T22:00:00.000Z")
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("avisado")
    expect(avisos.aWavEnviados).toEqual([
      { asunto: "Anota los números de LinkedIn (2 posts)", detalle: DETALLE_DEL_RECORDATORIO },
    ])
  })

  it("says nothing on another day", async () => {
    await postEnLinkedin("2026-10-14T22:00:00.000Z")
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(MARTES, avisos))).toBe("no_es_lunes")
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("says nothing on Monday when no post is pending", async () => {
    await postEnLinkedin("2026-09-01T22:00:00.000Z") // older than four weeks
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("al_dia")
    expect(avisos.aWavEnviados).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db tests/integration/numeros-linkedin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/mantenimiento/numeros-linkedin.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerZona } from "@/lib/datos/metricas"
import { leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { diaLocal } from "@/lib/dominio/fechas"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import { asuntoDelRecordatorio } from "@/lib/metricas/linkedin"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsNumerosLinkedin {
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoRecordatorio = "no_es_lunes" | "al_dia" | "avisado"

export const DETALLE_DEL_RECORDATORIO =
  "Entra a Métricas con la sesión de Coni, abre «Para WAV» y anota impresiones, reacciones, comentarios y compartidos de cada post (están en las estadísticas de cada publicación de LinkedIn), y los seguidores de la semana."

/**
 * Decision 20: on Mondays only, and only with posts pending. The nightly run starts once a day with no retries, so this
 * goes out at most once a week; the API or Metricool (decision 21) will turn it off by filling the rows.
 */
export async function recordarNumerosDeLinkedin(deps: DepsNumerosLinkedin): Promise<ResultadoRecordatorio> {
  const ahora = Date.parse(deps.ahora())
  const zona = await leerZona(deps.db)
  if (lunesDeLaSemana(ahora, zona) !== diaLocal(ahora, zona)) return "no_es_lunes"
  const { pendientes } = await leerLinkedinParaAnotar(deps.db, ahora)
  if (pendientes.length === 0) return "al_dia"
  await deps.avisos.aWav(asuntoDelRecordatorio(pendientes.length), DETALLE_DEL_RECORDATORIO)
  return "avisado"
}
```

In `lib/mantenimiento/ejecutar.ts` import it, extend `DepsNocturno` with `& DepsNumerosLinkedin`, add the job after
`linkedin` and update the doc comment:

```ts
/** At 03:00 America/Santiago: file retention, Instagram's token, LinkedIn's expiry, the Monday reminder of LinkedIn's numbers, the backup of the database and the merges of topics. */
export function mantenimientoNocturno(deps: DepsNocturno) {
  return enSerie({
    retencion: () => aplicarRetencion(deps),
    token: () => mantenerTokenMeta(deps),
    linkedin: () => mantenerTokenLinkedin(deps),
    numerosLinkedin: () => recordarNumerosDeLinkedin(deps),
    respaldo: () => respaldarBase(deps),
    fusiones: async () => {
      const propias = await deps.temas()
      return propias ? fusionarTemas(propias) : OMITIDO
    },
  })
}
```

`depsNocturno()` (`lib/produccion/deps-reales.ts:203`) already provides `db`, `avisos` and `ahora`: no change there.

- [ ] **Step 4: Run**

```bash
pnpm test:db tests/integration/numeros-linkedin.test.ts tests/integration/mantenimiento-temas.test.ts
pnpm test:run tests/unit/mantenimiento-ejecutar.test.ts tests/unit/mantenimiento-task.test.ts
pnpm type
```

Expected: PASS (the nightly integration test gets `numerosLinkedin` as `no_es_lunes` or `al_dia`, whatever its clock).

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/numeros-linkedin.ts lib/mantenimiento/ejecutar.ts tests/integration/numeros-linkedin.test.ts
git commit -m "Remind WAV on Mondays to note the LinkedIn numbers"
```

---

## Lote 5: Ritmo and Agenda

### Task 15: `yaPublico` from `publicaciones` (A5)

**Files:**
- Modify: `lib/datos/calendario.ts`
- Test: `tests/integration/datos-calendario.test.ts`

- [ ] **Step 1: Failing test** (add `marcarPublicacion` to the `siembra` import)

```ts
describe("primera publicación", () => {
  it("knows she has published only once a network row went out or was uploaded by her", async () => {
    await sembrarPieza("programado", { titulo: "Programada" })
    expect((await leerDatosDeCalendario(coni, Date.now())).yaPublico).toBe(false)

    const subida = await sembrarPieza("para_subir_a_mano", { titulo: "Subida" })
    await marcarPublicacion(subida, "instagram", "subido_a_mano")
    expect((await leerDatosDeCalendario(coni, Date.now())).yaPublico).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db tests/integration/datos-calendario.test.ts`
Expected: FAIL (`yaPublico` undefined).

- [ ] **Step 3: Implement**

In `leerDatosDeCalendario` add `yaPublico: boolean` to the return type, a fifth query to the `Promise.all`

```ts
    // Decision 22: "before her first publication" is read where publishing is recorded (decision 15).
    db.from("publicaciones").select("pieza_id").in("estado", ["publicado", "subido_a_mano"]).limit(1),
```

destructured as `publicada`, its check `if (publicada.error) throw fallo("No pude saber si ya publicó", publicada.error)`
and `yaPublico: publicada.data.length > 0,` in the returned object.

- [ ] **Step 4: Run and commit**

```bash
pnpm test:db tests/integration/datos-calendario.test.ts && pnpm type
git add lib/datos/calendario.ts tests/integration/datos-calendario.test.ts
git commit -m "Read whether Coni has published anything yet"
```

(`pnpm type` stays green: the calendar page passes `{ ...datos, ahora }`, and a spread is not checked for extra
properties; Task 16 makes `construirCalendario` read it.)

### Task 16: Ritmo teaches before the first publication (decision 22)

**Files:**
- Modify: `lib/calendario/modelo.ts` (`ModeloDeCalendario.ritmo`, `construirRitmo`, `construirCalendario`)
- Test: `tests/unit/calendario-modelo.test.ts`

- [ ] **Step 1: Failing tests**

Change the helper so existing tests keep their meaning:

```ts
function calendario(piezas: PiezaDeCalendario[], ahora = AHORA, primeraPublicacion?: string, yaPublico = true) {
  return construirCalendario({
    piezas,
    horario: HORARIO,
    ahora,
    primeraPublicacion,
    yaPublico,
    pilares: PILARES_DE_PRUEBA,
  })
}
```

(add `yaPublico: true` to the two direct `construirCalendario({...})` calls in the file), then in `describe("Ritmo")`:

```ts
  it("teaches her schedule before her first publication, instead of counting 0 of 0", () => {
    const { ritmo } = calendario([pieza({ estado: "programado", publicarEn: alas19(17) })], AHORA, undefined, false)

    expect(ritmo.antesDeEmpezar).toBe(
      "Todavía no publicas. Tu ritmo es martes, jueves y sábado a las 19:00. Cuando salga la primera pieza, aquí verás si vas al día.",
    )
    expect(ritmo.sugerencia).toBeNull()
    expect(ritmo.vacio).toBe(false)
  })

  it("names a single day without a list", () => {
    const { ritmo } = construirCalendario({
      piezas: [],
      horario: { ...HORARIO, dias: [4], hora: "18:30:00" },
      ahora: AHORA,
      yaPublico: false,
      pilares: PILARES_DE_PRUEBA,
    })

    expect(ritmo.antesDeEmpezar).toBe(
      "Todavía no publicas. Tu ritmo es jueves a las 18:30. Cuando salga la primera pieza, aquí verás si vas al día.",
    )
  })

  it("counts as before once she has published", () => {
    const { ritmo } = calendario([pieza({ estado: "publicado", publicarEn: alas19(8) })])

    expect(ritmo.antesDeEmpezar).toBeNull()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run tests/unit/calendario-modelo.test.ts`
Expected: FAIL (`antesDeEmpezar` undefined; the type of `yaPublico` unknown).

- [ ] **Step 3: Implement**

Add to `ModeloDeCalendario.ritmo`:

```ts
    /** Before her first publication (decision 22): her schedule in words, shown instead of the count. */
    antesDeEmpezar: string | null
```

Add under `DIA_LARGO`:

```ts
/** "martes, jueves y sábado". */
function diasEnPalabras(dias: readonly number[]): string {
  const nombres = [...dias].sort((a, b) => a - b).map((dia) => DIA_LARGO[dia - 1] ?? "")
  if (nombres.length <= 1) return nombres.join("")
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
}
```

`construirRitmo` gets a fifth parameter `yaPublico: boolean`; its return becomes:

```ts
  return {
    vacio: fechadas.length === 0,
    columnas: dias.map((d) => DIA_CORTO[d - 1] ?? ""),
    semanas: semanas.map((s) => ({ etiqueta: etiqueta(s.inicio), celdas: s.celdas })),
    resumen: `Tu horario tiene ${espacios} ${espacios === 1 ? "espacio" : "espacios"} por semana. En estas ${SEMANAS_DE_RITMO} semanas van ${usados} de ${esperados}.`,
    antesDeEmpezar: yaPublico
      ? null
      : `Todavía no publicas. Tu ritmo es ${diasEnPalabras(dias)} a las ${horario.hora.slice(0, 5)}. Cuando salga la primera pieza, aquí verás si vas al día.`,
    sugerencia: yaPublico ? sugerirCambio({ semanas, dias, lunesDeLaPrimera }) : null,
  }
```

`construirCalendario`'s input gets

```ts
  /** Any network row out or uploaded by her (decision 15); false before her first publication. */
  yaPublico: boolean
```

and passes `entrada.yaPublico` to `construirRitmo`. `app/(app)/calendario/page.tsx` already spreads `datos`, which
carries `yaPublico` since Task 15.

- [ ] **Step 4: Run and commit**

```bash
pnpm test:run tests/unit/calendario-modelo.test.ts && pnpm type
git add lib/calendario/modelo.ts tests/unit/calendario-modelo.test.ts
git commit -m "Teach the schedule in Ritmo before the first publication"
```

### Task 17: Ritmo's teaching state on screen

**Files:**
- Modify: `components/ritmo-del-calendario.tsx`
- Test: `tests/unit/ritmo-del-calendario.test.tsx` (create)
- Modify: `tests/e2e/calendario.spec.ts`

- [ ] **Step 1: Failing component test**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RitmoDelCalendario } from "@/components/ritmo-del-calendario"

const TEXTO = "Todavía no publicas. Tu ritmo es martes, jueves y sábado a las 19:00. Cuando salga la primera pieza, aquí verás si vas al día."
const BASE = { columnas: ["Mar", "Jue", "Sáb"], semanas: [], resumen: "van 0 de 0", sugerencia: null }

describe("RitmoDelCalendario", () => {
  it("teaches the schedule with a link to Ajustes before the first publication, never «0 de 0»", () => {
    render(<RitmoDelCalendario ritmo={{ ...BASE, vacio: true, antesDeEmpezar: TEXTO }} />)

    expect(screen.getByText(TEXTO)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cambiar días y hora" })).toHaveAttribute("href", "/ajustes")
    expect(screen.queryByText("van 0 de 0")).toBeNull()
  })

  it("keeps the grid of what is scheduled under the teaching text", () => {
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: TEXTO,
          semanas: [{ etiqueta: "12 oct", celdas: [{ tipo: "libre", falta: false }, { tipo: "llena", pilar: null, titulo: "Uno" }, { tipo: "libre", falta: false }] }],
        }}
      />,
    )

    expect(screen.getByText(TEXTO)).toBeInTheDocument()
    expect(screen.getByText("Reel")).toBeInTheDocument()
    expect(screen.queryByText("van 0 de 0")).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run tests/unit/ritmo-del-calendario.test.tsx`
Expected: FAIL (no teaching text, no link).

- [ ] **Step 3: Implement**

In `components/ritmo-del-calendario.tsx`, at the start of `RitmoDelCalendario`:

```tsx
  const ensenanza = ritmo.antesDeEmpezar ? (
    <div className="grid gap-3">
      <p className="text-cuerpo">{ritmo.antesDeEmpezar}</p>
      <Link href="/ajustes" className={clasesDeBoton({ variante: "callado", tamano: "chico", className: "w-fit" })}>
        Cambiar días y hora
      </Link>
    </div>
  ) : null
  if (ritmo.vacio) {
    return (
      ensenanza ?? (
        <p className="text-cuerpo text-apagado">
          Cuando haya reels publicados o programados, aquí verás cómo se reparten por semana.
        </p>
      )
    )
  }
```

and replace `<p className="text-cuerpo">{ritmo.resumen}</p>` with `{ensenanza ?? <p className="text-cuerpo">{ritmo.resumen}</p>}`.

- [ ] **Step 4: E2E: the existing rhythm test needs a publication; add the teaching one**

In `tests/e2e/calendario.spec.ts`, in "the rhythm shows the last four weeks ..." change the seed to
`await pieza("publicado", "Un reel", "acceso-salud-publica")` (the count only shows once she has published). Add:

```ts
test("before her first publication, Ritmo says her schedule and links to Ajustes", async ({ page }) => {
  await pieza("programado", "Un reel", "acceso-salud-publica")

  await page.goto("/calendario?vista=ritmo")

  await expect(page.getByText(/^Todavía no publicas\. Tu ritmo es .+ a las \d{2}:\d{2}\. Cuando salga la primera pieza, aquí verás si vas al día\.$/)).toBeVisible()
  await expect(page.getByText(/van \d+ de \d+/)).toHaveCount(0)
  await page.getByRole("link", { name: "Cambiar días y hora" }).click()
  await expect(page).toHaveURL(/\/ajustes$/)
})
```

- [ ] **Step 5: Run and commit**

```bash
pnpm test:run tests/unit/ritmo-del-calendario.test.tsx && pnpm type
pnpm test:e2e tests/e2e/calendario.spec.ts
git add components/ritmo-del-calendario.tsx tests/unit/ritmo-del-calendario.test.tsx tests/e2e/calendario.spec.ts
git commit -m "Show Ritmo's teaching state with a link to Ajustes"
```

### Task 18: Agenda lists the next three free slots, then `y N libres más` (A4)

**Files:**
- Modify: `lib/calendario/modelo.ts` (`construirAgenda`, `ModeloDeCalendario.agenda`)
- Modify: `components/agenda-del-calendario.tsx`
- Test: `tests/unit/calendario-modelo.test.ts`, `tests/e2e/calendario.spec.ts`

- [ ] **Step 1: Failing model test** (in `describe("Agenda")`)

```ts
  it("lists only the next three free slots and says how many more each week has", () => {
    const { agenda } = calendario([])

    const libres = agenda.semanas.flatMap((s) => s.huecos).filter((h) => h.ocupante === null)
    expect(libres.map((h) => h.dia)).toEqual(["Jueves 15", "Sábado 17", "Martes 20"])
    expect(agenda.semanas.map((s) => s.libresMas)).toEqual([
      null,
      "y 2 libres más",
      "y 3 libres más",
      "y 3 libres más",
    ])
  })

  it("never hides a slot that has a piece, and says «1 libre» in the singular", () => {
    const { agenda } = calendario([
      pieza({ estado: "programado", publicarEn: alas19(15) }),
      pieza({ estado: "programado", publicarEn: alas19(17) }),
      pieza({ estado: "programado", publicarEn: alas19(20) }),
      pieza({ estado: "programado", publicarEn: alas19(22) }),
    ])

    expect(agenda.semanas[0]?.huecos.map((h) => h.ocupante !== null)).toEqual([true, true])
    expect(agenda.semanas[1]?.huecos.map((h) => [h.dia, h.ocupante !== null])).toEqual([
      ["Martes 20", true],
      ["Jueves 22", true],
      ["Sábado 24", false],
    ])
    expect(agenda.semanas[2]?.libresMas).toBe("y 1 libre más")
  })
```

(With `HORARIO` Tue/Thu/Sat and `AHORA` Thursday 15 at 12:00: week 0 has Thu 15 and Sat 17, weeks 1 to 3 have three
slots each. In the second test week 2 shows Tue 27 and Thu 29 free (slots 2 and 3), hiding Sat 31: `y 1 libre más`.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run tests/unit/calendario-modelo.test.ts -t "free slots|singular"`
Expected: FAIL (`libresMas` undefined; all twelve free slots listed).

- [ ] **Step 3: Implement**

Type: `agenda: { semanas: { titulo: string; huecos: Hueco[]; libresMas: string | null }[] }`. Constant:

```ts
/** Decision 22 (amendment A4): the Agenda lists the next three free slots; the rest are counted per week. */
const LIBRES_A_LA_VISTA = 3
```

In `construirAgenda`, after the `enCamino.forEach(...)` that fills proposals, replace the `return` with:

```ts
  let libresVistos = 0
  const visible = new Set(
    huecos.filter((hueco) => {
      if (hueco.ocupante !== null) return true
      libresVistos += 1
      return libresVistos <= LIBRES_A_LA_VISTA
    }),
  )

  return {
    semanas: Array.from({ length: SEMANAS_DE_AGENDA }, (_, i) => {
      const inicio = sumarDias(lunes, 7 * i)
      const deLaSemana = huecos.filter((hueco) => lunesDeLaSemana(Date.parse(hueco.instante), zona) === inicio)
      const ocultos = deLaSemana.filter((hueco) => !visible.has(hueco)).length
      return {
        titulo: `Semana del ${semanaDe(instanteDeHueco(inicio, "12:00", zona), zona)}`,
        huecos: deLaSemana.filter((hueco) => visible.has(hueco)),
        libresMas: ocultos === 0 ? null : ocultos === 1 ? "y 1 libre más" : `y ${ocultos} libres más`,
      }
    }),
  }
```

In `components/agenda-del-calendario.tsx`, change the prop type to
`semanas: { titulo: string; huecos: readonly Hueco[]; libresMas: string | null }[]` and the week body to:

```tsx
          {semana.huecos.length > 0 ? (
            <Grupo lista>
              {semana.huecos.map((hueco) => (
                <FilaDeHorario key={hueco.instante} hueco={hueco} />
              ))}
            </Grupo>
          ) : semana.libresMas === null ? (
            <p className="py-2 text-meta text-apagado">Sin espacios de publicación en lo que queda de esta semana.</p>
          ) : null}
          {semana.libresMas ? <p className="py-2 text-meta text-apagado">{semana.libresMas}</p> : null}
```

- [ ] **Step 4: E2E expectation**

In `tests/e2e/calendario.spec.ts`, the agenda test: replace
`expect(await libres.count()).toBeGreaterThanOrEqual(4)` with

```ts
  expect(await libres.count()).toBeLessThanOrEqual(3)
  await expect(page.getByText(/^y \d+ libres? más$/).first()).toBeVisible()
```

- [ ] **Step 5: Run and commit**

```bash
pnpm test:run tests/unit/calendario-modelo.test.ts && pnpm type
pnpm test:e2e tests/e2e/calendario.spec.ts
git add lib/calendario/modelo.ts components/agenda-del-calendario.tsx tests/unit/calendario-modelo.test.ts tests/e2e/calendario.spec.ts
git commit -m "List only the next three free slots in the Agenda"
```

---

## Lote 6: Snapshots and axe

### Task 19: Snapshots of Métricas with LinkedIn and of the empty Ritmo

**Files:**
- Modify: `tests/e2e/visual.spec.ts`
- Update: `tests/e2e/visual.spec.ts-snapshots/*` (baselines)

- [ ] **Step 1: Add the two captures** (add `marcarPublicacion`, `moverHoraAprobada`, `quitarPublicacion` to the
  `siembra` import)

```ts
test("metricas con linkedin", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.consultas")
  await pool.query("delete from public.clics_enlace_dia")
  await pool.query("delete from public.metricas_linkedin_cuenta")
  const ambas = await sembrarPieza("publicado", { titulo: "Si van a discutir, siéntense del mismo lado", media_id: "media_v1" })
  await marcarPublicacion(ambas, "linkedin")
  const soloLinkedin = await sembrarPieza("publicado", { titulo: "Lo que firma un modelo" })
  await quitarPublicacion(soloLinkedin, "instagram")
  await marcarPublicacion(soloLinkedin, "linkedin")
  const aMano = await sembrarPieza("publicado_a_mano", { titulo: "Subido a mano" })
  // The flow approves for tomorrow: an hour ago keeps them in this month and in the window every day but the first hour
  // of a month.
  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString()
  for (const id of [ambas, soloLinkedin, aMano]) await moverHoraAprobada(id, haceUnaHora)
  await pool.query(
    "insert into public.metricas_reel (pieza_id, dia, alcance, guardados, compartidos, comentarios, tiempo_promedio) values ($1, (now() at time zone 'America/Santiago')::date, 2400, 121, 30, 7, 24400)",
    [ambas],
  )
  await pool.query(
    "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen) values ($1, (now() at time zone 'America/Santiago')::date, 1200, 14, 3, 1, 'manual')",
    [ambas],
  )
  await page.goto("/metricas")
  await capturaDe(page, "metricas-con-linkedin")
})

test("calendario ritmo vacio", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await page.goto("/calendario?vista=ritmo")
  await capturaDe(page, "calendario-ritmo-vacio")
})
```

(The weeks' titles are masked; the header counts are stable because the pieces are moved to an hour ago.)

- [ ] **Step 2: Generate and review the baselines**

```bash
pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots
git status --short tests/e2e/visual.spec.ts-snapshots
```

Expected changed or new baselines, and only these: `metricas` (header lines, periods, Instagram group),
`metricas-con-linkedin` (new), `calendario-ritmo` (the scene has no publication: teaching text over the grid),
`calendario-ritmo-vacio` (new), `calendario-agenda` (three free slots and `y N libres más`). Open each PNG and check
by eye: copy as in this plan, no clipped text, the "Para WAV" fold closed at the bottom of Métricas. Any other changed
baseline is a regression: stop and investigate.

- [ ] **Step 3: Run again without updating**

Run: `pnpm test:e2e tests/e2e/visual.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/visual.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "Capture Métricas with LinkedIn and the empty Ritmo"
```

### Task 20: axe on the new states

**Files:**
- Modify: `tests/e2e/accesibilidad.spec.ts`

- [ ] **Step 1: Open "Para WAV" on Métricas in the route audit**

In `abrirPliegues`, after the `/ajustes` branch:

```ts
  if (ruta === "/metricas") {
    // WAV's LinkedIn numbers fold under "Para WAV".
    await abrirDesplegable(page, "Para WAV")
    return
  }
```

- [ ] **Step 2: The states the scene does not have**

Add `marcarPublicacion`, `moverHoraAprobada`, `quitarPublicacion`, `vaciarPiezasEIdeas` to the `siembra` import, then:

```ts
// Part 3: Métricas with a LinkedIn post pending in Para WAV, a manual upload, and Ritmo before the first publication.
test("Métricas with LinkedIn and Para WAV open, and the empty Ritmo, pass WCAG 2.x AA", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 2600 })
  await vaciarPiezasEIdeas()
  const post = await sembrarPieza("publicado", { titulo: "Lo que firma un modelo" })
  await quitarPublicacion(post, "instagram")
  await marcarPublicacion(post, "linkedin")
  // The flow approves for tomorrow; a pending post must already be out.
  await moverHoraAprobada(post, new Date(Date.now() - 2 * 86_400_000).toISOString())
  await sembrarPieza("publicado_a_mano", { titulo: "Subido a mano" })

  await page.goto("/metricas")
  await abrirDesplegable(page, "Para WAV")
  await expect(page.getByLabel("Impresiones de Lo que firma un modelo")).toBeVisible()
  const metricas = await hallazgosDeAxe(page, "metricas con linkedin")

  await vaciarPiezasEIdeas()
  await page.goto("/calendario?vista=ritmo")
  await expect(page.getByRole("link", { name: "Cambiar días y hora" })).toBeVisible()
  const ritmo = await hallazgosDeAxe(page, "ritmo vacio")

  expect([...metricas, ...ritmo]).toEqual([])
})
```

- [ ] **Step 3: Run**

Run: `pnpm test:e2e tests/e2e/accesibilidad.spec.ts`
Expected: PASS, including "every control on every screen is at least 44 x 44" with the fold open (the `campo` inputs
and the secondary button are objective-sized). If a target is too small, fix the class in the form, not the test.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/accesibilidad.spec.ts
git commit -m "Audit Métricas with LinkedIn and the empty Ritmo with axe"
```

---

## Lote 7: Docs and verification

### Task 21: `docs/TRASPASO.md`

**Files:**
- Modify: `docs/TRASPASO.md` ("Lo que está hecho", after the Part 2 bullet)

- [ ] **Step 1: Add the entry**

```markdown
- **Métricas y ritmo, parte 3** (spec `docs/superpowers/specs/2026-10-17-conidolly-logica-design.md`, decisiones 15 a 22; plan `docs/superpowers/plans/2026-10-17-metricas-linkedin.md`, rama `feat/metricas-linkedin`, sin desplegar): lo publicado sale de `publicaciones` (`publicado` o `subido_a_mano`), una vez por red; la hora que cuenta es la firmada en la puerta 2. El encabezado dice «Este mes: N reels en Instagram · N posts en LinkedIn» y debajo consultas y toques del mes. «Lo que sirvió» y «Semana a semana» dicen «Últimas 12 semanas» y cuentan lo mismo; «Lo que sirvió» va en dos grupos: Instagram (guardados cada 1.000, como antes) y LinkedIn (impresiones). Lo subido a mano y los posts sin números dicen «sin números». Solo se muestran y comparan pilares activos. Tablas `metricas_linkedin` y `metricas_linkedin_cuenta` (lectura Coni y WAV; escritura `manual` desde la sesión de Coni o del mantenedor, porque WAV trabaja en la sesión de Coni; `api` y `metricool` solo el servicio; quién anotó lo sella un trigger) y la vista `metricas_linkedin_ultima`. WAV anota cada semana en Métricas, «Para WAV»: los posts de LinkedIn de las últimas 4 semanas sin fila esta semana (impresiones, reacciones, comentarios, compartidos) y los seguidores. El mantenimiento nocturno, solo los lunes y si hay posts pendientes, le escribe a WAV «Anota los números de LinkedIn (N posts)». Ritmo, antes de la primera publicación, explica el horario con enlace a Ajustes; la Agenda muestra los próximos 3 espacios libres y luego «y N libres más» por semana. Migración `20261017000300` (métricas de LinkedIn). Pendiente sin código (decisión 21): Federico pide `r_member_postAnalytics` para la app de LinkedIn; WAV pregunta a Metricool si su API da estadísticas de perfil personal y en qué plan.
```

- [ ] **Step 2: Commit**

```bash
git add docs/TRASPASO.md
git commit -m "Record metrics and rhythm in the handoff"
```

### Task 22: Full verification and review

**Files:** none (fixes go in their own commits, with a test first).

- [ ] **Step 1: Full suites**

```bash
pnpm db:reset
pnpm type
pnpm test:run
pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-metricas.txt
diff /tmp/lint-base-metricas.txt /tmp/lint-metricas.txt
pnpm build
pnpm test:e2e
```

Expected: all green; unit and integration counts grow by this plan's tests (compare with Task 0); empty lint diff;
only the baselines listed in Task 19 changed.

- [ ] **Step 2: Banned patterns in my own diff**

```bash
git diff main -- lib app components | grep -nE "as any|@ts-expect-error|—|catch \{\s*\}|#[0-9a-fA-F]{3,6}\b" || echo "clean"
grep -rn '"use client"' app/\(app\)/metricas/numeros-de-linkedin.tsx | head -1
```

Expected: `clean` (no `any`, no long dash in copy, no empty catch, no hex colour in components); line 1 of the form is
`"use client"`.

- [ ] **Step 3: Render the real routes** (RSC boundary check): with `pnpm dev` running against the local database,
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/metricas` after signing in through the e2e session is
not practical; instead rely on `pnpm test:e2e` having loaded `/metricas` and `/calendario?vista=ritmo` and
`/calendario?vista=agenda` (Tasks 8, 13, 17, 18, 19, 20). Confirm in the Playwright report that none of them logged
a server error.

- [ ] **Step 4: Code review** with `superpowers:requesting-code-review` on `main..feat/metricas-linkedin`, giving the
reviewer amendments A1 to A11, the decisions D1 to D4 and the Lote reviews. Focus: RLS of the new tables (A1), the
"published" source (decision 15, A3), the pending rule (A10), copy rules (es-CL, tú, no long dashes). Fix findings
test-first.

- [ ] **Step 5: Critique of the touched screens** (`impeccable` critique, as for parts 1 and 2): Métricas with
LinkedIn (fold closed and open), Métricas empty, Ritmo before the first publication, Agenda with free slots; at phone
width, with large text and on a desktop width for the "Para WAV" form. Record the scores in the merge message.

- [ ] **Step 6: No commit** unless a fix was needed.

---

## Lote 8: Deploy runbook

### Task 23: Deploy runbook (Federico; nothing runs without his explicit OK, step by step)

Federico runs every production command from the **macOS Terminal** (not the app's terminal), where his keys live.
**Order: database, then Trigger.dev, then the app.**

- **Old code on the new database is safe:** the migration only adds two tables, one view, one function and two
  triggers on the new tables; nothing the running app or worker reads changes.
- **New code on the old database is not:** the new Métricas page and the nightly job read
  `metricas_linkedin_ultima` and `metricas_linkedin_cuenta`; they would fail without them. Hence the order.

- [ ] **Step 1 (OK needed): merge, no push unless asked.** `git checkout main && git merge --no-ff feat/metricas-linkedin`.
`git push` only when Federico asks.

- [ ] **Step 2 (OK needed): database.** `supabase db push` from the repo (Federico). It applies `20261017000300`.
Check in the SQL editor of `estudio-coni` (`mvfytttfxmzzjajecsch`):

```sql
select tablename, policyname, cmd from pg_policies
 where tablename in ('metricas_linkedin', 'metricas_linkedin_cuenta') order by 1, 3;
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'metricas_linkedin' and grantee in ('anon', 'authenticated') order by 1, 2;
select count(*) from public.metricas_linkedin_ultima;
```

Expected: three policies per table (SELECT, INSERT, UPDATE); `authenticated` has INSERT, SELECT, UPDATE (no DELETE),
`anon` nothing; the view answers `0`.

- [ ] **Step 3 (OK needed): Trigger.dev** (the nightly maintenance gains the Monday job):

```bash
pnpm install --frozen-lockfile
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

Note the version it prints (after `20261017.2`). If it fails, stop and fix before the app (the old app works with the
new database meanwhile).

- [ ] **Step 4 (OK needed): app** (Federico), from a clean export so `.worktrees/` is not uploaded:

```bash
cd /Users/fede/Projects/estudio-coni
rm -rf /tmp/estudio-deploy && mkdir /tmp/estudio-deploy && git archive main | tar -x -C /tmp/estudio-deploy
cp -R .vercel /tmp/estudio-deploy/ && cd /tmp/estudio-deploy && vercel deploy --prod --yes
```

Wait 15 to 45 s for the alias, then confirm it is served: open `/metricas` with Coni's session and check that the
header reads `Este mes: ... en Instagram · ... en LinkedIn` and that "Para WAV" opens (a hard refresh if the old page
shows: check the live HTML before re-fixing anything).

- [ ] **Step 5 (OK needed): smoke.** WAV notes one real LinkedIn post in "Para WAV"; in the SQL editor:

```sql
select pieza_id, medido_en, impresiones, origen, anotado_por is not null as sellado from public.metricas_linkedin
 order by anotado_en desc limit 5;
```

Expected: the row with `origen = 'manual'` and `sellado = true`. On the next Monday after 03:00, check the run of
`mantenimiento-nocturno` in Trigger.dev: `numerosLinkedin` is `avisado` (and WAV got the email) or `al_dia`.

- [ ] **Step 6: Handoff.** Update `docs/TRASPASO.md` "Producción" (migrations up to `20261017000300`, the new Trigger
version) and the Part 3 bullet ("en producción desde ...") in a commit on `main`, pushed only if Federico asks.

---

## Self-review (2026-10-17)

- **Spec coverage.** Decision 15: Task 3 (reader from `publicaciones`, per network), Task 15 (Ritmo's source; a piece
  fills one slot as before). Decision 16: Task 4 (header, singular), Tasks 5 and 6 (`Últimas 12 semanas` on both
  sections, same set), Task 5 (`sin números`). Decision 17: Task 5 (two groups, each naming its measure), Task 7
  (active pillars). Decision 18: Task 1 (tables, RLS as amended by A1, newest row via the view). Decision 19: Tasks
  9 to 13. Decision 20: Task 14. Decision 21: no code (documented in Task 21). Decision 22: Tasks 15 to 17 (teaching
  state with link), Task 18 (free slots, A4). Spec tests: model tests (Tasks 4 to 7, 16, 18), RLS (Task 1), Monday
  reminder only with pending posts (Task 14), E2E of WAV's entry (Task 13), snapshots (Task 19), axe (Task 20).
  Docs (Task 21) and deploy with order and safety (Task 23).
- **Placeholders.** None. One conditional note is an explicit fallback with the exact alternative (the `sinFecha`
  lint form in Task 5).
- **Type consistency.** `PublicacionMedible`, `LecturaDeLinkedin`, `EntradaDeMetricas.publicaciones` /
  `lecturasLinkedin` (Task 3) are used by Tasks 4 to 7; `Barra.valor`, `GrupoDeBarras`, `ModeloDeMetricas.grupos`
  (Task 5) and `Semana.publicaciones`, `FilaDeSemana.clave` (Task 6) are what the page reads (Task 8);
  `PostPorAnotar`, `postsPorAnotar`, `NumerosDePost`, `Anotacion`, `CAMPOS_DE_POST`, `SEMANAS_POR_ANOTAR`,
  `armarAnotacion`, `asuntoDelRecordatorio` (Task 9) are used by Tasks 10 to 14; `leerLinkedinParaAnotar` and
  `guardarNumerosDeLinkedin` (Task 10) by Tasks 11, 12 and 14; `yaPublico` (Task 15) by Task 16;
  `ritmo.antesDeEmpezar` (Task 16) by Task 17; `agenda.semanas[].libresMas: string | null` (Task 18) by its component.
- **Risks I checked.** A maintainer-only write policy would have blocked the only place WAV works (A1); writing
  `anotado_por` from the client would let anyone sign as someone else (trigger seal); switching Instagram to reach
  would have broken the comparison (A2); `primeraPublicacion` counts scheduled pieces, so it cannot tell "never
  published" (A5); hiding free slots inside Ritmo's grid would have broken its weeks (A4); the existing agenda and
  rhythm e2e tests assert the old behaviour and are updated in Tasks 17 and 18; Task 3 keeps Métricas' output
  unchanged so the lote stays green commit by commit; the nightly run has no retries, so the Monday job cannot send
  twice.
