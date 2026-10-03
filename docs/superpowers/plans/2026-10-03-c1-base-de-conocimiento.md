# C1: knowledge base of authors, claims and topics. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace material-to-material links and hand-picked theories with a self-organizing knowledge base. Every material belongs to an author and has a role. Every referente, evidencia or voz_propia batch becomes verbatim-backed claims with characteristics. Claims group themselves into named topics that merge on their own. The ingestion app shows Autores and Temas instead of the graph.

**Spec:** `docs/superpowers/specs/2026-10-03-conidolly-base-de-conocimiento-design.md` (sections Data model, Processing a batch, Topics that organize themselves, Screens, Removed, Migration, Testing; phase C1 only). The weekly engine (C2) and script sources (C3) are out of scope.

**Architecture:**

- Schema, Claude and Voyage calls, processing and maintenance live in `estudio-coni`. Screens live in `conidolly-ingesta`, which regenerates its types from the shared database.
- Claims are extracted per chunk with Sonnet 5.5. Each chunk is paid through the existing `pagarPaso` and checkpointed in R2.
- Claims are embedded in batches with Voyage and assigned to the nearest topic centroid in pgvector.
- New topics form from pending claims in the frequent maintenance run. Merges happen in the nightly run, each one confirmed by Sonnet.

**Tech Stack:** Next.js 16, Supabase (Postgres, RLS, pgvector in schema `extensions`), Trigger.dev v4, Cloudflare R2, Voyage `voyage-3.5`, Claude Sonnet 5.5 / Opus 5.5 through `MODELO_POR_TAREA`, Vitest, MSW, Playwright, Biome.

**Rules (as in every plan of this repo):**

- Strict TDD: write the failing test first and see it red.
- One commit per task, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Never `as any`, `@ts-expect-error`, non-null assertions or silent catches.
- Biome safe mode only, and `"use client"` on line 1.
- Semantic tokens only.
- Copy in Spanish of Chile, `tú`, no em dashes.
- SQL version conflicts raise `PT409`, never `40001` (PostgREST hangs on it).
- No real network in tests: use MSW.
- Never touch the hosted project (`mvfytttfxmzzjajecsch`).
- Run the DB suites one at a time, never in parallel.
- Migrations go in range `20261003000300`-`20261003000399`.

**Commands:**

- estudio-coni: `pnpm type`, `pnpm test:run`, `supabase db reset && pnpm test:db`, `pnpm build`, `pnpm db:types`. `pnpm lint` has one known failure, `tests/unit/duracion.test.ts` (useTemplate); ignore only that one.
- conidolly-ingesta: `pnpm db:types`, `pnpm lint`, `pnpm type`, `pnpm test:run`, `pnpm test:db`, `pnpm build`, and e2e with `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell pnpm test:e2e`.

**Facts from the current code (verified 2026-10-03):**

- `lib/proveedores/anthropic.ts`:
  - `MODELO_POR_TAREA` is at `:29`.
  - `CARACTERES_POR_LOTE = 12_000` is at `:409`.
  - `sinCierre` (private) is at `:438`.
  - `fragmentoTalCual` (private) is at `:597`.
  - `escribirFicha` stays, for `estrategia` only.
  - `clasificarVinculos`, `sintetizarTeoria` and `adaptarAVozDeConi` will be removed.
- `lib/ingesta/traducir.ts` exports `trocear`, `idiomaPorHeuristica`, `detectarIdioma` and `traducirMaterial`. After Task 3 it is used by nothing except the language detection, which moves.
- `lib/ingesta/gasto-material.ts` exports `pagarPaso`, `pagadoAntesEn`, `pagar`, `pagadoAntes`, `leerJson`, `guardarJson`, `Contexto`, `TOPE` and `MaterialBorrado`.
- `lib/ingesta/procesar.ts`:
  - `traduccionDe` is at `:469`.
  - `incrustarFicha` is at `:584`.
  - `fichaDe` is at `:603`.
  - `estimarCostoRestante` is at `:661`.
  - `procesar` is at `:690`.
  - `UMBRAL_CONFIRMACION_USD = 0.5` is at `:98`.
