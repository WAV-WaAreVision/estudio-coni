"use client"

import { ChartBar, GearSix, House } from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ICONO } from "@/components/ui/icono"
import { cn } from "@/lib/utils"

const PESTANAS = [
  { href: "/", etiqueta: "Inicio", icono: House },
  { href: "/metricas", etiqueta: "Métricas", icono: ChartBar },
  { href: "/ajustes", etiqueta: "Ajustes", icono: GearSix },
] as const

// Ideas and Calendario hang from Inicio: they have no tab of their own, so Inicio stays current on them.
const RUTAS_QUE_CUELGAN_DE_INICIO = ["/ideas", "/calendario"]

function estaActiva(ruta: string, pestana: (typeof PESTANAS)[number]): boolean {
  if (pestana.href === "/") {
    return ruta === "/" || RUTAS_QUE_CUELGAN_DE_INICIO.some((raiz) => ruta === raiz || ruta.startsWith(`${raiz}/`))
  }
  return ruta === pestana.href || ruta.startsWith(`${pestana.href}/`)
}

// On the screens that approve something, the approve bar takes the bottom of the screen (DESIGN.md).
const RUTAS_DE_DETALLE = ["/guion/", "/video/"]

export function NavInferior() {
  const ruta = usePathname()
  if (RUTAS_DE_DETALLE.some((prefijo) => ruta.startsWith(prefijo))) return null

  return (
    <nav
      aria-label="Secciones"
      className="sticky bottom-0 z-10 grid grid-cols-3 border-t border-linea bg-fondo pb-[env(safe-area-inset-bottom)] md:top-0 md:bottom-auto md:border-t-0 md:border-b"
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
              "relative grid min-h-14 content-center justify-items-center gap-0.5 text-meta",
              activa
                ? "font-semibold text-tinta before:absolute before:top-0 before:h-0.5 before:w-6 before:bg-tinta"
                : "font-medium text-apagado",
            )}
          >
            <Icono aria-hidden="true" size={ICONO.grande} />
            {pestana.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
