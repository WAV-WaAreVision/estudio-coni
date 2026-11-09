# Move the embeddings to voyage-4 (issue #19, change 17)

Decided with Federico on 2026-11-09. Coni's request: `docs/pedido-coni-2026-10-31/pedido-original.md` (change 17,
around line 720), card 17 in `fichas.md`, B1 in `decisiones.md`.

## Goal

Re-embed the knowledge base with voyage-4 only after a dry run shows what would change, with a way back. Keep topics
as they are; only the vectors, the centroids and the similarity thresholds change.

## Facts (checked 2026-11-09)

- Production: 209 claims, all with a 1024-dim voyage-3.5 vector; 81 assigned to a topic, 128 without one; 15 topics,
  all with a centroid; 0 merges, 0 rejected merges; 7 materials. Text to re-embed is about 37k characters (10k to 19k
  tokens): about US$ 0.001.
- voyage-4 (docs.voyageai.com, embeddings and pricing pages): default 1024 dims, `output_dimension` 256/512/1024/2048,
  32k context, US$ 0.06 per million tokens (same as voyage-3.5) with 200M free tokens. Vectors are compatible across the
  voyage-4 family; compatibility with voyage-3.5 is not stated, so everything is re-embedded at once, centroids included.
  voyage-3.5 also accepts `output_dimension`, so sending 1024 is safe for both.
- Staying at 1024 means no column type or HNSW index change.
- Thresholds live in TypeScript today: `UMBRAL_TEMA`, `UMBRAL_GRUPO`, `UMBRAL_FUSION` = 0.8 (`lib/ingesta/temas.ts`),
  `PUENTE_MIN` 0.6 and `PUENTE_MAX` 0.8 (`lib/motor/puntaje.ts`).
- Coni has recorded no topic decisions yet: there is nothing to weigh ×3.

## Decisions

1. **Dry run in production, in parallel tables.** New vectors go to `huellas_candidatas`; nothing Coni uses is
   touched until the switch. Staging tests the mechanics on seed data only. Coni's content is not copied anywhere.
