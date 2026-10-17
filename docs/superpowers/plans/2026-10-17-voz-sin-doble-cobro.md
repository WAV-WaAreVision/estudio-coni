# Honest Voice Spend (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A failed voice never holds money it did not spend, a retry never jams on its own reservation, a paid audio lost on upload is counted once per payment, and Coni reads `Este intento no se cobró.` only when the data proves it.

**Architecture:** `generarVoz` throws typed errors that say whether ElevenLabs answered and with which status. `asegurarVoz` releases a reservation at once (marked `sin_cobro`) only when ElevenLabs refused the request with a 4xx; every other failure stays reserved for the sweeper. `reservar_gasto` learns an opt-in `p_reabrir` so the same key can be tried again after a release; a confirmed key without its take moves the next try to a suffixed key. The upload is retried in memory before the reservation is confirmed. The gate 1 screen reads the attempt's reservation and shows the line only for `liberado` + `sin_cobro`. A separate lote fixes the under-shooting cost estimate of the pillar re-classification.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (plpgsql RPCs, RLS), Trigger.dev v4 (`grabar-voz`, `producir-pieza`, `grabar-pieza`, `mantenimiento` reuse `lib/`), Vitest + Testing Library + MSW 2, Biome, pnpm.

---

**Spec:** `docs/superpowers/specs/2026-10-17-conidolly-logica-design.md`, Part 2 only (decisions 11 to 14), plus one
small fix outside the spec (Lote 6). Parts 3 and 4 have their own plans and branches.

**Branch and worktree:** `fix/voz-sin-doble-cobro` in `.worktrees/voz-sin-doble-cobro`, from `main` at `47faecf`.

## ElevenLabs billing check (spec decision 11, "the plan's first task"), done 2026-10-17

What the official documentation says, and does not say:

- Text to speech is billed per character of input text ("one credit per character"):
  https://elevenlabs.io/docs/overview/intro
- The error catalogue lists `400 validation_error`, `401 authentication_error`, `402 payment_required`
  (code `insufficient_credits`), `403 authorization_error`, `404 not_found`, `409 conflict`, `429 rate_limit_error`,
  `500 internal_error`, `503 service_unavailable`. It does **not** say whether an errored request consumes credits:
  https://elevenlabs.io/docs/eleven-api/resources/errors
- The text-to-speech reference documents only the 200 audio and a `422` validation error; nothing on billing of
  failures, no character-cost header: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- The only official "failed jobs are not charged" statement is for Dubbing, not TTS:
  https://elevenlabs.io/docs/overview/capabilities/dubbing
