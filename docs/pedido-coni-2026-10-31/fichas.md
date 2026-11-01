# Change cards

One card per change, in Coni's numbering. Size: S < 1 day, M 1–3 days, L 1–2 weeks, XL more. Sizes are our estimate, not
Coni's (she called several of them "small" or "medium"). "Verify" lists claims about today's code that the spec must check
first. Line numbers point to `pedido-original.md`.

---

## Part A · Base and intake

### 29 · Ingesta inside Conidolly, one app in stages · XL (L.197)
- Stage 1 (S–M): Ingesta adopts Conidolly tokens (Geist, stone grey, always light). Coni opens "Biblioteca" without a code through
  a one-time magic link (`app/ir-a-biblioteca/route.ts` → Ingesta `app/ingreso/puente/route.ts`). WAV keeps its code.
- Stage 2 (XL): Materiales, Autores, Temas, Semana, Subir move to `app/(biblioteca)/biblioteca/*`. Bottom bar becomes 4 tabs.
  New `leerMiembro` / `conSesionDeMiembro` so WAV can enter the Biblioteca. 14 UX fixes (single "paste a link or choose a file"
  field, one-tap filters, Spanish error pages, a11y tests).
- Stage 3 (S): turn Ingesta off, permanent redirects to `conidolly.vercel.app/biblioteca/...`.
- Delete with 8 s "Deshacer": `borrar_desde` on `materiales`/`autores`, `*_visibles` views, `borrar_lo_marcado` cleans R2.
- Depends: nothing for stage 1. Blocks: stage 2 gates 1, 1b, 1c, 19, 21, 24 and the screens of 5, 6, 7, 17.
- Sensitive: 4a processes **without** confirming cost first (clashes with the US$ 1 threshold that 5 keeps); WAV gains access to
  Coni's app; `auth.admin.generateLink` with service role (confirm it sends no email); background hard delete in R2.
- Verify: duplicated `app/ingreso/` and `casillas-codigo.tsx`; Ingesta has no Claude/Voyage keys; `PESTANAS` has 3 tabs;
  `es_coni()`, `es_mantenedor()`; `afirmaciones.autor_id on delete restrict`; `deps.disparar`.
- Open: `verifyOtp` type for a magiclink token; `destinoSeguro` regex rejects hyphens; catch-all permanent redirect.

