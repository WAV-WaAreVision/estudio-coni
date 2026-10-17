"use client"

import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react"
import { cn } from "@/lib/utils"
import { clasesDeBoton, type OpcionesDeBoton } from "./clases-de-boton"
import { PuntoTrabajando } from "./punto-trabajando"

interface PropiedadesDeBoton extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled">, OpcionesDeBoton {
  /** Looks and reads as disabled but stays focusable, so a screen reader can find it and read why. */
  deshabilitado?: boolean
  cargando?: boolean
  /** The icon that says what happens next, on the right of the label. Replaced by the working dot while loading. */
  icono?: ReactNode
  /** What the action costs, on the right in place of the icon (v6 `.btn .precio`). */
  precio?: string
  ref?: Ref<HTMLButtonElement>
}

export function Boton({
  variante,
  tamano,
  deshabilitado = false,
  cargando = false,
  icono,
  precio,
  children,
  className,
  onClick,
  type = "button",
  ref,
  ...resto
}: PropiedadesDeBoton) {
  const inactivo = deshabilitado || cargando
  const sobreTinta = (variante ?? "primario") === "primario" && !inactivo

  function alTocar(evento: MouseEvent<HTMLButtonElement>) {
    if (inactivo) {
      evento.preventDefault()
      return
    }
    onClick?.(evento)
  }

  const derecha = cargando ? (
    <PuntoTrabajando />
  ) : precio ? (
    <span className={cn("text-meta font-medium tabular-nums", sobreTinta ? "text-luz" : "text-apagado")}>{precio}</span>
  ) : (
    icono
  )

  return (
    <button
      {...resto}
      ref={ref}
      type={type}
      aria-disabled={inactivo || undefined}
      aria-busy={cargando || undefined}
      onClick={alTocar}
      className={cn(clasesDeBoton({ variante, tamano }), className)}
    >
      <span className="inline-flex items-center gap-2">{children}</span>
      {/* A space, so a price joins the accessible name as "Preparar mi voz US$ 0,33"; a flex row does not draw it. */}{" "}
      {derecha}
    </button>
  )
}
