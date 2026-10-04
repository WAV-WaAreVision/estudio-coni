# Approve, record the voice, record the video: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Guion screen's single "approve and record" into three steps (approve, record voice, record video),
key the voice by its text so it is never paid twice, refresh working screens by themselves and show the ElevenLabs and
HeyGen API balances next to the buttons and in Ajustes.

**Spec:** `docs/superpowers/specs/2026-10-04-conidolly-aprobar-voz-video-design.md` (read it first; "Decisions" 1 to 8
are what this plan builds).

**Architecture:** Two new piece states (`guion_aprobado`, `grabando_voz`) between gate 1 and the render. A pure voice
fingerprint (`lib/dominio/voz.ts`) names the audio object by text plus voice config; one shared step (`asegurarVoz`,
`lib/produccion/voz.ts`) reuses or makes the voice for both the new `grabar-voz` task and `grabar-pieza`, and the render
refuses any voice not derived from the approved script. Balances come from two provider calls cached for a minute on
the server; a tiny client component polls with `router.refresh()` while a piece works.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions), Supabase Postgres (RLS, triggers), Trigger.dev
v4 (`schemaTask`), Zod 4, Vitest + Testing Library, MSW 2, Playwright, Biome.

**Rules (every task):**

- Strict TDD: write the failing test first, run it and see it red, then the minimum code, then green.
- MSW for every external call (ElevenLabs, HeyGen). No real network in tests. Never call ElevenLabs or HeyGen for real.
- Local Supabase only: `supabase db reset`. Never touch the hosted project (`mvfytttfxmzzjajecsch`) or production.
  Never read `.env*` files or secrets.
- Never `as any`, `@ts-expect-error`, non-null assertions (`!`) or silent catches (a catch either handles meaningfully,
  logs and returns a result, or rethrows).
- Biome safe mode only (`pnpm check`, never `--unsafe`). `"use client"` stays on line 1 of client files: after
  `pnpm check`, run `grep -L '^"use client"' $(grep -rl 'use client' app components)` and expect no output.
- Migrations are append-only, timestamps after `20261003000510`: this plan uses `20261004000100` and
  `20261004000110`. `supabase/pendientes/20261003000350_borrar_vinculos.sql` stays where it is.
- SQL conflicts raise `PT409`, never `40001`.
- Copy for Coni: Spanish of Chile, `tú`, no em dashes. Before each commit: `git diff --cached | grep '—'` must print
  nothing.
- One commit per task. Message in English, then a blank line, then
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Commands:**

- `pnpm type`
- `pnpm test:run` (unit)
- `supabase db reset && pnpm test:db` (integration; single files with `pnpm test:db tests/integration/<file>`)
- `pnpm test:e2e`
- `pnpm build`
- `pnpm db:types` (after each migration)
- `pnpm lint` has one known failure in `tests/unit/duracion.test.ts`; nothing new may fail.

**Known red window:** Task 3 changes where gate 1 lands (`guion_aprobado`), so `tests/e2e/guion.spec.ts` stays red
until Task 15 rewrites it. Unit and integration suites are green after every task.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20261004000100_estados_de_voz.sql` | new | the two enum values |
| `supabase/migrations/20261004000110_aprobar_sin_grabar.sql` | new | constraint, `proteger_pieza`, edit functions |
| `lib/dominio/voz.ts` | new | voice fingerprint, take keys, `vozDelGuion` |
| `lib/dominio/estados.ts` | modify | new states, events, `piezaTrabajando` |
| `lib/dominio/puertas.ts` | modify | `Paso` gains `"voz"`, `puedeGrabarVoz` |
| `lib/dominio/saldos.ts` | new | balance types, "does it reach", copy lines |
| `lib/proveedores/elevenlabs.ts` | modify | `quota_exceeded` becomes a `Falla` for Coni |
| `lib/proveedores/saldos.ts` | new | `GET /v1/user/subscription`, `GET /v3/users/me` |
| `lib/saldos/leer.ts`, `lib/saldos/reales.ts` | new | cached reader, real wiring |
| `lib/produccion/aprobacion.ts` | new | `formulaGuardada`, `artefactoAprobado` (moved from `grabar.ts`) |
| `lib/produccion/voz.ts` | new | `asegurarVoz`, `huellaDelGuion`, `leerLlaveDeVoz` |
| `lib/produccion/grabar.ts` | modify | uses `asegurarVoz`, binds the voice before HeyGen, `estimarCreditosVideo` |
| `lib/produccion/grabar-voz.ts` | new | the `grabar-voz` flow |
| `trigger/grabar-voz.ts` | new | the task |
| `lib/produccion/deps-reales.ts`, `lib/produccion/fallas.ts` | modify | `depsVoz`, failure of `grabar-voz` |
| `lib/acciones/disparos.ts`, `lib/acciones/disparos-entorno.ts`, `lib/acciones/servidor.ts` | modify | `voz` run |
| `lib/acciones/piezas.ts`, `lib/acciones/guion.ts`, `app/(app)/piezas/acciones.ts` | modify | approve without spending, `pedirVoz`, `pedirVideo`, `reabrirGuion`, edits in `guion_aprobado` |
| `lib/mantenimiento/voces.ts`, `lib/mantenimiento/gastos.ts`, `lib/mantenimiento/ejecutar.ts`, `lib/datos/repositorio.ts` | new/modify | stuck voices, voice reservations |
| `components/refresco-automatico.tsx` | new | polling |
| `lib/datos/grabacion.ts` | new | data of the record bar (pure `presentarGrabacion` + reader) |
| `app/(app)/guion/[id]/page.tsx`, `pantalla-guion.tsx`, `barra-de-grabacion.tsx` | modify/new | Guion screen |
| `lib/inicio/modelo.ts`, `app/(app)/page.tsx`, `lib/calendario/modelo.ts`, `lib/datos/pantallas.ts`, `app/(app)/video/[id]/page.tsx` | modify | Inicio, calendar, queue, redirects |
| `app/(app)/ajustes/saldos.tsx`, `app/(app)/ajustes/page.tsx` | new/modify | Saldos section |
| `tests/integration/flujo.ts` | modify | the real flow passes through `guion_aprobado` |
| `tests/e2e/servicios-falsos.ts`, `tests/e2e/ayudas.ts`, `tests/e2e/guion.spec.ts` | modify | balances, `voz` runs, new flow |

---

### Task 1: Schema: the two states and their guards

**Files:**
- Create: `supabase/migrations/20261004000100_estados_de_voz.sql`
- Create: `supabase/migrations/20261004000110_aprobar_sin_grabar.sql`
- Modify: `lib/supabase/database.types.ts` (generated)
- Test: `tests/integration/aprobar-voz-esquema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/aprobar-voz-esquema.test.ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { AVATAR, crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

const HASH = "f".repeat(64)
const REVISION = "[]"

/** Gate 1 written the way the app will write it from Task 3 on: Coni's session, approval and avatar in one update. */
async function aprobada(c: pg.PoolClient): Promise<string> {
  const id = await crearPiezaEn(c, "guion_por_aprobar")
  await asumir(c, comoConi)
  await c.query(
    `update public.piezas set estado = 'guion_aprobado', puerta1_hash = $2, puerta1_en = now(), avatar_id = $3,
       puerta1_formula = 3, version = version + 1 where id = $1`,
    [id, HASH, AVATAR],
  )
  await asumir(c, comoPostgres)
  return id
}

describe("estados guion_aprobado y grabando_voz", () => {
  it("lets Coni approve into guion_aprobado and records her as the approver", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      const fila = await leer(c, id)
      expect(fila.estado).toBe("guion_aprobado")
      expect(fila.puerta1_hash).toBe(HASH)
      expect(fila.puerta1_por).not.toBeNull()
    })
  })

  it("refuses guion_aprobado or grabando_voz without a gate 1 approval", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      for (const estado of ["guion_aprobado", "grabando_voz"]) {
        const error = await fallaCon(c, `update public.piezas set estado = $2, version = version + 1 where id = $1`, [
          id,
          estado,
        ])
        expect(error.constraint).toBe("aprobada_para_grabar")
      }
    })
  })

  it("only lets Coni move a piece into grabando_voz, and lets the tasks bring it back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      await asumir(c, comoServicio)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'grabando_voz', version = version + 1 where id = $1",
        [id],
      )
      expect(error.message).toBe("solo_coni_entra_a_puerta")

      await asumir(c, comoConi)
      await c.query("update public.piezas set estado = 'grabando_voz', version = version + 1 where id = $1", [id])
      await asumir(c, comoServicio)
      await c.query(
        "update public.piezas set estado = 'guion_aprobado', audio_id = 'voces/x.mp3', version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoPostgres)
      expect((await leer(c, id)).estado).toBe("guion_aprobado")
    })
  })

  it("drops the approval when Coni edits the script of an approved piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const { rows } = await c.query(
        "select * from public.editar_guion_como_coni($1, $2, $3, $4, $5::jsonb)",
        [id, version, "Guion nuevo de Coni.", "Texto nuevo.", REVISION],
      )
      expect(rows[0]).toMatchObject({
        estado: "guion_por_aprobar",
        puerta1_hash: null,
        puerta1_en: null,
        puerta1_por: null,
        guion: "Guion nuevo de Coni.",
      })
    })
  })

  it("drops the approval when Coni edits the caption of an approved piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const { rows } = await c.query("select * from public.editar_texto_como_coni($1, $2, $3, $4::jsonb)", [
        id,
        version,
        "Otro texto.",
        REVISION,
      ])
      expect(rows[0]).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null, texto: "Otro texto." })
    })
  })

  it("still refuses to edit the script of a piece in render", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select * from public.editar_guion_como_coni($1, $2, $3, $4, $5::jsonb)", [
        id,
        version,
        "Guion.",
        "Texto.",
        REVISION,
      ])
      expect(error.message).toBe("guion_fuera_de_revision")
    })
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `supabase db reset && pnpm test:db tests/integration/aprobar-voz-esquema.test.ts`
Expected: FAIL, `invalid input value for enum estado_pieza: "guion_aprobado"`.

- [ ] **Step 3: Write the migrations**

```sql
-- supabase/migrations/20261004000100_estados_de_voz.sql
-- Approve, record the voice and record the video as three steps. The states mirror lib/dominio/estados.ts (ESTADOS).
-- A new enum value cannot be used in the transaction that adds it, so the rules that name them are in the next file.
alter type public.estado_pieza add value if not exists 'guion_aprobado' after 'guion_por_aprobar';
alter type public.estado_pieza add value if not exists 'grabando_voz' after 'guion_aprobado';
```

```sql
-- supabase/migrations/20261004000110_aprobar_sin_grabar.sql
-- Gate 1 no longer starts the render: an approved piece waits in guion_aprobado, records its voice in grabando_voz and
-- goes to en_render only when Coni asks for the video. Both new states require the approval; only Coni enters
-- grabando_voz (it spends ElevenLabs); editing an approved script or caption drops the approval in the same update.

alter table public.piezas drop constraint aprobada_para_grabar;
alter table public.piezas add constraint aprobada_para_grabar check (
  estado not in ('guion_aprobado', 'grabando_voz', 'en_render', 'subtitulando', 'video_por_aprobar', 'programado', 'publicado')
  or puerta1_hash is not null
);

-- proteger_pieza as of 20261003000500, plus grabando_voz among the states only Coni may enter.
CREATE OR REPLACE FUNCTION public.proteger_pieza()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  aprueba_puerta1 boolean;
  aprueba_puerta2 boolean;
begin
  if tg_op = 'INSERT' then
    if new.version <> 0 or new.puerta1_hash is not null or new.puerta2_hash_texto is not null
       or new.avatar_id is not null or new.puerta1_formula is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  aprueba_puerta1 := new.puerta1_hash is not null and new.puerta1_hash is distinct from old.puerta1_hash;
  aprueba_puerta2 := new.puerta2_hash_texto is not null and (
    new.puerta2_hash_texto is distinct from old.puerta2_hash_texto
    or new.puerta2_video_id is distinct from old.puerta2_video_id
    or new.puerta2_publicar_en is distinct from old.puerta2_publicar_en
  );
  if (aprueba_puerta1 or aprueba_puerta2) and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_aprueba';
  end if;
  if new.estado in ('grabando_voz', 'en_render', 'programado', 'publicado_a_mano')
     and new.estado is distinct from old.estado and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
  end if;

  if new.avatar_id is distinct from old.avatar_id then
    if not public.es_coni() then
      raise exception using errcode = '42501', message = 'solo_coni_elige_avatar';
    end if;
    if old.estado <> 'guion_por_aprobar' then
      raise exception using errcode = '42501', message = 'avatar_fuera_del_guion';
    end if;
  end if;
  if new.puerta1_formula is distinct from old.puerta1_formula and not aprueba_puerta1 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.respaldo is distinct from old.respaldo and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'respaldo_solo_de_tareas';
  end if;
  if aprueba_puerta1 and new.avatar_id is null then
    raise exception using errcode = '42501', message = 'falta_avatar';
  end if;

  if aprueba_puerta1 then
    new.puerta1_por := auth.uid();
  elsif new.puerta1_hash is null then
    new.puerta1_por := null;
  else
    new.puerta1_por := old.puerta1_por;
  end if;
  if aprueba_puerta2 then
    new.puerta2_por := auth.uid();
  elsif new.puerta2_hash_texto is null then
    new.puerta2_por := null;
  else
    new.puerta2_por := old.puerta2_por;
  end if;

  new.actualizada_en := now();
  return new;
end $function$;

-- editar_guion_como_coni as of 20261003000181, plus guion_aprobado: an edit there goes back to guion_por_aprobar
-- without gate 1 (puerta1_formula stays: the trigger only lets it change with an approval, and the next one rewrites it).
CREATE OR REPLACE FUNCTION public.editar_guion_como_coni(p_pieza uuid, p_version integer, p_guion text, p_texto text, p_revision jsonb)
 RETURNS piezas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fila public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_guion';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;

  if btrim(coalesce(p_guion, ''), E' \t\r\n') = '' then
    raise exception using errcode = '22023', message = 'guion_vacio';
  end if;
  if btrim(coalesce(p_texto, ''), E' \t\r\n') = '' then
    raise exception using errcode = '22023', message = 'texto_vacio';
  end if;

  update public.piezas
     set guion = p_guion, texto = p_texto, revision = p_revision, version = version + 1,
         estado = 'guion_por_aprobar'::public.estado_pieza,
         puerta1_hash = case when estado = 'guion_aprobado' then null else puerta1_hash end,
         puerta1_en = case when estado = 'guion_aprobado' then null else puerta1_en end,
         explicacion = case when estado = 'guion_aprobado' then null else explicacion end
   where id = p_pieza and version = p_version and estado in ('guion_por_aprobar', 'guion_aprobado')
  returning * into fila;
  if fila.id is null then
    if exists (select 1 from public.piezas where id = p_pieza and estado not in ('guion_por_aprobar', 'guion_aprobado')) then
      raise exception using errcode = '22023', message = 'guion_fuera_de_revision';
    end if;
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'coni', auth.uid());
  return fila;
end $function$;

-- editar_texto_como_coni as of 20261003000181, plus guion_aprobado (same reset as above).
CREATE OR REPLACE FUNCTION public.editar_texto_como_coni(p_pieza uuid, p_version integer, p_texto text, p_revision jsonb)
 RETURNS piezas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pieza public.piezas;
  v_resultado public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_texto';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;

  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado not in ('guion_por_aprobar', 'guion_aprobado', 'video_por_aprobar', 'programado') then
    raise exception using errcode = 'P0001', message = 'estado_no_editable';
  end if;

  update public.piezas
     set texto = p_texto,
         revision = p_revision,
         version = version + 1,
         estado = case
           when estado = 'programado' then 'video_por_aprobar'::public.estado_pieza
           when estado = 'guion_aprobado' then 'guion_por_aprobar'::public.estado_pieza
           else estado end,
         intento = case when estado = 'programado' then intento + 1 else intento end,
         puerta1_hash = case when estado = 'guion_aprobado' then null else puerta1_hash end,
         puerta1_en = case when estado = 'guion_aprobado' then null else puerta1_en end,
         puerta2_video_id = case when estado in ('guion_por_aprobar', 'guion_aprobado') then puerta2_video_id else null end,
         puerta2_hash_texto = case when estado in ('guion_por_aprobar', 'guion_aprobado') then puerta2_hash_texto else null end,
         puerta2_publicar_en = case when estado in ('guion_por_aprobar', 'guion_aprobado') then puerta2_publicar_en else null end,
         puerta2_en = case when estado in ('guion_por_aprobar', 'guion_aprobado') then puerta2_en else null end
   where id = p_pieza
  returning * into v_resultado;
  return v_resultado;
end $function$;
```

Before writing, diff the copied bodies against the live ones so nothing else changed:
`awk '/FUNCTION public.editar_texto_como_coni/,/\$function\$$/' supabase/migrations/20261003000181_conflictos_409.sql`
and the `proteger_pieza` block of `20261003000500_respaldo_de_la_pieza.sql`. The only differences must be the ones the
comments name.

- [ ] **Step 4: Run it and see it pass**

Run: `supabase db reset && pnpm test:db tests/integration/aprobar-voz-esquema.test.ts`
Expected: PASS (6 tests). Then `pnpm db:types` and `pnpm type` (the enum union gains the two values; `pnpm type`
passes because no code uses them yet). Then the whole integration suite: `pnpm test:db`, expected green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004000100_estados_de_voz.sql supabase/migrations/20261004000110_aprobar_sin_grabar.sql lib/supabase/database.types.ts tests/integration/aprobar-voz-esquema.test.ts
git commit -m "feat(db): guion_aprobado and grabando_voz states with their guards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The voice fingerprint and its keys

