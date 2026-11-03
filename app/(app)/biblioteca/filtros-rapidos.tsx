import { Check } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { type EstadoDeMaterial, type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"
import { cn } from "@/lib/utils"

interface Propiedades {
  filtros: FiltrosDeMateriales
  conteos: { procesando: number; fallido: number }
}

/** A count only when there is something to count (4i): "Procesando · 2", or just "Procesando". */
const conCuenta = (texto: string, cantidad: number) => (cantidad > 0 ? `${texto} · ${cantidad}` : texto)

/**
 * Fix 4b: one tap per state. Each is a link that keeps the other filters, so Back undoes a filter and they work
 * without scripts; the open panel closes, since its material may not be in the new list.
 */
export function FiltrosRapidos({ filtros, conteos }: Propiedades) {
  const opciones: { estado: EstadoDeMaterial | undefined; texto: string }[] = [
    { estado: undefined, texto: "Todos" },
    { estado: "procesando", texto: conCuenta("Procesando", conteos.procesando) },
    { estado: "listo", texto: "Listos" },
    { estado: "fallido", texto: conCuenta("Con error", conteos.fallido) },
  ]
  return (
    <fieldset aria-label="Filtrar por estado" className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      {opciones.map(({ estado, texto }) => {
        const actual = filtros.estado === estado
        return (
          <Link
            key={estado ?? "todos"}
            href={hrefDeLista({ ...filtros, estado })}
            scroll={false}
            aria-current={actual ? "page" : undefined}
            className={cn(
              FORMA_DE_CHIP,
              TRANSICION_DE_CHIP,
              "aria-[current=page]:bg-tinta aria-[current=page]:text-luz",
            )}
          >
            {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
            {texto}
          </Link>
        )
      })}
    </fieldset>
  )
}
