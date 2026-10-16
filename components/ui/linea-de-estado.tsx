import { CalendarBlank, CheckCircle, Info, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { ICONO } from "@/components/ui/icono"
import { cn } from "@/lib/utils"

export type TipoDeEstado = "exito" | "aviso" | "error" | "neutro" | "fecha"

const TINTA: Record<TipoDeEstado, string> = {
  exito: "text-exito",
  aviso: "text-aviso",
  error: "text-error",
  neutro: "text-tinta",
  fecha: "text-tinta",
}
const ICONO_POR_TONO = {
  exito: CheckCircle,
  aviso: Warning,
  error: WarningCircle,
  neutro: Info,
  fecha: CalendarBlank,
} as const

interface PropiedadesDeLinea {
  tipo: TipoDeEstado
  titulo: ReactNode
  /** «Para confirmar:», «Hay que corregirlo:»: the only coloured part when the title is a message. */
  rotulo?: string
  /** The title is a name or a long message: ink, and only the rotulo carries the colour. */
  tituloEnTinta?: boolean
  detalle?: ReactNode
  accion?: ReactNode
  /** The error was already announced by another alert of the screen: this one is read, not announced again. */
  anunciada?: boolean
  className?: string
}

/** Brandkit 9.6: icon in the state's ink, text at x = 56, no box. */
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
  const Icono = ICONO_POR_TONO[tipo]
  const contenido = (
    <>
      <Icono aria-hidden="true" size={ICONO.medio} className={cn("mt-0.5 justify-self-center", TINTA[tipo])} />
      <p className="text-cuerpo">
        {rotulo ? <span className={cn("font-semibold", TINTA[tipo])}>{rotulo} </span> : null}
        <span className={tituloEnTinta || rotulo ? "text-tinta" : TINTA[tipo]}>{titulo}</span>
      </p>
      {detalle ? <p className="col-start-2 text-meta text-tinta">{detalle}</p> : null}
      {accion ? <div className="col-start-2">{accion}</div> : null}
    </>
  )
  const clases = cn("grid grid-cols-[24px_1fr] gap-x-3 gap-y-1", className)
  // <output> has the implicit role status: it waits politely; only errors interrupt. A date the screen states is
  // not news, so it is no live region at all.
  if (tipo === "error" && anunciada) return <div className={clases}>{contenido}</div>
  if (tipo === "error")
    return (
      <div role="alert" className={clases}>
        {contenido}
      </div>
    )
  if (tipo === "fecha") return <div className={clases}>{contenido}</div>
  return <output className={clases}>{contenido}</output>
}
