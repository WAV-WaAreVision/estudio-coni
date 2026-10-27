# Conidolly: LinkedIn carousels, part 3 (automatic publishing)

Date: 2026-10-27. Status: approved by Federico in brainstorming (flow, fallbacks, data and rollout).
Parent spec: `docs/superpowers/specs/2026-10-26-conidolly-carrusel-linkedin-design.md` (C4 and D6; this document makes
D6 concrete). Parts 1 and 2 are in production (merge `799d0b5`).

## Goal

At the time Coni approved at gate 2, Conidolly posts the carousel to her LinkedIn profile by itself: the approved PDF
as a document and the approved post text. She no longer downloads, copies and uploads. The manual path of part 2
(`para_subir_a_mano` with "Descargar PDF", "Copiar texto", "Ya lo subí") stays as the safety net.

## Context verified on 2026-10-27

- LinkedIn phase 2 (direct posting of reels, merge `4e6e32b`) is in production code: `resolverLinkedin`
  (`lib/publicacion/linkedin.ts`), provider `lib/proveedores/linkedin.ts` (`subirVideo`, `estadoDelVideo`,
  `crearPost`, `VERSION_DE_LINKEDIN = "202609"`), domain `lib/dominio/linkedin.ts` (`siguientePasoLinkedin`,
  `MAXIMO_DE_INTENTOS_LINKEDIN`).
- Coni's LinkedIn connection exists (Vault secret `linkedin`, created 2026-10-07; 60-day token, expires about
  2026-12-06; the existing notices at 14 and 3 days apply).
- **No post has ever been sent through the API**: `publicaciones` has one LinkedIn row, `esperando`, the carousel
  scheduled for 2026-10-27 19:00. The phase 2 assumption F3 (a member app may call the `/rest` media endpoints) is
  still unverified. Decision (option A): part 3 is built and **the first real carousel is the smoke**; any rejection
  falls to manual.
- `publicaciones.documento_urn` already exists (migration `20261026000110`: format check `urn:li:document:...`, and
  `un_solo_medio`: never both a video and a document).
- `reservar_envio_linkedin` (migration `20261007000110`) only reserves a row whose `video_urn is not null`: it must
  accept a document too.
- `procesar` (`lib/publicacion/publicar.ts`) sends every carousel to `entregarCarrusel` before `resolverLinkedin`
  (part 2, decision P1).

## Documents API facts (from the parent spec, read 2026-10-26)

- `POST /rest/documents?action=initializeUpload`, `initializeUploadRequest.owner` = Coni's `urn:li:person:...`;
  permission `w_member_social` (already granted).
- `PUT` the PDF to the returned `uploadUrl`.
- `GET /rest/documents/{urn}`: `status` is `PROCESSING`, `AVAILABLE`, `PROCESSING_FAILED` or `WAITING_UPLOAD`.
- `POST /rest/posts` with `content.media = { id: <document urn>, title }`; 201 with the post id in `x-restli-id`.
- Limits: 100 MB, 300 pages (a carousel is at most 8 pages and well under the size).

## Design

### P3-1. Flow (approved)

At its time, a scheduled carousel whose LinkedIn row is `esperando`:

1. If LinkedIn is connected and the token is not expired, read the version bound at gate 2
   (`piezas.puerta2_carrusel_id`) and check it is still the approved one (same guard as `entregarCarrusel`:
   `puedeEntregarseParaSubir`, hash of the words, version id, not before its time).
2. If the row has no `documento_urn`: download that version's PDF from R2 (`pdf_clave`), `initializeUpload`, `PUT`,
   and store `documento_urn` on the row. A later run never uploads it again.
3. Poll the document until `AVAILABLE`, bounded by the existing `sondeoLinkedin` and LinkedIn's own deadline
   (`plazoVencido`).
4. Right before sending: re-read the piece; the bound version, its words and the post text must be unchanged and the
   approved half hour still open.
5. `reservar_envio_linkedin` (marks `enviado_en`, bumps the version), then `crearPost` with the document:
   `commentary` = the version's post text, `content.media.title` = the cover slide's text. Never sent again after the
   reservation.
6. Store `post_urn` (retrying the write, as video), the piece becomes `publicada`, and Coni is told
   "Tu carrusel «…» se publicó en LinkedIn." with the post link (`feed/update/<post urn>`).

Differences with the reel path: no avatar disclosure is required in the text (C11: carousels are signed
"Constanza del Rosario"); no Instagram; no video.

### P3-2. Falls to manual (approved)

Every case ends in `para_subir_a_mano` through the part 2 path (the PDF, the text and "Ya lo subí" already exist), with
the reason in the piece and in the notice:

