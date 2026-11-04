import { Check } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import { type Cobertura, type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { cn } from "@/lib/utils"

interface Propiedades {
  filtros: FiltrosDeTemas
  conteos: Record<Cobertura, number>
}

/** Coni's option 1, one tap each, as Materiales' quick filters: links that keep the pillar and close the panel. */
export function FiltrosDeCobertura({ filtros, conteos }: Propiedades) {
  const opciones: { cobertura: Cobertura | undefined; texto: string }[] = [
    { cobertura: undefined, texto: "Todos" },
    { cobertura: "sin-tratar", texto: conCuenta("Sin tratar", conteos["sin-tratar"]) },
    { cobertura: "tratados", texto: conCuenta("Ya los traté", conteos.tratados) },
    { cobertura: "un-autor", texto: conCuenta("Un solo autor", conteos["un-autor"]) },
  ]
  return (
    <fieldset aria-label="Filtrar temas" className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      {opciones.map(({ cobertura, texto }) => {
        const actual = filtros.cobertura === cobertura
        return (
          <Link
            key={cobertura ?? "todos"}
            href={hrefDeTemas({ ...filtros, cobertura })}
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