### 17 · Move to voyage-4 · L (L.720)
- Every vector records its model (`afirmaciones.modelo_vector`, `temas.modelo_centroide`, `ajustes.modelo_de_huellas`, trigger).
- Dry run in `huellas_candidatas`, recalibrate thresholds in `calibraciones_de_parecido` (Coni's decisions ×3), plain-language
  diff report (`informes_de_modelo`), Coni approves in `biblioteca/modelo`. Old vectors kept in `huellas_anteriores` for rollback.
- Applied inside the single reprocess of 7.
- Depends: 29-2 (screen), 7, 12 (cap as alarm), 9. Must be decided before the 1c pilot.
- Sensitive: replaces every vector in production; if dimension ≠ 1024, column type and HNSW indexes change.
- Verify: fusions today are decided by Claude (`confirmarFusiones`), not Coni; `embeddings_ficha` is unused and has a pending
  delete migration; `TOKENS_POR_AFIRMACION` = 100.
- Open: voyage-4 dimension, price, `output_dimension`; calibration from today's state is circular (everything set at 0.8).

### 5 · Separate the source/event from who said each thing · XL (L.1393)
- `fuentes` table (event, work, post) and `voces` per material (H1, H2… with role and confidence). Claim gets `voz_id`,
  `autor_estado`; **`autor_id` becomes nullable**. Doubtful authors stay out of the engine and the "Fuente:" line.
- ElevenLabs with `diarize=true`; **new provider Gemini** (gemini-2.5-flash) for YouTube in 45-minute chunks.
- Claude proposes names/roles/year; Coni confirms with one tap. "Escuchar" button at gate 1 (YouTube `&t=`, R2 signed URL).
- Transcription price editable (0.22, today 0.40 in code). New "Fuente:" line formats. Reprocess the 6 symposium videos.
- Prerequisite: a diarization test with a real symposium; the rest only if it works.
- Depends: 29-2, 12, 7. Used by 2, 4, 6, 7, 8.
- Sensitive: new paid provider and key; identifies third parties by voice (Ley 21.719); `respaldo_de_idea` rewritten (signed
  backings must keep their hash); LinkedIn text format changes.
- Verify: `autorDelMaterial`; Scribe v2 without diarization, 30 s segments; `USD_POR_HORA_TRANSCRIPCION` = 0.40;
  `limpiarTranscripcionDeYoutube` drops timestamps; `guardar_secreto` list.
- Open: diarization price; Gemini model, price (0.10 is a placeholder), daily cap; `fusionar_autores` undefined; null `autor_id`
  may break queries and Ingesta screens.

### 6 · Closed tag lists and hook library · XL (L.2197)
- `versiones_de_vocabulario` per network (type, evidence, audience, pain, emotion, hook), seeded from the manuals; only Coni
  approves. Type gains "límite", evidence gains "guía o consenso", both gain "sin_clasificar".
- `afirmacion_marcas` (several per claim), `terminos_sugeridos`, `correcciones_de_etiqueta`, provisional pillar by nearest topic.
- `ganchos` table + `biblioteca/ganchos` screen. Translate existing tags inside the reprocess of 7.
- Depends: 15, 5, 29-2, 7. Used by 1, 2, 13, 16, 18, 21, 22.
- Sensitive: replaces check constraints on `afirmaciones`.
- Open: emotion list must come from Coni; "mito" is both a type and a hook; text says Sonnet converts, code uses Voyage;
  `asignarPilarProvisorio` is N+1.

### 7 · Extraction instructions and single reprocess · XL (L.2817)
- `instrucciones` table, versioned per task (extract, ficha, theories, fusions, topic names, reclassify), English text plus
  `explicacion_es`; states propuesta → en_prueba → probada → vigente. Identity comes from each network's manual (drops
  "psicóloga clínica y sexóloga").
- Test bench of 5–10 materials with a simple report. Extraction v2: speaker per quote, closed lists, marks, figure state,
  patient rule in the prompt, 800-char overlap between chunks.
- Single reprocess: `reprocesos`, `afirmaciones_anteriores`, inherit by similarity 0.88 within the material, Message Batches,
  `reprocesar-todo` task. Order: extract → embed → inherit → voyage-4 if approved → drop empty topics → report.
- Depends: 18, 5, 6, 17, 9 (hard). **Bottleneck of the whole request.** Blocks the 1c pilot.
- Sensitive: deletes and rebuilds every claim in production; drops empty topics; new paid Voyage rerank endpoint.
- Verify: `VERSION_DE_EXTRACCION` only in R2; six prompts say "sexóloga"; reserve 0.025 per 12,000-char chunk;
  `motor_afirmaciones_de_tema(uuid, int)` signature.
- Open: section names for identity (with 18); batch + cache discount stacking; rerank model and price; what fails to inherit
  loses its topic and ideas.

### 8 · Material intake (folders, upload key, Instagram posts, audio links, podcasts) · XL (L.3575)
- Folder upload with one role/network/source per batch, no file cap, quick pre-check (content / junk / possible patient →
  held), range estimate, "Procesar ahora" or "Modo económico" (Message Batches). Separate `material-de-lote` queue.
- `llaves` table (hashed upload-only keys, expiry, revoke) and `app/api/entrada/route.ts` with Bearer.
- `post_instagram` type and "Reposts" tray (iPhone shortcut), files deleted after processing.
- Direct audio/video links (≤ 2 GB to R2), Apple Podcasts (iTunes/RSS), Spotify (oEmbed → Apple).
- Single DB entry `registrar_material(...)`: duplicates by SHA-256 + normalized link, no-patients declaration, estimate.
  `materiales.destino` (pendiente/grafo/para_leer/descartado). Reactivates `embeddings_ficha`.
