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

/** Brandkit 9.10: views as links, so each has an address and works without a script. The current one is underlined. */
export function Pestanas<T extends string>({ etiqueta, actual, opciones }: PropiedadesDePestanas<T>) {
  return (
    <nav aria-label={etiqueta}>
      <ul className="flex gap-6 border-b border-linea">
        {opciones.map((opcion) => {
          const esActual = opcion.valor === actual
          return (
            <li key={opcion.valor}>
              <Link
                href={opcion.href}
                replace
                aria-current={esActual ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center text-cuerpo",
                  esActual
                    ? "font-semibold text-tinta after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-tinta"
                    : "font-medium text-apagado",
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
