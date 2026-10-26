# Conidolly: LinkedIn document carousels as their own piece (design)

Status: approved by Federico on 2026-10-26, section by section (flow and data, writing and rendering, publishing and
errors, tests and order). Mockups: `.superpowers/brainstorm/74563-1793049851/content/` (`estilo-carrusel.html`,
option A; `puerta-2-carrusel.html`, option A).

## Problem

Coni can only make reels: every piece goes through her voice and her HeyGen avatar, then Instagram and/or LinkedIn.
WAV's LinkedIn study (`~/Projects/coni-heygen/reports/Marca personal en LinkedIn.md`, section "El carrusel PDF lidera")
finds the PDF document is the top LinkedIn format in every source (7.00% engagement, 1.45x multiplier), ahead of
multi-image and of the avatar video, whose reach is falling. Coni needs to publish LinkedIn carousels on their own:
no video, no voice, no Instagram.

## Decisions (Federico, 2026-10-26)

| # | Decision |
|---|---|
| C1 | Format: LinkedIn **document (PDF)**, not multi-image. |
| C2 | Slides are **designed text from a template** (no photos, no AI images, no avatar frames). |
| C3 | A carousel is **its own piece type, LinkedIn only**. It never records video, never uses HeyGen or ElevenLabs, never goes to Instagram. Reels do not change. |
| C4 | Publishing: **LinkedIn API (Documents API) with the manual fallback**, the same doubt rule as video. |
| C5 | **Two gates**, like the reel: gate 1 signs the text, gate 2 signs the rendered carousel and the date. |
| C6 | Gate 2 shows a **horizontal rail of full-size slides** (mockup A), then the post text, then the actions. |
| C7 | Template style: **editorial sober** (cream paper, large serif). Three color variants of the same design: crema, piedra, oscura. |
| C8 | Changes: Coni **does not edit text on the phone**. "Pedir cambio" with a sentence; Claude rewrites. Max 3 change requests per piece. |
| C9 | Design changes at gate 2 are **bounded** (variant, split or merge a slide, highlighted word) and re-render **without** re-signing gate 1. Text changes go back to gate 1. |
| C10 | Rendering: **HTML template in headless Chromium** (Playwright) inside a Trigger.dev task, producing one PNG per slide and the PDF from the same page. |
| C11 | Carousels are **signed "Constanza del Rosario"** and carry **no avatar mention**, in the slides or the post text. Reels keep their disclosure unchanged. |

## Facts from the code (verified 2026-10-26 on `main`, 8feb2d5)

- `piezas` (`20261001000100_esquema.sql:22`): one state (`estado_pieza` enum: `idea`, `guion_en_proceso`,
  `guion_por_aprobar`, `en_render`, `subtitulando`, `video_por_aprobar`, `programado`, `publicado`,
  `error_produccion`, `error_publicacion`, `descartado`), mirrored in `lib/dominio/estados.ts`. Gate 1 columns
  `puerta1_hash/en/por`; gate 2 columns `puerta2_video_id`, `puerta2_hash_texto`, `puerta2_publicar_en`,
  `puerta2_en`, `puerta2_por`, constrained all-or-none (`num_nulls(...) in (0, 5)`, line 52). Gate triggers in
  `20261001000300_puertas_y_auditoria.sql`.
- `piezas.texto_linkedin` and `destinos` (`20261006000100_destinos.sql`); `publicaciones (pieza_id, destino, estado,
  enlace, ..., video_urn, enviado_en, post_urn, hash_enviado, intentos, explicacion, ultimo_error)`, `destino in
  ('instagram','linkedin')`. Production has 0 rows today.
- LinkedIn video upload: `lib/proveedores/linkedin.ts:95` (`/rest/videos?action=initializeUpload`, PUT ranges,
  `finalizeUpload`); the publishing path is `resolverLinkedin` in `lib/publicacion/linkedin.ts`, called first inside
  `procesar` (`lib/publicacion/publicar.ts`).
- Private storage is **Cloudflare R2** through the `Almacen` port (`lib/proveedores/almacen.ts`; memory in tests),
  with key helpers `claveAudio`, `claveVideo`, ...
- Trigger build extensions today: `ffmpeg()` and `additionalFiles` (`trigger.config.ts:48`). No browser yet.
- Script writing and its automatic review: `lib/proveedores/anthropic.ts` with `lib/dominio/revision`. LinkedIn
  editorial guide stored in the database (`20261017000120_guia_editorial_linkedin.sql`). Source line built by
  `lineaDeFuente` (`lib/dominio/fuente`).
- Pillars are data (`categorias`, read only through `lib/datos/pilares.ts`).

