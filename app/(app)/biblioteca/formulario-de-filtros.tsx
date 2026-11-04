"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { hrefDeLista, leerFiltros, RUTA_DE_MATERIALES } from "@/lib/dominio/biblioteca/filtros"
import { hrefDeTemas, leerFiltrosDeTemas, RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"

type Params = Record<string, string>

// A server component cannot pass a function to this client form, so each section is named instead.
const SECCIONES = {
  materiales: { ruta: RUTA_DE_MATERIALES, href: (params: Params) => hrefDeLista(leerFiltros(params)) },
  temas: { ruta: RUTA_DE_TEMAS, href: (params: Params) => hrefDeTemas(leerFiltrosDeTemas(params)) },
} as const

interface Propiedades {
  className?: string
  /** Whose filters these are: Materiales unless said. */
  seccion?: keyof typeof SECCIONES
  children: ReactNode
}

/**
 * A GET form that works without scripts; with them, it goes to the section's own address, so an empty select
 * ("Todos") stays out of the URL and the order of the params is the one every link uses.
 */
export function FormularioDeFiltros({ className, seccion = "materiales", children }: Propiedades) {
  const router = useRouter()
  const { ruta, href } = SECCIONES[seccion]
  return (
    <form
      method="get"
      action={ruta}
      className={className}
      onSubmit={(evento) => {
        evento.preventDefault()
        const params: Params = {}
        for (const [clave, valor] of new FormData(evento.currentTarget)) {
          if (typeof valor === "string") params[clave] = valor
        }
        router.push(href(params), { scroll: false })
      }}
    >
      {children}
    </form>
  )
}
