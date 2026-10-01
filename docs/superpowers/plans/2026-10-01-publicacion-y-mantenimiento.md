# Plan 4: Publishing and maintenance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Approved pieces are published to Instagram at the approved time (never outside the 30-minute window) as Reels labelled as AI, the publication is read back and confirmed; stuck pieces, stale spend, old files and backups are handled by scheduled maintenance; failures reach Coni (plain Spanish) or WAV (technical) through a notifier.

**Architecture:** Same layering as Plans 3a/3b: adapters in `lib/proveedores/`, orchestration in `lib/publicacion/` and `lib/mantenimiento/` with injected dependencies, thin Trigger.dev v4 tasks in `trigger/` (`schedules.task` crons). External services are mocked (MSW) or faked in tests; the local Supabase is used for integration tests.

**Sources:** design doc `~/Projects/coni-heygen/docs/designs/plataforma-coni.md`: "Fecha de publicación", "Reintentos seguros", "Avisos a Coni", D3/R1 (Graph API direct, `publicar-pendientes` every 5 min, `is_ai_generated`, read-back), A3 (late approved time never published), A6 (Meta app, token renewal), A9 (immediate alerts + 08:30 digest), A10 (reconcile `en_render` > 15 min), D5 (R2 retention), D6 (nightly `pg_dump` to R2, 30 days, alert on empty or < 80 % of previous), Q4 (UTC storage, `America/Santiago`). Execution notes of Plans 1, 2, 3a, 3b (carried items listed there).

**Rules:** Verify every Instagram Graph API call (Reels container create, status polling, `media_publish`, read-back fields, AI label field name, token refresh endpoint) against Meta's official docs with WebFetch and cite the URL above each call; if the AI label cannot be set through the API, implement the rest, mark the gap and report it. Never call real Meta, Resend, R2 or HeyGen. TDD, one commit per task, lint/type/test:run/test:db separately before each commit. No `as any`, `@ts-expect-error`, non-null assertions, silent catches. Coni-facing text in Chilean Spanish without em dashes.

---

### Task 1: Instagram adapter (T8)
`lib/proveedores/instagram.ts`: `crearContenedorReel({ token, cuentaId, videoUrl, texto, esAvatar })` (AI label set when `esAvatar`), `estadoContenedor`, `publicarContenedor` → `mediaId`, `leerPublicacion(mediaId)` (permalink, caption, AI label as returned), `renovarToken`. Error classes: expired/invalid token → `FallaDeConfiguracion` (and a typed `TokenVencido`), 4xx definitive → `FallaDeConfiguracion`, rate limit/5xx → plain `Error`, Coni-facing message for publish failures. MSW tests for each call and error. Commit "feat(proveedores): Instagram Graph API for Reels".

### Task 2: `publicar-pendientes` (T8)
`lib/publicacion/publicar.ts` `publicarPendientes(deps, ahora)`: select `programado` pieces with `puerta2_publicar_en <= ahora` using `for update skip locked` (via an SQL function `tomar_para_publicar(p_ahora)` in a new migration, service_role only, so two cron runs never take the same piece). Per piece: `puedePublicar(pieza, { hashTexto: hashTexto(texto), ahora })`; `hora_vencida` → `transicionar(hora_vencida)` + notify Coni; `antes_de_hora` skip; ok → signed R2 URL (`urlFirmada`, 1 h) → container → poll until finished (bounded) → publish → read back: caption must equal the approved text and, for avatar pieces, the AI label must be present; on success `transicionar(publicado)` and store `media_id`/`permalink` (migration adds columns); on failure `falla_publicacion` with explanation + notify. Never publish when the read-back can't be verified: mark `falla_publicacion` (WAV checks). Store the container id before publishing so a retry does not create a second container. `trigger/publicar-pendientes.ts`: `schedules.task` cron `*/5 * * * *`, `queue: { concurrencyLimit: 1 }`. Integration tests: on time → publicado; 31 min late → video_por_aprobar; read-back missing label → falla; container id reused on retry; two concurrent runs don't double-publish. Commit "feat(publicacion): publish approved reels on time".

### Task 3: Notifier and failure hooks (A9)
`lib/proveedores/avisos.ts`: interface `Notificador { aConi(mensaje, urgente) ; aWav(asunto, detalle) }`, `notificadorResend` (Resend REST over fetch, `RESEND_API_KEY`, from address env) and `notificadorEnMemoria`. Wire `onFailure` (or `catchError` final attempt) in `producir-pieza`, `grabar-pieza`, `publicar-pendientes`: `FallaDeConfiguracion`/unknown → WAV with technical detail; Coni gets a generic Spanish notice ("Algo falló al preparar tu video. WAV ya está revisando."). Commit "feat(avisos): alerts to Coni and WAV on task failure".

### Task 4: `mantenimiento` (T10, carried items)
`lib/mantenimiento/*.ts` + `trigger/mantenimiento.ts` (`schedules.task`, every 10 min for reconciliation; nightly 03:00 America/Santiago for the rest — two schedules or one task with branches):
- Reconcile `en_render` older than 15 min with a `render_id`: re-trigger `grabar-pieza` logic (read status, continue) — and `en_render`/`subtitulando` with no progress for 60 min → `falla_produccion` with explanation + notify.
- Stale spend: `reservado` rows older than 1 h whose piece already moved past the step → confirm at estimate; others older than 24 h → release.
- R2 retention: final videos 30 days after `publicado`, discarded pieces' files 30 days after `descartado`.
- Meta token: renew when it expires in < 10 days (secret `meta`), notify Coni when renewal fails or < 7 days left.
- Backup: `pg_dump` (via `postgresql-client` build extension; command injected as a dependency) to R2 `respaldos/AAAA-MM-DD.sql.gz`, keep 30 days, alert WAV if it fails, is empty or is < 80 % of the previous one.
Integration tests with fakes for each branch. Commit "feat(mantenimiento): reconciliation, retention, token and backups".

### Task 5: Verification and notes
Run everything (`test:run`, `test:db`, lint, type, build). Append "Execution notes" (Meta doc URLs, gaps, assumptions). Commit "docs(plan): plan 4 execution notes".
