# Conidolly: the voice joins gate 1, the video records itself after the signature (design)

Status: approved by Federico on 2026-10-15 (path A, automatic voice, listen-complete required). Replaces the three-step
flow of `2026-10-04-conidolly-aprobar-voz-video-design.md` (Aprobar guion / Grabar voz / Grabar video) for new pieces;
everything else in that design (voice keys and reuse, balances, live refresh, `grabar-voz` task) stays.

Status update (2026-10-16): the copy of section 6 is superseded by `2026-10-16-conidolly-soft-ui-design.md`
(decisions 9, 10 and 17); the rules of the undo window stay as written here.

## Problem

Since 2026-10-04 every piece needs three visits from Coni: approve the script (gate 1), come back to record the voice,
come back to record the video, then gate 2. Her budget is about 15 minutes a week (`docs/PRODUCT.md`). The impeccable
critique of the Soft UI mockups (2026-10-15, 25/40) flagged the middle visit as the biggest efficiency loss (heuristic
7) and the US$ 3.48 video as the largest spend with the least friction (one tap, voice half heard).

Goal: two visits per piece. At gate 1 Coni reads the script and listens to her own voice, then one signature approves
the script and commits the video spend. The video starts by itself 8 seconds later, unless she undoes it.

## Facts from the code (verified 2026-10-15 on `main`, 41fed38)

- States (`lib/dominio/estados.ts`): `guion_aprobado` and `grabando_voz` sit between `guion_por_aprobar` and
  `en_render`. Today `aprobar_guion` goes `guion_por_aprobar -> guion_aprobado`; `pedir_voz` `guion_aprobado ->
  grabando_voz` (bumps `intento`); `voz_lista` and `falla_voz` return to `guion_aprobado`; `grabar_video`
  `guion_aprobado -> en_render`; `reabrir_guion` `guion_aprobado -> guion_por_aprobar`; `editar_texto` in
  `guion_aprobado` drops the approval.
- `aprobarGuion` (`lib/acciones/piezas.ts`) checks the version, `exigirRevisionLimpia` (flagged sentences must be
  reviewed), the eligible avatar, computes formula 3 and starts nothing. `pedirVoz` starts `grabar-voz`; `pedirVideo`
  starts `grabar-pieza` through `iniciar(...)`, whose failure is picked up by `reanudarArranques` (10 minutes).
- `grabarPieza` (`lib/produccion/grabar.ts`) returns `nada_que_hacer` when the piece is not in `en_render` or
  `subtitulando`, and checks `puedeGrabar` (state, approval, recomputed hash) before spending HeyGen. The task
  (`trigger/grabar-pieza.ts`) already imports `wait`.
- `asegurarVoz` (`lib/produccion/voz.ts`) pays a voice at most once per text and voice config (take key
  `voces/<id>/t-<huella>-<toma>.mp3`, reuse of the newest take unless `nueva`). `puedeGrabarVoz`
  (`lib/dominio/puertas.ts`) requires state `grabando_voz` and a current gate-1 approval.
- The writer (`lib/produccion/producir.ts`) ends with `guion_listo` (`guion_en_proceso -> guion_por_aprobar`,
  `audioId: null`). `DepsProduccion` has `db`, `avisos`, `claude`, `ahora`: no storage and no ElevenLabs.
- Database (`20261004000110_aprobar_sin_grabar.sql`): constraint `aprobada_para_grabar` requires `puerta1_hash` in
  `guion_aprobado`, `grabando_voz`, `en_render` and later states. `proteger_pieza` (latest body
  `20261007000110_linkedin_publicacion.sql`) lets only Coni move a piece into `grabando_voz`, `en_render`,
  `programado`, `publicado_a_mano`; nothing restricts `en_render -> guion_por_aprobar` by Coni.
- Trigger.dev v4 (docs checked 2026-10-15): `tasks.trigger(..., { delay: "10s" })` creates a run in `DELAYED` status;
  `runs.cancel(id)` cancels it. A delay does not merge triggers; the idempotency key still dedupes.
- The voice player (`components/reproductor-voz.tsx`) already reports the end of playback (`alEscuchar`); the video
  player does the same for "Lo viste completo" at gate 2.
- Last migration applied: `20261007000110`. `supabase/pendientes/20261003000350_borrar_vinculos.sql` stays out.

## Decisions

