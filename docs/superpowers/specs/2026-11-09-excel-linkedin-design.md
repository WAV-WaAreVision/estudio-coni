# LinkedIn Excel importer (issue #15, change 13a, LinkedIn half)

Decided with Federico on 2026-11-09. The Instagram half of #15 (Meta metrics) still waits for the Instagram reconnect and
is out of scope here.

## Goal

Coni uploads the Excel that LinkedIn lets her download from her content analytics and Conidolly puts each number on its
piece (origin `excel`), with a weekly reminder on Inicio. Manual entry stays only as a fallback. This replaces the weekly
email that asks WAV to type the numbers with Coni's session, which conflicts with decision A6 (WAV never enters
Conidolly).

## The file (B7, closed 2026-11-09)

Format recorded on issue #15 (comment of 2026-11-09) from a real export of a personal profile with LinkedIn in Spanish.
What the importer relies on:

- Sheet `DESCUBRIMIENTO`, row 1: `Rendimiento general` and the period `D/M/AAAA - D/M/AAAA`.
- Sheet `PUBLICACIONES PRINCIPALES`: row 1 the note «Esta lista puede incluir 50 publicaciones como máximo», row 2 empty,
  row 3 headers. Two independent rankings side by side: columns A-C `URL de la publicación`, `Fecha de publicación`,
  `Interacciones`; column D empty; columns E-G `URL de la publicación`, `Fecha de publicación`, `Impresiones`. Rows do
  not correspond: join by URL. Each list holds 50 posts at most.
- Sheet `SEGUIDORES`, row 1: `Total de seguidores el D/M/AAAA` and the number.
- Every value is text, numbers too. Dates are `D/M/AAAA` without leading zeros. Empty cells come as `''`.
- The URL ends in `…-share-<n>-<suffix>` or `…-ugcPost-<n>-<suffix>` and may be percent-encoded.
- Per post there are only total impressions and total interactions: no reactions, comments, shares or clicks.
- Sheet and column names follow the LinkedIn interface language. Only Spanish is accepted.

The other sheets (`INTERACCIÓN`, the audience sheets) are not read.

## Decisions

1. **Coni imports.** The importer is hers (`exigirConi` / `es_coni()`); the mantenedor does not get it (A6).
2. **Pieces uploaded by hand** (`publicaciones.estado = 'subido_a_mano'`, no `post_urn`) are matched by date: when that
   day (in `ajustes.zona`) has exactly one hand-uploaded LinkedIn piece and exactly one unmatched Excel post, they pair
   on their own. Anything else is doubtful and Coni picks in the result, inline.
3. **Reminder on Inicio only**, no email: from Monday, while some LinkedIn piece published in the last 4 weeks has no
   reading measured this week, Inicio shows «Sube el Excel de LinkedIn» under «Necesita tu atención». It goes away once
   the readings exist. The nightly email to WAV (`numerosLinkedin` step) is removed.
4. **Save directly, then summarise.** No confirm step when nothing is doubtful. The summary says how many pieces got
   numbers, the followers saved, and how many Excel posts were not from Conidolly and were ignored.
5. **The 50 cap does not reject the file.** What matched is saved. Only when a Conidolly piece published inside the
   period is missing from the file and a list is full does the summary ask for a shorter period (30 or 90 days).
6. **Parse on the server** with `read-excel-file` (small, maintained, reads sheets by name). Not SheetJS (stale npm
   package with known advisories) and not `exceljs` (too heavy). Version pinned at plan time.

## Data (one migration, nothing dropped)

- `metricas_linkedin`: `origen` also accepts `excel` (keep `metricool` for old rows); new column `interacciones integer
  check (interacciones >= 0)`.
- `metricas_linkedin_ultima`: recreated with `interacciones` appended last (`create or replace view` cannot move
  columns).
- `metricas_linkedin_cuenta`: `origen` also accepts `excel`.
- `importar_excel_linkedin(p_medido_en date, p_posts jsonb, p_semana date, p_seguidores integer) returns integer`,
  `security definer`, `set search_path = ''`:
  - raises `42501 sin_permiso` unless `public.es_coni()`;
  - upserts each post with `origen = 'excel'`; never updates a row whose origin is `api`; overwrites a `manual` or
    `excel` row; a figure the Excel does not bring (`null`) keeps the stored one (`coalesce`);
  - upserts the week's followers the same way when `p_seguidores` is not null;
  - returns the number of post rows written;
  - execute granted to `authenticated` only.
