# Plan 6: Notices to Coni and first-time setup

**Source:** design doc `~/Projects/coni-heygen/docs/designs/plataforma-coni.md`: "Avisos a Coni" (line ~249), A9 (line ~799), T13 (line ~1236), D-T4 (line ~1482), Pass 2/3 tables (lines ~1380-1400). Read those sections before starting.

**Scope:** T13 (PWA push, email fallback, 08:30 summary, immediate notices) and the remaining part of D-T4 (install sheet, first-time avatar message). T15 and T16 shipped in Plan 5b; T18 is done separately in `coni-heygen`. No cloud accounts, no real services, no push to git remotes.

**Migrations:** `20261001001500` to `20261001001599`.

## Items (TDD, one commit each)

1. **Notifications table** (`avisos`): one row per notice to Coni (kind, pieza_id nullable, created_at, sent_at, channel `push|correo`, read_at). Kinds from the design: `ideas_propuestas`, `guion_listo`, `video_listo`, `error_definitivo`, `publicado`, `tope_alcanzado`, `instagram_por_vencer`, `recordatorio_48h`. RLS: Coni and WAV read; only `service_role` writes; Coni may mark read. Dedup key so a retried run never creates the same notice twice. Audit like the other tables.
2. **Push subscriptions** (`suscripciones_push`): endpoint, p256dh, auth, user agent, created_at, last_ok_at, failures. Only Coni inserts/deletes her own; the endpoint keys are not secrets but never logged. A subscription that answers 404/410 is deleted.
3. **PWA:** `app/manifest.ts` (name, short_name, icons from existing brand tokens, `display: standalone`, theme colour), `public/sw.js` handling `push` (title + body, opens the right screen on `notificationclick`; never an approve action, design line ~1386) and nothing else (no offline cache in this plan). Register the worker only after Coni opts in.
4. **Sender:** extend `lib/proveedores/avisos.ts` with a Web Push notifier (VAPID via `web-push`; keys from env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, add to `.env.example`) behind the existing `Notificador` interface; email via the existing Resend notifier is the fallback when there is no live subscription or push fails. Fake push endpoint in `tests/e2e/servicios-falsos.ts`; base URL override refused when `VERCEL` is set, like the others.
5. **When to notify (A9):** immediate for `error_definitivo`, publication failed, `tope_alcanzado`, `instagram_por_vencer`. Everything else goes into **one summary a day at 08:30 America/Santiago** (Trigger.dev v4 `schedules.task`, cron with `timezone: "America/Santiago"`; read `~/Projects/wav-intelligence/docs/TRIGGER-DEV-REFERENCE.md` first). No summary when there is nothing new. A reminder when something waits for her firm more than 48 h (at most one per piece). To WAV: an email when a task fails twice in a row (check what `lib/produccion/fallas.ts` already does; don't duplicate).
6. **Opt-in and install sheet in Ajustes:** a "Avisos" row in the Ajustes status checklist: if not installed on iOS (no `display-mode: standalone`), show the install sheet (Compartir → "Agregar a inicio", iOS 16.4+), then "Activar avisos" that asks permission and saves the subscription. States: not supported, denied (how to re-enable in iOS Settings), on (with "Enviar uno de prueba").
7. **First-time avatar message:** the first time Coni opens a ready video, the notice "Así se ve tu avatar. Si algo no te calza, regrábalo." (design line ~1396), once, remembered in the DB (not localStorage).
8. **Inicio:** a small "Avisos" entry showing unread notices; tapping opens the piece.

## Rules

Same as Plan 5b ("Both tracks"): TDD; never `as any`, `@ts-expect-error`, non-null assertions, silent catches; semantic tokens only; Biome safe mode; Spanish de Chile copy, `tú`, no em dashes; no real services; load the real routes after client/server boundary changes. Push copy never contains a pending script's text (privacy on a lock screen): only "Tienes un guion listo para revisar".

## Done when

lint, type, unit, integration, build, E2E all green; screenshots 390x844 of the Ajustes "Avisos" states and the first-time message in `test-results/capturas/`; "Plan 6 notes" appended to this file (decisions, pending for production: VAPID keys in Vercel, real iPhone test).

## Plan 6 notes (2026-10-01)

**Migrations:** `20261001001500_avisos`, `...1510_suscripciones_push`, `...1520_avisos_automaticos`, `...1530_avatar_visto`.

### Decisions

- **Notifier layers.** `Notificador.aConi(mensaje, urgente, aviso)` now takes the notice identity (`tipo`, dedup `clave`, `piezaId`) and answers the channel (`push|correo`) or `null` when kept for the summary; `resumenAConi` is the new method for the daily summary. `notificadorResend` (email), `notificadorPush` (push, email fallback, dead devices deleted on 404/410, failures counted) and `notificadorConRegistro` (writes `avisos` once per key, sends urgent ones now, defers the rest) wrap each other; `avisosReales()` builds all three, `canalReal()` is push+email without the registry (the summary uses it).
- **Urgency stays where A9 already had it** (`urgente` at each call site): `error_definitivo` (task failures, publication failed, time passed, stuck render), `tope_alcanzado` (new: `avisarTope` in producir and grabar, so both deps got `avisos`), `instagram_por_vencer` (one per day). Publication failure is `error_definitivo`: the design has no separate kind.
- **`guion_listo` and `video_listo` are written by a database trigger** when a piece enters `guion_por_aprobar` / `video_por_aprobar` (key = kind, piece, `version`), so no code path can forget them and a crash cannot lose them. `ideas_propuestas` has no producer in the code (the "Monday 8:00 ideas" is copy), so the summary run writes it on Mondays in Coni's zone if the bank has ideas.
- **Summary** (`resumen-diario`, `schedules.task`, `30 8 * * *` America/Santiago, default retries): writes Monday ideas and 48 h reminders, sends all unsent notices as one message (push line: the kind's words for one notice, "Tienes N avisos nuevos" for more; email: the full list), marks them with the channel. Nothing new, nothing sent. A failed send marks nothing. Notices older than 7 days are not carried. The two switches of Ajustes are honoured: summary off sends nothing (notices are still written for the app); immediate notices off defers urgent ones to the summary.
- **48 h reminder:** one per piece ever (`recordatorio_48h:<pieza>`), clocked from the latest "ready for you" notice of the piece (not `actualizada_en`, which moves with any save) and only while the piece is still in that state.
- **WAV on repeated failure:** `fallas.ts` already emails WAV when a run fails for good (after the retries of its task, which is 2 or 3 attempts, 1 for the crons); not duplicated. `resumen-diario` uses the same `onFailure`.
- **Push privacy:** push words come from the kind only (`mensajePush`), never from `mensaje` (which can carry a title); the service worker adds no action button and only opens paths of its own origin. Test message is a fixed sentence.
- **Sender:** `web-push` builds the encrypted, VAPID-signed request (`generateRequestDetails`); it is sent with `fetch` (timeout, MSW). `PUSH_BASE_URL` replaces the origin of the endpoint for the E2E and is refused on Vercel like the other overrides. Without any `VAPID_*` variable notices go by email only; with only some it throws.
- **`suscripciones_push` is not audited** (the audit log is readable by WAV and would copy the keys) and is invisible to the maintainer. Re-subscribing the same endpoint is delete + insert (she has no UPDATE).
- **`avisos.pieza_id` cascades on delete** so cleaning pieces in tests never trips over a notice.
- **Ajustes:** a fifth step "Avisos en tu celular" in the checklist (never what makes the block say "setting up") and a section with the five states (install sheet on iOS outside standalone, ready, blocked with the iOS Settings path, on with "Enviar uno de prueba" and "Desactivar", not available). The worker is registered only inside the tap on "Activar avisos". The VAPID public key reaches the page at request time, not as a `NEXT_PUBLIC_` variable.
- **First-time message** lives in `ajustes.avatar_visto_en`; it is marked when the message appears, so it shows once.
- **Inicio** lists up to 5 unread notices; a tap marks one read and opens `/guion/<id>` (script ready) or `/video/<id>`.
- **Local stack gotcha:** after `supabase db reset` from a worktree the Auth container lost the code template (the sign-in E2E found "Your sign-in link"); `supabase stop && supabase start` restored it.

### Pending for production

- Generate the VAPID pair (`pnpm exec web-push generate-vapid-keys`) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in **Vercel and Trigger.dev**; deploy the `resumen-diario` schedule.
- **Real iPhone test** (iOS 16.4+): install from Safari, activate, "Enviar uno de prueba", tap the notification (it must open the right screen), deny and re-enable through iOS Settings.
- The push with the app closed was never run here (no real push service): only the worker's handlers (in a vm) and the sender's request were tested.
- `web-push` still calls `url.parse` (Node deprecation warning in the server log); harmless.

## Manual upload notes (2026-10-01)

Branch `feat/subir-a-mano`. Migrations `20261001001600_estados_a_mano` (enum values, alone because a new value cannot be used in its own transaction) and `20261001001610_subir_a_mano` (constraints, `proteger_pieza`, notice kind). Final counts: 1201 unit, 525 integration, 65 E2E; lint, type and build clean.

### Decisions

- **States and events.** `para_subir_a_mano` and `publicado_a_mano`; events `entregar_para_subir` (system, from `programado`) and `subido_a_mano` (Coni only, from `programado` or `para_subir_a_mano`). Marking a still-`programado` piece cancels its scheduled publication, so connecting Instagram later cannot publish a reel she already uploaded. `descartar` stays allowed from `para_subir_a_mano`. Both states keep gate 2 (video, text, time).
- **Branches in `publicarPendientes`.** Never connected = no account id AND no `meta` secret, and no container or media id on the piece: `entregar_para_subir` plus notice `listo_para_subir`, no 30 minute window (`puedeEntregarseParaSubir`: still never before the approved time, still checks the approved text and video). One of the two present = broken connection: unchanged error and reconnect notice (pinned by tests, both directions). Nothing retroactive: pieces already in `para_subir_a_mano` are not touched when Instagram is connected.
- **Notice.** `listo_para_subir` goes out at once (`urgente = true` is the only way to be immediate in Plan 6's registry), but it is a normal kind: not `error_definitivo`, and the email subject drops "importante" for it. Push copy: "Tu reel está listo para subir a Instagram". Key per piece and attempt. Obeys the "Avisarme apenas falle algo" switch like the urgent ones (off: waits for the summary).
- **Only Coni.** `publicado_a_mano` is entered by `proteger_pieza` for Coni alone (service role and maintainer refused); audit row carries her id (tested). The page actions use her session.
- **Download.** `Almacen.urlFirmada(clave, segundos, { descargarComo })` adds `response-content-disposition: attachment`; 10 minute link signed on tap by `descargarVideoAccion` from the approved `puerta2_video_id`; the file goes R2 to phone.
- **Gate on the label.** "Ya lo subí" stays disabled until she ticks "Activé la etiqueta Información de IA" (stricter than a reminder; remove if it turns out to be friction). The Instagram link is optional, https on instagram.com only, query string dropped, never fetched.
- **Screens.** Video: `para_subir_a_mano` and `programado` while `ajustes.meta_cuenta_id` is null (the token is in the Vault, so "connected" for the screen means the account id exists). Calendar: Mes "Para subir" list and screen reader notes, Agenda labels "Para subir" / "Subido a mano". Inicio: "Para subir a Instagram" section and a "subido a mano" confirmation. Ajustes block says Instagram is not connected and that reels wait for manual upload.
- **Metrics.** They read `estado = 'publicado'` with a media id, so pieces uploaded by hand are ignored with or without a link (tested). Retention treats `publicado_a_mano` like `publicado` (video deleted after 30 days); `para_subir_a_mano` is never retained.

### Risks and gaps

- No reminder if a piece stays in `para_subir_a_mano` for days (only the first notice and Inicio).
- Downloading on iOS Safari (attachment from R2, then Save to Photos) and the Instagram label wording were not tried on a real phone; the label text is Instagram's name for it as given in the design.
- No download after `publicado_a_mano`.
- Clipboard needs a secure context; the fallback message asks her to copy by hand.
