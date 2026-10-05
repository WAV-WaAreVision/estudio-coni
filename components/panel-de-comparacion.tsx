import { ProgresoDeReels } from "@/components/progreso-de-reels"
import { Seccion } from "@/components/seccion"
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
 * shows how far each theme is (eight segments); after it, the comparison with its interval and sample sizes. A flat
 * section, not a panel (brandkit 9.20).
 */
export function PanelDeComparacion({ panel }: { panel: Panel }) {
  if (panel.tipo === "comparable") {
    return (
      <Seccion titulo={panel.titulo} id="comparacion">
        <ul className="grid gap-2 text-cuerpo">
          {panel.temas.map((tema) => (
            <li key={tema.pilar}>{tema.texto}</li>
          ))}
        </ul>
        <p className="text-cuerpo">{panel.frase}</p>
        <p className="text-meta text-apagado">{panel.cautela}</p>
        {panel.pendientes.length > 0 ? (
          <div className="grid gap-1">
            <p className="text-meta text-apagado">Todavía sin comparar:</p>
            <Temas temas={panel.pendientes} />
          </div>
        ) : null}
      </Seccion>
    )
  }
  return (
    <Seccion
      titulo={panel.titulo}
      id="comparacion"
      cifra={panel.tipo === "temprano" ? `${panel.avance} de ${panel.meta}` : undefined}
    >
      <p className="text-cuerpo">{panel.texto}</p>
      {panel.tipo === "temprano" ? (
        <>
          <ProgresoDeReels avance={panel.avance} meta={panel.meta} />
          <Temas temas={panel.temas} />
        </>
      ) : null}
    </Seccion>
  )
}