- `lib/proveedores/voyage.ts` exports `embeber`, `costoVoyage`, `MODELO_VOYAGE` and `DIMENSIONES`.
- `lib/mantenimiento/ejecutar.ts`:
  - `mantenimientoFrecuente` runs `arranques`, `renders`, `gastos`, `vinculos` (completarVinculos, `LIMITE_DE_VINCULOS = 20`) and `teorias` through `enSerie`.
  - `mantenimientoNocturno` runs `retencion`, `token` and `respaldo`.
- conidolly-ingesta:
  - `app/(app)` has `grafo/`, `teorias/`, `materiales/`, `subir/`.
  - `lib/ingesta` has `grafo.ts`, `vinculos.ts`, `teorias.ts`, `modelo-de-teoria.ts`, `seleccion.ts`, `subir.ts`, `materiales.ts`.

---

## estudio-coni

### Task 1: Authors and material roles (schema)

**Files:** Create `supabase/migrations/20261003000300_autores.sql`. Test `tests/integration/autores.test.ts`.

- [ ] **Step 1: Failing integration tests:**
  - `autores(id, nombre, nombre_normalizado generated (public.unaccent_inmutable(lower(btrim(nombre)))) unique, alias text[] default '{}', credencial, tipo check in ('coni','persona','cuenta','institucion'), creado_por default auth.uid(), creado_en)`. Seeded with "Constanza del Rosario", `tipo = 'coni'`.
  - RLS: Coni and the maintainer read. Writes go only through RPCs, with nothing granted directly.
  - `crear_autor(p_nombre, p_credencial, p_tipo)` (member only, 42501 otherwise):
    - returns the id;
    - a name equal to an existing `nombre_normalizado`, or to any alias normalized the same way, returns the existing id;
    - a blank name raises 22023 `autor_vacio`.
  - `borrar_autor(p_id)` (member only): refuses the Coni author (22023 `autor_coni_protegido`) and authors with materials (22023 `autor_con_materiales`). `crear_autor` refuses `tipo = 'coni'` (22023 `tipo_coni_reservado`).
  - `fusionar_autores(p_origen, p_destino)` (member only):
    - moves `materiales.autor_id` (and later `afirmaciones.autor_id`, Task 2) to the destination;
    - adds the origin's name and aliases to the destination's aliases;
    - deletes the origin;
    - the same id twice raises 22023.
  - Deleting an author with materials is refused by FK `on delete restrict`.
  - `materiales` gains `autor_id uuid references autores on delete restrict` and `rol text not null default 'referente' check in ('voz_propia','referente','evidencia','estrategia')`.
  - `categoria_id` becomes nullable.
  - Members may insert `autor_id`, `rol` and a null `categoria_id`, and may update `autor_id` and `rol`. Add them to the existing column grants.
  - **Backfill:**
    - one author per distinct normalized non-blank `materiales.autor`;
    - "constanza del rosario" maps to the seeded Coni author;
    - `materiales.autor_id` is set for every row with an author;
    - rows without an author text get a single author "Sin autor".
  - After the backfill, `autor_id` is `not null`.
  - Audit trigger on `autores`.
- [ ] **Step 2: Run red** (`supabase db reset && pnpm vitest run --config vitest.integration.config.ts tests/integration/autores.test.ts`).
- [ ] **Step 3: Write the migration.** Security definer functions use `set search_path = ''`, revoke from public and anon, and grant to authenticated.
- [ ] **Step 4: Run green**, then `pnpm db:types && pnpm test:db`.
- [ ] **Step 5: Commit** `feat(ingesta): authors and material roles`.

### Task 2: Claims and topics (schema)

**Files:** Create `supabase/migrations/20261003000310_afirmaciones_temas.sql`. Test `tests/integration/afirmaciones-temas.test.ts`.