## Verified LinkedIn API facts (Documents API, version li-lms-2026-10, read 2026-10-26)

- `POST /rest/documents?action=initializeUpload` with `initializeUploadRequest.owner` = `urn:li:person:...` is
  allowed for a member; "for documents with person URN owners, the caller must match the document owner".
  Permission `w_member_social`, the one phase 2 already requests.
- Upload the file with PUT to the returned `uploadUrl` (no synchronous upload). Poll
  `GET /rest/documents/{urn}` until `status = AVAILABLE` (`PROCESSING`, `PROCESSING_FAILED`, `WAITING_UPLOAD`).
- Post: `POST /rest/posts` with `content.media = { id: <document urn>, title }`; 201 with the id in `x-restli-id`.
- Limits: 100 MB and 300 pages; PDF supported.
- Unverified (same as phase 2's F3): that a member app may call these `/rest` endpoints in practice. The first
  real post confirms it; if it fails, the row falls to manual (safe).

## Design

### D1. Flow

1. **Ideas**: on an idea, Coni chooses "Reel" (today) or "Carrusel de LinkedIn".
2. **Writing**: Claude writes the slides and the post text (D3). The piece goes to `guion_por_aprobar`.
3. **Gate 1, sign the text**: the slides as a numbered list plus the post text. "Pedir cambio" (one sentence,
   max 3 per piece, C8). Sign with "Desliza para firmar"; no cost line (nothing is recorded).
4. **Rendering**: task `armar-carrusel` (D4). The piece is in `armando_carrusel`.
5. **Gate 2, approve and schedule** (`carrusel_por_aprobar`): rail of slides, post text, date. "Pedir cambio"
   offers **"El texto"** (back to gate 1, new text version) or **"El diseño"** (D5, re-render, gate 1 stands). Sign
   with "Desliza para programar".
6. **Publishing** at the signed time (D6), or manual fallback.

### D2. Data

- `piezas.tipo text not null default 'reel' check (tipo in ('reel','carrusel'))`. Existing rows stay `reel`.
- New `estado_pieza` values `armando_carrusel` and `carrusel_por_aprobar` (`alter type ... add value`), mirrored in
  `lib/dominio/estados.ts`. Reel states never apply to a carousel and vice versa: a check ties `en_render`,
  `subtitulando`, `video_por_aprobar` to `tipo = 'reel'` and the two new values to `tipo = 'carrusel'`.
- A carousel has `destinos = '{linkedin}'` (check) and never `audio_id`, `video_id`, `render_id` (check).
- Gate 2 for a carousel stores the signed carousel version in place of `puerta2_video_id` (new column
  `puerta2_carrusel_id`), and the all-or-none constraint becomes: reels need `puerta2_video_id`, carousels need
  `puerta2_carrusel_id`, with the other four gate-2 columns as today.
- New table `carruseles`:
  `id uuid pk`, `pieza_id fk`, `version int` (unique per piece), `laminas jsonb` (portada, 4 to 6 ideas, cierre;
  each `{texto, destacado?}`), `texto_post text`, `hash_texto text` (hash of the words only), `diseno jsonb`
  (`variante`, highlighted words, slide split), `estado text check in ('escrito','armando','listo','fallo')`,
  `origen text` (`inicial`, `cambio_texto`, `cambio_diseno`, `acortado`), `pedido text` (Coni's sentence),
  `pdf_clave`, `png_claves text[]` (R2 keys), `creado_en`. RLS: read for Coni and the maintainer; writes only by the
  service and the gate RPCs.
- Gate 1 signs `hash_texto` (into `puerta1_hash`). A design change creates a new `carruseles` row with the **same
  `hash_texto`**, so gate 1 stands; a text change produces a new hash and returns the piece to gate 1.
- `publicaciones`: one row `destino = 'linkedin'`; new column `documento_urn` beside `video_urn`.
- Calendar and metrics: a carousel is a LinkedIn post (one slot, manual LinkedIn numbers like any post). Ideas
  marks the idea `usada` as today.
- The schema does not depend on any reel column, so carousels from other sources (not only ideas) can come later.

### D3. Writing (one Claude call, structured and validated)

- Input: the idea, its pillar, its respaldo and source, the LinkedIn editorial guide from the database.
- Output (zod schema): `portada {texto}` (the hook), `ideas [{texto, destacado?}]` (4 to 6, one idea each),
  `cierre {pregunta}` (open, specific, not engagement bait), `texto_post` (600 to 1,300 characters).
- The source line is added by `lineaDeFuente` on the closing slide and in the post text; Claude never writes it.
- Signature on slides and post: "Constanza del Rosario" (C11). No avatar line anywhere.
- The same automatic review as scripts (no diagnoses, no invented data, no patient stories, no keycap emojis, the
  rules of `contenido/linea-editorial.md` in coni-heygen) runs before Coni sees it.
- Prompt caching on the system prompt (over 1,024 tokens). Model: the one scripts use today.

### D4. Rendering (Trigger task `armar-carrusel`)

- Build: Trigger's Playwright build extension (Chromium) added beside `ffmpeg()`.
- Template: HTML + CSS in the repo (`lib/carrusel/plantilla`), each slide 1080 × 1350, the serif font file
  committed (an OFL font, no network fetch at render time), variants as CSS variables.
- Steps: load the template with the version's data, wait for `document.fonts.ready`, measure every text box
  (`scrollHeight > clientHeight` means overflow), screenshot each slide to PNG, `page.pdf` with one page per slide,
  upload to R2, mark the version `listo` and the piece `carrusel_por_aprobar`.
- Overflow: Claude shortens only the overflowing slides once (`origen = 'acortado'`, new text hash, so gate 1 is
  required again); if still overflowing, the piece returns to gate 1 with "Esta lámina quedó muy larga".
- Idempotency key: the `carruseles.id`. Trigger retries 2 times; then `estado = 'fallo'`, piece in
  `error_produccion`, Inicio says "No pude armar el carrusel" with "Reintentar (no se cobra)".

### D5. Design changes at gate 2 (bounded)

- Variant: crema, piedra, oscura.
- Split a slide in two at a sentence boundary, or merge two adjacent ones (never across portada or cierre).
- Highlighted word per slide (one of its own words).
- Each change: new `carruseles` row with the same `hash_texto`, re-render, back to gate 2. These do not count
  against the 3 text change requests. No free-text design requests.

### D6. Publishing

- Path beside the video in `resolverLinkedin`: `initializeUpload` (owner = Coni's person URN) → PUT the PDF →
  poll until `AVAILABLE` (bounded) → reserve `enviado_en` → `POST /rest/posts` with `content.media { id, title }`
  (title = the hook) → store `post_urn`.
- Doubt rule (as video): reserved and no post id back, or any failure after sending, goes to manual with
  "revisa tu LinkedIn" and is **never resent**. Outside the approved half hour no retry: manual.
- Manual: in the piece, "Descargar PDF" (short-lived signed R2 URL), "Copiar texto", and "Ya lo subí" with the link
  (today's `subido_a_mano`).
- LinkedIn not connected or token expired: scheduling is allowed; at publish time it goes to manual with the notice.

## Screens

- Ideas: the format choice on an idea ("Reel" / "Carrusel de LinkedIn").
- Gate 1 for a carousel: numbered slide list, post text, "Pedir cambio", "Desliza para firmar".
- Gate 2 for a carousel: rail (mockup A), dots, post text with "Ver texto completo", "Pedir cambio" (texto o
  diseño), date, "Desliza para programar".
- Inicio, Calendario and Métricas show the carousel as a LinkedIn piece with its own label.

## Tests

- Unit: the writing schema; overflow detection; `hash_texto` unchanged by every design change; split and merge keep
  words and order; a guard that a `carrusel` never reaches the voice, HeyGen or Instagram code paths.
- Database: RLS of `carruseles`; checks for `tipo` vs states, destinations and reel-only columns; gate RPCs.
- Integration: the render with real Playwright: PDF page count equals slide count; PNGs match committed references.
- E2E: Ideas → carousel → gate 1 → gate 2 (rail, one design change) → schedule; the manual fallback.
- Visual snapshots for the new screens and the three variants. LinkedIn is mocked at the boundary.

## Order (three parts, each deployable)

1. Piece type, writing, gate 1 (data, Claude call, review, screens).
2. Rendering task, gate 2, design changes.
3. Documents API publishing and the manual fallback.

Precondition for part 3 to publish by API: the real phase 2 smoke (one LinkedIn post) must pass. Without it, part 3
ships and carousels stay manual until it does.

## Rule change in coni-heygen

`CLAUDE.md` ("Transparencia"): reels with the avatar keep saying so in their text and carry Instagram's "Información
de IA" label; **LinkedIn carousels are signed "Constanza del Rosario" and carry no avatar mention** (they show no
avatar). Applied together with part 1.

## Risks

- The `/rest` Documents API for a member app (as F3 for video): mitigated by the manual fallback.
- Chromium in Trigger: larger image and cold start; acceptable because rendering is background work.
- Overflow loops: bounded to one automatic shortening.
- The editorial guide was written for scripts; carousel-specific rules (one idea per slide, closing question) live in
  the carousel prompt and are reviewed with Coni's first pieces.
