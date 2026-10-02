# Conidolly: rename, script editor, voice after gate 1, and the ingestion module

Date: 2026-10-02. Status: approved in conversation with Federico (brainstorming), pending spec review.

Two implementation plans come out of this spec, in this order:

- **Plan A** (in `estudio-coni`): rename to Conidolly, a script editor on the Guion screen, and the voice generated only after gate 1.
- **Plan B** (new repo `conidolly-ingesta` plus schema and tasks in `estudio-coni`): the ingestion module with materials, cards, a relation graph, theories, and source selection on the Guion screen.

## Decisions taken

| Topic | Decision |
|---|---|
| Domains | Free Vercel subdomains: `conidolly.vercel.app` (app) and `conidolly-ingesta.vercel.app` (ingestion). Vercel does not allow `ingesta.conidolly.vercel.app`. A custom domain can come later. |
| Architecture | Option A: separate Next.js app and Vercel project, same Supabase project, same R2 bucket, same Trigger.dev project. No API between the apps. |
| Material types | Documents and PDFs, web links and articles, audio and video, social posts. |
| What ingestion produces | Context for scripts only. It does not create ideas for the idea bank. |
| Who uploads | Coni and WAV, both sign in with the email code. |
| Patient data | Uploader declaration only. Accepted risk: nothing scans materials for patient data. |
| How material reaches a script | Coni chooses the sources herself, 0 to 5 per script. |
| Sources in output | Never. Neither the script nor the publication text cites, names an author, or copies phrases. Sources are inspiration only. |
| Link discovery | Embeddings (Voyage AI `voyage-3.5`, pgvector) to find candidates, Claude to classify the relation. |
| Voice | Generated only after gate 1 approves the final script. Never before. |

## Plan A: rename, editor, voice after gate 1

### Rename to Conidolly

- New Vercel production alias `conidolly.vercel.app`. `estudio-coni.vercel.app` keeps redirecting there during a transition period.
- Update every place the name or URL appears: app copy, PWA manifest (name, short_name), page titles, email sender name (`Conidolly <avisos@wearevision.cl>`), sign-in email subject, Supabase Auth `site_url` and redirect URLs (`[remotes.production.auth]` in `supabase/config.toml`, then `supabase config push`), `META_REDIRECT_URI` in Vercel and the redirect URI registered in the Meta app, the `/l` page if it names the studio, and the guide artifact for Coni.
- Internal technical names stay: repo `estudio-coni`, Supabase project, Trigger.dev project, R2 bucket. Renaming them adds risk and no user value.

### Script editor on the Guion screen

- Coni edits the script Claude wrote and the publication text, in a plain multi-paragraph text editor (no rich formatting).
- Live counters: words and estimated seconds against the 30 to 60 s target (75 to 150 words, from the editorial line).
- Saving runs the automatic review again (`lib/dominio/revision.ts` rules plus the Claude check) and shows blockers and warnings by type, as today.
- Every saved version is kept with author and timestamp. "Volver a la versión de Claude" restores the generated text as a new version.
- Gate 1 approves exactly the final text she left. The hash covers the final script text, the publication text, the chosen avatar, and the chosen sources (Plan B).
- Only Coni edits, only while the piece is in `guion_por_aprobar`, enforced by RLS and the existing guard functions. The existing `guardar_borrador` function is the starting point for the write path.

### Voice only after gate 1

Today `producir-pieza` writes the script and also generates the ElevenLabs voice before gate 1, and gate 1 approves script, text and voice together. The new flow:

1. `producir-pieza` writes the script and runs the review. No audio.
2. Gate 1: Coni approves the final script, publication text, avatar and sources.
3. A single task after approval generates the voice with ElevenLabs, then records the video with HeyGen, then burns subtitles.
4. Gate 2: Coni hears the voice for the first time inside the video and approves voice and video together, plus the date.
5. If the voice is wrong she re-records, which spends one more HeyGen render (about US$ 2).

Consequences:

- The gate-1 hash no longer includes the voice. Approvals made before this change stay valid, following the same backward-compatible approach used for the avatar (the old formula applies when the new fields are absent).
- The Guion screen loses the voice player.
- The spend cap still counts ElevenLabs, now charged after gate 1 only.
- The guide for Coni is updated (step 4 no longer mentions listening to the voice).

## Plan B: the ingestion module

### Repos and deployment

- New private repo `WAV-WaAreVision/conidolly-ingesta`, Next.js 16, same stack and conventions as Conidolly (Tailwind v4, Biome, Vitest, Playwright, pnpm). Vercel project `conidolly-ingesta`.
- Schema migrations for the new tables live in `estudio-coni`, the single owner of the schema. `conidolly-ingesta` generates its types from the database.
- Processing tasks live in `estudio-coni/trigger/`, in the same Trigger.dev project. The ingestion app only triggers them.
- Sign-in: same users and email code. Different domains mean one sign-in per app.

### Data model (new tables in the shared Supabase project)

