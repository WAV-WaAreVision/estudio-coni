# Decisions and confirmations

Section A blocks planning: a phase that depends on an open decision does not start. Section B are facts to confirm with
providers or tests; each spec confirms the ones it needs before writing code. Mark each item with the date and who decided.

## A. Decisions (Federico and Coni)

| # | Decision | Changes | Why it matters | Status |
|---|---|---|---|---|
| A1 | **Spending cap becomes an alarm, not a brake.** Includes processing material without confirming the cost first (29 · 4a), series written by Claude the evening before (12), weekly watch with web search (24) and workshop combinations before any script (21). | 12, 29, 21, 24, 8 | Contradicts the rule "no credits are spent without an approved script". Coni approved the alarm on 30-10; the rule in `CLAUDE.md` must be rewritten explicitly, with what still requires a tap. | Open |
| A2 | **Gates.** Date signed apart from the piece (flexible date), reserve pieces that publish without a per-slot signature, single signature for code-template carousels, service_role tasks writing and erasing signature fields, change requests allowed after signature 1. | 23, 22, 12, 25 | Rewrites the two-gate rule and `proteger_pieza`. Coni approved formula 3 on 31-10; Federico has not. | Open |
| A3 | **Instagram through Meta directly, Metricool retired.** Publishing and metrics for Instagram and LinkedIn without Metricool. | 13, 11, 27 | Contradicts coni-heygen `CLAUDE.md` ("Instagram only through Metricool"). Update both `CLAUDE.md` files once decided. | Open |
| A4 | **Third-party sensitive data.** Risky comments (suicidal ideation) classified by Claude in the US (27); identifying speakers and audience by voice (5); search terms sent to Claude (1b); ADHD test data (20). | 27, 5, 1b, 20, 26 | Ley 21.719. May need a short legal review; 26 has a deadline of 2026-12-01. | Open |
| A5 | **New providers and paid plans**: Gemini, Canva (plan needed for autofill; OAuth), Napkin, Anthropic web search, Meta Ads, LinkedIn Ads, a new LinkedIn app for Member Analytics, iTunes and Spotify lookups. | 5, 14, 24, 20, 13, 8 | Each one is a key, a bill and a failure mode. Decide which enter and in which phase. | Open |
| A6 | **WAV inside Coni's app.** Stage 2 of 29 gives WAV access to the Biblioteca inside Conidolly, which today is Coni-only. | 29 | Changes the access model and RLS. | Open |
| A7 | **Help lines.** Coni asks for *4141 and 131; code has 1455, *4141 and 133. | 18, 22, 23, 27 | Safety copy in every risky piece. | Open |
| A8 | **Identity.** Prompts and manuals drop "sexóloga"; signature becomes "Soy Constanza del Rosario." | 7, 18, 21 | Coni decided on 30-10; confirm that the drop of "sexóloga" is intended. | Open |
| A9 | **LinkedIn company page** for Thought Leader Ads. | 20 | Only needed for ads (phase 1+ of 20). | Open |
| A10 | **Emotion list** for tags. | 6 | Coni has to define it. | Open |
| A11 | **Reposts spec**: lives in an external artifact not included in the request. | 8 | Received 2026-11-01 as `reposts-original.md`. Still open: the 8 checks on Coni's phone listed in its last section. | Closed 2026-11-01 |
| A12 | **Order and scope.** Accept the phases in `fases.md`, or Coni's order. Which changes are out for now (candidates: 20 phases 1–3, 19 projects, 24 watch). | all | ~6–9 months for one developer. | Open |

## B. To confirm (providers and tests)

| # | What | Changes | How |
|---|---|---|---|
| B1 | voyage-4: dimension, price, `output_dimension` | 17, 12 | Voyage docs + a test call |
| B2 | Voyage reranker: model name (rerank-2.5 / 2.5-lite; "rerank-3" in the request) and price | 1, 4, 7 | Voyage docs |
| B3 | ElevenLabs diarization: included in US$ 0.22/h? `end` and `speaker_id` per word? | 5 | Test with a real symposium (prerequisite of 5) |
| B4 | Gemini: model, price, daily cap, private-video errors | 5 | Google docs + test |
| B5 | Meta: current metric names per media type, JPEG vs PNG for carousels, `is_ai_generated` on carousels, comments permission | 13, 27 | Meta docs + test account |
| B6 | LinkedIn: Member Analytics route, version and `r_member_postAnalytics`; image and text post endpoints; comments on personal profiles | 13, 11, 27 | LinkedIn docs; **apply now, review takes weeks** |
| B7 | LinkedIn Excel export: sheet and column names, date format, activity vs share id | 13 | One real export from Coni |
| B8 | Canva Connect autofill: plan, latency, export | 14 | Canva docs |
| B9 | Napkin API | 14 | Napkin docs |
| B10 | Anthropic web search: tool version and price; Message Batches + cache discount stacking and batch limits | 24, 7, 8 | Claude API docs |
| B11 | Supabase `auth.admin.generateLink` without sending email; `verifyOtp` type for a magiclink token | 29 | Supabase docs + local test |
| B12 | Retention periods and provider countries for the data register | 26 | WAV + legal review |

## Done now (no decision needed)

- CI green on `main` again and the flaky `eleccion-de-ideas` test fixed (branch `chore/ci-verde-y-pedido-coni`).
- Do **not** apply `supabase/pendientes/20261003000350_borrar_vinculos.sql` until 8, 9 and 19 are decided.
- Outside the code, for Federico: reconnect Instagram with Meta; apply for LinkedIn Member Analytics.
