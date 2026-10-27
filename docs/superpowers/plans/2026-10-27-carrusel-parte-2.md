# LinkedIn Carousels, Part 2 (rendering, gate 2, design changes, manual upload) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A carousel Coni signed at gate 1 is rendered by a Trigger.dev task into 1080 x 1350 PNG slides and one PDF, she
reviews them at gate 2 (a rail of slides, the post text, a date), asks for a bounded design change or a text change, and
slides "Desliza para programar". At the signed time the piece is handed to her to upload by hand ("Descargar PDF",
"Copiar texto", "Ya lo subí"), so a carousel is usable end to end before part 3 adds the Documents API. Gate 1 (reels and
carousels) also gets "Descartar esta pieza".

**Architecture:** A new task `armar-carrusel` (Playwright's Chromium through Trigger.dev's `playwright()` build
extension) renders the latest `carruseles` version with an HTML+CSS template of its own (`lib/carrusel/plantilla`,
committed OFL serif, three colour variants), measures every text box, shortens overflowing slides once with Claude (a new
text, so back to gate 1), and saves PNGs and the PDF to R2 through the `Almacen` port. Two SQL functions write its
result atomically (`guardar_armado`, `guardar_acortado`); a third (`cambiar_diseno_de_carrusel`) is gate 2's "El diseño",
which keeps the words (checked in SQL) and so keeps gate 1. Gate 2 of a carousel signs `puerta2_carrusel_id` plus its
`hash_texto` and the date; `proteger_pieza` binds it to the latest rendered version. The publisher hands a due carousel
over (`para_subir_a_mano`) before it ever looks at LinkedIn, so no carousel reaches the API in part 2. Runs start the
same way as today's: the app triggers them with an idempotency key, and `mantenimiento-frecuente` re-asks for any piece in
`armando_carrusel` that has not moved for ten minutes (which also picks up the carousels signed in part 1).

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (RLS, triggers, security definer RPCs), Trigger.dev v4
(`@trigger.dev/build` 4.6.4 `playwright()` extension), Playwright 1.59.1 (`playwright` runtime dependency), Anthropic SDK
(`pedirJson`, cached guide), Zod 4, Vitest + Testing Library + MSW 2, Playwright Test + axe, `unpdf`, Biome, pnpm.

---

**Spec:** `docs/superpowers/specs/2026-10-26-conidolly-carrusel-linkedin-design.md`, part 2 of its "Order": D1 steps 4
and 5, D4, D5, the gate 2 screen, and its tests. Plus the manual half of D6 (decision P1 below) and gate 1's discard
(decision P2, approved by Federico on 2026-10-27). Out of scope: the Documents API upload and post (part 3), Métricas
labels (a carousel already counts as a LinkedIn row there).

**Part 1 as built (the code on `main` at `1683af2` is the truth):** migrations `20261026000100` to `20261026000140`;
`piezas.tipo`, `pedido_de_cambio`, `cambios_de_texto`, `puerta2_carrusel_id`; table `carruseles` (immutable words, mutable
`estado`, `pdf_clave`, `png_claves`); `guardar_carrusel`, `pedir_cambio_de_carrusel`; `proteger_pieza` as of
`20261026000140` (a carousel enters `armando_carrusel` only from `guion_por_aprobar`; every state past gate 1 needs the
latest version's `hash_texto` in `puerta1_hash`); `lib/datos/carrusel.ts`, `lib/produccion/carrusel.ts`, the writer
branch in `producir-pieza`, `app/(app)/guion/[id]/carrusel.tsx` and `pantalla-carrusel.tsx`. A signed carousel waits in
`armando_carrusel` with its version `escrito`, and Inicio says "Texto firmado · falta el diseño". Production has such
pieces (or may): this plan picks them up (amendment 9).

**Branch and worktree:** `feat/carrusel-2` in `.worktrees/carrusel-2`, from `main` at this plan's commit.

## Amendments to the spec (verified against `main` at `1683af2`; where the spec and this block disagree, this block wins)

1. **The retry and the design change need new ways into `armando_carrusel`.** Part 1's `proteger_pieza` lets a carousel
   enter it only from `guion_por_aprobar` (`firma_fuera_de_puerta1`), and `estado_antes_del_error` only takes
   `en_render`, `subtitulando`, `programado`. Migration `20261027000100` allows `armando_carrusel` from
   `guion_por_aprobar` (signature), `carrusel_por_aprobar` (design change, only through `cambiar_diseno_de_carrusel`:
   `diseno_por_funcion` refuses a session) and `error_produccion` (Reintentar), and adds `armando_carrusel` to
   `estado_antes_del_error`. The latest-hash rule of part 1 still guards every entry.
2. **Gate 2 of a carousel is bound in SQL.** The spec only names `puerta2_carrusel_id`. `proteger_pieza` now refuses a
   carousel's gate 2 unless it comes from `carrusel_por_aprobar` and `puerta2_carrusel_id` is the latest version, `listo`,
   with `hash_texto = puerta2_hash_texto = puerta1_hash` (`carrusel_no_coincide`). `puerta2_formula` stays null for a
   carousel. In the domain, `AprobacionCarrusel { carruselId, hashTexto, publicarEn, en }` joins `AprobacionVideo` (they
   tell apart by `carruselId`/`videoId`, each `?: undefined` on the other, so no reel literal changes).
3. **What "one automatic shortening" means.** The renderer measures; if any slide overflows and the version is not
   already `acortado`, Claude shortens only those slides (one call, `acortarLaminas`), the app reviews the new text with
   the deterministic rules (Claude's earlier judgments are kept), and `guardar_acortado` writes a new version
   (`origen = 'acortado'`, new `hash_texto`, same post and design) and sends the piece back to gate 1 with
   `Acorté la lámina N para que quepa. Léela y fírmala de nuevo.` If an `acortado` version still overflows, the piece goes
   back to gate 1 with `La lámina N quedó muy larga. Pide un cambio para acortarla.` and nothing is spent. The bound is
   per text version: a text change Coni asks for may be shortened once again.
4. **Overflow is measurable because the template never shrinks text by itself.** The font size of a slide is a pure
   function of its type and length (`tamanoDeLetra`); a text box overflows when its paragraph is taller than the box.
5. **Design changes are four exact operations** (`CambioDeDiseno`): `variante` (crema, piedra, oscura), `dividir` (an idea
   slide with at least two sentences, at the sentence boundary nearest its middle, only while there are fewer than 6
   ideas), `unir` (an idea slide with the next idea slide, only while there are more than 4 ideas; never across portada
   or cierre), `destacar` (one of the slide's own words, or none). Each one is a new `carruseles` row (`cambio_diseno`)
   with the same `hash_texto` and post; the SQL function checks the words are identical (`palabras_de_laminas`), the
   portada and cierre texts are unchanged, 6 to 8 slides, and the design is one known variant. It does not touch
   `cambios_de_texto`.
6. **"El texto" at gate 2 reuses `pedir_cambio_de_carrusel`** (now also from `carrusel_por_aprobar`); it takes the
   signature back, counts toward the three, and the writer writes a new version from the latest one.
7. **Idempotency.** The run key is `claveArmar(piezaId, carruselId, intento)` (`paso = "armar"`): one render per version
   and attempt, so a double tap or the sweep never doubles it, and Reintentar (which bumps `intento`) gets a new run.
   R2 keys are per version (`carruseles/<pieza>/<carrusel>/lamina-01.png`, `.../carrusel.pdf`), so a retried render
   overwrites its own files and a design change never touches what an earlier gate 2 saw.
8. **Failure.** The task retries twice (`retry.maxAttempts = 3`; configuration errors skip retries as today). Its
   `onFailure` marks the version `fallo` and moves the piece to `error_produccion` (from `armando_carrusel`) with
   `No pude armar el carrusel. WAV ya está revisando.`; the screen offers `Reintentar (no se cobra)` and `Descartar esta
   pieza`; Inicio says `No pude armar el carrusel.`
9. **How runs start, and the pieces already waiting.** As every run today: the action that moves a carousel into
   `armando_carrusel` triggers `armar-carrusel` (`firmarCarrusel`, `cambiarDisenoDeCarrusel`, `reintentar`) and says
   so if Trigger.dev is unreachable; `reanudarArranques` (every 10 minutes) re-asks with the same key for every carousel
   in `armando_carrusel` without an explanation that has not moved for 10 minutes. Carousels signed under part 1 are
   exactly that, so the first `mantenimiento-frecuente` tick after the Trigger.dev deploy renders them; nothing manual.
10. **Notices.** `avisar_pieza_lista` also fires on `carrusel_por_aprobar` (`Tu carrusel «…» está listo para verlo y
    elegir la fecha.`, kind `video_listo`) and, when a carousel comes back from `armando_carrusel` to gate 1, says `Tu
    carrusel «…» necesita tu firma de nuevo.`
11. **The post text is not editable on a carousel.** `ESTADOS_CON_TEXTO_DE_LINKEDIN_EDITABLE` excludes
    `carrusel_por_aprobar` on purpose: a carousel's post is `carruseles.texto_post`, part of `hash_texto` and signed at
    gate 1 (C8: no editing on the phone; a change is "Pedir cambio · El texto"). `piezas.texto_linkedin` is a reel column
    a carousel never uses. Part 1 left one gap: `editarTextoLinkedin` would write that column on a carousel in
    `guion_por_aprobar`. Task 21 refuses any carousel there.
12. **Gate 2's "short-lived" URLs.** Slide PNGs use `urlParaVer` (one hour, as the video at gate 2); the PDF uses
    `urlParaDescargar` (ten minutes, a download with the name `carrusel-<id8>.pdf`). R2 keys never reach the browser.
13. **`/video/<id>` sends a carousel to `/guion/<id>`**, where every carousel state lives, so the Inicio and Calendario
    links of the shared states (`programado`, `para_subir_a_mano`) keep working.
14. **Deploy order** is database, Trigger.dev, app (Task 30), as in part 1, now with Chromium in the image.

## Decisions for Federico (the plan picks the default in brackets and goes on)

- P1. **The manual upload moves into part 2** so a signed carousel is usable end to end: at its time the publisher moves
  it to `para_subir_a_mano` (its LinkedIn row becomes `para_subir`) without ever calling LinkedIn, and the piece shows
  "Descargar PDF", "Copiar texto" and "Ya lo subí" with the link (today's `marcar_subido_como_coni`). Part 3 then adds
  only the Documents API path in front of it [yes].
- P2. **"Descartar esta pieza" at gate 1, reels and carousels: approved by Federico on 2026-10-27.** It replaces part 1's
  D3 ("no Descartar at gate 1"). It goes through the existing `descartar` action and `descartar` domain event (the
  database already allows `descartado` from `guion_por_aprobar`; no SQL change), with a confirmation `¿Descartar esta
  pieza? No se puede deshacer.` / `Sí, descartar` / `Cancelar` (the destructive button is `Boton variante="destructiva"`,
  `text-error`). Offered at `guion_por_aprobar` (both types) and at a carousel's gate 2; not while a task works on the
  piece: the action now refuses any piece where `piezaTrabajando` is true (`guion_en_proceso` being written,
  `grabando_voz`, a running render, `armando_carrusel`), because a run in flight holds a reservation and may still pay a
  provider. A `guion_en_proceso` that failed (with an explanation) already offers it today and keeps it. Money: a
  discard touches no `gastos` row, so a confirmed voice stays confirmed; nothing is reserved at `guion_por_aprobar`. The
  idea stays `usada` (as every discard today). The nightly retention deletes a discarded piece's voices and videos as
  today. This is how Federico will clear the legacy reel of the retired "bienestar" pillar [yes].
- P3. Font: **Newsreader** (Production Type, SIL Open Font License 1.1), the variable `Newsreader[opsz,wght].ttf` from
  `github.com/google/fonts/ofl/newsreader`, committed as `assets/fuentes/carrusel/Newsreader.ttf` with `OFL.txt`. An
  editorial serif made for long reading, with Spanish glyphs [yes].
- P4. The template's own colours (it is its own design, not the app's: the app's tokens do not apply inside the slides):
  crema `#F4EFE6` paper / `#2B2420` ink / `#6B5F55` quiet / `#9A3F2C` accent; piedra `#E3E0D9` / `#22262B` /
  `#5A5F66` / `#4F5D4A`; oscura `#1E1B19` / `#F2ECE2` / `#B9AFA3` / `#E0A96D` [yes].
- P5. Slide layout: brand line `Constanza del Rosario · <pilar corto>` and the counter `3 / 6` on top of every slide; the
  portada ends with `Desliza para leer`; the closing slide ends with its source line [yes].
- P6. A text change starts the design over in `crema` (part 1's `guardar_carrusel` writes the default); a shortening
  keeps the design [yes; carrying the variant through a text change is a later one-line SQL change].
- P7. "Ya lo subí" and "Descargar PDF" appear only once the carousel is `para_subir_a_mano` (at its time), not while it
  is `programado` [yes].
- P8. Machine `medium-1x` for `armar-carrusel` (Chromium needs the memory), one run at a time [yes].
- P9. Carousel files in R2 are kept (the nightly retention only deletes `videos/` and `voces/`) [yes].
- P10. If an `acortado` version still overflows and she has no text changes left, WAV is told (`aWav`) and fixes it by
  hand [yes; rare with the 90/220/140 limits].
- P11. Copy (es-CL, tú, no long dashes): `Estoy armando las láminas`, `Tarda un par de minutos. Te aviso cuando estén
  para que elijas la fecha.`, `Armando las láminas · te aviso`, `No pude armar el carrusel`, `Reintentar (no se cobra)`,
  `Carrusel de LinkedIn · N láminas`, `Desliza para leerlo completo`, `Lámina N de M`, `Así sale en LinkedIn`, `Ver texto
  completo`, `Ver menos`, `Cuándo sale`, `Pedir cambio`, `¿Qué quieres cambiar?`, `El texto`, `Vuelve a la firma del
  texto y cuenta como uno de tus 3 cambios.`, `El diseño`, `Rehago las láminas con el mismo texto. No cuenta como
  cambio.`, `Colores`, `Crema`, `Piedra`, `Oscura`, `Lámina`, `Dividir en dos`, `Unir con la siguiente`, `Palabra
  destacada`, `Ninguna`, `Ninguna lámina permite este cambio ahora.`, `Escribe el cambio`, `Rehacer el diseño`, `Lámina anterior`, `Lámina siguiente`, `Desliza para programar`, `Programar`, `Sale el <fecha>`, `ver todas las
  láminas`, `Mira las láminas y elige la fecha.`, `Programado para el <fecha>`, `A esa hora te dejo el PDF y el texto
  para que lo subas a LinkedIn.`, `Listo para que lo subas a LinkedIn`, `Descarga el PDF`, `Descargar PDF`, `Copia el
  texto`, `Súbelo en LinkedIn`, `Crea una publicación, toca «Agregar un documento», sube el PDF y pega el texto. Como
  título del documento usa la portada.`, `Enlace de la publicación en LinkedIn (opcional)`, `Ya lo subí a LinkedIn`,
  `Subido a LinkedIn`, `Lo subiste tú a LinkedIn.`, `Tu carrusel «…» está listo para que lo subas a LinkedIn. Entra a la
  app para descargar el PDF y copiar el texto.`, `Este carrusel ya no está esperando que lo subas.`, `No pude preparar
  el PDF para descargarlo. Inténtalo de nuevo en unos minutos.`, `Eso ya está así.`, `Ese cambio de diseño no se puede hacer en esta lámina.`, `No te lo pude dejar para subir`, `Tu carrusel «…» necesita tu firma de nuevo.`, `Tu carrusel «…» está listo para verlo y elegir la fecha.`, `Acorté la lámina N para que quepa. Léela y fírmala de nuevo.`, `La lámina N quedó muy larga. Pide un cambio para acortarla.`, `Quedó firmado, pero las láminas tardan en armarse. Si no avanzan, te aviso.`, `Ese horario ya lo tiene otra
  pieza. Elige otro.`, `Espera a que termine lo que estoy haciendo con esta pieza.`, `¿Descartar esta pieza? No se puede
  deshacer.`, `Sí, descartar`, `Cancelar`, `Descartar esta pieza` [as written].

**Rules (every task):**

- Strict TDD: write the failing test, run it red, write the minimum, run it green, commit. One commit per task (a task
  with two cycles commits twice).
- MSW for every external call; no real network in tests (the Playwright template spec loads nothing from the network:
  the font is a data URL). Local Supabase only (`pnpm db:start`; `colima start` first if Docker is down). Never touch the
  hosted project (`mvfytttfxmzzjajecsch`). Never read or print `.env*` or any secret.
- Never `as any`, `@ts-expect-error`, non-null assertions (`!`) or silent catches.
- Biome safe mode only (`pnpm check`, never `--unsafe`). After `pnpm check`:
  `grep -L '^"use client"' $(grep -rl 'use client' app components)` prints nothing.
- Copy for Coni: Spanish of Chile, `tú`, no em dashes. Before each commit: `git diff --cached | grep -- '—'` prints
  nothing. App UI colours and type only from the tokens of `docs/DESIGN.md` (no hex in `app/` or `components/`). **The
  slide template (`lib/carrusel/plantilla/`) is its own design and defines its own colours and font in its own CSS
  (decision P4); that folder is the only place hex is allowed.** Pillar names only through `lib/datos/pilares.ts`
  (`leerPilares`, then `pilarVisible`).
- Migrations append-only, after `20261026000140` (production is there). Every new function: `set search_path = ''`;
  `security definer` only for the ones Coni's session calls (`cambiar_diseno_de_carrusel`, `pedir_cambio_de_carrusel`),
  which check `public.es_coni()`; the task's (`guardar_armado`, `guardar_acortado`) are invoker functions granted only to
  `service_role`. Audit comes from the existing `auditar` triggers on `piezas` and `carruseles` (`registrar_evento`).
  Regenerate types after each migration: `pnpm db:reset && pnpm db:types`.
- `lib/carrusel/navegador.ts` imports `playwright`; only Trigger.dev code (`lib/produccion/deps-reales.ts`) may import it,
  never a file under `app/` (Next would try to bundle Chromium). Task 13 adds a guard test.
- Commits in English, imperative, blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push, do not deploy. Task 30 is Federico's runbook.

**Commands:** `pnpm type` · `pnpm test:run [tests/unit/<file>]` · `pnpm db:reset && pnpm test:db [tests/integration/<file>]`
· `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell pnpm test:e2e [tests/e2e/<file>]`
(abbreviated `pnpm test:e2e` below; if sign-in fails after a reset: `supabase stop && supabase start`) · `pnpm build` ·
lint on code dirs only: `pnpm exec biome check lib app components trigger scripts tests supabase` · Trigger.dev local
bundle check (no deploy, no login needed for the type side): `pnpm exec tsc --noEmit -p .` covers `trigger/`.

**Known red window:** `pnpm type`, unit and integration are green after every task. E2E runs at the end of Lotes 1, 4
(the template spec), 7 and 8. Two part 1 tests of `tests/e2e/carrusel.spec.ts` ("a signed carousel waits, read only"
and "signing the text leaves the carousel waiting, starts nothing") go red from Task 17 (signing now starts the render)
and Task 24 (the waiting screen becomes "Estoy armando las láminas") until Task 26 rewrites them; that is planned.
Visual baselines change for `guion-por-aprobar` and `carrusel-por-aprobar` (the discard row, Task 3) and
`carrusel-firmado` (renamed `carrusel-armando`, Task 27), plus the new ones of Tasks 3, 12 and 27. Commit `3f8c577` also
changed seven more gate 1 baselines (`guion-con-voz`, `guion-escuchada`, `guion-escuchada-letra-grande`,
`guion-falla-voz`, `guion-sin-escuchar`, `guion-sin-saldo`, `guion-sin-voz`): the discard row shows on every gate 1
script except while it is `preparando`, so those changes are expected.

## Lotes (batches for subagent-driven execution, one reviewer per lote)

| Lote | Tasks | Depends on | Parallel with |
|---|---|---|---|
| 0 Setup | 0 | none | none |
| 1 Descartar at gate 1 | 1, 2, 3 | 0 | 2 |
| 2 Schema | 4, 5, 6 | 0 | 1 |
| 3 Domain | 7, 8, 9, 10 | 2 | none |
| 4 Template and renderer | 11, 12, 13 | 3 (11 needs Task 9) | none |
| 5 The task `armar-carrusel` | 14, 15, 16, 17, 18 | 4 | none |
| 6 Gate 2 actions and the manual upload | 19, 20, 21 | 5 | none |
| 7 Screens | 22, 23, 24, 25 | 6 | none |
| 8 E2E, snapshots and axe | 26, 27 | 7 | none |
| 9 Docs and verification | 28, 29 | 8 | none |
| 10 Deploy runbook | 30 | 9 | none |

Each lote ends with a reviewer checkpoint: `superpowers:code-reviewer` with this plan's amendments, decisions and the
lote's tasks; findings are fixed test-first before the next lote starts. Lotes 1 and 2 touch disjoint files (`lib/acciones/piezas.ts`
`descartar`, `app/(app)/descartar-pieza.tsx`, the two gate 1 screens vs `supabase/migrations/*`); each implementer stages
only its own paths (`git add <paths>`, never `git add -A`) and the controller serializes commits. Task 6 regenerates
`database.types.ts` after both are in.

## File structure

| File | Change | Responsibility | Task |
|---|---|---|---|
| `lib/acciones/piezas.ts` | modify | `descartar` refuses a working piece (1); `firmarCarrusel` starts the render, `reintentar` too (17); `aprobarCarrusel`, `cambiarDisenoDeCarrusel`, gate-2 change, `editarTextoLinkedin` reel only (19); `pedirDescargaDelCarrusel` (21) | 1, 17, 19, 21 |
| `app/(app)/descartar-pieza.tsx` | create | The gate's discard row with its confirmation | 2 |
| `app/(app)/guion/[id]/pantalla-guion.tsx`, `pantalla-carrusel.tsx` | modify | Show `DescartarPieza` | 2 |
| `tests/e2e/descartar.spec.ts` | create | Discard at gate 1, both types | 3 |
| `supabase/migrations/20261027000100_carrusel_armado.sql` | create | `estado_antes_del_error`, `proteger_pieza`, `avisar_pieza_lista` and its trigger, `listo_con_archivos` | 4 |
| `supabase/migrations/20261027000110_carrusel_funciones_armado.sql` | create | `palabras_de_laminas`, `guardar_armado`, `guardar_acortado`, `cambiar_diseno_de_carrusel`, `pedir_cambio_de_carrusel` | 5 |
| `lib/supabase/database.types.ts` | regenerate | New functions | 6 |
| `lib/dominio/estados.ts` | modify | `AprobacionCarrusel`, the new events, `armando_carrusel` retryable, `piezaTrabajando` | 7 |
| `lib/datos/piezas.ts` | modify | `puerta2_carrusel_id` both ways | 7 |
| `lib/dominio/puertas.ts` | modify | `puedeArmar`, `aprobacionVigente` by medium, `Paso` `armar` | 8 |
| `lib/dominio/carrusel.ts` | modify | Export `palabrasDe` | 9 |
| `lib/dominio/diseno-carrusel.ts` | create | Variants, `frasesDe`, `puedeDividir`, `puedeUnir`, `palabrasDestacables`, `aplicarCambioDeDiseno`, `leerDiseno` | 9 |
| `tests/integration/flujo.ts`, `tests/fixtures/carrusel.ts` | modify | Carousels walked to gate 2 and beyond | 10 |
| `assets/fuentes/carrusel/Newsreader.ttf`, `OFL.txt`, `assets/fuentes/README.md` | create, modify | The serif and its license | 11 |
| `lib/carrusel/plantilla/variantes.ts`, `tipografia.ts`, `plantilla.ts` | create | The template: palette, sizes, HTML+CSS | 11 |
| `lib/carrusel/fuente.ts` | create | The font as a data URL | 11 |
| `lib/carrusel/render.ts`, `lib/carrusel/navegador.ts` | create | Measure, screenshot, PDF; the Chromium launcher | 12 |
| `tests/e2e/plantilla-carrusel.spec.ts` + snapshots | create | Real Chromium: PDF pages, PNG references, three variants | 12 |
| `lib/proveedores/almacen.ts` | modify | `claveLaminaDeCarrusel`, `clavePdfDeCarrusel` | 13 |
| `lib/proveedores/anthropic.ts` | modify | `SalidaAcortado`, `acortarLaminas`, task `acortarLaminas` | 14 |
| `lib/datos/carrusel.ts` | modify | `VersionDeCarrusel`, `leerVersionVigente`, `leerVersion`, `marcarVersion`, `marcarArmadoFallido`, `guardarArmado`, `guardarAcortado`, `cambiarDisenoEnLaBase` | 15 |
| `lib/produccion/armar-carrusel.ts` | create | `armarCarrusel` | 16 |
| `lib/produccion/comun.ts` | modify | `ESTIMADO_ACORTAR_CLAUDE_USD` | 16 |
| `lib/acciones/disparos.ts`, `disparos-entorno.ts` | modify | `armar`, `claveArmar` | 17 |
| `lib/mantenimiento/arranques.ts`, `ejecutar.ts`, `lib/datos/repositorio.ts` | modify | The sweep (`aArmar`) | 17 |
| `trigger/armar-carrusel.ts`, `trigger/mantenimiento.ts`, `trigger.config.ts` | create, modify | The task, the sweep's starter, `playwright()` | 18 |
| `lib/produccion/deps-reales.ts`, `lib/produccion/fallas.ts` | modify | `depsArmado`; `onFailure` of the render | 18 |
| `package.json`, `pnpm-lock.yaml` | modify | `playwright@1.59.1` as a dependency | 12 |
| `app/(app)/piezas/acciones.ts` | modify | Four Server Actions | 19, 21 |
| `lib/publicacion/publicar.ts` | modify | `entregarCarrusel` before LinkedIn | 20 |
| `components/deslizar-para-aprobar.tsx`, `lib/diseno/deslizador.ts` | modify | `etiqueta`, `etiquetaCorta` | 22 |
| `app/(app)/fechas-de-puerta-2.ts` | create | The offered dates, shared with the video gate | 23 |
| `app/(app)/guion/[id]/riel-de-laminas.tsx`, `texto-del-post.tsx`, `cambio-de-diseno.tsx`, `puerta-2-carrusel.tsx`, `falta-para-programar.ts` | create | Gate 2 of a carousel | 23 |
| `app/(app)/guion/[id]/carrusel.tsx`, `textos.ts` | modify | Every carousel state | 24 |
| `app/(app)/video/[id]/page.tsx`, `subir-a-mano.tsx` | modify | Redirect a carousel; export `Paso` | 24 |
| `app/(app)/guion/[id]/subir-carrusel.tsx` | create | The manual upload of a carousel | 24 |
| `app/(app)/estado-de-pieza.tsx` | modify | `reintentarCarrusel` | 24 |
| `lib/inicio/modelo.ts`, `lib/calendario/modelo.ts` | modify | Carousel rows | 25 |
| `tests/e2e/carrusel.spec.ts`, `tests/e2e/escena.ts`, `tests/e2e/ayudas.ts` | modify | Full flow | 26 |
| `tests/e2e/visual.spec.ts`, `tests/e2e/accesibilidad.spec.ts`, snapshots | modify | Baselines and axe | 27 |
| `docs/TRASPASO.md`, `docs/PRODUCT.md` | modify | Part 2 entry | 28 |

---

## Lote 0: Setup

### Task 0: Worktree and baseline

**Files:** none.

- [ ] **Step 1: Create the worktree from `main`**

```bash
cd /Users/fede/Projects/estudio-coni
git status --short   # only the untracked .impeccable/ folders; nothing staged
git log --oneline -1 # this plan's commit, after 1683af2
git worktree add .worktrees/carrusel-2 -b feat/carrusel-2 main
cd .worktrees/carrusel-2
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Local database and baseline**

```bash
supabase status || (colima start && pnpm db:start)
pnpm db:reset
pnpm type && pnpm test:run && pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-base-carrusel-2.txt
ls ~/Library/Caches/ms-playwright/ | grep chromium_headless_shell   # the local Chromium the E2E and Task 12 use
```

Expected: all green. Write down the unit and integration counts (Task 29 compares). If the headless shell folder is not
`chromium_headless_shell-1243`, use the one listed in every `PLAYWRIGHT_CHROMIUM_PATH` of this plan.

- [ ] **Step 3: No commit** (nothing changed).

---

## Lote 1: "Descartar esta pieza" at gate 1 (decision P2)

### Task 1: `descartar` refuses a piece a task is working on

**Files:**
- Modify: `lib/acciones/piezas.ts` (`descartar`)
- Modify: `tests/integration/acciones-piezas.test.ts` (`describe("descartar")`)
- Modify: `tests/integration/acciones-carrusel.test.ts`

The domain (`transicionar`, event `descartar`) and the database already allow `descartado` from `guion_por_aprobar`
(the existing test "discards a piece in progress" proves it for a reel). What is missing is the guard against a piece
a run is working on, where a discard would leave a reservation behind.

- [ ] **Step 1: Write the failing tests** in `tests/integration/acciones-piezas.test.ts`, inside `describe("descartar")`:

```ts
  it("discards a reel at gate 1 and leaves its confirmed voice spend as it was", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    await pool.query(
      `insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, real_usd, clave, estado)
       values ($1, 'elevenlabs', 'voz', date_trunc('month', now())::date, 0.2, 0.2, 'voz-de-prueba:' || $1, 'confirmado')`,
      [id],
    )
    const { deps } = armar()

    const resultado = await descartar(deps, id, await versionDe(id))

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "descartado", puerta1_hash: null })
    const { rows } = await pool.query("select estado, real_usd from public.gastos where pieza_id = $1", [id])
    expect(rows).toEqual([{ estado: "confirmado", real_usd: "0.2000" }])
  })

  it("refuses a piece whose voice is being made: the run holds a reservation", async () => {
    const id = await pieza("grabando_voz")
    const { deps } = armar()

    const resultado = await descartar(deps, id, await versionDe(id))

    expect(resultado).toEqual({ ok: false, error: "Espera a que termine lo que estoy haciendo con esta pieza." })
    expect((await fila(id)).estado).toBe("grabando_voz")
  })

  it("refuses a script being written, and still discards one that failed to be written", async () => {
    const escribiendo = await pieza("guion_en_proceso")
    expect((await descartar(armar().deps, escribiendo, await versionDe(escribiendo))).ok).toBe(false)

    const fallida = await pieza("guion_en_proceso")
    await pool.query("update public.piezas set explicacion = 'Claude no respondió.', version = version + 1 where id = $1", [
      fallida,
    ])
    expect((await descartar(armar().deps, fallida, await versionDe(fallida))).ok).toBe(true)
    expect((await fila(fallida)).estado).toBe("descartado")
  })
```

If `pieza(...)` in this file does not accept `"grabando_voz"` or `"guion_en_proceso"`, it is `crearPiezaEn` under the
hood: pass the state through (its type is `Estado`). Check `gastos` column names with `\d public.gastos` in
`psql postgresql://postgres:postgres@127.0.0.1:54422/postgres` and keep the insert to the real columns (the `mes` and
`estado` names above are the ones `reservar_gasto` writes in `20261001000400_gastos.sql`).

In `tests/integration/acciones-carrusel.test.ts` add:

```ts
describe("descartar a carousel", () => {
  it("discards a carousel at gate 1", async () => {
    const id = await sembrarCarrusel("guion_por_aprobar")
    piezasCreadas.push(id)
    const { deps } = armar()

    const resultado = await descartar(deps, id, (await leerFila(id)).version)

    expect(resultado.ok).toBe(true)
    expect(await leerFila(id)).toMatchObject({ estado: "descartado", tipo: "carrusel" })
  })
})
```

(import `descartar` from `@/lib/acciones/piezas`).

- [ ] **Step 2: Run them red**

Run: `pnpm db:reset && pnpm test:db tests/integration/acciones-piezas.test.ts tests/integration/acciones-carrusel.test.ts`
Expected: the two refusals FAIL (today `descartar` discards a piece in `grabando_voz` and one being written); the other
two pass already.

- [ ] **Step 3: The guard** in `lib/acciones/piezas.ts`. Add `piezaTrabajando` to the import from
`@/lib/dominio/estados`, a constant next to the other texts, and replace `descartar`:

```ts
const TEXTO_PIEZA_TRABAJANDO = "Espera a que termine lo que estoy haciendo con esta pieza."

/**
 * Discarding needs no remote cancel (publishing is our own task) and touches no spend: a confirmed voice stays
 * confirmed. A piece a run is working on is refused (decision P2 of the carousels part 2 plan): the run holds a
 * reservation and may still pay a provider after the discard.
 */
export function descartar(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("descartar", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    if (piezaTrabajando(fila)) throw new Falla(TEXTO_PIEZA_TRABAJANDO)
    await guardarEvento(deps.db, fila, { tipo: "descartar" })
    return {}
  })
}
```

- [ ] **Step 4: Run them green**, then the whole action suites

Run: `pnpm test:db tests/integration/acciones-piezas.test.ts tests/integration/acciones-carrusel.test.ts && pnpm type`
Expected: PASS. ("discards a piece whose recording failed" still passes: `error_produccion` is not working.)

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/piezas.ts tests/integration/acciones-piezas.test.ts tests/integration/acciones-carrusel.test.ts
git commit -m "Refuse to discard a piece a task is working on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The discard row at gate 1 (reel and carousel)

**Files:**
- Create: `app/(app)/descartar-pieza.tsx`
- Create: `tests/unit/descartar-pieza.test.tsx`
- Modify: `app/(app)/guion/[id]/pantalla-guion.tsx`, `app/(app)/guion/[id]/pantalla-carrusel.tsx`

- [ ] **Step 1: Write the failing test** `tests/unit/descartar-pieza.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { descartarAccion } = vi.hoisted(() => ({
  descartarAccion: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
}))
vi.mock("@/app/(app)/piezas/acciones", () => ({ descartarAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { DescartarPieza, PREGUNTA_DESCARTAR_EN_LA_PUERTA } from "@/app/(app)/descartar-pieza"

beforeEach(() => vi.clearAllMocks())

describe("DescartarPieza", () => {
  it("asks first, with the destructive confirm in the error colour, and discards on yes", async () => {
    render(<DescartarPieza piezaId="p" version={4} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    expect(screen.getByText(PREGUNTA_DESCARTAR_EN_LA_PUERTA)).toBeInTheDocument()
    expect(descartarAccion).not.toHaveBeenCalled()
    const si = screen.getByRole("button", { name: "Sí, descartar" })
    expect(si).toHaveClass("text-error")
    fireEvent.click(si)
    await waitFor(() => expect(descartarAccion).toHaveBeenCalledWith("p", 4))
  })

  it("Cancelar closes the question without discarding", () => {
    render(<DescartarPieza piezaId="p" version={4} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(descartarAccion).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Descartar esta pieza" })).toBeInTheDocument()
  })

  it("says a refusal inside the question", async () => {
    descartarAccion.mockResolvedValueOnce({ ok: false, error: "Espera a que termine lo que estoy haciendo con esta pieza." })
    render(<DescartarPieza piezaId="p" version={4} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, descartar" }))
    expect(await screen.findByText("Espera a que termine lo que estoy haciendo con esta pieza.")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/descartar-pieza.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: The component** `app/(app)/descartar-pieza.tsx`

```tsx
"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { useAccion } from "@/components/use-accion"
import { descartarAccion } from "./piezas/acciones"

export const PREGUNTA_DESCARTAR_EN_LA_PUERTA = "¿Descartar esta pieza? No se puede deshacer."

/**
 * "Descartar esta pieza" on a gate (decision P2, approved by Federico on 2026-10-27): a quiet row that asks first, with
 * the raised destructive confirm (`Boton variante="destructiva"`, the error colour of DESIGN.md).
 */
