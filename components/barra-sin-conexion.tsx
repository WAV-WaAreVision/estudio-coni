"use client"

import { useSyncExternalStore } from "react"

function suscribirse(avisar: () => void) {
  window.addEventListener("online", avisar)
  window.addEventListener("offline", avisar)
  return () => {
    window.removeEventListener("online", avisar)
    window.removeEventListener("offline", avisar)
  }
}

/** Approving needs the server, so offline the bar says to wait; nothing is queued behind her back. */
export function BarraSinConexion() {
  const enLinea = useSyncExternalStore(
    suscribirse,
    () => navigator.onLine,
    () => true,
  )
  if (enLinea) return null
  return (
    <output className="block bg-aviso-fondo px-4.5 py-2.5 text-center text-meta font-semibold text-aviso-tinta">
      Sin conexión. Aprueba cuando vuelva.
    </output>
  )
}
