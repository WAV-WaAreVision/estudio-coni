# Pillars per network, part 15b: the Temas row and "tratado" per network

Issue WAV-WaAreVision/estudio-coni#18 (change 15), second of four parts. Design approved by Federico on 2026-11-04.
Builds on 15a (spec `2026-11-04-pilares-por-red-design.md`, in production since PR #68). Source: Coni's answer of
2026-11-04, `docs/pedido-coni-2026-10-31/respuesta-coni-temas-pilares-2026-11-04.md`, part 1.

## Context

- **15a gave every topic its pillars per network** (`tema_pilares`): one main pillar, its secondaries and the layer. It also added `temas_de_pilar(p_pilar)` for the "Más filtros" pillar select.
- **The coverage filters are still batch 3's option 1:** `?cobertura=sin-tratar|tratados|un-autor`, based on `temas_resumen.cubierto_por_coni`. That flag is true when some claim comes from a material of role `voz_propia`.
- **Coni defines "tratado" differently:** "hay al menos una pieza publicada de ese tema en esa red", counted per network.
- **Production on 2026-11-04:** all 20 ideas come from the engine (`origen = 'motor'`, with a theory), 7 have pieces and 1 is published, on LinkedIn.
  - The only path from a published piece to a topic is `publicaciones → piezas.idea_id → ideas.teoria_id → teorias.temas[]`.
  - `teorias.temas[]` has no foreign key and does not follow topic merges.

## 1. "Tratado" per network (data)

- **View `temas_tratados(tema_id, red)`**, `security_invoker`:
  - It returns one row per live topic and network where at least one piece is `publicado` or `subido_a_mano` on that network (`publicaciones.destino`).
  - The path is: publication → piece → idea → theory → each id in `teorias.temas`.
  - Each id is resolved to the live topic along `fusionado_en`, at most 5 steps, the same bound as `destinoDeTema`. A topic merged away counts for the one that stayed.
  - An idea without a theory (her own ideas, imports, change 24 later) does not count yet. If that grows, a stored link replaces the view's inside without changing its columns.
- **Function `temas_de_red(p_red text, p_pilar uuid default null)`**, `security invoker`, replaces `temas_de_pilar`:
  - It returns the `temas_resumen` rows plus `tratado boolean`, which says whether the topic is in `temas_tratados` for `p_red`.
  - With `p_pilar` null it returns every live topic.
  - With a network pillar, it returns the topics whose main pillar (`fuerza = 'alta'`) in `p_red` is `p_pilar`.
  - With a layer, it returns the topics that carry it.
  - A pillar of another network or an unknown pillar returns nothing.
  - It is read with the repo's keyset paging (`leerTodas`). The app stops calling `temas_de_pilar`, but 15b keeps it (see section 4).
- **`ajustes.ultima_red text check (ultima_red in ('linkedin','instagram'))`**, nullable. This migration only adds a column. Coni writes it through a definer RPC `recordar_red(p_red)` (es_coni check), or through the repo's existing ajustes write path if one fits.
- **The engine keeps `cubierto_por_coni`:** `puntaje.ts` `novedad` still means "Coni has her own voice on it". Changing that meaning would change the engine's scoring; it is recorded as a decision, not changed.

## 2. The Temas row

The row sits at the top of `/biblioteca/temas`, on the phone and on the computer:

`[ Sin tratar · N ]  [ Instagram ▾ ]  [ LinkedIn ▾ ]` (Coni's order; the page still opens on her last network, LinkedIn by default)

- **Everything is a link with its state in the address:**
  - `?red=linkedin|instagram`;
  - `?pilar=<uuid>`;
  - `?sin-tratar=1`;
  - in "Más filtros", `?tratados=1` and `?un-autor=1`.
  - No client state is needed, and Back and a shared link work.
  - An invalid value is read as absent.
- **The chosen network:**
  - Its button looks pressed.
  - Under the row, its pillars open as buttons: "Todos los pilares", then the network's pillars in catalog order.
  - On Instagram, the Capa TDAH comes last, with the outlined style Coni asked for, so it reads as not a pillar.
  - Choosing the other network closes this one.
  - Tapping the chosen network again goes back to "Todos los pilares".
- **Without `?red`, the page opens on `ajustes.ultima_red`, or LinkedIn when it is empty.**
  - Visiting a network that differs from the stored one records it.
  - A small client component calls `recordar_red` after mount, never during the server render. If it fails, Coni sees nothing (it is a convenience), but the failure is logged, never swallowed.
- **Network chosen, no pillar:** every topic is listed. The page stays useful before the reclassification is applied, and a topic without pillars never disappears from Temas.
- **"Sin tratar":**
  - A toggle: one tap on, one tap off.
  - It shows the topics with no published piece on the chosen network and combines with the pillar.
  - Its count `N` is over the topics of the current network and pillar, without zeros, as `FiltrosRapidos` does today.
- **"Más filtros":**
  - "Ya los traté" is the opposite of "Sin tratar" in the same network, so choosing one clears the other.
  - "Un solo autor" (`autores = 1`) combines with everything.
  - The pillar select of 15a leaves "Más filtros", because the row replaces it.
- **The "Ya lo traté" badge** on cards and table rows follows the chosen network (`tratado`). The "Un solo autor" badge stays.
- **Old addresses:** `?cobertura=sin-tratar` reads as `sin-tratar=1`, `tratados` as `tratados=1` and `un-autor` as `un-autor=1`. The old 15a `?pilar=` without `?red` takes its network from the pillar.
- **Accessibility:**
  - The row is a group named "Filtrar temas".
  - The network buttons carry `aria-current` when chosen, and their pillar list is labeled by the network.
  - Targets are 44 px or more.
  - At large text the row wraps or slides inside its track, as the Biblioteca tabs do, and the page never scrolls sideways.
- **Words:** tú, no em dashes, `PALABRAS` where it applies.
- **Not in 15b:** "+ Agregar red" and "+ Agregar pilar" arrive with 15c (drafts that Coni approves).

## 3. Tests (TDD, failing test first)

- **Integration (local Supabase):**
  - A piece published on LinkedIn makes its topic `tratado` in LinkedIn and not in Instagram.
  - "Para subir" does not count.
  - A topic merged into another counts for the one that stayed.
  - `temas_de_red` filters on main pillar, layer, no pillar, a pillar of the other network and an unknown pillar, and pages over more than 1000 rows.
  - Coni reads it through RLS, and WAV reads what RLS allows.
  - `recordar_red` works for Coni and refuses WAV.
- **Unit:**
  - Reading the filters: each parameter, invalid values, old `?cobertura`, old `?pilar`.
  - "Sin tratar" and "Ya los traté" exclude each other.
  - The default network.
  - The counts, without zeros.
  - The row's links.
- **E2E (phone and desktop)** run Coni's acceptance list:
  - The row with the last network chosen.
  - Each network's pillars, Capa TDAH last with its own style.
  - A pillar with "Sin tratar".
  - A topic published on LinkedIn shows as "sin tratar" on Instagram.
  - Axe, large text, and `tests/unit/diseno-reglas.test.ts` on the new files.
- **Visual baselines:** the Temas list on the phone and on the desktop changes. Federico looks at the captures before they are taken.

## 4. Release

- **`db push`, then the merge.** There are two migrations: the view plus `temas_de_red`, and the `ajustes` column plus `recordar_red`. Neither changes an existing row.
- **No Trigger deploy:** no task reads these.
- **Order:** migrate first, then merge. `temas_de_pilar` stays in 15b, because the old Vercel code calls it between `db push` and the merge. A later cleanup migration drops it once the new code is live.

## Out of scope

"+ Agregar red" and "+ Agregar pilar" with their drafts (15c). Angles and the balance warning (15d). A stored topic link for ideas without a theory. Changing the engine's `novedad`.