export function DescartarPieza({ piezaId, version }: { piezaId: string; version: number }) {
  const [preguntando, setPreguntando] = useState(false)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  return preguntando ? (
    <ConfirmacionEnLinea
      trato="destructivo"
      pregunta={PREGUNTA_DESCARTAR_EN_LA_PUERTA}
      confirmar="Sí, descartar"
      volver="Cancelar"
      cargando={pendiente}
      error={error}
      alConfirmar={() => ejecutar(() => descartarAccion(piezaId, version))}
      alVolver={() => {
        limpiarError()
        setPreguntando(false)
      }}
    />
  ) : (
    <Boton variante="callado" onClick={() => setPreguntando(true)}>
      Descartar esta pieza
    </Boton>
  )
}
```

- [ ] **Step 4: Run it green**

Run: `pnpm test:run tests/unit/descartar-pieza.test.tsx`
Expected: PASS.

- [ ] **Step 5: Place it on both gates.** In `pantalla-guion.tsx`, import `DescartarPieza` from `../../descartar-pieza` and
put it right before `{aviso ? <Aviso ...`:

```tsx
      <div className="mt-8">
        <DescartarPieza piezaId={datos.id} version={version} />
      </div>
```

Do not render it while `preparando` (her voice is being made): wrap it as `{preparando ? null : (...)}`. The server
refuses that case too (Task 1).

In `pantalla-carrusel.tsx`, after the closing `</Seccion>` of the post and before `<BarraDeFirma`:

```tsx
      <div className="mt-8">
        <DescartarPieza piezaId={datos.id} version={datos.version} />
      </div>
```

The two screen tests that render these screens (`tests/unit/pantalla-guion*.test.tsx`, `tests/unit/pantalla-carrusel*.test.tsx`
if present) mock `@/app/(app)/piezas/acciones`: add `descartarAccion: vi.fn()` to their mock objects so the import
resolves.

- [ ] **Step 6: Run the unit suite and types**

Run: `pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/descartar-pieza.tsx" "app/(app)/guion/[id]/pantalla-guion.tsx" "app/(app)/guion/[id]/pantalla-carrusel.tsx" tests/unit
git commit -m "Offer Descartar esta pieza at gate 1, with a confirmation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: E2E, baseline and axe for the gate 1 discard

**Files:**
- Create: `tests/e2e/descartar.spec.ts`
- Modify: `tests/e2e/visual.spec.ts`, `tests/e2e/accesibilidad.spec.ts`, snapshots

- [ ] **Step 1: Write the E2E** `tests/e2e/descartar.spec.ts`

```ts
import { expect, test } from "@playwright/test"
import { leerFila, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, limpiarDisparos } from "./ayudas"
import { PIEZAS, sembrarCarruselDeEscena, sembrarPiezaDeEscena } from "./escena"

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  limpiarDisparos()
  await configurarServicios()
})

test("a reel at gate 1 is discarded after the question, and leaves Inicio", async ({ page }) => {
  const id = await sembrarPiezaDeEscena(PIEZAS.guion, "guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await expect(page.getByText("¿Descartar esta pieza? No se puede deshacer.")).toBeVisible()
  await page.getByRole("button", { name: "Sí, descartar" }).click()

  await expect.poll(async () => (await leerFila(id)).estado).toBe("descartado")
  await page.goto("/")
  await expect(page.getByText(PIEZAS.guion.titulo)).toHaveCount(0)
})

test("a carousel at gate 1 can be discarded, and Cancelar keeps it", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await page.getByRole("button", { name: "Cancelar" }).click()
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await page.getByRole("button", { name: "Sí, descartar" }).click()
  await expect.poll(async () => (await leerFila(id)).estado).toBe("descartado")
})
```

`sembrarPiezaDeEscena(PIEZAS.guion, "guion_por_aprobar")`: use the signature `tests/e2e/escena.ts:206` has (open it;
pass the scene piece that the "guion por aprobar" baseline uses, and its `titulo`).

- [ ] **Step 2: Run it** (green at once: Tasks 1 and 2 built the behaviour; a red here is a real bug to fix test-first)

Run: `pnpm test:e2e tests/e2e/descartar.spec.ts`
Expected: PASS.

- [ ] **Step 3: Baseline of the open question** in `tests/e2e/visual.spec.ts`, next to "guion por aprobar":

```ts
test("guion descartar", async ({ page }) => {
  await sembrarEscena()
  const id = await sembrarPiezaDeEscena(PIEZAS.guion, "guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await capturaDe(page, "guion-descartar")
})
```

In `tests/e2e/accesibilidad.spec.ts`, inside the test at line 255 ("the states the Soft UI kit adds..."), after the
existing discard check, add the gate 1 question the same way (open it on `/guion/<a gate 1 reel>` and run `auditar`).

- [ ] **Step 4: Regenerate exactly the changed baselines**

```bash
pnpm test:e2e tests/e2e/visual.spec.ts -g "guion por aprobar|carrusel por aprobar|guion descartar" --update-snapshots
pnpm test:e2e tests/e2e/visual.spec.ts tests/e2e/accesibilidad.spec.ts
git status --short tests/e2e/visual.spec.ts-snapshots
```

Expected: three PNGs changed or added (`guion-por-aprobar`, `carrusel-por-aprobar`, `guion-descartar`); open each and
check the row sits under the last section, quiet, and the open question is the honda block. Everything green.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/descartar.spec.ts tests/e2e/visual.spec.ts tests/e2e/accesibilidad.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "Cover the gate 1 discard end to end, with its baseline and axe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 1 checkpoint:** reviewer on Tasks 1 to 3 against decision P2.

---

## Lote 2: Schema

### Task 4: Ways into rendering, gate 2 bound, notices (`20261027000100_carrusel_armado.sql`)

**Files:**
- Create: `supabase/migrations/20261027000100_carrusel_armado.sql`
- Create: `tests/integration/carrusel-armado-esquema.test.ts`

- [ ] **Step 1: Write the failing test** `tests/integration/carrusel-armado-esquema.test.ts`

```ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, comoConi, comoServicio, fallaCon, pool } from "./db"
import { crearCarruselEn } from "./flujo"

afterAll(() => pool.end())

/** Every case runs in its own transaction and is rolled back: nothing stays in the database. */
async function enTransaccion(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await fn(c)
  } finally {
    await c.query("rollback")
    c.release()
  }
}

async function versionVigente(c: pg.PoolClient, id: string) {
  const { rows } = await c.query("select * from public.carruseles where pieza_id = $1 order by version desc limit 1", [id])
  return rows[0]
}

/** What `guardar_armado` will do in Task 5, written here by hand as the service. */
async function armadoAMano(c: pg.PoolClient, id: string) {
  await asumir(c, comoServicio)
  const v = await versionVigente(c, id)
  const claves = v.laminas.map((_: unknown, i: number) => `carruseles/${id}/${v.id}/lamina-0${i + 1}.png`)
  await c.query("update public.carruseles set estado = 'listo', pdf_clave = $2, png_claves = $3 where id = $1", [
    v.id,
    `carruseles/${id}/${v.id}/carrusel.pdf`,
    claves,
  ])
  await c.query("update public.piezas set estado = 'carrusel_por_aprobar', version = version + 1 where id = $1", [id])
  return v
}

describe("20261027000100: rendering, retry and gate 2 of a carousel", () => {
  it("lets a failed render wait in error_produccion and Coni retry it into armando_carrusel", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      await c.query(
        `update public.piezas set estado = 'error_produccion', estado_antes_del_error = 'armando_carrusel',
         explicacion = 'No pude armar el carrusel.', version = version + 1 where id = $1`,
        [id],
      )
      await asumir(c, comoConi)
      await c.query(
        `update public.piezas set estado = 'armando_carrusel', estado_antes_del_error = null, explicacion = null,
         intento = intento + 1, version = version + 1 where id = $1`,
        [id],
      )
      const { rows } = await c.query("select estado from public.piezas where id = $1", [id])
      expect(rows[0].estado).toBe("armando_carrusel")
    })
  })

  it("refuses a session moving gate 2 back to armando_carrusel: design changes go through the function", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armadoAMano(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'armando_carrusel', version = version + 1 where id = $1",
        [id],
      )
      expect(error.message).toBe("diseno_por_funcion")
    })
  })

  it("refuses a session moving gate 2 back to be rewritten: text changes go through the function", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armadoAMano(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'guion_en_proceso', version = version + 1 where id = $1",
        [id],
      )
      expect(error.message).toBe("cambio_por_funcion")
    })
  })

  it("signs gate 2 only on the latest rendered version, with gate 1's words", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const v = await armadoAMano(c, id)
      await asumir(c, comoConi)
      const firmar = (carruselId: string, hash: string) =>
        fallaCon(
          c,
          `update public.piezas set estado = 'programado', puerta2_carrusel_id = $2, puerta2_hash_texto = $3,
           puerta2_publicar_en = now() + interval '1 day', puerta2_en = now(), version = version + 1 where id = $1`,
          [id, carruselId, hash],
        )
      expect((await firmar(v.id, "f".repeat(64))).message).toBe("carrusel_no_coincide")

      await c.query(
        `update public.piezas set estado = 'programado', puerta2_carrusel_id = $2, puerta2_hash_texto = $3,
         puerta2_publicar_en = now() + interval '1 day', puerta2_en = now(), version = version + 1 where id = $1`,
        [id, v.id, v.hash_texto],
      )
      const { rows } = await c.query(
        "select estado, puerta2_carrusel_id, puerta2_video_id, puerta2_formula from public.piezas where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({ estado: "programado", puerta2_carrusel_id: v.id, puerta2_video_id: null, puerta2_formula: null })
      const publicaciones = await c.query("select destino, estado from public.publicaciones where pieza_id = $1", [id])
      expect(publicaciones.rows).toEqual([{ destino: "linkedin", estado: "esperando" }])
    })
  })

  it("refuses a version marked listo without its files", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await versionVigente(c, id)
      const error = await fallaCon(c, "update public.carruseles set estado = 'listo' where id = $1", [v.id])
      expect(error.message).toContain("listo_con_archivos")
    })
  })

  it("tells Coni when the slides are ready and when a carousel needs her signature again", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel", { titulo: "Lo que un chatbot no ve de ti" })
      await armadoAMano(c, id)
      const listo = await c.query("select tipo, mensaje from public.avisos where pieza_id = $1", [id])
      expect(listo.rows).toContainEqual({
        tipo: "video_listo",
        mensaje: "Tu carrusel «Lo que un chatbot no ve de ti» está listo para verlo y elegir la fecha.",
      })

      const otro = await crearCarruselEn(c, "armando_carrusel", { titulo: "Otro carrusel" })
      await asumir(c, comoServicio)
      await c.query(
        `update public.piezas set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null,
         version = version + 1 where id = $1`,
        [otro],
      )
      const vuelta = await c.query("select mensaje from public.avisos where pieza_id = $1", [otro])
      expect(vuelta.rows.map((r) => r.mensaje)).toContain("Tu carrusel «Otro carrusel» necesita tu firma de nuevo.")
    })
  })

  it("names armando_carrusel among the steps an error can come from", async () => {
    const { rows } = await pool.query(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'piezas_estado_antes_del_error_check'",
    )
    expect(rows[0].def).toContain("armando_carrusel")
  })
})
```

`crearCarruselEn(c, "armando_carrusel", ...)` exists since part 1 (`tests/integration/flujo.ts:214`). Check `fallaCon`'s
error shape in `tests/integration/db.ts:44` (`pg.DatabaseError`, `.message` is the `message` of the raise).

- [ ] **Step 2: Run it red**

Run: `pnpm db:reset && pnpm test:db tests/integration/carrusel-armado-esquema.test.ts`
Expected: FAIL (`piezas_estado_antes_del_error_check` refuses `armando_carrusel`; `firma_fuera_de_puerta1`; no
`listo_con_archivos`; no notice on `carrusel_por_aprobar`).

- [ ] **Step 3: The migration** `supabase/migrations/20261027000100_carrusel_armado.sql`

```sql
-- LinkedIn carousels, part 2 (design 2026-10-26, D4, D5; plan 2026-10-27, amendments 1, 2 and 10): the ways into
-- rendering, the binding of a carousel's gate 2, and the notices of its slides.

-- A carousel whose render failed waits in error_produccion and Reintentar takes it back to armando_carrusel.
alter table public.piezas drop constraint piezas_estado_antes_del_error_check;
alter table public.piezas add constraint piezas_estado_antes_del_error_check
  check (estado_antes_del_error in ('en_render', 'subtitulando', 'programado', 'armando_carrusel'));

-- A rendered version has every file gate 2 shows and the upload needs.
alter table public.carruseles add constraint listo_con_archivos check (
  estado <> 'listo' or (pdf_clave is not null and cardinality(png_claves) = jsonb_array_length(laminas))
);

-- proteger_pieza as of 20261026000140, plus: a carousel enters armando_carrusel from its signature, a design change
-- (only through cambiar_diseno_de_carrusel) or Reintentar; gate 2 goes back to be rewritten only through
-- pedir_cambio_de_carrusel; a carousel's gate 2 signs the latest rendered version with gate 1's words.
create or replace function public.proteger_pieza()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  aprueba_puerta1 boolean;
  aprueba_puerta2 boolean;
begin
  if tg_op = 'INSERT' then
    if new.version <> 0 or new.puerta1_hash is not null or new.puerta2_hash_texto is not null
       or new.avatar_id is not null or new.puerta1_formula is not null or new.pedido_de_cambio is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  if new.tipo is distinct from old.tipo then
    raise exception using errcode = '42501', message = 'tipo_inmutable';
  end if;

  if old.puerta2_hash_texto is not null and new.puerta2_hash_texto is not null
     and (new.texto_linkedin is distinct from old.texto_linkedin or new.destinos is distinct from old.destinos) then
    raise exception using errcode = '42501', message = 'artefacto_aprobado';
  end if;

  aprueba_puerta1 := new.puerta1_hash is not null and new.puerta1_hash is distinct from old.puerta1_hash;
  aprueba_puerta2 := new.puerta2_hash_texto is not null and (
    new.puerta2_hash_texto is distinct from old.puerta2_hash_texto
    or new.puerta2_video_id is distinct from old.puerta2_video_id
    or new.puerta2_carrusel_id is distinct from old.puerta2_carrusel_id
    or new.puerta2_publicar_en is distinct from old.puerta2_publicar_en
  );
  if (aprueba_puerta1 or aprueba_puerta2) and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_aprueba';
  end if;
  if new.estado in ('grabando_voz', 'en_render', 'armando_carrusel', 'programado', 'publicado_a_mano')
     and new.estado is distinct from old.estado and not public.es_coni() then
    -- The publish task may close a mixed piece (one destination by hand, the last one automatic: L7) only when
    -- nothing is left to upload.
    if not (new.estado = 'publicado_a_mano' and old.estado = 'programado'
            and not exists (select 1 from public.publicaciones
                             where pieza_id = new.id and estado in ('esperando', 'para_subir'))) then
      raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
    end if;
  end if;

  -- Her change request counts against three (pedir_cambio_de_carrusel): a session must not get around it, at gate 1
  -- or at gate 2 ("El texto").
  if new.tipo = 'carrusel' and old.estado in ('guion_por_aprobar', 'carrusel_por_aprobar')
     and new.estado = 'guion_en_proceso' and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'cambio_por_funcion';
  end if;
  if new.pedido_de_cambio is distinct from old.pedido_de_cambio and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'pedido_solo_por_funcion';
  end if;
  if new.cambios_de_texto is distinct from old.cambios_de_texto and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'cambios_solo_por_funcion';
  end if;

  if new.avatar_id is distinct from old.avatar_id then
    if not public.es_coni() then
      raise exception using errcode = '42501', message = 'solo_coni_elige_avatar';
    end if;
    if old.estado <> 'guion_por_aprobar' then
      raise exception using errcode = '42501', message = 'avatar_fuera_del_guion';
    end if;
  end if;
  if new.puerta1_formula is distinct from old.puerta1_formula and not aprueba_puerta1 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.puerta2_formula is distinct from old.puerta2_formula
     and new.puerta2_hash_texto is not null and not aprueba_puerta2 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.respaldo is distinct from old.respaldo and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'respaldo_solo_de_tareas';
  end if;
  if aprueba_puerta1 and new.tipo = 'reel' and new.avatar_id is null then
    raise exception using errcode = '42501', message = 'falta_avatar';
  end if;
  -- A carousel enters armando_carrusel from its gate 1 signature (exigir_revision_limpia checks the review on leaving
  -- guion_por_aprobar), from a design change at gate 2 (only through cambiar_diseno_de_carrusel, which keeps the words)
  -- or from Reintentar after a failed render.
  if new.tipo = 'carrusel' and new.estado = 'armando_carrusel' and new.estado is distinct from old.estado then
    if old.estado not in ('guion_por_aprobar', 'carrusel_por_aprobar', 'error_produccion') then
      raise exception using errcode = '42501', message = 'firma_fuera_de_puerta1';
    end if;
    if old.estado = 'carrusel_por_aprobar' and current_user in ('authenticated', 'anon') then
      raise exception using errcode = '42501', message = 'diseno_por_funcion';
    end if;
  end if;
  -- What she signs is the latest version she read (amendment 4 of part 1): a version written meanwhile is not signed blind.
  if aprueba_puerta1 and new.tipo = 'carrusel' and new.puerta1_hash is distinct from (
    select c.hash_texto from public.carruseles c where c.pieza_id = new.id order by c.version desc limit 1
  ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;
  if new.tipo = 'carrusel' and new.estado is distinct from old.estado
     and new.estado in ('armando_carrusel', 'carrusel_por_aprobar', 'programado', 'para_subir_a_mano', 'publicado',
                        'publicado_a_mano', 'error_publicacion')
     and new.puerta1_hash is distinct from (
       select c.hash_texto from public.carruseles c where c.pieza_id = new.id order by c.version desc limit 1
     ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;
  -- Gate 2 of a carousel (plan amendment 2): from carrusel_por_aprobar, on the latest version, rendered, with the words
  -- gate 1 signed.
  if aprueba_puerta2 and new.tipo = 'carrusel' and (
    old.estado <> 'carrusel_por_aprobar'
    or not exists (
      select 1 from public.carruseles c
       where c.id = new.puerta2_carrusel_id and c.pieza_id = new.id and c.estado = 'listo'
         and c.hash_texto = new.puerta2_hash_texto and c.hash_texto = new.puerta1_hash
         and c.version = (select max(v.version) from public.carruseles v where v.pieza_id = new.id)
    )
  ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;

  if aprueba_puerta1 then
    new.puerta1_por := auth.uid();
  elsif new.puerta1_hash is null then
    new.puerta1_por := null;
  else
    new.puerta1_por := old.puerta1_por;
  end if;
  if aprueba_puerta2 then
    new.puerta2_por := auth.uid();
  elsif new.puerta2_hash_texto is null then
    new.puerta2_por := null;
  else
    new.puerta2_por := old.puerta2_por;
  end if;
  -- The formula describes an approval: without one there is nothing for it to describe.
  if new.puerta2_hash_texto is null then
    new.puerta2_formula := null;
  end if;

  new.actualizada_en := now();
  return new;
end $function$;

-- avisar_pieza_lista as of 20261026000120, plus: a carousel's slides are ready (carrusel_por_aprobar), and a carousel
-- back at gate 1 from its render (shortened, or too long) asks for her signature again.
create or replace function public.avisar_pieza_lista() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tipo_aviso text;
  texto text;
begin
  if new.estado = 'guion_por_aprobar' then
    if old.estado = 'grabando_voz' or public.es_coni() then
      return null;
    end if;
    tipo_aviso := 'guion_listo';
    texto := case
      when new.tipo = 'carrusel' and old.estado = 'armando_carrusel'
        then 'Tu carrusel «' || left(new.titulo, 120) || '» necesita tu firma de nuevo.'
      when new.tipo = 'carrusel'
        then 'Tu carrusel «' || left(new.titulo, 120) || '» está listo para revisar.'
      else 'Tu guion «' || left(new.titulo, 120) || '» está listo para revisar.'
    end;
  elsif new.estado = 'carrusel_por_aprobar' then
    tipo_aviso := 'video_listo';
    texto := 'Tu carrusel «' || left(new.titulo, 120) || '» está listo para verlo y elegir la fecha.';
  else
    tipo_aviso := 'video_listo';
    texto := 'Tu video «' || left(new.titulo, 120) || '» está listo para verlo y aprobarlo.';
  end if;
  -- `version` goes up on every write, so a state is noted once per time the piece enters it.
  insert into public.avisos (tipo, pieza_id, clave, mensaje)
  values (tipo_aviso, new.id, tipo_aviso || ':' || new.id || ':' || new.version, texto)
  on conflict (clave) do nothing;
  return null;
end $$;

drop trigger avisar_pieza_lista on public.piezas;
create trigger avisar_pieza_lista after update of estado on public.piezas
  for each row
  when (new.estado in ('guion_por_aprobar', 'video_por_aprobar', 'carrusel_por_aprobar')
        and new.estado is distinct from old.estado)
  execute function public.avisar_pieza_lista();
```

Before writing it, diff the copied `proteger_pieza` body against `20261026000140` (`diff <(sed -n '/create or replace function public.proteger_pieza/,/\$function\$;/p' supabase/migrations/20261026000140_carrusel_fechas_y_firma.sql) <(sed -n '/create or replace function public.proteger_pieza/,/\$function\$;/p' supabase/migrations/20261027000100_carrusel_armado.sql)`):
only the three commented blocks differ.

- [ ] **Step 4: Run it green, and the part 1 schema suites**

Run: `pnpm db:reset && pnpm test:db tests/integration/carrusel-armado-esquema.test.ts tests/integration/carrusel-funciones.test.ts tests/integration/carrusel-esquema.test.ts tests/integration/avisos-automaticos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261027000100_carrusel_armado.sql tests/integration/carrusel-armado-esquema.test.ts
git commit -m "Open the ways into a carousel's render and bind its gate 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The render's and gate 2's functions (`20261027000110_carrusel_funciones_armado.sql`)

**Files:**
- Create: `supabase/migrations/20261027000110_carrusel_funciones_armado.sql`
- Create: `tests/integration/carrusel-armado-funciones.test.ts`

- [ ] **Step 1: Write the failing test** `tests/integration/carrusel-armado-funciones.test.ts`

```ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { asumir, comoConi, comoServicio, fallaCon, pool } from "./db"
import { crearCarruselEn } from "./flujo"

afterAll(() => pool.end())

async function enTransaccion(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await fn(c)
  } finally {
    await c.query("rollback")
    c.release()
  }
}

async function vigente(c: pg.PoolClient, id: string) {
  const { rows } = await c.query("select * from public.carruseles where pieza_id = $1 order by version desc limit 1", [id])
  return rows[0]
}

async function versionDe(c: pg.PoolClient, id: string): Promise<number> {
  const { rows } = await c.query("select version from public.piezas where id = $1", [id])
  return rows[0].version
}

async function armar(c: pg.PoolClient, id: string) {
  await asumir(c, comoServicio)
  const v = await vigente(c, id)
  const pngs = v.laminas.map((_: unknown, i: number) => `carruseles/${id}/${v.id}/lamina-0${i + 1}.png`)
  await c.query("select public.guardar_armado($1, $2, $3, $4)", [
    v.id,
    await versionDe(c, id),
    `carruseles/${id}/${v.id}/carrusel.pdf`,
    pngs,
  ])
  return v
}

describe("palabras_de_laminas", () => {
  it("is the same for the same words on other slides", async () => {
    const dividida = [
      LAMINAS_DE_PRUEBA[0],
      { tipo: "idea", texto: "Un chatbot te responde a cualquier hora." },
      { tipo: "idea", texto: "Eso ayuda, pero no te conoce." },
      ...LAMINAS_DE_PRUEBA.slice(2),
    ]
    const { rows } = await pool.query(
      "select public.palabras_de_laminas($1::jsonb) = public.palabras_de_laminas($2::jsonb) as igual",
      [JSON.stringify(LAMINAS_DE_PRUEBA), JSON.stringify(dividida)],
    )
    expect(rows[0].igual).toBe(true)
  })
})

describe("guardar_armado", () => {
  it("marks the latest version listo with its files and puts the piece at gate 2", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const v = await armar(c, id)
      const { rows } = await c.query(
        "select p.estado, c.estado as version, c.pdf_clave, cardinality(c.png_claves) as pngs from public.piezas p join public.carruseles c on c.pieza_id = p.id where p.id = $1",
        [id],
      )
      expect(rows[0]).toEqual({
        estado: "carrusel_por_aprobar",
        version: "listo",
        pdf_clave: `carruseles/${id}/${v.id}/carrusel.pdf`,
        pngs: LAMINAS_DE_PRUEBA.length,
      })
    })
  })

  it("refuses incomplete files, a stale piece version and Coni's session", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await vigente(c, id)
      const version = await versionDe(c, id)
      const corta = await fallaCon(c, "select public.guardar_armado($1, $2, 'x.pdf', array['a.png'])", [v.id, version])
      expect(corta.message).toBe("armado_incompleto")
      const vieja = await fallaCon(c, "select public.guardar_armado($1, $2, 'x.pdf', array['a.png'])", [v.id, version - 1])
      expect(vieja.message).toBe("version_desfasada")
      await asumir(c, comoConi)
      const coni = await fallaCon(c, "select public.guardar_armado($1, $2, 'x.pdf', array['a.png'])", [v.id, version])
      expect(coni.code).toBe("42501")
    })
  })
})

describe("guardar_acortado", () => {
  it("writes the shortened text as a new version, back to gate 1, and confirms the spend", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await vigente(c, id)
      await c.query(
        `insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, clave)
         values ($1, 'anthropic', 'carrusel', date_trunc('month', now())::date, 0.2, 'acortar-prueba')`,
        [id],
      )
      const laminas = LAMINAS_DE_PRUEBA.map((l, i) => (i === 1 ? { ...l, texto: "Un chatbot responde. No te conoce." } : l))
      const hash = hashTextoDeCarrusel({ laminas, textoPost: TEXTO_POST_DE_PRUEBA })
      await c.query("select public.guardar_acortado($1, $2, $3::jsonb, $4, '[]'::jsonb, $5, 'acortar-prueba', 0.05)", [
        v.id,
        await versionDe(c, id),
        JSON.stringify(laminas),
        hash,
        "Acorté la lámina 2 para que quepa. Léela y fírmala de nuevo.",
      ])
      const nueva = await vigente(c, id)
      expect(nueva).toMatchObject({ origen: "acortado", hash_texto: hash, texto_post: TEXTO_POST_DE_PRUEBA, estado: "escrito" })
      const pieza = (await c.query("select estado, puerta1_hash, explicacion from public.piezas where id = $1", [id])).rows[0]
      expect(pieza).toEqual({
        estado: "guion_por_aprobar",
        puerta1_hash: null,
        explicacion: "Acorté la lámina 2 para que quepa. Léela y fírmala de nuevo.",
      })
      const gasto = (await c.query("select estado from public.gastos where clave = 'acortar-prueba'")).rows[0]
      expect(gasto.estado).toBe("confirmado")
    })
  })
})

describe("cambiar_diseno_de_carrusel", () => {
  const diseno = { variante: "oscura" }

  it("writes a new version with the same words and post and sends the piece to be rendered", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const v = await armar(c, id)
      await asumir(c, comoConi)
      await c.query("select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, $4::jsonb)", [
        id,
        await versionDe(c, id),
        JSON.stringify(LAMINAS_DE_PRUEBA),
        JSON.stringify(diseno),
      ])
      const nueva = await vigente(c, id)
      expect(nueva).toMatchObject({ origen: "cambio_diseno", hash_texto: v.hash_texto, diseno, estado: "escrito" })
      const pieza = (await c.query("select estado, cambios_de_texto from public.piezas where id = $1", [id])).rows[0]
      expect(pieza).toEqual({ estado: "armando_carrusel", cambios_de_texto: 0 })
    })
  })

  it("refuses other words, a changed portada, an unknown variant and no change at all", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armar(c, id)
      await asumir(c, comoConi)
      const version = await versionDe(c, id)
      const intentar = (laminas: unknown, d: unknown) =>
        fallaCon(c, "select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, $4::jsonb)", [
          id,
          version,
          JSON.stringify(laminas),
          JSON.stringify(d),
        ])
      const otras = LAMINAS_DE_PRUEBA.map((l, i) => (i === 2 ? { ...l, texto: `${l.texto} Y algo más.` } : l))
      expect((await intentar(otras, diseno)).message).toBe("diseno_invalido")
      expect((await intentar(LAMINAS_DE_PRUEBA, { variante: "neon" })).message).toBe("diseno_invalido")
      expect((await intentar(LAMINAS_DE_PRUEBA, { variante: "crema" })).message).toBe("diseno_sin_cambio")
    })
  })
})

describe("pedir_cambio_de_carrusel at gate 2", () => {
  it("takes the signature back and counts the change", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armar(c, id)
      await asumir(c, comoConi)
      await c.query("select public.pedir_cambio_de_carrusel($1, $2, 'Más corto')", [id, await versionDe(c, id)])
      const pieza = (
        await c.query("select estado, puerta1_hash, cambios_de_texto, pedido_de_cambio from public.piezas where id = $1", [id])
      ).rows[0]
      expect(pieza).toEqual({ estado: "guion_en_proceso", puerta1_hash: null, cambios_de_texto: 1, pedido_de_cambio: "Más corto" })
    })
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm db:reset && pnpm test:db tests/integration/carrusel-armado-funciones.test.ts`
Expected: FAIL (`function public.palabras_de_laminas(jsonb) does not exist`).

- [ ] **Step 3: The migration** `supabase/migrations/20261027000110_carrusel_funciones_armado.sql`

```sql
-- The render's results and gate 2's changes of a carousel (design 2026-10-26, D4, D5; plan amendments 3, 5, 6).

-- The words of a carousel's slides in order, whatever slides they sit on (as palabrasDelCarrusel in
-- lib/dominio/carrusel.ts): a design change must keep them exactly, so gate 1 stands.
create function public.palabras_de_laminas(p_laminas jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(p.palabra, ' ' order by l.orden, p.orden), '')
    from jsonb_array_elements(p_laminas) with ordinality as l(lamina, orden),
         regexp_split_to_table(
           normalize(coalesce(l.lamina ->> 'texto', '') || ' ' || coalesce(l.lamina ->> 'fuente', ''), nfc),
           '\s+'
         ) with ordinality as p(palabra, orden)
   where p.palabra <> ''
$$;

-- The render's result (D4): the latest version's PNGs and PDF, and the piece at gate 2, in one transaction.
create function public.guardar_armado(p_carrusel uuid, p_version integer, p_pdf text, p_pngs text[])
returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_carrusel public.carruseles;
  v_pieza public.piezas;
begin
  select * into v_carrusel from public.carruseles where id = p_carrusel for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'carrusel_inexistente';
  end if;
  select * into v_pieza from public.piezas where id = v_carrusel.pieza_id for update;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado <> 'armando_carrusel'
     or v_carrusel.version <> (select max(version) from public.carruseles where pieza_id = v_pieza.id)
     or v_carrusel.hash_texto is distinct from v_pieza.puerta1_hash then
    raise exception using errcode = 'P0001', message = 'armado_fuera_de_turno';
  end if;
  if p_pdf is null or btrim(p_pdf) = '' or p_pngs is null or array_position(p_pngs, null) is not null
     or cardinality(p_pngs) <> jsonb_array_length(v_carrusel.laminas) then
    raise exception using errcode = '22023', message = 'armado_incompleto';
  end if;

  update public.carruseles set estado = 'listo', pdf_clave = p_pdf, png_claves = p_pngs where id = p_carrusel;
  update public.piezas set estado = 'carrusel_por_aprobar', explicacion = null, version = version + 1
   where id = v_pieza.id
  returning * into v_pieza;
  return v_pieza;
end $$;

revoke execute on function public.guardar_armado(uuid, integer, text, text[]) from public, anon, authenticated;
grant execute on function public.guardar_armado(uuid, integer, text, text[]) to service_role;

-- The one automatic shortening (amendment 3): a new text (new hash_texto, same post and design), the piece back at
-- gate 1 with why, and the Claude spend that paid for it, in one transaction. Never twice in a row.
create function public.guardar_acortado(
  p_carrusel uuid,
  p_version integer,
  p_laminas jsonb,
  p_hash_texto text,
  p_revision jsonb,
  p_explicacion text,
  p_clave text,
  p_real numeric
) returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_carrusel public.carruseles;
  v_pieza public.piezas;
begin
  select * into v_carrusel from public.carruseles where id = p_carrusel for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'carrusel_inexistente';
  end if;
  select * into v_pieza from public.piezas where id = v_carrusel.pieza_id for update;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado <> 'armando_carrusel' or v_carrusel.origen = 'acortado'
     or v_carrusel.version <> (select max(version) from public.carruseles where pieza_id = v_pieza.id) then
    raise exception using errcode = 'P0001', message = 'acortado_fuera_de_turno';
  end if;
  if p_hash_texto = v_carrusel.hash_texto or jsonb_typeof(p_laminas) <> 'array'
     or jsonb_array_length(p_laminas) <> jsonb_array_length(v_carrusel.laminas)
     or btrim(coalesce(p_explicacion, '')) = '' then
    raise exception using errcode = '22023', message = 'acortado_invalido';
  end if;

  insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, diseno, origen)
  values (v_pieza.id, v_carrusel.version + 1, p_laminas, v_carrusel.texto_post, p_hash_texto, v_carrusel.diseno,
          'acortado');
  -- The version that did not fit is never rendered.
  update public.carruseles set estado = 'fallo' where id = p_carrusel;
  update public.piezas
     set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null, revision = p_revision,
         explicacion = p_explicacion, intento = intento + 1, version = version + 1
   where id = v_pieza.id
  returning * into v_pieza;

  update public.gastos set estado = 'confirmado', real_usd = p_real where clave = p_clave and estado = 'reservado';
  if not found then
    raise exception using errcode = 'P0001', message = 'gasto_no_reservado';
  end if;
  return v_pieza;
end $$;

revoke execute on function public.guardar_acortado(uuid, integer, jsonb, text, jsonb, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.guardar_acortado(uuid, integer, jsonb, text, jsonb, text, text, numeric)
  to service_role;

-- "El diseño" at gate 2 (D5, amendment 5): a new version with the same words and post, so gate 1 stands, and the piece
-- back to be rendered. Bounded as on the screen: portada and cierre keep their text, 6 to 8 slides, one known variant.
-- It is not one of her three text changes.
create function public.cambiar_diseno_de_carrusel(p_pieza uuid, p_version integer, p_laminas jsonb, p_diseno jsonb)
returns public.carruseles
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_actual public.carruseles;
  v_nueva public.carruseles;
  v_n integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_cambia_diseno';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.tipo <> 'carrusel' or v_pieza.estado <> 'carrusel_por_aprobar' then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;
  select * into v_actual from public.carruseles where pieza_id = p_pieza order by version desc limit 1;
  if v_actual.estado <> 'listo' then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;

  if jsonb_typeof(p_laminas) <> 'array' or jsonb_typeof(p_diseno) <> 'object' then
    raise exception using errcode = '22023', message = 'diseno_invalido';
  end if;
  v_n := jsonb_array_length(p_laminas);
  if v_n not between 6 and 8
     or p_laminas -> 0 ->> 'tipo' is distinct from 'portada'
     or p_laminas -> (v_n - 1) ->> 'tipo' is distinct from 'cierre'
     or exists (select 1 from jsonb_array_elements(p_laminas) with ordinality as e(lamina, orden)
                 where e.orden between 2 and v_n - 1 and e.lamina ->> 'tipo' is distinct from 'idea')
     or p_laminas -> 0 ->> 'texto' is distinct from v_actual.laminas -> 0 ->> 'texto'
     or p_laminas -> (v_n - 1) ->> 'texto' is distinct from v_actual.laminas -> (jsonb_array_length(v_actual.laminas) - 1) ->> 'texto'
     or p_laminas -> (v_n - 1) ->> 'fuente' is distinct from v_actual.laminas -> (jsonb_array_length(v_actual.laminas) - 1) ->> 'fuente'
     or public.palabras_de_laminas(p_laminas) <> public.palabras_de_laminas(v_actual.laminas)
     or (select count(*) from jsonb_object_keys(p_diseno)) <> 1
     or p_diseno ->> 'variante' is null
     or p_diseno ->> 'variante' not in ('crema', 'piedra', 'oscura') then
    raise exception using errcode = '22023', message = 'diseno_invalido';
  end if;
  if p_laminas = v_actual.laminas and p_diseno = v_actual.diseno then
    raise exception using errcode = '22023', message = 'diseno_sin_cambio';
  end if;

  insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, diseno, origen)
  values (p_pieza, v_actual.version + 1, p_laminas, v_actual.texto_post, v_actual.hash_texto, p_diseno, 'cambio_diseno')
  returning * into v_nueva;
  update public.piezas set estado = 'armando_carrusel', intento = intento + 1, explicacion = null, version = version + 1
   where id = p_pieza;
  return v_nueva;
end $$;

