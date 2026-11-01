# Conidolly: personal data register and AI transparency page

Date: 2026-11-01. Status: approved by Federico in brainstorming (scope A, WAV edits / Coni reviews, versioned page edited
by Coni, register describes and code deletes). Change 26 of Coni's request (`docs/pedido-coni-2026-10-31/`, card in
`fichas.md`, original at `pedido-original.md` L.16851). Board: WAV-WaAreVision/estudio-coni#4.

**Deadline: 2026-12-01**, when Ley 21.719 is fully in force. Target: in production by mid November.

## Goal

Coni opens Settings and sees, in plain words, every kind of personal data the app handles: what it is for, which provider
holds it, in which country, and when it is deleted. Deletions that the app performs on its own are logged. Once a year she
confirms she reviewed the list. A short public page, "Cómo uso IA en mi contenido", explains how she uses AI; she edits it
and every published version is kept.

## Scope

In: the register, the deletion rules that exist today plus one missing one, the deletion log, the yearly review notice, the
public page with versions, the WAV editor in Ingesta.

Out (each lands with its own change): rule that followers' text never enters the brain or metrics (change 27), AI image
labelling and C2PA checks (change 14), register rows for reposts, followers and comments (changes 8, 13, 27), the final
countries and retention periods (legal review; fields stay editable).

## Decisions

| # | Decision |
|---|---|
| D1 | Scope A: build what exists today; rules for future data are written down, not coded. |
| D2 | WAV edits the register (from Ingesta, with the `mantenedor` role); Coni reads it in Conidolly and marks "Lo revisé". |
| D3 | Coni edits the public page from Conidolly with versions and "Volver a esta"; WAV seeds a first draft marked as a proposal. |
| D4 | The register describes, the code deletes. A screen edit never changes what is deleted; a mismatch is flagged. |
| D5 | The public page text is plain text with paragraphs: no markdown, no HTML. |
| D6 | The public page reads through a `security definer` function that returns only the current text and its date. |
| D7 | No feature flag: `/l/ia` returns 404 until Coni publishes a first version. |

## Data model (one migration)

### `inventario_de_datos`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `clave` | text unique | stable slug, e.g. `videos_de_piezas` |
| `dato` | text | plain words, 3–120 chars |
| `para_que` | text | 3–300 chars |
| `proveedor` | text | |
| `pais` | text | |
| `pais_confirmado` | boolean default false | |
| `plazo` | text | plain words, e.g. "30 días después de publicar" |
| `regla_de_borrado` | text null | key in `lib/datos-personales/reglas.ts` when the app deletes it itself |
| `plazo_dias` | int null | required when `regla_de_borrado` is set (check) |
| `orden` | int | display order |
| `actualizado_en`, `actualizado_por` | timestamptz, uuid | set by trigger |

RLS: select for `es_coni() or es_mantenedor()`; insert, update, delete only for `es_mantenedor()`.

Seed rows (what exists today): rostro de Coni (HeyGen), voz de Coni (ElevenLabs), conexiones de cuentas (Meta, LinkedIn),
métricas de las cuentas (Supabase), material y afirmaciones (Supabase, R2), textos enviados a IA (Anthropic, Voyage),
audios enviados a transcribir (ElevenLabs), videos y voces de las piezas (R2, rule `videos_de_piezas`, 30), respaldo nocturno
de la base (R2, rule `respaldos`, 30), huella de visitas a `/l` (Supabase, rule `huella_de_visitas`, 1), suscripciones a los
avisos (Supabase). Countries start with `pais_confirmado = false` except where the provider documents a single region.

### `registro_de_borrados`
`id`, `regla` text, `cantidad` int > 0, `borrado_en` timestamptz. Insert only by `service_role`; select for Coni and
mantenedor. Never stores what was deleted.

### `revisiones_de_inventario`
`id`, `revisado_por` uuid, `revisado_en` timestamptz. RPC `marcar_inventario_revisado()` only for `es_coni()`. Next review
is due one year after the latest row, or after the migration date when there is none.