- `p_medido_en` is the last day of the Excel period. `p_semana` is the Monday of that day.
- `recordatorios_linkedin` stays, unused. Dropping it is destructive and goes in a later change with Federico's OK.

## Units

- `lib/metricas/excel-linkedin/leer.ts`: `leerExcelDeLinkedin(filas por hoja)` → `{ periodo: {desde, hasta},
  publicaciones: [{ numero, tipo: 'share' | 'ugcPost', fecha, impresiones | null, interacciones | null }], seguidores |
  null, llegoAlTope }` or a typed error (`no_es_el_excel`, `otro_idioma`, `periodo_ilegible`). Pure: receives the rows
  already read, so tests do not need a binary file for each case.
- `lib/metricas/excel-linkedin/archivo.ts`: thin adapter from the uploaded `File` to rows per sheet with
  `read-excel-file`. Tested once with a synthetic `.xlsx` fixture (fake URLs and numbers, generated by a script kept in
  `scripts/`); Federico's real file never enters the repo.
- `lib/metricas/excel-linkedin/cruzar.ts`: `cruzarConPiezas(excel, publicaciones de LinkedIn, zona)` →
  `{ seguros: [{ piezaId, impresiones, interacciones }], dudosos: [{ piezaId, fecha, opciones }], ajenas: n,
  faltanEnElPeriodo: n }`. URN number first (`urn:li:share:<n>` / `urn:li:ugcPost:<n>` in `publicaciones.post_urn`),
  then decision 2 by date.
- `lib/acciones/excel-linkedin.ts` + `app/(app)/metricas/acciones.ts`: `importarExcelDeLinkedinAccion(formData)` through
  `comoConi`: size ≤ 2 MB, read, cross, call the RPC with the safe ones, return the summary and the doubtful ones.
  A second action `guardarDudososDeLinkedinAccion` saves Coni's picks through the same RPC.
- `next.config.ts`: `experimental.serverActions.bodySizeLimit = '2mb'`.

## Screens

- **Métricas, LinkedIn section:** «Importar Excel de LinkedIn» button with two lines on how to download it (LinkedIn,
  Estadísticas, Contenido, Exportar, last 30 days). After upload, the summary in place; doubtful pieces listed inline,
  each with a select of the Excel posts of that day, and «Guardar». No modal.
- **Manual form:** leaves «Para WAV», becomes «Anotar a mano» under «Más opciones». Behaviour unchanged.
- **Where only the total exists,** the meta line shows «N interacciones» instead of reactions · comments · shares.
- **Inicio:** the attention item of decision 3, linking to Métricas at the importer.
- Copy in Chile Spanish, tú, no long dashes.

## Errors

- Not the LinkedIn Excel, or another language: «Este no es el Excel de estadísticas de LinkedIn en español» plus how to
  download it. Nothing saved.
- Over 2 MB: rejected before reading.
- Period with no Conidolly posts: only followers saved, and the summary says so.
- RPC failure: nothing half written (one transaction), Coni sees a retry message, the error is logged and goes to WAV
  through the existing screen error notice.

## Tests

- Unit: `leer` (happy path, both lists joined by URL, only-one-list post, encoded URL, cap reached, other language,
  missing sheet, unreadable period); `cruzar` (URN match share and ugcPost, by-date pair, two the same day → doubtful,
  none → doubtful, foreign posts counted, missing in period).
- Adapter: synthetic fixture read end to end.
- DB integration: RPC denies non-Coni; never touches `api` rows; overwrites `manual`; `null` keeps the stored figure;
  followers upsert; returns the count.
- Components: summary, doubtful picker, meta line with total only.
- Inicio: attention item shown from Monday with pending pieces, hidden once readings exist.
- E2E: upload the fixture on Métricas, see the summary and the numbers on the piece.
- Remove the tests of the WAV email step together with the step.

## Done when

1. Coni uploads her own export on her phone and sees each Conidolly LinkedIn piece with its impressions and
   interactions on Métricas.
2. A row from the API is never changed by an import.
3. Inicio shows the reminder on Monday and hides it after the import.
4. WAV no longer gets the weekly LinkedIn email.
5. Validated once with a real export from Coni's account before she relies on it.

## Out of scope

Member Analytics API (#15 main path once LinkedIn approves), Instagram metrics with Meta, per-1,000 measures and the
monthly report (rest of change 13), dropping `recordatorios_linkedin`.
