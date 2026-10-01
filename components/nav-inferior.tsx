"use client"

import { ChartColumn, House, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const PESTANAS = [
  { href: "/", etiqueta: "Inicio", icono: House, rutasHijas: ["/guion", "/video"] },
  { href: "/metricas", etiqueta: "Métricas", icono: ChartColumn, rutasHijas: [] },
  { href: "/ajustes", etiqueta: "Ajustes", icono: Settings, rutasHijas: [] },
] as const

function estaActiva(ruta: string, pestana: (typeof PESTANAS)[number]): boolean {
  if (pestana.href === "/") {
    return ruta === "/" || pestana.rutasHijas.some((hija) => ruta === hija || ruta.startsWith(`${hija}/`))
  }
  return ruta === pestana.href || ruta.startsWith(`${pestana.href}/`)
}

export function NavInferior() {
  const ruta = usePathname()

  return (
    <nav
      aria-label="Secciones"
      className="sticky bottom-0 z-10 grid grid-cols-3 border-t border-linea bg-superficie px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:top-0 md:bottom-auto md:border-t-0 md:border-b"
    >
      {PESTANAS.map((pestana) => {
        const activa = estaActiva(ruta, pestana)
        const Icono = pestana.icono
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "grid min-h-12 justify-items-center gap-0.5 rounded-sm py-1.5 text-meta font-medium",
              "transition-colors duration-150 ease-out",
              activa ? "font-semibold text-acento" : "text-apagado",
            )}
          >
            <Icono aria-hidden="true" size={22} strokeWidth={1.8} />
            {pestana.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
