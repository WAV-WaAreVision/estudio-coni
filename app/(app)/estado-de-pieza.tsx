"use client"

import Link from "next/link"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { useAccion } from "@/components/use-accion"
import { cambiarFechaAccion, descartarAccion, reintentarAccion, reintentarGuionAccion } from "./piezas/acciones"

type Que = "reintentar" | "reintentarGuion" | "cambiarFecha" | "descartar"

const ETIQUETAS: Record<Que, string> = {
  reintentar: "Reintentar",
  reintentarGuion: "Reintentar",
  cambiarFecha: "Cambiar la fecha",
  descartar: "Descartar esta pieza",
}

const ACCIONES: Record<Que, (piezaId: string, version: number) => ReturnType<typeof reintentarAccion>> = {
  reintentar: reintentarAccion,
  reintentarGuion: reintentarGuionAccion,
  cambiarFecha: cambiarFechaAccion,
  descartar: descartarAccion,
}

interface PropiedadesDeEstado {
  piezaId: string
  version: number
  /** The buttons the state offers, in order; the first one is the main one. */
  acciones: readonly Que[]
}

/** The buttons of a piece that is not waiting for a signature: retry, change the date or let it go. */
export function AccionesDeEstado({ piezaId, version, acciones }: PropiedadesDeEstado) {
  const { pendiente, error, ejecutar } = useAccion()
  return (
    <div className="grid gap-1">
      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}
      {acciones.map((que, indice) => (
        <Boton
          key={que}
          variante={indice === 0 ? "primario" : "callado"}
          cargando={pendiente}
          onClick={() => ejecutar(() => ACCIONES[que](piezaId, version))}
        >
          {ETIQUETAS[que]}
        </Boton>
      ))}
    </div>
  )
}

export function VolverAInicio() {
  return (
    <Link href="/" className={clasesDeBoton({ variante: "linea" })}>
      Volver a Inicio
    </Link>
  )
}
