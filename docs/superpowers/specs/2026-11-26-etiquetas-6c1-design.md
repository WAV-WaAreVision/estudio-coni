# Change 6c-1 · See and correct a claim's tags

Part of change 6 (#21) of Coni's request of 2026-10-31 (`docs/pedido-coni-2026-10-31/pedido-original.md`, change 6, point 8,
and point 10 for the hook type). 6a (closed lists, marks, hooks) and 6b (hooks library) are in production. 6c is split in
four deliveries, one PR each:

- **6c-1 (this spec):** a claim detail page where every tag is visible and can be confirmed or corrected; a correction log.
- 6c-2: weekly batch of ~5 doubtful tags to confirm.
- 6c-3: monthly error report from the log, and corrections as examples in the extraction guide.
- 6c-4: provisional pillar per network for claims without topic.

Decisions taken with Federico on 2026-11-26:

- **Old claims** (extracted before 6a, no marks; 189 in production): only tipo and evidencia can be corrected. Marks show
  «Llegan al reprocesar la Biblioteca» with the old free text (publico, dolor, emocion) as reference. Change 7 fills the
  marks and must keep any tipo or evidencia Coni corrected (written in its TRASPASO notes).
- **One place to correct:** the page `/biblioteca/afirmaciones/[id]` (a side panel on desktop lists that already have one).
  Author, topic and material lists show short badges that link there; the 6b hook panel links to «Ver la afirmación».

A claim is **old** only if it already existed before this change with no row in `afirmacion_marcas` and no row in
`ganchos` (the migration marks those once in `afirmaciones.etiquetas_antiguas`); every other claim is **new**, including
one extracted from now on with zero marks (Federico, 2026-11-26). Change 7 sets the column back to false when it fills a
claim's marks.

## Data (one migration, no Trigger deploy)

### `correcciones_de_etiqueta` (append only)

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| afirmacion_id | uuid | references afirmaciones, on delete cascade |
| campo | text | `tipo`, `evidencia`, `problema`, `solucion`, `emocion`, `publico`, `dato`, `caso`, `tipo_de_gancho` |
| red | text | `linkedin`, `instagram`, `todas` |
| accion | text | `confirma`, `corrige`, `agrega`, `quita` |
| antes | text null | value before (null for `agrega`) |
| despues | text null | value after (null for `quita`; equals `antes` for `confirma`) |
| frase_antes, frase_despues | text null | the free phrase of a mark, when it changes |
| por_que | text null | required when `despues` is `otro` / `otra` |
| certeza_antes | text null | the extraction's certainty, so 6c-3 can relate errors to it |
| version_id | integer null | list version used for `despues` (null for dato, caso) |
| creada_en | timestamptz | default now() |

RLS: read for `es_coni() or es_mantenedor()`; no insert/update/delete grants for `authenticated` (rows come only from the
functions below). Index on (campo, accion, creada_en) for 6c-3.

### Functions (security definer, `search_path = ''`, Coni only: `es_coni()` else `42501 solo_coni_corrige`)

- `corregir_etiqueta(p_afirmacion uuid, p_campo text, p_red text, p_valor text, p_frase text, p_por_que text)`
  - `tipo`, `evidencia`: updates `afirmaciones`. Allowed on old and new claims. Value must be in the vigente list (not
    `sin_clasificar`).
  - Marks (`problema`, `solucion`, `emocion`, `publico`, `dato`, `caso`): only on new claims (else `22023
    afirmacion_antigua`). Updates the existing row for (marca, red) or inserts it when missing (`agrega`); sets
    `origen = 'coni'`, `certeza = 'alta'`, `version_id` of the vigente list. Value checked against the list of that mark
    and network (`dato` and `caso` have no list: only the phrase changes). `otro` / `otra` needs `p_por_que`.
  - `tipo_de_gancho`: updates `ganchos.tipo` (value of the vigente `gancho` list or `ninguno`), `certeza = 'alta'`,
    `origen = 'coni'`. Claim without a `ganchos` row: `P0002 sin_gancho`.
  - Writes one log row with `accion` `corrige` or `agrega` in the same transaction. A correction to the same value is
    logged as `confirma`.
- `confirmar_etiqueta(p_afirmacion uuid, p_campo text, p_red text)`: no value change except `certeza = 'alta'` and
  `origen = 'coni'` on marks and hooks; logs `confirma`.
- `quitar_marca(p_afirmacion uuid, p_marca text, p_red text)`: deletes that mark row on a new claim; logs `quita`.

Validation errors use the repo's `Falla` codes; unknown campo `22023 campo_desconocido`; unknown value `22023
valor_fuera_de_lista`.

Effects: signed pieces do not move (their support is a frozen snapshot hashed by `huellaDeRespaldo`). Unsigned ideas and
theories pick the new values on the engine's next run. The 6b library reflects hook type changes at once (it is a view).

## Screen `/biblioteca/afirmaciones/[id]`

- **Header:** the claim text, its quote, author, material with location, topic; each with a link.
- **Tags:** tipo and evidencia; the marks grouped by network (LinkedIn, Instagram): problema, solución, emoción, público;
  dato and caso once (red `todas`); the hook with its three parts. Each tag shows its label (from the vocabulary), its free
  phrase, and «Certeza baja» when low; an `otro` value shows its reason.
- **Correct:** tapping a tag opens its list (emotions grouped by grupo, with activación) with «Está bien» and «Cambiar»;
  choosing `otro` asks for a one-line reason; marks can also be added («Agregar») or removed («Quitar», with confirmation).
  After saving, the tag shows «Corregida por ti».
- **Old claim:** tipo and evidencia editable; marks section reads «Llegan al reprocesar la Biblioteca» and shows the old
  free text of publico, dolor, emocion as reference.
- **Desktop:** two columns, text left, tags right (uses the width like the other Biblioteca pages). Phone: one column.
- **Badges in lists:** author page, topic page and material map show per claim: tipo, evidencia and one emotion per network,
  linking to the detail. The 6b hook panel and hook page gain «Ver la afirmación».
- Not found / deleted / excluded claim: the Biblioteca not-found.

## Out of 6c-1

Weekly batches (6c-2), monthly report and learning from corrections (6c-3), provisional pillar (6c-4), adding a new term to
a list (6d), hooks of published pieces (point 12).

## Testing

- **Integration (local Supabase):** only Coni can correct, confirm or remove (mantenedor and others get `42501`); value
  outside the list rejected; `otro` without reason rejected; marks on an old claim rejected; log rows hold antes, despues,
  certeza_antes and version; correcting to the same value logs `confirma`; hook type correction shows in
  `biblioteca_de_ganchos`; cascade on claim delete; no direct writes to the log.
- **Unit:** grouping of tags per network, badge selection, old/new detection.
- **e2e:** correct an Instagram emotion to another value; confirm a hook type; add and remove a mark; old claim shows the
  reprocess note; navigate from author page badge to detail and back.
- **Visual:** captures at 375, 768, 1024 and 1280 px.

## Rollout

Migration to staging via MCP first, then production `db push` with Federico's OK. No Trigger deploy.
