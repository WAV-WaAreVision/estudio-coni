# Conidolly: approve, record the voice and record the video as three steps (design)

Status: approved by Federico on 2026-10-04 (decisions 1 to 7 of the brief). This document turns them into concrete
states, keys, migrations and screens. Plan: `docs/superpowers/plans/2026-10-04-aprobar-voz-video.md`.

## Problem

Today one slide on the Guion screen does three things: approves gate 1, generates the voice in ElevenLabs and sends
the render to HeyGen (`aprobarGuion` moves the piece straight to `en_render` and starts `grabar-pieza`). Three
consequences hurt in production:

1. **Voices paid more than once.** The audio key is `claveVozAprobada(piezaId, puerta1Hash)`
   (`lib/proveedores/almacen.ts`), so the key depends on the gate-1 hash. Any new approval (a retry after a content
   policy refusal, or the move to formula 3 in C3) has a new hash and pays for a new voice even when the spoken text did
   not change. Piece `51fe0f3b` paid three voices for one text.
2. **Coni cannot listen to the voice without the video.** The voice is only heard inside the final video. When
   HeyGen's API wallet is empty (`MOVIO_PAYMENT_INSUFFICIENT_CREDIT`), she gets nothing at all.
3. **The screens do not move by themselves.** While a script is written or a video is recorded, Inicio and Guion only
   change after a manual reload.

And nothing shows how much ElevenLabs or HeyGen balance is left, so the HeyGen failure above came as a surprise: the
HeyGen plan shows 248 premium credits, but those do not fund API renders; the API wallet is a separate balance and it
was empty.

## Facts from the code (verified 2026-10-04 on `main`, f9b7797)

- States (`lib/dominio/estados.ts`, enum `estado_pieza`): `idea`, `guion_en_proceso`, `guion_por_aprobar`,
  `en_render`, `subtitulando`, `video_por_aprobar`, `programado`, `para_subir_a_mano`, `publicado`,
  `publicado_a_mano`, `error_produccion`, `error_publicacion`, `descartado`. `aprobar_guion` goes
  `guion_por_aprobar -> en_render`. `voz_lista` stores `audioId` while in `en_render`.
- Gate 1 (`lib/dominio/puertas.ts`): formula 1 hashes the voice (legacy), formula 2 `[guion, texto, avatarId]`,
  formula 3 adds the backing fingerprint. `grabarPieza` rebuilds the artifact by the stored formula and calls
  `puedeGrabar` before any spend. `aprobarGuion` writes `audio_id: null` with the approval.
- Voice (`lib/produccion/grabar.ts`, `ponerLaVoz`): spend key `claveIdempotencia({paso: "grabar", hash:
  hashTexto("elevenlabs:" + id), intento})`, object key `claveVozAprobada(id, puerta1Hash)`, skip if the object exists,
  then `generarVoz` (`POST /v1/text-to-speech/{voice_id}` with `model_id`, `voice_settings`, `output_format`).
  `tieneLaVozAprobada` accepts any audio for formula 1 and only `claveVozAprobada(id, hash)` for formulas 2 and 3.
- Database guards (`proteger_pieza`, latest body in `20261003000500_respaldo_de_la_pieza.sql`): only Coni approves
  (`solo_coni_aprueba`), only Coni moves a piece into `en_render`, `programado` or `publicado_a_mano`
  (`solo_coni_entra_a_puerta`), the formula changes only with an approval, the avatar only in `guion_por_aprobar`.
  Constraint `aprobada_para_grabar` requires `puerta1_hash` in the render and later states. A new enum value cannot be
  used in the migration that adds it (`20261001001600_estados_a_mano.sql` did it in two files).
- Script edits go through `editar_guion_como_coni` and `editar_texto_como_coni` (security definer, latest bodies in
  `20261003000181_conflictos_409.sql`), both limited to `guion_por_aprobar` (the caption also to the video states).
- Costs: `estimarCostoVoz` (US$ 0.0003 per character, `lib/produccion/comun.ts`), `estimarCostoVideo` (48 or 16
  credits a minute at an assumed US$ 4 a minute of avatar_v, `lib/produccion/grabar.ts`), `leerCostoDeGrabar`
  (`lib/datos/pantallas.ts`) builds the one line on the Guion screen.
- Provider keys live in the Vault (`leerSecreto(servicio, "heygen" | "elevenlabs")`); Ajustes checks them with
  `revisarCuentas` through the service client. `verificarHeygen` already calls `GET /v3/users/me`.
