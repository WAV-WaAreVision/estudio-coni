import { SUPERFICIE_DE_PANEL } from "@/components/pagina-en-columnas"
import { Seccion } from "@/components/seccion"
import { cn } from "@/lib/utils"

const LINEAS = {
  pilar: [
    "Guardar no cambia tus pilares: el borrador espera en Borradores.",
    "Al aprobarlo revisas los pesos de la red, y ahí entra a Temas.",
  ],
  red: [
    "Guardar no conecta la red: el borrador espera en Borradores.",
    "Mientras espera conexión, puedes editarlo o descartarlo.",
  ],
} as const

/**
 * What saving a draft does, in the 20rem panel beside its form on a computer (issue 103). The phone shows the form
 * alone, as it always did: the panel is not drawn there.
 */
export function PanelAlGuardar({ tipo }: { tipo: keyof typeof LINEAS }) {
  return (
    <div data-testid="pagina-panel" className={cn("hidden md:block", SUPERFICIE_DE_PANEL)}>
      <Seccion titulo="Al guardar" id="al-guardar" espacio="ninguno">
        <ul className="grid gap-2">
          {LINEAS[tipo].map((linea) => (
            <li key={linea} className="text-meta text-tinta">
              {linea}
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  )
}