- The Help Center article "Do I use quota on every generation?"
  (https://help.elevenlabs.io/hc/en-us/articles/13313274666769-Do-I-use-quota-on-every-generation) answered HTTP 403 to
  the fetch; search snippets say credits are charged "when you generate content" and that free regenerations exist
  only on the website, not the API.

Conclusion: the docs neither confirm nor contradict decision 11 row 1. A **4xx** is a refusal of the request (bad
input, bad key, no credits, rate limit): no audio was generated, and billing is per generated character, so "not
charged" is a sound inference. A **5xx** is a server failure that may happen after synthesis started, and a **200 with
an empty or broken body** is a delivered generation: for those the docs give no basis to say "not charged". Hence
amendment A1.

## Amendments to the spec (verified against `main` at 47faecf; where the spec and this block disagree, this block wins)

- **A1. Release table, corrected (decision 11).** Released at once (and marked `sin_cobro`): ElevenLabs answered
  **4xx** (incl. 401, 402, 403, 404, 409, 422, 429). Stays reserved (outcome unknown, sweeper rule: released after an
  hour with no take, **not** marked `sin_cobro`): **5xx**, network error or timeout before an answer, a **200 with an
  empty audio**, a **200 whose body broke while reading** (today a body-read timeout escapes as a plain error that the
  code would have read as "answered"). Audio received and upload failed: unchanged from the spec.
- **A2. Reopen is opt-in (decision 12).** `reservar_gasto` is SQL (`20261001000400_gastos.sql:1-41`), so a migration
  is needed. A generic reopen would break the script writer, which reads a `liberado` Claude key as "Claude refused,
  do not ask again" (`lib/produccion/producir.ts:274-277`). `reservar_gasto` gains `p_reabrir boolean default false`;
  only `asegurarVoz` passes `true`. Reopening re-checks the cap, moves the row to the current month, resets
  `real_usd` and `sin_cobro`, and sets `creado_en = now()` so the sweeper's hour starts again and the screen can tell
  the latest attempt.
- **A3. "No se cobró" needs its own fact (decision 14).** A `liberado` voice reservation can come from the at-once
  release (proven refusal) or from the sweeper (unknown outcome, only freeing the cap). Showing the line for both would
  say "no se cobró" about an attempt that may have been billed. New column `gastos.sin_cobro boolean not null default
  false`, set only by `liberar_gasto(p_clave, p_sin_cobro => true)` from `asegurarVoz`. The line shows when the piece's
  latest voice reservation is `liberado` **and** `sin_cobro`.
- **A4. The screen's cap sum already ignores released money.** `leerPresupuesto` filters
  `estado in ('reservado','confirmado')` (`lib/datos/pantallas.ts:90`). Decision 14's "now also in the screen's sum"
  needs no code: Task 13 pins it with a regression test.
- **A5. The retry suffix must keep the sweeper's key format.** The sweeper recognises a voice key by
  `/:voz:([0-9a-f]{16}):(\d+)$/` (`lib/mantenimiento/gastos.ts:35`). A suffix outside it would turn the new key into
  an "older key" (24 h rule). The suffix is `:r<n>` and the regex accepts an optional `(?::r\d+)?`.
- **A6. No characters is now a 402.** The docs name `402 payment_required / insufficient_credits`; the code only
  recognises `quota_exceeded` (`lib/proveedores/elevenlabs.ts:43-45`), so a 402 today shows Coni a WAV-only message.
  Task 3 recognises both codes (one regex). It is released at once either way (4xx).
- **A7. Upload retries.** "Retried 3 times" is read literally: one upload plus up to 3 retries, waiting 1 s, 2 s, 4 s
  (injectable `esperar`, so tests do not sleep). A confirmed key without its take may be followed by at most 3 paid
  suffixes (`:r1`..`:r3`) in the same attempt; past that `asegurarVoz` throws `FallaDeConfiguracion` (no endless paid
  loop).
- **Facts that differ from the spec text:** `asegurarVoz` is at `lib/produccion/voz.ts:62-111`. `FallaDeConfiguracion`
  is not a `Falla` (`lib/dominio/falla.ts`), so today only "no characters" releases; a 401/403/422 leaves the
  reservation open, as the spec says. `generarVoz` is called only from `asegurarVoz`, whose callers are
  `lib/produccion/grabar-voz.ts:50`, `lib/produccion/producir.ts:225` (swallows the error, Coni reads `TEXTO_SIN_VOZ`)
  and `lib/produccion/grabar.ts:382`. `liberar_gasto` and `reservar_gasto` are called by no other SQL function, so
  re-creating them breaks nothing in the database (`reservar_gasto_general` calls `reservar_gasto` with six positional
  arguments, which resolve to the new seven-argument function through its default).
- **Re-classification estimate (outside the spec, Lote 6).** Cause found in `lib/pilares/reclasificar.ts:104-118`:
  output is budgeted at 60 tokens per item, while a real answer per item is a UUID (poorly tokenised hex, about 25
  tokens), a slug, a one-sentence Spanish reason and JSON keys, about 105 to 110 tokens. Back-solving the production
  run (estimate US$ 0.0143, real US$ 0.0231, 19 items, Sonnet at US$ 2 / 10 per Mtok): the estimate priced about 1450
  input and 1140 output tokens; with the input right, the real output was about 2000 tokens (about 106 per item). The
  user message wrapper (`Clasifica estos elementos.` and the `<elementos>` tags) is also not counted. Fix: budget 110
  output tokens per item and count the exact user message, built by one shared function.

## Decisions for Federico (the plan picks the default in brackets and goes on)

- **D1. 5xx outcome.** [Unknown: stays reserved, no "no se cobró".] If Federico asks ElevenLabs support (with a
  `request_id`) and they confirm 5xx is never billed, the change is one line in `rechazoSinCobro` plus its test.
- **D2. Older-key voice reservations still open in production.** [Follow the 24 h rule, as decision 13 says.] The
  deploy runbook's read-only pre-check lists them; if any belongs to a voice that was really paid, Federico can confirm
  it by hand in the SQL editor before the new sweeper releases it.

## Lotes (batches for subagent-driven execution, one reviewer per lote)

| Lote | Tasks | Depends on | Parallel with |
|---|---|---|---|
| 0 Setup | 0 | none | none |
| 1 ElevenLabs says what happened | 1, 2, 3 | 0 | 2 |
| 2 Spend RPCs | 4, 5 | 0 | 1, 6 |
| 3 `asegurarVoz` by outcome | 6, 7, 8, 9 | 1, 2 | 6 |
| 4 Sweeper | 10 | 3 | 5 |
| 5 What Coni reads | 11, 12, 13 | 2 | 4, 6 |
| 6 Re-classification estimate | 14 | 0 | 1, 2, 4, 5 |
| 7 Docs and verification | 15, 16 | 1 to 6 | none |
| 8 Deploy runbook | 17 | 7 | none |

Parallel lotes touch disjoint files, except that Lotes 1 and 2 both end with `pnpm type` on the whole tree: the
controller serializes commits and each implementer stages only its own paths (`git add <paths>`, never `git add -A`).
Lote 3 needs the regenerated `database.types.ts` from Lote 2.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `lib/proveedores/elevenlabs.ts` | modify | Typed failures of `generarVoz` (`respondio`, `http`), `rechazoSinCobro`, body read guarded, 402 recognised |
| `supabase/migrations/20261017000200_liberar_sin_cobro.sql` | create | `gastos.sin_cobro`, `liberar_gasto(p_clave, p_sin_cobro)` |
| `supabase/migrations/20261017000210_reabrir_reserva.sql` | create | `reservar_gasto(..., p_reabrir)` |
| `lib/supabase/database.types.ts` | regenerate | New column and argument |
| `lib/datos/repositorio.ts` | modify | `reservarGasto({ reabrir })`, `liberarGasto(db, clave, { sinCobro })` |
| `lib/produccion/voz.ts` | modify | Release by outcome, reopen, upload retries, suffixed key |
| `lib/mantenimiento/gastos.ts` | modify | Key regex with suffix; no "any stored voice" fallback |
| `lib/datos/grabacion.ts` | modify | `DatosDeGrabacion.vozSinCobro` read from `gastos` |
| `app/(app)/guion/[id]/textos.ts` | modify | `TEXTO_INTENTO_SIN_COBRO` |
| `app/(app)/guion/[id]/voz-para-firmar.tsx` | modify | The line inside the failure block |
| `lib/proveedores/anthropic.ts` | modify | `pedidoDeClasificacion` shared by the call and the estimate |
| `lib/pilares/reclasificar.ts` | modify | Estimate counts the user message, 110 output tokens per item |
| `docs/TRASPASO.md` | modify | Part 2 entry |
| Tests | modify | `tests/unit/elevenlabs.test.ts`, `tests/integration/gastos.test.ts`, `tests/integration/grabar-voz.test.ts`, `tests/integration/barrido-gastos.test.ts`, `tests/integration/grabacion-datos.test.ts`, `tests/integration/costo-de-grabar.test.ts`, `tests/unit/voz-para-firmar.test.tsx`, `tests/unit/pantalla-guion.test.tsx`, `tests/unit/reclasificar.test.ts` |

---

## Lote 0: Setup

### Task 0: Worktree and baseline

**Files:** none.

- [ ] **Step 1: Create the worktree from `main`**

```bash
cd /Users/fede/Projects/estudio-coni
git status --short   # only the untracked .impeccable/ folders; nothing staged
git log --oneline -1 # 47faecf or later on main
git worktree add .worktrees/voz-sin-doble-cobro -b fix/voz-sin-doble-cobro main
cd .worktrees/voz-sin-doble-cobro
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Local database and baseline**

```bash
supabase status || (colima start && pnpm db:start)
pnpm db:reset
pnpm type && pnpm test:run && pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-base-voz.txt
```

Expected: all green. Write down the unit and integration counts (Task 16 compares). Keep `/tmp/lint-base-voz.txt`:
later lint runs may only show these reports. (Root `pnpm lint` fails while `.worktrees/*/biome.json` exist; always lint
the code dirs.)

- [ ] **Step 3: No commit** (nothing changed).

---

## Lote 1: ElevenLabs says what happened

### Task 1: Typed failures of `generarVoz`

**Files:**
- Modify: `lib/proveedores/elevenlabs.ts:18-24` (SinConexion), `:39-45`, `:68-107` (generarVoz)
- Test: `tests/unit/elevenlabs.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/elevenlabs.test.ts`; extend its import from
`@/lib/proveedores/elevenlabs` with `FallaPasajeraDeElevenlabs, RechazoDeElevenlabs, rechazoSinCobro, SinCaracteres`)

```ts
describe("generarVoz dice qué respondió ElevenLabs", () => {
  it.each([400, 401, 402, 403, 404, 409, 422])("marks HTTP %i as answered and refused without charge", async (estado) => {
    capturando(() => HttpResponse.json({ detail: "No se puede" }, { status: estado }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toBeInstanceOf(RechazoDeElevenlabs)
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ respondio: true, http: estado })
    expect(rechazoSinCobro(error)).toBe(true)
  })

  it("marks a 429 as answered, refused without charge and still retryable", async () => {
    capturando(() => new HttpResponse("slow down", { status: 429 }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toBeInstanceOf(FallaPasajeraDeElevenlabs)
    expect(esReintentable(error)).toBe(true)
    expect(error).toMatchObject({ respondio: true, http: 429 })
    expect(rechazoSinCobro(error)).toBe(true)
  })

  it.each([500, 503, 529])("marks HTTP %i as answered with an unknown charge", async (estado) => {
    capturando(() => new HttpResponse("upstream error", { status: estado }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toMatchObject({ respondio: true, http: estado })
    expect(rechazoSinCobro(error)).toBe(false)
  })

  it("marks a network drop as not answered", async () => {
    capturando(() => HttpResponse.error())
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toMatchObject({ respondio: false, http: null })
    expect(rechazoSinCobro(error)).toBe(false)
  })

  it("marks an empty audio as answered with an unknown charge", async () => {
    capturando(() => new HttpResponse(new Uint8Array(), { headers: { "Content-Type": "audio/mpeg" } }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toMatchObject({ respondio: true, http: 200 })
    expect(rechazoSinCobro(error)).toBe(false)
  })

  it("marks an audio cut while reading as answered with an unknown charge, still retryable", async () => {
    capturando(
      () =>
        new HttpResponse(
          new ReadableStream({
            start(control) {
              control.enqueue(new Uint8Array([73, 68]))
              control.error(new Error("cortado"))
            },
          }),
          { headers: { "Content-Type": "audio/mpeg" } },
        ),
    )
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toBeInstanceOf(FallaPasajeraDeElevenlabs)
    expect(esReintentable(error)).toBe(true)
    expect(error).toMatchObject({ respondio: true, http: 200 })
    expect(rechazoSinCobro(error)).toBe(false)
  })

  it("does not call an error from elsewhere a refusal", () => {
    expect(rechazoSinCobro(new Error("HTTP 401"))).toBe(false)
    expect(rechazoSinCobro(new FallaDeConfiguracion("ElevenLabs respondió HTTP 401"))).toBe(false)
  })
})
```

Also change the existing "tells Coni to top up when ElevenLabs answers quota_exceeded" test: add
`expect(rechazado).toBeInstanceOf(SinCaracteres)` and `expect(rechazado).toMatchObject({ respondio: true, http: 401 })`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run tests/unit/elevenlabs.test.ts`
Expected: FAIL, `FallaPasajeraDeElevenlabs` (and the other new names) is not exported.

- [ ] **Step 3: Implement** in `lib/proveedores/elevenlabs.ts`

Replace `SinConexion` (lines 18-24) with:

```ts
/** Still a plain Error for the retry policy; the class lets `verificarVoz` tell "no connection" apart. Nothing answered. */
class SinConexion extends Error {
  readonly respondio = false
  readonly http = null
  constructor(cause: unknown) {
    super("No pude conectar con ElevenLabs.", { cause })
    this.name = "SinConexion"
  }
}

/**
 * ElevenLabs answered the voice request. `http` is its status (200 when the audio itself was empty or broke). Which
 * of these were billed is `rechazoSinCobro`'s question (spec 2026-10-17, decision 11, amendment A1 of its plan).
 */
export class SinCaracteres extends Falla {
  readonly respondio = true
  constructor(readonly http: number) {
    super(TEXTO_SIN_CARACTERES)
    this.name = "SinCaracteres"
  }
}

export class RechazoDeElevenlabs extends FallaDeConfiguracion {
  readonly respondio = true
  constructor(
    mensaje: string,
    readonly http: number,
  ) {
    super(mensaje)
    this.name = "RechazoDeElevenlabs"
  }
}

/** A plain Error on purpose: Trigger.dev retries it. */
export class FallaPasajeraDeElevenlabs extends Error {
  readonly respondio = true
  constructor(
    mensaje: string,
    readonly http: number,
    opciones?: ErrorOptions,
  ) {
    super(mensaje, opciones)
    this.name = "FallaPasajeraDeElevenlabs"
  }
}

/**
 * True only when ElevenLabs refused the voice request with a 4xx: the request was rejected before any audio was made,
 * and text to speech bills per generated character. A 5xx, a network failure or a 200 without a whole audio may have
 * been billed, so they are not refusals (the ElevenLabs docs do not say either way; see the plan of 2026-10-17).
 */
export function rechazoSinCobro(error: unknown): boolean {
  const http =
    error instanceof SinCaracteres || error instanceof RechazoDeElevenlabs || error instanceof FallaPasajeraDeElevenlabs
      ? error.http
      : null
  return http !== null && http >= 400 && http < 500
}
```

`TEXTO_SIN_CARACTERES` is declared below the class today; move its `export const` (lines 39-41) above `SinConexion`
so the class reads an initialised constant.

In `generarVoz`, replace the `async (respuesta) => { ... }` reader (lines 93-105) with:

```ts
    async (respuesta) => {
      if (!respuesta.ok) {
        const cuerpo = sinLlave(await respuesta.text(), clave)
        if (esFaltaDeCaracteres(cuerpo)) throw new SinCaracteres(respuesta.status)
        const mensaje = `ElevenLabs respondió HTTP ${respuesta.status}: ${mensajeErrorElevenlabs(cuerpo)}`
        throw esErrorDeConfiguracion(respuesta.status)
          ? new RechazoDeElevenlabs(mensaje, respuesta.status)
          : new FallaPasajeraDeElevenlabs(mensaje, respuesta.status)
      }
      let audio: Uint8Array
      try {
        audio = new Uint8Array(await respuesta.arrayBuffer())
      } catch (error) {
        // The answer was a 200 and the body broke (a drop or the timeout while reading): it may have been billed.
        throw new FallaPasajeraDeElevenlabs("ElevenLabs cortó el audio antes de terminar.", respuesta.status, {
          cause: error,
        })
      }
      if (audio.length === 0) {
        throw new FallaPasajeraDeElevenlabs("ElevenLabs devolvió un audio vacío.", respuesta.status)
      }
      return audio
    },
```

Messages stay the same strings as before (the gate 1 screen matches `401|403` and `llave` in them).

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/elevenlabs.test.ts tests/unit/reintentos.test.ts`
Expected: PASS, the older tests of the file included (classes still extend `FallaDeConfiguracion`, `Falla`, `Error`).

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/elevenlabs.ts tests/unit/elevenlabs.test.ts
git commit -m "Say whether ElevenLabs answered a failed voice and with which status"
```

### Task 2: Grep guard for the error classes

**Files:** none changed unless the grep finds something.

- [ ] **Step 1: Check nobody depends on the old shapes**

```bash
grep -rn "SinConexion\|devolvió un audio vacío\|instanceof Falla\b" lib app trigger | grep -v database.types
```

Expected: `SinConexion` only inside `elevenlabs.ts`; `instanceof Falla` in `grabar-voz.ts`, `producir.ts` and others
keeps working because `SinCaracteres extends Falla`. Nothing to change. If a caller matched the class name string
`"Error"` of a voice failure, fix it in this task with its own test.

- [ ] **Step 2: Run the voice integration suite**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts`
Expected: PASS (behaviour unchanged so far).

- [ ] **Step 3: No commit** unless Step 1 found something.

### Task 3: Recognise `402 insufficient_credits` as "no characters" (amendment A6)

**Files:**
- Modify: `lib/proveedores/elevenlabs.ts` (`esFaltaDeCaracteres`)
- Test: `tests/unit/elevenlabs.test.ts`

- [ ] **Step 1: Write the failing test** (inside `describe("generarVoz sin caracteres")`)

```ts
  it("tells Coni to top up when ElevenLabs answers 402 insufficient_credits", async () => {
    servidor.use(
      http.post(`${BASE}/v1/text-to-speech/:voz`, () =>
        HttpResponse.json(
          { detail: { type: "payment_required", code: "insufficient_credits", message: "Not enough credits." } },
          { status: 402 },
        ),
      ),
    )
    const rechazado = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: BASE }))

    expect(rechazado).toBeInstanceOf(SinCaracteres)
    expect(rechazado).toMatchObject({ http: 402 })
    expect(rechazoSinCobro(rechazado)).toBe(true)
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/elevenlabs.test.ts -t "insufficient_credits"`
Expected: FAIL, received a `RechazoDeElevenlabs`.

- [ ] **Step 3: Implement**

```ts
// `quota_exceeded` is the older answer; the error catalogue now names 402 `insufficient_credits`.
function esFaltaDeCaracteres(cuerpo: string): boolean {
  return /quota_exceeded|insufficient_credits/i.test(cuerpo)
}
```

- [ ] **Step 4: Run the file**

Run: `pnpm exec vitest run tests/unit/elevenlabs.test.ts`
Expected: PASS (the `it.each([400, 402, ...])` test with body `No se puede` still gets a configuration error).

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/elevenlabs.ts tests/unit/elevenlabs.test.ts
git commit -m "Tell Coni to top up on ElevenLabs' 402 insufficient_credits"
```

**Lote 1 review:** every `throw` inside `generarVoz` after `fetch` is one of the three typed classes or `SinConexion`;
`decisionDeReintento` still skips retries for 4xx other than 408/429 (`RechazoDeElevenlabs` is a
`FallaDeConfiguracion`); no message text changed; no key in any message (existing tests).

---

## Lote 2: Spend RPCs

### Task 4: Migration `20261017000200_liberar_sin_cobro.sql`

**Files:**
- Create: `supabase/migrations/20261017000200_liberar_sin_cobro.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated), `lib/datos/repositorio.ts:205-209`
- Test: `tests/integration/gastos.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/gastos.test.ts`)

