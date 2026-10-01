import { ChipDeAlerta } from "@/components/chip-de-alerta"
import { PildoraPilar } from "@/components/ui/pildora-pilar"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"

/** One idea on the tint of its pillar, in the voice of the script (docs/DESIGN.md, idea-card). */
export function CartaDeIdea({ idea }: { idea: IdeaDeBanco }) {
  return (
    <article
      data-pilar={idea.pilar}
      className="carta-idea grid min-h-85 content-between gap-4 rounded-xl bg-pilar-tinte px-5 py-5.5"
    >
      <div className="grid justify-items-start gap-3.5">
        <PildoraPilar pilar={idea.pilar} className="bg-pilar-tinte-fuerte" />
        <h2 className="font-serif text-display text-balance">{idea.gancho}</h2>
        {idea.tema ? <p className="text-[1.0625rem] text-pilar-tinta">{idea.tema}</p> : null}
      </div>
      <div className="grid gap-2.5">
        <p className="text-meta text-pilar-tinta">
          Fuerza {idea.fuerza}
          {idea.formato ? ` · ${idea.formato}` : ""}
        </p>
        {idea.alertas.length > 0 ? (
          <>
            <ul className="flex flex-wrap gap-1.5" aria-label="Alertas de la idea">
              {idea.alertas.map((alerta) => (
                <li key={alerta.tipo}>
                  <ChipDeAlerta tipo={alerta.tipo} />
                </li>
              ))}
            </ul>
            <details className="text-[1rem] text-pilar-tinta">
              <summary className="flex min-h-11 cursor-pointer items-center text-label font-semibold">
                Qué revisar antes de grabar
              </summary>
              <ul className="grid gap-2 pb-1.5">
                {idea.alertas.map((alerta) => (
                  <li key={alerta.tipo}>
                    <span className="font-semibold">{alerta.tipo}:</span> {alerta.texto}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
        {idea.fijada ? (
          <p className="text-meta font-semibold text-pilar-tinta">Ya está en las ideas de la semana.</p>
        ) : null}
      </div>
    </article>
  )
}
