# Conidolly: LinkedIn pillars, visible sources, honest voice spend, metrics and batch actions (design)

Status: approved by Federico on 2026-10-17, part by part (pillars as data, A; four parts, each on its own branch).
Follows `2026-10-16-conidolly-soft-ui-design.md` ("Follow-up spec (logic)"): the visual migration is in production
since 2026-10-17 at 27/40 (two critics); the remaining gap to the 34/40 target needs behaviour, not paint.

## Problem

The exit critique of the Soft UI (2026-10-17, critics A 26 and B 28) left these findings that UI work cannot close:

- Coni signs without seeing what backs a script (principle 3 of `docs/PRODUCT.md`, "La autoridad se respalda").
- The LinkedIn text she signs carries keycap emojis (1️⃣2️⃣3️⃣), an anti-reference of `docs/PRODUCT.md`.
- Métricas contradicts itself ("0 reels publicados" above, "Lo que sirvió: 3 reels" below) and has no LinkedIn,
  the product's main channel.
- Ritmo reads "van 0 de 0" before the first publication.
- A failed voice may leave money held against the monthly cap, so the app cannot honestly say a retry is free.
- Everything goes one by one (heuristic 7): choosing ideas, discarding ideas, placing pieces on the calendar.

On top of that, Coni's pillars change: the five sexology pillars give way to five LinkedIn authority pillars
(`~/Downloads/Pilares de Coni en LinkedIn.pdf`, WAV, 2026-10-08).

Not a finding any more: "generic avatar thumbnails". Production shows the real HeyGen preview (`ajustes.produccion`
-> `heygen.avatares[].imagen`, an R2 copy of `preview_image_url`); the illustrations the critics saw are test fixtures.

## Facts from the code (verified 2026-10-17 on `main`, 6c39292)

Pillars
- `public.pilar` enum `('pareja','deseo','autoestima','limites','bienestar')` (`20261001000100_esquema.sql:6`); the
  only enum column is `ideas.pilar` (line 11). `piezas` has no pillar; it is read through `ideas(pilar)`
  (`lib/datos/metricas.ts:87`).
- The same slugs are rows of `public.categorias (id, slug unique, nombre, ...)` plus `general`
  (`20261003000100_ingesta.sql:9-24`). `materiales`, `teorias` and `afirmaciones`/`temas` point at `categorias`.
  `motor_temas` returns `pilar text` = `categorias.slug` (`20261003000410_motor_datos.sql:4,25`).
- Hardcoded copies: `lib/dominio/pilares.ts` (`PILARES`, `NOMBRE_DE_PILAR`, `NOMBRE_CORTO_DE_PILAR`),
  `lib/motor/puntaje.ts:16`, `lib/ideas/banco.ts:17-23` (`PILAR_POR_TITULO`), the classify prompt in
  `lib/proveedores/anthropic.ts:426-431`. The script prompt uses `idea.pilar` dynamically (`anthropic.ts:160`).
- No migration has ever renamed or replaced an enum value; only `add value` exists.
- `categorias` is shared with the separate app `conidolly-ingesta` (same Supabase project).

Sources
- `nombra_autor` and `copia_de_fuente` live in `lib/dominio/revision.ts` (`autoresNombrados` :112,
  `tramosCopiados` :85). They only warn. `revisarGuion` runs them on the spoken script and the Instagram caption
  (:281-289); `revisarTextoLinkedin` on the LinkedIn text (:491-496).
- `piezas.respaldo` is built in `lib/produccion/producir.ts:88` from RPC `respaldo_de_idea`
  (`20261003000510_respaldo_de_idea.sql`) and saved at :166. Shape (`lib/datos/respaldo.ts:6-19`):
  `teoria{id,titulo,tesis,porQue}` and `afirmaciones[{id,texto,cita,aporte,autor,deConi,esPersona}]`. No year, no
  work title, no URL. The respaldo enters the gate 1 hash (formula 3).
- `materiales` has `titulo`, `autor`, `origen_url` (video/image only, never fetched); no year anywhere.

LinkedIn text
- One call (`escribirGuion`, `anthropic.ts:374`) writes script, caption and LinkedIn text. The LinkedIn rules
  (:182-193) say "Emojis: de cero a tres, solo para ordenar (✅ ▸ 📌 1️⃣)". `revisarTextoLinkedin` counts keycaps
  as emojis (max 3); Unicode bold and long dashes are already hard failures.

