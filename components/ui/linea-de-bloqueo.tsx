import { Info } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { ICONO } from "./icono"

/** Why a button is closed, under or above it (a provider's pause, say): information in ink, not an error. */
export function LineaDeBloqueo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-2 text-meta font-medium text-tinta">
      <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
      {children}
    </p>
  )
}
