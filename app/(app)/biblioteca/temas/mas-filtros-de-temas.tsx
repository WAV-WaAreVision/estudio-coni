import { Check, Funnel } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { CHIP_ELEGIDO, FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import {
  alternarTratados,
  alternarUnAutor,
  type ConteosDeTemas,
  type FiltrosDeTemas,
  hrefDeTemas,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import { cn } from "@/lib/utils"

/**
 * Coni's «Más filtros» (spec 2026-11-04, part 15b): «Ya los traté» in the chosen network, the opposite of «Sin tratar»,
 * and «Un solo autor». Links like the row, folded behind a chip; open when one is on.
 */
export function MasFiltrosDeTemas({ filtros, conteos }: { filtros: FiltrosDeTemas; conteos: ConteosDeTemas }) {
  const opciones = [
    {
      clave: "tratados",
      texto: conCuenta("Ya los traté", conteos.tratados),
      actual: filtros.tratados === true,
      href: hrefDeTemas(alternarTratados(filtros)),
    },
    {
      clave: "un-autor",
      texto: conCuenta("Un solo autor", conteos.unAutor),
      actual: filtros.unAutor === true,
      href: hrefDeTemas(alternarUnAutor(filtros)),
    },
  ]
  const activos = opciones.filter((opcion) => opcion.actual).length
  return (
    <MasOpciones
      titulo={activos === 0 ? "Más filtros" : `Más filtros · ${activos}`}
      forma="boton"
      icono={<Funnel aria-hidden="true" size={ICONO.chico} />}
      abiertaAlInicio={activos > 0}
      className="[&>summary]:w-fit [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:text-meta"
    >
      <ul aria-label="Más filtros de temas" className="flex min-w-0 flex-wrap gap-2">
        {opciones.map(({ clave, texto, actual, href }) => (
          <li key={clave}>
            <Link
              href={href}
              scroll={false}
              aria-current={actual ? "page" : undefined}
              className={cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP, CHIP_ELEGIDO)}
            >
              {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
              {texto}
            </Link>
          </li>
        ))}
      </ul>
    </MasOpciones>
  )
}
