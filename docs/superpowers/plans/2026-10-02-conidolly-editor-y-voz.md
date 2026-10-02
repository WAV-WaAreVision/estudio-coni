# Conidolly: rename, script editor and voice after gate 1. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product to Conidolly, let Coni edit the script before gate 1 with version history, and generate the ElevenLabs voice only after gate 1 approves the final script.

**Architecture:** Spec: `docs/superpowers/specs/2026-10-02-conidolly-ingesta-design.md` (Plan A section). The gate-1 hash drops the audio and gains the publication text, with a `puerta1_formula` column so pieces approved under the old formula keep recording. Voice generation moves from `lib/produccion/producir.ts` into `lib/produccion/grabar.ts`, before the HeyGen call. Script edits go through a new Coni-only RPC that also writes a `guion_versiones` row; `guardar_borrador` writes the Claude version.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres, RLS, plpgsql), Trigger.dev v4, Vitest, Playwright, Biome.

**Rules (same as every plan in this repo):** strict TDD (failing test first, seen red), one commit per task with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never `as any`, `@ts-expect-error`, non-null assertions or silent catches; Biome safe mode only and `"use client"` stays line 1; semantic tokens only; copy in Spanish of Chile with `tú` and no em dashes; no real network in tests; migrations in range `20261002000100`-`20261002000199`; never run anything against the hosted project (`mvfytttfxmzzjajecsch`). Commands: `pnpm lint`, `pnpm type`, `pnpm test:run`, `pnpm test:db`, `pnpm build`, `pnpm db:types` (after `supabase db reset`), E2E with `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell pnpm test:e2e`. If sign-in E2E fails after a reset: `supabase stop && supabase start`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/diseno/marca.ts:6` | Modify | `NOMBRE_DE_LA_APP = "Conidolly"`, add `NOMBRE_CORTO = "Conidolly"`, `URL_DE_LA_APP = "https://conidolly.vercel.app"` |
| `lib/avisos/tipos.ts:42` | Modify | `TITULO_DE_PUSH` reuses `NOMBRE_DE_LA_APP` |
| `app/manifest.ts:7`, `public/sw.js:1,4`, `app/(app)/ajustes/avisos-del-celular.tsx:167,215`, `supabase/templates/codigo.html:2`, `supabase/config.toml:250,431,432,444` | Modify | Name and URL literals |
| `next.config.ts` | Modify | Permanent redirect from host `estudio-coni.vercel.app` to `conidolly.vercel.app` |
| `lib/dominio/puertas.ts:14-17` | Modify | `hashPuerta1` formula 2 (guion, texto, avatar) and legacy formula 1 |
| `supabase/migrations/20261002000100_puerta1_formula.sql` | Create | `piezas.puerta1_formula smallint`, existing approved rows set to 1 |
| `lib/dominio/estados.ts` | Modify | `guion_listo` without audio; `aprobar_guion` without audio; new `voz_lista` event in `en_render` |
| `lib/produccion/producir.ts:230-270` | Modify | Remove the voice step |
| `lib/produccion/grabar.ts:176-246, 286-300` | Modify | Generate the voice when `audio_id` is null, before HeyGen; pick hash formula by `puerta1_formula` |
| `lib/acciones/piezas.ts:208-240` | Modify | `aprobarGuion` without audio, formula 2 |
| `lib/datos/pantallas.ts:101` (`leerCostoDeGrabar`) | Modify | Include the voice estimate |
| `supabase/migrations/20261002000110_guion_versiones.sql` | Create | `guion_versiones` table, RLS, `editar_guion_como_coni` RPC, `guardar_borrador` writes the Claude version |
| `lib/acciones/guion.ts` | Create | `editarGuion`, `volverAVersionDeClaude` |
| `app/(app)/piezas/acciones.ts` | Modify | Server actions wrapping the two above |
| `components/editor-de-guion.tsx` | Create | Plain multi-paragraph editor with word and seconds counters |
| `lib/dominio/duracion.ts` | Create | `estimarSegundos(texto)` and the 75 to 150 word target |
| `app/(app)/guion/[id]/pantalla-guion.tsx` | Modify | Remove `ReproductorVoz`; add the editor; approval no longer waits for listening |

---

### Task 1: Rename the product name in code

**Files:**
- Modify: `lib/diseno/marca.ts`, `lib/avisos/tipos.ts`, `app/manifest.ts`, `public/sw.js`, `app/(app)/ajustes/avisos-del-celular.tsx`, `supabase/templates/codigo.html`
- Test: `tests/unit/manifest.test.ts:13`, `tests/unit/push.test.ts:24`, `tests/unit/service-worker.test.ts:86,93,123`, `tests/unit/avisos-del-celular.test.tsx:81`, `tests/integration/avisos-push.test.ts:63,140`, `tests/e2e/avisos.spec.ts:154`

- [ ] **Step 1: Change the expectations first.** In each test listed above, replace `"Estudio de Coni"` with `"Conidolly"` and in `tests/unit/manifest.test.ts:13` replace `toBe("Estudio")` with `toBe("Conidolly")`. Do not touch tests where "Estudio" is an avatar look name (`agregar-avatar`, `elegir-avatar`, `config-produccion:220`, `heygen-api:440/454`, `avatares-sql`, `acciones-piezas:206`, `tests/e2e/guion.spec.ts`).

- [ ] **Step 2: Run them red.**

Run: `pnpm vitest run tests/unit/manifest.test.ts tests/unit/push.test.ts tests/unit/service-worker.test.ts tests/unit/avisos-del-celular.test.tsx`
Expected: FAIL, received "Estudio de Coni" / "Estudio".

- [ ] **Step 3: Change the code.**

`lib/diseno/marca.ts`:
```ts
export const NOMBRE_DE_LA_APP = "Conidolly"
export const URL_DE_LA_APP = "https://conidolly.vercel.app"
```
`lib/avisos/tipos.ts:42`: `export const TITULO_DE_PUSH = NOMBRE_DE_LA_APP` (import from `@/lib/diseno/marca`).
`app/manifest.ts:7`: `short_name: NOMBRE_DE_LA_APP`.
`public/sw.js:1` comment "Service worker of Conidolly" and `:4` `const TITULO_POR_DEFECTO = "Conidolly"` (the worker cannot import TS).
`app/(app)/ajustes/avisos-del-celular.tsx:167` "busca Conidolly y activa", `:215` "Abre Conidolly desde tu pantalla de inicio".
`supabase/templates/codigo.html:2` "Escríbelo en Conidolly:".

- [ ] **Step 4: Run the unit and integration tests green.**

Run: `pnpm test:run && pnpm test:db`
Expected: PASS, same counts as before.

- [ ] **Step 5: Grep for leftovers.**

Run: `grep -rn "Estudio de Coni" app components lib public supabase/templates tests | grep -v node_modules`
Expected: no output.

- [ ] **Step 6: Commit** `feat(marca): rename the product to Conidolly`.

### Task 2: New URL in config and the redirect from the old host

**Files:**
- Modify: `supabase/config.toml:250,431,432,444`, `next.config.ts`
- Test: `tests/unit/redireccion-de-dominio.test.ts` (create)

- [ ] **Step 1: Write the failing test** for the redirect rule exported from `next.config.ts`.

```ts
import { describe, expect, test } from "vitest"
import config from "@/next.config"