### 1. Spending rule

Old rule: nothing is spent without an approved script. New rule: **no video is spent without Coni's signature; the
voice is a cheap draft made with the script.** One voice costs about US$ 0.20 (`estimarCostoVoz`) and counts against
the monthly cap like every spend. A discarded or rewritten script pays its voice. HeyGen is never called before the
signature plus the undo window.

### 2. The voice is made with the script

- `producirPieza`, after saving the draft and before `guion_listo`, calls `asegurarVoz` (`nueva: false`) for the
  draft script. `DepsProduccion` gains what `DepsVoz` needs (`almacen`, `base`) and the ElevenLabs key reader.
- Success: `guion_listo` carries the `audioId` (event `{ tipo: "guion_listo"; audioId: string | null; explicacion?:
  string }`), so the piece arrives in `guion_por_aprobar` with its voice.
- A voice `Falla` (ElevenLabs out of characters, missing key) or the cap: the script is still delivered,
  `audioId: null`, `explicacion: TEXTO_SIN_VOZ` = "No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz.". A
  non-Falla error is logged and treated the same way (the script must never be lost because of the voice); the spend
  reservation follows the existing release rules of `asegurarVoz`.
- The voice spend key and take use the piece's `intento`, as today, so a Trigger retry of the writer finds the take it
  already paid for.

### 3. Voice after an edit, and on request

- `pedir_voz` now goes `guion_por_aprobar -> grabando_voz` (Coni; `intento + 1` as today). `voz_lista` goes
  `grabando_voz -> guion_por_aprobar` with the `audioId`; `falla_voz` goes `grabando_voz -> guion_por_aprobar` with the
  explanation and `intento + 1`.
- `editarGuion` (`lib/acciones/guion.ts`): when the saved script changes the voice fingerprint (`huellaDelGuion`), the
  same action calls `pedirVoz` (`nueva: false`, so going back to an earlier wording reuses its take). Editing only the
  caption or the LinkedIn text never touches the voice.
- "Preparar mi voz" (shown when there is no valid voice) calls `pedirVoz`. "Grabar la voz de nuevo" (a new take of the
  same text) calls it with `nueva: true`.
- `puedeGrabarVoz` drops the approval requirement: state `grabando_voz` and a non-null script. The task speaks the
  row's current script, so the voice always matches what Coni sees.
- While the piece is in `grabando_voz` the editor and the signature are disabled ("Estoy preparando tu voz. Tarda unos
  segundos."), and the screen polls (`piezaTrabajando` already covers `grabando_voz`).

### 4. Gate 1 signs the script, the voice and the video spend

`aprobarGuion` keeps every current check and adds:

- **Voice of the current script.** The piece's `audio_id` must be a take of `huellaDelGuion(guion, config)` (prefix
  `prefijoDeTomas`). Otherwise `Falla("Tu voz no corresponde al guion actual. Prepárala antes de firmar.")`.
- **Listened to completely.** Enforced on the client like "Lo viste completo" at gate 2: the slider and "Aprobar" stay
  disabled until `alEscuchar` fires for the current take, with the reason line "Escucha tu voz completa para firmar.".
  The server does not track playback (YAGNI, same as gate 2).
- **HeyGen balance.** When `alcanceDeVideo` says `no_alcanza`, the signature is disabled with the existing "Video
  short" text. `no_se_sabe` never blocks.

The approval event becomes `aprobar_guion: guion_por_aprobar -> en_render` (Coni only, hash checked, `puerta1` set,
`audioId` kept). The action then starts `grabar-pieza` with `delay: "10s"` (`Disparos.grabar` gains an optional delay)
through `iniciar(...)`, so a run that fails to start is still resumed by `reanudarArranques`.

### 5. The undo window

- `VENTANA_DESHACER_MS = 8000`, `MARGEN_DE_RELOJ_MS = 2000` (domain constants).
- New event `deshacer_aprobacion { actor; ahora }`: Coni only, `en_render -> guion_por_aprobar`, `puerta1 = null`,
  `audioId` kept, `intento + 1` (see "Why the undo bumps `intento`" below). Valid only while
  `ahora < puerta1.en + VENTANA_DESHACER_MS` (server clock); after that
  `Falla("Ya empecé a grabar el video. Puedes revisarlo cuando esté listo.")`.