Voice spend
- `asegurarVoz` (`lib/produccion/voz.ts:62-110`) reserves before calling ElevenLabs and releases at once only when
  `generarVoz` throws a `Falla` (no characters). Any other error (401, 5xx, network, empty audio, upload failure)
  leaves the reservation `reservado`, and the cap counts `reservado` and `confirmado`
  (`20261001000400_gastos.sql:30-31`).
- Trigger retries (maxAttempts 3) reuse the key `claveDeGastoDeVoz(id, huella, intento)`; a closed reservation
  without its take throws `FallaDeConfiguracion` (voz.ts:94-99).
- `barrerGastos` (`lib/mantenimiento/gastos.ts`) releases a by-text voice reservation with no take after an hour
  (`vozSinToma`); older keys fall back to "any stored voice means paid" (`pasoRealizado`), which can confirm a
  failed attempt.

Métricas and Ritmo
- `lib/datos/metricas.ts:84-92` loads pieces with `estado='publicado'`, `media_id` and `puerta2_publicar_en` not
  null: `publicado_a_mano` and LinkedIn-only pieces are left out.
- The header counts the current calendar month (`reelsDelMes`, `lib/metricas/modelo.ts:229-230,295`); "Lo que
  sirvió" counts the last 12 weeks (`SEMANAS_A_MOSTRAR`, :107, `app/(app)/metricas/page.tsx:50`).
- `public.publicaciones (pieza_id, destino, estado esperando|para_subir|subido_a_mano|publicado, enlace, ...)`
  (`20261006000100_destinos.sql:26`) tracks each network. No LinkedIn metrics table.
- Ritmo (`lib/calendario/modelo.ts:348-391`): 4 weeks x `ajustes.dias_publicacion`; "usados" are filled slots,
  "esperados" add free slots already past and on or after her first publication, hence "0 de 0" before it.
- Roles: `public.es_coni()` and `public.es_mantenedor()`.

Ideas
- `elegirIdeas` (`lib/acciones/piezas.ts:163`) already takes several ideas; `empezarPieza` claims each idea, inserts
  the piece without a date, records `elegir` and starts the script task, putting the idea back on failure.
- `descartar_idea(p_id, p_motivo)` with `no_me_representa|repetida|debil|otro` (`20261003000400_motor.sql:75-85`).
- Dates are proposed only at the gates (`proponerFechas`, `lib/dominio/fechas.ts:92`); gate 2 saves the chosen one
  in `puerta2_publicar_en`, which Coni signs.

## Decisions

### Part 1: editorial (branch `feat/pilares-linkedin`)

1. **Pillars are data.** `categorias` gains `es_pilar boolean not null default false`, `activa boolean not null
   default true`, `orden smallint`, `nombre_corto text`, `descripcion text`. One TS reader,
   `pilaresActivos()` (lib/datos), feeds labels, the engine, the classifier prompt and the writer prompt. The four
   hardcoded copies are deleted. A test fails if a slug literal of a pillar appears in `lib/` or `app/`.
2. **The five LinkedIn pillars** are inserted with `es_pilar = true`, in this order:

   | slug | nombre | nombre_corto |
   |---|---|---|
   | `ia-salud-mental` | IA y salud mental | IA y salud mental |
   | `practica-clinica` | Práctica clínica aumentada | Práctica clínica |
   | `etica-regulacion` | Ética y regulación | Ética |
   | `acceso-salud-publica` | Acceso y salud pública | Acceso |
   | `caso-coni` | Caso Coni: humana + avatar | Caso Coni |

   `descripcion` takes the one-line description of the PDF. The old five get `activa = false`, `es_pilar = true`
   (kept: materials, topics and used ideas point at them). `general` stays `es_pilar = false`.
