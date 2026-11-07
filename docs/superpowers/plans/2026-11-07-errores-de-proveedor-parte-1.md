# Provider errors, part 1 (pause, tell WAV, resume on its own) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A payment, quota or key failure of ElevenLabs, HeyGen, Claude or Voyage stops retrying, opens one stored pause per provider, emails WAV once, shows Coni a fixed text with the buttons of that provider disabled (Voyage: WAV only) and a line in Inicio, and closes itself (with one notice to Coni) when a cheap check every 10 minutes answers well.

**Architecture:** Each provider client classifies its answer into a new `PausaDeProveedor extends Falla` (its message is the Coni text of that provider). One helper, `abrirPausa`, writes the pause through a security-definer function and emails WAV once; every task path that meets a pause calls it (inline catches and the `onFailure` hooks). Screens and server actions read the open pauses with Coni's session; the `mantenimiento-frecuente` task gets a `pausas` step that runs one minimal check per open pause and closes it.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres, RLS, Vault), Trigger.dev v4, Vitest + MSW, Playwright (`app` and `escritorio` projects), Biome (safe mode only).

**Spec:** `docs/superpowers/specs/2026-11-07-errores-de-proveedor-design.md` (decisions 1 to 5; decision 6, «Avisar a Federico», is part 2 and out of this plan). Part of #96.

---

## Ground rules for every task

- TDD: the failing test first, run it red, then the code, run it green, then commit. One concern per commit.
- Unit tests: `pnpm exec vitest run <file>`. Integration (local Supabase on 127.0.0.1:54422, start it with `pnpm db:start`, rebuild with `pnpm db:reset`): `pnpm test:db <file>`. E2E: `pnpm exec playwright test --project=app <file>` and `--project=escritorio <file>`.
- No `any`, no `@ts-expect-error`, no silent `catch`, no `biome check --unsafe` (use `pnpm check`), `"use client"` stays on line 1, colors only from tokens.
- Coni-facing copy: Spanish (Chile, tú), never an em dash. Before each commit: `grep -rn $'\xe2\x80\x94' <changed files>` must print nothing.
- Code, comments and commits in English. Every commit message ends with `Part of #96.` and then the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After any data, constant or copy change run the whole unit suite once per lote (`pnpm test:run`), not only the touched file.

## Amendments to the spec (approved by Federico on 2026-11-07; recorded in the spec's Amendments section)

