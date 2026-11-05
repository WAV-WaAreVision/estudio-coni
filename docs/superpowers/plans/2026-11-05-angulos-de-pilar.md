# Pillars per network (15d): angles of a pillar and the balance warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the three merged pillars their two angles as data, store each idea's angle (proposed by Claude, corrected by Coni until she signs gate 1), write guiones and carousels with the angle's voice and format, show the angle next to the pillar, and warn Coni once a week per angle when an angle with a minimum falls short, in Inicio, the 08:30 summary and the Temas row, never blocking anything.

**Architecture:** One additive migration adds `pilar_angulos` (seeded with the six angles of Coni's manuals, read by Coni and WAV, written only by migrations), `ideas.angulo_id` with the trigger `exigir_angulo_de_pilar` (the angle belongs to the idea's pillar, a pillar change clears it, a gate-1 signature locks it), the view `piezas_con_angulo` (published pieces with an angle, once each) and the notice kind `equilibrio_de_angulo`. `leerPilares` carries each pillar's angles; a pure module `lib/dominio/angulos.ts` decides the shortfalls; the 08:30 summary writes the notices; every Claude proposer gets a tolerant `angulo` field; the guion and carousel prompts get one angle line; a client control `ElegirAngulo` saves the angle in place and redraws with `useRedibujar`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (RLS, a composite foreign key, a before trigger, a security-invoker view), Zod 4, Anthropic SDK through `pedirJson` (structured outputs, cached guides), Trigger.dev v4, Vitest (unit, and integration against local Supabase), Playwright (project `app` on the phone), Biome (safe mode only), Tailwind v4 semantic tokens.

---

## Read before starting

- Spec (approved by Federico, 2026-11-05, with the corrections listed after it): `docs/superpowers/specs/2026-11-05-angulos-de-pilar-design.md`. Coni's source: `docs/pedido-coni-2026-10-31/respuesta-coni-temas-pilares-2026-11-04.md`, part 1 section 6 and parts 3 and 4. What 15a to 15c left: `docs/superpowers/plans/2026-11-04-pilares-por-red.md`, `2026-11-04-temas-por-red.md`, `2026-11-05-borradores-de-pilares.md` (their Decisions; 15c's decision 21 on `redirect()` and `useIrA`).
- Work in the worktree `/Users/fede/Projects/estudio-coni/.worktrees/angulos-de-pilar` (branch `feat/angulos-de-pilar`). Every command below runs from that directory.
- Local stack: `pnpm db:start` once. After writing or changing the migration: `pnpm db:reset` then `pnpm db:types` (regenerates `lib/supabase/database.types.ts`; never edit it by hand).
- Test commands: `pnpm test:run <files>` (unit), `pnpm test:db <files>` (integration; `como(sesion, fn)` in `tests/integration/db.ts` runs in a transaction that is always rolled back; `fallaCon` returns a statement's error behind a savepoint), `pnpm test:e2e` (Playwright, `--project=app` is the phone; one worker).
- `pnpm type`, `pnpm lint` (Biome check; `pnpm check` to fix, never `--unsafe`; after any Biome fix, `head -1` of every client file you touched still prints `"use client"`).
- Code rules: TDD strict, no `any`, no `@ts-expect-error`, no silent catch. Copy for Coni: Spanish (Chile), "tú", **no em dashes** (`tests/unit/diseno-reglas.test.ts`), semantic tokens only. Targets `min-h-objetivo`.
- No code may name a pillar slug, and from Task 4 on no code may name an angle slug either (`tests/unit/sin-slugs-de-pilar.test.ts` scans `lib`, `app`, `components`, `trigger`, `scripts`). Tests, the E2E scene and SQL may.
- **Lessons from 15c, binding here:** never call a Server Action's `redirect()` from a page reached by client navigation; this feature changes the angle in place, so the control redraws with `useRedibujar` (`components/use-redibujar.ts`), as `PilaresDelTema` does after "Cambiar pilares", and never navigates. Every submit or change handler ignores a second call while one is pending. The Temas pillar track stays keyed by network only (`key={filtros.red}`) and every chip keeps its key. Claude calls go through `pedirJson`, whose guide carries `cache_control` unless `cachearGuia: false` (one-off guides); keep the angle rule in the user message of the cached guides so the guide's cache stays warm. The prompts are pinned byte by byte in `tests/unit/anthropic-instrucciones.test.ts`: change only the cases a task names, with `-t`.
- Patterns to copy:
  - a table read by Coni and WAV, written only by migrations, tied to a network's pillar: `pilar_pesos` in `supabase/migrations/20261104000100_pilares_por_red.sql:83-111`;
  - a notice kind added: `supabase/migrations/20261103000100_presupuesto.sql:163-171` and `lib/avisos/tipos.ts`;
  - a security-invoker view over `publicaciones`: `temas_tratados` in `supabase/migrations/20261104000300_temas_tratados.sql`;
  - a nightly notice that waits for the summary: `lib/mantenimiento/revision-de-inventario.ts`;
  - an inline form that saves and redraws: `app/(app)/biblioteca/temas/[id]/pilares-del-tema.tsx`;
  - published pieces seeded in a test: `pieza()` in `tests/integration/temas-por-red.test.ts:28-63`;
  - a signed gate 1 in a test: `aprobada()` in `tests/integration/aprobar-voz-esquema.test.ts:12-23`.
- Commit after every task with `git add <files>` and `git commit -m "<English imperative sentence>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Do not push, do not run anything against production.

## Decisions where the spec is silent

1. **`pilares:aplicar` sets the angles in a second step; `aplicar_lote_de_pilares` stays as 15a wrote it.** The spec asked to redefine the RPC. The lot is still pending in production (`pnpm pilares:aplicar` waits for Coni's review), and rewriting a 150-line definer function to add one key is the riskiest change for the least gain. The script applies the lot through the untouched RPC, then writes each named angle with the service role (`ponerAngulosDelLote`). If that second step fails the lot stays applied without those angles and the message says to set them on the idea's card. The undo needs nothing: restoring the pillar clears the angle through the trigger.
2. **The 15a CSV keeps working.** `leerCsvPorRed` accepts the 15a header (no `angulo`) and the new one; `aCsvPorRed` writes the new one, with `angulo` after `pilar_nuevo`. Coni's Markdown list gains an «Ángulo» column for ideas.
3. **`DatosDePilar.angulos` is required** (the catalog always knows, empty for a layer or a pillar without angles). The fields that carry an angle to a screen or a prompt are optional, absent meaning "no angle", so the many existing fixtures and props keep compiling: `PilarVisible.angulo`, `PilarDeEleccion.angulos`, `IdeaParaGuion.angulo`, `PiezaDeCalendario.angulo`, `IdeaDeBanco.angulo`.
4. **`pilarVisible(catalogo, slug, anguloId?)` adds the `angulo` key only when the idea has one,** so every existing `toEqual` on it holds. An angle id that is not one of the pillar's throws, as an unknown slug does (the trigger makes it a bug, not data).
5. **The label is "Pilar corto · Ángulo"** (`etiquetaDePilar`). The bank's `nombreCortoPilar` carries that label, so the card, the search and "Elegir varias" show it with no new prop. It is not shown in Metrics (grouped by pillar), in the calendar's rhythm grid (`ritmo-del-calendario`, cells too narrow for a second name) or in Inicio's failure rows (`AvisoDeInicio` has no piece id).
6. **The angle is changed in place, saved on change.** `ElegirAngulo` is a labelled `<select>` («Ángulo»: the pillar's angles, then «Sin ángulo»); choosing saves at once, the select is disabled while it saves and a change during a save is ignored, a failure puts the previous value back and says why, success says "Listo, guardé el ángulo." and redraws with `useRedibujar`. It takes the action as a prop, so the bank's client tree and the server pages both pass it and unit tests need no module mock. It renders nothing for a pillar without angles.
7. **Where Coni changes it:** the bank's card (`CartaDeIdea` children), her own idea's confirmation (`IdeaPropia`, radios like the pillar's), and the guion and carousel gate-1 screens while `puerta1_en` is null (a slot under the header). After the signature the angle shows only as text.
8. **The action takes the angle's id;** Claude, the own-idea form and the CSV speak slugs, resolved with `anguloPorSlug(catalogo, pilar, slug)`.
9. **Tolerant answer field:** `textoONulo()` (`z.preprocess` to null, then `z.string().nullable()`): the schema sent still requires the key; an answer without it reads null. After parsing, an angle that is not one of the chosen pillar's becomes null.
10. **The rule** (`faltasDeAngulo`): per active pillar, its rows of `piezas_con_angulo`, newest first. Share: only with 6 pieces; short when fewer than `ceil(6 × minimo − 1e-9)` (2) are of the angle; the tolerance keeps `6 × 0.333…` from rounding up past 2. Time: the reference is the angle's latest piece, else the pillar's first counted piece; short when it is 21 days old or more and the pillar has a counted piece after it (with none of the angle, the first piece counts itself). One shortfall per angle, the share first.
11. **The week** is the Monday of the Monday to Sunday week in `ajustes.zona` (`lunesDeLaSemana` of `lib/dominio/metricas.ts`); `clave = equilibrio_de_angulo:<angulo_id>:<lunes>`.
12. **Words:** share: "En «Psicología en la mesa», ninguna de tus últimas 6 piezas es de «Lo que construyo». Tu regla es al menos 2 de cada 6." ("solo 1 de tus últimas 6 piezas es", "solo 3 de tus últimas 6 piezas son"); time: "Llevas 3 semanas sin publicar piezas de «Lo que construyo» en «Psicología en la mesa»."; push: "Un ángulo de tus pilares necesita piezas"; route `/biblioteca/temas`; chip line «Falta Lo que construyo» («Falta A y B» for two).
13. **A failed balance check never holds back the summary:** the other notices go out, then the run throws (`onFailure` tells WAV; the retry checks again).
14. **The Temas mark is computed at load** with the same rule, so it ends with the shortfall, not with the week.
15. **Only the engine's and the own idea's prompts list the angles** (`listaDePilares(pilares, { angulos: true })`); the one-off reclassification of 2026-10-17 keeps its text and hash.
16. **The prompt line:** after «Pilar:», `Ángulo: <nombre> (<descripcion>)` and `Escribe con la voz y el formato del ángulo.` on its own line; an idea without an angle sends the prompt exactly as today.
17. **Baselines.** Three new phone baselines: `guion-por-aprobar-angulo`, `ideas-angulo` and `biblioteca-temas-falta-angulo`. No existing baseline should move: the scene's ideas sit on pillars without angles and its Temas has no published piece with an angle.

## File structure

**Create**

| File | Responsibility |
|---|---|
| `supabase/migrations/20261105000200_angulos_de_pilar.sql` | `pilar_angulos` and its seed, `ideas.angulo_id` and its trigger, `piezas_con_angulo`, the notice kind |
| `lib/dominio/angulos.ts` | Pure: the balance rule, its words, the notice key, the Temas mark |
| `lib/datos/angulos.ts` | `leerPiezasConAngulo`, `leerFaltasDeAngulo` |
| `lib/avisos/equilibrio.ts` | `avisarEquilibrioDeAngulos`: one notice per shortfall and week |
| `app/(app)/ideas/elegir-angulo.tsx` | Client: the «Ángulo» select that saves in place |
| `tests/integration/angulos-esquema.test.ts` | Table, seed, policies, the composite key |
| `tests/integration/angulos-ideas.test.ts` | `ideas.angulo_id` and its trigger |
| `tests/integration/piezas-con-angulo.test.ts` | The view |
| `tests/integration/angulos-en-pantallas.test.ts` | Readers carry the angle; `cargarContexto` |
| `tests/unit/angulos.test.ts` | The pure module |
| `tests/unit/anthropic-angulos.test.ts` | Each proposer's tolerant angle; the guion and carousel line |
| `tests/unit/elegir-angulo.test.tsx` | `ElegirAngulo` |
| `tests/unit/idea-propia-angulo.test.tsx` | The angle in `IdeaPropia` |
| `tests/unit/etiqueta-de-pilar.test.tsx` | The label on `FilaPieza`, `EstadoSencillo`, `FilaDeTemas` |
| `tests/e2e/angulos.spec.ts` | Coni changes the angle on gate 1; Temas and Inicio warn; axe; large text |

**Modify**

| File | Change |
|---|---|
| `lib/supabase/database.types.ts` | Regenerated |
| `lib/dominio/pilares.ts` | `DatosDeAngulo`, `OpcionDeAngulo`, angles on pillars, `pilarVisible` third argument, `angulosDelPilar`, `anguloPorSlug`, `etiquetaDePilar` |
| `lib/datos/pilares.ts` | `leerPilares` reads the angles |
| `lib/avisos/tipos.ts`, `lib/avisos/resumen.ts` | The new kind; the check inside the summary |
| `lib/proveedores/anthropic/nucleo.ts`, `secciones.ts`, `teorias.ts`, `ideas.ts`, `pilares.ts`, `guion.ts`, `carrusel.ts` | `textoONulo`, angle lists, rules, the guion line |
| `lib/motor/semanal.ts` | `guardarIdeas` stores the angle |
| `lib/acciones/ideas.ts`, `app/(app)/ideas/acciones.ts` | `crearIdeaPropia` takes the angle; `cambiarAngulo` |
| `lib/pilares/por-red.ts`, `lib/pilares/ejecutar-por-red.ts`, `lib/datos/pilares-por-red.ts` | The CSV's `angulo`; `ponerAngulosDelLote` |
| `lib/datos/repositorio.ts`, `lib/produccion/contexto.ts`, `lib/produccion/producir.ts`, `lib/produccion/carrusel.ts` | The idea's angle reaches the writer |
| `lib/datos/inicio.ts`, `lib/datos/calendario.ts`, `lib/calendario/modelo.ts`, `lib/datos/banco.ts`, `lib/ideas/mazo.ts` | Readers carry the angle |
| `app/(app)/page.tsx`, `app/(app)/ideas-semana.tsx`, `app/(app)/ideas/page.tsx`, `banco-de-ideas.tsx`, `idea-propia.tsx`, `app/(app)/guion/[id]/page.tsx`, `carrusel.tsx`, `pantalla-guion.tsx`, `pantalla-carrusel.tsx`, `puerta-2-carrusel.tsx`, `app/(app)/video/[id]/page.tsx`, `pantalla-video.tsx`, `components/fila-pieza.tsx`, `components/estado-sencillo.tsx`, `components/agenda-del-calendario.tsx` | The label, the control |
| `app/(app)/biblioteca/temas/page.tsx`, `fila-de-temas.tsx` | «Falta <ángulo>» |
| `tests/fixtures/pilares.ts`, `tests/integration/datos-pilares.test.ts`, `tests/unit/anthropic-instrucciones.test.ts`, `tests/unit/anthropic-teorias-motor.test.ts`, `tests/integration/motor-semanal.test.ts`, `tests/unit/pilares-por-red.test.ts`, `tests/integration/pilares-por-red-script.test.ts`, `tests/integration/acciones-ideas.test.ts`, `tests/integration/resumen-diario.test.ts`, `tests/unit/avisos.test.ts`, `tests/unit/sin-slugs-de-pilar.test.ts`, `tests/unit/banco-de-ideas.test.tsx`, `tests/unit/biblioteca-pagina-temas.test.tsx` | Follow the changes |
| `tests/e2e/escena.ts`, `tests/e2e/visual.spec.ts` | `conAngulo`, `sembrarPublicadasConAngulo`; three captures |

---

# Phase 1: data

### Task 1: The angles table and its seed

**Files:**
- Create: `tests/integration/angulos-esquema.test.ts`
- Create: `supabase/migrations/20261105000200_angulos_de_pilar.sql`
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/angulos-esquema.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(async () => {
  await pool.end()
})

describe("pilar_angulos", () => {
  it("holds the six angles of Coni's manuals, two per merged pillar, with the two minimums", async () => {
    const { rows } = await pool.query<{ pilar: string; slug: string; nombre: string; orden: number; tope: number | null }>(
      `select c.slug as pilar, a.slug, a.nombre, a.orden, ceil(6 * a.minimo)::int as tope
         from public.pilar_angulos a join public.categorias c on c.id = a.pilar_id
        order by c.red, c.orden, a.orden`,
    )
    // `red` sorts instagram before linkedin.
    expect(rows).toEqual([
      { pilar: "mi-nueva-partida", slug: "lo-vivo", nombre: "Lo vivo", orden: 1, tope: null },
      { pilar: "mi-nueva-partida", slug: "pruebalo-tu", nombre: "Pruébalo tú", orden: 2, tope: 2 },
      { pilar: "bienestar-e-impacto", slug: "lo-que-se-ve", nombre: "Lo que se ve", orden: 1, tope: null },
      { pilar: "bienestar-e-impacto", slug: "como-se-mide", nombre: "Cómo se mide", orden: 2, tope: null },
      { pilar: "psicologia-en-la-mesa", slug: "lo-que-planteo", nombre: "Lo que planteo", orden: 1, tope: null },
      { pilar: "psicologia-en-la-mesa", slug: "lo-que-construyo", nombre: "Lo que construyo", orden: 2, tope: 2 },
    ])
  })

  it("keeps each angle's voice and format in its description, as the manuals say them", async () => {
    const { rows } = await pool.query<{ descripcion: string }>(
      "select descripcion from public.pilar_angulos where slug = 'lo-que-construyo'",
    )
    expect(rows[0]?.descripcion).toBe(
      "Mi caso a la vista. Una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg. Voz íntima, fotos reales, demos y video.",
    )
  })

  it("is read by Coni and WAV, by nobody else, and written by nobody through the API", async () => {
    await como(comoConi, async (c) => {
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(6)
      for (const sesion of [comoConi, comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        const escrito = await fallaCon(c, "update public.pilar_angulos set nombre = 'Otro'")
        expect(escrito.code).toBe("42501")
        const borrado = await fallaCon(c, "delete from public.pilar_angulos")
        expect(borrado.code).toBe("42501")
      }
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(6)
      await asumir(c, comoServicio)
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(6)
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(0)
    })
  })

  it("belongs to a network's pillar, never to a layer nor to a pillar without a network", async () => {
    await como(comoPostgres, async (c) => {
      const insertar = (slugDelPilar: string, esCapa: string) =>
        fallaCon(
          c,
          `insert into public.pilar_angulos (pilar_id, red, es_capa, slug, nombre, descripcion, orden)
           select id, red, ${esCapa}, 'nuevo', 'Nuevo', 'Una descripción.', 9 from public.categorias where slug = $1`,
          [slugDelPilar],
        )
      // The layer as what it is: the check refuses it.
      expect((await insertar("capa-tdah", "es_capa")).code).toBe("23514")
      // The layer passed off as a pillar: no categorias row has that (id, red, es_capa).
      expect((await insertar("capa-tdah", "false")).code).toBe("23503")
      // A pillar of 2026-10-17, without a network.
      expect((await insertar("caso-coni", "false")).code).toBe("23514")
    })
  })
})
```


- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/angulos-esquema.test.ts`
Expected: FAIL, `relation "public.pilar_angulos" does not exist`.

- [ ] **Step 3: Write the migration's first part**

Create `supabase/migrations/20261105000200_angulos_de_pilar.sql`:

```sql
-- Angles of a pillar (spec 2026-11-05, part 15d). Additive: a table and its seed, a column with its trigger, a view and
-- one more notice kind. No existing row changes.

-- An angle is a way to approach a merged pillar, with its own voice and format (Coni's manuals, §22 and §23). Like
-- pilar_pesos, the composite key ties it to a network's pillar: a pillar with angles can neither become a layer nor
-- lose its network. `minimo` is the least share of the pillar's pieces the angle must have (1/3), or null.
create table public.pilar_angulos (
  id uuid primary key default gen_random_uuid(),
  pilar_id uuid not null,
  red text,
  es_capa boolean not null default false,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text not null check (btrim(descripcion) <> ''),
  orden int not null check (orden > 0),
  minimo numeric check (minimo > 0 and minimo <= 1),
  constraint pilar_angulos_pilar foreign key (pilar_id, red, es_capa)
    references public.categorias (id, red, es_capa),
  -- `red` may be null here only so this check, not a not-null error, names the rule; a null skips the foreign key.
  constraint angulo_de_pilar_de_red check (red is not null and not es_capa),
  constraint pilar_angulos_slug unique (pilar_id, slug),
  constraint pilar_angulos_orden unique (pilar_id, orden)
);

alter table public.pilar_angulos enable row level security;
-- Only migrations write (spec 15d, out of scope: editing angles in the app).
revoke all on public.pilar_angulos from anon, authenticated, service_role;
grant select on public.pilar_angulos to authenticated, service_role;
create policy "coni y wav leen angulos" on public.pilar_angulos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create trigger auditar after insert or update or delete on public.pilar_angulos
  for each row execute function public.registrar_evento();

-- Coni's answer of 2026-11-04, parts 3 and 4: each angle's definition, then its voice and format (and series). The
-- minimum is 1.0 / 3, not a rounded decimal, so ceil(6 * minimo) is 2.
insert into public.pilar_angulos (pilar_id, red, es_capa, slug, nombre, descripcion, orden, minimo)
select c.id, c.red, c.es_capa, v.slug, v.nombre, v.descripcion, v.orden, v.minimo
from (values
  ('bienestar-e-impacto', 'lo-que-se-ve', 'Lo que se ve',
   'Lo que RRHH y yo observamos en las personas y los equipos cuando ya usan IA, incluso como apoyo emocional: estrés, desgaste, bienestar. Voz íntima, texto en primera persona.',
   1, null::numeric),
  ('bienestar-e-impacto', 'como-se-mide', 'Cómo se mide',
   'Medir el impacto humano y no solo la adopción: indicadores, evaluación de pilotos, instrumentos. Voz declarativa, carrusel PDF con datos.',
   2, null),
  ('psicologia-en-la-mesa', 'lo-que-planteo', 'Lo que planteo',
   'La IA y la salud mental como tema país y académico: IA ética, datos de salud, regulación y el rol de la psicología en diseñar y evaluar la IA. Voz declarativa, carrusel con datos y fuentes revisadas.',
   1, null),
  ('psicologia-en-la-mesa', 'lo-que-construyo', 'Lo que construyo',
   'Mi caso a la vista. Una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg. Voz íntima, fotos reales, demos y video.',
   2, 1.0 / 3),
  ('mi-nueva-partida', 'lo-vivo', 'Lo vivo',
   'Mi giro de psicóloga que aprende a entrenar modelos, construye y emprende, con dudas, números y avances. Reel detrás de escena y Stories, voz íntima. Series «Mi nueva partida» y «Lo probé».',
   1, null),
  ('mi-nueva-partida', 'pruebalo-tu', 'Pruébalo tú',
   'Usar la IA con criterio en su propia reinvención. Reel de pantalla y carrusel paso a paso. Series «Prompt con inteligencia emocional» y «Pequeño experimento».',
   2, 1.0 / 3)
) as v (pilar, slug, nombre, descripcion, orden, minimo)
join public.categorias c on c.slug = v.pilar;
```

- [ ] **Step 4: Rebuild, regenerate and run**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/angulos-esquema.test.ts`
Expected: PASS (4 tests). `git diff --stat lib/supabase/database.types.ts` shows `pilar_angulos` added.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000200_angulos_de_pilar.sql lib/supabase/database.types.ts tests/integration/angulos-esquema.test.ts
git commit -m "Add the angles of the merged pillars as data, seeded from Coni's manuals" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `ideas.angulo_id` and its guard

**Files:**
- Create: `tests/integration/angulos-ideas.test.ts`
- Modify: `supabase/migrations/20261105000200_angulos_de_pilar.sql` (append)
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/angulos-ideas.test.ts`:

```ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, fallaCon, pool } from "./db"
import { AVATAR, crearPiezaEn } from "./flujo"

afterAll(async () => {
  await pool.end()
})

const HASH = "f".repeat(64)

async function angulo(c: pg.PoolClient, slug: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.pilar_angulos where slug = $1", [slug])
  const id = rows[0]?.id
  if (!id) throw new Error(`No existe el ángulo ${slug}`)
  return id
}

async function idea(c: pg.PoolClient, pilar: string, anguloId: string | null = null): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.ideas (pilar, angulo_id, gancho, fuerza) values ($1, $2, 'Gancho', 'alta') returning id",
    [pilar, anguloId],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la idea")
  return id
}

