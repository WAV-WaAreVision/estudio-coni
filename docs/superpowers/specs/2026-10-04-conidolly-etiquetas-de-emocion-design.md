# Conidolly: automatic tone marks in every script (design)

Status: approved by Federico on 2026-10-04 (decisions 1 to 7 of the brief). This document turns them into one domain
helper, the places it is used and the review rules. Plan: `docs/superpowers/plans/2026-10-04-etiquetas-de-emocion.md`.

## Problem

Production speaks Coni's scripts with ElevenLabs `eleven_v4` and only `stability: 0.5`
(`ajustes.produccion.elevenlabs`). The voice is correct but flat. Federico tried v4 audio tags in the ElevenLabs web
(`[warm]`, `[softly]`, `[pause]`, `[sighs]`...) and likes the result: v3 and v4 take a word in square brackets as a
direction and do not read it aloud. They do not support SSML `<break>`. `eleven_multilingual_v2` does not support
tags: it would read `[warm]` aloud.

Today the writer is told the opposite: the prompt forbids `[ ]`, and the deterministic review blocks any bracket as a
symbol. A tag also has to stay out of everything that is not the voice: subtitles, caption, counts, checks, previews.

## Facts from the code (verified 2026-10-04 on `main`, 5ea1ff2)

Every consumer of `piezas.guion`, and what it does with the text:

| Consumer | File | Uses the text for |
|---|---|---|
| Writer prompt | `lib/proveedores/anthropic.ts` `pedidoDeGuion` | "REGLAS DEL GUION" forbids `[ ]` explicitly |
| Claude review | `lib/proveedores/anthropic.ts` `pedidoDeRevision` | sends the script verbatim inside `<guion>` |
| Deterministic review | `lib/dominio/revision.ts` `revisarGuion` | `cierre` (endsWith), `simbolos` (`SIMBOLO` includes `[` and `]`, **blocks**), `largo` (`palabras`), `numeros`, `copia_de_fuente` and `nombra_autor` (own tokenizer `palabrasComparables`) |
| Word count, seconds | `lib/dominio/estimaciones.ts` `palabras`, `estimarSegundos` | re-exported by `lib/dominio/duracion.ts` (editor counter), used by `lib/inicio/modelo.ts` (Inicio cards: seconds only), `app/(app)/guion/[id]/page.tsx` and `app/(app)/video/[id]/page.tsx` (seconds), `lib/produccion/grabar.ts` (HeyGen credits and USD), `lib/datos/grabacion.ts` (cost line), `lib/proveedores/heygen.ts` (`armarPedido` words and seconds) |
| Burned subtitles | `lib/dominio/subtitulos.ts` `alinearConGuion` | rebuilds every subtitle phrase from `palabras(guion)` aligned to HeyGen's SRT (`lib/produccion/grabar.ts` `ponerSubtitulos`) |
| Voice | `lib/produccion/voz.ts` `asegurarVoz` | fingerprint `huellaDelGuion(guion, config)`, cost `estimarCostoVoz(guion)`, `generarVoz({ texto: guion })` |
| Voice binding | `lib/produccion/grabar.ts` `vozAprobada`, `lib/datos/grabacion.ts` `vozVigente` | recompute `huellaDelGuion(guion, config.elevenlabs)` to find the take |
| HeyGen request | `lib/proveedores/heygen.ts` `armarPedido` | Route A (`ruta_voz: "heygen"`) sends `cuerpo.script = guion`; Route B (production) sends only the audio asset, no text |
| Gate 1 | `lib/dominio/puertas.ts` `hashPuerta1` | hashes the raw `guion` |
| Guion screen | `components/editor-de-guion.tsx`, `app/(app)/guion/[id]/pantalla-guion.tsx` | the editor textarea; once approved, a read-only `<p>` with the script |

Checked and **not** a consumer of the script text: notifications (`lib/avisos/*`: fixed titles), Inicio cards and the
calendar (`lib/inicio/modelo.ts`, `lib/calendario/modelo.ts`: title, state and seconds only), the Video screen
(seconds only), publication (`texto` is a separate column; Instagram receives `texto` and the video). The course
script `scripts/coni.py subtitulos` in `coni-heygen` is not in this pipeline; the TS port is.

