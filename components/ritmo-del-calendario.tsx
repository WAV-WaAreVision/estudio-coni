import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { ModeloDeCalendario } from "@/lib/calendario/modelo"
import { cn } from "@/lib/utils"

type Ritmo = ModeloDeCalendario["ritmo"]

const CELDA = "flex min-h-objetivo min-w-0 items-center rounded-bloque px-2.5 text-meta break-words"

/**
 * Brandkit 9.19: weeks against the days of the schedule. A filled slot is an ink tile with the theme in light; a free one
 * is a flat hairline, counted in one line under the grid. Read only: nothing is raised.
 */
export function RitmoDelCalendario({ ritmo }: { ritmo: Ritmo }) {
  const ensenanza = ritmo.antesDeEmpezar ? (
    <div className="grid gap-3">
      <p className="text-cuerpo">{ritmo.antesDeEmpezar}</p>
      <Link href="/ajustes" className={clasesDeBoton({ variante: "callado", tamano: "chico", className: "w-fit" })}>
        Cambiar días y hora
      </Link>
    </div>
  ) : null
  if (ritmo.vacio) {
    return (
      ensenanza ?? (
        <p className="text-cuerpo text-apagado">
          Cuando haya reels publicados o programados, aquí verás cómo se reparten por semana.
        </p>
      )
    )
  }
  const libres = ritmo.semanas.reduce(
    (suma, semana) => suma + semana.celdas.filter((c) => c.tipo === "libre").length,
    0,
  )
  const hayLlenas = ritmo.semanas.some((semana) => semana.celdas.some((celda) => celda.tipo === "llena"))
  const lineaDeLibres =
    libres > 0 ? (
      <p className="text-meta text-apagado">{libres === 1 ? "1 espacio libre" : `${libres} espacios libres`}</p>
    ) : null
  return (
    <div className="grid gap-6">
      {ensenanza ?? <p className="text-cuerpo">{ritmo.resumen}</p>}
      {/* Free slots are counted in one line, never a wall of «libre» pills; with nothing filled there is no grid. */}
      {hayLlenas ? (
        <div className="grid gap-3">
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
          {lineaDeLibres}
        </div>
      ) : (
        lineaDeLibres
      )}
      {ritmo.sugerencia ? (
        <LineaDeEstado
          tipo="aviso"
          titulo={ritmo.sugerencia}
          tituloEnTinta
          accion={
            <Link href="/ajustes" className={clasesDeBoton({ variante: "callado", tamano: "chico" })}>
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
            className={cn(CELDA, "bg-tinta font-semibold text-luz")}
          >
            <span className="sr-only">{celda.dia}: </span>
            {celda.pilar ? celda.pilar.nombreCorto : "Reel"}
          </span>
        ) : (
          // A free cell is flat and silent: nothing to tap, the line under the grid counts them.
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per day of the schedule, in order
            key={i}
            data-libre
            aria-hidden="true"
            className="min-h-objetivo border-b border-hilo"
          />
        ),
      )}
    </>
  )
}