describe("redirect from the old domain", () => {
  test("sends every path on estudio-coni.vercel.app to conidolly.vercel.app, permanently", async () => {
    const reglas = (await config.redirects?.()) ?? []
    expect(reglas).toContainEqual({
      source: "/:ruta*",
      has: [{ type: "host", value: "estudio-coni.vercel.app" }],
      destination: "https://conidolly.vercel.app/:ruta*",
      permanent: true,
    })
  })
})
```

- [ ] **Step 2: Run it red.** `pnpm vitest run tests/unit/redireccion-de-dominio.test.ts`. Expected: FAIL (no redirects).

- [ ] **Step 3: Add the redirect** in `next.config.ts`:

```ts
async redirects() {
  return [
    {
      source: "/:ruta*",
      has: [{ type: "host", value: "estudio-coni.vercel.app" }],
      destination: "https://conidolly.vercel.app/:ruta*",
      permanent: true,
    },
  ]
},
```

- [ ] **Step 4: Run it green.** Same command. Expected: PASS.

- [ ] **Step 5: Update `supabase/config.toml`**: `:250` `subject = "Tu código para entrar a Conidolly"`; `:431` `site_url = "https://conidolly.vercel.app"`; `:432` `additional_redirect_urls = ["https://conidolly.vercel.app/**", "https://estudio-coni.vercel.app/**", "https://*-federico-1787s-projects.vercel.app/**"]`; `:444` `sender_name = "Conidolly"`. Then `supabase status` must still print the local API URL (the file parses).

- [ ] **Step 6: Commit** `chore(dominio): conidolly.vercel.app, redirect from the old host`.

### Task 3: Gate-1 hash formula 2 with a stored formula version

**Files:**
- Modify: `lib/dominio/puertas.ts:14-17`
- Create: `supabase/migrations/20261002000100_puerta1_formula.sql`
- Test: `tests/unit/puertas.test.ts`, `tests/integration/puerta1-formula.test.ts` (create)

- [ ] **Step 1: Failing unit tests** (append to `tests/unit/puertas.test.ts`):

```ts
describe("hashPuerta1 formula 2", () => {
  const base = { guion: "Hola", texto: "Texto", avatarId: "av1" }

  test("covers the script, the publication text and the avatar, and no audio", () => {
    const h = hashPuerta1({ formula: 2, ...base })
    expect(hashPuerta1({ formula: 2, ...base, guion: "Chao" })).not.toBe(h)
    expect(hashPuerta1({ formula: 2, ...base, texto: "Otro" })).not.toBe(h)
    expect(hashPuerta1({ formula: 2, ...base, avatarId: "av2" })).not.toBe(h)
  })

  test("formula 1 still reproduces the hash of pieces approved before this change", () => {
    const legado = sha256Hex(JSON.stringify(["puerta1", "Hola", "audio/1.mp3", "av1"]))
    expect(hashPuerta1({ formula: 1, guion: "Hola", audioId: "audio/1.mp3", avatarId: "av1" })).toBe(legado)
  })
})
```
(`sha256Hex` is the test's own helper using `node:crypto`; check the existing tests in that file for one.)

- [ ] **Step 2: Run red.** `pnpm vitest run tests/unit/puertas.test.ts`. Expected: FAIL on the new signature.

- [ ] **Step 3: Implement** in `lib/dominio/puertas.ts`:

```ts
export type ArtefactoPuerta1 =
  | { formula: 1; guion: string; audioId: string; avatarId?: string | null }
  | { formula: 2; guion: string; texto: string; avatarId: string }

