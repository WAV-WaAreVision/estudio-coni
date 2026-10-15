# Voice in Gate 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut every piece to two visits: the writer delivers the script with Coni's voice, gate 1 signs the script, the voice and the video spend in one slide, and the video starts by itself after an 8-second undo window.

**Architecture:** The domain moves `pedir_voz`/`voz_lista`/`falla_voz` in front of the signature (`guion_por_aprobar <-> grabando_voz`), sends `aprobar_guion` straight to `en_render`, adds `deshacer_aprobacion` with a pure window check, and drops the third step (`grabar_video`, `reabrir_guion`). The writer calls the existing `asegurarVoz` before `guion_listo`; `aprobarGuion` checks that the stored voice is a take of the current script and starts `grabar-pieza` with a 10 s Trigger.dev delay; `grabarPieza` waits out the window (`deps.esperar`, `wait.for` in the task) and re-reads the row before any spend. The Guion screen shows the voice above the script, gates the slider on "listened to the end", and the `en_render` screen carries the undo toast.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions), Supabase Postgres (RLS, triggers, check constraints), Trigger.dev v4 (`schemaTask`, `tasks.trigger({ delay })`, `wait.for`), Zod 4, Vitest + Testing Library, MSW 2, Playwright with the repo's fake services, Biome.

---

**Spec:** `docs/superpowers/specs/2026-10-15-conidolly-voz-en-la-puerta-1-design.md` (read it first; sections 1 to 8 are what
this plan builds). Style reference: `docs/superpowers/plans/2026-10-04-aprobar-voz-video.md`.

**Rules (every task):**

- Strict TDD: write the failing test first, run it and see it red, then the minimum code, then green.
- MSW for every external call (ElevenLabs, HeyGen, Anthropic). No real network in tests. Never call a provider for real.
- Local Supabase only (`pnpm db:start`; Docker runs through colima: `colima start` first if `supabase status` cannot
  reach the daemon). Never touch the hosted project (`mvfytttfxmzzjajecsch`) or production. Never read `.env*` files
  or secrets.
- Never `as any`, `@ts-expect-error`, non-null assertions (`!`) or silent catches (a catch either handles meaningfully,
  logs and returns a result, or rethrows).
- Biome safe mode only (`pnpm check`, never `--unsafe`). `"use client"` stays on line 1 of client files: after
  `pnpm check`, run `grep -L '^"use client"' $(grep -rl 'use client' app components)` and expect no output.
- Migrations are append-only, after `20261007000110`: this plan uses `20261015000100` and `20261015000110`.
  `supabase/pendientes/20261003000350_borrar_vinculos.sql` stays where it is.
- Copy for Coni: Spanish of Chile, `tú`, no em dashes. Before each commit: `git diff --cached | grep '—'` must print
  nothing.
- One commit per task. Message in English, imperative, then a blank line, then
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push and do not deploy. The last task is a runbook for Federico.

**Commands:**

- `pnpm type` (next typegen + tsc)
- `pnpm test:run` (unit) and `pnpm test:run tests/unit/<file>` (one file)
- `pnpm db:reset && pnpm test:db` (integration) and `pnpm test:db tests/integration/<file>` (one file; run
  `pnpm db:reset` first whenever a migration changed)
- `pnpm test:e2e` and `pnpm test:e2e tests/e2e/<file>` (builds the app and starts the fake services itself)
- `pnpm build`
- `pnpm lint`: today it reports `tests/unit/duracion.test.ts` (useTemplate), `components/reproductor-video.tsx`
  (unused suppression) and the untracked `.impeccable/` and `respaldos/` JSON files. Nothing new may appear.

**Known red window:** Task 11 changes where gate 1 lands (`en_render`) and removes the third step, so
`tests/e2e/guion.spec.ts`, `tests/e2e/visual.spec.ts` (and any E2E that walks gate 1) stay red until Task 19 rewrites
them. `pnpm type`, unit and integration suites are green after every task.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20261015000100_voz_antes_de_firmar.sql` | new | `aprobada_para_grabar` without `grabando_voz` |
| `supabase/migrations/20261015000110_avisos_sin_ruido_de_voz.sql` | new | no "script ready" notice for a voice round trip or Coni's own undo (not in the spec, see Task 2) |
| `lib/dominio/estados.ts` | modify | window constants, `restoDeVentana`, `esperaDeVentana`, `TEXTO_DESHACER_TARDE`, the new and moved events, removal of `grabar_video`/`reabrir_guion` |
| `lib/dominio/puertas.ts` | modify | `puedeGrabarVoz(pieza, guion)` without approval, motivo `sin_guion` |
| `lib/dominio/saldos.ts` | modify | `lineaDeFirma` |
| `lib/produccion/voz.ts` | modify | `TEXTO_SIN_VOZ` |
| `lib/produccion/producir.ts` | modify | `DepsProduccion extends DepsVoz`, `vozDelBorrador`, `guion_listo` with the voice |
| `lib/produccion/deps-reales.ts` | modify | `almacen` for the writer, `esperar` for the render |
| `lib/produccion/grabar-voz.ts` | modify | speaks the row's script, no approval |
| `lib/produccion/grabar.ts` | modify | `DepsGrabacion.esperar`, `despuesDeLaVentana` before any spend |
| `lib/produccion/fallas.ts` | modify | doc comment only (voice goes back to gate 1) |
| `lib/mantenimiento/voces.ts` | modify | stuck voices go back with `TEXTO_SIN_VOZ` |
| `trigger/producir-pieza.ts` | modify | `CONFIGURACION_PRODUCIR` with `maxDuration: 1200` |
| `trigger/grabar-pieza.ts` | modify | `esperar` through `wait.for` |
| `lib/acciones/disparos.ts` | modify | `grabar(..., retraso?)`, `claveVoz` without approval |
| `lib/acciones/disparos-entorno.ts` | modify | `delay` to Trigger.dev; test mode records `retraso` |
| `lib/acciones/servidor.ts` | modify | `disparosDeLaApp()` shared by `comoConi` and the script editor |
| `lib/acciones/piezas.ts` | modify | `aprobarGuion` (voice check, delayed start), `pedirVozDeFila`, `pedirVoz`, `deshacerAprobacion`; remove `pedirVideo`, `reabrirGuion` |
| `lib/acciones/guion.ts` | modify | `DepsGuion.disparar`; an edit that changes the voice fingerprint asks for the voice |
| `lib/datos/grabacion.ts` | modify | gate 1 data (`guion_por_aprobar`/`grabando_voz`), `lineaDeFirma`, no `confirmacionVideo` |
| `lib/inicio/modelo.ts` | modify | `grabando_voz` in "Necesita tu firma"; generic "Revisar" on a gate 1 reason |
| `app/(app)/piezas/acciones.ts` | modify | `deshacerAprobacionAccion`, `disparar` in `depsDeGuion`; remove `pedirVideoAccion`, `reabrirGuionAccion` |
| `app/(app)/guion/[id]/page.tsx` | modify | gate 1 for `guion_por_aprobar` and `grabando_voz`, the `en_render` screen with the undo toast, `?deshecho=1` |
| `app/(app)/guion/[id]/pantalla-guion.tsx` | modify | voice above the script, listen gating, the new slider copy, read-only script while the voice is made |
| `app/(app)/guion/[id]/voz-para-firmar.tsx` | new | the voice section of gate 1 (player, "Preparar mi voz", "Grabar la voz de nuevo") |
| `app/(app)/guion/[id]/deshacer-firma.tsx` | new | the 8 s toast with "Deshacer" |
| `app/(app)/guion/[id]/textos.ts` | new | gate 1 copy shared by the server page and the client components |
| `app/(app)/guion/[id]/barra-de-grabacion.tsx` | delete | the third step's bar |
| `app/(app)/page.tsx`, `lib/datos/pantallas.ts`, `lib/calendario/modelo.ts`, `app/(app)/video/[id]/page.tsx`, `lib/mantenimiento/arranques.ts`, `lib/mantenimiento/gastos.ts`, `components/deslizar-para-aprobar.tsx`, `components/ui/barra-de-firma.tsx`, `components/ui/aviso.tsx`, `app/(app)/guion/[id]/voz-suelta.tsx` | unchanged | checked: they work as they are (see the notes in the tasks) |
| `tests/integration/flujo.ts` | modify | the real flow without the third step; `aprobarComoConi`; approval a minute ago |
| `tests/unit/*`, `tests/integration/*`, `tests/e2e/*` | new/modify | listed per task |
| `docs/TRASPASO.md`, `docs/superpowers/specs/2026-10-04-conidolly-aprobar-voz-video-design.md` | modify | two visits, spending rule, undo window; status line |

---

### Task 1: Schema: a voice may exist before the signature

**Files:**
- Create: `supabase/migrations/20261015000100_voz_antes_de_firmar.sql`
- Create: `tests/integration/voz-antes-de-firmar-esquema.test.ts`
- Modify: `tests/integration/aprobar-voz-esquema.test.ts:36-48` (the test that refused `grabando_voz` without approval)
- `lib/supabase/database.types.ts`: no change (a check constraint does not reach the generated types)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/voz-antes-de-firmar-esquema.test.ts
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

describe("la voz antes de la firma, en la base", () => {
  it("lets Coni send a script without gate 1 to grabando_voz, and the voice task bring it back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      await c.query(
        "update public.piezas set estado = 'grabando_voz', intento = intento + 1, version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoServicio)
      await c.query(
        "update public.piezas set estado = 'guion_por_aprobar', audio_id = 'voces/x.mp3', version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoPostgres)
      expect(await leer(c, id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null, audio_id: "voces/x.mp3" })
    })
  })

  it("still refuses en_render without gate 1", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'en_render', version = version + 1 where id = $1",
        [id],
      )
      expect(error.constraint).toBe("aprobada_para_grabar")
    })
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm db:reset && pnpm test:db tests/integration/voz-antes-de-firmar-esquema.test.ts`
Expected: FAIL in the first test, `new row for relation "piezas" violates check constraint "aprobada_para_grabar"`. The
second test passes (it guards what must not change).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261015000100_voz_antes_de_firmar.sql
-- The voice joins gate 1 (design 2026-10-15): it is made with the script, before the signature, so a piece can be in
-- grabando_voz without an approval. Only grabando_voz leaves the list of 20261015000050; guion_aprobado stays
-- (unreachable now, harmless). proteger_pieza does not change: only Coni moves a piece into grabando_voz or en_render.
alter table public.piezas drop constraint aprobada_para_grabar;
alter table public.piezas add constraint aprobada_para_grabar check (
  estado not in (
    'guion_aprobado', 'en_render', 'subtitulando', 'video_por_aprobar', 'programado', 'para_subir_a_mano', 'publicado',
    'publicado_a_mano'
  )
  or puerta1_hash is not null
);
```

- [ ] **Step 4: Update the old schema test**

In `tests/integration/aprobar-voz-esquema.test.ts`, replace the test "refuses guion_aprobado or grabando_voz without a
gate 1 approval" with:

```ts
  it("refuses guion_aprobado without a gate 1 approval", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'guion_aprobado', version = version + 1 where id = $1",
        [id],
      )
      expect(error.constraint).toBe("aprobada_para_grabar")
    })
  })
```

- [ ] **Step 5: Run and see green**

Run: `pnpm db:reset && pnpm test:db tests/integration/voz-antes-de-firmar-esquema.test.ts tests/integration/aprobar-voz-esquema.test.ts`
Expected: PASS. Then `pnpm test:db` (whole integration suite), expected green.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261015000100_voz_antes_de_firmar.sql tests/integration/voz-antes-de-firmar-esquema.test.ts tests/integration/aprobar-voz-esquema.test.ts
git commit -m "Let a piece record its voice before gate 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: No "script ready" notice for a voice round trip or for Coni's own undo

Not in the spec. `avisar_pieza_lista` (`20261001001520_avisos_automaticos.sql`) writes a `guion_listo` notice every time
a piece enters `guion_por_aprobar` from another state. With the voice before the signature, every script edit goes
`guion_por_aprobar -> grabando_voz -> guion_por_aprobar` and every undo goes `en_render -> guion_por_aprobar`: each would
add "Tu guion «...» está listo para revisar." to the 08:30 summary and the unread list, while Coni is on that screen.
This task keeps the notice for the writer and for HeyGen's refusal (`politica_contenido`) only. If Federico prefers the
notices, drop this task; nothing else depends on it.

**Files:**
- Create: `supabase/migrations/20261015000110_avisos_sin_ruido_de_voz.sql`
- Modify: `tests/integration/avisos-automaticos.test.ts` (append a describe)

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/avisos-automaticos.test.ts`; add `asumir` and
  `comoConi` to the `./db` import)

```ts
describe("avisos de la puerta 1 con la voz antes de la firma", () => {
  it("notes no ready script when her voice comes back to gate 1", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      await c.query(
        "update public.piezas set estado = 'grabando_voz', intento = intento + 1, version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoServicio)
      await c.query(
        "update public.piezas set estado = 'guion_por_aprobar', audio_id = 'voces/x.mp3', version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoPostgres)
      expect((await avisosDe(c, id)).map((a) => a.tipo)).toEqual(["guion_listo"])
    })
  })

  it("notes nothing when Coni herself takes a signature back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await asumir(c, comoConi)
      await c.query(
        "update public.piezas set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null, version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoPostgres)
      expect((await avisosDe(c, id)).map((a) => a.tipo)).toEqual(["guion_listo"])
    })
  })

  it("still notes a script that HeyGen sent back to her", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await aplicar(c, id, comoServicio, { tipo: "politica_contenido", explicacion: "HeyGen marcó una frase." })
      await asumir(c, comoPostgres)
      expect((await avisosDe(c, id)).map((a) => a.tipo)).toEqual(["guion_listo", "guion_listo"])
    })
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:db tests/integration/avisos-automaticos.test.ts`
Expected: FAIL in the first two tests: `expected [ 'guion_listo', 'guion_listo' ] to deeply equal [ 'guion_listo' ]`.
The third passes.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261015000110_avisos_sin_ruido_de_voz.sql
-- The voice is made before gate 1 now (design 2026-10-15): every script edit sends the piece through grabando_voz and
-- back, and an undo brings a signed piece back to guion_por_aprobar. Neither is news for Coni, who is on that screen:
-- the "script ready" notice is written only when someone else hands the script to her (the writer, HeyGen's refusal).
-- Body as of 20261001001520 plus the early return; the privileges revoked there stay.
create or replace function public.avisar_pieza_lista() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tipo_aviso text;
  texto text;
begin
  if new.estado = 'guion_por_aprobar' then
    if old.estado = 'grabando_voz' or public.es_coni() then
      return null;
    end if;
    tipo_aviso := 'guion_listo';
    texto := 'Tu guion «' || left(new.titulo, 120) || '» está listo para revisar.';
  else
    tipo_aviso := 'video_listo';
    texto := 'Tu video «' || left(new.titulo, 120) || '» está listo para verlo y aprobarlo.';
  end if;
  -- `version` goes up on every write, so a state is noted once per time the piece enters it.
  insert into public.avisos (tipo, pieza_id, clave, mensaje)
  values (tipo_aviso, new.id, tipo_aviso || ':' || new.id || ':' || new.version, texto)
  on conflict (clave) do nothing;
  return null;
end $$;
```

- [ ] **Step 4: Run and see green**

Run: `pnpm db:reset && pnpm test:db tests/integration/avisos-automaticos.test.ts`
Expected: PASS (8 tests). Then `pnpm test:db`, expected green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261015000110_avisos_sin_ruido_de_voz.sql tests/integration/avisos-automaticos.test.ts
git commit -m "Skip the script-ready notice for a voice round trip or Coni's own undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The undo window in the domain

**Files:**
- Modify: `lib/dominio/estados.ts` (constants after `MARGEN_HORA_APROBADA_MS`, line 27; functions after `piezaNueva`, line 177)
- Test: `tests/unit/estados.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/estados.test.ts`; add `esperaDeVentana`,
  `MARGEN_DE_RELOJ_MS`, `restoDeVentana` and `VENTANA_DESHACER_MS` to the `@/lib/dominio/estados` import)

```ts
describe("la ventana para deshacer la firma", () => {
  const FIRMA = "2026-10-15T12:00:00.000Z"
  const mas = (ms: number) => new Date(Date.parse(FIRMA) + ms).toISOString()

  it("is 8 s, and the render adds 2 s of clock margin", () => {
    expect(VENTANA_DESHACER_MS).toBe(8000)
    expect(MARGEN_DE_RELOJ_MS).toBe(2000)
  })

  it("leaves what is left of the 8 s and closes at exactly 8 s", () => {
    expect(restoDeVentana(FIRMA, FIRMA)).toBe(8000)
    expect(restoDeVentana(FIRMA, mas(7999))).toBe(1)
    expect(restoDeVentana(FIRMA, mas(8000))).toBe(0)
    expect(restoDeVentana(FIRMA, mas(60_000))).toBe(0)
  })

  it("makes the render wait the window plus the margin, measured on its own clock", () => {
    expect(esperaDeVentana(FIRMA, FIRMA)).toBe(10_000)
    expect(esperaDeVentana(FIRMA, mas(3000))).toBe(7000)
    expect(esperaDeVentana(FIRMA, mas(10_000))).toBe(0)
    expect(esperaDeVentana(FIRMA, mas(-5000))).toBe(15_000)
  })

  it("refuses an unreadable instant instead of skipping the wait", () => {
    expect(() => esperaDeVentana("ayer", FIRMA)).toThrow(/Instante inválido/)
    expect(() => restoDeVentana(FIRMA, "")).toThrow(/Instante inválido/)
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: FAIL, `esperaDeVentana is not a function` (and the constants are undefined).

- [ ] **Step 3: Implement**

In `lib/dominio/estados.ts`, after `export const MARGEN_HORA_APROBADA_MS = 30 * 60 * 1000`:

```ts
/** How long Coni can take her gate 1 signature back before the video is recorded (design 2026-10-15, decision 5). */
export const VENTANA_DESHACER_MS = 8000
/** What the render adds to the window, so a task clock a little behind the app's never records before it closes. */
export const MARGEN_DE_RELOJ_MS = 2000
```

After `piezaNueva()`:

```ts
/** What is left of the undo window of a signature made at `puerta1En`, on the server clock; 0 once it closed. */
export function restoDeVentana(puerta1En: string, ahora: string): number {
  const cierre = Date.parse(instanteDelServidor(puerta1En)) + VENTANA_DESHACER_MS
  return Math.max(0, cierre - Date.parse(instanteDelServidor(ahora)))
}

/** How long the render waits before it may spend: the undo window plus the clock margin, on the task's clock. */
export function esperaDeVentana(puerta1En: string, ahora: string): number {
  const cierre = Date.parse(instanteDelServidor(puerta1En)) + VENTANA_DESHACER_MS + MARGEN_DE_RELOJ_MS
  return Math.max(0, cierre - Date.parse(instanteDelServidor(ahora)))
}
```

(`instanteDelServidor` is declared above `piezaNueva` in the same file and throws `Instante inválido del reloj del
servidor: ...` for anything that is not ISO 8601 with a zone.)

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/estados.ts tests/unit/estados.test.ts
git commit -m "Add the undo window of the gate 1 signature to the domain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `deshacer_aprobacion` in the domain

**Files:**
- Modify: `lib/dominio/estados.ts` (`Evento`, `transicionar`, a new exported text)
- Test: `tests/unit/estados.test.ts` (new describe, plus the design table at lines 535-627)

- [ ] **Step 1: Write the failing tests**

Append (add `type Actor` and `TEXTO_DESHACER_TARDE` to the `@/lib/dominio/estados` import):

```ts
describe("deshacer la firma", () => {
  const FIRMA = { hash: "a".repeat(64), en: "2026-10-15T12:00:00.000Z" }
  const firmada = en("en_render", { version: 6, intento: 3, audioId: "voces/t.mp3", puerta1: FIRMA })
  const deshacer = (ms: number, actor: Actor = "coni"): Evento => ({
    tipo: "deshacer_aprobacion",
    actor,
    ahora: new Date(Date.parse(FIRMA.en) + ms).toISOString(),
  })

  it("takes the signature back inside the window, keeping her voice and the attempt", () => {
    const { pieza, efectos } = transicionar(firmada, deshacer(7999))
    expect(pieza).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1: null,
      audioId: "voces/t.mp3",
      intento: 3,
      version: 7,
      explicacion: null,
    })
    expect(efectos).toEqual([])
  })

  it("refuses at 8 s with a text for Coni, not as a stale screen", () => {
    const error = capturar(() => transicionar(firmada, deshacer(8000)))
    expect(error).toBeInstanceOf(Falla)
    expect(error).not.toBeInstanceOf(TransicionInvalida)
    expect(error).toMatchObject({ message: TEXTO_DESHACER_TARDE })
    expect(TEXTO_DESHACER_TARDE).toBe("Ya empecé a grabar el video. Puedes revisarlo cuando esté listo.")
  })

  it("only lets Coni undo", () => {
    expect(() => transicionar(firmada, deshacer(1000, "sistema"))).toThrow(AprobacionNoAutorizada)
  })

  it("refuses from any state other than a signed piece in render", () => {
    expect(() => transicionar(en("guion_por_aprobar"), deshacer(1000))).toThrow(TransicionInvalida)
    expect(() => transicionar(en("subtitulando", { puerta1: FIRMA }), deshacer(1000))).toThrow(TransicionInvalida)
    expect(() => transicionar(en("en_render"), deshacer(1000))).toThrow(TransicionInvalida)
  })
})
```

In `describe("tabla del diseño")`:
- `permitidos.en_render` becomes
  `["voz_lista", "render_entregado", "politica_contenido", "falla_produccion", "deshacer_aprobacion", "descartar"]`.
- In `eventos`, add after `reintentar`:
  `deshacer_aprobacion: { tipo: "deshacer_aprobacion", actor: "coni", ahora: "2026-10-06T15:00:03.000Z" },`
  (three seconds after `ANTES`, the `en` of the table's `puerta1`).

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: FAIL, type error on `"deshacer_aprobacion"` and `TEXTO_DESHACER_TARDE` is undefined.

- [ ] **Step 3: Implement**

In `lib/dominio/estados.ts`, after `MARGEN_DE_RELOJ_MS`:

```ts
/** Said when the undo arrives after the window: the run may have started, so the video goes on. */
export const TEXTO_DESHACER_TARDE = "Ya empecé a grabar el video. Puedes revisarlo cuando esté listo."
```

In `Evento`, after the `reabrir_guion` member:

```ts
  /** Coni takes her gate 1 signature back while the undo window lasts. `ahora` is the server clock. */
  | { tipo: "deshacer_aprobacion"; actor: Actor; ahora: string }
