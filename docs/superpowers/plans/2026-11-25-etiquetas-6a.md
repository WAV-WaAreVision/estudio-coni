# Change 6a · Closed lists and claim marks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Versioned closed lists in the database and an extraction that stores, for every new material, per-network marks
(problem, solution, emotion, audience, data, case) and full hooks next to each claim.

**Architecture:** Three migrations (vocabulary + seed; afirmaciones checks; marks + hooks). A domain module
(`lib/dominio/vocabulario.ts`) owns the types and the tolerant mapping; a data module (`lib/datos/vocabulario.ts`) reads the
vigente lists. The extraction guide is generated from the vocabulary, so its hash (`versionDeExtraccion`) changes when a list
changes. `afirmar.ts` loads the vocabulary once per material, passes it to each chunk and inserts marks and hooks after the
claims.

**Tech Stack:** Next.js 16, Supabase Postgres (RLS), Zod, Anthropic SDK structured outputs, Vitest (unit + integration
against local Supabase), Trigger.dev v4.

Spec: `docs/superpowers/specs/2026-11-25-etiquetas-6a-design.md`.

## Conventions for every task

- Worktree: `~/Projects/estudio-coni/.worktrees/etiquetas-6a`, branch `feat/etiquetas-6a`.
- Unit tests: `pnpm exec vitest run --exclude '.worktrees/**' --exclude 'tests/e2e/**' --exclude 'tests/integration/**' <file>`.
- Integration tests: `pnpm exec vitest run --config vitest.integration.config.ts <file>` (local Supabase running;
  apply new migrations with `pnpm exec supabase migration up`; never `supabase db reset`).