- Voice player: `components/reproductor-voz.tsx` exists (props `src`, `clave`, `alEscuchar`). Signed URLs:
  `urlParaVer(clave)` in `lib/acciones/medios.ts` (one hour; test mode returns `https://almacen.test/<clave>`).
- Maintenance every ten minutes (`mantenimientoFrecuente`): `reanudarArranques`, `conciliarRenders`, `barrerGastos`.
  `barrerGastos` confirms a non-HeyGen reservation as soon as the piece is past `guion_en_proceso`.
- Production: last migration applied `20261003000510`; `supabase/pendientes/20261003000350_borrar_vinculos.sql` stays
  out. The Vercel deploy is manual (`vercel deploy --prod --yes`), Trigger deploy with the CLI 4.6.4.

### Vendor facts (checked against official docs on 2026-10-04)

- **HeyGen** `GET /v3/users/me` (https://developers.heygen.com/reference/get-current-user.md), header `X-Api-Key`.
  Note: the path is `users`, plural (the brief said `/v3/user/me`; the repo already uses `/v3/users/me` and so does
  the reference). Answer under `data`: `billing_type` is `wallet | subscription | usage_based`; `wallet` has
  `currency` (`usd | credits`), `remaining_balance` (number, nullable) and `auto_reload`. With Coni's API key it is
  `wallet` (verified by Federico). The OAuth CLI session reports subscription premium credits instead, which do not
  fund API renders.
- **ElevenLabs** `GET /v1/user/subscription` (https://elevenlabs.io/docs/api-reference/user/subscription/get), header
  `xi-api-key`. Fields used: `character_count`, `character_limit`, `next_character_count_reset_unix` (nullable),
  `can_extend_character_limit`, `allowed_to_extend_character_limit`, `status`, `tier`.

## Decisions

### 1. States and transitions

Two new states, after `guion_por_aprobar`:

| State | Meaning | Who enters it |
|---|---|---|
| `guion_aprobado` | Gate 1 signed. Nothing spent by the approval. Coni may record the voice, record the video, edit, or reopen. | Coni (approval), or a task returning from `grabando_voz` |
| `grabando_voz` | A `grabar-voz` run is speaking the approved script. | Coni only (database guard) |

Domain events (pure, in `transicionar`):

| Event | From | To | Changes |
|---|---|---|---|
| `aprobar_guion` (Coni, hash checked) | `guion_por_aprobar` | `guion_aprobado` | `puerta1` set. `audioId` kept (it is checked against the text later, see 2). |
| `pedir_voz` (Coni) | `guion_aprobado` | `grabando_voz` | `intento + 1` |
| `voz_lista {audioId}` | `grabando_voz` | `guion_aprobado` | `audioId` |
| `voz_lista {audioId}` | `en_render` | `en_render` | `audioId` (unchanged behaviour) |
| `falla_voz {explicacion}` | `grabando_voz` | `guion_aprobado` | `explicacion`, `intento + 1` |
| `grabar_video` (Coni) | `guion_aprobado` | `en_render` | none (`intento` kept) |
| `reabrir_guion` (Coni) | `guion_aprobado` | `guion_por_aprobar` | `puerta1 = null` |
| `editar_texto` | `guion_aprobado` | `guion_por_aprobar` | `puerta1 = null`, effect `revisar_texto` |
| `descartar` | any non final, new states included | `descartado` | as today |

Everything else is unchanged: `politica_contenido` still returns `en_render -> guion_por_aprobar`, `regrabar`,
`reintentar` (to `en_render`/`subtitulando`) and gate 2 are untouched. Editing the script in `guion_aprobado` goes
through `editar_guion_como_coni`, which now drops the approval in the same update (see 4).

`intento` is part of the keys of the voice spend, the `grabar-voz` run and the voice object (the take). `pedir_voz`
bumps it so every tap is a new run and "Volver a grabar voz" gets a new take. `falla_voz` bumps it too, so a voice that
failed and released its reservation never collides with the reservation of the next attempt (a new voice, or the voice
step of the render) under the same key. `grabar_video` does not bump it: after a successful voice the render finds the
take of the current `intento` and spends nothing on ElevenLabs, and the HeyGen key (`puerta1_hash`, `intento`) is still
unique, because every way back to a render (`regrabar`, `reintentar`, a new approval after `politica_contenido`) already
bumps or changes it.

Why a state for the voice and not a column: the database can then guard who enters it (only Coni), the polling rule is
"the piece is in a working state", stuck runs are found by state and age like renders, and the screen cannot offer
"Grabar video" while a voice is being made.

### 2. The voice key: text plus voice, not the approval

New, pure, in `lib/dominio/voz.ts`:

```
huellaDeVoz = sha256(JSON.stringify(["voz/1", guion, voiceId ?? "", modelId, outputFormat, ajustesCanonicos]))
claveDeVoz(piezaId, huella, toma) = "voces/<piezaId>/t-<huella>-<toma>.mp3"
prefijoDeVoz(piezaId, huella)     = "voces/<piezaId>/t-<huella>-"
```

- `guion` is exactly the text sent to ElevenLabs (the stored script, no normalisation beyond what is stored).
- `ajustesCanonicos` is `voice_settings` serialised with sorted keys (`""` when absent), so key order in the config does
  not change the fingerprint.
- `toma` is the piece's `intento` when the voice is made. "Volver a grabar voz" is an explicit new take: same
  fingerprint, new `toma`, new object. Every other path reuses.
- The prefix `t-` keeps the new keys apart from content keys (`voces/<id>/<sha>.mp3`, formula 1) and approval keys
  (`voces/<id>/<puerta1Hash>.mp3`, formulas 2 and 3), so a key can be read back to its fingerprint.

**Reuse rule (never pay twice).** Before spending, the voice step (`asegurarVoz`, shared by `grabar-voz` and
`grabar-pieza`) does, in order:

1. If the exact object `claveDeVoz(id, huella, intento)` exists, use it (a retried run).
2. Unless the request is a new take, list `prefijoDeVoz(id, huella)` in R2 and use the highest take that exists.
3. Only then reserve the spend (key `claveIdempotencia({piezaId, paso: "voz", hash: huella, intento})`), speak, upload
   to the exact key and confirm the spend.

So re-approving the same text, a new approval formula, a content-policy round that ends with the same text, or a
render after a voice made earlier never speaks again. The one window that stays open is the one documented today: a
crash between ElevenLabs answering and the upload finishing (ElevenLabs has no idempotency key).

**Binding to gate 1.** The approval hash is not changed (Coni signs before any voice exists; formula 3 stays the
current formula). The binding is in the render check: `grabarPieza` already proves that the row's script is the one
she approved (`puedeGrabar` with the recomputed hash). Right before uploading the audio to HeyGen, `crearElVideo` now
requires `vozAprobada(contexto) !== null`, where `vozAprobada` accepts only:

- formula 1: the stored `audio_id` (it is inside the formula-1 hash, as today);
- formulas 2 and 3: an `audio_id` under `prefijoDeVoz(id, huellaDeVoz(approved script, current voice config))`, or the
  legacy `claveVozAprobada(id, puerta1.hash)` of the current approval (that object was generated for exactly this
  approved script, because the hash binds the script).

Any other voice is refused with a `FallaDeConfiguracion` before HeyGen is called. Because the fingerprint is derived
from the script that passed the hash check, the render can only spend HeyGen with a voice of the approved text. The
`grabar-voz` task checks gate 1 the same way before spending ElevenLabs (`puedeGrabarVoz`: state `grabando_voz`,
approval present, hash of the row equals the approved hash).

A change in the voice config (another `voice_id`, model or settings) changes the fingerprint, so the old voice no
longer counts and a new one is made. That is the intended behaviour: it would sound different.

**Pieces already in production (formulas 1, 2 and 3).**

| Piece at deploy time | What happens |
|---|---|
| Formula 1, any state | Unchanged: its `audio_id` is in the hash and is used as is. |
| Formula 2 or 3 in `en_render` or `subtitulando` | The run continues; its `audio_id` is the legacy approval key of the current approval, which `vozAprobada` accepts. No new voice. |
| Formula 2 or 3 in `error_produccion` with `audio_id` set (for example `51fe0f3b`) | "Reintentar" goes back to `en_render` and the legacy voice is accepted. No new voice. Coni can listen to it on the Guion screen (the error state shows the player). |
| `guion_por_aprobar` with a legacy `audio_id` of an older approval | That voice cannot be proven to match the current text, so the first voice after the next approval is paid once, under a new key. From then on it is reused. Accepted: no object copying or backfill (YAGNI). |
| `video_por_aprobar` and later | Untouched. |

### 3. Runs and idempotency

**A separate `grabar-voz` task**, not a mode of `grabar-pieza`. Reasons: `grabar-pieza` runs on `medium-1x` with
ffmpeg, a one-hour wait token and `concurrencyLimit: 1`, so a voice request would queue behind a render that waits up
to an hour; its dependency check (`depsGrabacion`) fails without ffmpeg and fonts, which the voice does not need; and
its failure handler moves the piece to `error_produccion`, while a failed voice must return to `guion_aprobado`. The
shared part (the reuse rule and the spend) lives in one function, `asegurarVoz`, called by both tasks.

| Run | Payload | Trigger idempotency key (`scope: "global"`) |
|---|---|---|
| `grabar-voz` (new; `small-1x`, queue `concurrencyLimit: 2`, `maxDuration: 600`) | `{ piezaId, nueva }` | `claveIdempotencia({piezaId, paso: "voz", hash: puerta1_hash, intento})` |
| `grabar-pieza` (unchanged task) | `{ piezaId }` | `claveGrabar` as today (`puerta1_hash`, `intento`) |

Spend keys: voice `claveIdempotencia({piezaId, paso: "voz", hash: huella, intento})`; HeyGen unchanged. `Paso` gains
`"voz"`.

If the app cannot start `grabar-voz` after moving the piece to `grabando_voz`, the action writes `falla_voz` right away
("No pude empezar a grabar la voz. Inténtalo de nuevo en unos minutos.") instead of leaving a warning, because nothing
else would start that run.

Failure paths of `grabar-voz`, all ending in `guion_aprobado` with an explanation:

- a `Falla` (text for Coni, for example ElevenLabs out of characters) -> `falla_voz` with its message;
- the spend cap -> `falla_voz` with `TEXTO_TOPE` plus the existing cap notice;
- retries exhausted (`onFailure` -> `dejarConstancia`) -> `falla_voz` with "Algo falló al grabar la voz. WAV ya está
  revisando.";
- a run that never started or died silently -> maintenance (`devolverVocesTrabadas`): a piece in `grabando_voz` not
  written for 15 minutes goes back with "La voz no terminó de grabarse. Vuelve a intentarlo.".

ElevenLabs answering `quota_exceeded` becomes a `Falla` for Coni: "ElevenLabs no tiene caracteres suficientes para esta
voz. Recarga en elevenlabs.io y vuelve a intentarlo." (today any 4xx is a configuration error for WAV).

`barrerGastos`: an ElevenLabs reservation with `paso = 'voz'` counts as done only if the piece has an `audio_id`;
otherwise it is released after 24 hours (today it would be confirmed as soon as the piece is past the script).

### 4. Database (two migrations, append-only, after `20261003000510`)

- `20261004000100_estados_de_voz.sql`: `alter type public.estado_pieza add value if not exists 'guion_aprobado' after
  'guion_por_aprobar'` and the same for `grabando_voz` after `guion_aprobado`. Nothing else (the values cannot be used
  in this transaction).
- `20261004000110_aprobar_sin_grabar.sql`:
  - constraint `aprobada_para_grabar` recreated to include `guion_aprobado` and `grabando_voz`;
  - `proteger_pieza` (body of `20261003000500` plus one change): `grabando_voz` joins `en_render`, `programado`,
    `publicado_a_mano` in `solo_coni_entra_a_puerta`;
  - `editar_guion_como_coni`: accepts `guion_aprobado` too; on that state the same update sets
    `estado = 'guion_por_aprobar'`, `puerta1_hash = null`, `puerta1_en = null` (the trigger clears `puerta1_por`);
  - `editar_texto_como_coni`: accepts `guion_aprobado` with the same reset; the rest of its body unchanged.

`puerta1_formula` is left as it is when the approval is dropped (the trigger forbids changing it without an approval;
the next approval rewrites it, as with `politica_contenido` today). No change to `avisar_pieza_lista`: neither new state
sends a notice.

### 5. Live updates without reload

A client component `RefrescoAutomatico({ activo, cadaMs })` calls `router.refresh()` every `cadaMs` while `activo` and
the tab is visible; it stops when hidden and refreshes once when the tab comes back. It renders nothing. The server
decides `activo` on every render, so the polling stops by itself when the piece settles (the next refresh renders
`activo = false`).

- Working states (pure helper `piezaTrabajando`): `guion_en_proceso` without explanation, `grabando_voz`,
  `en_render`, `subtitulando`.
- Guion screen: every 4 s while its piece is working. When the video is ready, the page's existing
  `redirect("/video/<id>")` takes over on the next refresh.
- Inicio: every 8 s while any piece is working (its query already reads all pieces).
- No Supabase Realtime, no new endpoint. Cost: one RSC render per tick for one user, only while something works.
- The voice player is never on a polling screen (it shows in `guion_aprobado` and `error_produccion`), so a refresh
  never swaps its signed URL mid-playback.

### 6. Balances

Server-side only, read when the screen opens, cached briefly:

- `lib/proveedores/saldos.ts`: `leerSaldoElevenlabs` (`GET /v1/user/subscription`) and `leerSaldoHeygen`
  (`GET /v3/users/me`), 5 s timeout each, Zod-parsed, returning a result (`ok: false` on network error, non-2xx or an
  unexpected body). Base URLs from `ELEVENLABS_BASE_URL` / `HEYGEN_BASE_URL` like the existing checks (the E2E fakes
  answer there).
- `lib/saldos/leer.ts`: `lectorDeSaldos` reads both keys from the Vault with the service client and both balances in
  parallel; successes are cached 60 s and failures 15 s per server instance, and concurrent callers share one request.
  A missing key is a failure (`sin_llave`).
- `lib/dominio/saldos.ts` (pure): the balance types, `alcanceDeVoz(saldo, caracteres)` and `alcanceDeVideo(saldo,
  {usd, creditos})` returning `alcanza | no_alcanza (with the message) | no_se_sabe`, and the copy lines.

Rules:

- ElevenLabs: left = `character_limit - character_count`. Not enough when left < characters of the script, unless
  `can_extend_character_limit && allowed_to_extend_character_limit` (usage billing will cover it).
- HeyGen: only `billing_type = wallet` with a numeric `remaining_balance` is a balance. Currency `usd` is compared with
  the US$ estimate of the video, `credits` with the credit estimate (`estimarCreditosVideo`). Any other billing type is
  "no_se_sabe" (no block).
- A failed lookup shows "No pude ver tu saldo." and never blocks a button.
- `Grabar voz` is disabled when ElevenLabs does not reach. `Grabar video` is disabled when HeyGen does not reach, or
  when there is no voice yet and ElevenLabs does not reach.
- No server-side re-check in the actions (YAGNI): the balance is a screen hint read seconds before the tap; a real
  shortage still ends with the explanation the tasks already write (`TEXTO_SIN_CREDITOS`, the new ElevenLabs quota
  text).

Where Coni sees them: a new "Saldos" section in Ajustes (inside `Suspense`) and the lines next to the buttons on the
Guion screen (states `guion_aprobado`, `grabando_voz`, and `error_produccion` next to "Reintentar").

### 7. The Guion screen

- `guion_por_aprobar`: as today, but the slide reads "Desliza para aprobar el guion" and the note under it says
  "Aprobar no gasta nada. Después grabas la voz y el video.". The single cost line goes away (nothing is spent here).
- `guion_aprobado`: the editor stays, with a note "Si cambias el guion o el texto, vuelves a aprobarlo."; the avatar
  shows as text; the bottom bar (`BarraDeGrabacion`) shows:
  - the voice block: with a valid voice, the existing `ReproductorVoz` and "Volver a grabar voz"; without one, "Grabar
    voz". Under the button: "Grabar voz: ~1.100 caracteres (US$ 0,33)" and the ElevenLabs balance line;
  - "Grabar video" with "Grabar video: ~56 s (US$ 3,73)" (plus " · incluye la voz" when there is no voice yet) and the
    HeyGen balance line. It asks once before spending: "¿Grabar el video? Cuesta unos US$ 3,73." with "Sí, grabar" and
    "Volver";
  - "Volver a revisar el guion" (`reabrir_guion`), quiet button;
  - the explanation of a failed voice, if any, as an alert.
- `grabando_voz`: the script read-only, a busy note "Estoy grabando tu voz. Tarda unos segundos.", the buttons disabled,
  polling on.
- `error_produccion`: as today plus the voice player (when the stored voice is valid for the approved script) and the
  HeyGen balance line above "Reintentar".
- Money follows the existing formatter (`dolares`: "US$ 0,33", es-CL). The brief's "US$ 0.23" style is replaced by
  the repo's format for consistency.

Copy (es-CL, tú, no em dashes):

| Where | Text |
|---|---|
| Voice balance | "ElevenLabs: te quedan 23.400 de 100.000 caracteres. Se renuevan el 12 de octubre." |
| Video balance | "Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen." |
| Lookup failed | "No pude ver tu saldo de ElevenLabs." / "No pude ver tu saldo de API de HeyGen." |
| HeyGen without wallet | "HeyGen no informa un saldo de API para tu llave." |
| Monthly cap | "Te quedan US$ 37,00 de tu tope de este mes." |
| Voice short | "No te alcanzan los caracteres de ElevenLabs (te quedan 800 y esta voz usa 1.100). Recarga o mejora tu plan en elevenlabs.io, en Suscripción." |
| Video short | "Tu saldo de API de HeyGen no alcanza (te quedan US$ 1,20 y este video cuesta unos US$ 3,73). Recárgalo en app.heygen.com, en la sección API. Los créditos de tu plan de HeyGen no sirven para grabar desde Conidolly." |
| Ajustes explainer | "El saldo de API de HeyGen es distinto de los créditos de tu plan: Conidolly graba con el saldo de API." |

### 8. Inicio

- `guion_aprobado`: an "En camino" row "Guion aprobado · falta grabar", linked to `/guion/<id>` (`FilaEnCamino` gains
  an optional `href`). With an explanation (a failed voice), an error notice "Revisar" like the other errors.
- `grabando_voz`: "En camino" row "Grabando la voz · unos segundos", busy.
- Polling as in 5. Calendar: `guion_aprobado` and `grabando_voz` sort with the render states in `ORDEN_EN_CAMINO`;
  `leerContextoDeFechas` counts them in `enCola`. The video page redirects them to `/guion/<id>`.

### 9. What does not change

Two human gates; only Coni approves (database-enforced); nothing is spent without an approved script (both tasks check
the hash before spending); the HeyGen render still checks `puedeGrabar` and now also the voice; gate 2 and publishing
untouched; HeyGen v3 only.

## Deploy order and pieces in flight

1. `supabase db push` (Federico, macOS Terminal): the enum values, then the rules. The old app keeps working: it never
   writes the new states and the edit functions still accept `guion_por_aprobar`.
2. Trigger deploy: the new `grabar-voz` task and the new `grabar-pieza` code. Old app approvals still land in
   `en_render`, which the new code handles (it reuses or makes the voice under the new key).
3. `vercel deploy --prod --yes` right after: approvals now land in `guion_aprobado`.

Pieces in flight are covered by the table in 2. Rollback: redeploy the previous Vercel and Trigger versions; pieces in
`guion_aprobado` or `grabando_voz` would then be stuck for the old app, so before rolling back move them back with SQL
to `guion_por_aprobar` (clearing gate 1). The enum values stay (Postgres cannot drop them), which is harmless.

## Testing

- Unit (Vitest): voice fingerprint and keys, transitions, `puedeGrabarVoz`, balance rules and copy, providers with MSW
  (ElevenLabs subscription and quota error, HeyGen users/me), the cached reader with a fake clock, `RefrescoAutomatico`
  with fake timers, `BarraDeGrabacion` and the Ajustes section with Testing Library, Inicio model.
- Integration (local Supabase, MSW for ElevenLabs and HeyGen): the migrations' guards, the actions, `grabarVoz`,
  `grabarPieza` reuse and binding (legacy key accepted, re-approval reuses, a voice of another text is refused before
  HeyGen), maintenance and the spend sweeper.
- E2E (Playwright, fake services): approve spends nothing and starts nothing; record voice starts `grabar-voz`; a ready
  voice plays; balances show; an empty HeyGen wallet disables "Grabar video" with the text; "Grabar video" starts the
  render.

## Open questions

1. **HeyGen API price.** `estimarCostoVideo` assumes US$ 4 a minute of avatar_v. The API wallet price per second of
   Coni's engine should replace it (`USD_POR_CREDITO`); until then the "not enough" check may be off in either direction.
2. **ElevenLabs key permission.** If Coni's key was created with restricted permissions, `GET /v1/user/subscription`
   needs `user_read`; without it the lookup fails and the screen says "No pude ver tu saldo." (no block). Check once in
   production.
3. **HeyGen top-up link.** The copy names "app.heygen.com, en la sección API" without a deep link; confirm the exact
   page where the API wallet is topped up before adding a link.
4. **Characters billed.** The check uses the script length; models with a different character multiplier would need a
   factor.
5. **Credits unit.** When the API wallet is in `credits`, the check uses the plan's credits per minute (48 or 16). If
   the API counts credits differently, `estimarCreditosVideo` needs the API rate.

## Known limitations (accepted)

- Retention deletes only the current `audio_id` of a discarded piece; older takes under `voces/<id>/t-...` stay in R2.
  They are small mp3 files; a prefix delete can come later.
- The window between ElevenLabs answering and the upload finishing can still charge twice after a crash (no
  idempotency key at ElevenLabs), as today.
