import type { ReactNode } from "react"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import { Volver } from "./ui/volver"

/** The screen of a piece that has nothing to sign: the way back at the top, its title, and what is happening. */
export function EstadoSencillo({
  titulo,
  pilar,
  segundos,
  children,
}: {
  titulo: string
  pilar?: Pilar | null
  segundos?: number
  children: ReactNode
}) {
  return (
    <div className="grid gap-3">
      <Volver href="/">Inicio</Volver>
      {pilar || segundos ? (
        <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado">
          <span>{pilar ? NOMBRE_DE_PILAR[pilar] : null}</span>
          <span>{segundos ? `${segundos} s` : null}</span>
        </p>
      ) : null}
      <h1 className="text-pieza text-balance">{titulo}</h1>
      <div className="mt-6 grid gap-6">{children}</div>
    </div>
  )
}