3. **`ideas.pilar` becomes `text references categorias(slug)`**; `public.pilar` is dropped. Ideas still in the bank
   (`estado = 'idea'`) whose pillar is inactive are discarded with a new motive `pilar_retirado`, added only to the
   motive check: it is a system motive, set by the postgres-only `archivar_ideas_de_pilares_retirados()`, and
   `descartar_idea` (Coni's) does not offer it. Used ideas keep their old slug. A trigger rejects a new idea, or a
   change of pillar, whose category is not an active pillar.
4. **Re-classification, once.** `scripts/reclasificar-pilares.ts` asks Claude to place every material, topic and
   claim of an inactive or `general` category into one of the five, writes a CSV for WAV
   (`id, tipo, antes, propuesta, razon`) and applies only with `--aplicar`. Unplaced items go to `general`. Cost
   is cents (the corpus is one symposium); the script prints its estimate before calling.
5. **Pillar 5 may be empty.** "Caso Coni" has no material until Federico sends it in this conversation channel and
   WAV loads it through the existing ingesta as author "Constanza del Rosario" (`autores.tipo = 'coni'`). The
   engine must produce ideas with any subset of pillars empty; no new screen.
6. **Ingesta hides inactive categories.** One change in `conidolly-ingesta` (category pickers filter `activa`),
   same part, its own commit and deploy.
7. **Visible source.** `materiales` gains `anio smallint check (anio between 1900 and 2100)`, filled by WAV.
   `respaldo_de_idea` adds per claim `fuente {autor, titulo, anio}` from its material. `respaldoAJson` writes
   `fuente` only when present, so the stored JSON (and the formula 3 hash) of existing pieces does not change.
   Display rule `lineaDeFuente(fuentes)`:
   - one source: `Fuente: <autor> · <titulo> (<anio>)`; without year `Fuente: <autor> · <titulo>`; without title
     `Fuente: <autor>`;
   - several: the first two, then `y N más`;
   - only Coni's own claims: `De Coni`;
   - no claims (an idea not from the engine): no line.
   Shown on the idea card (under the hook) and at gate 1 (under the script).
8. **Where the source is cited.** The LinkedIn text cites it inside the text (the writer receives the sources);
   the Instagram caption ends with the `Fuente:` line; the spoken script never names authors. `nombra_autor` keeps
   running on the spoken script unchanged; on the caption and the LinkedIn text it accepts the names of the cited
   sources and still warns on any other person. `copia_de_fuente` is unchanged everywhere. The cited line is part
   of the texts Coni signs.
9. **No keycap emojis on LinkedIn.** The writer prompt drops "1️⃣" from its example and says lists go as plain
   numbers ("1.") or prose. In `revisarTextoLinkedin` a keycap (digit + U+FE0F + U+20E3, or U+1F51F) becomes a hard
   failure, like Unicode bold, so the existing rewrite path runs instead of a warning.
10. **Editorial prompts read the pillars.** The writer and the engine get each active pillar's `descripcion` and
    the audience line of the PDF (colleagues in mental health and technology; responsible adoption with clinical
    judgment, neither enthusiastic nor alarmist; sexology as a lens inside the pillars, no pillar of its own).
    `contenido/linea-editorial.md` (coni-heygen repo) and `docs/PRODUCT.md` are updated in the same part.

### Part 2: honest voice spend (branch `fix/voz-sin-doble-cobro`)

11. **Release by outcome.** In `asegurarVoz`:

    | Failure | Charged? | Reservation |
    |---|---|---|
    | ElevenLabs answered an HTTP error (4xx incl. 401/403, 5xx) or returned empty audio | no | released at once |
    | Network error or timeout with no response | unknown | stays reserved; the sweeper releases it after an hour with no take (today's rule) |
    | Audio received, upload failed | yes | upload retried 3 times in the same run with the audio in memory; if it still fails, the reservation is confirmed |

    `generarVoz` must surface which case happened (a typed error with `respondio: boolean`); the plan's first task
    checks in ElevenLabs' official docs that an error response consumes no characters. If that is false, this
    table is corrected before any code.
12. **Retries do not jam.** `reservarGasto` on a `liberado` key reopens it to `reservado`. A `confirmado` key
    without its take (the upload case) makes the next attempt use a fresh key with a retry suffix, which counts
    once more: that audio was paid.
13. **Older keys** lose the "any stored voice means paid" fallback; they follow the 24 h rule.
14. **What Coni reads.** When the reservation of the failed attempt is `liberado`, the failure block adds
    `Este intento no se cobró.` On an unknown outcome it says nothing about money. The retry button keeps showing
    its cost; the month's cap stops counting released money (already true in SQL, now also in the screen's sum).

### Part 3: metrics and rhythm (branch `feat/metricas-linkedin`)

15. **One source of "published":** `publicaciones` rows with `estado in ('publicado','subido_a_mano')`, per
    network. A piece on both networks counts once per network in Métricas and fills one slot in Ritmo.
16. **Every number says its period.** Header: `Este mes: N reels en Instagram · N posts en LinkedIn` (singular
    forms included). "Lo que sirvió" and "Semana a semana" carry the subtitle `Últimas 12 semanas` and count the
    same set. A manual upload without numbers is listed with `sin números`, not an empty bar.
17. **"Lo que sirvió" by network.** Two groups, Instagram (reach) and LinkedIn (impressions), each naming its
    measure; never one mixed bar. Pillars shown are the active ones.
18. **LinkedIn numbers by hand, ready for automation.** New table `metricas_linkedin (pieza_id references piezas,
    medido_en date, impresiones int, reacciones int, comentarios int, compartidos int, origen text check (origen
    in ('manual','api','metricool')), anotado_por uuid, primary key (pieza_id, medido_en))` and
    `metricas_linkedin_cuenta (semana date primary key, seguidores int, origen, anotado_por)`. RLS: read for
    `es_coni() or es_mantenedor()`, write for `es_mantenedor()` (and the service role). The latest row per piece is
    the one shown.
19. **WAV's desktop entry.** Inside "Para WAV" on Métricas: the LinkedIn posts of the last 4 weeks without a row
    this week, four number fields each, plus followers. Saving writes rows only.
20. **Monday reminder.** The nightly maintenance sends WAV, on Mondays only, `Anota los números de LinkedIn (N
    posts)` through the existing notices, only when N > 0.
21. **Automation later, outside this spec.** Two errands without code: Federico requests `r_member_postAnalytics`
    for the Conidolly LinkedIn app; WAV asks Metricool whether its API returns personal-profile LinkedIn stats and
    on which plan. Whichever lands first becomes a small task that fills `metricas_linkedin` with its `origen` and
    turns the reminder off. Both only cover posts published through that app (LinkedIn's rule).
22. **Ritmo teaches.** Before the first publication: `Todavía no publicas. Tu ritmo es <días> a las <hora>. Cuando
    salga la primera pieza, aquí verás si vas al día.` with a link to Ajustes. Free slots: the next 3, then
    `y N libres más`.

### Part 4: batch actions (branch `feat/lote`)

23. **Choose several ideas.** Ideas gets `Elegir varias`: checkboxes on the cards and a bottom bar with `Hacer los
    guiones (N)` and `Descartar (N)`. Up to 5 per batch. Before asking, the cap is checked for the whole batch; if
    it covers fewer, the bar says `Alcanza para N este mes. ¿Hago esos?` and nothing starts without her tap. It
    calls `elegirIdeas`; every script still goes through its own gate 1.
24. **Discard several, with undo.** One motive for the batch (today's four). Then the 8 s toast with `Deshacer`.
    New RPC `restaurar_ideas(p_ids uuid[])`, `es_coni()` only, returns to the bank ideas Coni discarded less than
    8 s ago by the server clock, never `pilar_retirado`.
25. **Spread dates over what is not signed.** New column `piezas.fecha_propuesta timestamptz`, outside every
    signature hash. `Repartir fechas` on the Agenda gives the next free rhythm slots, in creation order, to pieces
    not yet past gate 2 and without a proposal; programmed and published pieces are never touched. The Agenda shows
    proposals labelled `propuesta`; `Cambiar` picks another free slot. Gate 2 preselects the proposal if it is
    still free and in the future, otherwise proposes as today; gate 1 shows it as the estimate. When a signed piece
    takes a proposed slot, the proposal is ignored on read and the piece shows `sin fecha`; no database lock.
26. **Audit.** Each batch action records its events per idea or piece as today, so `docs/metricas-friccion.sql`
    keeps working.

## Migration order

All after `20261016000210`. Part 1: `20261017000100_pilares_como_datos.sql` (columns, inserts, enum to text, FK,
archive, motive), `20261017000110_fuente_en_el_respaldo.sql` (`materiales.anio`, `respaldo_de_idea`). Part 2: none
expected (if `reservarGasto` is SQL, `20261017000200_reabrir_reserva.sql`). Part 3:
`20261017000300_metricas_linkedin.sql`. Part 4: `20261017000400_lote.sql` (`restaurar_ideas`,
`piezas.fecha_propuesta`). Regenerate `database.types.ts` after each.

## Testing

TDD per task. Highlights:
- Part 1: `pilaresActivos`; the no-literal-slug guard; `lineaDeFuente` table; revision with keycaps and with the
  cited source's name in caption/LinkedIn vs spoken script; integration for the enum migration (bank ideas archived,
  used ideas kept, FK rejects an inactive pillar on insert); engine with an empty pillar; `ideas-eval.json` moved
  to the new pillars; stored respaldo of an existing piece hashes the same.
- Part 2: one unit test per row of the table in decision 11; integration for reopening a released key and for the
  cap ignoring released money; sweeper no longer confirms an older key on a foreign voice; component test for
  `Este intento no se cobró.` only when released.
- Part 3: model tests (count per network and period, both networks, manual without numbers, Ritmo before the first
  publication); RLS of the two tables; Monday reminder only with pending posts; E2E of WAV's entry; snapshots of
  Métricas with LinkedIn and of the empty Ritmo.
- Part 4: selection and partial cap; spreading (order, skips signed, no slot twice); gate 2 preselection valid and
  stale; `restaurar_ideas` inside and outside 8 s and on `pilar_retirado`; `fecha_propuesta` outside the hashes;
  E2E and axe for the batch mode, discard with undo and the Agenda with proposals.
- Every part: full suites (`pnpm test:run`, `pnpm test:db`, `pnpm type`, lint on code dirs, `pnpm build`,
  `pnpm test:e2e`) and a critique of the touched screens before merge.

## Docs to update in the same branch

`docs/TRASPASO.md` (per part), `docs/PRODUCT.md` and `contenido/linea-editorial.md` (part 1), `docs/DESIGN.md` only
if a component is added (batch bar, source line), `docs/metricas-friccion.sql` if events change.

## Deploy

Per part, each step with Federico's OK: `supabase db push` (Federico), Trigger deploy (parts 1, 2 and 3: writer,
voice task, maintenance), Vercel production (Federico runs `vercel deploy --prod` from a clean `git archive` export),
and for part 1 the ingesta deploy. Part 1 runs the re-classification script between the push and the deploy, after
WAV reviews the CSV.

## Risks

- Re-classification quality: a wrong pillar skews ideas and metrics. Mitigated by the CSV review and by `general`.
- Citing sources raises the bar on accuracy: a wrong year or title is now public. WAV fills `anio`; no year is
  better than a guessed one (the line omits it).
- ElevenLabs billing assumption (decision 11) unverified until the plan's first task.
- Manual LinkedIn numbers depend on WAV's discipline; the Monday reminder and `sin números` keep gaps visible.
- `fecha_propuesta` can look like a promise: the label `propuesta` and gate 2 keep the signature the only truth.
- Dropping `public.pilar` touches generated types and 24 test files; done in one task with the full suite.

## Answered questions (Federico, 2026-10-17)

- Pillars: the five new ones replace the old ones everywhere (Instagram included).
- Source: visible in the app, cited in LinkedIn and Instagram texts, never in the spoken script.
- Pillar 5 material: Federico sends it in conversation when he has it; no new screen.
- LinkedIn metrics: by hand now, API later (and Metricool explored).
- Batch: choose several ideas, discard several, spread dates. No batch signing: each signature needs the whole
  voice or video.
- Pillars stored as data (approach A); four parts on four branches in the order above.

## Out of scope

Batch signing; LinkedIn API metrics (decision 21); a screen for Coni's own notes; avatar thumbnails (already real);
"Meta de este mes" on Inicio; anything in `lib/publicacion` beyond reading `publicaciones`.

## Self-review

- Placeholders: none; open checks are explicit tasks (ElevenLabs billing, `reservarGasto` location, the claim to
  material link for `fuente`).
- Consistency: signature rules unchanged everywhere (sources enter through the signed texts and respaldo;
  `fecha_propuesta` is outside every hash); cap semantics unchanged in SQL.
- Scope: four independent branches; part 1 is the largest and goes first because parts 3 and 4 read its pillars.
- Ambiguity: source line format, keycap definition, release table and the reminder condition are spelled out.
