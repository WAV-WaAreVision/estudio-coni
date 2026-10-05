"use client"

import { WifiSlash } from "@phosphor-icons/react"
import { useSyncExternalStore } from "react"

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
    <output className="flex min-h-11 items-center gap-2 border-b border-linea px-5 text-meta font-semibold">
      <WifiSlash aria-hidden="true" size={16} className="text-aviso" />
      Sin conexión. Aprueba cuando vuelva.
    </output>
  )
}