**Files:**
- Create: `lib/dominio/voz.ts`
- Test: `tests/unit/voz.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/voz.test.ts
import { describe, expect, it } from "vitest"
import { claveDeToma, huellaDeVoz, prefijoDeTomas, ultimaToma, type VozConfigurada, vozDelGuion } from "@/lib/dominio/voz"

const PIEZA = "11111111-2222-4333-8444-555555555555"
const VOZ: VozConfigurada = {
  voiceId: "voz-coni",
  modelId: "eleven_multilingual_v2",
  outputFormat: "mp3_44100_128",
  ajustes: { stability: 0.5, similarity_boost: 0.8 },
}
const GUION = "Hola, soy Coni. Hoy hablamos de límites."

describe("huellaDeVoz", () => {
  it("is a SHA-256 that only depends on the text and what changes the audio", () => {
    const huella = huellaDeVoz({ guion: GUION, voz: VOZ })
    expect(huella).toMatch(/^[0-9a-f]{64}$/)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ } })).toBe(huella)
  })

  it("changes with the text, the voice, the model, the format or the settings", () => {
    const base = huellaDeVoz({ guion: GUION, voz: VOZ })
    expect(huellaDeVoz({ guion: `${GUION} `, voz: VOZ })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, voiceId: "otra" } })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, modelId: "eleven_v3" } })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, outputFormat: "mp3_22050_32" } })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, ajustes: { stability: 0.6, similarity_boost: 0.8 } } })).not.toBe(base)
  })

  it("does not depend on the order of the settings, and treats no settings like empty ones", () => {
    const ordenada = huellaDeVoz({ guion: GUION, voz: VOZ })
    const desordenada = huellaDeVoz({ guion: GUION, voz: { ...VOZ, ajustes: { similarity_boost: 0.8, stability: 0.5 } } })
    expect(desordenada).toBe(ordenada)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, ajustes: null } })).toBe(
      huellaDeVoz({ guion: GUION, voz: { ...VOZ, ajustes: {} } }),
    )
  })
})

describe("claves de toma", () => {
  const huella = huellaDeVoz({ guion: GUION, voz: VOZ })

  it("names a take under the piece, with the fingerprint and the take number", () => {
    expect(prefijoDeTomas(PIEZA, huella)).toBe(`voces/${PIEZA}/t-${huella}-`)
    expect(claveDeToma(PIEZA, huella, 3)).toBe(`voces/${PIEZA}/t-${huella}-3.mp3`)
  })

  it("refuses a piece id that is not a UUID, a fingerprint that is not hex and a negative take", () => {
    expect(() => claveDeToma("../x", huella, 0)).toThrow()
    expect(() => claveDeToma(PIEZA, "abc", 0)).toThrow()
    expect(() => claveDeToma(PIEZA, huella, -1)).toThrow()
    expect(() => claveDeToma(PIEZA, huella, 1.5)).toThrow()
  })

  it("picks the highest take of that fingerprint and ignores anything else", () => {
    const otra = huellaDeVoz({ guion: "Otro texto.", voz: VOZ })
    const claves = [
      claveDeToma(PIEZA, huella, 2),
      claveDeToma(PIEZA, huella, 10),
      claveDeToma(PIEZA, otra, 50),
      `voces/${PIEZA}/${"a".repeat(64)}.mp3`,
      `${prefijoDeTomas(PIEZA, huella)}x.mp3`,
    ]
    expect(ultimaToma(claves, PIEZA, huella)).toBe(claveDeToma(PIEZA, huella, 10))
    expect(ultimaToma([], PIEZA, huella)).toBeNull()
  })
})

describe("vozDelGuion", () => {
  const huella = huellaDeVoz({ guion: GUION, voz: VOZ })
  const legada = `voces/${PIEZA}/${"b".repeat(64)}.mp3`

  it("accepts any take of this fingerprint and the legacy keys it is given", () => {
    expect(vozDelGuion({ audioId: claveDeToma(PIEZA, huella, 4), piezaId: PIEZA, huella })).toBe(
      claveDeToma(PIEZA, huella, 4),
    )
    expect(vozDelGuion({ audioId: legada, piezaId: PIEZA, huella, legadas: [legada] })).toBe(legada)
  })

  it("refuses no voice, a voice of another text and a legacy key it was not given", () => {
    const otra = huellaDeVoz({ guion: "Otro texto.", voz: VOZ })
    expect(vozDelGuion({ audioId: null, piezaId: PIEZA, huella })).toBeNull()
    expect(vozDelGuion({ audioId: claveDeToma(PIEZA, otra, 0), piezaId: PIEZA, huella })).toBeNull()
    expect(vozDelGuion({ audioId: legada, piezaId: PIEZA, huella })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/voz.test.ts`
Expected: FAIL, cannot resolve `@/lib/dominio/voz`.

- [ ] **Step 3: Write the module**

```ts
// lib/dominio/voz.ts
import { createHash } from "node:crypto"

/** What ElevenLabs is asked for besides the text: anything here changes the audio, so it is in the fingerprint. */
export interface VozConfigurada {
  voiceId: string | null
  modelId: string
  outputFormat: string
  ajustes?: Readonly<Record<string, number | boolean>> | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/

// Sorted pairs: the same settings written in another order are the same voice.
function ajustesCanonicos(ajustes: VozConfigurada["ajustes"]): string {
  if (!ajustes || Object.keys(ajustes).length === 0) return ""
  return JSON.stringify(
    Object.keys(ajustes)
      .sort()
      .map((clave) => [clave, ajustes[clave]]),
  )
}

/**
 * The identity of a voice: the exact text spoken and everything that shapes the audio. Two approvals of the same text
 * with the same voice have the same fingerprint, so the second one reuses the first voice instead of paying again.
 */
export function huellaDeVoz(entrada: { guion: string; voz: VozConfigurada }): string {
  const { guion, voz } = entrada
  const partes = ["voz/1", guion, voz.voiceId ?? "", voz.modelId, voz.outputFormat, ajustesCanonicos(voz.ajustes)]
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex")
}

function exigirPartes(piezaId: string, huella: string): void {
  if (!UUID.test(piezaId)) throw new Error(`El id de la pieza no es un UUID: ${piezaId}`)
  if (!SHA256.test(huella)) throw new Error("La huella de la voz debe ser un SHA-256 en hexadecimal.")
}

/** Every take of one fingerprint starts like this; `t-` keeps them apart from the older content and approval keys. */
export function prefijoDeTomas(piezaId: string, huella: string): string {
  exigirPartes(piezaId, huella)
  return `voces/${piezaId}/t-${huella}-`
}

/** One take: the piece's attempt when the voice was made. "Volver a grabar voz" is a new attempt, so a new take. */
export function claveDeToma(piezaId: string, huella: string, toma: number): string {
  if (!Number.isSafeInteger(toma) || toma < 0) throw new Error(`Toma inválida: ${toma}`)
  return `${prefijoDeTomas(piezaId, huella)}${toma}.mp3`
}

/** The newest take of this fingerprint among `claves` (a listing of the store), or null. */
export function ultimaToma(claves: readonly string[], piezaId: string, huella: string): string | null {
  const prefijo = prefijoDeTomas(piezaId, huella)
  let mejor: { clave: string; toma: number } | null = null
  for (const clave of claves) {
    if (!clave.startsWith(prefijo) || !clave.endsWith(".mp3")) continue
    const numero = clave.slice(prefijo.length, -".mp3".length)
    if (!/^\d+$/.test(numero)) continue
    const toma = Number(numero)
    if (mejor === null || toma > mejor.toma) mejor = { clave, toma }
  }
  return mejor?.clave ?? null
}

/**
 * The stored voice when it speaks this exact text with this voice, or null. `legadas` are older keys the caller can
 * vouch for (the approval key of the current gate 1, which was generated for the approved script).
 */
export function vozDelGuion(entrada: {
  audioId: string | null
  piezaId: string
  huella: string
  legadas?: readonly string[]
}): string | null {
  const { audioId } = entrada
  if (audioId === null) return null
  if (audioId.startsWith(prefijoDeTomas(entrada.piezaId, entrada.huella)) && audioId.endsWith(".mp3")) return audioId
  return (entrada.legadas ?? []).includes(audioId) ? audioId : null
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test:run tests/unit/voz.test.ts` and `pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/voz.ts tests/unit/voz.test.ts
git commit -m "feat(voz): key the voice by its text and voice settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: States and transitions in the domain; approving no longer records

**Files:**
- Modify: `lib/dominio/estados.ts`
- Modify: `lib/dominio/puertas.ts`
- Modify: `lib/acciones/piezas.ts` (`aprobarGuion`)
- Modify: `app/(app)/guion/[id]/pantalla-guion.tsx` (only the approve callback)
- Modify: `app/(app)/video/[id]/page.tsx`, `lib/calendario/modelo.ts`, `lib/datos/pantallas.ts` (`leerContextoDeFechas`)
- Modify: `tests/integration/flujo.ts`
- Modify: existing tests that expect approval to land in `en_render` (listed in Step 6)
- Test: `tests/unit/estados.test.ts`, `tests/unit/puertas.test.ts`, `tests/integration/acciones-piezas.test.ts`

- [ ] **Step 1: Write the failing unit tests** (append to `tests/unit/estados.test.ts`)

```ts
import { piezaNueva, piezaTrabajando, type Pieza, TransicionInvalida, transicionar } from "@/lib/dominio/estados"

const APROBADA = { hash: "a".repeat(64), en: "2026-10-04T12:00:00.000Z" }
const en = (estado: Pieza["estado"], cambios: Partial<Pieza> = {}): Pieza => ({
  ...piezaNueva(),
  estado,
  version: 4,
  intento: 2,
  ...cambios,
})

describe("aprobar, grabar la voz y grabar el video", () => {
  it("approves into guion_aprobado, keeping the voice the piece had", () => {
    const { pieza } = transicionar(en("guion_por_aprobar", { audioId: "voces/x.mp3" }), {
      tipo: "aprobar_guion",
      actor: "coni",
      hashVisto: APROBADA.hash,
      hashActual: APROBADA.hash,
      en: APROBADA.en,
    })
    expect(pieza).toMatchObject({ estado: "guion_aprobado", puerta1: APROBADA, audioId: "voces/x.mp3", version: 5 })
  })

  it("asks for the voice as a new attempt and clears an old explanation", () => {
    const { pieza } = transicionar(en("guion_aprobado", { puerta1: APROBADA, explicacion: "falló" }), {
      tipo: "pedir_voz",
    })
    expect(pieza).toMatchObject({ estado: "grabando_voz", intento: 3, explicacion: null })
  })

  it("comes back to guion_aprobado with the voice, or with the reason and a new attempt when it failed", () => {
    const grabando = en("grabando_voz", { puerta1: APROBADA })
    expect(transicionar(grabando, { tipo: "voz_lista", audioId: "voces/v.mp3" }).pieza).toMatchObject({
      estado: "guion_aprobado",
      audioId: "voces/v.mp3",
      intento: 2,
    })
    expect(transicionar(grabando, { tipo: "falla_voz", explicacion: "Sin caracteres." }).pieza).toMatchObject({
      estado: "guion_aprobado",
      explicacion: "Sin caracteres.",
      intento: 3,
    })
  })

  it("still stores the voice while in render", () => {
    const { pieza } = transicionar(en("en_render", { puerta1: APROBADA }), { tipo: "voz_lista", audioId: "voces/v.mp3" })
    expect(pieza).toMatchObject({ estado: "en_render", audioId: "voces/v.mp3" })
  })

  it("sends an approved piece to render without bumping the attempt", () => {
    const { pieza } = transicionar(en("guion_aprobado", { puerta1: APROBADA }), { tipo: "grabar_video" })
    expect(pieza).toMatchObject({ estado: "en_render", intento: 2, puerta1: APROBADA })
  })

  it("reopens an approved script, and an edited caption drops the approval too", () => {
    const aprobado = en("guion_aprobado", { puerta1: APROBADA })
    expect(transicionar(aprobado, { tipo: "reabrir_guion" }).pieza).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1: null,
    })
    const editado = transicionar(aprobado, { tipo: "editar_texto" })
    expect(editado.pieza).toMatchObject({ estado: "guion_por_aprobar", puerta1: null })
    expect(editado.efectos).toEqual(["revisar_texto"])
  })

  it("refuses the new events from any other state", () => {
    expect(() => transicionar(en("guion_por_aprobar"), { tipo: "pedir_voz" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("grabando_voz", { puerta1: APROBADA }), { tipo: "grabar_video" })).toThrow(
      TransicionInvalida,
    )
    expect(() => transicionar(en("guion_aprobado", { puerta1: APROBADA }), { tipo: "falla_voz", explicacion: "x" })).toThrow(
      TransicionInvalida,
    )
    expect(() => transicionar(en("en_render", { puerta1: APROBADA }), { tipo: "reabrir_guion" })).toThrow(
      TransicionInvalida,
    )
  })

  it("lets Coni discard a piece in the new states", () => {
    for (const estado of ["guion_aprobado", "grabando_voz"] as const) {
      expect(transicionar(en(estado, { puerta1: APROBADA }), { tipo: "descartar" }).pieza.estado).toBe("descartado")
    }
  })
})

describe("piezaTrabajando", () => {
  it("is true while a task works on the piece and false otherwise", () => {
    expect(piezaTrabajando({ estado: "guion_en_proceso", explicacion: null })).toBe(true)
    expect(piezaTrabajando({ estado: "guion_en_proceso", explicacion: "No pude." })).toBe(false)
    for (const estado of ["grabando_voz", "en_render", "subtitulando"] as const) {
      expect(piezaTrabajando({ estado, explicacion: null })).toBe(true)
    }
    for (const estado of ["guion_por_aprobar", "guion_aprobado", "video_por_aprobar", "error_produccion"] as const) {
      expect(piezaTrabajando({ estado, explicacion: null })).toBe(false)
    }
  })
})
```

Append to `tests/unit/puertas.test.ts`:

```ts
import { piezaNueva } from "@/lib/dominio/estados"
import { claveIdempotencia, puedeGrabarVoz } from "@/lib/dominio/puertas"

