# Plan 3a: Script and voice production — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From a chosen idea, a background task writes the script and caption with Claude, reviews them (deterministic rules plus a Claude check), generates Coni's voice with ElevenLabs, stores the audio, reserves and confirms spend, and moves the piece to `guion_por_aprobar` through the domain state machine. Everything runs and is tested locally: HTTP providers mocked with MSW, the database is the local Supabase from Plan 2.

**Architecture:** Pure rules in `lib/dominio/revision.ts`. Provider adapters in `lib/proveedores/` (`config.ts` zod boundary, `anthropic.ts`, `elevenlabs.ts`, `almacen.ts`). Orchestration in `lib/produccion/producir.ts` as `producirPieza(deps, piezaId)` with injected dependencies; `trigger/producir-pieza.ts` is a thin Trigger.dev v4 `schemaTask` that builds the real dependencies. Tasks write through the database as `service_role`, so Plan 2's triggers keep enforcing the gates.

**Tech Stack:** `@anthropic-ai/sdk` (model `claude-opus-5-5`, structured outputs via `zodOutputFormat`, prompt caching, `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`), `zod`, `@trigger.dev/sdk` v4, `msw` v2, `@supabase/supabase-js`, Vitest 4.

**Sources:** design doc `~/Projects/coni-heygen/docs/designs/plataforma-coni.md` ("Revisión automática", "Reintentos seguros", "Tope de gasto", Q2, Q5, A12); editorial guide `~/Projects/coni-heygen/contenido/linea-editorial.md`; `~/Projects/coni-heygen/scripts/coni.py` (`cmd_voz` 414-444, `error_elevenlabs` 92-101) and `tests/test_coni.py` (`TestVerificarElevenLabs`, `TestVoz`); Plan 1 and Plan 2 execution notes (carried items).

**Conventions:** as Plans 1 and 2. TDD per task; one commit per task; `pnpm lint`, `pnpm type`, `pnpm test:run`, `pnpm test:db` run separately before each commit. Coni-facing strings in Chilean Spanish without em dashes. No real keys anywhere; MSW intercepts every external call in tests (`onUnhandledRequest: "error"` except the local Supabase host, which must bypass).

---

### Task 1: Dependencies, Trigger.dev config and the production config boundary

**Files:** `package.json`, `trigger.config.ts`, `lib/proveedores/config.ts`, `tests/unit/config-produccion.test.ts`, `tests/fixtures/coni.config.json`.

- [ ] `pnpm add zod @anthropic-ai/sdk @trigger.dev/sdk @supabase/supabase-js` (supabase-js may already be present) and `pnpm add -D msw`.
- [ ] `trigger.config.ts` (Trigger.dev v4 `defineConfig`): `project: process.env.TRIGGER_PROJECT_REF ?? "proj_estudio_coni_local"` (comment: the real ref arrives with the WAV Trigger.dev project), `dirs: ["./trigger"]`, `maxDuration: 900`, default retries `{ maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60000, randomize: true }`. Make sure `tsc` and `next build` accept it.
- [ ] Copy `~/Projects/coni-heygen/coni.config.json` to `tests/fixtures/coni.config.json` (ids are not secrets; its `_nota` says so).
- [ ] `lib/proveedores/config.ts`: `leerConfigProduccion(valor: unknown): ConfigCompleta` with zod. `ConfigCompleta = ConfigProduccion & { elevenlabs: ConfigElevenlabs }` (reuse `ConfigProduccion` from `lib/proveedores/heygen.ts`). Rules (Plan 1 carried items): keys starting with `_` are ignored; `ruta_voz` enum `heygen | elevenlabs`; `motor` enum `avatar_iv | avatar_v | null`; every id field: `"PENDIENTE"`, `""`, missing → `null`; `ajustes_elevenlabs` strict object (`model`, `stability`, `similarity_boost`, `style`, `use_speaker_boost`; unknown key → error) or null; `velocidad` number or null; `elevenlabs` = `{ voice_id, model_id (default "eleven_multilingual_v2"), voice_settings? (strict: stability, similarity_boost, style, use_speaker_boost, speed), output_format (default "mp3_44100_128") }`. On failure throw `FallaDeConfiguracion` listing the zod issue paths (no values).
- [ ] Tests: the real fixture parses (Ruta B, avatar_v, reference set, heygen.voice_id → null); unknown ElevenLabs key rejected; `ruta_voz: "ElevenLabs"` rejected; `motor: "avatar_V"` rejected; missing `velocidad` → null; error is `FallaDeConfiguracion` and does not contain the offending value.
- [ ] Commit "feat(proveedores): validate the production config at the boundary".

