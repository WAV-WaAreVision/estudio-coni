import { LineaDeFuente } from "@/components/linea-de-fuente"
import { Panel } from "@/components/ui/panel"
import { type Lamina, nombreDeLamina } from "@/lib/dominio/carrusel"

/** The numbered slides, read only (design D1 step 3): what gate 1 signs and what the waiting screen shows. */
export function LaminasEnLectura({ laminas }: { laminas: readonly Lamina[] }) {
  return (
    <ol className="grid gap-3">
      {laminas.map((lamina, indice) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a slide's place is its identity within a version
        <li key={indice} className="list-none">
          <Panel>
            <p className="text-meta text-apagado">{nombreDeLamina(lamina, indice)}</p>
            <p className="mt-1 whitespace-pre-wrap text-cuerpo leading-prosa">{lamina.texto}</p>
            {lamina.fuente ? <LineaDeFuente texto={lamina.fuente} className="mt-3 border-t border-hilo pt-3" /> : null}
          </Panel>
        </li>
      ))}
    </ol>
  )
}