async function anguloDe(c: pg.PoolClient, ideaId: string): Promise<string | null> {
  const { rows } = await c.query<{ angulo_id: string | null }>("select angulo_id from public.ideas where id = $1", [
    ideaId,
  ])
  return rows[0]?.angulo_id ?? null
}

/** A piece of `ideaId` signed by Coni at gate 1, as the app writes it (`aprobar-voz-esquema.test.ts`). */
async function firmada(c: pg.PoolClient, ideaId: string): Promise<string> {
  const id = await crearPiezaEn(c, "guion_por_aprobar")
  await asumir(c, comoPostgres)
  await c.query("update public.piezas set idea_id = $2, version = version + 1 where id = $1", [id, ideaId])
  await asumir(c, comoConi)
  await c.query(
    `update public.piezas set estado = 'guion_aprobado', puerta1_hash = $2, puerta1_en = now(), avatar_id = $3,
       puerta1_formula = 3, version = version + 1 where id = $1`,
    [id, HASH, AVATAR],
  )
  await asumir(c, comoPostgres)
  return id
}

describe("ideas.angulo_id", () => {
  it("takes an angle of the idea's pillar and refuses one of another pillar", async () => {
    await como(comoPostgres, async (c) => {
      const construyo = await angulo(c, "lo-que-construyo")
      const id = await idea(c, "psicologia-en-la-mesa", construyo)
      expect(await anguloDe(c, id)).toBe(construyo)
      const otro = await fallaCon(c, "update public.ideas set angulo_id = $2 where id = $1", [
        id,
        await angulo(c, "lo-vivo"),
      ])
      expect(otro.code).toBe("23514")
      expect(otro.message).toBe("angulo_de_otro_pilar")
      const enPilarSinAngulos = await fallaCon(
        c,
        "insert into public.ideas (pilar, angulo_id, gancho, fuerza) values ('mujeres-lideres', $1, 'G', 'alta')",
        [construyo],
      )
      expect(enPilarSinAngulos.message).toBe("angulo_de_otro_pilar")
    })
  })

  it("clears the angle when the pillar changes, and keeps one set in the same statement", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa", await angulo(c, "lo-que-construyo"))
      await c.query("update public.ideas set pilar = 'mi-nueva-partida' where id = $1", [id])
      expect(await anguloDe(c, id)).toBeNull()
      const vivo = await angulo(c, "lo-vivo")
      await c.query("update public.ideas set pilar = 'psicologia-en-la-mesa', angulo_id = null where id = $1", [id])
      await c.query("update public.ideas set pilar = 'mi-nueva-partida', angulo_id = $2 where id = $1", [id, vivo])
      expect(await anguloDe(c, id)).toBe(vivo)
    })
  })

  it("locks the angle once a live piece of the idea is signed at gate 1, and opens it when the signature is cleared", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa", await angulo(c, "lo-que-planteo"))
      const pieza = await firmada(c, id)
      const construyo = await angulo(c, "lo-que-construyo")
      await asumir(c, comoConi)
      const bloqueado = await fallaCon(c, "update public.ideas set angulo_id = $2 where id = $1", [id, construyo])
      expect(bloqueado.code).toBe("23514")
      expect(bloqueado.message).toBe("angulo_firmado")
      await asumir(c, comoPostgres)
      await c.query(
        `update public.piezas set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null,
           version = version + 1 where id = $1`,
        [pieza],
      )
      await asumir(c, comoConi)
      await c.query("update public.ideas set angulo_id = $2 where id = $1", [id, construyo])
      expect(await anguloDe(c, id)).toBe(construyo)
    })
  })

  it("does not lock it for a discarded piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa", await angulo(c, "lo-que-planteo"))
      const pieza = await firmada(c, id)
      await c.query("update public.piezas set estado = 'descartado', version = version + 1 where id = $1", [pieza])
      await c.query("update public.ideas set angulo_id = null where id = $1", [id])
      expect(await anguloDe(c, id)).toBeNull()
    })
  })

  it("lets Coni set it and not WAV", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa")
      const construyo = await angulo(c, "lo-que-construyo")
      await asumir(c, comoMantenedor)
      expect((await c.query("update public.ideas set angulo_id = $2 where id = $1", [id, construyo])).rowCount).toBe(0)
      await asumir(c, comoConi)
      expect((await c.query("update public.ideas set angulo_id = $2 where id = $1", [id, construyo])).rowCount).toBe(1)
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/angulos-ideas.test.ts`
Expected: FAIL, `column "angulo_id" of relation "ideas" does not exist`.

- [ ] **Step 3: Append the column and the trigger to the migration**

Append to `supabase/migrations/20261105000200_angulos_de_pilar.sql`:

```sql

-- The idea carries the angle as it carries the pillar (spec 15d, decision 2): a piece's angle is its idea's.
alter table public.ideas add column angulo_id uuid references public.pilar_angulos (id);
create index ideas_angulo on public.ideas (angulo_id) where angulo_id is not null;

-- 1. A pillar change that does not also set the angle clears it (the undo of 15a's lot, any later move).
-- 2. An angle belongs to the idea's pillar (`ideas.pilar` is the pillar's slug).
-- 3. Coni changes it until she signs gate 1: then the script was written and signed with that angle. Asking for
--    changes or "volver a firmar" clears `puerta1_en`, and the angle opens again. A discarded piece locks nothing.
create function public.exigir_angulo_de_pilar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.pilar is distinct from old.pilar and new.angulo_id is not distinct from old.angulo_id then
    new.angulo_id := null;
  end if;
  if new.angulo_id is not null and not exists (
    select 1
      from public.pilar_angulos a
      join public.categorias c on c.id = a.pilar_id
     where a.id = new.angulo_id and c.slug = new.pilar
  ) then
    raise exception using errcode = '23514', message = 'angulo_de_otro_pilar';
  end if;
  if tg_op = 'UPDATE'
     and new.pilar is not distinct from old.pilar
     and new.angulo_id is distinct from old.angulo_id
     and exists (
       select 1 from public.piezas p
        where p.idea_id = new.id and p.estado <> 'descartado' and p.puerta1_en is not null
     ) then
    raise exception using errcode = '23514', message = 'angulo_firmado';
  end if;
  return new;
end $$;

create trigger exigir_angulo_de_pilar before insert or update of pilar, angulo_id on public.ideas
  for each row execute function public.exigir_angulo_de_pilar();
```

- [ ] **Step 4: Rebuild, regenerate and run**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/angulos-ideas.test.ts tests/integration/angulos-esquema.test.ts tests/integration/lote-de-pilares.test.ts`
Expected: PASS (the lot's apply and undo still work: the undo restores the pillar and the trigger leaves no angle).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000200_angulos_de_pilar.sql lib/supabase/database.types.ts tests/integration/angulos-ideas.test.ts
git commit -m "Store each idea's angle, guarded by its pillar and locked by the gate-1 signature" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `piezas_con_angulo` and the notice kind

**Files:**
- Create: `tests/integration/piezas-con-angulo.test.ts`
- Modify: `supabase/migrations/20261105000200_angulos_de_pilar.sql` (append)
- Modify: `lib/avisos/tipos.ts`
- Modify: `tests/unit/avisos.test.ts`
- Modify (regenerated): `lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/piezas-con-angulo.test.ts`:

```ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, pool } from "./db"

type Red = "linkedin" | "instagram"
type Estado = "esperando" | "para_subir" | "subido_a_mano" | "publicado"

afterAll(async () => {
  await pool.end()
})

/** A piece of a new idea on `pilar` (with the angle `angulo`, or none), with one `publicaciones` row per salida. */
async function pieza(
  c: pg.PoolClient,
  pilar: string,
  angulo: string | null,
  salidas: readonly { destino: Red; estado: Estado; en: string }[],
): Promise<string> {
  const { rows: idea } = await c.query<{ id: string }>(
    `insert into public.ideas (pilar, angulo_id, gancho, fuerza, estado)
     values ($1, (select id from public.pilar_angulos where slug = $2), 'Gancho', 'alta', 'usada') returning id`,
    [pilar, angulo],
  )
  const { rows } = await c.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Pieza') returning id",
    [idea[0]?.id],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  for (const { destino, estado, en } of salidas) {
    await c.query(
      `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
       values ($1::uuid, $2::text, $3::text, $4::timestamptz,
               case when $2::text = 'linkedin' and $3::text = 'publicado' then 'urn:li:share:' || abs(hashtext($1::text)) end)`,
      [id, destino, estado, en],
    )
  }
  return id
}

async function filas(c: pg.PoolClient, piezas: readonly string[]) {
  const { rows } = await c.query<{ pieza_id: string; angulo: string; publicada_en: Date }>(
    `select v.pieza_id, a.slug as angulo, v.publicada_en
       from public.piezas_con_angulo v join public.pilar_angulos a on a.id = v.angulo_id
      where v.pieza_id = any($1::uuid[]) order by v.publicada_en`,
    [piezas],
  )
  return rows.map((fila) => ({ ...fila, publicada_en: fila.publicada_en.toISOString() }))
}

describe("piezas_con_angulo", () => {
  it("lists a piece that went out, with its angle and the first time it went out, once", async () => {
    await como(comoPostgres, async (c) => {
      const doble = await pieza(c, "psicologia-en-la-mesa", "lo-que-construyo", [
        { destino: "linkedin", estado: "publicado", en: "2026-10-02T12:00:00Z" },
        { destino: "instagram", estado: "subido_a_mano", en: "2026-10-01T12:00:00Z" },
      ])
      await asumir(c, comoConi)
      expect(await filas(c, [doble])).toEqual([
        { pieza_id: doble, angulo: "lo-que-construyo", publicada_en: "2026-10-01T12:00:00.000Z" },
      ])
    })
  })

  it("leaves out a piece still waiting or to upload, and one whose idea has no angle", async () => {
    await como(comoPostgres, async (c) => {
      const esperando = await pieza(c, "psicologia-en-la-mesa", "lo-que-planteo", [
        { destino: "linkedin", estado: "esperando", en: "2026-10-01T12:00:00Z" },
        { destino: "instagram", estado: "para_subir", en: "2026-10-01T12:00:00Z" },
      ])
      const sinAngulo = await pieza(c, "psicologia-en-la-mesa", null, [
        { destino: "linkedin", estado: "publicado", en: "2026-10-01T12:00:00Z" },
      ])
      await asumir(c, comoConi)
      expect(await filas(c, [esperando, sinAngulo])).toEqual([])
    })
  })

  it("is read through row level security: WAV sees nothing, because only Coni reads publicaciones", async () => {
    await como(comoPostgres, async (c) => {
      const id = await pieza(c, "mi-nueva-partida", "lo-vivo", [
        { destino: "instagram", estado: "subido_a_mano", en: "2026-10-01T12:00:00Z" },
      ])
      await asumir(c, comoMantenedor)
      expect(await filas(c, [id])).toEqual([])
    })
  })
})
```

In `tests/unit/avisos.test.ts`, append at the end:

```ts

describe("aviso del equilibrio de un ángulo", () => {
  it("opens Temas and says it in the push without naming the pillar", () => {
    const aviso = { tipo: "equilibrio_de_angulo" } as const
    expect(esTipoDeAviso("equilibrio_de_angulo")).toBe(true)
    expect(rutaDeAviso(aviso)).toBe("/biblioteca/temas")
    expect(mensajePush(aviso)).toMatchObject({
      cuerpo: "Un ángulo de tus pilares necesita piezas",
      url: "/biblioteca/temas",
    })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:db tests/integration/piezas-con-angulo.test.ts && pnpm test:run tests/unit/avisos.test.ts`
Expected: the first FAILS with `relation "public.piezas_con_angulo" does not exist`; the unit FAILS on `esTipoDeAviso("equilibrio_de_angulo")`.

- [ ] **Step 3: Append the view and the notice kind**

Append to `supabase/migrations/20261105000200_angulos_de_pilar.sql`:

```sql

-- The pieces the balance counts (spec 15d, section 4): out on some network (`publicado` or `subido_a_mano`, both set
-- `marcado_en`, as 15b's temas_tratados reads it) and with an angle, once each, at the first time one went out. Ideas
-- without an angle (everything before 15d) do not count. Security invoker: only Coni reads `publicaciones`.
create view public.piezas_con_angulo with (security_invoker = true) as
select pz.id as pieza_id, c.id as pilar_id, i.angulo_id, min(p.marcado_en) as publicada_en
  from public.publicaciones p
  join public.piezas pz on pz.id = p.pieza_id
  join public.ideas i on i.id = pz.idea_id
  join public.categorias c on c.slug = i.pilar
 where p.estado in ('publicado', 'subido_a_mano')
   and p.marcado_en is not null
   and i.angulo_id is not null
 group by pz.id, c.id, i.angulo_id;

revoke all on public.piezas_con_angulo from anon, authenticated;
grant select on public.piezas_con_angulo to authenticated, service_role;

-- `equilibrio_de_angulo`: an angle with a minimum fell short. The full list (20261103000100_presupuesto.sql plus this
-- type); presupuesto-esquema.test.ts and datos-personales-esquema.test.ts check it equals TIPOS_DE_AVISO.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer', 'revision_de_inventario',
  'limite_alcanzado', 'equilibrio_de_angulo'
));
```

In `lib/avisos/tipos.ts`:
- after `"limite_alcanzado",` in `TIPOS_DE_AVISO` add `"equilibrio_de_angulo",`;
- after `limite_alcanzado: "Llegaste a tu límite de gasto de este mes",` in `CUERPO_DE_PUSH` add `equilibrio_de_angulo: "Un ángulo de tus pilares necesita piezas",`;
- in `rutaDeAviso`, after the `limite_alcanzado` line, add `if (aviso.tipo === "equilibrio_de_angulo") return "/biblioteca/temas"`, and extend its doc comment's list with "Temas for an angle that falls short".

- [ ] **Step 4: Rebuild, regenerate and run**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/piezas-con-angulo.test.ts tests/integration/presupuesto-esquema.test.ts tests/integration/datos-personales-esquema.test.ts && pnpm test:run tests/unit/avisos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000200_angulos_de_pilar.sql lib/supabase/database.types.ts lib/avisos/tipos.ts tests/integration/piezas-con-angulo.test.ts tests/unit/avisos.test.ts
git commit -m "List published pieces with an angle and add the notice of an angle that falls short" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Phase 2: the catalog and the rule

### Task 4: Angles in the pillar catalog

**Files:**
- Modify: `lib/dominio/pilares.ts`, `lib/datos/pilares.ts`
- Modify: `tests/fixtures/pilares.ts`, `tests/integration/datos-pilares.test.ts`, `tests/unit/pilares.test.ts`, `tests/unit/anthropic-instrucciones.test.ts`, `tests/unit/sin-slugs-de-pilar.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/fixtures/pilares.ts`, change the import to `import type { CatalogoDePilares, DatosDeAngulo, DatosDePilar } from "@/lib/dominio/pilares"`, rename `export const PILARES_DE_PRUEBA: CatalogoDePilares = [` to `const SIN_ANGULOS: readonly Omit<DatosDePilar, "angulos">[] = [`, extend the doc comment with "Mirrors 20261105000200 too: the six angles, with their fake ids.", and append after the array:

```ts

// The descriptions are the migration's, byte for byte: the integration test compares them.
const ANGULOS: Readonly<Record<string, DatosDeAngulo[]>> = {
  "bienestar-e-impacto": [
    {
      id: "00000000-0000-4000-8000-000000001021",
      slug: "lo-que-se-ve",
      nombre: "Lo que se ve",
      descripcion:
        "Lo que RRHH y yo observamos en las personas y los equipos cuando ya usan IA, incluso como apoyo emocional: estrés, desgaste, bienestar. Voz íntima, texto en primera persona.",
      orden: 1,
      minimo: null,
    },
    {
      id: "00000000-0000-4000-8000-000000001022",
      slug: "como-se-mide",
      nombre: "Cómo se mide",
      descripcion:
        "Medir el impacto humano y no solo la adopción: indicadores, evaluación de pilotos, instrumentos. Voz declarativa, carrusel PDF con datos.",
      orden: 2,
      minimo: null,
    },
  ],
  "psicologia-en-la-mesa": [
    {
      id: "00000000-0000-4000-8000-000000001031",
      slug: "lo-que-planteo",
      nombre: "Lo que planteo",
      descripcion:
        "La IA y la salud mental como tema país y académico: IA ética, datos de salud, regulación y el rol de la psicología en diseñar y evaluar la IA. Voz declarativa, carrusel con datos y fuentes revisadas.",
      orden: 1,
      minimo: null,
    },
    {
      id: "00000000-0000-4000-8000-000000001032",
      slug: "lo-que-construyo",
      nombre: "Lo que construyo",
      descripcion:
        "Mi caso a la vista. Una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg. Voz íntima, fotos reales, demos y video.",
      orden: 2,
      minimo: 1 / 3,
    },
  ],
  "mi-nueva-partida": [
    {
      id: "00000000-0000-4000-8000-000000002021",
      slug: "lo-vivo",
      nombre: "Lo vivo",
      descripcion:
        "Mi giro de psicóloga que aprende a entrenar modelos, construye y emprende, con dudas, números y avances. Reel detrás de escena y Stories, voz íntima. Series «Mi nueva partida» y «Lo probé».",
      orden: 1,
      minimo: null,
    },
    {
      id: "00000000-0000-4000-8000-000000002022",
      slug: "pruebalo-tu",
      nombre: "Pruébalo tú",
      descripcion:
        "Usar la IA con criterio en su propia reinvención. Reel de pantalla y carrusel paso a paso. Series «Prompt con inteligencia emocional» y «Pequeño experimento».",
      orden: 2,
      minimo: 1 / 3,
    },
  ],
}

export const PILARES_DE_PRUEBA: CatalogoDePilares = SIN_ANGULOS.map((pilar) => ({
  ...pilar,
  angulos: ANGULOS[pilar.slug] ?? [],
}))

/** The fixture's angle ids, by slug, for the tests that need one. */
export const ANGULO_DE_PRUEBA = {
  loQueSeVe: "00000000-0000-4000-8000-000000001021",
  loQuePlanteo: "00000000-0000-4000-8000-000000001031",
  loQueConstruyo: "00000000-0000-4000-8000-000000001032",
  loVivo: "00000000-0000-4000-8000-000000002021",
  prueba: "00000000-0000-4000-8000-000000002022",
} as const
```

In `tests/integration/datos-pilares.test.ts` replace the `sinId` helper with:

```ts
// The DB's ids are random: the fixture's are fakes, for pillars and angles.
const sinId = (catalogo: CatalogoDePilares) =>
  catalogo.map(({ id: _id, angulos, ...resto }) => ({ ...resto, angulos: angulos.map(({ id: _a, ...angulo }) => angulo) }))
```

In `tests/unit/pilares.test.ts`, add to the existing import from `@/lib/dominio/pilares` whichever of `anguloPorSlug`, `angulosDelPilar`, `etiquetaDePilar`, `pilarVisible` it does not import yet; add `ANGULO_DE_PRUEBA` to the fixture import; append:

```ts

describe("los ángulos de un pilar (15d)", () => {
  it("gives a pillar's angles in order, none for a pillar without them or a layer", () => {
    expect(angulosDelPilar(PILARES_DE_PRUEBA, "psicologia-en-la-mesa").map((a) => a.nombre)).toEqual([
      "Lo que planteo",
      "Lo que construyo",
    ])
    expect(angulosDelPilar(PILARES_DE_PRUEBA, "mujeres-lideres")).toEqual([])
    expect(angulosDelPilar(PILARES_DE_PRUEBA, "capa-tdah")).toEqual([])
  })

  it("finds an angle by slug only inside its pillar", () => {
    expect(anguloPorSlug(PILARES_DE_PRUEBA, "mi-nueva-partida", "pruebalo-tu")?.id).toBe(ANGULO_DE_PRUEBA.prueba)
    expect(anguloPorSlug(PILARES_DE_PRUEBA, "psicologia-en-la-mesa", "pruebalo-tu")).toBeNull()
    expect(anguloPorSlug(PILARES_DE_PRUEBA, "psicologia-en-la-mesa", null)).toBeNull()
  })

  it("shows the angle next to the pillar, and the pillar alone without one", () => {
    const conAngulo = pilarVisible(PILARES_DE_PRUEBA, "psicologia-en-la-mesa", ANGULO_DE_PRUEBA.loQueConstruyo)
    expect(conAngulo).toEqual({
      slug: "psicologia-en-la-mesa",
      nombre: "Psicología en la mesa: la psicología donde se construye la IA",
      nombreCorto: "Psicología en la mesa",
      angulo: "Lo que construyo",
    })
    expect(etiquetaDePilar(conAngulo)).toBe("Psicología en la mesa · Lo que construyo")
    const sinAngulo = pilarVisible(PILARES_DE_PRUEBA, "psicologia-en-la-mesa", null)
    expect(sinAngulo).not.toHaveProperty("angulo")
    expect(etiquetaDePilar(sinAngulo)).toBe("Psicología en la mesa")
  })

  it("treats an angle of another pillar as a bug, as an unknown slug", () => {
    expect(() => pilarVisible(PILARES_DE_PRUEBA, "mujeres-lideres", ANGULO_DE_PRUEBA.loVivo)).toThrow(
      `Ángulo desconocido: ${ANGULO_DE_PRUEBA.loVivo}`,
    )
  })
})
```

In `tests/unit/sin-slugs-de-pilar.test.ts`, after `"capa-tdah",` in `SLUGS` add:

```ts
  // The angles of 15d: code reads them from `pilar_angulos`, never by name.
  "lo-que-se-ve",
  "como-se-mide",
  "lo-que-planteo",
  "lo-que-construyo",
  "lo-vivo",
  "pruebalo-tu",
```

In `tests/unit/anthropic-instrucciones.test.ts`, in the `PILARES` fixture, replace each of `id: "p-1",`, `id: "p-2",` and `id: "p-3",` with the same line followed by `angulos: [],` on the next line (three edits).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/pilares.test.ts tests/unit/sin-slugs-de-pilar.test.ts && pnpm test:db tests/integration/datos-pilares.test.ts`
Expected: unit FAIL (`angulosDelPilar is not a function`); integration FAIL (the read pillars have no `angulos`). `sin-slugs` PASSES (no code names an angle yet).

- [ ] **Step 3: Implement**

In `lib/dominio/pilares.ts`:

Before `/** A pillar as \`categorias\` stores it` add:

```ts
/** An angle of a pillar (spec 2026-11-05, part 15d): a way to approach it, with its own voice and format. */
export interface DatosDeAngulo {
  id: string
  slug: string
  nombre: string
  /** Definition, voice and format, as the prompts read them. */
  descripcion: string
  orden: number
  /** The least share of the pillar's pieces it must have (1/3), or null when it has no rule. */
  minimo: number | null
}

/** What a choice of angle needs. */
export interface OpcionDeAngulo {
  id: string
  slug: string
  nombre: string
}

```

In `DatosDePilar`, after `esCapa: boolean` add:

```ts
  /** Its angles in order; empty for a layer and for a pillar without angles. */
  angulos: readonly DatosDeAngulo[]
```

In `PilarVisible`, after `nombreCorto: string` add:

```ts
  /** The name of the idea's angle; absent when the idea has none. */
  angulo?: string | null
```

In `PilarDeEleccion`, after `red: Red | null` add:

```ts
  /** Its angles, for the choice of an angle; absent or empty when it has none. */
  angulos?: readonly OpcionDeAngulo[]
```

Replace the three `pilarVisible` lines and its body with:

```ts
/** Ideas point at pillar rows only (FK and trigger), so an unknown slug is a bug, not data to hide. So is an angle of
 * another pillar (`exigir_angulo_de_pilar`). The `angulo` key is there only when the idea has one. */
export function pilarVisible(catalogo: CatalogoDePilares, slug: string, anguloId?: string | null): PilarVisible
export function pilarVisible(
  catalogo: CatalogoDePilares,
  slug: string | null | undefined,
  anguloId?: string | null,
): PilarVisible | null
export function pilarVisible(
  catalogo: CatalogoDePilares,
  slug: string | null | undefined,
  anguloId?: string | null,
): PilarVisible | null {
  if (slug == null) return null
  const { nombre, nombreCorto, angulos } = buscar(catalogo, slug)
  if (anguloId == null) return { slug, nombre, nombreCorto }
  const angulo = angulos.find((candidato) => candidato.id === anguloId)
  if (!angulo) throw new Error(`Ángulo desconocido: ${anguloId}`)
  return { slug, nombre, nombreCorto, angulo: angulo.nombre }
}

/** A pillar's angles in order; none for a layer, a pillar without them or an unknown slug. */
export function angulosDelPilar(catalogo: CatalogoDePilares, slug: string): readonly DatosDeAngulo[] {
  return catalogo.find((pilar) => pilar.slug === slug)?.angulos ?? []
}

/** The angle `slug` of the pillar `slugDePilar`, or null: Claude and the forms speak slugs, the database ids. */
export function anguloPorSlug(
  catalogo: CatalogoDePilares,
  slugDePilar: string,
  slug: string | null | undefined,
): DatosDeAngulo | null {
  if (slug == null) return null
  return angulosDelPilar(catalogo, slugDePilar).find((angulo) => angulo.slug === slug) ?? null
}

/** What a compact place shows: the pillar's short name, then the idea's angle ("Psicología en la mesa · Lo que construyo"). */
export function etiquetaDePilar(pilar: PilarVisible): string {
  return pilar.angulo ? `${pilar.nombreCorto} · ${pilar.angulo}` : pilar.nombreCorto
}
```

In `lib/datos/pilares.ts`, add `type DatosDeAngulo,` to the import from `@/lib/dominio/pilares`, and in `leerPilares` replace the select string with
`"id, slug, nombre, nombre_corto, descripcion, activa, orden, red, es_capa, pilar_angulos(id, slug, nombre, descripcion, orden, minimo)"` and, after `esCapa: fila.es_capa,`, add:

```ts
        angulos: fila.pilar_angulos
          .map(
            (angulo): DatosDeAngulo => ({
              id: angulo.id,
              slug: angulo.slug,
              nombre: angulo.nombre,
              descripcion: angulo.descripcion,
              orden: angulo.orden,
              minimo: angulo.minimo,
            }),
          )
          .toSorted((a, b) => a.orden - b.orden),
```

- [ ] **Step 4: Run them, then the type check**

Run: `pnpm test:run tests/unit/pilares.test.ts tests/unit/sin-slugs-de-pilar.test.ts tests/unit/anthropic-instrucciones.test.ts && pnpm test:db tests/integration/datos-pilares.test.ts && pnpm type`
Expected: PASS; the characterization hashes did not move (no prompt lists an angle yet). If `pnpm type` names another literal `DatosDePilar` without `angulos`, add `angulos: []` to it (a fixture only; no production code builds one besides `leerPilares`).

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/pilares.ts lib/datos/pilares.ts tests/fixtures/pilares.ts tests/integration/datos-pilares.test.ts tests/unit/pilares.test.ts tests/unit/anthropic-instrucciones.test.ts tests/unit/sin-slugs-de-pilar.test.ts
git commit -m "Read each pillar's angles with the catalog and label a pillar with its idea's angle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The balance rule

**Files:**
- Create: `lib/dominio/angulos.ts`
- Create: `tests/unit/angulos.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/angulos.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  claveDeFalta,
  faltasDeAngulo,
  faltasPorPilar,
  lineaDeFalta,
  mensajeDeFalta,
  minimoDePiezas,
  type PiezaConAngulo,
} from "@/lib/dominio/angulos"
import { ANGULO_DE_PRUEBA, PILARES_DE_PRUEBA } from "../fixtures/pilares"

const PSICOLOGIA = "00000000-0000-4000-8000-000000000103"
const PARTIDA = "00000000-0000-4000-8000-000000000202"
const DIA = 86_400_000
const AHORA = Date.parse("2026-11-09T11:30:00.000Z")
const haceDias = (dias: number) => new Date(AHORA - dias * DIA).toISOString()

const pieza = (pilarId: string, anguloId: string, dias: number): PiezaConAngulo => ({
  pilarId,
  anguloId,
  publicadaEn: haceDias(dias),
})
const planteo = (dias: number) => pieza(PSICOLOGIA, ANGULO_DE_PRUEBA.loQuePlanteo, dias)
const construyo = (dias: number) => pieza(PSICOLOGIA, ANGULO_DE_PRUEBA.loQueConstruyo, dias)

describe("minimoDePiezas", () => {
  it("is 2 of 6 for 1/3, even when the float is a hair under", () => {
    expect(minimoDePiezas(1 / 3)).toBe(2)
    expect(minimoDePiezas(0.3333333333333333)).toBe(2)
    expect(minimoDePiezas(0.5)).toBe(3)
  })
})

describe("faltasDeAngulo", () => {
  it("says nothing without pieces with an angle", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [], AHORA)).toEqual([])
  })

  it("waits for six pieces before the share counts", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [1, 2, 3, 4, 5].map(planteo), AHORA)).toEqual([])
  })

  it("is short when fewer than 2 of the last 6 are of the angle, and fine with exactly 2", () => {
    const seis = [1, 2, 3, 4, 5, 6].map(planteo)
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, seis, AHORA)).toEqual([
      {
        tipo: "proporcion",
        pilarId: PSICOLOGIA,
        pilar: "Psicología en la mesa",
        anguloId: ANGULO_DE_PRUEBA.loQueConstruyo,
        angulo: "Lo que construyo",
        delAngulo: 0,
        minimo: 2,
      },
    ])
    const uno = [construyo(1), ...[2, 3, 4, 5, 6].map(planteo)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, uno, AHORA)[0]).toMatchObject({ tipo: "proporcion", delAngulo: 1 })
    const dos = [construyo(1), construyo(4), ...[2, 3, 5, 6].map(planteo)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, dos, AHORA)).toEqual([])
  })

  it("looks only at the last six: an older piece of the angle does not help", () => {
    const piezas = [...[1, 2, 3, 4, 5, 6].map(planteo), construyo(7), construyo(8)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, piezas, AHORA)[0]).toMatchObject({ tipo: "proporcion", delAngulo: 0 })
  })

  it("is short after 21 days without the angle while the pillar published after it", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [construyo(21), planteo(3)], AHORA)[0]).toMatchObject({ tipo: "tiempo" })
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [construyo(20), planteo(3)], AHORA)).toEqual([])
    // Nothing of the pillar after the angle's last piece: the pillar is quiet, not the angle.
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [construyo(30)], AHORA)).toEqual([])
  })

  it("counts from the pillar's first piece when the angle never had one", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [planteo(21)], AHORA)[0]).toMatchObject({ tipo: "tiempo" })
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [planteo(20), planteo(2)], AHORA)).toEqual([])
  })

  it("says one shortfall per angle, the share first, and none for an angle without a minimum", () => {
    const viejas = [21, 22, 23, 24, 25, 26].map(planteo)
    const faltas = faltasDeAngulo(PILARES_DE_PRUEBA, viejas, AHORA)
    expect(faltas.map((falta) => [falta.angulo, falta.tipo])).toEqual([["Lo que construyo", "proporcion"]])
  })

  it("checks each pillar on its own pieces", () => {
    const piezas = [...[1, 2, 3, 4, 5, 6].map(planteo), pieza(PARTIDA, ANGULO_DE_PRUEBA.prueba, 1)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, piezas, AHORA).map((falta) => falta.angulo)).toEqual([
      "Lo que construyo",
    ])
  })
})