```

In `transicionar`, after the `reabrir_guion` case:

```ts
    case "deshacer_aprobacion":
      soloConi(evento.actor)
      if (estado !== "en_render" || pieza.puerta1 === null) throw invalida()
      if (restoDeVentana(pieza.puerta1.en, evento.ahora) === 0) throw new Falla(TEXTO_DESHACER_TARDE)
      // Her voice and the attempt stay: the render key of this text does not change, so a delayed run that fires
      // anyway finds the piece here and spends nothing, and signing the same text again reuses its key.
      return a("guion_por_aprobar", { puerta1: null })
```

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: PASS. Then `pnpm type`, expected clean (no caller sends the event yet).

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/estados.ts tests/unit/estados.test.ts
git commit -m "Let Coni undo a gate 1 signature inside the window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `guion_listo` carries the voice

**Files:**
- Modify: `lib/dominio/estados.ts` (`Evento`, case `guion_listo`, lines 63 and 215-217)
- Modify: `lib/produccion/producir.ts:255` (passes `audioId: null` until Task 6)
- Modify: `tests/integration/flujo.ts:109`, `tests/integration/avisos-automaticos.test.ts:64`
- Test: `tests/unit/estados.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/estados.test.ts`, replace the test "pasa a guion por aprobar sin voz cuando el guion queda listo" with:

```ts
  it("hands the script over with the voice the writer made", () => {
    const { pieza } = transicionar(en("guion_en_proceso", { explicacion: "Antes falló." }), {
      tipo: "guion_listo",
      audioId: "voces/p/t-h-0.mp3",
    })
    expect(pieza).toMatchObject({ estado: "guion_por_aprobar", audioId: "voces/p/t-h-0.mp3", explicacion: null })
  })

  it("hands the script over without a voice, saying why", () => {
    const { pieza } = transicionar(en("guion_en_proceso"), {
      tipo: "guion_listo",
      audioId: null,
      explicacion: "No pude preparar tu voz.",
    })
    expect(pieza).toMatchObject({ estado: "guion_por_aprobar", audioId: null, explicacion: "No pude preparar tu voz." })
  })
```

Also in that file: in "recorre el camino feliz y sube la versión en cada paso" the event becomes
`{ tipo: "guion_listo", audioId: null }`, and in the design table `eventos.guion_listo` becomes
`{ tipo: "guion_listo", audioId: "audio_2" }`.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: FAIL (`audioId` is not part of the `guion_listo` event; the piece arrives with `audioId: null`).

- [ ] **Step 3: Implement**

In `Evento`, replace `| { tipo: "guion_listo" }` with:

```ts
  /** The writer hands the script over with her voice of it; null with the reason when the voice could not be made. */
  | { tipo: "guion_listo"; audioId: string | null; explicacion?: string }
```

Replace the case:

```ts
    case "guion_listo":
      if (estado !== "guion_en_proceso") throw invalida()
      return a("guion_por_aprobar", { audioId: evento.audioId, explicacion: evento.explicacion ?? null })
```

Callers, until the writer makes the voice in Task 6:
- `lib/produccion/producir.ts:255`: `transicionar(piezaDesdeFila(fila), { tipo: "guion_listo", audioId: null })`.
- `tests/integration/flujo.ts:109`: `{ tipo: "guion_listo", audioId: null },`.
- `tests/integration/avisos-automaticos.test.ts:64`:
  `await aplicar(c, id, comoServicio, { tipo: "guion_listo", audioId: null }, { guion: TEXTO, texto: TEXTO })`.

- [ ] **Step 4: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/estados.test.ts && pnpm test:db tests/integration/avisos-automaticos.test.ts tests/integration/producir.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/estados.ts lib/produccion/producir.ts tests/unit/estados.test.ts tests/integration/flujo.ts tests/integration/avisos-automaticos.test.ts
git commit -m "Carry the voice in the script-ready event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The writer makes her voice of the draft

**Files:**
- Modify: `lib/produccion/voz.ts` (new constant `TEXTO_SIN_VOZ` after `claveDeGastoDeVoz`, line 33)
- Modify: `lib/produccion/producir.ts` (imports lines 1-38, `DepsProduccion` lines 40-46, doc of `producirPieza` lines 185-189, the `guion_listo` write lines 255-263)
- Modify: `lib/produccion/deps-reales.ts` (`depsReales`, lines 52-67)
- Test: `tests/integration/producir.test.ts`, `tests/unit/deps-reales.test.ts`

- [ ] **Step 1: Write the failing integration tests**

In `tests/integration/producir.test.ts`:

1. Imports: `vi` joins the `vitest` import, and add

```ts
import { claveDeToma } from "@/lib/dominio/voz"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { huellaDelGuion, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { leerConfigProduccion } from "@/lib/proveedores/config"
```

and, under the constants:

```ts
const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs
/** The take the writer makes for a new piece: its draft, Coni's voice, attempt 0. */
const tomaDe = (id: string, guion: string) => claveDeToma(id, huellaDelGuion(guion, ELEVENLABS), 0)
```

2. `deps` takes the store:

```ts
function deps(avisos = notificadorEnMemoria(), almacen = almacenEnMemoria()): DepsProduccion {
  return {
    db: clienteDeServicio(),
    avisos,
    almacen,
    // Retries belong to Trigger.dev; a failing test should not wait for the SDK's backoff.
    claude: new Anthropic({ apiKey: "sk-ant-de-prueba", maxRetries: 0 }),
    ahora: () => new Date().toISOString(),
  }
}
```

3. The `afterEach` starts with `vi.restoreAllMocks()`.

4. Replace the test "writes and reviews the script, makes no voice and leaves the piece waiting for Coni" with:

```ts
  it("writes and reviews the script, makes her voice of it and leaves the piece waiting for Coni", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular()
    const almacen = almacenEnMemoria()

    const resultado = await producirPieza(deps(notificadorEnMemoria(), almacen), id)

    expect(resultado).toEqual({ resultado: "producida" })
    const toma = tomaDe(id, GUION_BUENO)
    expect(await pieza(id)).toMatchObject({
      estado: "guion_por_aprobar",
      audio_id: toma,
      guion: GUION_BUENO,
      texto: TEXTO_BUENO,
      revision: [],
      explicacion: null,
    })
    expect(sim.voces).toEqual([{ voz: ELEVENLABS.voice_id, llave: CLAVE_ELEVENLABS, texto: GUION_BUENO }])
    expect(almacen.obtener(toma)?.datos).toEqual(AUDIO)
    expect(sim.escrituras).toHaveLength(1)
    expect(sim.revisiones).toHaveLength(1)
  })
```

5. Replace the test "records only the Claude spend, confirmed with its real cost" with:

```ts
  it("records the Claude spend at its real cost and the voice at its estimate", async () => {
    const id = await crearPiezaEnProduccion()
    simular()

    await producirPieza(deps(), id)

    const filas = await gastos(id)
    expect(filas.map((g) => [g.proveedor, g.paso, g.estado])).toEqual([
      ["anthropic", "guion", "confirmado"],
      ["elevenlabs", "voz", "confirmado"],
    ])
    expect(filas[0]).toMatchObject({ estimado: 0.5 })
    expect(filas[0]?.real).toBeCloseTo(COSTO_ESCRITURA + COSTO_REVISION, 6)
    expect(filas[1]?.real).toBeCloseTo(estimarCostoVoz(GUION_BUENO), 6)
  })
```

6. In "does nothing, and calls nobody, when the piece is no longer in production", the last line becomes
   `expect(await gastos(id)).toHaveLength(2)` (the first run paid Claude and the voice).

7. Replace "writes the script even when ElevenLabs has no key and no voice configured" with:

```ts
  it("delivers the script without a voice, and says why, when the voice setup does not read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await crearPiezaEnProduccion()
    await pool.query("delete from vault.secrets where name = 'elevenlabs'")
    await pool.query("update public.ajustes set produccion = '{}'::jsonb")
    const sim = simular()

    const resultado = await producirPieza(deps(), id)

    expect(resultado).toEqual({ resultado: "producida" })
    expect(sim.escrituras).toHaveLength(1)
    expect(sim.voces).toHaveLength(0)
    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, explicacion: TEXTO_SIN_VOZ })
    expect(error).toHaveBeenCalledWith(`No pude preparar la voz de la pieza ${id}`, expect.any(Error))
  })
```

8. In "starts a new round, with a new spend, when Coni asks for changes", replace the assertions after
   `expect(sim.escrituras).toHaveLength(2)` with:

```ts
    // Each round speaks its own draft, under its own attempt.
    expect(sim.voces).toHaveLength(2)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([
      ["anthropic", "confirmado"],
      ["elevenlabs", "confirmado"],
      ["anthropic", "confirmado"],
      ["elevenlabs", "confirmado"],
    ])
    expect((await pieza(id)).guion).toContain("otra idea")
```

9. Append inside `describe("producirPieza")`:

```ts
  it("delivers the script without a voice when ElevenLabs has no characters, and frees the voice from the cap", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await crearPiezaEnProduccion()
    const sim = simular({
      voz: () => HttpResponse.json({ detail: { status: "quota_exceeded", message: "quota" } }, { status: 401 }),
    })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(await pieza(id)).toMatchObject({
      estado: "guion_por_aprobar",
      guion: GUION_BUENO,
      audio_id: null,
      explicacion: TEXTO_SIN_VOZ,
    })
    expect(sim.voces).toHaveLength(1)
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs").map((g) => g.estado)).toEqual(["liberado"])
    // A Falla is a reason for Coni, not a bug for WAV.
    expect(error).not.toHaveBeenCalled()
  })

  it("delivers the script without a voice when the month has no room left for it", async () => {
    const id = await crearPiezaEnProduccion()
    // The cap drops after Claude's reservation: the script is paid, the voice no longer fits.
    const sim = simular({
      enEscritura: () => pool.query("update public.ajustes set tope_mensual_usd = 0").then(() => undefined),
    })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, explicacion: TEXTO_SIN_VOZ })
    expect(sim.voces).toHaveLength(0)
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
  })

  it("logs a server error of ElevenLabs and still delivers the script, keeping the reservation for the sweeper", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await crearPiezaEnProduccion()
    simular({ voz: () => new HttpResponse("caído", { status: 503 }) })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, explicacion: TEXTO_SIN_VOZ })
    expect(error).toHaveBeenCalledWith(`No pude preparar la voz de la pieza ${id}`, expect.any(Error))
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs").map((g) => g.estado)).toEqual(["reservado"])
  })

  it("reuses the take a run of this round already paid for, instead of paying again", async () => {
    const id = await crearPiezaEnProduccion()
    const almacen = almacenEnMemoria()
    const toma = tomaDe(id, GUION_BUENO)
    await almacen.subir(toma, AUDIO, "audio/mpeg")
    const sim = simular()

    expect(await producirPieza(deps(notificadorEnMemoria(), almacen), id)).toEqual({ resultado: "producida" })

    expect(sim.voces).toHaveLength(0)
    expect(await pieza(id)).toMatchObject({ audio_id: toma, explicacion: null })
  })
```

- [ ] **Step 2: Write the failing unit test**

In `tests/unit/deps-reales.test.ts`, `VARIABLES` becomes

```ts
const VARIABLES = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const
```

and append to `describe("depsReales")`:

```ts
  it("names a missing R2 variable before it reads any key: the writer stores her voice", async () => {
    process.env.SUPABASE_URL = "http://127.0.0.1:1"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba"
    await expect(depsReales()).rejects.toThrow("R2_ACCOUNT_ID")
  })
```

- [ ] **Step 3: Run them and see them fail**

Run: `pnpm test:run tests/unit/deps-reales.test.ts && pnpm test:db tests/integration/producir.test.ts`
Expected: FAIL. The unit test rejects with a network error instead of `R2_ACCOUNT_ID`; the integration tests find
`audio_id: null` and no ElevenLabs call.

- [ ] **Step 4: Implement**

In `lib/produccion/voz.ts`, after `claveDeGastoDeVoz`:

```ts
/** What Coni reads when her voice could not be made; the screen offers "Preparar mi voz" next to it. */
export const TEXTO_SIN_VOZ = "No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz."
```

In `lib/produccion/producir.ts`:

1. Imports: drop `import type { SupabaseClient } from "@supabase/supabase-js"`; add `leerProduccion` to the
   `@/lib/datos/repositorio` import; `import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"`; add
   `import { asegurarVoz, type DepsVoz, leerLlaveDeVoz, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"` and
   `import { leerConfigProduccion } from "@/lib/proveedores/config"`; the last import becomes
   `import type { Json } from "@/lib/supabase/database.types"`.
2. `DepsProduccion`:

```ts
/**
 * `db` is a `service_role` client: the database triggers keep enforcing the gates on everything it writes. The store
 * and the ElevenLabs base come from `DepsVoz`, because the writer makes her voice of the draft.
 */
export interface DepsProduccion extends DepsVoz {
  avisos: Notificador
  claude: Anthropic
}
```

3. Before `producirPieza`:

```ts
/**
 * Her voice of the draft, so gate 1 signs the script and the voice together (design 2026-10-15, decision 2). The take
 * is keyed by the piece's attempt, so a retry of this round finds the one it already paid for. Whatever goes wrong,
 * the script is still delivered: without a voice and with `TEXTO_SIN_VOZ`, and Coni asks for it with "Preparar mi voz".
 */
async function vozDelBorrador(
  deps: DepsProduccion,
  fila: FilaDePieza,
  guion: string,
): Promise<{ audioId: string | null; explicacion?: string }> {
  try {
    const config = leerConfigProduccion(await leerProduccion(deps.db))
    const voz = await asegurarVoz(deps, {
      fila,
      guion,
      config: config.elevenlabs,
      llave: () => leerLlaveDeVoz(deps.db, config),
      nueva: false,
    })
    if (voz.tipo === "lista") return { audioId: voz.audioId }
  } catch (error) {
    // A Falla (no characters) is already a reason for Coni; anything else is for WAV to look at.
    if (!(error instanceof Falla)) console.error(`No pude preparar la voz de la pieza ${fila.id}`, error)
  }
  return { audioId: null, explicacion: TEXTO_SIN_VOZ }
}
```

4. The doc comment of `producirPieza` becomes:

```ts
/**
 * Writes and reviews the script and the caption of a piece in `guion_en_proceso`, makes her voice of the draft and
 * leaves it in `guion_por_aprobar`. It never approves anything. It is safe to run again: a finished piece is left
 * alone, and a run that stopped half way resumes from what was saved (the draft, the take) instead of paying twice.
 */
```

5. Replace the `guion_listo` write at the end of `producirPieza`:

```ts
  const voz = await vozDelBorrador(deps, fila, borrador.guion)
  const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "guion_listo", ...voz })
  const lista = await actualizarPieza(db, fila.id, fila.version, {
    ...cambiosDesdePieza(pieza),
    guion: borrador.guion,
    texto: borrador.texto,
    revision: borrador.revision,
  })
  if (!lista) throw piezaCambio()
  return { resultado: "producida" }
```

In `lib/produccion/deps-reales.ts`, `depsReales` becomes:

```ts
/** The dependencies of a Trigger.dev run. Cheap checks come first, so a missing setting fails before any spend. */
export async function depsReales(): Promise<DepsProduccion> {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  // The writer stores her voice of the draft: a missing R2 setting fails here, before any key is read.
  const almacen = almacenReal()
  const db = createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } })
  const llaveDeAnthropic = await leerSecreto(db, "anthropic")
  if (!llaveDeAnthropic) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
  }
  return {
    db,
    avisos: avisosReales(),
    almacen,
    claude: new Anthropic({ apiKey: llaveDeAnthropic, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 }),
    ahora: () => new Date().toISOString(),
  }
}
```

- [ ] **Step 5: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/deps-reales.test.ts && pnpm test:db tests/integration/producir.test.ts`
Expected: PASS. Then `pnpm test:run && pnpm test:db`, expected green (`guion_por_aprobar` pieces now arrive with a voice
from the writer; the old gate 1 still keeps it on approval).

- [ ] **Step 6: Commit**

```bash
git add lib/produccion/voz.ts lib/produccion/producir.ts lib/produccion/deps-reales.ts tests/integration/producir.test.ts tests/unit/deps-reales.test.ts
git commit -m "Make Coni's voice of the draft in the writer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The writer has time for the voice

The spec's open question 2. The writer runs on the config default of `maxDuration: 900` (`trigger.config.ts`). Its
worst case is three Claude calls of up to two attempts of 120 s (`CLAUDE_ESPERA_MS`, 720 s) plus one ElevenLabs call of
up to 300 s (`ESPERA_VOZ_MS` in `lib/proveedores/elevenlabs.ts`): 1020 s. The task gets its own 1200 s.

**Files:**
- Modify: `trigger/producir-pieza.ts`
- Modify: `lib/produccion/deps-reales.ts:25-27` (comment of `CLAUDE_ESPERA_MS`)
- Test: `tests/unit/producir-pieza-task.test.ts`

- [ ] **Step 1: Write the failing test** (append inside `describe("producirPiezaTask")`; the import becomes
  `import { CONFIGURACION_PRODUCIR, producirPiezaTask } from "../../trigger/producir-pieza"`)

```ts
  it("has time for Claude's worst case and her voice of the draft, one run at a time", () => {
    expect(CONFIGURACION_PRODUCIR).toEqual({ id: "producir-pieza", maxDuration: 1200, queue: { concurrencyLimit: 1 } })
  })
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/producir-pieza-task.test.ts`
Expected: FAIL, `CONFIGURACION_PRODUCIR` is undefined.

- [ ] **Step 3: Implement**

```ts
// trigger/producir-pieza.ts
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { depsFalla, depsReales } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { producirPieza } from "@/lib/produccion/producir"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/**
 * Claude writes and reviews (three calls of up to two attempts of 120 s) and ElevenLabs speaks the draft (up to 300 s):
 * 1020 s in the worst case, past the 900 s default of trigger.config.ts (design 2026-10-15, open question 2).
 */
export const CONFIGURACION_PRODUCIR = {
  id: "producir-pieza",
  maxDuration: 1200,
  // One run at a time: two runs of the same round would both pay Claude before the first one saves its draft.
  queue: { concurrencyLimit: 1 },
} as const

export const producirPiezaTask = schemaTask({
  ...CONFIGURACION_PRODUCIR,
  schema: z.object({ piezaId: z.string().uuid() }),
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the piece is left readable for Coni and the alerts go out (design A9).
  onFailure: alFallarDeTarea("producir-pieza", depsFalla),
  run: async ({ piezaId }) => producirPieza(await depsReales(), piezaId),
})
```

In `lib/produccion/deps-reales.ts`, the comment above `CLAUDE_ESPERA_MS` becomes:

```ts
// Three calls of at most two attempts each (720 s) must fit in producir-pieza's 1200 s together with the voice of the
// draft (ElevenLabs waits up to 300 s), unlike the SDK's default of 10 minutes and two retries, where one hung call
// would end the run. The other tasks that use it run on the 900 s default.
```

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/producir-pieza-task.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add trigger/producir-pieza.ts lib/produccion/deps-reales.ts tests/unit/producir-pieza-task.test.ts
git commit -m "Give the writer task time for the voice of the draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A delayed start for `grabar-pieza`

**Files:**
- Modify: `lib/acciones/disparos.ts:7-12` (`Disparos.grabar`)
- Modify: `lib/acciones/disparos-entorno.ts:26-32` (real) and `:49` (test mode)
- Modify: `lib/acciones/servidor.ts:52-74` (`disparosDeLaApp`, used by `comoConi` now and by the script editor in Task 14)
- Test: `tests/unit/disparos-grabar.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/disparos-grabar.test.ts
// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { disparosDeEntorno } from "@/lib/acciones/disparos-entorno"

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn(async (..._: unknown[]) => ({ id: "run_1" })) }))
vi.mock("@trigger.dev/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trigger.dev/sdk")>()),
  tasks: { trigger },
  idempotencyKeys: { create: vi.fn(async (clave: string) => `global:${clave}`) },
}))

const PIEZA = "11111111-2222-4333-8444-555555555555"

beforeEach(() => trigger.mockClear())

describe("grabar-pieza con retraso", () => {
  it("asks Trigger.dev to start the render after the delay, under the same key", async () => {
    await disparosDeEntorno({ TRIGGER_SECRET_KEY: "tr_prueba" }).grabar(PIEZA, "clave", "10s")

    expect(trigger).toHaveBeenCalledWith(
      "grabar-pieza",
      { piezaId: PIEZA },
      { idempotencyKey: "global:clave", delay: "10s" },
    )
  })

  it("starts it at once when no delay is given", async () => {
    await disparosDeEntorno({ TRIGGER_SECRET_KEY: "tr_prueba" }).grabar(PIEZA, "clave")

    expect(trigger).toHaveBeenCalledWith("grabar-pieza", { piezaId: PIEZA }, { idempotencyKey: "global:clave" })
  })

  it("writes the delay down in test mode, so the E2E can see it", async () => {
    const archivo = join(mkdtempSync(join(tmpdir(), "disparos-")), "registro.jsonl")

    await disparosDeEntorno({ DISPARO_DE_PRUEBA: "1", DISPARO_DE_PRUEBA_ARCHIVO: archivo }).grabar("p2", "clave-2", "10s")

    expect(JSON.parse(readFileSync(archivo, "utf-8").trim())).toEqual({
      tarea: "grabar",
      piezaId: "p2",
      clave: "clave-2",
      retraso: "10s",
    })
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/disparos-grabar.test.ts`
Expected: FAIL: the first test gets `{ idempotencyKey: "global:clave" }` without `delay`; the third has no `retraso`.

- [ ] **Step 3: Implement**

`lib/acciones/disparos.ts`, in `Disparos`:

```ts
  /** `retraso`: when to start, as Trigger.dev reads it ("10s"); the signature waits out the undo window this way. */
  grabar(piezaId: string, clave: string, retraso?: string): Promise<void>
```

`lib/acciones/disparos-entorno.ts`, the real `grabar`:

```ts
    async grabar(piezaId, clave, retraso) {
      await tasks.trigger<typeof grabarPiezaTask>(
        "grabar-pieza",
        { piezaId },
        // A delayed run waits in DELAYED; the key still dedupes a second signature of the same text.
        { idempotencyKey: await claveGlobal(clave), ...(retraso ? { delay: retraso } : {}) },
      )
    },
```

and the test-mode one:

