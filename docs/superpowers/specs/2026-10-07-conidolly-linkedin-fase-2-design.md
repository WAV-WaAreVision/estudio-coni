# Conidolly: LinkedIn phase 2, direct posting (design)

Status: design for review (2026-10-07). Builds on phase 1
(`docs/superpowers/specs/2026-10-06-conidolly-linkedin-design.md`, manual mode, in production). Plan:
`docs/superpowers/plans/2026-10-07-linkedin-fase-2.md`.

## Problem

Phase 1 writes and approves a LinkedIn text per piece, and at the approved time the piece waits for Coni to upload it
to LinkedIn by hand. Phase 2 lets Coni connect her LinkedIn profile once in Ajustes. After that, at the approved time,
the app uploads the approved video and posts the approved LinkedIn text on her personal profile. Manual mode is still
the fallback. If anything is missing or fails (not connected, token expired, LinkedIn refuses, the window passed, the
result is in doubt), the LinkedIn row goes back to "para subir" with a clear reason. Nothing is ever posted twice, and
nothing is posted that was not approved at gate 2.

Phase 1 left a choice between Option A (LinkedIn API) and Option B (Metricool). This document picks **Option A**:
self-serve products, no added provider or plan, and the post id comes back directly. Option B is still open for
Instagram.

## Verified LinkedIn API facts (2026-10-07)

Checked against the official docs on 2026-10-07. "Doc date" is the page's `ms.date`. Items marked **UNVERIFIED** were
not stated in the official docs. They are design assumptions, each with a fallback, and the production smoke
(section "Production") checks them.

