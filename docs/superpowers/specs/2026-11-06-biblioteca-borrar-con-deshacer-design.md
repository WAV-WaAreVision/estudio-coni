# Biblioteca in Conidolly, batch 4: delete with "Deshacer" (change 29, stage 2)

Issue WAV-WaAreVision/estudio-coni#17 · Pedido 29b · batch 4 of 7. Source: Coni's request, point 4g
(`docs/pedido-coni-2026-10-31/pedido-original.md:234`) and her migration `20261101000100_biblioteca_borrado_diferido.sql`
(same file, lines 253-322). Batch frame: `2026-11-02-biblioteca-materiales-design.md`.

## What Coni asked

> Material and author are deleted with "Deshacer" for 8 seconds, like Conidolly's notice; the definitive delete happens
> later, in the background, instead of "No se puede deshacer".

Her mechanism: mark the row (`borrar_desde`), hide it, and let maintenance delete it for real once the window has passed,
cleaning its R2 folder. Change 28 adds: never a countdown that demands acting in time, only "Deshacer" after acting. So
there is **no confirmation dialog**: she taps "Borrar", it is gone, and the notice offers "Deshacer".

## Decisions

1. **Coni's migration is the base**, applied as written except the deviations listed in "Deviations from Coni's SQL".
2. **Marked means gone, everywhere she looks.** Hiding only the two lists (her `*_visibles` views) is not enough: today
   about fifteen reads show materials, authors or their ideas (counts, author pages, topic pages, topic counts). Every
   Biblioteca read in Conidolly filters marked rows; detail pages of a marked material or author answer "no encontrado".
3. **Maintenance deletes within minutes.** `mantenimiento-frecuente` (every 10 min) calls `borrar_lo_marcado(now() - 1
   minute)` and deletes each returned material's R2 folder. A marked row lives at most ~11 minutes.
4. **What still sees a marked row during those minutes** (accepted, written down): the weekly motor (Sunday 20:00),
   topic maintenance (embed/assign), the bank, pillar proposals and the backing of a new piece read ideas through SQL
   functions that do not know the mark. The window is minutes and these runs are rare; changing ~12 SQL functions for it
   is not worth the risk. Pieces already written keep their frozen `respaldo` snapshot.
5. **Processing stops on a marked material.** If she deletes a material while it is `procesando`, the run must not keep
   spending: `procesar-material` treats a marked or missing material as finished without error at its start and before
   each paid step, and spends nothing more.
6. **Ingesta hides marked rows too**, in a matching Ingesta PR merged before this one ships: its reads use the views or
   the same filter. Ingesta's own "Borrar" keeps its hard delete until stage 3 turns Ingesta off.

## Coni's flow

**Material.** On the material page (phone) and in the side panel (desktop), a quiet "Borrar material" at the end. Tap:
the action marks it, the screen goes to the list (`useIrA`, the destination returned by the action, never `redirect()`),
and the list shows Conidolly's notice (`components/ui/aviso.tsx`, 8 s): «Borré «<title>».» with «Deshacer». "Deshacer"
unmarks it and the row is back where it was, with «Lo recuperé.». After the 8 s the notice closes; the material stays
hidden and maintenance deletes it.

**Author.** Same pattern on the author page, only when the author has no live materials and no ideas (as Coni's function
refuses otherwise; Ingesta shows its button under the same condition). Never for Coni's own author card. After "Borrar
autor" the screen goes to Autores with the notice and «Deshacer».

**Errors, in her words:** the action failed → the button stays and an error line says «No pude borrarlo. Prueba de
nuevo.»; "Deshacer" too late (maintenance already deleted it) → «Ya no se puede recuperar: se borró del todo.»; author
with materials → the button is not shown, and if a race makes the function refuse, «Este autor todavía tiene materiales.».

**Notice on the next screen.** The list reads `?aviso=borrado&id=<id>` (whitelisted keys, as `conAviso` / `leerAviso`
do) and shows the toast; `TrasElAviso` removes the key from the address so a reload does not show it again. The
"Deshacer" callback calls the unmark action with that id.

## Database (one migration, adds only)