describe("puedeGrabarVoz", () => {
  const hash = "c".repeat(64)
  const base = { ...piezaNueva(), estado: "grabando_voz" as const, puerta1: { hash, en: "2026-10-04T12:00:00.000Z" } }

  it("allows the voice only while grabando_voz, with gate 1 and the same hash", () => {
    expect(puedeGrabarVoz(base, hash)).toEqual({ ok: true })
    expect(puedeGrabarVoz({ ...base, estado: "guion_aprobado" }, hash)).toEqual({ ok: false, motivo: "estado" })
    expect(puedeGrabarVoz({ ...base, puerta1: null }, hash)).toEqual({ ok: false, motivo: "sin_aprobacion" })
    expect(puedeGrabarVoz(base, "d".repeat(64))).toEqual({ ok: false, motivo: "artefacto_cambio" })
  })

  it("builds idempotency keys for the voice step", () => {
    expect(claveIdempotencia({ piezaId: "p", paso: "voz", hash, intento: 2 })).toBe(`p:voz:${hash.slice(0, 16)}:2`)
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/estados.test.ts tests/unit/puertas.test.ts`
Expected: FAIL (type errors on `pedir_voz`, `piezaTrabajando`, `puedeGrabarVoz`; `aprobar_guion` lands in `en_render`).

- [ ] **Step 3: Implement the domain**

In `lib/dominio/estados.ts`:

1. `ESTADOS`: insert `"guion_aprobado", "grabando_voz",` right after `"guion_por_aprobar",`.
2. `Evento`: add, after the `aprobar_guion` member:

```ts
  /** Coni asks for her voice on the approved script (spends ElevenLabs). */
  | { tipo: "pedir_voz" }
  | { tipo: "falla_voz"; explicacion: string }
  /** Coni asks for the video of the approved script (spends HeyGen). */
  | { tipo: "grabar_video" }
  /** Coni takes the approval back to change the script, the caption or the avatar. */
  | { tipo: "reabrir_guion" }
```

3. In `transicionar`, replace the `editar_texto`, `aprobar_guion` and `voz_lista` cases and add the new ones:

```ts
    case "editar_texto":
      if (estado === "guion_por_aprobar") return a("guion_por_aprobar", {}, ["revisar_texto"])
      // The caption is part of gate 1: changing it after approving takes the approval back.
      if (estado === "guion_aprobado") return a("guion_por_aprobar", { puerta1: null }, ["revisar_texto"])
      if (estado === "video_por_aprobar") return a("video_por_aprobar", { puerta2: null }, ["revisar_texto"])
      if (estado === "programado") {
        return a("video_por_aprobar", { puerta2: null, intento: pieza.intento + 1 }, [
          "cancelar_publicacion",
          "revisar_texto",
        ])
      }
      throw invalida()

    case "aprobar_guion":
      // The actor is checked first so an unauthorised attempt is flagged even on a stale piece.
      soloConi(evento.actor)
      if (estado !== "guion_por_aprobar") throw invalida()
      if (evento.hashVisto !== evento.hashActual) throw new ArtefactoCambio()
      // Approving spends nothing: the voice and the video are asked for afterwards. A stored voice is kept, because
      // the steps that use it check it against the approved text.
      return a("guion_aprobado", { puerta1: { hash: evento.hashVisto, en: instanteDelServidor(evento.en) } })

    case "pedir_voz":
      if (estado !== "guion_aprobado") throw invalida()
      // A new attempt: a new run, a new spend key and, for "Volver a grabar voz", a new take.
      return a("grabando_voz", { intento: pieza.intento + 1 })

    case "voz_lista":
      if (estado === "grabando_voz") return a("guion_aprobado", { audioId: evento.audioId })
      if (estado !== "en_render") throw invalida()
      return a("en_render", { audioId: evento.audioId })

    case "falla_voz":
      if (estado !== "grabando_voz") throw invalida()
      // A new attempt, so the next voice or render never meets the released reservation of this one.
      return a("guion_aprobado", { intento: pieza.intento + 1, explicacion: evento.explicacion })

    case "grabar_video":
      if (estado !== "guion_aprobado") throw invalida()
      return a("en_render")

    case "reabrir_guion":
      if (estado !== "guion_aprobado") throw invalida()
      return a("guion_por_aprobar", { puerta1: null })
```

4. After `piezaNueva`, add:

```ts
/** A task is working on the piece right now: the screens that show it refresh themselves until it settles. */
export function piezaTrabajando(pieza: { estado: Estado; explicacion: string | null }): boolean {
  switch (pieza.estado) {
    case "guion_en_proceso":
      // With a reason on it, the script is not being written: it waits for Coni.
      return pieza.explicacion === null
    case "grabando_voz":
    case "en_render":
    case "subtitulando":
      return true
    default:
      return false
  }
}
```

In `lib/dominio/puertas.ts`: `export type Paso = "producir" | "grabar" | "publicar" | "voz"` and, after `puedeGrabar`:

```ts
/** The voice task calls this right before spending ElevenLabs: the script it speaks is the one Coni approved. */
export function puedeGrabarVoz(pieza: Pieza, hashActual: string): Veredicto {
  if (pieza.estado !== "grabando_voz") return no("estado")
  if (!pieza.puerta1) return no("sin_aprobacion")
  if (pieza.puerta1.hash !== hashActual) return no("artefacto_cambio")
  return { ok: true }
}
```

- [ ] **Step 4: Run the unit tests and see them pass**

Run: `pnpm test:run tests/unit/estados.test.ts tests/unit/puertas.test.ts`
Expected: PASS. Existing unit tests that asserted `aprobar_guion -> en_render` now fail: change their expected state
to `guion_aprobado` (only the destination of `aprobar_guion`; leave every other expectation as is).

- [ ] **Step 5: Approving no longer starts a run** (failing integration test first)

In `tests/integration/acciones-piezas.test.ts`, `describe("aprobarGuion")`:

1. Replace the test "clears a voice pre-generated before gate 1 ..." with:

```ts
  it("keeps a stored voice: it only counts later if it speaks the approved text", async () => {
    const id = await paraAprobar()
    const previa = claveAudio(id, new Uint8Array([1, 2, 3]))
    await ajustarComoPostgres(id, { audio_id: previa })

    const resultado = await aprobarGuion(armar().deps, id, await versionDe(id), "look-a")

    expect(resultado).toEqual({ ok: true })
    expect(await fila(id)).toMatchObject({ estado: "guion_aprobado", audio_id: previa, puerta1_formula: 3 })
  })
```

   (A content-addressed voice like this one is neither a take of the approved text nor the approval's legacy key, so
   `vozDelGuion` ignores it in Task 5 and Task 13.)
2. In "approves a piece with no voice, stores formula 3 ...", expect `estado: "guion_aprobado"` and replace the three
   `disparos` assertions with `expect(disparos).toEqual([])`.
3. Replace "stays approved and tells Coni when the recording could not be started" with:

```ts
  it("starts no run, so a broken Trigger.dev does not matter to the approval", async () => {
    const id = await paraAprobar()
    const { deps } = armar(coni, { grabar: new Error("Trigger.dev no responde") })

    expect(await aprobarGuion(deps, id, await versionDe(id), "look-a")).toEqual({ ok: true })
    expect(await fila(id)).toMatchObject({ estado: "guion_aprobado" })
  })
```

4. Every other `estado: "en_render"` expectation inside `describe("aprobarGuion")` becomes `"guion_aprobado"`.

Run `pnpm test:db tests/integration/acciones-piezas.test.ts`: FAIL (still `en_render`). Then in
`lib/acciones/piezas.ts` replace the end of `aprobarGuion`:

```ts
    await guardarEvento(
      deps.db,
      fila,
      { tipo: "aprobar_guion", actor: "coni", hashVisto: hash, hashActual: hash, en: deps.ahora() },
      { avatar_id: avatar, puerta1_formula: 3 },
    )
    // Approving spends nothing: Coni records the voice and the video from the same screen afterwards.
    return {}
```

and its doc comment's last sentence to "Nothing is spent and nothing starts here." In
`app/(app)/guion/[id]/pantalla-guion.tsx` the approve call becomes
`aprobacion.ejecutar(() => aprobarGuionAccion(datos.id, version, avatarElegido))` (no callback: there is no warning
any more).

- [ ] **Step 6: The test flow passes through `guion_aprobado`**

In `tests/integration/flujo.ts`:

1. In `PASOS`, right after the `aprobar_guion` step, insert:
   `(c, id) => aplicar(c, id, comoConi, { tipo: "grabar_video" }),`
2. `PASOS_HASTA` becomes:

```ts
const PASOS_HASTA: Partial<Record<Estado, number>> = {
  idea: 0,
  guion_en_proceso: 1,
  guion_por_aprobar: 2,
  guion_aprobado: 3,
  en_render: 4,
  subtitulando: 5,
  video_por_aprobar: 6,
  programado: 7,
  publicado: 8,
  para_subir_a_mano: 8,
  publicado_a_mano: 8,
}
```

3. In `crearPiezaEn`, the hard-coded `6` (steps up to `programado`) becomes `7`.
4. Add `grabando_voz`: after the loop in `crearPiezaEn`, before `aMano`, handle it as one extra step:

```ts
  if (destino === "grabando_voz") await aplicar(c, id, comoConi, { tipo: "pedir_voz" })
```

and add `grabando_voz: 3` to `PASOS_HASTA` (walk to `guion_aprobado`, then the extra step).

Then run the whole integration suite: `supabase db reset && pnpm test:db`. Tests that counted `intento` or keys from
`crearPiezaEn` keep working (`grabar_video` does not bump `intento`). Fix any test that walked the flow by hand from
`guion_por_aprobar` straight to `render_entregado` by adding the `grabar_video` step the same way.

- [ ] **Step 7: The other screens know the new states**

Run `pnpm type`. Then:

- `app/(app)/video/[id]/page.tsx`: add `case "guion_aprobado":` and `case "grabando_voz":` to the cases that
  `redirect(\`/guion/${fila.id}\`)`.
- `lib/calendario/modelo.ts`, `ORDEN_EN_CAMINO`: add `grabando_voz: 1` and `guion_aprobado: 2`. Add a test in
  `tests/unit/calendario-modelo.test.ts` that a piece in `guion_aprobado` appears among the undated pieces after one in
  `en_render` (copy the arrange of the existing "en camino" ordering test, change the states). Run it red first.
- `lib/datos/pantallas.ts`, `leerContextoDeFechas`: the queue counts
  `["guion_aprobado", "grabando_voz", "en_render", "subtitulando", "video_por_aprobar"]`.
- `app/(app)/guion/[id]/page.tsx`: until Task 13, render `guion_aprobado` and `grabando_voz` like `en_render` (add the
  two cases to that branch) so the page compiles and shows something.

Run: `pnpm type && pnpm test:run && pnpm test:db`
Expected: all green except the known E2E window.

- [ ] **Step 8: Commit**

```bash
git add lib/dominio/estados.ts lib/dominio/puertas.ts lib/acciones/piezas.ts "app/(app)/guion/[id]/pantalla-guion.tsx" "app/(app)/guion/[id]/page.tsx" "app/(app)/video/[id]/page.tsx" lib/calendario/modelo.ts lib/datos/pantallas.ts tests/
git commit -m "feat(estados): gate 1 lands in guion_aprobado and records nothing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ElevenLabs without characters is a message for Coni

**Files:**
- Modify: `lib/proveedores/elevenlabs.ts`
- Test: `tests/unit/elevenlabs.test.ts`

- [ ] **Step 1: Write the failing test** (append; the file already starts an MSW server through `tests/setup-msw.ts`;
  reuse its constants for the base URL and config, or declare them as below)

```ts
import { HttpResponse, http } from "msw"
import { Falla } from "@/lib/dominio/falla"
import { generarVoz } from "@/lib/proveedores/elevenlabs"
import { servidor } from "../msw"

describe("generarVoz sin caracteres", () => {
  it("tells Coni to top up when ElevenLabs answers quota_exceeded", async () => {
    servidor.use(
      http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () =>
        HttpResponse.json(
          { detail: { status: "quota_exceeded", message: "This request exceeds your quota." } },
          { status: 401 },
        ),
      ),
    )
    const promesa = generarVoz({
      clave: "sk_prueba",
      config: { voice_id: "voz", model_id: "eleven_multilingual_v2", output_format: "mp3_44100_128" },
      texto: "Hola.",
      base: "https://api.elevenlabs.io",
    })
    await expect(promesa).rejects.toBeInstanceOf(Falla)
    await expect(promesa).rejects.toThrow(
      "ElevenLabs no tiene caracteres suficientes para esta voz. Recarga en elevenlabs.io y vuelve a intentarlo.",
    )
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/elevenlabs.test.ts`
Expected: FAIL, the error is a `FallaDeConfiguracion`.

- [ ] **Step 3: Implement**

In `lib/proveedores/elevenlabs.ts`:

```ts
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"

/** Retrying does not help: Coni has to top up first, so the text says so. */
export const TEXTO_SIN_CARACTERES =
  "ElevenLabs no tiene caracteres suficientes para esta voz. Recarga en elevenlabs.io y vuelve a intentarlo."

function esFaltaDeCaracteres(cuerpo: string): boolean {
  return /quota_exceeded/i.test(cuerpo)
}
```

and in `generarVoz`'s `!respuesta.ok` branch, read the body once and decide:

```ts
      if (!respuesta.ok) {
        const cuerpo = sinLlave(await respuesta.text(), clave)
        if (esFaltaDeCaracteres(cuerpo)) throw new Falla(TEXTO_SIN_CARACTERES)
        const mensaje = `ElevenLabs respondió HTTP ${respuesta.status}: ${mensajeErrorElevenlabs(cuerpo)}`
        throw esErrorDeConfiguracion(respuesta.status) ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
      }
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test:run tests/unit/elevenlabs.test.ts`
Expected: PASS, and the older `generarVoz` tests stay green.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/elevenlabs.ts tests/unit/elevenlabs.test.ts
git commit -m "feat(elevenlabs): explain an exhausted quota to Coni

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: One voice step for both tasks, and the render binds the voice to the approved script

**Files:**
- Create: `lib/produccion/aprobacion.ts` (move `formulaGuardada` and `artefactoAprobado` out of `grabar.ts`)
- Create: `lib/produccion/voz.ts`
- Modify: `lib/produccion/grabar.ts`
- Test: `tests/integration/grabar.test.ts`

- [ ] **Step 1: Update the helpers of `grabar.test.ts` and write the failing tests**

At the top of `tests/integration/grabar.test.ts`:

```ts
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { leerConfigProduccion } from "@/lib/proveedores/config"

const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs
const HUELLA = huellaDelGuion(GUION, ELEVENLABS)
```

Replace the helpers `claveDeVoz` and `claveDeGastoVoz`:

```ts
/** The take the run makes for this piece: the approved script, Coni's voice and the attempt it is on. */
async function claveDeVoz(id: string): Promise<string> {
  return claveDeToma(id, HUELLA, (await pieza(id)).intento)
}

function claveDeGastoVoz(id: string, intento: number): string {
  return claveIdempotencia({ piezaId: id, paso: "voz", hash: HUELLA, intento })
}
```

(`hashTexto` may become unused in the file; remove the import if so.) Then add:

```ts
describe("grabarPieza con la voz por texto", () => {
  it("records with the legacy voice of the current approval, without ElevenLabs", async () => {
    const id = await crearPiezaSinVoz()
    const { puerta1_hash: hash } = await pieza(id)
    if (hash === null) throw new Error("sin puerta 1")
    const legada = claveVozAprobada(id, hash)
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: legada })
    })
    const sim = simular()
    const d = doble()
    await d.almacen.subir(legada, VOZ, "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(0)
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
  })

  it("reuses an earlier take of the same text instead of paying again", async () => {
    const id = await crearPiezaSinVoz()
    const anterior = claveDeToma(id, HUELLA, 7)
    const sim = simular()
    const d = doble()
    await d.almacen.subir(anterior, VOZ, "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(0)
    expect(await pieza(id)).toMatchObject({ audio_id: anterior })
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
  })

  it("never sends HeyGen a voice of another text: it speaks the approved script instead", async () => {
    const id = await crearPiezaSinVoz()
    const ajena = claveDeToma(id, huellaDelGuion("Otro texto que Coni no aprobó.", ELEVENLABS), 0)
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: ajena })
    })
    const sim = simular()
    const d = doble()
    await d.almacen.subir(ajena, new Uint8Array([7, 7, 7]), "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toEqual([{ voz: ELEVENLABS.voice_id, llave: CLAVE_ELEVENLABS, texto: GUION }])
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
  })

  it("makes a new voice when the voice settings changed since the stored one", async () => {
    const id = await crearPiezaEnRender()
    const otra = { ...coniConfig, elevenlabs: { ...coniConfig.elevenlabs, model_id: "eleven_v3" } }
    await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(otra)])
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(1)
  })

  it("releases the voice reservation when ElevenLabs has no characters, and tells Coni", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular({
      voz: () => HttpResponse.json({ detail: { status: "quota_exceeded", message: "quota" } }, { status: 401 }),
    })
    const d = doble()

    expect((await grabarPieza(d.deps, id)).resultado).toBe("falla_produccion")
    expect(sim.creaciones).toHaveLength(0)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([["elevenlabs", "liberado"]])
    expect((await pieza(id)).explicacion).toBe(
      "ElevenLabs no tiene caracteres suficientes para esta voz. Recarga en elevenlabs.io y vuelve a intentarlo.",
    )
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:db tests/integration/grabar.test.ts`
Expected: FAIL (`@/lib/produccion/voz` missing; the existing voice tests expect the new keys).

- [ ] **Step 3: Move the approval rebuild**

Create `lib/produccion/aprobacion.ts` with `formulaGuardada` and `artefactoAprobado` cut from `grabar.ts`, unchanged,
now exported (keep their doc comments). Imports it needs: `FilaDePieza` from `@/lib/datos/repositorio`, `leerRespaldo`
from `@/lib/datos/respaldo`, `FallaDeConfiguracion` from `@/lib/dominio/falla`, `ArtefactoPuerta1` and
`formulaDePuerta1` from `@/lib/dominio/puertas`, `huellaDeRespaldo` from `@/lib/dominio/respaldo`. `grabar.ts` imports
both from there.

- [ ] **Step 4: Write the shared voice step**

```ts
// lib/produccion/voz.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { confirmarGasto, type FilaDePieza, leerSecreto, liberarGasto, reservarGasto } from "@/lib/datos/repositorio"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia } from "@/lib/dominio/puertas"
import { claveDeToma, huellaDeVoz, prefijoDeTomas, ultimaToma, type VozConfigurada } from "@/lib/dominio/voz"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { ConfigCompleta, ConfigElevenlabs } from "@/lib/proveedores/config"
import { generarVoz } from "@/lib/proveedores/elevenlabs"
import type { Database } from "@/lib/supabase/database.types"

export function vozDe(config: ConfigElevenlabs): VozConfigurada {
  return {
    voiceId: config.voice_id,
    modelId: config.model_id,
    outputFormat: config.output_format,
    ajustes: config.voice_settings ?? null,
  }
}

/** The fingerprint of this script spoken with the configured voice. */
export function huellaDelGuion(guion: string, config: ConfigElevenlabs): string {
  return huellaDeVoz({ guion, voz: vozDe(config) })
}

export function claveDeGastoDeVoz(piezaId: string, huella: string, intento: number): string {
  return claveIdempotencia({ piezaId, paso: "voz", hash: huella, intento })
}

export async function leerLlaveDeVoz(db: SupabaseClient<Database>, config: ConfigCompleta): Promise<string> {
  if (!config.elevenlabs.voice_id) {
    throw new FallaDeConfiguracion("Falta elevenlabs.voice_id en la configuración de producción.")
  }
  const llave = await leerSecreto(db, "elevenlabs")
  if (!llave) throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de ElevenLabs en Ajustes.")
  return llave
}

export interface DepsVoz {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  almacen: Almacen
  ahora: () => string
  base?: { elevenlabs?: string }
}

export type VozAsegurada = { tipo: "lista"; audioId: string } | { tipo: "tope" }

/**
 * The voice of `guion` for this piece, paid at most once per text and voice. In order: the take of this attempt if a
 * dead run already stored it; unless `nueva`, the newest earlier take of the same text; only then a reservation, one
 * ElevenLabs call, the upload and the confirmation. The caller writes the audio id into the piece.
 */
export async function asegurarVoz(
  deps: DepsVoz,
  entrada: { fila: FilaDePieza; guion: string; config: ConfigElevenlabs; llave: () => Promise<string>; nueva: boolean },
): Promise<VozAsegurada> {
  const { fila, guion, config } = entrada
  const huella = huellaDelGuion(guion, config)
  const exacta = claveDeToma(fila.id, huella, fila.intento)
  if (await deps.almacen.existe(exacta)) return { tipo: "lista", audioId: exacta }
  if (!entrada.nueva) {
    const tomas = await deps.almacen.listar(prefijoDeTomas(fila.id, huella))
    const previa = ultimaToma(
      tomas.map((toma) => toma.clave),
      fila.id,
      huella,
    )
    if (previa !== null) return { tipo: "lista", audioId: previa }
  }

  const clave = claveDeGastoDeVoz(fila.id, huella, fila.intento)
  const estimado = estimarCostoVoz(guion)
  const reserva = await reservarGasto(deps.db, {
    piezaId: fila.id,
    proveedor: "elevenlabs",
    paso: "voz",
    estimadoUsd: estimado,
    clave,
    ahora: deps.ahora(),
  })
  if (reserva.tope) return { tipo: "tope" }
  if (reserva.gasto.estado !== "reservado") {
    // Confirmed only after the upload, and each attempt has its own key: a closed reservation without the take is a bug.
    throw new FallaDeConfiguracion(
      `La reserva de la voz de la pieza ${fila.id} está ${reserva.gasto.estado}, pero la toma no está guardada.`,
    )
  }
  let audio: Uint8Array
  try {
    audio = await generarVoz({ clave: await entrada.llave(), config, texto: guion, base: deps.base?.elevenlabs })
  } catch (error) {
    // A Falla (no characters) charged nothing and will not change on a retry: the money goes back to the cap now.
    if (error instanceof Falla) await liberarGasto(deps.db, clave)
    throw error
  }
  await deps.almacen.subir(exacta, audio, "audio/mpeg")
  await confirmarGasto(deps.db, clave, estimado)
  return { tipo: "lista", audioId: exacta }
}
```

- [ ] **Step 5: Use it in `grabar.ts`**

1. `Contexto`: remove `llaveElevenlabs`. `cargarContexto` no longer loads it (delete the `llaveElevenlabs` line and
   field). Delete `leerLlaveElevenlabs`, `tieneLaVozAprobada` and the old `ponerLaVoz`.
2. Add, next to the other helpers:

```ts
/**
 * The stored voice the render may use, or null. Formula 1 hashed the voice itself. Formulas 2 and 3 hashed the script:
 * the voice must be a take of that exact script with the configured voice, or the legacy voice made under the key of
 * this very approval (it was generated for the approved script). Anything else is not what Coni approved.
 */
function vozAprobada(contexto: Contexto): string | null {
  const { fila, guion, config, hashAprobado } = contexto
  if (formulaDePuerta1(formulaGuardada(fila)) === 1) return fila.audio_id
  return vozDelGuion({
    audioId: fila.audio_id,
    piezaId: fila.id,
    huella: huellaDelGuion(guion, config.elevenlabs),
    legadas: [claveVozAprobada(fila.id, hashAprobado)],
  })
}

/** The voice of the approved script, reused when it exists, written into the piece. False when the cap stops it. */
async function ponerLaVoz(contexto: Contexto): Promise<boolean> {
  const { deps, config } = contexto
  const voz = await asegurarVoz(deps, {
    fila: contexto.fila,
    guion: contexto.guion,
    config: config.elevenlabs,
    llave: () => leerLlaveDeVoz(deps.db, config),
    nueva: false,
  })
  if (voz.tipo === "tope") {
    await explicar(deps, contexto.fila, TEXTO_TOPE)
    await avisarTope(deps, contexto.fila)
    return false
  }
  await escribir(contexto, { tipo: "voz_lista", audioId: voz.audioId })
  return true
}
```

3. In `avanzar`, the first condition becomes
   `if (enRender && vozAprobada(contexto) === null && !(await ponerLaVoz(contexto))) return { resultado: "tope" }`.
4. In `crearElVideo`, replace the `if (!fila.audio_id)` block and the `bajar` line:

```ts
  // The binding of the voice to gate 1, right before the call that charges.
  const audioId = vozAprobada(contexto)
  if (audioId === null) {
    throw new FallaDeConfiguracion(`La voz de la pieza ${fila.id} no corresponde al guion aprobado.`)
  }
  const voz = await deps.almacen.bajar(audioId)
```

5. Add the credit estimate next to `estimarCostoVideo` (used from Task 9 on, tested there):

```ts
/** The same render in credits, for an API wallet that counts credits instead of dollars. */
export function estimarCreditosVideo(guion: string, motor: string | null): number {
  const creditosPorMinuto = motor === "avatar_v" ? CREDITOS_POR_MINUTO_AVATAR_V : CREDITOS_POR_MINUTO_AVATAR_IV
  return Math.ceil((estimarSegundos(guion) / 60) * creditosPorMinuto)
}
```

6. `DepsGrabacion` already has `db`, `almacen`, `ahora`, `base`; it satisfies `DepsVoz` structurally.
7. Update the imports (`vozDelGuion` from `@/lib/dominio/voz`; `asegurarVoz`, `huellaDelGuion`, `leerLlaveDeVoz` from
   `@/lib/produccion/voz`; drop `generarVoz`, `reservarGasto`'s voice use stays in `voz.ts`; drop `hashTexto` if
   unused).

- [ ] **Step 6: Run and see green**

Run: `pnpm type && pnpm test:db tests/integration/grabar.test.ts`
Expected: PASS. Existing tests now assert the new keys through the updated helpers; the test "ignores a voice that was
not made for the approved script" keeps passing (its key is neither a take nor the legacy key).

- [ ] **Step 7: Commit**

```bash
git add lib/produccion/aprobacion.ts lib/produccion/voz.ts lib/produccion/grabar.ts tests/integration/grabar.test.ts
git commit -m "feat(grabar): reuse the voice of the same text and bind it to gate 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The `grabar-voz` task

**Files:**
- Create: `lib/produccion/grabar-voz.ts`
- Create: `trigger/grabar-voz.ts`
- Modify: `lib/produccion/deps-reales.ts` (`depsVoz`)
- Modify: `lib/produccion/fallas.ts` (`dejarConstancia`)
- Test: `tests/integration/grabar-voz.test.ts`, `tests/unit/grabar-voz-task.test.ts`, `tests/integration/fallas.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/grabar-voz.test.ts
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { claveDeToma } from "@/lib/dominio/voz"
import { TEXTO_TOPE } from "@/lib/produccion/comun"
import { type DepsGrabarVoz, grabarVoz } from "@/lib/produccion/grabar-voz"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { pool } from "./db"
import { GUION } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { ajustarPieza, leerFila, sembrarPieza } from "./siembra"

afterAll(() => pool.end())

const VOZ = new Uint8Array([73, 68, 51, 4, 0, 1, 2])
const HUELLA = huellaDelGuion(GUION, leerConfigProduccion(coniConfig).elevenlabs)
const creadas: string[] = []
let llamadas = 0

function deps(): DepsGrabarVoz & { almacen: ReturnType<typeof almacenEnMemoria> } {
  return {
    db: clienteDeServicio(),
    almacen: almacenEnMemoria(),
    avisos: notificadorEnMemoria(),
    ahora: () => new Date().toISOString(),
  }
}

// sembrarPieza walks the real flow inside a committed transaction, so `asumir` (SET LOCAL) takes effect.
async function enEstado(estado: "grabando_voz" | "guion_aprobado"): Promise<string> {
  const id = await sembrarPieza(estado)
  creadas.push(id)
  return id
}
const grabando = () => enEstado("grabando_voz")

beforeEach(async () => {
  llamadas = 0
  await pool.query("update public.ajustes set produccion = $1::jsonb, tope_mensual_usd = 40", [JSON.stringify(coniConfig)])
  await pool.query("delete from vault.secrets where name = 'elevenlabs'")
  await pool.query("select vault.create_secret('sk_eleven_de_prueba', 'elevenlabs')")
  servidor.use(
    http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () => {
      llamadas += 1
      return new HttpResponse(VOZ, { headers: { "Content-Type": "audio/mpeg" } })
    }),
  )
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'elevenlabs'")
  await pool.query("delete from public.gastos where pieza_id = any($1::uuid[])", [creadas])
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [creadas])
  creadas.length = 0
  await pool.query("update public.ajustes set produccion = '{}'::jsonb, tope_mensual_usd = 40")
})

describe("grabarVoz", () => {
  it("speaks the approved script once, stores the take and returns the piece to guion_aprobado", async () => {
    const id = await grabando()
    const d = deps()
    const { intento } = await leerFila(id)

    const resultado = await grabarVoz(d, { piezaId: id, nueva: false })

    const clave = claveDeToma(id, HUELLA, intento)
    expect(resultado).toEqual({ resultado: "lista", audioId: clave })
    expect(llamadas).toBe(1)
    expect(d.almacen.obtener(clave)?.datos).toEqual(VOZ)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_aprobado", audio_id: clave, explicacion: null })
    const { rows } = await pool.query("select proveedor, paso, estado from public.gastos where pieza_id = $1", [id])
    expect(rows).toEqual([{ proveedor: "elevenlabs", paso: "voz", estado: "confirmado" }])
  })

  it("reuses an earlier take of the same text and spends nothing", async () => {
    const id = await grabando()
    const d = deps()
    const previa = claveDeToma(id, HUELLA, 0)
    await d.almacen.subir(previa, VOZ, "audio/mpeg")

    expect(await grabarVoz(d, { piezaId: id, nueva: false })).toEqual({ resultado: "lista", audioId: previa })
    expect(llamadas).toBe(0)
  })

  it("makes a new take when Coni asks to record again, even with an earlier one stored", async () => {
    const id = await grabando()
    const d = deps()
    await d.almacen.subir(claveDeToma(id, HUELLA, 0), VOZ, "audio/mpeg")

    const resultado = await grabarVoz(d, { piezaId: id, nueva: true })

    expect(llamadas).toBe(1)
    expect(resultado).toEqual({ resultado: "lista", audioId: claveDeToma(id, HUELLA, (await leerFila(id)).intento) })
  })

  it("does nothing for a piece that is not recording its voice", async () => {
    const id = await enEstado("guion_aprobado")
    expect(await grabarVoz(deps(), { piezaId: id, nueva: false })).toEqual({ resultado: "nada_que_hacer" })
    expect(llamadas).toBe(0)
  })

  it("spends nothing and explains when the script changed after the approval", async () => {
    const id = await grabando()
    await ajustarPieza(id, { guion: "Un guion que nadie aprobó." })

    expect(await grabarVoz(deps(), { piezaId: id, nueva: false })).toEqual({ resultado: "sin_aprobacion" })
    expect(llamadas).toBe(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_aprobado" })
    expect((await leerFila(id)).explicacion).toMatch(/cambió después de aprobarlo/)
  })

  it("explains the cap and spends nothing when the voice would pass it", async () => {
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const id = await grabando()
    const d = deps()

    expect(await grabarVoz(d, { piezaId: id, nueva: false })).toEqual({ resultado: "tope" })
    expect(llamadas).toBe(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_aprobado", explicacion: TEXTO_TOPE })
  })

  it("returns the piece with Coni's text when ElevenLabs has no characters", async () => {
    servidor.use(
      http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () =>
        HttpResponse.json({ detail: { status: "quota_exceeded", message: "quota" } }, { status: 401 }),
      ),
    )
    const id = await grabando()
    const antes = await leerFila(id)

    expect(await grabarVoz(deps(), { piezaId: id, nueva: false })).toEqual({ resultado: "falla" })
    const despues = await leerFila(id)
    expect(despues).toMatchObject({ estado: "guion_aprobado", intento: antes.intento + 1 })
    expect(despues.explicacion).toMatch(/^ElevenLabs no tiene caracteres suficientes/)
  })

  it("lets Trigger.dev retry a server error without changing the piece", async () => {
    servidor.use(http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () => new HttpResponse("x", { status: 503 })))
    const id = await grabando()
    await expect(grabarVoz(deps(), { piezaId: id, nueva: false })).rejects.toThrow("503")
    expect((await leerFila(id)).estado).toBe("grabando_voz")
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:db tests/integration/grabar-voz.test.ts`
Expected: FAIL, module `@/lib/produccion/grabar-voz` missing.

- [ ] **Step 3: Implement the flow**

```ts
// lib/produccion/grabar-voz.ts
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, type FilaDePieza, leerPieza, leerProduccion } from "@/lib/datos/repositorio"
import { ArtefactoCambio, type Evento, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { hashPuerta1, puedeGrabarVoz } from "@/lib/dominio/puertas"
import { artefactoAprobado } from "@/lib/produccion/aprobacion"
import { avisarTope, piezaCambio, TEXTO_TOPE } from "@/lib/produccion/comun"
import { asegurarVoz, type DepsVoz, leerLlaveDeVoz } from "@/lib/produccion/voz"
import type { Notificador } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"

export interface DepsGrabarVoz extends DepsVoz {
  avisos: Notificador
}

export type ResultadoVoz =
  | { resultado: "lista"; audioId: string }
  | { resultado: "nada_que_hacer" }
  | { resultado: "sin_aprobacion" }
  | { resultado: "tope" }
  | { resultado: "falla" }

const TEXTO_GUION_CAMBIO = "El guion cambió después de aprobarlo. Vuelve a aprobarlo antes de grabar la voz."

async function escribir(deps: DepsGrabarVoz, fila: FilaDePieza, evento: Evento): Promise<void> {
  const { pieza } = transicionar(piezaDesdeFila(fila), evento)
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))
  // A plain Error: Trigger.dev retries, and the retry reads the piece again.
  if (!guardada) throw piezaCambio()
}

/**
 * Speaks the approved script with Coni's voice and hands the piece back to her in `guion_aprobado`. It spends only
 * after checking gate 1 against the row, reuses a take of the same text unless she asked for a new one, and never
 * approves anything. Safe to run again: the take of this attempt is found in the store.
 */
export async function grabarVoz(deps: DepsGrabarVoz, entrada: { piezaId: string; nueva: boolean }): Promise<ResultadoVoz> {
  const fila = await leerPieza(deps.db, entrada.piezaId)
  if (!fila) throw new FallaDeConfiguracion(`No existe la pieza ${entrada.piezaId}.`)
  if (fila.estado !== "grabando_voz") return { resultado: "nada_que_hacer" }

  const artefacto = fila.guion === null ? null : artefactoAprobado(fila, fila.guion)
  if (fila.guion === null || artefacto === null || !puedeGrabarVoz(piezaDesdeFila(fila), hashPuerta1(artefacto)).ok) {
    await escribir(deps, fila, { tipo: "falla_voz", explicacion: TEXTO_GUION_CAMBIO })
    return { resultado: "sin_aprobacion" }
  }

  const config = leerConfigProduccion(await leerProduccion(deps.db))
  try {
    const voz = await asegurarVoz(deps, {
      fila,
      guion: fila.guion,
      config: config.elevenlabs,
      llave: () => leerLlaveDeVoz(deps.db, config),
      nueva: entrada.nueva,
    })
    if (voz.tipo === "tope") {
      await escribir(deps, fila, { tipo: "falla_voz", explicacion: TEXTO_TOPE })
      await avisarTope(deps, fila)
      return { resultado: "tope" }
    }
    await escribir(deps, fila, { tipo: "voz_lista", audioId: voz.audioId })
    return { resultado: "lista", audioId: voz.audioId }
  } catch (error) {
    // The piece moving under the run (discarded, or handed back by maintenance) is not a failure of the voice.
    if (error instanceof TransicionInvalida || error instanceof ArtefactoCambio) throw error
    if (error instanceof Falla) {
      await escribir(deps, fila, { tipo: "falla_voz", explicacion: error.message })
      return { resultado: "falla" }
    }
    throw error
  }
}
```

(`piezaCambio`, `avisarTope` and `TEXTO_TOPE` already live in `lib/produccion/comun.ts`.)

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test:db tests/integration/grabar-voz.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: The task, its deps and its failure** (failing tests first)

```ts
// tests/unit/grabar-voz-task.test.ts
import { describe, expect, it } from "vitest"
import { CONFIGURACION_VOZ } from "@/trigger/grabar-voz"

describe("grabar-voz", () => {
  it("is a small machine with its own queue, apart from the renders", () => {
    expect(CONFIGURACION_VOZ).toEqual({
      id: "grabar-voz",
      machine: "small-1x",
      maxDuration: 600,
      queue: { concurrencyLimit: 2 },
    })
  })
})
```

Look at how `tests/unit/grabar-pieza-task.test.ts` imports the task module (it may mock `@trigger.dev/sdk`); copy its
setup lines so importing `@/trigger/grabar-voz` works the same way.

In `tests/integration/fallas.test.ts`, widen `piezaEn`'s parameter to also accept `"grabando_voz"` and add to
`describe("avisarFalla")`:

```ts
  it("returns a piece left in grabando_voz to guion_aprobado with a generic text when grabar-voz gives up", async () => {
    const id = await piezaEn("grabando_voz")
    const { deps } = doble()

    await avisarFalla(deps, { tarea: "grabar-voz", corrida: "run_9", piezaId: id, error: new Error("boom") })

    expect(await pieza(id)).toMatchObject({
      estado: "guion_aprobado",
      explicacion: "Algo falló al grabar la voz. WAV ya está revisando. Puedes volver a intentarlo.",
      estado_antes_del_error: null,
    })
  })

  it("shows Coni the message of a Falla from grabar-voz", async () => {
    const id = await piezaEn("grabando_voz")
    const { deps } = doble()

    await avisarFalla(deps, { tarea: "grabar-voz", corrida: "run_10", piezaId: id, error: new Falla("Sin caracteres.") })

    expect((await pieza(id)).explicacion).toBe("Sin caracteres.")
  })
```

Run both: FAIL. Then:

```ts
// trigger/grabar-voz.ts
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { depsFalla, depsVoz } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { grabarVoz } from "@/lib/produccion/grabar-voz"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/** One ElevenLabs call and an upload: no ffmpeg, no wait token, and never queued behind an hour-long render. */
export const CONFIGURACION_VOZ = {
  id: "grabar-voz",
  machine: "small-1x",
  maxDuration: 600,
  queue: { concurrencyLimit: 2 },
} as const

export const grabarVozTask = schemaTask({
  ...CONFIGURACION_VOZ,
  schema: z.object({ piezaId: z.string().uuid(), nueva: z.boolean() }),
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the piece goes back to Coni with a reason, and WAV is told.
  onFailure: alFallarDeTarea("grabar-voz", depsFalla),
  run: async ({ piezaId, nueva }) => grabarVoz(depsVoz(), { piezaId, nueva }),
})
```

In `lib/produccion/deps-reales.ts`:

```ts
/** The dependencies of a `grabar-voz` run: the database, the store and the notices. Nothing of the video container. */
export function depsVoz(): DepsGrabarVoz {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  return {
    db: createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } }),
    avisos: avisosReales(),
    almacen: almacenReal(),
    ahora: () => new Date().toISOString(),
  }
}
```

In `lib/produccion/fallas.ts`:

```ts
const GENERICO_VOZ = "Algo falló al grabar la voz. WAV ya está revisando. Puedes volver a intentarlo."
```

and in `dejarConstancia`:

```ts
  const guion = entrada.tarea === "producir-pieza" && fila.estado === "guion_en_proceso"
  const video = entrada.tarea === "grabar-pieza" && (fila.estado === "en_render" || fila.estado === "subtitulando")
  const voz = entrada.tarea === "grabar-voz" && fila.estado === "grabando_voz"
  if (!guion && !video && !voz) return null
  const explicacion = paraConi(entrada.error, guion ? GENERICO_GUION : voz ? GENERICO_VOZ : GENERICO_VIDEO)
  const evento: Evento = voz ? { tipo: "falla_voz", explicacion } : { tipo: "falla_produccion", explicacion }
  const cambios = guion
    ? { version: fila.version + 1, explicacion }
    : cambiosDesdePieza(transicionar(piezaDesdeFila(fila), evento).pieza)
```

(import `type Evento` from `@/lib/dominio/estados`; update the doc comment: "the voice step goes back to
`guion_aprobado`").

- [ ] **Step 6: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/grabar-voz-task.test.ts && pnpm test:db tests/integration/fallas.test.ts tests/integration/grabar-voz.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/produccion/grabar-voz.ts trigger/grabar-voz.ts lib/produccion/deps-reales.ts lib/produccion/fallas.ts tests/
git commit -m "feat(voz): grabar-voz task records the approved script alone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Coni's actions: record the voice, record the video, reopen, edit an approved script

**Files:**
- Modify: `lib/acciones/disparos.ts`, `lib/acciones/disparos-entorno.ts`, `lib/acciones/servidor.ts`
- Modify: `lib/acciones/piezas.ts`, `lib/acciones/guion.ts`, `app/(app)/piezas/acciones.ts`
- Modify: `tests/e2e/ayudas.ts` (the `Disparo` schema accepts `"voz"`)
- Test: `tests/unit/disparos.test.ts`, `tests/integration/acciones-piezas.test.ts`, `tests/integration/acciones-guion.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/disparos.test.ts`:

```ts
import { claveVoz } from "@/lib/acciones/disparos"

describe("claveVoz", () => {
  const fila = { id: "p", version: 3, intento: 2, puerta1_hash: "e".repeat(64) }
  it("is one key per approval and attempt", () => {
    expect(claveVoz(fila)).toBe(`p:voz:${"e".repeat(16)}:2`)
    expect(claveVoz({ ...fila, intento: 3 })).not.toBe(claveVoz(fila))
  })
  it("refuses a piece without gate 1", () => {
    expect(() => claveVoz({ ...fila, puerta1_hash: null })).toThrow()
  })
})
```

`tests/integration/acciones-piezas.test.ts`: extend the file's fake. `Disparo` becomes
`{ tarea: "producir" | "grabar" | "voz"; piezaId: string; clave: string; nueva?: boolean }`, `armar`'s `fallos` gains
`voz?: Error`, and `disparar` gains:

```ts
      async voz(piezaId, clave, nueva) {
        if (fallos.voz) throw fallos.voz
        disparos.push({ tarea: "voz", piezaId, clave, nueva })
      },
```

Then add (imports: `pedirVoz`, `pedirVideo`, `reabrirGuion` from `@/lib/acciones/piezas`; `claveGrabar`, `claveVoz`
from `@/lib/acciones/disparos`):

```ts
describe("pedirVoz, pedirVideo y reabrirGuion", () => {
  it("moves the approved piece to grabando_voz and starts grabar-voz once with the attempt's key", async () => {
    const id = await pieza("guion_aprobado")
    const { deps, disparos } = armar()
    expect(await pedirVoz(deps, id, await versionDe(id), false)).toEqual({ ok: true })
    const guardada = await fila(id)
    expect(guardada.estado).toBe("grabando_voz")
    expect(disparos).toEqual([{ tarea: "voz", piezaId: id, clave: claveVoz(guardada), nueva: false }])
  })

  it("hands the piece back with a reason when grabar-voz cannot start", async () => {
    const id = await pieza("guion_aprobado")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { deps } = armar(coni, { voz: new Error("Trigger.dev no responde") })
    const texto = "No pude empezar a grabar la voz. Inténtalo de nuevo en unos minutos."

    expect(await pedirVoz(deps, id, await versionDe(id), true)).toEqual({ ok: false, error: texto })
    expect(await fila(id)).toMatchObject({ estado: "guion_aprobado", explicacion: texto })
  })

  it("sends the approved piece to render and starts grabar-pieza with the approval's key", async () => {
    const id = await pieza("guion_aprobado")
    const { deps, disparos } = armar()
    expect(await pedirVideo(deps, id, await versionDe(id))).toEqual({ ok: true })
    const guardada = await fila(id)
    expect(guardada.estado).toBe("en_render")
    expect(disparos).toEqual([{ tarea: "grabar", piezaId: id, clave: claveGrabar(guardada) }])
  })

  it("reopens the script, dropping gate 1 and starting nothing", async () => {
    const id = await pieza("guion_aprobado")
    const { deps, disparos } = armar()
    expect(await reabrirGuion(deps, id, await versionDe(id))).toEqual({ ok: true })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("refuses a stale screen and starts nothing", async () => {
    const id = await pieza("guion_aprobado")
    const { deps, disparos } = armar()
    expect((await pedirVideo(deps, id, (await versionDe(id)) - 1)).ok).toBe(false)
    expect(disparos).toEqual([])
  })
})
```

(`pieza`, `fila`, `versionDe`, `armar`, `coni` are the file's existing helpers. If `aResultado` returns extra keys on
success, compare with `toMatchObject({ ok: true })` as the file's other tests do.)

`tests/integration/acciones-guion.test.ts`: copy the existing "saves Coni's edit" test, start from
`sembrarPieza("guion_aprobado")`, and assert the result is ok and the row is `guion_por_aprobar` with
`puerta1_hash: null`.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/disparos.test.ts && pnpm test:db tests/integration/acciones-piezas.test.ts tests/integration/acciones-guion.test.ts`
Expected: FAIL (`claveVoz`, `pedirVoz`, ... missing; the edit says "Este guion ya no se puede editar.").

- [ ] **Step 3: Implement**

`lib/acciones/disparos.ts`:

```ts
export interface Disparos {
  producir(piezaId: string, clave: string): Promise<void>
  grabar(piezaId: string, clave: string): Promise<void>
  /** `nueva`: Coni asked to record again, so an earlier take of the same text is not reused. */
  voz(piezaId: string, clave: string, nueva: boolean): Promise<void>
}

/** One voice request: the approval and the attempt, which every "Grabar voz" bumps. */
export function claveVoz(fila: FilaParaClave): string {
  if (fila.puerta1_hash === null) {
    throw new Error(`La pieza ${fila.id} pide su voz sin guion aprobado.`)
  }
  return claveIdempotencia({ piezaId: fila.id, paso: "voz", hash: fila.puerta1_hash, intento: fila.intento })
}
```

`lib/acciones/disparos-entorno.ts`: in `disparosReales` add

```ts
    async voz(piezaId, clave, nueva) {
      await tasks.trigger<typeof grabarVozTask>(
        "grabar-voz",
        { piezaId, nueva },
        { idempotencyKey: await claveGlobal(clave) },
      )
    },
```

(import `type { grabarVozTask } from "@/trigger/grabar-voz"`), and in `disparosDePrueba`:

```ts
function disparosDePrueba(archivo: string): Disparos {
  const anotar = (linea: Record<string, unknown>) => appendFileSync(archivo, `${JSON.stringify(linea)}\n`)
  return {
    producir: async (piezaId, clave) => anotar({ tarea: "producir", piezaId, clave }),
    grabar: async (piezaId, clave) => anotar({ tarea: "grabar", piezaId, clave }),
    voz: async (piezaId, clave, nueva) => anotar({ tarea: "voz", piezaId, clave, nueva }),
  }
}
```

`lib/acciones/servidor.ts`, `comoConi`: add `voz: (piezaId, clave, nueva) => disparosDeEntorno().voz(piezaId, clave, nueva),`.
`tests/e2e/ayudas.ts`: the `Disparo` schema's `tarea` enum gains `"voz"` and an optional `nueva: z.boolean()`. Every
other `Disparos` fake that `pnpm type` flags gets a `voz` method that records or rejects like its siblings.

`lib/acciones/piezas.ts` (import `claveVoz`):

```ts
const TEXTO_SIN_ARRANQUE_DE_VOZ = "No pude empezar a grabar la voz. Inténtalo de nuevo en unos minutos."

/** Her voice on the approved script. Nothing else would start this run, so a failure to start hands the piece back. */
export function pedirVoz(deps: DepsAcciones, piezaId: string, versionVista: number, nueva: boolean) {
  return aResultado("pedirVoz", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "pedir_voz" })
    try {
      await deps.disparar.voz(guardada.id, claveVoz(guardada), nueva)
    } catch (error) {
      console.error("No pude iniciar grabar-voz", error)
      await guardarEvento(deps.db, guardada, { tipo: "falla_voz", explicacion: TEXTO_SIN_ARRANQUE_DE_VOZ })
      throw new Falla(TEXTO_SIN_ARRANQUE_DE_VOZ)
    }
    return {}
  })
}

/** The video of the approved script. A run that does not start is picked up by `reanudarArranques`. */
export function pedirVideo(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("pedirVideo", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "grabar_video" })
    return iniciar("grabar-pieza", () => deps.disparar.grabar(guardada.id, claveGrabar(guardada)), AVISO_GRABACION)
  })
}

