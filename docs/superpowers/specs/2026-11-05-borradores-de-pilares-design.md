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
4. **Weights are redistributed at approval.** Approving shows every weight of that network, editable, with the total.
   A total other than 100 warns and never blocks. Changed weights are stored with today's date; history is kept.

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
  4. Writes `pilar_pesos` with `desde = current_date` (America/Santiago) for the new pillar and for every pillar of
     `p_pesos` whose weight differs from its current one. `p_pesos` is `{pilar_id: peso}` and may only name active
     pillars of the draft's network (`pilar_de_otra_red` otherwise); the new pillar's weight is the draft's, or
     `p_pesos` may override it under the key `"nuevo"`. A second weight change on the same day replaces that day's row.
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
  - Aprobar opens `/biblioteca/temas/borradores/[id]/aprobar`: the network's active pillars and the new one, each with
    its current weight editable, the total live, and the warning "Los pesos de LinkedIn suman 110 %. Puedes aprobar
    igual y ajustarlos después." when it is not 100. "Aprobar pilar" calls the RPC and returns to Temas with the new
    pillar chosen.
  - A network draft shows "Esperando conexión", with Editar and Descartar only.
- **Errors** are shown in words (`PALABRAS`): name in use, draft already decided, a pillar of another network, no
  session. Nothing is swallowed.
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
  - A name already used by a retired pillar fails with `nombre_en_uso`. A weight for a pillar of the other network
    fails with `pilar_de_otra_red`. WAV calling the RPC fails with `ERROR_SOLO_CONI`.
  - A total other than 100 is accepted and `pesosDeRed` flags it.
- **Unit:** the forms' validation, the weights editor's total and warning, the Borradores count, the row's links.
- **E2E (phone and desktop):** Coni's acceptance line "«+ Agregar pilar» guarda un borrador que no aparece en la lista
  hasta que lo apruebo": add a pillar, see it missing from the row, approve it with a redistribution, see it in the row
  with its topics filter. "+ Agregar red" saves a draft shown as "Esperando conexión". Axe and large text.
- **Visual baselines:** the Temas list (phone and desktop) changes with the new buttons; the new pages get their own.
  Federico looks at the captures before they are taken.

## 5. Release

- One additive migration (two tables, their policies, the RPC). `db push`, then merge. No existing row changes.
- No Trigger deploy: tasks read active pillars at run time and need no new code.

## Out of scope

Editing or retiring an approved pillar. Activating a network draft. Adding a layer. Angles and the balance warning
(15d). Updating the guide from the app.