revoke execute on function public.cambiar_diseno_de_carrusel(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.cambiar_diseno_de_carrusel(uuid, integer, jsonb, jsonb) to authenticated;

-- pedir_cambio_de_carrusel as of 20261026000130, plus gate 2 ("El texto", amendment 6): from carrusel_por_aprobar too.
create or replace function public.pedir_cambio_de_carrusel(p_pieza uuid, p_version integer, p_pedido text)
returns public.piezas
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_pedido text := btrim(coalesce(p_pedido, ''));
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_pide_cambios';
  end if;
  if v_pedido = '' or char_length(v_pedido) > 500 then
    raise exception using errcode = '22023', message = 'pedido_invalido';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.tipo <> 'carrusel' or v_pieza.estado not in ('guion_por_aprobar', 'carrusel_por_aprobar') then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;
  if v_pieza.cambios_de_texto >= 3 then
    raise exception using errcode = 'P0001', message = 'sin_cambios_de_texto';
  end if;

  update public.piezas
     set estado = 'guion_en_proceso', intento = intento + 1, pedido_de_cambio = v_pedido, explicacion = null,
         cambios_de_texto = cambios_de_texto + 1, puerta1_hash = null, puerta1_en = null, puerta1_por = null,
         version = version + 1
   where id = p_pieza
  returning * into v_pieza;
  return v_pieza;
end $$;
```

`crearCarruselEn(c, "armando_carrusel")` signs as Coni a minute ago; `guardar_armado` then runs as the service. If the
`gastos` insert of the acortado test names columns that differ, align it with the real table (Task 1's note).

- [ ] **Step 4: Run it green, and every carousel suite**

Run: `pnpm db:reset && pnpm test:db tests/integration/carrusel-armado-funciones.test.ts tests/integration/carrusel-armado-esquema.test.ts tests/integration/carrusel-funciones.test.ts tests/integration/acciones-carrusel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261027000110_carrusel_funciones_armado.sql tests/integration/carrusel-armado-funciones.test.ts
git commit -m "Add the carousel's render, shortening and design-change functions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Generated types

**Files:** Modify: `lib/supabase/database.types.ts`

- [ ] **Step 1:** `pnpm db:reset && pnpm db:types`
- [ ] **Step 2:** `grep -c "guardar_armado\|guardar_acortado\|cambiar_diseno_de_carrusel\|palabras_de_laminas" lib/supabase/database.types.ts`
  Expected: 4 or more. `pnpm type` PASS.
- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "Regenerate the database types for carousels part 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 2 checkpoint:** reviewer on Tasks 4 to 6. Focus: the `proteger_pieza` diff is exactly the three blocks; the
invoker functions are not executable by `authenticated`; `cambiar_diseno_de_carrusel` cannot change a word.

---

## Lote 3: Domain

### Task 7: The carousel's states after gate 1 (`estados.ts`, `piezas.ts`)

**Files:**
- Modify: `lib/dominio/estados.ts`
- Modify: `lib/datos/piezas.ts`
- Create: `tests/unit/estados-carrusel-armado.test.ts`
- Modify: `tests/unit/datos-piezas.test.ts`

- [ ] **Step 1: Write the failing tests** `tests/unit/estados-carrusel-armado.test.ts`

```ts
import { describe, expect, it } from "vitest"
import {
  AprobacionNoAutorizada,
  ArtefactoCambio,
  type Estado,
  type Pieza,
  piezaNueva,
  piezaTrabajando,
  TransicionInvalida,
  transicionar,
} from "@/lib/dominio/estados"

const HASH = "a".repeat(64)
const CARRUSEL = "11111111-1111-4111-8111-111111111111"
const FIRMA = { hash: HASH, en: "2026-10-27T12:00:00.000Z" }

function carrusel(estado: Estado, cambios: Partial<Pieza> = {}): Pieza {
  return { ...piezaNueva("carrusel"), estado, version: 5, intento: 1, puerta1: FIRMA, ...cambios }
}

const aprobar = (extra: Partial<{ carruselActual: string; hashTextoActual: string; actor: "coni" | "sistema"; publicarEn: string }> = {}) =>
  ({
    tipo: "aprobar_carrusel",
    actor: extra.actor ?? "coni",
    carruselVisto: CARRUSEL,
    carruselActual: extra.carruselActual ?? CARRUSEL,
    hashTextoVisto: HASH,
    hashTextoActual: extra.hashTextoActual ?? HASH,
    publicarEn: extra.publicarEn ?? "2026-10-29T22:00:00.000Z",
    en: "2026-10-27T13:00:00.000Z",
  }) as const

describe("a carousel after gate 1", () => {
  it("goes to gate 2 when its slides are saved", () => {
    expect(transicionar(carrusel("armando_carrusel"), { tipo: "carrusel_armado" }).pieza).toMatchObject({
      estado: "carrusel_por_aprobar",
      puerta1: FIRMA,
      version: 6,
    })
  })

  it("goes back to gate 1 without its signature when it does not fit", () => {
    const { pieza } = transicionar(carrusel("armando_carrusel"), { tipo: "volver_a_firmar", explicacion: "Larga." })
    expect(pieza).toMatchObject({ estado: "guion_por_aprobar", puerta1: null, intento: 2, explicacion: "Larga." })
  })

  it("fails its render into error_produccion and Reintentar takes it back to armando_carrusel", () => {
    const fallida = transicionar(carrusel("armando_carrusel"), { tipo: "falla_produccion", explicacion: "No pude." }).pieza
    expect(fallida).toMatchObject({ estado: "error_produccion", estadoAntesDelError: "armando_carrusel" })
    const otra = transicionar(fallida, { tipo: "reintentar", ahora: "2026-10-27T13:00:00.000Z" }).pieza
    expect(otra).toMatchObject({ estado: "armando_carrusel", estadoAntesDelError: null, intento: 2 })
  })

  it("is rendered again after a design change, keeping gate 1", () => {
    expect(transicionar(carrusel("carrusel_por_aprobar"), { tipo: "cambiar_diseno" }).pieza).toMatchObject({
      estado: "armando_carrusel",
      puerta1: FIRMA,
      intento: 2,
    })
  })

  it("goes back to be rewritten from gate 2, without its signature", () => {
    expect(transicionar(carrusel("carrusel_por_aprobar"), { tipo: "pedir_cambios" }).pieza).toMatchObject({
      estado: "guion_en_proceso",
      puerta1: null,
      intento: 2,
    })
  })

  it("is scheduled by Coni on the version she saw, for a future time", () => {
    const { pieza } = transicionar(carrusel("carrusel_por_aprobar"), aprobar())
    expect(pieza.estado).toBe("programado")
    expect(pieza.puerta2).toEqual({
      carruselId: CARRUSEL,
      hashTexto: HASH,
      publicarEn: "2026-10-29T22:00:00.000Z",
      en: "2026-10-27T13:00:00.000Z",
    })
    expect(() => transicionar(carrusel("carrusel_por_aprobar"), aprobar({ carruselActual: "otro" }))).toThrow(ArtefactoCambio)
    expect(() => transicionar(carrusel("carrusel_por_aprobar"), aprobar({ hashTextoActual: "b".repeat(64) }))).toThrow(
      ArtefactoCambio,
    )
    expect(() => transicionar(carrusel("carrusel_por_aprobar"), aprobar({ actor: "sistema" }))).toThrow(AprobacionNoAutorizada)
    expect(() =>
      transicionar(carrusel("carrusel_por_aprobar"), aprobar({ publicarEn: "2026-10-27T12:00:00.000Z" })),
    ).toThrow("La fecha de publicación ya pasó. Elige una hora futura.")
  })

  it("changes its date back to gate 2 and is handed over and marked uploaded like a reel", () => {
    const programado = transicionar(carrusel("carrusel_por_aprobar"), aprobar()).pieza
    expect(transicionar(programado, { tipo: "cambiar_fecha" }).pieza).toMatchObject({
      estado: "carrusel_por_aprobar",
      puerta2: null,
    })
    const entregado = transicionar(programado, { tipo: "entregar_para_subir" }).pieza
    expect(entregado.estado).toBe("para_subir_a_mano")
    const subido = transicionar(entregado, { tipo: "subido_a_mano", actor: "coni", destino: "linkedin", quedanPendientes: false })
    expect(subido.pieza.estado).toBe("publicado_a_mano")
  })

  it("never publishes by itself or expires in part 2, and a reel never takes a carousel event", () => {
    const programado = transicionar(carrusel("carrusel_por_aprobar"), aprobar()).pieza
    expect(() => transicionar(programado, { tipo: "publicado" })).toThrow(TransicionInvalida)
    expect(() => transicionar(programado, { tipo: "hora_vencida" })).toThrow(TransicionInvalida)
    const reel = { ...piezaNueva("reel"), estado: "video_por_aprobar" as const }
    expect(() => transicionar(reel, aprobar())).toThrow(TransicionInvalida)
    expect(() => transicionar(reel, { tipo: "cambiar_diseno" })).toThrow(TransicionInvalida)
  })

  it("is being worked on while it renders, unless a reason stopped it", () => {
    expect(piezaTrabajando({ estado: "armando_carrusel", explicacion: null })).toBe(true)
    expect(piezaTrabajando({ estado: "armando_carrusel", explicacion: "Tope." })).toBe(false)
  })
})
```

In `tests/unit/datos-piezas.test.ts`: add `puerta2_carrusel_id: null,` to `filaNueva` and `filaProgramada`, add
`"puerta2_carrusel_id"` to the key list of "devuelve exactamente las columnas...", and append:

```ts
describe("the gate 2 of a carousel", () => {
  const filaDeCarrusel: FilaPieza = {
    ...filaProgramada,
    tipo: "carrusel",
    audio_id: null,
    video_id: null,
    puerta2_video_id: null,
    puerta2_carrusel_id: "11111111-1111-4111-8111-111111111111",
  }

  it("reads it with its carousel id and writes it back the same", () => {
    const pieza = piezaDesdeFila(filaDeCarrusel)
    expect(pieza.puerta2).toEqual({
      carruselId: "11111111-1111-4111-8111-111111111111",
      hashTexto: "b".repeat(64),
      publicarEn: "2026-10-09T22:00:00.000Z",
      en: "2026-10-08T21:00:00.000Z",
    })
    expect(releida(pieza)).toEqual(filaDeCarrusel)
  })

  it("refuses a gate 2 with both a video and a carousel", () => {
    expect(() => piezaDesdeFila({ ...filaDeCarrusel, puerta2_video_id: "video-1" })).toThrow(Error)
  })
})
```

In `tests/unit/estados.test.ts` ("acepta solo los eventos de la tabla del diseño"), add the four new events to the
`eventos` sample record:

```ts
  carrusel_armado: { tipo: "carrusel_armado" },
  volver_a_firmar: { tipo: "volver_a_firmar", explicacion: "Larga." },
  cambiar_diseno: { tipo: "cambiar_diseno" },
  aprobar_carrusel: {
    tipo: "aprobar_carrusel",
    actor: "coni",
    carruselVisto: "c1",
    carruselActual: "c1",
    hashTextoVisto: "h1",
    hashTextoActual: "h1",
    publicarEn: HORA,
    en: ANTES,
  },
```

and set the two carousel rows of the expected table to
`armando_carrusel: ["carrusel_armado", "volver_a_firmar", "falla_produccion", "descartar"]` and
`carrusel_por_aprobar: ["pedir_cambios", "cambiar_diseno", "aprobar_carrusel", "descartar"]` (the sample pieces of those
two states are carousels signed with `h1`). Every reel row stays as it is.

- [ ] **Step 2: Run them red**

Run: `pnpm test:run tests/unit/estados-carrusel-armado.test.ts tests/unit/datos-piezas.test.ts`
Expected: FAIL (unknown events; `puerta2_carrusel_id` is not part of the row type).

- [ ] **Step 3: `lib/dominio/estados.ts`.** Make these changes:

```ts
/** Steps a failed piece can be retried from. */
export type EstadoAntesDelError = "en_render" | "subtitulando" | "programado" | "armando_carrusel"
```

```ts
export interface AprobacionVideo {
  videoId: string
  /** Never on a reel's approval: it tells the two kinds apart. */
  carruselId?: undefined
  hashTexto: string
  /** How `hashTexto` was computed (`hashTextoDePuerta2`): 1 is an approval from before LinkedIn, 2 binds its text too. */
  formula: 1 | 2
  publicarEn: string
  en: string
}

/** Gate 2 of a carousel (plan amendment 2): the rendered version she saw, its words (`hash_texto`) and the time. */
export interface AprobacionCarrusel {
  carruselId: string
  videoId?: undefined
  hashTexto: string
  formula?: undefined
  publicarEn: string
  en: string
}

export type AprobacionPuerta2 = AprobacionVideo | AprobacionCarrusel
```

In `Pieza`, `puerta2: AprobacionPuerta2 | null`. In `Evento`, after `firmar_carrusel`:

```ts
  /** The renderer saved a version's PNGs and PDF (`guardar_armado`): gate 2 can look at it. */
  | { tipo: "carrusel_armado" }
  /** A version that does not fit goes back to gate 1: shortened (a new text) or too long even shortened. */
  | { tipo: "volver_a_firmar"; explicacion: string }
  /** "El diseño" at gate 2 (D5): a new version with the same words, rendered again. */
  | { tipo: "cambiar_diseno" }
  /** Gate 2 of a carousel: the version she saw, its words and the time. */
  | {
      tipo: "aprobar_carrusel"
      actor: Actor
      carruselVisto: string
      carruselActual: string
      hashTextoVisto: string
      hashTextoActual: string
      publicarEn: string
      en: string
    }
```

`piezaTrabajando`:

```ts
    case "armando_carrusel":
      // The render runs; with a reason on it (the cap stopped a shortening) it waits for Coni.
      return pieza.explicacion === null
```

The event lists:

```ts
/**
 * What a carousel goes through (design 2026-10-26, C3): written, signed, rendered, changed, scheduled and uploaded by
 * hand (part 2). Never a voice, an avatar, a video, Instagram, nor (until part 3) a post of its own.
 */
export const EVENTOS_DE_CARRUSEL: readonly Evento["tipo"][] = [
  "elegir",
  "carrusel_listo",
  "pedir_cambios",
  "firmar_carrusel",
  "carrusel_armado",
  "volver_a_firmar",
  "falla_produccion",
  "reintentar",
  "cambiar_diseno",
  "aprobar_carrusel",
  "cambiar_fecha",
  "entregar_para_subir",
  "subido_a_mano",
  "falla_publicacion",
  "descartar",
]
const SOLO_DE_CARRUSEL: readonly Evento["tipo"][] = [
  "carrusel_listo",
  "firmar_carrusel",
  "carrusel_armado",
  "volver_a_firmar",
  "cambiar_diseno",
  "aprobar_carrusel",
]
```

A helper above `transicionar` (the date rule both gates 2 share):

```ts
/** The approved time of a gate 2: readable and after the moment of the approval. */
function fechaDePublicacion(publicarEn: string, aprobadoEn: string): string {
  const instante = instanteEstricto(publicarEn)
  if (!instante) throw new Falla("La fecha de publicación no es válida.")
  if (Date.parse(instante) <= Date.parse(aprobadoEn)) {
    throw new Falla("La fecha de publicación ya pasó. Elige una hora futura.")
  }
  return instante
}
```

In `transicionar`, replace the date lines of `aprobar_video` with
`const publicarEn = fechaDePublicacion(evento.publicarEn, aprobadoEn)`, and change these cases:

```ts
    case "pedir_cambios":
      if (estado !== "guion_por_aprobar" && !(pieza.tipo === "carrusel" && estado === "carrusel_por_aprobar")) {
        throw invalida()
      }
      // A new script round is a new attempt; from a carousel's gate 2 the signature goes with the old text.
      return a("guion_en_proceso", { audioId: null, puerta1: null, intento: pieza.intento + 1 })
```

```ts
    case "falla_produccion":
      if (estado !== "en_render" && estado !== "subtitulando" && estado !== "armando_carrusel") throw invalida()
      return a("error_produccion", { estadoAntesDelError: estado, explicacion: evento.explicacion })
```

```ts
    case "cambiar_fecha":
      if (estado !== "programado") throw invalida()
      return a(pieza.tipo === "carrusel" ? "carrusel_por_aprobar" : "video_por_aprobar", {
        puerta2: null,
        intento: pieza.intento + 1,
      }, ["cancelar_publicacion"])
```

In `reintentar`, the late branch of `error_publicacion` returns to the type's gate 2:

```ts
          return a(pieza.tipo === "carrusel" ? "carrusel_por_aprobar" : "video_por_aprobar", {
            estadoAntesDelError: null,
            puerta2: null,
            intento,
            explicacion: "La hora aprobada ya pasó. Elige una nueva fecha.",
          })
```

New cases before `descartar`:

```ts
    case "carrusel_armado":
      if (estado !== "armando_carrusel") throw invalida()
      return a("carrusel_por_aprobar")

    case "volver_a_firmar":
      if (estado !== "armando_carrusel") throw invalida()
      return a("guion_por_aprobar", { puerta1: null, intento: pieza.intento + 1, explicacion: evento.explicacion })

    case "cambiar_diseno":
      if (estado !== "carrusel_por_aprobar") throw invalida()
      return a("armando_carrusel", { intento: pieza.intento + 1 })

    case "aprobar_carrusel": {
      soloConi(evento.actor)
      if (estado !== "carrusel_por_aprobar") throw invalida()
      if (
        evento.carruselVisto !== evento.carruselActual ||
        evento.hashTextoVisto !== evento.hashTextoActual ||
        pieza.puerta1?.hash !== evento.hashTextoActual
      ) {
        throw new ArtefactoCambio()
      }
      const aprobadoEn = instanteDelServidor(evento.en)
      const publicarEn = fechaDePublicacion(evento.publicarEn, aprobadoEn)
      return a("programado", {
        puerta2: { carruselId: evento.carruselVisto, hashTexto: evento.hashTextoVisto, publicarEn, en: aprobadoEn },
      })
    }
```

- [ ] **Step 4: `lib/datos/piezas.ts`.** Add `"puerta2_carrusel_id"` to the `Pick` of `CambiosPieza`,
`"armando_carrusel"` to `REINTENTABLES`, import `AprobacionPuerta2` instead of `AprobacionVideo`, and:

```ts
function puerta2(fila: FilaPieza): AprobacionPuerta2 | null {
  const publicarEn = instanteDeBase(fila.puerta2_publicar_en)
  const en = instanteDeBase(fila.puerta2_en)
  const { puerta2_video_id: videoId, puerta2_carrusel_id: carruselId, puerta2_hash_texto: hashTexto } = fila
  if (videoId === null && carruselId === null && hashTexto === null && publicarEn === null && en === null) return null
  if (hashTexto === null || publicarEn === null || en === null || (videoId === null) === (carruselId === null)) {
    throw new Error("La puerta 2 de la pieza está incompleta en la base.")
  }
  if (carruselId !== null) return { carruselId, hashTexto, publicarEn, en }
  if (videoId === null) throw new Error("La puerta 2 de la pieza está incompleta en la base.")
  return { videoId, hashTexto, formula: formulaDePuerta2(fila.puerta2_formula), publicarEn, en }
}
```

and in `cambiosDesdePieza`:

```ts
    puerta2_video_id: pieza.puerta2?.videoId ?? null,
    puerta2_carrusel_id: pieza.puerta2?.carruselId ?? null,
```

- [ ] **Step 5: Run them green, then the whole unit suite and the types**

Run: `pnpm test:run && pnpm type`
Expected: PASS. `pnpm type` names `lib/publicacion/publicar.ts` (`puerta2.videoId` is `string | undefined`): in
`publicarPieza`, change the first guard to
`if (puerta2 === null || puerta2.videoId === undefined || texto === null) {` and keep the rest; after it, TypeScript
narrows `puerta2` to `AprobacionVideo`. Any test file the compiler names for a missing `puerta2_carrusel_id` in a
literal `FilaPieza` gets `puerta2_carrusel_id: null`.

- [ ] **Step 6: Commit**

```bash
git add lib/dominio/estados.ts lib/datos/piezas.ts lib/publicacion/publicar.ts tests/unit
git commit -m "Teach the state machine a carousel's render, gate 2 and upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Guards for the render and for a carousel's gate 2 (`puertas.ts`)

**Files:**
- Modify: `lib/dominio/puertas.ts`
- Create: `tests/unit/puertas-carrusel.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/puertas-carrusel.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { type Pieza, piezaNueva } from "@/lib/dominio/estados"
import { claveIdempotencia, puedeArmar, puedeEntregarseParaSubir, puedePublicar } from "@/lib/dominio/puertas"

const HASH = "a".repeat(64)
const CARRUSEL = "11111111-1111-4111-8111-111111111111"
const PUBLICAR_EN = "2026-10-29T22:00:00.000Z"

const armando: Pieza = { ...piezaNueva("carrusel"), estado: "armando_carrusel", puerta1: { hash: HASH, en: "2026-10-27T12:00:00.000Z" } }
const programado: Pieza = {
  ...armando,
  estado: "programado",
  puerta2: { carruselId: CARRUSEL, hashTexto: HASH, publicarEn: PUBLICAR_EN, en: "2026-10-27T13:00:00.000Z" },
}

describe("puedeArmar", () => {
  it("lets the render go on the signed words only", () => {
    expect(puedeArmar(armando, HASH)).toEqual({ ok: true })
    expect(puedeArmar(armando, "b".repeat(64))).toEqual({ ok: false, motivo: "artefacto_cambio" })
    expect(puedeArmar({ ...armando, puerta1: null }, HASH)).toEqual({ ok: false, motivo: "sin_aprobacion" })
    expect(puedeArmar({ ...armando, estado: "carrusel_por_aprobar" }, HASH)).toEqual({ ok: false, motivo: "estado" })
    expect(puedeArmar({ ...armando, tipo: "reel" }, HASH)).toEqual({ ok: false, motivo: "estado" })
  })
})

describe("a scheduled carousel", () => {
  it("is handed over at its time when its version and words are the approved ones", () => {
    const ahora = "2026-10-29T22:01:00.000Z"
    expect(puedeEntregarseParaSubir(programado, { hashTexto: HASH, carruselId: CARRUSEL, ahora })).toEqual({ ok: true })
    expect(puedeEntregarseParaSubir(programado, { hashTexto: HASH, carruselId: "otro", ahora })).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
    expect(puedeEntregarseParaSubir(programado, { hashTexto: HASH, ahora })).toEqual({ ok: false, motivo: "artefacto_cambio" })
  })

  it("is never published by the API path in part 2", () => {
    expect(puedePublicar(programado, { hashTexto: HASH, ahora: "2026-10-29T22:01:00.000Z" })).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
  })

  it("has its own idempotency step", () => {
    expect(claveIdempotencia({ piezaId: "p", paso: "armar", hash: HASH, intento: 2 })).toBe("p:armar:aaaaaaaaaaaaaaaa:2")
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/puertas-carrusel.test.ts`
Expected: FAIL (`puedeArmar` is not exported).

- [ ] **Step 3: `lib/dominio/puertas.ts`.** `export type Paso = "producir" | "grabar" | "publicar" | "voz" | "armar"`, and:

```ts
/**
 * The render task calls this before it renders or pays for a shortening: the version it renders carries the words gate
 * 1 signed (`hash_texto` in `puerta1_hash`).
 */
export function puedeArmar(pieza: Pieza, hashTextoActual: string): Veredicto {
  if (pieza.tipo !== "carrusel" || pieza.estado !== "armando_carrusel") return no("estado")
  if (!pieza.puerta1) return no("sin_aprobacion")
  if (pieza.puerta1.hash !== hashTextoActual) return no("artefacto_cambio")
  return { ok: true }
}

/**
 * What both exits of a scheduled piece require of what Coni approved: the same video (a reel) or the same rendered
 * version (a carousel, plan amendment 2), and the same text.
 */
function aprobacionVigente(pieza: Pieza, actual: { hashTexto: string; carruselId?: string }): Veredicto {
  if (pieza.estado !== "programado") return no("estado")
  const aprobacion = pieza.puerta2
  if (!aprobacion) return no("sin_aprobacion")
  const mismoMedio =
    aprobacion.carruselId !== undefined
      ? aprobacion.carruselId === actual.carruselId
      : aprobacion.videoId === pieza.videoId
  if (!mismoMedio || aprobacion.hashTexto !== actual.hashTexto) return no("artefacto_cambio")
  return { ok: true }
}
```

`puedePublicar` keeps its signature and calls `aprobacionVigente(pieza, actual)` (a carousel without `carruselId` is
refused: the API path never takes one in part 2). `puedeEntregarseParaSubir` takes
`actual: { hashTexto: string; carruselId?: string; ahora: string }` and passes it the same way.

- [ ] **Step 4: Run it green**

Run: `pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/puertas.ts tests/unit/puertas-carrusel.test.ts
git commit -m "Guard a carousel's render and its scheduled version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Bounded design changes (`diseno-carrusel.ts`)

**Files:**
- Modify: `lib/dominio/carrusel.ts` (export `palabrasDe`)
- Create: `lib/dominio/diseno-carrusel.ts`
- Create: `tests/unit/diseno-carrusel.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/diseno-carrusel.test.ts`

```ts
import { describe, expect, it } from "vitest"
import type { Lamina } from "@/lib/dominio/carrusel"
import {
  aplicarCambioDeDiseno,
  DISENO_INICIAL,
  DisenoInvalido,
  frasesDe,
  leerDiseno,
  palabrasDestacables,
  puedeDividir,
  puedeUnir,
} from "@/lib/dominio/diseno-carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"

const hash = (laminas: readonly Lamina[]) => hashTextoDeCarrusel({ laminas, textoPost: TEXTO_POST_DE_PRUEBA })
const original = hash(LAMINAS_DE_PRUEBA)

describe("frasesDe", () => {
  it("splits after a sentence's end and keeps the punctuation", () => {
    expect(frasesDe("Un chatbot te responde. Eso ayuda, pero no te conoce.")).toEqual([
      "Un chatbot te responde.",
      "Eso ayuda, pero no te conoce.",
    ])
    expect(frasesDe("Una sola idea sin punto")).toEqual(["Una sola idea sin punto"])
  })
})

describe("aplicarCambioDeDiseno", () => {
  it("changes the variant and nothing else", () => {
    const { laminas, diseno } = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "variante", variante: "oscura" })
    expect(diseno).toEqual({ variante: "oscura" })
    expect(laminas).toEqual(LAMINAS_DE_PRUEBA)
  })

  it("splits an idea at the sentence boundary nearest its middle, keeping words, order and the hash", () => {
    const { laminas } = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "dividir", lamina: 1 })
    expect(laminas).toHaveLength(LAMINAS_DE_PRUEBA.length + 1)
    expect(laminas[1]).toEqual({ tipo: "idea", texto: "Un chatbot te responde a cualquier hora." })
    expect(laminas[2]).toEqual({ tipo: "idea", texto: "Eso ayuda, pero no te conoce." })
    expect(hash(laminas)).toBe(original)
  })

  it("merges two adjacent ideas keeping the first highlight, words, order and the hash", () => {
    // The fixture has four ideas, the minimum: split one first so a merge is allowed.
    const cinco = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "dividir", lamina: 1 }).laminas
    const { laminas } = aplicarCambioDeDiseno(cinco, DISENO_INICIAL, { tipo: "unir", lamina: 3 })
    expect(laminas).toHaveLength(LAMINAS_DE_PRUEBA.length)
    expect(laminas[3]).toEqual({
      tipo: "idea",
      texto: "No nota el silencio largo antes de una respuesta difícil. No ve cómo cambia tu voz cuando hablas de tu familia.",
      destacado: "silencio",
    })
    expect(hash(laminas)).toBe(original)
  })

  it("highlights one of the slide's own words, or none, keeping the hash", () => {
    const con = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "destacar", lamina: 1, palabra: "conoce" })
    expect(con.laminas[1]?.destacado).toBe("conoce")
    const sin = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "destacar", lamina: 2, palabra: null })
    expect(sin.laminas[2]).toEqual({ tipo: "idea", texto: "No nota el silencio largo antes de una respuesta difícil." })
    expect(hash(con.laminas)).toBe(original)
    expect(() =>
      aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "destacar", lamina: 1, palabra: "ajena" }),
    ).toThrow(DisenoInvalido)
  })

  it("never splits a one-sentence slide, the portada or past six ideas, nor merges across portada or cierre or under four", () => {
    const [portada, , , , , cierre] = LAMINAS_DE_PRUEBA
    if (!portada || !cierre) throw new Error("La lámina de prueba cambió de forma.")
    expect(puedeDividir(LAMINAS_DE_PRUEBA, 2)).toBe(false)
    expect(puedeDividir(LAMINAS_DE_PRUEBA, 0)).toBe(false)
    expect(puedeUnir(LAMINAS_DE_PRUEBA, 0)).toBe(false)
    expect(puedeUnir(LAMINAS_DE_PRUEBA, 4)).toBe(false)
    expect(puedeUnir(LAMINAS_DE_PRUEBA, 1)).toBe(false)
    expect(() => aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "unir", lamina: 1 })).toThrow(DisenoInvalido)
    const seis: Lamina[] = [
      portada,
      ...Array.from({ length: 6 }, (_, i): Lamina => ({ tipo: "idea", texto: `Primera ${i}. Segunda ${i}.` })),
      cierre,
    ]
    expect(puedeDividir(seis, 1)).toBe(false)
  })

  it("lists the words a slide can highlight, once each", () => {
    expect(palabrasDestacables({ tipo: "idea", texto: "No ve, no ve cómo cambia tu voz." })).toEqual([
      "No",
      "ve",
      "no",
      "cómo",
      "cambia",
      "tu",
      "voz",
    ])
  })
})

describe("leerDiseno", () => {
  it("reads a stored design and refuses anything else", () => {
    expect(leerDiseno({ variante: "piedra" })).toEqual({ variante: "piedra" })
    expect(() => leerDiseno({ variante: "neon" })).toThrow(Error)
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/diseno-carrusel.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Export `palabrasDe`** in `lib/dominio/carrusel.ts` (`export const palabrasDe = ...`, comment: "The words of a
text as the hash and the highlight see them.").

- [ ] **Step 4: The module** `lib/dominio/diseno-carrusel.ts`

```ts
import { z } from "zod"
import {
  type Lamina,
  MAXIMO_DE_IDEAS_DEL_CARRUSEL,
  MINIMO_DE_IDEAS_DEL_CARRUSEL,
  palabrasDe,
} from "@/lib/dominio/carrusel"
import { Falla } from "@/lib/dominio/falla"

// Design changes at gate 2 (design 2026-10-26, D5; plan amendment 5): bounded, and none of them changes a word, so
// `hash_texto` and gate 1 stand. `cambiar_diseno_de_carrusel` checks the same in SQL.

export const VARIANTES = ["crema", "piedra", "oscura"] as const
export type Variante = (typeof VARIANTES)[number]
export interface DisenoDeCarrusel {
  variante: Variante
}
export const DISENO_INICIAL: DisenoDeCarrusel = { variante: "crema" }
export const NOMBRE_DE_VARIANTE: Record<Variante, string> = { crema: "Crema", piedra: "Piedra", oscura: "Oscura" }

const esquemaDeDiseno = z.object({ variante: z.enum(VARIANTES) }).strict()

/** `carruseles.diseno` as stored: written only by the database functions, so another shape is a bug. */
export function leerDiseno(valor: unknown): DisenoDeCarrusel {
  const resultado = esquemaDeDiseno.safeParse(valor)
  if (!resultado.success) throw new Error(`El diseño guardado no tiene el formato esperado: ${resultado.error.message}`)
  return resultado.data
}

export type CambioDeDiseno =
  | { tipo: "variante"; variante: Variante }
  /** `lamina` is the slide's index (0 is the portada). */
  | { tipo: "dividir"; lamina: number }
  | { tipo: "unir"; lamina: number }
  | { tipo: "destacar"; lamina: number; palabra: string | null }

export class DisenoInvalido extends Falla {
  constructor() {
    super("Ese cambio de diseño no se puede hacer en esta lámina.")
    this.name = "DisenoInvalido"
  }
}

/** A text's sentences, split after `.`, `!`, `?` or `…` and the space that follows; the punctuation stays. */
export function frasesDe(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+/u)
    .map((frase) => frase.trim())
    .filter((frase) => frase !== "")
}

const ideasDe = (laminas: readonly Lamina[]) => laminas.filter((lamina) => lamina.tipo === "idea").length

export function puedeDividir(laminas: readonly Lamina[], indice: number): boolean {
  const lamina = laminas[indice]
  return (
    lamina?.tipo === "idea" && frasesDe(lamina.texto).length >= 2 && ideasDe(laminas) < MAXIMO_DE_IDEAS_DEL_CARRUSEL
  )
}

export function puedeUnir(laminas: readonly Lamina[], indice: number): boolean {
  return (
    laminas[indice]?.tipo === "idea" &&
    laminas[indice + 1]?.tipo === "idea" &&
    ideasDe(laminas) > MINIMO_DE_IDEAS_DEL_CARRUSEL
  )
}

/** The words she can highlight on a slide, once each, in order. */
export function palabrasDestacables(lamina: Lamina): string[] {
  return [...new Set(palabrasDe(lamina.texto))]
}

/** Keeps a highlight only on the half (or whole) whose words include it. */
function conDestacado(lamina: Lamina, destacado: string | undefined): Lamina {
  return destacado !== undefined && palabrasDe(lamina.texto).includes(destacado) ? { ...lamina, destacado } : lamina
}

function dividir(laminas: readonly Lamina[], indice: number): Lamina[] {
  const lamina = laminas[indice]
  if (!lamina || !puedeDividir(laminas, indice)) throw new DisenoInvalido()
  const frases = frasesDe(lamina.texto)
  const total = lamina.texto.length
  let corte = 1
  for (let k = 1; k < frases.length; k += 1) {
    const izquierda = frases.slice(0, k).join(" ").length
    const mejor = frases.slice(0, corte).join(" ").length
    if (Math.abs(total / 2 - izquierda) < Math.abs(total / 2 - mejor)) corte = k
  }
  const primera: Lamina = { tipo: "idea", texto: frases.slice(0, corte).join(" ") }
  const segunda: Lamina = { tipo: "idea", texto: frases.slice(corte).join(" ") }
  const enLaPrimera = lamina.destacado !== undefined && palabrasDe(primera.texto).includes(lamina.destacado)
  return [
    ...laminas.slice(0, indice),
    conDestacado(primera, lamina.destacado),
    enLaPrimera ? segunda : conDestacado(segunda, lamina.destacado),
    ...laminas.slice(indice + 1),
  ]
}

function unir(laminas: readonly Lamina[], indice: number): Lamina[] {
  const a = laminas[indice]
  const b = laminas[indice + 1]
  if (!a || !b || !puedeUnir(laminas, indice)) throw new DisenoInvalido()
  const unida = conDestacado({ tipo: "idea", texto: `${a.texto} ${b.texto}` }, a.destacado ?? b.destacado)
  return [...laminas.slice(0, indice), unida, ...laminas.slice(indice + 2)]
}

function destacar(laminas: readonly Lamina[], indice: number, palabra: string | null): Lamina[] {
  const lamina = laminas[indice]
  if (!lamina) throw new DisenoInvalido()
  if (palabra !== null && !palabrasDe(lamina.texto).includes(palabra)) throw new DisenoInvalido()
  const { destacado: _anterior, ...sinDestacado } = lamina
  const nueva: Lamina = palabra === null ? sinDestacado : { ...sinDestacado, destacado: palabra }
  return laminas.map((actual, i) => (i === indice ? nueva : actual))
}

/** One bounded design change (D5). Throws `DisenoInvalido` (a message for Coni) when it does not apply to that slide. */
export function aplicarCambioDeDiseno(
  laminas: readonly Lamina[],
  diseno: DisenoDeCarrusel,
  cambio: CambioDeDiseno,
): { laminas: Lamina[]; diseno: DisenoDeCarrusel } {
  switch (cambio.tipo) {
    case "variante":
      return { laminas: [...laminas], diseno: { variante: cambio.variante } }
    case "dividir":
      return { laminas: dividir(laminas, cambio.lamina), diseno }
    case "unir":
      return { laminas: unir(laminas, cambio.lamina), diseno }
    case "destacar":
      return { laminas: destacar(laminas, cambio.lamina, cambio.palabra), diseno }
  }
}
```

The fixture's slide 1 (`Un chatbot te responde a cualquier hora. Eso ayuda, pero no te conoce.`) has two sentences, so
the split test holds; slide 2 has one, so `puedeDividir(LAMINAS_DE_PRUEBA, 2)` is false.

- [ ] **Step 5: Run it green**

Run: `pnpm test:run tests/unit/diseno-carrusel.test.ts tests/unit/carrusel.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/dominio/carrusel.ts lib/dominio/diseno-carrusel.ts tests/unit/diseno-carrusel.test.ts
git commit -m "Add the bounded design changes of a carousel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Walking a carousel to gate 2 and beyond (test helpers)

**Files:**
- Modify: `tests/integration/flujo.ts` (`EstadoDeCarruselDePrueba`, `crearCarruselEn`)
- Modify: `tests/integration/siembra.ts` (nothing to change if `sembrarCarrusel` forwards the type; check)
- Create: `tests/integration/flujo-carrusel.test.ts`

- [ ] **Step 1: Write the failing test** `tests/integration/flujo-carrusel.test.ts`

```ts
import { afterAll, describe, expect, it } from "vitest"
import { pool } from "./db"
import { borrarSembrado, leerFila, sembrarCarrusel } from "./siembra"

const creadas: string[] = []
afterAll(async () => {
  await borrarSembrado(creadas, [])
  await pool.end()
})

describe("sembrarCarrusel past gate 1", () => {
  it.each([
    "carrusel_por_aprobar",
    "programado",
    "para_subir_a_mano",
    "error_produccion",
  ] as const)("walks a carousel to %s through the real flow", async (destino) => {
    const id = await sembrarCarrusel(destino)
    creadas.push(id)
    expect((await leerFila(id)).estado).toBe(destino)
    const { rows } = await pool.query("select estado from public.carruseles where pieza_id = $1 order by version", [id])
    expect(rows.at(-1)?.estado).toBe(destino === "error_produccion" ? "fallo" : "listo")
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:db tests/integration/flujo-carrusel.test.ts`
Expected: FAIL (type error / unknown destination).

- [ ] **Step 3: Extend `crearCarruselEn`** in `tests/integration/flujo.ts`. Widen the type and add `publicarEn` to the
options:

```ts
export type EstadoDeCarruselDePrueba =
  | "guion_en_proceso"
  | "guion_por_aprobar"
  | "armando_carrusel"
  | "carrusel_por_aprobar"
  | "programado"
  | "para_subir_a_mano"
  | "error_produccion"

export interface OpcionesDeCarrusel {
  titulo?: string
  ideaId?: string | null
  laminas?: readonly Lamina[]
  textoPost?: string
  /** The stored review of the delivered version; none by default. */
  revision?: unknown
  /** The signed time at gate 2; tomorrow by default. */
  publicarEn?: string
}
```

At the end of `crearCarruselEn`, replace `return id` after the signature with:

```ts
  if (destino === "armando_carrusel") return id

  const { rows: versiones } = await c.query<{ id: string; laminas: unknown[] }>(
    "select id, laminas from public.carruseles where pieza_id = $1 order by version desc limit 1",
    [id],
  )
  const version = versiones[0]
  if (!version) throw new Error("El carrusel no tiene versión")
  if (destino === "error_produccion") {
    await asumir(c, comoServicio)
    await c.query("update public.carruseles set estado = 'fallo' where id = $1", [version.id])
    await aplicar(c, id, comoServicio, { tipo: "falla_produccion", explicacion: "No pude armar el carrusel. WAV ya está revisando." })
    return id
  }
  await asumir(c, comoServicio)
  const { rows: piezas } = await c.query<{ version: number }>("select version from public.piezas where id = $1", [id])
  await c.query("select public.guardar_armado($1, $2, $3, $4)", [
    version.id,
    piezas[0]?.version,
    `carruseles/${id}/${version.id}/carrusel.pdf`,
    version.laminas.map((_, i) => `carruseles/${id}/${version.id}/lamina-${String(i + 1).padStart(2, "0")}.png`),
  ])
  if (destino === "carrusel_por_aprobar") return id

  await aplicar(c, id, comoConi, {
    tipo: "aprobar_carrusel",
    actor: "coni",
    carruselVisto: version.id,
    carruselActual: version.id,
    hashTextoVisto: hash,
    hashTextoActual: hash,
    publicarEn: opciones.publicarEn ?? maniana(),
    en: ahora(),
  })
  if (destino === "programado") return id

  await aplicar(c, id, comoServicio, { tipo: "entregar_para_subir" })
  return id
```

`maniana`, `ahora`, `asumir`, `comoServicio`, `comoConi` are already in the file or `./db`. For `para_subir_a_mano` a
signed time in the past is not needed: the service writes the transition directly (the publisher's guard is tested in
Task 20). `aplicar` runs `transicionar`, so each step is a real transition.

- [ ] **Step 4: Run it green, and the other carousel suites**

Run: `pnpm test:db tests/integration/flujo-carrusel.test.ts tests/integration/acciones-carrusel.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/flujo.ts tests/integration/flujo-carrusel.test.ts
git commit -m "Walk test carousels to gate 2, scheduled, by hand and failed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 3 checkpoint:** reviewer on Tasks 7 to 10. Focus: no reel transition changed (the reel suites are untouched and
green); `puedePublicar` refuses every carousel; the design changes keep `hash_texto` (tests re-hash).

---

## Lote 4: Template and renderer

### Task 11: The serif and the slide template (pure)

**Files:**
- Create: `assets/fuentes/carrusel/Newsreader.ttf`, `assets/fuentes/carrusel/OFL.txt`
- Modify: `assets/fuentes/README.md`
- Create: `lib/carrusel/plantilla/variantes.ts`, `lib/carrusel/plantilla/tipografia.ts`, `lib/carrusel/plantilla/plantilla.ts`
- Create: `lib/carrusel/fuente.ts`
- Create: `tests/unit/plantilla-carrusel.test.ts`

- [ ] **Step 1: The font files (decision P3).** Newsreader is SIL OFL 1.1 (redistribution allowed, file committed
with its license).

```bash
mkdir -p assets/fuentes/carrusel
curl -fsSL -o assets/fuentes/carrusel/Newsreader.ttf \
  "https://github.com/google/fonts/raw/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf"
curl -fsSL -o assets/fuentes/carrusel/OFL.txt "https://github.com/google/fonts/raw/main/ofl/newsreader/OFL.txt"
file assets/fuentes/carrusel/Newsreader.ttf     # "TrueType Font data"
head -3 assets/fuentes/carrusel/OFL.txt          # "Copyright 2020 The Newsreader Project Authors" ... "SIL Open Font License"
```

If a URL answers 404, open `https://github.com/google/fonts/tree/main/ofl/newsreader` for the current file name; the
committed name stays `Newsreader.ttf`. Append to `assets/fuentes/README.md`:

```markdown
# Carousel font

`carrusel/Newsreader.ttf` (the variable `Newsreader[opsz,wght].ttf`) and its license `carrusel/OFL.txt` (SIL Open Font
License 1.1), from https://github.com/google/fonts/tree/main/ofl/newsreader. Committed on purpose: the LinkedIn carousel
template (`lib/carrusel/plantilla`) embeds it as a data URL, so Chromium fetches nothing while it renders (design
2026-10-26, D4). It reaches the Trigger.dev image through the same `additionalFiles` as Montserrat.
```

- [ ] **Step 2: Write the failing test** `tests/unit/plantilla-carrusel.test.ts`

```ts
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fuenteDelCarrusel } from "@/lib/carrusel/fuente"
import {
  escapar,
  htmlDelCarrusel,
  marcaDelCarrusel,
  textoConDestacado,
} from "@/lib/carrusel/plantilla/plantilla"
import { tamanoDeLetra } from "@/lib/carrusel/plantilla/tipografia"
import { COLORES } from "@/lib/carrusel/plantilla/variantes"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

const ENTRADA = { laminas: LAMINAS_DE_PRUEBA, variante: "crema", marca: "Constanza del Rosario · IA", fuente: "data:font/ttf;base64,AAAA" } as const

describe("the carousel template", () => {
  it("draws one 1080 x 1350 section per slide, with the brand line and the counter", () => {
    const html = htmlDelCarrusel(ENTRADA)
    expect(html.match(/data-lamina=/g)).toHaveLength(6)
    expect(html).toContain("Constanza del Rosario · IA")
    expect(html).toContain("1 / 6")
    expect(html).toContain("6 / 6")
    expect(html).toContain("width: 1080px")
    expect(html).toContain("height: 1350px")
    expect(html).toContain("Desliza para leer")
    expect(html).toContain("Fuente: Stanford Medicine")
  })

  it("embeds the font and fetches nothing", () => {
    const html = htmlDelCarrusel(ENTRADA)
    expect(html).toContain('src: url("data:font/ttf;base64,AAAA")')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it("sets the variant's own colours", () => {
    const oscura = htmlDelCarrusel({ ...ENTRADA, variante: "oscura" })
    expect(oscura).toContain(`--papel: ${COLORES.oscura.papel}`)
    expect(oscura).toContain(`--acento: ${COLORES.oscura.acento}`)
  })

  it("escapes the text and highlights the first whole-word match only", () => {
    expect(escapar(`<b>"a" & 'b'</b>`)).toBe("&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;")
    expect(textoConDestacado("Tu voz, tu voz.", "voz")).toBe('Tu <span class="destacado">voz</span>, tu voz.')
    expect(textoConDestacado("Vozarrón y voz", "voz")).toBe('Vozarrón y <span class="destacado">voz</span>')
    expect(textoConDestacado("Sin <b>", undefined)).toBe("Sin &lt;b&gt;")
  })

  it("names the pillar only when there is one", () => {
    expect(marcaDelCarrusel("Pareja")).toBe("Constanza del Rosario · Pareja")
    expect(marcaDelCarrusel(null)).toBe("Constanza del Rosario")
  })

  it("sizes the letter by type and length, never by measuring", () => {
    expect(tamanoDeLetra({ tipo: "portada", texto: "x".repeat(40) })).toBe(104)
    expect(tamanoDeLetra({ tipo: "portada", texto: "x".repeat(90) })).toBe(76)
    expect(tamanoDeLetra({ tipo: "idea", texto: "x".repeat(90) })).toBe(72)
    expect(tamanoDeLetra({ tipo: "idea", texto: "x".repeat(220) })).toBe(52)
    expect(tamanoDeLetra({ tipo: "cierre", texto: "x".repeat(140) })).toBe(54)
  })
})

describe("fuenteDelCarrusel", () => {
  it("reads the committed serif as a data URL", async () => {
    const fuente = await fuenteDelCarrusel(join(process.cwd(), "assets/fuentes"))
    expect(fuente.startsWith("data:font/ttf;base64,")).toBe(true)
    expect(fuente.length).toBeGreaterThan(100_000)
  })

  it("says which file is missing as a configuration error", async () => {
    await expect(fuenteDelCarrusel("/no/existe")).rejects.toThrow(FallaDeConfiguracion)
  })
})
```

- [ ] **Step 3: Run it red**

Run: `pnpm test:run tests/unit/plantilla-carrusel.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: The palette** `lib/carrusel/plantilla/variantes.ts`

```ts
import type { Variante } from "@/lib/dominio/diseno-carrusel"

/**
 * The slides' own palette (design 2026-10-26, C7; decision P4). The template is its own design, published as a
 * document on LinkedIn, so it carries its own colours and not the app's tokens: this folder is the only place in the
 * repo where hex colours are allowed.
 */
export const COLORES: Record<Variante, { papel: string; tinta: string; suave: string; acento: string }> = {
  crema: { papel: "#F4EFE6", tinta: "#2B2420", suave: "#6B5F55", acento: "#9A3F2C" },
  piedra: { papel: "#E3E0D9", tinta: "#22262B", suave: "#5A5F66", acento: "#4F5D4A" },
  oscura: { papel: "#1E1B19", tinta: "#F2ECE2", suave: "#B9AFA3", acento: "#E0A96D" },
}
```

- [ ] **Step 5: The sizes** `lib/carrusel/plantilla/tipografia.ts`

```ts
import type { Lamina } from "@/lib/dominio/carrusel"

/** LinkedIn's 4:5 document page (design 2026-10-26, D4). */
export const ANCHO = 1080
export const ALTO = 1350

/**
 * The letter size of a slide, by its type and length (plan amendment 4). The template never shrinks text by itself, so a
 * text that does not fit overflows its box and the renderer can measure it.
 */
export function tamanoDeLetra(lamina: Lamina): number {
  const largo = [...lamina.texto].length
  switch (lamina.tipo) {
    case "portada":
      return largo <= 50 ? 104 : largo <= 80 ? 88 : 76
    case "cierre":
      return largo <= 80 ? 72 : largo <= 120 ? 62 : 54
    case "idea":
      return largo <= 90 ? 72 : largo <= 160 ? 60 : 52
  }
}
```

- [ ] **Step 6: The template** `lib/carrusel/plantilla/plantilla.ts`

```ts
import { FIRMA_DEL_CARRUSEL, type Lamina } from "@/lib/dominio/carrusel"
import type { Variante } from "@/lib/dominio/diseno-carrusel"
import { ALTO, ANCHO, tamanoDeLetra } from "./tipografia"
import { COLORES } from "./variantes"

/** The family name the template gives the committed serif (assets/fuentes/carrusel). */
export const FAMILIA_DEL_CARRUSEL = "Serif del carrusel"

export interface EntradaDePlantilla {
  laminas: readonly Lamina[]
  variante: Variante
  /** `Constanza del Rosario · <pilar corto>` (`marcaDelCarrusel`). */
  marca: string
  /** The serif as a data URL (`fuenteDelCarrusel`): nothing is fetched while rendering. */
  fuente: string
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (caracter) => ESCAPES[caracter] ?? caracter)
}

/** The slide's text with its highlighted word in the accent: the first time it appears as a whole word. */
export function textoConDestacado(texto: string, destacado: string | undefined): string {
  if (destacado === undefined) return escapar(texto)
  for (const palabra of texto.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (palabra[0] === destacado && palabra.index !== undefined) {
      const fin = palabra.index + palabra[0].length
      return `${escapar(texto.slice(0, palabra.index))}<span class="destacado">${escapar(palabra[0])}</span>${escapar(texto.slice(fin))}`
    }
  }
  return escapar(texto)
}

/** The brand line on every slide (C11, decision P5): her full name and the pillar's short name. */
export function marcaDelCarrusel(pilarCorto: string | null): string {
  return pilarCorto ? `${FIRMA_DEL_CARRUSEL} · ${pilarCorto}` : FIRMA_DEL_CARRUSEL
}

function estilos(variante: Variante, fuente: string): string {
  const color = COLORES[variante]
  return `
@font-face { font-family: "${FAMILIA_DEL_CARRUSEL}"; src: url("${fuente}") format("truetype"); font-weight: 200 800; font-display: block; }
@page { size: ${ANCHO}px ${ALTO}px; margin: 0; }
:root { --papel: ${color.papel}; --tinta: ${color.tinta}; --suave: ${color.suave}; --acento: ${color.acento}; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--papel); }
body { font-family: "${FAMILIA_DEL_CARRUSEL}", serif; color: var(--tinta); font-kerning: normal; -webkit-font-smoothing: antialiased; }
.lamina { width: ${ANCHO}px; height: ${ALTO}px; padding: 96px 96px 88px; display: flex; flex-direction: column; gap: 56px; background: var(--papel); overflow: hidden; }
.lamina + .lamina { break-before: page; }
.marca { display: flex; justify-content: space-between; align-items: baseline; gap: 32px; font-size: 24px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--suave); }
.contador { font-variant-numeric: tabular-nums; letter-spacing: 0.08em; }
.caja { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
.caja p { line-height: 1.22; font-weight: 400; text-wrap: pretty; }
.lamina--portada .caja p { font-weight: 600; line-height: 1.08; letter-spacing: -0.01em; }
.lamina--portada .caja::before { content: ""; display: block; width: 120px; border-top: 4px solid var(--acento); margin-bottom: 48px; }
.destacado { color: var(--acento); font-weight: 600; }
.pie { min-height: 36px; font-size: 26px; line-height: 1.35; color: var(--suave); }
`
}

function seccion(lamina: Lamina, indice: number, total: number, marca: string): string {
  const pie =
    lamina.tipo === "portada"
      ? "Desliza para leer"
      : lamina.tipo === "cierre" && lamina.fuente !== undefined
        ? escapar(lamina.fuente)
        : ""
  return `<section class="lamina lamina--${lamina.tipo}" data-lamina="${indice}">
<header class="marca"><span>${escapar(marca)}</span><span class="contador">${indice + 1} / ${total}</span></header>
<div class="caja" data-texto><p style="font-size: ${tamanoDeLetra(lamina)}px">${textoConDestacado(lamina.texto, lamina.destacado)}</p></div>
<footer class="pie">${pie}</footer>
</section>`
}

/**
 * The whole carousel as one HTML document (design 2026-10-26, D4, mockup `estilo-carrusel.html` option A): one
 * 1080 x 1350 section per slide, cream paper (or the chosen variant), a large serif. The renderer screenshots each
 * section and prints the document as a PDF with one page per section.
 */
export function htmlDelCarrusel(entrada: EntradaDePlantilla): string {
  const total = entrada.laminas.length
  const secciones = entrada.laminas.map((lamina, indice) => seccion(lamina, indice, total, entrada.marca)).join("\n")
  return `<!doctype html>
<html lang="es-CL"><head><meta charset="utf-8"><style>${estilos(entrada.variante, entrada.fuente)}</style></head>
<body>
${secciones}
</body></html>`
}
```

- [ ] **Step 7: The font reader** `lib/carrusel/fuente.ts`

```ts
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

/** Under the fonts folder (`CONI_FONTSDIR` or `assets/fuentes`): see assets/fuentes/README.md. */
export const ARCHIVO_DE_LA_FUENTE = "carrusel/Newsreader.ttf"

/** The committed serif as a data URL for the template. A missing file is a configuration error: no retry fixes it. */
export async function fuenteDelCarrusel(carpeta: string): Promise<string> {
  const ruta = join(carpeta, ARCHIVO_DE_LA_FUENTE)
  let bytes: Buffer
  try {
    bytes = await readFile(ruta)
  } catch (error) {
    throw new FallaDeConfiguracion(
      `Falta la letra del carrusel en ${ruta}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return `data:font/ttf;base64,${bytes.toString("base64")}`
}
```

- [ ] **Step 8: Run it green**

Run: `pnpm test:run tests/unit/plantilla-carrusel.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add assets/fuentes/carrusel assets/fuentes/README.md lib/carrusel tests/unit/plantilla-carrusel.test.ts
git commit -m "Add the carousel template and its committed OFL serif

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: The renderer, with real Chromium (PDF pages, PNG references, three variants)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (`playwright@1.59.1` in `dependencies`)
- Create: `lib/carrusel/render.ts`, `lib/carrusel/navegador.ts`
- Create: `tests/e2e/plantilla-carrusel.spec.ts` and its snapshots

- [ ] **Step 1: The runtime dependency.** The task imports `playwright`; Trigger.dev's `playwright()` extension marks
it external and installs exactly the version in the manifest, so it must be a real dependency, pinned to the version of
`@playwright/test`:

```bash
pnpm add playwright@1.59.1
grep '"playwright"' package.json   # "playwright": "1.59.1" under dependencies
```

- [ ] **Step 2: Write the failing spec** `tests/e2e/plantilla-carrusel.spec.ts`

```ts
import { join } from "node:path"
import { type Browser, expect, test } from "@playwright/test"
import { getDocumentProxy } from "unpdf"
import { fuenteDelCarrusel } from "@/lib/carrusel/fuente"
import { marcaDelCarrusel } from "@/lib/carrusel/plantilla/plantilla"
import { ALTO, ANCHO } from "@/lib/carrusel/plantilla/tipografia"
import { type EntradaDeRender, renderizarCarrusel } from "@/lib/carrusel/render"
import type { Lamina } from "@/lib/dominio/carrusel"
import { VARIANTES } from "@/lib/dominio/diseno-carrusel"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

// The real renderer in this machine's Chromium (design 2026-10-26, Tests: integration with real Playwright). It needs
// no app page: it opens its own pages from the test's browser.

const abrirEn = (browser: Browser) => async () => {
  const pagina = await browser.newPage({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 })
  return { pagina, cerrar: () => pagina.close() }
}

async function entrada(laminas: readonly Lamina[], variante: EntradaDeRender["variante"] = "crema"): Promise<EntradaDeRender> {
  return {
    laminas,
    variante,
    marca: marcaDelCarrusel("IA y salud"),
    fuente: await fuenteDelCarrusel(join(process.cwd(), "assets/fuentes")),
  }
}

/** Width and height from the PNG's IHDR chunk. */
function medidas(png: Uint8Array): { ancho: number; alto: number } {
  const vista = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { ancho: vista.getUint32(16), alto: vista.getUint32(20) }
}

test("renders one 1080 x 1350 PNG per slide and a PDF with as many pages", async ({ browser }) => {
  const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(LAMINAS_DE_PRUEBA))
  if (resultado.tipo !== "listo") throw new Error(`Desbordó: ${resultado.laminas.join(", ")}`)
  expect(resultado.pngs).toHaveLength(LAMINAS_DE_PRUEBA.length)
  for (const png of resultado.pngs) expect(medidas(png)).toEqual({ ancho: 1080, alto: 1350 })
  const pdf = await getDocumentProxy(resultado.pdf)
  expect(pdf.numPages).toBe(LAMINAS_DE_PRUEBA.length)
  const pagina = await pdf.getPage(1)
  const [, , ancho, alto] = pagina.view
  // CSS pixels print at 0.75 pt each.
  expect([Math.round(ancho ?? 0), Math.round(alto ?? 0)]).toEqual([810, 1013])
})

test("matches the committed reference of every slide (crema)", async ({ browser }) => {
  const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(LAMINAS_DE_PRUEBA))
  if (resultado.tipo !== "listo") throw new Error("Desbordó")
  resultado.pngs.forEach((png, i) => {
    expect(Buffer.from(png)).toMatchSnapshot(`crema-lamina-${i + 1}.png`, { maxDiffPixelRatio: 0.01 })
  })
})

for (const variante of VARIANTES) {
  test(`matches the reference of the portada and an idea in ${variante}`, async ({ browser }) => {
    const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(LAMINAS_DE_PRUEBA, variante))
    if (resultado.tipo !== "listo") throw new Error("Desbordó")
    expect(Buffer.from(resultado.pngs[0] ?? new Uint8Array())).toMatchSnapshot(`${variante}-portada.png`, { maxDiffPixelRatio: 0.01 })
    expect(Buffer.from(resultado.pngs[2] ?? new Uint8Array())).toMatchSnapshot(`${variante}-idea.png`, { maxDiffPixelRatio: 0.01 })
  })
}

test("says which slides overflow and renders nothing", async ({ browser }) => {
  const larga = "Una idea que no termina nunca y sigue y sigue. ".repeat(20).trim()
  const laminas = LAMINAS_DE_PRUEBA.map((lamina, i) => (i === 3 ? { ...lamina, texto: larga } : lamina))
  const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(laminas))
  expect(resultado).toEqual({ tipo: "desborda", laminas: [3] })
})

test("refuses to render when the font did not load", async ({ browser }) => {
  const sinLetra = { ...(await entrada(LAMINAS_DE_PRUEBA)), fuente: "data:font/ttf;base64,AAAA" }
  await expect(renderizarCarrusel(abrirEn(browser), sinLetra)).rejects.toThrow("La letra del carrusel no cargó")
})
```

- [ ] **Step 3: Run it red**

Run: `pnpm test:e2e tests/e2e/plantilla-carrusel.spec.ts`
Expected: FAIL (module `@/lib/carrusel/render` not found).

- [ ] **Step 4: The renderer** `lib/carrusel/render.ts`

```ts
import type { Page } from "playwright"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { type EntradaDePlantilla, FAMILIA_DEL_CARRUSEL, htmlDelCarrusel } from "./plantilla/plantilla"
import { ALTO, ANCHO } from "./plantilla/tipografia"

export type EntradaDeRender = EntradaDePlantilla

/** A page to render in, and how to let it go (close the page in tests, the whole browser in the task). */
export interface PaginaDeRender {
  pagina: Page
  cerrar(): Promise<void>
}
export type AbrirPagina = () => Promise<PaginaDeRender>

export type Render =
  /** Indexes of the slides whose text is taller than its box (plan amendment 4). Nothing was rendered. */
  | { tipo: "desborda"; laminas: number[] }
  | { tipo: "listo"; pngs: Uint8Array[]; pdf: Uint8Array }

/**
 * Renders a carousel version (design 2026-10-26, D4): loads the template, waits for the committed serif, measures every
 * text box, then screenshots each 1080 x 1350 slide and prints the same document as a PDF with one page per slide.
 */
export async function renderizarCarrusel(abrir: AbrirPagina, entrada: EntradaDeRender): Promise<Render> {
  const { pagina, cerrar } = await abrir()
  try {
    await pagina.setViewportSize({ width: ANCHO, height: ALTO })
    await pagina.setContent(htmlDelCarrusel(entrada), { waitUntil: "load" })
    // `document.fonts.check` answers true for a family nobody declared: ask for the faces themselves instead.
    const letraLista = await pagina.evaluate(async (familia) => {
      await document.fonts.ready
      const caras = await document.fonts.load(`64px "${familia}"`)
      return caras.length > 0 && caras.every((cara) => cara.status === "loaded")
    }, FAMILIA_DEL_CARRUSEL)
    if (!letraLista) throw new FallaDeConfiguracion("La letra del carrusel no cargó en Chromium.")

    const desbordadas = await pagina.$$eval("[data-texto]", (cajas) =>
      cajas.flatMap((caja, indice) => {
        const parrafo = caja.firstElementChild
        return parrafo && parrafo.getBoundingClientRect().height > caja.clientHeight + 1 ? [indice] : []
      }),
    )
    if (desbordadas.length > 0) return { tipo: "desborda", laminas: desbordadas }

    const secciones = pagina.locator("[data-lamina]")
    const pngs: Uint8Array[] = []
    for (let indice = 0; indice < entrada.laminas.length; indice += 1) {
      pngs.push(new Uint8Array(await secciones.nth(indice).screenshot({ type: "png", animations: "disabled" })))
    }
    const pdf = new Uint8Array(
      await pagina.pdf({ width: `${ANCHO}px`, height: `${ALTO}px`, printBackground: true, preferCSSPageSize: true }),
    )
    return { tipo: "listo", pngs, pdf }
  } finally {
    await cerrar()
  }
}
```

- [ ] **Step 5: The production launcher** `lib/carrusel/navegador.ts`

```ts
import { chromium } from "playwright"
import type { AbrirPagina } from "./render"

/**
 * Chromium for the `armar-carrusel` task: the headless shell Trigger.dev's `playwright()` extension installs
 * (PLAYWRIGHT_BROWSERS_PATH), or `PLAYWRIGHT_CHROMIUM_PATH` on a machine that has another one. One browser per render,
 * closed with the page. Only Trigger.dev code imports this file: `app/` must never bundle Chromium.
 */
export const abrirPaginaDeChromium: AbrirPagina = async () => {
  const navegador = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  })
  try {
    const pagina = await navegador.newPage({ deviceScaleFactor: 1 })
    return { pagina, cerrar: () => navegador.close() }
  } catch (error) {
    await navegador.close()
    throw error
  }
}
```

- [ ] **Step 6: Run the spec and write the references**

```bash
pnpm test:e2e tests/e2e/plantilla-carrusel.spec.ts --update-snapshots
pnpm test:e2e tests/e2e/plantilla-carrusel.spec.ts
ls tests/e2e/plantilla-carrusel.spec.ts-snapshots   # crema-lamina-1..6, {crema,piedra,oscura}-{portada,idea}
```

Expected: PASS; 12 reference PNGs. Open them: cream paper, the serif (not a fallback: compare a lowercase `g` with
Newsreader's specimen), brand line in small capitals top left, counter top right, `Desliza para leer` on the portada,
`silencio` in the accent on slide 3, the source line on slide 6; piedra and oscura with their palette and readable
contrast. A failure of the overflow test means the box sizes are wrong: fix `tamanoDeLetra` or the CSS, never the test.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/carrusel/render.ts lib/carrusel/navegador.ts tests/e2e/plantilla-carrusel.spec.ts tests/e2e/plantilla-carrusel.spec.ts-snapshots
git commit -m "Render carousels in Chromium: PNG per slide, PDF, overflow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Storage keys, and Chromium kept out of the app

**Files:**
- Modify: `lib/proveedores/almacen.ts`
- Modify: `tests/unit/almacen.test.ts`
- Create: `tests/unit/sin-chromium-en-la-app.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/almacen.test.ts`:

```ts
describe("carousel keys", () => {
  const PIEZA = "c0000000-0000-4000-8000-0000000000aa"
  const CARRUSEL = "11111111-1111-4111-8111-111111111111"

  it("puts every version's files under its own folder", () => {
    expect(claveLaminaDeCarrusel(PIEZA, CARRUSEL, 0)).toBe(`carruseles/${PIEZA}/${CARRUSEL}/lamina-01.png`)
    expect(claveLaminaDeCarrusel(PIEZA, CARRUSEL, 7)).toBe(`carruseles/${PIEZA}/${CARRUSEL}/lamina-08.png`)
    expect(clavePdfDeCarrusel(PIEZA, CARRUSEL)).toBe(`carruseles/${PIEZA}/${CARRUSEL}/carrusel.pdf`)
  })

  it("refuses ids that are not UUIDs and a slide past the eighth", () => {
    expect(() => claveLaminaDeCarrusel("x", CARRUSEL, 0)).toThrow(Error)
    expect(() => clavePdfDeCarrusel(PIEZA, "../otro")).toThrow(Error)
    expect(() => claveLaminaDeCarrusel(PIEZA, CARRUSEL, 8)).toThrow(Error)
  })
})
```

(import both from `@/lib/proveedores/almacen`). And `tests/unit/sin-chromium-en-la-app.test.ts`:

```ts
import { execSync } from "node:child_process"
import { describe, expect, it } from "vitest"