/** Takes gate 1 back so she can change the script, the caption or the avatar. */
export function reabrirGuion(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("reabrirGuion", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    await guardarEvento(deps.db, fila, { tipo: "reabrir_guion" })
    return {}
  })
}
```

`lib/acciones/guion.ts`, `trabajoDeEditar`:
`if (fila.estado !== "guion_por_aprobar" && fila.estado !== "guion_aprobado") throw new Falla("Este guion ya no se puede editar.")`

`app/(app)/piezas/acciones.ts`:

```ts
export async function pedirVozAccion(piezaId: string, version: number, nueva: boolean) {
  return refrescar(
    await comoConi("pedirVoz", sobrePieza.extend({ nueva: z.boolean() }), { piezaId, version, nueva }, (deps, d) =>
      pedirVoz(deps, d.piezaId, d.version, d.nueva),
    ),
  )
}

export async function pedirVideoAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("pedirVideo", sobrePieza, { piezaId, version }, (deps, d) => pedirVideo(deps, d.piezaId, d.version)),
  )
}

export async function reabrirGuionAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("reabrirGuion", sobrePieza, { piezaId, version }, (deps, d) =>
      reabrirGuion(deps, d.piezaId, d.version),
    ),
  )
}
```

- [ ] **Step 4: Run and see green**

Run: `pnpm type && pnpm test:run && pnpm test:db tests/integration/acciones-piezas.test.ts tests/integration/acciones-guion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/ "app/(app)/piezas/acciones.ts" tests/
git commit -m "feat(acciones): record the voice and the video as separate steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Maintenance: stuck voices and voice reservations

