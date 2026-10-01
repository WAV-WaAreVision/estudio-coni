# Plan 3b: Video production — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** After Coni approves the script and voice (gate 1), a background task renders the avatar video in HeyGen v3 without ever paying twice, burns the approved script as subtitles in Instagram's safe zone with ffmpeg + libass + Montserrat, checks the result, stores it in Cloudflare R2 and moves the piece to `video_por_aprobar`.

**Architecture:** Same layering as Plan 3a. `lib/proveedores/heygen-api.ts` (HTTP v3), `lib/proveedores/almacen.ts` gains the real R2 implementation, `lib/video/` holds ffmpeg/ffprobe wrappers and pure video checks, `lib/produccion/grabar.ts` orchestrates with injected dependencies, `trigger/grabar-pieza.ts` is the thin Trigger.dev task (wait token for HeyGen's callback). Writes go through the database as `service_role`; Plan 2's triggers still guard the gates.

**Sources:** design doc (`~/Projects/coni-heygen/docs/designs/plataforma-coni.md`): "Piezas técnicas" (Video, Subtítulos, Chequeos del video, Almacenamiento), "Reintentos seguros", A10 (callback only wakes the task; always read the video status by id; token timeout 60 min), Q3 (Montserrat, explicit `fontsdir`, `fontselect` check), P1 (`medium-1x` or larger), D5 (R2 private, signed URLs, retention). `scripts/coni.py` lines 471-517 (`bajar_srt`, `cmd_subtitulos`, ffmpeg arguments, 32 MB HeyGen asset limit). HeyGen evidence from `coni-heygen`: `POST /v3/videos`, `GET /v3/videos/{id}` (fields `id`, `status`, `duration`, `video_url`, `subtitle_url`, `failure_code`, `failure_message`), asset upload for Ruta B audio. Plan 1/2/3a execution notes.

**Rules specific to this plan:** HeyGen only through v3 endpoints (repo rule: no v1/v2). Verify every HeyGen path, header and field against the official docs (`https://developers.heygen.com` reference pages) with WebFetch before writing the adapter, and cite the doc URL in a comment above each call; if a needed capability (asset upload, callback URL) has no v3 endpoint, stop and report BLOCKED instead of using v1/v2. Do not download fonts or binaries: the Montserrat file is added by the controller; tests that need it skip with a clear message when it is absent. Never call real HeyGen, R2 or ElevenLabs; MSW and fakes only.

---

### Task 1: HeyGen v3 adapter

**Files:** `lib/proveedores/heygen-api.ts`, `tests/unit/heygen-api.test.ts`.

- `subirAsset({ clave, datos, tipo })` → `assetId` (Ruta B audio; reject > 32 MB before calling, `FallaDeConfiguracion` is wrong here: use a plain `Error` with the size).
- `crearVideo({ clave, pedido: PedidoHeygen, callbackUrl? })` → `videoId`. Include the callback field only if the v3 docs define one.
- `leerVideo({ clave, videoId })` → `{ estado: "pendiente" | "procesando" | "listo" | "fallido", videoUrl?, subtitleUrl?, duracion?, fallo?: { codigo, mensaje } }` mapped from the documented statuses.
- `bajar(url)` → bytes (signed URLs, no auth header).
- Errors: `mensajeErrorHeygen` for bodies; `content_policy_violation` (as failure code on the video, or as a 400 on create, whichever the docs show) → `PoliticaDeContenido extends Falla` with a Coni-facing message ("HeyGen no aceptó una frase del guion. Revísalo y vuelve a aprobarlo."); 401/403 → `FallaDeConfiguracion`; 429/5xx/network → plain `Error`. The key never appears in messages.
- MSW tests for every call (exact method, URL, auth header name from the docs, body), the status mapping, each error class, the size guard.
- [ ] Commit "feat(proveedores): HeyGen v3 assets, videos and status".

### Task 2: R2 storage

**Files:** `lib/proveedores/almacen.ts`, `tests/unit/almacen-r2.test.ts`, `.env.example`.

- `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`.
- Extend `Almacen` with `bajar(clave): Promise<Uint8Array>` and `borrar(clave): Promise<void>`; update `almacenEnMemoria()`.
- `almacenR2({ cuenta, llave, secreto, balde })`: endpoint `https://<cuenta>.r2.cloudflarestorage.com`, region `"auto"`; `urlFirmada` via the presigner (GET, `segundos` expiry). `almacenReal()` builds it from `exigirEnv("R2_ACCOUNT_ID" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET", ...)` instead of throwing; add the four names (no values) to `.env.example`.
- Tests: presigned URL host, path, `X-Amz-Expires`; put/get/delete with MSW intercepting the R2 host (the AWS SDK uses Node's http module; MSW's node interceptor covers it — if it does not, inject a custom `requestHandler` and say so); errors surface as plain `Error` without secrets.
- [ ] Commit "feat(proveedores): Cloudflare R2 storage".

### Task 3: Subtitles burn and video checks

**Files:** `lib/video/ffmpeg.ts`, `lib/video/chequeos.ts`, `tests/unit/chequeos-video.test.ts`, `tests/integration/ffmpeg.test.ts`, `assets/fuentes/README.md`.

- `chequeos.ts` (pure): `revisarVideo(info: { duracion: number; ancho: number; alto: number; conAudio: boolean; bytes: number })` → hallazgos (all `bloquea`): duration 5 to 90 s, exactly 1080×1920, audio present, under 300 MB (design "Chequeos del video"). `infoDesdeFfprobe(json)` parses `ffprobe -v error -show_streams -show_format -of json`.
- `ffmpeg.ts`: `buscarFfmpeg()` (env `CONI_FFMPEG`, then `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`, `/usr/local/opt/ffmpeg-full/bin/ffmpeg`, then `ffmpeg` on PATH; must list the `subtitles` filter, like `coni.py buscar_ffmpeg`), `quemarSubtitulos({ ffmpeg, video, ass, fontsdir })` → final mp4 bytes, run in a temp dir with the same encoding args as `coni.py` (`libx264 -preset medium -crf 21 -pix_fmt yuv420p -c:a copy -movflags +faststart`) and `subtitles=subtitulos.ass:fontsdir=<dir>`; `fuenteElegida({ ffmpeg, ass, fontsdir })` runs a 1-frame render with `-v verbose` and returns the font libass selected (parse the `fontselect` line); `sondear({ ffprobe, bytes })` → `infoDesdeFfprobe`. Use `execFile` (no shell), surface ffmpeg's last 400 stderr chars in errors.
- `assets/fuentes/README.md`: says `Montserrat-Bold.ttf` (OFL, from github.com/JulietaUla/Montserrat) and `OFL.txt` belong here and why (Q3). Do not download them.
- Integration (`tests/integration/ffmpeg.test.ts`, skipped when no ffmpeg with libass is found): generate a 6 s 1080×1920 clip with lavfi (`color` + `sine`), burn the ASS from `assDe` for two cues, `sondear` it and pass `revisarVideo`; a 3 s clip fails duration. Font test: when `assets/fuentes/Montserrat-Bold.ttf` exists, `fuenteElegida` returns Montserrat Bold; otherwise `it.skip` with the reason in the title.
- [ ] Commit "feat(video): burn subtitles with libass and check the result".

### Task 4: `grabar-pieza` orchestration and task

**Files:** `lib/produccion/grabar.ts`, `lib/datos/repositorio.ts`, `trigger/grabar-pieza.ts`, `trigger.config.ts`, `supabase/migrations/20261001001000_grabacion.sql` (only if columns are needed), `tests/integration/grabar.test.ts`.

`grabarPieza(deps, piezaId)`, deps = `{ db, heygen: { clave }, almacen, quemar, sondear, esperarRender: (videoId) => Promise<void>, callbackUrl?: string, ahora }`:
1. Read the piece. Not `en_render` → `{ resultado: "nada_que_hacer" }`. `puedeGrabar(pieza, hashPuerta1({ guion, audioId }))` not ok → record nothing, return `{ resultado: "sin_aprobacion" }` (never spend).
2. If `render_id` is set (a previous attempt already created the video), skip to step 5: never `POST /v3/videos` twice for the same attempt. Note Plan 3a: `cambiar_guion`/`regrabar` keep a stale `render_id`; clear it when entering `en_render` from `video_por_aprobar` (regrabar) — add that to the write in this task or a DB rule, and test it.
3. Reserve HeyGen spend: key `claveIdempotencia({ piezaId, paso: "grabar", hash: puerta1.hash, intento })`, estimate from `estimarSegundos(guion)` × a documented credit rate assumption (avatar_v 48 credits/min; record the USD-per-credit assumption as a constant). `tope_alcanzado` → `explicacion`, return `{ resultado: "tope" }`. Confirmed/liberado reservation for this key → do not create again.
4. Read Coni's HeyGen key (`leer_secreto("heygen")`), download the voice from storage (`audioId`), `subirAsset`, `armarPedido({ config, guion, titulo, audioAssetId })`, `crearVideo` with `callbackUrl`, then immediately write `render_id` (version + 1) before waiting. Policy rejection on create → `transicionar(..., politica_contenido)`, release spend, return.
5. `await deps.esperarRender(videoId)` (the task passes a Trigger.dev wait-token wait with 60 min timeout; the callback only wakes it), then ALWAYS `leerVideo` (A10). `pendiente`/`procesando` after the wait → plain `Error` (retry re-reads). `fallido` with policy code → `politica_contenido` + release; other failure → `falla_produccion` with a Coni-facing explanation + release.
6. `listo` → `transicionar(render_entregado)` (→ `subtitulando`) and confirm the spend; download the video and the SRT (`subtitleUrl`), `alinearConGuion(leerSrt(srt), guion)` → `assDe` → `quemar` → `sondear` → `revisarVideo`; blocking finding → `falla_produccion` ("El video no pasó los chequeos: ..."); else upload to `videos/<piezaId>/<sha256>.mp4`, `transicionar(video_listo, { videoId: clave })`. The raw HeyGen video is not stored (design: raw deleted after burning).
7. Any `Falla` after `subtitulando` → `falla_produccion` with its message. `FallaDeConfiguracion` → rethrow.
- `trigger/grabar-pieza.ts`: `schemaTask` with `machine: "medium-1x"` (P1), `queue: { concurrencyLimit: 1 }`, retries like `producir-pieza` (use the same `decisionDeReintento`), `esperarRender` implemented with `wait.createToken({ timeout: "60m" })` + `wait.forToken(token)` and `callbackUrl = token.url` (verify the v4 API names in `node_modules/@trigger.dev/sdk`; adapt and note).
- `trigger.config.ts`: build extensions `ffmpeg()` and `additionalFiles({ files: ["./assets/fuentes/**"] })` from `@trigger.dev/build` (add as dev dependency); set `CONI_FONTSDIR` usage so `fontsdir` points at the copied folder in the container.
- Integration tests (local DB, MSW for HeyGen, in-memory storage, fake `quemar`/`sondear`, `esperarRender` resolved immediately): happy path to `video_por_aprobar` with `video_id` stored and the final file in storage, spend confirmed, events as service_role; retry with `render_id` set does not call `POST /v3/videos` again; no gate-1 approval (hash mismatch) → no HTTP calls, no spend; policy failure → back to `guion_por_aprobar` with explanation and spend released; generic HeyGen failure → `error_produccion`; status still processing after the wait → throws, nothing written; failed checks → `error_produccion`; spend cap → explanation, no HTTP.
- [ ] Commit "feat(produccion): grabar-pieza renders, subtitles and stores the video".

### Task 5: Verification and notes

- [ ] Run `pnpm test:run`, `pnpm test:db`, `pnpm lint`, `pnpm type`, `pnpm build` separately. Append "Execution notes" (deviations, HeyGen doc URLs used, assumptions: credit rate, callback field; carried items for Plan 4: reconciliation of `en_render` pieces older than 15 min, R2 retention jobs, stale `reservado` sweeper). Commit "docs(plan): plan 3b execution notes".
