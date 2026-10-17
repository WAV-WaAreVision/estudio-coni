import { CalendarBlank, Info } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Bloque } from "./bloque"
import { PildoraDeEstado } from "./estado"
import { ICONO } from "./icono"

export type TipoDeEstado = "exito" | "aviso" | "error" | "neutro" | "fecha"

interface PropiedadesDeLinea {
  tipo: TipoDeEstado
  titulo: ReactNode
  /** A label read before the title, in the same weight. */
  rotulo?: string
  /** An error title that is a message rather than a cause stays in ink. */
  tituloEnTinta?: boolean
  detalle?: ReactNode
  accion?: ReactNode
  /** The error was already announced by another alert of the screen: this one is read, not announced again. */
  anunciada?: boolean
  className?: string
}

/**
 * Decision 4: the Calma suiza API, drawn with the Soft UI parts. `exito` is an `ok` pill, `aviso` and `error` are
 * honda blocks (only the error interrupts), `neutro` and `fecha` a flat line with its icon.
 */
export function LineaDeEstado({
  tipo,
  titulo,
  rotulo,
  tituloEnTinta = false,
  detalle,
  accion,
  anunciada = false,
  className,
}: PropiedadesDeLinea) {
  // Each in its own span, so the label and the title stay two texts for whoever reads them apart.
  const encabezado = rotulo ? (
    <>
      <span>{rotulo}</span> <span>{titulo}</span>
    </>
  ) : (
    titulo
  )
  if (tipo === "error") {
    return (
      <Bloque
        tipo="error"
        titulo={encabezado}
        tituloEnTinta={tituloEnTinta}
        anunciada={anunciada}
        accion={accion}
        className={className}
      >
        {detalle}
      </Bloque>
    )
  }
  if (tipo === "aviso") {
    // A warning that is only a message reads in the block's body; one with a detail takes the title's weight.
    return detalle === undefined && rotulo === undefined ? (
      <Bloque tipo="aviso" accion={accion} className={className}>
        {titulo}
      </Bloque>
    ) : (
      <Bloque tipo="aviso" titulo={encabezado} accion={accion} className={className}>
        {detalle}
      </Bloque>
    )
  }
  if (tipo === "exito") {
    return (
      <output className={cn("grid justify-items-start gap-1", className)}>
        <PildoraDeEstado tipo="ok">{encabezado}</PildoraDeEstado>
        {detalle ? <span className="text-meta text-tinta">{detalle}</span> : null}
        {accion}
      </output>
    )
  }
  const Icono = tipo === "fecha" ? CalendarBlank : Info
  const clases = cn("flex items-start gap-2.5 text-meta text-tinta", className)
  const contenido = (
    <>
      <Icono aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
      <span className="grid gap-1">
        <span>{encabezado}</span>
        {detalle ? <span>{detalle}</span> : null}
        {accion}
      </span>
    </>
  )
  // A date the screen states is not news: no live region at all.
  if (tipo === "fecha") return <div className={clases}>{contenido}</div>
  return <output className={clases}>{contenido}</output>
}
