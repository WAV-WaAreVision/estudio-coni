import { CalendarCheck, FileText, Tag, Users } from "@phosphor-icons/react/dist/ssr"
import { ICONO } from "@/components/ui/icono"
import { MenuDeSecciones } from "@/components/ui/menu-de-secciones"
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

const ETIQUETA = "Secciones de la Biblioteca"

/**
 * Tabs from md up; below it the sections do not fit one row (and a fifth one is coming), so the phone gets a section
 * menu. Both are drawn and CSS hides one, so only one is ever in the accessibility tree.
 */
export function NavDeBiblioteca({ actual }: { actual: Seccion }) {
  const opciones = SECCIONES.map(({ Icono, ...seccion }) => ({
    ...seccion,
    icono: <Icono aria-hidden="true" size={ICONO.medio} />,
  }))
  return (
    <>
      <MenuDeSecciones
        etiqueta={ETIQUETA}
        nombreDelBoton="Sección de la Biblioteca"
        actual={actual}
        opciones={opciones}
        className="md:hidden"
      />
      <Pestanas etiqueta={ETIQUETA} actual={actual} compacta opciones={opciones} className="hidden md:block" />
    </>
  )
}
