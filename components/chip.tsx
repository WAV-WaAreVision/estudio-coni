"use client"

import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface PropiedadesDeChip extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  presionado: boolean
}

/** Brandkit 9.10: a 44 px toggle that reads as a filter. Pressed is the current state: it fills with ink. */
export function Chip({ presionado, className, type = "button", ...resto }: PropiedadesDeChip) {
  return (
    <button
      {...resto}
      type={type}
      aria-pressed={presionado}
      className={cn(
        "min-h-11 rounded-12 border border-campo bg-superficie px-3.5 text-meta font-medium text-tinta",
        "transition-[transform,background-color,color,border-color] duration-[var(--dur-corta)] ease-salida active:scale-[0.98]",
        "aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-sobre-tinta",
        "motion-reduce:transition-colors motion-reduce:active:scale-100",
        className,
      )}
    />
  )
}