**Files:**
- Create: `lib/mantenimiento/voces.ts`
- Modify: `lib/datos/repositorio.ts`, `lib/mantenimiento/gastos.ts`, `lib/mantenimiento/ejecutar.ts`
- Test: `tests/integration/voces-trabadas.test.ts`, `tests/integration/barrido-gastos.test.ts`, `tests/unit/mantenimiento-ejecutar.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/voces-trabadas.test.ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { devolverVocesTrabadas, EXPLICACION_VOZ_TRABADA } from "@/lib/mantenimiento/voces"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { leerFila, sembrarPieza } from "./siembra"

afterAll(() => pool.end())
const creadas: string[] = []
afterEach(async () => {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [creadas])
  creadas.length = 0
})

const enMinutos = (minutos: number) => () => new Date(Date.now() + minutos * 60_000).toISOString()

describe("devolverVocesTrabadas", () => {
  it("hands back a voice nobody wrote for 15 minutes, with a reason and a new attempt", async () => {
    const id = await sembrarPieza("grabando_voz")
    creadas.push(id)
    const antes = await leerFila(id)

    expect(await devolverVocesTrabadas({ db: clienteDeServicio(), ahora: enMinutos(16) })).toEqual([id])
    expect(await leerFila(id)).toMatchObject({
      estado: "guion_aprobado",
      explicacion: EXPLICACION_VOZ_TRABADA,
      intento: antes.intento + 1,
    })
  })

  it("leaves a voice that is still being recorded", async () => {
    const id = await sembrarPieza("grabando_voz")
    creadas.push(id)
    expect(await devolverVocesTrabadas({ db: clienteDeServicio(), ahora: enMinutos(5) })).toEqual([])
    expect((await leerFila(id)).estado).toBe("grabando_voz")
  })
})
```

In `tests/integration/barrido-gastos.test.ts` (its helpers `pieza`, `reservar`, `gasto`, `deps`, `dentroDe`), add:

```ts
describe("barrerGastos con la voz aparte", () => {
  it("keeps a voice reservation open while the piece has no voice, and releases it after a day", async () => {
    const id = await pieza("guion_aprobado")
    const clave = await reservar(id, "elevenlabs", "voz")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 0, liberados: 0 })
    expect((await gasto(clave)).estado).toBe("reservado")

    expect(await barrerGastos(deps(dentroDe(25)))).toEqual({ confirmados: 0, liberados: 1 })
    expect((await gasto(clave)).estado).toBe("liberado")
  })

  it("confirms a voice reservation once the piece has a voice", async () => {
    const id = await pieza("guion_aprobado")
    await pool.query("update public.piezas set audio_id = 'voces/x.mp3', version = version + 1 where id = $1", [id])
    const clave = await reservar(id, "elevenlabs", "voz")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 1, liberados: 0 })
    expect(await gasto(clave)).toEqual({ estado: "confirmado", real: 0.25 })
  })
})
```

The first case fails today (the current rule confirms any non-HeyGen reservation of a piece past the script).

`tests/unit/mantenimiento-ejecutar.test.ts`: extend the test that lists the frequent jobs so the expected keys include
`voces` (after `renders`).

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/mantenimiento-ejecutar.test.ts && pnpm test:db tests/integration/voces-trabadas.test.ts tests/integration/barrido-gastos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/datos/repositorio.ts`:

```ts
/** Pieces recording their voice whose last write is older than `antesDe`: their run died or never started. */
export async function leerVocesTrabadas(db: Db, antesDe: string): Promise<FilaDePieza[]> {
  const { data, error } = await db
    .from("piezas")
    .select("*")
    .eq("estado", "grabando_voz")
    .lt("actualizada_en", antesDe)
    .order("actualizada_en")
  if (error) throw fallo("No pude leer las voces trabadas", error)
  return data
}
```

```ts
// lib/mantenimiento/voces.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, leerVocesTrabadas } from "@/lib/datos/repositorio"
import { transicionar } from "@/lib/dominio/estados"
import type { Database } from "@/lib/supabase/database.types"

export const EXPLICACION_VOZ_TRABADA = "La voz no terminó de grabarse. Vuelve a intentarlo."
/** A voice takes seconds; a quarter of an hour without a write means the run is gone. */
const MINUTOS_PARA_DEVOLVER = 15

/**
 * The net under `grabar-voz`: a piece left in `grabando_voz` goes back to Coni with a reason, so the buttons work
 * again. A run that was only slow finds the piece moved and ends without writing; its take stays in the store and the
 * next "Grabar voz" reuses it.
 */
export async function devolverVocesTrabadas(deps: {
  db: SupabaseClient<Database>
  ahora: () => string
}): Promise<string[]> {
  const corte = new Date(Date.parse(deps.ahora()) - MINUTOS_PARA_DEVOLVER * 60_000).toISOString()
  const devueltas: string[] = []
  for (const fila of await leerVocesTrabadas(deps.db, corte)) {
    const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "falla_voz", explicacion: EXPLICACION_VOZ_TRABADA })
    // Null: the run wrote meanwhile, so it is not stuck.
    if (await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))) devueltas.push(fila.id)
  }
  return devueltas
}
```

`lib/mantenimiento/gastos.ts`:

```ts
/** Did the step this reservation paid for already happen? Then the money is spent, whatever the run that died said. */
function pasoRealizado(gasto: FilaDeGasto, pieza: FilaDePieza): boolean {
  if (gasto.proveedor === "heygen") return pieza.render_id !== null || DESPUES_DEL_RENDER.includes(pieza.estado)
  // The voice now happens after gate 1, on its own: only a stored voice says ElevenLabs was paid.
  if (gasto.proveedor === "elevenlabs" && gasto.paso === "voz") return pieza.audio_id !== null
  return !ANTES_DEL_GUION.includes(pieza.estado)
}
```

and the call becomes `pasoRealizado(gasto, pieza)` (import `type FilaDeGasto`).

`lib/mantenimiento/ejecutar.ts`, `mantenimientoFrecuente`: add `voces: () => devolverVocesTrabadas(deps),` after
`renders`, and mention it in the doc comment.

- [ ] **Step 4: Run and see green**

Run: `pnpm type && pnpm test:run && pnpm test:db tests/integration/voces-trabadas.test.ts tests/integration/barrido-gastos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/ lib/datos/repositorio.ts tests/
git commit -m "feat(mantenimiento): hand back stuck voices and keep voice reservations honest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Balances in the domain: does it reach, and how to say it

**Files:**
- Create: `lib/dominio/saldos.ts`
- Test: `tests/unit/saldos.test.ts`, `tests/integration/grabar.test.ts` (`estimarCreditosVideo`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/saldos.test.ts
import { describe, expect, it } from "vitest"
import {
  alcanceDeVideo,
  alcanceDeVoz,
  lineaDeCostoVideo,
  lineaDeCostoVoz,
  lineaDeSaldoVideo,
  lineaDeSaldoVoz,
  type SaldoElevenlabs,
  type SaldoHeygen,
} from "@/lib/dominio/saldos"

const ELEVEN: SaldoElevenlabs = {
  ok: true,
  usados: 76_600,
  limite: 100_000,
  renuevaEn: "2026-10-12T15:00:00.000Z",
  puedeExceder: false,
}
const BILLETERA: SaldoHeygen = { ok: true, tipo: "billetera", moneda: "usd", saldo: 12 }

describe("alcanceDeVoz", () => {
  it("reaches when the characters left cover the script", () => {
    expect(alcanceDeVoz(ELEVEN, 1100)).toEqual({ tipo: "alcanza" })
  })
  it("does not reach, and says what to do, when they do not", () => {
    expect(alcanceDeVoz({ ...ELEVEN, usados: 99_200 }, 1100)).toEqual({
      tipo: "no_alcanza",
      mensaje:
        "No te alcanzan los caracteres de ElevenLabs (te quedan 800 y esta voz usa 1.100). Recarga o mejora tu plan en elevenlabs.io, en Suscripción.",
    })
  })
  it("reaches past the limit when the plan bills the extra characters", () => {
    expect(alcanceDeVoz({ ...ELEVEN, usados: 100_000, puedeExceder: true }, 1100)).toEqual({ tipo: "alcanza" })
  })
  it("does not know when the lookup failed", () => {
    expect(alcanceDeVoz({ ok: false, motivo: "HTTP 401" }, 1100)).toEqual({ tipo: "no_se_sabe" })
  })
})

describe("alcanceDeVideo", () => {
  it("compares dollars with dollars and credits with credits", () => {
    expect(alcanceDeVideo(BILLETERA, { usd: 3.73, creditos: 45 })).toEqual({ tipo: "alcanza" })
    expect(alcanceDeVideo({ ok: true, tipo: "billetera", moneda: "creditos", saldo: 40 }, { usd: 3.73, creditos: 45 }).tipo).toBe(
      "no_alcanza",
    )
  })
  it("says the API balance is not the plan's credits when it does not reach", () => {
    expect(alcanceDeVideo({ ...BILLETERA, saldo: 1.2 }, { usd: 3.73, creditos: 45 })).toEqual({
      tipo: "no_alcanza",
      mensaje:
        "Tu saldo de API de HeyGen no alcanza (te quedan US$ 1,20 y este video cuesta unos US$ 3,73). Recárgalo en app.heygen.com, en la sección API. Los créditos de tu plan de HeyGen no sirven para grabar desde Conidolly.",
    })
  })
  it("does not know without a wallet or without an answer", () => {
    expect(alcanceDeVideo({ ok: true, tipo: "sin_billetera", facturacion: "subscription" }, { usd: 1, creditos: 1 })).toEqual(
      { tipo: "no_se_sabe" },
    )
    expect(alcanceDeVideo({ ok: false, motivo: "sin_conexion" }, { usd: 1, creditos: 1 })).toEqual({ tipo: "no_se_sabe" })
  })
})

describe("líneas", () => {
  it("writes the balances the way Coni reads them", () => {
    expect(lineaDeSaldoVoz(ELEVEN, "America/Santiago")).toBe(
      "ElevenLabs: te quedan 23.400 de 100.000 caracteres. Se renuevan el 12 de octubre.",
    )
    expect(lineaDeSaldoVoz({ ...ELEVEN, renuevaEn: null }, "America/Santiago")).toBe(
      "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
    )
    expect(lineaDeSaldoVoz({ ok: false, motivo: "x" }, "America/Santiago")).toBe("No pude ver tu saldo de ElevenLabs.")
    expect(lineaDeSaldoVideo(BILLETERA)).toBe("Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.")
    expect(lineaDeSaldoVideo({ ok: true, tipo: "billetera", moneda: "creditos", saldo: 1200 })).toBe(
      "Saldo de API de HeyGen: 1.200 créditos. Es aparte de tu plan de HeyGen.",
    )
    expect(lineaDeSaldoVideo({ ok: true, tipo: "sin_billetera", facturacion: "subscription" })).toBe(
      "HeyGen no informa un saldo de API para tu llave.",
    )
    expect(lineaDeSaldoVideo({ ok: false, motivo: "x" })).toBe("No pude ver tu saldo de API de HeyGen.")
  })

  it("writes the cost next to each button", () => {
    expect(lineaDeCostoVoz(1100, 0.33)).toBe("Grabar voz: ~1.100 caracteres (US$ 0,33)")
    expect(lineaDeCostoVideo(55.6, 3.73, false)).toBe("Grabar video: ~56 s (US$ 3,73)")
    expect(lineaDeCostoVideo(55.6, 4.06, true)).toBe("Grabar video: ~56 s (US$ 4,06) · incluye la voz")
  })

  it("never uses an em dash", () => {
    const todas = [
      lineaDeSaldoVoz(ELEVEN, "America/Santiago"),
      lineaDeSaldoVideo(BILLETERA),
      lineaDeCostoVideo(10, 1, true),
    ]
    for (const linea of todas) expect(linea).not.toContain("—")
  })
})
```

Append to `tests/integration/grabar.test.ts`, in `describe("estimarCostoVideo")`:

```ts
  it("counts the same render in credits, rounded up", () => {
    // 7 words at 150 a minute is 2.8 s: 2.24 credits of avatar_v, 0.75 of Avatar IV
    expect(estimarCreditosVideo(GUION, "avatar_v")).toBe(3)
    expect(estimarCreditosVideo(GUION, null)).toBe(1)
  })
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/saldos.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// lib/dominio/saldos.ts
import { dolares } from "@/lib/formato"

/** What ElevenLabs says about Coni's characters (`GET /v1/user/subscription`). */
export type SaldoElevenlabs =
  | { ok: true; usados: number; limite: number; renuevaEn: string | null; puedeExceder: boolean }
  | { ok: false; motivo: string }

/** What HeyGen says about the API wallet (`GET /v3/users/me`). The plan's credits do not fund API renders. */
export type SaldoHeygen =
  | { ok: true; tipo: "billetera"; moneda: "usd" | "creditos"; saldo: number }
  | { ok: true; tipo: "sin_billetera"; facturacion: string }
  | { ok: false; motivo: string }

export interface Saldos {
  elevenlabs: SaldoElevenlabs
  heygen: SaldoHeygen
}

/** A failed lookup is `no_se_sabe`, which never blocks a button. */
export type Alcance = { tipo: "alcanza" } | { tipo: "no_alcanza"; mensaje: string } | { tipo: "no_se_sabe" }

const miles = (cantidad: number) => Math.round(cantidad).toLocaleString("es-CL")

function caracteresQuedan(saldo: Extract<SaldoElevenlabs, { ok: true }>): number {
  return Math.max(0, saldo.limite - saldo.usados)
}

export function alcanceDeVoz(saldo: SaldoElevenlabs, caracteres: number): Alcance {
  if (!saldo.ok) return { tipo: "no_se_sabe" }
  const quedan = caracteresQuedan(saldo)
  if (quedan >= caracteres || saldo.puedeExceder) return { tipo: "alcanza" }
  return {
    tipo: "no_alcanza",
    mensaje: `No te alcanzan los caracteres de ElevenLabs (te quedan ${miles(quedan)} y esta voz usa ${miles(caracteres)}). Recarga o mejora tu plan en elevenlabs.io, en Suscripción.`,
  }
}

export function alcanceDeVideo(saldo: SaldoHeygen, costo: { usd: number; creditos: number }): Alcance {
  if (!saldo.ok || saldo.tipo !== "billetera") return { tipo: "no_se_sabe" }
  const enDolares = saldo.moneda === "usd"
  if (saldo.saldo >= (enDolares ? costo.usd : costo.creditos)) return { tipo: "alcanza" }
  const quedan = enDolares ? dolares(saldo.saldo) : `${miles(saldo.saldo)} créditos`
  const cuesta = enDolares ? `unos ${dolares(costo.usd)}` : `unos ${miles(costo.creditos)} créditos`
  return {
    tipo: "no_alcanza",
    mensaje: `Tu saldo de API de HeyGen no alcanza (te quedan ${quedan} y este video cuesta ${cuesta}). Recárgalo en app.heygen.com, en la sección API. Los créditos de tu plan de HeyGen no sirven para grabar desde Conidolly.`,
  }
}

export function lineaDeSaldoVoz(saldo: SaldoElevenlabs, zona: string): string {
  if (!saldo.ok) return "No pude ver tu saldo de ElevenLabs."
  const base = `ElevenLabs: te quedan ${miles(caracteresQuedan(saldo))} de ${miles(saldo.limite)} caracteres.`
  if (saldo.renuevaEn === null) return base
  const dia = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: zona }).format(
    new Date(saldo.renuevaEn),
  )
  return `${base} Se renuevan el ${dia}.`
}