describe("the app never bundles Chromium", () => {
  it("no file under app/ or components/ imports playwright or the launcher", () => {
    const encontrados = execSync(
      "grep -rlE \"from ['\\\"](playwright|@/lib/carrusel/navegador|@/lib/produccion/deps-reales)['\\\"]\" app components || true",
      { encoding: "utf8" },
    ).trim()
    expect(encontrados).toBe("")
  })
})
```

- [ ] **Step 2: Run them red**

Run: `pnpm test:run tests/unit/almacen.test.ts tests/unit/sin-chromium-en-la-app.test.ts`
Expected: the keys FAIL (not exported); the guard passes already (it pins the rule).

- [ ] **Step 3: The keys** in `lib/proveedores/almacen.ts`, after `claveVideo`:

```ts
/** A version's slides are at most eight (`carrusel_hasta_ocho_laminas`). */
const LAMINAS_MAXIMAS = 8

/**
 * A carousel version's files (plan amendment 7): one folder per version, so a retried render overwrites its own files
 * and a design change (a new version) never touches what an earlier gate 2 saw.
 */
export function claveLaminaDeCarrusel(piezaId: string, carruselId: string, indice: number): string {
  exigirUuid(piezaId)
  exigirUuid(carruselId)
  if (!Number.isInteger(indice) || indice < 0 || indice >= LAMINAS_MAXIMAS) {
    throw new Error(`Lámina fuera de rango: ${indice}`)
  }
  return `carruseles/${piezaId}/${carruselId}/lamina-${String(indice + 1).padStart(2, "0")}.png`
}

export function clavePdfDeCarrusel(piezaId: string, carruselId: string): string {
  exigirUuid(piezaId)
  exigirUuid(carruselId)
  return `carruseles/${piezaId}/${carruselId}/carrusel.pdf`
}
```

- [ ] **Step 4: Run them green**

Run: `pnpm test:run tests/unit/almacen.test.ts tests/unit/sin-chromium-en-la-app.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/almacen.ts tests/unit/almacen.test.ts tests/unit/sin-chromium-en-la-app.test.ts
git commit -m "Add carousel storage keys and keep Chromium out of the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 4 checkpoint:** reviewer on Tasks 11 to 13, with the reference PNGs open. Focus: no network at render time; the
font check cannot pass on a fallback; the PDF has no trailing blank page; contrast of the three variants.

---

## Lote 5: The task `armar-carrusel`

### Task 14: Claude shortens the slides that overflow (`acortarLaminas`)

**Files:**
- Modify: `lib/proveedores/anthropic.ts`
- Create: `tests/unit/anthropic-acortar.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/anthropic-acortar.test.ts` (same harness as
`tests/unit/anthropic-carrusel.test.ts`: copy its `URL_MENSAJES`, `GUIA`, `USO`, `Cuerpo`, `respondiendo`, `mensaje`
and `cliente` helpers verbatim at the top of the file)

```ts
// @vitest-environment node
// (the shared helpers of anthropic-carrusel.test.ts go here, unchanged)
import { describe, expect, it } from "vitest"
import { acortarLaminas, MODELO_POR_TAREA, RechazoDeClaude } from "@/lib/proveedores/anthropic"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

describe("acortarLaminas", () => {
  it("asks only for the overflowing slides, with the cached guide, and returns their new text by index", async () => {
    const cuerpos = respondiendo(() => mensaje({ laminas: [{ numero: 3, texto: "No nota el silencio antes de responder." }] }))

    const { textos, uso } = await acortarLaminas({ cliente: cliente(), guia: GUIA, laminas: LAMINAS_DE_PRUEBA, largas: [2] })

    expect(textos).toEqual(new Map([[2, "No nota el silencio antes de responder."]]))
    expect(uso.input_tokens).toBe(1200)
    const cuerpo = cuerpos[0]
    expect(cuerpo?.model).toBe(MODELO_POR_TAREA.acortarLaminas.modelo)
    expect(cuerpo?.output_config.effort).toBe("low")
    expect(JSON.stringify(cuerpo?.system)).toContain('"cache_control"')
    const pedido = cuerpo?.messages[0]?.content ?? ""
    expect(pedido).toContain("Acorta solo estas láminas: 3")
    expect(pedido).toContain("3. No nota el silencio largo antes de una respuesta difícil.")
  })

  it("refuses an answer that does not return exactly the slides asked for", async () => {
    respondiendo(() => mensaje({ laminas: [{ numero: 4, texto: "Otra." }] }))
    await expect(
      acortarLaminas({ cliente: cliente(), guia: GUIA, laminas: LAMINAS_DE_PRUEBA, largas: [2] }),
    ).rejects.toThrow("Claude no devolvió las láminas que pedí acortar.")
  })

  it("passes a refusal through as RechazoDeClaude", async () => {
    respondiendo(() => mensaje({}, { stop_reason: "refusal", content: [] }))
    await expect(
      acortarLaminas({ cliente: cliente(), guia: GUIA, laminas: LAMINAS_DE_PRUEBA, largas: [2] }),
    ).rejects.toThrow(RechazoDeClaude)
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/anthropic-acortar.test.ts`
Expected: FAIL (`acortarLaminas` is not exported).

- [ ] **Step 3: The call** in `lib/proveedores/anthropic.ts`. In `MODELO_POR_TAREA`, after `revisarCarrusel`:

```ts
  // One automatic shortening of the slides that do not fit (plan 2026-10-27, amendment 3): a small rewrite.
  acortarLaminas: { modelo: "claude-opus-5-5", effort: "low" },
```

After `revisarCarruselConClaude`:

```ts
export const SalidaAcortado = z.object({
  laminas: z.array(z.object({ numero: z.number().int().min(1), texto: z.string().min(1) })).min(1),
})

function pedidoDeAcortado(laminas: readonly Lamina[], largas: readonly number[]): string {
  const lista = laminas.map((lamina, indice) => `${indice + 1}. ${lamina.texto}`).join("\n")
  const pedidas = largas.map((indice) => {
    const lamina = laminas[indice]
    const maximo = lamina ? Math.min(LARGO_DE_LAMINA[lamina.tipo], Math.floor([...lamina.texto].length * 0.75)) : 0
    return `- Lámina ${indice + 1}: máximo ${maximo} caracteres.`
  })
  return `Algunas láminas de un carrusel de LinkedIn de Coni del Rosario no caben en la plantilla. Acórtalas sin cambiar su idea, su tono ni su orden: de tú, en español de Chile, sin emojis, hashtags ni rayas largas, y sin agregar datos. No toques las demás. Devuelve solo las láminas pedidas, cada una con su número.

<laminas>
${sinCierre(lista)}
</laminas>

Acorta solo estas láminas: ${largas.map((indice) => indice + 1).join(", ")}
${pedidas.join("\n")}`
}

/**
 * Shortens the slides the renderer found too long (`largas`, 0-based). Returns the new text of exactly those slides by
 * index; anything else is a plain error Trigger.dev retries.
 */
export async function acortarLaminas(entrada: {
  cliente: Anthropic
  guia: string
  laminas: readonly Lamina[]
  largas: readonly number[]
}): Promise<{ textos: Map<number, string>; uso: UsoClaude }> {
  const { salida, uso } = await pedirJson(entrada.cliente, "acortarLaminas", {
    guia: entrada.guia,
    usuario: pedidoDeAcortado(entrada.laminas, entrada.largas),
    esquema: SalidaAcortado,
  })
  const pedidas = new Set(entrada.largas.map((indice) => indice + 1))
  const devueltas = new Set(salida.laminas.map((lamina) => lamina.numero))
  if (devueltas.size !== pedidas.size || [...pedidas].some((numero) => !devueltas.has(numero))) {
    throw new Error("Claude no devolvió las láminas que pedí acortar.")
  }
  return { textos: new Map(salida.laminas.map((lamina) => [lamina.numero - 1, lamina.texto])), uso }
}
```

(`Lamina`, `LARGO_DE_LAMINA` and `sinCierre` are already imported or defined in this file.)

- [ ] **Step 4: Run it green, with the other Anthropic tests**

Run: `pnpm test:run tests/unit/anthropic-acortar.test.ts tests/unit/anthropic-carrusel.test.ts tests/unit/anthropic-modelos.test.ts && pnpm type`
Expected: PASS. If `anthropic-modelos.test.ts` lists every task, add `acortarLaminas` with `claude-opus-5-5` / `low`.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/anthropic.ts tests/unit
git commit -m "Ask Claude to shorten only the slides that do not fit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Reading and writing a version's render (`lib/datos/carrusel.ts`)

**Files:**
- Modify: `lib/datos/carrusel.ts`
- Modify: `tests/integration/datos-carrusel.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/datos-carrusel.test.ts`; reuse its client and
cleanup; `sembrarCarrusel` from `./siembra`, `clienteDeServicio` from `./servicio`)

```ts
describe("a version's render", () => {
  it("reads the latest version with its design, state and files", async () => {
    const id = await sembrarCarrusel("carrusel_por_aprobar")
    piezasCreadas.push(id)
    const version = await leerVersionVigente(clienteDeServicio(), id)
    expect(version).toMatchObject({ diseno: { variante: "crema" }, estado: "listo", origen: "inicial" })
    expect(version?.pngClaves).toHaveLength(6)
    expect(version?.pdfClave).toMatch(/carrusel\.pdf$/)
    expect(await leerVersion(clienteDeServicio(), version?.id ?? "")).toEqual(version)
  })

  it("saves a render and moves the piece to gate 2, and answers null on a stale piece", async () => {
    const id = await sembrarCarrusel("armando_carrusel")
    piezasCreadas.push(id)
    const db = clienteDeServicio()
    const version = await leerVersionVigente(db, id)
    if (!version) throw new Error("sin versión")
    const pngs = version.laminas.map((_, i) => `carruseles/${id}/${version.id}/lamina-0${i + 1}.png`)
    const vieja = (await leerFila(id)).version - 1
    expect(await guardarArmado(db, { carruselId: version.id, versionLeida: vieja, pdf: "x.pdf", pngs })).toBeNull()

    const guardada = await guardarArmado(db, {
      carruselId: version.id,
      versionLeida: (await leerFila(id)).version,
      pdf: `carruseles/${id}/${version.id}/carrusel.pdf`,
      pngs,
    })
    expect(guardada?.estado).toBe("carrusel_por_aprobar")
  })

  it("marks the latest version fallo after a failed render, and leaves a rendered one alone", async () => {
    const id = await sembrarCarrusel("armando_carrusel")
    piezasCreadas.push(id)
    const db = clienteDeServicio()
    const version = await leerVersionVigente(db, id)
    await marcarVersion(db, version?.id ?? "", "armando")
    await marcarArmadoFallido(db, id)
    expect((await leerVersionVigente(db, id))?.estado).toBe("fallo")

    const lista = await sembrarCarrusel("carrusel_por_aprobar")
    piezasCreadas.push(lista)
    await marcarArmadoFallido(db, lista)
    expect((await leerVersionVigente(db, lista))?.estado).toBe("listo")
  })
})
```

