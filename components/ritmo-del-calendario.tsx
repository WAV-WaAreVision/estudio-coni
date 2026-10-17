import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { ModeloDeCalendario } from "@/lib/calendario/modelo"
import { cn } from "@/lib/utils"

type Ritmo = ModeloDeCalendario["ritmo"]

const CELDA = "flex min-h-objetivo min-w-0 items-center rounded-bloque px-2.5 text-meta break-words"

/** The first word of the theme is enough inside a small cell; the full name is in the cell's accessible name. */
function nombreCorto(nombre: string): string {
  return nombre.split(" ")[0] ?? nombre
}

/**
 * Brandkit 9.19: weeks against the days of the schedule. A free slot is a sunken honda tile, as fields and tracks are; a
 * filled one is an ink tile with the theme in light. Read only: neither is raised.
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
  return (
    <div className="grid gap-6">
      {ensenanza ?? <p className="text-cuerpo">{ritmo.resumen}</p>}
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
            {celda.pilar ? nombreCorto(celda.pilar.nombre) : "Reel"}
          </span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per day of the schedule, in order
            key={i}
            className={cn(CELDA, "bg-piedra-honda text-apagado shadow-hundido")}
          >
            libre
          </span>
        ),
      )}
    </>
  )
}