- After a migration: `pnpm db:types` and stage `lib/supabase/database.types.ts`.
- Stage files by explicit path. Biome safe only (`pnpm exec biome check --write <files>`), never `--unsafe`.
- No em dashes in code, prompts or copy. Commits end with the Co-Authored-By line.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261114000100_vocabularios.sql` | `versiones_de_vocabulario`, shape check, RLS, starting lists |
| `supabase/migrations/20261114000200_tipos_evidencias_6a.sql` | rewrite `afirmaciones_tipo_check` and `afirmaciones_evidencia_check` |
| `supabase/migrations/20261114000300_marcas_y_ganchos.sql` | `afirmacion_marcas`, `ganchos`, indexes, RLS |
| `lib/dominio/vocabulario.ts` | list/network/mark types, `Vocabulario`, `listaDeMarca`, `normalizarMarca`, `normalizarGancho` |
| `lib/datos/vocabulario.ts` | `leerVocabulario(db)` |
| `lib/proveedores/anthropic/afirmaciones.ts` | `guiaDeAfirmaciones(vocab)`, `versionDeExtraccion(vocab)`, schema with marks and hook, `extraerAfirmaciones` takes the vocabulary |
| `lib/ingesta/afirmar.ts` | load vocabulary, fingerprint, store marks and hooks |
| `lib/proveedores/anthropic/teorias.ts` | weak/strong evidence sets |
| `lib/dominio/biblioteca/etiquetas.ts` | labels for new tipo/evidencia values |
| `tests/integration/vocabulario.test.ts` | seed, checks, RLS of the three tables |
| `tests/unit/vocabulario.test.ts` | domain mapping |
| `tests/unit/anthropic-afirmaciones.test.ts` | guide, schema, hook literal check (extend) |
| `tests/integration/procesar-afirmaciones.test.ts` | marks and hooks stored (extend) |

---

### Task 1: Vocabulary table and starting lists

**Files:**
- Create: `supabase/migrations/20261114000100_vocabularios.sql`
- Test: `tests/integration/vocabulario.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
import { afterAll, describe, expect, it } from "vitest"
import { comoConi, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

describe("versiones_de_vocabulario", () => {
  it("loads one vigente starting list per list and network", async () => {
    await comoServicio(async (c) => {
      const { rows } = await c.query<{ lista: string; red: string; n: number }>(
        `select lista, red, jsonb_array_length(valores) as n from public.versiones_de_vocabulario
         where estado = 'vigente' order by lista, red`,
      )
      expect(rows).toEqual([
        { lista: "dolor", red: "instagram", n: 6 },
        { lista: "dolor", red: "linkedin", n: 6 },
        { lista: "emocion", red: "todas", n: 22 },
        { lista: "evidencia", red: "todas", n: 5 },
        { lista: "gancho", red: "todas", n: 12 },
        { lista: "publico", red: "instagram", n: 3 },
        { lista: "publico", red: "linkedin", n: 9 },
        { lista: "tipo", red: "todas", n: 8 },
      ])
    })
  })

  it("gives every emotion a group, and activation except the two fallbacks", async () => {
    await comoServicio(async (c) => {
      const { rows } = await c.query<{ grupo: string; n: number }>(
        `select v->>'grupo' as grupo, count(*)::int as n
         from public.versiones_de_vocabulario, jsonb_array_elements(valores) v
         where lista = 'emocion' and estado = 'vigente' group by 1 order by 1`,
      )
      expect(rows).toEqual([
        { grupo: "problema", n: 11 },
        { grupo: "puente", n: 2 },
        { grupo: "respaldo", n: 2 },
        { grupo: "solucion", n: 7 },
      ])
    })
  })

  it("refuses a second vigente version for the same list and network", async () => {
    await comoServicio(async (c) => {
      await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores, estado)
         values ('gancho', 'todas', 'otra', 'prueba', '[{"valor":"x","etiqueta":"X"}]', 'vigente')`,
        "vocabulario_uno_vigente",
      )
    })
  })

  it("refuses values without valor or etiqueta, and emotions without a valid group", async () => {
    await comoServicio(async (c) => {
      await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores)
         values ('gancho', 'todas', 'mal', 'prueba', '[{"valor":"x"}]')`,
        "versiones_de_vocabulario_valores_check",
      )
      await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores)
         values ('emocion', 'todas', 'mal', 'prueba', '[{"valor":"x","etiqueta":"X","grupo":"otro"}]')`,
        "versiones_de_vocabulario_valores_check",
      )
    })
  })

  it("lets Coni read the lists and not write them", async () => {
    await comoConi(async (c) => {
      const { rows } = await c.query("select id from public.versiones_de_vocabulario")
      expect(rows.length).toBe(8)
      await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores)
         values ('gancho', 'todas', 'x', 'x', '[{"valor":"x","etiqueta":"X"}]')`,
        "row-level security",
      )
    })
  })
})
```

Before writing, read `tests/integration/db.ts` to confirm the exact signatures of `comoServicio`, `comoConi` and `fallaCon`
(used the same way in `tests/integration/afirmaciones-temas.test.ts`); adapt the calls if a helper differs, keeping the
assertions.

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/vocabulario.test.ts`
Expected: FAIL, `relation "public.versiones_de_vocabulario" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- Change 6a: closed lists with versions. Each version holds the whole list for one network; one vigente per list and
-- network. Going back is approving an older version again (6d). Writes only through the service role for now.
create function public.valores_de_vocabulario_validos(lista text, valores jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(valores) = 'array'
    and jsonb_array_length(valores) > 0
    and not exists (
      select 1 from jsonb_array_elements(valores) v
      where jsonb_typeof(v) <> 'object'
        or coalesce(v->>'valor', '') = ''
        or coalesce(v->>'etiqueta', '') = ''
        or (lista = 'emocion' and coalesce(v->>'grupo', '') not in ('problema', 'puente', 'solucion', 'respaldo'))
    )
$$;

create table public.versiones_de_vocabulario (
  id integer generated always as identity primary key,
  lista text not null check (lista in ('tipo', 'evidencia', 'publico', 'dolor', 'emocion', 'gancho')),
  red text not null check (red in ('linkedin', 'instagram', 'todas')),
  nombre text not null,
  motivo text not null,
  valores jsonb not null,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'vigente', 'anterior', 'rechazada')),
  creada_en timestamptz not null default now(),
  aprobada_en timestamptz,
  constraint versiones_de_vocabulario_valores_check check (public.valores_de_vocabulario_validos(lista, valores))
);
create unique index vocabulario_uno_vigente on public.versiones_de_vocabulario (lista, red) where estado = 'vigente';

alter table public.versiones_de_vocabulario enable row level security;
create policy "coni y wav leen vocabularios" on public.versiones_de_vocabulario for select to authenticated using (true);
grant select on public.versiones_de_vocabulario to authenticated;
grant all on public.versiones_de_vocabulario to service_role;

-- Starting lists: Coni defined them (request of 2026-10-31 and emociones.md of 2026-11-01).
insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores, estado, aprobada_en) values
('tipo', 'todas', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"definicion","etiqueta":"Definición","descripcion":"Dice qué es algo."},
  {"valor":"causa","etiqueta":"Causa","descripcion":"Dice por qué pasa algo."},
  {"valor":"consecuencia","etiqueta":"Consecuencia","descripcion":"Dice a qué lleva algo."},
  {"valor":"mito","etiqueta":"Mito","descripcion":"Nombra una creencia común y la corrige o la cuestiona."},
  {"valor":"consejo","etiqueta":"Consejo","descripcion":"Dice qué hacer o evitar."},
  {"valor":"dato","etiqueta":"Dato","descripcion":"Una cifra, un hallazgo o un hecho verificable."},
  {"valor":"experiencia","etiqueta":"Experiencia","descripcion":"Lo que le pasó a alguien, vivido u observado en la práctica profesional del autor."},
  {"valor":"limite","etiqueta":"Límite","descripcion":"Cuándo algo no aplica o tiene matices."}
]', 'vigente', now()),
('evidencia', 'todas', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"estudio","etiqueta":"Estudio","descripcion":"La fuente cita investigación o datos."},
  {"valor":"guia_consenso","etiqueta":"Guía o consenso","descripcion":"DSM, OMS, guías clínicas u otro consenso profesional."},
  {"valor":"clinica","etiqueta":"Práctica profesional","descripcion":"El autor habla desde su práctica profesional, nunca con datos de pacientes."},
  {"valor":"opinion","etiqueta":"Opinión","descripcion":"La visión del autor sin respaldo declarado."},
  {"valor":"testimonio","etiqueta":"Testimonio","descripcion":"El relato de una persona sobre su propio caso."}
]', 'vigente', now()),
('publico', 'linkedin', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"transformacion_digital","etiqueta":"Transformación digital"},
  {"valor":"rrhh_personas","etiqueta":"RR.HH. y personas"},
  {"valor":"lideres_equipos","etiqueta":"Líderes y equipos"},
  {"valor":"gerencia","etiqueta":"Gerencia"},
  {"valor":"empresas_tech","etiqueta":"Empresas tech"},
  {"valor":"academia","etiqueta":"Academia"},
  {"valor":"autoridades","etiqueta":"Autoridades"},
  {"valor":"mujeres_lideres","etiqueta":"Mujeres líderes"},
  {"valor":"colegas_clinicos","etiqueta":"Colegas clínicos"}
]', 'vigente', now()),
('publico', 'instagram', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"profesional_con_techo","etiqueta":"Profesional con techo (44 a 55)"},
  {"valor":"se_reinventa","etiqueta":"La que se reinventa (38 a 50)"},
  {"valor":"se_descubre_tarde","etiqueta":"La que se descubre tarde (35 a 45)"}
]', 'vigente', now()),
('dolor', 'linkedin', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"herramienta_sin_uso","etiqueta":"Herramienta comprada que no se usa"},
  {"valor":"rrhh_tarde","etiqueta":"RR.HH. llega tarde"},
  {"valor":"adopcion_no_impacto","etiqueta":"Medir adopción y no impacto"},
  {"valor":"liderar_incertidumbre","etiqueta":"Liderar con incertidumbre"},
  {"valor":"resistencia_miedo","etiqueta":"Resistencia o miedo en los equipos"},
  {"valor":"juzgada_por_ia","etiqueta":"Temor a ser juzgada por usar IA"}
]', 'vigente', now()),
('dolor', 'instagram', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"no_merecer_logros","etiqueta":"No merecer los logros"},
  {"valor":"techo_profesional","etiqueta":"Techo profesional"},
  {"valor":"reinventarse_sin_estructura","etiqueta":"Reinventarse sin estructura"},
  {"valor":"desconfianza_ia","etiqueta":"Desconfianza de la IA"},
  {"valor":"energia_limites","etiqueta":"Energía y límites"},
  {"valor":"propio_tdah","etiqueta":"Entender el propio TDAH"}
]', 'vigente', now()),
('emocion', 'todas', 'Lista de partida', 'Lista de Coni del 1 de noviembre de 2026 (emociones.md)', '[
  {"valor":"agobio","etiqueta":"Agobio","grupo":"problema","activacion":"alta","descripcion":"Demasiado, ahora: sobrecarga, no doy abasto."},
  {"valor":"inquietud","etiqueta":"Inquietud","grupo":"problema","activacion":"media","descripcion":"Preocupación por lo que podría pasar. Se puede pensar y nombrar."},
  {"valor":"miedo_angustia","etiqueta":"Miedo o angustia","grupo":"problema","activacion":"alta","descripcion":"Una amenaza intensa o cercana, en el cuerpo: me paraliza, me quita el sueño."},
  {"valor":"frustracion","etiqueta":"Frustración","grupo":"problema","activacion":"alta","descripcion":"La falla está afuera: hicimos todo y no resultó."},
  {"valor":"indignacion","etiqueta":"Indignación","grupo":"problema","activacion":"alta","descripcion":"Es injusto para un grupo. Apunta a sistemas y prácticas, nunca a personas."},
  {"valor":"rechazo_resistencia","etiqueta":"Rechazo o resistencia","grupo":"problema","activacion":"alta","descripcion":"No lo quiero y me opongo, aunque funcione: defensa activa de una forma de trabajar."},
  {"valor":"escepticismo","etiqueta":"Escepticismo","grupo":"problema","activacion":"media","descripcion":"No me lo creo, me venden humo: duda sobre si es cierto."},
  {"valor":"confusion","etiqueta":"Confusión","grupo":"problema","activacion":"media","descripcion":"No entiendo, información contradictoria, no sé por dónde partir."},
  {"valor":"incomodidad_evitacion","etiqueta":"Incomodidad o evitación","grupo":"problema","activacion":"baja","descripcion":"Prefiero no mirarlo: lo esquivo, lo postergo."},
  {"valor":"culpa","etiqueta":"Culpa","grupo":"problema","activacion":"media","descripcion":"Hice o no hice algo que creía que debía. Apunta a una conducta."},
  {"valor":"verguenza","etiqueta":"Vergüenza","grupo":"problema","activacion":"baja","descripcion":"Soy insuficiente o un fraude, y temo que lo noten. Apunta al yo."},
  {"valor":"curiosidad","etiqueta":"Curiosidad","grupo":"puente","activacion":"alta","descripcion":"La pregunta queda abierta: hay algo que quiero saber."},
  {"valor":"sorpresa","etiqueta":"Sorpresa","grupo":"puente","activacion":"alta","descripcion":"El dato ya rompió la creencia: algo que creía no es así."},
  {"valor":"alivio","etiqueta":"Alivio","grupo":"solucion","activacion":"media","descripcion":"Baja la carga: tiene nombre, explicación o permiso."},
  {"valor":"calma","etiqueta":"Calma","grupo":"solucion","activacion":"baja","descripcion":"Paz, margen, bajar el ritmo. Es un estado, no una transición."},
  {"valor":"claridad","etiqueta":"Claridad","grupo":"solucion","activacion":"media","descripcion":"Ahora entiendo cómo decidir: un marco o criterio que ordena."},
  {"valor":"autoconfianza","etiqueta":"Autoconfianza","grupo":"solucion","activacion":"media","descripcion":"Sí puedo: tengo un paso concreto y me siento capaz."},
  {"valor":"pertenencia","etiqueta":"Pertenencia","grupo":"solucion","activacion":"media","descripcion":"Me vio, no estoy sola, soy parte de un grupo."},
  {"valor":"orgullo","etiqueta":"Orgullo","grupo":"solucion","activacion":"media","descripcion":"Este logro es mío, por mi esfuerzo."},
  {"valor":"entusiasmo_optimismo","etiqueta":"Entusiasmo u optimismo","grupo":"solucion","activacion":"alta","descripcion":"Ganas de empezar ya y expectativa de que irá bien."},
  {"valor":"informativa","etiqueta":"Informativa","grupo":"respaldo","descripcion":"Un dato sin reacción buscada. Si el dato sorprende, es sorpresa."},
  {"valor":"otra","etiqueta":"Otra","grupo":"respaldo","descripcion":"Cuando nada calza. Siempre trae una línea de por qué."}
]', 'vigente', now()),
('gancho', 'todas', 'Lista de partida', 'Cambio 6: fórmulas de los manuales de Coni', '[
  {"valor":"afirmacion_contraria","etiqueta":"Afirmación contraria"},
  {"valor":"numero_especifico","etiqueta":"Número específico"},
  {"valor":"confesion","etiqueta":"Confesión"},
  {"valor":"pregunta_espejo","etiqueta":"Pregunta espejo"},
  {"valor":"escena","etiqueta":"Escena"},
  {"valor":"tiene_nombre","etiqueta":"Tiene nombre"},
  {"valor":"mito","etiqueta":"Mito"},
  {"valor":"verdad_incomoda","etiqueta":"Verdad incómoda"},
  {"valor":"antes_ahora","etiqueta":"Antes/ahora"},
  {"valor":"habla_directo","etiqueta":"Le habla directo a alguien"},
  {"valor":"lista_con_numero","etiqueta":"Lista con número"},
  {"valor":"detras_de_escena","etiqueta":"Detrás de escena"}
]', 'vigente', now());
```