- [ ] **Step 2: Run them red**

Run: `pnpm test:db tests/integration/datos-carrusel.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: The readers and writers** in `lib/datos/carrusel.ts` (imports: `DisenoDeCarrusel`, `leerDiseno` from
`@/lib/dominio/diseno-carrusel`):

```ts
export const ESTADOS_DE_VERSION = ["escrito", "armando", "listo", "fallo"] as const
export type EstadoDeVersion = (typeof ESTADOS_DE_VERSION)[number]

/** A version with what its render needs and produced (part 2). */
export interface VersionDeCarrusel extends CarruselVigente {
  diseno: DisenoDeCarrusel
  estado: EstadoDeVersion
  pdfClave: string | null
  pngClaves: string[]
}

const COLUMNAS_DE_VERSION = "id, version, laminas, texto_post, hash_texto, origen, pedido, diseno, estado, pdf_clave, png_claves"

interface FilaDeVersion {
  id: string
  version: number
  laminas: Json
  texto_post: string
  hash_texto: string
  origen: string
  pedido: string | null
  diseno: Json
  estado: string
  pdf_clave: string | null
  png_claves: string[]
}

function versionDesdeFila(fila: FilaDeVersion): VersionDeCarrusel {
  const estado = z.enum(ESTADOS_DE_VERSION).safeParse(fila.estado)
  if (!estado.success) throw new Error(`Estado de versión desconocido: ${fila.estado}`)
  return {
    id: fila.id,
    version: fila.version,
    laminas: leerLaminas(fila.laminas),
    textoPost: fila.texto_post,
    hashTexto: fila.hash_texto,
    origen: fila.origen,
    pedido: fila.pedido,
    diseno: leerDiseno(fila.diseno),
    estado: estado.data,
    pdfClave: fila.pdf_clave,
    pngClaves: fila.png_claves,
  }
}

/** The latest version of a carousel with its render: what the task renders and gate 2 shows. */
export async function leerVersionVigente(db: Db, piezaId: string): Promise<VersionDeCarrusel | null> {
  const { data, error } = await db
    .from("carruseles")
    .select(COLUMNAS_DE_VERSION)
    .eq("pieza_id", piezaId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw fallo("No pude leer la versión del carrusel", error)
  return data ? versionDesdeFila(data) : null
}

/** One version by id: the one gate 2 signed (`puerta2_carrusel_id`). */
export async function leerVersion(db: Db, carruselId: string): Promise<VersionDeCarrusel | null> {
  const { data, error } = await db.from("carruseles").select(COLUMNAS_DE_VERSION).eq("id", carruselId).maybeSingle()
  if (error) throw fallo("No pude leer la versión del carrusel", error)
  return data ? versionDesdeFila(data) : null
}

/** The render state of a version (the service's only write to a version outside the database functions). */
export async function marcarVersion(db: Db, carruselId: string, estado: "armando" | "fallo"): Promise<void> {
  const { error } = await db.from("carruseles").update({ estado }).eq("id", carruselId).neq("estado", "listo")
  if (error) throw fallo("No pude marcar la versión del carrusel", error)
}

/** After the last retry of a render: the latest version, if it was being rendered, failed. */
export async function marcarArmadoFallido(db: Db, piezaId: string): Promise<void> {
  const version = await leerVersionVigente(db, piezaId)
  if (version && (version.estado === "escrito" || version.estado === "armando")) {
    await marcarVersion(db, version.id, "fallo")
  }
}

/** `guardar_armado` (20261027000110). Null means the piece changed meanwhile. */
export async function guardarArmado(
  db: Db,
  entrada: { carruselId: string; versionLeida: number; pdf: string; pngs: string[] },
): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("guardar_armado", {
    p_carrusel: entrada.carruselId,
    p_version: entrada.versionLeida,
    p_pdf: entrada.pdf,
    p_pngs: entrada.pngs,
  })
  if (error) {
    if (error.message === ERROR_VERSION_DESFASADA) return null
    throw fallo("No pude guardar el carrusel armado", error)
  }
  return data
}

/** `guardar_acortado` (20261027000110). Null means the piece changed meanwhile. */
export async function guardarAcortado(
  db: Db,
  entrada: {
    carruselId: string
    versionLeida: number
    laminas: Json
    hashTexto: string
    revision: Json
    explicacion: string
    clave: string
    realUsd: number
  },
): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("guardar_acortado", {
    p_carrusel: entrada.carruselId,
    p_version: entrada.versionLeida,
    p_laminas: entrada.laminas,
    p_hash_texto: entrada.hashTexto,
    p_revision: entrada.revision,
    p_explicacion: entrada.explicacion,
    p_clave: entrada.clave,
    p_real: entrada.realUsd,
  })
  if (error) {
    if (error.message === ERROR_VERSION_DESFASADA) return null
    throw fallo("No pude guardar el carrusel acortado", error)
  }
  return data
}
```

Move `const ERROR_VERSION_DESFASADA` above its first use if the compiler asks.

- [ ] **Step 4: Run them green**

Run: `pnpm test:db tests/integration/datos-carrusel.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/carrusel.ts tests/integration/datos-carrusel.test.ts
git commit -m "Read and write a carousel version's render

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: `armarCarrusel`: render, upload, shorten once, or send back

**Files:**
- Create: `lib/produccion/armar-carrusel.ts`
- Modify: `lib/produccion/comun.ts`
- Create: `tests/integration/armar-carrusel.test.ts`

- [ ] **Step 1: Write the failing test** `tests/integration/armar-carrusel.test.ts`

```ts
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import type { EntradaDeRender, Render } from "@/lib/carrusel/render"
import { leerVersionVigente } from "@/lib/datos/carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { type DepsArmado, armarCarrusel } from "@/lib/produccion/armar-carrusel"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { comoConi, pool } from "./db"
import { aplicar } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, leerFila, sembrarCarrusel } from "./siembra"

const creadas: string[] = []
afterEach(() => servidor.resetHandlers())
afterAll(async () => {
  await borrarSembrado(creadas, [])
  await pool.end()
})

const PNG = new Uint8Array([137, 80, 78, 71])
const PDF = new Uint8Array([37, 80, 68, 70])

function doble(respuestas: Render[]) {
  const almacen = almacenEnMemoria()
  const avisos = notificadorEnMemoria()
  const pedidos: EntradaDeRender[] = []
  const deps: DepsArmado = {
    db: clienteDeServicio(),
    almacen,
    avisos,
    ahora: () => new Date().toISOString(),
    renderizar: async (entrada) => {
      pedidos.push(entrada)
      const respuesta = respuestas.shift()
      if (!respuesta) throw new Error("Se pidió un render de más")
      return respuesta
    },
    fuente: async () => "data:font/ttf;base64,AAAA",
    claude: async () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  }
  return { deps, almacen, avisos, pedidos }
}

const listo = (laminas: number): Render => ({ tipo: "listo", pngs: Array.from({ length: laminas }, () => PNG), pdf: PDF })

async function carrusel(destino: "armando_carrusel" | "carrusel_por_aprobar" = "armando_carrusel") {
  const id = await sembrarCarrusel(destino)
  creadas.push(id)
  return id
}

/** Coni signs the latest version again (after a shortening), with the real transition. */
async function firmarDeNuevo(id: string) {
  const v = await leerVersionVigente(clienteDeServicio(), id)
  if (!v) throw new Error("sin versión")
  const hash = hashTextoDeCarrusel(v)
  const c = await pool.connect()
  try {
    await aplicar(c, id, comoConi, {
      tipo: "firmar_carrusel",
      actor: "coni",
      hashVisto: hash,
      hashActual: hash,
      en: new Date(Date.now() - 60_000).toISOString(),
    })
  } finally {
    c.release()
  }
}

describe("armarCarrusel", () => {
  it("renders the signed version, uploads one PNG per slide and the PDF, and puts the piece at gate 2", async () => {
    const id = await carrusel()
    const d = doble([listo(6)])

    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "armado" })

    const version = await leerVersionVigente(clienteDeServicio(), id)
    expect(version?.estado).toBe("listo")
    expect(d.almacen.claves().sort()).toEqual([...(version?.pngClaves ?? []), version?.pdfClave].sort())
    expect(d.almacen.obtener(version?.pdfClave ?? "")?.tipo).toBe("application/pdf")
    expect((await leerFila(id)).estado).toBe("carrusel_por_aprobar")
    expect(d.pedidos[0]).toMatchObject({ variante: "crema", marca: expect.stringMatching(/^Constanza del Rosario/) })
  })

  it("does nothing the second time: the version is already rendered", async () => {
    const id = await carrusel()
    const d = doble([listo(6)])
    await armarCarrusel(d.deps, id)
    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "nada_que_hacer" })
    expect(d.pedidos).toHaveLength(1)
  })

  it("shortens only the overflowing slides once, as a new text that goes back to gate 1", async () => {
    const id = await carrusel()
    const cuerpos: string[] = []
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        cuerpos.push(JSON.stringify(await request.json()))
        return HttpResponse.json({
          id: "msg_prueba",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify({ laminas: [{ numero: 4, texto: "No ve cómo cambia tu voz." }] }) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 800 },
        })
      }),
    )
    const d = doble([{ tipo: "desborda", laminas: [3] }])

    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "acortado" })

    expect(cuerpos).toHaveLength(1)
    expect(cuerpos[0]).toContain("Acorta solo estas láminas: 4")
    const nueva = await leerVersionVigente(clienteDeServicio(), id)
    expect(nueva).toMatchObject({ origen: "acortado", estado: "escrito" })
    expect(nueva?.laminas[3]).toEqual({ tipo: "idea", texto: "No ve cómo cambia tu voz.", destacado: "voz" })
    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1_hash: null,
      explicacion: "Acorté la lámina 4 para que quepa. Léela y fírmala de nuevo.",
    })
    const { rows } = await pool.query("select estado from public.gastos where pieza_id = $1 and paso = 'carrusel'", [id])
    expect(rows).toEqual([{ estado: "confirmado" }])
    expect(d.almacen.claves()).toEqual([])
  })

  it("sends a shortened version that still overflows back to gate 1 without calling Claude again", async () => {
    const id = await carrusel()
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "msg_prueba",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify({ laminas: [{ numero: 4, texto: "No ve cómo cambia tu voz." }] }) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 800 },
        }),
      ),
    )
    await armarCarrusel(doble([{ tipo: "desborda", laminas: [3] }]).deps, id)
    await firmarDeNuevo(id)
    servidor.resetHandlers()

    const d = doble([{ tipo: "desborda", laminas: [3, 4] }])
    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "muy_largo" })

    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1_hash: null,
      explicacion: "Las láminas 4 y 5 quedaron muy largas. Pide un cambio para acortarlas.",
    })
    expect((await leerVersionVigente(clienteDeServicio(), id))?.estado).toBe("fallo")
  })

  it("leaves a piece that is not waiting for its slides alone", async () => {
    const id = await carrusel("carrusel_por_aprobar")
    const d = doble([])
    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "nada_que_hacer" })
  })
})
```

(`setup-msw.ts` fails any unhandled request, so the "without calling Claude again" case proves it: a call would throw.)

- [ ] **Step 2: Run it red**

Run: `pnpm test:db tests/integration/armar-carrusel.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: The estimate** in `lib/produccion/comun.ts`:

```ts
/** What one automatic shortening of a carousel's slides reserves with Claude (plan 2026-10-27, amendment 3). */
export const ESTIMADO_ACORTAR_CLAUDE_USD = 0.2
```

- [ ] **Step 4: The task's logic** `lib/produccion/armar-carrusel.ts`

```ts
import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { marcaDelCarrusel } from "@/lib/carrusel/plantilla/plantilla"
import type { EntradaDeRender, Render } from "@/lib/carrusel/render"
import {
  guardarAcortado,
  guardarArmado,
  laminasAJson,
  leerVersionVigente,
  marcarVersion,
  type VersionDeCarrusel,
} from "@/lib/datos/carrusel"
import { leerPilares } from "@/lib/datos/pilares"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  type FilaDePieza,
  leerGuiaVigente,
  leerIdea,
  leerPieza,
  liberarGasto,
  reservarGasto,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { esJuicioDeClaude, leerRevision } from "@/lib/datos/revision"
import { type Lamina, MAXIMO_CAMBIOS_DE_TEXTO, palabrasDe } from "@/lib/dominio/carrusel"
import { transicionar } from "@/lib/dominio/estados"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { pilarVisible } from "@/lib/dominio/pilares"
import { claveIdempotencia, hashTexto, hashTextoDeCarrusel, puedeArmar } from "@/lib/dominio/puertas"
import { ajenoDelRespaldo } from "@/lib/dominio/respaldo"
import { pideLineasDeAyuda, revisarCarrusel } from "@/lib/dominio/revision"
import { type Almacen, claveLaminaDeCarrusel, clavePdfDeCarrusel } from "@/lib/proveedores/almacen"
import { acortarLaminas, costoClaude, MODELO_POR_TAREA, RechazoDeClaude } from "@/lib/proveedores/anthropic"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { aCuatroDecimales, avisarTope, ESTIMADO_ACORTAR_CLAUDE_USD, piezaCambio } from "./comun"

export interface DepsArmado {
  /** A `service_role` client: the database functions keep the gates on everything it writes. */
  db: SupabaseClient<Database>
  almacen: Almacen
  avisos: Notificador
  ahora: () => string
  /** `renderizarCarrusel` with Chromium in production; a fake at this boundary in tests. */
  renderizar: (entrada: EntradaDeRender) => Promise<Render>
  /** The committed serif as a data URL (`fuenteDelCarrusel`). */
  fuente: () => Promise<string>
  /** Claude only for a shortening: a render alone never needs her key. */
  claude: () => Promise<Anthropic>
}

export type ResultadoArmado = { resultado: "armado" | "acortado" | "muy_largo" | "nada_que_hacer" }

const NADA: ResultadoArmado = { resultado: "nada_que_hacer" }

/** "4", "4 y 5", "2, 4 y 5", 1-based. */
function numeros(indices: readonly number[]): string {
  const lista = indices.map((indice) => String(indice + 1))
  return lista.length <= 1 ? (lista[0] ?? "") : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`
}

export function textoAcortada(indices: readonly number[]): string {
  return indices.length === 1
    ? `Acorté la lámina ${numeros(indices)} para que quepa. Léela y fírmala de nuevo.`
    : `Acorté las láminas ${numeros(indices)} para que quepan. Léelas y fírmalas de nuevo.`
}

export function textoMuyLarga(indices: readonly number[]): string {
  return indices.length === 1
    ? `La lámina ${numeros(indices)} quedó muy larga. Pide un cambio para acortarla.`
    : `Las láminas ${numeros(indices)} quedaron muy largas. Pide un cambio para acortarlas.`
}

async function pilarCortoDe(db: DepsArmado["db"], fila: FilaDePieza): Promise<string | null> {
  if (!fila.idea_id) return null
  const idea = await leerIdea(db, fila.idea_id)
  if (!idea) return null
  return pilarVisible(await leerPilares(db), idea.pilar)?.nombreCorto ?? null
}

/** Back to gate 1 with why (amendment 3); WAV hears about it when she has no text change left to fix it. */
async function devolver(deps: DepsArmado, fila: FilaDePieza, version: VersionDeCarrusel, explicacion: string) {
  await marcarVersion(deps.db, version.id, "fallo")
  const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "volver_a_firmar", explicacion })
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))
  if (!guardada) throw piezaCambio()
  if (fila.cambios_de_texto >= MAXIMO_CAMBIOS_DE_TEXTO) {
    await deps.avisos.aWav("Un carrusel no cabe y no le quedan cambios", `pieza ${fila.id} («${fila.titulo}»): ${explicacion}`)
  }
  return { resultado: "muy_largo" } as const
}

/** The new slides with Claude's shorter texts; a highlight survives only if its word is still there. */
function conTextosNuevos(laminas: readonly Lamina[], textos: ReadonlyMap<number, string>): Lamina[] {
  return laminas.map((lamina, indice) => {
    const nuevo = textos.get(indice)
    if (nuevo === undefined) return lamina
    const texto = nuevo.replace(/\r\n?/g, "\n").normalize("NFC").trim()
    const destacado = lamina.destacado !== undefined && palabrasDe(texto).includes(lamina.destacado) ? lamina.destacado : undefined
    return {
      tipo: lamina.tipo,
      texto,
      ...(destacado === undefined ? {} : { destacado }),
      ...(lamina.fuente === undefined ? {} : { fuente: lamina.fuente }),
    }
  })
}

/** The one automatic shortening (amendment 3): reserve, ask Claude, review, save as a new text back at gate 1. */
async function acortar(deps: DepsArmado, fila: FilaDePieza, version: VersionDeCarrusel, largas: number[]) {
  const { db } = deps
  const clave = claveIdempotencia({
    piezaId: fila.id,
    paso: "armar",
    hash: hashTexto(`acortar:${version.id}`),
    intento: fila.intento,
  })
  const reserva = await reservarGasto(db, {
    piezaId: fila.id,
    proveedor: "anthropic",
    paso: "carrusel",
    estimadoUsd: ESTIMADO_ACORTAR_CLAUDE_USD,
    clave,
    ahora: deps.ahora(),
  })
  if (reserva.tope) {
    await avisarTope(deps, fila)
    return devolver(deps, fila, version, textoMuyLarga(largas))
  }
  // A refusal released it before: asking again would only be refused again, and cost money.
  if (reserva.gasto.estado === "liberado") return devolver(deps, fila, version, textoMuyLarga(largas))

  const guia = await leerGuiaVigente(db)
  if (!guia) throw new FallaDeConfiguracion("No hay una guía editorial vigente.")
  let respuesta: Awaited<ReturnType<typeof acortarLaminas>>
  try {
    respuesta = await acortarLaminas({ cliente: await deps.claude(), guia: guia.texto, laminas: version.laminas, largas })
  } catch (error) {
    if (!(error instanceof RechazoDeClaude)) throw error
    await liberarGasto(db, clave)
    return devolver(deps, fila, version, textoMuyLarga(largas))
  }

  const laminas = conTextosNuevos(version.laminas, respuesta.textos)
  const actual = leerRevision(fila.revision)
  const juicios = actual.filter(esJuicioDeClaude)
  const idea = fila.idea_id ? await leerIdea(db, fila.idea_id) : null
  const requiereLineasAyuda =
    pideLineasDeAyuda(idea?.alertas ?? []) || juicios.some((hallazgo) => hallazgo.regla === "tema_de_riesgo")
  const revision = [
    ...revisarCarrusel({
      laminas,
      textoPost: version.textoPost,
      requiereLineasAyuda,
      ajeno: ajenoDelRespaldo(leerRespaldo(fila.respaldo)),
    }),
    ...juicios,
  ]
  const explicacion = textoAcortada(largas)
  // Validated here and applied by guardar_acortado, which repeats it in SQL.
  transicionar(piezaDesdeFila(fila), { tipo: "volver_a_firmar", explicacion })
  const guardada = await guardarAcortado(db, {
    carruselId: version.id,
    versionLeida: fila.version,
    laminas: laminasAJson(laminas),
    hashTexto: hashTextoDeCarrusel({ laminas, textoPost: version.textoPost }),
    revision: revisionAJson(revision),
    explicacion,
    clave,
    realUsd: aCuatroDecimales(costoClaude(respuesta.uso, MODELO_POR_TAREA.acortarLaminas.modelo)),
  })
  if (!guardada) throw piezaCambio()
  return { resultado: "acortado" } as const
}

/**
 * The `armar-carrusel` run (design 2026-10-26, D4): renders the latest version of a carousel in `armando_carrusel`,
 * uploads one PNG per slide and the PDF to R2 under the version's own keys, and puts the piece at gate 2. A version that
 * does not fit is shortened once or sent back to gate 1 (amendment 3). Safe to run again: the keys are per version and
 * `guardar_armado` refuses a version that is no longer waiting.
 */
export async function armarCarrusel(deps: DepsArmado, piezaId: string): Promise<ResultadoArmado> {
  const { db } = deps
  const fila = await leerPieza(db, piezaId)
  if (!fila || fila.tipo !== "carrusel" || fila.estado !== "armando_carrusel" || fila.explicacion !== null) return NADA
  const version = await leerVersionVigente(db, fila.id)
  if (!version) throw new Error(`El carrusel ${fila.id} espera sus láminas sin versión.`)
  if (version.estado === "listo") return NADA
  const veredicto = puedeArmar(piezaDesdeFila(fila), hashTextoDeCarrusel(version))
  // The database makes this impossible (proteger_pieza): a mismatch is a bug, never rendered.
  if (!veredicto.ok) throw new Error(`No armo el carrusel ${fila.id}: ${veredicto.motivo}`)

  await marcarVersion(db, version.id, "armando")
  const render = await deps.renderizar({
    laminas: version.laminas,
    variante: version.diseno.variante,
    marca: marcaDelCarrusel(await pilarCortoDe(db, fila)),
    fuente: await deps.fuente(),
  })
  if (render.tipo === "desborda") {
    return version.origen === "acortado"
      ? devolver(deps, fila, version, textoMuyLarga(render.laminas))
      : acortar(deps, fila, version, render.laminas)
  }

  const pngs = version.laminas.map((_, indice) => claveLaminaDeCarrusel(fila.id, version.id, indice))
  for (const [indice, clave] of pngs.entries()) {
    const bytes = render.pngs[indice]
    if (!bytes) throw new Error(`El render del carrusel ${fila.id} trajo menos láminas que la versión.`)
    await deps.almacen.subir(clave, bytes, "image/png")
  }
  const pdf = clavePdfDeCarrusel(fila.id, version.id)
  await deps.almacen.subir(pdf, render.pdf, "application/pdf")
  // Validated here and applied by guardar_armado, which repeats it in SQL.
  transicionar(piezaDesdeFila(fila), { tipo: "carrusel_armado" })
  const guardada = await guardarArmado(db, { carruselId: version.id, versionLeida: fila.version, pdf, pngs })
  if (!guardada) throw piezaCambio()
  return { resultado: "armado" }
}
```

`devolver` returns `muy_largo` also when the cap or a refusal stopped the shortening: what she reads is the same
("pide un cambio"), and `avisarTope` tells her about the cap.

- [ ] **Step 5: Run it green**

Run: `pnpm test:db tests/integration/armar-carrusel.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/produccion/armar-carrusel.ts lib/produccion/comun.ts tests/integration/armar-carrusel.test.ts
git commit -m "Render a signed carousel, shortening it once if it does not fit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Starting the render (signature, Reintentar, the ten-minute sweep)

**Files:**
- Modify: `lib/acciones/disparos.ts`, `lib/acciones/disparos-entorno.ts`
- Modify: `lib/acciones/piezas.ts` (`firmarCarrusel`, `reintentar`)
- Modify: `lib/datos/repositorio.ts` (`leerPiezasSinArrancar`)
- Modify: `lib/mantenimiento/arranques.ts`
- Modify: `tests/integration/acciones-carrusel.test.ts`, `tests/integration/acciones-piezas.test.ts`,
  `tests/integration/acciones-guion.test.ts`, `tests/integration/arranques.test.ts`,
  `tests/integration/mantenimiento-temas.test.ts`, `tests/unit/disparos.test.ts`, `tests/e2e/ayudas.ts`

- [ ] **Step 1: Write the failing tests.** `tests/unit/disparos.test.ts`:

```ts
describe("claveArmar", () => {
  it("is one key per piece, version and attempt", () => {
    const a = claveArmar("p", "11111111-1111-4111-8111-111111111111", 0)
    expect(a).toMatch(/^p:armar:[0-9a-f]{16}:0$/)
    expect(claveArmar("p", "11111111-1111-4111-8111-111111111111", 1)).not.toBe(a)
    expect(claveArmar("p", "22222222-2222-4222-8222-222222222222", 0)).not.toBe(a)
  })
})
```

In `tests/integration/acciones-carrusel.test.ts`, extend `Disparo["tarea"]` with `"armar"`, add to the `armar()` helper's
`disparar`:

```ts
      async armar(piezaId, clave) {
        if (fallos.armar) throw fallos.armar
        disparos.push({ tarea: "armar", piezaId, clave })
      },
```

(and `armar?: Error` to `fallos`), then replace the first `firmarCarrusel` test with:

```ts
  it("signs the latest version's text without an avatar and starts its render", async () => {
    const id = await carrusel()
    const { deps, disparos } = armar()
    const vista = await versionDe(id)

    expect(await firmarCarrusel(deps, id, vista)).toEqual({ ok: true, version: vista + 1 })

    const fila = await leerFila(id)
    expect(fila).toMatchObject({ estado: "armando_carrusel", puerta1_hash: HASH, puerta1_por: CONI, avatar_id: null })
    const { rows } = await pool.query("select id from public.carruseles where pieza_id = $1", [id])
    expect(disparos).toEqual([{ tarea: "armar", piezaId: id, clave: claveArmar(id, rows[0].id, fila.intento) }])
  })

  it("keeps the signature with a warning when the render does not start", async () => {
    const id = await carrusel()
    const { deps } = armar({ armar: new Error("Trigger.dev no responde") })
    const resultado = await firmarCarrusel(deps, id, await versionDe(id))
    expect(resultado).toMatchObject({
      ok: true,
      advertencia: "Quedó firmado, pero las láminas tardan en armarse. Si no avanzan, te aviso.",
    })
    expect((await leerFila(id)).estado).toBe("armando_carrusel")
  })

  it("retries a failed render as a new attempt and starts it again", async () => {
    const id = await sembrarCarrusel("error_produccion")
    piezasCreadas.push(id)
    const { deps, disparos } = armar()

    expect((await reintentar(deps, id, await versionDe(id))).ok).toBe(true)

    const fila = await leerFila(id)
    expect(fila).toMatchObject({ estado: "armando_carrusel", estado_antes_del_error: null, explicacion: null })
    expect(disparos).toMatchObject([{ tarea: "armar", piezaId: id }])
  })
```

(import `claveArmar` from `@/lib/acciones/disparos`, `reintentar` from `@/lib/acciones/piezas`). In
`acciones-piezas.test.ts` and `acciones-guion.test.ts`, add `armar: async () => undefined` (or a push in the same shape
as their other starters) to the `Disparos` literals. In `tests/integration/arranques.test.ts`, add to `doble`:

```ts
    dispararArmado: async (piezaId, clave) => {
      disparos.push({ tarea: "armar", piezaId, clave })
    },
```

(widen its `tarea` union with `"armar"`) and the case:

```ts
  it("asks again for the render of a carousel that has waited ten quiet minutes, with the app's key", async () => {
    const id = await sembrarCarrusel("armando_carrusel")
    piezasCreadas.push(id)
    const { deps, disparos } = doble(dentroDe(11))

    expect(await reanudarArranques(deps)).toContainEqual({ piezaId: id, tarea: "armar" })

    const leida = await fila(id)
    const { rows } = await pool.query("select id from public.carruseles where pieza_id = $1", [id])
    expect(disparos).toContainEqual({ tarea: "armar", piezaId: id, clave: claveArmar(id, rows[0].id, leida.intento) })
  })

  it("does not ask for a carousel signed a minute ago, nor for one the cap stopped", async () => {
    const reciente = await sembrarCarrusel("armando_carrusel")
    piezasCreadas.push(reciente)
    const { deps, disparos } = doble(dentroDe(1))
    await reanudarArranques(deps)
    expect(disparos.filter((d) => d.piezaId === reciente)).toEqual([])
  })
```

(import `sembrarCarrusel` from `./siembra` and `claveArmar` from `@/lib/acciones/disparos`). In
`tests/integration/mantenimiento-temas.test.ts` add `dispararArmado: async () => undefined` beside every
`dispararProduccion`. In `tests/e2e/ayudas.ts`, `tarea: z.enum(["producir", "grabar", "voz", "armar"])`.

- [ ] **Step 2: Run them red**

Run: `pnpm test:run tests/unit/disparos.test.ts; pnpm db:reset && pnpm test:db tests/integration/acciones-carrusel.test.ts tests/integration/arranques.test.ts`
Expected: FAIL (`claveArmar` missing; `Disparos` has no `armar`; nothing started).

- [ ] **Step 3: `lib/acciones/disparos.ts`.** Add to `Disparos`:

```ts
  /** One render of a carousel version (plan amendment 7). */
  armar(piezaId: string, clave: string): Promise<void>
```

and:

```ts
/** One render: the version (its own files) and the attempt, which Reintentar and a design change bump. */
export function claveArmar(piezaId: string, carruselId: string, intento: number): string {
  return claveIdempotencia({ piezaId, paso: "armar", hash: hashTexto(`carrusel:${carruselId}`), intento })
}
```

`lib/acciones/disparos-entorno.ts`: in `disparosReales` (import `type armarCarruselTask` from `@/trigger/armar-carrusel`,
created in Task 18; until then the type import fails `pnpm type`, so write Task 18 Step 3 first if you run the types
here):

```ts
    async armar(piezaId, clave) {
      await tasks.trigger<typeof armarCarruselTask>(
        "armar-carrusel",
        { piezaId },
        { idempotencyKey: await claveGlobal(clave) },
      )
    },
```

and in `disparosDePrueba`: `armar: async (piezaId, clave) => anotar({ tarea: "armar", piezaId, clave }),`.

To keep this task self-contained, create the task file now with its final content from Task 18 Step 3 (the trigger test
of Task 18 still drives its configuration).

- [ ] **Step 4: `lib/acciones/piezas.ts`.** Import `claveArmar`. Add:

```ts
const AVISO_ARMADO = "Quedó firmado, pero las láminas tardan en armarse. Si no avanzan, te aviso."

/** Starts the render of the carousel's latest version; a failure to start is a warning, the sweep is the net. */
async function iniciarArmado(deps: DepsAcciones, fila: FilaDePieza, aviso: string) {
  const carrusel = await leerCarruselVigente(deps.db, fila.id)
  if (!carrusel) throw new Error(`La pieza ${fila.id} va a armarse sin carrusel.`)
  return iniciar("armar-carrusel", () => deps.disparar.armar(fila.id, claveArmar(fila.id, carrusel.id, fila.intento)), aviso)
}
```

In `firmarCarrusel`, replace `return { version: firmada.version }` (and its doc line "Part 1 ends here: nothing starts")
with:

```ts
    const inicio = await iniciarArmado(deps, firmada, AVISO_ARMADO)
    return { version: firmada.version, ...inicio }
```

and update its doc comment to "The render starts at once (part 2); a run that fails to start is resumed by
`reanudarArranques`."

In `reintentar`, before the reel check:

```ts
    if (guardada.estado === "armando_carrusel") {
      return iniciarArmado(deps, guardada, "Lo intenté otra vez, pero las láminas tardan en armarse. Si no avanzan, te aviso.")
    }
```

- [ ] **Step 5: The sweep.** `lib/datos/repositorio.ts`, `leerPiezasSinArrancar` takes
`corte: { grabarAntesDe: string; producirAntesDe: string; armarAntesDe: string }` and returns
`{ aGrabar, aProducir, aArmar }`, with a third query in the `Promise.all`:

```ts
    db
      .from("piezas")
      .select("*")
      .eq("estado", "armando_carrusel")
      .is("explicacion", null)
      .lt("actualizada_en", corte.armarAntesDe)
      .order("actualizada_en"),
```

(`if (aArmar.error) throw fallo("No pude leer los carruseles sin armar", aArmar.error)`). `lib/mantenimiento/arranques.ts`:

```ts
  /** Starts `armar-carrusel` under this idempotency key (the key of the version and attempt). */
  dispararArmado: (piezaId: string, clave: string) => Promise<void>
```

in `DepsArranques`; `ResultadoArranque["tarea"]` becomes `"grabar" | "producir" | "armar"`; a constant
`const MINUTOS_SIN_ARMAR = 10` with the comment "A render takes about a minute: ten quiet minutes mean the run never
started. Carousels signed under part 1 are picked up here after the deploy (plan amendment 9)."; pass
`armarAntesDe: antesDe(MINUTOS_SIN_ARMAR)`; and add to `trabajos`:

```ts
    ...aArmar.map((fila) => ({
      fila,
      tarea: "armar" as const,
      arrancar: async () => {
        const carrusel = await leerCarruselVigente(deps.db, fila.id)
        if (!carrusel) throw new Error(`El carrusel ${fila.id} espera sus láminas sin versión.`)
        await deps.dispararArmado(fila.id, claveArmar(fila.id, carrusel.id, fila.intento))
      },
    })),
```

(import `claveArmar` from `@/lib/acciones/disparos` and `leerCarruselVigente` from `@/lib/datos/carrusel`). Update the
function's doc: "the net under that warning, for scripts, recordings and carousel renders".

- [ ] **Step 6: Run them green**, then every action and maintenance suite

Run: `pnpm test:run tests/unit/disparos.test.ts && pnpm test:db tests/integration/acciones-carrusel.test.ts tests/integration/acciones-piezas.test.ts tests/integration/acciones-guion.test.ts tests/integration/arranques.test.ts tests/integration/mantenimiento-temas.test.ts && pnpm type`
Expected: PASS (`pnpm type` needs Task 18's `trigger/armar-carrusel.ts` and the `depsFrecuente` change; do Task 18
Steps 3 to 5 in the same sitting if the compiler stops here, and commit them with Task 18).

- [ ] **Step 7: Commit**

```bash
git add lib/acciones lib/datos/repositorio.ts lib/mantenimiento/arranques.ts tests/unit/disparos.test.ts tests/integration tests/e2e/ayudas.ts
git commit -m "Start a carousel's render on signature and retry, and sweep the ones left

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: The Trigger.dev task, Chromium in the image, and its failure

**Files:**
- Create: `trigger/armar-carrusel.ts`
- Modify: `trigger.config.ts`, `trigger/mantenimiento.ts`
- Modify: `lib/produccion/deps-reales.ts`, `lib/produccion/fallas.ts`, `lib/mantenimiento/ejecutar.ts` (type only)
- Create: `tests/unit/armar-carrusel-task.test.ts`
- Modify: `tests/unit/grabar-pieza-task.test.ts`, `tests/integration/fallas.test.ts`

- [ ] **Step 1: Write the failing tests.** `tests/unit/armar-carrusel-task.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { armarCarruselTask, CONFIGURACION_ARMAR, ENTRADA_DE_ARMAR } from "../../trigger/armar-carrusel"

describe("armarCarruselTask", () => {
  it("loads with the id the app and the sweep trigger", () => {
    expect(armarCarruselTask.id).toBe("armar-carrusel")
  })

  it("runs on medium-1x, one at a time, and retries twice (plan amendment 8, decision P8)", () => {
    expect(CONFIGURACION_ARMAR.machine).toBe("medium-1x")
    expect(CONFIGURACION_ARMAR.queue).toEqual({ concurrencyLimit: 1 })
    expect(CONFIGURACION_ARMAR.retry.maxAttempts).toBe(3)
  })

  it("takes the piece id only", () => {
    const piezaId = "11111111-2222-4333-8444-555555555555"
    expect(ENTRADA_DE_ARMAR.parse({ piezaId })).toEqual({ piezaId })
    expect(ENTRADA_DE_ARMAR.safeParse({ piezaId: "x" }).success).toBe(false)
  })
})
```

In `tests/unit/grabar-pieza-task.test.ts` change the extension test to:

```ts
  it("adds ffmpeg, the fonts, a pg_dump as new as the database and Playwright's Chromium to the container", () => {
    const extensiones = (config.build?.extensions ?? []).map((extension) => extension.name)
    expect(extensiones).toEqual(["ffmpeg", "additionalFiles", "postgresql-client-17", "PlaywrightExtension"])
  })
```

In `tests/integration/fallas.test.ts`:

```ts
describe("a failed render of a carousel", () => {
  it("marks the version fallo and leaves the piece in error_produccion, retryable from armando_carrusel", async () => {
    const id = await sembrarCarrusel("armando_carrusel")
    piezasCreadas.push(id)
    const { deps, avisos } = doble()

    await avisarFalla(deps, { tarea: "armar-carrusel", corrida: "run_1", piezaId: id, error: new Error("Chromium murió") })

    expect(await pieza(id)).toMatchObject({
      estado: "error_produccion",
      estado_antes_del_error: "armando_carrusel",
      explicacion: "No pude armar el carrusel. WAV ya está revisando.",
    })
    const { rows } = await pool.query("select estado from public.carruseles where pieza_id = $1", [id])
    expect(rows).toEqual([{ estado: "fallo" }])
    expect(avisos.aConiEnviados.map((a) => a.mensaje)).toEqual(["No pude armar el carrusel. WAV ya está revisando."])
  })
})
```

(import `sembrarCarrusel` from `./siembra`).

- [ ] **Step 2: Run them red**

Run: `pnpm test:run tests/unit/armar-carrusel-task.test.ts tests/unit/grabar-pieza-task.test.ts; pnpm test:db tests/integration/fallas.test.ts`
Expected: FAIL.

- [ ] **Step 3: The task** `trigger/armar-carrusel.ts`

```ts
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { armarCarrusel } from "@/lib/produccion/armar-carrusel"
import { depsArmado, depsFalla } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/**
 * Chromium renders a carousel in a minute (design 2026-10-26, D4): medium-1x for its memory, one run at a time, two
 * retries before the piece goes to error_produccion (plan amendment 8). A shortening adds one Claude call.
 */
export const CONFIGURACION_ARMAR = {
  id: "armar-carrusel",
  machine: "medium-1x",
  maxDuration: 600,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 60000, randomize: true },
} as const

export const ENTRADA_DE_ARMAR = z.object({ piezaId: z.string().uuid() })

export const armarCarruselTask = schemaTask({
  ...CONFIGURACION_ARMAR,
  schema: ENTRADA_DE_ARMAR,
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the version is marked fallo and the piece waits in error_produccion for Reintentar.
  onFailure: alFallarDeTarea("armar-carrusel", depsFalla),
  run: async ({ piezaId }) => armarCarrusel(await depsArmado(), piezaId),
})
```

- [ ] **Step 4: Chromium in the image** (`trigger.config.ts`; API verified in `node_modules/@trigger.dev/build` 4.6.4:
`playwright({ browsers?, headless?, version? })` from `@trigger.dev/build/extensions/playwright`; it installs the
Debian dependencies and `chromium-headless-shell` for the `playwright` version it finds in the build's externals, sets
`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, and does nothing for `trigger dev`):

```ts
import { playwright } from "@trigger.dev/build/extensions/playwright"
```

and, last in `extensions`:

```ts
      // Chromium (headless shell) for armar-carrusel: the version comes from the `playwright` dependency.
      playwright({ browsers: ["chromium"], headless: true }),
```

- [ ] **Step 5: Real dependencies, the sweep's starter, and the failure.** `lib/produccion/deps-reales.ts`:

```ts
import { fuenteDelCarrusel } from "@/lib/carrusel/fuente"
import { abrirPaginaDeChromium } from "@/lib/carrusel/navegador"
import { renderizarCarrusel } from "@/lib/carrusel/render"
import type { DepsArmado } from "./armar-carrusel"

/** The dependencies of an `armar-carrusel` run. Claude is read only if a slide has to be shortened. */
export async function depsArmado(): Promise<DepsArmado> {
  const db = clienteDeServicio()
  return {
    db,
    almacen: almacenReal(),
    avisos: avisosReales(),
    ahora: () => new Date().toISOString(),
    renderizar: (entrada) => renderizarCarrusel(abrirPaginaDeChromium, entrada),
    fuente: () => fuenteDelCarrusel(carpetaDeFuentes()),
    claude: async () => {
      const llave = await leerSecreto(db, "anthropic")
      if (!llave) throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
      return new Anthropic({ apiKey: llave, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 })
    },
  }
}
```

(`clienteDeServicio` is defined below in the same file: move `depsArmado` after it.) `depsFrecuente` takes a third
starter and passes it through:

```ts
export function depsFrecuente(
  dispararGrabacion: DepsFrecuente["dispararGrabacion"],
  dispararProduccion: DepsFrecuente["dispararProduccion"],
  dispararArmado: DepsFrecuente["dispararArmado"],
): DepsFrecuente {
  return {
    db: clienteDeServicio(),
    avisos: avisosReales(),
    ahora: () => new Date().toISOString(),
    dispararGrabacion,
    dispararProduccion,
    dispararArmado,
    temas: depsTemas,
  }
}
```

`trigger/mantenimiento.ts`: import `armarCarruselTask` from `./armar-carrusel` and pass, as the third argument:

```ts
      async (piezaId, clave) => {
        const idempotencyKey = await idempotencyKeys.create(clave, { scope: "global" })
        await armarCarruselTask.trigger({ piezaId }, { idempotencyKey, idempotencyKeyTTL: "1d" })
      },
```

`lib/produccion/fallas.ts`, in `dejarConstancia`:

```ts
const GENERICO_CARRUSEL = "No pude armar el carrusel. WAV ya está revisando."
```

```ts
  const armado = entrada.tarea === "armar-carrusel" && fila.estado === "armando_carrusel"
  if (!guion && !video && !voz && !armado) return null
  const explicacion = paraConi(
    entrada.error,
    guion ? GENERICO_GUION : voz ? GENERICO_VOZ : armado ? GENERICO_CARRUSEL : GENERICO_VIDEO,
  )
  // The version that was being rendered failed (plan amendment 8); a retry renders it again.
  if (armado) await marcarArmadoFallido(deps.db, fila.id)
```

(import `marcarArmadoFallido` from `@/lib/datos/carrusel`; the `falla_produccion` event accepts `armando_carrusel`
since Task 7). `paraConi` already shows her only a `Falla` written for her: a `FallaDeConfiguracion` from the renderer
("La letra del carrusel no cargó en Chromium.") is not a `Falla` (`lib/dominio/falla.ts`), so she reads
`GENERICO_CARRUSEL` and WAV gets the detail.

- [ ] **Step 6: Run them green**, then everything

Run: `pnpm test:run && pnpm db:reset && pnpm test:db && pnpm type`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add trigger/armar-carrusel.ts trigger.config.ts trigger/mantenimiento.ts lib/produccion lib/mantenimiento/ejecutar.ts tests/unit tests/integration/fallas.test.ts
git commit -m "Add the armar-carrusel task with Playwright's Chromium

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 5 checkpoint:** reviewer on Tasks 14 to 18. Focus: the run never renders a version gate 1 did not sign; a retry
never pays twice for a shortening (same key, `confirmado` is impossible without the version saved); the sweep's key
equals the app's; no `app/` import of Chromium; `onFailure` marks only the latest unrendered version.

---

## Lote 6: Gate 2 actions and the manual upload

### Task 19: Gate 2 of a carousel: program, change the design, change the text

**Files:**
- Modify: `lib/acciones/piezas.ts`
- Modify: `app/(app)/piezas/acciones.ts`
- Modify: `tests/integration/acciones-carrusel.test.ts`, `tests/integration/acciones-piezas.test.ts`

- [ ] **Step 1: Write the failing tests** in `tests/integration/acciones-carrusel.test.ts` (imports: `aprobarCarrusel`,
`cambiarDisenoDeCarrusel`, `cambiarFecha`, `editarTextoLinkedin` from `@/lib/acciones/piezas`; `leerVersionVigente`
from `@/lib/datos/carrusel`; `clienteDeServicio` from `./servicio`)

```ts
const MANIANA = () => new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()

async function enPuerta2() {
  const id = await sembrarCarrusel("carrusel_por_aprobar")
  piezasCreadas.push(id)
  const version = await leerVersionVigente(clienteDeServicio(), id)
  if (!version) throw new Error("sin versión")
  return { id, version }
}

describe("aprobarCarrusel", () => {
  it("schedules the version she saw at the time she chose, and its LinkedIn row waits", async () => {
    const { id, version } = await enPuerta2()
    const { deps, disparos } = armar()
    const publicarEn = MANIANA()

    expect(await aprobarCarrusel(deps, id, await versionDe(id), version.id, publicarEn)).toEqual({ ok: true })

    const fila = await leerFila(id)
    expect(fila).toMatchObject({
      estado: "programado",
      puerta2_carrusel_id: version.id,
      puerta2_hash_texto: version.hashTexto,
      puerta2_video_id: null,
      puerta2_por: CONI,
    })
    expect(new Date(fila.puerta2_publicar_en).toISOString()).toBe(new Date(publicarEn).toISOString())
    expect(disparos).toEqual([])
  })

  it("refuses a version that is not the one on screen", async () => {
    const { id } = await enPuerta2()
    const resultado = await aprobarCarrusel(armar().deps, id, await versionDe(id), "11111111-1111-4111-8111-111111111111", MANIANA())
    expect(resultado).toEqual({ ok: false, error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo." })
    expect((await leerFila(id)).estado).toBe("carrusel_por_aprobar")
  })

  it("refuses a time another piece already has", async () => {
    const otra = await enPuerta2()
    const publicarEn = MANIANA()
    await aprobarCarrusel(armar().deps, otra.id, await versionDe(otra.id), otra.version.id, publicarEn)
    const { id, version } = await enPuerta2()
    expect(await aprobarCarrusel(armar().deps, id, await versionDe(id), version.id, publicarEn)).toEqual({
      ok: false,
      error: "Ese horario ya lo tiene otra pieza. Elige otro.",
    })
  })
})

describe("cambiarDisenoDeCarrusel", () => {
  it("writes a new version with the same words, keeps gate 1, does not count as a change and starts the render", async () => {
    const { id, version } = await enPuerta2()
    const { deps, disparos } = armar()

    const resultado = await cambiarDisenoDeCarrusel(deps, id, await versionDe(id), { tipo: "variante", variante: "oscura" })

    expect(resultado.ok).toBe(true)
    const nueva = await leerVersionVigente(clienteDeServicio(), id)
    expect(nueva).toMatchObject({ origen: "cambio_diseno", hashTexto: version.hashTexto, diseno: { variante: "oscura" } })
    const fila = await leerFila(id)
    expect(fila).toMatchObject({ estado: "armando_carrusel", puerta1_hash: version.hashTexto, cambios_de_texto: 0 })
    expect(disparos).toEqual([{ tarea: "armar", piezaId: id, clave: claveArmar(id, nueva?.id ?? "", fila.intento) }])
  })

  it("splits a slide and merges it back, keeping the hash each time", async () => {
    const { id, version } = await enPuerta2()
    expect((await cambiarDisenoDeCarrusel(armar().deps, id, await versionDe(id), { tipo: "dividir", lamina: 1 })).ok).toBe(true)
    expect((await leerVersionVigente(clienteDeServicio(), id))?.laminas).toHaveLength(version.laminas.length + 1)
    expect((await leerVersionVigente(clienteDeServicio(), id))?.hashTexto).toBe(version.hashTexto)
  })

  it("says why a change does not apply", async () => {
    const { id } = await enPuerta2()
    expect(await cambiarDisenoDeCarrusel(armar().deps, id, await versionDe(id), { tipo: "unir", lamina: 1 })).toEqual({
      ok: false,
      error: "Ese cambio de diseño no se puede hacer en esta lámina.",
    })
    expect(
      await cambiarDisenoDeCarrusel(armar().deps, id, await versionDe(id), { tipo: "variante", variante: "crema" }),
    ).toEqual({ ok: false, error: "Eso ya está así." })
  })
})

describe("gate 2's other ways out", () => {
  it("El texto: back to be rewritten, counting one of the three", async () => {
    const { id } = await enPuerta2()
    const { deps, disparos } = armar()
    expect((await pedirCambioDeCarrusel(deps, id, await versionDe(id), "Más cercano")).ok).toBe(true)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_en_proceso", cambios_de_texto: 1, puerta1_hash: null })
    expect(disparos).toMatchObject([{ tarea: "producir", piezaId: id }])
  })

  it("Cambiar la fecha: a scheduled carousel goes back to its gate 2", async () => {
    const id = await sembrarCarrusel("programado")
    piezasCreadas.push(id)
    expect((await cambiarFecha(armar().deps, id, await versionDe(id))).ok).toBe(true)
    expect(await leerFila(id)).toMatchObject({ estado: "carrusel_por_aprobar", puerta2_carrusel_id: null })
  })

  it("never edits piezas.texto_linkedin on a carousel (its post is signed at gate 1)", async () => {
    const id = await carrusel()
    const resultado = await editarTextoLinkedin(armar().deps, id, await versionDe(id), "Otro texto")
    expect(resultado.ok).toBe(false)
    expect((await leerFila(id)).texto_linkedin).toBeNull()
  })
})
```

In `tests/integration/acciones-piezas.test.ts`, where a reel's `aprobarVideo` refuses a taken slot, the message stays
`Ese horario ya lo tiene otro reel. Elige otro.` (unchanged).

- [ ] **Step 2: Run them red**

Run: `pnpm db:reset && pnpm test:db tests/integration/acciones-carrusel.test.ts`
Expected: FAIL (`aprobarCarrusel`, `cambiarDisenoDeCarrusel` not exported; `editarTextoLinkedin` accepts the carousel).

- [ ] **Step 3: The actions** in `lib/acciones/piezas.ts`. Imports: `leerVersionVigente` from `@/lib/datos/carrusel`;
`aplicarCambioDeDiseno`, `type CambioDeDiseno` from `@/lib/dominio/diseno-carrusel`; `laminasAJson` from
`@/lib/datos/carrusel`. In `traducir`, before `return error`:

```ts
  if (error.message.includes("diseno_invalido")) return new Falla("Ese cambio de diseño no se puede hacer en esta lámina.")
  if (error.message.includes("diseno_sin_cambio")) return new Falla(TEXTO_DISENO_SIN_CAMBIO)
```

with `const TEXTO_DISENO_SIN_CAMBIO = "Eso ya está así."`. Change `exigirHorarioLibre`:

```ts
async function exigirHorarioLibre(db: Db, piezaId: string, publicarEn: string, tipo: TipoDePieza = "reel"): Promise<void> {
  // ... unchanged query ...
  if (data.length > 0) {
    throw new Falla(tipo === "reel" ? "Ese horario ya lo tiene otro reel. Elige otro." : "Ese horario ya lo tiene otra pieza. Elige otro.")
  }
}
```

In `editarTextoLinkedin`, right after `exigirVersion(fila, versionVista)`:

```ts
    // A carousel's post is carruseles.texto_post, signed at gate 1 (plan amendment 11): never this reel column.
    if (fila.tipo !== "reel") throw new TransicionInvalida(fila.estado, "editar_texto")
```

and the doc comment of `ESTADOS_CON_TEXTO_DE_LINKEDIN_EDITABLE` gains: "Reels only: `carrusel_por_aprobar` is left out on
purpose (a carousel's post is part of `hash_texto`, changed only through Pedir cambio)."

New actions after `pedirCambioDeCarrusel`:

```ts
/**
 * Gate 2 of a carousel (design 2026-10-26, D1 step 5): the rendered version she saw, its words (the same gate 1
 * signed) and the time. The database binds it again (plan amendment 2). Nothing starts: at the time the publisher hands
 * it to her to upload (decision P1).
 */
export function aprobarCarrusel(
  deps: DepsAcciones,
  piezaId: string,
  versionVista: number,
  carruselVisto: string,
  publicarEn: string,
) {
  return aResultado("aprobarCarrusel", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista, new ArtefactoCambio())
    if (fila.tipo !== "carrusel" || fila.estado !== "carrusel_por_aprobar") {
      throw new TransicionInvalida(fila.estado, "aprobar_carrusel")
    }
    const version = await leerVersionVigente(deps.db, fila.id)
    if (!version || version.estado !== "listo") throw new Error(`La pieza ${fila.id} está en la puerta 2 sin láminas.`)
    const hash = hashTextoDeCarrusel(version)
    if (hash !== version.hashTexto) throw new Error(`El hash guardado del carrusel ${version.id} no es el de sus palabras.`)
    await exigirHorarioLibre(deps.db, fila.id, publicarEn, "carrusel")
    await guardarEvento(deps.db, fila, {
      tipo: "aprobar_carrusel",
      actor: "coni",
      carruselVisto,
      carruselActual: version.id,
      hashTextoVisto: hash,
      hashTextoActual: hash,
      publicarEn,
      en: deps.ahora(),
    })
    return {}
  })
}

const AVISO_DISENO = "Pedí el diseño nuevo, pero las láminas tardan en armarse. Si no avanzan, te aviso."

/**
 * "El diseño" at gate 2 (D5, plan amendment 5): one bounded change on the latest rendered version, as a new version with
 * the same words (so gate 1 stands and it is not one of her three changes), rendered again at once.
 */
export function cambiarDisenoDeCarrusel(deps: DepsAcciones, piezaId: string, versionVista: number, cambio: CambioDeDiseno) {
  return aResultado("cambiarDisenoDeCarrusel", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    if (fila.tipo !== "carrusel") throw new TransicionInvalida(fila.estado, "cambiar_diseno")
    // Validated here and applied by the function below, which repeats it in SQL.
    transicionar(piezaDesdeFila(fila), { tipo: "cambiar_diseno" })
    const version = await leerVersionVigente(deps.db, fila.id)
    if (!version || version.estado !== "listo") throw new Error(`La pieza ${fila.id} está en la puerta 2 sin láminas.`)
    const nuevo = aplicarCambioDeDiseno(version.laminas, version.diseno, cambio)
    if (hashTextoDeCarrusel({ laminas: nuevo.laminas, textoPost: version.textoPost }) !== version.hashTexto) {
      throw new Error(`Un cambio de diseño cambió las palabras del carrusel ${version.id}.`)
    }
    const { data, error } = await deps.db.rpc("cambiar_diseno_de_carrusel", {
      p_pieza: fila.id,
      p_version: fila.version,
      p_laminas: laminasAJson(nuevo.laminas),
      p_diseno: { variante: nuevo.diseno.variante },
    })
    if (error) throw traducir(new Error(error.message, { cause: error }))
    return iniciar(
      "armar-carrusel",
      () => deps.disparar.armar(fila.id, claveArmar(fila.id, data.id, fila.intento + 1)),
      AVISO_DISENO,
    )
  })
}
```

`pedirCambioDeCarrusel` needs no change: the domain and the SQL now accept `carrusel_por_aprobar`. `cambiarFecha` needs
none either (the domain sends a carousel to its own gate 2).

- [ ] **Step 4: The Server Actions** in `app/(app)/piezas/acciones.ts`:

```ts
const cambioDeDiseno = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("variante"), variante: z.enum(VARIANTES) }),
  z.object({ tipo: z.literal("dividir"), lamina: z.number().int().min(0).max(7) }),
  z.object({ tipo: z.literal("unir"), lamina: z.number().int().min(0).max(7) }),
  z.object({ tipo: z.literal("destacar"), lamina: z.number().int().min(0).max(7), palabra: z.string().max(80).nullable() }),
])