// Formula 1 hashed the voice, generated before gate 1. Since 2026-10-02 the voice is generated after gate 1, so
// formula 2 hashes what Coni approves: the script, the publication text and the avatar.
export function hashPuerta1(artefacto: ArtefactoPuerta1): string {
  if (artefacto.formula === 1) {
    const base = ["puerta1", artefacto.guion, artefacto.audioId]
    return sha256(artefacto.avatarId ? [...base, artefacto.avatarId] : base)
  }
  return sha256(["puerta1/2", artefacto.guion, artefacto.texto, artefacto.avatarId])
}
```
Plan B adds the chosen sources to gate 1; it will add formula 3 the same way instead of changing formula 2.
Fix every caller to pass `formula` (TypeScript lists them: `lib/acciones/piezas.ts:220`, `lib/produccion/grabar.ts:246`). Tasks 5 and 6 change those callers for real; here keep them compiling with `formula: 1` and the existing fields.

- [ ] **Step 4: Migration** `20261002000100_puerta1_formula.sql`:

```sql
alter table public.piezas add column puerta1_formula smallint check (puerta1_formula in (1, 2));
update public.piezas set puerta1_formula = 1 where puerta1_hash is not null;
comment on column public.piezas.puerta1_formula is
  'Which hashPuerta1 formula signed gate 1: 1 = script + voice (+ avatar), 2 = script + text + avatar.';
```
Integration test `tests/integration/puerta1-formula.test.ts`: after `supabase db reset`, a seeded approved piece has `puerta1_formula = 1`, a new approval stores 2 (written in Task 6). Start with the first assertion only.

- [ ] **Step 5: Run green.** `supabase db reset && pnpm db:types && pnpm test:run && pnpm test:db`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(puertas): gate-1 hash formula 2 without the voice, formula kept per piece`.