```ts
describe("liberar sin cobro", () => {
  it("marks a release as sin_cobro only when asked, and a plain release leaves it false", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-sin-cobro", 1)
      await reservar(c, "clave-barrida", 1)
      await c.query("select public.liberar_gasto('clave-sin-cobro', true)")
      await c.query("select public.liberar_gasto('clave-barrida')")
      const { rows } = await c.query<{ clave: string; estado: string; sin_cobro: boolean }>(
        "select clave, estado, sin_cobro from public.gastos where clave in ('clave-sin-cobro', 'clave-barrida') order by clave",
      )
      expect(rows).toEqual([
        { clave: "clave-barrida", estado: "liberado", sin_cobro: false },
        { clave: "clave-sin-cobro", estado: "liberado", sin_cobro: true },
      ])
    })
  })

  it("does not mark a confirmed spend as sin_cobro", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-pagada", 1)
      await c.query("select public.confirmar_gasto('clave-pagada', 1)")
      await c.query("select public.liberar_gasto('clave-pagada', true)")
      const { rows } = await c.query("select estado, sin_cobro from public.gastos where clave = 'clave-pagada'")
      expect(rows).toEqual([{ estado: "confirmado", sin_cobro: false }])
    })
  })

  it("still refuses Coni and the maintainer the new release", async () => {
    await como(comoConi, async (c) => {
      const err = await fallaCon(c, "select public.liberar_gasto('clave-x', true)")
      expect(err.code).toBe("42501")
    })
  })
})
```

Check the `42501` expectation against the existing "rechaza confirmar y liberar cuando lo intenta coni" test
(line 231) and use the same assertion it uses.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gastos.test.ts -t "sin cobro"`
Expected: FAIL, `function public.liberar_gasto(unknown, boolean) does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- Spec 2026-10-17, decision 14 (amendment A3 of its plan): a released voice reservation says "no se cobró" only when
-- the release proved it (ElevenLabs refused the request with a 4xx). The sweeper also releases voice reservations,
-- but after an unknown outcome, to free the cap; those stay sin_cobro = false.
alter table public.gastos add column sin_cobro boolean not null default false;
comment on column public.gastos.sin_cobro is
  'True when the provider refused the request, so nothing was billed. Set only through liberar_gasto(p_clave, true).';

drop function public.liberar_gasto(text);

create function public.liberar_gasto(p_clave text, p_sin_cobro boolean default false) returns public.gastos
language sql set search_path = '' as $$
  update public.gastos set estado = 'liberado', sin_cobro = p_sin_cobro
  where clave = p_clave and estado = 'reservado'
  returning *
$$;

revoke execute on function public.liberar_gasto(text, boolean) from public, anon, authenticated;
grant execute on function public.liberar_gasto(text, boolean) to service_role;
```

- [ ] **Step 4: Apply, regenerate types, wire the TS wrapper**

```bash
pnpm db:reset && pnpm db:types
```

In `lib/datos/repositorio.ts` replace `liberarGasto`:

```ts
/**
 * Releasing a reservation that is no longer `reservado` changes nothing, so it is safe to repeat. `sinCobro` only when
 * the provider refused the request: it is what lets the screen say the attempt was not charged.
 */
export async function liberarGasto(db: Db, clave: string, opciones: { sinCobro?: boolean } = {}): Promise<void> {
  const { error } = await db.rpc("liberar_gasto", { p_clave: clave, p_sin_cobro: opciones.sinCobro ?? false })
  if (error) throw fallo("No pude liberar el gasto", error)
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gastos.test.ts tests/integration/barrido-gastos.test.ts && pnpm type`
Expected: PASS, and `tsc` clean (every existing `liberarGasto(db, clave)` call still type-checks).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261017000200_liberar_sin_cobro.sql lib/supabase/database.types.ts lib/datos/repositorio.ts tests/integration/gastos.test.ts
git commit -m "Record when a released spend was proven not charged"
```

### Task 5: Migration `20261017000210_reabrir_reserva.sql`

**Files:**
- Create: `supabase/migrations/20261017000210_reabrir_reserva.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated), `lib/datos/repositorio.ts:157-177`
- Test: `tests/integration/gastos.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/gastos.test.ts`)

```ts
describe("reabrir una reserva liberada", () => {
  const reabrir = (c: pg.PoolClient, clave: string, monto: number) =>
    c.query<Reserva>(
      `select ${COLUMNAS} from public.reservar_gasto(null, 'elevenlabs', 'voz', $1, $2, now(), true)`,
      [monto, clave],
    )

  it("reopens a released key as reserved, at the new estimate, without sin_cobro", async () => {
    await como(comoServicio, async (c) => {
      const primera = await reservar(c, "clave-reabrir", 1)
      await c.query("select public.liberar_gasto('clave-reabrir', true)")

      const { rows } = await reabrir(c, "clave-reabrir", 2)

      expect(rows[0]).toMatchObject({ id: primera.id, clave: "clave-reabrir", estado: "reservado", estimado: 2, real: null })
      const { rows: marca } = await c.query("select sin_cobro from public.gastos where clave = 'clave-reabrir'")
      expect(marca).toEqual([{ sin_cobro: false }])
    })
  })

  it("restarts the creation time so the sweeper's hour starts again", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-reloj", 1)
      await c.query("update public.gastos set creado_en = now() - interval '3 hours' where clave = 'clave-reloj'")
      await c.query("select public.liberar_gasto('clave-reloj', true)")
      await reabrir(c, "clave-reloj", 1)
      const { rows } = await c.query<{ reciente: boolean }>(
        "select creado_en > now() - interval '1 minute' as reciente from public.gastos where clave = 'clave-reloj'",
      )
      expect(rows).toEqual([{ reciente: true }])
    })
  })

  it("checks the cap again before reopening", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-tope", 1)
      await c.query("select public.liberar_gasto('clave-tope', true)")
      await reservar(c, "clave-llena", 39.5)
      const err = await fallaCon(
        c,
        "select public.reservar_gasto(null, 'elevenlabs', 'voz', 1, 'clave-tope', now(), true)",
      )
      expect(err.message).toBe("tope_alcanzado")
    })
  })

  it("returns a released key unchanged when reopening is not asked", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-cerrada", 1)
      await c.query("select public.liberar_gasto('clave-cerrada')")
      const otra = await reservar(c, "clave-cerrada", 1)
      expect(otra.estado).toBe("liberado")
    })
  })

  it("never reopens a confirmed key", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-confirmada", 1)
      await c.query("select public.confirmar_gasto('clave-confirmada', 1)")
      const { rows } = await reabrir(c, "clave-confirmada", 1)
      expect(rows[0]).toMatchObject({ estado: "confirmado", real: 1 })
    })
  })
})
```

The cap test assumes `tope_mensual_usd = 40` (the file's other tests do the same). The existing helper `reservar`
calls six arguments and must keep working unchanged.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gastos.test.ts -t "reabrir"`
Expected: FAIL, `function public.reservar_gasto(..., boolean) does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- Spec 2026-10-17, decision 12 (amendment A2 of its plan): a voice attempt whose reservation was released (ElevenLabs
-- refused it) is tried again under the same key. Opt-in: the script writer reads a released Claude key as "Claude
-- refused, do not ask again" (lib/produccion/producir.ts) and must keep getting it back as it is.
drop function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz);

create function public.reservar_gasto(
  p_pieza uuid,
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now(),
  p_reabrir boolean default false
) returns public.gastos
language plpgsql set search_path = '' as $$
declare
  v_mes date := date_trunc('month', p_ahora at time zone 'America/Santiago')::date;
  v_existente public.gastos;
  v_tope numeric;
  v_usado numeric;
  v_nuevo public.gastos;
begin
  -- One reservation at a time per month, so two renders started together cannot both pass the cap.
  perform pg_advisory_xact_lock(hashtext('gastos:' || v_mes::text));

  select * into v_existente from public.gastos where clave = p_clave;
  if found and not (p_reabrir and v_existente.estado = 'liberado') then
    return v_existente;
  end if;

  select tope_mensual_usd into v_tope from public.ajustes where id;
  -- Without a cap row the comparison below would be null and spend would pass unchecked.
  if v_tope is null then
    raise exception using errcode = 'P0001', message = 'ajustes_faltantes';
  end if;
  select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) into v_usado
    from public.gastos where mes = v_mes and estado in ('reservado', 'confirmado');
  if v_usado + p_estimado > v_tope then
    raise exception using errcode = 'P0001', message = 'tope_alcanzado',
      detail = format('usado=%s estimado=%s tope=%s', v_usado, p_estimado, v_tope);
  end if;

  if v_existente.id is not null then
    -- Reopened: counted again in this month, with a fresh clock for the sweeper and no proof of "not charged".
    update public.gastos
       set estado = 'reservado', estimado_usd = p_estimado, real_usd = null, mes = v_mes,
           creado_en = now(), sin_cobro = false
     where id = v_existente.id
    returning * into v_nuevo;
  else
    insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, clave)
    values (p_pieza, p_proveedor, p_paso, v_mes, p_estimado, p_clave)
    returning * into v_nuevo;
  end if;
  return v_nuevo;
end $$;

revoke execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean) to service_role;
```

