"use client"

import { useEffect } from "react"
import type { Red } from "@/lib/dominio/pilares"

/**
 * Temas opens on the last network Coni used (spec 2026-11-04, part 15b). After mount, never during the server render,
 * a network on screen that is not the stored one is recorded. It is a convenience: a failure shows nothing, but it is
 * logged. A plain request to `red-elegida`, not a Server Action: see that route for why.
 */
export function RecordarRed({ red, recordada }: { red: Red; recordada: Red | null }) {
  useEffect(() => {
    if (red === recordada) return
    fetch("/biblioteca/temas/red-elegida", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ red }),
      // Leaving Temas right away must not cancel it.
      keepalive: true,
    }).then(
      async (respuesta) => {
        if (!respuesta.ok) console.error(`No pude recordar la red ${red}: ${await respuesta.text()}`)
      },
      (error: unknown) => console.error(`No pude recordar la red ${red}`, error),
    )
  }, [red, recordada])
  return null
}
