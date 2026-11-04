import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

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
   * The track hugs its options instead of sharing the width, with tighter tabs; when they do not fit one row (large
   * text) they wrap instead of pushing the page sideways (WCAG 1.4.10).
   */
  compacta?: boolean
}

/**
 * Decision 4, the segmented control: views as links (each has an address and works without a script) on a sunken
 * track; the current one is raised.
 */
export function Pestanas<T extends string>({ etiqueta, actual, opciones, compacta = false }: PropiedadesDePestanas<T>) {
  return (
    <nav aria-label={etiqueta}>
      <ul
        className={cn(
          compacta ? "inline-flex w-fit max-w-full flex-wrap" : "flex",
          "gap-1 rounded-control bg-piedra-honda p-1 shadow-hundido",
        )}
      >
        {opciones.map((opcion) => {
          const esActual = opcion.valor === actual
          return (
            <li key={opcion.valor} className={compacta ? "flex-none" : "flex-1"}>
              <Link
                href={opcion.href}
                replace
                aria-current={esActual ? "page" : undefined}
                className={cn(
                  "flex min-h-objetivo items-center justify-center rounded-control text-cuerpo transition-shadow duration-[var(--dur-corta)] ease-salida",
                  compacta ? "gap-1.5 px-2.5" : "gap-2 px-3",
                  esActual ? "bg-piedra font-semibold text-tinta shadow-relieve" : "font-medium text-apagado",
                )}
              >
                {opcion.icono}
                {opcion.etiqueta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
