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

// On the screens that sign something, the sign bar takes the bottom of the screen.
const RUTAS_DE_DETALLE = ["/guion/", "/video/"]

/** Decision 4: a raised bar on piedra; the current tab is a sunken honda pill, "where you are", not an action. */
export function NavInferior() {
  const ruta = usePathname()
  if (RUTAS_DE_DETALLE.some((prefijo) => ruta.startsWith(prefijo))) return null

  return (
    <nav
      aria-label="Secciones"
      className="nav-inferior sticky bottom-0 z-10 grid grid-cols-3 gap-2 rounded-t-panel bg-piedra px-[14px] pt-2 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-relieve-fijo md:top-0 md:bottom-auto md:rounded-t-none md:rounded-b-panel md:pb-2"
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
              "grid min-h-nav content-center justify-items-center gap-0.5 rounded-control py-2 text-meta transition-shadow duration-[var(--dur-corta)] ease-salida",
              activa ? "bg-piedra-honda font-semibold text-tinta shadow-hundido" : "font-medium text-apagado",
            )}
          >
            <Icono aria-hidden="true" size={ICONO.grande} />
            <span className="nav-etiqueta">{pestana.etiqueta}</span>
          </Link>
        )
      })}
    </nav>
  )
}