- `categorias`: `id`, `nombre`, `creada_por`, `creada_en`. Seeded with the five editorial pillars (Pareja y conversación; Deseo y sexualidad; Autoestima y "ser tu propia diosa"; Género y límites; Bienestar emocional) plus `General`. New names are compared case- and accent-insensitively against existing ones; a match reuses the existing category. Categories can be renamed but not deleted while materials use them.
- `materiales`: `id`, `titulo`, `autor` (free text), `categoria_id` (required), `etiquetas` (text array), `tipo` (`documento`, `link`, `audio`, `video`, `post`), `origen_url` or `archivo_clave` (R2 key), `texto_clave` (R2 key of the extracted full text), `subido_por`, `declaracion_sin_pacientes_en` (timestamp, required), `estado` (`procesando`, `listo`, `fallido`), `motivo_fallo`, timestamps.
- `fichas`: one per material. `resumen` (about 150 words), `ideas_clave` (5 to 10), `citas` (each with text and location: page or minute), `fuente` (author, year, link), `editada_por`, `editada_en`. Editable by hand.
- `embeddings_ficha`: `material_id`, `vector` (pgvector, dimension of `voyage-3.5`), `modelo`, `creado_en`.
- `vinculos`: `material_a`, `material_b`, `tipo` (`complementa`, `amplia`, `contradice`, `mismo_concepto`, `ejemplo_de`), `relevancia` (1 to 5), `estado` (`sugerido`, `aceptado`, `descartado`), `razon` (short text with the supporting quotes), `decidido_por`, timestamps. One row per unordered pair.
- `teorias`: `id`, `titulo`, `texto` (thesis, arguments per source, contradictions), `categoria_id`, `creada_por`, `editada_en`.
- `teoria_fuentes`: `teoria_id`, `material_id`.
- `guion_fuentes`: `pieza_id`, and either `material_id` or `teoria_id`. Internal record of what inspired each script; never shown outside the app.

Access: Coni and WAV read everything and upload. Only Coni or the uploader deletes a material. Only Coni chooses sources for a script. All writes are audited with the existing triggers. Full texts and files stay private in R2, served through short-lived signed URLs.

### Upload and processing flow

1. In `conidolly-ingesta.vercel.app` the user picks a type: file (PDF, Word, audio, video), link, or post (link plus pasted text or the post's video).
2. Files upload straight to R2 with signed URLs (multipart for large video). Nothing goes through Vercel functions (4.5 MB body limit).
3. The form asks title, author, category (with "Agregar categoría nueva" at the end of the list), optional tags, and the required checkbox "Este material no contiene datos de pacientes".
4. Saving creates the material as `procesando` and triggers the `procesar-material` task.

`procesar-material` (Trigger.dev v4, retries):

- PDF and Word: extract text keeping page numbers.
- Link: fetch the page and extract the article body. Login walls fail with a clear reason ("El link pide iniciar sesión: sube el texto o el archivo").
- Audio and video: transcribe with ElevenLabs Scribe (existing key) keeping timestamps.
- Post: use the pasted text and transcribe the video if present. Instagram and TikTok are never scraped.
- Store the full text in R2, ask Claude for the card (summary, key ideas, quotes with location, suggested author when missing), embed the card with Voyage, find the 10 nearest materials with pgvector, and ask Claude to classify each candidate pair into a relation type and relevance, stored as `sugerido`.
- End state `listo`, or `fallido` with a reason and a retry button. If Claude or Voyage fail after the text is stored, the material is `listo` without suggestions and suggestions can be requested again.

### Ingestion screens

- **Materiales:** list with filters by category, author, type and state. Detail with the card (editable), the full text (download through a signed URL), and its links.
- **Grafo:** nodes are materials, colored by category, sized by number of accepted links; theories are nodes with a different shape. Edges show type and relevance (thickness). Suggested links are dashed until someone accepts, adjusts the relevance, or discards them. Links can be drawn by hand by dragging between nodes. Filters by category, author, link type and minimum relevance. Tapping a node shows its card; tapping an edge shows the reason with quotes from both sides. Rendered with Cytoscape.js. Must work on a phone (pan, zoom, tap) and offer a list view of the same links for accessibility.
- **Teorías:** select several nodes or a connected group and run "Sintetizar". Claude writes a theory: a central thesis, the argument each source contributes with its location, and where the sources contradict each other. The theory is editable and saved as a node.

### Sources on the Conidolly Guion screen

- Before asking Claude for the script, a "Fuentes" picker lists materials and theories, searchable and filterable by category and author, with the idea's pillar first. Coni picks 0 to 5.
- Claude receives the cards or theories with an explicit instruction: use them as inspiration only, write in Coni's words, never cite, never name authors, never copy phrases.
- The automatic review adds a rule: a run of about 8 or more words identical to a quote in a chosen card is flagged for rewriting.
- The chosen sources are part of the gate-1 hash. Changing them after approval invalidates the approval.

### Errors, cost and testing

- Ingestion spend (Claude cards and link classification, Voyage embeddings, Scribe transcription) counts toward the existing monthly spend cap.
- Expected cost: a card costs about US$ 0.02 to 0.10 per material depending on length; embeddings about US$ 0.01 per material; Scribe about US$ 0.40 per hour of audio; R2 stays inside the free 10 GB at this scale.
- TDD as in the rest of the project: extractors tested with sample files, integration tests against the local Supabase stack (RLS, category dedup, link uniqueness, audit), providers mocked with MSW, E2E for upload, graph accept/discard, theory synthesis, and source selection on the Guion screen.

## Out of scope

- Automatic source retrieval for scripts (Coni chooses by hand). The embeddings make it possible later.
- Creating ideas for the idea bank from materials.
- Scanning materials for patient data.
- Scraping Instagram or TikTok.
- A custom domain.

## Risks

- Patient data relies on the uploader declaration alone.
- With voice generated after gate 1, a voice problem is only seen in the video and costs a re-render.
- Large books produce long cards; the card prompt caps length so a script request stays bounded.
- Link suggestions depend on card quality; editing a card by hand does not re-run suggestions unless requested.