### `transparencia_versiones`
`id`, `version` int unique, `texto` text (300–6000 chars), `motivo` text, `creada_por` uuid, `creada_en` timestamptz,
`propuesta` boolean (true only for WAV's seeded draft, which is never `vigente`), `vigente` boolean with a partial unique
index (one current version).

- RPC `publicar_transparencia(p_texto, p_motivo)`: only `es_coni()`; inserts `version = max + 1`, makes it current.
- RPC `volver_a_transparencia(p_version)`: only `es_coni()`; copies that text into a new version (history is never rewritten).
- Function `transparencia_vigente()`: `security definer`, executable by `anon`, returns `texto` and `creada_en` of the current
  non-proposal version, or nothing.

### Notices
New notice type `revision_de_inventario`. The migration rewrites `avisos_tipo_check` with the **full** list (current list from
`20261007000100_linkedin_conexion.sql` plus the new type); a test asserts the final list.

## Deletion rules

`lib/datos-personales/reglas.ts` holds `REGLAS_DE_BORRADO = { videos_de_piezas: 30, respaldos: 30, huella_de_visitas: 1 }`.
`retencion.ts` (`DIAS_DE_RETENCION`) and `respaldo.ts` (`DIAS_DE_HISTORIA`) import their period from it; the numbers exist once.

- **Gap fixed:** today `visitas_clic` rows older than yesterday are deleted only inside `registrar_clic`, so with no clicks
  they stay. A new maintenance step `huella` deletes them every night.
- **Log:** `aplicarRetencion`, the backup clean-up and the new `huella` step insert one `registro_de_borrados` row per rule
  per night when they deleted something. A failed log insert does not undo the deletion: it is reported in the maintenance
  result like other step errors.
- **Mismatch:** the register screen compares each row that has `regla_de_borrado` with `REGLAS_DE_BORRADO` and shows
  "No coincide con lo que la app borra (N días)". An integration test asserts the seed matches the rules.

## Yearly review

The nightly maintenance creates one `revision_de_inventario` notice for Coni and one `aWav` message 30 days before the review
is due, and never twice for the same due date. "Lo revisé" inserts a review row and closes the notice.

## Screens

**Conidolly › Ajustes › Datos personales** (Coni, read-only): one card per row (dato, para qué, dónde, país with
"por confirmar", plazo, mismatch flag), the latest deletions in words ("Se borraron 3 videos el 2 de noviembre"), last review
date and the "Lo revisé" button.

**Conidolly › Ajustes › Página de IA** (Coni): current text with preview, editor with "¿Por qué lo cambias?" and "Publicar",
version history with date and reason and "Volver a esta". Before the first publication the editor starts from WAV's draft,
labelled as a proposal.

**Ingesta › Datos personales** (WAV, mantenedor): the same list, editable row by row, add row, confirm country.

**Public `/l/ia`**: same look as `/l`, always light theme, title "Cómo uso IA en mi contenido", paragraphs, "Actualizado el …".
404 when nothing is published; an error page (not 404) when the database fails. Link in the `/l` footer and a copyable line
for the bios.

First draft of the page (seeded as `propuesta`): written by WAV from Coni's five points (avatar in reels with its notice,
texts written with AI support and signed by her, cited sources, no patient data, AI images labelled when realistic). Coni
edits and publishes it.

## Errors

- Publishing fails: the text stays in the editor with a clear message.
- Anyone but Coni publishing, or anyone but WAV editing the register: rejected by the database and by the action.
- Log insert fails: deletion stands, error surfaces in the maintenance result.

## Tests (written first)

- Unit: seed vs `REGLAS_DE_BORRADO`; mismatch detection; paragraph rendering escapes text; yearly notice fires once, 30 days
  before; `avisos_tipo_check` final list.
- Integration (local Supabase): `anon` can only call `transparencia_vigente()`; only Coni publishes and goes back; "volver a"
  creates a new version; only mantenedor edits the register; Coni cannot; nightly `huella` deletes old visits with no clicks;
  deletion log rows.
- E2E: `/l/ia` renders the published text; `/l` footer links to it; axe on the three new screens.

## Rollout

1. One migration; regenerate `database.types.ts` in **both** repos.
2. PR in estudio-coni (tables, rules, maintenance, Conidolly screens, `/l/ia`) and a small PR in conidolly-ingesta (editor).
3. Federico deploys: `supabase db push`, Trigger deploy (maintenance changed), Vercel for both apps.
4. Coni reviews the register and publishes the page; the bio line goes up.
5. After the legal review, WAV updates countries and periods from Ingesta.
