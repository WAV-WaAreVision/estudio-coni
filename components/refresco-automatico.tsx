"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Asks the server for the screen again every `cadaMs` while `activo` and the tab is visible. The server decides
 * `activo` on each render, so the polling stops by itself when the piece settles. No Realtime, no endpoint.
 */
export function RefrescoAutomatico({ activo, cadaMs }: { activo: boolean; cadaMs: number }) {
  const router = useRouter()

  useEffect(() => {
    if (!activo) return
    let intervalo: ReturnType<typeof setInterval> | null = null
    const arrancar = () => {
      if (intervalo === null) intervalo = setInterval(() => router.refresh(), cadaMs)
    }
    const parar = () => {
      if (intervalo !== null) clearInterval(intervalo)
      intervalo = null
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        router.refresh()
        arrancar()
      } else {
        parar()
      }
    }
    if (document.visibilityState === "visible") arrancar()
    document.addEventListener("visibilitychange", alCambiarVisibilidad)
    return () => {
      parar()
      document.removeEventListener("visibilitychange", alCambiarVisibilidad)
    }
  }, [activo, cadaMs, router])

  return null
}