- **A1. `avisada_en` column.** The spec's table has no way to know whether WAV's email went out. If `aWav` fails after the pause row exists, every later call would see "already open" and WAV would never hear. The table adds `avisada_en timestamptz`; `abrir_pausa_de_proveedor` returns `(pausa_id, nueva, avisar)` where `avisar` is `avisada_en is null`, and `marcar_pausa_avisada(id)` sets it after the email. A failed email is retried by the next call.
- **A2. Claude 402.** The current Claude docs list `402 billing_error` ("There's an issue with your billing or payment information", https://platform.claude.com/docs/en/api/errors). The spec lists 401, 403 and «400 credit balance is too low». This plan pauses on 402 too (`pago`).
- **A3. Voyage 402.** Voyage's error page (https://docs.voyageai.com/docs/error-codes) lists 400, 401, 403 (blocked IP), 429 and 5xx; there is no 402. The plan keeps 402 as the spec says (harmless if it never comes) and maps 403 to `llave`.
- **A4. HeyGen failed render with `insufficient_credit`.** Besides the 402 on `POST /v3/videos`, a render can fail later with that failure code (today `explicacionDeFalla` answers `TEXTO_SIN_CREDITOS`). That path also becomes a `heygen`/`cuota` pause.
- **A5. Claude also closes «Reintentar» of a script and «Pedir cambios».** While Claude is paused, `reintentarGuion` (reel and carousel) and `pedirCambios` (the guion's «Pedir cambios») are disabled and refused, besides «Proponer ahora». Choosing ideas stays enabled.
- **A6. Voyage pauses are WAV-only.** A Voyage pause opens its row, emails WAV once and closes on its own through the maintenance check, but disables nothing for Coni, writes no pause text on materials and shows no Inicio line (embeddings stay deferred to maintenance as today). The Biblioteca buttons («Reintentar», upload) close only while Claude is paused. A material that meets a pause while processing (Claude, or ElevenLabs while transcribing) is marked with «La Biblioteca está en pausa. Ya le avisamos a WAV.».
- **A7. Voyage key.** The spec says "the key in the Vault"; the Voyage key is not in the Vault, it is the Trigger.dev variable `VOYAGE_API_KEY` (`lib/produccion/deps-reales.ts:209`). The Voyage check reads it from there.
- **A9. ElevenLabs closing check.** Close when the subscription `status` is not `past_due`, `incomplete` or `free_disabled` and, for a `cuota` pause, characters remain. `has_open_invoices` is not checked.
- **A10. Inicio «Atención» lines.** While a pause of ElevenLabs, HeyGen or Claude is open, Inicio's attention block shows one line for it with the concrete reason (texts in the spec's A10 table and in Task 22); the line leaves when the pause closes. Voyage shows none, and its closing sends Coni no notice.
- **A8. Maintenance with Claude paused.** The `temas` step (every 10 min) and the nightly `fusiones` call Claude. Without care a Claude pause would fail `mantenimiento-frecuente` 144 times a day and email WAV each time. Both steps are skipped while Claude is paused, and a pause met inside them opens the pause instead of failing the run.

## File map

| File | Responsibility |
|---|---|
| `lib/dominio/pausas.ts` (new) | `PausaDeProveedor`, providers, reasons, Coni texts, closing texts, pure helpers (`textoDePausa`, `proveedorDelTextoDePausa`, ...) |
| `lib/produccion/reintentos.ts` | skip retries for a pause |
| `lib/proveedores/elevenlabs.ts`, `heygen-api.ts`, `anthropic/nucleo.ts`, `voyage.ts` | classify answers into pauses |
| `lib/produccion/grabar.ts` | failed render with `insufficient_credit` is a pause; inline catch opens it |
| `supabase/migrations/20261107000100_pausas_de_proveedor.sql` (new) | table, index, RLS, functions, notice kind |
| `lib/avisos/tipos.ts` | notice kind `pausa_cerrada` |
| `lib/datos/pausas.ts` (new) | read open pauses, refuse an action while paused, list pauses to check |
| `lib/pausas/abrir.ts` (new) | `abrirPausa`: open once, email WAV once |
| `lib/produccion/fallas.ts`, `grabar-voz.ts`, `producir.ts` | open the pause and write its text |
| `lib/ingesta/falla-material.ts`, `lib/ingesta/afirmar.ts` | materials and embeddings |
| `lib/mantenimiento/ejecutar.ts`, `lib/mantenimiento/temas.ts`, `lib/motor/tarea.ts` | skip Claude work while paused |
| `lib/proveedores/chequeos.ts` (new) | one minimal check per provider |
| `lib/mantenimiento/pausas.ts` (new) | the `pausas` step: check, notify Coni, close |
| `lib/produccion/deps-reales.ts` | real checker for the step |
| `lib/acciones/piezas.ts`, `semana.ts`, `biblioteca.ts` | server actions refuse while paused |
| `lib/datos/grabacion.ts`, `app/(app)/guion/[id]/voz-para-firmar.tsx`, `textos.ts` | gate 1 voice and video |
| `app/(app)/estado-de-pieza.tsx`, `app/(app)/guion/[id]/page.tsx`, `carrusel.tsx` | retry buttons |
| `app/(app)/biblioteca/**` | Biblioteca buttons |
| `lib/inicio/modelo.ts`, `lib/datos/inicio.ts`, `app/(app)/page.tsx` | Inicio «Atención» lines of open pauses |
| `tests/e2e/pausas.spec.ts`, `tests/e2e/pausas.escritorio.ts` (new) | phone and desktop |

## Provider checks verified against the docs (decision 5)

| Provider | Call | Cost | What closes the pause | Doc |
|---|---|---|---|---|
| ElevenLabs | `GET https://api.elevenlabs.io/v1/user/subscription`, header `xi-api-key` (already used by `lib/proveedores/saldos.ts`) | free (no characters) | HTTP 200 and `status` not in `past_due`, `incomplete`, `free_disabled` (open invoices are not checked, A9); for `cuota` also characters left (`character_limit - character_count > 0`) or `can_extend_character_limit` | https://elevenlabs.io/docs/api-reference/user/subscription/get |
| HeyGen (v3 only) | `GET https://api.heygen.com/v3/users/me`, header `X-Api-Key` (already used by `saldos.ts`) | the page does not say it is free; it charges no credits by its nature (a profile read) | HTTP 200; for `cuota`: `billing_type` `wallet` with `wallet.remaining_balance > 0`, `subscription` with premium + add-on `remaining > 0`, `usage_based` with `remaining_credits > 0` | https://developers.heygen.com/reference/get-current-user.md |
| Claude | `POST /v1/messages` (SDK `beta.messages.create`), `claude-sonnet-5-5`, `max_tokens: 1`, `thinking: between_tools`, effort `low`, one user word | about US$ 0.00003 | no error; any pause classification keeps it open | https://platform.claude.com/docs/en/api/errors (400 with «Your credit balance is too low...», 401, 402 `billing_error`, 403) |
| Voyage | `POST https://api.voyageai.com/v1/embeddings`, `Authorization: Bearer`, `{ input: ["ok"], model: "voyage-3.5", input_type: "query" }` (the existing `embeber`) | about 1 token, US$ 0.00000006 | no error | https://docs.voyageai.com/reference/embeddings-api |

`/v1/models` of Anthropic is not used: it is a key check and does not exercise billing, so it would close a `pago` or `cuota` pause too early.

---

# Lote 1: the pause as an error, and each client classifying it (6 tasks)

### Task 1: `PausaDeProveedor` and the texts

**Files:**
- Create: `lib/dominio/pausas.ts`
- Test: `tests/unit/pausas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/pausas.test.ts
import { describe, expect, it } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import {
  esProveedorConPausa,
  PausaDeProveedor,
  proveedorDelTextoDePausa,
  TEXTO_PAUSA,
  TEXTO_PAUSA_CERRADA,
  TEXTO_PAUSA_DE_BIBLIOTECA,
  textoDePausa,
  textoDePausaDeBiblioteca,
} from "@/lib/dominio/pausas"

describe("PausaDeProveedor", () => {
  it("is a Falla whose message is the Coni text of its provider", () => {
    const pausa = new PausaDeProveedor("elevenlabs", "pago", "ElevenLabs respondió HTTP 401: payment_issue", 401)
    expect(pausa).toBeInstanceOf(Falla)
    expect(pausa.message).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")
    expect(pausa).toMatchObject({ proveedor: "elevenlabs", motivo: "pago", http: 401, name: "PausaDeProveedor" })
  })

  it("caps the technical detail at 400 characters", () => {
    const pausa = new PausaDeProveedor("voyage", "llave", "x".repeat(900), 401)
    expect(pausa.detalle).toHaveLength(400)
  })
})

describe("texts", () => {
  it("has the four texts of the spec, without em dashes", () => {
    expect(TEXTO_PAUSA).toEqual({
      elevenlabs: "Tu voz está en pausa. Ya le avisamos a WAV.",
      heygen: "Tu video está en pausa. Ya le avisamos a WAV.",
      claude: "Las ideas y los guiones están en pausa. Ya le avisamos a WAV.",
      voyage: "La Biblioteca está en pausa. Ya le avisamos a WAV.",
    })
    expect(TEXTO_PAUSA_CERRADA).toEqual({
      elevenlabs: "Ya puedes preparar tu voz de nuevo.",
      heygen: "Ya puedes grabar tus videos de nuevo.",
      claude: "Las ideas y los guiones funcionan de nuevo.",
      voyage: "La Biblioteca funciona de nuevo.",
    })
    for (const texto of [...Object.values(TEXTO_PAUSA), ...Object.values(TEXTO_PAUSA_CERRADA)]) {
      expect(texto).not.toContain("\u2014")
    }
  })

  it("recognises a stored pause text and its provider", () => {
    expect(proveedorDelTextoDePausa(TEXTO_PAUSA.heygen)).toBe("heygen")
    expect(proveedorDelTextoDePausa("No pude preparar tu voz.")).toBeNull()
    expect(proveedorDelTextoDePausa(null)).toBeNull()
  })

  it("answers the text of an open pause, or null", () => {
    expect(textoDePausa(["claude"], "claude")).toBe(TEXTO_PAUSA.claude)
    expect(textoDePausa(["claude"], "heygen")).toBeNull()
  })

  it("closes the Biblioteca only while Claude is paused", () => {
    expect(textoDePausaDeBiblioteca(["claude"])).toBe(TEXTO_PAUSA_DE_BIBLIOTECA)
    // Amendment A6: a Voyage pause is WAV's only; it disables nothing for Coni.
    expect(textoDePausaDeBiblioteca(["voyage"])).toBeNull()
    expect(textoDePausaDeBiblioteca(["elevenlabs"])).toBeNull()
    expect(TEXTO_PAUSA_DE_BIBLIOTECA).toBe(TEXTO_PAUSA.voyage)
  })

  it("knows its providers", () => {
    expect(esProveedorConPausa("claude")).toBe(true)
    expect(esProveedorConPausa("anthropic")).toBe(false)
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm exec vitest run tests/unit/pausas.test.ts`
Expected: FAIL, cannot resolve `@/lib/dominio/pausas`.

- [ ] **Step 3: Write the module**

```ts
// lib/dominio/pausas.ts
import { Falla } from "@/lib/dominio/falla"

/** The paid providers whose payment, quota or key failures pause their work (spec 2026-11-07, decision 1). */
export const PROVEEDORES_CON_PAUSA = ["elevenlabs", "heygen", "claude", "voyage"] as const
export type ProveedorConPausa = (typeof PROVEEDORES_CON_PAUSA)[number]

export const MOTIVOS_DE_PAUSA = ["pago", "cuota", "llave"] as const
export type MotivoDePausa = (typeof MOTIVOS_DE_PAUSA)[number]

export function esProveedorConPausa(valor: string): valor is ProveedorConPausa {
  return (PROVEEDORES_CON_PAUSA as readonly string[]).includes(valor)
}

export function esMotivoDePausa(valor: string): valor is MotivoDePausa {
  return (MOTIVOS_DE_PAUSA as readonly string[]).includes(valor)
}

/** What the piece or the screen says while the provider is paused (decision 3). The screens match on these exact texts. */
export const TEXTO_PAUSA: Record<ProveedorConPausa, string> = {
  elevenlabs: "Tu voz está en pausa. Ya le avisamos a WAV.",
  heygen: "Tu video está en pausa. Ya le avisamos a WAV.",
  claude: "Las ideas y los guiones están en pausa. Ya le avisamos a WAV.",
  voyage: "La Biblioteca está en pausa. Ya le avisamos a WAV.",
}

/** Coni's one notice when the pause closes (decision 5). */
export const TEXTO_PAUSA_CERRADA: Record<ProveedorConPausa, string> = {
  elevenlabs: "Ya puedes preparar tu voz de nuevo.",
  heygen: "Ya puedes grabar tus videos de nuevo.",
  claude: "Las ideas y los guiones funcionan de nuevo.",
  voyage: "La Biblioteca funciona de nuevo.",
}

/** A material meets several providers (amendment A6): a pause met while processing it says the Biblioteca text. */
export const TEXTO_PAUSA_DE_BIBLIOTECA = TEXTO_PAUSA.voyage

const LARGO_DEL_DETALLE = 400

/**
 * A provider refused for payment, quota or key: retrying does not help and WAV owns the fix. The message is Coni's
 * text; `detalle` is WAV's (already redacted by the client that built it).
 */
export class PausaDeProveedor extends Falla {
  readonly detalle: string
  constructor(
    readonly proveedor: ProveedorConPausa,
    readonly motivo: MotivoDePausa,
    detalle: string,
    /** The status the provider answered; null when the pause comes from a finished job (a failed render). */
    readonly http: number | null,
  ) {
    super(TEXTO_PAUSA[proveedor])
    this.name = "PausaDeProveedor"
    this.detalle = detalle.slice(0, LARGO_DEL_DETALLE)
  }
}

/** The provider whose pause text this is, or null: a piece keeps the text after the pause closes. */
export function proveedorDelTextoDePausa(texto: string | null): ProveedorConPausa | null {
  if (texto === null) return null
  return PROVEEDORES_CON_PAUSA.find((proveedor) => TEXTO_PAUSA[proveedor] === texto) ?? null
}

export function esTextoDePausa(texto: string | null): boolean {
  return proveedorDelTextoDePausa(texto) !== null || texto === TEXTO_PAUSA_DE_BIBLIOTECA
}

export function textoDePausa(abiertas: readonly ProveedorConPausa[], proveedor: ProveedorConPausa): string | null {
  return abiertas.includes(proveedor) ? TEXTO_PAUSA[proveedor] : null
}

/**
 * The Biblioteca's buttons close only for Claude (amendment A6): a Voyage pause leaves the embeddings to maintenance
 * and disables nothing for Coni.
 */
export function textoDePausaDeBiblioteca(abiertas: readonly ProveedorConPausa[]): string | null {
  return abiertas.includes("claude") ? TEXTO_PAUSA_DE_BIBLIOTECA : null
}
```

- [ ] **Step 4: Run it green**

Run: `pnpm exec vitest run tests/unit/pausas.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/pausas.ts tests/unit/pausas.test.ts
git commit -m "Add the provider pause error and its texts

Part of #96.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: no retries for a pause

**Files:**
- Modify: `lib/produccion/reintentos.ts`
- Test: `tests/unit/reintentos.test.ts`

- [ ] **Step 1: Add the failing test** (inside the existing `describe`, plus the import `import { PausaDeProveedor } from "@/lib/dominio/pausas"`)

```ts
  it("skips the retries of a provider pause, which only WAV can fix", () => {
    expect(decisionDeReintento(new PausaDeProveedor("heygen", "cuota", "HeyGen respondió HTTP 402", 402))).toEqual({
      skipRetrying: true,
    })
  })
```

- [ ] **Step 2: Run it red**

Run: `pnpm exec vitest run tests/unit/reintentos.test.ts`
Expected: FAIL, received `undefined` (a pause is a Falla, which keeps the retry policy).

- [ ] **Step 3: Implement**

```ts
// lib/produccion/reintentos.ts (whole file)
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { PausaDeProveedor } from "@/lib/dominio/pausas"
import { RechazoDeClaude, RespuestaCortada } from "@/lib/proveedores/anthropic"

/**
 * What the task's `catchError` hook answers to Trigger.dev. A configuration problem, a provider pause (payment, quota
 * or key), a refusal from Claude and an answer cut at `max_tokens` will not fix themselves between attempts (and each
 * attempt costs money), so they fail the run at once; every other error keeps the retry policy of the config.
 * The hook must return this: a throw inside `catchError` is reported as an internal error and may still be retried.
 */
export function decisionDeReintento(error: unknown): { skipRetrying: true } | undefined {
  const definitivo =
    error instanceof FallaDeConfiguracion ||
    error instanceof PausaDeProveedor ||
    error instanceof RechazoDeClaude ||
    error instanceof RespuestaCortada
  return definitivo ? { skipRetrying: true } : undefined
}
```

- [ ] **Step 4: Run it green**

Run: `pnpm exec vitest run tests/unit/reintentos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** `git add lib/produccion/reintentos.ts tests/unit/reintentos.test.ts`, message `Skip the retries of a provider pause` + footer.

### Task 3: ElevenLabs classifies payment, quota and key

**Files:**
- Modify: `lib/proveedores/elevenlabs.ts` (`TEXTO_SIN_CARACTERES` :19, `SinCaracteres` :36, `rechazoSinCobro` :76, `esFaltaDeCaracteres` :101, `generarVoz` :146, `transcribir` :336)
- Test: `tests/unit/elevenlabs.test.ts` (block "generarVoz sin caracteres" :178, `it.each([400, 401, ...])` :214, transcription tests)
- Test (update only): `tests/integration/grabar-voz.test.ts:215-224` and `:294`

`SinCaracteres` and `TEXTO_SIN_CARACTERES` go away: a lack of characters is now a `cuota` pause (the old text asked Coni to top up; WAV owns that now).

- [ ] **Step 1: Replace the "sin caracteres" block and add the new cases in `tests/unit/elevenlabs.test.ts`**

Remove `SinCaracteres` from the import list and add `import { PausaDeProveedor } from "@/lib/dominio/pausas"`. Replace the whole `describe("generarVoz sin caracteres", ...)` block with:

```ts
describe("generarVoz pausa a ElevenLabs", () => {
  function contestar(cuerpo: unknown, estado: number) {
    servidor.use(http.post(`${BASE}/v1/text-to-speech/:voz`, () => HttpResponse.json(cuerpo, { status: estado })))
  }

  it("pauses for payment on the 2026-10-17 answer (401 payment_issue)", async () => {
    contestar(
      { detail: { status: "payment_issue", message: "You have an unpaid invoice. Please pay it to continue." } },
      401,
    )
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: BASE }))
    expect(error).toBeInstanceOf(PausaDeProveedor)
    expect(error).toMatchObject({ proveedor: "elevenlabs", motivo: "pago", http: 401 })
    expect(error.message).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")
    expect((error as PausaDeProveedor).detalle).toContain("payment_issue")
    expect(rechazoSinCobro(error)).toBe(true)
  })

  it("pauses for quota on quota_exceeded", async () => {
    contestar({ detail: { status: "quota_exceeded", message: "This request exceeds your quota." } }, 401)
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: BASE }))
    expect(error).toMatchObject({ proveedor: "elevenlabs", motivo: "cuota", http: 401 })
  })

  it("pauses for quota on 402 insufficient_credits, refused without charge", async () => {
    contestar({ detail: { type: "payment_required", code: "insufficient_credits", message: "Not enough credits." } }, 402)
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: BASE }))
    expect(error).toMatchObject({ proveedor: "elevenlabs", motivo: "cuota", http: 402 })
    expect(rechazoSinCobro(error)).toBe(true)
  })

  it("pauses for the key on any other 401, and never puts the key in the detail", async () => {
    contestar({ detail: { status: "invalid_api_key", message: `Invalid API key: ${CLAVE}` } }, 401)
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: BASE }))
    expect(error).toMatchObject({ proveedor: "elevenlabs", motivo: "llave", http: 401 })
    expect((error as PausaDeProveedor).detalle).not.toContain(CLAVE)
  })

  it("does not pause on a 500 or a 403", async () => {
    contestar({ detail: "upstream" }, 500)
    expect(await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: BASE }))).not.toBeInstanceOf(
      PausaDeProveedor,
    )
    contestar({ detail: "forbidden" }, 403)
    expect(await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: BASE }))).toBeInstanceOf(
      RechazoDeElevenlabs,
    )
  })
})
```

In `describe("generarVoz dice qué respondió ElevenLabs")` change `it.each([400, 401, 402, 403, 404, 409, 422])` to `it.each([400, 402, 403, 404, 409, 422])` (a bare 402 `{"detail":"No se puede"}` is still a refusal: the spec pauses on the codes, not on the status).

Add to the transcription tests:

```ts
  it("pauses ElevenLabs when a transcription meets payment_issue", async () => {
    servidor.use(
      http.post(`${BASE}/v1/speech-to-text`, () =>
        HttpResponse.json({ detail: { status: "payment_issue", message: "Unpaid invoice." } }, { status: 401 }),
      ),
    )
    const error = await rechazo(transcribir({ clave: CLAVE, audio: AUDIO, tipo: "audio/mpeg", base: BASE }))
    expect(error).toMatchObject({ proveedor: "elevenlabs", motivo: "pago" })
  })
```

- [ ] **Step 2: Run it red**

Run: `pnpm exec vitest run tests/unit/elevenlabs.test.ts`
Expected: FAIL in the new block (a `SinCaracteres`/`RechazoDeElevenlabs` arrives instead of `PausaDeProveedor`).

- [ ] **Step 3: Implement in `lib/proveedores/elevenlabs.ts`**

Delete `TEXTO_SIN_CARACTERES`, the class `SinCaracteres` and `esFaltaDeCaracteres`. Add the import `import { PausaDeProveedor } from "@/lib/dominio/pausas"` and remove `Falla` from the falla import if nothing else uses it. Add:

```ts
/**
 * Spec 2026-11-07, decision 1: payment, quota and key failures pause ElevenLabs. `quota_exceeded` is the older answer;
 * the error catalogue now names 402 `insufficient_credits`; 401 `payment_issue` is the unpaid invoice of 2026-10-17.
 * Null for anything else, which keeps today's path. `cuerpo` is already redacted.
 */
export function pausaDeElevenlabs(estado: number, cuerpo: string): PausaDeProveedor | null {
  const detalle = `ElevenLabs respondió HTTP ${estado}: ${mensajeErrorElevenlabs(cuerpo)}`
  if (/payment_issue/i.test(cuerpo)) return new PausaDeProveedor("elevenlabs", "pago", detalle, estado)
  if (/quota_exceeded|insufficient_credits/i.test(cuerpo)) {
    return new PausaDeProveedor("elevenlabs", "cuota", detalle, estado)
  }
  if (estado === 401) return new PausaDeProveedor("elevenlabs", "llave", detalle, estado)
  return null
}
```

`rechazoSinCobro` becomes:

```ts
export function rechazoSinCobro(error: unknown): boolean {
  const http =
    error instanceof RechazoDeElevenlabs || error instanceof FallaPasajeraDeElevenlabs
      ? error.http
      : error instanceof PausaDeProveedor && error.proveedor === "elevenlabs"
        ? error.http
        : null
  return http !== null && http >= 400 && http < 500
}
```

In `generarVoz`, the `!respuesta.ok` branch becomes:

```ts
      if (!respuesta.ok) {
        const cuerpo = sinLlave(await respuesta.text(), clave)
        const pausa = pausaDeElevenlabs(respuesta.status, cuerpo)
        if (pausa) throw pausa
        const mensaje = `ElevenLabs respondió HTTP ${respuesta.status}: ${mensajeErrorElevenlabs(cuerpo)}`
        throw esErrorDeConfiguracion(respuesta.status)
          ? new RechazoDeElevenlabs(mensaje, respuesta.status)
          : new FallaPasajeraDeElevenlabs(mensaje, respuesta.status)
      }
```

In `transcribir`, the `!respuesta.ok` branch becomes:

```ts
      if (!respuesta.ok) {
        const cuerpo = sinLlave(await respuesta.text(), clave)
        const pausa = pausaDeElevenlabs(respuesta.status, cuerpo)
        if (pausa) throw pausa
        const mensaje = `ElevenLabs respondió HTTP ${respuesta.status}: ${mensajeErrorElevenlabs(cuerpo)}`
        throw esErrorDeConfiguracion(respuesta.status) ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
      }
```

(`motivoDelError` stays for `verificarVoz`.) Update the doc comment of `rechazoSinCobro` to say a pause of ElevenLabs is a 4xx refusal too.

- [ ] **Step 4: Update the two integration tests that asserted the old text**

In `tests/integration/grabar-voz.test.ts:224` replace `expect(despues.explicacion).toMatch(/^ElevenLabs no tiene caracteres suficientes/)` with `expect(despues.explicacion).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")`; in the `:294` test keep its gasto assertions and change any text assertion the same way.

- [ ] **Step 5: Run green**

Run: `pnpm exec vitest run tests/unit/elevenlabs.test.ts && pnpm test:db tests/integration/grabar-voz.test.ts`
Expected: PASS. `pnpm type` passes (no leftover `SinCaracteres` import: `grep -rn "SinCaracteres\|TEXTO_SIN_CARACTERES" lib app tests` prints nothing).

- [ ] **Step 6: Commit** the three files, message `Classify ElevenLabs payment, quota and key failures as pauses` + footer.

### Task 4: HeyGen classifies 402 and 401, and a render failed for credits

**Files:**
- Modify: `lib/proveedores/heygen-api.ts:39-65` (`TEXTO_SIN_CREDITOS`, `errorDeRespuesta`)
- Modify: `lib/produccion/grabar.ts:41-46,103-111,448-451`
- Test: `tests/unit/heygen-api.test.ts:220-236`, `tests/integration/grabar.test.ts:885-925` (update)

- [ ] **Step 1: Update the unit tests**

Replace `it.each([401, 403])("fails as a configuration error on HTTP %i", ...)` and the "no credits on HTTP 402" test with:

```ts
  it("pauses HeyGen for the key on HTTP 401", async () => {
    capturando(errorDeHeygen("unauthorized", "No autorizado", 401))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(error).toBeInstanceOf(PausaDeProveedor)
    expect(error).toMatchObject({ proveedor: "heygen", motivo: "llave", http: 401 })
    expect((error as PausaDeProveedor).detalle).toBe("HeyGen respondió HTTP 401: No autorizado")
  })

  it("fails as a configuration error on HTTP 403", async () => {
    capturando(errorDeHeygen("forbidden", "No autorizado", 403))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
  })

  it.each(["insufficient_credit", "usage_limit_reached", "subscription_required"])(
    "pauses HeyGen for quota on HTTP 402 %s",
    async (codigo) => {
      capturando(errorDeHeygen(codigo, "Your account has 5 credits but this video requires 10", 402))
      const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
      expect(error).toMatchObject({ proveedor: "heygen", motivo: "cuota", http: 402 })
      expect(error.message).toBe("Tu video está en pausa. Ya le avisamos a WAV.")
    },
  )

  it("still answers a content policy refusal before anything else", async () => {
    capturando(errorDeHeygen("content_policy_violation", "No", 400))
    expect(await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))).toBeInstanceOf(PoliticaDeContenido)
  })
```

Add `import { PausaDeProveedor } from "@/lib/dominio/pausas"`.

In `tests/integration/grabar.test.ts`, the two tests that expected «HeyGen no tiene créditos...» now expect `explicacion: "Tu video está en pausa. Ya le avisamos a WAV."` (both the failed render with `insufficient_credit` and the 402 on create), and the test "rethrows a configuration error from HeyGen and leaves the piece where it was" changes its simulated 401 to a 403 (`{ code: "forbidden" }`) so it keeps testing a configuration error. Add one test:

```ts
  it("ends the attempt with the video pause text when HeyGen answers 401", async () => {
    const id = await crearPiezaEnRender()
    simular({ crear: () => HttpResponse.json({ error: { code: "unauthorized", message: "Invalid key" } }, { status: 401 }) })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "falla_produccion" })
    expect(await pieza(id)).toMatchObject({ estado: "error_produccion", explicacion: "Tu video está en pausa. Ya le avisamos a WAV." })
    expect((await gastos(id))[0]).toMatchObject({ estado: "liberado" })
  })
```

- [ ] **Step 2: Run red**

Run: `pnpm exec vitest run tests/unit/heygen-api.test.ts && pnpm test:db tests/integration/grabar.test.ts`
Expected: FAIL on the new expectations.

- [ ] **Step 3: Implement**

`lib/proveedores/heygen-api.ts`: delete `TEXTO_SIN_CREDITOS`; import `PausaDeProveedor`; `errorDeRespuesta` becomes:

```ts
async function errorDeRespuesta(respuesta: Response, clave: string): Promise<Error> {
  // Redacted before parsing and capping: a key cut in half by the 400-character cap would leak a prefix.
  const cuerpo = sinLlave(await respuesta.text(), clave)
  const { status } = respuesta
  const mensaje = `HeyGen respondió HTTP ${status}: ${mensajeErrorHeygen(cuerpo)}`
  if (codigoErrorHeygen(cuerpo) === CODIGO_POLITICA) return new PoliticaDeContenido()
  // Spec 2026-11-07, decision 1. Every 402 code (https://developers.heygen.com/docs/error-codes.md) needs money or a
  // plan change from WAV; 401 is the key.
  if (status === 402) return new PausaDeProveedor("heygen", "cuota", mensaje, status)
  if (status === 401) return new PausaDeProveedor("heygen", "llave", mensaje, status)
  const definitivo = status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429
  return definitivo ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
}
```

Remove `Falla` from its import if unused. `lib/produccion/grabar.ts`: drop `TEXTO_SIN_CREDITOS` from the import, import `PausaDeProveedor` from `@/lib/dominio/pausas`; `explicacionDeFalla` loses its first line:

```ts
function explicacionDeFalla(codigo: string): string {
  const detalle = codigo === "desconocido" ? "" : ` (${codigo})`
  return `${TEXTO_FALLA_DE_HEYGEN}${detalle}. Vuelve a intentarlo en unos minutos.`
}
```

and the `fallido` case of `avanzar` becomes:

```ts
    case "fallido":
      if (enRender && video.fallo.codigo === CODIGO_POLITICA) return rechazarPorPolitica(contexto)
      // Plan amendment A4: a render that failed for credits is the same pause as a 402 on create.
      if (esFallaPorCreditos(video.fallo.codigo)) {
        throw new PausaDeProveedor(
          "heygen",
          "cuota",
          `HeyGen no terminó el video ${videoId}: ${video.fallo.codigo} · ${video.fallo.mensaje}`,
          null,
        )
      }
      return fallar(contexto, explicacionDeFalla(video.fallo.codigo))
```

The pause is a Falla, so the existing `catch` of `grabarPieza` already ends the attempt with `fallar(contexto, error.message)` (the pause text); Task 12 adds the opening of the pause there.

- [ ] **Step 4: Run green** (same command). `grep -rn "TEXTO_SIN_CREDITOS" lib app tests` prints nothing; `pnpm type` passes.

- [ ] **Step 5: Commit** the four files, message `Classify HeyGen 402 and 401 and credit-failed renders as pauses` + footer.

### Task 5: Claude classifies 401, 402, 403 and «credit balance is too low»

**Files:**
- Modify: `lib/proveedores/anthropic/nucleo.ts:98-114` (`traducirError`), export it as `traducirErrorDeClaude`
- Modify: `lib/proveedores/anthropic.ts` (re-export)
- Test: `tests/unit/anthropic.test.ts:440-450`

- [ ] **Step 1: Update the unit tests**

Replace `it.each([401, 403, 404, 400])("fails as a configuration error, without the key, on HTTP %i", ...)` with:

```ts
  it.each([
    [401, "authentication_error", "invalid x-api-key", "llave"],
    [403, "permission_error", "no permission", "llave"],
    [402, "billing_error", "There is an issue with your billing", "pago"],
    [
      400,
      "invalid_request_error",
      "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
      "cuota",
    ],
  ])("pauses Claude on HTTP %i %s", async (estado, tipo, mensaje, motivo) => {
    respondiendo(() => HttpResponse.json({ type: "error", error: { type: tipo, message: mensaje } }, { status: estado }))
    const error = await rechazo(escribir())
    expect(error).toBeInstanceOf(PausaDeProveedor)
    expect(error).toMatchObject({ proveedor: "claude", motivo, http: estado })
    expect(error.message).toBe("Las ideas y los guiones están en pausa. Ya le avisamos a WAV.")
    expect((error as PausaDeProveedor).detalle).not.toContain(CLAVE)
  })

  it.each([404, 400])("fails as a configuration error, without the key, on any other HTTP %i", async (estado) => {
    respondiendo(() =>
      HttpResponse.json({ type: "error", error: { type: "invalid_request_error", message: "no" } }, { status: estado }),
    )
    const error = await rechazo(escribir())
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toContain(`HTTP ${estado}`)
    expect(error.message).not.toContain(CLAVE)
  })
```

Add `import { PausaDeProveedor } from "@/lib/dominio/pausas"`. Run `grep -rn "Anthropic rechazó la llave" tests` and update any other assertion it finds to expect the pause.

- [ ] **Step 2: Run red**: `pnpm exec vitest run tests/unit/anthropic.test.ts` → FAIL (a `FallaDeConfiguracion` arrives).

- [ ] **Step 3: Implement** in `nucleo.ts`:

```ts
// https://platform.claude.com/docs/en/api/errors: an empty prepaid balance comes back as 400 invalid_request_error
// with this sentence, not as 402.
const SIN_SALDO = /credit balance is too low/i

/**
 * Typed SDK errors only: a key or request the API rejects will not change on retry, anything else will. Payment, quota
 * and key failures pause Claude (spec 2026-11-07, decision 1; 402 is plan amendment A2). Exported for the closing
 * check of the maintenance task, which must classify the same way.
 */
export function traducirErrorDeClaude(error: unknown, modelo: ModeloClaude): unknown {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new PausaDeProveedor("claude", "llave", `Anthropic rechazó la llave o no le da permiso (HTTP ${error.status}).`, error.status)
  }
  if (error instanceof Anthropic.APIError && error.status === 402) {
    return new PausaDeProveedor("claude", "pago", `Anthropic respondió HTTP 402: ${error.message}`, 402)
  }
  if (error instanceof Anthropic.BadRequestError && SIN_SALDO.test(error.message)) {
    return new PausaDeProveedor("claude", "cuota", `Anthropic respondió HTTP 400: ${error.message}`, 400)
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new FallaDeConfiguracion(`Anthropic no encontró el modelo ${modelo} para esta cuenta (HTTP ${error.status}).`)
  }
  if (error instanceof Anthropic.APIError && esRechazoDelPedido(error.status)) {
    return new FallaDeConfiguracion(`Anthropic rechazó el pedido (HTTP ${error.status}): ${error.message}`)
  }
  // Rate limits, 5xx, overload and connection failures keep their SDK class: plain errors Trigger.dev retries.
  return error
}
```

Rename the call site in `pedirJson` (`throw traducirErrorDeClaude(error, config.modelo)`), import `PausaDeProveedor`, and add `traducirErrorDeClaude` to the existing `export { ... } from "./anthropic/nucleo"` block of `lib/proveedores/anthropic.ts`. The SDK error message never carries the key (the existing tests already check that); keep the `not.toContain(CLAVE)` expectation.

- [ ] **Step 4: Run green**: same command; then `pnpm exec vitest run tests/unit/anthropic-*.test.ts` (the sibling clients use `pedirJson`).

- [ ] **Step 5: Commit** `nucleo.ts`, `anthropic.ts`, the test; message `Classify Claude payment, quota and key failures as pauses` + footer.

### Task 6: Voyage classifies 401, 402, 403

**Files:**
- Modify: `lib/proveedores/voyage.ts:51-55`
- Test: `tests/unit/voyage.test.ts`

- [ ] **Step 1: Add the failing tests**

```ts
  it.each([
    [401, "llave"],
    [402, "pago"],
    [403, "llave"],
  ])("pauses Voyage on HTTP %i", async (estado, motivo) => {
    servidor.use(http.post("https://api.voyageai.com/v1/embeddings", () => new HttpResponse(`no ${CLAVE}`, { status: estado })))
    const error = await embeber({ clave: CLAVE, textos: ["hola"], tipo: "document" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PausaDeProveedor)
    expect(error).toMatchObject({ proveedor: "voyage", motivo, http: estado })
    expect((error as PausaDeProveedor).detalle).not.toContain(CLAVE)
  })
```

(Use the file's existing key constant and MSW imports; add `import { PausaDeProveedor } from "@/lib/dominio/pausas"`. If the file's existing 401/403 configuration-error tests exist, narrow them to 400 and 422.)

- [ ] **Step 2: Run red**: `pnpm exec vitest run tests/unit/voyage.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
  if (!respuesta.ok) {
    const detalle = sinLlave(await respuesta.text(), clave).slice(0, 300)
    const mensaje = `Voyage respondió HTTP ${respuesta.status}: ${detalle || "sin detalle"}`
    // Spec 2026-11-07, decision 1 (402 kept although https://docs.voyageai.com/docs/error-codes lists none, plan A3).
    if (respuesta.status === 402) throw new PausaDeProveedor("voyage", "pago", mensaje, 402)
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new PausaDeProveedor("voyage", "llave", mensaje, respuesta.status)
    }
    throw esErrorDeConfiguracion(respuesta.status) ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
  }
```

- [ ] **Step 4: Run green**, then `pnpm test:run` (the whole unit suite) and `pnpm type`.

- [ ] **Step 5: Commit** message `Classify Voyage payment and key failures as pauses` + footer.

### Checkpoint, lote 1

- [ ] `pnpm test:run`, `pnpm type`, `pnpm lint` all green; `pnpm test:db tests/integration/grabar.test.ts tests/integration/grabar-voz.test.ts tests/integration/fallas.test.ts` green.
- [ ] `grep -rn $'\xe2\x80\x94' lib/dominio/pausas.ts lib/proveedores lib/produccion/grabar.ts` prints nothing new.
- [ ] Batch review of lote 1 (`superpowers:requesting-code-review` over the six commits). Amendments A1 to A10 are already approved (2026-11-07); no wait before lote 2.

---

# Lote 2: the stored pause (3 tasks)

### Task 7: migration, notice kind and types

**Files:**
- Create: `supabase/migrations/20261107000100_pausas_de_proveedor.sql`
- Modify: `lib/avisos/tipos.ts` (`TIPOS_DE_AVISO`, `CUERPO_DE_PUSH`)
- Modify (generated): `lib/supabase/database.types.ts`
- Test: `tests/integration/pausas-esquema.test.ts` (new), `tests/unit/avisos.test.ts`

The notice kind goes in the same commit as the migration: `presupuesto-esquema.test.ts` and `datos-personales-esquema.test.ts` compare the constraint with `TIPOS_DE_AVISO`.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/pausas-esquema.test.ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { comoConi, comoMantenedor, comoOtra, comoServicio, como, fallaCon, pool } from "./db"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
})

