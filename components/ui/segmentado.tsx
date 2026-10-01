"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

interface OpcionSegmentada<T extends string> {
  valor: T
  etiqueta: string
}

interface PropiedadesDeSegmentado<T extends string> {
  nombre: string
  opciones: readonly OpcionSegmentada<T>[]
  valor: T
  alCambiar: (valor: T) => void
  className?: string
}

/** The segmented control (docs/DESIGN.md): real radio buttons, so the keyboard and the screen reader work for free. */
export function Segmentado<T extends string>({
  nombre,
  opciones,
  valor,
  alCambiar,
  className,
}: PropiedadesDeSegmentado<T>) {
  const grupo = useId()
  return (
    <fieldset className={cn("grid min-w-0 auto-cols-fr grid-flow-col gap-1 rounded-sm bg-hundido p-1", className)}>
      <legend className="sr-only">{nombre}</legend>
      {opciones.map((opcion) => (
        <label key={opcion.valor} className="relative">
          <input
            type="radio"
            name={grupo}
            className="peer sr-only"
            checked={opcion.valor === valor}
            onChange={() => alCambiar(opcion.valor)}
          />
          <span
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-[9px] px-1.5 text-center text-label font-semibold text-apagado",
              "transition-[background-color,color,box-shadow] duration-150 ease-fuerte",
              "peer-checked:bg-superficie peer-checked:text-tinta peer-checked:shadow-[0_1px_3px_rgb(43_24_48/0.15)]",
              "peer-focus-visible:outline-3 peer-focus-visible:outline-acento",
            )}
          >
            {opcion.etiqueta}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