- Coni's columns, indexes, `materiales_visibles` and `autores_visibles` (`security_invoker`), and her three functions.
- `temas_resumen` is replaced with the same body plus `and m.borrar_desde is null` in its join, so topic counts (Temas
  list in Conidolly through `temas_de_red`, and Ingesta's /temas) drop a marked material at once.
- `borrar_lo_marcado` also records the counts in `registro_de_borrados`, as the nightly deletions do.
- Nothing is rewritten or deleted by the migration itself. Types regenerated (`database.types.ts`).

### Deviations from Coni's SQL

- **No `ya_volviste_a_subir` branch.** It guards unique indexes of change 8 that do not exist yet; it comes with change 8.
- **`borrar_lo_marcado` argument.** Unchanged signature; the margin (1 minute) lives in the caller so the window is one
  constant in TypeScript, tested.
- Everything else as she wrote it, including `es_mantenedor()` with `subido_por = auth.uid()` (Ingesta still serves WAV
  until stage 3).

## Code

- **Readers** (`lib/datos/biblioteca.ts`): `listarMateriales`, `contarPorEstado`, `leerMaterialConFicha`,
  `leerMapaDelMaterial`, `listarAutores`, `resumirAutores`, `leerAutor`, `leerTema` filter marked materials and authors
  (directly or through `materiales!inner(borrar_desde)` on ideas). Actions that read before acting (`pedirTextoOriginal`,
  `editarMaterial`, `confirmarMaterial`, `crearAutor`, `unirAutores`) treat a marked row as not found.
- **Actions** (`lib/acciones/biblioteca.ts`, `conSesionDeConi` + Zod): `borrarMaterial(id)`, `recuperarMaterial(id)`,
  `borrarAutor(id)`, `recuperarAutor(id)`, calling the two RPCs and mapping their error codes to the texts above. The
  delete actions return the destination; the screens navigate with `useIrA`.
- **Maintenance** (`lib/mantenimiento/ejecutar.ts`, `deps-reales.ts`): `DepsFrecuente` gains `almacen`; a new step
  `borrarLoMarcado` runs first in the frequent run. An R2 failure is logged with the material id and does not stop the run
  (files become orphans, as Ingesta's delete already accepts).
- **Processing** (`lib/ingesta/procesar.ts`): the mark check of decision 5.
- **Ingesta PR**: reads switch to the views or add the filter (`lib/ingesta/materiales.ts`, `autores.ts`, `temas.ts`,
  `subir.ts`).

## Testing

- **SQL (`test:db`)**: marking and unmarking by Coni and by a maintainer (own rows only); refusing Coni's author and an
  author with live materials or ideas; the views hide marked rows under RLS; `temas_resumen` drops them;
  `borrar_lo_marcado` deletes only rows older than the cut, keeps an author still referenced, cascades the material's
  ideas, returns the ids.
- **Units**: each reader filters; the actions map every error code; the maintenance step deletes the returned folders,
  survives an R2 failure, uses the 1 minute margin; processing stops on a marked material before a paid step.
- **E2E**: delete a material from its page and from the desktop panel, see it vanish from list, counts, author page and
  topic page, "Deshacer" brings it back in all of them; delete an author with no materials and undo; no "Borrar autor"
  on an author with materials or on Coni's card; the notice does not come back on reload; a11y check on both screens.

## Shipping

- Migration with `db push` (adds only; dry-run must show only this file), **Trigger deploy** for the maintenance and
  processing changes (needs Federico's OK), Ingesta PR first, then this PR.
- Still reachable only by address until batch 7; Coni sees nothing new until then.

## Risks

- **Leak in the ~11 minutes** (decision 4): a weekly motor run in that gap could use a deleted material's ideas. Accepted.
- **Two apps, one schema**: if the Ingesta PR is not merged first, Ingesta shows marked rows for up to 11 minutes. Order
  is part of shipping.
- **Deleting during processing**: covered by decision 5; a run already inside a paid call finishes that one call.

## Out of scope

Deleting ideas or topics, a trash screen to recover after the 8 s, bulk delete, unique indexes and re-upload (change 8),
Semana (batch 5), the tab switch (batch 7).
