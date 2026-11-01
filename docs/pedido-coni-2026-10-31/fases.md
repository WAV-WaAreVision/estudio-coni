# Build phases

Proposal, pending decision A12. It follows Coni's order where the dependencies allow it and changes it in four places:

1. **26 (data register) moves to phase 1**: it has a legal deadline (2026-12-01) and its core depends on nothing.
2. **12 is split**: the budget panel (cap as alarm, 12a) goes early because almost every change assumes it; the tray, bank,
   queue and rhythm (12b) stay with the engine changes.
3. **13 is split**: measuring (13a: Instagram reconnected, current metrics, LinkedIn Excel import) needs nothing and every day
   without data is lost; publishing Instagram carousels (13b) needs 11 and 23.
4. **18 ships with the per-network context fallback** that Coni placed in 11, so production never runs without a manual
   for a network.

Hard dependencies (the change cannot work without the other) set the order. Soft ones (a screen or an input that improves
when the other lands, e.g. 15 shows a "suggest in the session" notice once 25 exists) do not block: the spec says what is
shown until then.

Each phase is one cycle: spec (`docs/superpowers/specs`) → plan (`docs/superpowers/plans`) → build with TDD → deploy by
Federico. XL changes get their own spec and plan.

| Phase | Changes | Gate to start | Notes |
|---|---|---|---|
| 0 · Now | CI green and flaky test (done, in branch); reconnect Instagram; apply for LinkedIn Member Analytics; merge `feat/fecha-exacta` | None | No code from the request. |
| 1 · Foundations | 29 stage 1 · 26 core · 12a budget panel · 13a measuring · split `lib/proveedores/anthropic.ts` per task (prep for 7, 18, 21) | A1 (12a), A3 (13a), A4 (26) | All small or medium and independent: can run in parallel. |
| 2 · One app | 29 stage 2, then stage 3 | A6 | Biggest single piece. Gates every new Biblioteca screen. |
| 3 · Knowledge base | 15 → 17 (dry run and decision) → 5 (after diarization test B3) → 6 → 9 → 18 with fallback → 7 single reprocess | A5 (Gemini), A7, A8, A10 | 7 applies 5, 6 and 17 in one pass. Base is small today (6 materials, 189 claims, ~US$ 0.60 to reprocess). |
| 4 · Organise and find | 3 · 2 · 8 · 1 → 1c (pilot, 1–2 weeks of Coni's ratings) → 1b · 19 | A5 (8), A11 (8) | 1c needs Coni's time; plan it on her calendar. |
| 5 · Engine to piece | 21 → 4 → 16 → 12b → 11 → 14 → 22 → 25, with 28 built alongside 12b, 22, 23 and 25 | A2 (22, 25), A5 (14) | Replaces the weekly engine; the old one stays until 21 is proven. |
| 6 · Publish, measure, sell | 23 · 13b · 27 · 20 phase 0 · 24 | A2 (23), A3, A4 (27) | 20 phases 1–3 (ads) only after A9 and real funnel data. |

## Cross-cutting rules for every phase

- Shared constraints and lists (`avisos_tipo_check`, `gastos_proveedor_check`, `guardar_secreto`, `CUENTAS_CON_LLAVE`) are
  rewritten in full by each change; the spec states the final list and a test asserts it.
- `reservar_gasto` / `confirmar_gasto` are called from both repos until stage 3 of 29: any signature change ships in both.
- Signed pieces keep their hashes: changes to `respaldo_de_idea`, gate 2 formulas or `huellaDeRespaldo` must keep old
  signatures valid (test with a signed piece fixture).
- Every phase ends with the full unit suite, integration tests against local Supabase and the real route loaded once.
