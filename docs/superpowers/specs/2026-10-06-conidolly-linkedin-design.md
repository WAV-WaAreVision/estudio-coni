# Conidolly: LinkedIn as a second destination, manual mode (design)

Status: scope decided by Federico on 2026-10-06 (phase 1, manual mode). This document turns it into data, states,
hashes and screens. Plan: `docs/superpowers/plans/2026-10-06-linkedin.md`.

## Problem

Every piece goes to Instagram only. Coni also wants her reels on LinkedIn, where her audience is colleagues, schools
and companies, with a more professional text. Instagram is intentionally not connected today: at the approved time a
piece becomes `para_subir_a_mano` and she uploads it herself. LinkedIn starts the same way: no API, no OAuth, no
secrets. The app writes the text, Coni approves it at gate 2, and at the time she uploads it by hand.

## Facts from the code (verified 2026-10-06 on `main`, 64836c8)

- States (`lib/dominio/estados.ts`): `programado -> para_subir_a_mano` (event `entregar_para_subir`) and
  `programado | para_subir_a_mano -> publicado_a_mano` (event `subido_a_mano`, Coni only). The piece has one state, not
  one per destination.
- Gate 2 (`lib/dominio/puertas.ts`) stores `puerta2_video_id`, `puerta2_hash_texto = hashTexto(texto)` and
  `puerta2_publicar_en`. `aprobacionVigente` recomputes `hashTexto(texto)` and compares. `hashPuerta2` only feeds the
  idempotency key of the publish step. There is no gate-2 formula version yet (gate 1 has `puerta1_formula` 1 to 3).
- The `proteger_pieza` trigger (last redefined in `20261001001610_subir_a_mano.sql` and later migrations) treats any
  change of `puerta2_hash_texto`, `puerta2_video_id` or `puerta2_publicar_en` as an approval that only Coni can make,
  and only Coni can enter `publicado_a_mano`. Constraint `aprobada_para_publicar` requires `puerta2_hash_texto` in
  `programado`, `para_subir_a_mano`, `publicado`, `publicado_a_mano`.
- Writer: `escribirGuion` (`lib/proveedores/anthropic.ts`) returns `{ guion, texto }` from schema
  `SalidaGuion`; `pedidoDeGuion` has "REGLAS DEL TEXTO DE PUBLICACIÓN" (ends with `AVISO_AVATAR`, help lines when
  required, no tone marks). `revisarConClaude` judges guion and texto.
- Deterministic review: `revisarGuion` (`lib/dominio/revision.ts`) blocks on `aviso_avatar`, `lineas_ayuda`,
  `etiqueta_en_texto`, warns on `copia_de_fuente` and `nombra_autor` over guion and texto. `editarTexto`
  (`lib/acciones/piezas.ts`) reruns it and writes through `editar_texto_como_coni`.
- Publish cron (`lib/publicacion/publicar.ts`): with Instagram never connected, `entregarParaSubir` checks
  `puedeEntregarseParaSubir`, moves the piece to `para_subir_a_mano` and sends the `listo_para_subir` notice
  ("está listo para que lo subas a Instagram").
- Video screen `app/(app)/video/[id]/subir-a-mano.tsx`: download, copy text, confirm the AI label, optional link,
  "Ya lo subí". Inicio (`lib/inicio/modelo.ts`) and Calendario (`lib/calendario/modelo.ts`) read `para_subir_a_mano`
  and `publicado_a_mano`.
- Ajustes: singleton table `ajustes`; `lib/ajustes/estado.ts` lists accounts (`instagram`, `heygen`, `elevenlabs`,
  `anthropic`).
- Editorial line (`coni-heygen/contenido/linea-editorial.md`): tú, español de Chile, no tecnicismos.
- Latest applied migration: `20261004000110_aprobar_sin_grabar.sql`.

## Decisions

### D1. Data model: two columns on the piece, one row per destination

