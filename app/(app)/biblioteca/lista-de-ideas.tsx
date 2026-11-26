import type { ReactNode } from "react"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { lineasDeIdeaParaWav } from "@/lib/dominio/biblioteca/detalle"
import type { Insignias } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { type IdeaLeida, idDeIdea } from "@/lib/dominio/biblioteca/ideas"
import { cn } from "@/lib/utils"
import { InsigniasDeIdea } from "./insignias-de-idea"

interface Propiedades {
  etiqueta: string
  ideas: readonly IdeaLeida[]
  /** Ocultar on a topic, Mostrar among an author's hidden ones. */
  accion?: (idea: IdeaLeida) => ReactNode
  /** Placement from the page around it: two columns on a computer. */
  className?: string
  /** Change 6c-1: each idea's badges, linking to its page; an idea without an entry (a hidden one) shows none. */
  insignias?: ReadonlyMap<string, Insignias>
  /** The page the claim's «Volver» comes back to. */
  desde?: string
}

/** Ideas in her words (4h, D8): the text she reads, its badges, its action, and WAV's detail folded under each. */
export function ListaDeIdeas({ etiqueta, ideas, accion, className, insignias, desde }: Propiedades) {
  return (
    <ul aria-label={etiqueta} className={cn("grid gap-3", className)}>
      {ideas.map((idea) => {
        const deLaIdea = insignias?.get(idea.id)
        return (
          <li key={idea.id} className="grid gap-2 rounded-panel bg-piedra-alta p-4">
            <p id={idDeIdea(idea.id)} className="text-cuerpo">{`«${idea.texto}»`}</p>
            {deLaIdea ? <InsigniasDeIdea afirmacionId={idea.id} insignias={deLaIdea} desde={desde} /> : null}
            {accion ? accion(idea) : null}
            <DetalleParaWav lineas={lineasDeIdeaParaWav(idea)} proveedor={null} />
          </li>
        )
      })}
    </ul>
  )
}
