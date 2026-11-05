import { CaretDown, Check } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { CHIP_ELEGIDO, FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import { PistaDePestanas } from "@/components/ui/pista-de-pestanas"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import {
  alternarSinTratar,
  conPilar,
  conRed,
  type FiltrosDeTemas,
  hrefDeTemas,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import { NOMBRE_DE_RED, type PilarDeRed, pilaresDeLaRed, type Red } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

const CHIP = cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP)
// Coni wrote the row Instagram first (her answer of 2026-11-04); every other list of the app keeps `REDES`' order.
const REDES_DE_LA_FILA: readonly Red[] = ["instagram", "linkedin"]
// The chosen network looks pressed: sunk into the stone, with its pillars open under the row.
const RED_ELEGIDA = "aria-[current=true]:bg-piedra-honda aria-[current=true]:shadow-hundido"
// Coni asked for the layer to read as not a pillar: outlined, without relief.
const CAPA = "border border-campo bg-transparent shadow-none aria-[current=page]:border-tinta"
// On the phone the pillars slide along one line in their own track, as the Biblioteca tabs do; from md up they wrap.
// The track bleeds into the page margin (main's px-5) and pads it back, so the chips' relief is not clipped.
const PISTA_DE_PILARES =
  "-mx-5 -my-5 flex min-w-0 flex-nowrap gap-2 overflow-x-auto px-5 py-5 scroll-px-5 md:mx-0 md:my-0 md:flex-wrap md:overflow-visible md:p-0"

interface Propiedades {
  filtros: FiltrosDeTemas
  /** Every network's pillars and layers; the row shows the chosen network's. */
  pilares: readonly PilarDeRed[]
  /** Topics of the network and pillar with nothing out there yet. */
  sinTratar: number
}

/**
 * Coni's row (spec 2026-11-04, part 15b, section 2): «Sin tratar», then Instagram and LinkedIn, and under them the
 * chosen network's pillars, «Todos los pilares» first and the TDAH layer last. Every button is a link to its address,
 * so Back and a shared link work without scripts. The networks wrap; on the phone the pillars slide in their own track
 * (from md up they wrap); the page never scrolls sideways.
 */
export function FilaDeTemas({ filtros, pilares, sinTratar }: Propiedades) {
  const opcionesDePilar = [
    { id: undefined, nombre: "Todos los pilares", esCapa: false },
    ...pilaresDeLaRed(pilares, filtros.red).map((pilar) => ({
      id: pilar.id,
      nombre: pilar.nombreCorto,
      esCapa: pilar.esCapa,
    })),
  ]
  return (
    <fieldset aria-label="Filtrar temas" className="m-0 grid min-w-0 gap-3 border-0 p-0">
      <ul className="flex min-w-0 flex-wrap gap-2">
        <li>
          <Link
            href={hrefDeTemas(alternarSinTratar(filtros))}
            scroll={false}
            aria-current={filtros.sinTratar ? "page" : undefined}
            className={cn(CHIP, CHIP_ELEGIDO)}
          >
            {filtros.sinTratar ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
            {conCuenta("Sin tratar", sinTratar)}
          </Link>
        </li>
        {REDES_DE_LA_FILA.map((red) => (
          <li key={red}>
            <Link
              href={hrefDeTemas(conRed(filtros, red))}
              scroll={false}
              aria-current={filtros.red === red ? "true" : undefined}
              className={cn(CHIP, RED_ELEGIDA)}
            >
              {/* The relief vanishes in forced colors and reads weakly at low vision: the check says it too. */}
              {filtros.red === red ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
              {NOMBRE_DE_RED[red]}
              <CaretDown aria-hidden="true" weight="bold" size={ICONO.chico} />
            </Link>
          </li>
        ))}
      </ul>
      <PistaDePestanas
        key={`${filtros.red}:${filtros.pilar ?? "todos"}`}
        etiqueta={`Pilares de ${NOMBRE_DE_RED[filtros.red]}`}
        className={PISTA_DE_PILARES}
      >
        {opcionesDePilar.map(({ id, nombre, esCapa }) => {
          const actual = filtros.pilar === id
          return (
            <li key={id ?? "todos"} className="shrink-0">
              <Link
                href={hrefDeTemas(conPilar(filtros, id))}
                scroll={false}
                aria-current={actual ? "page" : undefined}
                className={cn(CHIP, esCapa && CAPA, CHIP_ELEGIDO)}
              >
                {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
                {nombre}
              </Link>
            </li>
          )
        })}
      </PistaDePestanas>
    </fieldset>
  )
}