```ts
    grabar: async (piezaId, clave, retraso) => anotar({ tarea: "grabar", piezaId, clave, ...(retraso ? { retraso } : {}) }),
```

`lib/acciones/servidor.ts`: add `import type { Disparos } from "./disparos"`, then before `comoConi`:

```ts
/** The starters of the background runs, resolved on use: a missing Trigger.dev key must not stop an action that starts none. */
export function disparosDeLaApp(): Disparos {
  return {
    producir: (piezaId, clave) => disparosDeEntorno().producir(piezaId, clave),
    grabar: (piezaId, clave, retraso) => disparosDeEntorno().grabar(piezaId, clave, retraso),
    voz: (piezaId, clave, nueva) => disparosDeEntorno().voz(piezaId, clave, nueva),
  }
}
```

and inside `comoConi` the `disparar` object (with its comment) becomes `disparar: disparosDeLaApp(),`.

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/disparos-grabar.test.ts tests/unit/disparos.test.ts tests/unit/disparos-voz.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/disparos.ts lib/acciones/disparos-entorno.ts lib/acciones/servidor.ts tests/unit/disparos-grabar.test.ts
git commit -m "Let the app start grabar-pieza after a delay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The voice run key no longer needs gate 1

`claveVoz` (`lib/acciones/disparos.ts:39-45`) throws without `puerta1_hash`. Not in the spec's list of facts, but the
voice now comes before the signature, so its key is the piece and the attempt (every `pedir_voz` bumps `intento`).

**Files:**
- Modify: `lib/acciones/disparos.ts:39-45`
- Test: `tests/unit/disparos.test.ts:78-89`

- [ ] **Step 1: Write the failing test**

Replace `describe("claveVoz")` in `tests/unit/disparos.test.ts` (add `import { hashTexto } from "@/lib/dominio/puertas"`):

```ts
describe("claveVoz", () => {
  const fila = { id: "p", version: 3, intento: 2, puerta1_hash: null }

  it("is one key per piece and attempt, before any approval", () => {
    expect(claveVoz(fila)).toBe(`p:voz:${hashTexto("voz").slice(0, 16)}:2`)
    expect(claveVoz({ ...fila, intento: 3 })).not.toBe(claveVoz(fila))
  })

  it("does not change with gate 1: the voice is made before it", () => {
    expect(claveVoz({ ...fila, puerta1_hash: "e".repeat(64) })).toBe(claveVoz(fila))
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/disparos.test.ts`
Expected: FAIL, `La pieza p pide su voz sin guion aprobado.`

- [ ] **Step 3: Implement**

```ts
/**
 * One voice request: the piece and the attempt, which every "Preparar mi voz", "Grabar la voz de nuevo" and script
 * edit bumps. The voice comes before gate 1 (design 2026-10-15), so no approval is part of it.
 */
export function claveVoz(fila: FilaParaClave): string {
  return claveIdempotencia({ piezaId: fila.id, paso: "voz", hash: hashTexto("voz"), intento: fila.intento })
}
```

- [ ] **Step 4: Run and see green**

Run: `pnpm test:run tests/unit/disparos.test.ts && pnpm test:db tests/integration/acciones-piezas.test.ts`
Expected: PASS (the `pedirVoz` test computes `claveVoz(guardada)` itself).

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/disparos.ts tests/unit/disparos.test.ts
git commit -m "Key the voice run by the attempt, not by gate 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `grabar-voz` speaks the script on the row, without an approval

**Files:**
- Modify: `lib/dominio/puertas.ts:84-104` (`Veredicto`, `puedeGrabarVoz`)
- Modify: `lib/produccion/grabar-voz.ts` (whole file)
- Test: `tests/unit/puertas.test.ts:289-303`, `tests/integration/grabar-voz.test.ts:110-118`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/puertas.test.ts`, replace the test "allows the voice only while grabando_voz, with gate 1 and the same
hash" with:

```ts
  it("allows the voice while grabando_voz with a script, with or without gate 1", () => {
    const sinFirma = { ...base, puerta1: null }
    expect(puedeGrabarVoz(sinFirma, "Hola, soy Coni.")).toEqual({ ok: true })
    expect(puedeGrabarVoz(base, "Hola, soy Coni.")).toEqual({ ok: true })
    expect(puedeGrabarVoz({ ...sinFirma, estado: "guion_por_aprobar" }, "Hola.")).toEqual({ ok: false, motivo: "estado" })
    expect(puedeGrabarVoz(sinFirma, null)).toEqual({ ok: false, motivo: "sin_guion" })
    expect(puedeGrabarVoz(sinFirma, "  \n")).toEqual({ ok: false, motivo: "sin_guion" })
  })
```

In `tests/integration/grabar-voz.test.ts`, replace the test "spends nothing and explains when the script changed after
the approval" with (the piece still comes back to `guion_aprobado` here; Task 11 moves it to `guion_por_aprobar`):

```ts
  it("speaks the script on the row now, even when it changed after she asked", async () => {
    const id = await grabando()
    const editado = "Un guion que Coni cambió mientras se preparaba la voz."
    await ajustarPieza(id, { guion: editado })
    const d = deps()
    const { intento } = await leerFila(id)

    const resultado = await grabarVoz(d, { piezaId: id, nueva: false })

    const clave = claveDeToma(id, huellaDelGuion(editado, leerConfigProduccion(coniConfig).elevenlabs), intento)
    expect(resultado).toEqual({ resultado: "lista", audioId: clave })
    expect(llamadas).toBe(1)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_aprobado", audio_id: clave })
  })
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/puertas.test.ts && pnpm test:db tests/integration/grabar-voz.test.ts`
Expected: FAIL. The unit test gets `artefacto_cambio`/`sin_aprobacion`; the integration test gets
`{ resultado: "sin_aprobacion" }`.

- [ ] **Step 3: Implement the gate**

In `lib/dominio/puertas.ts`, `Veredicto` gains the reason:

```ts
export type Veredicto =
  | { ok: true }
  | {
      ok: false
      motivo: "estado" | "sin_aprobacion" | "artefacto_cambio" | "antes_de_hora" | "hora_vencida" | "sin_guion"
    }
```

and `puedeGrabarVoz` becomes:

```ts
/**
 * The voice task calls this right before spending ElevenLabs. The voice is a draft made before gate 1 (design
 * 2026-10-15, decision 3): it needs no approval and speaks whatever script the row holds now.
 */
export function puedeGrabarVoz(pieza: Pieza, guion: string | null): Veredicto {
  if (pieza.estado !== "grabando_voz") return no("estado")
  if (guion === null || guion.trim() === "") return no("sin_guion")
  return { ok: true }
}
```

- [ ] **Step 4: Implement the task's flow**

```ts
// lib/produccion/grabar-voz.ts
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, type FilaDePieza, leerPieza, leerProduccion } from "@/lib/datos/repositorio"
import { ArtefactoCambio, type Evento, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { puedeGrabarVoz } from "@/lib/dominio/puertas"
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
  | { resultado: "tope" }
  | { resultado: "falla" }

async function escribir(deps: DepsGrabarVoz, fila: FilaDePieza, evento: Evento): Promise<void> {
  const { pieza } = transicionar(piezaDesdeFila(fila), evento)
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))
  // A plain Error: Trigger.dev retries, and the retry reads the piece again.
  if (!guardada) throw piezaCambio()
}

/**
 * Speaks the script on the row with Coni's voice and hands the piece back to gate 1. The voice is a draft made before
 * the signature (design 2026-10-15, decision 3), so it needs no approval and always matches what she sees. It reuses a
 * take of the same text unless she asked for a new one, and never approves anything. Safe to run again: the take of
 * this attempt is found in the store.
 */