- [ ] **Step 1: Failing integration tests:**
  - `temas(id, nombre, nombre_normalizado generated unique, descripcion, categoria_id references categorias, centroide extensions.vector(1024) not null, alias text[] default '{}', fusionado_en uuid references temas, creado_en, actualizado_en)`, with an HNSW cosine index on `centroide`.
  - `afirmaciones` has these columns:
    - `id`;
    - `material_id` (on delete cascade);
    - `autor_id` (references autores);
    - `tramo int not null`, `ubicacion jsonb not null`, `idioma text`;
    - `texto` (check `char_length <= 280`), `cita`;
    - `tipo` check in (`definicion`, `causa`, `consecuencia`, `mito`, `consejo`, `dato`, `experiencia`);
    - `evidencia` check in (`estudio`, `clinica`, `opinion`, `testimonio`);
    - `postura`, `publico`, `dolor`, `emocion`, `gancho` (nullable);
    - `vector extensions.vector(1024)` (nullable until embedded);
    - `tema_id` (references temas on delete set null);
    - `excluida boolean default false`;
    - `creada_en`.

    Indexes: HNSW cosine on `vector`, plus `tema_id`, `autor_id` and `material_id`.
  - RLS: members read both tables. Inserts and updates come from `service_role`.
  - `excluir_afirmacion(p_id, p_excluida boolean)` (member only) is the only member write. Excluding a claim sets `tema_id = null`, so the next maintenance recomputes the topic.
  - View `temas_resumen` (`security_invoker = true`), active topics only (`fusionado_en is null`), with these columns:
    - `afirmaciones` and `autores`: count and distinct authors of non-excluded claims;
    - `evidencia`: jsonb counts per level;
    - `cubierto_por_coni`: true when any claim comes from a `voz_propia` material;
    - `ultima_afirmacion`.
  - `fusionar_autores` (Task 1) now also moves `afirmaciones.autor_id` (`create or replace`).
  - SQL `tema_mas_cercano(p_vector extensions.vector, p_umbral float)` returns `(tema_id, similitud)` or nothing. It looks at active topics only, ordered by `centroide <=> p_vector`, limit 1, and returns a row only when `1 - distance >= p_umbral`. Execute is granted to `service_role` only.
  - Audit trigger on `temas`. Not on `afirmaciones` (volume), which is documented in the migration.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run green**, `pnpm db:types && pnpm test:db`.
- [ ] **Step 5: Commit** `feat(ingesta): claims and self-organizing topics schema`.

### Task 3: Shared text helpers out of the translation code

**Files:** Create `lib/ingesta/texto-seguro.ts` (`sinCierre`, `fragmentoTalCual`, moved verbatim from `anthropic.ts`) and `lib/ingesta/tramos.ts` (`trocear` and `CARACTERES_POR_TRAMO = 12_000`, moved from `traducir.ts`, plus `aTramos(partes)` returning `{numero, texto, ubicacion}[]`). Modify `lib/proveedores/anthropic.ts` and `lib/ingesta/traducir.ts` to import them. Tests `tests/unit/texto-seguro.test.ts`, `tests/unit/tramos.test.ts`.

- [ ] **Step 1: Failing tests:**
  - `aTramos` keeps every character exactly once, never exceeds the limit, is deterministic, and keeps the first `ubicacion` of each chunk.
  - Move the existing `sinCierre` and `fragmentoTalCual` cases into the new file. They are currently tested through the Claude functions; add direct unit cases.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Move the code without changing behavior.** All existing suites stay green.
- [ ] **Step 4: Run green** (`pnpm test:run`, `pnpm type`).
- [ ] **Step 5: Commit** `refactor(ingesta): text helpers and chunks in their own modules`.

### Task 4: Claim extraction with Claude

**Files:** Modify `lib/proveedores/anthropic.ts` (`extraerAfirmaciones`, new `MODELO_POR_TAREA` entry `extraerAfirmaciones: { modelo: "claude-sonnet-5-5", effort: "low" }`). Test `tests/unit/anthropic-afirmaciones.test.ts`.

