"use client"

import type { VariantProps } from "class-variance-authority"
import type { ButtonHTMLAttributes, MouseEvent } from "react"
import { cn } from "@/lib/utils"
import { clasesDeBoton } from "./clases-de-boton"

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
