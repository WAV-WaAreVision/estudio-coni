"use client"

import { Check } from "@phosphor-icons/react"
import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "./ui/clases-de-chip"
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
        FORMA_DE_CHIP,
        TRANSICION_DE_CHIP,
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
