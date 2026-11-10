import type { ReactNode } from "react"
import { Panel } from "@/components/ui/panel"
import { ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import {
  type FusionReciente,
  lineaDeFusionReciente,
  type ParRechazado,
  type PropuestaDeFusion,
  razonDeClaude,
  razonDeRechazo,
  tituloDePar,
} from "@/lib/dominio/fusiones"
import { DecidirFusion, DeshacerFusion, UnirIgual } from "./botones-de-fusion"

function Tarjeta({ titulo, idDelTitulo, children }: { titulo: string; idDelTitulo: string; children: ReactNode }) {
  return (
    <article aria-labelledby={idDelTitulo} className="h-full">
      <Panel className="grid h-full content-start gap-3">
        <h3 id={idDelTitulo} className="text-cuerpo font-semibold text-balance break-words">
          {titulo}
        </h3>
        {children}
      </Panel>
    </article>
  )
}

export function TarjetaDePropuesta({ propuesta }: { propuesta: PropuestaDeFusion }) {
  const id = `propuesta-${propuesta.id}`
  const razon = razonDeClaude(propuesta.razon)
  return (
    <Tarjeta titulo={tituloDePar(propuesta.perdedor, propuesta.ganador)} idDelTitulo={id}>
      {razon ? <p className="text-cuerpo">{razon}</p> : null}
      {propuesta.motivo ? <p className="text-meta text-apagado">{propuesta.motivo}</p> : null}
      <DecidirFusion id={propuesta.id} describe={id} />
    </Tarjeta>
  )
}

export function TarjetaDeFusionReciente({ fusion }: { fusion: FusionReciente }) {
  const id = `reciente-${fusion.id}`
  const razon = razonDeClaude(fusion.razon)
  return (
    <Tarjeta titulo={tituloDePar(fusion.perdedor, fusion.ganador)} idDelTitulo={id}>
      <p className="text-cuerpo">{lineaDeFusionReciente(fusion, ZONA_DE_LA_BIBLIOTECA)}</p>
      {razon ? <p className="text-meta text-apagado">{razon}</p> : null}
      <DeshacerFusion id={fusion.id} ganador={fusion.ganador} perdedor={fusion.perdedor} describe={id} />
    </Tarjeta>
  )
}

export function TarjetaDeParRechazado({ par }: { par: ParRechazado }) {
  const id = `par-${par.a}-${par.b}`
  return (
    <Tarjeta titulo={tituloDePar(par.nombreA, par.nombreB)} idDelTitulo={id}>
      <p className="text-cuerpo">{razonDeRechazo(par)}</p>
      <UnirIgual a={par.a} b={par.b} describe={id} />
    </Tarjeta>
  )
}
