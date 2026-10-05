import { Pestanas } from "@/components/ui/pestanas"

export const VISTAS = [
  { clave: "mes", etiqueta: "Mes" },
  { clave: "agenda", etiqueta: "Agenda" },
  { clave: "ritmo", etiqueta: "Ritmo" },
] as const
export type Vista = (typeof VISTAS)[number]["clave"]

export function esVista(valor: string | undefined): valor is Vista {
  return VISTAS.some((vista) => vista.clave === valor)
}

/** The three views of the calendar as underlined tabs: links, so each has an address. */
export function VistasDelCalendario({ activa }: { activa: Vista }) {
  return (
    <Pestanas
      etiqueta="Vista del calendario"
      actual={activa}
      opciones={VISTAS.map((vista) => ({
        valor: vista.clave,
        etiqueta: vista.etiqueta,
        href: `/calendario?vista=${vista.clave}`,
      }))}
    />
  )
}
