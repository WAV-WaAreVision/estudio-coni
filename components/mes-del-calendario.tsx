import type { CeldaDeMes } from "@/lib/calendario/modelo"
import { cn } from "@/lib/utils"

const INICIALES = ["L", "M", "M", "J", "V", "S", "D"]

/** The month as a grid: a dot of the theme's colour for every publication, and today on the soft accent. */
export function MesDelCalendario({ celdas }: { celdas: readonly CeldaDeMes[] }) {
  return (
    <div className="grid gap-1">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center text-meta font-semibold text-apagado">
        {INICIALES.map((inicial, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the seven weekday initials never reorder
          <span key={i}>{inicial}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {celdas.map((celda, i) =>
          celda.dia === null ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: blanks before the first day have no other identity
            <li key={`vacio-${i}`} aria-hidden="true" />
          ) : (
            <li
              key={celda.dia}
              aria-current={celda.hoy ? "date" : undefined}
              className={cn(
                "grid aspect-square min-h-11 content-center justify-items-center gap-1 rounded-sm text-label tabular-nums",
                celda.hoy ? "bg-acento-suave font-bold text-acento" : "font-medium",
              )}
            >
              <span aria-hidden="true">{celda.dia}</span>
              <span className="sr-only">{celda.hoy ? `${celda.descripcion}, hoy` : celda.descripcion}</span>
              <span aria-hidden="true" className="flex h-[7px] gap-0.5">
                {celda.puntos.map((pilar, j) => (
                  <i
                    // biome-ignore lint/suspicious/noArrayIndexKey: dots of one day, in publication order
                    key={j}
                    data-pilar={pilar ?? undefined}
                    className={cn("size-[7px] rounded-full bg-pilar-punto", !pilar && "bg-apagado")}
                  />
                ))}
              </span>
            </li>
          ),
        )}
      </ol>
    </div>
  )
}