- `piezas.texto_linkedin text null`: the LinkedIn text. Null on every existing piece.
- `piezas.destinos text[] not null default '{instagram}'`, check: non-empty, subset of `{instagram,linkedin}`, no
  duplicates. The chosen destinations; stored in canonical order (instagram first).
- `piezas.puerta2_formula smallint null` (null means formula 1), check `in (1, 2)`.
- `ajustes.destinos_por_defecto text[] not null default '{instagram}'`, same check.
- New table `public.publicaciones` (one row per piece and destination):
  `pieza_id uuid references piezas on delete cascade`, `destino text check in ('instagram','linkedin')`,
  `estado text check in ('esperando','para_subir','subido_a_mano','publicado')`, `enlace text null`,
  `marcado_en timestamptz null`, `marcado_por uuid null`, primary key `(pieza_id, destino)`. RLS: Coni reads; no
  direct writes (only security-definer functions and the service role). Audit trigger like the other tables.

Why a table and not more columns: phase 2 adds per-destination ids (LinkedIn post URN, Metricool id), errors and
read-back results. Two booleans per destination on `piezas` would not hold that. The piece keeps its single state
machine; the table only says which destinations are still pending.

Rows are created when gate 2 is approved (one per chosen destination, `esperando`), deleted when gate 2 is taken back
(`cambiar_fecha`, `hora_vencida`, `editar_texto` in `programado`, `descartar`).

### D2. States per destination and of the piece

Per destination: `esperando` (approved, before the time) -> `para_subir` (time came, by hand) -> `subido_a_mano`
(Coni says so). `publicado` is reserved for an automatic destination (Instagram API today, LinkedIn in phase 2).

The piece state stays the summary:

- `programado`: approved, the time has not come.
- `para_subir_a_mano`: the time came and at least one destination is `para_subir`.
- `publicado_a_mano`: every destination is `subido_a_mano` or `publicado`, and at least one was by hand.
- `publicado`: every destination was automatic.

Event `subido_a_mano` gains `destino` and `quedanPendientes: boolean` (computed in the same transaction from the
table). If pendings remain, the piece keeps its state (`programado` or `para_subir_a_mano`); if not, it moves to
`publicado_a_mano`. Marking one destination early (before the time) is allowed, as today; `cancelar_publicacion` is
only emitted when nothing is left pending. Marking runs in one SQL function `marcar_subido_como_coni(p_pieza,
p_version, p_destino, p_enlace)` (Coni only) that updates the row and the piece atomically with the optimistic lock.

Mixed case (Instagram connected later and LinkedIn by hand): `publicado` from `programado` with LinkedIn pending
goes to `para_subir_a_mano` instead, Instagram row `publicado`. Covered by a domain test now so phase 2 does not have
to reopen the machine. With Instagram never connected (today), both destinations are by hand.

### D3. Gate 2 hash: formula 2

`puerta2_hash_texto` keeps its column and meaning ("hash of the text side of gate 2"):

- Formula 1 (null): `hashTexto(texto)`. Every existing approval keeps validating unchanged.
- Formula 2: `sha256(["puerta2/2", texto, linkedin, destinos])`, where `linkedin` is `texto_linkedin` when LinkedIn is
  chosen and `""` otherwise (editing an unused LinkedIn text does not take the approval back), and `destinos` is the
  canonical comma list (`instagram`, `instagram,linkedin`, `linkedin`).

New function `hashTextoDePuerta2(formula, { texto, textoLinkedin, destinos })` in `lib/dominio/puertas.ts`. The
action `aprobarVideo`, `aprobacionVigente` (via `puedePublicar` and `puedeEntregarseParaSubir`) and the publish cron
all compute with the formula stored on the piece. New approvals always write formula 2. `hashPuerta2` (idempotency)
is unchanged: it already takes the stored `hashTexto`.

Database guard: `proteger_pieza` refuses a change of `texto_linkedin` or `destinos` while `puerta2_hash_texto` is set
and is not being cleared in the same update (`artefacto_aprobado`), so nothing changes after approval except through
the paths that take it back.

