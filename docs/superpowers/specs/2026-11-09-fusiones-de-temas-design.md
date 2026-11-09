# See and control topic merges (issue #22, change 9)

Decided with Federico on 2026-11-09. Coni's request: `docs/pedido-coni-2026-10-31/pedido-original.md` lines 5553-6160,
card 9 in `fichas.md`.

## Goal

Coni knows which topics were merged and why, can undo a merge exactly, and decides the delicate cases herself. Every
decision she makes is recorded for the ×3 recalibration of change 17 (#19).

## Facts (production, 2026-11-09)

- 16 active topics, 88 claims with a topic. Merges ever: 0. Rejected pairs: 0. `decisiones_de_tema`: 0 rows.
- Calibration v2 (voyage-4): fusion threshold 0.6729. No pair is above it today; the closest are 0.668, 0.665 and
  0.650, so the first merges can come with the next material.
- Nightly merges are on (`ajustes.fusiones_nocturnas_activas`). `fusionarTemas` (`lib/ingesta/temas.ts`) takes up to 20
  pairs from `temas_parecidos`, asks Claude (`confirmarFusiones`, boolean `mismo`) and either calls
  `fusionar_par_de_temas` (latest `20261104000230`) or inserts into `temas_fusion_rechazada` without a reason.
- A merge today cannot be undone exactly: nothing records which claims came from which topic, and the loser's
  `tema_pilares` rows are deleted.
- `recalcular_tema` deletes absorbed topics when the winner ends empty: undo must not go through it.

## Decisions

1. **Clear merges apply on their own; delicate or doubtful ones wait for Coni.** Delicate: the two topics have a
   different main pillar in some network (`tema_pilares`, `principal`), or Claude says it is not sure. Ratings and
   anchors (change 3) join the rule when change 3 exists.
2. **Coni hears about a waiting merge on Inicio and in Temas**: «Revisa una fusión de temas» under «Necesita tu
   atención», and a counted link «Fusiones (n)» in Biblioteca › Temas. No email.
3. **Subtopics are stored now** (`temas_subtemas`) and shown only as a line on the topic page until change 15 uses them.
4. **Lean scope.** Out: rebuilding past merges (there are none), a queue beyond today's 20 pairs a night, alias search
   (change 1), the weekly session (change 25), ratings as a delicate signal (change 3).

## Data (one migration)

- `fusiones`: `id`, `ganador_id`, `perdedor_id` (references `temas`), `estado` (`propuesta`, `aplicada`, `deshecha`,
  `rechazada`), `origen` (`claude`, `coni`), `veredicto` (`mismo`, `parte_de`, `distintos`), `seguro boolean`,
  `razon text`, `parecido numeric`, `modelo text`, `delicada boolean`, `motivo_delicada text`, `creada_en`,
  `decidida_en`, `aplicada_en`, `deshecha_en`; undo snapshot: `pilares_perdedor jsonb` (the loser's `tema_pilares`
  rows), `alias_agregados text[]`, `encadenados uuid[]` (topics that were absorbed into the loser and get re-chained).
  RLS: Coni and WAV read; writes only through the functions below.
- `fusiones_afirmaciones`: `fusion_id`, `afirmacion_id`, `tema_origen` (primary key fusion + claim).
- `temas_subtemas`: `tema_id`, `padre_id`, `origen`, `creada_en`; unique pair, no self-reference.
- `temas_fusion_rechazada` gains `razon text`, `origen text` (`claude` default for old rows, `coni`),
  `rechazada_en`, `afirmaciones_a`, `afirmaciones_b` (counts at rejection) and `modelo`.
- `temas_parecidos(p_umbral)` excludes: pairs with a `propuesta`, pairs in `temas_subtemas`, pairs rejected by Coni,
  and pairs rejected by Claude unless either topic grew 30 % or more since, or the vigente model differs from the
  rejection's model.
- `fusionar_par_de_temas(p_ganador, p_perdedor, p_fusion uuid)`: same effect as today plus, before deleting anything,
  the snapshot into `fusiones` and one `fusiones_afirmaciones` row per moved claim; marks the fusion `aplicada`.
- `deshacer_fusion(p_fusion)` (Coni): only for an `aplicada` fusion whose winner and loser still exist and whose loser
  was not merged again since; moves each claim back to its `tema_origen` (claims deleted since are skipped), restores the
  loser's pillar rows and the winner's pre-merge rows, removes `alias_agregados` from the winner, re-points
  `encadenados`, clears the loser's `fusionado_en`, recomputes both centroids directly (not via `recalcular_tema`),
  marks the fusion `deshecha`, records the pair as rejected by Coni and writes a `fusion_rechazada` decision.
- `decidir_fusion(p_fusion, p_veredicto)` (Coni, only for a `propuesta`): `mismo` applies it (and writes
  `fusion_aceptada`), `parte_de` stores the subtopic, `distintos` rejects it with origin `coni` (and writes
  `fusion_rechazada`). The proposal is marked `rechazada` or `aplicada` accordingly.
- `unir_temas_a_mano(p_a, p_b)` (Coni): for a rejected pair, creates an `aplicada` fusion with origin `coni` and writes
  `fusion_aceptada`.
- All new functions: `security definer`, `set search_path = ''`, the Coni ones check `es_coni()`.

## Code

- `confirmarFusiones` returns, per pair, `{ veredicto: 'mismo' | 'parte_de' | 'distintos', seguro: boolean,
  razon: string }`. The prompt gets 5 varied claims per topic (today 3) and keeps the instruction that «parte de» is not
  «mismo». Prompt version recorded with the fusion.
- `fusionarTemas`: per verdict: `distintos` → rejection with reason (origin `claude`); `parte_de` → `temas_subtemas`
  (origin `claude`), no merge; `mismo` + seguro + not delicate → create the fusion and apply it; otherwise → `propuesta`.
  The run returns counts per outcome.
- `lib/dominio/fusiones.ts` (pure): `esDelicada(pilaresA, pilaresB, seguro)` with its reason; Spanish texts for the
  page.

## Screens (Coni only, no modals, soft UI)

- `/biblioteca/temas/fusiones`: three sections.
  - «Para que decidas»: each proposal with both topic names, Claude's reason and three buttons: «Son el mismo», «Uno es
    parte del otro», «Son distintos».
  - «Fusiones recientes» (last 30 days): «Uní "X" con "Y" el {fecha}. Razón: …» and «Deshacer».
  - «Pares que no uní»: each with its reason and «Unir igual».
  - Empty state: «Todavía no hay fusiones.»
  - Phone: cards; desktop: the same list in the main column, using the width rules of the Biblioteca screens.
- Biblioteca › Temas: «Fusiones (n)» link, shown only while proposals exist (same pattern as the drafts link).
- Inicio: «Revisa una fusión de temas» under «Necesita tu atención» while proposals exist, linking to the page.
- Topic page: «También se llamó: …» (aliases) and «Subtema de "X"» when it applies.
- Copy in Chile Spanish, tú, no long dashes.

## Tests

- Integration (DB): merge then undo restores claims, pillar rows of both topics, aliases, chained topics and centroids
  exactly; undo refuses when the loser was merged again; Coni's «no» is never proposed again; Claude's «no» comes back
  after 30 % growth or a model change; `decidir_fusion` writes the right decision rows; only Coni can call her functions.
- Unit: `esDelicada`, the verdict parser, `fusionarTemas` routing per verdict, page texts.
- Components: the three sections and their buttons; Inicio item; Temas link.
- E2E: a proposal decided on the page, and an applied merge undone.

## Done when

1. A delicate pair waits for Coni and she decides it on the page; a clear pair merges on its own and she can undo it.
2. Undo leaves the data exactly as before the merge.
3. Every decision of hers is in `decisiones_de_tema`.
4. Inicio and Temas tell her when something waits.
