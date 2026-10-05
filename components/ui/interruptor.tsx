"use client"

import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface PropiedadesDeInterruptor extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role" | "type"> {
  encendido: boolean
}

/** Brandkit 9.10: 52 x 32 switch. Off is outlined (3:1), on is ink; the state is never only a colour. */
export function Interruptor({ encendido, className, ...resto }: PropiedadesDeInterruptor) {
  return (
    <button
      {...resto}
      type="button"
      role="switch"
      aria-checked={encendido}
      className={cn(
        "flex h-8 w-13 shrink-0 items-center rounded-full px-1",
        encendido ? "bg-tinta" : "bg-pista ring-[1.5px] ring-campo ring-inset",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-6 rounded-full transition-transform duration-[var(--dur-corta)] ease-salida motion-reduce:transition-none",
          encendido ? "translate-x-5 bg-sobre-tinta" : "bg-campo",
        )}
      />
    </button>
  )
}
