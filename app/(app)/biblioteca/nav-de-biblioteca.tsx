import { CalendarCheck, FileText, Tag, Users } from "@phosphor-icons/react/dist/ssr"
import { ICONO } from "@/components/ui/icono"
import { Pestanas } from "@/components/ui/pestanas"
import { RUTA_DE_AUTORES } from "@/lib/dominio/biblioteca/autores"
import { RUTA_DE_MATERIALES } from "@/lib/dominio/biblioteca/filtros"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { RUTA_DE_SEMANA } from "@/lib/dominio/biblioteca/semana"

// The Biblioteca's sections in Conidolly (batches 3 and 5). The tab switch from Ingesta is batch 7.
const SECCIONES = [
  { valor: "materiales", etiqueta: "Materiales", href: RUTA_DE_MATERIALES, Icono: FileText },
  { valor: "autores", etiqueta: "Autores", href: RUTA_DE_AUTORES, Icono: Users },
  { valor: "temas", etiqueta: "Temas", href: RUTA_DE_TEMAS, Icono: Tag },
  { valor: "semana", etiqueta: "Semana", href: RUTA_DE_SEMANA, Icono: CalendarCheck },
] as const

type Seccion = (typeof SECCIONES)[number]["valor"]

export function NavDeBiblioteca({ actual }: { actual: Seccion }) {
  return (
    <Pestanas
      etiqueta="Secciones de la Biblioteca"
      actual={actual}
      compacta
      opciones={SECCIONES.map(({ Icono, ...seccion }) => ({
        ...seccion,
        icono: <Icono aria-hidden="true" size={ICONO.medio} />,
      }))}
    />
  )
}
