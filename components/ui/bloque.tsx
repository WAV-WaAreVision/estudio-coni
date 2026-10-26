import { CheckCircle, Info, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ICONO } from "./icono"

export type TipoDeBloque = "aviso" | "error" | "neutro" | "ok"

const ICONOS = { aviso: Warning, error: WarningCircle, neutro: Info, ok: CheckCircle } as const

interface PropiedadesDeBloque {
  tipo: TipoDeBloque
  titulo?: ReactNode
  /** The detail, in ink. */
  children?: ReactNode
  /** A failure with an action: 24 px corners, 18 px padding, the title at body size, the piece title and one action. */
  grande?: boolean
  pieza?: string
  accion?: ReactNode
  /** The error was already announced by another alert of the screen: it is read, not announced again. */
  anunciada?: boolean
  /** An error title that is a message rather than a cause stays in ink. */
  tituloEnTinta?: boolean
  id?: string
  className?: string
}

/** Decision 4: a flat honda block with its icon, never a shadow. Brick red only for an error title, after the icon. */
export function Bloque({
  tipo,
  titulo,
  children,
  grande = false,
  pieza,
  accion,
  anunciada = false,
  tituloEnTinta = false,
  id,
  className,
}: PropiedadesDeBloque) {
  const Icono = ICONOS[tipo]
  const enRojo = tipo === "error" && !tituloEnTinta
  const clases = cn(
    "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 bg-piedra-honda text-tinta",
    grande ? "rounded-panel p-[18px] text-cuerpo" : "rounded-bloque px-[14px] py-3 text-meta",
    className,
  )
  const contenido = (
    <>
      <Icono
        aria-hidden="true"
        size={grande ? ICONO.medio : ICONO.chico}
        className={cn("mt-0.5", enRojo ? "text-error" : "text-tinta")}
      />
      <div className="grid gap-1">
        {titulo ? <p className={cn("font-semibold", enRojo ? "text-error" : "text-tinta")}>{titulo}</p> : null}
        {pieza ? <p className="font-semibold">{pieza}</p> : null}
        {children ? <div className={grande ? "text-meta" : undefined}>{children}</div> : null}
        {accion ? <div className="mt-2">{accion}</div> : null}
      </div>
    </>
  )
  // <output> is the polite status; only an error interrupts, once.
  if (tipo === "error" && !anunciada)
    return (
      <div role="alert" id={id} data-contorno className={clases}>
        {contenido}
      </div>
    )
  if (tipo === "error")
    return (
      <div id={id} data-contorno className={clases}>
        {contenido}
      </div>
    )
  return (
    <output id={id} data-contorno className={clases}>
      {contenido}
    </output>
  )
}