### D4. Writing the LinkedIn text

One writer call: `SalidaGuion` becomes `{ guion, texto, textoLinkedin }`. New section "REGLAS DEL TEXTO PARA
LINKEDIN" in `pedidoDeGuion`:

- Same idea and message as the reel, reworked for LinkedIn and not copied from the caption, for a professional
  audience (colegas, colegios, empresas); tú normativo, español de Chile, sin tecnicismos, sin voseo ni usted.
- Shape (research on writing for LinkedIn, 2026): a hook of at most 140 characters and two lines; 1.300 to 2.500
  characters (hard maximum 3.000); short paragraphs; exactly one specific open question at the end of the body; no
  links; 0 to 3 hashtags in the last line; 0 to 3 structural emojis (none on a sensitive topic).
- Forbidden: the contrast formula "no es X, es Y" and variants, engagement bait ("comenta SÍ", "dale like si",
  "etiqueta a", "reacciona con"), Unicode bold or italic letters, long dashes.
- No tone marks, diagnoses, individual advice, patients, authors, sources or copied phrases.
- Ends with the fixed `AVISO_AVATAR_LINKEDIN` ("Este video lo narra mi avatar digital, creado con IA a partir de mi
  imagen y mi voz. El contenido lo revisé y aprobé yo."), before the hashtags, with the help lines before it when
  required. The Instagram caption keeps `AVISO_AVATAR`.

Cost: one call stays one call (about 250 more output tokens). Claude's review (`revisarConClaude`) also receives the
LinkedIn text in a `<texto_linkedin>` block.

### D5. Deterministic review of the LinkedIn text

New `revisarTextoLinkedin({ texto, esAvatar, requiereLineasAyuda, ajeno })` in `lib/dominio/revision.ts`, reusing the
same building blocks:

- Blocks: `aviso_avatar` (the LinkedIn notice), `lineas_ayuda`, `etiqueta_en_texto`, new `largo_linkedin` (over 3000
  characters, the LinkedIn limit). The database has no length check: the writer may overshoot and must not fail a run.
- Warns: `copia_de_fuente`, `nombra_autor`, `hashtags_linkedin` (more than 3), `largo_corto_linkedin` (under 1000),
  `gancho_linkedin`, `emojis_linkedin` (more than 3), `pregunta_linkedin` (not exactly one), `enlace_linkedin`,
  `contraste_linkedin`, `bait_linkedin`, `formato_linkedin`, `trato_linkedin`.
- Every finding carries `campo: "linkedin"` so the screen shows it under the LinkedIn field and the checkbox key stays
  unique. Existing findings have no `campo` (read as the caption or the script, as today).

Findings of the LinkedIn text only block gate 2 when LinkedIn is chosen. They live in the same `revision` jsonb.

### D6. Gate 2 on the Video screen

- New section "Texto para LinkedIn" under the caption: the text, "Editar" (same editor pattern as the caption),
  findings with `MarcaRevision`.
- "Dónde se publica": two `Casilla` (Instagram, LinkedIn), default from `ajustes.destinos_por_defecto`; at least one.
- Approval (`DeslizarParaAprobar`) sends `destinos`; the action recomputes the formula-2 hash from the row. The
  guarantee that she approved what she saw is the version lock: the write only matches the version of her screen, so a
  change in between refuses with `ArtefactoCambio`. The slider is held while the caption or the LinkedIn editor is
  open with unsaved changes ("Guarda o cancela la edición del texto.").
- Existing piece without a LinkedIn text and LinkedIn ticked: the field starts with the Instagram caption without its
  hashtags (deterministic, no Claude call) and the review runs on it; she edits it before approving.
- Editing the LinkedIn text uses a new action `editarTextoLinkedin` and SQL `editar_texto_linkedin_como_coni`,
  allowed in `guion_por_aprobar`, `guion_aprobado`, `video_por_aprobar` (no state change: it is not part of gate 1) and
  `programado` (back to `video_por_aprobar`, approval and rows cleared, `cancelar_publicacion`, like the caption).
- Changing destinations is not stored until approval; in `programado` it goes through "Cambiar fecha" (takes gate 2
  back).

### D7. Manual upload, per destination

At the approved time the cron (`entregarParaSubir`) moves every `esperando` row to `para_subir` and the piece to
`para_subir_a_mano`. The Video screen shows one block per pending destination:

- "Listo para subir a Instagram" (today's steps).
- "Listo para subir a LinkedIn": Descargar video, Copiar texto (the LinkedIn text), Casilla "Dije en el texto que es mi
  avatar digital", optional link (`linkedin.com` only, checked as text, never fetched), "Ya lo subí a LinkedIn".

Each "Ya lo subí" marks only its destination. A finished destination shows "Subido a LinkedIn" with the link.

### D8. Inicio, Calendario, notices

- Inicio: the "Para subir" card says where: "Para subir a Instagram y LinkedIn" / "a LinkedIn". Celebration when
  the piece reaches `publicado_a_mano`.
- Calendario: the label of a `para_subir_a_mano` piece names the pending destinations; a small destination line on
  every dated piece ("Instagram · LinkedIn").
- Notice `listo_para_subir`: "Tu reel «X» está listo para que lo subas a Instagram y LinkedIn." (destinations from the
  rows). Type and key unchanged; title becomes "Tu reel está listo para subir".

### D9. Ajustes

New section "Dónde se publica" with two `Interruptor`: Instagram, LinkedIn (meta "A mano por ahora"), at least one on.
Help text: "LinkedIn se sube a mano: a la hora aprobada te aviso y te dejo el video y el texto listos. Más adelante
podrá publicarse solo." Saved in `ajustes.destinos_por_defecto` through the existing settings action.

### D10. Existing pieces

Backfill: `destinos = '{instagram}'`, `texto_linkedin = null`, `puerta2_formula = null`. For pieces in `programado`
create an `instagram` row `esperando`; `para_subir_a_mano` -> `para_subir`; `publicado_a_mano` -> `subido_a_mano`
(with the stored permalink); `publicado` -> `publicado`. Behavior for them is exactly today's. Pieces not yet approved
at gate 2 can pick LinkedIn when Coni approves.

## Not in this phase

- No LinkedIn API, no OAuth, no tokens, no Metricool.
- No LinkedIn metrics.
- No separate LinkedIn video (same video file, 9:16).

## Phase 2 (described only)

Option A, LinkedIn API: app with "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect"; scope
`w_member_social` (+ `openid profile`); OAuth from Ajustes like "Conectar Instagram" (`/api/linkedin/conectar`, token in
Vault, expiry in `ajustes`, 60-day token with refresh reminder like `instagram_por_vencer`). Publishing: Videos API
(`initializeUpload`, chunked upload of the R2 file, `finalizeUpload`), then Posts API with `commentary` = approved
text; read the post back and compare the text before `publicado`. Row `publicaciones` gains `urn`, `enviado_en` and
idempotency key (same pattern as Instagram's container). `publicarPendientes` treats each destination independently.

Option B, Metricool: one connector for both networks (already used by the course flow). Cheaper to build, adds a
provider and its plan; the approved-text read-back depends on Metricool's API.

Decision deferred until phase 1 has a month of use.

## Risks

- A text approved in the LinkedIn field but edited by hand in LinkedIn: out of our control, same as Instagram.
- Old approvals: formula 1 path must stay forever (test pins it).
- The prefilled LinkedIn text for old pieces is the Instagram caption: may read too casual. She sees and edits it.
- Claude might forget the notice: deterministic review blocks, and the existing correction round
  rewrites.

## Open questions

1. Hashtag cap 3 (block) or warn only? Decided: warn.
2. Should the LinkedIn text also be shown (read only) on the Guion screen at gate 1? Spec: yes, read only, not part of
   gate 1.
3. Different time for LinkedIn (weekday mornings perform better)? Spec: same time; per-destination time in phase 2.