### Task 4: State machine without voice before gate 1

**Files:**
- Modify: `lib/dominio/estados.ts:57-85,178-205`
- Test: `tests/unit/estados.test.ts`

- [ ] **Step 1: Failing tests:**

```ts
test("guion_listo moves to guion_por_aprobar with no audio", () => {
  const r = transicionar(piezaEn("guion_en_proceso"), { tipo: "guion_listo" })
  expect(r.estado).toBe("guion_por_aprobar")
  expect(r.audioId).toBeNull()
})

test("Coni approves gate 1 without any audio", () => {
  const r = transicionar(piezaEn("guion_por_aprobar", { audioId: null }), aprobarGuion({ hashVisto: "h", hashActual: "h" }))
  expect(r.estado).toBe("en_render")
})

test("voz_lista stores the audio while recording and keeps en_render", () => {
  const r = transicionar(piezaEn("en_render", { audioId: null }), { tipo: "voz_lista", audioId: "audio/p/1.mp3" })
  expect(r).toMatchObject({ estado: "en_render", audioId: "audio/p/1.mp3" })
})

test("voz_lista outside en_render is refused", () => {
  expect(() => transicionar(piezaEn("video_por_aprobar"), { tipo: "voz_lista", audioId: "a" })).toThrow()
})

test("regrabar keeps the audio; cambiar_guion clears it", () => {
  expect(transicionar(piezaEn("video_por_aprobar", { audioId: "a" }), { tipo: "regrabar" }).audioId).toBe("a")
  expect(transicionar(piezaEn("video_por_aprobar", { audioId: "a" }), { tipo: "cambiar_guion" }).audioId).toBeNull()
})
```
(Use the file's existing helpers to build pieces and events; `piezaEn` and `aprobarGuion` above stand for them.)

- [ ] **Step 2: Run red.** `pnpm vitest run tests/unit/estados.test.ts`.

- [ ] **Step 3: Implement:** `guion_listo` has no `audioId` field and sets `audioId: null`; `aprobar_guion` drops the `audioId` precondition; add the event `{ tipo: "voz_lista"; audioId: string }`, valid only from `en_render`, which sets `audioId` and keeps the state. `regrabar` and `cambiar_guion` already behave as tested; keep them.

- [ ] **Step 4: Run green**, then `pnpm type` and fix callers that still pass `audioId` to `guion_listo` (only `lib/produccion/producir.ts`, rewritten in Task 5).

- [ ] **Step 5: Commit** `feat(estados): no voice before gate 1, voz_lista while recording`.

### Task 5: `producir-pieza` stops generating the voice

**Files:**
- Modify: `lib/produccion/producir.ts:96-99,230-270`
- Test: `tests/integration/producir.test.ts`

- [ ] **Step 1: Failing integration test** (add to `producir.test.ts`): after `producirPieza`, the piece is `guion_por_aprobar`, `audio_id` is null, `sim.voces` is empty (no ElevenLabs call) and no `gastos` row with `proveedor = 'elevenlabs'` exists. Update the existing assertions that expected a voice.

- [ ] **Step 2: Run red.** `pnpm vitest run --config vitest.integration.config.ts tests/integration/producir.test.ts`.

- [ ] **Step 3: Implement:** delete the block at `:230-270` that reserves the ElevenLabs spend, calls `generarVoz`, uploads and passes `audioId`; call `transicionar(..., { tipo: "guion_listo" })`. Remove the `elevenlabs.voice_id` and `leerSecreto(db, "elevenlabs")` checks at `:96-99` from this path (they move to Task 6). Keep `estimarCostoVoz` exported: Task 6 and Task 7 use it.

- [ ] **Step 4: Run green**, plus `pnpm test:run`.

- [ ] **Step 5: Commit** `feat(producir): write and review the script only, no voice before gate 1`.

### Task 6: Recording generates the voice first

**Files:**
- Modify: `lib/produccion/grabar.ts:176-246,286-300`, `lib/acciones/piezas.ts:208-240`
- Test: `tests/integration/grabar.test.ts`, `tests/integration/acciones-piezas.test.ts`, `tests/integration/puerta1-formula.test.ts`

- [ ] **Step 1: Failing tests:**
  - `acciones-piezas`: `aprobarGuion` approves a piece whose `audio_id` is null, stores `puerta1_formula = 2` and the formula-2 hash of guion, texto and avatar.
  - `grabar`: a formula-2 piece with `audio_id` null reserves an ElevenLabs spend (`paso = 'voz'`, key `elevenlabs:<pieza>:<intento>`), calls ElevenLabs once, uploads the audio, stores `audio_id`, then calls HeyGen with that audio. A retry of the same run does not call ElevenLabs again (spend key and stored `audio_id` make it idempotent).
  - `grabar`: a formula-1 piece (legacy, `audio_id` set) records without calling ElevenLabs and its hash still matches.
  - `grabar`: if the ElevenLabs spend would pass the monthly cap, the piece is not recorded and the result is `tope`, same as the HeyGen cap path.
  - `grabar`: missing `elevenlabs.voice_id` or missing ElevenLabs secret ends in `error_produccion` with a reason for Coni, before any spend.

- [ ] **Step 2: Run red.** `pnpm vitest run --config vitest.integration.config.ts tests/integration/grabar.test.ts tests/integration/acciones-piezas.test.ts`.

- [ ] **Step 3: Implement.**
  - `aprobarGuion`: drop the `audio_id` requirement; compute `hashPuerta1({ formula: 2, guion: fila.guion, texto: fila.texto, avatarId: avatar })`; write `puerta1_formula: 2` in the same update.
  - `grabar.ts` around `:246`: hash with `fila.puerta1_formula === 1 ? { formula: 1, guion, audioId: fila.audio_id, avatarId: fila.avatar_id } : { formula: 2, guion, texto: fila.texto, avatarId: fila.avatar_id }`. A formula-1 piece with a null `audio_id` is a data error: stop with `sin_aprobacion`.
  - Before `crearElVideo`: if `audio_id` is null, run the voice step moved from `producir.ts` (reserve with `estimarCostoVoz(guion)`, `generarVoz`, `claveAudio`, `almacen.subir`, confirm the spend, `transicionar(..., { tipo: "voz_lista", audioId })`, persist). Then continue to HeyGen as today.

- [ ] **Step 4: Run green**, plus the whole `pnpm test:db`.

- [ ] **Step 5: Commit** `feat(grabar): generate the voice after gate 1, right before HeyGen`.

### Task 7: Cost shown at gate 1 includes the voice

**Files:**
- Modify: `lib/datos/pantallas.ts:101` (`leerCostoDeGrabar`)
- Test: `tests/integration/pantallas.test.ts` (or the file that covers `leerCostoDeGrabar`)

- [ ] **Step 1: Failing test:** for a piece in `guion_por_aprobar`, `leerCostoDeGrabar` returns the HeyGen estimate plus `estimarCostoVoz(guion)`, and the "would pass the cap" flag uses that sum.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement** the sum.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(costos): gate-1 cost includes the voice`.

### Task 8: Script versions table and Coni's edit RPC

**Files:**
- Create: `supabase/migrations/20261002000110_guion_versiones.sql`
- Test: `tests/integration/guion-versiones.test.ts` (create)

- [ ] **Step 1: Failing integration tests:**
  - `guardar_borrador` (service role) inserts a `guion_versiones` row with `autor = 'claude'`, `numero = 1`.
  - `editar_guion_como_coni(p_pieza, p_version, p_guion, p_texto, p_revision)` as Coni in `guion_por_aprobar` updates `piezas.guion`, `piezas.texto`, `piezas.revision`, bumps `version`, and inserts a version with `autor = 'coni'`, `numero = previous + 1`.
  - The maintainer is refused (`42501`), any state other than `guion_por_aprobar` is refused, a stale `p_version` raises `40001 version_desfasada`, and a revision with a blocking finding is refused by the existing `exigir_revision_limpia` trigger.
  - Coni and the maintainer can `select` versions; nobody can `update` or `delete` them.

- [ ] **Step 2: Run red.** `supabase db reset && pnpm vitest run --config vitest.integration.config.ts tests/integration/guion-versiones.test.ts`.

- [ ] **Step 3: Migration:**

```sql
create table public.guion_versiones (
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  numero integer not null check (numero >= 1),
  guion text not null,
  texto text,
  autor text not null check (autor in ('claude', 'coni')),
  creada_por uuid,
  creada_en timestamptz not null default now(),
  primary key (pieza_id, numero)
);
alter table public.guion_versiones enable row level security;
create policy "coni y wav leen versiones" on public.guion_versiones
  for select to authenticated using (public.es_coni() or public.es_mantenedor());

create function public.siguiente_version_de_guion(p_pieza uuid) returns integer
language sql stable as $$
  select coalesce(max(numero), 0) + 1 from public.guion_versiones where pieza_id = p_pieza
$$;

create function public.editar_guion_como_coni(
  p_pieza uuid, p_version integer, p_guion text, p_texto text, p_revision jsonb
) returns public.piezas
language plpgsql security definer set search_path = '' as $$
declare
  fila public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_guion';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;
  update public.piezas
     set guion = p_guion, texto = p_texto, revision = p_revision, version = version + 1
   where id = p_pieza and version = p_version and estado = 'guion_por_aprobar'
  returning * into fila;
  if fila.id is null then
    if exists (select 1 from public.piezas where id = p_pieza and estado <> 'guion_por_aprobar') then
      raise exception using errcode = '22023', message = 'guion_fuera_de_revision';
    end if;
    raise exception using errcode = '40001', message = 'version_desfasada';
  end if;
  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'coni', auth.uid());
  return fila;