- [ ] **Step 4: Apply, regenerate types, wire the TS wrapper**

```bash
pnpm db:reset && pnpm db:types
```

In `lib/datos/repositorio.ts`, `reservarGasto` gains the option and passes it:

```ts
export async function reservarGasto(
  db: Db,
  reserva: {
    piezaId: string
    proveedor: "heygen" | "elevenlabs" | "anthropic"
    paso: string
    estimadoUsd: number
    clave: string
    ahora: string
    /** Reopen a released key (only the voice, whose release means "refused, not charged"). */
    reabrir?: boolean
  },
): Promise<Reserva> {
  const { data, error } = await db.rpc("reservar_gasto", {
    p_pieza: reserva.piezaId,
    p_proveedor: reserva.proveedor,
    p_paso: reserva.paso,
    p_estimado: reserva.estimadoUsd,
    p_clave: reserva.clave,
    p_ahora: reserva.ahora,
    p_reabrir: reserva.reabrir ?? false,
  })
  return resultadoDeReserva(error, data)
}
```

- [ ] **Step 5: Run the spend suites**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gastos.test.ts tests/integration/barrido-gastos.test.ts tests/integration/producir.test.ts tests/integration/grabar.test.ts && pnpm type`
Expected: PASS. `reservar_gasto_general` (positional, six arguments) still works: the "voyage" test of `gastos.test.ts`
covers it.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261017000210_reabrir_reserva.sql lib/supabase/database.types.ts lib/datos/repositorio.ts tests/integration/gastos.test.ts
git commit -m "Let a released voice reservation be reopened under its own key"
```

**Lote 2 review:** both migrations replay on a clean `pnpm db:reset`; the old six-argument signature no longer
exists (`select pg_get_function_identity_arguments(oid) from pg_proc where proname in ('reservar_gasto','liberar_gasto')`
shows one row each); grants: only `service_role` executes either; the advisory lock still comes first; nothing but
`asegurarVoz` will pass `reabrir: true` (grep after Lote 3).

---

## Lote 3: `asegurarVoz` by outcome

All tests of this lote go in `tests/integration/grabar-voz.test.ts`, in a new block. Add these helpers at the top of
the file (after `deps()`), and import `ConfigElevenlabs`-free values already present:

```ts
const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs

async function filaDe(id: string) {
  const fila = await leerPieza(clienteDeServicio(), id)
  if (fila === null) throw new Error(`No se sembró la pieza ${id}`)
  return fila
}

function intentar(d: DepsGrabarVoz, fila: Awaited<ReturnType<typeof filaDe>>) {
  return asegurarVoz(d, { fila, guion: GUION, config: ELEVENLABS, llave: async () => "sk_eleven_de_prueba", nueva: false })
}

async function gastosDeVoz(id: string) {
  const { rows } = await pool.query<{ clave: string; estado: string; sin_cobro: boolean }>(
    "select clave, estado, sin_cobro from public.gastos where pieza_id = $1 and paso = 'voz' order by creado_en, id",
    [id],
  )
  return rows
}

function responder(...respuestas: (() => Response)[]) {
  let vez = 0
  servidor.use(
    http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () => {
      llamadas += 1
      const respuesta = respuestas[Math.min(vez, respuestas.length - 1)]
      vez += 1
      if (!respuesta) throw new Error("Sin respuesta preparada")
      return respuesta()
    }),
  )
}

const audioOk = () => new HttpResponse(VOZ, { headers: { "Content-Type": "audio/mpeg" } })
```

`deps()` gains `esperar: async () => {}` so upload retries never sleep in tests.

### Task 6: Release at once only on a refusal (decision 11, amendment A1)

**Files:**
- Modify: `lib/produccion/voz.ts:100-107`
- Test: `tests/integration/grabar-voz.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("asegurarVoz releases by outcome", () => {
  it.each([401, 403, 422, 429])("releases at once, as not charged, when ElevenLabs refuses with %i", async (estado) => {
    responder(() => HttpResponse.json({ detail: "No se puede" }, { status: estado }))
    const id = await grabando()

    await expect(intentar(deps(), await filaDe(id))).rejects.toThrow(`HTTP ${estado}`)

    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "liberado", sin_cobro: true })])
  })

  it("releases at once, as not charged, when ElevenLabs has no characters", async () => {
    responder(() =>
      HttpResponse.json({ detail: { code: "insufficient_credits", message: "No credits" } }, { status: 402 }),
    )
    const id = await grabando()

    await expect(intentar(deps(), await filaDe(id))).rejects.toThrow(/caracteres suficientes/)

    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "liberado", sin_cobro: true })])
  })

  it.each([
    ["a server error", () => new HttpResponse("x", { status: 503 })],
    ["a network drop", () => HttpResponse.error()],
    ["an empty audio", () => new HttpResponse(new Uint8Array(), { headers: { "Content-Type": "audio/mpeg" } })],
  ])("keeps the reservation for the sweeper after %s", async (_caso, respuesta) => {
    responder(respuesta)
    const id = await grabando()

    await expect(intentar(deps(), await filaDe(id))).rejects.toThrow()

    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "reservado", sin_cobro: false })])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts -t "releases by outcome"`
Expected: FAIL: 401/403/422/429 leave `reservado`; the 402 row is `liberado` but `sin_cobro` false.

- [ ] **Step 3: Implement** (in `lib/produccion/voz.ts`; import `rechazoSinCobro` from `@/lib/proveedores/elevenlabs`
and drop the now unused `Falla` import)

```ts
  let audio: Uint8Array
  try {
    audio = await generarVoz({ clave: llave, config, texto, base: deps.base?.elevenlabs })
  } catch (error) {
    // A refusal (4xx) made no audio and billed nothing: the money goes back to the cap now, and the screen may say so.
    // Anything else may have been billed: the reservation stays, and the sweeper frees it after an hour with no take.
    if (rechazoSinCobro(error)) await liberarGasto(deps.db, clave, { sinCobro: true })
    throw error
  }
```

