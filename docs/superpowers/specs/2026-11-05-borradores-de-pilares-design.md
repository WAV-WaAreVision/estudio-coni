# Pillars per network, part 15c: "+ Agregar pilar" and "+ Agregar red" as drafts

Issue WAV-WaAreVision/estudio-coni#18 (change 15), third of four parts. Design approved by Federico on 2026-11-05.
Builds on 15a (`2026-11-04-pilares-por-red-design.md`, PR #68) and 15b (`2026-11-04-temas-por-red-design.md`, PR #70).
Source: Coni's answer of 2026-11-04, `docs/pedido-coni-2026-10-31/respuesta-coni-temas-pilares-2026-11-04.md`, part 1,
sections 3 and 7.

## Context

- **Coni's rule:** "+ Agregar pilar" and "+ Agregar red" create nothing at once. They open a short form that saves a
  draft, and the pillar or network becomes active only when she approves it. A pillar needs a name, a short name, a
  definition and a weight. A network needs its manual, its recipe and its connection; for now a saved draft is enough.
- **Coni is the only person in Conidolly** (WAV never enters, decision A6). She writes the draft and she approves it,
  as a second, separate step.
- **Today's data:**
  - Pillars are `categorias` rows with `es_pilar`, `activa`, `red`, `es_capa`, `orden`, `nombre_corto` and
    `descripcion`. The trigger `exigir_red_de_pilar` refuses a new active pillar without a network.
  - Weights live in `pilar_pesos(pilar_id, red, es_capa, desde, peso)`, latest `desde` wins.
    `pesosDeRed(red, fecha)` flags a network whose weights do not add up to 100.
  - `categorias.red` only accepts `linkedin` and `instagram`. Activating a new network is development work (manual,
    recipe, connection, publishing), not part of 15c.

## Decisions taken in the design

1. **Drafts live in their own tables, not in `categorias`.** A draft can never leak into the engine, the pillar
   suggestions, "Cambiar pilares" or the Temas filters, because nothing that reads `categorias` sees it.
2. **Approval is a separate list** ("Borradores"), where Coni edits, discards or approves later.
3. **A network draft is never approved in 15c.** It stores a name and three free notes, shows "Esperando conexión",
   and WAV reads it by SQL when the network is built.
4. **Weights are redistributed at approval, in every stage** (Federico, 2026-11-05, option A). A network may already
   have weight stages planned for later dates (LinkedIn: 2027-01-01 and 2027-07-01). Approving shows "Hoy" plus each
   later `desde` of that network, each stage with every active pillar and the new one, all editable, with its own total.
   A total other than 100 warns and never blocks. The new pillar gets a weight in every stage. Changed weights are
   stored on the stage's date (today's on `current_date`); nothing is deleted, so history is kept.

## 1. Data

- **`borradores_de_pilar`:**
  - `id`, `red text not null check (red in ('linkedin','instagram'))`, `nombre`, `nombre_corto`, `descripcion`
    (all `text not null`, trimmed, not empty), `peso numeric(5,2) not null check (peso > 0 and peso <= 100)`.
  - `estado text not null default 'borrador' check (estado in ('borrador','aprobado','descartado'))`.
  - `pilar_id uuid references categorias(id)`, set only when approved (a check ties `estado = 'aprobado'` to
    `pilar_id is not null`).
  - `creado_por`, `creado_en`, `decidido_en` (when approved or discarded).
- **`borradores_de_red`:** `id`, `nombre text not null`, `manual`, `receta`, `conexion` (free text, may be empty),
  `estado text not null default 'borrador' check (estado in ('borrador','descartado'))`, `creado_por`, `creado_en`,
  `decidido_en`.
- **RLS:** Coni (`es_coni()`) reads, inserts and updates both tables; she can edit only rows in `borrador`. The
  maintainer (WAV) reads. No one deletes: discarding is a state, so the history stays.