export function lineaDeSaldoVideo(saldo: SaldoHeygen): string {
  if (!saldo.ok) return "No pude ver tu saldo de API de HeyGen."
  if (saldo.tipo === "sin_billetera") return "HeyGen no informa un saldo de API para tu llave."
  const monto = saldo.moneda === "usd" ? dolares(saldo.saldo) : `${miles(saldo.saldo)} créditos`
  return `Saldo de API de HeyGen: ${monto}. Es aparte de tu plan de HeyGen.`
}

export function lineaDeCostoVoz(caracteres: number, usd: number): string {
  return `Grabar voz: ~${miles(caracteres)} caracteres (${dolares(usd)})`
}

export function lineaDeCostoVideo(segundos: number, usd: number, incluyeVoz: boolean): string {
  return `Grabar video: ~${Math.round(segundos)} s (${dolares(usd)})${incluyeVoz ? " · incluye la voz" : ""}`
}
```

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/saldos.test.ts && pnpm test:db tests/integration/grabar.test.ts`
Expected: PASS. If the month line differs ("12 de octubre" vs another form) on this Node's ICU, fix the formatter
options, not the test.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/saldos.ts tests/unit/saldos.test.ts tests/integration/grabar.test.ts
git commit -m "feat(saldos): decide whether a balance reaches and say it in Chilean Spanish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Reading the balances from ElevenLabs and HeyGen

**Files:**
- Create: `lib/proveedores/saldos.ts`
- Test: `tests/unit/saldos-proveedores.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/saldos-proveedores.test.ts
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { leerSaldoElevenlabs, leerSaldoHeygen } from "@/lib/proveedores/saldos"
import { servidor } from "../msw"

const ELEVEN = "https://api.elevenlabs.io"
const HEYGEN = "https://api.heygen.com"

describe("leerSaldoElevenlabs", () => {
  it("reads characters used, limit and reset date with Coni's key", async () => {
    let llave: string | null = null
    servidor.use(
      http.get(`${ELEVEN}/v1/user/subscription`, ({ request }) => {
        llave = request.headers.get("xi-api-key")
        return HttpResponse.json({
          tier: "creator",
          status: "active",
          character_count: 76_600,
          character_limit: 100_000,
          next_character_count_reset_unix: 1_760_281_200,
          can_extend_character_limit: true,
          allowed_to_extend_character_limit: false,
        })
      }),
    )
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({
      ok: true,
      usados: 76_600,
      limite: 100_000,
      renuevaEn: new Date(1_760_281_200 * 1000).toISOString(),
      puedeExceder: false,
    })
    expect(llave).toBe("sk_x")
  })

  it("answers ok false, without the key or the body, on an error or an unexpected answer", async () => {
    servidor.use(http.get(`${ELEVEN}/v1/user/subscription`, () => HttpResponse.json({ detail: "sk_x bad" }, { status: 401 })))
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({ ok: false, motivo: "HTTP 401" })
    servidor.use(http.get(`${ELEVEN}/v1/user/subscription`, () => HttpResponse.json({ nada: true })))
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({ ok: false, motivo: "formato" })
    servidor.use(http.get(`${ELEVEN}/v1/user/subscription`, () => HttpResponse.error()))
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({ ok: false, motivo: "sin_conexion" })
  })
})

describe("leerSaldoHeygen", () => {
  it("reads the API wallet of GET /v3/users/me", async () => {
    let llave: string | null = null
    servidor.use(
      http.get(`${HEYGEN}/v3/users/me`, ({ request }) => {
        llave = request.headers.get("x-api-key")
        return HttpResponse.json({
          data: { username: "coni", billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 12.5 } },
        })
      }),
    )
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({
      ok: true,
      tipo: "billetera",
      moneda: "usd",
      saldo: 12.5,
    })
    expect(llave).toBe("hg_x")
  })

  it("reads a wallet in credits", async () => {
    servidor.use(
      http.get(`${HEYGEN}/v3/users/me`, () =>
        HttpResponse.json({ data: { billing_type: "wallet", wallet: { currency: "credits", remaining_balance: 300 } } }),
      ),
    )
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({
      ok: true,
      tipo: "billetera",
      moneda: "creditos",
      saldo: 300,
    })
  })

  it("says there is no wallet for subscription billing, and ok false on errors", async () => {
    servidor.use(
      http.get(`${HEYGEN}/v3/users/me`, () =>
        HttpResponse.json({ data: { billing_type: "subscription", subscription: { plan: "creator" } } }),
      ),
    )
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({
      ok: true,
      tipo: "sin_billetera",
      facturacion: "subscription",
    })
    servidor.use(http.get(`${HEYGEN}/v3/users/me`, () => new HttpResponse("no", { status: 500 })))
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({ ok: false, motivo: "HTTP 500" })
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/saldos-proveedores.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// lib/proveedores/saldos.ts
import { z } from "zod"
import type { SaldoElevenlabs, SaldoHeygen } from "@/lib/dominio/saldos"

// A balance is a hint on a screen: it must not hold the page for long.
const ESPERA_MS = 5_000

type Respuesta = { ok: true; cuerpo: unknown } | { ok: false; motivo: string }

/** Never puts the body or the key in the reason: a provider may echo the key back in an error. */
async function pedirJson(url: string, cabeceras: Record<string, string>): Promise<Respuesta> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch {
    // Unreachable or too slow: the screen says it could not see the balance and does not block.
    return { ok: false, motivo: "sin_conexion" }
  }
  if (!respuesta.ok) return { ok: false, motivo: `HTTP ${respuesta.status}` }
  try {
    return { ok: true, cuerpo: await respuesta.json() }
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, motivo: "ilegible" }
    throw error
  }
}

// https://elevenlabs.io/docs/api-reference/user/subscription/get
const Suscripcion = z.object({
  character_count: z.number(),
  character_limit: z.number(),
  next_character_count_reset_unix: z.number().nullish(),
  can_extend_character_limit: z.boolean().nullish(),
  allowed_to_extend_character_limit: z.boolean().nullish(),
})

export async function leerSaldoElevenlabs(entrada: { clave: string; base: string }): Promise<SaldoElevenlabs> {
  const respuesta = await pedirJson(`${entrada.base}/v1/user/subscription`, { "xi-api-key": entrada.clave })
  if (!respuesta.ok) return respuesta
  const leida = Suscripcion.safeParse(respuesta.cuerpo)
  if (!leida.success) return { ok: false, motivo: "formato" }
  const datos = leida.data
  return {
    ok: true,
    usados: datos.character_count,
    limite: datos.character_limit,
    renuevaEn: datos.next_character_count_reset_unix
      ? new Date(datos.next_character_count_reset_unix * 1000).toISOString()
      : null,
    // Both must hold: the plan can bill extra characters and the account allows it.
    puedeExceder: datos.can_extend_character_limit === true && datos.allowed_to_extend_character_limit === true,
  }
}

// https://developers.heygen.com/reference/get-current-user.md: billing_type wallet | subscription | usage_based.
const Usuario = z.object({
  data: z.object({
    billing_type: z.string(),
    wallet: z.object({ currency: z.string(), remaining_balance: z.number().nullish() }).nullish(),
  }),
})

export async function leerSaldoHeygen(entrada: { clave: string; base: string }): Promise<SaldoHeygen> {
  const respuesta = await pedirJson(`${entrada.base}/v3/users/me`, { "X-Api-Key": entrada.clave })
  if (!respuesta.ok) return respuesta
  const leida = Usuario.safeParse(respuesta.cuerpo)
  if (!leida.success) return { ok: false, motivo: "formato" }
  const { billing_type: facturacion, wallet } = leida.data.data
  const saldo = wallet?.remaining_balance
  if (facturacion === "wallet" && typeof saldo === "number" && (wallet?.currency === "usd" || wallet?.currency === "credits")) {
    return { ok: true, tipo: "billetera", moneda: wallet.currency === "usd" ? "usd" : "creditos", saldo }
  }
  return { ok: true, tipo: "sin_billetera", facturacion }
}
```

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/saldos-proveedores.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/saldos.ts tests/unit/saldos-proveedores.test.ts
git commit -m "feat(saldos): read ElevenLabs characters and the HeyGen API wallet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A cached reader for the balances

**Files:**
- Create: `lib/saldos/leer.ts`, `lib/saldos/reales.ts`
- Test: `tests/unit/saldos-lector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/saldos-lector.test.ts
import { describe, expect, it, vi } from "vitest"
import type { SaldoElevenlabs, SaldoHeygen } from "@/lib/dominio/saldos"
import { lectorDeSaldos } from "@/lib/saldos/leer"

const ELEVEN: SaldoElevenlabs = { ok: true, usados: 1, limite: 10, renuevaEn: null, puedeExceder: false }
const HEYGEN: SaldoHeygen = { ok: true, tipo: "billetera", moneda: "usd", saldo: 5 }

function armar(opciones: { heygen?: () => Promise<SaldoHeygen>; llaves?: (n: string) => Promise<string | null> } = {}) {
  let reloj = 1_000
  const elevenlabs = vi.fn(async () => ELEVEN)
  const heygen = vi.fn(opciones.heygen ?? (async () => HEYGEN))
  const leer = lectorDeSaldos({
    leerLlave: vi.fn(opciones.llaves ?? (async (nombre: string) => `llave-${nombre}`)),
    elevenlabs,
    heygen,
    ahora: () => reloj,
  })
  return { leer, elevenlabs, heygen, avanzar: (ms: number) => (reloj += ms) }
}

describe("lectorDeSaldos", () => {
  it("reads both balances with each key", async () => {
    const { leer, elevenlabs, heygen } = armar()
    expect(await leer()).toEqual({ elevenlabs: ELEVEN, heygen: HEYGEN })
    expect(elevenlabs).toHaveBeenCalledWith("llave-elevenlabs")
    expect(heygen).toHaveBeenCalledWith("llave-heygen")
  })

  it("keeps an answer for a minute and shares one request between callers", async () => {
    const { leer, heygen, avanzar } = armar()
    await Promise.all([leer(), leer()])
    expect(heygen).toHaveBeenCalledTimes(1)
    avanzar(59_000)
    await leer()
    expect(heygen).toHaveBeenCalledTimes(1)
    avanzar(2_000)
    await leer()
    expect(heygen).toHaveBeenCalledTimes(2)
  })

  it("keeps a failure only 15 seconds", async () => {
    const { leer, heygen, avanzar } = armar({ heygen: async () => ({ ok: false, motivo: "HTTP 500" }) })
    await leer()
    avanzar(16_000)
    await leer()
    expect(heygen).toHaveBeenCalledTimes(2)
  })

  it("answers sin_llave without calling a provider whose key is missing", async () => {
    const { leer, heygen } = armar({ llaves: async (n) => (n === "heygen" ? null : "llave") })
    expect((await leer()).heygen).toEqual({ ok: false, motivo: "sin_llave" })
    expect(heygen).not.toHaveBeenCalled()
  })

  it("answers both as failed, and logs it, when reading the keys breaks", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { leer } = armar({
      llaves: async () => {
        throw new Error("vault caído")
      },
    })
    expect(await leer()).toEqual({
      elevenlabs: { ok: false, motivo: "error" },
      heygen: { ok: false, motivo: "error" },
    })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/saldos-lector.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// lib/saldos/leer.ts
import type { SaldoElevenlabs, SaldoHeygen, Saldos } from "@/lib/dominio/saldos"

export interface DepsSaldos {
  /** Reads a provider key from the Vault (service client). */
  leerLlave: (nombre: "elevenlabs" | "heygen") => Promise<string | null>
  elevenlabs: (clave: string) => Promise<SaldoElevenlabs>
  heygen: (clave: string) => Promise<SaldoHeygen>
  ahora: () => number
  vigencia?: { okMs: number; fallaMs: number }
}

const VIGENCIA = { okMs: 60_000, fallaMs: 15_000 }
const FALLIDOS: Saldos = { elevenlabs: { ok: false, motivo: "error" }, heygen: { ok: false, motivo: "error" } }

/**
 * Both balances, cached per server instance: a minute when they answered, 15 seconds when not, and one request shared
 * by callers that arrive together. A failure is a value ("No pude ver tu saldo"), never an exception for the page.
 */
export function lectorDeSaldos(deps: DepsSaldos): () => Promise<Saldos> {
  const vigencia = deps.vigencia ?? VIGENCIA
  let guardado: { saldos: Saldos; hasta: number } | null = null
  let enCurso: Promise<Saldos> | null = null

  async function consultar(): Promise<Saldos> {
    const [llaveVoz, llaveVideo] = await Promise.all([deps.leerLlave("elevenlabs"), deps.leerLlave("heygen")])
    const [elevenlabs, heygen] = await Promise.all([
      llaveVoz === null ? ({ ok: false, motivo: "sin_llave" } as const) : deps.elevenlabs(llaveVoz),
      llaveVideo === null ? ({ ok: false, motivo: "sin_llave" } as const) : deps.heygen(llaveVideo),
    ])
    return { elevenlabs, heygen }
  }

  return async () => {
    if (guardado !== null && guardado.hasta > deps.ahora()) return guardado.saldos
    if (enCurso !== null) return enCurso
    enCurso = consultar()
      .catch((error: unknown) => {
        console.error("No pude leer los saldos", error)
        return FALLIDOS
      })
      .then((saldos) => {
        for (const [proveedor, saldo] of Object.entries(saldos)) {
          if (!saldo.ok) console.error(`No pude ver el saldo de ${proveedor}: ${saldo.motivo}`)
        }
        const todosOk = saldos.elevenlabs.ok && saldos.heygen.ok
        guardado = { saldos, hasta: deps.ahora() + (todosOk ? vigencia.okMs : vigencia.fallaMs) }
        return saldos
      })
      .finally(() => {
        enCurso = null
      })
    return enCurso
  }
}
```

```ts
// lib/saldos/reales.ts
import { clienteDeServicio } from "@/lib/acciones/servidor"
import { leerSecreto } from "@/lib/datos/repositorio"
import { baseDe } from "@/lib/proveedores/bases"
import { leerSaldoElevenlabs, leerSaldoHeygen } from "@/lib/proveedores/saldos"
import { lectorDeSaldos } from "./leer"

/** The balances the screens show. The local E2E run changes them between tests, so it does not cache. */
export const leerSaldos = lectorDeSaldos({
  leerLlave: (nombre) => leerSecreto(clienteDeServicio(), nombre),
  elevenlabs: (clave) =>
    leerSaldoElevenlabs({ clave, base: baseDe(process.env, "ELEVENLABS_BASE_URL", "https://api.elevenlabs.io") }),
  heygen: (clave) => leerSaldoHeygen({ clave, base: baseDe(process.env, "HEYGEN_BASE_URL", "https://api.heygen.com") }),
  ahora: () => Date.now(),
  ...(process.env.DISPARO_DE_PRUEBA === "1" ? { vigencia: { okMs: 0, fallaMs: 0 } } : {}),
})
```

Check `baseDe`'s exact signature in `lib/proveedores/bases.ts` and that it strips a trailing slash; if it does not,
strip it in `pedirJson`'s callers.

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/saldos-lector.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/saldos/ tests/unit/saldos-lector.test.ts
git commit -m "feat(saldos): cache the balances briefly on the server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Screens refresh themselves while a piece works

**Files:**
- Create: `components/refresco-automatico.tsx`
- Test: `tests/unit/refresco-automatico.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/refresco-automatico.test.tsx
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RefrescoAutomatico } from "@/components/refresco-automatico"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

function visibilidad(estado: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockClear()
  visibilidad("visible")
})
afterEach(() => vi.useRealTimers())

describe("RefrescoAutomatico", () => {
  it("refreshes every interval while active", () => {
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it("does nothing while not active", () => {
    render(<RefrescoAutomatico activo={false} cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("stops when it becomes inactive", () => {
    const { rerender } = render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    rerender(<RefrescoAutomatico activo={false} cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("pauses while the tab is hidden and refreshes once when it comes back", () => {
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => visibilidad("hidden"))
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).not.toHaveBeenCalled()
    act(() => visibilidad("visible"))
    expect(refresh).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(4000))
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/refresco-automatico.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```tsx
// components/refresco-automatico.tsx
"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Asks the server for the screen again every `cadaMs` while `activo` and the tab is visible. The server decides
 * `activo` on each render, so the polling stops by itself when the piece settles. No Realtime, no endpoint.
 */
