import { FileText } from "@phosphor-icons/react/dist/ssr"
import { ICONO } from "@/components/ui/icono"
import { Pestanas } from "@/components/ui/pestanas"

// Only the sections already in Conidolly (batch 1: Materiales). Autores, Temas and Semana are added by their batches.
const SECCIONES = [{ valor: "materiales", etiqueta: "Materiales", href: "/biblioteca" }] as const

type Seccion = (typeof SECCIONES)[number]["valor"]

export function NavDeBiblioteca({ actual }: { actual: Seccion }) {
  return (
    <Pestanas
      etiqueta="Secciones de la Biblioteca"
      actual={actual}
      compacta
      opciones={SECCIONES.map((seccion) => ({
        ...seccion,
        icono: <FileText aria-hidden="true" size={ICONO.medio} />,
      }))}
    />
  )
}
