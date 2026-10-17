"use client"

import { Check } from "@phosphor-icons/react"
import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { ICONO } from "./ui/icono"

interface PropiedadesDeChip extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  presionado: boolean
  /** The check of a pressed chip; off where seven day chips share one row. */
  conCheck?: boolean
}

/** Decision 4: a raised 2.75rem pill that reads as a filter; pressed fills with ink and shows a check. */
export function Chip({
  presionado,
  conCheck = true,
  className,
  type = "button",
  children,
  ...resto
}: PropiedadesDeChip) {
  return (
    <button
      {...resto}
      type={type}
      aria-pressed={presionado}
      className={cn(
        "inline-flex min-h-objetivo shrink-0 items-center justify-center gap-2 rounded-control bg-piedra px-4 text-meta font-semibold text-tinta shadow-relieve",
        "transition-[box-shadow,background-color,color] duration-[var(--dur-corta)] ease-salida active:shadow-hundido",
        "aria-pressed:bg-tinta aria-pressed:text-luz",
        "aria-disabled:bg-piedra-honda aria-disabled:text-apagado aria-disabled:shadow-none",
        className,
      )}
    >
      {presionado && conCheck ? <Check aria-hidden="true" weight="bold" size={ICONO.chico} /> : null}
      {children}
    </button>
  )
}
