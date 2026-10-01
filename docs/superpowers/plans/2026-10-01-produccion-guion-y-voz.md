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
