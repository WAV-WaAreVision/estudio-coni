# Change 6a · Closed lists and claim marks

Part of change 6 (#21) of Coni's request of 2026-10-31. Change 6 is split in four deliveries:

- **6a (this spec):** versioned closed lists, extraction that stores marks and hooks for every new material.
- 6b: the hooks library screen (`/biblioteca/ganchos`).
- 6c: show and correct tags (claim detail, author page), confirmation batches, correction log, monthly error report,
  provisional pillar.
- 6d: edit the lists from Ajustes, with versions and roll back.

Translating the tags already stored stays inside the single reprocess of change 7, as the change 6 card says.

Sources: `docs/pedido-coni-2026-10-31/pedido-original.md` (change 6), `fichas.md` (6), `emociones.md` (Coni's emotion list,
2026-11-01).

Decisions taken with Federico on 2026-11-25:

- Lists are data in the database from day one (not constants), so 6d only adds a screen and every mark points to the list
  version it used.
- 6a already stores each hook in full (exact phrase, phrase without hook, type), so nothing processed before 6b must be read
  again.
- Coni sees nothing new in 6a. It is verified with queries and one real material on staging.

## What exists today

- `afirmaciones.tipo` is a closed list (definicion, causa, consecuencia, mito, consejo, dato, experiencia). An unknown type has
  no default and fails the whole chunk.
- `afirmaciones.evidencia` is a closed list (estudio, clinica, opinion, testimonio). An unknown evidence becomes `opinion`.
- `postura`, `publico`, `dolor`, `emocion`, `gancho` are free text. The engine passes publico, dolor and emocion to Claude when
  writing theories.
- The extraction guide is a constant (`GUIA_DE_AFIRMACIONES` in `lib/proveedores/anthropic/afirmaciones.ts`); its hash is
  `VERSION_DE_EXTRACCION`, part of each chunk's fingerprint in `lib/ingesta/afirmar.ts`.

## Data

### `versiones_de_vocabulario`

One row per version of one list for one network. A version holds the whole list.

| Column | Type | Notes |
|---|---|---|
| id | integer identity | |
| lista | text | `tipo`, `evidencia`, `publico`, `dolor`, `emocion`, `gancho` |
| red | text | `linkedin`, `instagram`, `todas` |
| nombre | text | e.g. "Lista de partida" |
| motivo | text | why this version exists |
| valores | jsonb array | see below |
| estado | text | `propuesta`, `vigente`, `anterior`, `rechazada` |
| creada_en, aprobada_en | timestamptz | |

- Unique partial index: one `vigente` per (lista, red).
- Each value: `{ "valor": "agobio", "etiqueta": "Agobio", "descripcion": "...", "retirado": false }`. Emotion values add
  `"grupo"` (`problema`, `puente`, `solucion`, `respaldo`) and `"activacion"` (`alta`, `media`, `baja`, null for respaldo).
- A database check validates the shape: array of objects with non-empty `valor` and `etiqueta`; for `emocion`, a valid
  `grupo`.
- RLS on, read for `authenticated` like `afirmaciones`; writes only by service role (6d adds Coni's approval path).

Starting lists, loaded as `vigente` (Coni defined them):

| Lista | Red | Values |
|---|---|---|
| tipo | todas | the 7 current ones + `limite` (Límite) |
| evidencia | todas | `estudio`, `guia_consenso` (Guía o consenso), `clinica` (Práctica profesional), `opinion`, `testimonio` |
| publico | linkedin | transformacion_digital, rrhh_personas, lideres_equipos, gerencia, empresas_tech, academia, autoridades, mujeres_lideres, colegas_clinicos |
| publico | instagram | profesional_con_techo, se_reinventa, se_descubre_tarde |
| dolor | linkedin | herramienta_sin_uso, rrhh_tarde, adopcion_no_impacto, liderar_incertidumbre, resistencia_miedo, juzgada_por_ia |
| dolor | instagram | no_merecer_logros, techo_profesional, reinventarse_sin_estructura, desconfianza_ia, energia_limites, propio_tdah |
| emocion | todas | the 20 emotions of `emociones.md` with group, activation and its "Qué es" as description, plus `informativa` and `otra` (group `respaldo`) |
| gancho | todas | afirmacion_contraria, numero_especifico, confesion, pregunta_espejo, escena, tiene_nombre, mito, verdad_incomoda, antes_ahora, habla_directo, lista_con_numero, detras_de_escena |

Labels exactly as in the request and `emociones.md`. Público and dolor come from the request text, not the manuals (v27 and
v2 not received yet); 6d lets Coni adjust them.

### Changes to `afirmaciones`

The type and evidence checks are rewritten in full:

- tipo: definicion, causa, consecuencia, mito, consejo, dato, experiencia, limite, sin_clasificar.
- evidencia: estudio, guia_consenso, clinica, opinion, testimonio, sin_clasificar.

`TIPOS_DE_AFIRMACION` and `EVIDENCIAS_DE_AFIRMACION` (code) match these lists; a test asserts code and constraint agree.
`lib/dominio/biblioteca/etiquetas.ts` gains labels for the new values. Free-text columns stay and keep being filled.

### `afirmacion_marcas`

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| afirmacion_id | uuid | references afirmaciones, on delete cascade |
| marca | text | `problema`, `solucion`, `emocion`, `dato`, `caso`, `publico` |
| red | text | `linkedin`, `instagram`, `todas` |
| valor | text | a value of the list version, `otro` or `sin_clasificar` |
| frase | text null | free phrase that keeps the nuance |
| certeza | text | `alta`, `media`, `baja` |
| por_que | text null | one line; required when valor is `otro`, or `otra` for emotions (check) |
| version_id | integer null | references versiones_de_vocabulario; null for `dato` and `caso`, which have no list |
| origen | text | `extraccion` now; `traduccion` and `coni` reserved for 7 and 6c |
| creada_en | timestamptz | |

Which list each mark uses:

| Marca | Lista | Red |
|---|---|---|
| problema, solucion | dolor (a solution resolves a pain of the list) | per network |
| emocion | emocion | per network (the same claim can be skepticism on LinkedIn and shame on Instagram) |
| publico | publico | per network |
| dato, caso | none (frase only) | todas |

Hooks are not marks: they live in `ganchos`. Index on (afirmacion_id) and on (marca, red, valor). RLS like `afirmaciones`.

### `ganchos`

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| afirmacion_id | uuid | references afirmaciones, on delete cascade; author, material, topic and pillar come through it |
| frase_exacta | text | literal, as the author said or wrote it (in the source language) |
| frase_sin_gancho | text | same idea said neutrally, in Spanish of Chile |
| tipo | text | a value of the `gancho` list, or `ninguno` |
| certeza | text | `alta`, `media`, `baja` |
| version_id | integer | references versiones_de_vocabulario |
| origen | text | `extraccion` now |
| creada_en | timestamptz | |

At most one hook per claim (unique afirmacion_id). RLS like `afirmaciones`. Favorites and network belong to 6b.

The delete-with-undo views (`*_visibles`, batch 4) hide marks and hooks of hidden claims through their claim; no own
`borrar_desde` column.

## Extraction

1. `lib/datos/vocabulario.ts` reads the `vigente` version of every list (one query) and returns a typed `Vocabulario`. No
   vigente list for a pair → explicit error, the material pauses (it is a setup fault, never silent).
2. The guide becomes `guiaDeAfirmaciones(vocabulario)`: today's fixed text plus a generated block per list (value, label,
   description; emotions grouped with activation) and the tie-break rules and the two general rules from `emociones.md`
   ("classify what the claim provokes, not what it mentions"; "group first"). The system prompt keeps prompt caching: it is
   identical for every chunk of a material.
3. Output schema per claim adds:
   - `marcas`: array of `{ marca, red, valor, frase, certeza, porQue }`.
   - `gancho_detalle`: `{ fraseExacta, fraseSinGancho, tipo, certeza }` or null, only if the claim naturally carries a hook.
     The literal check that already guards `cita` also guards `fraseExacta` (must be in the chunk); a failing hook is dropped,
     the claim stays.
4. Tolerant mapping (`enumTolerante` style), with the vocabulary as the allowed set:
   - mark value not in the list → `otro` (`otra` for emotions, the list's own fallback), original kept in `frase`, `porQue` filled with "fuera de la lista: <value>" if empty,
     and a warning logged (like today's corrected evidences).
   - unknown tipo → `sin_clasificar` (no longer fails the chunk); unknown evidencia → `sin_clasificar` (no longer `opinion`).
   - a mark for a list/network pair that does not apply (e.g. `dato` with a network) is normalised, not rejected.
5. `VERSION_DE_EXTRACCION` becomes the hash of the generated guide, so it already changes when any list version changes. Each
   chunk's stored JSON keeps the version ids used, so saving marks points to the right version.
6. `afirmar.ts` inserts claims as today, then their marks and hooks in batches (same `FILAS_POR_INSERCION`). A failed insert
   of marks or hooks fails the step like any other insert (no silent catch); the chunk JSON in R2 lets the retry skip paying.
7. Theories (`lib/proveedores/anthropic/teorias.ts`): `guia_consenso` counts as strong evidence with `estudio` and `clinica`;
   `sin_clasificar` counts as weak with `opinion` and `testimonio`. Prompt line updated to say so.
8. Cost: output per chunk grows. Measure on one real material on staging and set `ESTIMADO_POR_TRAMO_USD` (output tokens)
   from that number with a margin; the estimate test is updated with the measured value.

Shared lists rewritten in full by this change: `afirmaciones_tipo_check`, `afirmaciones_evidencia_check`. No change to
`avisos_tipo_check`, `gastos_proveedor_check`, signatures, gate formulas or `huellaDeRespaldo`.

## Rollout

- One migration set (vocabulary + seed, afirmaciones checks, marks, hooks). Backward compatible: old claims keep their values,
  which are all still allowed.
- Trigger deploy needed (extraction runs in Trigger). Production db push and Trigger deploy with Federico's OK.
- Staging first: process one real material, check marks per network, hooks with literal phrase, `otro` count, cost per chunk.

## Testing

- Unit: guide builder (all lists present, emotion groups, tie-breaks), tolerant mapping (otro, sin_clasificar, normalisation),
  version hash changes with a list version, hook literal check, theories weak/strong sets, code lists equal constraint lists.
- Integration (local Supabase): seed loaded (counts per list, 22 emotions with groups), one vigente per pair, shape check
  rejects bad values, `por_que` required for `otro`, cascade on claim delete, RLS read for authenticated and no write.
- Ingest integration: a fake Claude response with marks and a hook goes through `afirmar.ts` into the three tables.
- End to end: one real material on staging before production.

## Out of 6a

Screens, corrections and confirmations, list editing, translating stored tags (7), provisional pillar (6c), engine and
scripts using the closed values (changes 16, 18, 21), tone label (not in change 6).
