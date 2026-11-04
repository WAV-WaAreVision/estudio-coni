# Pillars per network, part 15a: the data, the reclassification and their readers

Issue WAV-WaAreVision/estudio-coni#18 (change 15, "Editable pillars per network"), first of four parts. Design approved by
Federico on 2026-11-04. Sources:

- `docs/pedido-coni-2026-10-31/respuesta-coni-temas-pilares-2026-11-04.md`: Coni's answer of 2026-11-04 (the Temas row,
  the merged pillars, the angles, the drafts), with her LinkedIn §22 and Instagram §23 manual sections.
- Coni's second answer the same day, on how a topic sits in the pillars (quoted in section 2).
- The change 15 card in `docs/pedido-coni-2026-10-31/fichas.md`.

## The four parts of change 15

| Part | What | Depends on |
|---|---|---|
| **15a (this spec)** | Pillars per network as data, the topics' pillars, the reclassification of today's topics, everything that reads pillars | nothing |
| 15b | The Temas row (`Sin tratar`, `Instagram ▾`, `LinkedIn ▾`, `+ Agregar red`), "Más filtros", and "tratado" per network (a published piece on that network, which needs a stored topic link on pieces) | 15a |
| 15c | `+ Agregar pilar` / `+ Agregar red` as drafts that become active only when Coni approves | 15a |
| 15d | Angles per piece and the balance warning (1 in 3) | 15a; best with changes 11 and 12 |

## Context: what is there today

- **A pillar is a row of `categorias` with `es_pilar = true`.**
  - There are 5 active pillars: `ia-salud-mental`, `practica-clinica`, `etica-regulacion`, `acceso-salud-publica` and `caso-coni`.
  - There are 5 inactive sexology pillars, plus the plain category `general`.
  - Pillars have no network, weight, angle or draft.
- **These are not the pillars of Coni's manuals.** Her old LinkedIn 01–06 and Instagram P1–P4 were never in the app. So there is no "pillar merge" to run on data: today's topics are **reclassified** into her new pillars, and that can be undone.
- **What points at pillars:**
  - `temas.categoria_id`: one id, set by Claude when the topic is created (`lib/ingesta/temas.ts`).
  - `ideas.pilar`: a slug, with an FK to `categorias(slug)`. The trigger `exigir_pilar_activo` only lets a write target an active pillar.
  - `materiales.categoria_id` and `teorias.categoria_id`.
- **Production on 2026-11-04:**
  - 15 live topics and 7 materials.
  - 20 ideas: 4 in the bank (`estado = 'idea'`), all on today's active pillars; 7 used by pieces; 9 discarded.
  - 1 published piece (LinkedIn).
- **`archivar_ideas_de_pilares_retirados()` ran once, in its own migration.** Nothing calls it on a schedule. Still, a bank idea on a retired pillar breaks readers that expect an active one (`pilarVisible` throws), so the bank ideas move before the old pillars retire.
- **The editorial guide (`guias`) hardcodes a table of today's 5 pillars.** Its source is `coni-heygen/contenido/linea-editorial.md`, copied to `tests/fixtures/linea-editorial.md` and pinned by `tests/integration/produccion-esquema.test.ts`.

## 1. Pillars per network (schema)

`categorias` grows instead of a new table, so `ideas.pilar`'s slug FK, `leerPilares` and every reader keep working.

- **New columns:**
  - `red text` with `check (red in ('linkedin','instagram'))`. It is null for `general` and for every old pillar.
  - `es_capa boolean not null default false`. A layer is a lens that shows up inside the pillars (the Capa TDAH): it has a network and no weight.
- **Checks:**
  - `pilar_con_red check (not (es_pilar and activa) or red is not null)`: from now on an active pillar belongs to a network.
  - `capa_es_pilar check (not es_capa or es_pilar)`.
  - The existing `pilar_completo` and `pilar_activo_descrito` still apply.
