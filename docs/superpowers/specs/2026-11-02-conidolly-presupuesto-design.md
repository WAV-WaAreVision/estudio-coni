# Conidolly: budget panel, the cap becomes an alarm with a hard limit

Date: 2026-11-02. Status: approved by Federico in brainstorming. Change 12a of Coni's request
(`docs/pedido-coni-2026-10-31/`, card 12 in `fichas.md`, original `pedido-original.md` L.11559), Coni's decision A1 in
`decisiones.md` / `respuestas-coni-2026-11-01.md` §5. Board: WAV-WaAreVision/estudio-coni#14.

## Goal

Today the monthly cap (`ajustes.tope_mensual_usd`, default US$ 40) is a hard brake: any spend that would pass it is
refused. Coni decided that the cap becomes a reference with alarms, and that a **hard limit** (by default twice the cap,
set by her) is the only brake. At the hard limit, new work pauses, work she already signed always finishes, she gets one
urgent notice and can reactivate by setting a new limit for the month.

## Decisions

| # | Decision |
|---|---|
| D1 | At the hard limit, new spend stops; spend for work already past gate 1 (voice, video, carousel shortening of an approved piece) never stops. |
| D2 | Self-running spend that exists today (weekly engine, nightly fusions) stays ON, with its spend visible and an ON/OFF switch. Future self-running features start OFF (their own changes). Topic embeddings and naming after an upload have no switch: they are part of processing what Coni uploaded. |
| D3 | Notices: only the hard limit notifies (urgent push to Coni once per month, plus one email to WAV). 50/80/100% of the cap show only in the panel. |
| D4 | "Reactivar" asks Coni for this month's new limit, prefilled with current limit + cap; one confirmation. |
| D5 | The hard limit defaults to 2 × cap and Coni can change it in Ajustes; it cannot be lower than the cap. |
| D6 | The database stays the single gate: `reservar_gasto` enforces the limit for every spending path, with its existing per-month lock. |
| D7 | Nothing stopped by the limit restarts on its own after reactivating; Coni retries where she left off (as today). |

## Data model (one migration)

- `ajustes.limite_duro_usd numeric(10,2) null` (null = 2 × `tope_mensual_usd`), check `limite_duro_usd is null or limite_duro_usd >= tope_mensual_usd`.
- `ajustes.motor_semanal_activo boolean not null default true`, `ajustes.fusiones_nocturnas_activas boolean not null default true`.
- Table `limites_del_mes (mes date primary key, limite_usd numeric(10,2) not null check (limite_usd > 0), fijado_por uuid not null, fijado_en timestamptz not null default now())`. RLS: Coni and mantenedor read; writes only through the RPC.
- `limite_del_mes(p_ahora timestamptz default now()) returns numeric`: the row in `limites_del_mes` for the Santiago month of `p_ahora`, else `limite_duro_usd`, else 2 × cap.
- `reservar_gasto(..., p_firmado boolean default false)`: dropped and recreated with the extra parameter (and `reservar_gasto_general` updated). Same month (Santiago), same lock, same "used" sum (reserved + confirmed). If `not p_firmado` and `usado + p_estimado > limite_del_mes(p_ahora)` it raises `P0001 'limite_alcanzado'` with detail `usado=…;limite=…`. Signed spend always reserves.
- `fijar_limite_del_mes(p_limite numeric)`: security definer, `search_path = ''`, Coni only (42501 `solo_coni`), rejects `p_limite <= usado` (22023 `limite_bajo`), upserts this month's row.
- Notice type `limite_alcanzado` added; `avisos_tipo_check` rewritten in full (`tope_alcanzado` kept for history).

## Code

- `lib/datos/repositorio.ts`: `reservarGasto` / `reservarGastoGeneral` map both `limite_alcanzado` and `tope_alcanzado` to `{ limite: true, usado, limite }` (both, so old and new code survive the deploy window); `reservarGasto` takes `firmado?: boolean`.
- `avisarLimite(deps, ahora)` replaces `avisarTope`: urgent `aConi` with clave `limite_alcanzado:<YYYY-MM>` (notices dedupe by clave), text «Llegaste a tu límite de US$ X de este mes. Lo nuevo quedó en pausa; lo que ya firmaste sigue.», route `/ajustes/presupuesto`; `aWav` only when the Coni notice was newly created. A failed notice never lets spend through; its error surfaces in the task result.
- Paths and their behaviour at the limit:

| Path | Behaviour |
|---|---|
| Script, carousel, script review, idea classification, batch «Hacer los guiones» | stop with «Llegaste a tu límite de este mes. Reactívalo en Ajustes.»; `avisarLimite`; the batch pre-check compares with the limit |
| Voice, video, carousel shortening of an approved piece | pass `firmado: true`; never stop |
| Material ingestion | as today (`motivo_fallo`, Reintentar) + `avisarLimite` |
| Weekly engine | as today (failed run with reason) + `avisarLimite` |
| Topic maintenance and nightly fusions | today silent; now `avisarLimite` |

- Switches: `motor-semanal` and the nightly fusions step read their switch at start; when OFF they skip and record «apagado» (not a failure). «Proponer ahora» (manual engine) is not affected by the switch.
- Messages and helpers that say «tope» when they mean the brake are reworded to «límite»; the video screen's remaining-money line and the batch check compute against `limite_del_mes`.

## Screens

**Ajustes › Presupuesto** (`/ajustes/presupuesto`, Coni only; Ajustes gets a row «Presupuesto · US$ 32 de 40» linking to it):
1. Month bar: «Llevas US$ X de tu tope de US$ Y este mes», marks at 50/80/100% of the cap and at the limit, token colours from 80% and past the cap; past the cap: «Pasaste tu tope. La app sigue hasta tu límite de US$ Z.»
2. Cap stepper (moved from Ajustes, same max 500) and hard-limit stepper (default label «US$ Z (el doble del tope)», never below the cap). Raising the cap above an explicit limit resets the limit to the default (2 × cap) and says so («Tu límite volvió al doble del tope: US$ Z»).
3. At the limit: a box «Llegaste a tu límite de US$ Z. Lo nuevo quedó en pausa; lo que ya firmaste sigue.» with **Reactivar** → field prefilled with limit + cap → confirm; refusal explained in plain Spanish, input kept.
4. This month by provider (Claude, ElevenLabs, HeyGen, Voyage).
5. «Lo que gasta solo»: switches for the weekly engine and nightly fusions, each with this month's spend.

## Tests (written first)

- DB: over the cap still reserves; at the limit new spend is refused; signed spend passes over the limit; the month row overrides the default; `limite_duro_usd` null → 2 × cap; `fijar_limite_del_mes` Coni only and rejects ≤ used; Santiago month boundary; full notice-type list.
- Code: one notice per month and one WAV email; each path in the table; switches respected; both error codes understood.
- UI: bar marks and texts, Reactivar flow, switches; e2e + axe on the new screen.
- Existing tests that pin the old cap behaviour (about 30 files) are updated to the new rule, not deleted.

## Rollout

One migration via the standing authorization (`db push --dry-run`, `db push`, read-only check, merge). **Trigger deploy required** (engine, maintenance, voice, video, carousel assembly): needs Federico's OK.

## Out of scope

Pause when real spend exceeds the estimate by 20%, subscriptions (Canva, Napkin), per-line budgets, tray/bank/rhythm (all 12b), notices at 50/80/100% (D3; easy to add later).
