"use client"

import { useEffect } from "react"
import { useRedibujar } from "@/components/use-redibujar"

// A round that would start this soon after a tap or a key waits for the next one: the redraw goes to the address on
// screen, and if she just followed a link that address is the one she is leaving.
const RESPIRO_TRAS_TOCAR_MS = 2000

/**
 * Asks the server for the screen again every `cadaMs` while `activo` and the tab is visible. The server decides
 * `activo` on each render, so the polling stops by itself when the piece settles. No Realtime, no endpoint. Each round
 * redraws on the screen's own address (`useRedibujar`): in the production build a `router.refresh()` lost the race with
 * the address's prefetches and the screen never changed.
 */
export function RefrescoAutomatico({ activo, cadaMs }: { activo: boolean; cadaMs: number }) {
  const redibujar = useRedibujar()

  useEffect(() => {
    if (!activo) return
    let intervalo: ReturnType<typeof setInterval> | null = null
    let ultimoToque = Number.NEGATIVE_INFINITY
    const alTocar = () => {
      ultimoToque = Date.now()
    }
    const ronda = () => {
      if (Date.now() - ultimoToque < RESPIRO_TRAS_TOCAR_MS) return
      redibujar()
    }
    const arrancar = () => {
      if (intervalo === null) intervalo = setInterval(ronda, cadaMs)
    }
    const parar = () => {
      if (intervalo !== null) clearInterval(intervalo)
      intervalo = null
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        redibujar()
        arrancar()
      } else {
        parar()
      }
    }
    if (document.visibilityState === "visible") arrancar()
    document.addEventListener("visibilitychange", alCambiarVisibilidad)
    document.addEventListener("pointerdown", alTocar, true)
    document.addEventListener("keydown", alTocar, true)
    return () => {
      parar()
      document.removeEventListener("visibilitychange", alCambiarVisibilidad)
      document.removeEventListener("pointerdown", alTocar, true)
      document.removeEventListener("keydown", alTocar, true)
    }
  }, [activo, cadaMs, redibujar])

  return null
}