async function abrir(proveedor: string, motivo = "pago", detalle = "HTTP 401 payment_issue") {
  const { rows } = await pool.query<{ pausa_id: string; nueva: boolean; avisar: boolean }>(
    "select * from public.abrir_pausa_de_proveedor($1, $2, $3)",
    [proveedor, motivo, detalle],
  )
  const fila = rows[0]
  if (!fila) throw new Error("abrir_pausa_de_proveedor no devolvió nada")
  return fila
}

describe("pausas_de_proveedor", () => {
  it("opens once per provider and keeps an open pause as it is", async () => {
    const primera = await abrir("elevenlabs", "pago", "primera")
    const segunda = await abrir("elevenlabs", "llave", "segunda")
    expect(primera).toMatchObject({ nueva: true, avisar: true })
    expect(segunda).toEqual({ pausa_id: primera.pausa_id, nueva: false, avisar: true })
    const { rows } = await pool.query("select motivo, detalle from public.pausas_de_proveedor")
    expect(rows).toEqual([{ motivo: "pago", detalle: "primera" }])
  })

  it("stops asking to email WAV once the pause is marked as told", async () => {
    const { pausa_id } = await abrir("heygen", "cuota")
    await pool.query("select public.marcar_pausa_avisada($1)", [pausa_id])
    expect(await abrir("heygen", "cuota")).toMatchObject({ nueva: false, avisar: false })
  })

  it("opens a new pause after the previous one closed", async () => {
    const { pausa_id } = await abrir("claude", "cuota")
    const { rows } = await pool.query<{ cerrada: boolean }>("select public.cerrar_pausa_de_proveedor($1) as cerrada", [pausa_id])
    expect(rows[0]?.cerrada).toBe(true)
    const otra = await pool.query<{ cerrada: boolean }>("select public.cerrar_pausa_de_proveedor($1) as cerrada", [pausa_id])
    expect(otra.rows[0]?.cerrada).toBe(false)
    expect((await abrir("claude", "cuota")).nueva).toBe(true)
  })

  it("caps the detail at 400 characters and refuses an unknown provider or reason", async () => {
    await abrir("voyage", "llave", "x".repeat(900))
    const { rows } = await pool.query<{ largo: number }>("select char_length(detalle) as largo from public.pausas_de_proveedor")
    expect(rows[0]?.largo).toBe(400)
    await como(comoServicio, async (c) => {
      expect((await fallaCon(c, "select public.abrir_pausa_de_proveedor('meta', 'pago', 'x')")).code).toBe("23514")
      expect((await fallaCon(c, "select public.abrir_pausa_de_proveedor('voyage', 'otro', 'x')")).code).toBe("23514")
    })
  })

  it("lets Coni and the maintainer read, and nobody but service_role write", async () => {
    await abrir("elevenlabs")
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        expect((await c.query("select proveedor from public.pausas_de_proveedor")).rows).toEqual([{ proveedor: "elevenlabs" }])
        expect((await fallaCon(c, "update public.pausas_de_proveedor set cerrada_en = now()")).code).toBe("42501")
        expect((await fallaCon(c, "select public.abrir_pausa_de_proveedor('heygen', 'pago', 'x')")).code).toBe("42501")
        expect((await fallaCon(c, "select public.cerrar_pausa_de_proveedor(gen_random_uuid())")).code).toBe("42501")
      })
    }
    await como(comoOtra, async (c) => {
      expect((await c.query("select * from public.pausas_de_proveedor")).rows).toEqual([])
    })
  })

  it("accepts the pausa_cerrada notice kind", async () => {
    await pool.query("insert into public.avisos (tipo, clave, mensaje) values ('pausa_cerrada', 'pausa:prueba', 'x')")
    await pool.query("delete from public.avisos where clave = 'pausa:prueba'")
  })
})
```

Add to `tests/unit/avisos.test.ts`:

```ts
  it("words the closed pause notice for a lock screen and opens Inicio", () => {
    expect(esTipoDeAviso("pausa_cerrada")).toBe(true)
    expect(mensajePush({ tipo: "pausa_cerrada" })).toEqual({
      titulo: TITULO_DE_PUSH,
      cuerpo: "Ya puedes seguir con lo que estaba en pausa",
      url: "/",
    })
  })
```

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/pausas-esquema.test.ts` → FAIL (relation does not exist); `pnpm exec vitest run tests/unit/avisos.test.ts` → FAIL.

- [ ] **Step 3: Write the migration**

```sql
-- Provider pauses (spec 2026-11-07, decisions 2 and 5; `avisada_en` is plan amendment A1). Additive: one table, its
-- index, its functions and one more notice kind. No existing row changes.

create table public.pausas_de_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null check (proveedor in ('elevenlabs', 'heygen', 'claude', 'voyage')),
  motivo text not null check (motivo in ('pago', 'cuota', 'llave')),
  -- Technical, for WAV: what the provider answered, already redacted by the client.
  detalle text not null check (char_length(detalle) <= 400),
  desde timestamptz not null default now(),
  -- When WAV's email went out; null means the next caller sends it again.
  avisada_en timestamptz,
  cerrada_en timestamptz,
  constraint pausa_cerrada_despues check (cerrada_en is null or cerrada_en >= desde)
);

-- At most one open pause per provider.
create unique index pausas_de_proveedor_una_abierta on public.pausas_de_proveedor (proveedor) where cerrada_en is null;

alter table public.pausas_de_proveedor enable row level security;
revoke all on public.pausas_de_proveedor from anon, authenticated, service_role;
grant select on public.pausas_de_proveedor to authenticated, service_role;
create policy "coni y wav leen pausas" on public.pausas_de_proveedor for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create trigger auditar after insert or update or delete on public.pausas_de_proveedor
  for each row execute function public.registrar_evento();

-- Opens the provider's pause, or answers the open one as it is. `avisar` says WAV has not been emailed yet.
create function public.abrir_pausa_de_proveedor(p_proveedor text, p_motivo text, p_detalle text)
returns table (pausa_id uuid, nueva boolean, avisar boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.pausas_de_proveedor (proveedor, motivo, detalle)
  values (p_proveedor, p_motivo, left(p_detalle, 400))
  on conflict (proveedor) where cerrada_en is null do nothing
  returning public.pausas_de_proveedor.id into v_id;
  if v_id is not null then
    return query select v_id, true, true;
    return;
  end if;
  return query
    select p.id, false, p.avisada_en is null
      from public.pausas_de_proveedor p
     where p.proveedor = p_proveedor and p.cerrada_en is null;
end;
$$;

create function public.marcar_pausa_avisada(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.pausas_de_proveedor set avisada_en = now() where id = p_id and avisada_en is null;
$$;

-- True only for the call that closed it, so a second closing run cannot notify twice.
create function public.cerrar_pausa_de_proveedor(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  cerradas int;
begin
  update public.pausas_de_proveedor set cerrada_en = now() where id = p_id and cerrada_en is null;
  get diagnostics cerradas = row_count;
  return cerradas = 1;
end;
$$;

revoke execute on function public.abrir_pausa_de_proveedor(text, text, text) from public, anon, authenticated;
revoke execute on function public.marcar_pausa_avisada(uuid) from public, anon, authenticated;
revoke execute on function public.cerrar_pausa_de_proveedor(uuid) from public, anon, authenticated;
grant execute on function public.abrir_pausa_de_proveedor(text, text, text) to service_role;
grant execute on function public.marcar_pausa_avisada(uuid) to service_role;
grant execute on function public.cerrar_pausa_de_proveedor(uuid) to service_role;

-- `pausa_cerrada`: a provider pause closed (decision 5). The full list (20261105000200_angulos_de_pilar.sql plus this
-- type); presupuesto-esquema.test.ts and datos-personales-esquema.test.ts check it equals TIPOS_DE_AVISO.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer', 'revision_de_inventario',
  'limite_alcanzado', 'equilibrio_de_angulo', 'pausa_cerrada'
));
```

Before writing it, open `supabase/migrations/*` for the latest definition of `avisos_tipo_check` (`grep -ln avisos_tipo_check supabase/migrations | sort | tail -1`) and confirm the list above is that list plus `pausa_cerrada`. Confirm `public.registrar_evento()` is generic (it is attached to `pilar_angulos` in `20261105000200_angulos_de_pilar.sql`); if it needs a per-table mapping, add the mapping in this migration.

In `lib/avisos/tipos.ts` add `"pausa_cerrada"` at the end of `TIPOS_DE_AVISO` and `pausa_cerrada: "Ya puedes seguir con lo que estaba en pausa",` to `CUERPO_DE_PUSH` (`rutaDeAviso` already answers `/` without a piece).

- [ ] **Step 4: Apply and regenerate**

Run: `pnpm db:reset && pnpm db:types`
Expected: the reset applies the new migration; `lib/supabase/database.types.ts` gains `pausas_de_proveedor` and the three functions.

- [ ] **Step 5: Run green**: `pnpm test:db tests/integration/pausas-esquema.test.ts tests/integration/presupuesto-esquema.test.ts tests/integration/datos-personales-esquema.test.ts && pnpm exec vitest run tests/unit/avisos.test.ts && pnpm type`

