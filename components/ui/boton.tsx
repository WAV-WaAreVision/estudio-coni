"use client"

import { cva, type VariantProps } from "class-variance-authority"
import type { ButtonHTMLAttributes, MouseEvent } from "react"
import { cn } from "@/lib/utils"

/** Also used for links that look like buttons, so the two never drift apart. */
export const clasesDeBoton = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-md text-center text-label font-semibold",
    "transition-[transform,background-color,opacity] duration-150 ease-fuerte",
    "active:scale-[0.97] aria-disabled:active:scale-100 motion-reduce:transition-[background-color,opacity] motion-reduce:active:scale-100",
  ],
  {
    variants: {
      variante: {
        primario:
          "bg-acento text-sobre-acento hover:bg-acento-profundo aria-disabled:cursor-not-allowed aria-disabled:bg-hundido aria-disabled:text-apagado",
        linea:
          "border border-linea bg-superficie text-tinta aria-disabled:cursor-not-allowed aria-disabled:text-apagado",
        callado: "bg-transparent text-acento aria-disabled:cursor-not-allowed aria-disabled:text-apagado",
      },
      tamano: {
        grande: "min-h-13 w-full px-4.5 py-3.5 text-[1.0625rem]",
        chico: "min-h-11 px-3.5 py-2.5",
      },
    },
    defaultVariants: { variante: "primario", tamano: "grande" },
  },
)

interface PropiedadesDeBoton
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled">,
    VariantProps<typeof clasesDeBoton> {
  /** Looks and reads as disabled but stays focusable, so a screen reader can find it and read why. */
  deshabilitado?: boolean
  cargando?: boolean
}

export function Boton({
  variante,
  tamano,
  deshabilitado = false,
  cargando = false,
  className,
  onClick,
  type = "button",
  ...resto
}: PropiedadesDeBoton) {
  const inactivo = deshabilitado || cargando

  function alTocar(evento: MouseEvent<HTMLButtonElement>) {
    if (inactivo) {
      evento.preventDefault()
      return
    }
    onClick?.(evento)
  }

  return (
    <button
      {...resto}
      type={type}
      aria-disabled={inactivo || undefined}
      aria-busy={cargando || undefined}
      onClick={alTocar}
      className={cn(clasesDeBoton({ variante, tamano }), className)}
    />
  )
}
