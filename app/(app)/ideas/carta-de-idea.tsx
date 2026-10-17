import { CaretDown } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"
import { LineaDeFuente } from "@/components/linea-de-fuente"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { etiquetaDeAlerta } from "@/lib/dominio/revision"
import type { IdeaDeBanco, NivelDeEvidencia } from "@/lib/ideas/mazo"

const TIPO_RESPALDO = "respaldo"
const NIVEL: Record<NivelDeEvidencia, string> = { alto: "Alta", medio: "Media", debil: "Débil" }

const RESUMEN_DE_DISCLOSURE =
  "flex min-h-objetivo cursor-pointer list-none items-center justify-between gap-2 text-cuerpo font-semibold [&::-webkit-details-marker]:hidden"

/**
 * Brandkit 9.18: the one raised card of the screen, neutral (the pillar is a word). `children` are the actions: they sit
 * right under the hook and the alerts, above «Por qué».
 */
export function CartaDeIdea({ idea, children }: { idea: IdeaDeBanco; children?: ReactNode }) {
  const respaldoDebil = idea.alertas.some((alerta) => alerta.tipo === TIPO_RESPALDO)
  const alertas = idea.alertas.filter((alerta) => alerta.tipo !== TIPO_RESPALDO)
  return (
    <article data-pilar={idea.pilar} className="carta-idea grid gap-4 rounded-panel bg-piedra p-5 shadow-relieve-alto">
      <div className="grid gap-3">
        <p className="text-meta text-apagado">{idea.nombrePilar}</p>
        <h2 className="text-pieza text-balance">{idea.gancho}</h2>
        {idea.tema ? <p className="text-cuerpo text-apagado">{idea.tema}</p> : null}
        <p className="text-meta font-medium text-tinta">
          Fuerza {idea.fuerza}
          {idea.formato ? ` · ${idea.formato}` : ""}
          {respaldoDebil ? (
            <>
              {" · "}
              <span>Respaldo débil</span>
            </>
          ) : null}
        </p>
        {idea.porQue?.fuente ? (
          <LineaDeFuente texto={idea.porQue.fuente} className="border-t border-hilo pt-3" />
        ) : null}
      </div>
      {alertas.length > 0 ? (
        <div className="grid gap-1">
          {alertas.map((alerta) => (
            <LineaDeEstado key={alerta.tipo} tipo="aviso" titulo={etiquetaDeAlerta(alerta.tipo)} />
          ))}
          <details className="text-cuerpo">
            <summary className={RESUMEN_DE_DISCLOSURE}>
              Qué revisar antes de grabar
              <CaretDown aria-hidden="true" size={ICONO.medio} className="text-apagado" />
            </summary>
            <ul className="grid gap-2 pb-2 text-meta">
              {alertas.map((alerta) => (
                <li key={alerta.tipo}>
                  <span className="font-semibold">{alerta.tipo}:</span> {alerta.texto}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
      {idea.fijada ? <p className="text-meta font-semibold">Ya está en las ideas de la semana.</p> : null}
      {children}
      {idea.porQue ? (
        <details className="border-t border-hilo text-cuerpo">
          <summary className={RESUMEN_DE_DISCLOSURE}>
            Por qué
            <CaretDown aria-hidden="true" size={ICONO.medio} className="text-apagado" />
          </summary>
          <div className="grid gap-2 pb-2">
            <p className="font-semibold">{idea.porQue.titulo}</p>
            <p>{idea.porQue.tesis}</p>
            {idea.porQue.nivel ? <p className="text-meta">Evidencia: {NIVEL[idea.porQue.nivel]}</p> : null}
            {idea.porQue.respaldo.length > 0 ? (
              <>
                <p className="text-meta font-semibold">Solo para ti, no se publica</p>
                <ul className="grid gap-2 text-meta">
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
    </article>
  )
}
