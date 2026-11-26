# Change 6b · Hooks library

Part of change 6 (#21) of Coni's request of 2026-10-31 (`docs/pedido-coni-2026-10-31/pedido-original.md`, change 6,
points 9 and 11). 6a (closed lists, marks, `ganchos` table) is in production since 2026-11-26. 6c brings corrections and
confirmations; 6d brings list editing.

Decisions taken with Federico on 2026-11-26:

- **Old hooks show up now.** Production has 0 rows in `ganchos` and 92 claims with a free-text `gancho` (189 claims, 6
  materials). The library shows those 92 as «Sin clasificar» (phrase only). The single reprocess of change 7 fills them in.
  Nothing is reprocessed in 6b.
- **Favorites and preferred types in 6b; confirming or correcting a hook type in 6c**, with the correction log of every
  other tag.
- **The network comes from the topic.** A hook belongs to a network when its topic has a pillar on that network
  (`tema_pilares`, layers excluded). It can belong to both. Without topic or pillar: «Sin red». The filter is network, then
  a pillar of that network.

## Data (one migration, no Trigger deploy)

### `biblioteca_de_ganchos` (view, `security_invoker = true`)

One row per hook, from two sources:

| Source | Rows | tipo | frase_sin_gancho | clasificado |
|---|---|---|---|---|
| `ganchos` | every row | its `tipo` (a list value or `ninguno`) | its value | true |
| `afirmaciones.gancho` | non-empty free text and no row in `ganchos` for that claim | `sin_clasificar` | null | false |

Columns: `afirmacion_id` (the row's key in both sources, since there is at most one hook per claim), `frase_exacta`
(`ganchos.frase_exacta` or the free text), `frase_sin_gancho`, `tipo`, `certeza` (null for old ones), `clasificado`,
`creado_en` (hook or claim), `material_id`, material title, `ubicacion`, `autor_id`, author name, `tema_id`, topic name,
`pilares` (jsonb array of `{ red, pilar_id, nombre }` from `tema_pilares` joined to `categorias`, `es_capa = false`; main and secondary pillars both count), `favorito` (exists in
`ganchos_favoritos`).

Visibility: claims with `excluida = true` are left out. Claims are joined through `materiales_visibles` (inner) and `autores_visibles` (left), so anything deleted with
Deshacer disappears from the library too. Grant select to `authenticated`; RLS of the underlying tables applies
(`es_coni() or es_mantenedor()` reads).

### `ganchos_favoritos`

| Column | Type | Notes |
|---|---|---|
| afirmacion_id | uuid primary key | references afirmaciones, on delete cascade |
| creado_en | timestamptz | default now() |

Keyed by claim so the same favorite works for new and old hooks. RLS: read for `es_coni() or es_mantenedor()`; insert and
delete only `es_coni()`. Marking toggles by insert / delete.

**Coupling with change 7:** its reprocess must keep claim ids (it translates tags, it does not re-extract), or favorites are
lost. Written into the change 7 notes of `docs/TRASPASO.md`.

### `ajustes.tipos_de_gancho_preferidos`

`text[] not null default '{}'`. Written through the existing ajustes update path (`lib/acciones/ajustes.ts`, a new
`CambioDeAjuste`), only by Coni. The action keeps only values of the vigente `gancho` list version (read with
`leerVocabulario`); unknown values are dropped, not stored. A type later retired from the list stays stored, shown as
inactive and ignored by the filter, until Coni's next save of «Mis tipos», which drops it (the chooser warns first).

## Screen `/biblioteca/ganchos`

- Fifth Biblioteca section «Ganchos» in `nav-de-biblioteca.tsx` (tabs from md, section menu on phone).
- **Desktop** (same pattern as Autores): table (frase exacta, tipo, autor, tema, ★) and a sticky side panel with the chosen
  hook. Selection in the address (`?g=<afirmacion_id>`), like `leerSeleccion`.
- **Panel / phone detail page `/biblioteca/ganchos/[id]`:** the three parts (frase exacta, frase sin gancho, tipo with its
  label), author, material with a link to its page, location, topic, pillar per network, and the ★ button. For an old hook:
  «Sin clasificar: el tipo y la frase sin gancho llegan al reprocesar la Biblioteca.»
- **Phone:** cards (frase exacta, tipo, autor), tap opens the detail page.
- **Filters** (in the address, like Materiales): tipo (list values plus «Sin clasificar»), red (LinkedIn, Instagram, Sin
  red), pilar (only after a network, pillars of that network), tema, autor, «Solo favoritos», «Mis tipos».
- **Mis tipos:** an «Elegir mis tipos» button opens the 12 types as checkboxes; saving stores them in ajustes. The «Mis
  tipos» filter is shown only when at least one is chosen.
- **Order:** favorites first, then newest.
- **Empty states:** no hooks at all («Los ganchos aparecen al procesar materiales.»); filters with no result (offer to clear
  filters).
- Labels come from the vocabulary (`etiqueta`), never from code constants.

## Out of 6b

Confirming or correcting a type (6c), hooks of published pieces (point 12, with change 13), using hooks in the workshop or
scripts (changes 18 and 21), list editing (6d), reprocessing old hooks (change 7).

## Testing

- **Integration (local Supabase):** the view merges new and old without duplicates (a claim with both a `ganchos` row and
  free text appears once, classified); hides deleted materials and authors; derives `pilares` per network excluding
  layers; favorites insert/delete only by Coni, read by mantenedor; `tipos_de_gancho_preferidos` saved by Coni drops
  unknown values.
- **Unit:** filter parsing and building (address in, query out), order, network/pillar cascade.
- **e2e:** filter by type and network; mark and unmark a favorite; choose «Mis tipos».
- **Visual:** captures at 375, 768, 1024 and 1280 px.

## Rollout

Migration to staging via MCP first, then production `db push` with Federico's OK. No Trigger deploy.