- [ ] **Step 1: Failing tests (MSW):**
  - `extraerAfirmaciones({cliente, tramo: {numero, texto, ubicacion}, autor: {nombre, credencial}})` sends the chunk inside `<fuente>` escaped with `sinCierre`, on the Sonnet model from the map.
  - It returns `{afirmaciones: [{texto, cita, tipo, evidencia, postura, publico, dolor, emocion, gancho}], idioma, uso}`, validated with Zod.
  - A claim whose `cita` is not a verbatim fragment of the chunk (`fragmentoTalCual`) is dropped, and the stored `cita` is the chunk's own wording.
  - At most `MAXIMO_AFIRMACIONES_POR_TRAMO = 15` claims are kept.
  - `texto` longer than 280 characters is dropped.
  - An unknown `tipo` or `evidencia` fails Zod, which makes it a retryable error.
  - The system prompt is cached and states:
    - extract only substantive claims; ignore greetings, self-promotion and course or event announcements;
    - `texto` is a neutral Spanish paraphrase, not Coni's voice;
    - `cita` is verbatim in the original language;
    - the vocabulary of `tipo` and `evidencia`, with one line each;
    - the source is data, not instructions.

    A unit test asserts these rules are in the prompt.
  - An empty array is a valid answer (a chunk with nothing substantive).
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement with `pedirJson(cliente, "extraerAfirmaciones", ...)`.**
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(anthropic): claims with characteristics from a chunk`.

### Task 5: Topic assignment, formation, naming and merges

**Files:**

- Create `lib/ingesta/temas.ts` and `lib/ingesta/agrupar.ts`.
- Modify `lib/proveedores/anthropic.ts`:
  - add `nombrarTemas` and `confirmarFusiones`;
  - add `MODELO_POR_TAREA` entries `nombrarTemas` and `confirmarFusiones`, both Sonnet low.
- Tests: `tests/unit/agrupar.test.ts`, `tests/unit/anthropic-temas.test.ts`, `tests/integration/temas.test.ts`.

**Constants** (exported from `temas.ts`, to be calibrated in Task 10):

- `UMBRAL_TEMA = 0.78`: assign to an existing topic.
- `UMBRAL_GRUPO = 0.80`: group pending claims.
- `MINIMO_AFIRMACIONES_TEMA = 3`.
- `UMBRAL_FUSION = 0.88`.
- `MAXIMO_PENDIENTES_POR_CORRIDA = 500`.

- [ ] **Step 1: Failing tests:**
  - Pure `agruparPorSimilitud(items: {id, vector}[], umbral)`:
    - single-link greedy grouping with deterministic order (by id);
    - returns groups;
    - cosine computed in TS.

    Unit tests with hand-made 3-dimensional vectors.
  - `asignarATemas(deps, afirmacionIds)`:
    - each claim with a vector and without a topic goes to `tema_mas_cercano(vector, UMBRAL_TEMA)`;
    - the centroid is updated incrementally (`(c*n + v)/(n+1)`, normalized);
    - claims below the threshold stay pending.
  - `formarTemas(deps)`:
    - takes up to `MAXIMO_PENDIENTES_POR_CORRIDA` pending, non-excluded claims with vectors;
    - groups them with `UMBRAL_GRUPO`;
    - makes one `nombrarTemas` call for every group of at least `MINIMO_AFIRMACIONES_TEMA` (input: up to 6 claim texts per group plus the pillars; output per group: `{nombre, descripcion, pilar slug}`, Zod);
    - inserts the topics with the group centroid, assigns the claims and leaves smaller groups pending;
    - a name equal to an existing active topic (normalized) joins that topic instead of creating a duplicate.

    Spend: provider `anthropic`, paso `temas`, through `pagarPaso` with keys `temas:formar:<uuid>`.
  - `fusionarTemas(deps)`:
    - finds pairs of active topics with centroid similarity at least `UMBRAL_FUSION`, using SQL `temas_parecidos(p_umbral)` (add it to a new migration `20261003000320_temas_parecidos.sql`, service_role only);
    - sends at most 20 pairs in one `confirmarFusiones` call, which returns `{pares: [{a, b, mismo: boolean}]}`, Zod-validated, ids from the input only;
    - for each confirmed pair, the topic with more claims survives, claims move, the centroid is recomputed from its claims, the absorbed name goes to `alias`, and `fusionado_en` is set;
    - spend paso `temas`.
  - Cap reached: stop and return `{tope: true}` without throwing.
  - Excluded claims never form or join topics.
  - `recalcularTema(db, temaId)` recomputes a centroid from its non-excluded claims (used after merges and exclusions). A topic left with 0 claims is deleted.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run green**, full suites.
- [ ] **Step 5: Commit** `feat(ingesta): topics that form, name and merge themselves`.

### Task 6: Processing by role, with claims instead of translation and cards

**Files:** Modify `lib/ingesta/procesar.ts`. Create `lib/ingesta/afirmar.ts` (the per-material claim pipeline). Tests `tests/integration/procesar-afirmaciones.test.ts`, plus updates to the existing `procesar-*.test.ts`.

- [ ] **Step 1: Failing integration tests (MSW for Claude, Voyage, Scribe; in-memory store):**
  - **`estrategia`:** extraction then `escribirFicha` (unchanged). No claims, no translation, no embedding. Ends `listo`.
  - **`referente`, `evidencia`, `voz_propia`:** extraction (unchanged), then `aTramos` over the extracted parts, then one `extraerAfirmaciones` per chunk.
    - Each chunk goes through `pagarPaso` (provider `anthropic`, paso `afirmaciones`, keys `material:<id>:afirmaciones:<uuid>`), with its result stored at `materiales/<id>/afirmaciones/tramo-NNN.json` together with a fingerprint (sha256 of the chunk text and the model id).
    - A re-run reads matching checkpoints back and pays nothing for them.
    - The claims are inserted with `autor_id` from the material, the chunk number and the chunk's `ubicacion`. A re-run deletes the material's claims and reinserts from the checkpoints, so nothing duplicates.
    - Embeddings: `embeber` in batches of up to 128 texts (provider `voyage`, paso `embedding`), then `asignarATemas`.
    - Ends `listo`.
  - **No translation:** `traducirMaterial` and `adaptarAVozDeConi` are never called. `idioma_original` is still stored, from Scribe, vision or `idiomaPorHeuristica`, without a Claude call. `texto-original.txt` is stored and `texto.txt` is no longer written.
  - **No card for non-strategy roles:** `escribirFicha` is not called. No `incrustarFicha` and no `vincularMaterial`.
  - **Cost gate:**
    - `estimarCostoRestante` becomes `chunks × ESTIMADO_POR_TRAMO_USD` (Sonnet price for about 3.5k tokens in and 1.5k out) plus `estimarEmbeddings`, or `estimarFicha` for `estrategia`;
    - `UMBRAL_CONFIRMACION_USD = 1.0`;
    - a 490,000-character text waits for confirmation and a 20,000-character one does not.
  - **Voyage missing or failing:** the claims stay without a vector, the material is `listo`, and maintenance embeds them later (Task 7). It is not a material failure.
  - **Unchanged:** cap reached, deleted material and the run claim keep their current behavior and tests.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.** Delete `traduccionDe`, `incrustarFicha`, the `vincularMaterial` call and the translation estimate. Keep `fichaDe` for `estrategia` only.
- [ ] **Step 4: Run green**, full suites. Update every existing processing test that asserted translation or cards on non-strategy roles. The behavior change is intended.
- [ ] **Step 5: Commit** `feat(ingesta): materials become claims by role, without translation`.

### Task 7: Maintenance runs topics instead of links

**Files:** Modify `lib/mantenimiento/ejecutar.ts` and `trigger/mantenimiento.ts`. Create `lib/mantenimiento/temas.ts`. Test `tests/integration/mantenimiento-temas.test.ts`, plus updates to `tests/integration/arranques.test.ts`.

- [ ] **Step 1: Failing tests:**
  - The frequent job `temas`:
    - embeds up to 200 claims without a vector (Voyage; skipped without alert when there is no `VOYAGE_API_KEY`);
    - assigns them;
    - runs `formarTemas`.
  - The nightly job `fusiones` runs `fusionarTemas`.
  - Each job is independent inside `enSerie` (it already isolates errors).
  - Cap reached: the job returns `{tope: true}` and does not alert.
  - The `vinculos` job and `LIMITE_DE_VINCULOS` are removed.
  - Deps come from a builder that needs only db, Claude, Voyage and the store, with no ffmpeg (`depsTemas`).
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(ingesta): maintenance keeps topics in order`.