| # | Fact | Source (doc date) |
|---|---|---|
| F1 | "Share on LinkedIn" grants `w_member_social`. "Sign In with LinkedIn using OpenID Connect" grants `openid`, `profile` and `email`. Both are open to all developers: you add them from the app's Products tab, with no review. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access (2025-06-24, updated 2026-06-03); https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2 (2022-12-14) |
| F2 | Videos API permissions list `w_member_social` ("on behalf of authenticated member"). `initializeUploadRequest.owner` can be `urn:li:person:{id}`. "For videos with member URN owners, the caller needs to match the video owner." The Videos API replaces the Assets API (`registerUpload`). | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api (2026-02-12; versions 202510 to 202609) |
| F3 | Posts API permissions list `w_member_social`. "The Posts API replaces the ugcPosts API." The Share on LinkedIn page still documents only `/v2/ugcPosts` and `/v2/assets?action=registerUpload` (old page, updated 2023-12-14). **Decision:** use the versioned `/rest/videos` and `/rest/posts`. **UNVERIFIED:** no official page shows a non-partner member app doing the full video flow on `/rest`, so the smoke covers it. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api (2026-05-07); https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin |
| F4 | Every `/rest` call needs the headers `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`. There is no default version: a call without one fails, and a sunset version answers 426. Versions come out monthly and each is supported for at least one year. The latest is **202609**. 202510 sunsets on 2026-10-15. | https://learn.microsoft.com/en-us/linkedin/marketing/versioning (2026-09-16) |
| F5 | Videos: 3 s to 30 min, 75 KB to 500 MB, MP4. Upload: `POST /rest/videos?action=initializeUpload` with `{initializeUploadRequest:{owner, fileSizeBytes, uploadCaptions:false, uploadThumbnail:false}}` returns `value.video`, `value.uploadToken` and `value.uploadInstructions[]` (`firstByte` and `lastByte` both inclusive, plus `uploadUrl`). Parts are 4,194,304 bytes. You PUT each part as `application/octet-stream` and keep its `ETag` response header. `POST /rest/videos?action=finalizeUpload` takes `{finalizeUploadRequest:{video, uploadToken, uploadedPartIds}}`, with the ids in instruction order. Upload URLs expire, typically after 30 days (400 `EXPIRED_UPLOAD_URL`). Captions are English only and optional, so we do not upload them; the subtitles are burned into the video. **UNVERIFIED:** an explicit rule that 9:16 vertical is supported. The schema reports `aspectRatioWidth/Height`, and a doc sample returns 9x16. | Videos API page above |
| F6 | `GET /rest/videos/{urn}` returns `status`: `WAITING_UPLOAD`, `PROCESSING`, `AVAILABLE` or `PROCESSING_FAILED` (with `processingFailureReason`). Posting with a video that is not ready fails with 400 `MEDIA_ASSET_WAITING_UPLOAD` / `MEDIA_ASSET_PROCESSING_FAILED`. **Decision:** post only when the status is `AVAILABLE`. **UNVERIFIED:** that a `GET` with only `w_member_social` is allowed for your own video. The table does not split permissions by method. | Videos API page above |
| F7 | `POST /rest/posts` body: `author`, `commentary`, `visibility: "PUBLIC"`, `distribution: {feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: []}`, `content: {media: {id}}`, `lifecycleState: "PUBLISHED"`, `isReshareDisabledByAuthor: false`. Response: 201, with the header `x-restli-id` set to `urn:li:share:{id}` or `urn:li:ugcPost:{id}`. Errors include 400 `FIELD_LENGTH_TOO_LONG`, 403 `ACCESS_DENIED`, 409, 422 and 429. **UNVERIFIED:** the 3,000-character commentary limit (official docs only name the error). We keep 3,000 as the review limit from phase 1. | Posts API page above; https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema (2026-02-13) |
| F8 | `commentary` uses the "little" text format. "All reserved characters need to be escaped with a backslash": `\| { } @ [ ] ( ) < > # \ * _ ~`. A hashtag is the template `{hashtag\|\#\|tag}`. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format (2025-02-25) |
| F9 | Permalink: the Posts API page gives `https://www.linkedin.com/feed/update/urn:li:ugcPost:{id}/`. **UNVERIFIED:** the same pattern for `urn:li:share:`. It is common practice, and the smoke checks it. | Posts API page above |
| F10 | `GET https://api.linkedin.com/v2/userinfo` (OIDC) returns `sub` and `name`. We build the author as `urn:li:person:{sub}`. **UNVERIFIED** in the official docs: the Posts schema builds the person URN from the Profile API `id`, which needs a scope we do not have. Using `sub` is the common practice for OIDC apps, and the smoke checks it with the first real post. | Sign In with OpenID Connect page above |
| F11 | OAuth 2.0 authorization code flow. Authorization: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id&redirect_uri&state&scope` (scopes space-delimited, URL-encoded). Token: `POST https://www.linkedin.com/oauth/v2/accessToken` (form: `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri`). `state` is for CSRF. `redirect_uri` must match a registered absolute HTTPS URL exactly. The code lives 30 minutes. The access token lives 60 days (`expires_in` 5184000). Asking for a different set of scopes invalidates earlier tokens. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow (2025-11-10, updated 2026-05-15) |
| F12 | Refresh tokens are "for all approved Marketing Developer Platform (MDP) partners" only. Our self-serve app gets none, so renewing means Coni runs the OAuth flow again. LinkedIn skips the consent screen when she is logged in and the token is still valid. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens (2025-05-31) |
| F13 | Token introspection exists: `POST https://www.linkedin.com/oauth/v2/introspectToken` returns `active`, `status` and `expires_at`. The official docs do **not** document a revoke endpoint. Disconnecting deletes our copy, and Coni can remove the app in her LinkedIn settings. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/token-introspection (2023-11-22) |
| F14 | Rate limits: the legacy Share on LinkedIn page lists 150 requests per member per day and 100,000 per app per day (UTC). For the versioned APIs, limits are "not published": you see them in the Developer Portal, Analytics tab. Exceeding them answers 429. One post costs us about 4 + N calls (N = 4 MB parts), far under any limit. | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits (2025-06-18) |
| F15 | Reading posts back (`GET /rest/posts/{urn}`) or listing a member's posts (`q=author`) needs `r_member_social`, which is **restricted** ("approved users only"). Our app cannot read the post back or find a post whose create response was lost. | Posts API page above |
| F16 | `DELETE /rest/posts/{urn}` answers 204. The scope needed is not stated. We do not use it: the smoke deletes the test post by hand. | Posts API page above |
| F17 | The 401 error body is `{message, serviceErrorCode, status}` (expired, revoked or invalid token). 429 means throttled. A duplicate post is **UNVERIFIED** in the official docs: third parties report 422 "Content is a duplicate of urn:li:share:...". | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/error-handling (2025-03-24) |
| F18 | AI labeling: LinkedIn shows a "CR" Content Credentials icon on media that carries C2PA signatures. In select countries, members uploading without credentials can self-declare AI use in the LinkedIn UI. The Posts schema has **no** AI-label field, and the old ugcPosts `contentCertificationRecord` is gone. HeyGen videos carry no C2PA. | https://www.linkedin.com/help/linkedin/answer/a6282984 ("Content credentials"); Posts schema above |

Consequences for the design:

- The API cannot read the post back (F15), so the Instagram rule "only a read-back makes it `publicado`" becomes: we
  only send what gate 2 hashed (checked right before sending), and the 201 with a valid `x-restli-id` is the proof.
- The API cannot recover a post whose answer was lost (F15). A run that sent the post and did not get the answer
  never sends it again. The row goes to manual with "check your LinkedIn first".
