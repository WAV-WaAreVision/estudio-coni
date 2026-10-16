import Link from "next/link"
import { cn } from "@/lib/utils"

interface OpcionDePestana<T extends string> {
  valor: T
  etiqueta: string
  href: string
}

interface PropiedadesDePestanas<T extends string> {
  etiqueta: string
  actual: T
  opciones: readonly OpcionDePestana<T>[]
}

/**
 * Decision 4, the segmented control: views as links (each has an address and works without a script) on a sunken
 * track; the current one is raised.
 */
export function Pestanas<T extends string>({ etiqueta, actual, opciones }: PropiedadesDePestanas<T>) {
  return (
    <nav aria-label={etiqueta}>
      <ul className="flex gap-1 rounded-control bg-piedra-honda p-1 shadow-hundido">
        {opciones.map((opcion) => {
          const esActual = opcion.valor === actual
          return (
            <li key={opcion.valor} className="flex-1">
              <Link
                href={opcion.href}
                replace
                aria-current={esActual ? "page" : undefined}
                className={cn(
                  "flex min-h-objetivo items-center justify-center rounded-control px-3 text-cuerpo transition-shadow duration-[var(--dur-corta)] ease-salida",
                  esActual ? "bg-piedra font-semibold text-tinta shadow-relieve" : "font-medium text-apagado",
                )}
              >
                {opcion.etiqueta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