| Case | Coni reads |
|---|---|
| LinkedIn not connected, or token expired | "LinkedIn no está conectado, así que te lo dejé para subir a mano." (`LINKEDIN_SIN_CONEXION`) |
| The approved half hour passed (or LinkedIn's own deadline) | the existing `EXPLICACION_LINKEDIN_TARDE` |
| LinkedIn rejected the PDF, or processing failed, after `MAXIMO_DE_INTENTOS_LINKEDIN` attempts | "LinkedIn no aceptó el carrusel, así que te lo dejé para subir a mano. WAV ya está revisando." |
| Doubt: reserved and no post id came back, or any failure after sending | "No pude confirmar si LinkedIn publicó tu carrusel. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí." Never resent. |
| The bound version or its words changed after approval | the existing guard (`EXPLICACION_CAMBIO_CARRUSEL`, error, WAV reviews); nothing is posted |

A transient failure before sending (LinkedIn or R2 not answering) counts one attempt and is retried on the next tick,
like video. A `PROCESSING_FAILED` document is dropped (`documento_urn` cleared) and counts one attempt, so the next
try uploads again.

Copy rules: tú, Chile, no em dashes, no jargon; carousel wording ("carrusel", never "video").

### P3-3. Gate 2 line (approved)

Under the date at a carousel's gate 2, one line from the connection state read on the server:

- connected and not expired at the chosen time: "Se publica solo en LinkedIn a esa hora."
- not connected: "LinkedIn no está conectado: te lo dejo para subir a mano."
- connected but the token expires at or before the chosen time: "Tu conexión con LinkedIn vence antes de esa fecha: te
  lo dejo para subir a mano."

No choice to make: automatic is the default, manual is the net. The expiry is known, so a token that will have expired
by the chosen date says so instead of claiming LinkedIn is not connected. The scheduled screen makes the same
distinction: with an expiring token it says "Tu conexión con LinkedIn vence antes de esa fecha." before the usual
"A esa hora te dejo el PDF y el texto para que lo subas a LinkedIn."

### P3-4. Data

- New migration: `reservar_envio_linkedin` reserves a row with `video_urn is not null or documento_urn is not null`;
  everything else unchanged (version lock, `programado`, `enviado_en`, never twice).
- Writing and clearing `documento_urn` from the service path (as `guardarVideoLinkedin` / `sumarIntentoLinkedin` with
  `borrarVideo`), keeping `un_solo_medio`.
- `siguientePasoLinkedin` learns the document: no URN yet means upload, otherwise wait; same order of `dudosa` and
  `a_mano` first.
- The piece reaches `publicada` through the existing transition (`cerrarPublicada`); check the state machine allows it
  for `tipo = 'carrusel'` and add it if it does not (test first).
- No new tables, no new piece states.

### P3-5. Code

- `lib/proveedores/linkedin.ts`: `subirDocumento({ token, miembro, datos })` (initialize plus PUT, returns the URN),
  `estadoDelDocumento({ token, documento })` (`listo`, `procesando`, `fallido`), and `crearPost` accepts either a
  video or a document with a title (one medium, never both).
- `lib/publicacion/linkedin.ts`: a carousel branch (`resolverLinkedinCarrusel`) with the same contract as
  `resolverLinkedin` (`nada`, `en_curso`, `guardia`, `listo`, or the row settled to manual).
- `lib/publicacion/publicar.ts`: for a carousel, LinkedIn goes first; `en_curso` waits for the next tick, `listo`
  closes as `publicada`, every manual outcome and `nada` (not connected) go to `entregarCarrusel` with the right
  explanation.
- Gate 2 component: the connection line.
- Nothing changes for reels.

## Tests (test first)

- Unit (LinkedIn mocked at the boundary): posts and closes as `publicada`; not connected and expired go to manual;
  outside the half hour goes to manual; `PROCESSING_FAILED` retried then manual after the maximum; a failure after the
  reservation goes to manual with the doubt text and a second run never calls `crearPost`; a run with `documento_urn`
  set never uploads again; the PDF sent is the bound version's `pdf_clave`, never a newer or older one; the text sent
  is the version's post text and has no avatar disclosure requirement; a changed version is refused before upload and
  before sending.
- Database: `reservar_envio_linkedin` reserves a document row, still refuses a row with neither medium, a stale
  version and a second reservation; `un_solo_medio` holds.
- E2E: gate 2 of a carousel shows each connection line; a scheduled carousel published through a mocked LinkedIn
  shows as published; the manual fallback still works.
- Guard: a reel's path is unchanged (existing suites stay green).

## Rollout

Same order as always: `db push`, then Trigger.dev, then Vercel from a clean `git archive`. Then the smoke: Coni
schedules a real carousel and Claude watches the first run in Trigger.dev. Success confirms F3 for documents. A
rejection leaves it to upload by hand, and the error is read before trying again. The carousel scheduled for
2026-10-27 19:00 is handed over by hand by part 2 (it is due before this ships).

## Risks

- F3 unverified: mitigated by the manual net; the first post is the test.
- The token expires about 2026-12-06: existing notices; the gate 2 line tells Coni ahead of time.
- A document still processing at the end of the half hour: falls to manual (no late post).
