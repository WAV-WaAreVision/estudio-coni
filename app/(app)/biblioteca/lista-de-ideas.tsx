import type { ReactNode } from "react"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { lineasDeIdeaParaWav } from "@/lib/dominio/biblioteca/detalle"
import { type IdeaLeida, idDeIdea } from "@/lib/dominio/biblioteca/ideas"

interface Propiedades {
  etiqueta: string
  ideas: readonly IdeaLeida[]
  /** Ocultar on a topic, Mostrar among an author's hidden ones. */
  accion?: (idea: IdeaLeida) => ReactNode
}

/** Ideas in her words (4h, D8): the text she reads, its action, and WAV's detail folded under each. */
export function ListaDeIdeas({ etiqueta, ideas, accion }: Propiedades) {
  return (
    <ul aria-label={etiqueta} className="grid gap-3">
      {ideas.map((idea) => (
        <li key={idea.id} className="grid gap-2 rounded-panel bg-piedra-alta p-4">
          <p id={idDeIdea(idea.id)} className="text-cuerpo">{`«${idea.texto}»`}</p>
          {accion ? accion(idea) : null}
          <DetalleParaWav lineas={lineasDeIdeaParaWav(idea)} proveedor={null} />
        </li>
      ))}
    </ul>
  )
}
