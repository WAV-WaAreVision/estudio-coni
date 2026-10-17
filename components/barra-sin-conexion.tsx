"use client"

import { WifiSlash } from "@phosphor-icons/react"
import { useSyncExternalStore } from "react"
import { ICONO } from "@/components/ui/icono"

function suscribirse(avisar: () => void) {
  window.addEventListener("online", avisar)
  window.addEventListener("offline", avisar)
  return () => {
    window.removeEventListener("online", avisar)
    window.removeEventListener("offline", avisar)
  }
}

/** Approving needs the server, so offline the line says to wait; nothing is queued behind her back. */
export function BarraSinConexion() {
  const enLinea = useSyncExternalStore(
    suscribirse,
    () => navigator.onLine,
    () => true,
  )
  if (enLinea) return null
  return (
    <output className="flex min-h-objetivo items-center gap-2 border-b border-hilo px-5 text-meta font-semibold">
      <WifiSlash aria-hidden="true" size={ICONO.chico} className="shrink-0" />
      Sin conexión. Aprueba cuando vuelva.
    </output>
  )
}
