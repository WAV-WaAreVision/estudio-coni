"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"

// How often the address is looked at, how long a redraw may take to show its marker, how long after its download
// finished a marker that never showed counts as dropped, how long after it showed it a fallback is still watched for,
// and how many redraws are tried in all.
const MIRAR_CADA_MS = 50
const ESPERAR_MARCA_MS = 15_000
const GRACIA_TRAS_LLEGAR_MS = 1000
const VIGILAR_TRAS_VER_MS = 2000
const INTENTOS = 3

/** The address without the marker: two addresses that only differ in `v` are the same screen. */
function sinMarcador(url: URL): string {
  const copia = new URL(url)
  copia.searchParams.delete("v")
  return `${copia.pathname}${copia.search}${copia.hash}`
}

/**
 * Redraws the screen with fresh server data after an action that changed it in place. A `router.refresh()` on the same
 * address lost the race with the prefetches of that address made before the action (the Agenda kept the old places
 * although the server had rendered the new ones), so it goes to its own address with a fresh marker, as gate 1 does
 * after signing. Only `v` changes: every other parameter, the view among them, and the anchor stay.
 *
 * The production build loses a redraw in two ways, and the redraw watches the address to try again, a few times at most:
 * an action's own revalidated tree can commit after it and put back the address and the screen from before it (its
 * marker showed, then gave way to an earlier one), and Next 16 sometimes downloads the fresh screen and then drops the
 * navigation (the download finished, the marker never showed). A redraw still in flight (a slow render on mobile data)
 * is never issued again, since that would supersede it. The watch ends when she taps or types, goes to another address,
 * another redraw takes over, or time runs out. It lives in timers, not in the component, because the fresh screen may
 * unmount the button that asked for it; it always ends by itself. A caller that does unmount with it (the polling) calls
 * it off with the function the redraw returns.
 */
export function useRedibujar(): () => () => void {
  const router = useRouter()
  return useCallback(() => {
    const inicio = new URL(window.location.href)
    const origen = sinMarcador(inicio)
    // Markers that mean "the screen fell back": the one before the redraw and those of earlier tries.
    const anteriores = new Set<string | null>([inicio.searchParams.get("v")])

    const redibujar = (): string => {
      const url = new URL(window.location.href)
      const marca = String(Date.now())
      url.searchParams.set("v", marca)
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false })
      return marca
    }

    let marca = ""
    let quedan = INTENTOS
    let vista = false
    // When the download of the current try's address finished, if it did.
    let llegoEn: number | null = null
    let plazo = 0

    const intentar = () => {
      if (marca) anteriores.add(marca)
      quedan -= 1
      vista = false
      llegoEn = null
      plazo = Date.now() + ESPERAR_MARCA_MS
      marca = redibujar()
    }
    // The router's fetch of the fresh screen, seen as a finished resource. Without the API a dropped redraw just waits
    // for the next one.
    const descargas =
      typeof PerformanceObserver === "undefined"
        ? null
        : new PerformanceObserver((lista) => {
            for (const entrada of lista.getEntries()) {
              if (
                llegoEn === null &&
                URL.canParse(entrada.name) &&
                new URL(entrada.name).searchParams.get("v") === marca
              )
                llegoEn = Date.now()
            }
          })
    const terminar = () => {
      clearInterval(mirador)
      descargas?.disconnect()
      globalThis.document?.removeEventListener("pointerdown", terminar, true)
      globalThis.document?.removeEventListener("keydown", terminar, true)
    }
    const mirar = () => {
      // The check outlives its button on purpose; when the whole page is gone (a test environment torn down), it ends.
      if (globalThis.window === undefined) return terminar()
      const ahora = new URL(window.location.href)
      const v = ahora.searchParams.get("v")
      if (sinMarcador(ahora) !== origen) return terminar()
      if (v === marca) {
        if (!vista) plazo = Date.now() + VIGILAR_TRAS_VER_MS
        vista = true
      } else if (!anteriores.has(v)) {
        // Another redraw took over.
        return terminar()
      } else {
        const volvioAtras = vista
        const seDescarto = !vista && llegoEn !== null && Date.now() - llegoEn >= GRACIA_TRAS_LLEGAR_MS
        if (volvioAtras || seDescarto) return quedan > 0 ? intentar() : terminar()
      }
      if (Date.now() >= plazo) terminar()
    }
    descargas?.observe({ type: "resource" })
    intentar()
    const mirador = setInterval(mirar, MIRAR_CADA_MS)
    document.addEventListener("pointerdown", terminar, true)
    document.addEventListener("keydown", terminar, true)
    return terminar
  }, [router])
}
