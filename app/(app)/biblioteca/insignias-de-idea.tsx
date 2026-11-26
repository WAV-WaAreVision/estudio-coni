import Link from "next/link"
import { Fragment } from "react"
import { hrefDeAfirmacion, type Insignias } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"

const INSIGNIA = "rounded-casilla bg-piedra-honda px-2.5 py-1 text-meta font-semibold text-tinta"

/**
 * Change 6c-1: an idea's tipo, respaldo and one emotion per network, as one link to its page, the only place where
 * she corrects them. The spaces between the badges keep them apart in the link's name.
 */
export function InsigniasDeIdea({
  afirmacionId,
  insignias,
  desde,
}: {
  afirmacionId: string
  insignias: Insignias
  desde?: string
}) {
  return (
    <Link
      href={hrefDeAfirmacion(afirmacionId, desde)}
      className="flex min-h-objetivo w-fit flex-wrap items-center gap-2 rounded-control"
    >
      <span className="sr-only">Ver y corregir las etiquetas:</span> <span className={INSIGNIA}>{insignias.tipo}</span>{" "}
      <span className={INSIGNIA}>{insignias.evidencia}</span>
      {insignias.emociones.map((emocion) => (
        <Fragment key={emocion.red}>
          {" "}
          <span className={INSIGNIA}>{`${NOMBRE_DE_RED[emocion.red]}: ${emocion.etiqueta}`}</span>
        </Fragment>
      ))}
    </Link>
  )
}
