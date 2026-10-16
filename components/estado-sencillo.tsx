import { CaretLeft } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { ReactNode } from "react"
import { ICONO } from "@/components/ui/icono"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"

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
      <Link href="/" className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta">
        <CaretLeft aria-hidden="true" size={ICONO.medio} />
        Inicio
      </Link>
      {pilar || segundos ? (
        <p className="flex items-baseline justify-between gap-4 text-meta text-apagado">
          <span>{pilar ? NOMBRE_DE_PILAR[pilar] : null}</span>
          <span>{segundos ? `${segundos} s` : null}</span>
        </p>
      ) : null}
      <h1 className="text-pieza text-balance">{titulo}</h1>
      <div className="mt-3 grid gap-6">{children}</div>
    </div>
  )
}