- [ ] **Step 6: Commit** the migration, `tipos.ts`, `database.types.ts` and both tests; message `Store provider pauses with one open pause per provider` + footer.

### Task 8: reading pauses and refusing while paused

**Files:**
- Create: `lib/datos/pausas.ts`
- Test: `tests/integration/pausas-datos.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/pausas-datos.test.ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { exigirBibliotecaSinPausa, exigirSinPausa, leerPausasAbiertas, leerPausasParaCerrar } from "@/lib/datos/pausas"
import { Falla } from "@/lib/dominio/falla"
import { pool } from "./db"
import { clienteDeConi } from "./sesiones"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
})

describe("lecturas de pausas", () => {
  it("reads the open pauses with Coni's session and ignores closed ones", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('heygen', 'cuota', 'x')")
    const { rows } = await pool.query<{ pausa_id: string }>("select pausa_id from public.abrir_pausa_de_proveedor('claude', 'cuota', 'x')")
    await pool.query("select public.cerrar_pausa_de_proveedor($1)", [rows[0]?.pausa_id])
    expect(await leerPausasAbiertas(await clienteDeConi())).toEqual(["heygen"])
  })

  it("refuses an action with the provider's text while it is paused", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('elevenlabs', 'pago', 'x')")
    const db = await clienteDeConi()
    const error = await exigirSinPausa(db, "elevenlabs").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Falla)
    expect((error as Falla).message).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")
    await expect(exigirSinPausa(db, "heygen")).resolves.toBeUndefined()
  })

  it("refuses the Biblioteca while Claude is paused, never for a Voyage pause", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('voyage', 'llave', 'x')")
    const db = await clienteDeConi()
    await expect(exigirBibliotecaSinPausa(db)).resolves.toBeUndefined()
    await pool.query("select public.abrir_pausa_de_proveedor('claude', 'cuota', 'x')")
    const error = await exigirBibliotecaSinPausa(db).catch((e: unknown) => e)
    expect((error as Falla).message).toBe("La Biblioteca está en pausa. Ya le avisamos a WAV.")
  })

  it("lists what the maintenance step has to check", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('claude', 'cuota', 'x')")
    expect(await leerPausasParaCerrar(clienteDeServicio())).toMatchObject([{ proveedor: "claude", motivo: "cuota" }])
  })
})
```

Use whatever helper the integration suite already has for a Coni-session client (`grep -rn "export async function cliente" tests/integration/*.ts`); if the helper has another name, use it and keep the test identical otherwise.

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/pausas-datos.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/datos/pausas.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { Falla } from "@/lib/dominio/falla"
import {
  esMotivoDePausa,
  esProveedorConPausa,
  type MotivoDePausa,
  type ProveedorConPausa,
  TEXTO_PAUSA,
  textoDePausaDeBiblioteca,
} from "@/lib/dominio/pausas"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function proveedorDe(valor: string): ProveedorConPausa {
  // The database constrains the column; a value outside the union means the schema and this code disagree.
  if (!esProveedorConPausa(valor)) throw new Error(`Una pausa tiene un proveedor desconocido: ${valor}.`)
  return valor
}

/** The providers paused right now. Coni's session reads them (RLS); so does `service_role`. */
export async function leerPausasAbiertas(db: Db): Promise<ProveedorConPausa[]> {
  const { data, error } = await db.from("pausas_de_proveedor").select("proveedor").is("cerrada_en", null)
  if (error) throw new Error(`No pude leer las pausas de los proveedores: ${error.message}`, { cause: error })
  return data.map((fila) => proveedorDe(fila.proveedor))
}

/** A server action refuses while one of these providers is paused: the screen she tapped may be stale. */
export async function exigirSinPausa(db: Db, ...proveedores: ProveedorConPausa[]): Promise<void> {
  const abiertas = await leerPausasAbiertas(db)
  const pausado = proveedores.find((proveedor) => abiertas.includes(proveedor))
  if (pausado) throw new Falla(TEXTO_PAUSA[pausado])
}

/** Biblioteca «Reintentar» and upload processing: only a Claude pause closes them (amendment A6). */
export async function exigirBibliotecaSinPausa(db: Db): Promise<void> {
  const texto = textoDePausaDeBiblioteca(await leerPausasAbiertas(db))
  if (texto !== null) throw new Falla(texto)
}

export interface PausaParaCerrar {
  id: string
  proveedor: ProveedorConPausa
  motivo: MotivoDePausa
}

/** For the maintenance step, with a `service_role` client. */
export async function leerPausasParaCerrar(db: Db): Promise<PausaParaCerrar[]> {
  const { data, error } = await db.from("pausas_de_proveedor").select("id, proveedor, motivo").is("cerrada_en", null)
  if (error) throw new Error(`No pude leer las pausas abiertas: ${error.message}`, { cause: error })
  return data.map((fila) => {
    if (!esMotivoDePausa(fila.motivo)) throw new Error(`La pausa ${fila.id} tiene un motivo desconocido: ${fila.motivo}.`)
    return { id: fila.id, proveedor: proveedorDe(fila.proveedor), motivo: fila.motivo }
  })
}
```

- [ ] **Step 4: Run green** (same command).

- [ ] **Step 5: Commit** message `Read open provider pauses and refuse actions while paused` + footer.

### Task 9: `abrirPausa`, one email to WAV per pause

**Files:**
- Create: `lib/pausas/abrir.ts`
- Test: `tests/integration/abrir-pausa.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/abrir-pausa.test.ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { PausaDeProveedor } from "@/lib/dominio/pausas"
import { abrirPausa } from "@/lib/pausas/abrir"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
})

const pago = () => new PausaDeProveedor("elevenlabs", "pago", "ElevenLabs respondió HTTP 401: payment_issue · unpaid", 401)

describe("abrirPausa", () => {
  it("opens the pause and emails WAV once, whatever the number of callers", async () => {
    const avisos = notificadorEnMemoria()
    const db = clienteDeServicio()
    expect(await abrirPausa({ db, avisos }, pago())).toEqual({ nueva: true })
    expect(await abrirPausa({ db, avisos }, pago())).toEqual({ nueva: false })
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.asunto).toBe("ElevenLabs en pausa: pago pendiente")
    expect(avisos.aWavEnviados[0]?.detalle).toContain("payment_issue")
    expect(avisos.aWavEnviados[0]?.detalle).toContain("elevenlabs.io/app/subscription")
    expect(avisos.aConiEnviados).toEqual([])
  })

  it("sends WAV's email again on the next call when the first one failed", async () => {
    const db = clienteDeServicio()
    const rota = { ...notificadorEnMemoria(), aWav: async () => { throw new Error("Resend no responde") } }
    await expect(abrirPausa({ db, avisos: rota }, pago())).rejects.toThrow("Resend no responde")
    const avisos = notificadorEnMemoria()
    expect(await abrirPausa({ db, avisos }, pago())).toEqual({ nueva: false })
    expect(avisos.aWavEnviados).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/abrir-pausa.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/pausas/abrir.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { MotivoDePausa, PausaDeProveedor, ProveedorConPausa } from "@/lib/dominio/pausas"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsPausa {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
}

const NOMBRE: Record<ProveedorConPausa, string> = {
  elevenlabs: "ElevenLabs",
  heygen: "HeyGen",
  claude: "Claude (Anthropic)",
  voyage: "Voyage",
}

const MOTIVO: Record<MotivoDePausa, string> = { pago: "pago pendiente", cuota: "sin saldo", llave: "llave rechazada" }

const ARREGLO: Record<ProveedorConPausa, Record<MotivoDePausa, string>> = {
  elevenlabs: {
    pago: "Paga la factura pendiente en https://elevenlabs.io/app/subscription.",
    cuota: "Recarga caracteres o sube el plan en https://elevenlabs.io/app/subscription.",
    llave: "Revisa la llave en https://elevenlabs.io/app/settings/api-keys y guárdala de nuevo en Ajustes de Conidolly.",
  },
  heygen: {
    pago: "Revisa el pago en https://app.heygen.com (sección API).",
    cuota: "Recarga el saldo de API en https://app.heygen.com (sección API).",
    llave: "Revisa la llave en https://app.heygen.com y guárdala de nuevo en Ajustes de Conidolly.",
  },
  claude: {
    pago: "Revisa los datos de pago en https://platform.claude.com.",
    cuota: "Compra créditos en https://platform.claude.com (Plans & Billing).",
    llave: "Revisa la llave en https://platform.claude.com y guárdala de nuevo en Ajustes de Conidolly.",
  },
  voyage: {
    pago: "Revisa el pago en https://dashboard.voyageai.com.",
    cuota: "Revisa el saldo en https://dashboard.voyageai.com.",
    llave: "Revisa VOYAGE_API_KEY en las variables de Trigger.dev.",
  },
}

export function asuntoDePausa(pausa: PausaDeProveedor): string {
  return `${NOMBRE[pausa.proveedor]} en pausa: ${MOTIVO[pausa.motivo]}`
}

export function cuerpoDePausa(pausa: PausaDeProveedor): string {
  return [
    `Proveedor: ${NOMBRE[pausa.proveedor]}`,
    `Motivo: ${MOTIVO[pausa.motivo]}`,
    `Detalle: ${pausa.detalle}`,
    `Qué arreglar: ${ARREGLO[pausa.proveedor][pausa.motivo]}`,
    "Mientras tanto, Conidolly no llama a este proveedor y Coni ve que está en pausa. El mantenimiento lo revisa cada 10 minutos y avisa a Coni cuando vuelve a funcionar.",
  ].join("\n")
}

/**
 * Spec 2026-11-07, decision 3: opens the provider's pause (an open one is kept as it is) and emails WAV once per pause.
 * Coni gets no notice: the text on the piece or the screen says it. The email goes after the row and is marked after
 * it is sent (plan amendment A1), so a failed email is sent again by the next caller instead of being lost.
 */
export async function abrirPausa(deps: DepsPausa, pausa: PausaDeProveedor): Promise<{ nueva: boolean }> {
  const { data, error } = await deps.db.rpc("abrir_pausa_de_proveedor", {
    p_proveedor: pausa.proveedor,
    p_motivo: pausa.motivo,
    p_detalle: pausa.detalle,
  })
  if (error) throw new Error(`No pude abrir la pausa de ${pausa.proveedor}: ${error.message}`, { cause: error })
  const fila = data[0]
  if (!fila) throw new Error(`abrir_pausa_de_proveedor no devolvió la pausa de ${pausa.proveedor}.`)
  if (fila.avisar) {
    await deps.avisos.aWav(asuntoDePausa(pausa), cuerpoDePausa(pausa))
    const { error: errorAlMarcar } = await deps.db.rpc("marcar_pausa_avisada", { p_id: fila.pausa_id })
    if (errorAlMarcar) {
      throw new Error(`No pude marcar como avisada la pausa ${fila.pausa_id}: ${errorAlMarcar.message}`, { cause: errorAlMarcar })
    }
  }
  return { nueva: fila.nueva }
}
```

- [ ] **Step 4: Run green** (same command); `grep -n $'\xe2\x80\x94' lib/pausas/abrir.ts` prints nothing.

- [ ] **Step 5: Commit** message `Open a provider pause and email WAV once per pause` + footer.

### Checkpoint, lote 2

- [ ] `pnpm db:reset && pnpm test:db` (whole integration suite), `pnpm test:run`, `pnpm type`, `pnpm lint` green.
- [ ] Batch review of lote 2, with a database reviewer pass on the migration (RLS, security definer, `search_path = ''`, grants).

---

# Lote 3: every task path opens the pause (5 tasks)

### Task 10: `avisarFalla` opens the pause, writes its text and does not push Coni

**Files:**
- Modify: `lib/produccion/fallas.ts` (`dejarConstancia` :70-95, `avisarFalla` :102-135)
- Test: `tests/integration/fallas.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `describe("avisarFalla")`; import `PausaDeProveedor`, `TEXTO_PAUSA`)

```ts
  it("opens the pause, writes the provider's text, emails WAV once and does not push Coni", async () => {
    const guion = await piezaEn("guion_en_proceso")
    const otro = await piezaEn("guion_en_proceso")
    const { deps, avisos } = doble()
    const error = new PausaDeProveedor("claude", "cuota", "Anthropic respondió HTTP 400: credit balance is too low", 400)

    await avisarFalla(deps, { tarea: "producir-pieza", corrida: "run_1", piezaId: guion, error })
    await avisarFalla(deps, { tarea: "producir-pieza", corrida: "run_2", piezaId: otro, error })

    expect((await pieza(guion)).explicacion).toBe(TEXTO_PAUSA.claude)
    expect((await pieza(otro)).explicacion).toBe(TEXTO_PAUSA.claude)
    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["Claude (Anthropic) en pausa: sin saldo"])
    await pool.query("delete from public.pausas_de_proveedor")
  })

  it("keeps a pause text over a later failure, as it keeps the limit text", async () => {
    const id = await piezaEn("guion_en_proceso")
    await pool.query("update public.piezas set explicacion = $2, version = version + 1 where id = $1", [id, TEXTO_PAUSA.claude])
    const { deps } = doble()

    await avisarFalla(deps, { tarea: "producir-pieza", corrida: "run_3", piezaId: id, error: new Error("boom") })

    expect((await pieza(id)).explicacion).toBe(TEXTO_PAUSA.claude)
  })

  it("opens the pause of a run without a piece (the engine) and sends only the pause email", async () => {
    const { deps, avisos } = doble()
    const error = new PausaDeProveedor("claude", "llave", "Anthropic rechazó la llave (HTTP 401).", 401)

    await avisarFalla(deps, { tarea: "motor-semanal", corrida: "run_4", error })

    expect(avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["Claude (Anthropic) en pausa: llave rechazada"])
    await pool.query("delete from public.pausas_de_proveedor")
  })
```

(If the update in the second test is refused by a version trigger, use the suite's `ajustarPieza` helper instead.)

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/fallas.test.ts` → FAIL (Coni gets a push, WAV gets the generic email).

- [ ] **Step 3: Implement**

In `dejarConstancia` replace the `explicacion` computation:

```ts
  // A run the limit or a pause stopped already told Coni why; a later failure (its notice, say) must not hide that.
  const yaExplicada = fila.explicacion === TEXTO_LIMITE || esTextoDePausa(fila.explicacion)
  const explicacion =
    yaExplicada && fila.explicacion !== null
      ? fila.explicacion
      : paraConi(
          entrada.error,
          guion ? GENERICO_GUION : voz ? GENERICO_VOZ : armado ? GENERICO_CARRUSEL : GENERICO_VIDEO,
        )
```

In `avisarFalla`, after computing `explicacion` and before the `lineas`:

```ts
  // Spec 2026-11-07, decision 3: a pause is told to WAV once per pause, and Coni only reads it on the piece.
  if (entrada.error instanceof PausaDeProveedor) {
    await abrirPausa(deps, entrada.error)
    return
  }
```

Imports: `import { esTextoDePausa, PausaDeProveedor } from "@/lib/dominio/pausas"` and `import { abrirPausa } from "@/lib/pausas/abrir"`. `DepsFalla` already has `db` and `avisos`, which is `DepsPausa`. Update the doc comment of `avisarFalla` to say a pause takes the pause path.

- [ ] **Step 4: Run green**: `pnpm test:db tests/integration/fallas.test.ts`.

- [ ] **Step 5: Commit** message `Open the pause from a failed task instead of the generic alerts` + footer.

### Task 11: the voice paths open the pause (`grabarVoz`, the draft's voice)

**Files:**
- Modify: `lib/produccion/grabar-voz.ts` (`ResultadoVoz` :16, `catch` :77-85)
- Modify: `lib/produccion/producir.ts` (`vozDelBorrador` :168-189)
- Test: `tests/integration/grabar-voz.test.ts`, `tests/integration/producir.test.ts` (the existing file that covers `producirPieza`; find it with `grep -ln "producirPieza" tests/integration`)

- [ ] **Step 1: Write the failing tests**

In `grabar-voz.test.ts` (imports: `TEXTO_PAUSA`, `notificadorEnMemoria` already there):

```ts
describe("grabarVoz con ElevenLabs en pausa", () => {
  afterEach(async () => {
    await pool.query("delete from public.pausas_de_proveedor")
  })

  it("opens the pause, emails WAV once for two pieces and writes the pause text on both", async () => {
    responder(() =>
      HttpResponse.json({ detail: { status: "payment_issue", message: "You have an unpaid invoice." } }, { status: 401 }),
    )
    const primera = await grabando()
    const segunda = await grabando()
    const avisos = notificadorEnMemoria()
    const d = { ...deps(), avisos }

    expect(await grabarVoz(d, { piezaId: primera, nueva: false })).toEqual({ resultado: "pausa" })
    expect(await grabarVoz(d, { piezaId: segunda, nueva: false })).toEqual({ resultado: "pausa" })

    for (const id of [primera, segunda]) {
      expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", explicacion: TEXTO_PAUSA.elevenlabs })
    }
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aConiEnviados).toEqual([])
    const { rows } = await pool.query("select proveedor, motivo from public.pausas_de_proveedor where cerrada_en is null")
    expect(rows).toEqual([{ proveedor: "elevenlabs", motivo: "pago" }])
    // A refusal: the reservation went back to the month's limit.
    expect((await gastosDeVoz(primera))[0]).toMatchObject({ estado: "liberado", sin_cobro: true })
  })
})
```

In the producir test file, add a case where ElevenLabs answers `payment_issue` while the script is written: the piece reaches `guion_por_aprobar` without voice and with `explicacion` `TEXTO_PAUSA.elevenlabs`, one pause row, one WAV email. Copy the arrangement (Claude MSW handlers, seed) from the existing "delivers the script without a voice" test in that file and change only the ElevenLabs handler and the assertions.

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/grabar-voz.test.ts <producir test file>` → FAIL (`resultado: "falla"`, no pause row).

- [ ] **Step 3: Implement**

`grabar-voz.ts`:

```ts
export type ResultadoVoz =
  | { resultado: "lista"; audioId: string }
  | { resultado: "nada_que_hacer" }
  | { resultado: "limite" }
  | { resultado: "pausa" }
  | { resultado: "falla" }
```

and in the `catch`, before the `Falla` branch:

```ts
    // The notice goes first, like the limit: a failed email leaves the piece in `grabando_voz` and the retry sends it.
    if (error instanceof PausaDeProveedor) {
      await abrirPausa(deps, error)
      await escribir(deps, fila, { tipo: "falla_voz", explicacion: error.message })
      return { resultado: "pausa" }
    }
```

`producir.ts`, `vozDelBorrador`:

```ts
  } catch (error) {
    // A pause opens once and the draft carries its text, so gate 1 shows it instead of «No pude preparar tu voz».
    if (error instanceof PausaDeProveedor) {
      await abrirPausa(deps, error)
      return { audioId: null, explicacion: error.message }
    }
    // A Falla is expected and needs no log: Coni reads TEXTO_SIN_VOZ, and the voice task gives its own text if it
    // happens again. Anything else is for WAV to look at.
    if (!(error instanceof Falla)) console.error(`No pude preparar la voz de la pieza ${fila.id}`, error)
  }
```

Imports in both files: `PausaDeProveedor` from `@/lib/dominio/pausas`, `abrirPausa` from `@/lib/pausas/abrir`. `DepsGrabarVoz` and `DepsProduccion` both carry `db` and `avisos`.

- [ ] **Step 4: Run green** (same command). Also run `pnpm exec vitest run` for any unit test that switches on `ResultadoVoz` (`grep -rn "resultado: \"falla\"" tests/unit`).

- [ ] **Step 5: Commit** message `Open the ElevenLabs pause from the voice tasks` + footer.

### Task 12: the render path opens the pause

**Files:**
- Modify: `lib/produccion/grabar.ts` (`grabarPieza` catch :349-359)
- Test: `tests/integration/grabar.test.ts`

- [ ] **Step 1: Extend the two tests of Task 4** (the 402 on create and the failed render with `insufficient_credit`) with:

```ts
    const { rows } = await pool.query("select proveedor, motivo from public.pausas_de_proveedor where cerrada_en is null")
    expect(rows).toEqual([{ proveedor: "heygen", motivo: "cuota" }])
    expect(d.avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["HeyGen en pausa: sin saldo"])
```

and add `await pool.query("delete from public.pausas_de_proveedor")` to the file's `afterEach`. (If `doble()` does not expose its notifier, expose it the way `fallas.test.ts` does.)

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/grabar.test.ts` → FAIL (no pause row).

- [ ] **Step 3: Implement** in the `catch` of `grabarPieza`, before the `Falla` branch:

```ts
    // Spec 2026-11-07: a HeyGen pause (or an ElevenLabs one while the signed voice is made) opens once and ends this
    // attempt with its text; the spend goes back like any other failure of the attempt.
    if (error instanceof PausaDeProveedor) {
      await abrirPausa(deps, error)
      return await fallar(contexto, error.message)
    }
```

Import `abrirPausa`. `DepsGrabacion` has `db` and `avisos`.

- [ ] **Step 4: Run green** (same command).

- [ ] **Step 5: Commit** message `Open the HeyGen pause from the render task` + footer.

### Task 13: materials and embeddings

**Files:**
- Modify: `lib/ingesta/falla-material.ts` (`motivoParaConi`, `alFallarMaterial`)
- Modify: `lib/ingesta/afirmar.ts` (`embeberAfirmaciones` catch :161-167)
- Test: `tests/integration/procesar-material.test.ts`, `tests/integration/procesar-afirmaciones.test.ts`

- [ ] **Step 1: Write the failing tests**

In `procesar-material.test.ts` (or the file that already tests `alFallarMaterial`; find it with `grep -ln alFallarMaterial tests/integration`):

```ts
  it("marks a material that met a pause with the Biblioteca text, opens the pause and emails WAV only about it", async () => {
    const materialId = await sembrarMaterialProcesando()
    const avisos = notificadorEnMemoria()
    const error = new PausaDeProveedor("claude", "cuota", "Anthropic respondió HTTP 400: credit balance is too low", 400)

    await alFallarMaterial({ db: clienteDeServicio(), avisos }, { materialId, corrida: "run_m", error })

    const { rows } = await pool.query("select estado, motivo_fallo from public.materiales where id = $1", [materialId])
    expect(rows[0]).toEqual({ estado: "fallido", motivo_fallo: "La Biblioteca está en pausa. Ya le avisamos a WAV." })
    expect(avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["Claude (Anthropic) en pausa: sin saldo"])
  })
```

(`sembrarMaterialProcesando` stands for the seeding helper the file already uses; reuse it under its real name.)

In `procesar-afirmaciones.test.ts`, a case where the Voyage MSW handler answers 401: the material still ends `listo` with no `motivo_fallo` (A6: no pause text on materials for Voyage), its claims stay without a vector, and one `voyage`/`llave` pause is open with one WAV email. Copy the arrangement of the existing "a Voyage error leaves the claims without a vector" test and add the assertions.

Clean `pausas_de_proveedor` in both files' `afterEach`.

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/procesar-material.test.ts tests/integration/procesar-afirmaciones.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`falla-material.ts`:

```ts
export function motivoParaConi(error: unknown): string {
  if (error instanceof RechazoDeClaude) return MOTIVO_DE_RECHAZO
  // Plan amendment A6: a material says the Biblioteca text whatever provider paused.
  if (error instanceof PausaDeProveedor) return TEXTO_PAUSA_DE_BIBLIOTECA
  return error instanceof Falla ? error.message : MOTIVO_GENERICO
}
```

and in `alFallarMaterial`, after `if (!data) return`:

```ts
  // A run the limit or a pause stopped already told Coni why; a later failure (its notice, say) must not hide that.
  const yaExplicado = data.motivo_fallo === TEXTO_LIMITE || data.motivo_fallo === TEXTO_PAUSA_DE_BIBLIOTECA
  const motivo = yaExplicado && data.motivo_fallo !== null ? data.motivo_fallo : motivoParaConi(entrada.error)
  await marcarFallido(deps.db, entrada.materialId, motivo)
  if (entrada.error instanceof PausaDeProveedor) {
    await abrirPausa(deps, entrada.error)
    return
  }
  await deps.avisos.aWav(/* unchanged */)
```

`afirmar.ts`, the `catch` of `embeberAfirmaciones`:

```ts
  } catch (error) {
    if (error instanceof MaterialBorrado) throw error
    // The claims still wait for maintenance, but a payment or key failure is WAV's to fix now (spec 2026-11-07).
    if (error instanceof PausaDeProveedor) await abrirPausa(deps, error)
    // Left for maintenance, but visible in the logs. The key is already redacted by the client.
    console.warn(
      `Embeddings pendientes del material ${material.id}: ${error instanceof Error ? error.message : "error"}`,
    )
  }
```

(`ctx.deps` is a `DepsProcesar`, which has `db` and `avisos`.)

- [ ] **Step 4: Run green** (same command).

- [ ] **Step 5: Commit** message `Open provider pauses from materials and embeddings` + footer.

### Task 14: the engine and the maintenance topics skip Claude work while paused

**Files:**
- Modify: `lib/motor/tarea.ts`
- Modify: `lib/mantenimiento/temas.ts` (`ResultadoMantenerTemas`, the embedding `catch` :116-123)
- Modify: `lib/mantenimiento/ejecutar.ts` (`temas` and `fusiones` steps)
- Test: `tests/integration/motor-semanal.test.ts`, `tests/integration/mantenimiento-temas.test.ts`

- [ ] **Step 1: Write the failing tests**

`motor-semanal.test.ts`:

```ts
  it("skips the week and writes nothing while Claude is paused", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('claude', 'cuota', 'x')")
    const resultado = await ejecutarMotorSemanal({ manual: true, semana: "2026-11-08" }, async () => depsDelMotor())
    expect(resultado).toEqual({ omitido: true, pausa: "claude" })
    const { rows } = await pool.query("select count(*)::int as n from public.motor_corridas where semana = '2026-11-08'")
    expect(rows[0]?.n).toBe(0)
    await pool.query("delete from public.pausas_de_proveedor")
  })