Check the grants of a recent comparable table (e.g. `calibraciones_de_parecido` in its migration) and copy the same grant
lines if they differ from the ones above.

- [ ] **Step 4: Apply and run the test**

Run: `pnpm exec supabase migration up && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/vocabulario.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Types and commit**

```bash
pnpm db:types
git add supabase/migrations/20261114000100_vocabularios.sql tests/integration/vocabulario.test.ts lib/supabase/database.types.ts
git commit -m "Add versioned closed lists with Coni's starting lists (change 6a)"
```

### Task 2: New tipo and evidencia values

**Files:**
- Create: `supabase/migrations/20261114000200_tipos_evidencias_6a.sql`
- Modify: `lib/proveedores/anthropic/afirmaciones.ts:9-18` (constants)
- Modify: `lib/dominio/biblioteca/etiquetas.ts` (labels)
- Test: `tests/integration/vocabulario.test.ts` (extend), `tests/unit/etiquetas.test.ts` (extend)

- [ ] **Step 1: Failing tests**

Append to `tests/integration/vocabulario.test.ts`:

```ts
import { EVIDENCIAS_DE_AFIRMACION, TIPOS_DE_AFIRMACION } from "@/lib/proveedores/anthropic"

const valoresDelCheck = async (nombre: string) =>
  comoServicio(async (c) => {
    const { rows } = await c.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1",
      [nombre],
    )
    return [...(rows[0]?.def ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  })

describe("tipo and evidencia lists", () => {
  it("keeps the code lists equal to the database checks", async () => {
    expect(await valoresDelCheck("afirmaciones_tipo_check")).toEqual([...TIPOS_DE_AFIRMACION].sort())
    expect(await valoresDelCheck("afirmaciones_evidencia_check")).toEqual([...EVIDENCIAS_DE_AFIRMACION].sort())
  })
})
```

If `comoServicio` does not return the callback's value, read the value inside the callback into an outer variable instead.

Append to `tests/unit/etiquetas.test.ts`:

```ts
import { EVIDENCIA, TIPO_DE_AFIRMACION } from "@/lib/dominio/biblioteca/etiquetas"
import { EVIDENCIAS_DE_AFIRMACION, TIPOS_DE_AFIRMACION } from "@/lib/proveedores/anthropic"

it("labels every tipo and evidencia value", () => {
  for (const tipo of TIPOS_DE_AFIRMACION) expect(TIPO_DE_AFIRMACION[tipo]).toBeTruthy()
  for (const evidencia of EVIDENCIAS_DE_AFIRMACION) expect(EVIDENCIA[evidencia]).toBeTruthy()
})
```

- [ ] **Step 2: Run, expect FAIL** (code lists lack `limite`, `guia_consenso`, `sin_clasificar`).

- [ ] **Step 3: Migration**

```sql
-- Change 6a: tipo gains límite, evidencia gains guía o consenso, both gain sin_clasificar (doubtful values no longer
-- become opinión or fail the chunk). Lists rewritten in full.
alter table public.afirmaciones drop constraint afirmaciones_tipo_check;
alter table public.afirmaciones drop constraint afirmaciones_evidencia_check;
alter table public.afirmaciones add constraint afirmaciones_tipo_check check (tipo in ('definicion', 'causa',
  'consecuencia', 'mito', 'consejo', 'dato', 'experiencia', 'limite', 'sin_clasificar'));
alter table public.afirmaciones add constraint afirmaciones_evidencia_check check (evidencia in ('estudio',
  'guia_consenso', 'clinica', 'opinion', 'testimonio', 'sin_clasificar'));
```

Confirm the current constraint names first: `grep -rn "afirmaciones_tipo_check\|evidencia in" supabase/migrations`. If the
original checks were inline (unnamed), Postgres named them `afirmaciones_tipo_check` / `afirmaciones_evidencia_check`;
verify with `select conname from pg_constraint where conrelid = 'public.afirmaciones'::regclass`.

- [ ] **Step 4: Code**

```ts
export const TIPOS_DE_AFIRMACION = [
  "definicion",
  "causa",
  "consecuencia",
  "mito",
  "consejo",
  "dato",
  "experiencia",
  "limite",
  "sin_clasificar",
] as const
export const EVIDENCIAS_DE_AFIRMACION = [
  "estudio",
  "guia_consenso",
  "clinica",
  "opinion",
  "testimonio",
  "sin_clasificar",
] as const
```

In `etiquetas.ts` add `limite: "Límite"`, `sin_clasificar: "Sin clasificar"` to `TIPO_DE_AFIRMACION` and
`guia_consenso: "Guía o consenso"`, `sin_clasificar: "Sin clasificar"` to `EVIDENCIA`.

Then run `pnpm type`; fix every exhaustive `Record`/switch over these unions that the compiler flags (grep
`TIPOS_DE_AFIRMACION\|EVIDENCIAS_DE_AFIRMACION\|"testimonio"` in `lib app components`), giving the new values the same
treatment as the closest existing value (`sin_clasificar` like `opinion`, `guia_consenso` like `estudio`).

- [ ] **Step 5: Apply, run both tests, commit**

```bash
pnpm exec supabase migration up
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/vocabulario.test.ts
pnpm exec vitest run --exclude '.worktrees/**' --exclude 'tests/e2e/**' --exclude 'tests/integration/**' tests/unit/etiquetas.test.ts
pnpm db:types
git add supabase/migrations/20261114000200_tipos_evidencias_6a.sql lib/proveedores/anthropic/afirmaciones.ts lib/dominio/biblioteca/etiquetas.ts tests/integration/vocabulario.test.ts tests/unit/etiquetas.test.ts lib/supabase/database.types.ts
git commit -m "Add límite, guía o consenso and sin clasificar to claim types and evidence"
```

### Task 3: Marks and hooks tables

**Files:**
- Create: `supabase/migrations/20261114000300_marcas_y_ganchos.sql`
- Test: `tests/integration/vocabulario.test.ts` (extend)

- [ ] **Step 1: Failing tests**

Reuse the `crearAutor` / `crearMaterial` helpers pattern from `tests/integration/afirmaciones-temas.test.ts` (copy them
into this file) plus:

```ts
const crearAfirmacion = (c: Cliente, material: string, autor: string) =>
  id(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, texto, cita, tipo, evidencia, idioma)
     values ($1, $2, 1, 't', 'c', 'dato', 'estudio', 'es') returning id`,
    [material, autor],
  )

const versionDe = (c: Cliente, lista: string, red = "todas") =>
  c
    .query<{ id: number }>("select id from public.versiones_de_vocabulario where lista = $1 and red = $2 and estado = 'vigente'", [lista, red])
    .then((r) => r.rows[0]?.id)

describe("afirmacion_marcas and ganchos", () => {
  it("stores marks and one hook per claim, and drops them with the claim", async () => {
    await comoServicio(async (c) => {
      const autor = await crearAutor(c, "Autora marcas")
      const material = await crearMaterial(c, autor)
      const afirmacion = await crearAfirmacion(c, material, autor)
      await c.query(
        `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, frase, certeza, version_id, origen)
         values ($1, 'emocion', 'linkedin', 'escepticismo', 'duda', 'alta', $2, 'extraccion')`,
        [afirmacion, await versionDe(c, "emocion")],
      )
      await c.query(
        `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
         values ($1, '¿Y si no eres impostora?', 'Muchas no aprendieron a reconocer sus logros.', 'pregunta_espejo', 'media', $2, 'extraccion')`,
        [afirmacion, await versionDe(c, "gancho")],
      )
      await fallaCon(
        c,
        `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
         values ('${afirmacion}', 'a', 'b', 'escena', 'baja', ${await versionDe(c, "gancho")}, 'extraccion')`,
        "ganchos_afirmacion_id_key",
      )
      await c.query("delete from public.afirmaciones where id = $1", [afirmacion])
      const quedan = await c.query(
        "select (select count(*) from public.afirmacion_marcas where afirmacion_id = $1) + (select count(*) from public.ganchos where afirmacion_id = $1) as n",
        [afirmacion],
      )
      expect(Number(quedan.rows[0].n)).toBe(0)
    })
  })

  it("requires a reason for otro and otra", async () => {
    await comoServicio(async (c) => {
      const autor = await crearAutor(c, "Autora otro")
      const afirmacion = await crearAfirmacion(c, await crearMaterial(c, autor), autor)
      await fallaCon(
        c,
        `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, certeza, origen)
         values ('${afirmacion}', 'emocion', 'instagram', 'otra', 'baja', 'extraccion')`,
        "afirmacion_marcas_por_que_check",
      )
    })
  })

  it("lets Coni read marks and hooks and not write them", async () => {
    await comoConi(async (c) => {
      await c.query("select id from public.afirmacion_marcas limit 1")
      await c.query("select id from public.ganchos limit 1")
      await fallaCon(
        c,
        `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
         values (gen_random_uuid(), 'a', 'b', 'escena', 'baja', 1, 'extraccion')`,
        "row-level security",
      )
    })
  })
})
```