### Task 2: Deterministic review (T5, part 1)

**Files:** `lib/dominio/revision.ts`, `tests/unit/revision.test.ts`.

```ts
export type Regla = "cierre" | "simbolos" | "aviso_avatar" | "lineas_ayuda" | "largo" | "numeros"
export interface Hallazgo { regla: Regla | ReglaClaude; tipo: "bloquea" | "advierte"; mensaje: string; frase?: string }
export type ReglaClaude = "diagnostico" | "caso_particular" | "lenguaje_explicito" | "cifra_sin_verificar" | "tema_de_riesgo"
export const CIERRE = "Soy Coni del Rosario."
export const AVISO_AVATAR = "Video hecho con mi avatar digital."
export const LINEAS_AYUDA = "Líneas de ayuda en Chile: Fono 1455 (violencia contra la mujer), *4141 (prevención del suicidio, gratis, 24 horas) y 133 (emergencias)."
export function revisarGuion(entrada: { guion: string; texto: string; esAvatar: boolean; requiereLineasAyuda: boolean }): Hallazgo[]
export function bloquea(hallazgos: readonly Hallazgo[]): boolean
```
Rules (from `linea-editorial.md` lines 31-56 and the design table "Revisión automática"):
- `cierre` (bloquea): trimmed script must end with `CIERRE`. Message: "El guion tiene que terminar con «Soy Coni del Rosario.»".
- `simbolos` (bloquea): no emoji (`\p{Extended_Pictographic}`), no `#`, `@`, and none of `* _ ~ ^ = < > { } [ ] \ | / % $ & +` in the script (also closes the Plan 1 carried item on `{`, `}`, `\` before credits are spent). `frase` = the first offending character. Message: "Sin emojis, hashtags ni símbolos en el guion: van solo en la publicación."
- `aviso_avatar` (bloquea, only if `esAvatar`): caption contains `AVISO_AVATAR`.
- `lineas_ayuda` (bloquea, only if `requiereLineasAyuda`): caption contains `1455`, `*4141` and `133`.
- `largo` (advierte): 75 to 150 words (`palabras` from `estimaciones.ts`); message includes the count.
- `numeros` (advierte): any digit in the script. Message: "Escribe los números con palabras (tres señales, no 3 señales)."
Tests: one passing script; each rule fails in isolation with the right `tipo`; `bloquea()`; the two real scripts in `tests/fixtures/goldens/*/guion.txt` produce no `bloquea` hallazgos (check what they actually produce and assert exactly that).
- [ ] Commit "feat(dominio): deterministic script and caption review".

### Task 3: ElevenLabs adapter (T6, voice)

**Files:** `lib/proveedores/elevenlabs.ts`, `tests/unit/elevenlabs.test.ts`, `tests/msw.ts` (shared MSW server helper).

- `generarVoz({ clave, config: ConfigElevenlabs, texto, base? })`: `POST {base}/v1/text-to-speech/{voice_id}?output_format={output_format}` with headers `xi-api-key`, `Content-Type: application/json`, `Accept: audio/mpeg`; body `{ text, model_id, voice_settings? }` (same as `coni.py` `cmd_voz`). Returns `Uint8Array`. `base` defaults to `process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io"`.
- `verificarVoz({ clave, voiceId, base? })`: `GET {base}/v1/voices/{voiceId}` → `{ ok: true, nombre }` or `{ ok: false, motivo }` (port of the `verificar` ElevenLabs check: `TestVerificarElevenLabs`, 2 cases; read them in `~/Projects/coni-heygen/tests/test_coni.py` and port inputs/outputs).
- `mensajeErrorElevenlabs(cuerpo: string)`: port of `error_elevenlabs` (`detail` dict → `status · message`, string `detail`, else raw body capped at 400, `"sin detalle"`), same never-empty rule as `mensajeErrorHeygen`.
- Errors: 401/403/404/422 → `FallaDeConfiguracion("ElevenLabs respondió HTTP <n>: <motivo>")`; 429 and 5xx and network errors → plain `Error` (retryable by Trigger.dev). The API key never appears in any message (test it).
- MSW tests: success returns the bytes and sends the exact URL, headers and body; voice_settings omitted when absent; 401 with `{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}` → `FallaDeConfiguracion` with "invalid_api_key · Invalid API key" and without the key; 500 → plain `Error`; the 2 ported verify cases.
- [ ] Commit "feat(proveedores): ElevenLabs voice and verification".

### Task 4: Claude adapter and evals (T5 Claude check, T6 script)

**Files:** `lib/proveedores/anthropic.ts`, `tests/unit/anthropic.test.ts`, `tests/eval/guion.eval.ts`, `vitest.eval.config.ts`, `tests/fixtures/ideas-eval.json`.

Load and follow the `claude-api` skill conventions: model `claude-opus-5-5`; `client.beta.messages.parse` (or the documented beta-compatible zod helper) with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`; check `stop_reason === "refusal"` before reading output; typed SDK errors only (no string matching).

- `escribirGuion({ cliente, guia, idea, requiereLineasAyuda, correcciones? })` → `{ guion, texto, uso }`. `system`: one text block with the editorial guide and `cache_control: { type: "ephemeral" }` (stable prefix, nothing volatile in it); the volatile idea goes in the user message. `output_config: { effort: "medium", format: zodOutputFormat(z.object({ guion: z.string(), texto: z.string() })) }`. The user message states the hard rules (closing line, 75 to 150 words, numbers in words, no symbols in the script, caption ends with `AVISO_AVATAR`, include `LINEAS_AYUDA` when required, idea alerts verbatim) and, when `correcciones` is given, the hallazgos to fix.
- `revisarConClaude({ cliente, guion, texto, alertas })` → `Hallazgo[]` of `ReglaClaude`, all `tipo: "advierte"`, each with the flagged `frase`. `effort: "low"`. Same guide block cached.
- Refusal after fallback → `Falla("Claude no quiso escribir este guion. Prueba con otra idea.")` (Coni-facing). `parsed_output` null or `max_tokens` → plain `Error` (retryable). Auth errors → `FallaDeConfiguracion`.
- Cost: `costoClaude(uso)` from `usage` with the Opus 5.5 prices ($4 input, $20 output, cache read $0.20, cache write 1.25× input per MTok), unit-tested.
- MSW tests (intercept `https://api.anthropic.com/v1/messages`): request has the model, the beta header, `fallbacks: "default"`, `effort`, `cache_control` on the system block, the idea only in `messages`; a crafted response is parsed; refusal → `Falla`; 401 → `FallaDeConfiguracion`; 529/500 → plain `Error`.
- Evals (real API, skipped unless `RUN_EVALS=1` and a key is available): `vitest.eval.config.ts` includes `tests/eval/**`; script `test:eval`. Fixture: 10 ideas from `~/Projects/coni-heygen/contenido/ideas/banco.md` (2 per pillar, at least 3 tagged "verificar dato", 2 tagged "líneas de ayuda"). Eval 1: every generated script has no `bloquea` hallazgo after at most one correction round. Eval 2: `revisarConClaude` flags `cifra_sin_verificar` on at least 2 of the 3 "verificar dato" ideas. Print cost per run. Do NOT run the evals in this plan (they spend money); only make sure they are skipped by default and type-check.
- [ ] Commit "feat(proveedores): Claude script writer and review with evals".

### Task 5: Storage, guide and review columns

**Files:** `supabase/migrations/20261001000700_produccion.sql`, `supabase/seed.sql`, `lib/proveedores/almacen.ts`, `tests/unit/almacen.test.ts`, `tests/integration/produccion-esquema.test.ts`.

- Migration: `alter table public.piezas add column revision jsonb not null default '[]'::jsonb;` and `create table public.guias (version integer primary key, texto text not null, vigente boolean not null default false, creada_en timestamptz not null default now())` with a partial unique index on `vigente` where true, RLS (Coni and maintainer read; nobody else writes; service_role bypasses), audit trigger (`registrar_evento`).
- Seed: insert `contenido/linea-editorial.md` as guide version 1 (`vigente = true`). Generate the SQL literal safely (dollar quoting) from the file at authoring time and commit it inside `seed.sql`.
- `lib/proveedores/almacen.ts`: `interface Almacen { subir(clave: string, datos: Uint8Array, tipo: string): Promise<void>; urlFirmada(clave: string, segundos: number): Promise<string> }` and `almacenEnMemoria()` for tests. The R2 implementation is Plan 3b.
- `claveAudio(piezaId, mp3)`: `voces/<piezaId>/<sha256 of bytes>.mp3` (content-addressed, so a regenerated voice gets a new id and voids gate 1).
- Tests: in-memory store round trip; `claveAudio` deterministic; integration: `revision` column default, `guias` single vigente, RLS for Coni/maintainer/other.
- [ ] Commit "feat(db): guide and review storage for production".

### Task 6: `producir-pieza` orchestration and task (T6)

**Files:** `lib/produccion/producir.ts`, `lib/datos/repositorio.ts`, `trigger/producir-pieza.ts`, `tests/integration/producir.test.ts`.

`producirPieza(deps, piezaId)`, deps = `{ db: SupabaseClient (service role), claude: Anthropic, almacen: Almacen, ahora: () => string, base?: { elevenlabs?: string } }`. Steps:
1. Read the piece; if it is not `guion_en_proceso`, return `{ resultado: "nada_que_hacer" }` (idempotent re-runs). Read its idea, the vigente guide and `ajustes` (`leerConfigProduccion(ajustes.produccion)`).
2. Reserve Claude spend: `rpc("reservar_gasto", { p_pieza, p_proveedor: "anthropic", p_paso: "guion", p_estimado: 0.5, p_clave: claveIdempotencia({ piezaId, paso: "producir", hash: hashTexto(\`claude:${piezaId}\`), intento }) })`. On `tope_alcanzado` write only `explicacion = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."` (version + 1) and return `{ resultado: "tope" }`. If the reservation returned is `liberado` or `confirmado` (Plan 2 note), do not spend again for that key.
3. `escribirGuion` → `revisarGuion` (`requiereLineasAyuda` from the idea's alerts); if it blocks, one more `escribirGuion` with `correcciones`; then `revisarConClaude`; if Claude flags `tema_de_riesgo`, re-run `revisarGuion` with `requiereLineasAyuda: true`. Store all hallazgos in `revision`. Confirm the Claude reservation with `costoClaude`.
4. Read Coni's ElevenLabs key with `rpc("leer_secreto", { p_nombre: "elevenlabs" })` (missing → `FallaDeConfiguracion`); reserve ElevenLabs spend (estimate from characters; document the rate constant and its source as an assumption); `generarVoz`; `almacen.subir(claveAudio(...))`; confirm.
5. `transicionar(piezaDesdeFila(fila), { tipo: "guion_listo", audioId })`, then one `update` with `cambiosDesdePieza(...)`, `guion`, `texto`, `revision`, `where id = piezaId and version = oldVersion`. Zero rows updated → `Error("La pieza cambió mientras se producía.")` (retry reads fresh).
6. Claude refusal (`Falla`) → write `explicacion` with its message, release the reservation, return `{ resultado: "rechazado" }`. `FallaDeConfiguracion` → rethrow (Trigger marks failed, WAV alert in Plan 4).
- `lib/datos/repositorio.ts`: the small typed read/write helpers this needs (no generic ORM).
- `trigger/producir-pieza.ts`: `schemaTask({ id: "producir-pieza", schema: z.object({ piezaId: z.string().uuid() }), run: ({ piezaId }) => producirPieza(depsReales(), piezaId) })`, where `depsReales()` builds a service-role supabase client from `exigirEnv("SUPABASE_URL", ...)` / `exigirEnv("SUPABASE_SERVICE_ROLE_KEY", ...)` and an Anthropic client with Coni's key from `leer_secreto("anthropic")`. Add the two env names to `.env.example` (no values).
- Integration tests (local DB + MSW for Anthropic and ElevenLabs + `almacenEnMemoria`; service-role key from `supabase status -o env` exposed to tests through `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` set in `vitest.integration.config.ts` from a helper that runs `supabase status -o json` once, or documented env vars): happy path (piece ends in `guion_por_aprobar` with `audio_id`, `guion`, `texto`, `revision`; two `gastos` rows `confirmado`; `eventos` rows with `actor_rol = service_role`; audio bytes stored under `claveAudio`); a blocking first draft triggers exactly one correction round; spend cap reached → `explicacion`, no Claude call; refusal → `explicacion`, reservation `liberado`; re-run on a piece already in `guion_por_aprobar` → `nada_que_hacer`, no HTTP calls; Coni's ElevenLabs key missing → `FallaDeConfiguracion`.
- [ ] Commit "feat(produccion): producir-pieza writes script, review and voice".

### Task 7: Verification and notes

- [ ] Run `pnpm test:run`, `pnpm test:db`, `pnpm lint`, `pnpm type`, `pnpm build` separately. Append "Execution notes" (deviations, carried items: real R2 in 3b, evals not yet run, ElevenLabs rate assumption). Commit "docs(plan): plan 3a execution notes".

## Execution notes (2026-10-01)

The code on `feat/produccion-guion-y-voz` is the source of truth; these reviewed deviations supersede the plan text above. Final counts: 514 unit tests (350 before), 137 integration tests (99 before), `pnpm lint`, `pnpm type` and `pnpm build` clean, `pnpm test:eval` skips all 11 evals.

### Deviations

- Task 1: `msw` is pinned to `^2` (3.0.0 is what `pnpm add` picks, but `@vitest/mocker` wants `^2.4.9`) and `pnpm-workspace.yaml` sets `allowBuilds: msw: false`: its postinstall only builds the browser worker, and an unapproved build script makes `pnpm install --frozen-lockfile` fail in CI. Versions: zod 4.6.5, `@anthropic-ai/sdk` 0.129.0, `@trigger.dev/sdk` 4.6.4. `leerConfigProduccion` names the invalid paths (and the unknown keys of the strict objects), never values; a missing `elevenlabs` section gets the defaults with `voice_id: null`; `heygen` and `ruta_voz` are required, so `{}` is rejected.
- Task 2: `revision.ts` also exports `Alerta`, `pideLineasDeAyuda` and the `REGLAS_CLAUDE` tuple (`ReglaClaude` derives from it, so the zod enum and the type cannot drift). Assumed shape of `ideas.alertas`: `[{ tipo, texto }]`, one entry per type, `tipo` exactly as in the bank (`verificar dato`, `líneas de ayuda`, `no es terapia`, `nota`). The bank joins types in one cell (`líneas de ayuda · verificar dato`); the import script of Q6 must split them.
- Task 3: MSW runs in every test file through `tests/setup-msw.ts` (unit and integration configs). The local Supabase passes through with `passthrough()` handlers, not with an `onUnhandledRequest` callback: in MSW 2.15 a callback that calls `print.error()` logs the error but still sends the request to the real network (reproduced), so only the built-in `"error"` strategy blocks, and `tests/unit/msw.test.ts` pins that. `mensajeErrorElevenlabs` lives in `errores.ts` with the HeyGen one. Every 4xx except 408 and 429 is a `FallaDeConfiguracion` (the plan listed 401/403/404/422; 400 and 402 do not change on retry either); the key is redacted from error bodies before they are parsed and capped, and an empty audio is a plain `Error`.
- Task 4: structured calls use `beta.messages.create` with `betaZodOutputFormat` and parse by hand after the `stop_reason` check, not `beta.messages.parse`: `parse` reads the text first and throws `AnthropicError` on the half-written JSON a refusal can carry, so the refusal was never seen (test "treats a refusal as a refusal even when it carries half an answer"). `escribirGuion` returns `{ guion, texto, uso }` and `revisarConClaude` returns `{ hallazgos, uso }` (the plan said `Hallazgo[]`; step 3 of Task 6 needs the usage to confirm the spend). The refusal is `RechazoDeClaude extends Falla`, so Task 6 can tell it from `TransicionInvalida`. A 4xx other than 408, 409 and 429 is a `FallaDeConfiguracion`. Eval 2 injects an invented statistic into the generated scripts of the first three `verificar dato` ideas, because a writer that follows the guide avoids figures and there would be nothing to flag; eval fixture: 10 ideas (5 `verificar dato`, 2 `líneas de ayuda`). `tests/fixtures/linea-editorial.md` is a copy of the guide for the evals and the seed test.
- Task 5: `supabase/seed.sql` carries the guide as a dollar-quoted literal; the integration test compares it with `tests/fixtures/linea-editorial.md`. `pnpm db:types` regenerated `database.types.ts` (new `guias` table, `revision` column).
- Task 6, state machine: `pedir_cambios` and `cambiar_guion` now bump `intento`. The spend keys are `piece + step + attempt`; without the bump a second script round (after Coni asks for changes) found the first round's confirmed reservation, was told not to spend again and resumed the old script. Same reasoning as Plan 1's `editar_texto` and `politica_contenido` bumps.
- Task 6, retries: the plan confirmed the Claude spend and then did the voice with nothing saved, so a transient ElevenLabs failure (the most likely retry) made the retry find a confirmed reservation with no script to resume from. The draft (`guion`, `texto`, `revision`) is now saved on the piece (version + 1, same state) before the Claude spend is confirmed; a confirmed reservation means "the draft is on the piece", a released one means "a refusal happened" (returns `rechazado` without asking again), a closed voice reservation is a `FallaDeConfiguracion`. The voice spend is confirmed after the final write, so a failed write is retried with the reservation still open. The final write stays one `update` with `cambiosDesdePieza`, `guion`, `texto` and `revision`.
- Task 6, order: everything that can be misconfigured (idea, guide, config, `elevenlabs.voice_id`, Coni's ElevenLabs key) is checked before any reservation, so a missing key spends nothing. The Claude key hash includes the idea id. `reservar_gasto` receives `deps.ahora()` as `p_ahora`. `leerConfigProduccion` runs on `ajustes.produccion` (the real fixture is inserted by the tests).
- Task 4 (after review): when a fallback served the request, `content` holds the declined model's output (possibly half a JSON), a `fallback` block and then the answer, so only the blocks after the last `fallback` block are read.
- Task 6, wiring: `depsReales()` lives in `lib/produccion/deps-reales.ts` and the task is a thin `schemaTask` whose `catchError` turns a `FallaDeConfiguracion` into `AbortTaskRunError` (no pointless retries). `almacenReal()` throws a `FallaDeConfiguracion` until Plan 3b, so a real run fails before spending. The integration tests take the service-role key from `supabase status -o json` (memoized) unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; `vitest.integration.config.ts` only gained the MSW setup file.
- Task 6 (after an independent review): the `catchError` hook returns `{ skipRetrying: true }` through `decisionDeReintento` (`lib/produccion/reintentos.ts`); the Trigger.dev executor reports a throw from `catchError` as an internal error that may still be retried, which the first version did. The task has `queue: { concurrencyLimit: 1 }` so a double trigger cannot run two rounds at once. Vault keys are trimmed when read (a pasted newline is an invalid header and looked like a network failure), `ajustes_faltantes` is a `FallaDeConfiguracion`, and the Claude client of `depsReales` has a 120 s timeout and one retry so three calls fit the 900 s of the task.

### Carried to later plans

- Plan 3b: R2 behind `Almacen` (`almacenReal`), HeyGen render with `armarPedido` only after the voice step, store HeyGen's render id before `POST /v3/videos`.
- Plan 4, from the review of Task 6 (not fixed here, by design or by size):
  - Nothing tells Coni when a run ends in `FallaDeConfiguracion` or exhausts its retries: the piece stays in `guion_en_proceso` without an `explicacion`. Add an `onFailure` hook that writes a generic one (version-guarded), the WAV alert, and decide who re-triggers `producir-pieza` after Coni raises the cap (`tope` returns normally).
  - Nothing outside the UI enforces `bloquea` findings: `aprobar_guion` checks only the hash. The Server Action (or a database check) must refuse gate 1 while `revision` has a blocking finding. A risky topic flagged only by Claude keeps its blocking `lineas_ayuda` finding (no second correction round, as the plan says), and the voice is paid for blocked scripts too.
  - A refusal on the review call discards a good paid script and leaves the piece in `guion_en_proceso`; the way out is another idea (the Claude key includes the idea id) or discarding it. Consider turning a review refusal into an `advierte` finding that keeps the draft, and an explicit restart event that bumps `intento`.
  - Retry accounting is per run: a run that fails after paying for the writer but before saving the draft repeats the writer on retry, and only the last run's cost is confirmed; a crash between saving the draft and confirming the spend repeats it too. An SQL function that saves the draft and confirms the spend in one transaction would close both. The voice has the same shape: the MP3 is not saved until the final write.
  - `confirmar_gasto` and `liberar_gasto` ignore a zero-row result; a voice reservation is never released, so a stale `reservado` row needs a sweeper.
  - `pedir_cambios` and `cambiar_guion` keep the old `guion`, `texto`, `revision` and (for `cambiar_guion`) `render_id`: Plan 3b's render must not trust `render_id` after a new script round.
  - `producirPieza` does not look at `ruta_voz`; a Ruta A config only fails on a missing `elevenlabs.voice_id`.
- Plan 4: Trigger.dev idempotency keys when triggering `producir-pieza` (two concurrent runs of the same round can both pay Claude; only the first final write wins); a failure hook that releases open reservations when a run is abandoned; the WAV alert for `FallaDeConfiguracion`; the Server Action that retries a piece left in `guion_en_proceso` with an `explicacion` (tope or refusal) must go through a new `intento` when the idea changes.
- Evals have not been run: the request shape the real API accepts (`output_config.format` with `effort`, `betas` plus `fallbacks: "default"`) is only checked against MSW. Run `RUN_EVALS=1 pnpm test:eval` with a real key once, read the printed cost, then trust or fix the prompts.
- ElevenLabs rate: `USD_POR_CARACTER_ELEVENLABS` (US$ 0.30 per 1,000 characters) is an assumption, and the confirmed amount equals the estimate; read the `character-cost` response header when Coni's plan is known.
- Claude cost when a fallback model served the answer is priced at Opus 5.5 rates; the fallback bills at its own, up to 25% more. A refusal on the review step, after the writer was paid, releases the whole reservation, so that call is not counted against the cap.
- If the confirm call fails after the final write, the voice reservation stays `reservado` (it counts its estimate against the cap) and the retry finds the piece finished; a reconciliation job closes it.
- A regenerated voice that fails the final write leaves its first MP3 orphaned in the store.
- The editorial guide now exists in three places (`coni-heygen/contenido/linea-editorial.md`, the fixture and the seed); only the last two are compared by a test.
