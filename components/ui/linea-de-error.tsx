import { WarningCircle } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { ICONO } from "./icono"

/**
 * A refusal said inside a honda block that already holds the action (a confirmation, a danger disclosure): one error
 * line after its icon, never a second block nested in the first.
 */
export function LineaDeError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-meta font-semibold text-error">
      <WarningCircle aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
      {children}
    </p>
  )
}
