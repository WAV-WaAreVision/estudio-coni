"use client"

import { CaretRight } from "@phosphor-icons/react"
import { type ReactNode, type Ref, useState } from "react"
import { cn } from "@/lib/utils"
import { clasesDeBoton } from "./clases-de-boton"
import { ICONO } from "./icono"

type Forma = "panel" | "fila" | "boton" | "linea"

interface PropiedadesDeMasOpciones {
  titulo: string
  /** One meta line under the title ("Avatar: Estudio"). */
  resumen?: ReactNode
  /** Open when it first renders: it holds something missing (decision 9). */
  abiertaAlInicio?: boolean
  forma?: Forma
  /** The boton form's icon, on the right of the label. */
  icono?: ReactNode
  className?: string
  ref?: Ref<HTMLDetailsElement>
  children: ReactNode
}

const SUMARIO = "cursor-pointer list-none [&::-webkit-details-marker]:hidden"

/**
 * Decision 4: a native disclosure. Its content stays mounted while folded, so a draft survives closing it. The open
 * state follows the element (`onToggle`), so React never fights a tap or a screen that opens it through the ref.
 */
export function MasOpciones({
  titulo,
  resumen,
  abiertaAlInicio = false,
  forma = "panel",
  icono,
  className,
  ref,
  children,
}: PropiedadesDeMasOpciones) {
  const [abierta, setAbierta] = useState(abiertaAlInicio)
  return (
    <details
      ref={ref}
      open={abierta}
      onToggle={(evento) => setAbierta(evento.currentTarget.open)}
      className={cn(
        "group",
        forma === "panel" && "rounded-panel bg-piedra px-[18px] shadow-relieve",
        forma === "linea" && "border-t border-hilo",
        className,
      )}
    >
      {forma === "boton" ? (
        <summary
          className={cn(
            SUMARIO,
            clasesDeBoton({ variante: "secundario", tamano: "chico" }),
            "w-full justify-between group-open:shadow-hundido",
          )}
        >
          {titulo}
          {icono}
        </summary>
      ) : (
        <summary
          className={cn(
            SUMARIO,
            "flex items-center gap-3",
            forma === "linea" ? "min-h-objetivo text-meta" : "min-h-fila-baja py-3 text-cuerpo",
            forma === "panel" && "rounded-panel active:shadow-hundido",
          )}
        >
          <span className="grid min-w-0 flex-1">
            <span className="font-semibold text-tinta">{titulo}</span>
            {resumen ? <span className="text-meta font-medium text-apagado">{resumen}</span> : null}
          </span>
          <CaretRight
            aria-hidden="true"
            size={ICONO.medio}
            className="shrink-0 text-apagado transition-transform duration-[var(--dur-media)] ease-salida group-open:rotate-90"
          />
        </summary>
      )}
      <div className={cn("grid gap-3", forma === "panel" ? "border-t border-hilo pt-[14px] pb-[18px]" : "pt-3 pb-1")}>
        {children}
      </div>
    </details>
  )
}