export function RefrescoAutomatico({ activo, cadaMs }: { activo: boolean; cadaMs: number }) {
  const router = useRouter()

  useEffect(() => {
    if (!activo) return
    let intervalo: ReturnType<typeof setInterval> | null = null
    const arrancar = () => {
      if (intervalo === null) intervalo = setInterval(() => router.refresh(), cadaMs)
    }
    const parar = () => {
      if (intervalo !== null) clearInterval(intervalo)
      intervalo = null
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        router.refresh()
        arrancar()
      } else {
        parar()
      }
    }
    if (document.visibilityState === "visible") arrancar()
    document.addEventListener("visibilitychange", alCambiarVisibilidad)
    return () => {
      parar()
      document.removeEventListener("visibilitychange", alCambiarVisibilidad)
    }
  }, [activo, cadaMs, router])

  return null
}
```

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/refresco-automatico.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/refresco-automatico.tsx tests/unit/refresco-automatico.test.tsx
git commit -m "feat(ui): refresh a screen by itself while its piece works

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The Guion screen: approve, then record the voice and the video

**Files:**
- Create: `lib/datos/grabacion.ts`
- Create: `app/(app)/guion/[id]/barra-de-grabacion.tsx`
- Modify: `app/(app)/guion/[id]/page.tsx`, `app/(app)/guion/[id]/pantalla-guion.tsx`
- Modify: `lib/datos/pantallas.ts` (delete `leerCostoDeGrabar` and `CostoDeGrabar`)
- Modify: `tests/integration/costo-de-grabar.test.ts` (delete the `leerCostoDeGrabar` cases; keep any `leerPresupuesto` case)
- Test: `tests/unit/grabacion.test.ts`, `tests/unit/barra-de-grabacion.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/grabacion.test.ts
import { describe, expect, it } from "vitest"
import type { Saldos } from "@/lib/dominio/saldos"
import { presentarGrabacion } from "@/lib/datos/grabacion"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { estimarCostoVideo } from "@/lib/produccion/grabar"

const GUION = "Hola, soy Coni. Hoy hablamos de límites."
const BIEN: Saldos = {
  elevenlabs: { ok: true, usados: 0, limite: 100_000, renuevaEn: null, puedeExceder: false },
  heygen: { ok: true, tipo: "billetera", moneda: "usd", saldo: 50 },
}

describe("presentarGrabacion", () => {
  it("prices the voice and the video, adding the voice to the video while there is none", () => {
    const sin = presentarGrabacion({ guion: GUION, motor: "avatar_v", conVoz: false, saldos: BIEN, zona: "America/Santiago", quedanUsd: 37 })
    const voz = estimarCostoVoz(GUION)
    const video = estimarCostoVideo(GUION, "avatar_v")
    expect(sin.costoVoz).toBe(`Grabar voz: ~${GUION.length} caracteres (US$ ${voz.toFixed(2).replace(".", ",")})`)
    expect(sin.costoVideo).toMatch(/ · incluye la voz$/)
    expect(sin.confirmacionVideo).toBe(`¿Grabar el video? Cuesta unos US$ ${(video + voz).toFixed(2).replace(".", ",")}.`)
    expect(sin.tope).toBe("Te quedan US$ 37,00 de tu tope de este mes.")
    const con = presentarGrabacion({ guion: GUION, motor: "avatar_v", conVoz: true, saldos: BIEN, zona: "America/Santiago", quedanUsd: 37 })
    expect(con.costoVideo).not.toMatch(/incluye la voz/)
    expect(con.bloqueoVoz).toBeNull()
    expect(con.bloqueoVideo).toBeNull()
  })

  it("blocks the video when the HeyGen wallet does not reach, and when the missing voice does not reach", () => {
    const sinBilletera = { ...BIEN, heygen: { ok: true, tipo: "billetera", moneda: "usd", saldo: 0 } } as const
    expect(
      presentarGrabacion({ guion: GUION, motor: "avatar_v", conVoz: true, saldos: sinBilletera, zona: "America/Santiago", quedanUsd: 37 })
        .bloqueoVideo,
    ).toMatch(/^Tu saldo de API de HeyGen no alcanza/)
    const sinCaracteres = {
      ...BIEN,
      elevenlabs: { ok: true, usados: 100_000, limite: 100_000, renuevaEn: null, puedeExceder: false },
    } as const
    const sin = presentarGrabacion({ guion: GUION, motor: "avatar_v", conVoz: false, saldos: sinCaracteres, zona: "America/Santiago", quedanUsd: 37 })
    expect(sin.bloqueoVoz).toMatch(/^No te alcanzan los caracteres/)
    expect(sin.bloqueoVideo).toBe(sin.bloqueoVoz)
    const con = presentarGrabacion({ guion: GUION, motor: "avatar_v", conVoz: true, saldos: sinCaracteres, zona: "America/Santiago", quedanUsd: 37 })
    expect(con.bloqueoVideo).toBeNull()
  })

  it("never blocks when the balances could not be read", () => {
    const fallidos: Saldos = { elevenlabs: { ok: false, motivo: "x" }, heygen: { ok: false, motivo: "x" } }
    const r = presentarGrabacion({ guion: GUION, motor: null, conVoz: false, saldos: fallidos, zona: "America/Santiago", quedanUsd: 0 })
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBeNull()
    expect(r.saldoVoz).toBe("No pude ver tu saldo de ElevenLabs.")
    expect(r.saldoVideo).toBe("No pude ver tu saldo de API de HeyGen.")
  })
})
```

```tsx
// tests/unit/barra-de-grabacion.test.tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BarraDeGrabacion } from "@/app/(app)/guion/[id]/barra-de-grabacion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"

const pedirVozAccion = vi.fn(async () => ({ ok: true as const }))
const pedirVideoAccion = vi.fn(async () => ({ ok: true as const }))
const reabrirGuionAccion = vi.fn(async () => ({ ok: true as const }))
vi.mock("@/app/(app)/piezas/acciones", () => ({ pedirVozAccion, pedirVideoAccion, reabrirGuionAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const BOTONES = {
  costoVoz: "Grabar voz: ~1.100 caracteres (US$ 0,33)",
  costoVideo: "Grabar video: ~56 s (US$ 3,73)",
  confirmacionVideo: "¿Grabar el video? Cuesta unos US$ 3,73.",
  saldoVoz: "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
  saldoVideo: "Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.",
  tope: "Te quedan US$ 37,00 de tu tope de este mes.",
  bloqueoVoz: null,
  bloqueoVideo: null,
}
const datos = (cambios: Partial<DatosDeGrabacion> = {}): DatosDeGrabacion => ({
  estado: "guion_aprobado",
  voz: null,
  botones: BOTONES,
  ...cambios,
})

beforeEach(() => vi.clearAllMocks())

describe("BarraDeGrabacion", () => {
  it("offers Grabar voz with its cost and balance when there is no voice", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Grabar voz" }))
    expect(pedirVozAccion).toHaveBeenCalledWith("p", 3, false)
    expect(screen.getByText(BOTONES.costoVoz)).toBeInTheDocument()
    expect(screen.getByText(BOTONES.saldoVoz)).toBeInTheDocument()
  })

  it("plays the voice and offers to record it again as a new take", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ voz: { url: "https://almacen.test/v.mp3", clave: "v.mp3" } })} />)
    expect(screen.getByRole("button", { name: "Escuchar la voz" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Volver a grabar voz" }))
    expect(pedirVozAccion).toHaveBeenCalledWith("p", 3, true)
  })

  it("asks once before recording the video", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Grabar video" }))
    expect(pedirVideoAccion).not.toHaveBeenCalled()
    expect(screen.getByText(BOTONES.confirmacionVideo)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, grabar" }))
    expect(pedirVideoAccion).toHaveBeenCalledWith("p", 3)
  })

  it("disables a button and says what to top up when the balance does not reach", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,73)."
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ botones: { ...BOTONES, bloqueoVideo: bloqueo } })} />)
    expect(screen.getByRole("button", { name: "Grabar video" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(bloqueo)).toBeInTheDocument()
  })

  it("disables both while the voice is being recorded", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ estado: "grabando_voz" })} />)
    expect(screen.getByRole("button", { name: "Grabando la voz…" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Grabar video" })).toHaveAttribute("aria-disabled", "true")
  })

  it("reopens the script", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Volver a revisar el guion" }))
    expect(reabrirGuionAccion).toHaveBeenCalledWith("p", 3)
  })
})
```

Check how `Boton` marks a disabled button (`components/ui/boton.tsx` uses `inactivo`): if it sets `disabled` instead of
`aria-disabled`, assert `toBeDisabled()` instead. Check the click on a `useTransition`-driven action resolves inside the
test (wrap in `await act(async () => ...)` if the existing button tests do).

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/grabacion.test.ts tests/unit/barra-de-grabacion.test.tsx`
Expected: FAIL, modules missing.

- [ ] **Step 3: The data of the bar**

```ts
// lib/datos/grabacion.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { urlParaVer } from "@/lib/acciones/medios"
import { leerPresupuesto } from "@/lib/datos/pantallas"
import { type FilaDePieza, leerProduccion } from "@/lib/datos/repositorio"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import {
  type Alcance,
  alcanceDeVideo,
  alcanceDeVoz,
  lineaDeCostoVideo,
  lineaDeCostoVoz,
  lineaDeSaldoVideo,
  lineaDeSaldoVoz,
  type Saldos,
} from "@/lib/dominio/saldos"
import { vozDelGuion } from "@/lib/dominio/voz"
import { dolares } from "@/lib/formato"
import { formulaGuardada } from "@/lib/produccion/aprobacion"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { estimarCostoVideo, estimarCreditosVideo } from "@/lib/produccion/grabar"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { claveVozAprobada } from "@/lib/proveedores/almacen"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { leerSaldos } from "@/lib/saldos/reales"
import type { Database } from "@/lib/supabase/database.types"

export interface BotonesDeGrabacion {
  costoVoz: string
  costoVideo: string
  confirmacionVideo: string
  saldoVoz: string
  saldoVideo: string
  tope: string
  /** What to top up when ElevenLabs does not reach; null lets the button work. */
  bloqueoVoz: string | null
  bloqueoVideo: string | null
}

export interface DatosDeGrabacion {
  estado: "guion_aprobado" | "grabando_voz"
  /** The voice that speaks this approved script, signed for an hour; null when there is none yet. */
  voz: { url: string | null; clave: string } | null
  /** Null when the production setup does not read: the buttons still work, without numbers. */
  botones: BotonesDeGrabacion | null
}

const bloqueo = (alcance: Alcance) => (alcance.tipo === "no_alcanza" ? alcance.mensaje : null)

export function presentarGrabacion(entrada: {
  guion: string
  motor: string | null
  conVoz: boolean
  saldos: Saldos
  zona: string
  quedanUsd: number
}): BotonesDeGrabacion {
  const { guion, motor, conVoz, saldos } = entrada
  const usdVoz = estimarCostoVoz(guion)
  const usdVideo = estimarCostoVideo(guion, motor)
  const totalVideo = usdVideo + (conVoz ? 0 : usdVoz)
  const bloqueoVoz = bloqueo(alcanceDeVoz(saldos.elevenlabs, guion.length))
  const bloqueoHeygen = bloqueo(
    alcanceDeVideo(saldos.heygen, { usd: usdVideo, creditos: estimarCreditosVideo(guion, motor) }),
  )
  return {
    costoVoz: lineaDeCostoVoz(guion.length, usdVoz),
    costoVideo: lineaDeCostoVideo(estimarSegundos(guion), totalVideo, !conVoz),
    confirmacionVideo: `¿Grabar el video? Cuesta unos ${dolares(totalVideo)}.`,
    saldoVoz: lineaDeSaldoVoz(saldos.elevenlabs, entrada.zona),
    saldoVideo: lineaDeSaldoVideo(saldos.heygen),
    tope: `Te quedan ${dolares(Math.max(0, entrada.quedanUsd))} de tu tope de este mes.`,
    bloqueoVoz,
    // Without a voice, the video also needs ElevenLabs.
    bloqueoVideo: bloqueoHeygen ?? (conVoz ? null : bloqueoVoz),
  }
}

/**
 * The stored voice that speaks this script with the configured voice: a take of its fingerprint, or, while gate 1 of
 * formula 2 or 3 stands, the legacy voice of that approval. Formula 1 pieces keep their own voice.
 */
export function vozVigente(fila: FilaDePieza, guion: string, config: ReturnType<typeof leerConfigProduccion>): string | null {
  const formula = formulaGuardada(fila)
  if (fila.puerta1_hash !== null && (formula === null || formula === 1)) return fila.audio_id
  return vozDelGuion({
    audioId: fila.audio_id,
    piezaId: fila.id,
    huella: huellaDelGuion(guion, config.elevenlabs),
    legadas: fila.puerta1_hash === null ? [] : [claveVozAprobada(fila.id, fila.puerta1_hash)],
  })
}

/** Everything the record bar shows, read when the screen opens. */
export async function leerDatosDeGrabacion(
  db: SupabaseClient<Database>,
  entrada: { fila: FilaDePieza; estado: DatosDeGrabacion["estado"]; guion: string; zona: string },
): Promise<DatosDeGrabacion> {
  const { fila, estado, guion, zona } = entrada
  let config: ReturnType<typeof leerConfigProduccion>
  try {
    config = leerConfigProduccion(await leerProduccion(db))
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer la configuración para la barra de grabación", error)
    return { estado, voz: null, botones: null }
  }
  const clave = vozVigente(fila, guion, config)
  const [saldos, presupuesto, url] = await Promise.all([
    leerSaldos(),
    leerPresupuesto(db, Date.now(), zona),
    urlParaVer(clave),
  ])
  return {
    estado,
    voz: clave === null ? null : { url, clave },
    botones: presentarGrabacion({
      guion,
      motor: config.heygen.motor,
      conVoz: clave !== null,
      saldos,
      zona,
      quedanUsd: presupuesto.tope - presupuesto.usado,
    }),
  }
}
```

(If importing `lib/acciones/servidor.ts` through `lib/saldos/reales.ts` breaks the unit test of `presentarGrabacion`
because of server-only imports, move `presentarGrabacion` and `BotonesDeGrabacion` to `lib/datos/grabacion-modelo.ts`
and import it from both places.)

- [ ] **Step 4: The bar**

```tsx
// app/(app)/guion/[id]/barra-de-grabacion.tsx
"use client"

import { useState } from "react"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Boton } from "@/components/ui/boton"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { pedirVideoAccion, pedirVozAccion, reabrirGuionAccion } from "../../piezas/acciones"

/** After gate 1: her voice alone first if she wants it, then the video. Each button says what it costs and what is left. */
export function BarraDeGrabacion({ piezaId, version, datos }: { piezaId: string; version: number; datos: DatosDeGrabacion }) {
  const voz = useAccion()
  const video = useAccion()
  const reabrir = useAccion()
  const [confirmando, setConfirmando] = useState(false)
  const { botones } = datos
  const grabandoVoz = datos.estado === "grabando_voz"
  const bloqueoVoz = botones?.bloqueoVoz ?? null
  const bloqueoVideo = botones?.bloqueoVideo ?? null
  const error = voz.error ?? video.error ?? reabrir.error

  return (
    <div className="sticky bottom-0 -mx-4.5 -mb-6 grid gap-3 border-t border-linea bg-superficie px-4.5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-flotante">
      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        {datos.voz ? <ReproductorVoz src={datos.voz.url} clave={datos.voz.clave} alEscuchar={() => undefined} /> : null}
        <Boton
          variante={datos.voz ? "linea" : "primario"}
          cargando={voz.pendiente}
          deshabilitado={grabandoVoz || bloqueoVoz !== null}
          onClick={() => voz.ejecutar(() => pedirVozAccion(piezaId, version, datos.voz !== null))}
        >
          {grabandoVoz ? "Grabando la voz…" : datos.voz ? "Volver a grabar voz" : "Grabar voz"}
        </Boton>
        {botones ? (
          <>
            <p className="text-center text-meta text-apagado">{botones.costoVoz}</p>
            <p className="text-center text-meta text-apagado">{bloqueoVoz ?? botones.saldoVoz}</p>
          </>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        {confirmando ? (
          <div className="grid gap-2 rounded-md bg-acento-suave p-3.5">
            <p className="text-[1rem]">{botones?.confirmacionVideo ?? "¿Grabar el video?"}</p>
            <Boton cargando={video.pendiente} onClick={() => video.ejecutar(() => pedirVideoAccion(piezaId, version))}>
              Sí, grabar
            </Boton>
            <Boton variante="callado" onClick={() => setConfirmando(false)}>
              Volver
            </Boton>
          </div>
        ) : (
          <Boton deshabilitado={grabandoVoz || bloqueoVideo !== null} onClick={() => setConfirmando(true)}>
            Grabar video
          </Boton>
        )}
        {botones ? (
          <>
            <p className="text-center text-meta text-apagado">{botones.costoVideo}</p>
            <p className="text-center text-meta text-apagado">{bloqueoVideo ?? botones.saldoVideo}</p>
            <p className="text-center text-meta text-apagado">{botones.tope}</p>
          </>
        ) : null}
      </div>

      <Boton
        variante="callado"
        cargando={reabrir.pendiente}
        deshabilitado={grabandoVoz}
        onClick={() => reabrir.ejecutar(() => reabrirGuionAccion(piezaId, version))}
      >
        Volver a revisar el guion
      </Boton>
    </div>
  )
}
```

- [ ] **Step 5: Wire the page and the screen**

`app/(app)/guion/[id]/pantalla-guion.tsx`:

1. `DatosDeGuion`: remove `costo`; add `grabacion: DatosDeGrabacion | null` and `avatarElegido: string | null` (the
   name of the approved look).
2. When `datos.grabacion !== null`:
   - after the editor section, a note: `<p className="text-meta text-apagado">Si cambias el guion o el texto, vuelves a aprobarlo.</p>`;
   - when `datos.grabacion.estado === "grabando_voz"`, instead of `EditorDeGuion` render
     `<p className="whitespace-pre-wrap text-[1.0625rem]">{datos.guion}</p>` and
     `<Nota tipo="ocupada" titulo="Estoy grabando tu voz"><p>Tarda unos segundos.</p></Nota>`;
   - the Avatar section shows `<p>{datos.avatarElegido ?? "El avatar que elegiste"}</p>` instead of `ElegirAvatar`;
   - the Revisión section is not rendered;
   - the bottom bar is `<BarraDeGrabacion piezaId={datos.id} version={version} datos={datos.grabacion} />`.
3. Otherwise (gate 1 pending) as today, with `etiqueta="Desliza para aprobar el guion"`, the note
   "Aprobar no gasta nada. Después grabas la voz y el video." instead of the voice note, and no cost line.

`app/(app)/guion/[id]/page.tsx`:

1. The `switch` gets its own branch for `guion_aprobado` and `grabando_voz` (remove them from the `en_render` branch
   added in Task 3): `break` like `guion_por_aprobar`, so both render `PantallaGuion`.
2. `guion_en_proceso` (without explanation), `en_render` and `subtitulando` render
   `<RefrescoAutomatico activo cadaMs={4000} />` inside `EstadoSencillo`.
