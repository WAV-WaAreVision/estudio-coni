# Biblioteca in Conidolly, batch 5: Semana

Issue WAV-WaAreVision/estudio-coni#17 · Pedido 29b · batch 5 of 7. Batch frame:
`2026-11-02-biblioteca-materiales-design.md`. Source screen: Ingesta `app/(app)/semana/` and `lib/ingesta/semana.ts`.
Coni's fixes that apply: 4a (the cost under «Proponer ahora»), 4h (her words), 4j (icon and word), 4l (hide what
brings nothing new), 4m (loading, error and not found), 4n (a11y, large text, design rules). Approved by Federico on
2026-11-06.

## What it is

The latest run of the weekly engine: its week, state, ideas and cost; the theories it wrote with their topics; the
crossings it discarded and why; and what to upload next. «Proponer ahora» asks the engine for this week.

## Decisions

1. **Address and nav.** `/biblioteca/semana`, with «Semana» added to `NavDeBiblioteca` after Temas. Reachable only by
   address until batch 7, like the other batches. Only Coni enters (`exigirConi`, `conSesionDeConi`).
2. **No migration, no Trigger change, no Ingesta PR.** It only reads `motor_corridas`, `teorias`, `temas` and the pillar
   catalog, and it triggers `motor-manual` through `disparos.motor(semana)` (built in batch 1, key `motor:<semana>`).
   Ingesta's Semana keeps working on the same data.
3. **The week key** is `domingoDeSemana(ahora)` from `lib/motor/semana.ts`, the same function the engine uses.
4. **«Proponer ahora» rule (as Ingesta).** If this week's run is `lista`, or `corriendo` and created less than 30
   minutes ago (the engine's own retake window), the action answers «El motor ya propuso ideas esta semana. Puedes pedir
   otras desde el lunes.» and triggers nothing. A `fallida` week, or a `corriendo` one older than 30 minutes, can be
   asked again. A trigger failure answers «No pude pedirle ideas al motor. Inténtalo de nuevo en unos minutos.».
   Success shows «El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos.» and redraws the screen.
5. **The estimated cost (4a).** Under the button: «Cuesta cerca de US$ 0,25». The figure is the median of `costo_usd`
   of the latest 4 runs with a cost above zero, rounded to cents; with none, a fixed US$ 0,30. A pure function
   `estimarCostoDelMotor(costos)` holds the rule and the fallback. The hard limit is not checked here: the engine's run
   already respects it.
6. **Her words (4h).**
   - «Teorías» becomes «Lo que el motor cruzó esta semana».
   - «Puntaje 0,82» moves into a folded «Detalle para WAV» on each theory, as the material panel does.
   - «Evidencia Débil» becomes «Respaldo: fuerte / medio / débil» (`alto`, `medio`, `debil`).
   - «Cruces descartados» becomes «Cruces que no sirvieron (N)», folded (`<details>`) with each crossing's topics and
     reason (4l).
   - The run's state is icon plus word, never colour only (4j): «Lista», «Trabajando», «Falló», plus «A pedido» for a
     manual run.
7. **Empty in one line (4l).** A run with no theories shows one line, «Esta semana el motor no encontró cruces
   nuevos.», and no empty sections. Before any run: «Todavía no corre el motor. La primera tanda llega el domingo a las
   20:00.». A failed run shows its reason.
8. **What to upload next.** Topics with a single author, each linking to `/biblioteca/temas/<id>` when the topic still
   exists (the engine stores names; the reader matches them to ids and drops a name it cannot match from the link, not
   from the list). Pillars without material show their network: «Bienestar laboral · LinkedIn», named from the pillar
   catalog (`leerPilares`), retired ones dropped. Nothing missing: «Por ahora no falta nada: cada tema tiene varios
   autores y cada pilar tiene material.».
9. **Theory topics** link to `/biblioteca/temas/<id>`; a topic that no longer exists drops out of the links.
10. **Layout.** Phone: one column, the run and «Proponer ahora» on top, then theories, folded crossings, what to upload.
    Desktop (`md:`): the page uses the width as the other Biblioteca screens, `md:grid-cols-[minmax(0,1fr)_20rem]`;
    left the theories and the folded crossings, right a sticky panel with the run, «Proponer ahora» with its cost, and
    what to upload next.

## Code

- **Reader** `lib/datos/semana.ts`: `leerSemana(db)` (ported from Ingesta: latest run, its `motor` theories `guardada`
  and `descartada_por_motor`, topic names, `queSubir` with pillar names and networks and single-author topic ids) and
  `leerCostosDelMotor(db)` (latest 4 `costo_usd > 0`).
- **Domain** `lib/dominio/biblioteca/semana.ts`: `estimarCostoDelMotor`, the state and evidence labels, the decision
  «can she ask now» `puedePedirMotor(corrida, ahora)` (pure, tested).
- **Action** `lib/acciones/semana.ts` `proponerAhora(deps)` through `conSesionDeConi`; wrapper `proponerAhoraAccion` in
  `app/(app)/biblioteca/semana/acciones.ts`. No input, so no Zod schema beyond the session.
- **Screens** `app/(app)/biblioteca/semana/`: `page.tsx`, `loading.tsx` (the Biblioteca's own `error.tsx` and
  `not-found.tsx` already cover it), `vista-de-semana.tsx`, `boton-proponer-ahora.tsx` (`useAccion`, redraw with the
  project's redraw helper, never `redirect()`), pieces from `components/ui`.

## Testing

- **Units**: `estimarCostoDelMotor` (median of 4, fewer than 4, none, zeros ignored); `puedePedirMotor` (lista,
  corriendo fresh and stale, fallida, none); labels; the view (one-line empty, folded crossings with count, Detalle para
  WAV folded, pillar with network, state icon plus word).
- **Integration**: `leerSemana` and `leerCostosDelMotor` against the local database (latest run only, theory states,
  missing topics dropped, retired pillars dropped); `proponerAhora` refuses a non-Coni session and triggers
  `motor:<domingo>` once.
- **E2E** phone and desktop: ask now and see the note; «ya propuso» on a ready week; a failed week can ask again; empty
  run in one line; crossings folded and opening; links to topics; axe and large text on both; visual baselines after
  Federico sees the captures.

## Out of scope

Ingesta changes, the engine itself, the hard limit on manual runs, «Para leer después» (change 24), the tab switch
(batch 7).