Check the real NOT NULL columns of `afirmaciones` in `tests/integration/afirmaciones-temas.test.ts` (its claim helper) and
use the same insert there instead of the one above if it differs.

- [ ] **Step 2: Run, expect FAIL** (tables missing).

- [ ] **Step 3: Migration**

```sql
-- Change 6a: what each claim carries, per network, from the closed lists (value) with the free phrase that keeps the
-- nuance; and the hook of the claim in three parts. Both hang from the claim: deleting or hiding it covers them.
create table public.afirmacion_marcas (
  id uuid primary key default gen_random_uuid(),
  afirmacion_id uuid not null references public.afirmaciones (id) on delete cascade,
  marca text not null check (marca in ('problema', 'solucion', 'emocion', 'dato', 'caso', 'publico')),
  red text not null check (red in ('linkedin', 'instagram', 'todas')),
  valor text not null,
  frase text,
  certeza text not null check (certeza in ('alta', 'media', 'baja')),
  por_que text,
  version_id integer references public.versiones_de_vocabulario (id),
  origen text not null check (origen in ('extraccion', 'traduccion', 'coni')),
  creada_en timestamptz not null default now(),
  constraint afirmacion_marcas_por_que_check check (valor not in ('otro', 'otra') or coalesce(por_que, '') <> '')
);
create index afirmacion_marcas_afirmacion on public.afirmacion_marcas (afirmacion_id);
create index afirmacion_marcas_valor on public.afirmacion_marcas (marca, red, valor);

create table public.ganchos (
  id uuid primary key default gen_random_uuid(),
  afirmacion_id uuid not null unique references public.afirmaciones (id) on delete cascade,
  frase_exacta text not null,
  frase_sin_gancho text not null,
  tipo text not null,
  certeza text not null check (certeza in ('alta', 'media', 'baja')),
  version_id integer not null references public.versiones_de_vocabulario (id),
  origen text not null check (origen in ('extraccion', 'traduccion', 'coni')),
  creada_en timestamptz not null default now()
);

alter table public.afirmacion_marcas enable row level security;
alter table public.ganchos enable row level security;
create policy "coni y wav leen marcas" on public.afirmacion_marcas for select to authenticated using (true);
create policy "coni y wav leen ganchos" on public.ganchos for select to authenticated using (true);
grant select on public.afirmacion_marcas, public.ganchos to authenticated;
grant all on public.afirmacion_marcas, public.ganchos to service_role;
```

Use the exact `using (...)` expression of the policy "coni y wav leen afirmaciones" (in
`20261003000310_afirmaciones_temas.sql` or a later migration that replaced it) instead of `true` if it is more restrictive.

- [ ] **Step 4: Apply, run, types, commit**

```bash
pnpm exec supabase migration up
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/vocabulario.test.ts
pnpm db:types
git add supabase/migrations/20261114000300_marcas_y_ganchos.sql tests/integration/vocabulario.test.ts lib/supabase/database.types.ts
git commit -m "Add claim marks and hooks tables (change 6a)"
```

### Task 4: Vocabulary domain module