- New action `deshacerAprobacion(piezaId, versionVista)`. No run cancellation: the delayed run starts, finds the piece
  in `guion_por_aprobar` and returns `nada_que_hacer`.
- **Second lock in the render.** `grabarPieza`, in `en_render` and before any spend, computes
  `esperaDeVentana(puerta1.en, ahora) = max(0, puerta1.en + VENTANA_DESHACER_MS + MARGEN_DE_RELOJ_MS - ahora)`. When it
  is positive the task waits that long (`deps.esperar(ms)`, `wait.for` in the task) and reads the row again before
  `puedeGrabar`. It covers a run that starts before its window has closed (a delayed run that fires early, a
  resumption by `reanudarArranques`, a clock that differs between Vercel and Trigger.dev): HeyGen stays untouched until
  the window of the signature the row holds now has closed.
- **The run takes the piece before it spends.** After the wait and before any spend of a render not yet created,
  `grabarPieza` bumps only `version` (locked on the version it read; no state change, no notice). An undo that committed
  first makes it miss (a retryable error; the retry finds gate 1); a later undo is refused by the version lock, or with
  the late text, which `deshacerAprobacion` checks before the version. For that lock to hold, the undo toast sends the
  version she signed at (`aprobarGuion` returns it, gate 1 carries it to the video screen as `?firmada=N` and the toast
  keeps it from its first render), never one a 4 s refresh brought after the claim.
- **Why the undo bumps `intento`.** Trigger.dev keeps the idempotency key of a completed run (30 days by default) and a
  new trigger under that key returns the old run. The key of the render is the approved text plus `intento`
  (`claveGrabar`). If an undo kept `intento`, the delayed run of the undone signature would fire, find the piece back at
  gate 1, return `nada_que_hacer` and complete; signing the same text again would then produce the same key, Trigger.dev
  would return that completed run and no video would ever start (`reanudarArranques` retries under the same key, so it
  would be deduplicated too). So `deshacer_aprobacion` opens a new attempt: a later signature of the same text has a new
  key and starts its own run.
- **A run belongs to its attempt.** The `grabar-pieza` payload carries the `intento` it was started for
  (`Disparos.grabar(piezaId, clave, intento, retraso?)`; optional in the task schema so a run queued by the app deployed
  before it existed still works). `grabarPieza` returns `nada_que_hacer` when the row is on another attempt, checked
  right after reading the row and again after every re-read (the window wait), before any spend. Hence the delayed run
  of an undone signature ends at once even when Coni signed again meanwhile and the piece is back in `en_render` with
  the same text: that second signature has its own run. The render spend key is the reservation key of the attempt, so a
  double run of the same attempt still cannot pay twice.

### 6. Screens and copy (es-CL, tú, no em dashes)

Layout changes beyond copy belong to the Soft UI step 2 (`/impeccable harden`). Functional content:

| Where | Text |
|---|---|
| Gate 1, slider | "Desliza para aprobar y grabar" |
| Gate 1, line under the bar | "Al firmar grabo el video: ~52 s, US$ 3,48. Tienes 8 s para deshacer." |
| Gate 1, not listened | "Escucha tu voz completa para firmar." |
| Gate 1, no valid voice | "Falta preparar tu voz." with the button "Preparar mi voz" |
| Gate 1, voice being made | "Estoy preparando tu voz. Tarda unos segundos." |
| Voice failed (writer or task) | "No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz." |
| Toast after signing (8 s) | "Firmaste. Grabo el video en 8 s." with "Deshacer" |
| Toast after undo | "Listo, no grabé nada. Puedes seguir revisando." |
| Undo too late | "Ya empecé a grabar el video. Puedes revisarlo cuando esté listo." |

- Inicio: `grabando_voz` shows in "Necesita tu firma" (it is still hers to sign) with the meta "Preparando la voz". A
  piece in `en_render` stays in "En camino" as today.
- The Guion screen in `en_render` shows "Estoy grabando tu video. Te aviso cuando esté listo." (unchanged behaviour,
  polling on).

### 7. States and transitions, summary