- **`unique (id, red, es_capa)`**, so `tema_pilares` can carry the network and the layer flag through a composite FK.
- **`pilar_pesos(pilar_id uuid references categorias(id), desde date, peso numeric(5,2) check (peso > 0 and peso <= 100), primary key (pilar_id, desde))`.**
  - The weight of a date is the row with the latest `desde <= date`.
  - The seed has the three LinkedIn stages and one Instagram row (table below).
  - A layer has no rows.
  - Nothing forces the weights of a network to add up to 100. `pesosDeRed(red, fecha)` returns them, plus a flag when the total is not 100, for the 15c panel to warn. No reader uses the weights yet; the engine and the weekly session will (changes 21, 25).
- **RLS as `categorias`:** Coni and the maintainer read. Only migrations and definer RPCs write in 15a; 15c adds Coni's drafts.

### Seed: the new pillars (from her manuals, 2026-11-04)

Each row carries `slug`, `nombre`, `nombre_corto` (the button text), `descripcion` (the manual's definition) and `orden`. The descriptions are copied from §22 and §23 in the plan, not invented.

| red | orden | slug | nombre_corto | nombre | peso |
|---|---|---|---|---|---|
| linkedin | 1 | `diagnostico-doble` | Diagnóstico doble | Diagnóstico doble: transformación digital con factor humano | today 30, 2027-01-01 25, 2027-07-01 25 |
| linkedin | 2 | `bienestar-e-impacto` | Bienestar e impacto | Bienestar e impacto: lo que le pasa a las personas cuando llega la IA, y cómo medirlo | 25 / 25 / 20 |
| linkedin | 3 | `psicologia-en-la-mesa` | Psicología en la mesa | Psicología en la mesa: la psicología donde se construye la IA | 30 / 35 / 30 |
| linkedin | 4 | `mujeres-lideres` | Mujeres líderes | Mujeres líderes, IA y síndrome del impostor | 15 / 15 / 25 |
| instagram | 1 | `game-over-impostora` | Game Over Impostora | Game Over Impostora | 35 |
| instagram | 2 | `mi-nueva-partida` | Mi nueva partida | Mi nueva partida | 40 |
| instagram | 3 | `inteligencia-emocional` | Inteligencia emocional | Inteligencia emocional aplicada: autocuidado, productividad y relaciones | 25 |
| instagram | 4 | `capa-tdah` (`es_capa`) | Capa TDAH | Capa TDAH | none |

"Today" is `desde = 2026-11-04`. The new slugs join the guard list in `tests/unit/sin-slugs-de-pilar.test.ts`, so no code hardcodes them.

## 2. A topic's pillars

Coni's answer: "Un pilar principal por red. Es el único en cuya lista aparece el tema [...]. Pilares secundarios opcionales [...] No aparecen en las listas, pero los usan el motor y el Taller para proponer cruces, y en el detalle del tema se ve «también toca: …». [...] Capa TDAH aparte, cuando el tema tiene esa mirada. Si un tema no calza en una red, queda sin pilar en esa red y no aparece en sus listas, pero sigue apareciendo en el buscador."

- **Table `tema_pilares`:**
  - Columns: `tema_id uuid references temas(id) on delete cascade`, `pilar_id uuid`, `red text`, `es_capa boolean`, `fuerza text check (fuerza in ('alta','media','baja'))`, `origen text check (origen in ('reclasificacion','automatico','coni'))`, `lote text`, `creado_en timestamptz default now()`.
  - Primary key `(tema_id, pilar_id)`.
  - `foreign key (pilar_id, red, es_capa) references categorias(id, red, es_capa)`. A pillar's network and layer flag cannot change while topics use it.
- **The main pillar is the only `alta` of a topic in a network:**
  - Partial unique index `(tema_id, red) where fuerza = 'alta' and not es_capa`.
  - Secondary pillars are `media` or `baja`.
  - A layer row is its own kind: `es_capa`, `fuerza` null.
  - Check: a layer row has no `fuerza` and a pillar row has one.
- **Merged topics:** `fusionar_par_de_temas` moves the rows of the topic that disappears to the one that stays, keeping the stronger row on a clash. If both have an `alta` in a network, the winner's stays and the loser's becomes `media`.
- **Readers:**
  - `pilaresDeTema(tema)` returns, per network, `{ principal, secundarios[], capa }`.
  - `listarTemas` keeps the `?pilar=` filter on the **main** pillar of that pillar's network.
- **`temas.categoria_id` is left as it is.** It still says where each topic came from. Nothing reads it for pillars once 15a is in.

## 3. Reclassifying today's topics and bank ideas

The pattern of `scripts/reclasificar-pilares.ts` (spec 2026-10-17): propose, a person reviews, apply. Plus a way back.

1. **Propose** (`pnpm pilares:proponer`, writes nothing).
   - For each of the 15 live topics, Claude reads the topic's name, description and some claims, with the new pillars' definitions. It proposes:
     - the main pillar in LinkedIn or none;
     - the main pillar in Instagram or none;
     - the secondaries;
     - the TDAH layer yes/no.
   - For each of the 4 bank ideas, it proposes one new pillar (any network).
   - Output: a CSV for the apply step, and a Spanish Markdown list for Coni with exactly her columns plus "venía de" (today's pillar). Topics: `Tema · Principal LinkedIn · Principal Instagram · Secundarios · Capa TDAH · Venía de`. Ideas: `Idea · Pilar nuevo · Venía de`.
2. **Review.** Federico sends Coni the list. Her corrections go into the CSV.
3. **Apply** (`pnpm pilares:aplicar <csv>`, with Federico's OK: it rewrites production data). In one transaction, through a definer RPC `aplicar_lote_de_pilares(lote, filas jsonb)`:
   1. inserts the `tema_pilares` rows with `origen = 'reclasificacion'` and `lote`;
   2. saves each bank idea's current `pilar` in `ideas_pilar_antes(idea_id, pilar, lote)`, then moves it to its new pillar;
   3. sets `activa = false` on the 5 old active pillars, after the ideas moved, so no bank idea is left on a retired pillar.
   - Ideas already used by pieces and discarded ideas keep their old slug. That is history.
4. **Undo** (`deshacer_lote_de_pilares(lote)`):
   - deletes that lot's `tema_pilares` rows;
   - puts back the ideas' pillars from `ideas_pilar_antes`;
   - reactivates the old pillars it retired. The new ones stay active and simply have no topics.
   - The integration test round-trips it.

The lot id is `pilares-por-red-2026-11`. The schema migration changes no row. Only the apply step does, and it is Federico's OK.

## 4. Everything that reads pillars

- **`leerPilares`** returns `red`, `es_capa` and `id`. The domain helpers filter by network. A layer is never offered where a pillar is chosen (ideas, pieces).
- **Prompts** (`lib/proveedores/anthropic/secciones.ts` `listaDePilares`): the list groups by network (`LinkedIn: ...`, `Instagram: ...`) and leaves layers out.
  - The engine (`teorias.ts`) and ideas (`ideas.ts`) offer every active pillar with its network.
  - `guion.ts` and `carrusel.ts` keep `Pilar: nombre (descripcion)` of the piece's idea.
  - The words "pilares de contenido para LinkedIn" become "de LinkedIn e Instagram".
- **Creating a topic** (`lib/ingesta/temas.ts`): Claude also returns the main pillar per network, or none, and the layer.
  - It writes `tema_pilares` with `origen = 'automatico'` and the old `categoria_id` as before.
  - An unknown slug is dropped, like today's `null`.
- **Engine** (`motor_temas`, `motor_pares`):
  - `motor_temas` returns the topic's main pillar slugs (both networks).
  - `motor_pares` crosses two topics when no network gives them the same main pillar. Before, it required `x.pilar <> y.pilar`.
  - Secondaries are stored for the Taller (change 21) and not used here.
- **Editorial guide:**
  - A new `guias` version replaces the 5-pillar table with the new pillars per network: name, weight today and the angle names as text. This is in step with `coni-heygen/contenido/linea-editorial.md` and `tests/fixtures/linea-editorial.md`.
  - The migration that inserts it only adds a row: the old version stays, with `vigente = false`.
- **Ideas:**
  - `lib/acciones/ideas.ts` checks a chosen pillar against active, non-layer pillars.
  - The ideas screen chips show `nombre_corto` grouped by network.
  - The bank import (`lib/ideas/banco.ts`) matches the new names.
- **Metrics:** unchanged. Per-pillar history under old slugs keeps its old name (1 published piece today); `pilarActivo` already handles a retired pillar.
- **Ingesta** (separate repo) reads `categorias.activa`. After the apply it lists the new pillars without networks until batch 7 retires its Temas. No change there.

## 5. Screens in 15a

- **Topic detail** (`/biblioteca/temas/[id]`): a "Pilares" section with one line per network.
  - Example: "LinkedIn: Bienestar e impacto · También toca: Diagnóstico doble".
  - Instagram gets its own line, with "Capa TDAH" when it applies.
  - A network without a main pillar says "Sin pilar en Instagram".
- **"Cambiar pilares"** opens an inline form on the same page:
  - per network, a select for the main pillar (or none) and checkboxes for the secondaries (main excluded);
  - on Instagram, the layer toggle.
  - Saving goes through `cambiarPilaresDeTema` (`conSesionDeConi`, Zod), which replaces the topic's rows with `origen = 'coni'` in one RPC and refreshes `/biblioteca`.
- **Temas "Más filtros":** the pillar select groups its options by network (`optgroup`). It filters on the main pillar.
- **The quick coverage filters stay as they are until 15b.** Coni does not see the section yet: the tab still opens Ingesta.
- Words: "pilar principal" never shows. The main one is just the pillar; the others are "También toca". Tú, no em dashes, `PALABRAS` where it applies.

## 6. Tests (TDD, failing test first)

- **Schema** (integration, local Supabase):
  - an active pillar needs a network;
  - a layer has no `fuerza` and no weight rows;
  - two `alta` rows for one topic and network are refused, while one per network is accepted;
  - a layer next to a main pillar is accepted;
  - RLS: Coni reads and cannot write `tema_pilares` directly;
  - the seed has 7 pillars plus 1 layer, weights adding to 100 per network and stage.
- **Apply and undo:**
  - applying a lot writes the rows, moves the 4 ideas and retires the 5 pillars;
  - no bank idea ends on an inactive pillar;
  - undo restores all of it;
  - applying the same lot twice is refused;
  - WAV can run neither from the app.
- **Topic merge:** pillar rows follow the topic that stays; the stronger row wins.
- **Unit:**
  - `pilaresDeTema`;
  - `pesosDeRed` (stage by date, the not-100 flag);
  - `listaDePilares` grouped by network without layers;
  - the propose step's CSV and Markdown (columns, "venía de");
  - the engine pair rule.
- **Prompts:** the engine and ideas prompts list both networks. The guide fixture equals the new `guias` version.
- **E2E** (phone and desktop):
  - the topic detail shows the pillars per network;
  - "Cambiar pilares" changes the main pillar and a secondary, which then shows in the list filter;
  - axe, large text, and the design rules test on new files.

## 7. Release

This part needs **Federico's OK twice**: the Trigger deploy, and the apply step that rewrites production data.


1. **Merge plus `db push` of the schema migration** (adds columns, tables and the seed; changes no row).
   - Federico's standing authorization covers it: issue on the board, CI green, dry-run first.
   - The new guide version activates with it.
2. **Run the propose step.** Federico sends Coni the list.
3. **With her answer and Federico's OK, run the apply step on production.** Read-only SQL checks before and after: counts per pillar, no bank idea on an inactive pillar.
4. **Trigger deploy, with Federico's OK.**
   - Topic creation runs in `procesar-material`, the engine in `motor-semanal`, and the script and carousel prompts in `producir-pieza` and `armar-carrusel`. They only pick up the new pillars after a deploy.
   - Order: `db push`, then merge (Vercel), then the Trigger deploy right after.
   - Until the deploy, the old tasks must keep working against the new schema:
     - `motor_temas` keeps its `pilar` column (the old `categoria_id` slug) and gains `pilares text[]` (the main ones);
     - `motor_pares` takes the new rule only through a new parameter, defaulting to the old rule;
     - topic creation keeps writing `categoria_id`.
   - So a topic created between the merge and the deploy has no `tema_pilares` rows. The apply step's propose run lists it too.

## Out of scope

The Temas row, "tratado" per network and storing a piece's topic (15b). Drafts and adding networks (15c). Angles and the balance warning (15d). Per-pillar weights in the engine or the weekly session (changes 21, 25). Per-network manuals in `guias` (change 18).