export async function grabarVoz(
  deps: DepsGrabarVoz,
  entrada: { piezaId: string; nueva: boolean },
): Promise<ResultadoVoz> {
  const fila = await leerPieza(deps.db, entrada.piezaId)
  if (!fila) throw new FallaDeConfiguracion(`No existe la pieza ${entrada.piezaId}.`)
  if (fila.estado !== "grabando_voz") return { resultado: "nada_que_hacer" }
  const { guion } = fila
  // The app only asks for the voice of a written script: a piece without one is a bug for WAV, never a spend.
  if (guion === null || !puedeGrabarVoz(piezaDesdeFila(fila), guion).ok) {
    throw new FallaDeConfiguracion(`La pieza ${fila.id} pide su voz sin guion.`)
  }

  const config = leerConfigProduccion(await leerProduccion(deps.db))
  try {
    const voz = await asegurarVoz(deps, {
      fila,
      guion,
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

- [ ] **Step 5: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/puertas.test.ts && pnpm test:db tests/integration/grabar-voz.test.ts`
Expected: PASS. `artefactoAprobado` stays exported from `lib/produccion/aprobacion.ts` (the render still uses it).

- [ ] **Step 6: Commit**

```bash
git add lib/dominio/puertas.ts lib/produccion/grabar-voz.ts tests/unit/puertas.test.ts tests/integration/grabar-voz.test.ts
git commit -m "Speak the script on the row in grabar-voz, with no approval needed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Gate 1 signs the voice and the video; the third step goes away

The one big switch (spec sections 3, 4 and 7). After it, `aprobar_guion` lands in `en_render`, the voice events live
before the signature, `grabar_video` and `reabrir_guion` no longer exist, and the third step's bar is deleted. The new
gate 1 screen arrives in Task 16; until then the Guion screen is the editor and the slider with the old copy.

**Files:**
- Modify: `lib/dominio/estados.ts` (`Evento` lines 61-105; `transicionar` cases `guion_listo` to `reabrir_guion`, lines 215-267)
- Modify: `lib/acciones/piezas.ts` (imports lines 1-34; `aprobarGuion` lines 235-263; `pedirVoz` lines 265-282; delete `pedirVideo` and `reabrirGuion`, lines 284-302)
- Modify: `app/(app)/piezas/acciones.ts` (imports lines 8-26; delete `pedirVideoAccion` and `reabrirGuionAccion`, lines 199-211)
- Delete: `app/(app)/guion/[id]/barra-de-grabacion.tsx`, `tests/unit/barra-de-grabacion.test.tsx`
- Modify: `app/(app)/guion/[id]/pantalla-guion.tsx` (whole file, intermediate version)
- Modify: `app/(app)/guion/[id]/page.tsx` (lines 11, 42-46, 128-139, 161-163, 185-205)
- Modify: `lib/mantenimiento/voces.ts`, `lib/produccion/fallas.ts:53-57` (text and comments)
- Modify: `tests/integration/flujo.ts`
- Test: `tests/unit/estados.test.ts`, `tests/integration/acciones-piezas.test.ts`
- Modify (expectations only): `tests/integration/acciones-guion.test.ts`, `grabar-voz.test.ts`, `voces-trabadas.test.ts`, `fallas.test.ts`, `barrido-gastos.test.ts`, `destinos-funciones.test.ts`, `grabacion-esquema.test.ts`, `grabacion-datos.test.ts`

Unchanged on purpose: `lib/mantenimiento/arranques.ts` resumes a render that never started with the same key and no
delay (it acts after 10 minutes, long after the window); `lib/mantenimiento/gastos.ts` already releases a voice
reservation of a piece that is not in `grabando_voz` and has no take; `app/(app)/video/[id]/page.tsx`,
`lib/calendario/modelo.ts`, `lib/datos/pantallas.ts`, the state check of `trabajoDeEditar` in `lib/acciones/guion.ts`
and `ESTADOS_CON_TEXTO_DE_LINKEDIN_EDITABLE` in `lib/acciones/piezas.ts` still name `guion_aprobado`, which is now
unreachable and harmless.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/estados.test.ts`:

1. "recorre el camino feliz y sube la versión en cada paso": delete the line `{ tipo: "grabar_video" },`.
2. Replace "aprueba la puerta 1 sin exigir voz" with:

```ts
  it("la firma de la puerta 1 manda la pieza a grabar", () => {
    const { pieza } = transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), aprobarGuion())
    expect(pieza.estado).toBe("en_render")
  })
```

3. In `describe("tabla del diseño")`: `permitidos.guion_por_aprobar` becomes
   `["pedir_cambios", "editar_texto", "aprobar_guion", "pedir_voz", "descartar"]`; `permitidos.guion_aprobado` becomes
   `["descartar"]`; delete `grabar_video` and `reabrir_guion` from `eventos`; `piezas.grabando_voz` becomes
   `en("grabando_voz", { ...avance, audioId: "audio_1" })`.
4. Replace the whole `describe("aprobar, grabar la voz y grabar el video")` with:

```ts
describe("la voz antes de la firma", () => {
  const firmar = (instante: string = APROBADA.en): Evento => ({
    tipo: "aprobar_guion",
    actor: "coni",
    hashVisto: APROBADA.hash,
    hashActual: APROBADA.hash,
    en: instante,
  })

  it("signs straight into en_render, keeping the voice she heard and the attempt", () => {
    const { pieza } = transicionar(
      enCurso("guion_por_aprobar", { audioId: "voces/x.mp3", explicacion: "Antes." }),
      firmar(),
    )
    expect(pieza).toMatchObject({
      estado: "en_render",
      puerta1: APROBADA,
      audioId: "voces/x.mp3",
      intento: 2,
      version: 5,
      explicacion: null,
    })
  })

  it("asks for the voice before the signature as a new attempt and clears an old explanation", () => {
    const { pieza } = transicionar(enCurso("guion_por_aprobar", { explicacion: "falló" }), { tipo: "pedir_voz" })
    expect(pieza).toMatchObject({ estado: "grabando_voz", intento: 3, explicacion: null, puerta1: null })
  })

  it("comes back to guion_por_aprobar with the voice, or with the reason and a new attempt when it failed", () => {
    const grabando = enCurso("grabando_voz")
    expect(transicionar(grabando, { tipo: "voz_lista", audioId: "voces/v.mp3" }).pieza).toMatchObject({
      estado: "guion_por_aprobar",
      audioId: "voces/v.mp3",
      intento: 2,
    })
    expect(transicionar(grabando, { tipo: "falla_voz", explicacion: "Sin caracteres." }).pieza).toMatchObject({
      estado: "guion_por_aprobar",
      explicacion: "Sin caracteres.",
      intento: 3,
    })
  })

  it("still stores the voice while in render", () => {
    const { pieza } = transicionar(enCurso("en_render", { puerta1: APROBADA }), {
      tipo: "voz_lista",
      audioId: "voces/v.mp3",
    })
    expect(pieza).toMatchObject({ estado: "en_render", audioId: "voces/v.mp3" })
  })

  it("refuses the voice events and the signature from the wrong states", () => {
    expect(() => transicionar(enCurso("en_render", { puerta1: APROBADA }), { tipo: "pedir_voz" })).toThrow(
      TransicionInvalida,
    )
    expect(() => transicionar(enCurso("grabando_voz"), { tipo: "pedir_voz" })).toThrow(TransicionInvalida)
    expect(() => transicionar(enCurso("grabando_voz"), firmar())).toThrow(TransicionInvalida)
    expect(() => transicionar(enCurso("guion_por_aprobar"), { tipo: "falla_voz", explicacion: "x" })).toThrow(
      TransicionInvalida,
    )
    expect(() => transicionar(enCurso("guion_por_aprobar"), { tipo: "voz_lista", audioId: "v" })).toThrow(
      TransicionInvalida,
    )
  })

  it("edits the caption inside gate 1 without touching the voice", () => {
    const editado = transicionar(enCurso("guion_por_aprobar", { audioId: "voces/x.mp3" }), { tipo: "editar_texto" })
    expect(editado.pieza).toMatchObject({ estado: "guion_por_aprobar", audioId: "voces/x.mp3", intento: 2 })
    expect(editado.efectos).toEqual(["revisar_texto"])
  })

  it("lets Coni discard a piece while her voice is being made", () => {
    expect(transicionar(enCurso("grabando_voz"), { tipo: "descartar" }).pieza.estado).toBe("descartado")
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: FAIL: the signature lands in `guion_aprobado`, `pedir_voz` from `guion_por_aprobar` is refused.

- [ ] **Step 3: Implement the domain**

In `lib/dominio/estados.ts`, `Evento` from `elegir` to `voz_lista` becomes:

```ts
export type Evento =
  | { tipo: "elegir" }
  /** The writer hands the script over with her voice of it; null with the reason when the voice could not be made. */
  | { tipo: "guion_listo"; audioId: string | null; explicacion?: string }
  | { tipo: "pedir_cambios" }
  | { tipo: "editar_texto" }
  /** Coni signs the script, her voice and the video spend in one gesture; the video starts after the undo window. */
  | { tipo: "aprobar_guion"; actor: Actor; hashVisto: string; hashActual: string; en: string }
  /** Her voice of the current script, before the signature (spends ElevenLabs; a script edit asks for it too). */
  | { tipo: "pedir_voz" }
  | { tipo: "falla_voz"; explicacion: string }
  /** Coni takes her gate 1 signature back while the undo window lasts. `ahora` is the server clock. */
  | { tipo: "deshacer_aprobacion"; actor: Actor; ahora: string }
  /** The voice is stored by the voice task, or by the render when it had to make it. */
  | { tipo: "voz_lista"; audioId: string }
```

(the members after `voz_lista` stay as they are). In `transicionar`, the cases from `guion_listo` to the end of
`reabrir_guion` (and the `deshacer_aprobacion` case added in Task 4) become:

```ts
    case "guion_listo":
      if (estado !== "guion_en_proceso") throw invalida()
      return a("guion_por_aprobar", { audioId: evento.audioId, explicacion: evento.explicacion ?? null })

    case "pedir_cambios":
      if (estado !== "guion_por_aprobar") throw invalida()
      // A new script round is a new attempt: its Claude and voice spend must not reuse the keys of the old round.
      return a("guion_en_proceso", { audioId: null, intento: pieza.intento + 1 })

    case "editar_texto":
      if (estado === "guion_por_aprobar") return a("guion_por_aprobar", {}, ["revisar_texto"])
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
      // The signature commits the video (design 2026-10-15): the action starts it after the undo window. The voice
      // she heard stays; the action checked that it speaks this script.
      return a("en_render", { puerta1: { hash: evento.hashVisto, en: instanteDelServidor(evento.en) } })

    case "pedir_voz":
      if (estado !== "guion_por_aprobar") throw invalida()
      // A new attempt: a new run, a new spend key and, for "Grabar la voz de nuevo", a new take.
      return a("grabando_voz", { intento: pieza.intento + 1 })

    case "voz_lista":
      if (estado === "grabando_voz") return a("guion_por_aprobar", { audioId: evento.audioId })
      if (estado !== "en_render") throw invalida()
      return a("en_render", { audioId: evento.audioId })

    case "falla_voz":
      if (estado !== "grabando_voz") throw invalida()
      // A new attempt, so the next voice or render never meets the released reservation of this one.
      return a("guion_por_aprobar", { intento: pieza.intento + 1, explicacion: evento.explicacion })

    case "deshacer_aprobacion":
      soloConi(evento.actor)
      if (estado !== "en_render" || pieza.puerta1 === null) throw invalida()
      if (restoDeVentana(pieza.puerta1.en, evento.ahora) === 0) throw new Falla(TEXTO_DESHACER_TARDE)
      // Her voice and the attempt stay: the render key of this text does not change, so a delayed run that fires
      // anyway finds the piece here and spends nothing, and signing the same text again reuses its key.
      return a("guion_por_aprobar", { puerta1: null })
```

Run `pnpm test:run tests/unit/estados.test.ts`: PASS. `pnpm type` now fails in `lib/acciones/piezas.ts`
(`grabar_video`, `reabrir_guion`) and `tests/integration/flujo.ts`: the next steps fix them.

- [ ] **Step 4: Write the failing integration tests of the actions**

In `tests/integration/acciones-piezas.test.ts`:

1. Imports: delete `pedirVideo` and `reabrirGuion` from the `@/lib/acciones/piezas` import, and add

```ts
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { leerConfigProduccion } from "@/lib/proveedores/config"
```

2. Under `const FUTURO`:

```ts
const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs
/** A take of `guion` for this piece, as the writer or grabar-voz stores it. */
const tomaDe = (id: string, guion: string, toma = 0) => claveDeToma(id, huellaDelGuion(guion, ELEVENLABS), toma)
const AVISO_GRABACION = "Quedó aprobado, pero la grabación tarda en partir. Si no avanza, te aviso."
```

3. `interface Disparo` gains `retraso?: string`, and the `grabar` fake of `armar` becomes:

```ts
      async grabar(piezaId, clave, retraso) {
        if (fallos.grabar) throw fallos.grabar
        disparos.push({ tarea: "grabar", piezaId, clave, ...(retraso ? { retraso } : {}) })
      },
```

4. Move `paraAprobar` out of `describe("aprobarGuion")` to module scope, right after `sembrarAvatares`, as:

```ts
/** A script waiting for gate 1 with her voice of it, as the writer leaves it. */
async function paraAprobar() {
  const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarComoPostgres(id, { audio_id: tomaDe(id, GUION_VALIDO) })
  return id
}
```

5. In `describe("aprobarGuion")`: delete "keeps a stored voice: it only counts later if it speaks the approved text";
   in "approves the script even when the LinkedIn text has a blocking finding" the expected `estado` becomes
   `"en_render"`; replace "approves a piece with no voice, stores formula 3 and binds the hash of script, text, avatar
   and backing" and "starts no run, so a broken Trigger.dev does not matter to the approval" with:

```ts
  it("signs the script with her voice, stores formula 3, binds the hash and starts the video after the undo window", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()
    const versionVista = await versionDe(id)

    const resultado = await aprobarGuion(deps, id, versionVista, "look-b")

    expect(resultado).toEqual({ ok: true })
    const guardada = await fila(id)
    expect(guardada).toMatchObject({
      estado: "en_render",
      puerta1_por: CONI,
      version: versionVista + 1,
      avatar_id: "look-b",
      audio_id: tomaDe(id, GUION_VALIDO),
      puerta1_formula: 3,
    })
    expect(guardada.puerta1_hash).toBe(
      hashPuerta1({ formula: 3, guion: GUION_VALIDO, texto: TEXTO_VALIDO, avatarId: "look-b", respaldo: "" }),
    )
    expect(disparos).toEqual([{ tarea: "grabar", piezaId: id, clave: claveGrabar(guardada), retraso: "10s" }])
  })

  it("refuses to sign without her voice of the current script, and starts nothing", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()

    for (const audio of [null, claveAudio(id, new Uint8Array([1, 2, 3])), tomaDe(id, "Un guion que ya no está.")]) {
      await ajustarComoPostgres(id, { audio_id: audio })
      expect(await aprobarGuion(deps, id, await versionDe(id), "look-a")).toEqual({
        ok: false,
        error: "Tu voz no corresponde al guion actual. Prepárala antes de firmar.",
      })
    }
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("stays signed and warns when the video could not be started", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await paraAprobar()
    const { deps } = armar(coni, { grabar: new Error("Trigger.dev no responde") })

    expect(await aprobarGuion(deps, id, await versionDe(id), "look-a")).toEqual({
      ok: true,
      advertencia: AVISO_GRABACION,
    })
    expect(await fila(id)).toMatchObject({ estado: "en_render" })
  })
```

6. Replace the whole `describe("pedirVoz, pedirVideo y reabrirGuion")` with:

```ts
describe("pedirVoz", () => {
  it("moves a script waiting for her signature to grabando_voz and starts grabar-voz once with the attempt's key", async () => {
    const id = await pieza("guion_por_aprobar")
    const antes = await fila(id)
    const { deps, disparos } = armar()

    expect(await pedirVoz(deps, id, antes.version, false)).toEqual({ ok: true })

    const guardada = await fila(id)
    expect(guardada).toMatchObject({ estado: "grabando_voz", puerta1_hash: null, intento: antes.intento + 1 })
    expect(disparos).toEqual([{ tarea: "voz", piezaId: id, clave: claveVoz(guardada), nueva: false }])
  })

  it("hands the piece back with the reason when grabar-voz cannot start", async () => {
    const id = await pieza("guion_por_aprobar")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { deps } = armar(coni, { voz: new Error("Trigger.dev no responde") })

    expect(await pedirVoz(deps, id, await versionDe(id), true)).toEqual({ ok: false, error: TEXTO_SIN_VOZ })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", explicacion: TEXTO_SIN_VOZ })
  })

  it("refuses a signed piece: the voice is made before the signature", async () => {
    const id = await pieza("en_render")
    const { deps, disparos } = armar()

    expect((await pedirVoz(deps, id, await versionDe(id), false)).ok).toBe(false)
    expect(disparos).toEqual([])
  })

  it("refuses a stale screen and starts nothing", async () => {
    const id = await pieza("guion_por_aprobar")
    const { deps, disparos } = armar()

    expect((await pedirVoz(deps, id, (await versionDe(id)) - 1, false)).ok).toBe(false)
    expect(disparos).toEqual([])
  })
})
```

7. Replace "keeps gate 1 in guion_aprobado: the LinkedIn text is not part of it" with:

```ts
  it("leaves her voice alone: the LinkedIn text is not part of gate 1", async () => {
    const id = await pieza("guion_por_aprobar", { texto: TEXTO_VALIDO, audio_id: "voces/x.mp3" })
    const antes = await fila(id)
    const { deps, disparos } = armar()

    const resultado = await editarTextoLinkedin(deps, id, antes.version, LINKEDIN_OK)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      audio_id: "voces/x.mp3",
      texto_linkedin: LINKEDIN_OK,
    })
    expect(disparos).toEqual([])
  })
```

- [ ] **Step 5: The test flow signs straight into the render**

In `tests/integration/flujo.ts`:

1. Add, after `const maniana = ...`:

```ts
/** Gate 1 as the screen writes it: Coni's session, with the avatar and the formula in the same update as the approval. */
export function aprobarComoConi(c: pg.PoolClient, id: string, en: string): Promise<FilaLeida> {
  const hash = hashPuerta1({ formula: 2, guion: GUION, texto: TEXTO, avatarId: AVATAR })
  return aplicar(
    c,
    id,
    comoConi,
    { tipo: "aprobar_guion", actor: "coni", hashVisto: hash, hashActual: hash, en },
    { avatar_id: AVATAR, puerta1_formula: 2 },
  )
}
```

2. In `pasos`, the approval step (the `aplicar(... "aprobar_guion" ...)` block) becomes
   `(c, id) => aprobarComoConi(c, id, ahora()),` and the step `(c, id) => aplicar(c, id, comoConi, { tipo: "grabar_video" }),`
   is deleted.
3. `PASOS_HASTA` becomes:

```ts
const PASOS_HASTA: Partial<Record<Estado, number>> = {
  idea: 0,
  guion_en_proceso: 1,
  guion_por_aprobar: 2,
  // Walked to guion_por_aprobar, then Coni asks for her voice (`crearPiezaEn`).
  grabando_voz: 2,
  en_render: 3,
  subtitulando: 4,
  video_por_aprobar: 5,
  programado: 6,
  publicado: 7,
  para_subir_a_mano: 7,
  publicado_a_mano: 7,
}
```

4. In `crearPiezaEn`, `const hastaProgramado = destino === "publicado_a_mano" || destino in PASO_A_MANO ? 6 : cuantos`.
   The `grabando_voz` line stays as it is. `guion_aprobado` has no route any more (`Sin ruta de prueba hacia ...`).

- [ ] **Step 6: Run the integration tests and see them fail**

Run: `pnpm test:db tests/integration/acciones-piezas.test.ts`
Expected: FAIL: the signature starts no run and accepts a missing or foreign voice; the voice-start failure still
reads "No pude empezar a grabar la voz...".

- [ ] **Step 7: Implement the actions**

In `lib/acciones/piezas.ts`:

1. Imports: add `leerProduccion` to the `@/lib/datos/repositorio` import; the `@/lib/dominio/estados` import becomes
   `import { ArtefactoCambio, type Evento, instanteEstricto, MARGEN_DE_RELOJ_MS, TransicionInvalida, transicionar, VENTANA_DESHACER_MS } from "@/lib/dominio/estados"`;
   add `import { vozDelGuion } from "@/lib/dominio/voz"`, `import { huellaDelGuion, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"`
   and `import { leerConfigProduccion } from "@/lib/proveedores/config"`.
2. After `const AVISO_GRABACION = ...`:

```ts
/** The undo window plus the clock margin: the render starts once Coni can no longer take the signature back. */
export const RETRASO_DE_GRABACION = `${(VENTANA_DESHACER_MS + MARGEN_DE_RELOJ_MS) / 1000}s`

const TEXTO_VOZ_AJENA = "Tu voz no corresponde al guion actual. Prepárala antes de firmar."

/** The voice she heard has to be a take of this exact script with the configured voice (design 2026-10-15, decision 4). */
async function exigirVozDelGuion(db: Db, fila: FilaDePieza, guion: string): Promise<void> {
  const config = leerConfigProduccion(await leerProduccion(db))
  const voz = vozDelGuion({ audioId: fila.audio_id, piezaId: fila.id, huella: huellaDelGuion(guion, config.elevenlabs) })
  if (voz === null) throw new Falla(TEXTO_VOZ_AJENA)
}
```

3. `aprobarGuion` (doc comment and body) becomes:

```ts
/**
 * Gate 1 signs the script, the publication text, the avatar, the frozen backing (formula 3) and her voice of that
 * script, and commits the video spend (design 2026-10-15). The avatar and the formula go in the same update as the
 * approval, so the hash is the hash of exactly what she saw. The video starts after the undo window; a run that fails
 * to start is resumed by `reanudarArranques`, so the signature stands with a warning.
 */
export function aprobarGuion(deps: DepsAcciones, piezaId: string, versionVista: number, avatarId: string | null) {
  return aResultado("aprobarGuion", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista, new ArtefactoCambio())
    // `versionVista` is the version of the screen she signed, and the write below only matches that version, so the
    // hash recomputed from this row is the hash of exactly what she saw.
    if (fila.estado !== "guion_por_aprobar") throw new TransicionInvalida(fila.estado, "aprobar_guion")
    if (fila.guion === null || fila.texto === null) {
      throw new Error(`La pieza ${fila.id} está por aprobar sin guion o sin texto.`)
    }
    exigirRevisionLimpia(fila, { linkedin: false })
    const avatar = await exigirAvatarElegible(deps.db, avatarId)
    await exigirVozDelGuion(deps.db, fila, fila.guion)
    const respaldo = huellaDeRespaldo(leerRespaldo(fila.respaldo))
    const hash = hashPuerta1({ formula: 3, guion: fila.guion, texto: fila.texto, avatarId: avatar, respaldo })
    const firmada = await guardarEvento(
      deps.db,
      fila,
      { tipo: "aprobar_guion", actor: "coni", hashVisto: hash, hashActual: hash, en: deps.ahora() },
      { avatar_id: avatar, puerta1_formula: 3 },
    )
    return iniciar(
      "grabar-pieza",
      () => deps.disparar.grabar(firmada.id, claveGrabar(firmada), RETRASO_DE_GRABACION),
      AVISO_GRABACION,
    )
  })
}
```

4. Delete `const TEXTO_SIN_ARRANQUE_DE_VOZ = ...`; `pedirVoz` becomes:

```ts
/** Her voice of the current script, before the signature. Nothing else would start this run, so a failure to start hands the piece back. */
export function pedirVoz(deps: DepsAcciones, piezaId: string, versionVista: number, nueva: boolean) {
  return aResultado("pedirVoz", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "pedir_voz" })
    try {
      await deps.disparar.voz(guardada.id, claveVoz(guardada), nueva)
    } catch (error) {
      console.error("No pude iniciar grabar-voz", error)
      await guardarEvento(deps.db, guardada, { tipo: "falla_voz", explicacion: TEXTO_SIN_VOZ })
      throw new Falla(TEXTO_SIN_VOZ)
    }
    return {}
  })
}
```

5. Delete `pedirVideo` and `reabrirGuion` (and their doc comments).

In `app/(app)/piezas/acciones.ts`: delete `pedirVideo` and `reabrirGuion` from the `@/lib/acciones/piezas` import and
delete the functions `pedirVideoAccion` and `reabrirGuionAccion`.

- [ ] **Step 8: Remove the third step's screen**

```bash
git rm "app/(app)/guion/[id]/barra-de-grabacion.tsx" tests/unit/barra-de-grabacion.test.tsx
```

`app/(app)/guion/[id]/pantalla-guion.tsx` becomes (intermediate: the editor and the slider; Task 16 adds the voice):

```tsx
"use client"

import { CaretLeft } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { EditorDeGuion, type GuionGuardado } from "@/components/editor-de-guion"
import { type AvatarParaElegir, ElegirAvatar } from "@/components/elegir-avatar"
import { Seccion } from "@/components/seccion"
import { TextoLinkedinEnLectura } from "@/components/texto-linkedin-en-lectura"
import { Aviso } from "@/components/ui/aviso"
import { BarraDeFirma } from "@/components/ui/barra-de-firma"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { useAccion } from "@/components/use-accion"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { aprobarGuionAccion, pedirCambiosAccion } from "../../piezas/acciones"

export interface DatosDeGuion {
  id: string
  version: number
  titulo: string
  pilar: Pilar | null
  formato: string | null
  segundos: number
  guion: string
  texto: string
  /** The LinkedIn text, shown read only: it is reviewed and edited at gate 2. Null when the piece has none yet. */
  textoLinkedin: string | null
  revision: Hallazgo[]
  /** Whether there is a version Claude wrote to go back to. */
  tieneVersionDeClaude: boolean
  /** "jueves 16 de octubre · 19:00": when it would go out if she approves today. */
  salida: string | null
  explicacion: string | null
  /** The looks WAV lets her choose; empty means there is nothing to choose and the approval stays blocked. */
  avatares: AvatarParaElegir[]
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

/** Gate 1: she reads and edits the script, confirms what the review flagged, and slides. Signing starts the video. */
export function PantallaGuion({ datos }: { datos: DatosDeGuion }) {
  const [version, setVersion] = useState(datos.version)
  const [revision, setRevision] = useState(datos.revision)
  const [sinGuardar, setSinGuardar] = useState(false)
  const [avatarElegido, setAvatarElegido] = useState<string | null>(null)
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  const [pidiendoCambios, setPidiendoCambios] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const aprobacion = useAccion()
  const cambios = useAccion()

  const bloqueos = revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const advertencias = revision.filter((hallazgo) => hallazgo.tipo === "advierte")
  const sinConfirmar = advertencias.filter((hallazgo) => !confirmadas.has(claveDe(hallazgo)))

  const sinAvatares = datos.avatares.length === 0
  const faltan = [
    ...(avatarElegido === null && !sinAvatares ? ["elegir el avatar"] : []),
    ...(sinConfirmar.length > 0 ? ["confirmar la revisión"] : []),
  ]
  const faltaTexto = faltan.length > 1 ? `${faltan.slice(0, -1).join(", ")} y ${faltan.at(-1)}` : faltan.join("")
  const motivo = sinGuardar
    ? "Guarda tus cambios antes de aprobar"
    : bloqueos.length > 0
      ? "Hay algo que corregir antes de aprobar."
      : sinAvatares
        ? "Todavía no hay avatares para elegir."
        : faltan.length > 0
          ? `Falta ${faltaTexto}.`
          : undefined
  const habilitado = motivo === undefined

  function alGuardar(guardado: GuionGuardado) {
    setVersion(guardado.version)
    setRevision(guardado.revision)
    // The ticks belong to the review she saw: a new review asks again.
    setConfirmadas(new Set())
  }

  function alternarConfirmacion(hallazgo: Hallazgo, confirmada: boolean) {
    setConfirmadas((actuales) => {
      const siguientes = new Set(actuales)
      if (confirmada) siguientes.add(claveDe(hallazgo))
      else siguientes.delete(claveDe(hallazgo))
      return siguientes
    })
  }

  return (
    <div className="pb-[calc(var(--barra-max)+env(safe-area-inset-bottom))]">
      <header data-pilar={datos.pilar ?? undefined} className="grid gap-3">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta"
        >
          <CaretLeft aria-hidden="true" size={20} />
          Inicio
        </Link>
        <p className="flex items-baseline justify-between gap-4 text-meta text-apagado">
          <span>{datos.pilar ? NOMBRE_DE_PILAR[datos.pilar] : null}</span>
          <span>
            {datos.formato ? `${datos.formato} · ` : ""}
            {datos.segundos} s
          </span>
        </p>
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
        {datos.salida ? (
          <LineaDeEstado
            tipo="fecha"
            titulo={
              <>
                Si lo apruebas hoy, sale el{" "}
                <span className="font-semibold whitespace-nowrap text-firma tabular-nums">{datos.salida}</span>
              </>
            }
            tituloEnTinta
          />
        ) : null}
      </header>

      {datos.explicacion ? (
        <div className="mt-6">
          <LineaDeEstado tipo="aviso" titulo={datos.explicacion} tituloEnTinta />
        </div>
      ) : null}

      <div className="mt-10">
        <EditorDeGuion
          piezaId={datos.id}
          version={version}
          guion={datos.guion}
          texto={datos.texto}
          tieneVersionDeClaude={datos.tieneVersionDeClaude}
          alGuardar={alGuardar}
          alCambiarSinGuardar={setSinGuardar}
        />
      </div>
      {datos.textoLinkedin !== null ? <TextoLinkedinEnLectura texto={datos.textoLinkedin} /> : null}
      <Seccion titulo="Avatar" id="avatar">
        <ElegirAvatar avatares={datos.avatares} elegido={avatarElegido} alElegir={setAvatarElegido} />
      </Seccion>

      <Seccion titulo="Revisión" id="revision" cifra={revision.length > 0 ? revision.length : undefined}>
        <p className="text-cuerpo text-apagado">
          {revision.length === 0
            ? "Claude revisó el guion y no encontró observaciones. Tú decides."
            : "Claude revisó el guion. Tú decides."}
        </p>
        <div className="grid gap-4">
          {revision.map((hallazgo) => (
            <MarcaRevision
              key={claveDe(hallazgo)}
              hallazgo={hallazgo}
              confirmada={confirmadas.has(claveDe(hallazgo))}
              alCambiar={(confirmada) => alternarConfirmacion(hallazgo, confirmada)}
            />
          ))}
        </div>
      </Seccion>

      <div className="mt-10 grid gap-2">
        {pidiendoCambios ? (
          <ConfirmacionEnLinea
            trato="destructivo"
            pregunta="Se escribe un guion nuevo y este se descarta. ¿Seguro?"
            confirmar="Sí, pedir cambios"
            volver="Volver"
            cargando={cambios.pendiente}
            alConfirmar={() =>
              cambios.ejecutar(
                () => pedirCambiosAccion(datos.id, version),
                (r) => setAviso(r.advertencia ?? null),
              )
            }
            alVolver={() => setPidiendoCambios(false)}
          />
        ) : (
          <Boton variante="destructiva" onClick={() => setPidiendoCambios(true)}>
            Pedir cambios
          </Boton>
        )}
      </div>
      <BarraDeFirma etiqueta="Firma">
        {aprobacion.error || cambios.error ? (
          <LineaDeEstado tipo="error" titulo={aprobacion.error ?? cambios.error} />
        ) : null}
        <DeslizarParaAprobar
          etiqueta="Desliza para aprobar el guion"
          habilitado={habilitado}
          motivo={motivo}
          enviando={aprobacion.pendiente}
          alAprobar={() => aprobacion.ejecutar(() => aprobarGuionAccion(datos.id, version, avatarElegido))}
        />
      </BarraDeFirma>
      {aviso ? <Aviso mensaje={aviso} alCerrar={() => setAviso(null)} sobreBarra /> : null}
    </div>
  )
}
```

In `app/(app)/guion/[id]/page.tsx`:

1. `import { leerDatosDeGrabacion, vozVigente } from "@/lib/datos/grabacion"` becomes
   `import { vozVigente } from "@/lib/datos/grabacion"`.
2. The first cases of the switch become (a `guion_aprobado` row, unreachable now, falls to `default`):

```tsx
    case "guion_por_aprobar":
    case "grabando_voz":
      break
```

3. Replace the block from `const estado = fila.estado` to `const avatarElegido = ...` with:

```tsx
  const [avatares, conVersionDeClaude] = await Promise.all([
    avataresParaElegir(db),
    tieneVersionDeClaude({ db }, fila.id),
  ])
```

4. In the `datos` passed to `PantallaGuion`, delete the lines `grabacion,` and `avatarElegido,`.
5. `avataresParaElegir` loses its second parameter:

```tsx
/** The curated looks with a signed link to each photo. A setup that does not read leaves the list empty, which blocks. */
async function avataresParaElegir(db: Parameters<typeof leerAvataresElegibles>[0]) {
  let elegibles: Awaited<ReturnType<typeof leerAvataresElegibles>>
  try {
    elegibles = await leerAvataresElegibles(db)
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer los avatares para elegir", error)
    return []
  }
  return Promise.all(
    elegibles.map(async (avatar) => ({
      id: avatar.avatar_id,
      nombre: avatar.nombre,
      imagenUrl: await urlParaVer(avatar.imagen),
    })),
  )
}
```

- [ ] **Step 9: Stuck voices and failed voice runs go back to gate 1**

`lib/mantenimiento/voces.ts`: add `import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"`, and

```ts
/** A stuck voice is handed back like any voice that could not be made: Coni asks for it again with "Preparar mi voz". */
export const EXPLICACION_VOZ_TRABADA = TEXTO_SIN_VOZ
```

with the doc of `devolverVocesTrabadas`:

```ts
/**
 * The net under `grabar-voz`: a piece left in `grabando_voz` goes back to gate 1 with a reason, so Coni can ask for her
 * voice again. A run that was only slow finds the piece moved and ends without writing; its take stays in the store
 * and the next "Preparar mi voz" reuses it.
 */
```

`lib/produccion/fallas.ts`, the doc of `dejarConstancia` ends with "... the render steps go to `error_produccion` so
Coni can retry them, and the voice step goes back to gate 1 (`guion_por_aprobar`). A piece that already moved on is
not touched." (code unchanged: `falla_voz` now lands there).

- [ ] **Step 10: The other suites follow the new flow**

- `tests/integration/acciones-guion.test.ts`: delete the test "takes the approval back when she edits the script of
  an approved piece" (there is no approved, editable script any more; `aprobar-voz-esquema.test.ts` still covers the
  SQL function on a `guion_aprobado` row).
- `tests/integration/grabar-voz.test.ts`: `enEstado` takes `"grabando_voz" | "guion_por_aprobar"`; the first test is
  renamed "speaks the current script once, stores the take and returns the piece to guion_por_aprobar" and expects
  `estado: "guion_por_aprobar"`; "does nothing for a piece that is not recording its voice" uses
  `enEstado("guion_por_aprobar")`; in "speaks the script on the row now, even when it changed after she asked", "explains
  the cap and spends nothing when the voice would pass it" and "returns the piece with Coni's text when ElevenLabs has
  no characters" the expected `estado` becomes `"guion_por_aprobar"`.
- `tests/integration/voces-trabadas.test.ts:24`: `estado: "guion_por_aprobar"`.
- `tests/integration/fallas.test.ts:63-71`: the test is renamed "returns a piece left in grabando_voz to
  guion_por_aprobar with a generic text when grabar-voz gives up" and expects `estado: "guion_por_aprobar"`.
- `tests/integration/barrido-gastos.test.ts`: the four `pieza("guion_aprobado")` become `pieza("guion_por_aprobar")`
  (a piece that is not recording its voice, as before).
- `tests/integration/destinos-funciones.test.ts:54`: `it.each(["guion_por_aprobar"] as const)(`.
- `tests/integration/grabacion-esquema.test.ts:71`: delete `await aplicar(c, id, comoConi, { tipo: "grabar_video" })`
  (the approval itself enters `en_render` and clears `render_id`).
- `tests/integration/grabacion-datos.test.ts:64`: `const id = await sembrarPieza("en_render", ajustes)` (an approved
  piece; Task 15 moves the bar's tests to gate 1).

- [ ] **Step 11: Run everything and see green**

Run: `pnpm type && pnpm test:run && pnpm db:reset && pnpm test:db`
Expected: all green. `pnpm test:e2e` is in the known red window until Task 19.

- [ ] **Step 12: Commit**

```bash
git add -A lib/dominio/estados.ts lib/acciones/piezas.ts "app/(app)/piezas/acciones.ts" "app/(app)/guion/[id]" lib/mantenimiento/voces.ts lib/produccion/fallas.ts tests/
git commit -m "Sign the voice and the video at gate 1 and remove the third step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The render waits out the undo window before any spend

Spec section 5, "second lock in the render". The run waits once per signature: if Coni undoes and signs again during
the wait, the new signature has its own window, and the run waits for it too (the idempotency key of the same text
returns the first delayed run, which may fire earlier than 10 s after the second signature).

**Files:**
- Modify: `lib/produccion/grabar.ts` (`DepsGrabacion` lines 41-60; `grabarPieza` lines 248-256; a new helper before it)
- Modify: `lib/produccion/deps-reales.ts:78-104` (`depsGrabacion`)
- Modify: `trigger/grabar-pieza.ts:29-32`
- Modify: `tests/integration/flujo.ts` (gate 1 signed a minute ago)
- Test: `tests/integration/grabar.test.ts`, `tests/unit/deps-grabacion.test.ts`, `tests/integration/ffmpeg.test.ts:215-218`

- [ ] **Step 1: The walked pieces were signed a minute ago**

In `tests/integration/flujo.ts`, after `const maniana = ...`:

```ts
/** A walked piece was signed a minute ago: its undo window is long closed, so a render of it never waits. */
const haceUnMinuto = (): string => new Date(Date.now() - 60_000).toISOString()
```

and the approval step of `pasos` becomes `(c, id) => aprobarComoConi(c, id, haceUnMinuto()),`.

- [ ] **Step 2: Write the failing tests**

In `tests/integration/grabar.test.ts`:

1. Add `aprobarComoConi` to the `./flujo` import.
2. `interface Doble` gains `ventanas: number[]`; in `doble`, declare `const ventanas: number[] = []`, add
   `esperar: async (ms) => { ventanas.push(ms) },` to `deps` before `...cambios`, and return
   `{ deps, almacen, quemados, sondeados, esperas, ventanas }`.
3. Append:

```ts
describe("grabarPieza y la ventana para deshacer", () => {
  /** A clock that starts `desde` ms after the signature and moves only when the run waits. */
  async function relojTrasLaFirma(id: string, desde: number) {
    const { rows } = await pool.query<{ en: Date }>("select puerta1_en as en from public.piezas where id = $1", [id])
    const firma = rows[0]?.en
    if (!firma) throw new Error(`La pieza ${id} no tiene firma`)
    let ms = firma.getTime() + desde
    return {
      firma: firma.getTime(),
      ahora: () => new Date(ms).toISOString(),
      avanzar: (espera: number) => {
        ms += espera
      },
    }
  }

  it("waits out the window and the clock margin before it spends, then records once", async () => {
    const id = await crearPiezaEnRender()
    const reloj = await relojTrasLaFirma(id, 3000)
    const sim = simular()
    const ventanas: number[] = []
    const d = doble({
      ahora: reloj.ahora,
      esperar: async (ms) => {
        ventanas.push(ms)
        reloj.avanzar(ms)
      },
    })
    await conVozEnAlmacen(d.almacen, id)

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(ventanas).toEqual([7000])
    expect(sim.creaciones).toHaveLength(1)
  })

  it("spends nothing when Coni undoes while the run waits", async () => {
    const id = await crearPiezaEnRender()
    const reloj = await relojTrasLaFirma(id, 3000)
    const sim = simular()
    const d = doble({
      ahora: reloj.ahora,
      esperar: async (ms) => {
        await enTransaccion(async (c) => {
          await aplicar(c, id, comoConi, {
            tipo: "deshacer_aprobacion",
            actor: "coni",
            ahora: new Date(reloj.firma + 4000).toISOString(),
          })
        })
        reloj.avanzar(ms)
      },
    })

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "nada_que_hacer" })
    expect(sim.assets).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
    expect((await gastos(id)).filter((g) => g.proveedor === "heygen")).toEqual([])
    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
  })

  it("waits for the second window when she undoes and signs again, and pays HeyGen once", async () => {
    const id = await crearPiezaEnRender()
    const reloj = await relojTrasLaFirma(id, 3000)
    const sim = simular()
    const ventanas: number[] = []
    const d = doble({
      ahora: reloj.ahora,
      esperar: async (ms) => {
        if (ventanas.length === 0) {
          await enTransaccion(async (c) => {
            await aplicar(c, id, comoConi, {
              tipo: "deshacer_aprobacion",
              actor: "coni",
              ahora: new Date(reloj.firma + 4000).toISOString(),
            })
            await aprobarComoConi(c, id, new Date(reloj.firma + 5000).toISOString())
          })
        }
        ventanas.push(ms)
        reloj.avanzar(ms)
      },
    })
    await conVozEnAlmacen(d.almacen, id)

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(ventanas).toEqual([7000, 5000])
    // The delayed run of the second signature comes later and finds the video already made.
    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "nada_que_hacer" })
    expect(sim.creaciones).toHaveLength(1)
    expect((await gastos(id)).filter((g) => g.proveedor === "heygen")).toHaveLength(1)
  })

  it("does not wait for a signature whose window closed long ago", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(d.ventanas).toEqual([])
  })
})
```

In `tests/unit/deps-grabacion.test.ts`, `ESPERA` becomes

```ts
const ESPERA = {
  callbackUrl: "https://api.trigger.dev/callback",
  esperarRender: async () => {},
  esperar: async () => {},
}
```

and in "builds the dependencies of a run with the callback and the wait it was given" the object passed to
`depsGrabacion` gains `esperar: async (ms) => { ventanas.push(ms) },` (with `const ventanas: number[] = []` next to
`esperas`), and the test ends with:

```ts
    await deps.esperar(7000)
    expect(ventanas).toEqual([7000])
```

In `tests/integration/ffmpeg.test.ts`, the object passed to `depsGrabacion` gains `esperar: async () => {},`.

- [ ] **Step 3: Run them and see them fail**

Run: `pnpm test:db tests/integration/grabar.test.ts && pnpm test:run tests/unit/deps-grabacion.test.ts`
Expected: FAIL. The run creates the video without waiting (`ventanas` is `[]`), and spends after an undo;
`deps.esperar` is undefined in the unit test.

- [ ] **Step 4: Implement**

`lib/produccion/grabar.ts`:

1. Add `esperaDeVentana` to the `@/lib/dominio/estados` import.
2. `DepsGrabacion` gains, after `esperarRender`:

```ts
  /** Waits that long before the run goes on (`wait.for` in the task): the undo window of a fresh signature. */
  esperar: (ms: number) => Promise<void>
```

3. Before `grabarPieza`:

```ts
/**
 * The second lock of the undo window (design 2026-10-15, decision 5). A run that starts while Coni can still take her
 * signature back waits until the window and the clock margin are over, then decides on the row as it is now. A new
 * signature made during the wait (undo and sign again) has its own window, so the run waits once per signature.
 */
async function despuesDeLaVentana(deps: DepsGrabacion, leida: FilaDePieza): Promise<FilaDePieza | null> {
  let fila: FilaDePieza | null = leida
  let esperada: string | null = null
  while (fila?.estado === "en_render") {
    const firma = piezaDesdeFila(fila).puerta1
    if (firma === null || firma.en === esperada) break
    const espera = esperaDeVentana(firma.en, deps.ahora())
    if (espera === 0) break
    await deps.esperar(espera)
    esperada = firma.en
    fila = await leerPieza(deps.db, fila.id)
  }
  return fila
}
```

4. The start of `grabarPieza` becomes:

```ts
export async function grabarPieza(deps: DepsGrabacion, piezaId: string): Promise<ResultadoGrabacion> {
  const { db } = deps
  const leida = await leerPieza(db, piezaId)
  if (!leida) {
    throw new FallaDeConfiguracion(`No existe la pieza ${piezaId}.`)
  }
  // Before anything that spends: Coni may still be taking this signature back.
  const fila = await despuesDeLaVentana(deps, leida)
  if (!fila) {
    throw new FallaDeConfiguracion(`No existe la pieza ${piezaId}.`)
  }
  if (fila.estado !== "en_render" && fila.estado !== "subtitulando") {
    return { resultado: "nada_que_hacer" }
  }
```

(the rest of the function is unchanged).

`lib/produccion/deps-reales.ts`, `depsGrabacion`: the first parameter becomes

```ts
  espera: {
    callbackUrl: string
    esperarRender: (videoId: string) => Promise<void>
    esperar: (ms: number) => Promise<void>
  },
```

and the returned object gains `esperar: espera.esperar,` after `esperarRender`.

`trigger/grabar-pieza.ts`, the `depsGrabacion` call becomes:

```ts
    const deps = await depsGrabacion({
      callbackUrl: token.url,
      esperarRender: async () => terminarEspera(await wait.forToken(token)),
      // The undo window of a fresh signature: a checkpointed wait, so the run costs nothing meanwhile.
      esperar: async (ms) => {
        await wait.for({ seconds: Math.ceil(ms / 1000) })
      },
    })
```

- [ ] **Step 5: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/deps-grabacion.test.ts tests/unit/grabar-pieza-task.test.ts && pnpm test:db tests/integration/grabar.test.ts tests/integration/ffmpeg.test.ts`
Expected: PASS. Then `pnpm test:db`, expected green.

- [ ] **Step 6: Commit**

```bash
git add lib/produccion/grabar.ts lib/produccion/deps-reales.ts trigger/grabar-pieza.ts tests/integration/flujo.ts tests/integration/grabar.test.ts tests/integration/ffmpeg.test.ts tests/unit/deps-grabacion.test.ts
git commit -m "Wait out the undo window in the render before any spend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Coni undoes her signature

**Files:**
- Modify: `lib/acciones/piezas.ts` (new `deshacerAprobacion` after `aprobarGuion`)
- Modify: `app/(app)/piezas/acciones.ts` (new `deshacerAprobacionAccion` after `aprobarGuionAccion`)
- Test: `tests/integration/acciones-piezas.test.ts`

- [ ] **Step 1: Write the failing tests** (append; add `deshacerAprobacion` to the `@/lib/acciones/piezas` import)

```ts
describe("deshacerAprobacion", () => {
  beforeEach(() => sembrarAvatares([LOOK_A, LOOK_B]))
  afterEach(() => pool.query("update public.ajustes set produccion = '{}'::jsonb"))

  /** Signed through the real action at `firma`, with a clock the test moves. */
  async function firmadaEn(firma: number, db: Db = coni) {
    const id = await paraAprobar()
    const reloj = { ms: firma }
    const { deps, disparos } = armar(db)
    const conReloj: DepsAcciones = { ...deps, ahora: () => new Date(reloj.ms).toISOString() }
    const firmaDeConi = { ...armar().deps, ahora: () => new Date(firma).toISOString() }
    expect((await aprobarGuion(firmaDeConi, id, await versionDe(id), "look-a")).ok).toBe(true)
    return { id, reloj, deps: conReloj, disparos }
  }

  it("takes the signature back inside the window: back to her, with her voice and the same attempt", async () => {
    const firma = Date.now()
    const { id, reloj, deps, disparos } = await firmadaEn(firma)
    const firmada = await fila(id)
    reloj.ms = firma + 7999

    expect(await deshacerAprobacion(deps, id, firmada.version)).toEqual({ ok: true })

    expect(await fila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1_hash: null,
      puerta1_en: null,
      puerta1_por: null,
      audio_id: firmada.audio_id,
      intento: firmada.intento,
    })
    // The delayed run is not cancelled: it finds the piece back here and spends nothing (grabar.test.ts).
    expect(disparos).toEqual([])
  })

  it("refuses once the window closed, with Coni's text, and the video goes on", async () => {
    const firma = Date.now()
    const { id, reloj, deps } = await firmadaEn(firma)
    reloj.ms = firma + 8000

    expect(await deshacerAprobacion(deps, id, await versionDe(id))).toEqual({
      ok: false,
      error: "Ya empecé a grabar el video. Puedes revisarlo cuando esté listo.",
    })
    expect(await fila(id)).toMatchObject({ estado: "en_render" })
  })

  it("does not let the maintainer take Coni's signature back", async () => {
    const firma = Date.now()
    const { id, reloj, deps } = await firmadaEn(firma, await clienteDelMantenedor())
    reloj.ms = firma + 1000

    expect((await deshacerAprobacion(deps, id, await versionDe(id))).ok).toBe(false)
    expect(await fila(id)).toMatchObject({ estado: "en_render" })
  })

  it("refuses a stale screen", async () => {
    const firma = Date.now()
    const { id, reloj, deps } = await firmadaEn(firma)
    reloj.ms = firma + 1000

    expect(await deshacerAprobacion(deps, id, (await versionDe(id)) - 1)).toEqual({
      ok: false,
      error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla.",
    })
    expect(await fila(id)).toMatchObject({ estado: "en_render" })
  })
})
```

(`firmadaEn` signs with Coni's own deps; `db` only chooses who tries the undo. `disparos` belongs to the undoing deps,
so it stays empty: undoing starts nothing.)

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:db tests/integration/acciones-piezas.test.ts`
Expected: FAIL, `deshacerAprobacion is not a function`.

- [ ] **Step 3: Implement**

`lib/acciones/piezas.ts`, after `aprobarGuion`:

```ts
/**
 * Coni takes her signature back inside the undo window (design 2026-10-15, decision 5): nothing was recorded and the
 * script waits for her again. The delayed run is not cancelled: it finds the piece in `guion_por_aprobar` and spends
 * nothing. The window is measured on the server clock, in the domain.
 */
export function deshacerAprobacion(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("deshacerAprobacion", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    await guardarEvento(deps.db, fila, { tipo: "deshacer_aprobacion", actor: "coni", ahora: deps.ahora() })
    return {}
  })
}
```

`app/(app)/piezas/acciones.ts`: add `deshacerAprobacion` to the `@/lib/acciones/piezas` import and, after
`aprobarGuionAccion`:

```ts
export async function deshacerAprobacionAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("deshacerAprobacion", sobrePieza, { piezaId, version }, (deps, d) =>
      deshacerAprobacion(deps, d.piezaId, d.version),
    ),
  )
}
```

- [ ] **Step 4: Run and see green**

Run: `pnpm type && pnpm test:db tests/integration/acciones-piezas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/piezas.ts "app/(app)/piezas/acciones.ts" tests/integration/acciones-piezas.test.ts
git commit -m "Let Coni undo her signature from the app inside the window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: A script edit that changes what the voice says asks for the voice

**Files:**
- Modify: `lib/acciones/piezas.ts` (`pedirVozDeFila` extracted from `pedirVoz`)
- Modify: `lib/acciones/guion.ts` (imports lines 1-32; `DepsGuion` lines 36-43; `trabajoDeEditar` lines 109-168; new helper `cambiaLaVoz`)
- Modify: `app/(app)/piezas/acciones.ts:28` and `:36-49` (`depsDeGuion` gets `disparar`)
- Test: `tests/integration/acciones-guion.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/integration/acciones-guion.test.ts`:

1. Imports: `import { type DepsGuion, editarGuion, tieneVersionDeClaude, volverAVersionDeClaude } from "@/lib/acciones/guion"`;
   delete the `DepsIdeas` import; add `import { claveVoz } from "@/lib/acciones/disparos"`,
   `import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"` and `import coniConfig from "../fixtures/coni.config.json"`.
2. `deps` becomes:

```ts
interface Disparo {
  tarea: "voz"
  piezaId: string
  clave: string
  nueva: boolean
}
const disparos: Disparo[] = []

function deps(db: Db = coni, fallos: { voz?: Error } = {}): DepsGuion {
  return {
    db,
    servicio: clienteDeServicio,
    crearClaude: (llave) => new Anthropic({ apiKey: llave, maxRetries: 0 }),
    ahora: () => new Date().toISOString(),
    disparar: {
      producir: async () => {
        throw new Error("editarGuion no escribe guiones")
      },
      grabar: async () => {
        throw new Error("editarGuion no graba videos")
      },
      voz: async (piezaId, clave, nueva) => {
        if (fallos.voz) throw fallos.voz
        disparos.push({ tarea: "voz", piezaId, clave, nueva })
      },
    },
  }
}
```

3. The `afterEach` adds `disparos.length = 0`.
4. Append inside `describe("editarGuion")`:

```ts
  it("saves the edit without asking for the voice when the voice setup does not read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await pieza()
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado).toMatchObject({ ok: true, version: version + 1 })
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", guion: GUION_VALIDO })
    expect(disparos).toEqual([])
    expect(error).toHaveBeenCalledWith("No pude leer la configuración de la voz al editar el guion", expect.any(Error))
  })
```

5. Append a new describe:

```ts
describe("editarGuion y la voz", () => {
  beforeEach(() => pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(coniConfig)]))
  afterEach(() => pool.query("update public.ajustes set produccion = '{}'::jsonb"))

  it("asks for her voice of the new wording in the same action, reusing earlier takes", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    const guardada = await leerFila(id)
    expect(guardada).toMatchObject({ estado: "grabando_voz", guion: GUION_VALIDO, version: version + 2 })
    expect(resultado).toMatchObject({ ok: true, version: version + 2 })
    expect(disparos).toEqual([{ tarea: "voz", piezaId: id, clave: claveVoz(guardada), nueva: false }])
  })

  it("leaves the voice alone when the edit keeps what the voice says", async () => {
    const id = await pieza()
    await ajustarPieza(id, { guion: GUION_VALIDO })
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(), {
      piezaId: id,
      version,
      guion: GUION_VALIDO,
      texto: `${TEXTO_VALIDO} Y una línea más.`,
    })

    expect(resultado).toMatchObject({ ok: true, version: version + 1 })
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar" })
    expect(disparos).toEqual([])
  })

  it("keeps the edit and hands the piece back with the reason when the voice cannot start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await pieza()
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(coni, { voz: new Error("Trigger.dev no responde") }), {
      piezaId: id,
      version,
      guion: GUION_VALIDO,
      texto: TEXTO_VALIDO,
    })

    expect(resultado).toMatchObject({ ok: true, version: version + 3 })
    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      guion: GUION_VALIDO,
      explicacion: TEXTO_SIN_VOZ,
    })
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:db tests/integration/acciones-guion.test.ts`
Expected: FAIL: the edit leaves the piece in `guion_por_aprobar` and starts no voice; the setup test finds no log.

- [ ] **Step 3: Extract the voice step in `lib/acciones/piezas.ts`**

Replace `pedirVoz` with:

```ts
/**
 * Moves a script waiting for her signature to `grabando_voz` and starts `grabar-voz`. Nothing else would start this
 * run, so a failure to start hands the piece back with the reason. Returns the row as it was left.
 */
export async function pedirVozDeFila(deps: DepsAcciones, fila: FilaDePieza, nueva: boolean): Promise<FilaDePieza> {
  const guardada = await guardarEvento(deps.db, fila, { tipo: "pedir_voz" })
  try {
    await deps.disparar.voz(guardada.id, claveVoz(guardada), nueva)
    return guardada
  } catch (error) {
    console.error("No pude iniciar grabar-voz", error)
    return guardarEvento(deps.db, guardada, { tipo: "falla_voz", explicacion: TEXTO_SIN_VOZ })
  }
}

/** Her voice of the current script, before the signature: "Preparar mi voz" and "Grabar la voz de nuevo". */
export function pedirVoz(deps: DepsAcciones, piezaId: string, versionVista: number, nueva: boolean) {
  return aResultado("pedirVoz", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const dejada = await pedirVozDeFila(deps, fila, nueva)
    if (dejada.estado !== "grabando_voz") throw new Falla(TEXTO_SIN_VOZ)
    return {}
  })
}
```

- [ ] **Step 4: The editor asks for the voice**

`lib/acciones/guion.ts`:

1. Imports: add `leerProduccion` to the `@/lib/datos/repositorio` import;
   `import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"`;
   `import { huellaDelGuion } from "@/lib/produccion/voz"`;
   `import { type ConfigCompleta, leerConfigProduccion } from "@/lib/proveedores/config"`;
   `import type { Disparos } from "./disparos"`; and
   `import { MAXIMO_DEL_TEXTO, normalizarTexto, pedirVozDeFila } from "./piezas"`.
2. `DepsGuion` gains, after `crearClaude`:

```ts
  /** Starts her voice when an edit changes what it says (design 2026-10-15, decision 3). */
  disparar: Disparos
```

3. Before `trabajoDeEditar`:

```ts
/**
 * Whether the saved script speaks differently: the voice fingerprint of the new wording is not the old one, so editing
 * only the caption keeps the voice. Without a readable voice setup there is no voice to make: the edit is saved and
 * the screen offers "Preparar mi voz", whose run reports the setup.
 */
async function cambiaLaVoz(db: Db, antes: string | null, despues: string): Promise<boolean> {
  if (antes === despues) return false
  let config: ConfigCompleta
  try {
    config = leerConfigProduccion(await leerProduccion(db))
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer la configuración de la voz al editar el guion", error)
    return false
  }
  return antes === null || huellaDelGuion(antes, config.elevenlabs) !== huellaDelGuion(despues, config.elevenlabs)
}
```

4. In `trabajoDeEditar`, right after
   `if (bloquea(deterministas)) return { motivo: "revision_bloquea", error: ERROR_BLOQUEA, hallazgos: deterministas }`:

```ts
  // Read before the review spends: a database error here must not leave a paid review behind an unsaved edit.
  const conVozNueva = await cambiaLaVoz(db, fila.guion, guion)
```

and the end of the function, from `if (error) throw traducir(...)`, becomes:

```ts
  if (error) throw traducir(new Error(error.message, { cause: error }))
  // Her voice follows the script she sees, in the same action; going back to an earlier wording reuses its take.
  const dejada = conVozNueva ? await pedirVozDeFila({ db, disparar: deps.disparar, ahora: deps.ahora }, data, false) : data
  // Gate 1 shows the script and the caption; the LinkedIn findings wait for gate 2, where she can edit that text.
  return { version: dejada.version, revision: sinLinkedin(revision) }
```

`app/(app)/piezas/acciones.ts`: the `@/lib/acciones/servidor` import gains `disparosDeLaApp`, and `depsDeGuion` returns
`disparar: disparosDeLaApp(),` after `crearClaude`.

- [ ] **Step 5: Run and see green**

Run: `pnpm type && pnpm test:db tests/integration/acciones-guion.test.ts tests/integration/acciones-piezas.test.ts`
Expected: PASS. The existing edit tests run with `produccion = '{}'`, so they still expect `version + 1` and now log
the setup line.

- [ ] **Step 6: Commit**

```bash
git add lib/acciones/piezas.ts lib/acciones/guion.ts "app/(app)/piezas/acciones.ts" tests/integration/acciones-guion.test.ts
git commit -m "Ask for the voice when a script edit changes what it says

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: What gate 1 shows: the voice and what the signature spends

**Files:**
- Modify: `lib/dominio/saldos.ts` (new `lineaDeFirma`)
- Modify: `lib/datos/grabacion.ts` (imports lines 1-29; `BotonesDeGrabacion` lines 31-45; `DatosDeGrabacion` lines 47-53; `presentarGrabacion` line 90; `leerDatosDeGrabacion` lines 119-151)
- Test: `tests/unit/saldos.test.ts`, `tests/unit/grabacion.test.ts:27,33-35`, `tests/integration/grabacion-datos.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/saldos.test.ts` (add `lineaDeFirma` to the import):

```ts
describe("lineaDeFirma", () => {
  it("says what the signature spends and how long she has to undo it", () => {
    expect(lineaDeFirma({ segundos: 52.4, usd: 3.48 })).toBe(
      "Al firmar grabo el video: ~52 s, US$ 3,48. Tienes 8 s para deshacer.",
    )
  })

  it("still says the video starts and the undo window when the cost cannot be read", () => {
    expect(lineaDeFirma(null)).toBe("Al firmar grabo el video. Tienes 8 s para deshacer.")
  })
})
```

In `tests/unit/grabacion.test.ts`, the first test loses `const video = estimarCostoVideo(GUION, "avatar_v")` and the
`expect(sin.confirmacionVideo).toBe(...)` assertion (the third step's confirmation is gone).

In `tests/integration/grabacion-datos.test.ts`:

1. Next to `piezaAprobada` (which stays for `vozVigente`):

```ts
async function piezaPorFirmar(ajustes: Record<string, unknown> = {}) {
  const id = await sembrarPieza("guion_por_aprobar", ajustes)
  creadas.push(id)
  return id
}
```

2. In `describe("leerDatosDeGrabacion")` every `piezaAprobada()` becomes `piezaPorFirmar()` and every
   `estado: "guion_aprobado"` becomes `estado: "guion_por_aprobar"` (including `expect(datos.estado)`); the second test
   is renamed "offers her voice of this script, and stops adding it to the video price".
3. The first test ends with:

```ts
    expect(datos.lineaDeFirma).toMatch(/^Al firmar grabo el video: ~\d+ s, US\$ \d+,\d\d\. Tienes 8 s para deshacer\.$/)
```

4. "answers without numbers, and logs, when the production setup does not read" expects:

```ts
    expect(datos).toEqual({
      estado: "grabando_voz",
      voz: null,
      botones: null,
      lineaDeFirma: "Al firmar grabo el video. Tienes 8 s para deshacer.",
    })
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/saldos.test.ts tests/unit/grabacion.test.ts && pnpm test:db tests/integration/grabacion-datos.test.ts`
Expected: FAIL: `lineaDeFirma` is not exported; `datos.lineaDeFirma` is undefined; `pnpm type` would also refuse the
`"guion_por_aprobar"` estado.

- [ ] **Step 3: Implement**

`lib/dominio/saldos.ts`: add `import { VENTANA_DESHACER_MS } from "@/lib/dominio/estados"` and, after
`lineaDeCostoVideo`:

```ts
/** The line of the gate 1 signature: what it spends and how long she has to take it back (design 2026-10-15). */
export function lineaDeFirma(video: { segundos: number; usd: number } | null): string {
  const ventana = `Tienes ${VENTANA_DESHACER_MS / 1000} s para deshacer.`
  if (video === null) return `Al firmar grabo el video. ${ventana}`
  return `Al firmar grabo el video: ~${Math.round(video.segundos)} s, ${dolares(video.usd)}. ${ventana}`
}
```

`lib/datos/grabacion.ts`:

1. Imports: add `lineaDeFirma` to the `@/lib/dominio/saldos` import; delete `import { dolares } from "@/lib/formato"`.
2. `BotonesDeGrabacion`: delete `confirmacionVideo: string`; in `presentarGrabacion` delete the
   `confirmacionVideo: ...` line.
3. `DatosDeGrabacion` becomes:

```ts
export interface DatosDeGrabacion {
  /** Gate 1: the script waits for her signature, or her voice of it is being made. */
  estado: "guion_por_aprobar" | "grabando_voz"
  /** Her voice of this exact script, signed for an hour; null when there is none yet. */
  voz: { url: string | null; clave: string } | null
  /** Null when the production setup does not read: the buttons still work, without numbers. */
  botones: BotonesDeGrabacion | null
  /** Under the slider: what the signature spends and how long she has to undo it. */
  lineaDeFirma: string
}
```

4. `leerDatosDeGrabacion`: the doc becomes "Everything gate 1 shows about her voice and the video, read when the screen
   opens."; the configuration-failure return becomes
   `return { estado, voz: null, botones: null, lineaDeFirma: lineaDeFirma(null) }`; the final return gains

```ts
    lineaDeFirma: lineaDeFirma({ segundos: estimarSegundos(guion), usd: estimarCostoVideo(guion, config.heygen.motor) }),
```

- [ ] **Step 4: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/saldos.test.ts tests/unit/grabacion.test.ts && pnpm test:db tests/integration/grabacion-datos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/saldos.ts lib/datos/grabacion.ts tests/unit/saldos.test.ts tests/unit/grabacion.test.ts tests/integration/grabacion-datos.test.ts
git commit -m "Read gate 1's voice and the cost of the signature

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: The Guion screen: her voice above the script, one signature

Functional only: the Calma suiza styling stays; layout beyond copy belongs to the Soft UI step. The line about the
spend goes in the slider's existing `nota` slot (under the track, beside "Aprobar"), which replaces "Aprobar no gasta
nada." without changing the bar's height. `components/deslizar-para-aprobar.tsx` and
`components/ui/barra-de-firma.tsx` do not change.

**Files:**
- Create: `app/(app)/guion/[id]/textos.ts`
- Create: `app/(app)/guion/[id]/voz-para-firmar.tsx`
- Modify: `app/(app)/guion/[id]/pantalla-guion.tsx` (whole file)
- Modify: `app/(app)/guion/[id]/page.tsx` (the `grabacion` import, the gate 1 data, the `datos`)
- Test: `tests/unit/pantalla-guion.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/pantalla-guion.test.tsx
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type DatosDeGuion, PantallaGuion } from "@/app/(app)/guion/[id]/pantalla-guion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"

