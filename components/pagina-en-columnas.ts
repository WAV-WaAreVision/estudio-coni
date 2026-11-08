/*
 * The pages of their own on a computer (issue 103, group B): Ideas, Métricas, Calendario and Ajustes mark
 * `data-ancho="pagina"` so the (app) column opens to 70rem from md:. Below md: none of these classes apply and every page
 * keeps the phone's single column, in the same order. The `biblioteca/subir` pattern: what she reads or fills at reading
 * width on the left, a 20rem panel on the right.
 */

/** The form (≤ 42rem) and the 20rem panel, pushed to the page's edges. */
export const FORMULARIO_Y_PANEL =
  "md:grid md:grid-cols-[minmax(0,42rem)_20rem] md:items-start md:justify-between md:gap-x-8 lg:gap-x-12"

/** A wide main area (a month, a card and its side) and the 20rem panel. */
export const PRINCIPAL_Y_PANEL = "md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-x-8 lg:gap-x-12"

/** The intro under a page's title stays at the form's width. */
export const INTRO_DE_PAGINA = "md:max-w-[42rem]"

/**
 * The panel when its content is flat (lines of text, a button): a quiet surface. A panel holding raised cards (Saldos,
 * Versiones) goes without it, so no card sits inside another.
 */
export const SUPERFICIE_DE_PANEL = "md:rounded-panel md:bg-piedra-alta md:p-5"

/** Cards side by side wherever there is room: the search results and Elegir varias of Ideas. */
export const CARTAS_EN_GRILLA =
  "md:grid md:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] md:gap-3 md:divide-y-0 md:bg-transparent md:px-0 md:shadow-none"

/** Each card of `CARTAS_EN_GRILLA`: the raised group it came from, now one per idea. */
export const CARTA_DE_GRILLA = "md:rounded-panel md:bg-piedra md:px-[18px] md:shadow-relieve"