- Depends: 29-2, 12, 5, 15, 3, 17, 7. Blocks 24, 19, 7.
- Sensitive: patient declaration moves from per material to per batch; Bearer entry without session; **SSRF** on arbitrary
  URL download; new providers; ~20 new columns; **do not apply** `pendientes/20261003000350_borrar_vinculos.sql`.
- Reposts spec: `reposts-original.md` (received 2026-11-01). Five pieces: upload-only keys with a panel, `POST
  /api/entrada/reposts`, iPhone Shortcut, "Reposts" tray, `instagram_repost` material (caption + slides + audio as one).
  Nothing is processed or spent until Coni picks it in the tray. Stages: keys and endpoint → Shortcut with 10 real posts →
  tray → processing → per-1,000 metrics.
- Reconcile with the main request: the spec says `llaves_entrada`, `/api/entrada/reposts` and `instagram_repost`; change 8
  says `llaves`, `/api/entrada` and `post_instagram`. One key table and one type. The tray belongs in the Biblioteca of
  Conidolly once 29 stage 2 is done, not in Ingesta.
- **Upload path must change**: the spec sends files (up to 25 MB images, 300 MB video) through a Next.js route, but Vercel
  limits request bodies to 4.5 MB. Use signed R2 upload URLs, as Ingesta already does.
- HEIC from the iPhone must be converted before Claude reads the slides.
- Open: SHA-256 of 2 GB files in the browser; legal basis of "private study use" (spec cites Ley 17.336 art. 71 B as
  orientation); behaviour before 12 exists; 8 checks on Coni's phone before stage 2 (does Repost give the original caption
  and @account, watermark on the free plan, videos in the camera roll, Shortcuts with videos over 50 MB).

### 24 · Research and classify · XL (L.4203)
- "Investigar" screen with suggested briefs (gaps, map edges, empty pillars, lopsided debates). Anthropic web search with
  editable `fuentes_preferidas`. Report of 3 angles × 3 findings, `validarHallazgos` drops invented URLs and quotes.
- Tables `investigaciones`, `hallazgos`, `para_leer_despues`, `investigar_uso`. Tray of up to 9 cards, "keep following" thread.
- Weekly watch task (Saturday 09:10), filters suicide/femicide news.
- Depends: 8, 29-2, 17, 15, 3, 19, 2, 6, 7, 12, 18, 1b, 5, 1, 21, 25. Goes last.
- Sensitive: new paid provider; scheduled spend without per-run approval; third-party health data; SSRF.
- Open: web search tool name and price; `confirmar_evidencia` overwrites every claim of the material; "Para leer después"
  created here and in 19.

## Part B · Organise and find

### 15 · Editable pillars per network · L (L.4895)
- `pilares_por_red` (definition, target weight, cadence, voice, colour token, vector, retire without deleting), `tema_pilares`
  (strength high/medium/low, origin), `tema_pilares_quitados`, `pilares_versiones`, `temas.transversal`.
- Seeds the 5 live LinkedIn pillars; the rest (6 LinkedIn, 4 Instagram + ADHD layer) in a review session with Coni.
- Settings panel (Coni publishes, diff before applying, warns if weights ≠ 100%). Chips in Topics. Weekly balance nudges.
- Depends: 29-2, 17, 21, 25. Blocks 6, 3, 9, 24, 16, 21.
- Sensitive: `retirar_pilar` rewrites `ideas.pilar` in production.
- Open: seed uses `descripcion` against a 10–1000 char check (migration fails on short/null); republishing drops Coni's
  strengths on retired pillars; `transversal` not per network.