2. **Calibration by percentile transfer, automatic.** For each threshold, find the share of claim pairs (or claim to
   centroid pairs, matching how the threshold is used) that clears it with voyage-3.5 today, and pick the voyage-4 value
   that clears the same share. Coni's decisions get a table now (`decisiones_de_tema`, empty) and the ×3 recalibration
   comes once change 9 (#22) records them.
3. **Federico approves, no screen.** The report comes to the conversation; Claude applies with a script after his OK.
   Deviation from Coni's request (`biblioteca/modelo` approval page): recorded here on purpose.
4. **Applied right after approval**, not inside the single reprocess of change 7 (#24). Re-embedding twice costs about
   US$ 0.001; #24 will simply use voyage-4.
5. **voyage-4 at 1024 float.** Not voyage-4-large.

## Data (one additive migration)

- `ajustes.modelo_de_huellas text not null default 'voyage-3.5' check (in ('voyage-3.5', 'voyage-4'))`.
- `afirmaciones.modelo_vector text` and `temas.modelo_centroide text`, backfilled to `'voyage-3.5'` where a vector
  exists. Every writer of a vector or centroid sets them (code and SQL functions that recompute centroids keep the
  model of the claims they average).
- `calibraciones_de_parecido`: `version int primary key`, `modelo text`, `tema`, `grupo`, `fusion`, `puente_min`,
  `puente_max` (numeric, between 0 and 1), `vigente boolean` (one row true, partial unique index), `creada_en`,
  `motivo text`. Seeded with version 1: voyage-3.5, 0.8 / 0.8 / 0.8 / 0.6 / 0.8, vigente.
- `decisiones_de_tema`: `id`, `tipo` (`fusion_aceptada`, `fusion_rechazada`, `afirmacion_confirmada`,
  `afirmacion_quitada`), `tema_id`, `otro_tema_id`, `afirmacion_id`, `decidida_en`, `decidida_por`. Coni inserts
  (RLS), everyone in the app reads; nothing writes it in this change.
- `huellas_candidatas`: `afirmacion_id` or `tema_id` (one of them), `modelo`, `vector vector(1024)`, `prueba_id`.
- `huellas_anteriores`: same shape plus the calibration version they belonged to, `guardadas_en`.
- `pruebas_de_modelo`: `id`, `modelo`, `estado` (`lista`, `aplicando`, `aplicada`, `revertida`, `descartada`), `umbrales jsonb`,
  `informe jsonb`, `creada_en`, `aplicada_en`, `revertida_en`.
- Service-role RPCs, each one transaction:
  - `aplicar_prueba_de_modelo(p_prueba uuid)`: refuses unless the prueba is `lista` and every live claim with a
    vector has a candidate; copies live vectors and centroids to `huellas_anteriores`; writes candidates into
    `afirmaciones.vector` and `temas.centroide` with their model; inserts the new calibration row as vigente; sets
    `ajustes.modelo_de_huellas`; marks the prueba `aplicada`. Topic assignments are not touched.
  - `revertir_prueba_de_modelo(p_prueba uuid)`: only within 30 days of `aplicada_en`; restores vectors, centroids,
    the previous calibration as vigente and the model; marks `revertida`.
  - The nightly maintenance deletes `huellas_anteriores` of pruebas applied more than 30 days ago, and candidates of
    pruebas `descartada` or older than 30 days.

## Code

- `lib/proveedores/voyage.ts`: `embeber` takes `modelo` (`'voyage-3.5' | 'voyage-4'`) and always sends
  `output_dimension: 1024`; the 1024 check stays. Cost per model in a map (both 0.06 today).
- Every embed call reads the model from `ajustes.modelo_de_huellas` (`lib/ingesta/afirmar.ts`,
  `lib/mantenimiento/temas.ts`, the health check). The R2 cache key already includes the model.
- Thresholds: `leerCalibracion(db)` returns the vigente row; `lib/ingesta/temas.ts`, `lib/ingesta/agrupar.ts` and
  `lib/motor/puntaje.ts` take them as parameters instead of constants. Read once per run.
- `lib/dominio/parecido.ts` (pure): `trasladarPorPercentil(viejos, nuevos, umbral)` and `armarInforme(...)`.
- Trigger task `probar-modelo-de-huellas` (manual): embeds every live claim with voyage-4 in batches (spend through
  `gastos`, one reservation), computes candidate centroids from the current assignments, computes the new thresholds,
  writes the report into `pruebas_de_modelo` and returns it.
- Trigger task `aplicar-modelo-de-huellas` (manual, payload `prueba`): embeds claims created after the dry run, then
  calls `aplicar_prueba_de_modelo`. During the run the topics step of `mantenimiento-frecuente` skips (it reads a flag
  in the prueba row, `estado = 'aplicando'`).
- Script `scripts/modelo/revertir.ts` for the way back (calls the RPC through a Trigger task
  `revertir-modelo-de-huellas`, so no secret leaves Trigger).

## Report (in words, Spanish)

- The new thresholds next to the old ones.
- Topic pairs whose centroids would clear the new merge threshold: «X y Y se juntarían» (none means none).
- Unassigned claims that would find a topic with the new topic threshold: count plus a sample of 5 with the topic.
- Assigned claims whose nearest topic changes: count plus the list (claim text cut to 80 characters, from → to).
- Cost of the run.

## Errors

- Voyage fails or returns another dimension: the prueba is not written; the run fails and its alert reaches WAV.
- A provider pause for Voyage is respected (no run while open).
- Apply refuses if any claim lacks a candidate after the top-up, or if the prueba is not `lista`; nothing is
  half-written (one transaction).

## Tests

- Unit: `trasladarPorPercentil` (identical distributions keep the value, shifted ones move it, edges), `armarInforme`
  (merges, new assignments, moves, empty cases), `embeber` sends the model and `output_dimension`, readers use the
  calibration row.
- Integration (DB): apply copies, swaps and stamps; revert restores exactly (vectors, centroids, calibration, model);
  apply refuses a missing candidate; only service role can call them.
- Staging: full dry run, apply and revert on seed data.
- Production: the real dry run; Federico reads the report before anything is applied.

## Done when

1. The report reaches Federico with real numbers and he approves or discards it.
2. If approved: production runs voyage-4, every vector and centroid stamped `voyage-4`, the new calibration vigente,
   no topic assignment changed by the switch.
3. Revert tested in staging and available for 30 days in production.
4. B1 closed in `decisiones.md` (dimension 1024 confirmed by the live call, price, `output_dimension`).

## Out of scope

`embeddings_ficha` (change 8 decides), voyage-4-large, an approval screen for Coni, recalibration ×3 with her decisions
(after #22).