export async function aprobarCarruselAccion(piezaId: string, version: number, carruselId: string, publicarEn: string) {
  return refrescar(
    await comoConi(
      "aprobarCarrusel",
      sobrePieza.extend({ carruselId: z.uuid(), publicarEn: z.string().max(40) }),
      { piezaId, version, carruselId, publicarEn },
      (deps, d) => aprobarCarrusel(deps, d.piezaId, d.version, d.carruselId, d.publicarEn),
    ),
  )
}

export async function cambiarDisenoAccion(piezaId: string, version: number, cambio: CambioDeDiseno) {
  return refrescar(
    await comoConi(
      "cambiarDisenoDeCarrusel",
      sobrePieza.extend({ cambio: cambioDeDiseno }),
      { piezaId, version, cambio },
      (deps, d) => cambiarDisenoDeCarrusel(deps, d.piezaId, d.version, d.cambio),
    ),
  )
}
```

(imports: `aprobarCarrusel`, `cambiarDisenoDeCarrusel`; `type CambioDeDiseno`, `VARIANTES` from
`@/lib/dominio/diseno-carrusel`).

- [ ] **Step 5: Run them green**, then every action suite

Run: `pnpm test:db tests/integration/acciones-carrusel.test.ts tests/integration/acciones-piezas.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/acciones/piezas.ts "app/(app)/piezas/acciones.ts" tests/integration/acciones-carrusel.test.ts tests/integration/acciones-piezas.test.ts
git commit -m "Schedule a carousel at gate 2 and change its design or text there

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: The publisher hands a due carousel over and never calls LinkedIn for it

**Files:**
- Modify: `lib/publicacion/publicar.ts`
- Create: `tests/integration/publicar-carrusel.test.ts`

- [ ] **Step 1: Write the failing test** `tests/integration/publicar-carrusel.test.ts`

```ts
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { despues, PUBLICAR_EN } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, leerFila, publicacionesConDetalle, sembrarCarrusel } from "./siembra"

const creadas: string[] = []
afterAll(() => pool.end())
afterEach(async () => {
  await borrarSembrado(creadas, [])
  creadas.length = 0
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query("update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null")
})

function doble(ahora: () => string) {
  const avisos = notificadorEnMemoria()
  const deps: DepsPublicacion = {
    db: clienteDeServicio(),
    almacen: almacenEnMemoria(),
    avisos,
    ahora,
    dormir: async () => {},
    sondeo: { cadaMs: 60_000, veces: 5 },
    sondeoLinkedin: { cadaMs: 15_000, veces: 8 },
  }
  return { deps, avisos }
}

async function programado() {
  // Signed for a far future time (the real flow refuses a past one), then the clock of the run is moved to it.
  const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
  creadas.push(id)
  return id
}

describe("a scheduled carousel at its time (part 2: by hand only)", () => {
  beforeEach(async () => {
    await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:abc123XYZ', linkedin_nombre = 'Coni', linkedin_conectado_en = now(), linkedin_token_expira_en = '2031-12-31T00:00:00Z'",
    )
  })

  it("is handed to Coni to upload, with LinkedIn connected and not one call to LinkedIn", async () => {
    const id = await programado()
    const sim = simularLinkedin()
    const d = doble(() => despues(1))

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])

    expect(sim.iniciadas).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect((await leerFila(id)).estado).toBe("para_subir_a_mano")
    expect(await publicacionesConDetalle(id)).toMatchObject([{ destino: "linkedin", estado: "para_subir" }])
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toContain(
      "Tu carrusel «Lo que un chatbot no ve de ti» está listo para que lo subas a LinkedIn. Entra a la app para descargar el PDF y copiar el texto.",
    )
  })

  it("waits before its time", async () => {
    const id = await programado()
    expect(await publicarPendientes(doble(() => despues(-10)).deps)).toEqual([])
    expect((await leerFila(id)).estado).toBe("programado")
  })
})
```

`sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })`: `PUBLICAR_EN` (2031) is in the future, so the real
transition accepts it. If `simularLinkedin` returns a recorder whose fields differ (`iniciadas`, `posts` are the ones
`publicar-linkedin.test.ts` uses), keep those names.

- [ ] **Step 2: Run it red**

Run: `pnpm test:db tests/integration/publicar-carrusel.test.ts`
Expected: FAIL (the run treats the carousel as a reel: `guardia` on a missing `texto`, `falla_publicacion`).

- [ ] **Step 3: The handover** in `lib/publicacion/publicar.ts` (imports: `leerVersion` from `@/lib/datos/carrusel`,
`hashTextoDeCarrusel` from `@/lib/dominio/puertas`):

```ts
const EXPLICACION_CAMBIO_CARRUSEL =
  "El carrusel o su texto cambiaron después de que los aprobaste, así que no te lo dejé para subir. WAV ya está revisando."

/**
 * A carousel at its time (decision P1): handed to Coni to upload herself, with the PDF and the text. Part 2 never calls
 * LinkedIn for a carousel; part 3 adds the Documents API in front of this. It still has to be the version and words she
 * approved, and never before its time.
 */
async function entregarCarrusel(contexto: Contexto): Promise<ResultadoPublicacion> {
  const { fila } = contexto
  const pieza = piezaDesdeFila(fila)
  const version = fila.puerta2_carrusel_id ? await leerVersion(contexto.deps.db, fila.puerta2_carrusel_id) : null
  const veredicto = puedeEntregarseParaSubir(pieza, {
    hashTexto: version ? hashTextoDeCarrusel(version) : "",
    carruselId: version?.id,
    ahora: contexto.deps.ahora(),
  })
  if (!veredicto.ok) {
    if (veredicto.motivo === "antes_de_hora") return { piezaId: fila.id, resultado: "esperando" }
    if (veredicto.motivo === "estado") throw new Error(`La pieza ${fila.id} dejó de estar programada mientras se entregaba.`)
    return fallar(contexto, EXPLICACION_CAMBIO_CARRUSEL, `el carrusel aprobado y el guardado no coinciden (${veredicto.motivo})`)
  }
  await escribirTransicion(contexto, { tipo: "entregar_para_subir" })
  const mensaje = `Tu carrusel «${fila.titulo}» está listo para que lo subas a LinkedIn. Entra a la app para descargar el PDF y copiar el texto.`
  await avisar(contexto, () => contexto.deps.avisos.aConi(mensaje, true, avisoDe(contexto, "listo_para_subir")))
  return { piezaId: fila.id, resultado: "para_subir_a_mano" }
}
```

At the top of `procesar`'s `try`, before `resolverLinkedin`:

```ts
    // A carousel never reaches the reel's LinkedIn or Instagram paths (part 2: by hand only).
    if (contexto.fila.tipo === "carrusel") return await entregarCarrusel(contexto)
```

- [ ] **Step 4: Run it green**, then the publishing suites

Run: `pnpm test:db tests/integration/publicar-carrusel.test.ts tests/integration/publicar.test.ts tests/integration/publicar-linkedin.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/publicacion/publicar.ts tests/integration/publicar-carrusel.test.ts
git commit -m "Hand a due carousel to Coni and never call LinkedIn for it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: "Descargar PDF" and "Ya lo subí" for a carousel

**Files:**
- Modify: `lib/acciones/piezas.ts` (`pedirDescargaDelCarrusel`)
- Modify: `app/(app)/piezas/acciones.ts` (`descargarCarruselAccion`)
- Modify: `tests/integration/acciones-carrusel.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("the manual upload of a carousel", () => {
  const firmar = async (clave: string, nombre: string) => `https://almacen.test/${clave}?descarga=${nombre}`

  it("signs a short download of the approved PDF once it waits to be uploaded", async () => {
    const id = await sembrarCarrusel("para_subir_a_mano")
    piezasCreadas.push(id)
    const fila = await leerFila(id)
    const resultado = await pedirDescargaDelCarrusel(armar().deps, id, firmar)
    expect(resultado).toEqual({
      ok: true,
      url: `https://almacen.test/carruseles/${id}/${fila.puerta2_carrusel_id}/carrusel.pdf?descarga=carrusel-${id.slice(0, 8)}.pdf`,
    })
  })

  it("refuses before its time", async () => {
    const id = await sembrarCarrusel("programado")
    piezasCreadas.push(id)
    expect(await pedirDescargaDelCarrusel(armar().deps, id, firmar)).toEqual({
      ok: false,
      error: "Este carrusel ya no está esperando que lo subas.",
    })
  })

  it("Ya lo subí closes it with the link, as a reel's LinkedIn", async () => {
    const id = await sembrarCarrusel("para_subir_a_mano")
    piezasCreadas.push(id)
    const enlace = "https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/"
    expect((await marcarSubidoAMano(armar().deps, id, await versionDe(id), "linkedin", enlace)).ok).toBe(true)
    expect((await leerFila(id)).estado).toBe("publicado_a_mano")
    const { rows } = await pool.query("select estado, enlace from public.publicaciones where pieza_id = $1", [id])
    expect(rows).toEqual([{ estado: "subido_a_mano", enlace }])
  })
})
```

(imports: `pedirDescargaDelCarrusel`, `marcarSubidoAMano`).

- [ ] **Step 2: Run them red**

Run: `pnpm test:db tests/integration/acciones-carrusel.test.ts`
Expected: FAIL (`pedirDescargaDelCarrusel` is not exported; the last case passes already).

- [ ] **Step 3: The action**, after `pedirDescargaDelVideo` (import `leerVersion`):

```ts
const TEXTO_SIN_DESCARGA_PDF = "No pude preparar el PDF para descargarlo. Inténtalo de nuevo en unos minutos."

/**
 * The signed address of the approved carousel's PDF (decision P1), for ten minutes and with a name she recognises. It
 * goes from R2 to her phone; nothing passes through the server. Only once it waits to be uploaded (decision P7).
 */
export function pedirDescargaDelCarrusel(
  deps: DepsAcciones,
  piezaId: string,
  firmar: (clave: string, nombreDeArchivo: string) => Promise<string | null>,
) {
  return aResultado("pedirDescargaDelCarrusel", async () => {
    const { data: esConi, error } = await deps.db.rpc("es_coni")
    if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
    if (!esConi) throw new Falla("Esta app es solo para Coni.")
    const fila = await leerObligatoria(deps.db, piezaId)
    if (fila.tipo !== "carrusel" || fila.estado !== "para_subir_a_mano") {
      throw new Falla("Este carrusel ya no está esperando que lo subas.")
    }
    // The version she approved, not the latest one.
    const version = fila.puerta2_carrusel_id ? await leerVersion(deps.db, fila.puerta2_carrusel_id) : null
    if (!version?.pdfClave) throw new Error(`La pieza ${fila.id} espera subirse sin el PDF aprobado.`)
    const url = await firmar(version.pdfClave, `carrusel-${fila.id.slice(0, 8)}.pdf`)
    if (url === null) throw new Falla(TEXTO_SIN_DESCARGA_PDF)
    return { url }
  })
}
```

In `app/(app)/piezas/acciones.ts`:

```ts
/** Not revalidated: it only hands out a link and changes nothing on the piece. */
export async function descargarCarruselAccion(piezaId: string) {
  return comoConi("pedirDescargaDelCarrusel", z.object({ piezaId: z.uuid() }), { piezaId }, (deps, d) =>
    pedirDescargaDelCarrusel(deps, d.piezaId, urlParaDescargar),
  )
}
```

- [ ] **Step 4: Run them green**

Run: `pnpm test:db tests/integration/acciones-carrusel.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/piezas.ts "app/(app)/piezas/acciones.ts" tests/integration/acciones-carrusel.test.ts
git commit -m "Let Coni download a carousel's PDF and mark it uploaded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 6 checkpoint:** reviewer on Tasks 19 to 21. Focus: gate 2 binds what the screen showed (version id from the
screen, hash from the row, SQL rechecks); a design change can never move a word; the publisher's carousel branch comes
before any provider call; the download signs the approved version only.

---

## Lote 7: Screens

### Task 22: The slider can say "Desliza para programar"

**Files:**
- Modify: `lib/diseno/deslizador.ts`, `components/deslizar-para-aprobar.tsx`
- Modify: `tests/unit/deslizar-aprobar.test.tsx`

- [ ] **Step 1: Write the failing test** (append to `tests/unit/deslizar-aprobar.test.tsx`)

```tsx
  it("takes another label for a gate that schedules, and keeps 'Desliza para firmar' by default", () => {
    const { rerender } = render(<DeslizarParaAprobar habilitado alFirmar={() => {}} />)
    expect(screen.getByRole("slider", { name: "Desliza para firmar" })).toBeInTheDocument()
    rerender(
      <DeslizarParaAprobar
        habilitado
        etiqueta={ETIQUETA_DE_PROGRAMAR}
        etiquetaCorta={ETIQUETA_CORTA_DE_PROGRAMAR}
        alFirmar={() => {}}
      />,
    )
    expect(screen.getByRole("slider", { name: "Desliza para programar" })).toBeInTheDocument()
  })
```

(import `ETIQUETA_DE_PROGRAMAR`, `ETIQUETA_CORTA_DE_PROGRAMAR` from `@/lib/diseno/deslizador`).

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/deslizar-aprobar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: The labels.** `lib/diseno/deslizador.ts`, beside `ETIQUETA_DE_FIRMA`:

```ts
/** Gate 2 of a carousel schedules (design 2026-10-26, D1 step 5): the same track with its own words. */
export const ETIQUETA_DE_PROGRAMAR = "Desliza para programar"
export const ETIQUETA_CORTA_DE_PROGRAMAR = "Programar"
```

`components/deslizar-para-aprobar.tsx`: add to `PropiedadesDeDeslizar`

```ts
  /** The track's name; "Desliza para firmar" unless the gate says otherwise. */
  etiqueta?: string
  /** The short label shown at large text sizes. */
  etiquetaCorta?: string
```

destructure them with defaults `etiqueta = ETIQUETA_DE_FIRMA, etiquetaCorta = ETIQUETA_CORTA_DE_FIRMA`, and use
`etiqueta` where the component reads `ETIQUETA_DE_FIRMA` (lines 208 and 248) and `etiquetaCorta` where it reads
`ETIQUETA_CORTA_DE_FIRMA` (line 251).

- [ ] **Step 4: Run it green**

Run: `pnpm test:run tests/unit/deslizar-aprobar.test.tsx && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/diseno/deslizador.ts components/deslizar-para-aprobar.tsx tests/unit/deslizar-aprobar.test.tsx
git commit -m "Let the signature track say Desliza para programar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 23: Gate 2 of a carousel (client screen)

**Files:**
- Create: `app/(app)/fechas-de-puerta-2.ts`
- Modify: `app/(app)/video/[id]/page.tsx` (uses it; no behaviour change)
- Create: `app/(app)/guion/[id]/falta-para-programar.ts`, `riel-de-laminas.tsx`, `texto-del-post.tsx`,
  `cambio-de-diseno.tsx`, `puerta-2-carrusel.tsx`
- Modify: `app/(app)/guion/[id]/textos.ts`
- Create: `tests/unit/falta-para-programar.test.ts`, `tests/unit/riel-de-laminas.test.tsx`,
  `tests/unit/cambio-de-diseno.test.tsx`, `tests/unit/puerta-2-carrusel.test.tsx`

- [ ] **Step 1: Write the failing tests.** `tests/unit/falta-para-programar.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { faltaParaProgramarCarrusel } from "@/app/(app)/guion/[id]/falta-para-programar"

describe("faltaParaProgramarCarrusel", () => {
  it("blocks without a free time, asks to see every slide, then opens", () => {
    expect(faltaParaProgramarCarrusel({ vioTodas: true, hayFecha: false })).toEqual({
      tipo: "bloqueo",
      texto: "No hay un horario libre. Avísale a Federico.",
    })
    expect(faltaParaProgramarCarrusel({ vioTodas: false, hayFecha: true })).toEqual({
      tipo: "falta",
      cosas: ["ver todas las láminas"],
    })
    expect(faltaParaProgramarCarrusel({ vioTodas: true, hayFecha: true })).toEqual({ tipo: "nada" })
  })
})
```

`tests/unit/riel-de-laminas.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RielDeLaminas } from "@/app/(app)/guion/[id]/riel-de-laminas"

const LAMINAS = [
  { texto: "Portada", url: "https://almacen.test/1.png" },
  { texto: "Idea", url: "https://almacen.test/2.png" },
  { texto: "Cierre", url: null },
]

describe("RielDeLaminas", () => {
  it("shows every slide with its words as the image's name", () => {
    render(<RielDeLaminas laminas={LAMINAS} alVerTodas={() => {}} />)
    expect(screen.getByRole("img", { name: "Lámina 1 de 3: Portada" })).toHaveAttribute("src", "https://almacen.test/1.png")
    expect(screen.getByRole("img", { name: "Lámina 3 de 3: Cierre" })).toBeInTheDocument()
    expect(screen.getByText("Lámina 1 de 3")).toBeInTheDocument()
  })

  it("says when she reached the last slide, once", () => {
    const alVerTodas = vi.fn()
    render(<RielDeLaminas laminas={LAMINAS} alVerTodas={alVerTodas} />)
    fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    expect(alVerTodas).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    expect(screen.getByText("Lámina 3 de 3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Lámina siguiente" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Lámina anterior" }))
    fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    expect(alVerTodas).toHaveBeenCalledTimes(1)
  })
})
```

`tests/unit/cambio-de-diseno.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

const { cambiarDisenoAccion } = vi.hoisted(() => ({
  cambiarDisenoAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
}))
vi.mock("@/app/(app)/piezas/acciones", () => ({ cambiarDisenoAccion }))

import { CambioDeDiseno } from "@/app/(app)/guion/[id]/cambio-de-diseno"

beforeEach(() => vi.clearAllMocks())

const pintar = () =>
  render(
    <CambioDeDiseno piezaId="p" version={3} laminas={LAMINAS_DE_PRUEBA} diseno={{ variante: "crema" }} alHacerlo={() => {}} />,
  )

describe("CambioDeDiseno", () => {
  it("changes the colours", async () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Oscura" }))
    fireEvent.click(screen.getByRole("button", { name: "Rehacer el diseño" }))
    await waitFor(() =>
      expect(cambiarDisenoAccion).toHaveBeenCalledWith("p", 3, { tipo: "variante", variante: "oscura" }),
    )
  })

  it("splits only a slide that can be split", async () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Dividir en dos" }))
    expect(screen.getAllByRole("option").map((opcion) => opcion.textContent)).toEqual(["Lámina 2 · Idea"])
    fireEvent.click(screen.getByRole("button", { name: "Rehacer el diseño" }))
    await waitFor(() => expect(cambiarDisenoAccion).toHaveBeenCalledWith("p", 3, { tipo: "dividir", lamina: 1 }))
  })

  it("says when no slide allows a change", () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Unir con la siguiente" }))
    expect(screen.getByText("Ninguna lámina permite este cambio ahora.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rehacer el diseño" })).toBeDisabled()
  })

  it("highlights one of the slide's own words, or none", async () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Palabra destacada" }))
    fireEvent.change(screen.getByLabelText("Lámina"), { target: { value: "2" } })
    fireEvent.change(screen.getByLabelText("Palabra destacada"), { target: { value: "largo" } })
    fireEvent.click(screen.getByRole("button", { name: "Rehacer el diseño" }))
    await waitFor(() =>
      expect(cambiarDisenoAccion).toHaveBeenCalledWith("p", 3, { tipo: "destacar", lamina: 2, palabra: "largo" }),
    )
  })
})
```

`tests/unit/puerta-2-carrusel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"