- **`aprobar_borrador_de_pilar(p_borrador uuid, p_pesos jsonb)`**, security definer, `search_path = ''`, Coni only
  (`ERROR_SOLO_CONI` otherwise). In one transaction:
  1. Locks the draft and checks it is still `borrador` (otherwise `borrador_ya_decidido`).
  2. Refuses a name or short name already used by any `categorias` row of any state, through `nombre_normalizado`
     (`nombre_en_uso`), so an old retired pillar cannot be shadowed.
  3. Inserts the pillar: `es_pilar = true`, `activa = true`, `es_capa = false`, the draft's `red`, a slug made from
     the name (unique, with a numeric suffix on collision), `orden` = the network's highest `orden` + 1.
  4. Writes `pilar_pesos` per stage. The stages are today (`current_date`, America/Santiago) and every later `desde`
     that the network's active pillars already have. `p_pesos` is `{"<desde YYYY-MM-DD>": {"<pilar_id>" | "nuevo":
     peso}}`: a stage key that is not today or an existing later `desde` of that network is refused
     (`etapa_invalida`); a pillar key may only name an active, non-layer pillar of the draft's network
     (`pilar_de_otra_red` otherwise); a weight must be a number over 0 and up to 100 (`peso_invalido`). Stages are
     written oldest first. In each stage the new pillar gets a row on that `desde` (its weight under `"nuevo"`, else
     the draft's), and every pillar whose sent weight differs from its effective weight on that date gets a row on
     that `desde`; a second change on the same day replaces that day's row. Nothing is deleted.
  5. Marks the draft `aprobado` with `pilar_id` and `decidido_en`.
  The total is not checked: the screen warns, the database accepts.
- **Discard and edit** go through the RLS policies (no RPC needed). A discarded draft cannot be edited back.

## 2. Screens

- **Temas row (15b):**
  - `[ + Agregar red ]` closes the network row: `[ Sin tratar · N ] [ Instagram ▾ ] [ LinkedIn ▾ ] [ + Agregar red ]`.
  - Under the chosen network's pillars, `+ Agregar pilar` goes after the last pillar and before the Capa TDAH on
    Instagram, so the layer stays last. On the phone it slides with the pillars.
  - When drafts in `borrador` exist, a line `Borradores · N` (all drafts, both kinds) follows the pillar list and links
    to the list. With none, it does not show.
- **`/biblioteca/temas/pilar-nuevo?red=linkedin|instagram`:** form with Nombre, Nombre corto (the button's text),
  Definición and Peso (%). The network comes from the address and shows as text; an invalid or missing `red` falls
  back to the last network. "Guardar borrador" returns to Temas on that network with the notice "Guardé el borrador.
  Apruébalo en Borradores cuando quieras." "Cancelar" returns without saving.
- **`/biblioteca/temas/red-nueva`:** Nombre, Manual, Receta and Conexión (the last three optional, multi-line), with
  a short line saying the network will be connected by WAV and that the draft only saves her idea.
- **`/biblioteca/temas/borradores`:** pillar drafts grouped by network, then network drafts.
  - A pillar draft shows its fields and three actions: Editar (the same form, prefilled), Descartar (asks to confirm)
    and Aprobar.
  - Aprobar opens `/biblioteca/temas/borradores/[id]/aprobar`: one stage per weight date of that network from today
    on, "Hoy" first, then each later `desde` ("Desde el 1 de enero de 2027"). Stages are columns on the computer and
    blocks one under another on the phone. Each stage lists the network's active pillars and the new one (prefilled
    with the draft's weight), each weight editable, with its own live total and its own warning when it is not 100:
    "Los pesos de LinkedIn suman 110 %. Puedes aprobar igual y ajustarlos después." for today, "Los pesos de LinkedIn
    desde el 1 de enero de 2027 suman 110 %. ..." for a later stage. A warning never blocks. "Aprobar pilar" calls the
    RPC and returns to Temas with the new pillar chosen.
  - A network draft shows "Esperando conexión", with Editar and Descartar only.
- **Errors** are shown in her words: name in use, draft already decided, a pillar of another network, a stage that
  changed since the screen opened (`etapa_invalida`: "recarga"), no session. Nothing is swallowed.
- **Accessibility and words:** as 15b: tú, no em dashes, targets of 44 px or more, labels on every field, the form
  works on the phone and on the computer, Axe passes, large text works.

## 3. After a pillar is approved

- It appears in the Temas row of its network, in "Cambiar pilares" of a topic (15a), in the pillar proposals
  (`pilares:proponer`), and in the engine's prompts with its definition, because all of them read active pillars.
- **The editorial guide (v4) is not updated by the app.** The new pillar works in the app, but its manual text must
  be added to the guide by hand. The approval screen says so in one line, and the release notes record it.

## 4. Tests (TDD, failing test first)

- **Integration (local Supabase):**
  - Coni inserts and edits a draft; WAV reads and cannot write; nobody deletes.
  - A draft is not returned by any pillar reader (`pilaresActivos`, `temas_de_red` called with the draft id, the Temas row data).
  - Approval creates an active pillar of that network with the next `orden`, a unique slug, and the weights of the day;
    unchanged weights get no new row; a second approval of the same draft fails with `borrador_ya_decidido`.
  - Stages, on LinkedIn: the new pillar gets a row on today and on every later `desde` of the network; a changed
    weight in a later stage is written on that `desde` (replacing that day's row); a weight changed today but kept in a
    later stage gets that stage's row; a stage key that is not today or an existing later `desde` fails with
    `etapa_invalida`. The tests seed their own later stage relative to today, so they do not depend on the date.
  - A name already used by a retired pillar fails with `nombre_en_uso`. A weight for a pillar of the other network
    fails with `pilar_de_otra_red`. WAV calling the RPC fails with `ERROR_SOLO_CONI`.
  - A total other than 100 is accepted and `pesosDeRed` flags it.
- **Unit:** the forms' validation, the weights editor's stages, each stage's total and warning, the Borradores
  count, the row's links.
- **E2E (phone and desktop):** Coni's acceptance line "«+ Agregar pilar» guarda un borrador que no aparece en la lista
  hasta que lo apruebo": add a pillar, see it missing from the row, approve it with a redistribution, see it in the row
  with its topics filter. On LinkedIn, with a later stage the scene seeds relative to today, she edits that stage
  too (not visual, date independent). "+ Agregar red" saves a draft shown as "Esperando conexión". Axe and large text.
- **Visual baselines:** the Temas list (phone and desktop) changes with the new buttons; the new pages get their own.
  Federico looks at the captures before they are taken.

## 5. Release

- One additive migration (two tables, their policies, the RPC). `db push`, then merge. No existing row changes.
- No Trigger deploy: tasks read active pillars at run time and need no new code.

## Out of scope

Editing or retiring an approved pillar. Activating a network draft. Adding a layer. Angles and the balance warning
(15d). Updating the guide from the app.
