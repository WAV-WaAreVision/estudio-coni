import { Nota } from "@/components/nota"
import type { ModeloDeCalendario } from "@/lib/calendario/modelo"
import { NOMBRE_DE_PILAR } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

type Ritmo = ModeloDeCalendario["ritmo"]

/** The first word of the theme is enough inside a small cell; the full name is in the cell's accessible name. */
function nombreCorto(nombre: string): string {
  return nombre.split(" ")[0] ?? nombre
}

/** Weeks against the days of the schedule: filled with the theme, or free. Honest about what it can and cannot say. */
export function RitmoDelCalendario({ ritmo }: { ritmo: Ritmo }) {
  if (ritmo.vacio) {
    return (
      <p className="text-apagado">
        Cuando haya reels publicados o programados, aquí verás cómo se reparten por semana.
      </p>
    )
  }
  return (
    <div className="grid gap-4">
      <p className="text-body">{ritmo.resumen}</p>
      <div
        className="grid items-center gap-1.5"
        style={{ gridTemplateColumns: `4.5rem repeat(${ritmo.columnas.length}, minmax(0, 1fr))` }}
      >
        <span />
        {ritmo.columnas.map((columna) => (
          <span key={columna} className="text-center text-meta font-semibold text-apagado">
            {columna}
          </span>
        ))}
        {ritmo.semanas.map((semana) => (
          <RitmoSemana key={semana.etiqueta} semana={semana} />
        ))}
      </div>
      {ritmo.sugerencia ? <Nota tipo="aviso" titulo={ritmo.sugerencia} /> : null}
    </div>
  )
}

function RitmoSemana({ semana }: { semana: Ritmo["semanas"][number] }) {
  return (
    <>
      <span className="text-meta font-semibold text-apagado">{semana.etiqueta}</span>
      {semana.celdas.map((celda, i) =>
        celda.tipo === "llena" ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per day of the schedule, in order
            key={i}
            data-pilar={celda.pilar ?? undefined}
            title={celda.titulo}
            className={cn(
              "grid min-h-11 place-items-center rounded-sm px-1 text-center text-label font-semibold leading-tight",
              celda.pilar ? "bg-pilar-tinte-fuerte text-pilar-tinta" : "bg-hundido text-tinta",
            )}
          >
            {celda.pilar ? nombreCorto(NOMBRE_DE_PILAR[celda.pilar]) : "Reel"}
          </span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per day of the schedule, in order
            key={i}
            className="grid min-h-11 place-items-center rounded-sm border-[1.5px] border-linea border-dashed text-label text-apagado"
          >
            libre
          </span>
        ),
      )}
    </>
  )
}
