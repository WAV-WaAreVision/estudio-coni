import Link from "next/link"
import { cn } from "@/lib/utils"

export const VISTAS = [
  { clave: "mes", etiqueta: "Mes" },
  { clave: "agenda", etiqueta: "Agenda" },
  { clave: "ritmo", etiqueta: "Ritmo" },
] as const
export type Vista = (typeof VISTAS)[number]["clave"]

export function esVista(valor: string | undefined): valor is Vista {
  return VISTAS.some((vista) => vista.clave === valor)
}

/** The segmented control (DESIGN.md): three links, so each view has an address and works without a script. */
export function VistasDelCalendario({ activa }: { activa: Vista }) {
  return (
    <nav aria-label="Vista del calendario">
      <ul className="grid min-h-13 grid-cols-3 gap-1 rounded-sm bg-hundido p-1">
        {VISTAS.map((vista) => (
          <li key={vista.clave} className="grid">
            <Link
              href={`/calendario?vista=${vista.clave}`}
              replace
              aria-current={activa === vista.clave ? "page" : undefined}
              className={cn(
                "grid min-h-11 place-items-center rounded-sm text-label font-semibold",
                "transition-[background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                activa === vista.clave ? "bg-superficie text-tinta shadow-sm" : "text-apagado",
              )}
            >
              {vista.etiqueta}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
