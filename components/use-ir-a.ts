"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

// As `useRedibujar`: how often the address is looked at, how long a try may take with nothing to show for it, how long
// after the screen's download a try that never landed counts as dropped, and how many tries in all.
const MIRAR_CADA_MS = 50
const ESPERAR_MS = 10_000
const GRACIA_TRAS_LLEGAR_MS = 1000
const INTENTOS = 3

export const ERROR_AL_LLEGAR = "Quedó guardado, pero no pude abrir la pantalla siguiente. Recarga la página."

/** An address as a screen: its path and its parameters, without the note the page takes out or a redraw's marker. */
function pantalla(url: URL): string {
  const parametros = [...url.searchParams].filter(([clave]) => clave !== "aviso" && clave !== "v" && clave !== "_rsc")
  parametros.sort(([a], [b]) => a.localeCompare(b))
  return `${url.pathname}?${new URLSearchParams(parametros)}`
}

/**
 * Goes to the next screen after an action, and checks it got there. A Server Action's `redirect()` sometimes never lands
 * in Next 16.2.6 (the response carries the new screen, the address never changes and the button stays pending), and a
 * plain `router.replace` can be dropped the same way, as `useRedibujar` found. So it watches the address, as
 * `useRedibujar` does: a try whose screen was downloaded and still did not show a second later, or that showed nothing
 * in ten seconds, is tried again, three times in all; then it says so in her words instead of waiting for ever. It ends
 * when the screen shows, or when she taps or types elsewhere.
 */
export function useIrA() {
  const router = useRouter()
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ir = useCallback(
    (destino: string) => {
      const meta = pantalla(new URL(destino, window.location.href))
      let quedan = INTENTOS
      let llegoEn: number | null = null
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
                if (llegoEn === null && URL.canParse(entrada.name) && pantalla(new URL(entrada.name)) === meta) {
                  llegoEn = Date.now()
                }
              }
            })
      const terminar = (conError: boolean) => {
        clearInterval(mirador)
        descargas?.disconnect()
        globalThis.document?.removeEventListener("pointerdown", alTocar, true)
        globalThis.document?.removeEventListener("keydown", alTocar, true)
        setYendo(false)
        if (conError) setError(ERROR_AL_LLEGAR)
      }
      const alTocar = () => terminar(false)
      const mirar = () => {
        // The watch outlives its button on purpose; when the whole page is gone (a test environment torn down), it ends.
        if (globalThis.window === undefined) return terminar(false)
        if (pantalla(new URL(window.location.href)) === meta) return terminar(false)
        const seDescarto = llegoEn !== null && Date.now() - llegoEn >= GRACIA_TRAS_LLEGAR_MS
        if (seDescarto || Date.now() >= plazo) {
          if (quedan > 0) intentar()
          else terminar(true)
        }
      }

      setError(null)
      setYendo(true)
      descargas?.observe({ type: "resource" })
      intentar()
      const mirador = setInterval(mirar, MIRAR_CADA_MS)
      document.addEventListener("pointerdown", alTocar, true)
      document.addEventListener("keydown", alTocar, true)
    },
    [router],
  )

  return { ir, yendo, error }
}