### 9 · See and control topic fusions · L (L.5553)
- Full log in `fusiones` and `fusiones_afirmaciones`. Three verdicts: same / part_of / different; part_of goes to
  `temas_subtemas`. Claude's "no" is revisited when a topic grows 30%; Coni's "no" is permanent.
- Delicate cases (~5 per week) go to Coni; clear ones apply with exact undo (`deshacer_fusion`).
- Redefines `temas_parecidos` and `fusionar_par_de_temas`; one-off `scripts/reconstruir-fusiones.ts`.
- Depends: 15, 3, 29-2, 17, 25, 19.
- Sensitive: redefines functions used by the nightly job (signature drift between DB and code); one-off data rebuild.
- Verify: `recalcular_tema` deletes absorbed topics when the winner ends empty (risk inside undo).
- Open: more than 5 delicate cases a week; alias search has no search screen yet.

### 3 · My territory of interest (rate topics) · L (L.6108)
- `tema_calificaciones` (high/medium/low per topic and network, history), free pre-rating from 5 nearest neighbours (none with
  fewer than 10 rated), "new territory" below 0.6. Half-life per network, `temas_anclados` (max 10), `heredar_interes` on fusion.
- Interest weight 0.27 in ordering; ~5 questions a week; "Acerté 8 de 10" monthly.
- Depends: 15, 1b, 1c, 16, 21, 25, 29-2. Blocks 9, 24, 8, 21, 16.
- Open: adding 0.27 forces lowering other weights (which?); `anclar_tema` accepts null.

### 2 · Debate detector · L (L.6618)
- Nightly step: up to 100 pairs of close claims from different voices; Sonnet says contradict / nuance / agree.
- Weekly grouping into questions with sides A and B. Tables `debates`, `debate_afirmaciones`, `debate_pares`.
- Coni confirms and marks her stance; shown in Topics as "Dónde se discute"; the engine starts from debates.
- Cost: ~US$ 3–4/month. Depends: 5, 6, 15, 29-2, after the reprocess. Feeds 24, 21, 19.
- Open: Coni's examples sent as ids only (Claude learns nothing); `aplicarPlan` ignores update errors; threshold 0.75
  provisional until voyage-4.

### 1 · Search by meaning and by words · L+ (L.7258)
- "Buscar" in the Biblioteca: hybrid search (vector + `tsvector` with `unaccent`), RRF fusion, Voyage reranker on top 50.
- "Lo más cercano" (≤ 20, threshold 0.45) and "Conexiones nuevas" (5–8 via topic → idea, with visible path).
- Filters before rerank; search log from day one (`busquedas`, `busqueda_resultados`, `busqueda_eventos`, `busqueda_terminos`);
  collections.
- Depends: 29-2, 15, 5, 9, 3. Blocks 1c, 1b, 19, 21.
- Sensitive: `VOYAGE_API_KEY` on the web server too; generated stored columns + GIN indexes rewrite `afirmaciones` and `temas`;
  search history is personal data.
- Open: reranker model (rerank-2.5 vs "rerank-3") and price; `vectorDe` ignores errors; reranker failure only warns;
  can add to a collection but not create one.

### 1c · Search calibration pilot · L (L.7942)
- 1–2 week pilot: ~10 mixed results per search, Coni rates high/medium/low blind. `busqueda_calificaciones`,
  versioned `buscador_parametros`; proposal at 30 ratings / 8 searches, firm at 50, explained in words.
- Golden searches (`busquedas_de_oro*`) rerun nightly; regression warns Coni and WAV.
- Depends: 1. Feeds 3 and 1b.
- Open: golden runs are not free (min US$ 0.0001 each + rerank per processed material); service_role grants missing on
  `busquedas`/`busqueda_terminos`; a pending proposal blocks the next forever.

### 1b · Search history, term groups and suggestions · L (L.8584)
- Term chips with history; term families (`busqueda_grupos`) named nightly by Claude with translation; two combine modes;
  suggestions; signals view (opened/saved/used) that only breaks ties at first; gaps feed "Qué subir después".