end;
$$;
revoke execute on function public.editar_guion_como_coni(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function public.editar_guion_como_coni(uuid, integer, text, text, jsonb) to authenticated;
```
Redefine `guardar_borrador` (copy its body from `20261001000900_guardar_borrador.sql`) adding, after the update, `insert into public.guion_versiones (pieza_id, numero, guion, texto, autor) values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'claude');`. Keep its grants (service role only). Check that the audit trigger on `piezas` records Coni as actor for the edit.

- [ ] **Step 4: Run green**, `pnpm db:types`, then `pnpm test:db`.

- [ ] **Step 5: Commit** `feat(guion): version history and Coni's edit RPC`.

### Task 9: Edit actions with the full review

**Files:**
- Create: `lib/acciones/guion.ts`
- Modify: `app/(app)/piezas/acciones.ts`
- Test: `tests/integration/acciones-guion.test.ts` (create)

- [ ] **Step 1: Failing tests:**
  - `editarGuion(deps, { piezaId, version, guion, texto })` runs `revisarGuion` (deterministic) and `revisarConClaude`, stores both findings in `revision`, calls `editar_guion_como_coni`, and returns `{ ok: true, version, revision }`.
  - A blocking deterministic finding returns `{ ok: false, motivo: "revision_bloquea", hallazgos }` and does not call Claude or the RPC.
  - The Claude review reserves and confirms a spend (`proveedor = 'anthropic'`, `paso = 'revision'`); with the cap reached it returns `{ ok: false, motivo: "tope" }` without writing.
  - `volverAVersionDeClaude(deps, { piezaId, version })` re-saves the latest `autor = 'claude'` version through the same path (review included).
  - Errors show es-CL messages without technical words (follow `lib/acciones/piezas.ts` `Falla` style).

- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement** `lib/acciones/guion.ts` following `editarTexto` in `lib/acciones/piezas.ts:249` (same `conSesionDeConi` guard, same error mapping), and add `editarGuionAccion` and `volverAVersionDeClaudeAccion` to `app/(app)/piezas/acciones.ts`.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(guion): edit and restore actions with the full review`.

### Task 10: Duration estimate

**Files:**
- Create: `lib/dominio/duracion.ts`
- Test: `tests/unit/duracion.test.ts`

- [ ] **Step 1: Failing tests:**

```ts
import { describe, expect, test } from "vitest"
import { contarPalabras, estimarSegundos, estadoDeLargo } from "@/lib/dominio/duracion"

describe("script length", () => {
  test("counts words across paragraphs and ignores extra spaces", () => {
    expect(contarPalabras("Hola  tú.\n\nAsí es.")).toBe(4)
  })
  test("estimates seconds at 2.5 words per second, rounded", () => {
    expect(estimarSegundos("palabra ".repeat(100))).toBe(40)
  })
  test("flags short, ok and long against the 75 to 150 word target", () => {
    expect(estadoDeLargo(60)).toBe("corto")
    expect(estadoDeLargo(100)).toBe("bien")
    expect(estadoDeLargo(160)).toBe("largo")
  })
})
```

- [ ] **Step 2: Run red.** `pnpm vitest run tests/unit/duracion.test.ts`.
- [ ] **Step 3: Implement:**

```ts
// The editorial line asks for 30 to 60 s, 75 to 150 words: about 2.5 words per second.
export const PALABRAS_POR_SEGUNDO = 2.5
export const PALABRAS_MINIMAS = 75
export const PALABRAS_MAXIMAS = 150

