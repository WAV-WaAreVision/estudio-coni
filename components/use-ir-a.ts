"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

// As `useRedibujar`: how often the address is looked at, how long a try may take with nothing to show for it, how long
// after the screen's download a try that never landed counts as dropped, and how many tries in all.
const MIRAR_CADA_MS = 50
const ESPERAR_MS = 10_000
const GRACIA_TRAS_LLEGAR_MS = 1000
const INTENTOS = 3

export const ERROR_AL_LLEGAR = "Listo, pero no pude abrir la pantalla siguiente. Recarga la página."

/** Fired by the page that takes its `?aviso=` note out of the address (`TrasElAviso`): the new screen committed. */
export const EVENTO_DE_LLEGADA = "conidolly:llegada"

/** `URL.canParse` is missing on iOS 16: a resource name that is not an address is simply not ours. */
function aUrl(texto: string): URL | null {
  try {
    return new URL(texto)
  } catch {
    return null
  }
}

/** An address as a screen: its path and its parameters, without the note the page takes out or a redraw's marker. */
function pantalla(url: URL): string {
  const parametros = [...url.searchParams].filter(([clave]) => clave !== "aviso" && clave !== "v" && clave !== "_rsc")
  parametros.sort(([a], [b]) => a.localeCompare(b))
  return `${url.pathname}?${new URLSearchParams(parametros)}`
}

/**
 * Goes to the next screen after an action, and checks it got there. A Server Action's `redirect()` sometimes never lands
 * in Next 16.2.6 (the response carries the new screen, the address never changes and the button stays pending), and a
 * plain `router.replace` can be dropped the same way, as `useRedibujar` found. So it watches, as `useRedibujar` does: a
 * try whose screen was downloaded and still did not show a second later, or that showed nothing in ten seconds, is
 * tried again, three times in all; then it says so in her words instead of waiting for ever.
 *
 * It landed when the address shows the destination; when the destination is the screen she is on (Descartar in
 * Borradores), the address proves nothing, so only the note's arrival does (`EVENTO_DE_LLEGADA`). It ends without an
 * error on Back, or when she taps or types outside `origen` (what started it: the busy form keeps it going).
 */
export function useIrA() {
  const router = useRouter()
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ir = useCallback(
    (destino: string, origen: Element | null = null) => {
      const base = window.location.href
      const meta = pantalla(new URL(destino, base))
      const mismaPantalla = meta === pantalla(new URL(base))
      let quedan = INTENTOS
      let llegoEn: number | null = null
      let llego = false
      let plazo = 0

      const intentar = () => {
        quedan -= 1
        llegoEn = null
        plazo = Date.now() + ESPERAR_MS
        router.replace(destino)
      }
      // The router's fetch of the screen, seen as a finished resource. Without the API a dropped try waits its time.
      const descargas =
        typeof PerformanceObserver === "undefined"
          ? null
          : new PerformanceObserver((lista) => {
              for (const entrada of lista.getEntries()) {
                const url = aUrl(entrada.name)
                if (llegoEn === null && url !== null && pantalla(url) === meta) llegoEn = Date.now()
              }
            })
      const terminar = (conError: boolean) => {
        clearInterval(mirador)
        descargas?.disconnect()
        document.removeEventListener("pointerdown", alTocar, true)
        document.removeEventListener("keydown", alTocar, true)
        window.removeEventListener("popstate", alVolver)
        window.removeEventListener(EVENTO_DE_LLEGADA, alLlegar)
        setYendo(false)
        if (conError) setError(ERROR_AL_LLEGAR)
      }
      const alTocar = (evento: Event) => {
        if (origen !== null && evento.target instanceof Node && origen.contains(evento.target)) return
        terminar(false)
      }
      const alVolver = () => terminar(false)
      const alLlegar = () => {
        llego = true
      }
      const mirar = () => {
        // The watch outlives its button on purpose; when the whole page is gone (a test environment torn down), it ends.
        if (globalThis.window === undefined) return terminar(false)
        if (llego || (!mismaPantalla && pantalla(new URL(window.location.href)) === meta)) return terminar(false)
        const seDescarto = llegoEn !== null && Date.now() - llegoEn >= GRACIA_TRAS_LLEGAR_MS
        if (seDescarto || Date.now() >= plazo) {
          if (quedan > 0) intentar()
          else terminar(true)
        }
      }

      setError(null)
      setYendo(true)
      descargas?.observe({ type: "resource" })
      window.addEventListener(EVENTO_DE_LLEGADA, alLlegar)
      intentar()
      const mirador = setInterval(mirar, MIRAR_CADA_MS)
      document.addEventListener("pointerdown", alTocar, true)
      document.addEventListener("keydown", alTocar, true)
      window.addEventListener("popstate", alVolver)
    },
    [router],
  )

  return { ir, yendo, error }
}