**Files:**
- Create: `lib/dominio/vocabulario.ts`
- Test: `tests/unit/vocabulario.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  listaDeMarca,
  normalizarGancho,
  normalizarMarca,
  type Vocabulario,
  vocabularioDeFilas,
} from "@/lib/dominio/vocabulario"

const fila = (lista: string, red: string, id: number, valores: string[], extra: Record<string, string> = {}) => ({
  id,
  lista,
  red,
  valores: valores.map((valor) => ({ valor, etiqueta: valor, ...extra })),
})

const VOCAB: Vocabulario = vocabularioDeFilas([
  fila("tipo", "todas", 1, ["dato", "limite"]),
  fila("evidencia", "todas", 2, ["estudio", "guia_consenso"]),
  fila("publico", "linkedin", 3, ["gerencia"]),
  fila("publico", "instagram", 4, ["se_reinventa"]),
  fila("dolor", "linkedin", 5, ["rrhh_tarde"]),
  fila("dolor", "instagram", 6, ["techo_profesional"]),
  fila("emocion", "todas", 7, ["escepticismo", "verguenza", "otra"], { grupo: "problema" }),
  fila("gancho", "todas", 8, ["escena", "mito"]),
])

describe("vocabularioDeFilas", () => {
  it("fails when a list and network pair has no vigente version", () => {
    expect(() => vocabularioDeFilas([fila("tipo", "todas", 1, ["dato"])])).toThrow(/evidencia/)
  })
  it("drops retired values", () => {
    const v = vocabularioDeFilas([
      ...[
        fila("tipo", "todas", 1, ["dato"]),
        fila("evidencia", "todas", 2, ["estudio"]),
        fila("publico", "linkedin", 3, ["gerencia"]),
        fila("publico", "instagram", 4, ["se_reinventa"]),
        fila("dolor", "linkedin", 5, ["rrhh_tarde"]),
        fila("dolor", "instagram", 6, ["techo_profesional"]),
        fila("emocion", "todas", 7, ["calma"], { grupo: "solucion" }),
      ],
      { id: 8, lista: "gancho", red: "todas", valores: [{ valor: "escena", etiqueta: "Escena", retirado: true }, { valor: "mito", etiqueta: "Mito" }] },
    ])
    expect(v.gancho.todas.valores.map((x) => x.valor)).toEqual(["mito"])
  })
})

describe("listaDeMarca", () => {
  it("maps each mark to its list, and dato and caso to none", () => {
    expect(listaDeMarca("problema")).toBe("dolor")
    expect(listaDeMarca("solucion")).toBe("dolor")
    expect(listaDeMarca("emocion")).toBe("emocion")
    expect(listaDeMarca("publico")).toBe("publico")
    expect(listaDeMarca("dato")).toBeNull()
    expect(listaDeMarca("caso")).toBeNull()
  })
})

describe("normalizarMarca", () => {
  it("keeps a known value and points to its version", () => {
    expect(
      normalizarMarca(VOCAB, { marca: "emocion", red: "linkedin", valor: "Escepticismo", frase: "duda", certeza: "alta", porQue: null }),
    ).toEqual({ marca: "emocion", red: "linkedin", valor: "escepticismo", frase: "duda", certeza: "alta", porQue: null, versionId: 7 })
  })
  it("turns an unknown emotion into otra with a reason, keeping the phrase", () => {
    const r = normalizarMarca(VOCAB, { marca: "emocion", red: "instagram", valor: "nostalgia", frase: null, certeza: "media", porQue: null })
    expect(r).toMatchObject({ valor: "otra", frase: "nostalgia", porQue: "fuera de la lista: nostalgia", versionId: 7 })
  })
  it("turns an unknown pain into otro", () => {
    const r = normalizarMarca(VOCAB, { marca: "problema", red: "linkedin", valor: "burnout", frase: "agotamiento", certeza: "baja", porQue: null })
    expect(r).toMatchObject({ valor: "otro", frase: "agotamiento", porQue: "fuera de la lista: burnout", versionId: 5 })
  })
  it("forces dato and caso to todas with no list", () => {
    const r = normalizarMarca(VOCAB, { marca: "dato", red: "linkedin", valor: "30% más", frase: "30% más", certeza: "alta", porQue: null })
    expect(r).toMatchObject({ red: "todas", versionId: null })
  })
  it("forces per-network marks off todas: todas becomes both networks", () => {
    expect(() =>
      normalizarMarca(VOCAB, { marca: "publico", red: "todas", valor: "gerencia", frase: null, certeza: "alta", porQue: null }),
    ).not.toThrow()
  })
})

describe("normalizarGancho", () => {
  it("keeps a known type and turns an unknown one into ninguno", () => {
    expect(normalizarGancho(VOCAB, "Escena")).toEqual({ tipo: "escena", versionId: 8 })
    expect(normalizarGancho(VOCAB, "rima")).toEqual({ tipo: "ninguno", versionId: 8 })
  })
})
```

Note on the last `normalizarMarca` case: a per-network mark sent with `red: "todas"` is expanded by the caller
(`marcasNormalizadas`, Task 6) into one mark per network; `normalizarMarca` itself maps `todas` to `linkedin` for the
version lookup only when called directly. Keep the test as written (it only asserts no throw).

- [ ] **Step 2: Run, expect FAIL** (module missing).

- [ ] **Step 3: Implement**

```ts
/** Change 6a: the closed lists, as read from the vigente versions, and how a raw answer maps onto them. */
export const LISTAS = ["tipo", "evidencia", "publico", "dolor", "emocion", "gancho"] as const
export type Lista = (typeof LISTAS)[number]
export const REDES = ["linkedin", "instagram"] as const
export type Red = (typeof REDES)[number]
export type RedDeLista = Red | "todas"
export const MARCAS = ["problema", "solucion", "emocion", "dato", "caso", "publico"] as const
export type Marca = (typeof MARCAS)[number]
export const CERTEZAS = ["alta", "media", "baja"] as const
export type Certeza = (typeof CERTEZAS)[number]

/** Lists that differ per network; the others are one list for both. */
const POR_RED: Record<Lista, boolean> = {
  tipo: false,
  evidencia: false,
  publico: true,
  dolor: true,
  emocion: false,
  gancho: false,
}

export interface ValorDeLista {
  valor: string
  etiqueta: string
  descripcion?: string
  grupo?: "problema" | "puente" | "solucion" | "respaldo"
  activacion?: "alta" | "media" | "baja"
}
export interface ListaVigente {
  versionId: number
  valores: ValorDeLista[]
}
export type Vocabulario = {
  [L in Lista]: (typeof POR_RED)[L] extends true ? Record<Red, ListaVigente> : { todas: ListaVigente }
} & { publico: Record<Red, ListaVigente>; dolor: Record<Red, ListaVigente> }

export interface FilaDeVocabulario {
  id: number
  lista: string
  red: string
  valores: (ValorDeLista & { retirado?: boolean })[]
}

export function vocabularioDeFilas(filas: readonly FilaDeVocabulario[]): Vocabulario {
  const buscar = (lista: Lista, red: RedDeLista): ListaVigente => {
    const f = filas.find((x) => x.lista === lista && x.red === red)
    if (!f) throw new Error(`No hay una lista vigente de ${lista} para ${red}`)
    return { versionId: f.id, valores: f.valores.filter((v) => !v.retirado).map(({ retirado: _, ...v }) => v) }
  }
  const porRed = (lista: Lista) => ({ linkedin: buscar(lista, "linkedin"), instagram: buscar(lista, "instagram") })
  return {
    tipo: { todas: buscar("tipo", "todas") },
    evidencia: { todas: buscar("evidencia", "todas") },
    publico: porRed("publico"),
    dolor: porRed("dolor"),
    emocion: { todas: buscar("emocion", "todas") },
    gancho: { todas: buscar("gancho", "todas") },
  } as Vocabulario
}

export function listaDeMarca(marca: Marca): Lista | null {
  if (marca === "problema" || marca === "solucion") return "dolor"
  if (marca === "emocion" || marca === "publico") return marca
  return null
}

export function listaVigente(vocab: Vocabulario, lista: Lista, red: RedDeLista): ListaVigente {
  const porRed = vocab[lista] as Partial<Record<RedDeLista, ListaVigente>>
  const directa = porRed[red] ?? porRed.todas ?? porRed.linkedin
  if (!directa) throw new Error(`No hay una lista vigente de ${lista} para ${red}`)
  return directa
}

const limpio = (texto: string) =>
  texto.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[\s/-]+/g, "_")

export interface MarcaCruda {
  marca: Marca
  red: RedDeLista
  valor: string
  frase: string | null
  certeza: Certeza
  porQue: string | null
}
export interface MarcaNormalizada extends MarcaCruda {
  versionId: number | null
}

export function normalizarMarca(vocab: Vocabulario, cruda: MarcaCruda): MarcaNormalizada {
  const lista = listaDeMarca(cruda.marca)
  if (lista === null) return { ...cruda, red: "todas", versionId: null }
  const vigente = listaVigente(vocab, lista, cruda.red)
  const conocido = vigente.valores.find((v) => v.valor === limpio(cruda.valor) || limpio(v.etiqueta) === limpio(cruda.valor))
  if (conocido) return { ...cruda, valor: conocido.valor, versionId: vigente.versionId }
  const respaldo = lista === "emocion" ? "otra" : "otro"
  return {
    ...cruda,
    valor: respaldo,
    frase: cruda.frase ?? cruda.valor,
    porQue: cruda.porQue?.trim() ? cruda.porQue : `fuera de la lista: ${cruda.valor}`,
    versionId: vigente.versionId,
  }
}

export function normalizarGancho(vocab: Vocabulario, tipo: string): { tipo: string; versionId: number } {
  const vigente = vocab.gancho.todas
  const conocido = vigente.valores.find((v) => v.valor === limpio(tipo) || limpio(v.etiqueta) === limpio(tipo))
  return { tipo: conocido?.valor ?? "ninguno", versionId: vigente.versionId }
}
```

Note: the "otra" test expects `frase: "nostalgia"` because `frase` was null; the "otro" test expects the original
`frase: "agotamiento"` kept. The code above does both.

