import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { PistaDePestanas } from "./pista-de-pestanas"

interface OpcionDePestana<T extends string> {
  valor: T
  etiqueta: string
  href: string
  icono?: ReactNode
}

interface PropiedadesDePestanas<T extends string> {
  etiqueta: string
  actual: T
  opciones: readonly OpcionDePestana<T>[]
  /**
   * The track hugs its options instead of sharing the width, with tighter tabs; when they do not fit one row (a phone,
   * large text) they slide inside the track, so it keeps one height and never pushes the page sideways (WCAG 1.4.10).
   */
  compacta?: boolean
}

const PISTA = "gap-1 rounded-control bg-piedra-honda p-1 shadow-hundido"

/**
 * Decision 4, the segmented control: views as links (each has an address and works without a script) on a sunken
 * track; the current one is raised.
 */
export function Pestanas<T extends string>({ etiqueta, actual, opciones, compacta = false }: PropiedadesDePestanas<T>) {
  const pestanas = opciones.map((opcion) => {
    const esActual = opcion.valor === actual
    return (
      <li key={opcion.valor} className={compacta ? "flex-none" : "flex-1"}>
        <Link
          href={opcion.href}
          replace
          aria-current={esActual ? "page" : undefined}
          className={cn(
            "flex min-h-objetivo items-center justify-center rounded-control text-cuerpo transition-shadow duration-[var(--dur-corta)] ease-salida",
            compacta ? "gap-1.5 whitespace-nowrap px-2.5" : "gap-2 px-3",
            esActual ? "bg-piedra font-semibold text-tinta shadow-relieve" : "font-medium text-apagado",
          )}
        >
          {opcion.icono}
          {opcion.etiqueta}
        </Link>
      </li>
    )
  })
  return (
    <nav aria-label={etiqueta} className="min-w-0">
      {compacta ? (
        <PistaDePestanas
          key={actual}
          className={`inline-flex w-fit max-w-full flex-nowrap overflow-x-auto scroll-px-1 ${PISTA}`}
        >
          {pestanas}
        </PistaDePestanas>
      ) : (
        <ul className={`flex ${PISTA}`}>{pestanas}</ul>
      )}
    </nav>
  )
}