3. `error_produccion`: read the config and `vozVigente(fila, fila.guion, config)` (when `fila.guion` is not null and
   the config reads), sign it with `urlParaVer`, and render above `AccionesDeEstado`:
   `<ReproductorVoz ... />` with the line "Mientras tanto, puedes escuchar la voz." and the HeyGen balance line
   `lineaDeSaldoVideo((await leerSaldos()).heygen)`. `ReproductorVoz` is a client component and can be rendered from
   the server page with `alEscuchar` omitted only if you make that prop optional; otherwise wrap it in a tiny client
   component `VozSuelta` in the same folder that passes `() => undefined`.
4. In the main render, compute:

```ts
  const estado = fila.estado
  const grabacion =
    estado === "guion_aprobado" || estado === "grabando_voz"
      ? await leerDatosDeGrabacion(db, { fila, estado, guion: fila.guion, zona: contexto.horario.zona })
      : null
  const avatarElegido = avatares.find((avatar) => avatar.id === fila.avatar_id)?.nombre ?? null
```

   drop `leerCostoDeGrabar` from the `Promise.all`, pass `grabacion` and `avatarElegido` to `PantallaGuion`, and add
   `<RefrescoAutomatico activo={fila.estado === "grabando_voz"} cadaMs={4000} />` next to it.
5. Delete `leerCostoDeGrabar`/`CostoDeGrabar` from `lib/datos/pantallas.ts` and their cases in
   `tests/integration/costo-de-grabar.test.ts` (delete the file if nothing else is in it).

- [ ] **Step 6: Run and see green**

Run: `pnpm type && pnpm test:run && pnpm build`
Expected: PASS. Then `pnpm dev` with the local stack and look at a piece in each state (`guion_por_aprobar`,
`guion_aprobado` with and without voice, `grabando_voz`, `error_produccion`) at 375 px wide: the bar fits, nothing
overlaps the safe area.

- [ ] **Step 7: Commit**

```bash
git add lib/datos/grabacion.ts "app/(app)/guion/[id]/" lib/datos/pantallas.ts tests/
git commit -m "feat(guion): approve without spending, then record the voice and the video

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Inicio shows the new states and refreshes itself

**Files:**
- Modify: `lib/inicio/modelo.ts`, `app/(app)/page.tsx`
- Test: `tests/unit/inicio-modelo.test.ts`

- [ ] **Step 1: Write the failing test** (append; reuse the file's piece builder, or build `PiezaDeInicio` inline)

```ts
describe("Inicio con la voz aparte", () => {
  const base = {
    titulo: "El deseo",
    explicacion: null,
    guion: "Hola.",
    pilar: null,
    publicarEn: null,
    permalink: null,
    actualizadaEn: "2026-10-04T12:00:00.000Z",
  }

  it("lists an approved script as on its way, linked to its screen", () => {
    const inicio = construirInicio({ piezas: [{ ...base, id: "a", estado: "guion_aprobado" }], ahora: Date.parse(base.actualizadaEn), zona: "America/Santiago" })
    expect(inicio.camino).toEqual([
      { id: "a", titulo: "El deseo", pilar: null, estado: "Guion aprobado · falta grabar", ocupada: false, href: "/guion/a" },
    ])
    expect(inicio.firma).toEqual([])
  })

  it("shows a voice being recorded as busy", () => {
    const inicio = construirInicio({ piezas: [{ ...base, id: "b", estado: "grabando_voz" }], ahora: Date.parse(base.actualizadaEn), zona: "America/Santiago" })
    expect(inicio.camino[0]).toMatchObject({ estado: "Grabando la voz · unos segundos", ocupada: true })
  })

  it("turns a failed voice into a notice to review", () => {
    const inicio = construirInicio({
      piezas: [{ ...base, id: "c", estado: "guion_aprobado", explicacion: "No pude grabar la voz." }],
      ahora: Date.parse(base.actualizadaEn),
      zona: "America/Santiago",
    })
    expect(inicio.camino).toEqual([])
    expect(inicio.avisos).toEqual([
      { tipo: "error", titulo: "El deseo", texto: "No pude grabar la voz.", accion: { etiqueta: "Revisar", href: "/guion/c" } },
    ])
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/inicio-modelo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `lib/inicio/modelo.ts`:

- `FilaEnCamino` gains `/** Set when Coni has something to do on its screen. */ href?: string`.
- `filaEnCamino` adds:

```ts
    case "guion_aprobado":
      // With a reason on it (a failed voice) it is a notice instead.
      return pieza.explicacion === null
        ? { ...base, estado: "Guion aprobado · falta grabar", ocupada: false, href: `/guion/${pieza.id}` }
        : null
    case "grabando_voz":
      return { ...base, estado: "Grabando la voz · unos segundos", ocupada: true }
```

- `avisoDeError` adds `case "guion_aprobado":` to the `error_produccion`/`guion_en_proceso` group, with the same rule
  as `guion_en_proceso` (null without an explanation):

```ts
    case "error_produccion":
    case "guion_en_proceso":
    case "guion_aprobado":
      return pieza.estado !== "error_produccion" && pieza.explicacion === null
        ? null
        : { tipo: "error", titulo: pieza.titulo, texto, accion: { etiqueta: "Revisar", href: `/guion/${pieza.id}` } }
```

In `app/(app)/page.tsx`: pass `href={fila.href}` to the "En camino" `FilaPieza`, and add, right after the header:

```tsx
      <RefrescoAutomatico activo={datos.piezas.some(piezaTrabajando)} cadaMs={8000} />
```

(`datos.piezas` items have `estado` and `explicacion`; import `piezaTrabajando` from `@/lib/dominio/estados`.)

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/inicio-modelo.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/inicio/modelo.ts "app/(app)/page.tsx" tests/unit/inicio-modelo.test.ts
git commit -m "feat(inicio): show approved and voice-recording pieces and refresh while they work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Balances in Ajustes

**Files:**
- Create: `app/(app)/ajustes/saldos.tsx`
- Modify: `app/(app)/ajustes/page.tsx`
- Test: `tests/unit/saldos-ajustes.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/saldos-ajustes.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TarjetaDeSaldos } from "@/app/(app)/ajustes/saldos"

describe("TarjetaDeSaldos", () => {
  it("shows both balances and explains that the API balance is not the plan", () => {
    render(<TarjetaDeSaldos voz="ElevenLabs: te quedan 23.400 de 100.000 caracteres." video="Saldo de API de HeyGen: US$ 0,00. Es aparte de tu plan de HeyGen." />)
    expect(screen.getByText("ElevenLabs: te quedan 23.400 de 100.000 caracteres.")).toBeInTheDocument()
    expect(screen.getByText("Saldo de API de HeyGen: US$ 0,00. Es aparte de tu plan de HeyGen.")).toBeInTheDocument()
    expect(
      screen.getByText(
        "El saldo de API de HeyGen es distinto de los créditos de tu plan: Conidolly graba con el saldo de API.",
      ),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/saldos-ajustes.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```tsx
// app/(app)/ajustes/saldos.tsx
import { lineaDeSaldoVideo, lineaDeSaldoVoz } from "@/lib/dominio/saldos"
import { leerSaldos } from "@/lib/saldos/reales"

export function TarjetaDeSaldos({ voz, video }: { voz: string; video: string }) {
  return (
    <div className="grid gap-2.5">
      <p>{voz}</p>
      <p>{video}</p>
      <p className="text-meta text-apagado">
        El saldo de API de HeyGen es distinto de los créditos de tu plan: Conidolly graba con el saldo de API.
      </p>
    </div>
  )
}

/** Read when Ajustes opens; a provider that does not answer reads "No pude ver tu saldo" and blocks nothing. */
export async function SaldosDeLaPagina({ zona }: { zona: string }) {
  const saldos = await leerSaldos()
  return <TarjetaDeSaldos voz={lineaDeSaldoVoz(saldos.elevenlabs, zona)} video={lineaDeSaldoVideo(saldos.heygen)} />
}
```

If the unit test cannot import this file because `lib/saldos/reales.ts` pulls server-only modules, put
`TarjetaDeSaldos` in `app/(app)/ajustes/tarjeta-de-saldos.tsx` and import it from `saldos.tsx`.

In `app/(app)/ajustes/page.tsx`, after the "Cuentas conectadas" section:

```tsx
      <Seccion titulo="Saldos" id="saldos">
        <Suspense fallback={<EsqueletoDeCuentas />}>
          <SaldosDeLaPagina zona={ajustes.zona} />
        </Suspense>
      </Seccion>
```

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/saldos-ajustes.test.tsx && pnpm type && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/ajustes/" tests/unit/saldos-ajustes.test.tsx
git commit -m "feat(ajustes): show the ElevenLabs and HeyGen API balances

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End to end

**Files:**
- Modify: `tests/e2e/servicios-falsos.ts`, `tests/e2e/ayudas.ts`, `tests/e2e/guion.spec.ts`, `tests/e2e/ajustes.spec.ts`

- [ ] **Step 1: Fake services answer the balances**

In `tests/e2e/servicios-falsos.ts`:

- `Estado` gains `heygenSaldo: number` and `elevenlabsUsados: number`; `INICIAL` sets `heygenSaldo: 50`,
  `elevenlabsUsados: 1000`.
- `/v3/users/me` answers
  `{ data: { username: "coni", billing_type: "wallet", wallet: { currency: "usd", remaining_balance: estado.heygenSaldo } } }`
  (401 branch unchanged).
- New route before the ElevenLabs voices route:

```ts
    // ElevenLabs: GET /v1/user/subscription (the characters left)
    if (ruta === "/v1/user/subscription") {
      return estado.elevenlabs === "401"
        ? responder(res, 401, { detail: { status: "invalid_api_key", message: "Invalid API key" } })
        : responder(res, 200, {
            tier: "creator",
            status: "active",
            character_count: estado.elevenlabsUsados,
            character_limit: 100_000,
            next_character_count_reset_unix: 1_760_281_200,
            can_extend_character_limit: false,
            allowed_to_extend_character_limit: false,
          })
    }
```

`EstadoDeServicios` in `ayudas.ts` gains the two optional fields.

- [ ] **Step 2: Rewrite the approval test and add the new ones** (in `tests/e2e/guion.spec.ts`)

1. `ETIQUETA` becomes `"Desliza para aprobar el guion"`.
2. In the first test, replace the cost and voice-note expectations with
   `await expect(page.getByText("Aprobar no gasta nada. Después grabas la voz y el video.")).toBeVisible()`, and the end
   of the test (after the slide) with:

```ts
  await expect(page.getByRole("button", { name: "Grabar voz" })).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_aprobado")
  expect(fila.guion).toBe(GUION_EDITADO)
  expect(fila.puerta1_por).toBe(CONI)
  expect(fila.avatar_id).toBe("look-b")
  expect(disparosRegistrados()).toEqual([])
```

3. New tests (each seeds the services with `configurarServicios(...)`, the screen data the file already uses, and the
   avatars of `LOOK_A`/`LOOK_B`; use `sembrarPieza("guion_aprobado")` for an approved piece):

```ts
test("she records the voice alone, listens to it, and then records the video", async ({ page }) => {
  await configurarServicios()
  const id = await sembrarPieza("guion_aprobado")
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText(/^Grabar voz: ~\d+ caracteres \(US\$ \d+,\d\d\)$/)).toBeVisible()
  await expect(page.getByText("ElevenLabs: te quedan 99.000 de 100.000 caracteres. Se renuevan el 12 de octubre.")).toBeVisible()
  await expect(page.getByText("Saldo de API de HeyGen: US$ 50,00. Es aparte de tu plan de HeyGen.")).toBeVisible()
  await page.getByRole("button", { name: "Grabar voz" }).click()
  await expect(page.getByText("Estoy grabando tu voz")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("grabando_voz")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "voz", piezaId: id, nueva: false }])

  // What grabar-voz does when it finishes; the screen picks it up by itself.
  const fila = await leerFila(id)
  const config = leerConfigProduccion(produccionDeLaPrueba)
  await ajustarPieza(id, { estado: "guion_aprobado", audio_id: claveDeToma(id, huellaDelGuion(fila.guion, config.elevenlabs), fila.intento) })
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole("button", { name: "Volver a grabar voz" })).toBeVisible()

  await page.getByRole("button", { name: "Grabar video" }).click()
  await page.getByRole("button", { name: "Sí, grabar" }).click()
  await expect(page.getByText("Aprobado. Estoy grabando el video.")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("en_render")
  expect(disparosRegistrados().at(-1)).toMatchObject({ tarea: "grabar", piezaId: id })
})

test("an empty HeyGen API wallet disables the video and says where to top up", async ({ page }) => {
  await configurarServicios({ heygenSaldo: 0 })
  const id = await sembrarPieza("guion_aprobado")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Grabar video" })).toBeDisabled()
  await expect(page.getByText(/^Tu saldo de API de HeyGen no alcanza/)).toBeVisible()
  // The voice alone still works without HeyGen.
  await expect(page.getByRole("button", { name: "Grabar voz" })).toBeEnabled()
})

test("a balance that does not answer is said, and blocks nothing", async ({ page }) => {
  await configurarServicios({ elevenlabs: "401" })
  const id = await sembrarPieza("guion_aprobado")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("No pude ver tu saldo de ElevenLabs.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Grabar voz" })).toBeEnabled()
})
```

`produccionDeLaPrueba` is the production config the spec file writes into `ajustes` (the object built from `BASE` and
the looks); import `claveDeToma` from `@/lib/dominio/voz`, `huellaDelGuion` from `@/lib/produccion/voz`,
`leerConfigProduccion` from `@/lib/proveedores/config`, `ajustarPieza`/`sembrarPieza` from `../integration/siembra`.
The fake services must hold the Vault keys the app reads: check how `ajustes.spec.ts` seeds the `heygen` and
`elevenlabs` secrets and do the same in a `beforeEach`. If `toBeDisabled` does not match how `Boton` disables, assert
`aria-disabled`.

4. In `tests/e2e/ajustes.spec.ts`, add: the "Saldos" section shows both lines and the explainer.

- [ ] **Step 3: Run**

Run: `pnpm test:e2e`
Expected: all green (the known red window closes here).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): approve without spending, record voice, balances, then video

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Verification and handoff notes

**Files:**
- Modify: `docs/TRASPASO.md`

- [ ] **Step 1: Full verification**

Run, in order: `pnpm check` (safe mode), the `"use client"` grep from the rules, `pnpm type`, `pnpm test:run`,
`supabase db reset && pnpm test:db`, `pnpm test:e2e`, `pnpm build`, `pnpm lint` (only the known failure).
`git diff main --stat` touches no file outside the file map plus tests. `grep -rn '—' lib app components supabase/migrations/2026100400*`
prints nothing new.

- [ ] **Step 2: Update `docs/TRASPASO.md`**

Under "Lo que está hecho", add a bullet: approve, voice and video in three steps (spec and plan paths), the new states,
the `grabar-voz` task, the voice keyed by text (`voces/<id>/t-<huella>-<toma>.mp3`), polling, balances. Under
"Producción", note migrations up to `20261004000110` once Federico applies them, and the Trigger version once deployed.

- [ ] **Step 3: Commit**

```bash
git add docs/TRASPASO.md
git commit -m "docs: handoff notes for the three-step approval

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Production checklist (with Federico, only when he asks)

1. `git push origin main`.
2. **Database**, Federico from the macOS Terminal (not the app's terminal): `supabase db push`. It applies
   `20261004000100` and `20261004000110` only; `supabase/pendientes/20261003000350_borrar_vinculos.sql` must not be in
   `supabase/migrations/`. Check: `select unnest(enum_range(null::public.estado_pieza))` lists `guion_aprobado` and
   `grabando_voz`.
3. **Trigger** (from the repo, after `pnpm install`):
   `TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check`.
   The dashboard lists the new task `grabar-voz`.
4. **Immediately after**, Vercel (the push does not deploy): `vercel deploy --prod --yes`. Confirm it is served
   (the Guion slide reads "Desliza para aprobar el guion"; hard-refresh before judging).
5. **Pieces in flight** (read-only check before and after): `select id, estado, puerta1_formula, audio_id from
   piezas where estado in ('en_render','subtitulando','error_produccion')`. Pieces in render keep going; `51fe0f3b` in
   `error_produccion` reuses its voice on "Reintentar" (no new ElevenLabs spend in `gastos`).
6. **Smoke test** on conidolly.vercel.app with the Coni test account:
   - approve a script: the piece is `guion_aprobado`, no new row in `gastos`, no run in Trigger;
   - "Grabar voz": a `grabar-voz` run, the screen changes by itself, the player plays, one `elevenlabs/voz` spend;
   - approve the same text again after "Volver a revisar el guion": "Grabar voz" shows "Volver a grabar voz" (or, if the
     voice key matches, the player) and no second ElevenLabs spend appears unless "Volver a grabar voz" is tapped;
   - Ajustes and the Guion screen show both balances (or "No pude ver tu saldo..." if the ElevenLabs key lacks
     `user_read`: note it as open question 2);
   - "Grabar video" **only if the HeyGen API wallet has balance** (otherwise the button must be disabled with the top-up
     text).
7. Reviewer notes on order and rollback:
   - The order is database, then Trigger, then Vercel. If it is reversed (Vercel before Trigger), "Grabar voz" starts a
     `grabar-voz` run that no worker knows: the piece sits in `grabando_voz` until the maintenance hands it back after
     15 minutes, and "Grabar video" in the meantime makes the voice again inside `grabar-pieza`, paying ElevenLabs a
     second time when Coni then records the voice by itself.
   - A Trigger-only rollback (old worker, new app) makes the old `grabar-pieza` ignore the `t-` takes: pieces already
     in `en_render` with a take of the new kind pay their voice again. Roll back the app and the worker together.
   - The rollback SQL that moves pieces back to `guion_por_aprobar` must bump `version` by 1 on every row it touches
     (the trigger refuses an update that does not), and clear `puerta1_hash`, `puerta1_en` and `explicacion`.
8. Rollback: previous Vercel deployment (`vercel rollback`) and previous Trigger version; before that, move pieces in
   `guion_aprobado`/`grabando_voz` back to `guion_por_aprobar` with gate 1 cleared (SQL by Federico).

## Self-review against the spec

| Spec decision | Task |
|---|---|
| 1. States and transitions (`guion_aprobado`, `grabando_voz`, events, `intento` rule) | 1, 3 |
| 2. Voice keyed by text + voice; reuse; binding before HeyGen; legacy pieces | 2, 5, 13 (`vozVigente`) |
| 3. Separate `grabar-voz` task, keys, failure paths, quota text, sweeper | 4, 6, 7, 8 |
| 4. Migrations (enum, constraint, trigger, edit functions) | 1 |
| 5. Polling (Guion 4 s, Inicio 8 s, visibility) | 12, 13, 14 |
| 6. Balances (providers, cache, rules, no block on failure, no server re-check) | 9, 10, 11, 13, 15 |
| 7. Guion screen copy and states (including `error_produccion` player) | 13 |
| 8. Inicio, calendar, queue, video redirect | 3, 14 |
| 9. Unchanged guarantees | 1 (DB guards), 5 and 6 (hash checks before spend) |
| Deploy order and pieces in flight | Production checklist |
