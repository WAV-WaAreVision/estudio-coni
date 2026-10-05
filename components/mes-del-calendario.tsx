import Link from "next/link"
import type { CeldaDeMes } from "@/lib/calendario/modelo"
import { cn } from "@/lib/utils"

const INICIALES = ["L", "M", "M", "J", "V", "S", "D"]
const PUNTOS_A_DIBUJAR = 2
const VER_EN_LA_AGENDA = "/calendario?vista=agenda"

/** Brandkit 9.19: the month as a 7-column grid. Today is an ink disc, a publication is an ink dot (two at most). */
export function MesDelCalendario({ celdas }: { celdas: readonly CeldaDeMes[] }) {
  const indiceDeHoy = celdas.findIndex((celda) => celda.hoy)
  return (
    <div className="grid gap-1">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center text-meta font-medium text-apagado">
        {INICIALES.map((inicial, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the seven weekday initials never reorder
          <span key={i}>{inicial}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {celdas.map((celda, i) => {
          if (celda.dia === null)
            // biome-ignore lint/suspicious/noArrayIndexKey: blanks before the first day have no other identity
            return <li key={`vacio-${i}`} aria-hidden="true" />
          const pasado = indiceDeHoy >= 0 && i < indiceDeHoy
          const contenido = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-9 place-items-center rounded-full text-meta tabular-nums",
                  celda.hoy ? "bg-tinta font-semibold text-sobre-tinta" : cn("font-medium", pasado && "text-apagado"),
                )}
              >
                {celda.dia}
              </span>
              <span className="sr-only">{celda.hoy ? `${celda.descripcion}, hoy` : celda.descripcion}</span>
              <span aria-hidden="true" className="flex h-1.5 gap-1">
                {celda.puntos.slice(0, PUNTOS_A_DIBUJAR).map((_, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: dots of one day, in publication order
                  <i key={j} className="size-1.5 rounded-full bg-tinta" />
                ))}
              </span>
            </>
          )
          const clases = "grid h-12 content-center justify-items-center gap-0.5"
          return (
            <li key={celda.dia} aria-current={celda.hoy ? "date" : undefined}>
              {celda.puntos.length > 0 ? (
                <Link href={VER_EN_LA_AGENDA} className={clases}>
                  {contenido}
                </Link>
              ) : (
                <div className={clases}>{contenido}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
