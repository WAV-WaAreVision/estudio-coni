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
      // Without a session the proxy sends it to sign in: that page is not an answer, and following it costs a request.
      redirect: "manual",
    }).then(
      async (respuesta) => {
        if (respuesta.type === "opaqueredirect") {
          console.error(`No pude recordar la red ${red}: la sesión pidió entrar de nuevo.`)
        } else if (!respuesta.ok) {
          console.error(`No pude recordar la red ${red}: ${await respuesta.text()}`)
        }
      },
      (error: unknown) => console.error(`No pude recordar la red ${red}`, error),
    )
  }, [red, recordada])
  return null
}
