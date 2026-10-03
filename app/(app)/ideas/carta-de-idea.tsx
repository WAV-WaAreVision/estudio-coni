import { ChipDeAlerta } from "@/components/chip-de-alerta"
import { PildoraPilar } from "@/components/ui/pildora-pilar"
import type { IdeaDeBanco, NivelDeEvidencia } from "@/lib/ideas/mazo"

const TIPO_RESPALDO = "respaldo"
const NIVEL: Record<NivelDeEvidencia, string> = { alto: "Alta", medio: "Media", debil: "Débil" }

/** One idea on the tint of its pillar, in the voice of the script (docs/DESIGN.md, idea-card). */
export function CartaDeIdea({ idea }: { idea: IdeaDeBanco }) {
  const respaldoDebil = idea.alertas.filter((alerta) => alerta.tipo === TIPO_RESPALDO)
  const alertas = idea.alertas.filter((alerta) => alerta.tipo !== TIPO_RESPALDO)
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
        {respaldoDebil.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Respaldo de la idea">
            {respaldoDebil.map((alerta) => (
              <li key={alerta.texto}>
                <ChipDeAlerta tipo={TIPO_RESPALDO} etiqueta={alerta.texto} />
              </li>
            ))}
          </ul>
        ) : null}
        {idea.porQue ? (
          <details className="text-[1rem] text-pilar-tinta">
            <summary className="flex min-h-11 cursor-pointer items-center text-label font-semibold">Por qué</summary>
            <div className="grid gap-2 pb-1.5">
              <p className="font-semibold">{idea.porQue.titulo}</p>
              <p>{idea.porQue.tesis}</p>
              {idea.porQue.nivel ? <p className="text-meta">Evidencia: {NIVEL[idea.porQue.nivel]}</p> : null}
              {idea.porQue.respaldo.length > 0 ? (
                <>
                  <p className="text-meta font-semibold">Solo para ti, no se publica</p>
                  <ul className="grid gap-1.5">
                    {idea.porQue.respaldo.map((apoyo) => (
                      <li key={`${apoyo.autor}:${apoyo.cita}`}>
                        {apoyo.autor}: {apoyo.cita}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </details>
        ) : null}
        {alertas.length > 0 ? (
          <>
            <ul className="flex flex-wrap gap-1.5" aria-label="Alertas de la idea">
              {alertas.map((alerta) => (
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
                {alertas.map((alerta) => (
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