```

(`depsDelMotor()` is the builder the file already uses; keep its real name.)

`mantenimiento-temas.test.ts`: (a) `mantenerTemas` with the Voyage handler answering 402 returns `pausa` set to a `PausaDeProveedor` of `voyage`; (b) `mantenimientoFrecuente`'s `temas` step returns `{ omitido: true, pausa: "claude" }` while a Claude pause is open, without calling Claude (an MSW handler for `api.anthropic.com` that counts calls stays at 0); (c) a `PausaDeProveedor` of Claude thrown by `formarTemas` (Claude handler answering 401) opens the pause and the step returns `{ pausa: "claude" }` instead of failing the run.

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/motor-semanal.test.ts tests/integration/mantenimiento-temas.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`lib/motor/tarea.ts`:

```ts
export async function ejecutarMotorSemanal(
  entrada: EntradaDelMotor,
  depsMotor: () => Promise<DepsDelMotor | null>,
  ahora: () => Date = () => new Date(),
): Promise<ResultadoDelMotor | { omitido: true } | { omitido: true; pausa: "claude" }> {
  const deps = await depsMotor()
  if (!deps) return { omitido: true }
  // Spec 2026-11-07, decision 4: skipped and nothing written; WAV's pause email already covers it.
  if ((await leerPausasAbiertas(deps.db)).includes("claude")) return { omitido: true, pausa: "claude" }
  return correrMotor(deps, { semana: semanaDeLaCorrida(entrada, ahora()), manual: entrada.manual === true })
}
```

`lib/mantenimiento/temas.ts`: add `pausa: PausaDeProveedor | null` to `ResultadoMantenerTemas` (every return sets it: `null` by default) and in the embedding `catch` keep the error when it is a pause:

```ts
    } catch (error) {
      // A provider outage must not alert every ten minutes: the claims stay without a vector and the next run retries.
      // A pause is handed to the caller, which opens it (it holds the notifier). The key is already redacted.
      if (error instanceof PausaDeProveedor) pausa = error
      console.warn(/* unchanged */)
    }
```

`lib/mantenimiento/ejecutar.ts`, the `temas` step and the `fusiones` step:

```ts
    temas: async () => {
      const propias = await deps.temas()
      if (!propias) return OMITIDO
      // Plan amendment A8: Claude's pause must not fail this run every ten minutes.
      if ((await leerPausasAbiertas(deps.db)).includes("claude")) return PAUSADO_CLAUDE
      let resultado: Awaited<ReturnType<typeof mantenerTemas>>
      try {
        resultado = await mantenerTemas(propias)
      } catch (error) {
        if (!(error instanceof PausaDeProveedor)) throw error
        await abrirPausa(deps, error)
        return { pausa: error.proveedor }
      }
      if (resultado.pausa) await abrirPausa(deps, resultado.pausa)
      if (!resultado.tope) return resultado
      // Silent before the hard limit; now Coni hears it once a month (spec 2026-11-02).
      return { ...resultado, ...(await avisarLimiteCadaDiezMinutos(deps)) }
    },
```

with `const PAUSADO_CLAUDE = { omitido: true, pausa: "claude" } as const`. In `mantenimientoNocturno`, `fusiones` returns `PAUSADO_CLAUDE` when Claude is paused (right after `if (!propias) return OMITIDO`). `DepsNocturno` must carry `avisos` for that: it does through `DepsTokenMeta` (verify with `pnpm type`; if not, it only needs the read, not `abrirPausa`, which is all this step does).

- [ ] **Step 4: Run green**, then `pnpm test:db tests/integration/borrado-diferido-mantenimiento.test.ts` (another `mantenimientoFrecuente` caller).

- [ ] **Step 5: Commit** message `Skip the engine and the topic jobs while Claude is paused` + footer.

### Checkpoint, lote 3

- [ ] `pnpm test:db` (all), `pnpm test:run`, `pnpm type`, `pnpm lint` green.
- [ ] `grep -rn "instanceof Falla" lib/produccion lib/ingesta lib/mantenimiento` and check by hand that every inline `Falla` catch that can meet a provider call has a `PausaDeProveedor` branch before it (today: `grabar.ts`, `grabar-voz.ts`, `producir.ts`).
- [ ] Batch review of lote 3.

---

# Lote 4: closing the pause on its own (2 tasks)

### Task 15: one minimal check per provider

**Files:**
- Create: `lib/proveedores/chequeos.ts`
- Test: `tests/unit/chequeos.test.ts` (new, `// @vitest-environment node`, MSW)

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/unit/chequeos.test.ts
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { chequearProveedor } from "@/lib/proveedores/chequeos"
import { servidor } from "../msw"

const LLAVE = "llave-secreta-de-prueba"
const BASES = { elevenlabs: "https://api.elevenlabs.io", heygen: "https://api.heygen.com" }
const SUSCRIPCION = {
  status: "active",
  has_open_invoices: true,
  character_count: 10,
  character_limit: 100,
  can_extend_character_limit: false,
}

function suscripcion(cambios: Record<string, unknown>) {
  servidor.use(http.get(`${BASES.elevenlabs}/v1/user/subscription`, () => HttpResponse.json({ ...SUSCRIPCION, ...cambios })))
}

describe("chequearProveedor elevenlabs", () => {
  it("is good when the subscription is active and has characters, even with open invoices (A9)", async () => {
    suscripcion({})
    expect(await chequearProveedor({ proveedor: "elevenlabs", motivo: "pago", llave: LLAVE, bases: BASES })).toEqual({ ok: true })
  })

  it.each([{ status: "past_due" }, { status: "incomplete" }, { status: "free_disabled" }])(
    "stays paused on %o",
    async (cambios) => {
      suscripcion(cambios)
      expect(await chequearProveedor({ proveedor: "elevenlabs", motivo: "pago", llave: LLAVE, bases: BASES })).toMatchObject({ ok: false })
    },
  )

  it("stays paused for quota while no characters are left and the plan cannot extend", async () => {
    suscripcion({ character_count: 100 })
    expect(await chequearProveedor({ proveedor: "elevenlabs", motivo: "cuota", llave: LLAVE, bases: BASES })).toMatchObject({ ok: false })
  })

  it("stays paused on a 401 and never puts the key in the reason", async () => {
    servidor.use(http.get(`${BASES.elevenlabs}/v1/user/subscription`, () => new HttpResponse(LLAVE, { status: 401 })))
    const r = await chequearProveedor({ proveedor: "elevenlabs", motivo: "llave", llave: LLAVE, bases: BASES })
    expect(r).toMatchObject({ ok: false })
    expect(JSON.stringify(r)).not.toContain(LLAVE)
  })
})

describe("chequearProveedor heygen", () => {
  function usuario(data: Record<string, unknown>) {
    servidor.use(http.get(`${BASES.heygen}/v3/users/me`, () => HttpResponse.json({ data })))
  }
  it("is good for a key pause on any 200", async () => {
    usuario({ billing_type: "subscription", subscription: null })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "llave", llave: LLAVE, bases: BASES })).toEqual({ ok: true })
  })
  it("needs money in the API wallet for a quota pause", async () => {
    usuario({ billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 0 } })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toMatchObject({ ok: false })
    usuario({ billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 12.5 } })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toEqual({ ok: true })
  })
  it("reads subscription and usage-based credits for a quota pause", async () => {
    usuario({
      billing_type: "subscription",
      subscription: { credits: { premium_credits: { remaining: 0 }, add_on_credits: { remaining: 3 } } },
    })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toEqual({ ok: true })
    usuario({ billing_type: "usage_based", usage_based: { remaining_credits: 0 } })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toMatchObject({ ok: false })
  })
})

