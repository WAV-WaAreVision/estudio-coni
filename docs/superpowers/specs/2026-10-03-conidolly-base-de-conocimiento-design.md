# Conidolly knowledge base: authors, claims, topics and a weekly idea engine

Date: 2026-10-03. Status: approved in brainstorming, pending written review.

Supersedes, from `2026-10-02-conidolly-ingesta-design.md`: the material-to-material links, the graph screen, hand-picked theories ("Sintetizar"), the Fuentes picker of Plan B3, and the decision that every transcription is adapted to Coni's voice at ingestion. Everything else in that spec (upload, extraction, transcription, R2, spend cap, two human gates) stands.

## Why

Phase B2 shipped a graph of materials with suggested links and hand-picked theories. In production on 2026-10-03 it holds 6 ready materials, 6 embeddings, 1 suggested link and 0 theories. Four of the six materials are in "General" and each has a single tag that repeats its title. It does not fail because of a bug. It fails because of its design:

1. **Wrong unit.** It links documents, but the value is in the ideas inside them. A 200 KB account dump covers dozens of topics, and one summary plus one vector averages them into nothing. The card is also cut at 120,000 characters, so 75% of a 490,000-character upload is ignored.
2. **Manual curation that nobody will do.** Every suggested pair waits for Coni to accept or discard it on her phone.
3. **A visualization instead of a product.** The graph answers no question Coni has ("what do I talk about this week?", "what is said about anxious attachment that I have never said?").
4. **No automation.** Theories need a person to already know which materials to combine.
5. **The domain is missing.** There are no authors (free text), no topics and no characteristics.
6. **No consumer.** Links and theories never reach the idea bank, the script, talks or a book.
7. **All sources weigh the same.** An Instagram post, a study and a "miracle" peptide on X are treated alike, which is a risk for a clinical psychologist.
8. **Mixed roles.** Coni's own reel, the brand plan, a focus group and third-party accounts are processed the same way.
9. **Spend in the wrong place.** Adapting whole texts to Coni's voice at ingestion is the most expensive step (US$ 2.59 for one `.txt`) and happens before anyone knows whether the material is useful.

## Goal and success criterion

Every Sunday, about ten reel or post ideas reach the Conidolly idea bank. Each one is backed by a theory (a crossing of topics from different pillars), the claims that support it, their authors and their level of evidence. Coni's only job is to pick, use or discard ideas. Nobody curates links, topics or theories.

The project works if, within a month of the engine running, Coni pins or uses at least 3 of each week's ideas. This is a product metric to watch, not a test.

The same knowledge base later feeds topic dossiers, talks and a book outline. Those are out of scope here, but the data model must support them without changes.

## Decisions taken (brainstorming, 2026-10-03)

