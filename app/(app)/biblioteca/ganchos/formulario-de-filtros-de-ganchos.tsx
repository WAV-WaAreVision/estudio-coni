"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { filtrosDeParametros, hrefDeGanchos, RUTA_DE_GANCHOS } from "@/lib/dominio/biblioteca/filtros-de-ganchos"

/**
 * The hooks' «Más filtros»: a GET form that works without scripts; with them, it goes to the canonical address, so an
 * empty select ("Todos") stays out of the URL. The server checks the values against the lists when it reads them.
 */
export function FormularioDeFiltrosDeGanchos({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <form
      method="get"
      action={RUTA_DE_GANCHOS}
      className={className}
      onSubmit={(evento) => {
        evento.preventDefault()
        const params: Record<string, string> = {}
        for (const [clave, valor] of new FormData(evento.currentTarget)) {
          if (typeof valor === "string") params[clave] = valor
        }
        router.push(hrefDeGanchos(filtrosDeParametros(params)), { scroll: false })
      }}
    >
      {children}
    </form>
  )
}