| Event | From | To | Notes |
|---|---|---|---|
| `guion_listo { audioId, explicacion? }` | `guion_en_proceso` | `guion_por_aprobar` | `audioId` null only with `TEXTO_SIN_VOZ` |
| `pedir_voz` | `guion_por_aprobar` | `grabando_voz` | `intento + 1` |
| `voz_lista { audioId }` | `grabando_voz` | `guion_por_aprobar` | |
| `voz_lista { audioId }` | `en_render` | `en_render` | unchanged (render made a missing voice) |
| `falla_voz` | `grabando_voz` | `guion_por_aprobar` | explanation, `intento + 1` |
| `aprobar_guion` | `guion_por_aprobar` | `en_render` | Coni only |
| `deshacer_aprobacion` | `en_render` | `guion_por_aprobar` | Coni only, inside the window, `intento + 1` |

Removed: `grabar_video`, `reabrir_guion`, and `editar_texto` from `guion_aprobado`. `guion_aprobado` becomes
unreachable; the enum value stays (Postgres cannot drop it). `politica_contenido`, gate 2 and publishing are unchanged.

### 8. Database (one migration after `20261007000110`)

`20261016000200_voz_antes_de_firmar.sql`:

- constraint `aprobada_para_grabar` recreated without `grabando_voz` (the voice may now be made before the signature);
  `guion_aprobado` stays in the list (harmless, unreachable).
- `proteger_pieza` unchanged: `grabando_voz` and `en_render` remain states only Coni enters. The writer makes the voice
  without changing state, so it needs no exception.
- No change to `editar_guion_como_coni` / `editar_texto_como_coni`.

## Pieces in flight and deploy order

1. Before deploying, SQL check: `select id, estado from piezas where estado in ('guion_aprobado', 'grabando_voz')`.
   Any row is moved to `guion_por_aprobar` with gate 1 cleared (Coni re-signs; her voice is reused, the key is by
   text). Production was wiped on 2026-10-08, so zero rows are expected.
2. `supabase db push` (Federico, macOS Terminal): the constraint. The old app keeps working (it only writes
   `grabando_voz` with an approval).
3. Trigger deploy: the writer with the voice, the render with the window wait, `grabar-voz` without the approval
   check. Between this step and the next, Coni does not approve or record a voice (minutes): the old app would write
   `guion_aprobado` / `grabando_voz` with an approval that the new tasks no longer expect.
4. `vercel deploy --prod --yes` right after.

Rollback: previous Vercel and Trigger versions; pieces in `grabando_voz` without approval would break the old
constraint semantics, so move them to `guion_por_aprobar` first, then re-apply the old constraint.

## Docs to update in the same branch

- `docs/TRASPASO.md`: the flow (two visits), the spending rule, the undo window.
- `docs/PRODUCT.md`: nothing (principles hold).
- The 2026-10-04 design: a status line pointing to this document.

## Testing

- Unit (Vitest): the new and changed transitions (table in 7, including the window edges at 7.999 s and 8 s);
  `esperaDeVentana`; `puedeGrabarVoz` without approval; `aprobarGuion` refusing a stale or missing voice; the gate-1
  bar enabling only after `alEscuchar` and disabling on `no_alcanza`; the toast with "Deshacer".
- Integration (local Supabase, MSW for ElevenLabs and HeyGen): the writer delivers script plus voice; the writer
  delivers the script with `TEXTO_SIN_VOZ` when ElevenLabs fails or the cap is reached; a script edit starts
  `grabar-voz` and a revert reuses the old take; approve moves to `en_render` and records a delayed trigger; undo
  inside the window returns to `guion_por_aprobar` and the delayed run spends nothing; undo after the window is
  refused; re-signing inside the window waits and pays HeyGen once; sign, undo, finish the undone run, sign the same
  text again: the second `grabar-pieza` trigger has another key and `intento + 1`, and a run whose payload `intento`
  is older than the row's returns `nada_que_hacer` and spends nothing; the migration's constraint.
- E2E (Playwright, fake services): open a script with its voice, listen to the end, sign, see the toast, undo, sign
  again and see "Estoy grabando tu video".

## Open questions

1. **Listen-complete with VoiceOver or a muted phone.** Gate 2 has the same rule. If Coni signs on a muted phone the
   player still reports the end, so it is a reading-time requirement, not a hearing check. Accepted.
2. **Writer runtime.** The voice adds about 10 to 20 s to `producir-pieza`; its `maxDuration` must cover it (check the
   current value in the plan).
3. **Cost of discarded scripts.** About US$ 0.20 each. Revisit if more than a few scripts a week are discarded.