- [ ] **Step 4: Run, expect PASS.** Fix types so `pnpm type` is clean (simplify the `Vocabulario` type to an explicit
interface if the conditional type fights the compiler:
`{ tipo: {todas: ListaVigente}; evidencia: {todas: ListaVigente}; publico: Record<Red, ListaVigente>; dolor: Record<Red, ListaVigente>; emocion: {todas: ListaVigente}; gancho: {todas: ListaVigente} }`,
and then drop the `as Vocabulario` cast).

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/vocabulario.ts tests/unit/vocabulario.test.ts
git commit -m "Map raw marks and hook types onto the closed lists"
```

### Task 5: Read the vigente vocabulary

**Files:**
- Create: `lib/datos/vocabulario.ts`
- Test: `tests/integration/vocabulario.test.ts` (extend)

- [ ] **Step 1: Failing test**

```ts
import { createClient } from "@supabase/supabase-js"
import { leerVocabulario } from "@/lib/datos/vocabulario"

describe("leerVocabulario", () => {
  it("reads every vigente list with its version", async () => {
    const db = clienteDeServicio() // see note
    const v = await leerVocabulario(db)
    expect(v.emocion.todas.valores).toHaveLength(22)
    expect(v.publico.instagram.valores.map((x) => x.valor)).toEqual(["profesional_con_techo", "se_reinventa", "se_descubre_tarde"])
    expect(v.gancho.todas.versionId).toBeGreaterThan(0)
  })
})
```

Note: find how other integration tests build a service-role Supabase JS client against local Supabase (grep
`createClient(` in `tests/integration`, e.g. the test of `leerCalibracion` or `fusiones`) and use that helper as
`clienteDeServicio`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import { z } from "zod"
import { vocabularioDeFilas, type Vocabulario } from "@/lib/dominio/vocabulario"
import { falloDeBase } from "@/lib/ingesta/gasto-material"
import type { Db } from "./huellas"

const Fila = z.object({
  id: z.number(),
  lista: z.string(),
  red: z.string(),
  valores: z.array(
    z.object({
      valor: z.string(),
      etiqueta: z.string(),
      descripcion: z.string().optional(),
      grupo: z.enum(["problema", "puente", "solucion", "respaldo"]).optional(),
      activacion: z.enum(["alta", "media", "baja"]).optional(),
      retirado: z.boolean().optional(),
    }),
  ),
})

/** The vigente version of every closed list. A missing list is a setup fault: it throws, the material pauses. */
export async function leerVocabulario(db: Db): Promise<Vocabulario> {
  const { data, error } = await db
    .from("versiones_de_vocabulario")
    .select("id, lista, red, valores")
    .eq("estado", "vigente")
  if (error) throw falloDeBase("No pude leer las listas de etiquetas", error)
  return vocabularioDeFilas(z.array(Fila).parse(data))
}
```

Use the same `Db` type and `falloDeBase` import that `lib/datos/huellas.ts` uses (copy its import lines).

- [ ] **Step 4: Run, expect PASS. Step 5: Commit**

```bash
git add lib/datos/vocabulario.ts tests/integration/vocabulario.test.ts
git commit -m "Read the vigente closed lists"
```

### Task 6: Extraction guide, schema and hook check

**Files:**
- Modify: `lib/proveedores/anthropic/afirmaciones.ts`
- Modify: `lib/proveedores/anthropic.ts` (re-exports, if `VERSION_DE_EXTRACCION` is re-exported there)
- Test: `tests/unit/anthropic-afirmaciones.test.ts` (extend; existing tests pass a vocabulary now)

- [ ] **Step 1: Failing tests** (add a `VOCAB` fixture built with `vocabularioDeFilas` holding the real starting values
for emotions: copy the 22 values from Task 1 into `tests/fixtures/vocabulario.ts` as `VOCABULARIO_DE_PRUEBA`, used here
and in Task 7)

```ts
import { guiaDeAfirmaciones, versionDeExtraccion } from "@/lib/proveedores/anthropic"
import { VOCABULARIO_DE_PRUEBA as VOCAB } from "../fixtures/vocabulario"

describe("guiaDeAfirmaciones", () => {
  it("lists every value of every list, emotions grouped with activation, and the tie-break rules", () => {
    const guia = guiaDeAfirmaciones(VOCAB)
    for (const v of VOCAB.emocion.todas.valores) expect(guia).toContain(v.valor)
    for (const v of VOCAB.dolor.instagram.valores) expect(guia).toContain(v.valor)
    expect(guia).toContain("problema")
    expect(guia).toContain("Classify what the claim provokes in the reader, not what it mentions")
    expect(guia).toContain("guilt is about what I did; shame is about who I am")
    expect(guia).not.toMatch(/[—–]/)
  })
  it("changes its version when a list version changes", () => {
    const otra = { ...VOCAB, gancho: { todas: { ...VOCAB.gancho.todas, versionId: 999 } } }
    expect(versionDeExtraccion(otra)).not.toBe(versionDeExtraccion(VOCAB))
  })
})

describe("extraerAfirmaciones with marks", () => {
  it("returns marks per network, normalised, and the hook when its exact phrase is in the chunk", async () => {
    const tramo = aTramos([{ texto: "¿Y si no eres impostora? Muchas mujeres no aprendieron a quedarse con sus logros.", ubicacion: { tipo: "documento" } }])[0] as Tramo
    respondiendo({
      idioma: "es",
      afirmaciones: [
        afirmacion({
          cita: "Muchas mujeres no aprendieron a quedarse con sus logros.",
          marcas: [
            { marca: "emocion", red: "instagram", valor: "vergüenza", frase: "no merecer", certeza: "alta", porQue: null },
            { marca: "problema", red: "instagram", valor: "no merecer los logros", frase: null, certeza: "media", porQue: null },
            { marca: "emocion", red: "linkedin", valor: "nostalgia", frase: null, certeza: "baja", porQue: null },
          ],
          gancho_detalle: {
            fraseExacta: "¿Y si no eres impostora?",
            fraseSinGancho: "Muchas mujeres no reconocen sus logros como propios.",
            tipo: "pregunta espejo",
            certeza: "media",
          },
        }),
      ],
    })
    const r = await extraerAfirmaciones({ cliente: cliente(), tramo, autor: AUTOR, vocabulario: VOCAB })
    const a = r.afirmaciones[0]
    expect(a?.marcas).toEqual([
      expect.objectContaining({ marca: "emocion", red: "instagram", valor: "verguenza" }),
      expect.objectContaining({ marca: "problema", red: "instagram", valor: "no_merecer_logros" }),
      expect.objectContaining({ marca: "emocion", red: "linkedin", valor: "otra", porQue: "fuera de la lista: nostalgia" }),
    ])
    expect(a?.ganchoDetalle).toMatchObject({ tipo: "pregunta_espejo", fraseExacta: "¿Y si no eres impostora?" })
  })

  it("drops a hook whose exact phrase is not in the chunk and keeps the claim", async () => {
    // same as above with fraseExacta: "Una frase inventada"
    // expect(r.afirmaciones).toHaveLength(1); expect(r.afirmaciones[0]?.ganchoDetalle).toBeNull()
  })

  it("expands a per-network mark sent for todas into both networks", async () => {
    // marcas: [{ marca: "publico", red: "todas", valor: "x", ... }] -> two marks, linkedin and instagram, both "otro"
  })

  it("maps an unknown tipo and evidencia to sin_clasificar instead of failing", async () => {
    // afirmacion({ tipo: "anécdota", evidencia: "rumor" }) -> tipo "sin_clasificar", evidencia "sin_clasificar"
  })
})
```

Write the three short tests fully (copy the first test's setup; the comments give the exact inputs and assertions).
Update every existing call in this file to pass `vocabulario: VOCAB`, and update the existing test that expected an
unknown evidence to become `opinion`: it now expects `sin_clasificar`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `afirmaciones.ts`:

1. Rename the constant to `GUIA_BASE` and remove from it the bullets for `tipo`, `evidencia`, `publico`, `dolor`,
   `emocion`, `gancho` (keep `texto`, `cita`, `idioma`, `postura`, and the rest of the text).
2. Add:

```ts
import { createHash } from "node:crypto"
import {
  CERTEZAS,
  MARCAS,
  type MarcaNormalizada,
  normalizarGancho,
  normalizarMarca,
  REDES,
  type ValorDeLista,
  type Vocabulario,
} from "@/lib/dominio/vocabulario"

const linea = (v: ValorDeLista) => `  - ${v.valor}: ${v.etiqueta}${v.descripcion ? `. ${v.descripcion}` : ""}`

const REGLAS_DE_EMOCION = `Emotion rules (Coni's list):
- Classify what the claim provokes in the reader, not what it mentions.
- Group first: does the claim name a pain (problema), open a question (puente) or give a way out (solucion)?
- Tie-breaks: agobio is too much now, inquietud is what could happen; inquietud can be thought, miedo_angustia paralyses; frustracion puts the fault outside, culpa on oneself; guilt is about what I did; shame is about who I am (culpa vs verguenza); frustracion affects me, indignacion is unfair to a group; escepticismo doubts, rechazo_resistencia opposes; rechazo_resistencia fights, incomodidad_evitacion avoids; confusion does not understand, escepticismo does not believe; curiosidad leaves the question open, sorpresa already broke the belief; alivio lowers the load, calma is a state of peace; alivio is less weight, claridad is understanding, autoconfianza is being able to; autoconfianza knows it can, entusiasmo_optimismo wants to and expects it to go well.
- informativa only if no reaction is sought. otra only when nothing fits, always with porQue.
- The same claim can provoke a different emotion on each network: classify linkedin and instagram separately.`

export function guiaDeAfirmaciones(v: Vocabulario): string {
  const emociones = (["problema", "puente", "solucion", "respaldo"] as const)
    .map(
      (grupo) =>
        `  ${grupo}:\n${v.emocion.todas.valores
          .filter((e) => e.grupo === grupo)
          .map((e) => `  ${linea(e)}${e.activacion ? ` (activación ${e.activacion})` : ""}`)
          .join("\n")}`,
    )
    .join("\n")
  const porRed = (lista: "publico" | "dolor") =>
    REDES.map((red) => `  ${red}:\n${v[lista][red].valores.map((x) => `  ${linea(x)}`).join("\n")}`).join("\n")
  return `${GUIA_BASE}

- tipo, what kind of claim it is (if none fits: sin_clasificar):
${v.tipo.todas.valores.map(linea).join("\n")}
- evidencia, what backs the claim in the source ("clinica" and "experiencia" are the author's professional practice, never patient data; if unclear: sin_clasificar):
${v.evidencia.todas.valores.map(linea).join("\n")}
- marcas: everything the claim carries, as a list. Each mark: marca, red, valor, frase (the free phrase that keeps the nuance, or null), certeza (alta, media or baja), porQue (one line, required for otro/otra, else null).
  - problema and solucion: valor from the pains of each network (a solucion resolves one of those pains); one mark per network where it applies.
  - publico: valor from the audiences of each network; one mark per network where it applies.
  - emocion: valor from the emotion list; one mark for linkedin and one for instagram.
  - dato and caso: red "todas", valor is a short label, frase the figure or case.
  - If no value fits, valor "otro" (for emotions "otra") with porQue.
  Pains:
${porRed("dolor")}
  Audiences:
${porRed("publico")}
  Emotions:
${emociones}
${REGLAS_DE_EMOCION}
- gancho_detalle: only if the claim naturally carries a hook, else null. fraseExacta is copied character by character from the source, like cita; fraseSinGancho is the same idea said neutrally and directly in Spanish of Chile; tipo from this list (ninguno if none fits); certeza.
${v.gancho.todas.valores.map(linea).join("\n")}
- publico, dolor, emocion, gancho: also keep the short free text of each (a few words, or null), as before.`
}

export function versionDeExtraccion(v: Vocabulario): string {
  return createHash("sha256").update(guiaDeAfirmaciones(v)).digest("hex")
}
```

3. Schema: add to each claim object

```ts
marcas: z.preprocess(
  (x) => x ?? [],
  z.array(
    z.object({
      marca: enumTolerante(MARCAS),
      red: enumTolerante(["linkedin", "instagram", "todas"] as const),
      valor: z.string(),
      frase: textoONulo(),
      certeza: enumTolerante(CERTEZAS, { porDefecto: "baja" }),
      porQue: textoONulo(),
    }),
  ),
),
gancho_detalle: z.preprocess(
  (x) => x ?? null,
  z
    .object({ fraseExacta: z.string(), fraseSinGancho: z.string(), tipo: z.string(), certeza: enumTolerante(CERTEZAS, { porDefecto: "baja" }) })
    .nullable(),
),
```

   and change `tipo` to `enumTolerante(TIPOS_DE_AFIRMACION, { porDefecto: "sin_clasificar", alCorregir })` and evidencia
   `porDefecto: "sin_clasificar"` (the `alCorregir` logging stays; rename the message in `afirmar.ts` from "tratada como
   opinión" to "tratada como sin clasificar").

4. `extraerAfirmaciones` takes `vocabulario: Vocabulario`, sends `guia: guiaDeAfirmaciones(entrada.vocabulario)`, and maps
   each claim:

```ts
function marcasNormalizadas(v: Vocabulario, crudas: readonly MarcaCruda[]): MarcaNormalizada[] {
  return crudas.flatMap((m) => {
    // problema, solucion, publico and emocion are classified per network: a "todas" answer becomes one mark each.
    const redes = listaDeMarca(m.marca) !== null && m.red === "todas" ? REDES : [m.red]
    return redes.map((red) => normalizarMarca(v, { ...m, red }))
  })
}
```

   Then:

```ts
const ganchoCita = a.gancho_detalle ? fragmentoTalCual(tramo.texto, a.gancho_detalle.fraseExacta) : null
const ganchoDetalle =
  a.gancho_detalle && ganchoCita !== null
    ? { fraseExacta: ganchoCita, fraseSinGancho: sinRaya(a.gancho_detalle.fraseSinGancho), certeza: a.gancho_detalle.certeza, ...normalizarGancho(v, a.gancho_detalle.tipo) }
    : null
return [{ ...rest, cita, ubicacion, marcas: marcasNormalizadas(v, a.marcas), ganchoDetalle }]
```

5. `AfirmacionExtraida` gains `marcas: MarcaNormalizada[]` and
   `ganchoDetalle: { fraseExacta: string; fraseSinGancho: string; tipo: string; certeza: Certeza; versionId: number } | null`.
6. Remove the exported constant `VERSION_DE_EXTRACCION`; export `versionDeExtraccion` and `guiaDeAfirmaciones` from
   `lib/proveedores/anthropic.ts` in its place.

- [ ] **Step 4: Run the file, expect PASS; then `pnpm type`** (Task 7 fixes `afirmar.ts`; if `pnpm type` fails only there,
proceed to Task 7 before committing both).

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/anthropic/afirmaciones.ts lib/proveedores/anthropic.ts tests/unit/anthropic-afirmaciones.test.ts tests/fixtures/vocabulario.ts
git commit -m "Build the extraction guide from the closed lists and return marks and hooks"
```

### Task 7: Store marks and hooks during ingest

**Files:**
- Modify: `lib/ingesta/afirmar.ts`
- Test: `tests/integration/procesar-afirmaciones.test.ts` (extend)

- [ ] **Step 1: Failing test.** Read the file first: it fakes Claude's answer per chunk. Add a case where the fake answer
includes `marcas` (one emotion per network, one problema for instagram, one dato) and a `gancho_detalle` whose
`fraseExacta` is in the material text, then assert after `afirmarMaterial` / processing:

```ts
const marcas = await c.query(
  `select m.marca, m.red, m.valor, m.version_id is not null as con_version
   from public.afirmacion_marcas m join public.afirmaciones a on a.id = m.afirmacion_id
   where a.material_id = $1 order by m.marca, m.red`,
  [material],
)
expect(marcas.rows).toEqual([
  { marca: "dato", red: "todas", valor: "cifra", con_version: false },
  { marca: "emocion", red: "instagram", valor: "verguenza", con_version: true },
  { marca: "emocion", red: "linkedin", valor: "escepticismo", con_version: true },
  { marca: "problema", red: "instagram", valor: "no_merecer_logros", con_version: true },
])
const ganchos = await c.query(
  "select g.tipo, g.frase_exacta from public.ganchos g join public.afirmaciones a on a.id = g.afirmacion_id where a.material_id = $1",
  [material],
)
expect(ganchos.rows).toEqual([{ tipo: "pregunta_espejo", frase_exacta: "<the exact phrase used in the fake>" }])
```

Also add: processing the same material twice leaves the same counts (claims are replaced, marks and hooks cascade).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `afirmar.ts`:

1. `afirmarMaterial` loads `const vocabulario = await leerVocabulario(db)` before `extraerPorTramo` and passes it down.
2. `extraerPorTramo(ctx, tramos, vocabulario)`: fingerprint `huellaDe(tramo.texto, modelo, versionDeExtraccion(vocabulario))`
   (compute the version once before the loop); `extraerAfirmaciones({ cliente, tramo, autor, vocabulario })`.
3. `Extraidas` schema: each claim gains

```ts
marcas: z.array(
  z.object({
    marca: z.enum(MARCAS),
    red: z.enum(["linkedin", "instagram", "todas"]),
    valor: z.string(),
    frase: z.string().nullable(),
    certeza: z.enum(CERTEZAS),
    porQue: z.string().nullable(),
    versionId: z.number().nullable(),
  }),
).default([]),
ganchoDetalle: z
  .object({ fraseExacta: z.string(), fraseSinGancho: z.string(), tipo: z.string(), certeza: z.enum(CERTEZAS), versionId: z.number() })
  .nullable()
  .default(null),
```

   (`default` keeps old checkpoints readable; they are re-extracted anyway because the fingerprint changed.)
4. In `reemplazarAfirmaciones`, after each claims batch insert (which already returns ids in order), build and insert:

```ts
const marcas = lote.flatMap((f, i) =>
  f.marcas.map((m) => ({
    afirmacion_id: data[i]?.id,
    marca: m.marca,
    red: m.red,
    valor: m.valor,
    frase: m.frase,
    certeza: m.certeza,
    por_que: m.porQue,
    version_id: m.versionId,
    origen: "extraccion" as const,
  })),
)
if (marcas.length > 0) {
  const r = await db.from("afirmacion_marcas").insert(marcas)
  if (r.error) throw falloDeBase("No pude guardar las marcas de las afirmaciones", r.error)
}
const ganchos = lote.flatMap((f, i) =>
  f.ganchoDetalle
    ? [{
        afirmacion_id: data[i]?.id,
        frase_exacta: f.ganchoDetalle.fraseExacta,
        frase_sin_gancho: f.ganchoDetalle.fraseSinGancho,
        tipo: f.ganchoDetalle.tipo,
        certeza: f.ganchoDetalle.certeza,
        version_id: f.ganchoDetalle.versionId,
        origen: "extraccion" as const,
      }]
    : [],
)
if (ganchos.length > 0) {
  const r = await db.from("ganchos").insert(ganchos)
  if (r.error) throw falloDeBase("No pude guardar los ganchos de las afirmaciones", r.error)
}
```

   Guard `data[i]?.id` being undefined: throw `falloDeBase` if `data.length !== lote.length` before building rows (no
   silent skip).
5. Grep for other callers of `extraerAfirmaciones` or `VERSION_DE_EXTRACCION` (`scripts/`, `trigger/`, evals) and pass
   the vocabulary / use `versionDeExtraccion` there too.

- [ ] **Step 4: Run the integration file and the unit suite, expect PASS; `pnpm type` clean.**

- [ ] **Step 5: Commit**

```bash
git add lib/ingesta/afirmar.ts tests/integration/procesar-afirmaciones.test.ts
git commit -m "Store claim marks and hooks when a material is processed"
```

(add any other file touched in step 3.5 explicitly)

### Task 8: Evidence strength in theories

**Files:**
- Modify: `lib/proveedores/anthropic/teorias.ts:16,125-127`
- Test: `tests/unit/anthropic-teorias-motor.test.ts` (extend)

- [ ] **Step 1: Failing tests**: a theory whose support is all `sin_clasificar` is flagged like all-opinion (whatever the
existing all-opinion test asserts, e.g. an advertencia or `soloOpinion`); a theory with one `guia_consenso` claim is not.
Copy the existing all-opinion test and change only the evidencia values.

- [ ] **Step 2: Run, expect FAIL** for `sin_clasificar`.

- [ ] **Step 3: Implement**

```ts
const EVIDENCIA_DEBIL = new Set(["opinion", "testimonio", "sin_clasificar"])
// ...
const soloOpinion = respaldo.every((afirmacion) => EVIDENCIA_DEBIL.has(afirmacion.evidencia))
```

and the prompt line 16: `- nivelEvidencia: alto si hay estudios, guías o consensos, o práctica profesional de varios autores, medio si es mixto, debil si todo es opinión, testimonio o sin clasificar.`

Changing this prompt changes the theories prompt version; check whether `tests/unit` pins a characterization of it (grep
`nivelEvidencia` in tests) and update the pinned text.

- [ ] **Step 4: Run, PASS. Step 5: Commit**

```bash
git add lib/proveedores/anthropic/teorias.ts tests/unit/anthropic-teorias-motor.test.ts
git commit -m "Count guía o consenso as strong evidence and sin clasificar as weak"
```

### Task 9: Cost, full gate and staging run

**Files:**
- Modify: `lib/ingesta/afirmar.ts` (`ESTIMADO_POR_TRAMO_USD`) and its estimate test
- Modify: `docs/TRASPASO.md` (section for 6a)

- [ ] **Step 1: Full local gate**

```bash
pnpm type
pnpm exec biome check
pnpm exec vitest run --exclude '.worktrees/**' --exclude 'tests/e2e/**' --exclude 'tests/integration/**'
pnpm test:db
```

Expected: all green. Fix anything red before continuing.

- [ ] **Step 2: Push the branch and open the PR as draft** (title "Change 6a: closed lists and claim marks", body with the
spec link and "Closes part of #21"). The staging workflow applies the migrations to staging on merge only, so for the
staging run apply them to the branch database through the Supabase MCP `apply_migration` on project
`omvvgywjyuoqjjfpbpsy` (staging is writable), and deploy Trigger staging from the branch:
`TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env staging --skip-update-check`.

- [ ] **Step 3: Process one real material on staging** (a seeded material, re-processed from the preview, or a new
upload of a short public PDF), then measure with SQL on staging:

```sql
select count(*) filter (where marca = 'emocion') as emociones,
       count(*) filter (where valor in ('otro', 'otra')) as fuera_de_lista,
       count(distinct afirmacion_id) as afirmaciones_con_marcas
from public.afirmacion_marcas;
select count(*) from public.ganchos;
select paso, avg(real_usd) as por_tramo, max(real_usd) from public.gastos where paso = 'afirmaciones' and creado_en > now() - interval '1 hour' group by paso;
```

(check the real column names of the spend table before running.) Every claim has two emotion marks (one per network);
hooks have literal phrases; `fuera_de_lista` under ~10% of marks.

- [ ] **Step 4: Set the reservation** from the measured max cost per chunk plus 50% margin: change the `output_tokens` of
`ESTIMADO_POR_TRAMO_USD` so the estimate is at or above that number, and update the estimate test. Commit:

```bash
git add lib/ingesta/afirmar.ts tests/unit/<estimate test file>
git commit -m "Reserve for the longer extraction answer measured on staging"
```

- [ ] **Step 5: TRASPASO and ready for review.** Add a 6a section to `docs/TRASPASO.md` (tables, where the lists live,
`versionDeExtraccion`, that old claims are translated in change 7, migrations 20261114000100-300, Trigger version). Commit,
push, mark the PR ready, run the review. Production `db push` and Trigger deploy only with Federico's explicit OK.