- Depends: 1, 1c. Feeds 3.
- Sensitive: search terms sent to Claude; no control prevents searching with patient names.
- Open: nobody calibrates the 0.7 family threshold; nightly O(n²) rebuild without error checks; missing insert grant.

### 19 · Knowledge brain and projects · L+ (L.9185)
- SVG map of topics (PCA positions, bridges, debates, subtopics); filters.
- Projects (talk, course) with versioned structures proposed by Sonnet; export to Markdown; full ZIP export for Obsidian.
- `relaciones` table (7 types), filled later by 24.
- Depends: 29-2, 2, 15, 5, 7, 9, 3.
- Sensitive: exports the whole brain; claims sent to Claude; JSZip to dependencies.
- Open: "document or presentation" is only Markdown; 200-claim limit cuts silently.

## Part C · From engine to piece

### 21 · Combination workshop (replaces automatic crossings) · L (L.9850)
- Coni picks 2–3 topics from any pillar; free `taller_comun` shows what they share; Opus returns 4–6 options with distinct
  angles, network, format and hook; one-tap reactions. Tables `combinaciones`, `opciones_taller`, `taller_sugerencias`,
  `taller_silencios`. Sunday engine stops writing ideas and only suggests.
- Depends: 29-2, 15, 2. Blocks 4, 16, 12, 11.
- Sensitive: spends Claude before any script exists (like today's engine, but on demand); drops `motor_pares`; identity
  without "sexóloga".
- Open: suggestions table allows 2 topics, combinations allow 3.

### 4 · Better claims with the Voyage reranker · M (L.10507)
- ~40 candidates per topic reranked to 8 (2 strong guaranteed); backing reranked against the hook to 12 (3 strong).
  `opcion_afirmaciones`; gate 1 shows why each claim is there. New discard motive `se_va_por_las_ramas`.
- Depends: 21, 5, 7.
- Sensitive: backing hash at gate 1 must stay the same for old backings.
- Open: model and price; more calls than declared (one per topic + per option + voice).

### 16 · Recipe per network · L (L.11001)
- Scores suggestions and options with two recipes (LinkedIn, Instagram); suggested network is the higher score.
  Versioned `recetas`, monthly report with a proposal, shadow mode, real test with the 20% bucket. `ajustes/recetas` screen.
- Depends: 21, 3, 6, 15, 2, 13, 20. Blocks 12, 11.
- Sensitive: monthly Claude spend; "intimate pieces" judged by private responses (which audience data?).
- Open: tie 0.03 to confirm; Opus vs Sonnet; many ingredients have no data until 3, 6, 13 exist.

### 12 · Tray, bank and queue per network, weekly session, budget panel · XL (L.11559)
- No cap on ideas. Tray (untouched options, archived at 8 weeks), bank (pinned ideas, max 8 per network), queue per network
  with 70/20/10 buckets. Rhythm per network (`ritmo`, `ritmo_excepciones`, `repartir()`), duplicate detection (0.90),
  short series written the evening before.
- **Budget panel**: cap becomes an alarm (50/80/100%), `reservar_gasto` and `confirmar_gasto` rewritten (both repos call
  them), pause only when real cost exceeds the estimate by 20%. Subscriptions (Canva, Napkin), history.
- Depends: 21, 17, 16. Blocks 11, 21 and, through the cap, almost everything.
- Sensitive: **changes a protected rule** (cap stops being a brake); series write with Claude without an explicit tap.
- Verify: real engine cap is 8 crossings × 2 = 16 ideas; carousel reserve is US$ 0.50 (+0.20 if shortened).
- Open: initial rhythm per network; Canva and Napkin amounts; `ideas_por_semana` as goal or maximum.

### 11 · Two voices, formats and schedule per network · XL (L.12217)
- Idea gets `red_sugerida`; one idea yields up to 2 pieces (one per network) with distinct approaches.
- New formats `imagen` and `texto`; `piezas` enum and constraints rebuilt.
- Context per network: manual (18), territory (3), published memory (`memoria_publicada`).
- Schedule per network: unique `(destino, publicar_en)`; collision proposes the next free slot.
- Depends: 16, 21, 12, 3, 13, 18. Provides the per-network fallback that 18 needs.
- Sensitive: Instagram published through Meta directly (clashes with coni-heygen `CLAUDE.md`); LinkedIn image/text endpoints;
  data clean-up before unique indexes.
- Open: inconsistent costs (1.10 / 1.62 / 2 × 0.50).

### 18 · Writing aligned with the manuals · L (L.12663)
- One Claude call per network with its manual; manual per network and per section on `guias` (`red`, `secciones`, versions),
  `ajustes/manuales/[red]` editor, HTML/markdown importer, test bench before publishing.
- Vetoed topics blocked by code; new rules (LinkedIn text 200–400 for video, carousel 8–12 slides with fixed close,
  3-layer hook, IG caption limits, no final question on crisis topics, reel signs "Soy Constanza del Rosario.").
- Depends: 5, 15, 3, 7. Blocks 7, 11, 14, 22, 24.
- Sensitive: ADHD pieces need a colleague's review at gate 2; doubles writing spend when a piece goes to both networks.
- Open: **help lines: Coni asks *4141 and 131, code has 1455, *4141 and 133**; **production breaks between 18 and 11**
  (`cargarContexto` fails without a manual for the network); substring vetoes ("dosis") will give false positives.

### 14 · Visual brand module, code templates, Canva and Napkin · XL (L.13308)
- Versioned `marcas_visuales`; carousels record brand version, `armado_con`, `huella_archivos`; gate 2 signs a file hash and
  the publisher checks it against R2.
- `ajustes/marca`: base, variants, component library, fit tester in Chromium, contrast check, token export. New templates.
- Optional Canva (Connect API autofill) and Napkin with code fallback.
- Depends: 18, 15, 12. Blocks 23, 19.
- Sensitive: changes what gate 2 signs; new paid plans; font licences.
- Open: **Canva Connect uses OAuth with refresh tokens, not a fixed key in Vault**; Canva plan needed for autofill;
  Napkin API unconfirmed.

### 22 · Quick buttons to ask for changes and see what changed · M (L.13898)
- Fixed buttons at gate 1 (Más cálido, Menos técnico, Más matiz, Más corto, Más consultora, Más cercana, Otro gancho).
- `pedir_cambio` for reels and carousels; the 3-change limit becomes a warning. Word diff with one-tap undo.
- Red alert if a rewrite drops "no es terapia", "Fuente:", the avatar notice or the help lines.
- Depends: 6, 12, 11, 18. Blocks 28.
- Sensitive: allowed from `carrusel_por_aprobar` too, which drops signature 1; each tap spends (Claude, ElevenLabs in reels).

### 25 · Guided weekly session · M (L.14390)
- `/sesion` with 6 steps (summary with time, findings tray, workshop and bank, sign in a chain, reserve, "Semana lista"),
  `sesiones_semanales`, resume where left, "low energy day" mode. Eve and day notices replace the 08:30 summary on those days.
- Depends: 12, 21, 23, 24, 20, 29.
- Open: `empezar_sesion` does not change mode on resume; `p_semana` comes from the client.

### 28 · Conidolly UX: signing, spending, moving, notices · L (L.14728)
- After signing, "Siguiente…" button; carousel reading "Viste 3 de 6" enables the signature; self-retrying signature.
- Cost inside each button and "US$ 33 de 40" indicator from 80%. Smart "Volver", Spanish error pages, focus visible.
- App badge, "Recuérdamelo mañana", quiet hours. Autosave long fields. Always `color-scheme: light`. No countdowns, no GSAP.
- Depends: 12, 22, 23, 25, 11, 29.
- Open: whether urgent notices respect quiet hours; the proposed test expects "US$ 33 de 40" but `textoDeCosto` prints
  two decimals.

## Part D · Publish, measure and sell

### 23 · Flexible date signature, reserve per network, single signature for template carousels · L (L.15180)
- Gate 2 formula 3: the hash covers media and text without the date; the date is signed apart, exact or as a rule.
- Reserve per network (1 LinkedIn, 2 Instagram) of timeless pieces, expires at 30 days; `cubrir-con-reserva` task every 5 min;
  "Pausar todo" per network.
- Template carousels: built and shortened before gate 1, signed once after viewing every slide; two signatures again if Canva,
  Napkin or a paid image is used. Reels keep two signatures.
- Depends: 11, 12, 14. Used by 13, 20, 27.
- Sensitive: **changes the two-gate rule** (approved by Coni on 31-10); service_role writes `puerta2_fecha` and expiry deletes
  signatures, against "no service_role task writes approvals"; rewrites `proteger_pieza`.
- Open: help-line regex arrives with broken escapes.

### 13 · Metrics and publishing directly with Meta and LinkedIn · L (L.15760)
- Reconnect Instagram; update to current Meta metrics; `origen` api/manual. Publish Instagram carousels through Meta.
- LinkedIn: WAV applies for Member Analytics (new app, token in Vault); meanwhile an "Importar Excel de LinkedIn" button.
- Per-1,000 measures, monthly report by pillar/format/hour. `metricas_negocio`. Retire Metricool.
- Depends: nothing for measuring; 11 and 23 for publishing carousels. Used by 20, 26, 27.
- Sensitive: contradicts coni-heygen `CLAUDE.md` ("Instagram only through Metricool"); new LinkedIn app; new token.
- Open: Excel sheet/column names; JPEG vs PNG for Meta image_url; LinkedIn may deny access; hand-made xlsx parser.

### 20 · Business funnel and ads · M–L (phase 0), XL (phases 1–3) (L.16331)
- Phase 0: funnel stage on ideas/pieces/queue (60/30/10), `enlaces_de_pieza` with readable marks and `/l/m/[marca]`,
  consultations with fixed options only, `/funnel` panel (minimum 5 cases).
- Phases 1–3: ads module with 3–5 versions, rule checks, two signatures per ad, Meta Ads and LinkedIn Ads reading, campaigns
  created paused, separate budget line.
- Depends: 13, 12, 23.
- Sensitive: new ad APIs; ADHD test data; LinkedIn Thought Leader Ads need a company page (decision pending).
- Open: links "created on signing" require Coni's session, so a piece released by the reserve task gets no link.

### 26 · Personal data register and transparency page · M, **legal deadline 2026-12-01** (L.16851)
- `inventario_de_datos` (11 rows: purpose, provider, country, retention); nightly deletion with `registro_de_borrados`;
  yearly review notice.
- Public page `/l/ia` "Cómo uso IA en mi contenido", versioned. AI image checks (`revisarImagen`, C2PA, `is_ai_generated`).
- Depends: core nothing; deleters depend on 8, 13, 27. Last in Coni's order but has a date: **build the core early**.
- Open: countries and retention to confirm (maybe a short legal review); the public page reads with a client that RLS may block.

### 27 · Comments with risk signals: notify Coni, never reply · M (L.17223)
- Read comments (never DMs) every 15 min on own posts from the last 14 days; keyword lists, only doubtful ones go to Claude
  (yes/no). Urgent notice without the comment text; `/comentarios` only for Coni; minimal register with HMAC, no text.
- Editable reply templates with help lines; Coni copies and replies herself; pause switch.
- Depends: 13, 18. Retention from 26.
- Sensitive: **suicidal ideation of third parties sent to Claude in the US** (Ley 21.719); Meta permission
  `instagram_business_manage_comments` also allows replying (a test must assert no POST); new HMAC secret.
- Open: LinkedIn probably does not expose comments of a personal profile; liability when reading is paused or down.