The voice fingerprint (`lib/dominio/voz.ts` `huellaDeVoz`) already includes `modelId`, so switching models already
gives a new take. The stored guide (`guias` table, seeded from `contenido/linea-editorial.md`) is the cached system
prompt and says "Sin emojis, hashtags ni símbolos dentro del guion"; the per-call user message carries the exact rules.

## Decisions

### 1. One domain helper: `lib/dominio/etiquetas.ts`

Pure, no imports. It owns the list and the grammar of a mark:

- `ETIQUETAS_DE_TONO`: `warm, softly, gentle, reassuring, encouraging, thoughtful, empathetic, calm, confident, clear,
  casual, matter-of-fact, pause, sighs`. Closed list, English, no laughs. `MINIMO_DE_ETIQUETAS = 3`,
  `MAXIMO_DE_ETIQUETAS = 6`.
- **A mark** is `[` + a letter + up to 38 letters, spaces, hyphens or apostrophes + `]`
  (`/\[(\p{L}[\p{L}' -]{0,38})\]/gu`). `[warm]`, `[Softly]`, `[matter-of-fact]` and `[cálido]` are marks; `[1]`,
  `[ok!]` or a lone `[` are not, so the symbol rule still blocks them. Names compare trimmed and lowercased.
- `etiquetasDe(texto)`: every mark as `{ escrita, nombre, conocida }`.
- `sinEtiquetas(texto)`: the text with every mark removed. **A text without marks comes back byte for byte the same**
  (this keeps every existing fingerprint and subtitle golden valid). Only a text that lost a mark is tidied: runs of
  spaces collapse to one, no space before `, . ; : ! ? …`, lines trimmed, three or more line breaks become two,
  the whole trimmed.
- `admiteEtiquetas(modelId)`: `/^eleven_v[34](?:_|$)/`. True for `eleven_v3`, `eleven_v4`, `eleven_v3_alpha`,
  `eleven_v4_preview`; false for `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2_5`, `eleven_v30`,
  `eleven_v5` and anything unknown. Unknown models are treated as "would read them aloud": the safe failure is a flat
  voice, never a voice saying "warm".
- `textoParaVoz(guion, modelId)`: for a model that admits marks, the script with **unknown** marks removed (known ones
  stay as written); otherwise `sinEtiquetas(guion)`. An unknown mark never reaches the voice, so the warning
  "no la conozco" is literally true: it does nothing.

### 2. Where marks are stripped

