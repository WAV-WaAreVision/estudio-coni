"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { hrefDeLista, leerFiltros, RUTA_DE_MATERIALES } from "@/lib/dominio/biblioteca/filtros"

type Params = Record<string, string>

/**
 * Materiales' «Más filtros»: a GET form that works without scripts; with them, it goes to Materiales' own address, so
 * an empty select ("Todos") stays out of the URL and the order of the params is the one every link uses. Temas filters
 * with links only (spec 2026-11-04, part 15b).
 */
export function FormularioDeFiltros({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <form
      method="get"
      action={RUTA_DE_MATERIALES}
      className={className}
      onSubmit={(evento) => {
        evento.preventDefault()
        const params: Params = {}
        for (const [clave, valor] of new FormData(evento.currentTarget)) {
          if (typeof valor === "string") params[clave] = valor
        }
        router.push(hrefDeLista(leerFiltros(params)), { scroll: false })
      }}
    >
      {children}
    </form>
  )
}