### Task 8: Reprocess a material

**Files:** Create `supabase/migrations/20261003000330_reprocesar_material.sql`. Modify `lib/ingesta/procesar.ts`. Test `tests/integration/reprocesar.test.ts`.

- [ ] **Step 1: Failing tests:**
  - `reprocesar_material(p_id)` (member only):
    - allowed when `estado = 'listo'`;
    - sets `estado = 'procesando'`, clears `costo_confirmado_en`, `costo_estimado_usd` and `motivo_fallo`;
    - deletes the material's claims (topics are recomputed by maintenance);
    - otherwise raises 22023 `no_reprocesable`.
  - Processing a reprocessed material reuses the stored extraction (`partes-original.json`), so it never downloads or transcribes again. It then runs the role branch of Task 6.
  - Changing `rol` from `estrategia` to `referente` and reprocessing produces claims. The reverse produces a card and no claims.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(ingesta): reprocess a ready material with its new role`.

### Task 9: Remove links, card embeddings and hand-picked theories

**Files:**

- Delete `lib/ingesta/vincular.ts`, `lib/ingesta/completar-vinculos.ts`, `lib/ingesta/teoria.ts`, `trigger/sintetizar-teoria.ts`, `lib/mantenimiento/teorias.ts` and the `traducirMaterial` parts of `lib/ingesta/traducir.ts`. Keep `idiomaPorHeuristica` and `detectarIdioma` if still used; otherwise move `idiomaPorHeuristica` to `lib/ingesta/idioma.ts`.
- Remove `clasificarVinculos`, `sintetizarTeoria` and `adaptarAVozDeConi`, their `MODELO_POR_TAREA` entries and `lib/ingesta/voz-de-coni.ts`, together with its sync test. `docs/voz/voz-de-coni.md` stays.
- Remove `dispararSintetizarTeoria`.
- Create the migration `20261003000349_retirar_b2.sql`. It drops:
  - the functions `materiales_cercanos`, `aceptar_vinculo`, `descartar_vinculo`, `crear_vinculo`, `pedir_teoria`, `guardar_teoria`, `reintentar_teoria`, `marcar_teoria_disparo_fallido`;
  - the columns `materiales.vinculos_pendientes` and `materiales.vinculos_intentos`.

  The tables `vinculos` and `embeddings_ficha` are dropped in migration 350, after production is verified.
- Delete their tests and update any test that referenced them.

- [ ] **Step 1: Remove the code and run `pnpm type` to find every leftover reference. Fix each one.**
- [ ] **Step 2: `supabase db reset && pnpm test:db`, `pnpm test:run`, `pnpm build`, all green.**
- [ ] **Step 3: Commit** `refactor(ingesta): retire links, card embeddings and hand-picked theories`.

### Task 10: Calibration script

**Files:** Create `scripts/evaluar-afirmaciones.ts` and `docs/superpowers/notas/calibracion-c1.md` (filled after the run).

- [ ] **Step 1: Write the script:**
  - it reads a list of material ids (argument) from the database configured by env and their stored `partes-original.json` from R2;
  - runs `aTramos` and `extraerAfirmaciones` on the first `--tramos N` chunks of each;
  - embeds the claims and runs `agruparPorSimilitud` with 3 thresholds (0.75, 0.80, 0.85);
  - prints:
    - the verbatim survival rate;
    - claims per chunk;
    - type and evidence counts;
    - group sizes per threshold;
    - 20 random claims with their quote;
    - every group with 3 or more claims (texts);
  - prints the estimated spend before running and requires `--confirmar` to call the APIs.

  Unit-test the reporting functions only. The real calls are not tested.
- [ ] **Step 2: Commit** `chore(ingesta): calibration script for claims and topics`.
- [ ] **Step 3 (with Federico, spends real money):** run it on the current materials plus the Carmen batch uploaded again. Review the sample by hand, set the thresholds in `lib/ingesta/temas.ts`, and write the numbers and decisions into `calibracion-c1.md`. Commit `chore(ingesta): calibrated topic thresholds`.

---

## conidolly-ingesta

### Task 11: Upload with author and role; Materiales with map, edit and reprocess

**Files:**

- Run `pnpm db:types`.
- Modify `app/(app)/subir/*`, `lib/ingesta/subir.ts`, `app/(app)/materiales/*` and `lib/ingesta/materiales.ts`.
- Create `lib/ingesta/autores.ts` (server actions) and `components/selector-de-autor.tsx`.
- Tests: unit and integration for the actions; e2e `subir.spec.ts` and `materiales.spec.ts` updated.

- [ ] **Step 1: Failing tests:**
  - **Upload form:**
    - **Autor** is a search by name or alias over `autores`, showing name and credential, with "Autor nuevo" (name, credential, type) that calls `crear_autor`. When the typed name matches an existing author or alias, it suggests "¿Es el mismo autor que…?".
    - **Rol** is 4 radio options:
      - "Lo dijo Coni" (`voz_propia`);
      - "Referente" (`referente`);
      - "Estudio o libro" (`evidencia`);
      - "Estrategia interna" (`estrategia`);

      each with one line of help.
    - Category and tags are removed from the form.
    - `crearMaterial` stores `autor_id` and `rol`, validated with Zod, membership checked server-side.
  - **Material detail:**
    - the **mapa del material**: topics (name and number of its claims), claim types and the evidence mix, read from `afirmaciones`; for `estrategia`, the card as today;
    - edit author and role (update through the existing column grants);
    - "Reprocesar" (`reprocesar_material` plus dispatch with a new idempotency key, reusing the existing dispatch and `marcar_disparo_fallido`), with an in-page confirmation that explains it costs about the same as the first time.
  - The materials list shows author and role. The filters are author, role, type and state; category is removed.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run green**, full suites and e2e.
- [ ] **Step 5: Commit** `feat: materials have an author and a role`.

### Task 12: Autores and Temas screens; remove the graph

**Files:**

- Create `app/(app)/autores/*`, `app/(app)/temas/*` and `lib/ingesta/temas.ts` (reads plus the `excluirAfirmacion` action).
- Delete `app/(app)/grafo/*`, `app/(app)/teorias/*`, `lib/ingesta/grafo.ts`, `vinculos.ts`, `teorias.ts`, `modelo-de-teoria.ts`, `seleccion.ts`, the `cytoscape` dependencies and their tests and e2e specs.
- Update the home navigation.
- Tests: unit and integration for the reads and actions; e2e `autores.spec.ts` and `temas.spec.ts`.

- [ ] **Step 1: Failing tests:**
  - **Autores:**
    - list with name, credential, type, number of materials and claims, and the top 3 topics;
    - detail grouping the author's claims by topic, each with quote and location;
    - "Unir con otro autor" calls `fusionar_autores` after an in-page confirmation.
  - **Temas:**
    - list from `temas_resumen`, ordered by distinct authors then claims, filterable by pillar;
    - badges "Coni ya lo trató" (`cubierto_por_coni`) and "Un solo autor", plus the evidence mix as small counts.
  - **Topic detail:**
    - name, description and aliases;
    - claims grouped by author, each with text, quote (collapsed), type, evidence, audience, pain, emotion and hook;
    - "Ocultar" or "Mostrar" per claim, calling `excluir_afirmacion`.
  - **Empty states:**
    - Temas: "Los temas aparecen solos cuando hay al menos 3 afirmaciones parecidas. Sube más material de distintos autores."
    - Autores: "Todavía no hay autores. Aparecen al subir material."
  - The graph and theory routes return 404. Home links to Materiales, Autores and Temas.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run green**, full suites, e2e, build. Capture `docs/capturas/ingesta-temas.png` and `docs/capturas/ingesta-autores.png` at 390x844.
- [ ] **Step 5: Commit** `feat: authors and topics replace the graph`.

---

### Task 13: Verification, notes and the last cleanup migration

- [ ] **Step 1: Full suites in both repos.**
- [ ] **Step 2: Create `supabase/migrations/20261003000350_borrar_vinculos.sql`.** It drops the tables `vinculos` and `embeddings_ficha`. It is applied **only after** C1 is verified in production (see the checklist).
- [ ] **Step 3: Append "C1 notes" to this file** (deviations, calibrated thresholds, open items). Commit `docs(plan): C1 notes`.

## Production checklist (with Federico)

`supabase db push` applies every pending migration, so `20261003000349_retirar_b2.sql` and `20261003000350_borrar_vinculos.sql` live in `supabase/pendientes/` and are moved into `supabase/migrations/` (with a commit) only at steps 2 and 7.

0. Pre-checks:
   - no material is in `procesando`;
   - `VOYAGE_API_KEY` is set in Trigger production;
   - `partes-original.json` exists in R2 for the 3 non-strategy materials.
1. `supabase db push` of migrations 300 to 348. Deploy Trigger immediately, then the Conidolly and ingesta apps. Check the first `mantenimiento-frecuente` run.
2. `supabase db push` of migration 349 (retire B2: the old code is gone, so dropping its functions and columns is safe).
3. In ingesta, set authors and roles:
   - `estrategia`: plan de marca and focus group;
   - `voz_propia`: "El deseo no se apaga", linked to the Coni author;
   - `referente`: Impostora and Pinealon, each with its real author.

   Merge or delete the wrong backfilled authors, such as "Sindrome de la Impostora" and "Invitado Focus Group". Delete "Test de Traducción".
4. Calibrate on the 3 materials before topics form in production: run the script without and then with `--confirmar`, set the thresholds, redeploy Trigger and fill `docs/superpowers/notas/calibracion-c1.md`. If topics already formed, reset them.
5. Reprocess the 3 non-strategy materials.
6. Upload the Carmen batch again with role `referente`.
7. Check Temas and Autores, the 10-minute runs and the 03:00 merge. Then `supabase db push` of migration 350 (`20261003000350_borrar_vinculos.sql`: drops the tables `vinculos` and `embeddings_ficha`).

## C1 notes (2026-10-03)

- Done locally on `feat/c1` (estudio-coni) and `feat/c1` (conidolly-ingesta). Migrations 300-348 ship with the code; 349 (retire B2) and 350 (drop `vinculos`, `embeddings_ficha`) wait in `supabase/pendientes/`.
- Deviations approved during review:
  - Topics group by centroid ("leader"), not single-link, so unrelated claims never chain into one topic.
  - Merges run through the atomic SQL `fusionar_par_de_temas`; rejected pairs are remembered (`temas_fusion_rechazada`) and never re-asked.
  - `recalcular_tema` (SQL) keeps centroids right and deletes empty topics after hiding a claim, deleting a material or reprocessing.
  - Both maintenance tasks share one Trigger queue with concurrency 1.
  - A Voyage outage is logged, not alerted, and the claims wait for the next run.
  - The claim checkpoint fingerprint includes the extraction prompt version.
  - Claims follow their material's author (trigger). The Coni author cannot be created twice, merged away or deleted.
  - Topic audit events only record name, description, pillar, aliases and merges, never centroid updates.
  - The ingestion app lost the graph, theories and the translated-text download; it gained Autores, Temas, the material map, reprocess and "Borrar autor".
- Open items: thresholds are still the plan defaults until calibration (Task 10, step 3); rejected merge pairs have no manual path yet; the calibration script's spend does not go through `gastos`.