export function contarPalabras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length
}

export function estimarSegundos(texto: string): number {
  return Math.round(contarPalabras(texto) / PALABRAS_POR_SEGUNDO)
}

export function estadoDeLargo(palabras: number): "corto" | "bien" | "largo" {
  if (palabras < PALABRAS_MINIMAS) return "corto"
  if (palabras > PALABRAS_MAXIMAS) return "largo"
  return "bien"
}
```
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(duracion): word count and seconds estimate for the editor`.

### Task 11: Editor on the Guion screen, voice player removed

**Files:**
- Create: `components/editor-de-guion.tsx`
- Modify: `app/(app)/guion/[id]/pantalla-guion.tsx:44-190`, `app/(app)/guion/[id]/page.tsx` (stop loading `audioUrl`)
- Test: `tests/unit/editor-de-guion.test.tsx` (create), `tests/e2e/guion.spec.ts`

- [ ] **Step 1: Failing component tests** (`@testing-library/react`, as in the other `.test.tsx` files):
  - Shows the script in a `<textarea>` labelled "Guion" and the publication text in one labelled "Texto de la publicación".
  - Shows "N palabras · ≈ S s" updating as she types, with the state "Un poco corto", "Bien" or "Un poco largo".
  - "Guardar cambios" is disabled until something changed; while saving it reads "Guardando…"; on success it shows the review findings by type and "Guardado".
  - "Volver a la versión de Claude" asks for an in-page confirmation (no `window.confirm`) and then calls the restore action.
  - With unsaved changes, the approval slider is disabled with the message "Guarda tus cambios antes de aprobar".
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement** `components/editor-de-guion.tsx` (`"use client"` on line 1; textareas with visible labels and `id`s; counters with `aria-live="polite"`; semantic tokens from `app/globals.css`). In `pantalla-guion.tsx` remove the `ReproductorVoz` section (`:128`) and the "escuchar la voz" requirement (`:59`); place the editor where the script was shown; keep `ElegirAvatar`, `TextoDeInstagram` (now inside the editor), `MarcaRevision` and `DeslizarParaAprobar`. Add a line under the slider: "La voz se genera cuando apruebes; la escuchas en el video".
- [ ] **Step 4: E2E** in `tests/e2e/guion.spec.ts`: Coni edits a sentence, saves, sees "Guardado", approves without any audio, and the piece goes to recording; the "volver a Claude" path restores the original text. Capture `guion-editor.png` (390x844) with the existing `capturar` helper.
- [ ] **Step 5: Run** `pnpm test:run` and the full E2E.
- [ ] **Step 6: Commit** `feat(guion): script editor on the Guion screen, voice heard in the video`.

### Task 12: Full verification and plan notes

- [ ] **Step 1:** `supabase db reset && pnpm db:types && pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build` and the full E2E. Expected: all green.
- [ ] **Step 2:** `grep -rn "Estudio de Coni\|estudio-coni.vercel.app" app components lib public supabase/templates` returns only the redirect in `next.config.ts` and the old URL kept in `additional_redirect_urls`.
- [ ] **Step 3:** Append "Plan A notes" to this file: decisions taken while implementing, counts, screenshots, and the production checklist below.
- [ ] **Step 4: Commit** `docs(plan): Plan A notes`.

## Production checklist (done by the lead with Federico, not by the implementer)