- First deliverable: weekly reel ideas with their backing, into the existing idea bank.
- Characteristics: knowledge (claim type, evidence level, stance), communication (audience, pain or desire, emotion, hook) and performance (from Coni's published pieces, once metrics exist).
- Input: batches per author (a `.txt` or PDF with many posts, a folder of videos, a book), uploaded by hand. Instagram and TikTok are never scraped.
- Budget: US$ 15 to 40 a month for this module (extraction with Sonnet, topic and theory synthesis with Opus).
- Approach: an atomized knowledge base that organizes itself (approach A), chosen over richer cards per material (B) and a schema-less weekly agent (C).
- Coni's voice is applied only when writing the script, never at ingestion.
- The graph, material links and hand-picked theories are removed.

## Data model

All tables live in the shared Supabase project. Migrations live in `estudio-coni`. Members are Coni and the maintainer (`es_coni()`, `es_mantenedor()`). Every new table has RLS, member read access and the existing audit trigger. Writes from processing use `service_role`.

### `autores` (new)

- `id`, `nombre`, `nombre_normalizado` (unaccented, lowercase, unique), `alias text[]` (handles and spellings that resolve to this author), `credencial` (free text, for example "psicóloga y neurocientífica"), `tipo` (`coni`, `persona`, `cuenta`, `institucion`), `creado_por`, `creado_en`.
- Seeded with Constanza del Rosario (`tipo = coni`).
- Members create and edit authors. An author with materials cannot be deleted.
- Matching at upload: an exact match on `nombre_normalizado` or on any alias suggests the existing author ("¿Es el mismo autor que…?").
- `fusionar_autores(p_origen, p_destino)` (member only) moves materials and claims to the surviving author, adds the old name to its aliases and deletes the duplicate. It is offered on the Autores screen.

### `materiales` (changed)

- New `autor_id` (required after migration) and `rol`: `voz_propia` (what Coni already said), `referente` (inspiration), `evidencia` (studies, books, clinical sources) or `estrategia` (brand plan, focus group, briefs).
- `categoria_id` becomes optional. The pillar now comes from each topic. `autor` (text) and `etiquetas` stay for legacy rows but are no longer asked in the form.

### `afirmaciones` (new, the core unit)

One claim made by one author in one material.

- `id`, `material_id` (on delete cascade), `autor_id`, `tramo` (chunk number), `ubicacion jsonb` (`{pagina}`, `{segundo}` or `{parrafo}`), `idioma` (ISO 639-1 of the quote).
- `texto`: a neutral Spanish paraphrase of one or two sentences, at most 280 characters. It is not in Coni's voice.
- `cita`: a verbatim fragment of the source in its original language. It is checked against the chunk.
- Knowledge: `tipo` (`definicion`, `causa`, `consecuencia`, `mito`, `consejo`, `dato`, `experiencia`), `evidencia` (`estudio`, `clinica`, `opinion`, `testimonio`) and `postura` (short text).
- Communication: `publico`, `dolor`, `emocion` and `gancho` (optional), all short text.
- `vector extensions.vector(1024)` (Voyage `voyage-3.5` on `texto`), `tema_id` (nullable, on delete set null) and `excluida boolean default false`. A member can exclude a bad claim from the engine.
- Indexes: HNSW cosine on `vector`, plus `tema_id`, `autor_id` and `material_id`.

### `temas` (new)

- `id`, `nombre` (short Spanish of Chile), `descripcion`, `categoria_id` (main pillar), `centroide extensions.vector(1024)`, `alias text[]` (names absorbed by merges), `fusionado_en` (nullable, points to the surviving topic), `creado_en`, `actualizado_en`.
- A view `temas_resumen` computes, per active topic: number of claims and of distinct authors, evidence mix, whether Coni's `voz_propia` covers it, and the date of the last claim. Counts are never stored, so they cannot drift.

### `teorias` (reused) and `teoria_afirmaciones` (new)

- `teorias` gains `origen` (`manual` for legacy rows, `motor` for new ones), `semana` (date of the Sunday of the run), `temas uuid[]`, `puntaje numeric`, `componentes jsonb` (the score breakdown), `nivel_evidencia` and `advertencias jsonb`.
- `estado` gains `descartada_por_motor`. The engine stores a theory it wrote as `guardada`. It stores a crossing it judged empty as `descartada_por_motor`, kept for the Semana screen and never sent to the bank.
- `teoria_afirmaciones(teoria_id, afirmacion_id, aporte)` records what each claim contributes. Legacy `teoria_fuentes` stays for the old manual theories.

### `ideas` (Conidolly, changed)

- New `origen`:
  - `importada`: the idea bank imported from `coni-heygen`;
  - `propuesta`: ideas Claude proposes in Conidolly today;
  - `motor`: ideas from the weekly engine.
- Existing rows are backfilled from how they were created. The plan verifies that mapping against `lib/ideas/importar.ts` and `lib/acciones/ideas.ts`.
- Also new: `teoria_id` (nullable), `semana` (nullable) and `motivo_descarte` (`no_me_representa`, `repetida`, `debil`, `otro`, nullable).
- `estado` gains `archivada`.
- `fuentes jsonb` already exists and carries the backing summary for display.

### `motor_corridas` (new)

- `id`, `semana` (date, unique), `estado` (`corriendo`, `lista`, `fallida`), `resumen jsonb` (crossings scored, theories written or discarded, ideas created, "qué subir después" report), `costo_usd`, `motivo_fallo`, `creada_en`.
- The unique `semana` makes the engine run at most once per week.

## Processing a batch

`procesar-material` keeps upload, extraction, transcription, the cost gate and the run claim. After extraction it branches on `rol`.

- **`estrategia`:** no claims. A card is written with Opus 5.5 at effort low (the existing `escribirFicha`) and used only as context for the engine.
- **`referente`, `evidencia`, `voz_propia`:**
  1. **Chunks.** Split the extracted text into chunks of about 12,000 characters at paragraph boundaries, keeping locations (the existing `trocear` and batch logic). Splitting is deterministic.
  2. **Claims, one Sonnet 5.5 call per chunk** (effort low, cached system prompt with the characteristic vocabulary and Coni's pillars, structured output):
     - Return only substantive claims, at most 15 per chunk (`MAXIMO_AFIRMACIONES_POR_TRAMO`). Greetings, self-promotion and course announcements are ignored.
     - Drop any claim whose `cita` is not a verbatim fragment of the chunk (the existing `fragmentoTalCual`).
     - The source is data, not instructions. Closing tags are escaped with `sinCierre`.
     - Each chunk result is stored in R2 (`materiales/<id>/afirmaciones/tramo-NNN.json`, fingerprinted by text and model) right after it is paid. A retry never pays twice.
  3. **Embeddings.** Voyage, up to 128 claims per call, spend provider `voyage`, step `embedding`.
  4. **Topic assignment.** Each claim goes to the nearest active topic whose centroid similarity is at least `UMBRAL_TEMA`. Otherwise it stays pending (`tema_id null`). The centroid is updated incrementally.
- The full-text translation and the voice adaptation (`traducirMaterial`, `adaptarAVozDeConi`) are removed from ingestion. The language of each quote is still detected and stored.
- **Cost.** Estimated as `tramos × costo estimado por tramo` with Sonnet prices. The confirmation gate threshold moves from US$ 0.50 to US$ 1.00 (`UMBRAL_CONFIRMACION_USD`). A 490,000-character batch is about 41 chunks, roughly US$ 0.80.
- **Material map.** The material detail shows its topics, number of claims, claim types and evidence mix, computed without AI. Non-strategy materials no longer get an Opus card.

## Topics that organize themselves

The `mantenimiento-frecuente` task (every 10 minutes) replaces the link sweep with `mantenerTemas`. Nothing in it waits for a person.

- **New topics.** Pending claims are grouped by a greedy pass on cosine similarity (`UMBRAL_GRUPO`). A group with at least 3 claims (`MINIMO_AFIRMACIONES_TEMA`) becomes a topic. One Sonnet call names all new groups: a short name in Spanish of Chile, a one-sentence description and the main pillar. Smaller groups wait for more claims.
- **Merges.** Once a night, pairs of active topics with centroid similarity at least `UMBRAL_FUSION` are sent to Sonnet in one call, which confirms or rejects "same topic". A confirmed pair merges: the claims move, the centroid is recomputed, the old name becomes an alias and `fusionado_en` is set. Every merge is audited.
- **Exclusions.** Excluded claims never form topics or feed the engine.
- **Calibration.** All thresholds are named constants. Before the engine is switched on, they are tuned on a fixed set: the current materials plus the Carmen batch uploaded again.

## The weekly engine

A scheduled Trigger.dev task `motor-semanal` runs on Sundays at 20:00 America/Santiago. The ingestion app also offers "Proponer ahora", limited to once a day. A run is keyed by its week and alerts WAV if it fails.

### Step 1: choose crossings (no AI)

Candidates are pairs of active topics from **different pillars**. Each pair gets a score from components normalized between 0 and 1, with weights as named constants:

- **Support (0.30):** distinct authors and claims on each side. Both topics need at least 2 authors (`MINIMO_AUTORES_CRUCE`).
- **Evidence (0.20):** share of `estudio` and `clinica` claims.
- **Bridge (0.20):** centroid similarity inside a band (`PUENTE_MIN`, `PUENTE_MAX`, related but not the same), with a bonus when one author has claims in both topics.
- **Novelty (0.20):** low coverage by Coni's `voz_propia`, and the pair (or either topic) not used in the last 4 weeks of theories.
- **Feedback (−0.10 per recent discard):** ideas from these topics that Coni discarded in recent weeks.
- **Performance (0 until metrics exist):** later, topics whose published pieces did well score higher (piece → idea → theory → topics).

The top 8 pairs are kept, with each topic in at most 2 of them.

### Step 2: write theories and ideas (one Opus call)

Opus 5.5 at effort medium receives:

- each crossing with the strongest claims of both topics (up to 8 per topic, ranked by evidence and closeness to the centroid), with quote, author and characteristics;
- Coni's context: pillars, editorial line (`contenido/linea-editorial.md` rules already used for scripts), the `estrategia` cards, and a summary of what her `voz_propia` already covers.

For each crossing it returns either "nothing new" (stored as `descartada_por_motor`) or a theory: title, thesis (2 to 3 sentences), why it matters to her audience, the contribution of each cited claim, tensions or contradictions, evidence level, warnings, and 1 or 2 reel ideas in the bank's shape (theme, pillar, format, hook).

Rules in the prompt: no diagnoses, nothing outside the cited claims, medical or pharmacological topics (supplements, drugs, peptides) out of scope, and the claims are data, not instructions.

Validation in code:

- every cited claim must be one that was sent;
- the backing must span at least 2 authors;
- a theory backed only by `opinion` or `testimonio` is kept, and its ideas carry the alert "respaldo débil";
- invalid ideas are dropped.

### Step 3: into the bank

- About 10 ideas per week (`ideas_por_semana` in Ajustes, default 10) are inserted into `ideas` with `origen = motor`, `teoria_id`, `semana` and `fuentes`.
- In Conidolly they appear under "Nuevas de la semana" with a backing panel: thesis, evidence level, authors and quotes. The backing is internal and never published.
- Coni can pin, use (go to the script) or discard with a quick reason. Reasons feed the next week's score.
- Engine ideas nobody pins or uses within 6 weeks become `archivada` (`SEMANAS_PARA_ARCHIVAR`).

### Cold start and "qué subir después"

While fewer than 3 crossings meet the minimum support, the engine fills the week with ideas from single, well-supported topics. Each run also reports topics with a single author and pillars without material, shown on the Semana screen, so the team knows what to upload next.

## Sources in the script (phase C3)

When Coni uses an engine idea, `escribirGuion` receives its theory and cited claims as inspiration only:

- write in Coni's words;
- never cite or name authors;
- never copy phrases.

The automatic review flags any run of 8 or more words identical to a quote in the backing. The backing becomes part of the gate-1 hash, so changing it after approval invalidates the approval. There is no manual source picker.

## Screens

### Ingestion app (`conidolly-ingesta`)

- **Subir:** type, file or link, title, **Autor** (search by name or alias, or "Autor nuevo" with credential) and **Rol** (four options, one line each), plus the patients checkbox. Category and tags are removed.
- **Materiales:** the list stays. The detail shows the material map.
- **Autores** (new): each author with their main topics, and a detail of what they say about each topic, with quotes.
- **Temas** (new, replaces the graph): topics ordered by support, filterable by pillar, with the badges "Coni ya lo trató", "un solo autor" and evidence mix. The detail shows claims grouped by author (each excludable) and the theories the topic took part in.
- **Semana** (new): the latest run with theories written and discarded (and why), the ideas sent to the bank, the "qué subir después" report and "Proponer ahora".

### Conidolly

- **Idea bank:** "Nuevas de la semana", the backing panel, and discard with a reason.

## Removed

- The graph screen, Cytoscape, link actions and the list of links.
- Material links: `vincular.ts`, `completar-vinculos.ts`, `clasificarVinculos`, `materiales_cercanos`, the link RPCs and the `vinculos_pendientes` and `vinculos_intentos` columns.
- Card embeddings: `embeddings_ficha` and `incrustarFicha`. The Voyage client stays.
- Hand-picked theories: `pedir_teoria`, `guardar_teoria`, `reintentar_teoria`, `marcar_teoria_disparo_fallido`, the `sintetizar-teoria` task, `sintetizarTeoria` and their screens.
- Ingestion translation and voice adaptation: `traducirMaterial` and `adaptarAVozDeConi` calls in `procesar.ts`.
- Opus cards for non-strategy materials.

The tables `vinculos` and `embeddings_ficha` are dropped in a cleanup migration once phase C1 is live. Today they hold 1 link and 6 vectors.

### Reused

- Voyage client and pgvector.
- `pagarPaso` and `pagadoAntes`, with per-chunk checkpoints.
- The cost gate and the run claim.
- Extraction, transcription and vision.
- `fragmentoTalCual` and `sinCierre`.
- The `teorias` table.
- The maintenance framework (`enSerie`) and the alert path to WAV.

## Migration of existing data

- **Authors:** created from the free-text `autor` of the six current materials. Constanza del Rosario becomes the seeded `coni` author.
- **Roles:**
  - "Resumen Ejecutivo Plan Marca" and "Cuña Focus Group" become `estrategia`.
  - "El deseo no se apaga" becomes `voz_propia`.
  - "El Sindrome de la Impostora" and "The Pinealon Miracle?" become `referente`.
  - "Test de Traducción" is deleted.
- **Reprocessing:** claims are extracted from the stored original text (`texto-original.txt`), so nothing is downloaded again. It costs a few cents.
- **Ideas:** existing rows keep working. They get `origen` backfilled and no theory.

## Errors, cost and limits

- Every paid step (chunk, embedding batch, naming, merge, engine) reserves against the monthly cap and confirms its real cost. When the cap is hit, a material waits as today, and the engine marks its run `fallida` with the cap reason and does not alert again that week.
- A failed chunk retries alone. A material that keeps failing ends `fallido` with a reason in Spanish of Chile and the existing "Reintentar".
- Expected monthly spend: batches US$ 0.30 to 1.00 each (Sonnet), topic naming and merges under US$ 1, engine US$ 0.25 to 0.50 a week. Total about US$ 10 to 25, inside the US$ 15 to 40 budget.

## Testing

- **TDD as in the rest of the project:** unit tests with MSW for every Claude and Voyage call, integration tests against the local Supabase stack (RLS, view counts, merges, the once-per-week key, archiving, migration of the six materials) and E2E for upload with author and role, the Temas and Autores screens, Semana, and the bank with "Nuevas de la semana" and discard with a reason.
- **Calibration with real data:** a repeatable evaluation script runs extraction on the fixed set and reports the verbatim-quote rate, the discard rate, claims per chunk and topic sizes. A person reviews a sample of claims (substance, correct characteristics) and topics (do they make sense). The thresholds are set from that review. The script spends real money, so it runs only with explicit approval.

## Phases

Each phase ships on its own.

- **C1: knowledge base.**
  - Authors, roles, claims, self-organizing topics and the migration of the six materials.
  - The Subir, Materiales, Autores and Temas screens.
  - Removal of ingestion translation, graph and links, followed by calibration.
  - Already useful without the engine: it answers "what does X say about Y" and "what topics do we have".
- **C2: weekly engine.** Crossings, theories, ideas into the bank, the bank changes in Conidolly, the Semana screen and archiving.
- **C3: sources in the script.** Inspiration-only prompt, copy check and the gate-1 hash.
- **Later:** performance from metrics once Instagram is connected, topic dossiers, and talk and book outlines.

## Risks

- **Thresholds.** Topic quality depends on `UMBRAL_TEMA`, `UMBRAL_GRUPO` and `UMBRAL_FUSION`. The fixed calibration set and the evaluation script exist for this, and a member can exclude a bad claim.
- **Evidence labels come from a model.** They are shown, not trusted blindly. Weak backing is flagged, and medical and pharmacological topics are out of scope for the engine.
- **Duplicate authors.** Alias matching at upload, plus a manual merge of two authors (reassigning materials and claims) through an RPC.
- **Third-party content.** Claims keep only a paraphrase and a short private quote. Outputs must be in Coni's words (C3 copy check), and nothing is downloaded from Instagram or TikTok.
- **Prompt injection.** The source is data, not instructions, closing tags are escaped and every model output is validated with Zod and against the data that was sent.
- **Bank growth.** It is held by the 10-a-week default and the 6-week archive.
- **Sunk cost.** About half of phase B2 is removed. It is accepted because it was built on the wrong unit.