const { aprobarGuionAccion, pedirVozAccion, replace } = vi.hoisted(() => ({
  aprobarGuionAccion: vi.fn(),
  pedirVozAccion: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({
  aprobarGuionAccion,
  pedirVozAccion,
  pedirCambiosAccion: vi.fn(),
  editarGuionAccion: vi.fn(),
  volverAVersionDeClaudeAccion: vi.fn(),
}))
// The player is a real <audio>: here it only says the take was heard to the end.
vi.mock("@/components/reproductor-voz", () => ({
  ReproductorVoz: ({ alEscuchar }: { alEscuchar: () => void }) => (
    <button type="button" onClick={alEscuchar}>
      Terminé de escuchar
    </button>
  ),
}))

const LINEA = "Al firmar grabo el video: ~52 s, US$ 3,48. Tienes 8 s para deshacer."
const VOZ = { url: "https://almacen.test/voces/p1/t-x-0.mp3", clave: "voces/p1/t-x-0.mp3" }
const BOTONES = {
  costoVoz: "Grabar voz: ~1.100 caracteres (US$ 0,33)",
  costoVideo: "Grabar video: ~52 s (US$ 3,48)",
  montoVoz: "US$ 0,33",
  unidadVoz: "~1.100 caracteres",
  montoVideo: "US$ 3,48",
  unidadVideo: "~52 s",
  saldoVoz: "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
  saldoVideo: "Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.",
  bloqueoVoz: null,
  bloqueoVideo: null,
}

function datos(sobre: Partial<DatosDeGuion> = {}, grabacion: Partial<DatosDeGrabacion> = {}): DatosDeGuion {
  return {
    id: "p1",
    version: 5,
    titulo: "El deseo no se apaga, se esconde",
    pilar: null,
    formato: null,
    segundos: 52,
    guion: "Hola, soy Coni. Soy Coni del Rosario.",
    texto: "Video hecho con mi avatar digital.",
    textoLinkedin: null,
    revision: [],
    tieneVersionDeClaude: false,
    salida: null,
    explicacion: null,
    avatares: [{ id: "look-a", nombre: "Estudio", imagenUrl: null }],
    avisoInicial: null,
    grabacion: { estado: "guion_por_aprobar", voz: VOZ, botones: BOTONES, lineaDeFirma: LINEA, ...grabacion },
    ...sobre,
  }
}

const aprobar = () => screen.getByRole("button", { name: "Aprobar" })
const elegirEstudio = () => fireEvent.click(screen.getByRole("radio", { name: "Estudio" }))
const escuchar = () => fireEvent.click(screen.getByRole("button", { name: "Terminé de escuchar" }))

beforeEach(() => {
  aprobarGuionAccion.mockReset().mockResolvedValue({ ok: true })
  pedirVozAccion.mockReset().mockResolvedValue({ ok: true })
  replace.mockReset()
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 356,
    left: 0,
    right: 356,
    top: 0,
    bottom: 56,
    height: 56,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("PantallaGuion: la voz en la puerta 1", () => {
  it("shows her voice above the script and keeps the signature closed until she heard it to the end", async () => {
    render(<PantallaGuion datos={datos()} />)
    const voz = screen.getByRole("heading", { name: "Voz" })
    const guion = screen.getByRole("textbox", { name: "Guion" })
    expect(voz.compareDocumentPosition(guion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    elegirEstudio()
    expect(screen.getByText("Escucha tu voz completa para firmar.")).toBeInTheDocument()
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")

    escuchar()
    expect(aprobar()).not.toHaveAttribute("aria-disabled", "true")
    fireEvent.click(aprobar())
    await waitFor(() => expect(aprobarGuionAccion).toHaveBeenCalledWith("p1", 5, "look-a"))
  })

  it("says what the signature spends and how long she has to undo it, under the slider", () => {
    render(<PantallaGuion datos={datos()} />)
    const barra = screen.getByRole("region", { name: "Firma" })
    expect(within(barra).getByRole("slider", { name: "Desliza para aprobar y grabar" })).toBeInTheDocument()
    expect(within(barra).getByText(LINEA)).toBeInTheDocument()
  })

  it("without her voice of this script, asks to prepare it", async () => {
    render(<PantallaGuion datos={datos({}, { voz: null })} />)
    expect(screen.getAllByText("Falta preparar tu voz.")).toHaveLength(2)
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")

    fireEvent.click(screen.getByRole("button", { name: "Preparar mi voz" }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 5, false))
  })

  it("makes a new take of the same text on request", async () => {
    render(<PantallaGuion datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Grabar la voz de nuevo" }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 5, true))
  })

  it("while her voice is being made, shows the script read-only and keeps the signature closed", () => {
    render(<PantallaGuion datos={datos({}, { estado: "grabando_voz" })} />)
    expect(screen.getAllByText("Estoy preparando tu voz. Tarda unos segundos.")).toHaveLength(2)
    expect(screen.queryByRole("textbox", { name: "Guion" })).toBeNull()
    expect(screen.getByText("Hola, soy Coni. Soy Coni del Rosario.")).toBeInTheDocument()
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")
  })

  it("keeps the signature closed with the HeyGen text when the wallet does not reach, even after listening", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,48)."
    render(<PantallaGuion datos={datos({}, { botones: { ...BOTONES, bloqueoVideo: bloqueo } })} />)
    elegirEstudio()
    escuchar()
    expect(screen.getByText(bloqueo)).toBeInTheDocument()
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")
  })

  it("opens with the toast it was given, and takes it out of the address when it closes", () => {
    vi.useFakeTimers()
    render(<PantallaGuion datos={datos({ avisoInicial: "Listo, no grabé nada. Puedes seguir revisando." })} />)
    expect(screen.getByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(8000)
    })

    expect(screen.queryByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeNull()
    expect(replace).toHaveBeenCalledWith("/guion/p1")
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/pantalla-guion.test.tsx`
Expected: FAIL: there is no "Voz" section, the slider is "Desliza para aprobar el guion", and nothing waits for the
voice.

- [ ] **Step 3: The copy of gate 1**

```ts
// app/(app)/guion/[id]/textos.ts
// Gate 1 copy (design 2026-10-15, section 6), shared by the server page and the client components of the Guion screen:
// a "use client" module cannot hand plain values to a server component.
export const ETIQUETA_DE_FIRMA = "Desliza para aprobar y grabar"
export const TEXTO_FALTA_VOZ = "Falta preparar tu voz."
export const TEXTO_PREPARANDO_VOZ = "Estoy preparando tu voz. Tarda unos segundos."
export const TEXTO_ESCUCHA_COMPLETA = "Escucha tu voz completa para firmar."
```

- [ ] **Step 4: The voice section**

```tsx
// app/(app)/guion/[id]/voz-para-firmar.tsx
"use client"

import { Microphone } from "@phosphor-icons/react"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { CostoDeAccion, LineaDeSaldo } from "@/components/ui/costo"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { pedirVozAccion } from "../../piezas/acciones"
import { TEXTO_FALTA_VOZ, TEXTO_PREPARANDO_VOZ } from "./textos"

interface PropiedadesDeVoz {
  piezaId: string
  /** The version of the screen: a request on a piece that moved on is refused. */
  version: number
  datos: DatosDeGrabacion
  /** Which take she heard to the end. */
  alEscuchar: (clave: string) => void
}

/**
 * Gate 1's voice, above the script (design 2026-10-15, decision 3): her take of this script with "Grabar la voz de
 * nuevo", the take being made, or "Falta preparar tu voz." with "Preparar mi voz". The cost sits beside the button and
 * the balance under it; a balance or cap that does not reach disables the button and says why on that line.
 */
export function VozParaFirmar({ piezaId, version, datos, alEscuchar }: PropiedadesDeVoz) {
  const pedir = useAccion()
  const { voz, botones } = datos
  const bloqueoVoz = botones?.bloqueoVoz ?? null
  const costo = botones ? <CostoDeAccion monto={botones.montoVoz} unidad={botones.unidadVoz} /> : null
  const saldo = botones ? <LineaDeSaldo>{bloqueoVoz ?? botones.saldoVoz}</LineaDeSaldo> : null

  return (
    <Seccion titulo="Voz" id="voz">
      {datos.estado === "grabando_voz" ? (
        <p className="flex items-center gap-3 text-cuerpo font-medium">
          <PuntoTrabajando />
          {TEXTO_PREPARANDO_VOZ}
        </p>
      ) : voz ? (
        <>
          <ReproductorVoz src={voz.url} clave={voz.clave} alEscuchar={() => alEscuchar(voz.clave)} />
          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
              <Boton
                variante="linea"
                tamano="chico"
                className="w-fit"
                cargando={pedir.pendiente}
                deshabilitado={bloqueoVoz !== null}
                onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, true))}
              >
                Grabar la voz de nuevo
              </Boton>
              {costo}
            </div>
            {saldo}
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <LineaDeEstado tipo="aviso" titulo={TEXTO_FALTA_VOZ} tituloEnTinta />
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <Boton
              cargando={pedir.pendiente}
              deshabilitado={bloqueoVoz !== null}
              icono={<Microphone aria-hidden="true" size={20} />}
              onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, false))}
            >
              Preparar mi voz
            </Boton>
            {costo}
          </div>
          {saldo}
        </div>
      )}
      {pedir.error ? <LineaDeEstado tipo="error" titulo={pedir.error} /> : null}
    </Seccion>
  )
}
```

- [ ] **Step 5: The screen**

```tsx
// app/(app)/guion/[id]/pantalla-guion.tsx
"use client"

import { CaretLeft } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AYUDA_DE_MARCAS } from "@/components/ayuda-de-marcas"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { EditorDeGuion, type GuionGuardado } from "@/components/editor-de-guion"
import { type AvatarParaElegir, ElegirAvatar } from "@/components/elegir-avatar"
import { GuionEnLectura } from "@/components/guion-en-lectura"
import { Seccion } from "@/components/seccion"
import { TextoLinkedinEnLectura } from "@/components/texto-linkedin-en-lectura"
import { Aviso } from "@/components/ui/aviso"
import { BarraDeFirma } from "@/components/ui/barra-de-firma"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { etiquetasDe } from "@/lib/dominio/etiquetas"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { aprobarGuionAccion, pedirCambiosAccion } from "../../piezas/acciones"
import { ETIQUETA_DE_FIRMA, TEXTO_ESCUCHA_COMPLETA, TEXTO_FALTA_VOZ, TEXTO_PREPARANDO_VOZ } from "./textos"
import { VozParaFirmar } from "./voz-para-firmar"

export interface DatosDeGuion {
  id: string
  version: number
  titulo: string
  pilar: Pilar | null
  formato: string | null
  segundos: number
  guion: string
  texto: string
  /** The LinkedIn text, shown read only: it is reviewed and edited at gate 2. Null when the piece has none yet. */
  textoLinkedin: string | null
  revision: Hallazgo[]
  /** Whether there is a version Claude wrote to go back to. */
  tieneVersionDeClaude: boolean
  /** "jueves 16 de octubre · 19:00": when it would go out if she approves today. */
  salida: string | null
  explicacion: string | null
  /** The looks WAV lets her choose; empty means there is nothing to choose and the approval stays blocked. */
  avatares: AvatarParaElegir[]
  /** Her voice of this script and what the signature spends (design 2026-10-15, decisions 3 and 4). */
  grabacion: DatosDeGrabacion
  /** A toast the screen opens with: she just took a signature back. */
  avisoInicial: string | null
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

const unirConY = (partes: readonly string[]) =>
  partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes.join("")

/** What still keeps the signature closed, the most useful first; undefined when she can sign. */
function motivoParaFirmar(estado: {
  sinGuardar: boolean
  preparando: boolean
  voz: string | null
  escuchada: string | null
  bloqueos: number
  sinAvatares: boolean
  bloqueoFirma: string | null
  faltan: readonly string[]
}): string | undefined {
  if (estado.sinGuardar) return "Guarda tus cambios antes de aprobar"
  if (estado.preparando) return TEXTO_PREPARANDO_VOZ
  if (estado.voz === null) return TEXTO_FALTA_VOZ
  if (estado.bloqueos > 0) return "Hay algo que corregir antes de aprobar."
  if (estado.sinAvatares) return "Todavía no hay avatares para elegir."
  // The HeyGen wallet or the month's cap would stop the video: listening would not help.
  if (estado.bloqueoFirma !== null) return estado.bloqueoFirma
  if (estado.faltan.length > 0) return `Falta ${unirConY(estado.faltan)}.`
  if (estado.escuchada !== estado.voz) return TEXTO_ESCUCHA_COMPLETA
  return undefined
}

/**
 * Gate 1 (design 2026-10-15): she listens to her voice of the script, reads and edits it, confirms what the review
 * flagged and slides once. The signature approves the script and the voice, and the video starts after the undo window.
 */
export function PantallaGuion({ datos }: { datos: DatosDeGuion }) {
  const router = useRouter()
  const [version, setVersion] = useState(datos.version)
  const [revision, setRevision] = useState(datos.revision)
  const [sinGuardar, setSinGuardar] = useState(false)
  const [avatarElegido, setAvatarElegido] = useState<string | null>(null)
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  const [pidiendoCambios, setPidiendoCambios] = useState(false)
  const [aviso, setAviso] = useState<string | null>(datos.avisoInicial)
  // The take she heard to the end: another take (a new text, or "Grabar la voz de nuevo") asks again.
  const [escuchada, setEscuchada] = useState<string | null>(null)
  const aprobacion = useAccion()
  const cambios = useAccion()

  const { grabacion } = datos
  const preparando = grabacion.estado === "grabando_voz"
  const bloqueos = revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const advertencias = revision.filter((hallazgo) => hallazgo.tipo === "advierte")
  const sinConfirmar = advertencias.filter((hallazgo) => !confirmadas.has(claveDe(hallazgo)))
  const sinAvatares = datos.avatares.length === 0
  const faltan = [
    ...(avatarElegido === null && !sinAvatares ? ["elegir el avatar"] : []),
    ...(sinConfirmar.length > 0 ? ["confirmar la revisión"] : []),
  ]
  const motivo = motivoParaFirmar({
    sinGuardar,
    preparando,
    voz: grabacion.voz?.clave ?? null,
    escuchada,
    bloqueos: bloqueos.length,
    sinAvatares,
    bloqueoFirma: grabacion.botones?.bloqueoVideo ?? null,
    faltan,
  })

  function alGuardar(guardado: GuionGuardado) {
    setVersion(guardado.version)
    setRevision(guardado.revision)
    // The ticks belong to the review she saw: a new review asks again.
    setConfirmadas(new Set())
  }

  function alternarConfirmacion(hallazgo: Hallazgo, confirmada: boolean) {
    setConfirmadas((actuales) => {
      const siguientes = new Set(actuales)
      if (confirmada) siguientes.add(claveDe(hallazgo))
      else siguientes.delete(claveDe(hallazgo))
      return siguientes
    })
  }

  function cerrarAviso() {
    setAviso(null)
    // The toast after an undo came in the address: it is said once.
    if (datos.avisoInicial !== null) router.replace(`/guion/${datos.id}`)
  }

  return (
    <div className="pb-[calc(var(--barra-max)+env(safe-area-inset-bottom))]">
      <header data-pilar={datos.pilar ?? undefined} className="grid gap-3">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta"
        >
          <CaretLeft aria-hidden="true" size={20} />
          Inicio
        </Link>
        <p className="flex items-baseline justify-between gap-4 text-meta text-apagado">
          <span>{datos.pilar ? NOMBRE_DE_PILAR[datos.pilar] : null}</span>
          <span>
            {datos.formato ? `${datos.formato} · ` : ""}
            {datos.segundos} s
          </span>
        </p>
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
        {datos.salida ? (
          <LineaDeEstado
            tipo="fecha"
            titulo={
              <>
                Si lo apruebas hoy, sale el{" "}
                <span className="font-semibold whitespace-nowrap text-firma tabular-nums">{datos.salida}</span>
              </>
            }
            tituloEnTinta
          />
        ) : null}
      </header>

      {datos.explicacion ? (
        <div className="mt-6">
          <LineaDeEstado tipo="aviso" titulo={datos.explicacion} tituloEnTinta />
        </div>
      ) : null}

      <VozParaFirmar piezaId={datos.id} version={version} datos={grabacion} alEscuchar={setEscuchada} />

      {preparando ? (
        <>
          {/* Her voice is being made of this text: it cannot change until the voice is back. */}
          <Seccion titulo="Guion" id="guion">
            <GuionEnLectura guion={datos.guion} />
            {etiquetasDe(datos.guion).length > 0 ? <p className="text-meta text-apagado">{AYUDA_DE_MARCAS}</p> : null}
          </Seccion>
          <Seccion titulo="Texto de la publicación" id="texto">
            <p className="whitespace-pre-wrap text-cuerpo leading-prosa">{datos.texto}</p>
          </Seccion>
        </>
      ) : (
        <div className="mt-10">
          <EditorDeGuion
            piezaId={datos.id}
            version={version}
            guion={datos.guion}
            texto={datos.texto}
            tieneVersionDeClaude={datos.tieneVersionDeClaude}
            alGuardar={alGuardar}
            alCambiarSinGuardar={setSinGuardar}
          />
        </div>
      )}
      {datos.textoLinkedin !== null ? <TextoLinkedinEnLectura texto={datos.textoLinkedin} /> : null}
      <Seccion titulo="Avatar" id="avatar">
        <ElegirAvatar avatares={datos.avatares} elegido={avatarElegido} alElegir={setAvatarElegido} />
      </Seccion>

      <Seccion titulo="Revisión" id="revision" cifra={revision.length > 0 ? revision.length : undefined}>
        <p className="text-cuerpo text-apagado">
          {revision.length === 0
            ? "Claude revisó el guion y no encontró observaciones. Tú decides."
            : "Claude revisó el guion. Tú decides."}
        </p>
        <div className="grid gap-4">
          {revision.map((hallazgo) => (
            <MarcaRevision
              key={claveDe(hallazgo)}
              hallazgo={hallazgo}
              confirmada={confirmadas.has(claveDe(hallazgo))}
              alCambiar={(confirmada) => alternarConfirmacion(hallazgo, confirmada)}
            />
          ))}
        </div>
      </Seccion>

      <div className="mt-10 grid gap-2">
        {pidiendoCambios ? (
          <ConfirmacionEnLinea
            trato="destructivo"
            pregunta="Se escribe un guion nuevo y este se descarta. ¿Seguro?"
            confirmar="Sí, pedir cambios"
            volver="Volver"
            cargando={cambios.pendiente}
            alConfirmar={() =>
              cambios.ejecutar(
                () => pedirCambiosAccion(datos.id, version),
                (r) => setAviso(r.advertencia ?? null),
              )
            }
            alVolver={() => setPidiendoCambios(false)}
          />
        ) : (
          <Boton variante="destructiva" deshabilitado={preparando} onClick={() => setPidiendoCambios(true)}>
            Pedir cambios
          </Boton>
        )}
      </div>
      <BarraDeFirma etiqueta="Firma">
        {aprobacion.error || cambios.error ? (
          <LineaDeEstado tipo="error" titulo={aprobacion.error ?? cambios.error} />
        ) : null}
        <DeslizarParaAprobar
          etiqueta={ETIQUETA_DE_FIRMA}
          habilitado={motivo === undefined}
          motivo={motivo}
          nota={grabacion.lineaDeFirma}
          enviando={aprobacion.pendiente}
          alAprobar={() => aprobacion.ejecutar(() => aprobarGuionAccion(datos.id, version, avatarElegido))}
        />
      </BarraDeFirma>
      {aviso ? <Aviso mensaje={aviso} alCerrar={cerrarAviso} sobreBarra /> : null}
    </div>
  )
}
```

- [ ] **Step 6: The page reads gate 1's data**

In `app/(app)/guion/[id]/page.tsx`:

1. `import { vozVigente } from "@/lib/datos/grabacion"` becomes `import { leerDatosDeGrabacion, vozVigente } from "@/lib/datos/grabacion"`.
2. The `Promise.all` of the avatars becomes (after the `switch`, `fila.estado` is `guion_por_aprobar` or `grabando_voz`):

```tsx
  const [avatares, conVersionDeClaude, grabacion] = await Promise.all([
    avataresParaElegir(db),
    tieneVersionDeClaude({ db }, fila.id),
    leerDatosDeGrabacion(db, { fila, estado: fila.estado, guion: fila.guion, zona: contexto.horario.zona }),
  ])
```

3. The `datos` passed to `PantallaGuion` gain `grabacion,` (after `salida`) and `avisoInicial: null,` (Task 17 fills it).

- [ ] **Step 7: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/pantalla-guion.test.tsx && pnpm test:run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/guion/[id]" tests/unit/pantalla-guion.test.tsx
git commit -m "Put her voice above the script and sign gate 1 once she heard it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The video screen after the signature, with "Deshacer"

**Files:**
- Modify: `app/(app)/guion/[id]/textos.ts` (two texts)
- Create: `app/(app)/guion/[id]/deshacer-firma.tsx`
- Modify: `app/(app)/guion/[id]/page.tsx` (signature lines 34-36, the `en_render`/`subtitulando` case lines 64-78, `avisoInicial`)
- Test: `tests/unit/deshacer-firma.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/deshacer-firma.test.tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeshacerFirma } from "@/app/(app)/guion/[id]/deshacer-firma"
import { TEXTO_DESHACER_TARDE } from "@/lib/dominio/estados"

const { deshacerAprobacionAccion, replace } = vi.hoisted(() => ({
  deshacerAprobacionAccion: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({ deshacerAprobacionAccion }))

beforeEach(() => {
  deshacerAprobacionAccion.mockReset()
  replace.mockReset()
})

afterEach(() => vi.useRealTimers())

describe("DeshacerFirma", () => {
  it("says the video starts in 8 s and undoes it, back to the script with its own toast", async () => {
    deshacerAprobacionAccion.mockResolvedValue({ ok: true })
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    expect(screen.getByText("Firmaste. Grabo el video en 8 s.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    expect(deshacerAprobacionAccion).toHaveBeenCalledWith("p1", 6)
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/guion/p1?deshecho=1"))
  })

  it("tells her when the undo came too late, and stays on the video", async () => {
    deshacerAprobacionAccion.mockResolvedValue({ ok: false, error: TEXTO_DESHACER_TARDE })
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    expect(await screen.findByText(TEXTO_DESHACER_TARDE)).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it("goes away when the window closes", () => {
    vi.useFakeTimers()
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={3000} />)

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText("Firmaste. Grabo el video en 8 s.")).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/deshacer-firma.test.tsx`
Expected: FAIL, cannot resolve `@/app/(app)/guion/[id]/deshacer-firma`.

- [ ] **Step 3: Implement the toast**

Append to `app/(app)/guion/[id]/textos.ts` (and add `import { VENTANA_DESHACER_MS } from "@/lib/dominio/estados"` at
the top):

```ts
export const TEXTO_FIRMASTE = `Firmaste. Grabo el video en ${VENTANA_DESHACER_MS / 1000} s.`
export const TEXTO_DESHECHO = "Listo, no grabé nada. Puedes seguir revisando."
```

```tsx
// app/(app)/guion/[id]/deshacer-firma.tsx
"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { Aviso } from "@/components/ui/aviso"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { deshacerAprobacionAccion } from "../../piezas/acciones"
import { TEXTO_FIRMASTE } from "./textos"

/**
 * The toast of a fresh signature (design 2026-10-15, section 6): "Deshacer" while the undo window lasts. `quedanMs`
 * comes from the server clock the undo is checked against, and the screen's refresh brings a new value every 4 s.
 * After an undo the Guion screen opens again with its own toast (`?deshecho=1`).
 */
export function DeshacerFirma({ piezaId, version, quedanMs }: { piezaId: string; version: number; quedanMs: number }) {
  const router = useRouter()
  const deshacer = useAccion()
  const [visible, setVisible] = useState(true)
  // Stable, so a re-render does not restart the toast's timer.
  const cerrar = useCallback(() => setVisible(false), [])

  return (
    <>
      {visible ? (
        <Aviso
          mensaje={TEXTO_FIRMASTE}
          duracionMs={quedanMs}
          alCerrar={cerrar}
          alDeshacer={() =>
            deshacer.ejecutar(
              () => deshacerAprobacionAccion(piezaId, version),
              () => router.replace(`/guion/${piezaId}?deshecho=1`),
            )
          }
        />
      ) : null}
      {deshacer.error ? <LineaDeEstado tipo="error" titulo={deshacer.error} /> : null}
    </>
  )
}
```

- [ ] **Step 4: Wire it in the page**

In `app/(app)/guion/[id]/page.tsx`:

1. Imports: add `import { piezaDesdeFila } from "@/lib/datos/piezas"`; the `@/lib/dominio/estados` import becomes
   `import { piezaTrabajando, restoDeVentana } from "@/lib/dominio/estados"`; add
   `import { DeshacerFirma } from "./deshacer-firma"` and `import { TEXTO_DESHECHO } from "./textos"`.
2. The signature and first lines:

```tsx
export default async function PaginaDeGuion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ deshecho?: string }>
}) {
  const [{ id }, { deshecho }] = await Promise.all([params, searchParams])
```

3. The `en_render`/`subtitulando` case becomes:

```tsx
    case "en_render":
    case "subtitulando": {
      const firma = piezaDesdeFila(fila).puerta1
      // The undo window of a fresh signature, on the same server clock the undo is checked against.
      const quedanMs =
        fila.estado === "en_render" && fila.explicacion === null && firma !== null
          ? restoDeVentana(firma.en, new Date().toISOString())
          : 0
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          {fila.explicacion ? (
            <LineaDeEstado tipo="error" titulo="El video está detenido" detalle={fila.explicacion} />
          ) : (
            <Trabajando titulo="Estoy grabando tu video." detalle="Te aviso cuando esté listo." />
          )}
          {quedanMs > 0 ? <DeshacerFirma piezaId={fila.id} version={fila.version} quedanMs={quedanMs} /> : null}
          <RefrescoAutomatico activo={piezaTrabajando(fila)} cadaMs={4000} />
        </EstadoSencillo>
      )
    }
```

4. In the `datos` of `PantallaGuion`, `avisoInicial: null,` becomes
   `avisoInicial: deshecho === "1" && fila.estado === "guion_por_aprobar" ? TEXTO_DESHECHO : null,`.

- [ ] **Step 5: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/deshacer-firma.test.tsx tests/unit/pantalla-guion.test.tsx && pnpm build`
Expected: PASS, and the build accepts the page's `searchParams` (the same shape as `app/(app)/calendario/page.tsx`).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/guion/[id]" tests/unit/deshacer-firma.test.tsx
git commit -m "Show the undo toast on the video screen after the signature

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Inicio: a voice being made still needs her signature

**Files:**
- Modify: `lib/inicio/modelo.ts` (`filaDeFirma` lines 94-103, `filaEnCamino` lines 111-117, `avisoDeError` lines 132-151, `construirInicio` lines 231-233)
- Test: `tests/unit/inicio-modelo.test.ts` (lines 113-124 and the describe "Inicio con la voz aparte", lines 288-339)
- `app/(app)/page.tsx`: no change (it renders the model, and polls while `piezaTrabajando`, which covers `grabando_voz`).

- [ ] **Step 1: Write the failing tests**

In "raises the reason of a script HeyGen sent back, and keeps it in the signature list", the expected `accion` becomes
`{ etiqueta: "Revisar", href: \`/guion/${devuelta.id}\` }` (a reason at gate 1 is now a refused phrase or a voice that
could not be made). Replace `describe("Inicio con la voz aparte")` with:

```ts
describe("Inicio con la voz en la puerta 1", () => {
  const base = {
    titulo: "El deseo",
    explicacion: null,
    guion: "Hola.",
    pilar: null,
    publicarEn: null,
    permalink: null,
    destinos: ["instagram"] as const,
    pendientes: [],
    actualizadaEn: "2026-10-04T12:00:00.000Z",
  }
  const entrada = (piezas: PiezaDeInicio[]) => ({ piezas, ahora: Date.parse(base.actualizadaEn), zona: ZONA })

  it("keeps a voice being made among what needs her signature, saying so", () => {
    const inicio = construirInicio(entrada([{ ...base, id: "b", estado: "grabando_voz" }]))

    expect(inicio.firma).toEqual([
      { id: "b", titulo: "El deseo", pilar: null, meta: "Preparando la voz", href: "/guion/b" },
    ])
    expect(inicio.camino).toEqual([])
    expect(inicio.titulo).toBe("Una cosa espera tu firma")
  })

  it("turns a voice that could not be made into a notice to review, and keeps the script to sign", () => {
    const texto = "No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz."
    const inicio = construirInicio(entrada([{ ...base, id: "c", estado: "guion_por_aprobar", explicacion: texto }]))

    expect(inicio.avisos).toEqual([
      { tipo: "error", titulo: "El deseo", texto, accion: { etiqueta: "Revisar", href: "/guion/c" } },
    ])
    expect(inicio.firma).toHaveLength(1)
  })

  it("shows a signed piece on its way, as before", () => {
    const inicio = construirInicio(entrada([{ ...base, id: "d", estado: "en_render" }]))

    expect(inicio.camino[0]).toMatchObject({ id: "d", estado: "Grabando · unos 5 min · te aviso", ocupada: true })
    expect(inicio.firma).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:run tests/unit/inicio-modelo.test.ts`
Expected: FAIL: `grabando_voz` is "on its way" and not in `firma`; the label is "Revisar la frase".

- [ ] **Step 3: Implement**

In `lib/inicio/modelo.ts`:

```ts
/** Gate 1 includes a voice being made: the piece is still hers to sign (design 2026-10-15, section 6). */
const ESPERAN_FIRMA: readonly Estado[] = ["guion_por_aprobar", "grabando_voz", "video_por_aprobar"]

function filaDeFirma(pieza: PiezaDeInicio): FilaDeFirma {
  const base = { id: pieza.id, titulo: pieza.titulo, pilar: pieza.pilar }
  if (pieza.estado === "video_por_aprobar") {
    return { ...base, meta: `Video · ${segundosDe(pieza)} s`, href: `/video/${pieza.id}` }
  }
  const meta = pieza.estado === "grabando_voz" ? "Preparando la voz" : `Guion · ${segundosDe(pieza)} s`
  return { ...base, meta, href: `/guion/${pieza.id}` }
}
```

(`ESPERAN_FIRMA` goes above `filaDeFirma`). In `filaEnCamino`, delete the `guion_aprobado` and `grabando_voz` cases.
In `avisoDeError`, delete `case "guion_aprobado":` from the first group, and the `guion_por_aprobar` case becomes:

```ts
    case "guion_por_aprobar":
      // A phrase HeyGen refused or a voice that could not be made: the text says which, the screen has the way out.
      return pieza.explicacion === null
        ? null
        : { tipo: "error", titulo: pieza.titulo, texto, accion: { etiqueta: "Revisar", href: `/guion/${pieza.id}` } }
```

In `construirInicio`, the filter of `firma` becomes `.filter((pieza) => ESPERAN_FIRMA.includes(pieza.estado))`.

- [ ] **Step 4: Run and see green**

Run: `pnpm type && pnpm test:run tests/unit/inicio-modelo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/inicio/modelo.ts tests/unit/inicio-modelo.test.ts
git commit -m "List a voice being made under what needs Coni's signature

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: End to end: listen, sign, undo, sign again

Closes the known red window. The app runs with `DISPARO_DE_PRUEBA=1` against the repo's fake services
(`tests/e2e/servicios-falsos.ts`, unchanged: the app only reads balances from them); "what grabar-voz does" is played
by the test with `ajustarPieza`, as the 2026-10-04 spec did.

**Files:**
- Modify: `tests/e2e/ayudas.ts:40-45` (`Disparo` schema)
- Modify: `tests/e2e/escena.ts` (the scene's script arrives with her voice)
- Modify: `tests/e2e/guion.spec.ts`
- Modify: `tests/e2e/visual.spec.ts:126-170` and its baselines (`tests/e2e/visual.spec.ts-snapshots/`)

- [ ] **Step 1: The test runs record the delay**

`tests/e2e/ayudas.ts`, the schema becomes:

```ts
const Disparo = z.object({
  tarea: z.enum(["producir", "grabar", "voz"]),
  piezaId: z.string(),
  clave: z.string(),
  nueva: z.boolean().optional(),
  retraso: z.string().optional(),
})
```

- [ ] **Step 2: The scene's script arrives with her voice**

`tests/e2e/escena.ts`: add

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { leerConfigProduccion } from "@/lib/proveedores/config"
```

`ajustarPieza` joins the `../integration/siembra` import, and under `IDEAS`:

```ts
const ELEVENLABS = leerConfigProduccion(
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8")),
).elevenlabs
```

In `sembrarEscena`, right after `const guion = await conIdea("guion_por_aprobar", ...)`:

```ts
  // The writer delivers the script with her voice: gate 1 shows its player.
  await ajustarPieza(guion, { audio_id: claveDeToma(guion, huellaDelGuion(GUION_VALIDO, ELEVENLABS), 0) })
```

- [ ] **Step 3: Rewrite the gate 1 spec**

In `tests/e2e/guion.spec.ts`:

1. Replace the module constants `ETIQUETA`, `AYUDA_DE_MARCAS`, `BASE`, `LOOK_A`, `LOOK_B`, `produccionDeLaPrueba` and
   the helper `guionPorAprobar` with the block below, placed where `ETIQUETA` was. `elegirAvatar`, `sembrarAvatares`,
   `AVISO_DE_RIESGO`, `GUION_EDITADO`, `test.beforeEach` and `test.afterAll` stay as they are:

```ts
const ETIQUETA = "Desliza para aprobar y grabar"
const PREPARANDO = "Estoy preparando tu voz. Tarda unos segundos."
const GRABANDO = "Estoy grabando tu video."
// A literal, so the spec does not import a TSX component.
const AYUDA_DE_MARCAS = "Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos."
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOK_A = { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" }
const LOOK_B = { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.png" }
const TEXTO_CON_AYUDA = `${TEXTO_VALIDO}\n\nSi lo necesitas, las líneas de ayuda de Chile: 1455, *4141 y 133.`
const produccionDeLaPrueba = { ...BASE, heygen: { ...BASE.heygen, avatares: [LOOK_A, LOOK_B] } }
const ELEVENLABS = leerConfigProduccion(produccionDeLaPrueba).elevenlabs

/** A take of `guion` for this piece, as the writer or grabar-voz stores it. */
const tomaDe = (id: string, guion: string, toma: number) => claveDeToma(id, huellaDelGuion(guion, ELEVENLABS), toma)

async function guionPorAprobar(revision: object[] = [], texto = TEXTO_VALIDO, { conVoz = true } = {}) {
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  const id = await sembrarPieza("guion_por_aprobar", {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: GUION_VALIDO,
    texto,
    revision: JSON.stringify(revision),
  })
  // The writer delivers the script with her voice of it.
  if (conVoz) await ajustarPieza(id, { audio_id: tomaDe(id, GUION_VALIDO, 0) })
  return id
}

/** What grabar-voz does when it finishes: her take of the script on the row, back at gate 1. The screen polls. */
async function vozLista(id: string) {
  const fila = await leerFila(id)
  await ajustarPieza(id, { estado: "guion_por_aprobar", audio_id: tomaDe(id, fila.guion, fila.intento) })
}

/** She plays her voice to the end; the player remembers it for this take. */
async function escucharLaVoz(page: Page) {
  await page.getByRole("button", { name: "Escuchar la voz" }).click()
  await expect(page.getByText("Ya la escuchaste")).toBeVisible({ timeout: 15_000 })
}
```

   and delete the later `const TEXTO_CON_AYUDA = ...` line (now at the top).

2. Replace "she edits a sentence, saves, picks the avatar and slides: approved without any audio, recording starts"
   with:

```ts
test("she edits a sentence and her voice is remade by itself; she listens, picks the avatar and signs", async ({
  page,
}) => {
  const id = await guionPorAprobar([AVISO_DE_RIESGO], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  await expect(page.getByText(AYUDA_DE_MARCAS)).toBeVisible()

  const deslizador = page.getByRole("slider", { name: ETIQUETA })
  await expect(page.getByRole("heading", { name: "El deseo no se apaga, se esconde" })).toBeVisible()
  await expect(page.getByText(/^Si lo apruebas hoy, sale el /)).toBeVisible()
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await expect(deslizador).toHaveAttribute("aria-valuetext", "No aprobado")
  await expect(page.getByText("Falta elegir el avatar y confirmar la revisión.")).toBeVisible()
  await capturar(page, "04-guion")

  // Pushing the slider while it is not enabled does nothing.
  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(GRABANDO)).toHaveCount(0)
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  const guion = page.getByRole("textbox", { name: "Guion", exact: true })
  await expect(guion).toHaveValue(GUION_VALIDO)
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveAttribute("aria-disabled", "true")
  await guion.fill(GUION_EDITADO)
  await expect(page.getByText(/palabras · ≈ \d+ s/)).toBeVisible()
  await expect(page.getByText("Guarda tus cambios antes de aprobar")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await capturar(page, "guion-editor")
  await page.getByRole("button", { name: "Guardar cambios" }).click()

  // The new wording needs its own voice: the screen says so, keeps the script still and waits.
  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Guion", exact: true })).toHaveCount(0)
  await capturar(page, "guion-grabando")
  expect((await leerFila(id)).estado).toBe("grabando_voz")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "voz", piezaId: id, nueva: false }])

  await vozLista(id)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible({ timeout: 15_000 })
  await elegirAvatar(page, "Terraza")
  // Saving ran a new review: the helplines are in the caption, so there is nothing left to confirm.
  await expect(page.getByRole("checkbox", { name: "Lo revisé y está bien" })).toHaveCount(0)
  await expect(page.getByText("Escucha tu voz completa para firmar.")).toBeVisible()
  await escucharLaVoz(page)
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  await deslizador.focus()
  await page.keyboard.press("End")

  await expect(page.getByText(GRABANDO)).toBeVisible()
  expect(await leerFila(id)).toMatchObject({
    estado: "en_render",
    guion: GUION_EDITADO,
    puerta1_por: CONI,
    avatar_id: "look-b",
  })
  expect(disparosRegistrados().map((d) => d.tarea)).toEqual(["voz", "grabar"])
})
```

3. Replace "she records the voice alone, listens to it, and then records the video reusing it" with:

```ts
test("a script without its voice asks to prepare it, and the voice arrives by itself", async ({ page }) => {
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA, { conVoz: false })
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText("Falta preparar tu voz.").first()).toBeVisible()
  await expect(page.getByText(/^~\d+ caracteres$/)).toBeVisible()
  await expect(
    page.getByText("ElevenLabs: te quedan 99.000 de 100.000 caracteres. Se renuevan el 12 de octubre."),
  ).toBeVisible()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")
  await capturar(page, "guion-sin-voz", { completa: true })

  await page.getByRole("button", { name: "Preparar mi voz" }).click()
  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  expect((await leerFila(id)).estado).toBe("grabando_voz")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "voz", piezaId: id, nueva: false }])

  await vozLista(id)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Grabar la voz de nuevo" })).toBeVisible()
  await capturar(page, "guion-con-voz", { completa: true })
})
```

4. In "a piece that failed is discarded only after she confirms, and it leaves Inicio", `sembrarPieza("guion_aprobado", {`
   becomes `sembrarPieza("en_render", {`.
5. In "a tap on the track never approves, a drag to the end does (brandkit 9.12)": after `await elegirAvatar(page, "Estudio")`
   add `await escucharLaVoz(page)`; the last two lines become

```ts
  await expect(page.getByText(GRABANDO)).toBeVisible()
  expect((await leerFila(id)).estado).toBe("en_render")
```

6. In "the visible Aprobar button is the alternative to dragging and asks for the same things (WCAG 2.5.7)": after
   `await elegirAvatar(page, "Estudio")` add `await escucharLaVoz(page)`; the last two lines become the same two lines
   as in item 5.
7. Replace "approve, take it back, edit, save and approve again, all on the same screen" with the spec's E2E:

```ts
test("she listens to her voice, signs, undoes inside the window and signs again: the video starts", async ({
  page,
}) => {
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const deslizador = page.getByRole("slider", { name: ETIQUETA })

  await expect(
    page.getByText(/^Al firmar grabo el video: ~\d+ s, US\$ \d+,\d\d\. Tienes 8 s para deshacer\.$/),
  ).toBeVisible()
  await elegirAvatar(page, "Estudio")
  await expect(page.getByText("Escucha tu voz completa para firmar.")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await escucharLaVoz(page)
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText("Firmaste. Grabo el video en 8 s.")).toBeVisible()
  await expect(page.getByText(GRABANDO)).toBeVisible()
  await capturar(page, "guion-firmado")
  expect((await leerFila(id)).estado).toBe("en_render")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "grabar", piezaId: id, retraso: "10s" }])

  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeVisible()
  await expect(deslizador).toBeVisible()
  expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })

  // The take she already heard is remembered by the player: only the avatar is picked again.
  await elegirAvatar(page, "Estudio")
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")
  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(GRABANDO)).toBeVisible()
  expect((await leerFila(id)).estado).toBe("en_render")
})
```

8. Delete "an approved script is read-only: changing it goes through taking the approval back".
9. Replace "an approved script that has tone marks shows them with the help" with:

```ts
test("while her voice is being made the script is read-only and keeps its tone marks with the help", async ({
  page,
}) => {
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  const id = await sembrarPieza("grabando_voz", {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: `[warm] ${GUION_VALIDO}`,
    texto: TEXTO_CON_AYUDA,
  })
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Guion", exact: true })).toHaveCount(0)
  await expect(page.getByText("[warm]", { exact: true })).toBeVisible()
  await expect(page.getByText(AYUDA_DE_MARCAS)).toBeVisible()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")
})
```

10. In "a render stopped by the monthly cap shows why and stops polling", `page.getByText("Aprobado. Estoy grabando el video.")`
    becomes `page.getByText(GRABANDO)`.
11. Replace "an empty HeyGen API wallet disables the video and says where to top up" and "a balance that does not
    answer is said, and blocks nothing" with:

```ts
test("an empty HeyGen API wallet keeps the signature closed and says where to top up", async ({ page }) => {
  await configurarServicios({ heygenSaldo: 0 })
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await elegirAvatar(page, "Estudio")
  await escucharLaVoz(page)
  await expect(page.getByText(/^Tu saldo de API de HeyGen no alcanza/)).toBeVisible()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")
  // Her voice alone still works without HeyGen.
  await expect(page.getByRole("button", { name: "Grabar la voz de nuevo" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  )
})

test("a balance that does not answer is said, and blocks nothing", async ({ page }) => {
  await configurarServicios({ elevenlabs: "401" })
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText("No pude ver tu saldo de ElevenLabs.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Grabar la voz de nuevo" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  )
  await elegirAvatar(page, "Estudio")
  await escucharLaVoz(page)
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "false")
})
```

12. Replace "she goes back to Claude's version after editing and the original text returns" with:

```ts
test("she goes back to Claude's version after editing, and her voice is asked for again reusing earlier takes", async ({
  page,
}) => {
  const id = await guionPorAprobar()
  await pool.query(
    "insert into public.guion_versiones (pieza_id, numero, guion, texto, autor) values ($1, 1, $2, $3, 'claude')",
    [id, GUION_VALIDO, TEXTO_VALIDO],
  )
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await page.getByRole("textbox", { name: "Guion", exact: true }).fill(GUION_EDITADO)
  await page.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  await vozLista(id)
  await expect(page.getByRole("button", { name: "Volver a la versión de Claude" })).toBeVisible({ timeout: 15_000 })

  await page.getByRole("button", { name: "Volver a la versión de Claude" }).click()
  await expect(page.getByText("¿Volver al guion que escribió Claude? Se guarda como una versión nueva.")).toBeVisible()
  await page.getByRole("button", { name: "Sí, volver" }).click()

  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  expect((await leerFila(id)).guion).toBe(GUION_VALIDO)
  // Neither request asks for a new take: Claude's wording finds the take it already had.
  expect(disparosRegistrados().map((d) => [d.tarea, d.nueva])).toEqual([
    ["voz", false],
    ["voz", false],
  ])
})
```

13. In "a caption that forgets the avatar notice blocks the approval until she puts it back", the last two lines
    (`await elegirAvatar(page, "Estudio")` and the `aria-disabled` "false" expectation) become:

```ts
  await elegirAvatar(page, "Estudio")
  // The caption is not what her voice says: the voice stays, and only listening to it is left.
  await expect(page.getByText("Escucha tu voz completa para firmar.")).toBeVisible()
  await escucharLaVoz(page)
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "false")
  expect(disparosRegistrados()).toEqual([])
```

14. In "a screen opened before the piece changed does not approve" and in "a look removed from the list while the
    screen was open is refused, with a message for Coni", add `await escucharLaVoz(page)` right after
    `await elegirAvatar(page, "Estudio")`.

The other tests of the file stay as they are.

- [ ] **Step 4: Visual captures of gate 1**

In `tests/e2e/visual.spec.ts`, replace `guionAprobado` and the tests "guion aprobado sin voz", "guion con voz", "guion
grabando" and "guion error" with:

```ts
async function guionSembrado(estado: "guion_por_aprobar" | "grabando_voz" | "en_render") {
  await vaciarPiezasEIdeas()
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  return sembrarPieza(estado, {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: GUION_VALIDO,
    texto: TEXTO_VALIDO,
  })
}

test("guion sin voz", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-sin-voz")
})

test("guion con voz", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  const fila = await leerFila(id)
  const config = leerConfigProduccion(CONFIG)
  await ajustarPieza(id, { audio_id: claveDeToma(id, huellaDelGuion(fila.guion, config.elevenlabs), fila.intento) })
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible()
  await capturaDe(page, "guion-con-voz")
})

test("guion grabando", async ({ page }) => {
  const id = await guionSembrado("grabando_voz")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-grabando")
})

test("guion error", async ({ page }) => {
  const id = await guionSembrado("en_render")
  await ajustarPieza(id, {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-error")
})
```

Then:

```bash
git rm tests/e2e/visual.spec.ts-snapshots/guion-aprobado-sin-voz-app-darwin.png
pnpm test:e2e tests/e2e/visual.spec.ts
```

Expected: FAIL only on `guion-por-aprobar`, `guion-con-voz`, `guion-grabando` (the new gate 1) and `guion-sin-voz`
(no baseline yet). Open the diffs under `test-results/` and check each one shows the voice section above the script,
the slider "Desliza para aprobar y grabar" and the line "Al firmar grabo el video: ...". Any other baseline that differs
is a regression to fix, not to update. Then:

```bash
pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots
```

- [ ] **Step 5: Run the whole E2E suite and see green**

Run: `pnpm test:e2e`
Expected: PASS (all specs, accessibility included: the scene's gate 1 now has a voice player).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/ayudas.ts tests/e2e/escena.ts tests/e2e/guion.spec.ts tests/e2e/visual.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "Walk gate 1 end to end: listen, sign, undo and sign again

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Handoff notes and the status of the 2026-10-04 design

**Files:**
- Modify: `docs/TRASPASO.md` ("Lo que está hecho" and "Siguiente")
- Modify: `docs/superpowers/specs/2026-10-04-conidolly-aprobar-voz-video-design.md:3-4`

- [ ] **Step 1: `docs/TRASPASO.md`**

Under "## Lo que está hecho", after the bullet "**Aprobar, grabar la voz y grabar el video en tres pasos** ...", add:

```markdown
- **La voz en la puerta 1 y el video que parte solo** (spec `docs/superpowers/specs/2026-10-15-conidolly-voz-en-la-puerta-1-design.md`, plan `docs/superpowers/plans/2026-10-15-voz-en-la-puerta-1.md`, sin desplegar): **dos visitas por pieza**. El escritor entrega el guion con la voz de Coni (si ElevenLabs o el tope fallan, llega sin voz y con «No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz.»). Editar el guion vuelve a pedir la voz en la misma acción (volver a un texto anterior reusa su toma); editar solo el texto de la publicación o el de LinkedIn no la toca. En la puerta 1 Coni escucha su voz completa y firma con «Desliza para aprobar y grabar»: la firma aprueba guion y voz y deja la pieza en `en_render`, y `grabar-pieza` parte con 10 s de retraso. **Regla de gasto:** ningún video sin la firma de Coni; la voz (unos US$ 0,20) es un borrador que se hace con el guion y cuenta para el tope. **Ventana para deshacer:** 8 s («Firmaste. Grabo el video en 8 s.» con «Deshacer»); además el render espera la ventana más 2 s de margen antes de gastar y vuelve a leer la pieza, así que un deshacer o una segunda firma nunca pagan HeyGen dos veces. `grabar_video` y `reabrir_guion` ya no existen; `guion_aprobado` quedó inalcanzable (el enum no se puede borrar). Migraciones `20261015000100` (la voz antes de la firma) y `20261015000110` (sin aviso de «guion listo» por la ida y vuelta de la voz o por un deshacer de Coni).
```

Under "## Siguiente", add as the first bullet:

```markdown
- Desplegar la voz en la puerta 1 con Federico: runbook en la tarea 22 del plan `2026-10-15-voz-en-la-puerta-1.md` (base, Trigger y Vercel seguidos; antes, revisar que no haya piezas en `guion_aprobado` ni `grabando_voz`).
```

- [ ] **Step 2: Status line of the 2026-10-04 design**

Right after its `Status: ...` paragraph (lines 3-4), add:

```markdown
Superseded in part on 2026-10-15 by `2026-10-15-conidolly-voz-en-la-puerta-1-design.md`: the voice is made with the
script, gate 1 signs the script, the voice and the video spend, and the video starts after an 8 s undo window. The
voice keys and their reuse, the balances, the live refresh and the `grabar-voz` task stay as designed here.
```

- [ ] **Step 3: Check and commit**

Run: `git diff --cached | grep '—'` (after staging) and expect no output.

```bash
git add docs/TRASPASO.md docs/superpowers/specs/2026-10-04-conidolly-aprobar-voz-video-design.md
git commit -m "Document the voice in gate 1 and the undo window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Verification

**Files:** none (a fix found here goes back to the task that owns it, with its own failing test first).

- [ ] **Step 1: Full verification, in order**

1. `pnpm check` (safe mode), then `grep -L '^"use client"' $(grep -rl 'use client' app components)`: no output.
2. `pnpm type`: clean.
3. `pnpm test:run`: green.
4. `pnpm db:reset && pnpm test:db`: green.
5. `pnpm test:e2e`: green.
6. `pnpm build`: clean.
7. `pnpm lint`: only the known reports listed under "Commands".
8. `git diff main --stat`: no file outside the File Structure table and the tests.
9. `git diff main -- lib app components supabase/migrations docs | grep '^+' | grep '—'`: no output.
10. `grep -rn "grabar_video\|reabrir_guion\|pedirVideo\|reabrirGuion\|Volver a revisar el guion\|Aprobar no gasta nada" app lib components tests`: no output.

- [ ] **Step 2: Hand the branch to review**

Use `superpowers:requesting-code-review` (spec first, then quality), then `superpowers:finishing-a-development-branch`.
Do not push and do not deploy: Task 22 is Federico's.

---

### Task 22: Deploy runbook (Federico, with an explicit OK before each production step)

Nothing here runs without Federico saying so in the conversation, step by step. Keys are loaded and commands that touch
production are run by Federico from the macOS Terminal (not the app's terminal). Order matters (spec "Pieces in flight
and deploy order").

- [ ] **Step 1 (OK needed): merge and push**

`main` gets the branch with `--no-ff`, and `git push origin main` only when Federico asks.

- [ ] **Step 2 (OK needed, read-only): pieces in flight**

Federico runs in the Supabase SQL editor of `estudio-coni` (`mvfytttfxmzzjajecsch`):

```sql
select id, estado, puerta1_hash is not null as firmada, audio_id from public.piezas
where estado in ('guion_aprobado', 'grabando_voz');
```

Expected: zero rows (production was wiped on 2026-10-08). If there are rows, and only with Federico's OK, he moves them
back to gate 1 with the signature cleared (Coni signs again; her voice is reused, the key is by text):

```sql
update public.piezas
   set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null, explicacion = null, version = version + 1
 where estado in ('guion_aprobado', 'grabando_voz');
```

- [ ] **Step 3 (OK needed): database**

Federico, from the macOS Terminal, in the repo: `supabase db push`. It applies `20261015000050` and `20261015000060`
(branch `fix/aprobada-para-grabar`, unless deployed before) and `20261015000100` and `20261015000110`; `supabase/pendientes/20261003000350_borrar_vinculos.sql` must not be in `supabase/migrations/`. Check:

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'aprobada_para_grabar';
```

The definition no longer names `grabando_voz`. The old app keeps working with this constraint.

- [ ] **Step 4 (OK needed): Trigger.dev**

```bash
pnpm install --frozen-lockfile
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

The dashboard shows the new version; `producir-pieza` has `maxDuration` 1200. From here until Step 5 is served, Coni
does not approve or record a voice (minutes): the old app would write `guion_aprobado`/`grabando_voz` with an approval
the new tasks no longer expect.

- [ ] **Step 5 (OK needed): Vercel, right after**

`vercel deploy --prod --yes`. The push does not deploy by itself. Wait 15 to 45 s for the alias, hard-refresh, and
confirm the Guion screen of a script reads "Desliza para aprobar y grabar" before judging anything.

- [ ] **Step 6 (OK needed): smoke test with the Coni test account (`federico@wearevision.cl`)**

1. Choose an idea: the piece arrives in `guion_por_aprobar` with her voice; one `elevenlabs/voz` row in `gastos`,
   confirmed; the player plays.
2. Edit a sentence and save: "Estoy preparando tu voz. Tarda unos segundos.", a `grabar-voz` run, and the screen comes
   back by itself with the new take.
3. Listen to the end, pick the avatar, slide: the toast "Firmaste. Grabo el video en 8 s." appears; tap "Deshacer"
   inside the 8 s: "Listo, no grabé nada. Puedes seguir revisando.", the piece is in `guion_por_aprobar`, and the
   delayed `grabar-pieza` run ends with `nada_que_hacer` and no `heygen` row in `gastos`.
4. Only if Federico OKs a real HeyGen spend (the API wallet had US$ 5,00): sign and let it run; the video reaches gate 2.
   Otherwise stop after step 3.

- [ ] **Step 7: update the handoff**

In `docs/TRASPASO.md`, "Producción": migrations applied up to `20261015000110` and the new Trigger version; move the
bullet of Task 20 from "sin desplegar" to "en producción desde <fecha>". Commit as
`Record the voice in gate 1 deploy` with the co-author line, and push only if Federico asks.

**Rollback (only with Federico's OK):** previous Vercel deployment (`vercel rollback`) and previous Trigger version,
together. Before re-applying the old constraint, move pieces in `grabando_voz` without approval back to gate 1 (the SQL
of Step 2), then:

```sql
alter table public.piezas drop constraint aprobada_para_grabar;
alter table public.piezas add constraint aprobada_para_grabar check (
  estado not in (
    'guion_aprobado', 'grabando_voz', 'en_render', 'subtitulando', 'video_por_aprobar', 'programado',
    'para_subir_a_mano', 'publicado', 'publicado_a_mano'
  )
  or puerta1_hash is not null
);
```

and, if Task 2 shipped, re-create `public.avisar_pieza_lista()` with the body of `20261001001520_avisos_automaticos.sql`.

---

## Notes for the reviewer: where the code differed from the spec, and what this plan chose

1. **"Script ready" notices** (not in the spec): `avisar_pieza_lista` notes every entry into `guion_por_aprobar`, so each
   script edit (voice round trip) and each undo would notify Coni. Task 2 adds a second migration that skips both and
   keeps the writer's and HeyGen's notices. It can be dropped on its own.
2. **`claveVoz` required gate 1** (`lib/acciones/disparos.ts`). Task 9 keys the voice run by the piece and the attempt.
3. **The constraint list of `20261004000110`** dropped `para_subir_a_mano` and `publicado_a_mano`, which
   `20261001001610` had. Restored by `20261015000050`/`20261015000060` (branch `fix/aprobada-para-grabar`, commit
   59a33e5); Task 1 keeps that full list and only removes `grabando_voz`. Implement this plan on top of that branch.
4. **`puedeGrabarVoz`** took the gate 1 hash; it now takes the script (`motivo: "sin_guion"`), and `ResultadoVoz` loses
   `sin_aprobacion` (Task 10).
5. **Writer runtime**: the task ran on the 900 s default; Claude's worst case (720 s) plus ElevenLabs' timeout (300 s)
   is 1020 s, so Task 7 sets 1200 s.
6. **The line under the bar** goes in the slider's existing `nota` slot (under the track, beside "Aprobar"), replacing
   "Aprobar no gasta nada.", so the bar keeps its height until the Soft UI step.
7. **The toasts survive the state change**: the "Firmaste..." toast lives on the `en_render` screen and is driven by the
   server clock (`restoDeVentana`), and the undo toast reaches the gate 1 screen through `?deshecho=1`.
8. **Voice failure copy**: `TEXTO_SIN_VOZ` is used by the writer, by a `grabar-voz` run that fails to start and by stuck
   voices; `grabar-voz` keeps its specific texts (no characters, cap) and `fallas.ts` keeps its generic "WAV ya está
   revisando" text for crashes.
9. **Inicio**: a reason on a `guion_por_aprobar` piece is now a refused phrase or a voice that could not be made, so its
   action reads "Revisar" instead of "Revisar la frase".
10. **Left as they are** (now slightly off, harmless): `lib/datos/pantallas.ts` counts `grabando_voz` among the pieces
    "in the queue" for the next free date, and `lib/calendario/modelo.ts` labels `grabando_voz` "Grabando la voz"
    without a link. Follow-ups, not part of this plan.
11. **Warning on a failed start**: `aprobarGuion` still returns `advertencia` when Trigger.dev does not answer, but the
    screen moves to `en_render` and does not show it; `reanudarArranques` starts the run within 10 minutes.
12. **The signature is also closed when the month's cap cannot cover the video**: gate 1 reuses `bloqueoVideo` of
    `presentarGrabacion`, which is the cap line or HeyGen's `no_alcanza` (the old "Grabar video" rule). The spec only
    names HeyGen's balance.
13. **`restoDeVentana`** (what is left of the 8 s, without the margin) is added next to the spec's `esperaDeVentana`:
    the domain's undo check and the `en_render` screen's toast both use it.

## Spec coverage

| Spec item | Task |
|---|---|
| Problem and goal: two visits, voice heard at gate 1, video starts 8 s after the signature | 6, 11, 16, 17, 19 |
| Decision 1, spending rule (no video without the signature; the voice is a draft that counts against the cap) | 6, 11, 12 |
| Decision 2, the voice is made with the script (`asegurarVoz` in the writer, `guion_listo { audioId, explicacion? }`, `TEXTO_SIN_VOZ` on Falla, cap or any error, non-Falla logged, take by `intento`) | 5, 6, 7 |
| Decision 3, voice after an edit and on request (`pedir_voz`/`voz_lista`/`falla_voz` before the signature, `editarGuion` by fingerprint with `nueva: false`, "Preparar mi voz", "Grabar la voz de nuevo", `puedeGrabarVoz` without approval, row's current script, editor and signature disabled while `grabando_voz`, polling) | 9, 10, 11, 14, 16 |
| Decision 4, gate 1 signs script, voice and video spend (voice-of-script check and its text, listened-to-the-end gating, HeyGen `no_alcanza`, `aprobar_guion -> en_render`, `grabar-pieza` with `delay: "10s"` through `iniciar`) | 8, 11, 15, 16 |
| Decision 5, undo window (`VENTANA_DESHACER_MS`, `MARGEN_DE_RELOJ_MS`, `deshacer_aprobacion`, `deshacerAprobacion`, no cancellation, `esperaDeVentana` + `deps.esperar` + re-read, no `intento` bump) | 3, 4, 12, 13, 17 |
| Decision 6, screens and copy (every row of the table, Inicio "Preparando la voz", `en_render` text) | 15, 16, 17, 18 |
| Section 7, transitions and removals (`grabar_video`, `reabrir_guion`, `editar_texto` from `guion_aprobado`) | 4, 5, 11 |
| Section 8, migration `20261015000100` | 1 |
| Pieces in flight, deploy order, rollback | 22 |
| Docs to update (`TRASPASO.md`, 2026-10-04 status line; `PRODUCT.md` unchanged) | 20 |
| Testing, unit (transitions incl. 7.999 s and 8 s, `esperaDeVentana`, `puedeGrabarVoz`, gate 1 bar gating and `no_alcanza`, toast with "Deshacer") | 3, 4, 10, 11, 16, 17 |
| Testing, integration (writer with voice; `TEXTO_SIN_VOZ` on ElevenLabs failure and cap; edit starts `grabar-voz`; revert reuses the take, see the note below; approve to `en_render` with a delayed trigger; undo inside the window and the delayed run spends nothing; undo after the window refused; re-sign waits and pays once; the constraint) | 1, 6, 11, 12, 13, 14 |
| Testing, E2E (open a script with its voice, listen, sign, toast, undo, sign again, "Estoy grabando tu video") | 19 |
| Open question 2 (writer runtime) | 7 |
| Open questions 1 and 3 | accepted in the spec; no code |

The revert case of the integration list is covered in two halves: the action asks with `nueva: false` (Task 14,
`toEqual([{ ..., nueva: false }])`, and the E2E of Task 19 for "Volver a la versión de Claude"), and `grabar-voz` reuses
the newest take of the same text when `nueva` is false (`tests/integration/grabar-voz.test.ts`, "reuses an earlier take
of the same text and spends nothing", unchanged).
