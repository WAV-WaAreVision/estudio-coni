# Desktop pass: every page uses the full width

Issue #103. Approved by Federico on 2026-11-08, after the audit (44 screens at 1440 px). Phone layouts stay as they
are. Body text stays at reading width (≤ 75ch). Three PRs, in this order; each shows Federico phone and desktop
captures before any visual baseline is committed.

## How width works today

`app/(app)/layout.tsx:19` keeps the column at `max-w-[560px]`. From `md:` it opens to `76rem` for
`[data-ancho=biblioteca]` and `70rem` for `puerta` / `inicio`. Inside a page, `components/puerta-en-columnas.ts`
(`COLUMNAS_DE_PUERTA`) builds two columns with container queries (`dos-columnas`, `dos-columnas-amplias`,
`app/globals.css`). Biblioteca uses `md:grid-cols-[minmax(0,1fr)_20rem]` (main + side panel). The stopped-video screen
(issue 101) already uses `data-ancho="puerta"` + `COLUMNAS_DE_PUERTA`: left what happened and actions, right the
piece's card.

## Group A: piece states (one shared component)

`components/estado-sencillo.tsx` (`EstadoSencillo`) renders every reel, video and carousel state that is not a gate:
guion `guion_en_proceso`, `en_render`, `subtitulando`, `error_produccion` (`app/(app)/guion/[id]/page.tsx`), video
`programado`, `para_subir_a_mano`, `publicado_a_mano`, `publicado`, `error_publicacion` (`app/(app)/video/[id]/page.tsx`),
carousel `guion_en_proceso`, `armando_carrusel`, `programado`, `para_subir_a_mano`, `publicado`, `error_produccion`
(`app/(app)/guion/[id]/carrusel.tsx`).

- `EstadoSencillo` marks `data-ancho="puerta"` and lays out two columns from the desktop breakpoint with the existing
  `COLUMNAS_DE_PUERTA` pattern: a main slot (the state: what is happening, steps of `PorSubir`, the carousel slides or
  preview, at reading width) and a side slot (the piece's card: title, pillar, length; the video or voice player;
  the actions: Reintentar, Descargar, change date, Descartar, Volver a Inicio).
- Callers move their pieces into the two slots. On the phone the order is what it is today.
- The issue 101 stopped-video layout becomes this shared layout instead of its own (`PantallaDeVideoDetenido`), with
  the same result.

## Group B: own pages

Each marks a width and gets its own desktop layout. Add `data-ancho="pagina"` (→ `max-w-[70rem]`) in
`app/(app)/layout.tsx` rather than reusing `inicio`.

- `/ideas`: idea cards in a grid (`auto-fill minmax(18rem,1fr)`).
- `/metricas`: the figures row on top; Instagram and LinkedIn side by side.
- `/calendario`: the month or agenda wide on the left, «Para subir» as a 20rem side panel.
- `/ajustes` and its four subpages: an `ajustes/layout.tsx` marks them. `/ajustes`: two columns of sections. Each form
  page (cuentas, datos-personales, pagina-de-ia, presupuesto): form at ≤ 42rem plus a 20rem panel (help or summary;
  in Presupuesto, «Por proveedor»), the `biblioteca/subir` pattern.

## Group C: Biblioteca pages that leave the width empty

They already sit in the 76rem Biblioteca width but cap the content at `md:max-w-[42rem]`.

- `/biblioteca/autores/[id]`, `/biblioteca/temas/[id]`: a 20rem side panel as in Materiales (pillars, «Cambiar
  pilares» / «Unir con otro autor», figures); the ideas in a 2-column grid.
- `/biblioteca/temas/borradores`: a grid of draft cards (`auto-fill minmax(20rem,1fr)`), Pilares and Redes side by side.
- `borradores/[id]/editar`, `temas/pilar-nuevo`, `temas/red-nueva`: form at 42rem plus a 20rem panel explaining what
  saving does.
- `borradores/[id]/aprobar`: the weights as a wide table (pillar × stage); total and warning in a side panel.

## Testing

Per group: unit tests where a component's structure changes (slots); E2E desktop checks per route (main content wider
than 900 px at 1440, no horizontal overflow, axe) and phone checks (single column, order unchanged); visual baselines
retaken only after Federico approves the captures.
