# Biblioteca in Conidolly, batch 3: Autores and Temas (change 29, stage 2)

Issue WAV-WaAreVision/estudio-coni#17 · Pedido 29b · batch 3 of 7. Design approved by Federico on 2026-11-04; Coni chose
the quick filters on Temas (option 1, by coverage) the same day. Sources: `docs/pedido-coni-2026-10-31/pedido-original.md`
(Cambio 29, fixes 4h, 4i, quick filters on Temas), batch 1 spec `docs/superpowers/specs/2026-11-02-biblioteca-materiales-design.md`
(its "fixed for the whole stage" rules apply here), batch 2 spec `2026-11-03-biblioteca-subir-design.md`. Ported from
Ingesta `app/(app)/autores/*`, `app/(app)/temas/*`, `lib/ingesta/autores.ts`, `lib/ingesta/temas.ts` (commit 39f9887).

## Context

The database already has everything this batch reads and writes: the `temas_resumen` view, `autores`, `temas` and
`afirmaciones` readable by Coni, and the definer RPCs `fusionar_autores` and `excluir_afirmacion` (Coni or mantenedor).
So this batch needs **no migration and no Trigger deploy**. `borrar_autor` exists too but deleting an author waits for
batch 4, with "Deshacer". The bar's tab still opens Ingesta until batch 7.

## 1. Where it lives

- Two new sections in `NavDeBiblioteca`: Autores (`/biblioteca/autores`) and Temas (`/biblioteca/temas`), each with its
  detail page (`/biblioteca/autores/[id]`, `/biblioteca/temas/[id]`). Gate `exigirConi()`; `loading`/`error`/`not-found`
  come from the section. Only by address, as batches 1 and 2.
- Phone: cards, one column. Desktop (`md` and up): the Materiales rule, a table plus a sticky side panel
  (`md:grid-cols-[minmax(0,1fr)_20rem]`, `md:sticky md:top-24`) inside `md:max-w-[76rem]`. Choosing a row opens its
  summary in the panel, with the link to its detail page; on the phone a card goes straight to the detail page.
- Links that now have a place in Conidolly point to it: the topic of a material (`tema-del-material.tsx`) links to
  `/biblioteca/temas/[id]` and the author in the material panel links to `/biblioteca/autores/[id]`.

## 2. Autores

- **List** (`resumirAutores`, ported to `lib/datos/biblioteca.ts`): name, type, the 3 topics with most ideas and the
  counts without zeros (4i): "3 materiales · 12 ideas sacadas", "1 material", or nothing for a count of zero. An author
  with no material and no idea shows "Todavía no hay material de esta persona. Súbelo desde Subir." with a link to
  `/biblioteca/subir`. Order as Ingesta (most ideas first, then name).
- **Search** above the list: one field "Buscar por nombre", matching name and alias with the existing `buscarAutores`
  (accents and case ignored). It filters on the client, no request per key. With no match: "Nadie se llama así todavía.".
- **Detail** (`leerAutor`, ported): name, type, credential, counts without zeros; its ideas grouped by topic (topic with
  most ideas first, ideas without topic last under "Sin tema todavía"), each group heading linking to its topic. Hidden
  ideas are folded at the end under "Ideas ocultas (N)", each with "Mostrar".
- **Unir con otro autor** (`fusionar_autores`, ported from `unir-autores.tsx`): pick the other author with the same
  search, then a confirmation that says it cannot be undone and names both. Never offered on Coni's own card, and Coni
  is never offered as the one that disappears. After joining, the page goes to the author that stayed.
- **Borrar un autor** is not in this batch (batch 4).

## 3. Temas

- **List** (`listarTemas`, ported): name, "N ideas sacadas · N autores" without zeros, and the badges "Ya lo traté" (the
  view's `cubierto_por_coni`) and "Un solo autor". Order as Ingesta (most authors, then most ideas, then name).
- **Quick filters** (Coni's option 1), one tap each, with their counts and zeros hidden as in Materiales
  (`FiltrosRapidos` with `conCuenta`): "Todos", "Sin tratar", "Ya los traté", "Un solo autor". In the address as
  `?cobertura=sin-tratar|tratados|un-autor`; an unknown value reads as "Todos". "Sin tratar" and "Ya los traté" split on
  `cubierto_por_coni`; "Un solo autor" is `autores = 1`.
- **Más filtros**: the pillar, as a select of the active pillars (`listarPilares`, ported with the id, since Conidolly's
  `leerPilares` has none), in the address as `?pilar=<uuid>`. Pillar and coverage combine. Batch 3 adds no pillar chips:
  change 15 redoes the pillars.
- **Detail** (`leerTema`, ported): name and description; its ideas grouped by author (most ideas first), each heading
  linking to the author, and an "Ocultar" button on each idea (`excluir_afirmacion`, ported from `boton-ocultar.tsx`).
  After hiding, the idea leaves the list with a quiet note "La oculté. La puedes volver a mostrar desde su autor.".
- **Merged topics**: an address of a topic that was merged into another redirects to the one that stayed
  (`destinoDeTema`, ported, at most 5 steps); a missing topic or a loop is `notFound()`.

## 4. Words (4h)

- Everything Coni reads uses the `PALABRAS` table: "ideas sacadas", never "afirmaciones"; "¿Quién es para ti?" for the
  role. Type of idea, evidence and score sit only inside "Detalle para WAV" (`components/ui/detalle-para-wav.tsx`),
  folded, on each idea of both detail pages.
- `tests/unit/biblioteca-palabras.test.ts` runs on every new file.

## 5. Server actions

In `lib/acciones/biblioteca.ts`, through `conSesionDeConi` with Zod, as the rest of the section:

- `unirAutores({ origen, destino })`: refuses Coni as `origen` before the RPC; maps a missing author to a plain message.
- `ocultarIdea({ id, oculta })`: maps `P0002` to "Esa idea ya no existe.".
- Both `revalidatePath("/biblioteca", "layout")` so the counts of the three sections agree.

## 6. Tests (TDD, failing test first)

- Unit: counts without zeros and their wording, the coverage filter (each value, unknown value, combined with pillar),
  the order of topics and authors, grouping by topic and by author, the search, the merged-topic redirect chain and loop.
- Integration (local Supabase): read lists and details as Coni; `unirAutores` and `ocultarIdea` as Coni; WAV refused on
  both; Coni refused as `origen`; hiding an idea removes it from its topic and shows it under the author's hidden ones.
- E2E (phone and desktop): open each section and detail; filter Temas by each quick filter and by pillar; search an
  author; join two authors; hide and show an idea; a merged topic's address lands on the one that stayed; links from a
  material to its topic and author; axe; large text; `tests/unit/diseno-reglas.test.ts` on every new file.
- Visual baselines for both lists and both details (phone and desktop), committed after Federico looks at them.

## 7. Release

Merge only: no migration, no Trigger deploy, no env var, no CORS. After the merge `/biblioteca/autores` and
`/biblioteca/temas` redirect to sign-in without a session; Federico opens both with Coni's account by the address.

## Out of scope

Deleting an author and "Deshacer" (batch 4), pillar chips (change 15), rating topics (change 3), editing author aliases
(change 5), merging topics by hand (change 9), the tab switch (batch 7).