- [ ] **Step 4: Run the voice suites**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts tests/integration/producir.test.ts tests/integration/grabar.test.ts`
Expected: PASS. The older test "lets Trigger.dev retry a server error without changing the piece" still passes.

- [ ] **Step 5: Commit**

```bash
git add lib/produccion/voz.ts tests/integration/grabar-voz.test.ts
git commit -m "Release a voice reservation at once only when ElevenLabs refused it"
```

### Task 7: A retry reopens its released key (decision 12, first half)

**Files:**
- Modify: `lib/produccion/voz.ts:85-99`
- Test: `tests/integration/grabar-voz.test.ts`

- [ ] **Step 1: Write the failing test** (inside `describe("asegurarVoz releases by outcome")`)

```ts
  it("lets a retry of the same attempt reopen the released key and pay once", async () => {
    responder(() => new HttpResponse("slow down", { status: 429 }), audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const d = deps()

    await expect(intentar(d, fila)).rejects.toThrow("429")
    const voz = await intentar(d, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(2)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado", sin_cobro: false })])
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts -t "reopen the released key"`
Expected: FAIL with `FallaDeConfiguracion`: "La reserva de la voz de la pieza ... está liberado, pero la toma no está
guardada."

- [ ] **Step 3: Implement**: pass `reabrir: true` in the `reservarGasto` call of `asegurarVoz`

```ts
  const reserva = await reservarGasto(deps.db, {
    piezaId: fila.id,
    proveedor: "elevenlabs",
    paso: "voz",
    estimadoUsd: estimado,
    clave,
    ahora: deps.ahora(),
    // A released key was a refusal that billed nothing: trying the same attempt again reopens it.
    reabrir: true,
  })
```

Task 9 replaces the `estado !== "reservado"` guard below it; leave it for now (with `reabrir` a released key never
comes back as `liberado`).

- [ ] **Step 4: Run the file**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/produccion/voz.ts tests/integration/grabar-voz.test.ts
git commit -m "Reopen a refused voice reservation when the attempt is retried"
```

### Task 8: Retry the upload in memory, then confirm (decision 11, row 3)

**Files:**
- Modify: `lib/produccion/voz.ts` (`DepsVoz`, the upload)
- Test: `tests/integration/grabar-voz.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
function almacenQueFalla(veces: number) {
  const almacen = almacenEnMemoria()
  let quedan = veces
  let subidas = 0
  return {
    almacen: {
      ...almacen,
      async subir(clave: string, datos: Uint8Array, tipo: string) {
        subidas += 1
        if (quedan > 0) {
          quedan -= 1
          throw new Error("R2 no respondió")
        }
        return almacen.subir(clave, datos, tipo)
      },
    },
    subidas: () => subidas,
  }
}

describe("asegurarVoz keeps a paid audio", () => {
  it("retries the upload with the audio in memory and pays once", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const falla = almacenQueFalla(3)

    const voz = await intentar({ ...deps(), almacen: falla.almacen }, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(1)
    expect(falla.subidas()).toBe(4)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado" })])
  })

  it("confirms the reservation when the upload still fails, because the audio was paid", async () => {
    responder(audioOk)
    const id = await grabando()
    const falla = almacenQueFalla(4)

    await expect(intentar({ ...deps(), almacen: falla.almacen }, await filaDe(id))).rejects.toThrow("R2 no respondió")

    expect(falla.subidas()).toBe(4)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado", sin_cobro: false })])
  })

  it("waits a little longer before each upload retry", async () => {
    responder(audioOk)
    const id = await grabando()
    const esperas: number[] = []

    const esperar = async (ms: number) => {
      esperas.push(ms)
    }

    await intentar({ ...deps(), almacen: almacenQueFalla(3).almacen, esperar }, await filaDe(id))

    expect(esperas).toEqual([1000, 2000, 4000])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts -t "keeps a paid audio"`
Expected: FAIL: one upload, the error propagates, the reservation stays `reservado`; `esperar` is not a known
property (type error under Vitest is not checked, the third test fails on `esperas` being empty).

- [ ] **Step 3: Implement** in `lib/produccion/voz.ts`

Add to `DepsVoz`:

```ts
  /** Pause between upload retries; tests pass one that does not sleep. */
  esperar?: (ms: number) => Promise<void>
```

Add above `asegurarVoz`:

```ts
const REINTENTOS_DE_SUBIDA = 3
const ESPERA_DE_SUBIDA_MS = 1_000

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms))

/**
 * The audio was paid the moment ElevenLabs returned it, so it is uploaded from memory up to three more times. If the
 * store still fails, the reservation is confirmed before the error goes on: the cap must count what was paid.
 */
async function guardarTomaPagada(
  deps: DepsVoz,
  entrada: { toma: string; audio: Uint8Array; clave: string; estimado: number },
): Promise<void> {
  const esperar = deps.esperar ?? dormir
  let ultimoError: unknown
  for (let vez = 0; vez <= REINTENTOS_DE_SUBIDA; vez += 1) {
    if (vez > 0) await esperar(ESPERA_DE_SUBIDA_MS * 2 ** (vez - 1))
    try {
      await deps.almacen.subir(entrada.toma, entrada.audio, "audio/mpeg")
      return
    } catch (error) {
      ultimoError = error
    }
  }
  await confirmarGasto(deps.db, entrada.clave, entrada.estimado)
  throw ultimoError
}
```

and replace the two lines after the `generarVoz` block:

```ts
  await guardarTomaPagada(deps, { toma: exacta, audio, clave, estimado })
  await confirmarGasto(deps.db, clave, estimado)
  return { tipo: "lista", audioId: exacta }
```

- [ ] **Step 4: Run the file**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts && pnpm type`
Expected: PASS, `tsc` clean (`deps()` returns `DepsGrabarVoz`, which extends `DepsVoz`).

- [ ] **Step 5: Commit**

```bash
git add lib/produccion/voz.ts tests/integration/grabar-voz.test.ts
git commit -m "Retry the voice upload from memory and confirm what was paid"
```

### Task 9: A confirmed key without its take moves the next try to a new key (decision 12, second half)

**Files:**
- Modify: `lib/produccion/voz.ts:31-33` (`claveDeGastoDeVoz`), `:80-99` (reservation)
- Test: `tests/integration/grabar-voz.test.ts`, `tests/unit/voz.test.ts` (key format)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/voz.test.ts` (it already covers the voice keys; import `claveDeGastoDeVoz` from
`@/lib/produccion/voz` if it does not):

```ts
describe("claveDeGastoDeVoz", () => {
  const HUELLA = "ab".repeat(32)

  it("keeps the attempt's own key for the first paid try and suffixes the next ones", () => {
    expect(claveDeGastoDeVoz("p1", HUELLA, 2)).toBe(`p1:voz:${"ab".repeat(8)}:2`)
    expect(claveDeGastoDeVoz("p1", HUELLA, 2, 1)).toBe(`p1:voz:${"ab".repeat(8)}:2:r1`)
  })

  it("rejects a negative or fractional paid try", () => {
    expect(() => claveDeGastoDeVoz("p1", HUELLA, 2, -1)).toThrow()
    expect(() => claveDeGastoDeVoz("p1", HUELLA, 2, 1.5)).toThrow()
  })
})
```

In `tests/integration/grabar-voz.test.ts`, inside `describe("asegurarVoz keeps a paid audio")`:

```ts
  it("pays a new key when the attempt's key was confirmed but its take was lost", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const d = deps()
    await expect(intentar({ ...d, almacen: almacenQueFalla(4).almacen }, fila)).rejects.toThrow("R2 no respondió")

    const voz = await intentar(d, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(2)
    const base = claveDeGastoDeVoz(id, HUELLA, fila.intento)
    expect(await gastosDeVoz(id)).toEqual([
      expect.objectContaining({ clave: base, estado: "confirmado" }),
      expect.objectContaining({ clave: `${base}:r1`, estado: "confirmado" }),
    ])
  })

  it("stops, without paying again, after three new keys lost their take", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    for (let vez = 0; vez < 4; vez += 1) {
      await expect(intentar({ ...deps(), almacen: almacenQueFalla(4).almacen }, fila)).rejects.toThrow("R2")
    }

    await expect(intentar(deps(), fila)).rejects.toThrow(FallaDeConfiguracion)

    expect(llamadas).toBe(4)
  })
```

Import `claveDeGastoDeVoz` in the integration file (from `@/lib/produccion/voz`, next to `asegurarVoz`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run tests/unit/voz.test.ts -t claveDeGastoDeVoz && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts -t "new key"`
Expected: FAIL: no fourth argument; the integration retry throws "está confirmado, pero la toma no está guardada".

- [ ] **Step 3: Implement** in `lib/produccion/voz.ts`

```ts
/**
 * The spend key of one paid try of an attempt. `cobro` 0 is the attempt's own key; a try after a paid audio whose take
 * was lost on upload is `:r1`, `:r2`, ... and counts again, because it is paid again. The sweeper reads this format
 * (`lib/mantenimiento/gastos.ts`).
 */
export function claveDeGastoDeVoz(piezaId: string, huella: string, intento: number, cobro = 0): string {
  if (!Number.isSafeInteger(cobro) || cobro < 0) throw new Error(`Cobro inválido para la clave de la voz: ${cobro}`)
  const base = claveIdempotencia({ piezaId, paso: "voz", hash: huella, intento })
  return cobro === 0 ? base : `${base}:r${cobro}`
}

const COBROS_SIN_TOMA_MAXIMOS = 3

/** The open reservation of this try: the attempt's key, reopened if refused, or the next key after a lost paid take. */
async function reservarIntento(
  deps: DepsVoz,
  entrada: { fila: FilaDePieza; huella: string; estimado: number },
): Promise<{ tope: true } | { tope: false; clave: string }> {
  const { fila, huella, estimado } = entrada
  for (let cobro = 0; cobro <= COBROS_SIN_TOMA_MAXIMOS; cobro += 1) {
    const clave = claveDeGastoDeVoz(fila.id, huella, fila.intento, cobro)
    const reserva = await reservarGasto(deps.db, {
      piezaId: fila.id,
      proveedor: "elevenlabs",
      paso: "voz",
      estimadoUsd: estimado,
      clave,
      ahora: deps.ahora(),
      // A released key was a refusal that billed nothing: trying the same attempt again reopens it.
      reabrir: true,
    })
    if (reserva.tope) return { tope: true }
    if (reserva.gasto.estado === "reservado") return { tope: false, clave }
    // Confirmed without the take (checked before reserving): that audio was paid and lost, so the next key pays anew.
  }
  throw new FallaDeConfiguracion(
    `La voz de la pieza ${fila.id} se pagó ${COBROS_SIN_TOMA_MAXIMOS + 1} veces sin poder guardar la toma.`,
  )
}
```

In `asegurarVoz`, replace everything from `const clave = claveDeGastoDeVoz(...)` through the
`if (reserva.gasto.estado !== "reservado") { ... }` block with:

```ts
  const texto = textoParaVoz(guion, config.model_id)
  const estimado = estimarCostoVoz(texto)
  const reserva = await reservarIntento(deps, { fila, huella, estimado })
  if (reserva.tope) return { tipo: "tope" }
  const { clave } = reserva
```

Update the doc comment of `asegurarVoz` (lines 57-61) to: "...only then a reservation (reopened after a refusal, a new
key after a paid take that was lost), one ElevenLabs call, the upload with retries and the confirmation."

- [ ] **Step 4: Run the suites**

Run: `pnpm exec vitest run tests/unit/voz.test.ts && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabar-voz.test.ts tests/integration/producir.test.ts tests/integration/grabar.test.ts tests/integration/barrido-gastos.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/produccion/voz.ts tests/unit/voz.test.ts tests/integration/grabar-voz.test.ts
git commit -m "Pay a new voice key only after a paid take was lost"
```

**Lote 3 review:** `grep -rn "reabrir: true" lib` shows only `lib/produccion/voz.ts`; no path releases without
`rechazoSinCobro`; the upload loop rethrows the last error after confirming (no silent catch); the confirmed-without-take
loop is bounded; Trigger's own retry of `grabar-voz` (plain errors: 429, 5xx, network, upload) reaches the reopened or
suffixed key, never a `FallaDeConfiguracion` (walk `decisionDeReintento` for each class).

---

## Lote 4: Sweeper

### Task 10: Suffixed keys are voice keys; older keys lose the "any voice means paid" fallback (decision 13, A5)

**Files:**
- Modify: `lib/mantenimiento/gastos.ts:34-58`
- Test: `tests/integration/barrido-gastos.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the test "confirms a voice reservation once the piece has a voice" (line 173) with:

```ts
  it("does not confirm an older-key voice reservation because the piece has some voice; it waits a day", async () => {
    const id = await pieza("guion_por_aprobar")
    await pool.query("update public.piezas set audio_id = 'voces/x.mp3', version = version + 1 where id = $1", [id])
    const clave = await reservar(id, "elevenlabs", "voz")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 0, liberados: 0 })
    expect((await gasto(clave)).estado).toBe("reservado")

    expect(await barrerGastos(deps(dentroDe(25)))).toEqual({ confirmados: 0, liberados: 1 })
    expect(await gasto(clave)).toEqual({ estado: "liberado", real: null })
  })
```

Append to `describe("barrerGastos con la clave de la voz por texto")`:

```ts
  async function reservarVozCobro(piezaId: string, intento: number, cobro: number): Promise<string> {
    const clave = claveDeGastoDeVoz(piezaId, HUELLA, intento, cobro)
    await pool.query("select public.reservar_gasto($1, 'elevenlabs', 'voz', 0.25, $2, now())", [piezaId, clave])
    return clave
  }

  it("reads a suffixed key as a voice key: released after an hour without its take", async () => {
    const id = await pieza("guion_por_aprobar")
    const clave = await reservarVozCobro(id, 1, 1)

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 0, liberados: 1 })

    expect(await gasto(clave)).toEqual({ estado: "liberado", real: null })
  })

  it("confirms a suffixed key whose take is the piece's voice", async () => {
    const id = await pieza("guion_por_aprobar")
    await conVoz(id, claveDeToma(id, HUELLA, 1))
    const clave = await reservarVozCobro(id, 1, 2)

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 1, liberados: 0 })
    expect(await gasto(clave)).toEqual({ estado: "confirmado", real: 0.25 })
  })

  it("never marks a release of its own as not charged", async () => {
    const id = await pieza("guion_por_aprobar")
    const clave = await reservarVoz(id, 3)

    await barrerGastos(deps(dentroDe(2)))

    const { rows } = await pool.query("select sin_cobro from public.gastos where clave = $1", [clave])
    expect(rows).toEqual([{ sin_cobro: false }])
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/barrido-gastos.test.ts`
Expected: FAIL: the older key is confirmed at 2 h; the suffixed key is not recognised (stays `reservado` at 2 h). The
`sin_cobro` test passes already (it guards the sweeper against a future change).

- [ ] **Step 3: Implement** in `lib/mantenimiento/gastos.ts`

```ts
/**
 * `<pieza>:voz:<huella de 16>:<intento>[:r<n>]`: the key of a voice reservation by text; `:r<n>` is a new paid try after
 * a take lost on upload (`claveDeGastoDeVoz`). Older keys do not match.
 */
const CLAVE_DE_VOZ = /:voz:([0-9a-f]{16}):(\d+)(?::r\d+)?$/
```

and in `pasoRealizado`:

```ts
  if (gasto.proveedor === "elevenlabs" && gasto.paso === "voz") {
    // The voice is made before gate 1 (by the writer, or by "Preparar mi voz") and signing keeps it, so a stored voice
    // may belong to another reservation: only the take of this one says it was paid. An older key cannot tell, so it
    // waits for the day-old release; a reservation with no take of its own is released after an hour (`vozSinToma`).
    return tomaDeLaReserva(gasto, pieza) ?? false
  }
```

- [ ] **Step 4: Run the file and the maintenance suites**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/barrido-gastos.test.ts tests/integration/voces-trabadas.test.ts && pnpm exec vitest run tests/unit/mantenimiento-ejecutar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/gastos.ts tests/integration/barrido-gastos.test.ts
git commit -m "Sweep suffixed voice keys and stop confirming older keys on any voice"
```

**Lote 4 review:** the regex anchors still reject `:voz:<16>:<n>:x`; `tomaDeLaReserva` compares the take by `intento`
only (a suffixed key's take is the attempt's take, `t-<huella>-<intento>.mp3`); an older key with a paid voice is now
released after 24 h (D2): the runbook pre-check lists any such row in production.

---

## Lote 5: What Coni reads

### Task 11: `leerDatosDeGrabacion` reads whether the attempt was proven not charged

**Files:**
- Modify: `lib/datos/grabacion.ts:38-48` (`DatosDeGrabacion`), `:104-139` (`leerDatosDeGrabacion`)
- Modify (fixtures): `tests/unit/voz-para-firmar.test.tsx:20-28`, `tests/unit/pantalla-guion.test.tsx:72`
- Test: `tests/integration/grabacion-datos.test.ts`

- [ ] **Step 1: Write the failing tests** (append inside `describe("leerDatosDeGrabacion")`)

```ts
  async function gastoDeVoz(piezaId: string, clave: string, cierre: "sin_cobro" | "barrido" | "abierto") {
    await pool.query("select public.reservar_gasto($1, 'elevenlabs', 'voz', 0.2, $2, now())", [piezaId, clave])
    if (cierre === "sin_cobro") await pool.query("select public.liberar_gasto($1, true)", [clave])
    if (cierre === "barrido") await pool.query("select public.liberar_gasto($1)", [clave])
  }

  it.each([
    ["a refusal released it", "sin_cobro", true],
    ["the sweeper released it", "barrido", false],
    ["it is still open", "abierto", false],
  ] as const)("says the last voice attempt was not charged only when %s", async (_caso, cierre, esperado) => {
    const id = await piezaPorFirmar()
    await gastoDeVoz(id, `${id}:voz:${"ab".repeat(8)}:0`, cierre)
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.vozSinCobro).toBe(esperado)
  })

  it("reads the latest voice attempt, not an older refused one", async () => {
    const id = await piezaPorFirmar()
    await gastoDeVoz(id, `${id}:voz:${"ab".repeat(8)}:0`, "sin_cobro")
    await gastoDeVoz(id, `${id}:voz:${"ab".repeat(8)}:1`, "abierto")
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.vozSinCobro).toBe(false)
  })
```

`borrarSembrado` in `afterAll` already deletes the pieces' `gastos`. If two rows can share `creado_en` within one
statement, the second insert happens in a later statement, so `now()` differs; order by `creado_en desc, id desc` to
be deterministic anyway.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabacion-datos.test.ts`
Expected: FAIL, `vozSinCobro` is `undefined`.

- [ ] **Step 3: Implement** in `lib/datos/grabacion.ts`

Add to `DatosDeGrabacion`:

```ts
  /** The piece's latest voice reservation was released because ElevenLabs refused it: that attempt cost nothing. */
  vozSinCobro: boolean
```

Add the reader (above `leerDatosDeGrabacion`):

```ts
/** Read through Coni's session (she can read `gastos`). Only a release proven by a refusal counts, never the sweeper's. */
async function leerVozSinCobro(db: SupabaseClient<Database>, piezaId: string): Promise<boolean> {
  const { data, error } = await db
    .from("gastos")
    .select("estado, sin_cobro")
    .eq("pieza_id", piezaId)
    .eq("proveedor", "elevenlabs")
    .eq("paso", "voz")
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()
  // A plain Error, like the other readers of lib/datos: the screen's error boundary shows it.
  if (error) throw new Error(`No pude leer el gasto de la voz: ${error.message}`)
  return data?.estado === "liberado" && data.sin_cobro
}
```

In `leerDatosDeGrabacion`: the early return (config unreadable) adds `vozSinCobro: false`; the `Promise.all` gains a
fourth read and the result passes it on:

```ts
  const [saldos, presupuesto, url, vozSinCobro] = await Promise.all([
    leerSaldos(),
    leerPresupuesto(db, Date.now(), zona),
    urlParaVer(clave),
    leerVozSinCobro(db, fila.id),
  ])
  return {
    estado,
    voz: clave === null ? null : { url, clave },
    vozSinCobro,
    // ...botones and lineaDeFirma unchanged
  }
```

Fixtures: add `vozSinCobro: false` to the object built by `grabacion()` in `tests/unit/voz-para-firmar.test.tsx` and to
the `grabacion: { ... }` literal in `tests/unit/pantalla-guion.test.tsx:72`. Run `pnpm type` to find any other literal.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/grabacion-datos.test.ts && pnpm exec vitest run tests/unit/voz-para-firmar.test.tsx tests/unit/pantalla-guion.test.tsx && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/grabacion.ts tests/integration/grabacion-datos.test.ts tests/unit/voz-para-firmar.test.tsx tests/unit/pantalla-guion.test.tsx
git commit -m "Read at gate 1 whether the last voice attempt was proven not charged"
```

### Task 12: `Este intento no se cobró.` in the failure block

**Files:**
- Modify: `app/(app)/guion/[id]/textos.ts` (new constant), `app/(app)/guion/[id]/voz-para-firmar.tsx:120-143`
- Test: `tests/unit/voz-para-firmar.test.tsx`

- [ ] **Step 1: Write the failing tests** (append inside `describe("VozParaFirmar")`)

```ts
  const FALLA = "No pude preparar tu voz. ElevenLabs respondió HTTP 429: too many requests"

  it("says the failed attempt was not charged when its reservation was released by a refusal", () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null, { botones: BOTONES, vozSinCobro: true })}
        explicacion={FALLA}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Este intento no se cobró.")
    expect(screen.getByRole("button", { name: "Preparar mi voz US$ 0,33" })).toBeInTheDocument()
  })

  it("says nothing about money when the outcome is unknown", () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null, { botones: BOTONES, vozSinCobro: false })}
        explicacion={FALLA}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    expect(screen.getByRole("alert")).not.toHaveTextContent(/cobr/i)
    expect(screen.getByRole("button", { name: "Preparar mi voz US$ 0,33" })).toBeInTheDocument()
  })

  it("does not say it outside a failure, even if an older attempt was refused", () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null, { vozSinCobro: true })}
        explicacion={null}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    expect(screen.queryByText("Este intento no se cobró.")).not.toBeInTheDocument()
  })
