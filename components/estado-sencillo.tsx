import type { ReactNode } from "react"
import { etiquetaDePilar, type PilarVisible } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { COLUMNAS_DE_PUERTA } from "./puerta-en-columnas"
import { Volver } from "./ui/volver"

/**
 * The screen of a piece that has nothing to sign. On a phone, one column: the way back, its title, what is happening
 * (`children`), then the side actions (`lateral`: Descartar, change the date, the voice). From the gates' two-column
 * breakpoint (issue 103), what is happening takes the reading column and the piece becomes a card in the side column,
 * the side actions under it.
 */
export function EstadoSencillo({
  titulo,
  pilar,
  segundos,
  lateral,
  children,
}: {
  titulo: string
  pilar?: PilarVisible | null
  segundos?: number
  lateral?: ReactNode
  children: ReactNode
}) {
  return (
    <div data-ancho="puerta" className="@container">
      {/* The last row takes the main column's extra height, so the card and the side actions stay together. */}
      <div className={cn("grid gap-3", COLUMNAS_DE_PUERTA, "dos-columnas:grid-rows-[auto_auto_1fr]")}>
        <div className="dos-columnas:col-span-full">
          <Volver href="/">Inicio</Volver>
        </div>
        <header
          data-testid="estado-pieza"
          className="grid gap-3 dos-columnas:col-start-2 dos-columnas:row-start-2 dos-columnas:mt-8 dos-columnas:self-start dos-columnas:rounded-panel dos-columnas:bg-piedra-alta dos-columnas:p-5"
        >
          {pilar || segundos ? (
            <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado dos-columnas:mt-0">
              <span>{pilar ? etiquetaDePilar(pilar) : null}</span>
              <span>{segundos ? `${segundos} s` : null}</span>
            </p>
          ) : null}
          <h1 className="text-pieza text-balance">{titulo}</h1>
        </header>
        <div
          data-testid="estado-principal"
          className="mt-6 grid gap-6 dos-columnas:col-start-1 dos-columnas:row-span-2 dos-columnas:row-start-2 dos-columnas:mt-8 dos-columnas:self-start"
        >
          {children}
        </div>
        {lateral ? (
          // On a phone gap-3 plus mt-3 keeps the 24 px the state's own children have between them.
          <div
            data-testid="estado-lateral"
            className="mt-3 grid gap-6 dos-columnas:col-start-2 dos-columnas:row-start-3 dos-columnas:self-start"
          >
            {lateral}
          </div>
        ) : null}
      </div>
    </div>
  )
}