vi.mock("@/app/(app)/piezas/acciones", () => ({
  aprobarCarruselAccion: vi.fn(),
  cambiarDisenoAccion: vi.fn(),
  pedirCambioDeCarruselAccion: vi.fn(),
  descartarAccion: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { PantallaPuerta2Carrusel } from "@/app/(app)/guion/[id]/puerta-2-carrusel"

const DATOS = {
  id: "p",
  version: 7,
  titulo: "Lo que un chatbot no ve de ti",
  pilar: null,
  carruselId: "11111111-1111-4111-8111-111111111111",
  laminas: LAMINAS_DE_PRUEBA,
  imagenes: LAMINAS_DE_PRUEBA.map((_, i) => `https://almacen.test/${i}.png`),
  diseno: { variante: "crema" as const },
  textoPost: TEXTO_POST_DE_PRUEBA,
  fechas: [{ iso: "2026-10-29T22:00:00.000Z", etiqueta: "jueves 29 de octubre · 19:00", corta: "jueves 29 · 19:00" }],
  cambiosQuedan: 2,
}

describe("PantallaPuerta2Carrusel", () => {
  it("opens 'Desliza para programar' only after the last slide was seen", () => {
    render(<PantallaPuerta2Carrusel datos={DATOS} />)
    const pista = screen.getByRole("slider", { name: "Desliza para programar" })
    expect(pista).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/ver todas las láminas/)).toBeInTheDocument()
    for (let i = 1; i < LAMINAS_DE_PRUEBA.length; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    }
    expect(pista).toHaveAttribute("aria-disabled", "false")
    expect(screen.getByText("Sale el jueves 29 · 19:00")).toBeInTheDocument()
  })

  it("folds the post text and offers both kinds of change and the discard", () => {
    render(<PantallaPuerta2Carrusel datos={DATOS} />)
    expect(screen.getByRole("button", { name: "Ver texto completo" })).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(screen.getByText("Pedir cambio"))
    expect(screen.getByRole("radio", { name: /El texto/ })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /El diseño/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Descartar esta pieza" })).toBeInTheDocument()
  })
})
```

`MasOpciones forma="boton"` is a disclosure; `fireEvent.click(screen.getByText("Pedir cambio"))` opens it the way the
gate 1 tests do (check `tests/unit/pantalla-carrusel*.test.tsx` for the exact query part 1 used, and use the same).

- [ ] **Step 2: Run them red**

Run: `pnpm test:run tests/unit/falta-para-programar.test.ts tests/unit/riel-de-laminas.test.tsx tests/unit/cambio-de-diseno.test.tsx tests/unit/puerta-2-carrusel.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Shared dates** `app/(app)/fechas-de-puerta-2.ts` (moved from `video/[id]/page.tsx`, same logic)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { conLaPropuestaPrimero, ocupadasEnLaPuerta, propuestaVigente } from "@/lib/calendario/propuestas"
import { leerContextoDeFechas } from "@/lib/datos/pantallas"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import type { Database } from "@/lib/supabase/database.types"
import type { FechaPropuesta } from "./video/[id]/pantalla-video"

const UNA_HORA_MS = 60 * 60 * 1000
const FECHAS_A_OFRECER = 4

/**
 * The times gate 2 offers, reel or carousel: free slots of her schedule at least an hour ahead, with the piece's live
 * proposal (`fechas_propuestas`, from Repartir) first. Also the zone, for the labels of a scheduled piece.
 */
export async function fechasDePuerta2(
  db: SupabaseClient<Database>,
  piezaId: string,
  ahora: number,
): Promise<{ fechas: FechaPropuesta[]; zona: string }> {
  const contexto = await leerContextoDeFechas(db, piezaId)
  const ocupadas = ocupadasEnLaPuerta(contexto, ahora)
  const tomadas = new Set(ocupadas.map((iso) => Date.parse(iso)))
  const propuesta = propuestaVigente(contexto.propuesta, { ahora, tomadas, antelacionMs: UNA_HORA_MS })
  const fechas = conLaPropuestaPrimero(
    proponerFechas({ ahora, horario: contexto.horario, ocupadas, cuantas: FECHAS_A_OFRECER, antelacionMs: UNA_HORA_MS }),
    propuesta,
    FECHAS_A_OFRECER,
  ).map((iso) => ({
    iso,
    etiqueta: etiquetaDeFecha(iso, contexto.horario.zona, "larga"),
    corta: etiquetaDeFecha(iso, contexto.horario.zona, "corta"),
  }))
  return { fechas, zona: contexto.horario.zona }
}
```

In `video/[id]/page.tsx`, replace the block from `const contexto = await leerContextoDeFechas(db, fila.id)` through the
`.map(...)` that builds `fechas` with `const { fechas, zona } = await fechasDePuerta2(db, fila.id, ahora)`, use `zona`
where it read `contexto.horario.zona` (`leerCostoDeGrabar`), and remove the now unused imports and constants. The video
tests and baselines must not change.

- [ ] **Step 4: Copy** in `app/(app)/guion/[id]/textos.ts` (decision P11):

```ts
export const TEXTO_ARMANDO = "Estoy armando las láminas"
export const TEXTO_ARMANDO_DETALLE = "Tarda un par de minutos. Te aviso cuando estén para que elijas la fecha."
export const TEXTO_NO_ARME = "No pude armar el carrusel"
export const TEXTO_DESLIZA_RIEL = "Desliza para leerlo completo"
export const TEXTO_ASI_SALE = "Así sale en LinkedIn"
export const TEXTO_CUANDO_SALE = "Cuándo sale"
export const TEXTO_CAMBIO_TEXTO = "Vuelve a la firma del texto y cuenta como uno de tus 3 cambios."
export const TEXTO_CAMBIO_DISENO = "Rehago las láminas con el mismo texto. No cuenta como cambio."
export const TEXTO_SIN_LAMINA_PARA_CAMBIO = "Ninguna lámina permite este cambio ahora."
export const TEXTO_PROGRAMADO_CARRUSEL = "A esa hora te dejo el PDF y el texto para que lo subas a LinkedIn."
```

- [ ] **Step 5: `falta-para-programar.ts`**

```ts
import { SIN_HORARIO } from "../../video/[id]/falta-para-firmar"

export type FaltaParaProgramar =
  | { tipo: "nada" }
  | { tipo: "bloqueo"; texto: string }
  | { tipo: "falta"; cosas: string[] }

/** What keeps a carousel's gate 2 closed: no free time blocks; otherwise she has to have seen every slide. */
export function faltaParaProgramarCarrusel(estado: { vioTodas: boolean; hayFecha: boolean }): FaltaParaProgramar {
  if (!estado.hayFecha) return { tipo: "bloqueo", texto: SIN_HORARIO }
  return estado.vioTodas ? { tipo: "nada" } : { tipo: "falta", cosas: ["ver todas las láminas"] }
}
```

- [ ] **Step 6: `riel-de-laminas.tsx`** (mockup `puerta-2-carrusel.html` option A)

```tsx
"use client"

import { useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { TEXTO_DESLIZA_RIEL } from "./textos"

export interface LaminaDelRiel {
  texto: string
  /** A signed R2 link of an hour (`urlParaVer`); null when it could not be signed. */
  url: string | null
}

const SEPARACION_PX = 12

/**
 * The slides at reading size, one after another as LinkedIn shows them (design 2026-10-26, C6). Swiping, the buttons
 * or the keyboard move it; reaching the last slide is what gate 2 asks before scheduling.
 */
export function RielDeLaminas({ laminas, alVerTodas }: { laminas: readonly LaminaDelRiel[]; alVerTodas: () => void }) {
  const riel = useRef<HTMLOListElement>(null)
  const vioTodas = useRef(false)
  const [actual, setActual] = useState(0)
  const total = laminas.length

  function llegar(indice: number) {
    setActual(indice)
    if (indice === total - 1 && !vioTodas.current) {
      vioTodas.current = true
      alVerTodas()
    }
  }

  function ir(indice: number) {
    const destino = Math.max(0, Math.min(total - 1, indice))
    // jsdom has no scrollIntoView: the optional call keeps the unit tests honest about the index alone.
    riel.current?.children[destino]?.scrollIntoView?.({ behavior: "smooth", inline: "start", block: "nearest" })
    llegar(destino)
  }

  function alDesplazar() {
    const elemento = riel.current
    const ancho = elemento?.firstElementChild?.clientWidth ?? 0
    if (elemento && ancho > 0) llegar(Math.round(elemento.scrollLeft / (ancho + SEPARACION_PX)))
  }

  return (
    <div className="grid gap-3">
      <p className="text-meta text-apagado">{TEXTO_DESLIZA_RIEL}</p>
      <ol
        ref={riel}
        onScroll={alDesplazar}
        aria-label="Láminas"
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      >
        {laminas.map((lamina, indice) => {
          const nombre = `Lámina ${indice + 1} de ${total}: ${lamina.texto}`
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a slide's place is its identity within a version
            <li key={indice} className="w-[82%] shrink-0 snap-start list-none">
              {lamina.url ? (
                <img
                  src={lamina.url}
                  alt={nombre}
                  width={1080}
                  height={1350}
                  className="block aspect-[4/5] w-full rounded-bloque shadow-relieve"
                />
              ) : (
                <div
                  role="img"
                  aria-label={nombre}
                  className="flex aspect-[4/5] w-full items-center rounded-bloque bg-piedra-honda p-4 text-meta"
                >
                  {lamina.texto}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex items-center justify-between gap-3">
        <Boton variante="callado" tamano="chico" deshabilitado={actual === 0} onClick={() => ir(actual - 1)}>
          Lámina anterior
        </Boton>
        <p aria-live="polite" className="text-meta tabular-nums">
          Lámina {actual + 1} de {total}
        </p>
        <Boton variante="callado" tamano="chico" deshabilitado={actual === total - 1} onClick={() => ir(actual + 1)}>
          Lámina siguiente
        </Boton>
      </div>
      <p aria-hidden="true" className="text-center text-meta tracking-[3px] text-apagado">
        {laminas.map((_, indice) => (indice === actual ? "●" : "○")).join(" ")}
      </p>
    </div>
  )
}
```

If Biome reports a rule on `tabIndex={0}` of the scrollable list (a keyboard user must reach it) or on the plain
`<img>` (a signed link of an hour, which `next/image` would cache past its expiry), add a `biome-ignore` with exactly
that reason on that line; an unused suppression is itself an error, so add none preemptively. If `Boton` renders
`deshabilitado` as `aria-disabled` rather than `disabled`, assert that attribute in the tests instead of
`toBeDisabled()`.

- [ ] **Step 7: `texto-del-post.tsx`**

```tsx
"use client"

import { useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

/** The post as it goes on LinkedIn, folded to four lines with "Ver texto completo" (mockup option A). */
export function TextoDelPost({ texto }: { texto: string }) {
  const [completo, setCompleto] = useState(false)
  const id = useId()
  return (
    <div className="grid gap-2">
      <Panel>
        <p id={id} className={cn("whitespace-pre-wrap text-cuerpo leading-prosa", !completo && "line-clamp-4")}>
          {texto}
        </p>
      </Panel>
      <Boton
        variante="callado"
        tamano="chico"
        aria-expanded={completo}
        aria-controls={id}
        onClick={() => setCompleto((actual) => !actual)}
      >
        {completo ? "Ver menos" : "Ver texto completo"}
      </Boton>
    </div>
  )
}
```

- [ ] **Step 8: `cambio-de-diseno.tsx`**

```tsx
"use client"

import { useId, useState } from "react"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { Eleccion } from "@/components/ui/filas"
import { useAccion } from "@/components/use-accion"
import { type Lamina, nombreDeLamina } from "@/lib/dominio/carrusel"
import {
  type CambioDeDiseno as Cambio,
  type DisenoDeCarrusel,
  NOMBRE_DE_VARIANTE,
  palabrasDestacables,
  puedeDividir,
  puedeUnir,
  VARIANTES,
  type Variante,
} from "@/lib/dominio/diseno-carrusel"
import { cambiarDisenoAccion } from "../../piezas/acciones"
import { TEXTO_CAMBIO_DISENO, TEXTO_SIN_LAMINA_PARA_CAMBIO } from "./textos"

const QUE = [
  { valor: "variante", etiqueta: "Colores" },
  { valor: "dividir", etiqueta: "Dividir en dos" },
  { valor: "unir", etiqueta: "Unir con la siguiente" },
  { valor: "destacar", etiqueta: "Palabra destacada" },
] as const
type Que = (typeof QUE)[number]["valor"]

/** "El diseño" at gate 2 (D5): one bounded change at a time, never a free-text request. */
export function CambioDeDiseno({
  piezaId,
  version,
  laminas,
  diseno,
  alHacerlo,
}: {
  piezaId: string
  version: number
  laminas: readonly Lamina[]
  diseno: DisenoDeCarrusel
  alHacerlo: () => void
}) {
  const [que, setQue] = useState<Que>("variante")
  const [variante, setVariante] = useState<Variante>(diseno.variante)
  const [lamina, setLamina] = useState<number | null>(null)
  const [palabra, setPalabra] = useState("")
  const accion = useAccion()
  const idLamina = useId()
  const idPalabra = useId()

  const posibles = laminas
    .map((l, indice) => ({ l, indice }))
    .filter(({ indice }) =>
      que === "dividir" ? puedeDividir(laminas, indice) : que === "unir" ? puedeUnir(laminas, indice) : true,
    )
  const elegida = posibles.find(({ indice }) => indice === lamina) ?? posibles[0]

  function elCambio(): Cambio | null {
    if (que === "variante") return variante === diseno.variante ? null : { tipo: "variante", variante }
    if (!elegida) return null
    if (que === "destacar") return { tipo: "destacar", lamina: elegida.indice, palabra: palabra === "" ? null : palabra }
    return { tipo: que, lamina: elegida.indice }
  }
  const cambio = elCambio()

  return (
    <div className="grid gap-4">
      <p className="text-meta text-apagado">{TEXTO_CAMBIO_DISENO}</p>
      <fieldset className="elecciones grid border-0 p-0">
        <legend className="sr-only">Qué cambias</legend>
        {QUE.map((opcion) => (
          <Eleccion
            key={opcion.valor}
            nombre="que-diseno"
            valor={opcion.valor}
            elegido={que === opcion.valor}
            etiqueta={opcion.etiqueta}
            alElegir={(valor) => setQue(QUE.find((o) => o.valor === valor)?.valor ?? "variante")}
          />
        ))}
      </fieldset>

      {que === "variante" ? (
        <fieldset className="elecciones grid border-0 p-0">
          <legend className="mb-2 text-meta font-semibold">Colores</legend>
          {VARIANTES.map((v) => (
            <Eleccion
              key={v}
              nombre="variante"
              valor={v}
              elegido={variante === v}
              etiqueta={NOMBRE_DE_VARIANTE[v]}
              alElegir={(valor) => setVariante(VARIANTES.find((candidata) => candidata === valor) ?? diseno.variante)}
            />
          ))}
        </fieldset>
      ) : posibles.length === 0 ? (
        <p className="text-meta text-apagado">{TEXTO_SIN_LAMINA_PARA_CAMBIO}</p>
      ) : (
        <div className="grid gap-3">
          <label htmlFor={idLamina} className="text-meta font-semibold">
            Lámina
          </label>
          <select
            id={idLamina}
            className="campo w-full text-cuerpo"
            value={elegida?.indice ?? ""}
            onChange={(evento) => {
              setLamina(Number(evento.target.value))
              setPalabra("")
            }}
          >
            {posibles.map(({ l, indice }) => (
              <option key={indice} value={indice}>
                {nombreDeLamina(l, indice)}
              </option>
            ))}
          </select>
          {que === "destacar" && elegida ? (
            <>
              <label htmlFor={idPalabra} className="text-meta font-semibold">
                Palabra destacada
              </label>
              <select
                id={idPalabra}
                className="campo w-full text-cuerpo"
                value={palabra}
                onChange={(evento) => setPalabra(evento.target.value)}
              >
                <option value="">Ninguna</option>
                {palabrasDestacables(elegida.l).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      )}

      {accion.error ? <Bloque tipo="error" titulo={accion.error} /> : null}
      <Boton
        variante="secundario"
        deshabilitado={cambio === null}
        cargando={accion.pendiente}
        onClick={() => {
          if (cambio) accion.ejecutar(() => cambiarDisenoAccion(piezaId, version, cambio), alHacerlo)
        }}
      >
        Rehacer el diseño
      </Boton>
    </div>
  )
}
```

(the "Palabra destacada" radio and the select share a name: the test reaches the select with `getByLabelText`, which
resolves the `<label htmlFor>`; if it finds two, give the select the label `Palabra` and update the test).

- [ ] **Step 9: `puerta-2-carrusel.tsx`**

```tsx
"use client"

import { useCallback, useId, useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { Seccion } from "@/components/seccion"
import { BarraDeFirma, LineaDeFalta, ResumenListo } from "@/components/ui/barra-de-firma"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { FilaMeta } from "@/components/ui/fila-meta"
import { Eleccion } from "@/components/ui/filas"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Volver } from "@/components/ui/volver"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import { ETIQUETA_CORTA_DE_PROGRAMAR, ETIQUETA_DE_PROGRAMAR } from "@/lib/diseno/deslizador"
import { type Lamina, MAXIMO_DEL_PEDIDO, TEXTO_SIN_CAMBIOS_DE_TEXTO } from "@/lib/dominio/carrusel"
import type { DisenoDeCarrusel } from "@/lib/dominio/diseno-carrusel"
import type { PilarVisible } from "@/lib/dominio/pilares"
import { DescartarPieza } from "../../descartar-pieza"
import { aprobarCarruselAccion, pedirCambioDeCarruselAccion } from "../../piezas/acciones"
import type { FechaPropuesta } from "../../video/[id]/pantalla-video"
import { CambioDeDiseno } from "./cambio-de-diseno"
import { faltaParaProgramarCarrusel } from "./falta-para-programar"
import { RielDeLaminas } from "./riel-de-laminas"
import { TextoDelPost } from "./texto-del-post"
import {
  TEXTO_ASI_SALE,
  TEXTO_AYUDA_DEL_PEDIDO,
  TEXTO_CAMBIO_DISENO,
  TEXTO_CAMBIO_TEXTO,
  TEXTO_CARRUSEL_DE_LINKEDIN,
  TEXTO_CUANDO_SALE,
  textoCambiosQuedan,
} from "./textos"

export interface DatosDePuerta2Carrusel {
  id: string
  version: number
  titulo: string
  pilar: PilarVisible | null
  /** The rendered version on screen: what the signature binds. */
  carruselId: string
  laminas: Lamina[]
  /** One signed PNG link per slide, in order (null when it could not be signed). */
  imagenes: (string | null)[]
  diseno: DisenoDeCarrusel
  textoPost: string
  fechas: FechaPropuesta[]
  cambiosQuedan: number
}

/**
 * Gate 2 of a carousel (design 2026-10-26, D1 step 5, mockup `puerta-2-carrusel.html` option A): the rail of slides,
 * the post, "Pedir cambio" (el texto, el diseño), the date and "Desliza para programar".
 */
export function PantallaPuerta2Carrusel({ datos }: { datos: DatosDePuerta2Carrusel }) {
  const redibujar = useRedibujar()
  const firma = useAccion()
  const cambio = useAccion()
  const [vioTodas, setVioTodas] = useState(false)
  const verTodas = useCallback(() => setVioTodas(true), [])
  const [fecha, setFecha] = useState(datos.fechas[0]?.iso ?? null)
  const [cambiandoFecha, setCambiandoFecha] = useState(false)
  const [queCambia, setQueCambia] = useState<"texto" | "diseno">("texto")
  const [pedido, setPedido] = useState("")
  const idFalta = useId()
  const idConsecuencia = useId()
  const idPedido = useId()
  const idAyuda = useId()

  const fechaElegida = datos.fechas.find((propuesta) => propuesta.iso === fecha)
  const falta = faltaParaProgramarCarrusel({ vioTodas, hayFecha: fechaElegida !== undefined })
  const errorDeAccion = firma.error ?? cambio.error

  return (
    <div>
      <header data-pilar={datos.pilar?.slug} className="grid gap-3">
        <Volver href="/">Inicio</Volver>
        <FilaMeta
          className="mt-2"
          pilar={datos.pilar?.nombreCorto}
          largo={`${TEXTO_CARRUSEL_DE_LINKEDIN} · ${datos.laminas.length} láminas`}
        />
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
      </header>

      <div className="mt-4">
        <RielDeLaminas
          laminas={datos.laminas.map((lamina, indice) => ({ texto: lamina.texto, url: datos.imagenes[indice] ?? null }))}
          alVerTodas={verTodas}
        />
      </div>

      <Seccion titulo={TEXTO_ASI_SALE} id="texto-del-post">
        <TextoDelPost texto={datos.textoPost} />
        <MasOpciones forma="boton" titulo="Pedir cambio">
          <fieldset className="elecciones grid border-0 p-0">
            <legend className="mb-2 text-meta font-semibold">¿Qué quieres cambiar?</legend>
            <Eleccion
              nombre="que-cambia"
              valor="texto"
              elegido={queCambia === "texto"}
              etiqueta="El texto"
              detalle={TEXTO_CAMBIO_TEXTO}
              alElegir={() => setQueCambia("texto")}
            />
            <Eleccion
              nombre="que-cambia"
              valor="diseno"
              elegido={queCambia === "diseno"}
              etiqueta="El diseño"
              detalle={TEXTO_CAMBIO_DISENO}
              alElegir={() => setQueCambia("diseno")}
            />
          </fieldset>
          {queCambia === "diseno" ? (
            <CambioDeDiseno
              piezaId={datos.id}
              version={datos.version}
              laminas={datos.laminas}
              diseno={datos.diseno}
              alHacerlo={redibujar}
            />
          ) : datos.cambiosQuedan === 0 ? (
            <p className="mx-0.5 text-meta text-apagado">{TEXTO_SIN_CAMBIOS_DE_TEXTO}</p>
          ) : (
            <div className="grid gap-2">
              <label htmlFor={idPedido} className="text-meta font-semibold">
                Escribe el cambio
              </label>
              <textarea
                id={idPedido}
                value={pedido}
                onChange={(evento) => setPedido(evento.target.value)}
                maxLength={MAXIMO_DEL_PEDIDO}
                aria-describedby={idAyuda}
                className="campo min-h-24 text-cuerpo font-normal text-tinta"
              />
              <p id={idAyuda} className="text-meta text-apagado">
                {TEXTO_AYUDA_DEL_PEDIDO} {textoCambiosQuedan(datos.cambiosQuedan)}
              </p>
              <Boton
                variante="secundario"
                deshabilitado={pedido.trim() === ""}
                cargando={cambio.pendiente}
                onClick={() =>
                  cambio.ejecutar(() => pedirCambioDeCarruselAccion(datos.id, datos.version, pedido), redibujar)
                }
              >
                Pedir este cambio
              </Boton>
            </div>
          )}
        </MasOpciones>
      </Seccion>

      <Seccion titulo={TEXTO_CUANDO_SALE} id="fecha">
        {fechaElegida ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="grid">
                <span data-snapshot="varia" className="font-semibold tabular-nums">
                  {fechaElegida.etiqueta}
                </span>
                <span className="text-meta text-apagado">LinkedIn · hora de Chile</span>
              </span>
              <Boton
                variante="secundario"
                tamano="chico"
                aria-expanded={cambiandoFecha}
                onClick={() => setCambiandoFecha((actual) => !actual)}
              >
                {cambiandoFecha ? "Listo" : "Cambiar"}
              </Boton>
            </div>
            {cambiandoFecha ? (
              <fieldset className="elecciones grid border-0 p-0">
                <legend className="sr-only">Elige cuándo sale</legend>
                {datos.fechas.map((propuesta) => (
                  <Eleccion
                    key={propuesta.iso}
                    nombre="fecha"
                    valor={propuesta.iso}
                    elegido={propuesta.iso === fecha}
                    etiqueta={propuesta.etiqueta}
                    alElegir={setFecha}
                  />
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : (
          <p className="text-cuerpo text-apagado">No hay un horario libre en los próximos días.</p>
        )}
      </Seccion>

      <div className="mt-8">
        <DescartarPieza piezaId={datos.id} version={datos.version} />
      </div>

      <BarraDeFirma
        idConsecuencia={idConsecuencia}
        consecuencia={fechaElegida ? `Sale el ${fechaElegida.corta}` : undefined}
        consecuenciaVaria
        arriba={
          <>
            {errorDeAccion ? <Bloque tipo="error" titulo={errorDeAccion} /> : null}
            {falta.tipo === "bloqueo" ? (
              <Bloque tipo="aviso" id={idFalta}>
                {falta.texto}
              </Bloque>
            ) : null}
            {falta.tipo === "falta" ? <LineaDeFalta id={idFalta} cosas={falta.cosas} /> : null}
            {falta.tipo === "nada" ? <ResumenListo id={idFalta} cosas={["Láminas vistas", "Fecha"]} /> : null}
          </>
        }
      >
        <DeslizarParaAprobar
          habilitado={falta.tipo === "nada"}
          enviando={firma.pendiente}
          etiqueta={ETIQUETA_DE_PROGRAMAR}
          etiquetaCorta={ETIQUETA_CORTA_DE_PROGRAMAR}
          describidoPor={fechaElegida ? `${idFalta} ${idConsecuencia}` : idFalta}
          alFirmar={() => {
            if (fecha) {
              firma.ejecutar(() => aprobarCarruselAccion(datos.id, datos.version, datos.carruselId, fecha), redibujar)
            }
          }}
        />
      </BarraDeFirma>
    </div>
  )
}
```

- [ ] **Step 10: Run them green**, then the whole unit suite, Biome and types

Run: `pnpm test:run && pnpm check && pnpm type && grep -L '^"use client"' $(grep -rl 'use client' app components)`
Expected: PASS; the grep prints nothing.

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/fechas-de-puerta-2.ts" "app/(app)/video/[id]/page.tsx" "app/(app)/guion/[id]" tests/unit
git commit -m "Add gate 2 of a carousel: the rail, the post, changes and the date

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24: Every carousel state on its screen, and the manual upload

**Files:**
- Modify: `app/(app)/guion/[id]/carrusel.tsx`, `app/(app)/guion/[id]/textos.ts`
- Create: `app/(app)/guion/[id]/subir-carrusel.tsx`, `tests/unit/subir-carrusel.test.tsx`
- Modify: `app/(app)/video/[id]/subir-a-mano.tsx` (export `Paso`), `app/(app)/video/[id]/page.tsx` (redirect)
- Modify: `app/(app)/estado-de-pieza.tsx`, `tests/unit/estado-de-pieza.test.tsx`

- [ ] **Step 1: Write the failing tests.** `tests/unit/subir-carrusel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SubirCarruselAMano } from "@/app/(app)/guion/[id]/subir-carrusel"

describe("SubirCarruselAMano", () => {
  it("downloads the PDF, explains LinkedIn's document upload and marks it uploaded with the link", async () => {
    const alDescargar = vi.fn(async () => ({ ok: true as const, url: "https://almacen.test/c.pdf" }))
    const alMarcar = vi.fn(async () => ({ ok: true as const }))
    const alIrA = vi.fn()
    render(
      <SubirCarruselAMano piezaId="p" version={9} texto="El post." alDescargar={alDescargar} alMarcar={alMarcar} alIrA={alIrA} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Descargar PDF" }))
    await waitFor(() => expect(alIrA).toHaveBeenCalledWith("https://almacen.test/c.pdf"))
    expect(screen.getByText(/toca «Agregar un documento», sube el PDF y pega el texto/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Enlace de la publicación en LinkedIn (opcional)"), {
      target: { value: "https://www.linkedin.com/posts/x" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a LinkedIn" }))
    await waitFor(() => expect(alMarcar).toHaveBeenCalledWith("p", 9, "linkedin", "https://www.linkedin.com/posts/x"))
  })
})
```

In `tests/unit/estado-de-pieza.test.tsx`:

```tsx
  it("retries a failed carousel render with 'Reintentar (no se cobra)'", async () => {
    render(<AccionesDeEstado piezaId="p" version={5} acciones={["reintentarCarrusel", "descartar"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar (no se cobra)" }))
    await waitFor(() => expect(reintentarAccion).toHaveBeenCalledWith("p", 5))
  })
```

- [ ] **Step 2: Run them red**

Run: `pnpm test:run tests/unit/subir-carrusel.test.tsx tests/unit/estado-de-pieza.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `estado-de-pieza.tsx`.**
`type Que = "reintentar" | "reintentarGuion" | "reintentarCarrusel" | "cambiarFecha" | "descartar"`;
`ETIQUETAS.reintentarCarrusel = "Reintentar (no se cobra)"`; `ACCIONES.reintentarCarrusel = reintentarAccion`; the retry
icon also for `"reintentarCarrusel"`.

- [ ] **Step 4: `subir-a-mano.tsx`:** `export function Paso(...)` (only the `export` keyword changes).

- [ ] **Step 5: `subir-carrusel.tsx`**

```tsx
"use client"

import { Check, DownloadSimple } from "@phosphor-icons/react"
import { useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"
import { Paso } from "../../video/[id]/subir-a-mano"

const IR_A_LA_DESCARGA = (url: string) => window.location.assign(url)

/**
 * The manual upload of a carousel (decision P1): the approved PDF from R2 to her phone through a ten-minute link, the
 * signed post text, LinkedIn's document upload, and "Ya lo subí" with the link (today's subido_a_mano).
 */
export function SubirCarruselAMano({
  piezaId,
  version,
  texto,
  alDescargar,
  alMarcar,
  alIrA = IR_A_LA_DESCARGA,
}: {
  piezaId: string
  version: number
  texto: string
  alDescargar: (piezaId: string) => Promise<Resultado<{ url: string }>>
  alMarcar: (piezaId: string, version: number, destino: string, enlace: string) => Promise<Resultado>
  alIrA?: (url: string) => void
}) {
  const [enlace, setEnlace] = useState("")
  const [copia, setCopia] = useState<"nada" | "copiado" | "fallo">("nada")
  const descarga = useAccion()
  const confirmacion = useAccion()
  const idEnlace = useId()

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopia("copiado")
    } catch (error) {
      // The clipboard can be refused (a permission, an in-app browser): the text is on screen to copy by hand.
      if (!(error instanceof DOMException)) throw error
      setCopia("fallo")
    }
  }

  return (
    <ol className="grid gap-8">
      <Paso numero={1} titulo="Descarga el PDF">
        <Boton
          variante="secundario"
          cargando={descarga.pendiente}
          icono={<DownloadSimple aria-hidden="true" size={ICONO.medio} />}
          onClick={() => descarga.ejecutar(() => alDescargar(piezaId), (resultado) => alIrA(resultado.url))}
        >
          Descargar PDF
        </Boton>
        {descarga.error ? <LineaDeEstado tipo="error" titulo={descarga.error} /> : null}
      </Paso>
      <Paso numero={2} titulo="Copia el texto">
        <p className="whitespace-pre-line text-cuerpo leading-prosa">{texto}</p>
        <Boton variante="callado" onClick={copiar}>
          Copiar texto
        </Boton>
        <output className="block min-h-6 text-meta text-apagado">
          {copia === "copiado" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-tinta">
              <Check aria-hidden="true" size={ICONO.chico} />
              Texto copiado
            </span>
          ) : null}
          {copia === "fallo" ? "No pude copiarlo. Mantén apretado el texto de arriba para copiarlo." : null}
        </output>
      </Paso>
      <Paso numero={3} titulo="Súbelo en LinkedIn">
        <p className="text-cuerpo">
          Crea una publicación, toca «Agregar un documento», sube el PDF y pega el texto. Como título del documento usa la
          portada.
        </p>
      </Paso>
      <Paso numero={4} titulo="Avísame cuando esté arriba">
        <label htmlFor={idEnlace} className="text-meta font-semibold">
          Enlace de la publicación en LinkedIn (opcional)
        </label>
        <input
          id={idEnlace}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={enlace}
          onChange={(evento) => setEnlace(evento.target.value)}
          placeholder="https://www.linkedin.com/posts/..."
          className="campo w-full text-cuerpo"
        />
        {confirmacion.error ? <LineaDeEstado tipo="error" titulo={confirmacion.error} /> : null}
        <Boton
          variante="primario"
          cargando={confirmacion.pendiente}
          onClick={() => confirmacion.ejecutar(() => alMarcar(piezaId, version, "linkedin", enlace))}
        >
          Ya lo subí a LinkedIn
        </Boton>
      </Paso>
    </ol>
  )
}
```

- [ ] **Step 6: `carrusel.tsx`, the screen by state.** Imports to add: `MomentoDeCierre` (`@/components/momento-de-cierre`),
`LineaDeEstado`, `urlParaVer` (`@/lib/acciones/medios`), `leerVersion` and `leerVersionVigente`
(`@/lib/datos/carrusel`), `leerPublicaciones` (`@/lib/datos/repositorio`), `etiquetaDeFecha` (`@/lib/dominio/fechas`),
`fechasDePuerta2` (`../../fechas-de-puerta-2`), `PantallaPuerta2Carrusel`, `SubirCarruselAMano`,
`descargarCarruselAccion` and `marcarSubidoAManoAccion` (`../../piezas/acciones`), and the new texts. Replace the
`armando_carrusel` case and add the others before `default`:

```tsx
    case "armando_carrusel": {
      const carrusel = await leerCarruselVigente(db, fila.id)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <Trabajando titulo={TEXTO_ARMANDO} detalle={TEXTO_ARMANDO_DETALLE} />
          {carrusel ? (
            <Seccion titulo={TEXTO_ASI_QUEDO_FIRMADO} id="firmado">
              <LaminasEnLectura laminas={carrusel.laminas} />
            </Seccion>
          ) : null}
          <RefrescoAutomatico activo={fila.explicacion === null} cadaMs={4000} />
        </EstadoSencillo>
      )
    }
    case "carrusel_por_aprobar": {
      const version = await leerVersionVigente(db, fila.id)
      if (!version || version.estado !== "listo") throw new Error(`La pieza ${fila.id} está en la puerta 2 sin láminas.`)
      const [imagenes, { fechas }] = await Promise.all([
        Promise.all(version.pngClaves.map((clave) => urlParaVer(clave))),
        fechasDePuerta2(db, fila.id, Date.now()),
      ])
      return (
        <PantallaPuerta2Carrusel
          key={`${fila.id}:${fila.version}`}
          datos={{
            id: fila.id,
            version: fila.version,
            titulo: fila.titulo,
            pilar,
            carruselId: version.id,
            laminas: version.laminas,
            imagenes,
            diseno: version.diseno,
            textoPost: version.textoPost,
            fechas,
            cambiosQuedan: cambiosQuedan(fila.cambios_de_texto),
          }}
        />
      )
    }
    case "programado": {
      const { zona } = await fechasDePuerta2(db, fila.id, Date.now())
      const cuando = fila.puerta2_publicar_en ? etiquetaDeFecha(fila.puerta2_publicar_en, zona, "larga") : "día aprobado"
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <LineaDeEstado tipo="exito" titulo={`Programado para el ${cuando}`} detalle={TEXTO_PROGRAMADO_CARRUSEL} />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["cambiarFecha", "descartar"]} />
        </EstadoSencillo>
      )
    }
    case "para_subir_a_mano": {
      const version = fila.puerta2_carrusel_id ? await leerVersion(db, fila.puerta2_carrusel_id) : null
      if (!version) throw new Error(`La pieza ${fila.id} espera subirse sin el carrusel aprobado.`)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <LineaDeEstado tipo="aviso" titulo="Listo para que lo subas a LinkedIn" />
          <SubirCarruselAMano
            piezaId={fila.id}
            version={fila.version}
            texto={version.textoPost}
            alDescargar={descargarCarruselAccion}
            alMarcar={marcarSubidoAManoAccion}
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
        </EstadoSencillo>
      )
    }
    case "publicado_a_mano": {
      const enlace = (await leerPublicaciones(db, fila.id)).find((p) => p.destino === "linkedin")?.enlace
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <MomentoDeCierre
            titulo="Subido a LinkedIn"
            detalle="Lo subiste tú a LinkedIn."
            enlaces={enlace ? [{ etiqueta: "Ver en LinkedIn", href: enlace }] : []}
          />
        </EstadoSencillo>
      )
    }
    case "error_produccion":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <Bloque
            tipo="error"
            grande
            titulo={TEXTO_NO_ARME}
            accion={
              <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentarCarrusel"]} enUnError />
            }
          >
            <ExplicacionParaConi
              texto={fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
              enSusPalabras={TEXTO_REINTENTA}
            />
          </Bloque>
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
        </EstadoSencillo>
      )
    case "error_publicacion":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <LineaDeEstado
            tipo="error"
            titulo="No te lo pude dejar para subir"
            detalle={
              <ExplicacionParaConi
                texto={fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
                enSusPalabras={TEXTO_REINTENTA}
              />
            }
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentar", "descartar"]} />
        </EstadoSencillo>
      )
```

(`No te lo pude dejar para subir` and `Escribe el cambio` join decision P11's list.) Drop the imports nothing uses
any more (`House`, `Link`, `clasesDeBoton`, `ICONO`, `Panel`, `TEXTO_CARRUSEL_FIRMADO`, `TEXTO_CARRUSEL_ESPERA`) and
delete those two constants from `textos.ts`.

In `video/[id]/page.tsx`, right after `const { fila, idea } = pantalla`:

```tsx
  // Every carousel state lives on /guion/<id> (plan amendment 13); the shared links of Inicio may land here.
  if (fila.tipo === "carrusel") redirect(`/guion/${fila.id}`)
```

- [ ] **Step 7: Run them green**, then unit, types, Biome, build

Run: `pnpm test:run && pnpm check && pnpm type && pnpm build`
Expected: PASS. A green `pnpm build` also proves no `app/` file pulls Chromium.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/guion/[id]" "app/(app)/video/[id]" "app/(app)/estado-de-pieza.tsx" tests/unit
git commit -m "Show every carousel state, with the manual upload of its PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 25: Inicio and the Calendario know a carousel past gate 1

**Files:**
- Modify: `lib/inicio/modelo.ts`, `lib/calendario/modelo.ts`
- Modify: `tests/unit/inicio-modelo.test.ts`, `tests/unit/calendario-modelo.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/inicio-modelo.test.ts`, `describe("Inicio con carruseles")`,
replace "shows a carousel being written and a signed one waiting for its design, on their way" with the first case and
add the others:

```ts
  it("shows a carousel being written and one whose slides are being made, both working", () => {
    const escribiendose = carrusel("guion_en_proceso")
    const armandose = carrusel("armando_carrusel")
    const { camino } = construirInicio({ piezas: [escribiendose, armandose], ahora: AHORA, zona: ZONA })
    expect(camino.map((fila) => [fila.estado, fila.ocupada, fila.href])).toEqual([
      ["Escribiendo el carrusel · te aviso", true, `/guion/${escribiendose.id}`],
      ["Armando las láminas · te aviso", true, `/guion/${armandose.id}`],
    ])
  })

  it("asks her to look at the slides and choose a date", () => {
    const listo = carrusel("carrusel_por_aprobar")
    expect(construirInicio({ piezas: [listo], ahora: AHORA, zona: ZONA }).firma).toEqual([
      {
        id: listo.id,
        titulo: listo.titulo,
        pilar: listo.pilar,
        meta: "Carrusel de LinkedIn",
        href: `/guion/${listo.id}`,
        instruccion: "Mira las láminas y elige la fecha.",
      },
    ])
  })

  it("names a failed render in a carousel's words, and opens its screen when it waits to be uploaded", () => {
    const fallido = carrusel("error_produccion", { explicacion: "No pude armar el carrusel. WAV ya está revisando." })
    const porSubir = carrusel("para_subir_a_mano", { pendientes: ["linkedin"] })
    const inicio = construirInicio({ piezas: [fallido, porSubir], ahora: AHORA, zona: ZONA })
    expect(inicio.atencion[0]?.causa).toBe("No pude armar el carrusel.")
    expect(inicio.porSubir[0]?.href).toBe(`/guion/${porSubir.id}`)
  })
```

In `tests/unit/calendario-modelo.test.ts`, `describe("carousels in the Agenda")`, replace "says a signed carousel waits
for its design and opens it" with:

```ts
  it("names a carousel's render and its gate 2, and opens them", () => {
    expect(ocupanteDe({ id: "c2", estado: "armando_carrusel" })).toMatchObject({
      estado: "Armando las láminas",
      href: "/guion/c2",
    })
    expect(ocupanteDe({ id: "c3", estado: "carrusel_por_aprobar" })).toMatchObject({
      estado: "Falta tu firma: carrusel y fecha",
      tono: "aviso",
      href: "/guion/c3",
    })
  })
```

- [ ] **Step 2: Run them red**

Run: `pnpm test:run tests/unit/inicio-modelo.test.ts tests/unit/calendario-modelo.test.ts`
Expected: FAIL.

- [ ] **Step 3: `lib/inicio/modelo.ts`.**

```ts
/** Only what she can sign now counts: a voice being made waits apart (critique v3, P2). */
const ESPERAN_FIRMA: readonly Estado[] = ["guion_por_aprobar", "video_por_aprobar", "carrusel_por_aprobar"]

/** A carousel lives on /guion/<id> in every state (plan amendment 13); a reel's later states on /video/<id>. */
const rutaDe = (pieza: PiezaDeInicio, deUnReel: "guion" | "video") =>
  `/${pieza.tipo === "carrusel" ? "guion" : deUnReel}/${pieza.id}`
```

At the top of `filaDeFirma`, after `base`:

```ts
  if (pieza.estado === "carrusel_por_aprobar") {
    return {
      ...base,
      meta: "Carrusel de LinkedIn",
      href: `/guion/${pieza.id}`,
      instruccion: "Mira las láminas y elige la fecha.",
    }
  }
```

In `filaEnCamino`:

```ts
    case "armando_carrusel":
      return {
        ...base,
        estado: pieza.explicacion === null ? "Armando las láminas · te aviso" : "Armando las láminas",
        ocupada: pieza.explicacion === null,
        href: `/guion/${pieza.id}`,
      }
```

and in its `programado` case `href: rutaDe(pieza, "video")`. In `avisoDeError`:
`case "error_produccion": return { ...base, causa: pieza.tipo === "carrusel" ? "No pude armar el carrusel." : "No pude terminar el video.", accion: revisar("guion") }`
and for `error_publicacion` `accion: { etiqueta: "Revisar", href: rutaDe(pieza, "video") }`. `filaPorSubir` uses
`href: rutaDe(pieza, "video")`.

- [ ] **Step 4: `lib/calendario/modelo.ts`** (the switch near line 257). `programado`, `para_subir_a_mano` and
`publicado_a_mano` take `href: \`/${pieza.tipo === "carrusel" ? "guion" : "video"}/${pieza.id}\``; replace the
`armando_carrusel` case and add `carrusel_por_aprobar`:

```ts
    case "carrusel_por_aprobar":
      return { ...base, estado: "Falta tu firma: carrusel y fecha", tono: "aviso", href: `/guion/${pieza.id}` }
    case "armando_carrusel":
      return { ...base, estado: "Armando las láminas", tono: "neutro", href: `/guion/${pieza.id}` }
```

and `error_produccion` says `pieza.tipo === "carrusel" ? "Algo falló al armar el carrusel" : "Algo falló al grabar"`.

- [ ] **Step 5: Run them green**

Run: `pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/inicio/modelo.ts lib/calendario/modelo.ts tests/unit/inicio-modelo.test.ts tests/unit/calendario-modelo.test.ts
git commit -m "Name a carousel's render, gate 2 and upload on Inicio and the Agenda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 7 checkpoint:** reviewer on Tasks 22 to 25 with the screens open in a browser (the dev server, started in tmux
as the global hook asks, with a seeded carousel at each state). Focus: tokens only (no hex under `app/`), es-CL copy,
the rail usable by keyboard and screen reader, the signature opens only after the last slide, a green `pnpm build`.

---

## Lote 8: E2E, snapshots and axe

### Task 26: The carousel end to end, tasks emulated at their boundary

**Files:**
- Modify: `tests/e2e/escena.ts` (`escribirCarruselComoLaTarea`, `armarCarruselComoLaTarea`)
- Modify: `tests/e2e/ayudas.ts` (`simularMedios` serves carousel PNGs and the PDF)
- Modify: `tests/e2e/carrusel.spec.ts`

The writer and the renderer never run in E2E (Trigger.dev is never called: `DISPARO_DE_PRUEBA` records the runs). The
whole flow emulates each run at its boundary: the writer's result is written as the service writes it, and the real
`armarCarrusel` runs in the test process with Chromium replaced by fixed PNGs (Chromium itself is proven by Task 12).

- [ ] **Step 1: The helpers.** `tests/e2e/ayudas.ts`, in `simularMedios`, before the `else`:

```ts
    } else if (url.includes("/carruseles/") && url.includes(".png")) {
      await ruta.fulfill({ status: 200, contentType: "image/png", body: AVATAR_A })
    } else if (url.includes("/carruseles/") && url.includes(".pdf")) {
      await ruta.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.7" })
```

`tests/e2e/escena.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { leerVersionVigente } from "@/lib/datos/carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { armarCarrusel } from "@/lib/produccion/armar-carrusel"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { clienteDeServicio } from "../integration/servicio"

const PNG_DE_LAMINA = new Uint8Array(readFileSync(join(__dirname, "fixtures", "avatar-a.png")))

/** What `producir-pieza` leaves for a carousel: version 1 and the piece at gate 1, written as the service. */
export async function escribirCarruselComoLaTarea(id: string): Promise<void> {
  const db = clienteDeServicio()
  const hash = hashTextoDeCarrusel({ laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA })
  await pool.query(
    `insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen)
     values ($1, 1, $2::jsonb, $3, $4, 'inicial')`,
    [id, JSON.stringify(LAMINAS_DE_PRUEBA), TEXTO_POST_DE_PRUEBA, hash],
  )
  const { error } = await db.from("piezas").update({ estado: "guion_por_aprobar", revision: [], version: (await leerFila(id)).version + 1 }).eq("id", id)
  if (error) throw new Error(`No pude dejar el carrusel en la puerta 1: ${error.message}`)
}

/** `armar-carrusel` for real, with Chromium replaced by fixed PNGs at its boundary. */
export async function armarCarruselComoLaTarea(id: string): Promise<void> {
  const resultado = await armarCarrusel(
    {
      db: clienteDeServicio(),
      almacen: almacenEnMemoria(),
      avisos: notificadorEnMemoria(),
      ahora: () => new Date().toISOString(),
      renderizar: async ({ laminas }) => ({
        tipo: "listo",
        pngs: laminas.map(() => PNG_DE_LAMINA),
        pdf: new TextEncoder().encode("%PDF-1.7"),
      }),
      fuente: async () => "data:font/ttf;base64,AAAA",
      claude: async () => {
        throw new Error("El E2E no llama a Claude.")
      },
    },
    id,
  )
  if (resultado.resultado !== "armado") throw new Error(`El carrusel ${id} no quedó armado: ${resultado.resultado}`)
  // The version is read back so a failing write shows here, not as an empty rail.
  if ((await leerVersionVigente(clienteDeServicio(), id))?.estado !== "listo") throw new Error("Versión sin armar")
}
```

(`pool` and `leerFila` come from `../integration/db` and `../integration/siembra`, already imported by this file or add
them. The service row update goes through `proteger_pieza` like the real writer's `actualizarPieza`; the
`version + 1` is the optimistic lock it requires.)

- [ ] **Step 2: Update and add the specs** in `tests/e2e/carrusel.spec.ts`. Import `simularMedios`,
`escribirCarruselComoLaTarea`, `armarCarruselComoLaTarea`, `leerVersionVigente`, `clienteDeServicio`. Replace "a signed
carousel waits, read only, and says what comes next" with:

```ts
test("a carousel whose slides are being made says so and refreshes itself", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("armando_carrusel")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Así quedó firmado" })).toBeVisible()
  await expect(page.getByRole("slider")).toHaveCount(0)
})
```

In "signing the text leaves the carousel waiting, starts nothing, and Inicio says what is missing", rename it to
"signing the text starts the render, and Inicio says the slides are being made", and replace its last three
expectations with:

```ts
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("armando_carrusel")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "armar", piezaId: id }])

  await page.goto("/")
  await expect(page.getByText("Armando las láminas · te aviso")).toBeVisible()
```

Add:

```ts
test("the whole flow: Ideas, gate 1, the render, gate 2 with one design change, and scheduling", async ({ page }) => {
  await simularMedios(page)
  await sembrarIdea({ pilar: CARRUSEL.pilar, gancho: CARRUSEL.titulo, numero: 1 })
  await page.goto("/ideas")
  await page.getByRole("radio", { name: "Carrusel de LinkedIn" }).check()
  await page.getByRole("button", { name: "Hacer el carrusel" }).click()
  await expect(page.getByText("Escribiendo el carrusel. Te aviso cuando esté.")).toBeVisible()
  const { rows } = await pool.query("select id from public.piezas where titulo = $1", [CARRUSEL.titulo])
  const id: string = rows[0]?.id
  await escribirCarruselComoLaTarea(id)

  await page.goto(`/guion/${id}`)
  await page.getByRole("slider", { name: "Desliza para firmar" }).focus()
  await page.keyboard.press("End")
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  await armarCarruselComoLaTarea(id)

  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("img", { name: /^Lámina 1 de 6: / })).toBeVisible()
  const programar = page.getByRole("slider", { name: "Desliza para programar" })
  await expect(programar).toHaveAttribute("aria-disabled", "true")

  const antes = await leerVersionVigente(clienteDeServicio(), id)
  await abrirDesplegable(page, "Pedir cambio")
  await page.getByRole("radio", { name: /El diseño/ }).check()
  await page.getByRole("radio", { name: "Oscura" }).check()
  await page.getByRole("button", { name: "Rehacer el diseño" }).click()
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  const despues = await leerVersionVigente(clienteDeServicio(), id)
  expect(despues).toMatchObject({ origen: "cambio_diseno", hashTexto: antes?.hashTexto, diseno: { variante: "oscura" } })
  expect(disparosRegistrados().filter((d) => d.tarea === "armar")).toHaveLength(2)
  await armarCarruselComoLaTarea(id)

  await page.goto(`/guion/${id}`)
  for (let i = 1; i < 6; i += 1) await page.getByRole("button", { name: "Lámina siguiente" }).click()
  await expect(programar).toHaveAttribute("aria-disabled", "false")
  await programar.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(/^Programado para el /)).toBeVisible()
  expect(await leerFila(id)).toMatchObject({ estado: "programado", puerta2_carrusel_id: despues?.id })
})

test("the manual upload: download the PDF, copy the text, say it is up", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const id = await sembrarCarruselDeEscena("para_subir_a_mano")
  const pedidos: string[] = []
  await page.route("https://almacen.test/**", async (ruta) => {
    pedidos.push(ruta.request().url())
    await ruta.fulfill({ status: 200, contentType: "application/pdf", headers: { "content-disposition": "attachment" }, body: "%PDF-1.7" })
  })
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Listo para que lo subas a LinkedIn")).toBeVisible()
  await page.getByRole("button", { name: "Descargar PDF" }).click()
  await expect.poll(() => pedidos.find((url) => url.includes("carrusel.pdf"))).toContain(`descarga=carrusel-${id.slice(0, 8)}.pdf`)
  await page.getByRole("button", { name: "Copiar texto" }).click()
  await expect(page.getByText("Texto copiado")).toBeVisible()
  await page.getByLabel("Enlace de la publicación en LinkedIn (opcional)").fill("https://www.linkedin.com/posts/coni-carrusel")
  await page.getByRole("button", { name: "Ya lo subí a LinkedIn" }).click()
  await expect(page.getByText("Subido a LinkedIn")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("publicado_a_mano")
})

test("a failed render offers Reintentar (no se cobra) and starts it again", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("error_produccion")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("No pude armar el carrusel")).toBeVisible()
  await page.getByRole("button", { name: "Reintentar (no se cobra)" }).click()
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  expect(disparosRegistrados()).toMatchObject([{ tarea: "armar", piezaId: id }])
})

test("/video/<id> of a carousel opens its own screen", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("programado")
  await page.goto(`/video/${id}`)
  await expect(page).toHaveURL(new RegExp(`/guion/${id}$`))
  await expect(page.getByText(/^Programado para el /)).toBeVisible()
})
```

If the page download navigates away (`window.location.assign` to a 200 with `content-disposition: attachment`), the
page stays; that is what `subir-a-mano.spec.ts` relies on for the video.

- [ ] **Step 3: Run the E2E**

Run: `pnpm db:reset && pnpm test:e2e tests/e2e/carrusel.spec.ts tests/e2e/descartar.spec.ts tests/e2e/plantilla-carrusel.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/escena.ts tests/e2e/ayudas.ts tests/e2e/carrusel.spec.ts
git commit -m "Cover a carousel end to end: render, gate 2, design change, upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 27: Visual baselines and axe for the new screens

**Files:**
- Modify: `tests/e2e/visual.spec.ts`, `tests/e2e/accesibilidad.spec.ts`, `tests/e2e/visual.spec.ts-snapshots`

The three variants have their own references at the slide level (Task 12: `{crema,piedra,oscura}-{portada,idea}.png`);
here the app's screens get theirs.

- [ ] **Step 1: The baselines.** In `tests/e2e/visual.spec.ts`, rename "carrusel firmado" to "carrusel armando"
(state `armando_carrusel`, capture `carrusel-armando`) and add, with `simularMedios(page)` before `goto` (import it):

```ts
test("carrusel puerta 2", async ({ page }) => {
  await sembrarEscena()
  await simularMedios(page)
  const id = await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("img", { name: /^Lámina 1 de 6/ })).toBeVisible()
  await capturaDe(page, "carrusel-puerta-2")
})

test("carrusel puerta 2 diseno", async ({ page }) => {
  await sembrarEscena()
  await simularMedios(page)
  const id = await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await page.goto(`/guion/${id}`)
  await abrirDesplegable(page, "Pedir cambio")
  await page.getByRole("radio", { name: /El diseño/ }).check()
  await capturaDe(page, "carrusel-puerta-2-diseno")
})

test("carrusel para subir", async ({ page }) => {
  await sembrarEscena()
  const id = await sembrarCarruselDeEscena("para_subir_a_mano")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "carrusel-para-subir")
})

test("carrusel error", async ({ page }) => {
  await sembrarEscena()
  const id = await sembrarCarruselDeEscena("error_produccion")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "carrusel-error")
})
```

- [ ] **Step 2: Axe.** In `tests/e2e/accesibilidad.spec.ts` add:

```ts
test("the carousel's render, gate 2, design change, upload and failure pass WCAG 2.x AA", async ({ page }) => {
  await simularMedios(page)
  const rutas = await Promise.all(
    (["armando_carrusel", "carrusel_por_aprobar", "programado", "para_subir_a_mano", "error_produccion"] as const).map(
      async (estado) => `/guion/${await sembrarCarruselDeEscena(estado)}`,
    ),
  )
  const hallazgos = await auditar(page, rutas)
  const puerta2 = rutas[1] ?? ""
  hallazgos.push(
    ...(await auditar(page, [puerta2], async (p) => {
      await abrirDesplegable(p, "Pedir cambio")
      await p.getByRole("radio", { name: /El diseño/ }).check()
    })),
  )
  expect(hallazgos).toEqual([])
})
```

`sembrarCarruselDeEscena` creates its idea each time with the same title; if the second call conflicts, give each a
`titulo` (`{ titulo: \`Carrusel ${estado}\` }`). Add the gate 2 route to the 44 x 44 control check of this file the same
way the other routes are listed there.

- [ ] **Step 3: Regenerate exactly the new and renamed baselines**

```bash
git rm tests/e2e/visual.spec.ts-snapshots/carrusel-firmado-app-darwin.png
pnpm test:e2e tests/e2e/visual.spec.ts -g "carrusel" --update-snapshots
pnpm test:e2e tests/e2e/visual.spec.ts tests/e2e/accesibilidad.spec.ts
git status --short tests/e2e/visual.spec.ts-snapshots
```

Expected: `carrusel-armando`, `carrusel-puerta-2`, `carrusel-puerta-2-diseno`, `carrusel-para-subir`, `carrusel-error`
added (plus `carrusel-por-aprobar` unchanged since Task 3). Open each: the rail at 82 % width with the next slide
peeking, the dots, the folded post, the date, the discard row, the slider reading "Desliza para programar". All green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/visual.spec.ts tests/e2e/accesibilidad.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "Add the carousel's gate 2, upload and failure baselines and axe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Lote 8 checkpoint:** reviewer on Tasks 26 and 27 with the new PNGs open.

---

## Lote 9: Docs and verification

### Task 28: TRASPASO and PRODUCT

**Files:** Modify: `docs/TRASPASO.md`, `docs/PRODUCT.md`

- [ ] **Step 1:** In `docs/TRASPASO.md` "Lo que está hecho", after the part 1 bullet (Spanish, as the file):

```markdown
- **Carruseles de LinkedIn, parte 2** (plan `docs/superpowers/plans/2026-10-27-carrusel-parte-2.md`): tarea
  `armar-carrusel` (Chromium de Playwright vía la extensión `playwright()` de Trigger.dev, máquina `medium-1x`, 2
  reintentos) que arma la última versión con la plantilla `lib/carrusel/plantilla` (Newsreader, OFL, en
  `assets/fuentes/carrusel`; variantes crema, piedra y oscura), mide el desborde, acorta una vez con Claude (vuelve a la
  puerta 1) y sube un PNG por lámina y el PDF a R2 (`carruseles/<pieza>/<versión>/`). Puerta 2 del carrusel: riel de
  láminas, texto, "Pedir cambio" (el texto o el diseño, acotado), fecha y "Desliza para programar". A su hora el carrusel
  queda **para subir a mano** (Descargar PDF, Copiar texto, Ya lo subí): la parte 2 nunca llama a LinkedIn por un
  carrusel. "Descartar esta pieza" en la puerta 1 (reels y carruseles). `mantenimiento-frecuente` arma los carruseles
  firmados en la parte 1. Migraciones `20261027000100` y `20261027000110`.
```

In `docs/PRODUCT.md`, where carousels are described (part 1's paragraph), add: the slides are designed text in an
editorial template (cream paper, a large serif) with three colour variants; at gate 2 Coni sees the slides as they will
look, may ask for a text change (it counts) or a bounded design change (it does not), and schedules it; until the
LinkedIn API path ships, she uploads the PDF herself at its time. Keep es-CL, no long dashes.

- [ ] **Step 2:** `grep -- '—' docs/TRASPASO.md docs/PRODUCT.md` prints nothing new.

- [ ] **Step 3: Commit**

```bash
git add docs/TRASPASO.md docs/PRODUCT.md
git commit -m "Record carousels part 2 in the handoff and product docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 29: Full verification and review

**Files:** none (fixes go in their own commits, test first).

- [ ] **Step 1: Full suites**

```bash
pnpm db:reset
pnpm type
pnpm test:run
pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-carrusel-2.txt
diff /tmp/lint-base-carrusel-2.txt /tmp/lint-carrusel-2.txt
pnpm build
pnpm test:e2e
```

Expected: all green; counts grow by this plan's tests (compare with Task 0); empty lint diff; only the baselines named
in Tasks 3 and 27 changed, plus the seven gate 1 baselines of `3f8c577` (`guion-con-voz`, `guion-escuchada`,
`guion-escuchada-letra-grande`, `guion-falla-voz`, `guion-sin-escuchar`, `guion-sin-saldo`, `guion-sin-voz`), which
show the discard row.

- [ ] **Step 2: Banned patterns in my own diff**

```bash
git diff main -- lib app components trigger ':!lib/carrusel/plantilla' | grep -nE "as any|@ts-expect-error|—|catch \{\s*\}|#[0-9a-fA-F]{3,6}\b" || echo "clean"
git diff main -- lib/carrusel/plantilla | grep -n "—" || echo "plantilla sin rayas"
grep -rn "Pareja\|Deseo\|IA y salud mental\|bienestar" lib/carrusel lib/produccion/armar-carrusel.ts "app/(app)/guion/[id]" || echo "no pillar names"
grep -rlE "from ['\"](playwright|@/lib/carrusel/navegador)['\"]" app components || echo "no Chromium in the app"
head -1 "app/(app)/descartar-pieza.tsx" "app/(app)/guion/[id]/puerta-2-carrusel.tsx" "app/(app)/guion/[id]/riel-de-laminas.tsx" "app/(app)/guion/[id]/cambio-de-diseno.tsx" "app/(app)/guion/[id]/subir-carrusel.tsx" "app/(app)/guion/[id]/texto-del-post.tsx"
```

Expected: `clean`; `plantilla sin rayas`; no pillar literals (they come from `lib/datos/pilares.ts`); no Chromium in the
app; every client file starts with `"use client"`. Hex appears only under `lib/carrusel/plantilla` (decision P4).

- [ ] **Step 3: The Trigger.dev bundle offline.** `pnpm exec tsc --noEmit` already covers `trigger/`; also confirm the
extension resolves: `node -e "require('@trigger.dev/build/extensions/playwright')"` (prints nothing). The deploy itself
is Task 30.

- [ ] **Step 4: Code review** with `superpowers:requesting-code-review` on `main..feat/carrusel-2`, giving the reviewer
amendments 1 to 14 and decisions P1 to P11. Focus: the `proteger_pieza` diff against `20261026000140` (three blocks);
invoker functions not executable by `authenticated`; `cambiar_diseno_de_carrusel` cannot change a word (SQL and TS);
gate 2 binds the version on screen; the render never runs on unsigned words; a shortening is paid once; the publisher's
carousel branch precedes every provider call; the discard guard does not block any state the app offers it in today.
Fix findings test-first.

- [ ] **Step 5: No commit** unless a fix was needed.

---

## Lote 10: Deploy runbook

### Task 30: Production (Federico; nothing runs without his explicit OK, step by step)

Federico runs every production command from the **macOS Terminal** (not the app's terminal). **Order: database, then
Trigger.dev, then the app** (amendment 14). Why:

- **Old code on the new database is safe:** the migrations only widen what is allowed (a new origin of an error, new
  ways into `armando_carrusel` that the old app never takes, a gate 2 that only carousels use) and add functions old
  code does not call; `proteger_pieza` is byte for byte the old one for reels; the new `listo_con_archivos` check holds
  for every existing version (none is `listo`); the notice trigger only adds a state; `20261027000150` adds two
  timestamps to `carruseles` that old code never reads, and stamps `armado_pedido_en` on the carousels already waiting.
- **The new worker on the old app is safe and wanted:** the new `mantenimiento-frecuente` renders the carousels already
  in `armando_carrusel` (signed under part 1) within ten minutes; their gate 2 screen arrives with the app, and until
  then Inicio shows them as before. The new publisher only changes what happens to a scheduled carousel, and none
  exists yet.
- **The new app on the old worker is not:** signing would trigger `armar-carrusel`, a task the old deployment does not
  have (the app shows "tarda en armarse", and nothing renders until the worker ships). Hence Trigger.dev before Vercel.
- **The new worker needs the new database:** `guardar_armado`, `guardar_acortado` and the widened `proteger_pieza` must
  exist before the first render.

- [ ] **Step 1 (OK needed): merge, no push unless asked.**
`git checkout main && git merge --no-ff feat/carrusel-2`. `git push` only when Federico asks.

- [ ] **Step 2 (OK needed): database.** `supabase migration list` shows exactly `20261027000100`, `20261027000110`,
`20261027000120`, `20261027000130`, `20261027000140` and `20261027000150` as local-only; then `supabase db push`. Check in the SQL editor of `estudio-coni` (`mvfytttfxmzzjajecsch`):

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'piezas_estado_antes_del_error_check';
select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as autenticado,
       has_function_privilege('anon', p.oid, 'execute') as anonimo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('guardar_armado', 'guardar_acortado', 'rechazar_diseno_que_no_cabe', 'pedir_armado_de_carrusel',
                     'cambiar_diseno_de_carrusel', 'pedir_cambio_de_carrusel', 'palabras_de_laminas');
select p.id, p.titulo, p.estado, c.version, c.estado as version_estado
  from public.piezas p join public.carruseles c on c.pieza_id = p.id
 where p.tipo = 'carrusel' and p.estado = 'armando_carrusel' order by c.version desc;
```

Expected: the check names `armando_carrusel`; `guardar_armado`, `guardar_acortado`, `rechazar_diseno_que_no_cabe` and
`pedir_armado_de_carrusel` false for both `autenticado` and `anonimo`; `cambiar_diseno_de_carrusel` and
`pedir_cambio_de_carrusel` true for `autenticado` and false for `anonimo` (`palabras_de_laminas` may be true: it reads only
its argument); the list of part 1 carousels waiting (write their ids down for Step 4), each latest version with
`armado_pedido_en` set by the push (the maintenance gives a render that never starts a day from then, and one that started
an hour from its start).

- [ ] **Step 3 (OK needed): Trigger.dev.** The image now builds Chromium (the `playwright()` layer: Debian libraries
plus `chromium-headless-shell` for `playwright@1.59.1`), so the first build is several minutes longer and the image
larger; that is expected. `pnpm install` first so the deploy bundles the lockfile's versions:

```bash
cd /Users/fede/Projects/estudio-coni && pnpm install
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

Check the build log names the `playwright` layer and the deploy lists `armar-carrusel`. Note the new version for
TRASPASO. No new environment variable: R2, Supabase and the Anthropic key in Vault are the existing ones;
`PLAYWRIGHT_BROWSERS_PATH` is set by the extension.

- [ ] **Step 4: The carousels signed in part 1.** Within ten minutes `mantenimiento-frecuente` starts `armar-carrusel`
for each piece of Step 2's list (dashboard: runs of `armar-carrusel` with those piece ids). Then:

```sql
select p.titulo, p.estado, c.version, c.origen, c.estado, cardinality(c.png_claves) as pngs, c.pdf_clave is not null as pdf
  from public.piezas p join public.carruseles c on c.pieza_id = p.id
 where p.tipo = 'carrusel' order by p.actualizada_en desc, c.version desc limit 10;
```

Expected: each one in `carrusel_por_aprobar` with its latest version `listo`, as many PNGs as slides, a PDF; or back in
`guion_por_aprobar` with an `acortado` version and the explanation (one Claude spend of about US$ 0.20, `paso =
'carrusel'`). A run that failed three times leaves the piece in `error_produccion`: read the run's error in the dashboard
before anything else (most likely the font path or the Chromium layer).

- [ ] **Step 5 (OK needed): app** (Federico), only after Step 3, from a clean `git archive` export of `main` so
`.worktrees/` and untracked files are not uploaded:

```bash
cd /Users/fede/Projects/estudio-coni
rm -rf /tmp/estudio-deploy && mkdir /tmp/estudio-deploy && git archive main | tar -x -C /tmp/estudio-deploy
cp -R .vercel /tmp/estudio-deploy/ && cd /tmp/estudio-deploy && vercel deploy --prod --yes
```

Wait 15 to 45 s for the alias, then confirm it is served: the live HTML of a gate 1 (`/guion/<a piece at gate 1>`, with
Coni's session) contains `Descartar esta pieza` before judging anything by a screenshot (hard refresh if the old page
shows).

- [ ] **Step 6 (OK needed): smoke.**
  1. The legacy reel of the retired "bienestar" pillar at gate 1: open it, "Descartar esta pieza", "Sí, descartar"
     (decision P2). `select estado from public.piezas where id = '<its id>'` is `descartado`; its confirmed voice spend
     is untouched (`select estado, real_usd from public.gastos where pieza_id = '<its id>'`).
  2. A carousel at gate 2 from Step 4: the rail shows the real slides (cream paper, Newsreader, the brand line with the
     pillar's short name, the counter); "Lámina siguiente" to the last; optionally one design change (re-renders in about
     a minute, no cost); "Desliza para programar" on a date Federico picks.
  3. At that time (or after it, the next 5-minute tick) the piece is `para_subir_a_mano` and Coni gets "Tu carrusel «…»
     está listo para que lo subas a LinkedIn…"; "Descargar PDF" downloads `carrusel-<id8>.pdf` with one page per slide;
     uploading it to LinkedIn and "Ya lo subí" closes it. LinkedIn received no API call for it (the publisher's log shows
     `para_subir_a_mano`, no `/rest/` request).
  Without the smoke, the integration, template and E2E suites are the evidence.

- [ ] **Step 7: Handoff.** Update `docs/TRASPASO.md` "Producción" (migrations up to `20261027000110`, the new Trigger
version with Chromium, the Vercel deploy, which part 1 carousels were rendered) in a commit on `main`, pushed only if
Federico asks. Update the auto-memory note of the carousels (`estudio-coni-traspaso.md` points to TRASPASO) only if
Federico asks.

---

## Self-review (2026-10-27)

- **Spec coverage (part 2).** D1 step 4 (render, `armando_carrusel`): Tasks 12, 16, 17, 18, 24. D1 step 5 (gate 2):
  Tasks 19, 22, 23, 24. D4: template HTML+CSS in `lib/carrusel/plantilla`, 1080 x 1350, committed OFL font, variants as
  CSS variables (Task 11); `document.fonts`, overflow measure, PNG per slide, `page.pdf` (Task 12); one shortening (Tasks
  14, 16); R2 through `Almacen` with new keys (Task 13); idempotency by version (Tasks 13, 17); 2 retries, `fallo`,
  `error_produccion`, "No pude armar el carrusel" and "Reintentar (no se cobra)" (Tasks 18, 24). D5: the four bounded
  changes, new row with the same hash, re-render, not counted (Tasks 5, 9, 19, 23). Screens: rail, dots, "Ver texto
  completo", "Pedir cambio" (texto o diseño), date consistent with the reel's gate 2 and `fechas_propuestas`, "Desliza
  para programar" (Tasks 22, 23); Inicio and Calendario labels (Task 25). Tests: unit (overflow by the real renderer,
  hash invariance under every design change, split and merge keep words and order, the downstream guard via
  `puedePublicar` and the publisher), database (Tasks 4, 5), integration with real Playwright (Task 12: PDF pages equal
  slides, PNG references), E2E full flow and manual fallback (Task 26), snapshots of gate 2 and the three variants
  (Tasks 12, 27), axe (Tasks 3, 27). D6 manual half: Tasks 20, 21, 24 (decision P1). Gate 1 discard: Lote 1 (P2).
- **Gaps and contradictions found and resolved.** Part 1's `proteger_pieza` made the retry and the design change
  impossible (amendment 1); `estado_antes_del_error` could not hold `armando_carrusel` (1); the spec's gate 2 had no
  SQL binding to the latest rendered version (2); "shorten once" did not say what happens after, nor how it stays
  bounded across her own changes (3); overflow could not be measured if the template auto-fit (4); "split at a sentence
  boundary" needed a rule for which boundary and the 4-to-6 idea bounds with the 8-slide check (5); "El texto" at gate 2
  had no path (`pedir_cambio_de_carrusel` only took gate 1) (6); the idempotency key had to survive Reintentar (7);
  Trigger's `onFailure` needed a carousel branch (8); part 1 carousels already waiting needed a pickup (9); the notice
  trigger did not fire on `carrusel_por_aprobar` (10); `editarTextoLinkedin` could write a reel column on a carousel
  (11); `/video/<id>` links of shared states (13); the publisher would have sent a due carousel to
  `falla_publicacion` through the reel path (Task 20); `puedePublicar` would have compared a carousel's missing video
  (Task 8). `ESTADOS_CON_TEXTO_DE_LINKEDIN_EDITABLE` leaving out `carrusel_por_aprobar` is intended (11).
- **Placeholders.** None open. Conditional notes name their exact fallback: column names of `gastos` in two tests
  (Tasks 1, 5), Biome suppressions only if the rule fires (Task 23), `Boton`'s disabled attribute (Task 23), the
  disclosure query (Task 23), the font URL if Google moves it (Task 11), duplicate idea titles in axe seeding (Task 27).
- **Type consistency.** `AprobacionCarrusel`, `AprobacionPuerta2`, the events `carrusel_armado`, `volver_a_firmar`,
  `cambiar_diseno`, `aprobar_carrusel` (Task 7) are used by Tasks 10, 16, 19, 20; `puedeArmar`, `Paso "armar"` (Task 8)
  by Tasks 16, 17; `VARIANTES`, `Variante`, `DisenoDeCarrusel`, `CambioDeDiseno`, `aplicarCambioDeDiseno`,
  `puedeDividir`, `puedeUnir`, `palabrasDestacables`, `leerDiseno`, `DisenoInvalido` (Task 9) by Tasks 11, 15, 19, 23;
  `EntradaDePlantilla`, `marcaDelCarrusel`, `FAMILIA_DEL_CARRUSEL`, `tamanoDeLetra`, `ANCHO`, `ALTO`, `COLORES` (Task 11)
  by Tasks 12, 16; `renderizarCarrusel`, `EntradaDeRender`, `Render`, `AbrirPagina`, `abrirPaginaDeChromium` (Task 12)
  by Tasks 16, 18; `claveLaminaDeCarrusel`, `clavePdfDeCarrusel` (Task 13) by Task 16; `acortarLaminas` (Task 14) by
  Task 16; `VersionDeCarrusel`, `leerVersionVigente`, `leerVersion`, `marcarVersion`, `marcarArmadoFallido`,
  `guardarArmado`, `guardarAcortado` (Task 15) by Tasks 16, 18, 19, 20, 21, 24, 26; `DepsArmado`, `armarCarrusel`
  (Task 16) by Tasks 18, 26; `claveArmar`, `Disparos.armar` (Task 17) by Tasks 17, 19; `aprobarCarruselAccion`,
  `cambiarDisenoAccion`, `descargarCarruselAccion` (Tasks 19, 21) by Tasks 23, 24; `fechasDePuerta2` (Task 23) by
  Task 24; `DescartarPieza` (Task 2) by Task 23.
- **Risks I checked.** A design change cannot move a word (TS hash check plus `palabras_de_laminas` in SQL); gate 2
  cannot sign a version still rendering or an older one (SQL); a stale screen cannot schedule (version lock plus the
  version id); a shortening is paid once per version and attempt (deterministic key, `guardar_acortado` confirms in the
  same transaction); a discard cannot strand a reservation (refused while working); Chromium never reaches the Next
  bundle (guard test, green build); `document.fonts.check` returning true for an unknown family (the renderer loads the
  face instead); the PDF's trailing blank page (`break-before` on all but the first section, counted by the test);
  macOS-only references (the Playwright snapshot names carry the platform, as the app baselines already do). Known
  limits: the PNG references are darwin like the rest of the visual suite; the shortening's quality is judged on
  Coni's first carousels (the explanation sends her to sign again either way).
