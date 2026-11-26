import { Check } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { ReactNode } from "react"
import { CHIP_ELEGIDO, FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { ICONO } from "@/components/ui/icono"
import {
  alternarFavoritos,
  alternarMisTipos,
  conPilar,
  conRed,
  type FiltrosDeGanchos as Filtros,
  hrefDeGanchos,
  type RedDeFiltro,
  SIN_RED,
} from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import { NOMBRE_DE_RED, type PilarDeRed } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

const FILA = "m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"

function Chip({ href, actual, children }: { href: string; actual: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={actual ? "page" : undefined}
      className={cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP, CHIP_ELEGIDO)}
    >
      {actual ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
      {children}
    </Link>
  )
}

const REDES: { red: RedDeFiltro | undefined; texto: string }[] = [
  { red: undefined, texto: "Todas las redes" },
  { red: "linkedin", texto: NOMBRE_DE_RED.linkedin },
  { red: "instagram", texto: NOMBRE_DE_RED.instagram },
  { red: SIN_RED, texto: "Sin red" },
]

/**
 * The quick filters of the hooks (spec 6b): links that keep the rest, so they work without scripts and Back undoes
 * them. The pillars show only once a network is chosen, and only that network's (layers are not pillars).
 */
export function FiltrosDeGanchos({
  filtros,
  pilares,
  conMisTipos,
}: {
  filtros: Filtros
  pilares: readonly PilarDeRed[]
  conMisTipos: boolean
}) {
  const red = filtros.red
  const deLaRed = red && red !== SIN_RED ? pilares.filter((pilar) => pilar.red === red && !pilar.esCapa) : []
  return (
    <div className="grid gap-3">
      <fieldset aria-label="Mostrar" className={FILA}>
        <Chip href={hrefDeGanchos(alternarFavoritos(filtros))} actual={filtros.favoritos === true}>
          Solo favoritos
        </Chip>
        {conMisTipos ? (
          <Chip href={hrefDeGanchos(alternarMisTipos(filtros))} actual={filtros.misTipos === true}>
            Mis tipos
          </Chip>
        ) : null}
      </fieldset>
      <fieldset aria-label="Red" className={FILA}>
        {REDES.map((opcion) => (
          <Chip
            key={opcion.red ?? "todas"}
            href={hrefDeGanchos(conRed(filtros, opcion.red))}
            actual={red === opcion.red}
          >
            {opcion.texto}
          </Chip>
        ))}
      </fieldset>
      {red && red !== SIN_RED && deLaRed.length > 0 ? (
        <fieldset aria-label={`Pilar de ${NOMBRE_DE_RED[red]}`} className={FILA}>
          <Chip href={hrefDeGanchos(conPilar(filtros, undefined))} actual={filtros.pilar === undefined}>
            Todos los pilares
          </Chip>
          {deLaRed.map((pilar) => (
            <Chip key={pilar.id} href={hrefDeGanchos(conPilar(filtros, pilar.id))} actual={filtros.pilar === pilar.id}>
              {pilar.nombreCorto}
            </Chip>
          ))}
        </fieldset>
      ) : null}
    </div>
  )
}