```

The button's accessible name carries its price (`"Preparar mi voz US$ 0,33"`, as in the existing test at line 111).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run tests/unit/voz-para-firmar.test.tsx`
Expected: FAIL on the first test (no such text).

- [ ] **Step 3: Implement**

`app/(app)/guion/[id]/textos.ts`, next to `TEXTO_REINTENTA_VOZ`:

```ts
/** Spec 2026-10-17, decision 14: only when ElevenLabs refused the attempt, so the data proves nothing was charged. */
export const TEXTO_INTENTO_SIN_COBRO = "Este intento no se cobró."
```

`voz-para-firmar.tsx`: import it, and in `VozParaFirmar` compute before the `return`:

```tsx
  const sinCobro = falla !== null && datos.vozSinCobro
  const cuerpoDeFalla =
    detalleDeFalla?.texto || sinCobro ? (
      <>
        {detalleDeFalla?.texto ? <p>{detalleDeFalla.texto}</p> : null}
        {sinCobro ? <p>{TEXTO_INTENTO_SIN_COBRO}</p> : null}
      </>
    ) : undefined
```

and replace the `Bloque` children `{detalleDeFalla?.texto}` with `{cuerpoDeFalla}`. (`Bloque` renders a `<div>` only
when children are truthy, so `undefined` keeps today's markup when there is nothing to say.)

- [ ] **Step 4: Run the screen tests**

Run: `pnpm exec vitest run tests/unit/voz-para-firmar.test.tsx tests/unit/pantalla-guion.test.tsx tests/unit/textos-guion.test.ts`
Expected: PASS. If an older test asserted the reason as a bare text node, `toHaveTextContent` still matches; a
`getByText` on it still finds the `<p>`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/guion/[id]/textos.ts" "app/(app)/guion/[id]/voz-para-firmar.tsx" tests/unit/voz-para-firmar.test.tsx
git commit -m "Tell Coni a refused voice attempt was not charged"
```

### Task 13: Pin that the month's cap on screen ignores released money (amendment A4)

**Files:**
- Test: `tests/integration/costo-de-grabar.test.ts`

This is a guard on behaviour that is already right (`lib/datos/pantallas.ts:90`). It is expected to pass at once;
the Step 2 sanity check proves it can fail.

- [ ] **Step 1: Write the test** (new `describe` at the end of the file)

```ts
describe("leerPresupuesto", () => {
  it("does not count a released voice reservation, refused or swept", async () => {
    const antes = (await leerPresupuesto(coni, AHORA, ZONA)).usado
    const claves = [`presupuesto-${crypto.randomUUID()}`, `presupuesto-${crypto.randomUUID()}`]
    await pool.query("select public.reservar_gasto(null, 'elevenlabs', 'voz', 0.5, $1, now())", [claves[0]])
    await pool.query("select public.reservar_gasto(null, 'elevenlabs', 'voz', 0.5, $1, now())", [claves[1]])
    expect((await leerPresupuesto(coni, AHORA, ZONA)).usado).toBeCloseTo(antes + 1, 4)

    await pool.query("select public.liberar_gasto($1, true)", [claves[0]])
    await pool.query("select public.liberar_gasto($1)", [claves[1]])

    expect((await leerPresupuesto(coni, AHORA, ZONA)).usado).toBeCloseTo(antes, 4)
    await pool.query("delete from public.gastos where clave = any($1)", [claves])
  })
})
```

- [ ] **Step 2: Run it, and prove it can fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/costo-de-grabar.test.ts`
Expected: PASS. Then temporarily change `.in("estado", ["reservado", "confirmado"])` in `lib/datos/pantallas.ts:90` to
`.in("estado", ["reservado", "confirmado", "liberado"])`, re-run, see it FAIL, and revert (`git diff lib/` empty).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/costo-de-grabar.test.ts
git commit -m "Pin that the month's cap on screen ignores released spend"
```

**Lote 5 review:** the line appears only inside the error block and only from data (`vozSinCobro`); copy is Chilean
Spanish, tú, no long dash (`grep -n "—" app/(app)/guion/[id]/*.ts*` empty); the retry button keeps its price; axe of
gate 1 is unchanged (run `pnpm test:e2e -g accesibilidad` in Task 16).

---

## Lote 6: Re-classification estimate (outside the spec, own lote)

### Task 14: Count the user message and a realistic answer per item

**Files:**
- Modify: `lib/proveedores/anthropic.ts:506-528` (`clasificarEnPilares`), `lib/pilares/reclasificar.ts:21-24,103-118`
- Test: `tests/unit/reclasificar.test.ts`, `tests/unit/anthropic.test.ts` (only if it pins the user message)

- [ ] **Step 1: Write the failing tests** (append inside `describe("estimarClasificacion")`)

```ts
  // The production run of 2026-10-17: 19 items in one batch, estimated at US$ 0.0143, billed US$ 0.0231. These sizes
  // reproduce the old estimate (system 2000 chars, 19 UUID items of 120 chars of text).
  const PRODUCCION = Array.from({ length: 19 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    tipo: "material" as const,
    texto: "x".repeat(120),
  }))

  it("estimates at least what the production run of 2026-10-17 really cost, and not far above it", () => {
    const { tandas, usd } = estimarClasificacion({ elementos: PRODUCCION, sistema: "s".repeat(2000) })
    expect(tandas).toBe(1)
    expect(usd).toBeGreaterThanOrEqual(0.0231)
    expect(usd).toBeLessThanOrEqual(0.0231 * 1.25)
  })

  it("prices the exact user message of a batch, wrapper included", () => {
    const elementos = [{ id: "a", tipo: "tema" as const, texto: "x".repeat(400) }]
    const pedido = pedidoDeClasificacion(elementos)
    expect(pedido).toContain(JSON.stringify(elementos))
    expect(pedido.startsWith("Clasifica estos elementos.")).toBe(true)
  })
```

(A US$ comparison for the wrapper alone would vanish in the 4-decimal rounding; the production test above is the one
that pins the money.) Import `pedidoDeClasificacion` from `@/lib/proveedores/anthropic` in the test file.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run tests/unit/reclasificar.test.ts`
Expected: FAIL: `pedidoDeClasificacion` is not exported; the production test gets 0.0143.

- [ ] **Step 3: Implement**

`lib/proveedores/anthropic.ts`, above `clasificarEnPilares`:

```ts
/** The user message of one re-classification batch; the cost estimate counts this exact text. */
export function pedidoDeClasificacion(elementos: readonly ElementoPorClasificar[]): string {
  return `Clasifica estos elementos.\n\n<elementos>\n${sinCierre(JSON.stringify(elementos))}\n</elementos>`
}
```

and in `clasificarEnPilares`: `usuario: pedidoDeClasificacion(entrada.elementos),`.

`lib/pilares/reclasificar.ts`: import `pedidoDeClasificacion` next to `costoClaude`, and:

```ts
// A UUID, a slug, a one-sentence Spanish reason and the JSON keys: about 105 tokens per item in the production run of
// 2026-10-17 (60 under-shot the real cost by 1.6x).
const TOKENS_DE_SALIDA_POR_ELEMENTO = 110
```

```ts
/** Printed before any call: batches, and US$ from list prices (the system prompt and the user message, per batch). */
export function estimarClasificacion(entrada: { elementos: readonly ElementoPorClasificar[]; sistema: string }): {
  tandas: number
  usd: number
} {
  let caracteres = 0
  let tandas = 0
  for (let desde = 0; desde < entrada.elementos.length; desde += POR_TANDA) {
    tandas += 1
    caracteres += entrada.sistema.length + pedidoDeClasificacion(entrada.elementos.slice(desde, desde + POR_TANDA)).length
  }
  const usd = costoClaude(
    {
      input_tokens: Math.ceil(caracteres / CARACTERES_POR_TOKEN),
      output_tokens: TOKENS_DE_SALIDA_POR_ELEMENTO * entrada.elementos.length,
    },
    MODELO_POR_TAREA.clasificarEnPilares.modelo,
  )
  return { tandas, usd: Number(usd.toFixed(4)) }
}
```

`POR_TANDA` is declared above `estimarClasificacion` already. For zero items the loop gives `tandas = 0`, as
`Math.ceil(0 / 40)` did.

- [ ] **Step 4: Run the re-classification tests**

Run: `pnpm exec vitest run tests/unit/reclasificar.test.ts tests/unit/anthropic.test.ts && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/reclasificar.test.ts tests/integration/reclasificar-script.test.ts && pnpm type`
Expected: PASS. If an integration test pins the printed estimate string, update its number to the new value and say
so in the commit body.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/anthropic.ts lib/pilares/reclasificar.ts tests/unit/reclasificar.test.ts
git commit -m "Count the user message and a realistic answer in the re-classification estimate"
```

**Lote 6 review:** the estimate and the call build the user message from the same function; the production
calibration test documents its numbers; the reservation amount (`estimadoUsd`) now covers a run like the real one.

---

## Lote 7: Docs and verification

### Task 15: `docs/TRASPASO.md`

**Files:**
- Modify: `docs/TRASPASO.md` ("Lo que está hecho", "Siguiente")

- [ ] **Step 1: Add the Part 2 entry** under "Lo que está hecho", after the Part 1 bullet:

```markdown
- **Gasto honesto de la voz, parte 2** (spec `docs/superpowers/specs/2026-10-17-conidolly-logica-design.md`, decisiones 11 a 14; plan `docs/superpowers/plans/2026-10-17-voz-sin-doble-cobro.md`, rama `fix/voz-sin-doble-cobro`, sin desplegar): `generarVoz` dice si ElevenLabs respondió y con qué estado. Un 4xx (incluidos 401, 402, 403, 422 y 429) libera la reserva al tiro y la marca `gastos.sin_cobro`; un 5xx, un corte de red, un audio vacío o cortado quedan reservados y el barrido los libera a la hora sin toma (sin marca: no se sabe si se cobró). La subida a R2 se reintenta 3 veces con el audio en memoria; si igual falla, la reserva se confirma (se pagó) y el siguiente intento usa una clave nueva `:r<n>` (máximo 3). Un reintento de Trigger reabre su propia clave liberada (`reservar_gasto(..., p_reabrir => true)`, solo la voz). El barrido ya no confirma una clave antigua por "cualquier voz guardada": espera las 24 h. En la puerta 1, el bloque de falla dice «Este intento no se cobró.» solo si la última reserva de voz está liberada con `sin_cobro`. Los documentos de ElevenLabs no dicen si un error se cobra (ver el plan): un 5xx se trata como desconocido. Además: el estimado de la reclasificación cuenta el mensaje y ~110 tokens de salida por elemento. Migraciones `20261017000200` (liberar sin cobro) y `20261017000210` (reabrir reserva).
```

- [ ] **Step 2: Commit**

```bash
git add docs/TRASPASO.md
git commit -m "Record the honest voice spend in the handoff"
```

### Task 16: Full verification and review

**Files:** none (fixes go in their own commits, with a test first).

- [ ] **Step 1: Full suites**

```bash
pnpm db:reset
pnpm type
pnpm test:run
pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-voz.txt
diff /tmp/lint-base-voz.txt /tmp/lint-voz.txt
pnpm build
pnpm test:e2e
```

Expected: all green; unit and integration counts grow by the tests of this plan (compare with Task 0); the lint diff
is empty; no visual snapshot changes (no seeded scene has a refused voice).

- [ ] **Step 2: Banned patterns in my own diff**

```bash
git diff main --stat
git diff main -- lib app | grep -nE "as any|@ts-expect-error|—|catch \{\s*\}|!\." || echo "clean"
```

Expected: `clean` (no `any`, no long dash in copy, no empty catch, no non-null assertion).

- [ ] **Step 3: Code review** with `superpowers:requesting-code-review` on `main..fix/voz-sin-doble-cobro`, giving the
reviewer amendments A1 to A7 and the four Lote reviews above. Fix findings test-first.

- [ ] **Step 4: Critique of the touched screen**: gate 1 with a failed voice, both cases (`vozSinCobro` true and
false), at phone width and with large text (the scene helpers in `tests/e2e/escena.ts` can seed a `gastos` row with
`liberar_gasto(clave, true)`). Record the result in the PR or merge message.

- [ ] **Step 5: No commit** unless a fix was needed.

---

## Lote 8: Deploy runbook

### Task 17: Deploy runbook (Federico; nothing runs without his explicit OK, step by step)

Federico runs every production command from the **macOS Terminal** (not the app's terminal), where his keys live.
Order: database, then Trigger.dev, then the app. The database change is backward compatible: the old code calls
`liberar_gasto(p_clave)` and `reservar_gasto` with six named arguments, which resolve to the new functions through
their defaults, so the old Trigger worker and the old app keep working between steps.

- [ ] **Step 1 (OK needed): merge, no push unless asked.** `git checkout main && git merge --no-ff fix/voz-sin-doble-cobro`.
`git push` only when Federico asks.

- [ ] **Step 2 (OK needed, read-only): pre-checks in the Supabase SQL editor of `estudio-coni` (`mvfytttfxmzzjajecsch`)**

```sql
-- Open voice reservations with an older key: the new sweeper releases them after 24 h instead of confirming them on
-- any stored voice (decision 13, D2). If one paid for a real voice, Federico may confirm it by hand now:
--   select public.confirmar_gasto('<clave>', <estimado_usd>);
select clave, estimado_usd, creado_en, pieza_id from public.gastos
 where proveedor = 'elevenlabs' and paso = 'voz' and estado = 'reservado'
   and clave !~ ':voz:[0-9a-f]{16}:[0-9]+$';
-- Voice reservations open right now (they will be swept by the new rules).
select clave, estado, creado_en from public.gastos
 where proveedor = 'elevenlabs' and paso = 'voz' and estado = 'reservado' order by creado_en;
```

Expected: few or no rows. Stop and talk if an older-key row looks paid.

- [ ] **Step 3 (OK needed): database.** `supabase db push` from the repo (Federico). It applies `20261017000200` and
`20261017000210`. Check:

```sql
select pg_get_function_identity_arguments(oid) as argumentos, proname from pg_proc
 where proname in ('reservar_gasto', 'liberar_gasto') and pronamespace = 'public'::regnamespace;
select column_name, data_type, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'gastos' and column_name = 'sin_cobro';
```

Expected: one row per function (with `p_reabrir boolean` and `p_sin_cobro boolean`), and `sin_cobro boolean false`.

- [ ] **Step 4 (OK needed): Trigger.dev** (the voice task, the writer, the render and the nightly sweeper read the new
code):

```bash
pnpm install --frozen-lockfile
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

Note the version it prints (after `20261017.1`). If it fails, stop and fix before the app (the old app works with the
new database meanwhile).

- [ ] **Step 5 (OK needed): app** (Federico), from a clean export so `.worktrees/` is not uploaded:

```bash
cd /Users/fede/Projects/estudio-coni
rm -rf /tmp/estudio-deploy && mkdir /tmp/estudio-deploy && git archive main | tar -x -C /tmp/estudio-deploy
cp -R .vercel /tmp/estudio-deploy/ && cd /tmp/estudio-deploy && vercel deploy --prod --yes
```

Wait 15 to 45 s for the alias, then confirm it is served: open a gate 1 screen and check (programmatically, e.g. in the
browser console) that the page loads without errors; the new line only appears after a refused attempt, so no visual
change is expected yet.

- [ ] **Step 6 (OK needed, read-only): smoke.** The next day, in the SQL editor:

```sql
select estado, sin_cobro, count(*) from public.gastos
 where proveedor = 'elevenlabs' and paso = 'voz' and creado_en > now() - interval '1 day' group by 1, 2;
```

Expected: no `reservado` row older than an hour unless its piece is still `grabando_voz`. Update `docs/TRASPASO.md`
"Producción" (migrations up to `20261017000210`, the new Trigger version) and the Part 2 bullet ("en producción desde
...") in a commit on `main`, pushed only if Federico asks.

---

## Self-review (2026-10-17)

- **Spec coverage.** Decision 11: Tasks 1, 6, 8 (table rows; corrected by A1). Typed error with `respondio`: Task 1.
  Decision 12: Task 7 (reopen), Task 9 (fresh key after a confirmed-without-take), Task 5 (SQL). Decision 13: Task 10.
  Decision 14: Tasks 11 and 12 (line from data), Task 13 (cap sum, A4). Spec tests: one per release-table row (Task
  6), reopen and released money in the cap (Tasks 5, 13), sweeper on an older key with a foreign voice (Task 10),
  component test (Task 12). Docs (Task 15) and deploy (Task 17) with Federico's OK per step. Re-classification
  estimate: Task 14, own lote.
- **Placeholders.** None; the one "check the existing assertion" note (Task 4) names the test to copy.
- **Type consistency.** `rechazoSinCobro`, `SinCaracteres`, `RechazoDeElevenlabs`, `FallaPasajeraDeElevenlabs`
  (Task 1) are the names used in Tasks 3 and 6; `liberarGasto(db, clave, { sinCobro })` (Task 4) and
  `reservarGasto({ reabrir })` (Task 5) match Tasks 6, 7, 9; `claveDeGastoDeVoz(piezaId, huella, intento, cobro = 0)`
  (Task 9) matches Task 10; `DatosDeGrabacion.vozSinCobro` (Task 11) matches Task 12; `pedidoDeClasificacion`
  (Task 14) is used by both its callers.
- **Risks I checked.** A generic reopen would have broken the writer (A2); a sweeper release would have produced a
  false "no se cobró" (A3); a suffix outside the regex would have made new keys "older keys" (A5); a body-read timeout
  would have been read as "answered and refused" (Task 1 guards it); an unbounded paid retry loop (A7).
