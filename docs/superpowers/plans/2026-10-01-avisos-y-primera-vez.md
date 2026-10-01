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
