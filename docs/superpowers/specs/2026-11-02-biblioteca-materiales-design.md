# Biblioteca in Conidolly, batch 1: foundations and Materiales (change 29, stage 2)

Issue WAV-WaAreVision/estudio-coni#17 · Pedido 29b · batch 1 of 7. Approved by Federico on 2026-11-02.
Sources: `docs/pedido-coni-2026-10-31/pedido-original.md` (Cambio 29, fixes 4a to 4n, mockups `media/image3.png` phone and
`media/image4.png` desktop), `decisiones.md` (A6, A14), `respuestas-coni-2026-11-01.md`. Stage 1 (29a) is in production:
`docs/superpowers/specs/2026-11-02-biblioteca-misma-sesion-design.md`.

## Context and the 7 batches

Stage 2 moves the Ingesta screens (Materiales, Autores, Temas, Semana, Subir) into Conidolly as the "Biblioteca" section,
with Coni's fixes 4a to 4n and a wide desktop layout (table + side panel). It ships in 7 batches, each with its own spec,
plan and release:

1. **Foundations + Materiales** (this spec).
2. Subir (4d, 4e, then 4k single field). R2 CORS for Conidolly's origins.
3. Autores + Temas (4i, quick filters on Temas).
4. Delete with "Deshacer" (4g): migration + maintenance step (Trigger deploy, Federico's OK).
5. Semana ("Proponer ahora" with its estimated cost, 4l).
6. Process immediately (4a): the task's cost gate (Trigger deploy, Federico's OK).
7. Tab switch: "Biblioteca" becomes a normal tab to `/biblioteca`; the stage 1 bridge stays only for old links.

Fixed for the whole stage:
- **Only Coni enters the Biblioteca in Conidolly (A6).** The card's `(biblioteca)` layout with `leerMiembro` /
  `conSesionDeMiembro` for WAV is NOT built. WAV keeps Ingesta, against the same database, until stage 3. Any migration in
  a later batch must keep Ingesta correct or ship with a matching Ingesta PR.
