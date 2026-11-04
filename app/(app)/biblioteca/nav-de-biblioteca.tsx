import { FileText, Tag, Users } from "@phosphor-icons/react/dist/ssr"
import { ICONO } from "@/components/ui/icono"
import { Pestanas } from "@/components/ui/pestanas"
import { RUTA_DE_AUTORES } from "@/lib/dominio/biblioteca/autores"
import { RUTA_DE_MATERIALES } from "@/lib/dominio/biblioteca/filtros"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"

// The sections already in Conidolly (batch 3: Materiales, Autores, Temas). Semana is added by its batch.
const SECCIONES = [
  { valor: "materiales", etiqueta: "Materiales", href: RUTA_DE_MATERIALES, Icono: FileText },
  { valor: "autores", etiqueta: "Autores", href: RUTA_DE_AUTORES, Icono: Users },
  { valor: "temas", etiqueta: "Temas", href: RUTA_DE_TEMAS, Icono: Tag },
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
