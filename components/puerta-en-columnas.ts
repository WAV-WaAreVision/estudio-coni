/*
 * The signing gates on a tablet or a computer (critiques 2026-11-05): what she reviews on the left at reading width,
 * the decision on the right, the signature sticking at the top of its column while she reads. The screen wraps its
 * grid in `<div data-ancho="puerta" className="@container">`; below 40rem of container (a phone, or a large text)
 * none of these classes apply and the gate stays the phone's single column. Each screen adds its own grid rows.
 */

/** The grid: a reading column and a decision column, centred. */
export const COLUMNAS_DE_PUERTA =
  "dos-columnas:grid dos-columnas:grid-cols-[minmax(0,1fr)_minmax(15rem,17rem)] dos-columnas:justify-center dos-columnas:gap-x-8 dos-columnas:pb-[var(--final-pagina)] dos-columnas-amplias:grid-cols-[minmax(0,40rem)_minmax(16rem,22rem)] dos-columnas-amplias:gap-x-12"

/** The header across both columns, its lines at the reading column's width. The header itself spaces with gap-y. */
export const CABECERA_EN_COLUMNAS =
  "dos-columnas:col-span-full dos-columnas:grid-cols-subgrid dos-columnas:*:col-start-1"

/** The sign bar as a raised panel of the right column instead of the phone's bottom sheet; the screen sets its rows. */
export const FIRMA_EN_COLUMNA =
  "dos-columnas:col-start-2 dos-columnas:mx-0 dos-columnas:self-start dos-columnas:top-6 dos-columnas:bottom-auto dos-columnas:rounded-barra dos-columnas:pb-[14px] dos-columnas:shadow-relieve"
