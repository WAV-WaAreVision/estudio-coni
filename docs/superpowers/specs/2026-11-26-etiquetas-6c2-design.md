# Change 6c-2 · Weekly batch of doubtful tags

Part of change 6 (#21) of Coni's request of 2026-10-31 (`docs/pedido-coni-2026-10-31/pedido-original.md`, change 6,
points 6, 8 and 10: «los casos dudosos me llegan en tandas cortas», «los dudosos entran en las ~5 confirmaciones
semanales»). 6a, 6b and 6c-1 are in production (6c-1 is PR #136, migration `20261114000800`). Remaining after this one:
6c-3 (monthly error report) and 6c-4 (provisional pillar per network).

Decisions taken with Federico on 2026-11-26:

- **Doubtful** = low certainty marks, `otro` / `otra` / `sin_clasificar` values, and hook types not confirmed with high
  certainty (details below).
- **Where:** a line in Inicio, like the topic merges line, that leads to a review page. No push, no email.
- **Cadence:** one fixed batch per week (Monday, America/Santiago), up to 5 tags, built the first time it is read that
  week. No Trigger task.
- **Unanswered:** the old batch closes on Monday; tags still doubtful go first into the new batch.
- **`marca_id` in the log:** added now (closes the known 6c-1 limit with two marks of the same field and network).

Production on 2026-11-26: 189 claims, all old (`etiquetas_antiguas`), 0 marks, 0 hooks, 0 corrections, no
`sin_clasificar` tipo or evidencia. The batch stays empty until new materials or change 7's reprocess arrive.

Note: the request's draft schema had `afirmacion_marcas.dudosa boolean`; the real table (6a) has no such column. Doubt is
derived from `certeza` and `valor`.

## What counts as doubtful

Only claims that are visible (`materiales_visibles`) and not `excluida`. Anything with `origen = 'coni'` is never doubtful
(Coni already confirmed or corrected it).

| Motivo | Rule | Applies to |
|---|---|---|
| `sin_clasificar` | `afirmaciones.tipo` or `afirmaciones.evidencia` = `sin_clasificar`; a mark with `valor = 'sin_clasificar'` | tipo, evidencia: any claim (old or new). Marks: new claims |
| `otro` | mark with `valor in ('otro', 'otra')` | new claims |
| `gancho` | `ganchos.certeza <> 'alta'` and `origen <> 'coni'` | any claim with a hook row |
| `certeza_baja` | mark with `certeza = 'baja'` (and not already `otro` / `sin_clasificar`) | new claims |

Order to fill a batch: (1) items of the most recent previous batch still doubtful, by their old position; (2) motivo in the order of the
table; (3) oldest claim first (`afirmaciones.creada_en`), then id. **At most one item per claim per batch**, so the five
cards vary. A tipo or evidencia in `sin_clasificar` cannot be «Está bien» (6c-1 refuses `sin_clasificar` as a value): its
card only offers «Cambiar».

An item is **done** when its tag is no longer doubtful: the mark or hook has `origen = 'coni'`, the mark was removed, or the
tipo / evidencia left `sin_clasificar`. Nothing is written to mark it done, so correcting the tag from the claim's detail
page (6c-1) also takes it out of the batch.

## Data (one migration `20261114000900_lote_de_etiquetas.sql`, no Trigger deploy)

### `correcciones_de_etiqueta.marca_id`

`uuid null`, **no foreign key** on purpose: a `quita` row keeps the id of the mark it removed. `corregir_etiqueta`,
`confirmar_etiqueta` and `quitar_marca` write it for marks (the row they touched or inserted); null for tipo, evidencia,
tipo_de_gancho. `revisionDe` (`lib/dominio/biblioteca/etiquetas-de-afirmacion.ts`) matches by `marca_id` when the row has
one, else by campo and red as today. Existing rows (0 in production) stay null.

### `lotes_de_etiquetas`

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| semana | date | unique; the Monday of the week in America/Santiago |
| creado_en | timestamptz | default now() |

### `lote_de_etiquetas_items`

| Column | Type | Notes |
|---|---|---|
| lote_id | uuid | references lotes_de_etiquetas, on delete cascade |
| posicion | smallint | 1 to 5; primary key (lote_id, posicion) |
| afirmacion_id | uuid | references afirmaciones, on delete cascade |
| campo | text | `tipo`, `evidencia`, `problema`, `solucion`, `emocion`, `publico`, `dato`, `caso`, `tipo_de_gancho` |
| red | text | `linkedin`, `instagram`, `todas` |
| marca_id | uuid null | the mark row, for marks; references afirmacion_marcas on delete set null (a mark item with null marca_id means the mark was removed, so it is done) |
| motivo | text | `sin_clasificar`, `otro`, `gancho`, `certeza_baja` |

Unique (lote_id, afirmacion_id). RLS on both tables: read for `es_coni() or es_mantenedor()`; no write grants for
`authenticated`.

### Functions (security definer, `search_path = ''`)

- `etiquetas_dudosas()` (private helper, not granted): the doubtful tags as rows (afirmacion_id, campo, red, marca_id,
  motivo, creada_en), following the table above.
- `lote_de_la_semana()` returns the current week's items with their state:
  - Coni (`es_coni()`): if no batch exists for this week, inserts it (`on conflict (semana) do nothing`, then re-reads, so
    two tabs never build two batches) and fills up to 5 items with the order above. Carried items are those of the most
    recent previous batch still doubtful.
  - Mantenedor: reads the batch if it exists, never builds it (returns empty otherwise).
  - Anyone else: `42501 solo_coni`.
  - Each returned row: posicion, afirmacion_id, campo, red, marca_id, motivo, `hecha boolean` (derived rule above).
  - A batch built with zero candidates is stored with no items: Inicio shows nothing that week, even if doubtful tags arrive
    later that week (they wait for Monday).

Week boundary: `date_trunc('week', now() at time zone 'America/Santiago')::date`.

## Screens

### Inicio

When the week's batch has items not done: one status line «Tienes n etiquetas para revisar» (n = pending; singular «1
etiqueta») linking to the review page, same style and failure behavior as the merges line (`contarPropuestasParaInicio`:
on error, log and show nothing). Calling `lote_de_la_semana()` from Inicio is what builds the batch on Monday.