1. `supabase db push` (migrations `20261002000100`, `20261002000110`).
2. Deploy Trigger.dev (voice now in `grabar-pieza`) and Vercel production.
3. Add the alias: `vercel alias set <deployment> conidolly.vercel.app` (check availability first) and confirm `estudio-coni.vercel.app` redirects.
4. `supabase config push --project-ref mvfytttfxmzzjajecsch` with `RESEND_API_KEY` read silently (new subject, sender name, site_url).
5. Meta app: add `https://conidolly.vercel.app/api/meta/callback` as redirect URI and update `META_REDIRECT_URI` in Vercel.
6. Vercel env `AVISOS_REMITENTE` and Trigger.dev env `AVISOS_REMITENTE`: `Conidolly <avisos@wearevision.cl>`.
7. Update the guide artifact for Coni (name, URL, step 4 without listening to the voice, voice heard in the video).

## Plan A notes

### What shipped (oldest first)

- 6573c42 feat(marca): rename the product to Conidolly
- e6c2eca chore(dominio): conidolly.vercel.app, redirect from the old host
- 6e0c600 feat(puertas): gate-1 hash formula 2 without the voice, formula kept per piece
- 97eed96 fix(puertas): no backfill, a null formula means the legacy one
- 0288982 feat(estados): no voice before gate 1, voz_lista while recording
- ca90401 feat(producir): write and review the script only, no voice before gate 1
- 597b9b9 docs(producir): the voice is no longer made here
- 4bbe156 feat(grabar): generate the voice after gate 1, right before HeyGen
- 9c32f6b fix(grabar): never pay the voice twice when a run is retried
- 0e48287 feat(ideas): pick one to five ideas instead of exactly three
- 2e172e1 fix(ideas): help text before sending
- d5037ab feat(costos): gate-1 cost includes the voice
- 0d90cc8 feat(guion): version history and Coni's edit RPC
- ff974c5 fix(guion): refuse a blank script or text, explicit grants
- 4e913bc feat(guion): edit and restore actions with the full review
- 6fd0362 fix(guion): never release a paid review, bound script and text
- 01f8549 feat(duracion): word count and seconds estimate for the editor
- fc0dfaf refactor(duracion): one seconds formula for the editor and the costs
- 3fbf075 feat(guion): script editor on the Guion screen, voice heard in the video
- 88ba3dc fix: editor saving flag and cost test clock

### Decisions taken during implementation

- Gate-1 hash uses formula 2 (no voice); a null formula on a piece means formula 1 (legacy), no backfill.
- Voice key is deterministic: `voces/<pieza>/<puerta1_hash>.mp3`, with an `existe()` check before generating. A residual window remains between the check and the upload.
- Voice spend key reuses paso "grabar" so a retried run never pays twice.
- `estimarCostoVoz` lives in `comun.ts`; the seconds formula is single, from `estimaciones.ts`.
- `MAXIMO_DE_IDEAS` is shared in `lib/dominio/ideas.ts` (1 to 5 ideas).
- Script max 2000 chars, publication text 2200. Blank script or text is refused in the DB.
- A blocking revision can be saved but not approved. Restore is hidden when there is no Claude version.
- The key remount was removed in PantallaGuion.
- Saving flag in the editor is now reset in a `finally` inside the transition. The regression test cannot go red on the old code, because the flag was only visible while pending; it guards the label after a failed save.
- Cost test clock moved into `beforeAll` so month-boundary timing cannot skew it.

### Final counts (clean `supabase db reset`)

- lint clean (378 files), type clean, build ok
- test:run 97 files, 1264 tests passed
- test:db 49 files, 581 tests passed, twice, no flaky test
- E2E 69 passed (guion.spec.ts included, "Hay que corregirlo:" assertions pass; the block comes from the caption check, not the review stub, so `{ hallazgos: [] }` in servicios-falsos.ts does not affect it)
- db:types produced no diff
- Known noise: E2E server logs "No pude estimar el costo de grabar FallaDeConfiguracion" because the E2E settings have no production config. Harmless, tests pass.

### Screenshots

- test-results/capturas/guion-editor.png (git-ignored output of the E2E run)

- Final branch review (Opus) found a cross-task bug: a piece waiting for gate 1 at deploy with a pre-generated audio would be recorded with that stale voice. Fixed in 85e45e0: approval clears audio_id, and grabar trusts a stored voice under formula 2 only if it is claveVozAprobada(pieza, puerta1_hash). Final counts after the fix: 1264 unit, 584 integration, 69 E2E.