describe("the words of a shortfall", () => {
  const base = {
    pilarId: PSICOLOGIA,
    pilar: "Psicología en la mesa",
    anguloId: ANGULO_DE_PRUEBA.loQueConstruyo,
    angulo: "Lo que construyo",
    minimo: 2,
  }

  it("says the share in her words", () => {
    expect(mensajeDeFalta({ ...base, tipo: "proporcion", delAngulo: 0 })).toBe(
      "En «Psicología en la mesa», ninguna de tus últimas 6 piezas es de «Lo que construyo». Tu regla es al menos 2 de cada 6.",
    )
    expect(mensajeDeFalta({ ...base, tipo: "proporcion", delAngulo: 1 })).toBe(
      "En «Psicología en la mesa», solo 1 de tus últimas 6 piezas es de «Lo que construyo». Tu regla es al menos 2 de cada 6.",
    )
    expect(mensajeDeFalta({ ...base, tipo: "proporcion", delAngulo: 2, minimo: 3 })).toBe(
      "En «Psicología en la mesa», solo 2 de tus últimas 6 piezas son de «Lo que construyo». Tu regla es al menos 3 de cada 6.",
    )
  })

  it("says the weeks without the angle", () => {
    expect(mensajeDeFalta({ ...base, tipo: "tiempo", delAngulo: 0 })).toBe(
      "Llevas 3 semanas sin publicar piezas de «Lo que construyo» en «Psicología en la mesa».",
    )
  })

  it("keys the notice by angle and week", () => {
    expect(claveDeFalta(ANGULO_DE_PRUEBA.prueba, "2026-11-09")).toBe(
      `equilibrio_de_angulo:${ANGULO_DE_PRUEBA.prueba}:2026-11-09`,
    )
  })

  it("groups the angles that fall short by pillar, for the Temas row", () => {
    const faltas = [
      { ...base, tipo: "proporcion" as const, delAngulo: 0 },
      { ...base, tipo: "tiempo" as const, delAngulo: 0, anguloId: "x", angulo: "Otro" },
    ]
    expect(faltasPorPilar(faltas)).toEqual({ [PSICOLOGIA]: ["Lo que construyo", "Otro"] })
    expect(lineaDeFalta(["Lo que construyo"])).toBe("Falta Lo que construyo")
    expect(lineaDeFalta(["Lo que construyo", "Otro"])).toBe("Falta Lo que construyo y Otro")
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/angulos.test.ts`
Expected: FAIL, cannot resolve `@/lib/dominio/angulos`.

- [ ] **Step 3: Implement**

Create `lib/dominio/angulos.ts`:

```ts
import { type CatalogoDePilares, soloActivos } from "./pilares"

/** Coni's rule (part 1, section 6): at least 1 of every 3 pieces, read over the pillar's last 6. */
export const VENTANA_DE_PIEZAS = 6
/** "Si pasan varias semanas sin piezas de ese ángulo": three. */
export const DIAS_SIN_EL_ANGULO = 21
const DIA_MS = 86_400_000
// `minimo` arrives as a float (1/3 reads 0.333…): 6 times it may land a hair under 2, never meant as 3.
const HOLGURA = 1e-9

/** A published piece with an angle (`piezas_con_angulo`). */
export interface PiezaConAngulo {
  pilarId: string
  anguloId: string
  publicadaEn: string
}

export interface FaltaDeAngulo {
  /** `proporcion`: fewer than the minimum among the last 6; `tiempo`: three weeks without the angle. */
  tipo: "proporcion" | "tiempo"
  pilarId: string
  /** The pillar's short name, as Coni calls it. */
  pilar: string
  anguloId: string
  angulo: string
  /** Pieces of the angle among the pillar's last 6. */
  delAngulo: number
  /** How many of 6 the rule asks for. */
  minimo: number
}

export function minimoDePiezas(minimo: number): number {
  return Math.ceil(VENTANA_DE_PIEZAS * minimo - HOLGURA)
}

const instante = (pieza: PiezaConAngulo) => Date.parse(pieza.publicadaEn)

/**
 * The angles with a minimum that fall short now (spec 15d, section 4). Share: with 6 pieces at least, fewer than the
 * minimum among the last 6. Time: 21 days since the angle's last piece (or, never published, since the pillar's
 * first), while the pillar published after it. One per angle, the share first. It only warns: nothing reads it to
 * block.
 */
export function faltasDeAngulo(
  catalogo: CatalogoDePilares,
  piezas: readonly PiezaConAngulo[],
  ahora: number,
): FaltaDeAngulo[] {
  return soloActivos(catalogo).flatMap((pilar) => {
    const delPilar = piezas.filter((pieza) => pieza.pilarId === pilar.id).toSorted((a, b) => instante(b) - instante(a))
    return pilar.angulos.flatMap((angulo): FaltaDeAngulo[] => {
      if (angulo.minimo === null || delPilar.length === 0) return []
      const minimo = minimoDePiezas(angulo.minimo)
      const ultimas = delPilar.slice(0, VENTANA_DE_PIEZAS)
      const delAngulo = ultimas.filter((pieza) => pieza.anguloId === angulo.id).length
      const base = {
        pilarId: pilar.id,
        pilar: pilar.nombreCorto,
        anguloId: angulo.id,
        angulo: angulo.nombre,
        delAngulo,
        minimo,
      }
      if (ultimas.length === VENTANA_DE_PIEZAS && delAngulo < minimo) return [{ tipo: "proporcion", ...base }]
      const ultimaDelAngulo = delPilar.find((pieza) => pieza.anguloId === angulo.id)
      const referencia = ultimaDelAngulo ?? delPilar.at(-1)
      if (!referencia) return []
      const desde = instante(referencia)
      const publicoDespues = ultimaDelAngulo === undefined || delPilar.some((pieza) => instante(pieza) > desde)
      if (ahora - desde >= DIAS_SIN_EL_ANGULO * DIA_MS && publicoDespues) return [{ tipo: "tiempo", ...base }]
      return []
    })
  })
}

/** What the notice says, in her words. */
export function mensajeDeFalta(falta: FaltaDeAngulo): string {
  if (falta.tipo === "tiempo") {
    return `Llevas ${DIAS_SIN_EL_ANGULO / 7} semanas sin publicar piezas de «${falta.angulo}» en «${falta.pilar}».`
  }
  const cuantas =
    falta.delAngulo === 0
      ? `ninguna de tus últimas ${VENTANA_DE_PIEZAS} piezas es`
      : falta.delAngulo === 1
        ? `solo 1 de tus últimas ${VENTANA_DE_PIEZAS} piezas es`
        : `solo ${falta.delAngulo} de tus últimas ${VENTANA_DE_PIEZAS} piezas son`
  return `En «${falta.pilar}», ${cuantas} de «${falta.angulo}». Tu regla es al menos ${falta.minimo} de cada ${VENTANA_DE_PIEZAS}.`
}

/** One notice per angle and week (`avisos.clave` is unique): `lunes` is the Monday of the week, YYYY-MM-DD. */
export function claveDeFalta(anguloId: string, lunes: string): string {
  return `equilibrio_de_angulo:${anguloId}:${lunes}`
}

/** The names of the angles that fall short, by pillar id, for the Temas row. */
export function faltasPorPilar(faltas: readonly FaltaDeAngulo[]): Record<string, string[]> {
  const porPilar: Record<string, string[]> = {}
  for (const falta of faltas) porPilar[falta.pilarId] = [...(porPilar[falta.pilarId] ?? []), falta.angulo]
  return porPilar
}

/** The second line of a pillar's chip in Temas. */
export function lineaDeFalta(angulos: readonly string[]): string {
  return `Falta ${angulos.join(" y ")}`
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test:run tests/unit/angulos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/angulos.ts tests/unit/angulos.test.ts
git commit -m "Decide when an angle with a minimum falls short, and say it in Coni's words" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: The balance notice in the 08:30 summary

**Files:**
- Create: `lib/datos/angulos.ts`, `lib/avisos/equilibrio.ts`
- Modify: `lib/avisos/resumen.ts`
- Modify: `tests/integration/resumen-diario.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/integration/resumen-diario.test.ts`, append at the end of the file:

```ts

describe("el equilibrio de los ángulos en el resumen", () => {
  const LUNES_SIGUIENTE = "2026-10-12T11:30:00.000Z"
  const antesDe = (ahora: string, dias: number) => new Date(Date.parse(ahora) - dias * DIA_MS).toISOString()

  async function anguloId(slug: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>("select id from public.pilar_angulos where slug = $1", [slug])
    const id = rows[0]?.id
    if (!id) throw new Error(`No existe el ángulo ${slug}`)
    return id
  }

  /** A piece of `pilar` with the angle `angulo`, out on LinkedIn at `en`. */
  async function publicada(pilar: string, angulo: string, en: string): Promise<void> {
    const { rows: idea } = await pool.query<{ id: string }>(
      "insert into public.ideas (pilar, angulo_id, gancho, fuerza, estado) values ($1, $2, 'Gancho', 'alta', 'usada') returning id",
      [pilar, await anguloId(angulo)],
    )
    const ideaId = idea[0]?.id ?? ""
    ideas.push(ideaId)
    const { rows: pieza } = await pool.query<{ id: string }>(
      "insert into public.piezas (idea_id, titulo) values ($1, 'Pieza') returning id",
      [ideaId],
    )
    const piezaId = pieza[0]?.id ?? ""
    piezas.push(piezaId)
    await pool.query(
      `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
       values ($1, 'linkedin', 'publicado', $2, 'urn:li:share:' || abs(hashtext($1::text)))`,
      [piezaId, en],
    )
  }

  const deEquilibrio = async () => (await filas()).filter((fila) => fila.tipo === "equilibrio_de_angulo")

  it("writes one notice per angle and week, sends it with the summary, and writes it again the next week", async () => {
    for (const dias of [1, 2, 3, 4, 5, 6]) await publicada("psicologia-en-la-mesa", "lo-que-planteo", antesDe(LUNES_0830, dias))
    const construyo = await anguloId("lo-que-construyo")
    const memoria = notificadorEnMemoria()

    expect(await enviarResumenDelDia(armar(LUNES_0830, memoria).deps)).toMatchObject({ enviado: true })
    expect((await deEquilibrio()).map((fila) => fila.clave)).toEqual([`equilibrio_de_angulo:${construyo}:2026-10-05`])
    expect(memoria.resumenesEnviados[0]?.texto).toContain(
      "En «Psicología en la mesa», ninguna de tus últimas 6 piezas es de «Lo que construyo». Tu regla es al menos 2 de cada 6.",
    )

    await enviarResumenDelDia(armar(MARTES_0830).deps)
    expect(await deEquilibrio()).toHaveLength(1)

    await enviarResumenDelDia(armar(LUNES_SIGUIENTE).deps)
    expect((await deEquilibrio()).map((fila) => fila.clave)).toEqual([
      `equilibrio_de_angulo:${construyo}:2026-10-05`,
      `equilibrio_de_angulo:${construyo}:2026-10-12`,
    ])
  })

  it("warns after three weeks without the angle, and says nothing while the pillar is young", async () => {
    await publicada("psicologia-en-la-mesa", "lo-que-planteo", antesDe(LUNES_0830, 3))
    await enviarResumenDelDia(armar(LUNES_0830).deps)
    expect(await deEquilibrio()).toEqual([])

    await enviarResumenDelDia(armar(new Date(Date.parse(LUNES_0830) + 18 * DIA_MS).toISOString()).deps)
    const { rows } = await pool.query<{ mensaje: string }>(
      "select mensaje from public.avisos where tipo = 'equilibrio_de_angulo'",
    )
    expect(rows.map((fila) => fila.mensaje)).toEqual([
      "Llevas 3 semanas sin publicar piezas de «Lo que construyo» en «Psicología en la mesa».",
    ])
  })

  it("still sends the other notices when the check fails, then fails the run", async () => {
    await aviso("guion_listo", "guion_listo:a:1", "Tu guion «Uno» está listo para revisar.")
    const memoria = notificadorEnMemoria()
    await pool.query("revoke select on public.piezas_con_angulo from service_role")
    try {
      await expect(enviarResumenDelDia(armar(MARTES_0830, memoria).deps)).rejects.toThrow(
        "No pude revisar el equilibrio de los ángulos",
      )
    } finally {
      await pool.query("grant select on public.piezas_con_angulo to service_role")
    }
    expect(memoria.resumenesEnviados).toHaveLength(1)
    expect((await filas()).every((fila) => fila.canal === "correo")).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/resumen-diario.test.ts`
Expected: the three new tests FAIL (no `equilibrio_de_angulo` notice is written; the third resolves instead of rejecting).

- [ ] **Step 3: Implement**

Create `lib/datos/angulos.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerPilares } from "@/lib/datos/pilares"
import { type FaltaDeAngulo, faltasDeAngulo, type PiezaConAngulo } from "@/lib/dominio/angulos"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** The published pieces with an angle. Coni's session or the service role: WAV reads no `publicaciones`. */
export async function leerPiezasConAngulo(db: Db): Promise<PiezaConAngulo[]> {
  const { data, error } = await db.from("piezas_con_angulo").select("pilar_id, angulo_id, publicada_en")
  if (error) throw new Error(`No pude leer las piezas publicadas con ángulo: ${error.message}`, { cause: error })
  // A view types every column as nullable; the view's own filters make them present.
  return data.flatMap((fila) =>
    fila.pilar_id && fila.angulo_id && fila.publicada_en
      ? [{ pilarId: fila.pilar_id, anguloId: fila.angulo_id, publicadaEn: fila.publicada_en }]
      : [],
  )
}

/** The angles that fall short at `ahora` (ms). */
export async function leerFaltasDeAngulo(db: Db, ahora: number): Promise<FaltaDeAngulo[]> {
  const [catalogo, piezas] = await Promise.all([leerPilares(db), leerPiezasConAngulo(db)])
  return faltasDeAngulo(catalogo, piezas, ahora)
}
```

Create `lib/avisos/equilibrio.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerFaltasDeAngulo } from "@/lib/datos/angulos"
import { claveDeFalta, mensajeDeFalta } from "@/lib/dominio/angulos"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import type { Database } from "@/lib/supabase/database.types"
import { registrarAviso } from "./registro"

/**
 * One notice per angle that falls short and week (spec 15d, section 4). It waits for the summary like the yearly
 * review: a later run of the same week finds its key and writes nothing. Answers how many fall short.
 */
export async function avisarEquilibrioDeAngulos(
  db: SupabaseClient<Database>,
  ahora: string,
  zona: string,
): Promise<number> {
  const instante = Date.parse(ahora)
  const faltas = await leerFaltasDeAngulo(db, instante)
  const lunes = lunesDeLaSemana(instante, zona)
  for (const falta of faltas) {
    await registrarAviso(
      db,
      { tipo: "equilibrio_de_angulo", clave: claveDeFalta(falta.anguloId, lunes) },
      mensajeDeFalta(falta),
    )
  }
  return faltas.length
}
```

In `lib/avisos/resumen.ts`, add `import { avisarEquilibrioDeAngulos } from "./equilibrio"` and replace `enviarResumenDelDia` (doc comment included) with:

```ts
/** The angles' balance (spec 15d): a failure is kept, so it never holds back the summary of the other notices. */
async function revisarEquilibrio(deps: DepsResumen, zona: string): Promise<{ falla: unknown } | null> {
  try {
    await avisarEquilibrioDeAngulos(deps.db, deps.ahora(), zona)
    return null
  } catch (error) {
    return { falla: error }
  }
}

async function enviarPendientes(deps: DepsResumen): Promise<ResultadoResumen> {
  const desde = new Date(Date.parse(deps.ahora()) - VIGENCIA_DEL_PENDIENTE_MS).toISOString()
  const pendientes = await leerPendientes(deps.db, desde)
  if (pendientes.length === 0) return { enviado: false }
  const canal = await deps.canal.resumenAConi(componer(pendientes))
  await marcarEnviados(
    deps.db,
    pendientes.map((aviso) => aviso.id),
    canal,
    deps.ahora(),
  )
  return { enviado: true, avisos: pendientes.length, canal }
}

/**
 * The 08:30 summary (design A9): at most one a day, and none when nothing is new. First it writes the notices that are
 * not born from a state change (the week's ideas on Monday, the reminders, an angle that falls short), then it sends
 * every notice still unsent as one message and marks them (Ajustes can turn the summary off, and a notice a week old
 * is left out). If the sending fails nothing is marked, and tomorrow's summary carries them. If the angles' check
 * failed, the summary still goes and then the run fails, so WAV hears it and the retry checks again.
 */
export async function enviarResumenDelDia(deps: DepsResumen): Promise<ResultadoResumen> {
  const { zona, resumenActivado } = await leerAjustesDelResumen(deps.db)
  // The notices are written either way (the app lists them); the switch of Ajustes only decides whether they are sent.
  await anunciarIdeasDelLunes(deps, zona)
  await recordarEsperas(deps)
  const equilibrio = await revisarEquilibrio(deps, zona)
  const resultado: ResultadoResumen = resumenActivado ? await enviarPendientes(deps) : { enviado: false }
  if (equilibrio) throw new Error("No pude revisar el equilibrio de los ángulos", { cause: equilibrio.falla })
  return resultado
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test:db tests/integration/resumen-diario.test.ts`
Expected: PASS (every earlier test too: without pieces with an angle nothing new is written).

- [ ] **Step 5: Commit**

```bash
git add lib/datos/angulos.ts lib/avisos/equilibrio.ts lib/avisos/resumen.ts tests/integration/resumen-diario.test.ts
git commit -m "Warn Coni in the 08:30 summary when an angle falls short, once per angle and week" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Phase 3: Claude proposes the angle

### Task 7: The weekly engine proposes and stores the angle

**Files:**
- Modify: `lib/proveedores/anthropic/nucleo.ts`, `lib/proveedores/anthropic/secciones.ts`, `lib/proveedores/anthropic/teorias.ts`, `lib/motor/semanal.ts`
- Create: `tests/unit/anthropic-angulos.test.ts`
- Modify: `tests/unit/anthropic-teorias-motor.test.ts`, `tests/unit/anthropic-instrucciones.test.ts`, `tests/integration/motor-semanal.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/anthropic-angulos.test.ts`:

```ts
// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { soloActivos } from "@/lib/dominio/pilares"
import { escribirTeorias } from "@/lib/proveedores/anthropic"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const USO = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const cliente = () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })

/** Answers every request with `salida` and keeps what was asked. */
function respondiendo(salida: unknown) {
  const usuarios: string[] = []
  servidor.use(
    http.post<never, { messages: { content: string }[] }>(URL_MENSAJES, async ({ request }) => {
      usuarios.push((await request.json()).messages[0]?.content ?? "")
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return usuarios
}

const afirmacion = (id: string, autor: string) => ({
  id,
  autor,
  texto: "Un texto.",
  cita: "A quote.",
  tipo: "dato",
  evidencia: "estudio",
  publico: null,
  dolor: null,
  emocion: null,
})

const CRUCE = {
  id: "c1",
  temas: [{ id: "t1", nombre: "Tema", pilares: ["psicologia-en-la-mesa"] }],
  afirmaciones: [afirmacion("a1", "Ana"), afirmacion("a2", "Beto")],
}

const teoria = (ideas: object[]) => ({
  cruceId: "c1",
  nada: false,
  razon: null,
  titulo: "Título",
  tesis: "Tesis.",
  porQue: "Porque.",
  aportes: [
    { afirmacionId: "a1", aporte: "Uno" },
    { afirmacionId: "a2", aporte: "Dos" },
  ],
  tensiones: [],
  nivelEvidencia: "alto",
  advertencias: [],
  ideas,
})

const CONTEXTO = { guia: "Guía.", estrategia: [], vozPropia: [], pilares: soloActivos(PILARES_DE_PRUEBA) }

describe("escribirTeorias con ángulos", () => {
  it("lists each pillar's angles and asks for one when the pillar has them", async () => {
    const usuarios = respondiendo({ teorias: [] })
    await escribirTeorias({ cliente: cliente(), cruces: [CRUCE], contexto: CONTEXTO })
    expect(usuarios[0]).toContain("  - ángulo lo-que-construyo: Lo que construyo. Mi caso a la vista.")
    expect(usuarios[0]).toContain(
      "Si el pilar que eliges tiene ángulos, pon en angulo el slug del ángulo que mejor calce con la idea; si no tiene, angulo va en null.",
    )
  })

  it("keeps an angle of the idea's pillar and drops one of another pillar, an unknown one or a missing one", async () => {
    const idea = (pilar: string, angulo?: string | null) => ({
      gancho: "g",
      tema: "t",
      pilar,
      formato: "reel",
      ...(angulo === undefined ? {} : { angulo }),
    })
    respondiendo({ teorias: [teoria([idea("psicologia-en-la-mesa", "lo-que-construyo"), idea("psicologia-en-la-mesa", "lo-vivo")])] })
    const primera = await escribirTeorias({ cliente: cliente(), cruces: [CRUCE], contexto: CONTEXTO })
    expect(primera.teorias[0]?.ideas.map((i) => i.angulo)).toEqual(["lo-que-construyo", null])

    respondiendo({ teorias: [teoria([idea("mujeres-lideres", "lo-que-construyo"), idea("psicologia-en-la-mesa")])] })
    const segunda = await escribirTeorias({ cliente: cliente(), cruces: [CRUCE], contexto: CONTEXTO })
    expect(segunda.teorias[0]?.ideas.map((i) => i.angulo)).toEqual([null, null])
  })
})
```

In `tests/unit/anthropic-teorias-motor.test.ts`, add `angulo: null` to each of the four idea literals (the objects with `formato: "reel"` at the lines that build `ideas` in `teoria()`, the "retired pillar" test, the "em dashes" test, and `const idea = { ... } as const` of "keeps at most two ideas").

In `tests/integration/motor-semanal.test.ts`, in `simularClaude`'s options type add:

```ts
    /** The pillar and angle every idea answers (else `ia-salud-mental` without angle). */
    pilarYAngulo?: { pilar: string; angulo: string | null }
```

and replace the two idea lines

```ts
            { gancho: `Gancho ${i} a`, tema: "t", pilar: "ia-salud-mental", formato: "reel" },
            { gancho: `Gancho ${i} b`, tema: "t", pilar: "ia-salud-mental", formato: "reel" },
```

with

```ts
            { gancho: `Gancho ${i} a`, tema: "t", formato: "reel", ...ideaDe(opciones.pilarYAngulo) },
            { gancho: `Gancho ${i} b`, tema: "t", formato: "reel", ...ideaDe(opciones.pilarYAngulo) },
```

adding, above `simularClaude`:

```ts
const ideaDe = (pilarYAngulo?: { pilar: string; angulo: string | null }) =>
  pilarYAngulo ? { pilar: pilarYAngulo.pilar, angulo: pilarYAngulo.angulo } : { pilar: "ia-salud-mental" }
```

and, inside `describe("correrMotor", () => {`, after the first `it`, add:

```ts
  it("stores the angle Claude gave when it is one of the idea's pillar, and none otherwise", async () => {
    await tresTemas()
    simularClaude({ pilarYAngulo: { pilar: "psicologia-en-la-mesa", angulo: "lo-que-construyo" } })
    await correrMotor(deps(), { semana: SEMANA, manual: false })
    const { rows } = await pool.query<{ angulo: string | null }>(
      `select a.slug as angulo from public.ideas i left join public.pilar_angulos a on a.id = i.angulo_id
        where i.semana = $1 and i.origen = 'motor'`,
      [SEMANA],
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((fila) => fila.angulo === "lo-que-construyo")).toBe(true)
  })
```

(`tresTemas`, `deps`, `SEMANA` and `correrMotor` are the file's own; the file's cleanup removes the week's ideas.)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/anthropic-angulos.test.ts && pnpm test:db tests/integration/motor-semanal.test.ts`
Expected: unit FAIL (no angle in the prompt; `angulo` undefined); integration FAIL on the new test (`angulo` null).

- [ ] **Step 3: Implement**

In `lib/proveedores/anthropic/nucleo.ts`, after `enumTolerante`, add:

```ts
/**
 * A nullable text answer that tolerates a missing key (an answer shaped before the field existed reads null). The
 * schema sent still requires it, as structured outputs want every key.
 */
export function textoONulo() {
  return z.preprocess((valor) => valor ?? null, z.string().nullable())
}
```

In `lib/proveedores/anthropic/secciones.ts`, replace `listaDePilares` (with its doc comment) by:

```ts
/**
 * The pillars a prompt offers, grouped by network (spec 2026-11-04, section 4): slug (what goes in `pilar`), name and
 * description; with `angulos`, each pillar's angles under it (spec 15d). A layer is a lens, never a pillar to choose,
 * so it is left out.
 */
export function listaDePilares(pilares: readonly DatosDePilar[], opciones: { angulos?: boolean } = {}): string {
  return porRed(pilaresParaElegir(pilares))
    .map((grupo) =>
      [
        `${grupo.etiqueta}:`,
        ...grupo.pilares.flatMap((p) => [
          `- ${p.slug}: ${p.nombre}. ${p.descripcion ?? ""}`.trimEnd(),
          ...(opciones.angulos ? p.angulos.map((a) => `  - ángulo ${a.slug}: ${a.nombre}. ${a.descripcion}`) : []),
        ]),
      ].join("\n"),
    )
    .join("\n")
}

/** What every proposer asks about the angle (spec 15d, decision 3). */
export const REGLA_DE_ANGULO =
  "Si el pilar que eliges tiene ángulos, pon en angulo el slug del ángulo que mejor calce con la idea; si no tiene, angulo va en null."
```

In `lib/proveedores/anthropic/teorias.ts`:
- import `anguloPorSlug` with `DatosDePilar` and `slugsActivos` from `@/lib/dominio/pilares`; add `textoONulo` to the `./nucleo` import; import `listaDePilares, REGLA_DE_ANGULO` from `./secciones`;
- in `salidaTeorias`, replace the idea object with
  `z.object({ gancho: z.string(), tema: z.string(), pilar: enumTolerante(slugs), formato: z.string(), angulo: textoONulo() })`;
- in the user message, replace the PILARES block with

```ts
PILARES (cada idea va en uno de estos; usa exactamente el slug en pilar. Un tema sin pilar puede ir en cualquiera. ${REGLA_DE_ANGULO})
${listaDePilares(contexto.pilares, { angulos: true })}
```

- replace `if ("teoria" in validada) teorias.push(validada.teoria)` with

```ts
    // An angle that is not one of the idea's pillar is dropped, never a failure (spec 15d, decision 3).
    if ("teoria" in validada) {
      teorias.push({
        ...validada.teoria,
        ideas: validada.teoria.ideas.map((idea) => ({
          ...idea,
          angulo: anguloPorSlug(contexto.pilares, idea.pilar, idea.angulo)?.slug ?? null,
        })),
      })
    }
```

In `lib/motor/semanal.ts`:
- add `anguloPorSlug, type CatalogoDePilares` to the import from `@/lib/dominio/pilares` (it already imports `pilaresDeRedes`);
- add a fifth parameter to `guardarIdeas`: `pilares: CatalogoDePilares`, and in its insert, after `pilar: idea.pilar,`, add `angulo_id: anguloPorSlug(pilares, idea.pilar, idea.angulo)?.id ?? null,`;
- in `trabajar`, change the call to `const ideas = await guardarIdeas(db, semana, guardadas, origenes, contexto.pilares)`.

- [ ] **Step 4: Run them, then update the theories' fingerprint deliberately**

Run: `pnpm test:run tests/unit/anthropic-angulos.test.ts tests/unit/anthropic-teorias-motor.test.ts && pnpm test:db tests/integration/motor-semanal.test.ts`
Expected: PASS.

Run: `pnpm test:run tests/unit/anthropic-instrucciones.test.ts`
Expected: exactly one FAIL, "keeps the theories prompt" (`usuario` and `cuerpo` moved, `sistema` did not: the cached guide is unchanged). Any other failure is a mistake: stop and fix it. Then:

Run: `pnpm test:run tests/unit/anthropic-instrucciones.test.ts -u -t "keeps the theories prompt" && pnpm test:run tests/unit/anthropic-instrucciones.test.ts`
Expected: PASS; `git diff tests/unit/anthropic-instrucciones.test.ts` changes only that case's `cuerpo` and `usuario`.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/anthropic/nucleo.ts lib/proveedores/anthropic/secciones.ts lib/proveedores/anthropic/teorias.ts lib/motor/semanal.ts tests/unit/anthropic-angulos.test.ts tests/unit/anthropic-teorias-motor.test.ts tests/unit/anthropic-instrucciones.test.ts tests/integration/motor-semanal.test.ts
git commit -m "Have the weekly engine propose each idea's angle and store it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Coni's own idea: Claude proposes the angle, she confirms it

**Files:**
- Modify: `lib/proveedores/anthropic/ideas.ts`, `lib/acciones/ideas.ts`, `app/(app)/ideas/acciones.ts`, `app/(app)/ideas/idea-propia.tsx`, `app/(app)/ideas/page.tsx`
- Create: `tests/unit/idea-propia-angulo.test.tsx`
- Modify: `tests/unit/anthropic-angulos.test.ts`, `tests/integration/acciones-ideas.test.ts`, `tests/unit/banco-de-ideas.test.tsx`, `tests/unit/anthropic-instrucciones.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/anthropic-angulos.test.ts` (add `clasificarIdea` to the import from `@/lib/proveedores/anthropic` and `pilaresParaElegir` to the one from `@/lib/dominio/pilares`):

```ts

describe("clasificarIdea con ángulos", () => {
  const pilares = pilaresParaElegir(PILARES_DE_PRUEBA)
  const propuesta = (pilar: string, angulo?: string) => ({
    pilar,
    formato: "Mito o realidad",
    alertas: [],
    ...(angulo === undefined ? {} : { angulo }),
  })

  it("asks for the angle and keeps one of the chosen pillar", async () => {
    const usuarios = respondiendo(propuesta("mi-nueva-partida", "pruebalo-tu"))
    const { propuesta: salida } = await clasificarIdea({ cliente: cliente(), guia: "Guía.", gancho: "G", tema: "", pilares })
    expect(salida.angulo).toBe("pruebalo-tu")
    expect(usuarios[0]).toContain("  - ángulo pruebalo-tu: Pruébalo tú.")
  })

  it("drops an angle of another pillar and reads a missing one as none", async () => {
    respondiendo(propuesta("mujeres-lideres", "pruebalo-tu"))
    expect((await clasificarIdea({ cliente: cliente(), guia: "G", gancho: "G", tema: "", pilares })).propuesta.angulo).toBeNull()
    respondiendo(propuesta("mi-nueva-partida"))
    expect((await clasificarIdea({ cliente: cliente(), guia: "G", gancho: "G", tema: "", pilares })).propuesta.angulo).toBeNull()
  })
})
```

In `tests/integration/acciones-ideas.test.ts`, inside `describe("crearIdeaPropia", ...)`, add:

```ts
  it("saves the angle she confirmed, and refuses one of another pillar", async () => {
    const conAngulo = { ...entrada, gancho: `${entrada.gancho} (ángulo)`, pilar: "mi-nueva-partida", angulo: "pruebalo-tu" }
    expect((await crearIdeaPropia(deps(), conAngulo)).ok).toBe(true)
    const { rows } = await pool.query<{ id: string; angulo: string | null }>(
      `select i.id, a.slug as angulo from public.ideas i left join public.pilar_angulos a on a.id = i.angulo_id
        where i.gancho = $1`,
      [conAngulo.gancho],
    )
    ideasCreadas.push(...rows.map((r) => r.id))
    expect(rows.map((r) => r.angulo)).toEqual(["pruebalo-tu"])

    const ajeno = await crearIdeaPropia(deps(), { ...conAngulo, gancho: `${entrada.gancho} (ajeno)`, angulo: "lo-que-construyo" })
    expect(ajeno).toEqual({ ok: false, error: "Ese ángulo no es de este pilar." })
  })
```

Create `tests/unit/idea-propia-angulo.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { IdeaPropia } from "@/app/(app)/ideas/idea-propia"
import { pilaresParaElegir } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const PILARES = pilaresParaElegir(PILARES_DE_PRUEBA).map(({ slug, nombre, nombreCorto, red, angulos }) => ({
  slug,
  nombre,
  nombreCorto,
  red,
  angulos: angulos.map(({ id, slug: deAngulo, nombre: deNombre }) => ({ id, slug: deAngulo, nombre: deNombre })),
}))
const PSICOLOGIA = "Psicología en la mesa: la psicología donde se construye la IA"

function montar() {
  const crear = vi.fn(async () => ({ ok: true as const, id: "nueva" }))
  const proponer = vi.fn(async () => ({
    ok: true as const,
    propuesta: { pilar: "psicologia-en-la-mesa", formato: "Mito o realidad", alertas: [], angulo: "lo-que-construyo" },
  }))
  render(<IdeaPropia proponer={proponer} crear={crear} pilares={PILARES} alGuardar={vi.fn()} alVolver={vi.fn()} />)
  return { crear }
}

async function proponer() {
  fireEvent.change(screen.getByLabelText("Tu idea"), { target: { value: "Construyo un modelo." } })
  fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))
  await screen.findByRole("group", { name: "Ángulo" })
}

describe("IdeaPropia con ángulos", () => {
  it("shows Claude's angle under the pillar, and saves it", async () => {
    const { crear } = montar()
    await proponer()
    expect(screen.getByRole("radio", { name: "Lo que construyo" })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))
    await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ angulo: "lo-que-construyo" })))
  })

  it("hides the angles for a pillar without them and forgets the angle when the pillar changes", async () => {
    const { crear } = montar()
    await proponer()
    fireEvent.click(screen.getByRole("radio", { name: "Mujeres líderes, IA y síndrome del impostor" }))
    expect(screen.queryByRole("group", { name: "Ángulo" })).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: PSICOLOGIA }))
    expect(screen.getByRole("radio", { name: "Sin ángulo" })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))
    await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ angulo: null })))
  })

  it("saves once when she taps twice", async () => {
    const { crear } = montar()
    await proponer()
    const guardar = screen.getByRole("button", { name: "Guardar idea" })
    fireEvent.click(guardar)
    fireEvent.click(guardar)
    await waitFor(() => expect(crear).toHaveBeenCalledTimes(1))
  })
})
```

In `tests/unit/banco-de-ideas.test.tsx`, in `acciones()`'s `proponer` mock, add `angulo: null,` after `formato: "Mito o realidad",`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/anthropic-angulos.test.ts tests/unit/idea-propia-angulo.test.tsx && pnpm test:db tests/integration/acciones-ideas.test.ts`
Expected: FAIL (no `angulo` in the proposal, no «Ángulo» group, the action ignores the angle).

- [ ] **Step 3: Implement**

In `lib/proveedores/anthropic/ideas.ts`:
- import `anguloPorSlug` with `DatosDePilar` and `slugsActivos`; add `textoONulo` to the `./nucleo` import; import `listaDePilares, REGLA_DE_ANGULO` from `./secciones`;
- in `salidaIdea`, after `formato: z.string(),` add `angulo: textoONulo(),`;
- in `pedidoDeClasificacion`, replace the two PILARES lines with

```ts
PILARES (usa exactamente el slug (lo que va antes de los dos puntos) en pilar. ${REGLA_DE_ANGULO})
${listaDePilares(entrada.pilares, { angulos: true })}
```

- change the first sentence's "Propón en qué pilar de la línea editorial va," to "Propón en qué pilar de la línea editorial va (y con qué ángulo, si el pilar los tiene),";
- in `clasificarIdea`, replace `return { propuesta: salida, uso }` with

```ts
  // An angle that is not one of the chosen pillar's is dropped (spec 15d, decision 3): she picks it on screen.
  return { propuesta: { ...salida, angulo: anguloPorSlug(pilares, salida.pilar, salida.angulo)?.slug ?? null }, uso }
```

In `lib/acciones/ideas.ts`:
- import `anguloPorSlug` from `@/lib/dominio/pilares`;
- after `const NoDisponible = ...` add

```ts
export const ANGULO_DE_OTRO_PILAR = "Ese ángulo no es de este pilar."
export const ANGULO_FIRMADO = "Ya firmaste el guion: el ángulo quedó como estaba."
```

- in `IdeaConfirmada`, after `pilar: z.string().min(1),` add `angulo: z.string().max(60).nullable().default(null),`;
- in `crearIdeaPropia`, after the pillar check add

```ts
    const angulo = anguloPorSlug(elegibles, idea.data.pilar, idea.data.angulo)
    if (idea.data.angulo !== null && angulo === null) throw new Falla(ANGULO_DE_OTRO_PILAR)
```

and in its insert, after `pilar: idea.data.pilar,`, add `angulo_id: angulo?.id ?? null,`.

In `app/(app)/ideas/acciones.ts`, in `ideaConfirmada`, after `pilar: z.string().max(40),` add `angulo: z.string().max(60).nullable(),`.

In `app/(app)/ideas/page.tsx`, replace the `pilares=` prop with:

```tsx
      pilares={activos.map(({ slug, nombre, nombreCorto, red, angulos }) => ({
        slug,
        nombre,
        nombreCorto,
        red,
        angulos: angulos.map((angulo) => ({ id: angulo.id, slug: angulo.slug, nombre: angulo.nombre })),
      }))}
```

In `app/(app)/ideas/idea-propia.tsx`:
- in `IdeaConfirmada`, after `pilar: string` add `/** The slug of her angle, or null. */\n  angulo: string | null`;
- after `const [pilar, setPilar] = useState<string | null>(null)` add `const [angulo, setAngulo] = useState<string | null>(null)`;
- in `pedirPropuesta`, after `setPilar(propuesta.pilar)` add `setAngulo(propuesta.angulo)`;
- add, before `function guardar()`:

```tsx
  // A new pillar keeps no angle of the old one: she picks again, or keeps «Sin ángulo».
  function elegirPilar(slug: string) {
    if (slug === pilar) return
    setPilar(slug)
    setAngulo(null)
  }

  const angulosDelElegido = pilares.find((candidato) => candidato.slug === pilar)?.angulos ?? []
```

- in `guardar`, change `if (pilar === null) return` to `if (pilar === null || pendiente) return` (a second tap while it saves is ignored) and add `angulo,` after `pilar,` in the object sent to `crear`;
- in the pillar radios, change `alElegir={() => setPilar(candidato.slug)}` to `alElegir={() => elegirPilar(candidato.slug)}`;
- right after the pillar `</fieldset>` that closes `<fieldset className="elecciones grid">` (before `<Grupo>`), add:

```tsx
          {angulosDelElegido.length > 0 ? (
            <fieldset className="elecciones grid">
              <legend className="mb-1 text-meta font-semibold">Ángulo</legend>
              {angulosDelElegido.map((opcion) => (
                <Eleccion
                  key={opcion.slug}
                  nombre="angulo"
                  valor={opcion.slug}
                  elegido={angulo === opcion.slug}
                  etiqueta={opcion.nombre}
                  alElegir={() => setAngulo(opcion.slug)}
                />
              ))}
              <Eleccion
                nombre="angulo"
                valor=""
                elegido={angulo === null}
                etiqueta="Sin ángulo"
                alElegir={() => setAngulo(null)}
              />
            </fieldset>
          ) : null}
```

- [ ] **Step 4: Run them, then update the idea's fingerprint deliberately**

Run: `pnpm test:run tests/unit/anthropic-angulos.test.ts tests/unit/idea-propia-angulo.test.tsx tests/unit/banco-de-ideas.test.tsx && pnpm test:db tests/integration/acciones-ideas.test.ts`
Expected: PASS.

Run: `pnpm test:run tests/unit/anthropic-instrucciones.test.ts`
Expected: exactly one FAIL, "keeps the idea and pillar classification prompts", and only its `idea` entry moved (`usuario`, `cuerpo`); `pilares` (the reclassification of 2026-10-17) did not. Then:

Run: `pnpm test:run tests/unit/anthropic-instrucciones.test.ts -u -t "keeps the idea and pillar classification prompts" && pnpm test:run tests/unit/anthropic-instrucciones.test.ts`
Expected: PASS; `git diff` on that file shows only the `idea` hashes.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/anthropic/ideas.ts lib/acciones/ideas.ts "app/(app)/ideas/acciones.ts" "app/(app)/ideas/idea-propia.tsx" "app/(app)/ideas/page.tsx" tests/unit/anthropic-angulos.test.ts tests/unit/idea-propia-angulo.test.tsx tests/unit/banco-de-ideas.test.tsx tests/unit/anthropic-instrucciones.test.ts tests/integration/acciones-ideas.test.ts
git commit -m "Propose the angle of Coni's own idea and let her confirm it with the pillar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: The angle in `pilares:proponer`, with the 15a CSV still accepted

**Files:**
- Modify: `lib/proveedores/anthropic/pilares.ts`, `lib/pilares/por-red.ts`, `lib/pilares/ejecutar-por-red.ts`, `lib/datos/pilares-por-red.ts`
- Modify: `tests/unit/pilares-por-red.test.ts`, `tests/unit/anthropic-angulos.test.ts`, `tests/integration/pilares-por-red-script.test.ts`, `tests/unit/anthropic-instrucciones.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pilares-por-red.test.ts`:
- in both factories `tema()` and `idea()`, after `pilar_nuevo: ...,` add `angulo: "",`;
- in the `filasDePropuesta` test, change `ideas: [{ id: IDEA, pilar: null, razon: "Claude no propuso un pilar." }],` to `ideas: [{ id: IDEA, pilar: null, angulo: null, razon: "Claude no propuso un pilar." }],`;
- change the expected header to `'"tipo","id","nombre","linkedin","instagram","secundarios","capa_tdah","pilar_nuevo","angulo","venia_de","razon"'`;
- change `"Fila 4: tiene 11 valores y el CSV tiene 10 columnas."` to `"Fila 4: tiene 12 valores y el CSV tiene 11 columnas."`;
- change `"| Idea | Pilar nuevo | Venía de |"` to `"| Idea | Pilar nuevo | Ángulo | Venía de |"` and `"| Uso un avatar. | Psicología en la mesa | Caso Coni |"` to `"| Uso un avatar. | Psicología en la mesa | Sin ángulo | Caso Coni |"`;
- append:

```ts

describe("el ángulo en la propuesta de pilares (15d)", () => {
  it("still reads a CSV saved with the 15a header, its ideas without angle", () => {
    const de15a = [
      '"tipo","id","nombre","linkedin","instagram","secundarios","capa_tdah","pilar_nuevo","venia_de","razon"',
      `"idea","${IDEA}","Uso un avatar.","","","","","psicologia-en-la-mesa","Caso Coni","Lo construye ella."`,
      "",
    ].join("\n")
    expect(leerCsvPorRed(de15a)).toEqual([idea()])
  })

  it("sends an idea's angle with the lot, and names an angle of another pillar", () => {
    expect(filasDelLote([tema(), idea({ angulo: "lo-que-construyo" })], PILARES_DE_PRUEBA).ideas).toEqual([
      { ideaId: IDEA, pilar: "psicologia-en-la-mesa", angulo: "lo-que-construyo" },
    ])
    expect(() => filasDelLote([tema(), idea({ angulo: "pruebalo-tu" })], PILARES_DE_PRUEBA)).toThrow(
      `Fila 3 (idea ${IDEA}): «pruebalo-tu» no es un ángulo de «psicologia-en-la-mesa».`,
    )
  })

  it("shows the angle's name to Coni", () => {
    const md = aMarkdownParaConi([tema(), idea({ angulo: "lo-que-construyo" })], PILARES_DE_PRUEBA)
    expect(md).toContain("| Uso un avatar. | Psicología en la mesa | Lo que construyo | Caso Coni |")
  })
})
```

Append to `tests/unit/anthropic-angulos.test.ts` (add `proponerPilaresPorRed` to the provider import):

```ts

describe("proponerPilaresPorRed con ángulos", () => {
  it("keeps an idea's angle of its pillar and drops the rest", async () => {
    respondiendo({
      temas: [],
      ideas: [
        { id: "i1", pilar: "psicologia-en-la-mesa", angulo: "lo-que-construyo", razon: "Sí." },
        { id: "i2", pilar: "psicologia-en-la-mesa", angulo: "lo-vivo", razon: "No." },
        { id: "i3", pilar: "mujeres-lideres", razon: "Sin ángulo." },
      ],
    })
    const { ideas } = await proponerPilaresPorRed({
      cliente: cliente(),
      pilares: PILARES_DE_PRUEBA,
      temas: [],
      ideas: ["i1", "i2", "i3"].map((id) => ({ id, gancho: "G", tema: "" })),
    })
    expect(ideas.map((idea) => idea.angulo)).toEqual(["lo-que-construyo", null, null])
  })
})
```

In `tests/integration/pilares-por-red-script.test.ts`, in the literal `FilaPorRed` of "aplicar applies the reviewed CSV ...", after `pilar_nuevo: "psicologia-en-la-mesa",` add `angulo: id === idea ? "lo-que-construyo" : "",`; then, inside its `try`, after `expect(viejos.rowCount).toBe(0)`, add:

```ts
      const conAngulo = await pool.query<{ angulo: string | null }>(
        "select a.slug as angulo from public.ideas i left join public.pilar_angulos a on a.id = i.angulo_id where i.id = $1",
        [idea],
      )
      expect(conAngulo.rows[0]?.angulo).toBe("lo-que-construyo")
      expect(uso.lineas.at(-1)).toContain("1 ángulo puesto")
```

and after the `finally` block, next to the pillar check, add:

```ts
    const sinAngulo = await pool.query<{ angulo_id: string | null }>("select angulo_id from public.ideas where id = $1", [idea])
    expect(sinAngulo.rows[0]?.angulo_id).toBeNull()
```

(Change `expect(uso.lineas.at(-1)).toContain(\`Lote ${LOTE_PILARES_POR_RED} aplicado\`)` in that test to `expect(uso.lineas.some((linea) => linea.includes(\`Lote ${LOTE_PILARES_POR_RED} aplicado\`))).toBe(true)`.)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/pilares-por-red.test.ts tests/unit/anthropic-angulos.test.ts && pnpm test:db tests/integration/pilares-por-red-script.test.ts`
Expected: FAIL (no `angulo` column, no angle step).

- [ ] **Step 3: Implement**

In `lib/proveedores/anthropic/pilares.ts`:
- import `anguloPorSlug` with the other names from `@/lib/dominio/pilares`; add `textoONulo` to the `./nucleo` import;
- in `PropuestaDeIdeaPorRed`, after `pilar: string | null` add `/** The slug of its angle, when its pillar has them. */\n  angulo: string | null`;
- after `const linea = ...` add

```ts
const conAngulos = (pilar: DatosDePilar) =>
  [linea(pilar), ...pilar.angulos.map((a) => `  - ángulo ${a.slug}: ${a.nombre}. ${a.descripcion}`)].join("\n")
```

- in `guiaDePilaresPorRed`'s blocks, replace `${deRed(pilares, red).map(linea).join("\n")}` with `${deRed(pilares, red).map(conAngulos).join("\n")}`;
- replace its last paragraph with: `Para cada idea responde una vez, con su mismo id, el slug del pilar (de cualquier red, nunca una capa) que mejor le calza, en angulo el slug del ángulo de ese pilar que mejor le calza si el pilar tiene ángulos (null si no tiene) y una razón de una oración en español de Chile, sin rayas largas.`;
- in `SalidaPilaresPorRed`, the ideas object becomes `z.object({ id: z.string(), pilar: z.string().nullable(), angulo: textoONulo(), razon: z.string() })`;
- in the ideas loop, replace `deIdeas.set(idea.id, { id: idea.id, pilar, razon: sinRaya(idea.razon) })` with

```ts
    const angulo = pilar === null ? null : (anguloPorSlug(entrada.pilares, pilar, idea.angulo)?.slug ?? null)
    deIdeas.set(idea.id, { id: idea.id, pilar, angulo, razon: sinRaya(idea.razon) })
```

- in the fallback, `{ id: idea.id, pilar: null, angulo: null, razon: "Claude no propuso un pilar." }`.

In `lib/pilares/por-red.ts`:
- import `anguloPorSlug` from `@/lib/dominio/pilares`;
- replace `COLUMNAS_POR_RED` with

```ts
export const COLUMNAS_POR_RED = [
  "tipo",
  "id",
  "nombre",
  "linkedin",
  "instagram",
  "secundarios",
  "capa_tdah",
  "pilar_nuevo",
  "angulo",
  "venia_de",
  "razon",
] as const

/** The header of 15a, before the angle: a CSV reviewed with it still applies, its ideas without angle. */
const COLUMNAS_DE_15A = COLUMNAS_POR_RED.filter((columna) => columna !== "angulo")
```

- in `FilaPorRed`, after `pilar_nuevo: string` add `/** An idea's angle slug, or "". */\n  angulo: string`, and extend its doc comment: "ideas fill `pilar_nuevo` and, when it has angles, `angulo`";
- in `FilasDelLote`, `ideas: { ideaId: string; pilar: string; angulo?: string }[]`;
- in `filasDePropuesta`, `vacia` gains `angulo: ""`, and the idea row gains `angulo: p?.angulo ?? "",` after `pilar_nuevo`;
- replace `leerCsvPorRed` with:

```ts
export function leerCsvPorRed(texto: string): FilaPorRed[] {
  const [cabecera, ...resto] = camposDeCsv(texto.replace(/^﻿/, ""))
  const linea = cabecera?.valores.join(",")
  const columnas: readonly string[] | undefined = [COLUMNAS_POR_RED, COLUMNAS_DE_15A].find(
    (candidatas) => candidatas.join(",") === linea,
  )
  if (!columnas) {
    throw new Error(
      `La primera línea tiene que ser: ${COLUMNAS_POR_RED.join(",")}. ¿Lo guardaste con punto y coma? Expórtalo como CSV UTF-8 separado por comas.`,
    )
  }
  const errores: string[] = []
  const filas = resto.flatMap(({ valores }, indice): FilaPorRed[] => {
    const donde = `Fila ${filaDeHoja(indice)}`
    const de = (columna: (typeof COLUMNAS_POR_RED)[number]) => {
      const posicion = columnas.indexOf(columna)
      return posicion < 0 ? "" : (valores[posicion] ?? "").trim()
    }
    const tipo = de("tipo")
    const id = de("id")
    const antes = errores.length
    if (id === "") errores.push(`${donde}: falta el id.`)
    if (tipo !== "tema" && tipo !== "idea") errores.push(`${donde}: tipo desconocido «${tipo}».`)
    if (valores.length > columnas.length) {
      errores.push(`${donde}: tiene ${valores.length} valores y el CSV tiene ${columnas.length} columnas.`)
    }
    if (errores.length > antes || (tipo !== "tema" && tipo !== "idea")) return []
    return [
      {
        tipo,
        id,
        nombre: de("nombre"),
        linkedin: de("linkedin"),
        instagram: de("instagram"),
        secundarios: de("secundarios"),
        capa_tdah: de("capa_tdah"),
        pilar_nuevo: de("pilar_nuevo"),
        angulo: de("angulo"),
        venia_de: de("venia_de"),
        razon: de("razon"),
      },
    ]
  })
  if (errores.length > 0) throw new Error(`El CSV tiene errores:\n${errores.join("\n")}`)
  return filas
}
```

- in `aMarkdownParaConi`, add `const angulo = (fila: FilaPorRed) => anguloPorSlug(catalogo, fila.pilar_nuevo, fila.angulo)?.nombre ?? "Sin ángulo"`, change the ideas header to `"| Idea | Pilar nuevo | Ángulo | Venía de |"`, the separator to `"|---|---|---|---|"`, and the row to

```ts
      (fila) =>
        `| ${celda(fila.nombre)} | ${fila.pilar_nuevo ? nombre(fila.pilar_nuevo) : "Sin proponer"} | ${angulo(fila)} | ${fila.venia_de ? celda(fila.venia_de) : "Sin pilar"} |`,
```

- in `filasDelLote`, replace `else resultado.ideas.push({ ideaId: fila.id, pilar: pilar.slug })` with

```ts
      else if (fila.angulo === "") resultado.ideas.push({ ideaId: fila.id, pilar: pilar.slug })
      else {
        const angulo = anguloPorSlug(catalogo, pilar.slug, fila.angulo)
        if (!angulo) errores.push(`${donde}: «${fila.angulo}» no es un ángulo de «${pilar.slug}».`)
        else resultado.ideas.push({ ideaId: fila.id, pilar: pilar.slug, angulo: angulo.slug })
      }
```

In `lib/datos/pilares-por-red.ts` (the `loteAJson` RPC payload stays as it is: the 15a function never sees the angle), add `anguloPorSlug, type CatalogoDePilares` to the import from `@/lib/dominio/pilares` (add the import if absent) and append:

```ts

/**
 * After `aplicar_lote_de_pilares` (spec 15d, plan decision 1): each moved idea's angle, when the CSV names one. The
 * 15a function stays untouched; if this step fails, the lot stays applied and the ideas without those angles. Answers
 * how many angles it set.
 */
export async function ponerAngulosDelLote(
  db: Db,
  ideas: FilasDelLote["ideas"],
  catalogo: CatalogoDePilares,
): Promise<number> {
  let puestos = 0
  for (const idea of ideas) {
    const angulo = anguloPorSlug(catalogo, idea.pilar, idea.angulo)
    if (!angulo) continue
    const { error } = await db.from("ideas").update({ angulo_id: angulo.id }).eq("id", idea.ideaId)
    if (error) {
      throw new Error(
        `Apliqué el lote, pero no pude poner el ángulo de la idea ${idea.ideaId}: ${error.message}. Ponlo desde su tarjeta en Ideas.`,
        { cause: error },
      )
    }
    puestos += 1
  }
  return puestos
}
```

In `lib/pilares/ejecutar-por-red.ts`, import `ponerAngulosDelLote` with the other `@/lib/datos/pilares-por-red` names, and in `aplicar`:
- replace `const lote = filasDelLote(filas, await leerPilares(deps.db))` with `const catalogo = await leerPilares(deps.db)` and `const lote = filasDelLote(filas, catalogo)`;
- after the `deps.avisar(` of the applied lot, add:

```ts
  const angulos = await ponerAngulosDelLote(deps.db, lote.ideas, catalogo)
  if (angulos > 0) deps.avisar(`${angulos === 1 ? "1 ángulo puesto" : `${angulos} ángulos puestos`} en las ideas movidas.`)
```

- [ ] **Step 4: Run them, then update the proposal's fingerprint deliberately**

Run: `pnpm test:run tests/unit/pilares-por-red.test.ts tests/unit/anthropic-angulos.test.ts tests/unit/anthropic-pilares-por-red.test.ts && pnpm test:db tests/integration/pilares-por-red-script.test.ts`
Expected: PASS. (If `anthropic-pilares-por-red.test.ts` compares whole idea proposals, add `angulo: null` to its expected ideas: the field is new and null for pillars without angles.)

Run: `pnpm test:run tests/unit/anthropic-instrucciones.test.ts`
Expected: exactly one FAIL, "keeps the pillars-per-network proposal prompt". Then:

Run: `pnpm test:run tests/unit/anthropic-instrucciones.test.ts -u -t "keeps the pillars-per-network proposal prompt" && pnpm test:run tests/unit/anthropic-instrucciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/anthropic/pilares.ts lib/pilares/por-red.ts lib/pilares/ejecutar-por-red.ts lib/datos/pilares-por-red.ts tests/unit/pilares-por-red.test.ts tests/unit/anthropic-angulos.test.ts tests/unit/anthropic-pilares-por-red.test.ts tests/integration/pilares-por-red-script.test.ts tests/unit/anthropic-instrucciones.test.ts
git commit -m "Propose an angle in pilares:proponer and set it after the lot, keeping the 15a CSV valid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The angle's voice and format in the guion and carousel prompts

**Files:**
- Modify: `lib/proveedores/anthropic/secciones.ts`, `guion.ts`, `carrusel.ts`, `lib/datos/repositorio.ts`, `lib/produccion/contexto.ts`, `lib/produccion/producir.ts`, `lib/produccion/carrusel.ts`
- Modify: `tests/unit/anthropic-angulos.test.ts`, `tests/unit/anthropic-instrucciones.test.ts`
- Create: `tests/integration/angulos-en-pantallas.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/anthropic-angulos.test.ts` (add `escribirCarrusel, escribirGuion, RechazoDeClaude` to the provider import):

```ts

describe("el ángulo en el guion y el carrusel", () => {
  const ANGULO = {
    nombre: "Lo que construyo",
    descripcion: "Mi caso a la vista. Voz íntima, fotos reales, demos y video.",
  }
  const IDEA = {
    pilar: { nombre: "Psicología en la mesa", descripcion: "La psicología donde se construye la IA." },
    gancho: "Entreno modelos.",
    tema: "Construir con IA.",
    formato: "Mito o realidad",
    alertas: [],
  }

  function rechazando() {
    const usuarios: string[] = []
    servidor.use(
      http.post<never, { messages: { content: string }[] }>(URL_MENSAJES, async ({ request }) => {
        usuarios.push((await request.json()).messages[0]?.content ?? "")
        return HttpResponse.json({
          id: "msg",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [],
          stop_reason: "refusal",
          stop_sequence: null,
          usage: USO,
        })
      }),
    )
    return usuarios
  }

  const comun = { guia: "Guía.", respaldo: null, fuentes: [], requiereLineasAyuda: false }
  const LINEA = "Pilar: Psicología en la mesa (La psicología donde se construye la IA.)\nÁngulo: Lo que construyo (Mi caso a la vista. Voz íntima, fotos reales, demos y video.)\nEscribe con la voz y el formato del ángulo.\nGancho: Entreno modelos."

  it("writes the guion with the angle under the pillar", async () => {
    const usuarios = rechazando()
    await expect(escribirGuion({ cliente: cliente(), ...comun, idea: { ...IDEA, angulo: ANGULO } })).rejects.toBeInstanceOf(
      RechazoDeClaude,
    )
    expect(usuarios[0]).toContain(LINEA)
  })

  it("writes the carousel with the angle under the pillar", async () => {
    const usuarios = rechazando()
    await expect(
      escribirCarrusel({ cliente: cliente(), ...comun, cambio: null, idea: { ...IDEA, angulo: ANGULO } }),
    ).rejects.toBeInstanceOf(RechazoDeClaude)
    expect(usuarios[0]).toContain(LINEA)
  })

  it("sends no angle line for an idea without one", async () => {
    const usuarios = rechazando()
    await expect(escribirGuion({ cliente: cliente(), ...comun, idea: { ...IDEA, angulo: null } })).rejects.toBeInstanceOf(
      RechazoDeClaude,
    )
    expect(usuarios[0]).not.toContain("Ángulo:")
  })
})
```

In `tests/unit/anthropic-instrucciones.test.ts`, after `const IDEA_SIN_NADA = ...` add:

```ts
// 15d: the angle line. An idea without one keeps every hash above (the field is absent there on purpose).
const IDEA_CON_ANGULO = {
  ...IDEA,
  angulo: { nombre: "Lo que construyo", descripcion: "Mi caso a la vista. Voz íntima, fotos reales, demos y video." },
}
```

and, at the end of the `describe`, add:

```ts
  it("keeps the script and carousel prompts of an idea with an angle", async () => {
    const guion = await huellas((c) =>
      escribirGuion({ cliente: c, guia: GUIA, idea: IDEA_CON_ANGULO, respaldo: null, fuentes: [], requiereLineasAyuda: false }),
    )
    const carrusel = await huellas((c) =>
      escribirCarrusel({
        cliente: c,
        guia: GUIA,
        idea: IDEA_CON_ANGULO,
        respaldo: null,
        fuentes: [],
        requiereLineasAyuda: false,
        cambio: null,
      }),
    )
    expect({ guion, carrusel }).toMatchInlineSnapshot()
  })
```

Create `tests/integration/angulos-en-pantallas.test.ts`:

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { leerPieza } from "@/lib/datos/repositorio"
import { cargarContexto } from "@/lib/produccion/contexto"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado } from "./siembra"

let piezas: string[] = []
let ideas: string[] = []

afterEach(async () => {
  await borrarSembrado(piezas, ideas)
  piezas = []
  ideas = []
})
afterAll(() => pool.end())

/** A bank idea on `pilar` with `angulo` (or none), and a piece of it. */
async function ideaConPieza(pilar: string, angulo: string | null): Promise<{ idea: string; pieza: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.ideas (pilar, angulo_id, gancho, tema, fuerza, estado)
     values ($1, (select id from public.pilar_angulos where slug = $2), 'Entreno modelos.', 'Construir', 'alta', 'usada') returning id`,
    [pilar, angulo],
  )
  const idea = rows[0]?.id ?? ""
  ideas.push(idea)
  const { rows: creada } = await pool.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Entreno modelos') returning id",
    [idea],
  )
  const pieza = creada[0]?.id ?? ""
  piezas.push(pieza)
  return { idea, pieza }
}

describe("cargarContexto", () => {
  it("gives the writer the idea's angle with its voice and format, and none without one", async () => {
    const db = clienteDeServicio()
    const con = await ideaConPieza("psicologia-en-la-mesa", "lo-que-construyo")
    const fila = await leerPieza(db, con.pieza)
    if (!fila) throw new Error("No leí la pieza")
    expect((await cargarContexto({ db }, fila)).angulo).toEqual({
      nombre: "Lo que construyo",
      descripcion:
        "Mi caso a la vista. Una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg. Voz íntima, fotos reales, demos y video.",
    })
    const sin = await ideaConPieza("psicologia-en-la-mesa", null)
    const otra = await leerPieza(db, sin.pieza)
    if (!otra) throw new Error("No leí la pieza")
    expect((await cargarContexto({ db }, otra)).angulo).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/anthropic-angulos.test.ts && pnpm test:db tests/integration/angulos-en-pantallas.test.ts`
Expected: FAIL (no «Ángulo:» line; `angulo` undefined in the context).

- [ ] **Step 3: Implement**

In `lib/proveedores/anthropic/secciones.ts`, in `IdeaParaGuion`, after `pilar: ...` add:

```ts
  /** The idea's angle (spec 15d): its name and its voice and format. Absent or null without one. */
  angulo?: { nombre: string; descripcion: string } | null
```

and after `listaDeAlertas` add:

```ts
/** The lines under «Pilar:» for an idea with an angle; "" without one, so that prompt stays byte for byte as before. */
export function lineaDeAngulo(angulo: IdeaParaGuion["angulo"]): string {
  return angulo ? `\nÁngulo: ${angulo.nombre} (${angulo.descripcion})\nEscribe con la voz y el formato del ángulo.` : ""
}
```

In `lib/proveedores/anthropic/guion.ts` and `lib/proveedores/anthropic/carrusel.ts`, add `lineaDeAngulo` to the `./secciones` import and replace the line

```ts
Pilar: ${idea.pilar.nombre}${idea.pilar.descripcion ? ` (${idea.pilar.descripcion})` : ""}
```

with

```ts
Pilar: ${idea.pilar.nombre}${idea.pilar.descripcion ? ` (${idea.pilar.descripcion})` : ""}${lineaDeAngulo(idea.angulo)}
```

In `lib/datos/repositorio.ts`, in `IdeaLeida` add `angulo_id: string | null` after `pilar: string`, and in `leerIdea` change the select to `"id, pilar, angulo_id, gancho, tema, formato, alertas"`.

In `lib/produccion/contexto.ts`, in `Contexto` after `pilar: ...` add

```ts
  /** The idea's angle as the writer reads it (spec 15d), or null. */
  angulo: { nombre: string; descripcion: string } | null
```

and, after `const pilar = { ... }`, add

```ts
  const delAngulo = idea.angulo_id === null ? null : datosDelPilar.angulos.find((a) => a.id === idea.angulo_id)
  if (delAngulo === undefined) {
    throw new FallaDeConfiguracion(`La idea ${idea.id} apunta a un ángulo que no es de su pilar: ${idea.angulo_id}.`)
  }
  const angulo = delAngulo === null ? null : { nombre: delAngulo.nombre, descripcion: delAngulo.descripcion }
```

returning `{ idea, pilar, angulo, guia: guia.texto, respaldo }`.

In `lib/produccion/producir.ts`, change `const { idea, pilar, guia, respaldo } = contexto` to `const { idea, pilar, angulo, guia, respaldo } = contexto` and `const paraElEscritor = { ...idea, pilar }` to `const paraElEscritor = { ...idea, pilar, angulo }`.

In `lib/produccion/carrusel.ts`, change `const { idea, pilar, guia, respaldo } = contexto` to `const { idea, pilar, angulo, guia, respaldo } = contexto` and `idea: { ...idea, pilar },` to `idea: { ...idea, pilar, angulo },`.

- [ ] **Step 4: Run them; the new characterization case writes its snapshot once**

Run: `pnpm test:run tests/unit/anthropic-angulos.test.ts && pnpm test:db tests/integration/angulos-en-pantallas.test.ts tests/integration/producir.test.ts tests/integration/producir-carrusel.test.ts`
Expected: PASS.

Run: `pnpm test:run tests/unit/anthropic-instrucciones.test.ts`
Expected: PASS; Vitest wrote the inline snapshot of "keeps the script and carousel prompts of an idea with an angle" (local runs write new inline snapshots) and every older hash stayed. `git diff` on the file shows only the new case's hashes. Run it once more: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/anthropic/secciones.ts lib/proveedores/anthropic/guion.ts lib/proveedores/anthropic/carrusel.ts lib/datos/repositorio.ts lib/produccion/contexto.ts lib/produccion/producir.ts lib/produccion/carrusel.ts tests/unit/anthropic-angulos.test.ts tests/unit/anthropic-instrucciones.test.ts tests/integration/angulos-en-pantallas.test.ts
git commit -m "Write guiones and carousels with the voice and format of the idea's angle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Phase 4: Coni sees and changes the angle

### Task 11: The action that changes an idea's angle

**Files:**
- Modify: `lib/acciones/ideas.ts`, `app/(app)/ideas/acciones.ts`
- Modify: `tests/integration/acciones-ideas.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/integration/acciones-ideas.test.ts`, add `cambiarAngulo` to the import from `@/lib/acciones/ideas` and append:

```ts

describe("cambiarAngulo", () => {
  async function anguloId(slug: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>("select id from public.pilar_angulos where slug = $1", [slug])
    return rows[0]?.id ?? ""
  }

  it("sets, changes and clears the angle of an idea of hers", async () => {
    const id = await sembrarIdea({ pilar: "psicologia-en-la-mesa" })
    ideasCreadas.push(id)
    expect(await cambiarAngulo(deps(), { ideaId: id, anguloId: await anguloId("lo-que-construyo") })).toEqual({ ok: true })
    expect((await fila(id)).angulo_id).toBe(await anguloId("lo-que-construyo"))
    expect(await cambiarAngulo(deps(), { ideaId: id, anguloId: null })).toEqual({ ok: true })
    expect((await fila(id)).angulo_id).toBeNull()
  })

  it("says in her words an angle of another pillar", async () => {
    const id = await sembrarIdea({ pilar: "psicologia-en-la-mesa" })
    ideasCreadas.push(id)
    expect(await cambiarAngulo(deps(), { ideaId: id, anguloId: await anguloId("lo-vivo") })).toEqual({
      ok: false,
      error: "Ese ángulo no es de este pilar.",
    })
  })

  it("says in her words an idea whose script she already signed", async () => {
    const id = await sembrarIdea({ pilar: "psicologia-en-la-mesa", estado: "usada" })
    ideasCreadas.push(id)
    const pieza = await sembrarPieza("en_render", { idea_id: id })
    piezasCreadas.push(pieza)
    expect(await cambiarAngulo(deps(), { ideaId: id, anguloId: await anguloId("lo-que-planteo") })).toEqual({
      ok: false,
      error: "Ya firmaste el guion: el ángulo quedó como estaba.",
    })
  })

  it("changes nothing for WAV", async () => {
    const id = await sembrarIdea({ pilar: "psicologia-en-la-mesa" })
    ideasCreadas.push(id)
    expect((await cambiarAngulo(deps(mantenedor), { ideaId: id, anguloId: await anguloId("lo-que-construyo") })).ok).toBe(
      false,
    )
    expect((await fila(id)).angulo_id).toBeNull()
  })
})
```

At the top of the file add `sembrarPieza` to the `./siembra` import, `const piezasCreadas: string[] = []` next to `ideasCreadas`, and to the file's existing `afterAll` cleanup add, before the ideas are deleted, `await pool.query("delete from public.piezas where id = any($1)", [piezasCreadas])`. (`sembrarPieza("en_render", ...)` walks the real flow, so gate 1 is signed by Coni.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:db tests/integration/acciones-ideas.test.ts`
Expected: FAIL, `cambiarAngulo` is not exported.

- [ ] **Step 3: Implement**

In `lib/acciones/ideas.ts`, append:

```ts

const CambioDeAngulo = z.object({ ideaId: z.uuid(), anguloId: z.uuid().nullable() })
const CHECK = "23514"
const CLAVE_FORANEA = "23503"

/**
 * Coni sets, changes or clears an idea's angle (spec 15d, section 3), through her session: row level security lets
 * only her write, and `exigir_angulo_de_pilar` refuses an angle of another pillar or a script she already signed.
 */
export function cambiarAngulo(deps: DepsIdeas, entrada: unknown): Promise<Resultado> {
  return aResultado("cambiarAngulo", async () => {
    const cambio = CambioDeAngulo.safeParse(entrada)
    if (!cambio.success) throw new Falla(ANGULO_DE_OTRO_PILAR)
    const { data, error } = await deps.db
      .from("ideas")
      .update({ angulo_id: cambio.data.anguloId })
      .eq("id", cambio.data.ideaId)
      .select("id")
      .maybeSingle()
    if (error) {
      if (error.code === CHECK && error.message === "angulo_firmado") throw new Falla(ANGULO_FIRMADO)
      if (error.code === CHECK || error.code === CLAVE_FORANEA) throw new Falla(ANGULO_DE_OTRO_PILAR)
      throw new Error(`No pude cambiar el ángulo: ${error.message}`, { cause: error })
    }
    if (!data) throw NoDisponible
    return {}
  })
}
```

In `app/(app)/ideas/acciones.ts`, add `cambiarAngulo` to the import from `@/lib/acciones/ideas` and append:

```ts

const cambioDeAngulo = z.object({ ideaId: z.uuid(), anguloId: z.uuid().nullable() })

/** Saved in place: the client redraws (`useRedibujar`); no redirect (15c, decision 21). */
export async function cambiarAnguloAccion(ideaId: string, anguloId: string | null) {
  return refrescar(
    await conSesionDeConi("cambiarAngulo", cambioDeAngulo, { ideaId, anguloId }, (db, d) =>
      cambiarAngulo(depsDeIdeas(db), d),
    ),
  )
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test:db tests/integration/acciones-ideas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/ideas.ts "app/(app)/ideas/acciones.ts" tests/integration/acciones-ideas.test.ts
git commit -m "Let Coni change an idea's angle until she signs, in her words when refused" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: `ElegirAngulo`

**Files:**
- Create: `app/(app)/ideas/elegir-angulo.tsx`
- Create: `tests/unit/elegir-angulo.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/elegir-angulo.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ElegirAngulo } from "@/app/(app)/ideas/elegir-angulo"

const reemplazar = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: reemplazar }) }))

const ANGULOS = [
  { id: "11111111-1111-4111-8111-111111111111", slug: "lo-que-planteo", nombre: "Lo que planteo" },
  { id: "22222222-2222-4222-8222-222222222222", slug: "lo-que-construyo", nombre: "Lo que construyo" },
]
const IDEA = "33333333-3333-4333-8333-333333333333"

describe("ElegirAngulo", () => {
  it("renders nothing for a pillar without angles", () => {
    const { container } = render(<ElegirAngulo ideaId={IDEA} angulos={[]} elegido={null} cambiar={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("offers the angles, then «Sin ángulo», with hers chosen", () => {
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[1]?.id ?? null} cambiar={vi.fn()} />)
    const campo = screen.getByLabelText("Ángulo")
    expect(campo).toHaveDisplayValue("Lo que construyo")
    expect([...campo.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "Lo que planteo",
      "Lo que construyo",
      "Sin ángulo",
    ])
  })

  it("saves on change, says so and redraws in place, never navigating elsewhere", async () => {
    const cambiar = vi.fn(async () => ({ ok: true as const }))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: ANGULOS[0]?.id } })
    await screen.findByText("Listo, guardé el ángulo.")
    expect(cambiar).toHaveBeenCalledWith(IDEA, ANGULOS[0]?.id)
    await waitFor(() => expect(reemplazar).toHaveBeenCalled())
    expect(String(reemplazar.mock.calls.at(-1)?.[0])).toMatch(/[?&]v=\d+/)
  })

  it("clears the angle with «Sin ángulo»", async () => {
    const cambiar = vi.fn(async () => ({ ok: true as const }))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[0]?.id ?? null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: "" } })
    await waitFor(() => expect(cambiar).toHaveBeenCalledWith(IDEA, null))
  })

  it("puts the old angle back and says why when it is refused", async () => {
    const cambiar = vi.fn(async () => ({ ok: false as const, error: "Ya firmaste el guion: el ángulo quedó como estaba." }))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[0]?.id ?? null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: ANGULOS[1]?.id } })
    await screen.findByText("Ya firmaste el guion: el ángulo quedó como estaba.")
    expect(screen.getByLabelText("Ángulo")).toHaveDisplayValue("Lo que planteo")
  })

  it("ignores a change while one is saving", async () => {
    let terminar: (valor: { ok: true }) => void = () => {}
    const cambiar = vi.fn(() => new Promise<{ ok: true }>((resolver) => (terminar = resolver)))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={null} cambiar={cambiar} />)
    const campo = screen.getByLabelText("Ángulo")
    fireEvent.change(campo, { target: { value: ANGULOS[0]?.id } })
    await waitFor(() => expect(campo).toBeDisabled())
    fireEvent.change(campo, { target: { value: ANGULOS[1]?.id } })
    terminar({ ok: true })
    await screen.findByText("Listo, guardé el ángulo.")
    expect(cambiar).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/elegir-angulo.test.tsx`
Expected: FAIL, cannot resolve `@/app/(app)/ideas/elegir-angulo`.

- [ ] **Step 3: Implement**

Create `app/(app)/ideas/elegir-angulo.tsx`:

```tsx
"use client"

import { useId, useState } from "react"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import type { Resultado } from "@/lib/acciones/resultado"
import type { OpcionDeAngulo } from "@/lib/dominio/pilares"
import { Campo, CLASES_DE_CAMPO } from "../biblioteca/campo"

export const SIN_ANGULO = "Sin ángulo"
export const ANGULO_GUARDADO = "Listo, guardé el ángulo."

interface Propiedades {
  ideaId: string
  /** The angles of the idea's pillar; none renders nothing. */
  angulos: readonly OpcionDeAngulo[]
  /** The id of the idea's angle, or null. */
  elegido: string | null
  cambiar: (ideaId: string, anguloId: string | null) => Promise<Resultado>
}

/**
 * The idea's angle, changed in place (spec 15d, section 3; plan decision 6): choosing saves at once, the field is
 * disabled while it saves, a refusal puts the old angle back and says why, and success redraws the screen with fresh
 * data (`useRedibujar`), never another address.
 */
export function ElegirAngulo({ ideaId, angulos, elegido, cambiar }: Propiedades) {
  const [valor, setValor] = useState(elegido ?? "")
  const [guardado, setGuardado] = useState(false)
  const { pendiente, error, ejecutar } = useAccion()
  const redibujar = useRedibujar()
  const id = useId()

  if (angulos.length === 0) return null

  function cambiarA(nuevo: string) {
    if (pendiente || nuevo === valor) return
    const anterior = valor
    setValor(nuevo)
    setGuardado(false)
    ejecutar(
      () => cambiar(ideaId, nuevo === "" ? null : nuevo),
      () => {
        setGuardado(true)
        redibujar()
      },
      () => setValor(anterior),
    )
  }

  return (
    <div className="grid gap-2">
      <Campo id={id} etiqueta="Ángulo">
        <select
          id={id}
          value={valor}
          disabled={pendiente}
          onChange={(evento) => cambiarA(evento.target.value)}
          className={CLASES_DE_CAMPO}
        >
          {angulos.map((angulo) => (
            <option key={angulo.id} value={angulo.id}>
              {angulo.nombre}
            </option>
          ))}
          <option value="">{SIN_ANGULO}</option>
        </select>
      </Campo>
      {/* Always mounted so the note is announced; empty, it is out of the layout. */}
      <div aria-live="polite" aria-atomic="true" className="empty:sr-only">
        {guardado ? <LineaDeEstado tipo="neutro" titulo={ANGULO_GUARDADO} enVivo={false} /> : null}
      </div>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test:run tests/unit/elegir-angulo.test.tsx && head -1 "app/(app)/ideas/elegir-angulo.tsx"`
Expected: PASS and `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/ideas/elegir-angulo.tsx" tests/unit/elegir-angulo.test.tsx
git commit -m "Add the angle control that saves in place and redraws" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: The angle next to the pillar on every screen

**Files:**
- Modify: `lib/datos/inicio.ts`, `lib/datos/calendario.ts`, `lib/calendario/modelo.ts`, `lib/datos/banco.ts`, `lib/ideas/mazo.ts`
- Modify: `app/(app)/page.tsx`, `app/(app)/ideas-semana.tsx`, `app/(app)/guion/[id]/page.tsx`, `pantalla-guion.tsx`, `pantalla-carrusel.tsx`, `puerta-2-carrusel.tsx`, `app/(app)/video/[id]/page.tsx`, `pantalla-video.tsx`, `components/fila-pieza.tsx`, `components/estado-sencillo.tsx`, `components/agenda-del-calendario.tsx`
- Create: `tests/unit/etiqueta-de-pilar.test.tsx`
- Modify: `tests/integration/angulos-en-pantallas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/etiqueta-de-pilar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { FilaPieza } from "@/components/fila-pieza"

const CON_ANGULO = {
  slug: "psicologia-en-la-mesa",
  nombre: "Psicología en la mesa: la psicología donde se construye la IA",
  nombreCorto: "Psicología en la mesa",
  angulo: "Lo que construyo",
}

describe("the angle next to the pillar", () => {
  it("shows it in a piece's row", () => {
    render(
      <ul>
        <FilaPieza titulo="Entreno modelos" estado="Por firmar" pilar={CON_ANGULO} href="/guion/x" />
      </ul>,
    )
    expect(screen.getByText("Psicología en la mesa · Lo que construyo")).toBeInTheDocument()
  })

  it("shows it over a piece's title, and the pillar alone without one", () => {
    const { rerender } = render(
      <EstadoSencillo titulo="Entreno modelos" pilar={CON_ANGULO}>
        <p>Hola</p>
      </EstadoSencillo>,
    )
    expect(screen.getByText("Psicología en la mesa · Lo que construyo")).toBeInTheDocument()
    rerender(
      <EstadoSencillo titulo="Entreno modelos" pilar={{ ...CON_ANGULO, angulo: undefined }}>
        <p>Hola</p>
      </EstadoSencillo>,
    )
    expect(screen.getByText("Psicología en la mesa")).toBeInTheDocument()
  })
})
```

Append to `tests/integration/angulos-en-pantallas.test.ts` (add `import { leerBanco } from "@/lib/datos/banco"`, `import { leerDatosDeCalendario } from "@/lib/datos/calendario"` and `import { leerDatosDeInicio } from "@/lib/datos/inicio"`):

```ts

describe("the readers carry the angle", () => {
  it("Inicio knows each piece's angle and each bank idea's", async () => {
    const db = clienteDeServicio()
    const { idea, pieza } = await ideaConPieza("psicologia-en-la-mesa", "lo-que-construyo")
    await pool.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [pieza])
    const banco = await ideaConPieza("mi-nueva-partida", "lo-vivo")
    await pool.query("update public.ideas set estado = 'idea' where id = $1", [banco.idea])
    const datos = await leerDatosDeInicio(db, Date.now())
    const { rows } = await pool.query<{ slug: string; id: string }>("select slug, id from public.pilar_angulos")
    const id = (slug: string) => rows.find((fila) => fila.slug === slug)?.id
    expect(datos.angulos.get(pieza)).toBe(id("lo-que-construyo"))
    expect(datos.banco.find((i) => i.id === banco.idea)?.angulo_id).toBe(id("lo-vivo"))
    expect(idea).toBeTruthy()
  })

  it("the bank labels an idea with its angle", async () => {
    const { idea } = await ideaConPieza("mi-nueva-partida", "pruebalo-tu")
    await pool.query("update public.ideas set estado = 'idea' where id = $1", [idea])
    const banco = await leerBanco(clienteDeServicio(), Date.now())
    expect(banco.find((i) => i.id === idea)).toMatchObject({
      nombreCortoPilar: "Mi nueva partida · Pruébalo tú",
      angulo: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  it("the calendar carries the piece's angle", async () => {
    const { pieza } = await ideaConPieza("psicologia-en-la-mesa", "lo-que-planteo")
    await pool.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [pieza])
    const datos = await leerDatosDeCalendario(clienteDeServicio(), Date.now())
    expect(datos.piezas.find((p) => p.id === pieza)?.angulo).toMatch(/^[0-9a-f-]{36}$/)
  })
})
```


- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/etiqueta-de-pilar.test.tsx && pnpm test:db tests/integration/angulos-en-pantallas.test.ts`
Expected: FAIL (the label shows the pillar alone; the readers have no angle).

- [ ] **Step 3: Implement the readers**

`lib/datos/inicio.ts`:
- in `IdeaLeidaParaInicio` add `angulo_id: string | null`;
- in `DatosDeInicio` add `/** Each piece's angle id, when its idea has one. */\n  angulos: ReadonlyMap<string, string>`;
- in the pieces select change `ideas(pilar)` to `ideas(pilar, angulo_id)`; in the bank select `"id, gancho, pilar, fuerza, numero, fijada_en"` to `"id, gancho, pilar, angulo_id, fuerza, numero, fijada_en"`;
- in the returned object add, after `recientes: ...,`:

```ts
    angulos: new Map(
      piezas.data.flatMap((fila) => (fila.ideas?.angulo_id ? [[fila.id, fila.ideas.angulo_id] as const] : [])),
    ),
```

`lib/calendario/modelo.ts`: in `PiezaDeCalendario`, after `pilar: string | null`, add `/** Its idea's angle id; absent or null without one. */\n  angulo?: string | null`; change line `const piezas = entrada.piezas.map((pieza) => ({ ...pieza, visible: pilarVisible(entrada.pilares, pieza.pilar) }))` to `...visible: pilarVisible(entrada.pilares, pieza.pilar, pieza.angulo)...`.

`lib/datos/calendario.ts`: in the select change `ideas(pilar)` to `ideas(pilar, angulo_id)`, and after `pilar: fila.ideas?.pilar ?? null,` add `angulo: fila.ideas?.angulo_id ?? null,`.

`lib/ideas/mazo.ts`: in `IdeaDeBanco`, change the doc of `nombreCortoPilar` to `/** What the compact places (the card's header, the rows) show: the short name, with the angle when it has one. */` and after it add `/** Its angle id, for the angle control; absent or null without one. */\n  angulo?: string | null`.

`lib/datos/banco.ts`: import `etiquetaDePilar` with `nombreDePilar, pilarVisible`; add `angulo_id` after `pilar` in the ideas select string; replace `nombreCortoPilar: pilarVisible(pilares, fila.pilar).nombreCorto,` with

```ts
        nombreCortoPilar: etiquetaDePilar(pilarVisible(pilares, fila.pilar, fila.angulo_id)),
        angulo: fila.angulo_id,
```

- [ ] **Step 4: Implement the screens**

Everywhere below, import `etiquetaDePilar` from `@/lib/dominio/pilares`.

- `components/fila-pieza.tsx`: `{pilar.nombreCorto}` becomes `{etiquetaDePilar(pilar)}`.
- `components/estado-sencillo.tsx`: `{pilar ? pilar.nombreCorto : null}` becomes `{pilar ? etiquetaDePilar(pilar) : null}`.
- `components/agenda-del-calendario.tsx`: `{ocupante.pilar.nombreCorto}` becomes `{etiquetaDePilar(ocupante.pilar)}`.
- `app/(app)/ideas-semana.tsx`: `detalle={idea.pilar.nombreCorto}` becomes `detalle={etiquetaDePilar(idea.pilar)}`.
- `app/(app)/guion/[id]/pantalla-guion.tsx`, `pantalla-carrusel.tsx`, `puerta-2-carrusel.tsx` and `app/(app)/video/[id]/pantalla-video.tsx`: `pilar={datos.pilar?.nombreCorto}` becomes `pilar={datos.pilar ? etiquetaDePilar(datos.pilar) : undefined}`.
- `app/(app)/page.tsx`:
  - in `CartaDeFirma`, `<span>{pilar?.nombreCorto}</span>` becomes `<span>{pilar ? etiquetaDePilar(pilar) : null}</span>`;
  - after `const ganchos = ...` add `const angulosDeIdea = new Map(datos.banco.map((idea) => [idea.id, idea.angulo_id]))`;
  - in `ideasParaElegir`, `pilar: pilarVisible(pilares, idea.pilar)` becomes `pilar: pilarVisible(pilares, idea.pilar, angulosDeIdea.get(idea.id) ?? null)`;
  - in the five piece rows and the card (`porSubir`, `carta`, `otrasFirmas`, `enPreparacion`, `camino`), `pilarVisible(pilares, fila.pilar)` and `pilarVisible(pilares, carta.pilar)` become `pilarVisible(pilares, fila.pilar, datos.angulos.get(fila.id) ?? null)` and `pilarVisible(pilares, carta.pilar, datos.angulos.get(carta.id) ?? null)`. The failure rows (`otrasFallas`) stay as they are (plan decision 5).
- `app/(app)/guion/[id]/page.tsx`: `const pilar = pilarVisible(pilares, idea?.pilar)` becomes `const pilar = pilarVisible(pilares, idea?.pilar, idea?.angulo_id)`.
- `app/(app)/video/[id]/page.tsx`: `const pilar = pilarVisible(pilares, idea?.pilar)` becomes `const pilar = pilarVisible(pilares, idea?.pilar, idea?.angulo_id)`.

Then check nothing compact still reads a bare short name:

Run: `grep -rn "nombreCorto" app components | grep -v "biblioteca/" | grep -v "etiquetaDePilar"`
Expected: only `app/(app)/ideas/page.tsx` (the mapping), `busqueda-de-ideas.tsx:64` (the pillar filter's own chips), `ritmo-del-calendario.tsx`, `panel-de-comparacion.tsx` and `barra-de-metrica.tsx` (decision 5), plus `nombreCortoPilar` reads, which already carry the label.

- [ ] **Step 5: Run the tests, the screens' tests and the types**

Run: `pnpm test:run tests/unit/etiqueta-de-pilar.test.tsx tests/unit/banco-de-ideas.test.tsx tests/unit/pantalla-guion.test.tsx tests/unit/calendario-modelo.test.ts && pnpm test:db tests/integration/angulos-en-pantallas.test.ts tests/integration/datos-calendario.test.ts tests/integration/banco-motor.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/datos/inicio.ts lib/datos/calendario.ts lib/calendario/modelo.ts lib/datos/banco.ts lib/ideas/mazo.ts "app/(app)/page.tsx" "app/(app)/ideas-semana.tsx" "app/(app)/guion/[id]/page.tsx" "app/(app)/guion/[id]/pantalla-guion.tsx" "app/(app)/guion/[id]/pantalla-carrusel.tsx" "app/(app)/guion/[id]/puerta-2-carrusel.tsx" "app/(app)/video/[id]/page.tsx" "app/(app)/video/[id]/pantalla-video.tsx" components/fila-pieza.tsx components/estado-sencillo.tsx components/agenda-del-calendario.tsx tests/unit/etiqueta-de-pilar.test.tsx tests/integration/angulos-en-pantallas.test.ts
git commit -m "Show the idea's angle next to its pillar wherever the pillar shows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: The angle control on the bank card and on gate 1

**Files:**
- Modify: `app/(app)/ideas/banco-de-ideas.tsx`, `app/(app)/ideas/page.tsx`, `app/(app)/guion/[id]/page.tsx`, `app/(app)/guion/[id]/carrusel.tsx`, `pantalla-guion.tsx`, `pantalla-carrusel.tsx`
- Modify: `tests/unit/banco-de-ideas.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/banco-de-ideas.test.tsx`, in `acciones()` add `cambiarAngulo: vi.fn(async () => ({ ok: true as const })),` after `hacerCarrusel`, and append:

```tsx

describe("el ángulo en la carta", () => {
  it("lets her change the angle of an idea whose pillar has angles, and shows none for the rest", async () => {
    const todas = acciones()
    const pilares = pilaresParaElegir(PILARES_DE_PRUEBA).map(({ slug, nombre, nombreCorto, red, angulos }) => ({
      slug,
      nombre,
      nombreCorto,
      red,
      angulos: angulos.map(({ id, slug: deAngulo, nombre: deNombre }) => ({ id, slug: deAngulo, nombre: deNombre })),
    }))
    const conAngulos = idea({ id: "p", numero: 1, pilar: "psicologia-en-la-mesa", gancho: "Entreno modelos." })
    const { unmount } = render(<BancoDeIdeas ideas={[conAngulos]} pilares={pilares} acciones={todas} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: ANGULO_DE_PRUEBA.loQueConstruyo } })
    await waitFor(() => expect(todas.cambiarAngulo).toHaveBeenCalledWith("p", ANGULO_DE_PRUEBA.loQueConstruyo))
    unmount()
    render(<BancoDeIdeas ideas={IDEAS} pilares={pilares} acciones={acciones()} />)
    expect(screen.queryByLabelText("Ángulo")).toBeNull()
  })
})
```

(add `ANGULO_DE_PRUEBA` to the fixture import; `idea`, `IDEAS`, `pilaresParaElegir`, `PILARES_DE_PRUEBA` are the file's own.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/banco-de-ideas.test.tsx`
Expected: FAIL, no field labelled «Ángulo».

- [ ] **Step 3: Implement**

`app/(app)/ideas/banco-de-ideas.tsx`:
- import `{ ElegirAngulo } from "./elegir-angulo"`;
- in `AccionesDelBanco` add `/** The idea's angle (spec 15d), saved in place. */\n  cambiarAngulo: (ideaId: string, anguloId: string | null) => Promise<Resultado>`;
- after `const formato: FormatoDePieza = ...` add `const angulosDe = (slug: string) => pilares.find((pilar) => pilar.slug === slug)?.angulos ?? []`;
- inside `<CartaDeIdea key={actual.id} idea={actual}>`, right after the error line, add

```tsx
              <ElegirAngulo
                key={`angulo-${actual.id}`}
                ideaId={actual.id}
                angulos={angulosDe(actual.pilar)}
                elegido={actual.angulo ?? null}
                cambiar={acciones.cambiarAngulo}
              />
```

`app/(app)/ideas/page.tsx`: import `cambiarAnguloAccion` with the other actions and add `cambiarAngulo: cambiarAnguloAccion,` to `acciones`.

`app/(app)/guion/[id]/pantalla-guion.tsx`: add `type ReactNode` to the file's `from "react"` import; change the signature to `export function PantallaGuion({ datos, angulo }: { datos: DatosDeGuion; angulo?: ReactNode })` with a doc line `/** \`angulo\`: the angle control while gate 1 is not signed (spec 15d). */`; replace

```tsx
        ) : null}
      </header>

      {/* A balance or the cap closes the signature whatever she does: said first, in her words, before the steps. */}
```

with

```tsx
        ) : null}
      </header>

      {angulo ? <div className="mt-4">{angulo}</div> : null}

      {/* A balance or the cap closes the signature whatever she does: said first, in her words, before the steps. */}
```

`app/(app)/guion/[id]/pantalla-carrusel.tsx`: add `type ReactNode` to its `from "react"` import (or add `import type { ReactNode } from "react"` if it has none); change the signature to `export function PantallaCarrusel({ datos, angulo }: { datos: DatosDeCarrusel; angulo?: ReactNode })`; replace

```tsx
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
      </header>

      {datos.explicacion ? <Bloque tipo="aviso" titulo={datos.explicacion} className="mt-6" /> : null}
```

with

```tsx
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
      </header>

      {angulo ? <div className="mt-4">{angulo}</div> : null}

      {datos.explicacion ? <Bloque tipo="aviso" titulo={datos.explicacion} className="mt-6" /> : null}
```

`app/(app)/guion/[id]/carrusel.tsx`: add `angulo?: ReactNode` to `VistaDeCarrusel`'s props (import `type ReactNode` from `"react"`), destructure it, and pass `angulo={angulo}` to `<PantallaCarrusel ... />` in `case "guion_por_aprobar"`.

`app/(app)/guion/[id]/page.tsx`:
- import `{ ElegirAngulo } from "../../ideas/elegir-angulo"`, `{ cambiarAnguloAccion } from "../../ideas/acciones"`, and `angulosDelPilar` with `pilarVisible`;
- after `const pilar = ...` add

```tsx
  // Gate 1 not signed yet: she may still change the angle (spec 15d, section 3). After that it is only text.
  const angulo =
    idea && fila.puerta1_en === null ? (
      <ElegirAngulo
        ideaId={idea.id}
        angulos={angulosDelPilar(pilares, idea.pilar).map(({ id, slug, nombre }) => ({ id, slug, nombre }))}
        elegido={idea.angulo_id}
        cambiar={cambiarAnguloAccion}
      />
    ) : null
```

- pass `angulo={angulo}` to `<VistaDeCarrusel ... />` and to `<PantallaGuion ... />`.

- [ ] **Step 4: Run the screens' tests and the types**

Run: `pnpm test:run tests/unit/banco-de-ideas.test.tsx tests/unit/pantalla-guion.test.tsx tests/unit/elegir-angulo.test.tsx && pnpm type && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/ideas/banco-de-ideas.tsx" "app/(app)/ideas/page.tsx" "app/(app)/guion/[id]/page.tsx" "app/(app)/guion/[id]/carrusel.tsx" "app/(app)/guion/[id]/pantalla-guion.tsx" "app/(app)/guion/[id]/pantalla-carrusel.tsx" tests/unit/banco-de-ideas.test.tsx
git commit -m "Let Coni change the angle on the bank card and on gate 1 before she signs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: «Falta <ángulo>» on the Temas row

**Files:**
- Modify: `app/(app)/biblioteca/temas/fila-de-temas.tsx`, `app/(app)/biblioteca/temas/page.tsx`
- Modify: `tests/unit/etiqueta-de-pilar.test.tsx`, `tests/unit/biblioteca-pagina-temas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/etiqueta-de-pilar.test.tsx` (import `{ within }` from testing-library and `FilaDeTemas` from `@/app/(app)/biblioteca/temas/fila-de-temas`):

```tsx

describe("«Falta» on the Temas row", () => {
  const PSICOLOGIA = "33333333-2222-4333-8444-555555555555"
  const PILARES = [
    { id: PSICOLOGIA, slug: "psicologia-en-la-mesa", nombreCorto: "Psicología en la mesa", red: "linkedin" as const, esCapa: false },
  ]

  it("adds the angles that fall short under the pillar, inside its link", () => {
    render(
      <FilaDeTemas
        filtros={{ red: "linkedin" }}
        pilares={PILARES}
        sinTratar={0}
        faltas={{ [PSICOLOGIA]: ["Lo que construyo"] }}
      />,
    )
    const pilares = screen.getByRole("list", { name: "Pilares de LinkedIn" })
    const enlace = within(pilares).getByRole("link", { name: /Psicología en la mesa/ })
    expect(enlace).toHaveTextContent("Psicología en la mesaFalta Lo que construyo")
  })

  it("adds nothing without a shortfall", () => {
    render(<FilaDeTemas filtros={{ red: "linkedin" }} pilares={PILARES} sinTratar={0} />)
    expect(screen.queryByText(/^Falta /)).toBeNull()
  })
})
```

In `tests/unit/biblioteca-pagina-temas.test.tsx`, after the `borradores` mock add:

```ts
const angulos = vi.hoisted(() => ({ leerFaltasDeAngulo: vi.fn(async (): Promise<unknown[]> => []) }))
vi.mock("@/lib/datos/angulos", () => angulos)
```

and append to its Temas page `describe` (or at the end of the file, in a new `describe("Temas y los ángulos", ...)` that sets `esConi.valor = true` in `beforeEach` as the file's other Temas tests do):

```tsx
  it("passes the row the angles that fall short, by pillar", async () => {
    esConi.valor = true
    datos.listarPilaresDeTemas.mockResolvedValueOnce(PILARES)
    angulos.leerFaltasDeAngulo.mockResolvedValueOnce([
      { tipo: "proporcion", pilarId: PILAR, pilar: "Bienestar e impacto", anguloId: "a", angulo: "Cómo se mide", delAngulo: 0, minimo: 2 },
    ])
    const pagina = await Temas({ searchParams: Promise.resolve({ red: "linkedin" }) })
    const fila = elementos(pagina).find((elemento) => elemento.type === FilaDeTemas)
    expect(fila?.props.faltas).toEqual({ [PILAR]: ["Cómo se mide"] })
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/etiqueta-de-pilar.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx`
Expected: FAIL (no «Falta» line; no `faltas` prop).

- [ ] **Step 3: Implement**

`app/(app)/biblioteca/temas/fila-de-temas.tsx`:
- import `{ lineaDeFalta } from "@/lib/dominio/angulos"`;
- in `Propiedades` add `/** The angles that fall short, by pillar id (spec 15d); none by default. */\n  faltas?: Readonly<Record<string, readonly string[]>>`;
- in `OpcionDePilar` add `falta: string | null`;
- change the signature to `export function FilaDeTemas({ filtros, pilares, sinTratar, faltas = {} }: Propiedades)`;
- `aOpcion` returns `{ id: pilar.id, nombre: pilar.nombreCorto, esCapa: pilar.esCapa, falta: faltas[pilar.id] ? lineaDeFalta(faltas[pilar.id] ?? []) : null }`; «Todos los pilares» gets `falta: null`;
- `opcion` destructures `({ id, nombre, esCapa, falta }: OpcionDePilar)` and its link content becomes

```tsx
          {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
          {falta ? (
            // A second line inside the link: read with the pillar's name, never a separate tab stop.
            <span className="grid text-left leading-tight">
              <span>{nombre}</span>
              <span className="font-normal">{falta}</span>
            </span>
          ) : (
            nombre
          )}
```

The `li` keys and the track's `key={filtros.red}` do not change.

`app/(app)/biblioteca/temas/page.tsx`:
- import `{ leerFaltasDeAngulo } from "@/lib/datos/angulos"` and `{ faltasPorPilar } from "@/lib/dominio/angulos"`;
- add `leerFaltasDeAngulo(db, Date.now()),` to the first `Promise.all` and destructure it as `faltas` (`const [pilares, ultimaRed, borradores, faltas] = ...`);
- pass `faltas={faltasPorPilar(faltas)}` to `<FilaDeTemas ... />`.

- [ ] **Step 4: Run them, and the row's own tests**

Run: `pnpm test:run tests/unit/etiqueta-de-pilar.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx tests/unit/biblioteca-fila-de-temas-pantalla.test.tsx && pnpm type`
Expected: PASS (the row's tests did not change: without `faltas` every chip reads as before).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/biblioteca/temas/fila-de-temas.tsx" "app/(app)/biblioteca/temas/page.tsx" tests/unit/etiqueta-de-pilar.test.tsx tests/unit/biblioteca-pagina-temas.test.tsx
git commit -m "Mark a pillar in Temas with the angle that falls short" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Phase 5: end to end, captures, gate

### Task 16: The scene and Coni's checks on the phone

**Files:**
- Modify: `tests/e2e/escena.ts`, `tests/e2e/visual.spec.ts`
- Create: `tests/e2e/angulos.spec.ts`

- [ ] **Step 1: Add the scene's helpers**

Append to `tests/e2e/escena.ts`:

```ts

/** Puts the idea of piece `piezaId` on `pilar` with the angle `angulo`, in one statement (the trigger keeps it). */
export async function conAngulo(piezaId: string, pilar: string, angulo: string): Promise<void> {
  await pool.query(
    `update public.ideas set pilar = $2, angulo_id = (select id from public.pilar_angulos where slug = $3)
      where id = (select idea_id from public.piezas where id = $1)`,
    [piezaId, pilar, angulo],
  )
}

/** `cuantas` pieces of `pilar` with `angulo`, out on LinkedIn on the days before today, one a day. */
export async function sembrarPublicadasConAngulo(pilar: string, angulo: string, cuantas: number): Promise<void> {
  for (let dia = 1; dia <= cuantas; dia++) {
    const { rows: idea } = await pool.query<{ id: string }>(
      `insert into public.ideas (pilar, angulo_id, gancho, fuerza, estado)
       values ($1, (select id from public.pilar_angulos where slug = $2), $3, 'alta', 'usada') returning id`,
      [pilar, angulo, `Publicada ${dia}`],
    )
    const { rows: pieza } = await pool.query<{ id: string }>(
      "insert into public.piezas (idea_id, titulo) values ($1, $2) returning id",
      [idea[0]?.id, `Publicada ${dia}`],
    )
    await pool.query(
      `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
       values ($1, 'linkedin', 'publicado', now() - make_interval(days => $2), 'urn:li:share:' || abs(hashtext($1::text)))`,
      [pieza[0]?.id, dia],
    )
  }
}
```

(`pool` is already imported in `escena.ts`; if not, import it from `../integration/db`.)

- [ ] **Step 2: Write the E2E**

Create `tests/e2e/angulos.spec.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { avisarEquilibrioDeAngulos } from "@/lib/avisos/equilibrio"
import { pool } from "../integration/db"
import { clienteDeServicio } from "../integration/servicio"
import { vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, capturar, configurarServicios, conLetraGrande, revisarConAxe, simularMedios } from "./ayudas"
import { sembrarAutoresYTemas } from "./biblioteca-escena"
import { avatarYaVisto, conAngulo, sembrarEscena, sembrarPublicadasConAngulo } from "./escena"

// Spec 15d, sections 3 and 4: Coni sees and changes the angle before she signs; Temas and Inicio warn.

const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOKS = [
  { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" },
  { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.png" },
]

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await pool.query("update public.ajustes set produccion = $1::jsonb", [
    JSON.stringify({ ...BASE, heygen: { ...BASE.heygen, avatares: LOOKS } }),
  ])
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
})

const campo = (page: Page) => page.getByLabel("Ángulo")

test("Coni ve el ángulo junto al pilar y lo cambia antes de firmar", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await conAngulo(guion, "psicologia-en-la-mesa", "lo-que-construyo")
  await page.goto(`/guion/${guion}`)
  await expect(page.getByText("Psicología en la mesa · Lo que construyo")).toBeVisible()
  await expect(campo(page)).toHaveValue(/[0-9a-f-]{36}/)
  await campo(page).selectOption({ label: "Lo que planteo" })
  await expect(page.getByText("Listo, guardé el ángulo.")).toBeVisible()
  await expect(page.getByText("Psicología en la mesa · Lo que planteo")).toBeVisible()
  expect(await revisarConAxe(page, "gate 1 con ángulo")).toEqual([])
  await page.reload()
  await expect(page.getByText("Psicología en la mesa · Lo que planteo")).toBeVisible()
  await conLetraGrande(page)
  await capturar(page, "guion-angulo-letra-grande", { completa: true })
})

test("Temas marca el ángulo que falta e Inicio lo avisa", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await sembrarAutoresYTemas()
  await sembrarPublicadasConAngulo("psicologia-en-la-mesa", "lo-que-planteo", 6)
  await page.goto("/biblioteca/temas?red=linkedin")
  const pilares = page.getByRole("list", { name: "Pilares de LinkedIn" })
  await expect(pilares.getByRole("link", { name: /Psicología en la mesa/ })).toContainText("Falta Lo que construyo")
  expect(await revisarConAxe(page, "Temas con falta")).toEqual([])

  await pool.query("delete from public.avisos")
  await avisarEquilibrioDeAngulos(clienteDeServicio(), new Date().toISOString(), "America/Santiago")
  await page.goto("/")
  const aviso = page.getByRole("link", {
    name: /ninguna de tus últimas 6 piezas es de «Lo que construyo»/,
  })
  await expect(aviso).toBeVisible()
  await aviso.click()
  await expect(page).toHaveURL(/\/biblioteca\/temas/)
})
```

- [ ] **Step 3: Add the three captures**

In `tests/e2e/visual.spec.ts`, add `conAngulo, sembrarPublicadasConAngulo` to the `./escena` import and append:

```ts

// 15d: the angle next to the pillar and its control on gate 1, on the bank's card, and «Falta» in Temas.
test("guion por aprobar con angulo", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await conAngulo(guion, "psicologia-en-la-mesa", "lo-que-construyo")
  await page.goto(`/guion/${guion}`)
  await capturaDe(page, "guion-por-aprobar-angulo")
})

test("ideas con angulo", async ({ page }) => {
  await sembrarEscena()
  await pool.query(
    `update public.ideas set pilar = 'psicologia-en-la-mesa',
            angulo_id = (select id from public.pilar_angulos where slug = 'lo-que-construyo')
      where numero = 1 or origen = 'motor'`,
  )
  // The engine's idea of the week comes first in the deck; both carry the angle, so whichever shows has it.
  await page.goto("/ideas")
  await capturaDe(page, "ideas-angulo")
})

test("biblioteca: Temas with an angle that falls short", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await sembrarAutoresYTemas()
  await sembrarPublicadasConAngulo("psicologia-en-la-mesa", "lo-que-planteo", 6)
  await page.goto("/biblioteca/temas?red=linkedin")
  await capturaDe(page, "biblioteca-temas-falta-angulo")
})
```

- [ ] **Step 4: Run the E2E (not the visuals yet)**

Run: `pnpm build && pnpm test:e2e --project=app tests/e2e/angulos.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/escena.ts tests/e2e/angulos.spec.ts tests/e2e/visual.spec.ts
git commit -m "Check on the phone that Coni changes the angle before signing and that Temas and Inicio warn" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Review captures for Federico, then stop

**Files:** none (captures go to `/tmp`, outside the repo)

- [ ] **Step 1: Confirm only the three new baselines are missing and nothing else moved, writing none**

Run:

```bash
pnpm test:e2e --project=app tests/e2e/visual.spec.ts --update-snapshots=none
git status --short tests/e2e
```

Expected: exactly three FAIL, each on a missing file: `guion-por-aprobar-angulo-app-darwin.png`, `ideas-angulo-app-darwin.png`, `biblioteca-temas-falta-angulo-app-darwin.png`. Every other visual passes (the scene's pillars have no angles, so no existing screen changed). `--update-snapshots=none` keeps Playwright from writing the missing ones: `git status` shows no snapshot file. If any other capture fails, something else moved: stop and find it.

- [ ] **Step 2: Write the review captures**

Run:

```bash
rm -rf /tmp/angulos-de-pilar-visual
VISUAL_FINALES=/tmp/angulos-de-pilar-visual pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "guion por aprobar con angulo|ideas con angulo|Temas with an angle"
ls /tmp/angulos-de-pilar-visual
```

Expected: PASS (this mode compares nothing) and the folder holds `guion-por-aprobar-angulo.png`, `ideas-angulo.png`, `biblioteca-temas-falta-angulo.png`.

- [ ] **Step 3: STOP for Federico**

Send Federico these images and wait:
- `/tmp/angulos-de-pilar-visual/guion-por-aprobar-angulo.png`: the meta row "Psicología en la mesa · Lo que construyo", and under the header the field «Ángulo» with "Lo que construyo";
- `ideas-angulo.png`: the card's header with the label, and the «Ángulo» field above the format and the buttons;
- `biblioteca-temas-falta-angulo.png`: LinkedIn's pillars, «Psicología en la mesa» with its second line «Falta Lo que construyo»;
- `test-results/capturas/guion-angulo-letra-grande.png`: gate 1 with the angle at large text.

**Do not start Task 18 until Federico answers OK in the conversation.** If he asks for changes, make them with a failing test first, run Task 16 Step 4 and this task again.

### Task 18: Take the baselines (only after Federico's OK)

**Files:**
- Create (baselines): `tests/e2e/visual.spec.ts-snapshots/guion-por-aprobar-angulo-app-darwin.png`, `tests/e2e/visual.spec.ts-snapshots/ideas-angulo-app-darwin.png`, `tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-falta-angulo-app-darwin.png`

- [ ] **Step 1: Take only the missing ones**

Run:

```bash
pnpm test:e2e --project=app tests/e2e/visual.spec.ts -g "guion por aprobar con angulo|ideas con angulo|Temas with an angle" --update-snapshots=missing
git status --short tests/e2e
```

Expected: `git status` lists exactly the three `??` files above and no `M`. If an existing baseline shows as modified, restore it with `git checkout -- <file>` and find why before going on; retake a changed baseline only if Federico saw that change in Task 17 and it is truly needed.

- [ ] **Step 2: Compare the whole visual suite again without updating**

Run: `pnpm test:e2e --project=app tests/e2e/visual.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/visual.spec.ts-snapshots/guion-por-aprobar-angulo-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/ideas-angulo-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-temas-falta-angulo-app-darwin.png
git commit -m "Take the baselines of the angle on gate 1, on the bank card and in Temas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: Full gate

**Files:** none new (fixes only if a step fails, each with its own failing test first)

- [ ] **Step 1: Clean rebuild of the local DB from the migrations**

Run: `pnpm db:reset && pnpm db:types && git diff --exit-code lib/supabase/database.types.ts`
Expected: exit 0.

- [ ] **Step 2: Lint, types, build**

Run: `pnpm lint && pnpm type && pnpm build`
Expected: PASS.

- [ ] **Step 3: Every suite**

Run: `pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: PASS, all three.

- [ ] **Step 4: Guards of this feature**

Run:

```bash
pnpm test:run tests/unit/sin-slugs-de-pilar.test.ts tests/unit/diseno-reglas.test.ts tests/unit/anthropic-instrucciones.test.ts
grep -rn "—" lib/dominio/angulos.ts lib/datos/angulos.ts lib/avisos/equilibrio.ts "app/(app)/ideas/elegir-angulo.tsx" supabase/migrations/20261105000200_angulos_de_pilar.sql
grep -rn "redirect(" "app/(app)/ideas/acciones.ts" "app/(app)/ideas/elegir-angulo.tsx"
git diff origin/main --stat -- supabase/migrations
grep -rln "lib/produccion/contexto\|lib/avisos/resumen\|lib/motor/semanal\|anthropic/teorias\|anthropic/guion\|anthropic/carrusel" trigger lib/produccion lib/avisos lib/motor | sort
```

Expected: the tests pass; the em dash `grep` prints nothing; the `redirect(` grep prints nothing (the angle is saved in place); the stat lists exactly one new file, `20261105000200_angulos_de_pilar.sql`, and no modified migration; the last `grep` confirms the Trigger tasks reach changed code: `motor-semanal`/`motor-manual` (engine), `producir-pieza` (guion and carousel), `resumen-diario` (balance). That is the Trigger deploy of the release.

- [ ] **Step 5: Request review**

Use superpowers:requesting-code-review on the branch. Fix findings with a failing test first, one commit per fix.

## Release steps (listed, not executed by this plan)

Federico's standing authorization (memory "Salida a producción autorizada") covers steps 1 to 5 when its conditions hold (issue, green CI, reviews, dry-run). **Step 6, the Trigger deploy, needs Federico's explicit OK in the conversation.**

1. **Issue and CI.** The work is on issue #18 of the board (WAV-WaAreVision/projects/1, change 15, part 15d); the PR is open from `feat/angulos-de-pilar`; CI is green; the code review is approved; Federico gave his OK on the captures (Task 17) and the baselines were taken (Task 18).
2. **Read-only pre-checks on production** (Supabase SQL editor or `psql "$PROD_DB_URL"`):

```sql
select to_regclass('public.pilar_angulos'), to_regclass('public.piezas_con_angulo');           -- Expected: null, null.
select count(*) from public.categorias
 where slug in ('bienestar-e-impacto', 'psicologia-en-la-mesa', 'mi-nueva-partida') and es_pilar and activa;  -- Expected: 3.
select pg_get_constraintdef(oid) from pg_constraint where conname = 'avisos_tipo_check';         -- Expected: the 12 kinds of 20261103000100.
select count(*) from public.lotes_de_pilares where lote = 'pilares-por-red-2026-11';             -- 0 or 1: note it (step 7).
```

3. **`supabase db push --dry-run`** against production. Expected: exactly `20261105000200_angulos_de_pilar.sql`. Then **`supabase db push`**. Afterwards: `select count(*) from public.pilar_angulos` is 6 and `select count(*) from public.ideas where angulo_id is not null` is 0.
4. **Merge the PR**, only after step 3 (Vercel publishes `main`): the new code reads `pilar_angulos` through `leerPilares`, so it must never run against a database without the migration.
5. **Live check:** the served HTML of a gate-1 screen of an idea on «Psicología en la mesa» shows «Ángulo»; Temas loads on LinkedIn (no shortfall yet: nothing published has an angle). Vercel's alias lags 15 to 45 s; an old look on Coni's phone is her cache (hard refresh).
6. **Trigger deploy, only with Federico's explicit OK:** it changes `motor-semanal` and `motor-manual` (Claude proposes the angle, `guardarIdeas` stores it), `producir-pieza` (the guion and carousel prompts carry the angle's voice and format) and `resumen-diario` (the balance notice). From the worktree on `main` after the merge:

```bash
pnpm install
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

   Until it runs, production keeps working: the old tasks never read `angulo_id` (ideas stay without angle, guiones are written as before, no balance notice is written). Record the new version in `docs/TRASPASO.md`.
7. **The pending `pnpm pilares:aplicar` (15a's lot) keeps working.** The CSV Coni reviewed has the 15a header and still applies (plan decision 2): its ideas get no angle, which she can set on each card in Ideas. Run it from a checkout of `main` **after step 3** (the new `leerPilares` reads `pilar_angulos`), or from the commit before this merge if step 3 has not run. A CSV produced by the new `pnpm pilares:proponer` carries `angulo`; the script sets those angles right after the lot and says how many. The 15a function and the undo (`pnpm pilares:deshacer`) are unchanged; the undo leaves the moved ideas without angle (the trigger clears it with the pillar).
8. **Board:** #18 moves to Listo once 15d is live. Comment on #18 with the release date of 15d, the Trigger version and the result of step 5.