- There is no refresh token (F12): the 60-day token needs a reconnect, with warnings at 14 and 3 days.
- There is no API AI label and no C2PA (F18): the fixed avatar line in the approved text is the disclosure.

## Facts from the code (verified on `main`, b500dc2)

- `lib/publicacion/publicar.ts`: `publicarPendientes` leases `programado` pieces (`tomar_para_publicar`, 600 s).
  `procesar` hands the piece to Coni (`entregarParaSubir`) when Instagram is not pending or never connected.
  Otherwise it publishes to Instagram (container, polling, `publicacion_enviada_en` written before `media_publish`,
  `guardarMediaId`, read-back in `confirmar`). `confirmar` sends `publicado` with `quedanAMano` when the LinkedIn row
  is still pending.
- `publicaciones` (`20261006000100_destinos.sql`): `(pieza_id, destino)`, `estado` is `esperando`, `para_subir`,
  `subido_a_mano` or `publicado`, plus `enlace`, `marcado_en` and `marcado_por`. Coni can read it; only the service
  role and security-definer functions write it. The `sincronizar_publicaciones` trigger (`20261006000110`) creates
  rows on approval, deletes waiting rows when the approval is taken back, moves `esperando` to `para_subir` on
  handover, and marks rows on `publicado`/`publicado_a_mano`.
- `marcar_subido_como_coni` refuses an early Instagram mark while Instagram is connected (`instagram_se_publica_solo`).
- `proteger_pieza` (`20261006000100`): only Coni enters `grabando_voz`, `en_render`, `programado` or
  `publicado_a_mano`.
- Gate 2 formula 2 (`hashTextoDePuerta2`) binds caption, LinkedIn text (when chosen) and destinations.
  `puedePublicar` has a 30-minute window. `puedeEntregarseParaSubir` has none.
- Instagram connect: `/api/meta/conectar` sets a one-use `state` in an httpOnly cookie (path `/api/meta`, 10 min).
  `/api/meta/callback` calls `terminarConexion` (`lib/acciones/instagram.ts`), which saves through the
  `conectar_instagram` RPC (Vault secret `meta` plus `ajustes.meta_cuenta_id`/`meta_token_expira_en` in one
  transaction). The outcome travels as a fixed word (`?instagram=conectada|cancelada|...`), read by
  `lib/ajustes/instagram-aviso.ts`. There is no disconnect.
- Ajustes: `lib/ajustes/estado.ts` builds the status block (`Instagram vence en N días`, 7-day threshold) from
  `revisarCuentas`. `presentar.ts` builds rows ("Vence en N días"). `cuentas-conectadas.tsx` shows a plain
  `<a href="/api/meta/conectar">`. `editor-de-ajustes.tsx` "Dónde se publica" says LinkedIn "A mano por ahora".
- Nightly `mantenerTokenMeta` renews Instagram and warns Coni (notice type `instagram_por_vencer`, one key per day).
- Notices: `TIPOS_DE_AVISO` plus the check `avisos_tipo_check` (last redefined in `20261001001610_subir_a_mano.sql`).
- Provider URLs go through `baseDe(env, VAR, default)`, which refuses overrides on Vercel. MSW (`tests/msw.ts`) runs
  with `onUnhandledRequest: "error"`, so no real call can leave a test.
- Latest migration: `20261006000110_destinos_funciones.sql`.

## Decisions

### L1. One LinkedIn app, three variables, set by Federico

- Environment variables (Vercel only, production): `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
  `LINKEDIN_REDIRECT_URI` (`https://<dominio>/api/linkedin/callback`). `leerAppDeLinkedin(env)` returns `null` while
  any of them is missing. "Conectar LinkedIn" then shows "Todavía no está lista la conexión con LinkedIn. Falta
  configurar la app: avísale a Federico."
- Trigger.dev needs **no** LinkedIn variable. The publish task only uses the stored token (no refresh, no
  introspection).
- Test-only overrides through `baseDe`: `LINKEDIN_OAUTH_BASE_URL` (default `https://www.linkedin.com`) and
  `LINKEDIN_API_BASE_URL` (default `https://api.linkedin.com`), refused on Vercel.
- API version: the constant `VERSION_DE_LINKEDIN = "202609"` in `lib/proveedores/linkedin.ts`, not an env var, so a
  change is a reviewed commit. The nightly run tells WAV when the constant is 10 months old or more, two months before
  the one-year minimum (F4). A 426 answer is a configuration failure that goes to WAV.

### L2. Connecting: OAuth 2.0 authorization code with state (F11)