### `/biblioteca/etiquetas/revisar`

- Coni or mantenedor (`exigirConi` style guard used by the Biblioteca); mantenedor sees it read only (no buttons).
- Title «Etiquetas para revisar», progress «2 de 5».
- One card per item, in position order: the claim text (short) and its author; the tag's label (from the vocabulary) and
  free phrase; why it is here: `certeza_baja` «Claude no estaba segura», `otro` «Quedó en Otro: {por_que}»,
  `gancho` «Tipo de gancho sugerido», `sin_clasificar` «Quedó sin clasificar»; network when it is a per-network mark.
- Actions: «Está bien» (`confirmar_etiqueta`, with `p_marca_id`) and «Cambiar» (opens the 6c-1 tag editor,
  `editor-de-etiqueta.tsx`, then `corregir_etiqueta` with `p_marca_id`); «Ver la afirmación» links to
  `/biblioteca/afirmaciones/[id]?desde=/biblioteca/etiquetas/revisar`. `sin_clasificar` tipo/evidencia: only «Cambiar».
- A done card collapses to its tag with «Confirmada por ti» / «Corregida por ti» (from `revisionDe`), or «Ya no está» when
  the mark was removed.
- All done: «Listo por esta semana. El próximo lote llega el lunes.» No batch or empty batch: «No hay etiquetas dudosas
  esta semana.» Read error: «No pude cargar las etiquetas. Vuelve a intentarlo en un rato.»
- Desktop: cards in two columns from 1024 px (uses the width like the other Biblioteca pages). Phone: one column.

## Out of 6c-2

Monthly error report and learning from corrections (6c-3), provisional pillar (6c-4), adding a new term to a list (6d),
push or email notice, a «skip» button (unanswered items roll over instead), more than one batch per week.

## Notes for 6c-3

- The log now has `marca_id`; join to `lote_de_etiquetas_items` by (afirmacion_id, campo, red, marca_id) to tell whether a
  correction came from a batch (motivo known) or from the detail page.
- `certeza_antes` plus `motivo` let the report relate errors to the extraction's certainty («de las de certeza baja, Coni
  corrigió 3 de 5»).

## Testing

- **Integration (local Supabase):** only Coni builds the batch (mantenedor reads, others `42501`); at most 5 items, one per
  claim; motivo order and oldest first; old claims' marks never enter but their `sin_clasificar` tipo does; `origen =
  'coni'` and excluded or hidden claims never enter; a tag corrected from the detail page shows `hecha`; removed mark shows
  `hecha`; next week carries still-doubtful items first; two concurrent first reads build one batch; empty week stores an
  empty batch; the three 6c-1 functions write `marca_id`; no direct writes to the new tables.
- **Unit:** card texts per motivo, progress count, Inicio line singular/plural, `revisionDe` by `marca_id`.
- **e2e:** Inicio line → review page; confirm one, correct one with the editor, open «Ver la afirmación» and come back;
  all done message.
- **Visual:** captures at 375, 768, 1024 and 1280 px.

## Rollout

Migration to staging via MCP first, then production `db push` with Federico's OK. No Trigger deploy.