- **Port, do not share.** Ingesta's code is adapted to Conidolly's patterns (readers in `lib/datos`, actions through
  `conSesionDeConi`, pieces from `components/ui`, Conidolly's design rules). No package shared between repos. Ingesta is
  not changed by this batch.
- **The bar's tab does not change until batch 7.** Until then the tab keeps opening Ingesta through the bridge, and each
  batch is in production reachable only by its address, so Coni never sees a half-moved Biblioteca.

## 1. Foundations (no screen)

- **Disparos** (`lib/acciones/disparos.ts`, `disparos-entorno.ts`, `disparosDeLaApp`): add
  `material(materialId, intento?)` (task `procesar-material`, idempotency key `procesar-material:<id>` plus `:<intento>`
  when given, TTL 10 min, as Ingesta's `lib/ingesta/disparo.ts`) and `motor(semana)` (task `motor-manual`, key
  `motor:<semana>`; used from batch 5, built here because it shares the change). Test mode records like the other disparos.
  Without the per-attempt key, "Reintentar", "Reprocesar" and "Procesar por ~US$ X" within 10 minutes reuse the failed
  run's key and do nothing: tests pin that two attempts produce two keys.
- **Almacén** (`lib/proveedores/almacen.ts`): add `tamano(clave)` (HEAD; null when missing) and `borrarCarpeta(prefijo)`
  (list + delete; used from batch 4), and a signed GET for `texto-original.txt` only (Ingesta's `exigirDescarga` rule).
  Support an `R2_ENDPOINT` override that is refused on Vercel (as Ingesta does), for the E2E fake.
- **E2E fake S3**: port Ingesta's `tests/e2e/almacen-falso.ts` as a Playwright web server in Conidolly's E2E config.
- **Pure domain** in `lib/dominio/biblioteca/`: the material model and labels (from Ingesta `lib/ingesta/modelo.ts`),
  the status presentation (from `estado-de-material.ts`, icon + word, never colour only), filters (`filtros.ts`), tags
  (`etiquetas.ts`), card editing rules (`ficha.ts`), plus the words of fix 4h (see 3). Pure functions with unit tests.
- **Readers** in `lib/datos/biblioteca.ts` (each `leerX(db, ...)`, throws on error, as `lib/datos/*` does):
  - `listarMateriales(db, filtros)`: latest 100, with author name, state, type, role, upload date, and **main topic**:
    the topic with the most non-excluded claims of that material, plus how many other topics it has (rendered "+N").
    Computed from `afirmaciones (material_id, tema_id)` joined to `temas (nombre)` for the listed ids, paged past the
    1000-row API limit (Ingesta's `paginas.ts`), aggregated in TypeScript. No migration. If the E2E seed shows this is
    slow, a `security_invoker` view comes in a later batch.
  - `contarPorEstado(db)`: counts for the quick filters ("Procesando · N", "Con error · N").
  - `leerMaterialConFicha(db, id)`, `leerMapaDelMaterial(db, id)`, `listarAutores(db)`; pillars only through
    `lib/datos/pilares.ts`.
- **Actions** in `lib/acciones/biblioteca.ts` (`"use server"`, `conSesionDeConi` with Zod): edit author and role, edit the
  card, reprocess, retry, confirm cost, create author, signed text download. They reuse the existing RPCs
  (`reprocesar_material`, `reintentar_material`, `confirmar_costo_material`, `marcar_disparo_fallido`, `crear_autor`) and
  RLS; nothing new in the database. Deleting a material is not in this batch's UI (it arrives with "Deshacer" in batch 4).
  `revalidatePath` targets are the `/biblioteca/...` paths.

## 2. The section shell

- Route group `app/(app)/biblioteca/` with its own layout: keeps the offline bar and the bottom/top nav of `(app)`, but
  widens on `md:` (the `(app)` layout pins 560 px today). Own `loading.tsx`, `error.tsx` and `not-found.tsx` in plain
  Spanish (4m). Gate: `exigirConi()` like every Coni page; anyone else gets what `(app)` gives today.
- Section nav with `Pestanas`: only the sections already moved (Materiales in this batch). Autores, Temas and Semana are
  added by their batches. Icon + name, fits at 375 px and with large text (4c).
- Phone: one column. Desktop (`md:` and up): two columns, list or table on the left, side panel on the right.

## 3. Materiales

- **Quick filters** (4b): a row of `Chip`s with Todos, "Procesando · N", "Listos", "Con error · N" (one tap, `aria-pressed`,
  state in the URL). Author, role and type go folded into "Más filtros" (`MasOpciones`). No search box: search is change 1.
- **Phone list**: cards with title, type · author · role in simple words, main topic, and the status pill (icon + word,
  4j). The confirm-cost and retry buttons stay on the card where they apply. Auto-refresh every 10 s while anything is
  processing (`RefrescoAutomatico`). A row opens the full detail.
- **Desktop table**: columns Material, Tipo, Autor, Tema, Estado, Subido ("Hace 2 días", "Ayer", "Lunes", from the upload
  date in America/Santiago). Selecting a row opens the **side panel** with `?m=<id>` in the URL (linkable, Back closes it):
  type · upload date · status, title, "Ideas sacadas" with its count and the first two, "Ver todas" (to the full detail),
  "¿Quién es para ti?" (author and credential), "Detalle para WAV" folded (`components/ui/detalle-para-wav.tsx`: role code, score, evidence,
  cost, ids). Keyboard: rows are links, the panel has its own heading and close control. With no `?m`, the panel shows a
  short hint.
- **Full detail** `/biblioteca/materiales/[id]`: header with status; the editable card for role `estrategia`, otherwise the
  map of claims; author and role editor (with inline "Autor nuevo"); "Descargar texto original" (signed GET of
  `texto-original.txt` only); "Reprocesar" and "Reintentar" with their confirmation. The back link says where it goes and
  sits on the left ("← Materiales", 4f). Not found: the section's not-found page.
- **Simple words** (4h), as a table in `lib/dominio/biblioteca/palabras.ts` with a unit test: "Papel" → "¿Quién es para ti?",
  "Afirmaciones" → "Ideas sacadas", "Puntaje 0,82" and "Evidencia: Débil" only inside "Detalle para WAV". The roles keep
  Coni's labels from Ingesta ("Lo dijo Coni", "Referente", "Estudio o libro", "Estrategia interna").

## 4. Tests (TDD, failing test first)

- Unit: disparos keys per attempt; almacén `tamano`/`borrarCarpeta`/signed text GET; every pure module; readers'
  aggregation of the main topic (ties, no claims, excluded claims, more than 1000 rows); presentation of dates and states;
  actions validate input and refuse when not Coni.
- Integration (local Supabase): readers and actions as Coni; **WAV is refused** on every action (RLS and `es_coni`).
- E2E (phone and desktop projects): list with quick filters and "Más filtros"; desktop table → side panel → "Ver todas";
  detail edits and reprocess/retry record a `procesar-material` disparo with a new key; signed download; not-found and
  error pages; axe on list, panel and detail; large text; `tests/unit/diseno-reglas.test.ts` passes on every new file (no
  `text-[...]`, Phosphor through `ICONO`, no hex, no em dash).
- Visual baselines for the new screens, committed separately after Federico looks at them.

## 5. Release

Merge only: no migration, no Trigger deploy, no env var (R2 and Trigger variables already exist in Conidolly). After the
merge, `/biblioteca` answers a redirect to sign-in without a session, and Federico (Coni's test account) checks it by its
address. The bar does not change; Coni sees nothing new until batch 7.

## Risks

- **Main-topic cost**: one extra query per page over claims; bounded by 100 materials and paged. Measured in E2E seed.
- **Two UIs over one schema** until stage 3: this batch adds no migration, so Ingesta is unaffected.
- **Desktop primitives are new** (table, side panel): built once here, reused by batches 3 and 5.
- **Design-rule test**: ported markup must be rewritten to Conidolly's pieces and scale, not copied.

## Out of scope

Subir (batch 2), Autores and Temas (3), delete with "Deshacer" (4), Semana (5), process immediately (6), the tab switch
(7), search (change 1), "Subir una carpeta" (change 8), "Para leer después" and the classification card (change 24).