| Place | How |
|---|---|
| Word count, seconds, HeyGen credits and USD, Inicio and screen seconds, editor counter | `palabras()` and `estimarSegundos()` in `lib/dominio/estimaciones.ts` strip first. One choke point: every counter already goes through them. |
| Burned subtitles | `alinearConGuion` uses `palabras(guion)`: covered by the line above. Subtitles keep expressive punctuation and a CAPS word as written. |
| Deterministic review | `revisarGuion` works on `hablado = sinEtiquetas(guion)` for `cierre`, `simbolos`, `largo`, `numeros`, `copia_de_fuente` and `nombra_autor`. A mark can no longer break an 8-word copy window or trip the symbol rule. |
| Claude review | `pedidoDeRevision` sends `sinEtiquetas(guion)`. |
| ElevenLabs | `asegurarVoz` sends `textoParaVoz(guion, config.model_id)`, and reserves the cost on that same text. |
| HeyGen Route A | `textoDelGuion` in `heygen.ts` sends `sinEtiquetas(guion)` always (HeyGen's engine is not ours to trust with marks; Route A is not used in production). A script of only marks is empty there. |
| Caption | Never stripped silently: a mark in `texto` **blocks** (decision 5). |

Kept with marks, on purpose: `piezas.guion` itself, the gate-1 hash, the editor and the read-only approved script on
the Guion screen (it is the script she approved, on the same screen as the editor).

### 3. The writer adds them

`pedidoDeGuion` (user message, not the cached guide) gets, built from `ETIQUETAS_DE_TONO`:

- between 3 and 6 marks, each right before the phrase where the tone changes, only from the list, written as listed;
  no laughs; the voice does not read them and they are not in the subtitles; the closing line has none;
- ellipses for a pause and at most one word in CAPS for emphasis;
- the symbol line no longer lists `[ ]` and says brackets are only for the marks;
- "Entre 75 y 150 palabras" adds "Las marcas de tono no cuentan como palabras";
- caption rules: "Sin marcas de tono: van solo en el guion."

The stored guide is not changed (YAGNI): the user message is specific and wins over the general "sin símbolos".

### 4. Coni sees and edits them

Under the script box of `EditorDeGuion`, a new `AyudaDeMarcas` component:

> Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos.
> Marcas que conozco: [warm] [softly] ... [sighs]

The second line is an addition to the approved copy: the unknown-mark warning says "Usa una de la lista", so the list
has to be on screen. On the read-only approved script, the same help appears only when the script has marks.

### 5. Review rules (deterministic, `lib/dominio/revision.ts`)

| Rule | Type | When | Message |
|---|---|---|---|
| `etiqueta_desconocida` | advierte | a mark not on the list; one finding per distinct mark, `frase` = the mark as written | `Esta marca de tono no la conozco: [x]. Usa una de la lista o bórrala.` |
| `muchas_etiquetas` | advierte | more than 6 marks (known or not) | `El guion tiene N marcas de tono. Con 3 a 6 la voz suena natural; con más suena actuada.` |
| `etiqueta_en_texto` | **bloquea** | any mark in the caption; one per distinct mark | `Las marcas de tono van solo en el guion. Bórrala del texto de la publicación.` |

Fewer than 3 marks is not a finding (old scripts, or Coni removed them). Marks with a model that does not admit them
are fine: they are stripped. The caption rule blocks because the caption is published verbatim; blocking also makes
`producir` run its one correction round if the writer slips. The new rule names extend `REGLAS_DETERMINISTAS`, so
`leerRevision` (Zod enum built from it) accepts them; no migration (the column is `jsonb`).

### 6. Gate 1 and the voice fingerprint

- **Gate 1 keeps hashing the raw `guion`, marks included.** The marks are part of what Coni approves: changing one
  after approval changes how the voice sounds, so it must go back through approval.
- **The voice fingerprint hashes the text actually sent to ElevenLabs.** `huellaDelGuion(guion, config)` becomes
  `huellaDeVoz({ guion: textoParaVoz(guion, config.model_id), voz: vozDe(config) })`. The version tag stays
  `voz/1`: for a script without marks the text is identical, so every stored take keeps matching. Consequences:
  with v2, two scripts that differ only in marks share one take (same audio, correctly reused); with v4, a changed
  known mark is a new take; a model switch was already a new take (`modelId` is hashed). `asegurarVoz`,
  `vozAprobada` and `vozVigente` all go through `huellaDelGuion`, so they agree.

### 7. Old scripts

No backfill. A script without marks behaves exactly as today: same counts, same subtitles (goldens unchanged), same
fingerprint, same review.

## Eval

`tests/eval/guion.eval.ts` (real API, only with `RUN_EVALS=1`) adds to each idea: 3 to 6 marks, all known, none in the
caption. Running it costs money: Federico runs it, not the executor.

## Out of scope

Changing the voice settings, a picker UI for marks, marks in the caption, backfilling old scripts, updating the stored
guide or `contenido/linea-editorial.md`, supporting marks on HeyGen Route A.

## Open questions

1. The stored guide still says "sin símbolos dentro del guion". The user message overrides it; if the writer still
   avoids marks in the eval, a guide v2 that mentions them is the next step.
2. Subtitles keep the CAPS emphasis word as written ("NUNCA"). Lowercasing it there is a one-line change if Federico
   prefers.
3. Any bracketed word in the caption (`[Nuevo]`) now blocks. Acceptable?
4. A future `eleven_v5` is treated as not admitting marks until the rule is widened.
5. The cost shown on screens is still estimated on the script with marks (at most ~1% high); the reservation uses the
   text sent. ElevenLabs is assumed to bill the tag characters.
