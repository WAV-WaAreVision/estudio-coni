import Link from "next/link"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { ModeloDeCalendario } from "@/lib/calendario/modelo"
import { NOMBRE_DE_PILAR } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

type Ritmo = ModeloDeCalendario["ritmo"]

/** The first word of the theme is enough inside a small cell; the full name is in the cell's accessible name. */
function nombreCorto(nombre: string): string {
  return nombre.split(" ")[0] ?? nombre
}

/** Brandkit 9.19: weeks against the days of the schedule, as lines and bars: filled is a 4 px ink bar, free is a 1 px line. */
export function RitmoDelCalendario({ ritmo }: { ritmo: Ritmo }) {
  if (ritmo.vacio) {
    return (
      <p className="text-cuerpo text-apagado">
        Cuando haya reels publicados o programados, aquí verás cómo se reparten por semana.
      </p>
    )
  }
  return (
    <div className="grid gap-6">
      <p className="text-cuerpo">{ritmo.resumen}</p>
      <div
        className="grid items-end gap-x-3 gap-y-4"
        style={{ gridTemplateColumns: `56px repeat(${ritmo.columnas.length}, minmax(0, 1fr))` }}
      >
        <span />
        {ritmo.columnas.map((columna) => (
          <span key={columna} className="text-meta font-semibold">
            {columna}
          </span>
        ))}
        {ritmo.semanas.map((semana, i) => (
          <RitmoSemana key={semana.etiqueta} semana={semana} actual={i === ritmo.semanas.length - 1} />
        ))}
      </div>
      {ritmo.sugerencia ? (
        <LineaDeEstado
          tipo="aviso"
          titulo={ritmo.sugerencia}
          tituloEnTinta
          accion={
            <Link href="/ajustes" className="inline-flex min-h-11 items-center text-cuerpo font-medium text-tinta">
              Cambiar días de publicación
            </Link>
          }
        />
      ) : null}
    </div>
  )
}

function RitmoSemana({ semana, actual }: { semana: Ritmo["semanas"][number]; actual: boolean }) {
  return (
    <>
      <span data-snapshot="varia" className={cn("text-meta tabular-nums", actual ? "font-semibold" : "text-apagado")}>
        {semana.etiqueta}
      </span>
      {semana.celdas.map((celda, i) =>
        celda.tipo === "llena" ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per day of the schedule, in order
            key={i}
            title={celda.titulo}
            className="grid gap-1 text-meta font-medium"
          >
            {celda.pilar ? nombreCorto(NOMBRE_DE_PILAR[celda.pilar]) : "Reel"}
            <span aria-hidden="true" className="h-1 bg-tinta" />
          </span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per day of the schedule, in order
            key={i}
            className="grid gap-1 text-meta text-apagado"
          >
            libre
            <span aria-hidden="true" className="h-px bg-campo" />
          </span>
        ),
      )}
    </>
  )
}
