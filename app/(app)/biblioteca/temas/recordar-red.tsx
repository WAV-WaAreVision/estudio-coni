"use client"

import { useEffect } from "react"
import type { Red } from "@/lib/dominio/pilares"
import { recordarRedAccion } from "../acciones"

/**
 * Temas opens on the last network Coni used (spec 2026-11-04, part 15b). After mount, never during the server render,
 * a network on screen that is not the stored one is recorded. It is a convenience: a failure shows nothing, but it is
 * logged.
 */
export function RecordarRed({ red, recordada }: { red: Red; recordada: Red | null }) {
  useEffect(() => {
    if (red === recordada) return
    recordarRedAccion({ red }).then(
      (resultado) => {
        if (!resultado.ok) console.error(`No pude recordar la red ${red}: ${resultado.error}`)
      },
      (error: unknown) => console.error(`No pude recordar la red ${red}`, error),
    )
  }, [red, recordada])
  return null
}
