# Coni's change request of 2026-10-31: planning kit

Everything needed to turn Coni's request (29 changes for Conidolly and Ingesta) into specs and implementation plans.

| File | What it is |
|---|---|
| `pedido-original.md` | The full request, converted from `Cambios Conidolly.docx` (Spanish, ~1.1 MB). Source of truth for what Coni asked. Its 25 diagrams and mockups are in `media/` (linked from the text); the .docx lives in `~/Projects/coni-heygen/`. |
| `reposts-original.md` | Coni's separate spec for the Instagram Reposts intake (part of change 8), converted from its .docx. |
| `respuestas-coni-2026-11-01.md` | Coni's answers to the decisions (A1–A12) and her new change 30. |
| `emociones.md` | Coni's emotion list for tags (A10, change 6), with `emociones-media/`. |
| `fichas.md` | One card per change: what it asks, size, dependencies, sensitive rules, code claims to verify, open points. Read this before opening the original. |
| `decisiones.md` | Decisions that block planning (Federico and Coni) and facts to confirm with providers. |
| `fases.md` | Proposed build order in phases, each one a spec → plan → build cycle. |

## How this was produced

On 2026-11-01 the full request was read end to end (100% of the text, split in six parts) and each change was summarized against
the rules in `CLAUDE.md`. Code claims in the request were **not** verified yet: `fichas.md` lists them per change so each spec
starts by checking them against the code.

## Rules for planning from here

1. The "instrucción para Claude Code" blocks in the original are drafts written by Coni with Claude. They contain real bugs
   (swallowed errors, missing service_role grants, broken regex escapes, a test that cannot pass). Treat them as requirements,
   never paste them as code. TDD as usual.
2. Nothing in `decisiones.md` section A is assumed. A phase whose changes depend on an open decision does not start.
3. One spec and one plan per phase (or per change for XL ones), in `docs/superpowers/specs` and `docs/superpowers/plans`.
4. One migration per change, each with its integration test. Several changes rewrite the same constraint (`avisos_tipo_check`,
   `gastos_proveedor_check`, `guardar_secreto`): the spec of each phase lists the final value, not a diff on someone else's.
5. Production is never left half-way: a change that needs another to work (18 needs the per-network fallback of 11) ships with
   that fallback.