describe("chequearProveedor claude", () => {
  it("is good when a one-token message answers", async () => {
    let pedido: unknown
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        pedido = await request.json()
        return HttpResponse.json({
          id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5",
          content: [{ type: "text", text: "o" }], stop_reason: "max_tokens", stop_sequence: null,
          usage: { input_tokens: 8, output_tokens: 1 },
        })
      }),
    )
    expect(await chequearProveedor({ proveedor: "claude", motivo: "cuota", llave: LLAVE, bases: BASES })).toEqual({ ok: true })
    expect(pedido).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 1 })
  })
  it("stays paused while the balance is too low", async () => {
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json(
          { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
          { status: 400 },
        ),
      ),
    )
    expect(await chequearProveedor({ proveedor: "claude", motivo: "cuota", llave: LLAVE, bases: BASES })).toMatchObject({ ok: false })
  })
})

describe("chequearProveedor voyage", () => {
  it("is good when a one-word embedding answers, and stays paused on 401", async () => {
    servidor.use(
      http.post("https://api.voyageai.com/v1/embeddings", () =>
        HttpResponse.json({ data: [{ embedding: Array.from({ length: 1024 }, () => 0), index: 0 }], usage: { total_tokens: 1 } }),
      ),
    )
    expect(await chequearProveedor({ proveedor: "voyage", motivo: "llave", llave: LLAVE, bases: BASES })).toEqual({ ok: true })
    servidor.use(http.post("https://api.voyageai.com/v1/embeddings", () => new HttpResponse("no", { status: 401 })))
    expect(await chequearProveedor({ proveedor: "voyage", motivo: "llave", llave: LLAVE, bases: BASES })).toMatchObject({ ok: false })
  })
})

it("stays paused when the network drops", async () => {
  servidor.use(http.get(`${BASES.heygen}/v3/users/me`, () => HttpResponse.error()))
  expect(await chequearProveedor({ proveedor: "heygen", motivo: "llave", llave: LLAVE, bases: BASES })).toMatchObject({ ok: false })
})
```

- [ ] **Step 2: Run red**: `pnpm exec vitest run tests/unit/chequeos.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/proveedores/chequeos.ts
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import type { MotivoDePausa, ProveedorConPausa } from "@/lib/dominio/pausas"
import { PausaDeProveedor } from "@/lib/dominio/pausas"
import { traducirErrorDeClaude } from "@/lib/proveedores/anthropic"
import { embeber } from "@/lib/proveedores/voyage"

// Spec 2026-11-07, decision 5: one minimal question per open pause, every ten minutes. The doc of each call is cited
// in docs/superpowers/plans/2026-11-07-errores-de-proveedor-parte-1.md ("Provider checks verified against the docs").
const ESPERA_MS = 15_000
const MODELO_DEL_CHEQUEO = "claude-sonnet-5-5"

export type ResultadoDeChequeo = { ok: true } | { ok: false; motivo: string }

export interface EntradaDeChequeo {
  proveedor: ProveedorConPausa
  motivo: MotivoDePausa
  llave: string
  bases: { elevenlabs: string; heygen: string }
}

const no = (motivo: string): ResultadoDeChequeo => ({ ok: false, motivo })

/** Never puts the body in the reason: a provider may echo the key back. */
async function leerJson(url: string, cabeceras: Record<string, string>): Promise<{ ok: true; cuerpo: unknown } | { ok: false; motivo: string }> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))) {
      return { ok: false, motivo: "sin_conexion" }
    }
    throw error
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
  status: z.string(),
  character_count: z.number(),
  character_limit: z.number(),
  can_extend_character_limit: z.boolean().nullish(),
})
const ESTADOS_SIN_PAGO = new Set(["past_due", "incomplete", "free_disabled"])

async function chequearElevenlabs(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  const r = await leerJson(`${entrada.bases.elevenlabs}/v1/user/subscription`, { "xi-api-key": entrada.llave })
  if (!r.ok) return r
  const leida = Suscripcion.safeParse(r.cuerpo)
  if (!leida.success) return no("formato")
  const s = leida.data
  if (ESTADOS_SIN_PAGO.has(s.status)) return no(`estado ${s.status}`)
  if (entrada.motivo === "cuota" && s.character_count >= s.character_limit && s.can_extend_character_limit !== true) {
    return no("sin caracteres")
  }
  return { ok: true }
}

// https://developers.heygen.com/reference/get-current-user.md (v3 only, repo rule).
const Usuario = z.object({
  data: z.object({
    billing_type: z.string(),
    wallet: z.object({ remaining_balance: z.number().nullish() }).nullish(),
    subscription: z
      .object({
        credits: z
          .object({
            premium_credits: z.object({ remaining: z.number() }).nullish(),
            add_on_credits: z.object({ remaining: z.number() }).nullish(),
          })
          .nullish(),
      })
      .nullish(),
    usage_based: z.object({ remaining_credits: z.number().nullish() }).nullish(),
  }),
})

async function chequearHeygen(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  const r = await leerJson(`${entrada.bases.heygen}/v3/users/me`, { "X-Api-Key": entrada.llave })
  if (!r.ok) return r
  const leido = Usuario.safeParse(r.cuerpo)
  if (!leido.success) return no("formato")
  if (entrada.motivo !== "cuota") return { ok: true }
  const d = leido.data.data
  const saldo =
    d.billing_type === "wallet"
      ? (d.wallet?.remaining_balance ?? 0)
      : d.billing_type === "subscription"
        ? (d.subscription?.credits?.premium_credits?.remaining ?? 0) + (d.subscription?.credits?.add_on_credits?.remaining ?? 0)
        : d.billing_type === "usage_based"
          ? (d.usage_based?.remaining_credits ?? 0)
          : 0
  return saldo > 0 ? { ok: true } : no("sin saldo")
}

/** One token of Sonnet 5.5 with thinking off (`between_tools` is its off switch, see anthropic/nucleo.ts). */
async function chequearClaude(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  const cliente = new Anthropic({ apiKey: entrada.llave, timeout: ESPERA_MS, maxRetries: 0 })
  try {
    await cliente.beta.messages.create({
      model: MODELO_DEL_CHEQUEO,
      max_tokens: 1,
      thinking: { type: "between_tools" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "ok" }],
    })
    return { ok: true }
  } catch (error) {
    const traducido = traducirErrorDeClaude(error, MODELO_DEL_CHEQUEO)
    if (traducido instanceof PausaDeProveedor) return no(`pausa ${traducido.motivo}`)
    if (traducido instanceof Error) return no(traducido.name)
    throw error
  }
}

async function chequearVoyage(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  try {
    await embeber({ clave: entrada.llave, textos: ["ok"], tipo: "query" })
    return { ok: true }
  } catch (error) {
    // Any answer that is not a good embedding keeps the pause; the next tick asks again.
    if (error instanceof Error) return no(error instanceof PausaDeProveedor ? `pausa ${error.motivo}` : error.name)
    throw error
  }
}

/** A failed check is a result, never an exception: the maintenance run must not fail every ten minutes. */
export function chequearProveedor(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  switch (entrada.proveedor) {
    case "elevenlabs":
      return chequearElevenlabs(entrada)
    case "heygen":
      return chequearHeygen(entrada)
    case "claude":
      return chequearClaude(entrada)
    case "voyage":
      return chequearVoyage(entrada)
  }
}
```

If `beta.messages.create` does not type `thinking: { type: "between_tools" }` in the installed SDK, use the same object shape `pedirJson` passes (it compiles there); do not cast.

- [ ] **Step 4: Run green**: `pnpm exec vitest run tests/unit/chequeos.test.ts && pnpm type`.

- [ ] **Step 5: Commit** message `Check each paused provider with one minimal call` + footer.

### Task 16: the `pausas` maintenance step

**Files:**
- Create: `lib/mantenimiento/pausas.ts`
- Modify: `lib/mantenimiento/ejecutar.ts` (`DepsFrecuente`, `mantenimientoFrecuente`)
- Modify: `lib/produccion/deps-reales.ts` (`depsFrecuente`)
- Test: `tests/integration/mantenimiento-pausas.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/mantenimiento-pausas.test.ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import type { ResultadoDeChequeo } from "@/lib/proveedores/chequeos"
import { cerrarPausas } from "@/lib/mantenimiento/pausas"
import { notificadorConRegistro } from "@/lib/avisos/registrado"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.avisos where clave like 'pausa:%'")
  await pool.query("delete from public.pausas_de_proveedor")
})

const db = clienteDeServicio()
const AHORA = "2026-11-07T15:00:00.000Z"

function deps(respuesta: ResultadoDeChequeo) {
  const canal = notificadorEnMemoria()
  const preguntas: string[] = []
  return {
    canal,
    preguntas,
    deps: {
      db,
      avisos: notificadorConRegistro({ db, canal, ahora: () => AHORA }),
      ahora: () => AHORA,
      chequear: async (pausa: { proveedor: string }) => {
        preguntas.push(pausa.proveedor)
        return respuesta
      },
    },
  }
}

async function abierta(proveedor: string) {
  const { rows } = await pool.query<{ pausa_id: string }>("select pausa_id from public.abrir_pausa_de_proveedor($1, 'pago', 'x')", [proveedor])
  return rows[0]?.pausa_id ?? ""
}

describe("cerrarPausas", () => {
  it("closes a pause on a good check and tells Coni once, keyed by the pause", async () => {
    const id = await abierta("elevenlabs")
    const { deps: d, canal } = deps({ ok: true })

    expect(await cerrarPausas(d)).toEqual({ cerradas: ["elevenlabs"], abiertas: [] })
    expect(await cerrarPausas(d)).toEqual({ cerradas: [], abiertas: [] })

    const { rows } = await pool.query("select cerrada_en is not null as cerrada from public.pausas_de_proveedor where id = $1", [id])
    expect(rows[0]).toEqual({ cerrada: true })
    expect(canal.aConiEnviados).toEqual([{ mensaje: "Ya puedes preparar tu voz de nuevo.", urgente: true }])
    expect(canal.avisosEnviados).toEqual([{ tipo: "pausa_cerrada", clave: `pausa:${id}` }])
  })

  it("leaves the pause open and writes nothing on a bad check", async () => {
    await abierta("heygen")
    const { deps: d, canal } = deps({ ok: false, motivo: "sin saldo" })

    expect(await cerrarPausas(d)).toEqual({ cerradas: [], abiertas: [{ proveedor: "heygen", motivo: "sin saldo" }] })
    const { rows } = await pool.query("select count(*)::int as n from public.pausas_de_proveedor where cerrada_en is null")
    expect(rows[0]?.n).toBe(1)
    expect(canal.aConiEnviados).toEqual([])
    const avisos = await pool.query("select count(*)::int as n from public.avisos where clave like 'pausa:%'")
    expect(avisos.rows[0]?.n).toBe(0)
  })

  it("closes a Voyage pause without telling Coni (A6)", async () => {
    await abierta("voyage")
    const { deps: d, canal } = deps({ ok: true })
    expect(await cerrarPausas(d)).toEqual({ cerradas: ["voyage"], abiertas: [] })
    expect(canal.aConiEnviados).toEqual([])
  })

  it("asks nothing when no pause is open", async () => {
    const { deps: d, preguntas } = deps({ ok: true })
    expect(await cerrarPausas(d)).toEqual({ cerradas: [], abiertas: [] })
    expect(preguntas).toEqual([])
  })
})
```

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/mantenimiento-pausas.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/mantenimiento/pausas.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerPausasParaCerrar, type PausaParaCerrar } from "@/lib/datos/pausas"
import { type ProveedorConPausa, TEXTO_PAUSA_CERRADA } from "@/lib/dominio/pausas"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { ResultadoDeChequeo } from "@/lib/proveedores/chequeos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsPausas {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
  /** Asks the paused provider its minimal question with the key it uses (`chequearProveedor` in production). */
  chequear: (pausa: PausaParaCerrar) => Promise<ResultadoDeChequeo>
}

export interface ResultadoDePausas {
  cerradas: ProveedorConPausa[]
  abiertas: { proveedor: ProveedorConPausa; motivo: string }[]
}

/**
 * Spec 2026-11-07, decision 5. For each open pause: one check; a good answer tells Coni once (keyed `pausa:<id>`) and
 * closes the pause. The notice goes before the closing: a failed notice leaves the pause open and the next tick sends
 * it (the key keeps it to one), while a notice after a closing that failed would be lost. Nothing is redone on its own.
 */
export async function cerrarPausas(deps: DepsPausas): Promise<ResultadoDePausas> {
  const resultado: ResultadoDePausas = { cerradas: [], abiertas: [] }
  for (const pausa of await leerPausasParaCerrar(deps.db)) {
    const chequeo = await deps.chequear(pausa)
    if (!chequeo.ok) {
      resultado.abiertas.push({ proveedor: pausa.proveedor, motivo: chequeo.motivo })
      continue
    }
    // Coni never saw a Voyage pause (amendment A6), so its closing tells her nothing.
    if (pausa.proveedor !== "voyage") {
      await deps.avisos.aConi(TEXTO_PAUSA_CERRADA[pausa.proveedor], true, { tipo: "pausa_cerrada", clave: `pausa:${pausa.id}` })
    }
    const { error } = await deps.db.rpc("cerrar_pausa_de_proveedor", { p_id: pausa.id })
    if (error) throw new Error(`No pude cerrar la pausa ${pausa.id}: ${error.message}`, { cause: error })
    resultado.cerradas.push(pausa.proveedor)
  }
  return resultado
}
```

`lib/mantenimiento/ejecutar.ts`: `DepsFrecuente` gains `& { chequear: DepsPausas["chequear"] }`; `mantenimientoFrecuente` runs `pausas` first so a closed Claude pause lets `temas` run on the same tick:

```ts
  return enSerie({
    // First: a pause that closes now lets the jobs below call its provider on this same tick.
    pausas: () => cerrarPausas(deps),
    // A deleted material's ideas leave before the topics job reads them.
    borrado: () => borrarLoMarcado({ db: deps.db, almacen: deps.almacen(), ahora: deps.ahora }),
    // ...the rest unchanged
```

`lib/produccion/deps-reales.ts`, in `depsFrecuente`:

```ts
    chequear: (pausa) => chequearConLaLlave(db, pausa),
```

with, in the same file (it already reads keys from the Vault there):

```ts
const NOMBRE_EN_EL_VAULT = { elevenlabs: "elevenlabs", heygen: "heygen", claude: "anthropic" } as const

/** The key each provider's tasks use: the Vault, except Voyage's, which is a Trigger.dev variable (plan amendment A7). */
async function chequearConLaLlave(db: SupabaseClient<Database>, pausa: PausaParaCerrar): Promise<ResultadoDeChequeo> {
  const llave =
    pausa.proveedor === "voyage" ? process.env.VOYAGE_API_KEY || null : await leerSecreto(db, NOMBRE_EN_EL_VAULT[pausa.proveedor])
  if (!llave) return { ok: false, motivo: "sin llave" }
  return chequearProveedor({
    proveedor: pausa.proveedor,
    motivo: pausa.motivo,
    llave,
    bases: {
      elevenlabs: baseDe(process.env, "ELEVENLABS_BASE_URL", "https://api.elevenlabs.io"),
      heygen: baseDe(process.env, "HEYGEN_BASE_URL", "https://api.heygen.com"),
    },
  })
}
```

(`depsFrecuente` builds `db` once: hoist `const db = clienteDeServicio()` so `db` and `chequear` share it.) Update the doc comments of `mantenimientoFrecuente` and `CONFIGURACION_FRECUENTE` in `trigger/mantenimiento.ts` to list the pauses. No change to the task's config: it is the same task, only `ejecutar.ts` grows a step.

- [ ] **Step 4: Run green**: `pnpm test:db tests/integration/mantenimiento-pausas.test.ts tests/integration/borrado-diferido-mantenimiento.test.ts tests/integration/mantenimiento-temas.test.ts && pnpm type`. Any test that builds a `DepsFrecuente` by hand gets `chequear: async () => ({ ok: false, motivo: "prueba" })`.

- [ ] **Step 5: Commit** message `Close provider pauses from the frequent maintenance` + footer.

### Checkpoint, lote 4

- [ ] `pnpm test:db`, `pnpm test:run`, `pnpm type`, `pnpm lint` green.
- [ ] Batch review of lote 4 (checks never throw on a provider answer; notice before closing).

---

# Lote 5: screens and server actions (6 tasks)

### Task 17: server actions refuse while paused

**Files:**
- Modify: `lib/acciones/piezas.ts` (`pedirVoz` :615, `aprobarGuion` :399, `regrabar` :844, `reintentar` :884, `reintentarGuion` :366, `pedirCambios` :627)
- Modify: `lib/acciones/semana.ts` (`proponerAhora`)
- Modify: `lib/acciones/biblioteca.ts` (`moverYProcesar` :116, `crearMaterial` :281, `confirmarMaterial` :387)
- Test: `tests/integration/acciones-piezas.test.ts`, `acciones-semana.test.ts`, `acciones-biblioteca.test.ts`, `acciones-subir.test.ts`

