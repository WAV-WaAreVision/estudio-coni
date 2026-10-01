"use client"

import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface PropiedadesDeChip extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  presionado: boolean
}

/** A toggle that reads as a filter: pressed is the current state, so it takes the action colour (DESIGN.md). */
export function Chip({ presionado, className, type = "button", ...resto }: PropiedadesDeChip) {
  return (
    <button
      {...resto}
      type={type}
      aria-pressed={presionado}
      className={cn(
        "min-h-11 rounded-full border border-linea bg-superficie px-3.5 text-label font-semibold text-tinta",
        "transition-[transform,background-color,color,border-color] duration-150 ease-fuerte active:scale-[0.97]",
        "aria-pressed:border-acento aria-pressed:bg-acento-suave aria-pressed:text-acento",
        "motion-reduce:transition-colors motion-reduce:active:scale-100",
        className,
      )}
    />
  )
}
