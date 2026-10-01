import { ProgresoDeReels } from "@/components/progreso-de-reels"
import { NOMBRE_DE_PILAR } from "@/lib/dominio/pilares"
import type { PanelDeComparacion as Panel } from "@/lib/metricas/modelo"

function Temas({ temas }: { temas: { pilar: keyof typeof NOMBRE_DE_PILAR; n: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-apagado">
      {temas.map((tema) => (
        <li key={tema.pilar}>
          {NOMBRE_DE_PILAR[tema.pilar]} · {tema.n}
        </li>
      ))}
    </ul>
  )
}

/**
 * Sits right under "Lo que sirvió" so the order of the bars is never read as a conclusion: before the threshold it
 * shows how far each theme is; after it, the comparison with its interval and sample sizes (DESIGN.md, Do's).
 */
export function PanelDeComparacion({ panel }: { panel: Panel }) {
  if (panel.tipo === "comparable") {
    return (
      <section aria-labelledby="comparacion" className="grid gap-3 rounded-lg bg-hundido p-4">
        <h2 id="comparacion" className="font-semibold">
          {panel.titulo}
        </h2>
        <ul className="grid gap-1.5">
          {panel.temas.map((tema) => (
            <li key={tema.pilar}>{tema.texto}</li>
          ))}
        </ul>
        <p>{panel.frase}</p>
        <p className="text-meta text-apagado">{panel.cautela}</p>
        {panel.pendientes.length > 0 ? (
          <div className="grid gap-1">
            <p className="text-meta text-apagado">Todavía sin comparar:</p>
            <Temas temas={panel.pendientes} />
          </div>
        ) : null}
      </section>
    )
  }
  return (
    <section aria-labelledby="comparacion" className="grid gap-3 rounded-lg bg-hundido p-4">
      <h2 id="comparacion" className="font-semibold">
        {panel.titulo}
      </h2>
      <p>{panel.texto}</p>
      {panel.tipo === "temprano" ? (
        <>
          <ProgresoDeReels avance={panel.avance} meta={panel.meta} />
          <Temas temas={panel.temas} />
        </>
      ) : null}
    </section>
  )
}
