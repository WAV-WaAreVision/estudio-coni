/** Fewer rem than this across the screen and the pinned bars would cover half of it (spec decision 6). */
export const ANCHO_MINIMO_EN_REM = 18

/** At 390 px this is true from a 21.7 px root up (xxxLarge and the accessibility sizes); at 375 px from 20.8 px. */
export function esLetraGrande(anchoPx: number, raizPx: number): boolean {
  if (raizPx <= 0) return false
  return anchoPx / raizPx < ANCHO_MINIMO_EN_REM
}

/**
 * Runs in <head> before the first paint: the arithmetic of `esLetraGrande`, inlined because no module loads that early.
 * iOS applies a new text size when the app comes back to the screen, hence pageshow and visibilitychange.
 */
export const SCRIPT_DE_LETRA = `(function(){var d=document.documentElement;function medir(){var r=parseFloat(getComputedStyle(d).fontSize);if(r>0&&innerWidth/r<${ANCHO_MINIMO_EN_REM})d.setAttribute("data-letra","grande");else d.removeAttribute("data-letra")}medir();addEventListener("resize",medir);addEventListener("pageshow",medir);document.addEventListener("visibilitychange",medir)})()`