- `GET /api/linkedin/conectar` (Coni's session only): makes a 32-byte state, stores it in the httpOnly cookie
  `estudio_linkedin_estado` (path `/api/linkedin`, `SameSite=Lax`, `Secure` on https, 10 min), and redirects to the
  authorization URL with `scope=openid profile w_member_social`. We do not ask for `email`: least privilege.
- `GET /api/linkedin/callback`: runs `terminarConexionLinkedin` in this order:
  1. no app means `sin_app`;
  2. the state does not match the cookie (constant-time compare) means `estado`;
  3. an `error` parameter means `cancelada`;
  4. no code means `fallo`;
  5. trade the code for the token;
  6. a granted `scope` without `w_member_social` means `permisos`;
  7. `GET /v2/userinfo` gives `sub` and `name`;
  8. the RPC `conectar_linkedin(p_token, p_miembro, p_nombre, p_expira_en)` saves everything at once.

  A provider 4xx means `rechazada`, anything else `fallo`. The callback clears the cookie and redirects to
  `/ajustes/cuentas?linkedin=<word>`. Only the fixed words are read.
- The state helpers `nuevoEstado`/`estadoCoincide` move to `lib/acciones/estado-oauth.ts`, since they now have two
  callers. `lib/acciones/instagram.ts` re-exports them so its callers do not change.

### L3. Storage: Vault plus `ajustes`, like Meta

- Vault secret `linkedin`: the access token. Only `conectar_linkedin` writes it. `guardar_secreto` does not accept
  the name `linkedin`, so a pasted key can never replace an OAuth token.
- `ajustes` gets four columns: `linkedin_miembro text` (`urn:li:person:{sub}`), `linkedin_nombre text` (for
  "Publica como ..."), `linkedin_token_expira_en timestamptz` and `linkedin_conectado_en timestamptz`. A check keeps
  them all null or all set (`linkedin_completo`).
- `conectar_linkedin`: Coni only, refuses empty values and a `p_miembro` not shaped `urn:li:person:<id>`, and upserts
  the secret and the columns in one transaction.
- `desconectar_linkedin()`: Coni only. Deletes the `linkedin` secret and nulls the four columns.
- `linkedin_conectado()` (stable SQL, used by `marcar_subido_como_coni`): true when `linkedin_miembro` is set and
  `linkedin_token_expira_en > now()`.

### L4. Ajustes: connect, disconnect, expiry (14 and 3 days), reconnect

- `NombreDeCuenta` gains `linkedin`. LinkedIn is **optional**: a missing LinkedIn never makes the block say
  "Configuración: N de M" and is not a step there. A piece just goes by hand, as today.
- LinkedIn state (`revisarCuentas`, no network call):
  - `falta` when not connected;
  - `vencida` when the expiry has passed;
  - `vence` when 14 days or less are left;
  - `lista` otherwise.
- Status block: `vence` and `vencida` raise "atención" with the same pattern as Instagram. Instagram goes first when
  both need attention.
  - Title "LinkedIn vence en N días" / "LinkedIn vence mañana" / "LinkedIn dejó de estar conectado".
  - Text "Renuévalo para que tus videos sigan saliendo solos en LinkedIn. Mientras tanto, te los dejo listos para
    subir a mano."
  - Action "Renovar LinkedIn" (`/api/linkedin/conectar`).
- Row in "Cuentas conectadas":
  - The state shows "Conectada" / "A mano" (neutral, when not connected) / "Vence en N días" / "Desconectada".
  - Detail line "Publica como {nombre}" when connected.
  - Buttons:
    - "Conectar LinkedIn" (a plain `<a>`) when not connected.
    - "Renovar LinkedIn" when connected. LinkedIn has no refresh token (F12), so renewing is the same OAuth flow.
    - "Desconectar" (`Boton variante="linea"`) when connected. It opens `ConfirmacionEnLinea` with `trato="destructivo"`:
      - pregunta "¿Desconectar LinkedIn? Tus videos dejarán de salir solos ahí y te quedarán para subir a mano."
      - confirmar "Desconectar"
      - volver "Volver"
- After disconnecting: "LinkedIn quedó desconectado. Si quieres, también puedes quitar el permiso desde la
  configuración de tu cuenta de LinkedIn." (F13: there is no revoke API.)
- Callback outcomes (`lib/ajustes/linkedin-aviso.ts`):

  | Word | Kind | Title | Text |
  |---|---|---|---|
  | `conectada` | ok | "LinkedIn quedó conectado." | none |
  | `cancelada` | aviso | "Cancelaste la conexión con LinkedIn." | "Cuando quieras, vuelve a intentarlo desde Cuentas conectadas." |
  | `rechazada` | error | "LinkedIn no aceptó la conexión." | "Vuelve a conectarla desde Cuentas conectadas." |
  | `permisos` | error | "LinkedIn no dio permiso para publicar." | "Vuelve a conectarlo y acepta todos los permisos." |
  | `estado` | error | "La conexión con LinkedIn venció antes de terminar." | "Empieza de nuevo desde Cuentas conectadas." |
  | `sin_app` | error | "Todavía no está lista la conexión con LinkedIn." | "Falta configurar la app: avísale a Federico." |
  | `fallo` | error | "No pude terminar la conexión con LinkedIn." | "Inténtalo de nuevo en unos minutos. Si sigue igual, avísale a Federico." |

- "Dónde se publica" in Ajustes: the LinkedIn detail is "Sale solo" when connected and "A mano" otherwise. The help
  text becomes "Si LinkedIn está conectado, a la hora aprobada sale solo. Si no, te aviso y te dejo el video y el texto
  listos para subirlo a mano."
- Nightly (`mantenerTokenLinkedin`, inside `mantenimientoNocturno`), notice type `linkedin_por_vencer`:
  - 14 days or less left: "Tu conexión con LinkedIn vence en N días. Entra a Ajustes y toca Renovar LinkedIn: toma un
    minuto. Si no, tus videos te quedarán para subir a mano."
  - 3 days or less left: the same message.
  - Expired: "Tu conexión con LinkedIn venció. Mientras no la renueves en Ajustes, tus videos de LinkedIn te quedarán
    para subir a mano."
  - Keys are `linkedin_por_vencer:{14|3|0}:{expira_en date}`, so each threshold goes out once per token and a
    reconnect starts again.
  - Push body: "Tu conexión con LinkedIn necesita atención".

### L5. Data: per-row publishing state on `publicaciones`

New nullable columns, only used by the `linkedin` row:

| Column | Meaning |
|---|---|
| `video_urn text` | `urn:li:video:...` after `finalizeUpload` succeeded |
| `enviado_en timestamptz` | set **before** `POST /rest/posts`; from then on the post is never sent again |
| `post_urn text` | `urn:li:share:...` or `urn:li:ugcPost:...` from `x-restli-id` |
| `hash_enviado text` | `hashTexto(texto_linkedin)` of the text sent (audit) |
| `intentos smallint not null default 0` | failed tries in this approval (temporary errors, processing failures) |
| `explicacion text` | Coni's reason when the row fell back to manual |
| `ultimo_error text` | technical detail for WAV (no token, no secrets) |

Checks:

- `linkedin_publicado_con_urn`: `destino <> 'linkedin' or estado <> 'publicado' or post_urn is not null`.
- `post_urn_es_de_post`: `post_urn is null or post_urn ~ '^urn:li:(share|ugcPost):[0-9]+$'`.

New SQL function `reservar_envio_linkedin(p_pieza uuid, p_version integer) returns integer` (service role only). In
one transaction it:

1. locks the piece and requires `version = p_version` and `estado = 'programado'`;
2. requires the LinkedIn row `esperando`, with `video_urn` set, `enviado_en` null and `post_urn` null;
3. sets `enviado_en = now()`;
4. bumps the piece version;
5. returns the new version.

A screen that loaded the old version can no longer approve-change it under the send, and two runs can never both
reserve.

Changes to existing functions:

- `sincronizar_publicaciones`: when gate 2 is taken back, it keeps a LinkedIn row that has `enviado_en` or
  `post_urn`, so a post that may be live is never forgotten. On re-approval it does not reset such a row. On handover
  (`programado -> para_subir_a_mano`) it leaves `publicado` rows alone (already true) and keeps `explicacion`.
- `marcar_subido_como_coni`: refuses `p_destino = 'linkedin'` while that row is `esperando` and
  `linkedin_conectado()` (`linkedin_se_publica_solo`), mirroring Instagram. Once the row falls back to `para_subir`,
  she can mark it.
- `proteger_pieza`: the system may move `programado -> publicado_a_mano` only when no row is `esperando` or
  `para_subir` (L7, mixed case). Every other rule is unchanged.

### L6. Publishing LinkedIn at the approved time

`resolverLinkedin(contexto)` runs first inside `procesar` for every leased piece. Instagram's path follows unchanged,
and the piece-level end is adjusted in L7. Each step below is idempotent and is resumed from the row by the next
5-minute tick.

1. **Skip** (`nada`) when the LinkedIn row is not `esperando`, or when LinkedIn is not connected (no token, no
   member, or expired by `linkedin_token_expira_en`). The row stays `esperando`, and the handover moves it to
   `para_subir` exactly as in phase 1. When the cause is an expired connection, the handover notice adds "LinkedIn no
   está conectado, así que te lo dejé para subir a mano."
2. **Already decided:** `post_urn` set means done. `enviado_en` set without `post_urn` means **in doubt** (F15: we
   cannot look it up), and it goes to manual with
   `EXPLICACION_LINKEDIN_DUDOSA = "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no
   está, súbelo a mano desde aquí."`, plus an alert to WAV. The post is never sent again.
3. **Gate check:** `puedePublicar(pieza, {hashTexto: hashTextoActual(fila, texto), ahora})`, the same function and
   hash as Instagram. The approval must also be formula 2 (`destinos` includes `linkedin`), and `texto_linkedin` must
   be non-empty and contain `AVISO_AVATAR_LINKEDIN`.
   - `artefacto_cambio` / `sin_aprobacion` mean the whole piece fails (`EXPLICACION_CAMBIO`), as today. Nothing is
     posted anywhere.
   - `hora_vencida` with nothing sent means LinkedIn goes to manual with
     `EXPLICACION_LINKEDIN_TARDE = "No alcancé a publicarlo en LinkedIn dentro de la media hora que aprobaste, así que
     te lo dejé para subir a mano."`. Manual has no window, as in phase 1. Instagram's own path decides its own fate
     (`vencer` if connected).
   - `antes_de_hora` means wait. `estado` means throw, as today.
4. **Video:** when `video_urn` is null:
   - read the approved video (`puerta2.videoId`) from R2 with `almacen.bajar`;
   - check 75 KB to 500 MB (F5), else manual with `EXPLICACION_LINKEDIN_VIDEO`;
   - run `initializeUpload` (owner = member URN);
   - PUT each instruction's byte range and collect ETags;
   - run `finalizeUpload`;
   - save `video_urn`.

   A run that dies mid-upload leaves no `video_urn`, so the next tick uploads again. An orphan upload is invisible and
   harmless.
5. **Processing:** poll `GET /rest/videos/{urn}` up to `sondeoLinkedin.veces` times (default 8 every 15 s).
   - `AVAILABLE` means continue.
   - `PROCESSING` / `WAITING_UPLOAD` mean end the run with the piece still `programado` (`esperando`), resumed next
     tick.
   - `PROCESSING_FAILED` means `intentos + 1`, clear `video_urn` (re-upload next tick), and save
     `processingFailureReason` in `ultimo_error`.
6. **Re-check right before sending:** run `puedePublicar` again with the clock of this moment (polling takes time).
   Then call `reservar_envio_linkedin(pieza, version)`, which writes `enviado_en` and bumps the version.
7. **Post:** `POST /rest/posts` with
   - `author` = member URN,
   - `commentary = aLittleText(texto_linkedin)` (F8),
   - `content.media.id = video_urn`,
   - no `title` (not part of gate 2),
   - `visibility PUBLIC`, `MAIN_FEED`, `lifecycleState PUBLISHED`.

   A 201 with a valid `x-restli-id` means: in one write, the row becomes `publicado` with `post_urn`,
   `enlace = enlaceDePost(urn)`, `marcado_en`, `hash_enviado`, and an empty `explicacion`. The write retries 3 times;
   if it still fails, it throws with the URN in the message for WAV. Notice to Coni: "Tu reel «X» ya está publicado
   en LinkedIn. Míralo aquí: {enlace}".
8. **Errors** (`lib/proveedores/linkedin.ts` classifies them):
   - 401 → `TokenDeLinkedinVencido` → manual with
     `EXPLICACION_LINKEDIN_RECONECTAR = "LinkedIn pidió conectar de nuevo tu cuenta, así que te lo dejé para subir a
     mano. Renueva LinkedIn en Ajustes para los próximos."`.
   - 403, 426, or another 4xx before the post was sent → `RechazoDeLinkedin` → manual with
     `EXPLICACION_LINKEDIN_GENERICA = "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya
     está revisando."`, plus WAV.
   - 429, 5xx or network before sending → temporary: `intentos + 1`, `ultimo_error`, stay `esperando`. At
     `intentos >= 3` → manual (`EXPLICACION_LINKEDIN_GENERICA`).
   - **Any** error or lost answer **after** `enviado_en` (5xx, timeout, 422 duplicate, a 201 without a valid id) →
     in doubt → manual with `EXPLICACION_LINKEDIN_DUDOSA`. It never retries.
   - A 4xx on the post itself (400/403/422) is a definitive "no", but we cannot prove nothing was created without
     reading back (F15). So the text also tells her to check: it uses `EXPLICACION_LINKEDIN_DUDOSA` too.
9. "Manual" (`pasarLinkedinAMano`) sets the row to `para_subir` with `explicacion` and `ultimo_error`, alerts WAV
   ("LinkedIn no publicó un reel", detail), and does **not** send a separate notice to Coni. Her notice is the
   handover notice (L7), which carries the reason.

Never posted unless approved: the text sent is `texto_linkedin` of the leased row; the formula-2 hash over it is
recomputed and compared with `puerta2_hash_texto` in the same run, right before `reservar_envio_linkedin`. The version
lock makes sure the row did not change between the check and the send. The video sent is `puerta2.videoId`, which
`aprobacionVigente` checks against `pieza.videoId`.

### L7. Piece-level outcome (one state machine, per-row truth)

After `resolverLinkedin`, `procesar` does:

- the LinkedIn step returned `en_curso`: return `esperando` (the piece stays `programado` under its lease);
- the gate failed for the whole piece: as today;
- otherwise, read the pending rows (`esperando` or `para_subir`):
  - **Instagram pending:** today's Instagram path. `confirmar` already sends `publicado` with `quedanAMano` when the
    LinkedIn row is still pending (now also when it fell back to `para_subir`).
  - **Nothing pending** (LinkedIn published, and Instagram not chosen or already uploaded by hand):
    `cerrarPublicada` sends the event `publicado` with `algunoAMano` (true when a row is `subido_a_mano`). The state
    is `publicado`, or `publicado_a_mano` in the mixed case.
  - **Otherwise:** `entregarParaSubir` (phase 1). Its notice names only the destinations still pending and adds:
    - each fallback reason (`explicacion` of `para_subir` rows that have one);
    - "Ya salió en LinkedIn: {enlace}" when the LinkedIn row is `publicado`.

The domain event `publicado` gains `algunoAMano?: boolean`: `programado` goes to `publicado_a_mano` when it is true
and nothing remains by hand, else `publicado` / `para_subir_a_mano` as today.

### L8. Screens

- Video screen, gate 2, "Dónde se publica": under the LinkedIn checkbox, a `text-meta text-apagado` line: "Sale solo
  a la hora aprobada" when connected, "Lo subes tú a la hora aprobada" otherwise. This is information only, not part
  of the hash: connection is checked at publish time.
- Video screen, `programado`, LinkedIn row `esperando` and connected: "LinkedIn: sale solo a la hora aprobada."
- LinkedIn row `publicado` (automatic): "Publicado en LinkedIn" with a "Ver en LinkedIn" link (`enlace`). This is
  distinct from phase 1's "Subido a LinkedIn" for `subido_a_mano`.
- LinkedIn row `para_subir` with `explicacion`: a `LineaDeEstado tipo="aviso"` with the reason above phase 1's
  "Listo para subir a LinkedIn" block.
- Only `components/ui/*` and Calma suiza tokens (`app/globals.css`). No new colors, no hex. es-CL tú, no em dashes.

### L9. AI disclosure

- The approved LinkedIn text ends with `AVISO_AVATAR_LINKEDIN` ("Este video lo narra mi avatar digital, creado con IA
  a partir de mi imagen y mi voz. El contenido lo revisé y aprobé yo."). Phase 1's review blocks approval without it.
  Phase 2 checks it again right before posting (L6.3), and a missing line means manual plus WAV.
- C2PA / Content Credentials: not available. HeyGen output has no C2PA manifest, the Posts API has no AI-label field,
  and whether an embedded manifest survives an API upload is undocumented (F18). Self-declaring AI in the LinkedIn UI
  exists only in some countries and only in LinkedIn's own composer. The manual block keeps its checkbox "Dije en el
  texto que es mi avatar digital".

### L10. Idempotency summary

| Crash point | Next tick does | Double post possible? |
|---|---|---|
| During upload / before `video_urn` saved | re-uploads (orphan video unused) | no |
| After `video_urn`, while processing | polls the same video | no |
| After `reservar_envio_linkedin`, before answer | sees `enviado_en` without `post_urn` → manual, "revisa tu LinkedIn" | no |
| After 201, before row write | the write retries 3 times; if all fail, the run throws with the URN for WAV and the row keeps `enviado_en` → next tick goes in doubt → manual + WAV | no |
| Two runs at once | `tomar_para_publicar` lease + `reservar_envio_linkedin` version lock | no |
| Coni marks LinkedIn by hand while auto | refused (`linkedin_se_publica_solo`) while `esperando` | no |

### L11. What does not change

- Instagram's publishing path, its read-back and its 30-minute rule.
- Gate 1, gate 2 hashes (formula 2 already binds the LinkedIn text), the writer and the review.
- `gastos`: LinkedIn costs nothing per call.

## Federico's manual steps (checklist)

1. In https://www.linkedin.com/developers/apps, click "Create app".
   - Name it "Conidolly". For the LinkedIn Page, use WAV's or Coni's page (the form asks for one; not in the docs
     checked).
   - Upload the logo, accept the terms, and verify the app with the page admin if asked.
2. In the Products tab, add "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" (F1, self-serve).
   Wait until both show as added.
3. In the Auth tab, under "Authorized redirect URLs for your app", add exactly
   `https://conidolly.vercel.app/api/linkedin/callback`, or the production domain if it changes (F11: exact match,
   HTTPS). Check that the OAuth 2.0 scopes listed include `openid`, `profile` and `w_member_social`.
4. Copy the Client ID and the Primary Client Secret. **From the macOS Terminal app** (not the terminal inside the app:
   pasting secrets there corrupts them), run in `~/Projects/estudio-coni`:
   `vercel env add LINKEDIN_CLIENT_ID production`, `vercel env add LINKEDIN_CLIENT_SECRET production`,
   `vercel env add LINKEDIN_REDIRECT_URI production` (value `https://conidolly.vercel.app/api/linkedin/callback`).
   Paste each at the prompt. Verify with `vercel env ls production` (names only), and check the length without
   printing: `vercel env pull .env.check --environment=production && awk -F= '/^LINKEDIN_CLIENT_SECRET/{print length($2)}' .env.check && rm .env.check`.
   Never paste them into chat, files or the repo.
5. Do **not** add LinkedIn variables to Trigger.dev (not needed, L1).
6. Calendar: the token lasts 60 days. The app warns at 14 and 3 days, and "Renovar LinkedIn" takes a minute.
7. Every ~10 months, the nightly alert tells WAV to bump `VERSION_DE_LINKEDIN` (F4).

## Production

Order (same as phase 1):

1. Merge on `main` locally with the full gate green.
2. Database: Federico runs `supabase db push` **from the macOS Terminal**. Verify with
   `select column_name from information_schema.columns where table_name='publicaciones'` (new columns) and
   `select proname from pg_proc where proname in ('conectar_linkedin','desconectar_linkedin','reservar_envio_linkedin','linkedin_conectado');`.
3. Vercel first: push `main`, wait for the deploy, and grep a marker on prod ("Conectar LinkedIn" in `/ajustes/cuentas`
   after login).
4. Trigger second: `pnpm trigger deploy`. Before this step the old worker still treats LinkedIn as manual (safe).
5. Smoke, with Coni present, on her account. The first real post checks F3, F6, F9 and F10.
   1. Ajustes > Cuentas conectadas > Conectar LinkedIn. Coni logs in and accepts. "LinkedIn quedó conectado." and
      "Publica como Coni del Rosario".
   2. A short test piece (an existing approved video, test text with the avatar line). Coni approves gate 2 with only
      LinkedIn, 10 minutes ahead, at a low-traffic hour.
   3. Watch the `publicar-pendientes` runs. Expect the row to be `publicado`, `post_urn` set, and the notice with the
      link.
   4. Open the permalink: it is her post, with the vertical video, the exact text (accents, line breaks, hashtags
      clickable) and the avatar line.
   5. Delete the test post by hand in LinkedIn. Mark the piece `descartado`. Nothing else to clean up: the row keeps
      its URN as history.
   6. If the post fails, the row goes to `para_subir` with its reason, and WAV gets the detail. That is the safe
      outcome. Fix, then repeat.

## Risks

- **F3/F10 unverified** (the `/rest` video flow for a member app, `sub` as the person id): if refused, the row falls
  back to manual (safe), and the smoke tells us. The plan B is the legacy `ugcPosts` + `assets` flow, documented on
  the Share on LinkedIn page. That would be a contained change in `lib/proveedores/linkedin.ts`.
- **In-doubt outcomes** cannot be resolved automatically (F15). Coni is told to check her profile. Expected to be
  rare: one POST per piece, and short timeouts only on the post call.
- **Vertical video** rendering on LinkedIn (F5): assumed fine. The smoke checks it.
- **Token expiry** without renewal: degrades to manual, never fails a piece.
- **Little-text escaping:** a wrong escape changes what is shown. The round trip `desdeLittleText(aLittleText(t)) ===
  t` is pinned by tests over the real approved texts in fixtures.
- **Version sunset:** a nightly alert to WAV, and 426 is handled as a configuration failure.

## Open questions

1. Who does the smoke and when? It needs Coni's session (only she approves gate 2) and her LinkedIn login. Proposal:
   a 15-minute call with her.
2. Should a LinkedIn post that fell back to manual for a temporary reason be retried later (outside the 30-minute
   window)? Spec: no. Manual is the rule outside the window, consistent with "never at an unapproved time".
3. Per-destination publish time (LinkedIn weekday mornings): still deferred, as in phase 1.
4. Should "Desconectar" also exist for Instagram for symmetry? Out of scope here.
