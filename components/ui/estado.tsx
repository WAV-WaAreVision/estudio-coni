import { Check, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ICONO } from "./icono"

export type TipoDePildora = "ok" | "aviso" | "error" | "neutro"

const ICONOS = { ok: Check, aviso: Warning, error: WarningCircle } as const

/**
 * Decision 4: a state is a flat pill, icon and meta 600, never a shadow (The Relief Means Touch Rule). Success and
 * warning are no colours: ink on honda with their icon (The No Yellow Rule). An error is magenta on honda.
 */
export function PildoraDeEstado({
  tipo,
  children,
  className,
}: {
  tipo: TipoDePildora
  children: ReactNode
  className?: string
}) {
  const Icono = tipo === "neutro" ? null : ICONOS[tipo]
  return (
    <span
      data-contorno
      className={cn(
        "pildora inline-flex min-h-pildora max-w-full items-center gap-2 rounded-control py-1 pr-3.5 pl-2.5 text-meta font-semibold",
        tipo === "neutro" ? "bg-piedra-alta pl-3.5" : "bg-piedra-honda",
        tipo === "error" ? "text-error" : "text-tinta",
        className,
      )}
    >
      {Icono ? <Icono aria-hidden="true" size={ICONO.chico} weight="bold" className="shrink-0" /> : null}
      <span>{children}</span>
    </span>
  )
}