- [ ] **Step 1: Write the failing tests** (one per action, all the same shape; clean `pausas_de_proveedor` in each file's `afterEach`)

```ts
  it("refuses «Preparar mi voz» while ElevenLabs is paused, and starts nothing", async () => {
    const id = await sembrarPieza("guion_por_aprobar")
    await pool.query("select public.abrir_pausa_de_proveedor('elevenlabs', 'pago', 'x')")
    const { deps, disparos } = depsDeConi()

    const resultado = await pedirVoz(deps, id, (await leerFila(id)).version, false)

    expect(resultado).toEqual({ ok: false, error: "Tu voz está en pausa. Ya le avisamos a WAV." })
    expect(disparos).toEqual([])
    expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
  })
```

The other cases, same shape with each file's own helpers: `aprobarGuion` and `regrabar` with `heygen` paused (text `TEXTO_PAUSA.heygen`, the piece stays where it was); `reintentar` on a reel in `error_produccion` with `heygen` paused (refused) and on a carousel in `error_produccion` with `heygen` paused (not refused: carousels never call HeyGen); `reintentarGuion` and `pedirCambios` with `claude` paused (no `producir` trigger, the piece stays at gate 1); `elegirIdeas` with `claude` paused still starts its pieces (A5); `proponerAhora` with `claude` paused (no `motor` trigger); `reintentarMaterial`, `crearMaterial` and `confirmarMaterial` with `claude` paused (text `TEXTO_PAUSA_DE_BIBLIOTECA`, `crearMaterial` inserts no row) and, with only `voyage` paused, all three still work (A6).

- [ ] **Step 2: Run red**: `pnpm test:db tests/integration/acciones-piezas.test.ts tests/integration/acciones-semana.test.ts tests/integration/acciones-biblioteca.test.ts tests/integration/acciones-subir.test.ts` → FAIL.

- [ ] **Step 3: Implement**, each right after the version or role check and before any write:

```ts
// pedirVoz, after exigirVersion
    await exigirSinPausa(deps.db, "elevenlabs")
// aprobarGuion, after `exigirVersion(fila, versionVista, new ArtefactoCambio())`
    await exigirSinPausa(deps.db, "heygen")
// regrabar, after exigirVersion
    await exigirSinPausa(deps.db, "heygen")
// reintentar, after exigirVersion: only a reel's render calls HeyGen again
    if (fila.estado === "error_produccion" && fila.tipo === "reel") await exigirSinPausa(deps.db, "heygen")
// reintentarGuion, after the state check
    await exigirSinPausa(deps.db, "claude")
// pedirCambios, after exigirVersion (amendment A5)
    await exigirSinPausa(deps.db, "claude")
// proponerAhora, after exigirConi
    await exigirSinPausa(deps.db, "claude")
// moverYProcesar, crearMaterial and confirmarMaterial, after exigirConi
    await exigirBibliotecaSinPausa(deps.db)
```

Imports from `@/lib/datos/pausas`. The `Falla` thrown becomes `{ ok: false, error }` through `aResultado`, as every other refusal.

- [ ] **Step 4: Run green** (same command).

- [ ] **Step 5: Commit** message `Refuse provider actions while their provider is paused` + footer.

### Task 18: gate 1, voice, signature and «Pedir cambios»

**Files:**
- Modify: `lib/datos/grabacion.ts` (`presentarGrabacion`, `leerDatosDeGrabacion`, `DatosDeGrabacion`)
- Modify: `app/(app)/guion/[id]/voz-para-firmar.tsx`
- Modify: `app/(app)/guion/[id]/pantalla-guion.tsx` (the «Pedir cambios» button, :348-353)
- Test (also): `tests/unit/pantalla-guion.test.tsx` (the existing unit test of the gate 1 screen; find it with `grep -ln PantallaGuion tests/unit`)
- Test: `tests/unit/grabacion.test.ts` (the existing unit test of `presentarGrabacion`; find it with `grep -ln presentarGrabacion tests/unit`), `tests/unit/voz-para-firmar.test.tsx`

- [ ] **Step 1: Write the failing tests**

`presentarGrabacion` gets `pausas: readonly ProveedorConPausa[]`:

```ts
  it("closes the voice with its pause text first, and the signature with HeyGen's", () => {
    const botones = presentarGrabacion({ ...ENTRADA, pausas: ["elevenlabs", "heygen"] })
    expect(botones.bloqueoVoz).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")
    expect(botones.bloqueoVideo).toBe("Tu video está en pausa. Ya le avisamos a WAV.")
  })
  it("leaves both open without pauses", () => {
    expect(presentarGrabacion({ ...ENTRADA, pausas: [] })).toMatchObject({ bloqueoVoz: null, bloqueoVideo: null })
  })
```

(`ENTRADA` is the file's existing input; add `pausas: []` to every existing call.)

`voz-para-firmar.test.tsx`:

```tsx
  it("shows the pause as the block's title, with «Preparar mi voz» disabled and no «Avísale a Federico»", () => {
    render(
      <VozParaFirmar {...PROPS} explicacion={TEXTO_PAUSA.elevenlabs} datos={conBotones({ bloqueoVoz: TEXTO_PAUSA.elevenlabs })} />,
    )
    expect(screen.getByText("Tu voz está en pausa. Ya le avisamos a WAV.")).toBeVisible()
    expect(screen.getAllByText("Tu voz está en pausa. Ya le avisamos a WAV.")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /Preparar mi voz/ })).toBeDisabled()
    expect(screen.queryByText(/Avísale a Federico/)).toBeNull()
    expect(screen.queryByText("No pude preparar tu voz.")).toBeNull()
  })

  it("forgets an old pause text once the pause closed: the voice is simply missing", () => {
    render(<VozParaFirmar {...PROPS} explicacion={TEXTO_PAUSA.elevenlabs} datos={conBotones({ bloqueoVoz: null })} />)
    expect(screen.getByText("Falta preparar tu voz.")).toBeVisible()
    expect(screen.getByRole("button", { name: /Preparar mi voz/ })).toBeEnabled()
  })
```

(`PROPS` and `conBotones` stand for the file's existing fixtures; reuse them under their real names. If `Boton` renders `aria-disabled` instead of `disabled`, assert that attribute the way the file already does.)

- [ ] **Step 2: Run red**: `pnpm exec vitest run <grabacion unit test> tests/unit/voz-para-firmar.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`lib/datos/grabacion.ts`:

```ts
    // A paused provider closes its button with its pause text before any balance or limit (spec 2026-11-07, decision 4).
    bloqueoVoz:
      textoDePausa(entrada.pausas, "elevenlabs") ??
      sinLimite(usdVoz) ??
      bloqueo(alcanceDeVoz(saldos.elevenlabs, textoDeVoz.length)),
    bloqueoVideo:
      textoDePausa(entrada.pausas, "heygen") ??
      bloqueo(alcanceDeVideo(saldos.heygen, { usd: usdVideo, creditos: estimarCreditosVideo(guion, motor) })),
```

and `leerDatosDeGrabacion` reads `leerPausasAbiertas(db)` in its `Promise.all`, passes `pausas`, and sets a new field of `DatosDeGrabacion`, `bloqueoCambios: textoDePausa(pausas, "claude")` (amendment A5). Read the pauses before the config, so the early return taken when the config does not read also carries `bloqueoCambios`.

«Pedir cambios» (amendment A5), test first in the screen's unit test:

```tsx
  it("disables «Pedir cambios» with Claude's pause text while Claude is paused", async () => {
    render(<PantallaGuion {...PROPS} datos={{ ...DATOS, grabacion: { ...DATOS.grabacion, bloqueoCambios: TEXTO_PAUSA.claude } }} />)
    await abrirMasOpciones()
    expect(screen.getByRole("button", { name: "Pedir cambios" })).toBeDisabled()
    expect(screen.getByText("Las ideas y los guiones están en pausa. Ya le avisamos a WAV.")).toBeVisible()
    expect(screen.queryByText("Escribo un guion nuevo y este se descarta.")).toBeNull()
  })
```

(`PROPS`, `DATOS` and `abrirMasOpciones` stand for the file's existing fixtures and the way it opens «Más opciones».) In `pantalla-guion.tsx` the button gets `deshabilitado={grabacion.bloqueoCambios !== null}` and `aria-describedby` pointing at the line under it, which shows `grabacion.bloqueoCambios` instead of `TEXTO_PEDIR_CAMBIOS` while it is set. Every existing `DatosDeGrabacion` fixture in tests gets `bloqueoCambios: null`. On the path where the config does not read (`botones: null`), the buttons have no block today; leave it (a broken config is already WAV's).

`voz-para-firmar.tsx` (keep `"use client"` on line 1): compute, before `falla`:

```ts
  // A pause text on the piece: it is the block's title while the pause is open; once it closed, the voice is just missing.
  const pausaDeLaPieza = proveedorDelTextoDePausa(explicacion)
  const enPausa = pausaDeLaPieza !== null && razon === explicacion
  const explicacionVigente = pausaDeLaPieza !== null && !enPausa ? null : explicacion
  const falla = explicacionVigente && !enPausa ? separarFallaDeVoz(explicacionVigente) : null
```

In the `Bloque`: `tipo={enPausa ? "aviso" : falla ? "error" : "neutro"}`, `titulo={enPausa ? explicacion : falla ? falla.titulo : TEXTO_FALTA_VOZ}`, and `LineaBajoElBoton` receives `razon={enPausa ? null : razon}` so the text is not said twice (the button keeps `deshabilitado={razon !== null}`; its `aria-describedby` points at the block title: give the title an id through the `Bloque` prop it supports, or keep `aria-describedby` only when `!enPausa`). `necesitaFederico` stays false for a pause because `falla` is null. `GrabarDeNuevo` needs no change: `razonDeVoz` already returns the pause text and `LineaBajoElBoton` shows it.

- [ ] **Step 4: Run green** (same command), then `pnpm test:db tests/integration/grabacion-datos.test.ts`.

- [ ] **Step 5: Commit** message `Close gate 1 voice, signature and changes while their provider is paused` + footer.

### Task 19: retry buttons of a piece

**Files:**
- Modify: `app/(app)/estado-de-pieza.tsx` (`AccionesDeEstado`)
- Modify: `app/(app)/guion/[id]/page.tsx` (`guion_en_proceso` :88-101, `error_produccion` :135-156)
- Modify: `app/(app)/guion/[id]/carrusel.tsx` (:62)
- Test: `tests/unit/estado-de-pieza.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it("disables the retry buttons and says the pause under them, leaving the others alone", () => {
    render(
      <AccionesDeEstado
        piezaId={ID}
        version={3}
        acciones={["reintentar", "descartar"]}
        bloqueo="Tu video está en pausa. Ya le avisamos a WAV."
      />,
    )
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled()
    expect(screen.getByText("Tu video está en pausa. Ya le avisamos a WAV.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Descartar esta pieza" })).toBeEnabled()
  })
```

- [ ] **Step 2: Run red**: `pnpm exec vitest run tests/unit/estado-de-pieza.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`AccionesDeEstado` gets `bloqueo?: string | null` ("A paused provider: its retry buttons are disabled and this text sits under them."). Inside the map, for the three retry kinds, pass `deshabilitado={bloqueo != null}` and `aria-describedby={bloqueo != null ? idDelBloqueo : undefined}`; after the map render:

```tsx
      {bloqueo ? (
        <p id={idDelBloqueo} className="flex items-start gap-2 text-meta font-medium text-tinta">
          <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
          {bloqueo}
        </p>
      ) : null}
```

with `const idDelBloqueo = useId()` and `Info` from `@phosphor-icons/react` (same markup as the voice's `LineaBajoElBoton`, so the same tokens).

`guion/[id]/page.tsx`: read `const pausas = await leerPausasAbiertas(db)` once next to `leerPantallaDePieza` (in the same `Promise.all`), then `bloqueo={textoDePausa(pausas, "claude")}` on the `reintentarGuion` buttons and `bloqueo={textoDePausa(pausas, "heygen")}` on the `error_produccion` `reintentar`. In the `error_produccion` block, when `fila.explicacion` is a pause text whose pause is open, the `ExplicacionParaConi` keeps it (it is hers already); when that pause has closed, show `TEXTO_NO_TERMINE`'s generic line instead of the stale pause text: `texto={proveedorDelTextoDePausa(fila.explicacion) && !textoDePausa(pausas, "heygen") ? "Algo no salió como esperábamos con esta pieza." : (fila.explicacion ?? "Algo no salió como esperábamos con esta pieza.")}`. Same rule for `guion_en_proceso` with Claude. Pass `pausas` into `VistaDeCarrusel` and set `bloqueo={textoDePausa(pausas, "claude")}` on its `reintentarGuion` (carrusel.tsx :62).

- [ ] **Step 4: Run green**: `pnpm exec vitest run tests/unit/estado-de-pieza.test.tsx && pnpm type`.

- [ ] **Step 5: Commit** message `Disable piece retries while their provider is paused` + footer.

### Task 20: Biblioteca buttons (Claude pause only, A6)

**Files:**
- Modify: `app/(app)/biblioteca/boton-reintentar.tsx`, `boton-que-pregunta.tsx`, `tarjeta-de-material.tsx`, `panel-de-material.tsx`, `page.tsx`, `materiales/[id]/page.tsx`
- Modify: `app/(app)/biblioteca/subir/page.tsx`, `subir/formulario-de-subida.tsx`
- Modify: `app/(app)/biblioteca/semana/page.tsx`, `semana/vista-de-semana.tsx`, `semana/boton-proponer-ahora.tsx`
- Test: `tests/unit/biblioteca-semana-vista.test.tsx`, a new `tests/unit/boton-reintentar.test.tsx`, and the existing unit test of the upload form (`grep -ln FormularioDeSubida tests/unit`)

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/boton-reintentar.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BotonReintentar } from "@/app/(app)/biblioteca/boton-reintentar"

vi.mock("@/app/(app)/biblioteca/acciones", () => ({ reintentarMaterialAccion: vi.fn() }))

describe("BotonReintentar", () => {
  it("is disabled with the Biblioteca pause text under it", () => {
    render(<BotonReintentar materialId="m1" pausa="La Biblioteca está en pausa. Ya le avisamos a WAV." />)
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled()
    expect(screen.getByText("La Biblioteca está en pausa. Ya le avisamos a WAV.")).toBeVisible()
  })
  it("works as before without a pause", () => {
    render(<BotonReintentar materialId="m1" pausa={null} />)
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled()
  })
})
```

Copy the mocking style of the sibling Biblioteca unit tests if they mock `next/navigation` or `useRedibujar`. Add to `biblioteca-semana-vista.test.tsx`: `VistaDeSemana` with `pausa={TEXTO_PAUSA.claude}` renders «Proponer ahora» disabled and the text. Add to the upload form test: with `pausa` set, the submit button is disabled and the text is shown above it.

- [ ] **Step 2: Run red**: `pnpm exec vitest run tests/unit/boton-reintentar.test.tsx tests/unit/biblioteca-semana-vista.test.tsx <upload form test>` → FAIL.

- [ ] **Step 3: Implement**

- `BotonQuePregunta` gets `deshabilitado?: boolean` and `idDeLaRazon?: string`, passed to its first `Boton` (`deshabilitado`, `aria-describedby`).
- `BotonReintentar({ materialId, pausa }: { materialId: string; pausa: string | null })` renders `BotonQuePregunta` with `deshabilitado={pausa !== null}` and, under it, the same `Info` line as Task 19 with `id={useId()}` (the component is already `"use client"`).
- `page.tsx` of the Biblioteca reads `textoDePausaDeBiblioteca(await leerPausasAbiertas(db))` with the rest of its data and passes `pausa` to `TarjetaDeMaterial` and `PanelDeMaterial`, which pass it to `BotonReintentar`; `materiales/[id]/page.tsx` reads it and passes it the same way.
- `subir/page.tsx` reads it and passes `pausa` to `FormularioDeSubida`; the form shows the `Info` line above the submit button and sets `deshabilitado={pausa !== null}` on it (the file picker stays usable: she can prepare the upload, she cannot send it).
- `semana/page.tsx` reads `textoDePausa(pausas, "claude")` and passes `pausa` through `VistaDeSemana` to `BotonProponerAhora`, which sets `deshabilitado={pausa !== null}` and shows the line under the cost line.

- [ ] **Step 4: Run green** (same command), then `pnpm type && pnpm lint`; `head -1` of every touched client file is `"use client"`.

- [ ] **Step 5: Commit** message `Disable Biblioteca actions while Claude is paused` + footer.

### Task 21: E2E, phone and desktop

**Files:**
- Create: `tests/e2e/pausas.spec.ts` (project `app`), `tests/e2e/pausas.escritorio.ts` (project `escritorio`)

- [ ] **Step 1: Write the specs**

```ts
// tests/e2e/pausas.spec.ts
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { capturar, configurarServicios, simularMedios } from "./ayudas"

const PAUSA_VOZ = "Tu voz está en pausa. Ya le avisamos a WAV."

test.beforeEach(async () => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.pausas_de_proveedor")
  for (const nombre of ["heygen", "elevenlabs"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
  await configurarServicios()
})

test.afterAll(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
  await vaciarPiezasEIdeas()
})

test("a paused voice shows its text and no active «Preparar mi voz»; when the pause closes the button is back", async ({ page }) => {
  const id = await sembrarPieza("guion_por_aprobar", { explicacion: PAUSA_VOZ })
  const { rows } = await pool.query<{ pausa_id: string }>("select pausa_id from public.abrir_pausa_de_proveedor('elevenlabs', 'pago', 'e2e')")
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  const voz = page.getByRole("region", { name: "1. Escucha tu voz" })
  await expect(voz.getByText(PAUSA_VOZ)).toBeVisible()
  await expect(voz.getByRole("button", { name: /Preparar mi voz/ })).toBeDisabled()
  await expect(page.getByText("Avísale a Federico")).toHaveCount(0)
  await capturar(page, "pausa-voz", { completa: true })

  await pool.query("select public.cerrar_pausa_de_proveedor($1)", [rows[0]?.pausa_id])
  await page.reload()
  await expect(voz.getByText("Falta preparar tu voz.")).toBeVisible()
  await expect(voz.getByRole("button", { name: /Preparar mi voz/ })).toBeEnabled()
  await capturar(page, "pausa-voz-cerrada", { completa: true })
})

test("a paused HeyGen disables «Reintentar» of a failed video", async ({ page }) => {
  const id = await sembrarPieza("error_produccion", { explicacion: "Tu video está en pausa. Ya le avisamos a WAV." })
  await pool.query("select public.abrir_pausa_de_proveedor('heygen', 'cuota', 'e2e')")
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeDisabled()
  await expect(page.getByText("Tu video está en pausa. Ya le avisamos a WAV.").first()).toBeVisible()
  await capturar(page, "pausa-video", { completa: true })
})

test("a paused Claude disables «Proponer ahora»", async ({ page }) => {
  await pool.query("select public.abrir_pausa_de_proveedor('claude', 'cuota', 'e2e')")
  await page.goto("/biblioteca/semana")
  await expect(page.getByRole("button", { name: "Proponer ahora" })).toBeDisabled()
  await expect(page.getByText("Las ideas y los guiones están en pausa. Ya le avisamos a WAV.")).toBeVisible()
  await capturar(page, "pausa-semana", { completa: true })
})
```

If `sembrarPieza` cannot reach `error_produccion` directly, seed `en_render` and move it with `ajustarPieza(id, { estado: "error_produccion", explicacion: ... })`, the way `guion.spec.ts` seeds its failed pieces.

`tests/e2e/pausas.escritorio.ts`: the same first test at 1280 x 900 (copy its `beforeEach` from `guion.escritorio.ts`: `bloquearRedExterna`, `emulateMedia`, `avatarYaVisto`, `sembrarEscena`), plus the Biblioteca with Claude paused: a failed material's «Reintentar» disabled with the Biblioteca text, and `/biblioteca/subir` with its submit disabled; then, with only a Voyage pause open, both are enabled and no pause text shows (A6). Measure that the gate 1 layout still uses the width (the voice block and the signature column side by side, as `guion.escritorio.ts` measures with `medidas-de-escritorio.ts`), run `revisarConAxe` on both pages, and `capturar` each state. No `toHaveScreenshot` baselines in this task.

- [ ] **Step 2: Run** (they exercise code that exists after Task 20, so they are expected green on the first run; if one is red, fix the code, not the expectation)

Run: `pnpm exec playwright test --project=app tests/e2e/pausas.spec.ts && pnpm exec playwright test --project=escritorio tests/e2e/pausas.escritorio.ts`
Expected: PASS, captures under the suite's capture folder.

- [ ] **Step 3: Run the whole E2E suite once**: `pnpm test:e2e` (a pause left open would close buttons in other specs; the `afterAll` cleans it).

- [ ] **Step 4: Commit** message `Cover provider pauses end to end on phone and desktop` + footer.

### Task 22: Inicio «Atención» lines of open pauses (A10)

**Files:**
- Modify: `lib/dominio/pausas.ts` (add `lineaDePausaDeInicio`)
- Modify: `lib/inicio/modelo.ts` (`Inicio` :72, `construirInicio` :332, `tituloDeInicio` :111)
- Modify: `lib/datos/inicio.ts` (`leerDatosDeInicio` :41, `DatosDeInicio`)
- Modify: `lib/datos/pausas.ts` (add `leerPausasDeInicio`)
- Modify: `app/(app)/page.tsx` (the «Necesita atención» section)
- Test: `tests/unit/pausas.test.ts`, `tests/unit/inicio-modelo.test.ts`, `tests/e2e/pausas.spec.ts`

Today `inicio.atencion` holds one `AvisoDeInicio` per failed piece; the first is the large error block, the rest are rows that open their piece. A pause is not a piece, so it gets its own list, `inicio.pausas: string[]`, rendered at the top of the same section as plain lines (it is information, WAV is on it: not an error block), and it counts in the screen's title like any other thing that needs her attention.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/pausas.test.ts`:

```ts
describe("lineaDePausaDeInicio", () => {
  it.each([
    ["elevenlabs", "pago", "La voz está en pausa: la cuenta de ElevenLabs tiene un pago pendiente. WAV ya lo está resolviendo."],
    ["elevenlabs", "cuota", "La voz está en pausa: la cuenta de ElevenLabs se quedó sin saldo. WAV ya lo está resolviendo."],
    ["elevenlabs", "llave", "La voz está en pausa: la clave de ElevenLabs dejó de funcionar. WAV ya lo está resolviendo."],
    ["heygen", "pago", "Los videos están en pausa: la cuenta de HeyGen tiene un pago pendiente. WAV ya lo está resolviendo."],
    ["heygen", "cuota", "Los videos están en pausa: la cuenta de HeyGen se quedó sin créditos. WAV ya lo está resolviendo."],
    ["heygen", "llave", "Los videos están en pausa: la clave de HeyGen dejó de funcionar. WAV ya lo está resolviendo."],
    ["claude", "pago", "Las ideas y los guiones están en pausa: la cuenta de Claude tiene un pago pendiente. WAV ya lo está resolviendo."],
    ["claude", "cuota", "Las ideas y los guiones están en pausa: la cuenta de Claude se quedó sin saldo. WAV ya lo está resolviendo."],
    ["claude", "llave", "Las ideas y los guiones están en pausa: la clave de Claude dejó de funcionar. WAV ya lo está resolviendo."],
  ] as const)("words %s %s", (proveedor, motivo, texto) => {
    expect(lineaDePausaDeInicio(proveedor, motivo)).toBe(texto)
    expect(texto).not.toContain("\u2014")
  })

  it("has no line for Voyage (A6)", () => {
    expect(lineaDePausaDeInicio("voyage", "llave")).toBeNull()
  })
})
```

In `tests/unit/inicio-modelo.test.ts` (reuse the file's builders for `piezas`):

```ts
  it("puts one line per open pause first in her attention, and counts it in the title", () => {
    const inicio = construirInicio({
      piezas: [],
      ahora: AHORA,
      zona: ZONA,
      pausas: [
        { proveedor: "elevenlabs", motivo: "pago" },
        { proveedor: "voyage", motivo: "llave" },
      ],
    })
    expect(inicio.pausas).toEqual([
      "La voz está en pausa: la cuenta de ElevenLabs tiene un pago pendiente. WAV ya lo está resolviendo.",
    ])
    expect(inicio.titulo).toBe("Una cosa necesita tu atención")
  })

  it("shows no pause line when none is open", () => {
    const inicio = construirInicio({ piezas: [], ahora: AHORA, zona: ZONA, pausas: [] })
    expect(inicio.pausas).toEqual([])
    expect(inicio.titulo).toBe("Esta semana está al día")
  })
```

Every existing `construirInicio` call in tests gets `pausas: []`.

- [ ] **Step 2: Run red**: `pnpm exec vitest run tests/unit/pausas.test.ts tests/unit/inicio-modelo.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`lib/dominio/pausas.ts`:

```ts
const SUJETO_EN_INICIO: Record<Exclude<ProveedorConPausa, "voyage">, string> = {
  elevenlabs: "La voz está en pausa",
  heygen: "Los videos están en pausa",
  claude: "Las ideas y los guiones están en pausa",
}

const NOMBRE_EN_INICIO: Record<Exclude<ProveedorConPausa, "voyage">, string> = {
  elevenlabs: "ElevenLabs",
  heygen: "HeyGen",
  claude: "Claude",
}

function causaEnInicio(proveedor: Exclude<ProveedorConPausa, "voyage">, motivo: MotivoDePausa): string {
  const nombre = NOMBRE_EN_INICIO[proveedor]
  switch (motivo) {
    case "pago":
      return `la cuenta de ${nombre} tiene un pago pendiente`
    case "cuota":
      return `la cuenta de ${nombre} se quedó sin ${proveedor === "heygen" ? "créditos" : "saldo"}`
    case "llave":
      return `la clave de ${nombre} dejó de funcionar`
  }
}

/** Inicio's «Atención» line of an open pause (spec amendment A10); Voyage has none (A6). */
export function lineaDePausaDeInicio(proveedor: ProveedorConPausa, motivo: MotivoDePausa): string | null {
  if (proveedor === "voyage") return null
  return `${SUJETO_EN_INICIO[proveedor]}: ${causaEnInicio(proveedor, motivo)}. WAV ya lo está resolviendo.`
}
```

`lib/datos/pausas.ts`: `leerPausasDeInicio(db): Promise<{ proveedor: ProveedorConPausa; motivo: MotivoDePausa }[]>`, the same query as `leerPausasAbiertas` selecting `proveedor, motivo`, validated with `proveedorDe` and `esMotivoDePausa` (throw on an unknown value, as `leerPausasParaCerrar` does), ordered by `desde`.

`lib/datos/inicio.ts`: `DatosDeInicio` gains `pausas`, read in the existing `Promise.all` with Coni's session.

`lib/inicio/modelo.ts`: `Inicio` gains `/** One line per open pause (A10), shown first in «Atención»; not pieces, so they open nothing. */ pausas: string[]`; `construirInicio` takes `pausas: readonly { proveedor: ProveedorConPausa; motivo: MotivoDePausa }[]`, computes `const lineasDePausa = pausas.flatMap((p) => { const linea = lineaDePausaDeInicio(p.proveedor, p.motivo); return linea ? [linea] : [] })`, and passes `atencion.length + lineasDePausa.length` to `tituloDeInicio` and `lineaDeInicio`. The model stays pure (no database, no clock beyond `ahora`).

`app/(app)/page.tsx`: pass `pausas: datos.pausas` to `construirInicio`; the section renders when `inicio.pausas.length > 0 || principal`:

```tsx
      {inicio.pausas.length > 0 || principal ? (
        <section aria-label="Necesita atención" className="mt-6 grid gap-4">
          {inicio.pausas.map((linea) => (
            <LineaDeEstado key={linea} tipo="aviso" titulo={linea} />
          ))}
          {principal ? (
            /* the existing large Bloque and the rows of the other failures, unchanged */
          ) : null}
        </section>
      ) : null}
```

(`LineaDeEstado` from `@/components/ui/linea-de-estado`; `aviso` is its honda block that does not interrupt, the same weight the gate 1 HeyGen block uses.)

- [ ] **Step 4: Run green**: `pnpm exec vitest run tests/unit/pausas.test.ts tests/unit/inicio-modelo.test.ts && pnpm type`.

- [ ] **Step 5: E2E, the line appears and leaves.** Append to `tests/e2e/pausas.spec.ts`:

```ts
test("Inicio says an open pause with its reason, and stops saying it when the pause closes", async ({ page }) => {
  const { rows } = await pool.query<{ pausa_id: string }>("select pausa_id from public.abrir_pausa_de_proveedor('heygen', 'cuota', 'e2e')")
  await pool.query("select public.abrir_pausa_de_proveedor('voyage', 'llave', 'e2e')")
  await page.goto("/")
  const atencion = page.getByRole("region", { name: "Necesita atención" })
  await expect(
    atencion.getByText("Los videos están en pausa: la cuenta de HeyGen se quedó sin créditos. WAV ya lo está resolviendo."),
  ).toBeVisible()
  await expect(page.getByText(/Voyage|La Biblioteca está en pausa/)).toHaveCount(0)
  await capturar(page, "pausa-inicio", { completa: true })

  await pool.query("select public.cerrar_pausa_de_proveedor($1)", [rows[0]?.pausa_id])
  await page.reload()
  await expect(page.getByText(/Los videos están en pausa/)).toHaveCount(0)
})
```

Run: `pnpm exec playwright test --project=app tests/e2e/pausas.spec.ts && pnpm exec playwright test --project=app tests/e2e/inicio.spec.ts`
Expected: PASS (Inicio without pauses unchanged).

- [ ] **Step 6: Commit** `lib/dominio/pausas.ts`, `lib/datos/pausas.ts`, `lib/datos/inicio.ts`, `lib/inicio/modelo.ts`, `app/(app)/page.tsx` and the three test files; message `Show open provider pauses in Inicio's attention block` + footer.

### Checkpoint, lote 5

- [ ] `pnpm test:run`, `pnpm test:db`, `pnpm test:e2e`, `pnpm type`, `pnpm lint`, `pnpm build` green.
- [ ] `grep -rn $'\xe2\x80\x94' app lib tests/e2e/pausas.*` shows nothing added by this branch (`git diff main --stat` then grep the changed files).
- [ ] Batch review of lote 5, plus a UX pass on the captures (desktop uses the width; the pause text reads as information, not as an error; no doubled text).
- [ ] Send Federico the captures of Tasks 21 and 22 (phone and desktop). Visual baselines (`toHaveScreenshot`) are added only after he approves them, in a separate commit `Add visual baselines for provider pauses`.

---

# Lote 6: release (1 task)

### Task 23: migration, Trigger deploy, app

- [ ] **Step 1: PR and CI.** Push the branch only when Federico asks; open the PR against `main` with "Part of #96" and the plan link; CI green; reviews approved; the issue moved on the project board.
- [ ] **Step 2: Migration dry-run.** `supabase db push --dry-run` against production lists exactly `20261107000100_pausas_de_proveedor.sql` and nothing else. It only adds (a table, an index, three functions, a wider `avisos_tipo_check`), so under the release rule Claude may push it: `supabase db push`, then verify `select count(*) from public.pausas_de_proveedor` answers 0 and the constraint includes `pausa_cerrada`.
- [ ] **Step 3: Trigger deploy, with Federico's explicit OK.** Ask him in the conversation; only after his yes run the Trigger.dev deploy of `trigger/` (the tasks now open pauses and the frequent maintenance has the `pausas` step). Trigger goes before the app (spec, Release): a task that opens a pause writes a text the old app shows as a plain failure, acceptable for the minutes in between. Confirm in the dashboard that the next `mantenimiento-frecuente` run returns `pausas: { cerradas: [], abiertas: [] }`.
- [ ] **Step 4: App merge.** Merge to `main` (Vercel publishes); wait for the deploy and verify live: `/guion/<some id>` renders, `/biblioteca/semana` shows «Proponer ahora» enabled (no pause open). Report to Federico what was published, with the migration name, the Trigger version and the app commit.
- [ ] **Step 5: Baselines.** If Federico approved the captures, the baseline commit goes in this PR before the merge; if not, it waits for a follow-up.

---

## Self-review notes

- Spec coverage: decision 1 (Tasks 3 to 6, A2 to A4), decision 2 (Task 7, A1), decision 3 (Tasks 9 to 13, texts in Task 1, no push to Coni in Tasks 9 to 11), decision 4 (Tasks 14, 17 to 20, A5, A6, A8), decision 5 (Tasks 15 and 16, A7, A9), Inicio lines (Task 22, A10), Release (Task 23), Testing (units in Lote 1 and Tasks 15, 18 to 20, 22; integration in Lotes 2 to 5; E2E in Tasks 21 and 22).
- Names used across tasks: `PausaDeProveedor`, `TEXTO_PAUSA`, `TEXTO_PAUSA_CERRADA`, `TEXTO_PAUSA_DE_BIBLIOTECA`, `textoDePausa`, `textoDePausaDeBiblioteca`, `proveedorDelTextoDePausa`, `esTextoDePausa`, `leerPausasAbiertas`, `exigirSinPausa`, `exigirBibliotecaSinPausa`, `leerPausasParaCerrar`, `abrirPausa`, `chequearProveedor`, `cerrarPausas`, `traducirErrorDeClaude`, `pausaDeElevenlabs`, `lineaDePausaDeInicio`, `leerPausasDeInicio`, `bloqueoCambios`.
- Out of scope (spec): LinkedIn and Instagram tokens, redoing work after a pause, a WAV dashboard, balance alerts before failing, and «Avisar a Federico» (part 2).
