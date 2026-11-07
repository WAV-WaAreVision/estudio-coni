import { HandTap, HourglassMedium } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { ReactNode } from "react"
import { FORMA_DE_CHIP, TRANSICION_DE_CHIP } from "@/components/ui/clases-de-chip"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { PildoraDeEstado } from "@/components/ui/estado"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Panel } from "@/components/ui/panel"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import {
  A_PEDIDO,
  type CorridaLeida,
  type CruceDescartado,
  crucesQueNoSirvieron,
  etiquetaDePilarParaSubir,
  lineasDeTeoriaParaWav,
  MOTOR_NO_TERMINO,
  NADA_QUE_SUBIR,
  nadaQueSubir,
  presentarCorrida,
  type QueSubirLeido,
  respaldoDeTeoria,
  resumenDeCorrida,
  type SemanaLeida,
  SIN_CORRIDAS,
  SIN_CRUCES,
  type TemaDeTeoria,
  type TeoriaEscrita,
  TITULO_DE_LO_CRUZADO,
  TRABAJANDO,
  tituloDeSemana,
} from "@/lib/dominio/biblioteca/semana"
import { cn } from "@/lib/utils"
import { BotonProponerAhora } from "./boton-proponer-ahora"

// Ported from Ingesta's app/(app)/semana/vista-de-semana.tsx, with fixes 4a, 4h, 4j and 4l (spec 2026-11-06).

const ICONO_DE_PILDORA = { "aria-hidden": true, size: ICONO.chico, weight: "bold", className: "shrink-0" } as const

/** Each topic as a chip that leads to its page (spec decision 9); nothing when none is left. */
function EnlacesDeTemas({ temas, etiqueta }: { temas: readonly TemaDeTeoria[]; etiqueta: string }) {
  if (temas.length === 0) return null
  return (
    <ul aria-label={etiqueta} className="flex flex-wrap gap-2">
      {temas.map((tema) => (
        <li key={tema.id}>
          <Link href={hrefDeTema(tema.id)} className={cn(FORMA_DE_CHIP, TRANSICION_DE_CHIP)}>
            {tema.nombre}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The run: its week, its state as icon and word (4j), «A pedido», and a ready run's ideas and cost. */
export function CorridaDeLaSemana({ corrida }: { corrida: CorridaLeida }) {
  const estado = presentarCorrida(corrida.estado)
  return (
    <Panel className="grid gap-3">
      <h2 data-snapshot="varia" className="text-pieza text-balance">
        {tituloDeSemana(corrida.semana)}
      </h2>
      <div className="flex flex-wrap gap-2">
        <PildoraDeEstado
          tipo={estado.tipo}
          icono={estado.icono === "reloj" ? <HourglassMedium {...ICONO_DE_PILDORA} /> : undefined}
        >
          {estado.palabra}
        </PildoraDeEstado>
        {corrida.manual ? (
          <PildoraDeEstado tipo="neutro" icono={<HandTap {...ICONO_DE_PILDORA} />}>
            {A_PEDIDO}
          </PildoraDeEstado>
        ) : null}
      </div>
      {corrida.estado === "lista" ? (
        <p data-snapshot="varia" className="text-meta text-apagado">
          {resumenDeCorrida(corrida)}
        </p>
      ) : null}
    </Panel>
  )
}

/** What the run says to upload next (spec decision 8): one line when nothing is missing, no empty list (4l). */
export function QueSubir({ queSubir }: { queSubir: QueSubirLeido | null }) {
  if (queSubir === null) return null
  return (
    <section aria-label="Qué subir después" className="grid gap-3">
      <h2 className="text-pieza">Qué subir después</h2>
      {nadaQueSubir(queSubir) ? <p className="text-cuerpo text-apagado">{NADA_QUE_SUBIR}</p> : null}
      {queSubir.unSoloAutor.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-cuerpo font-semibold">Temas con un solo autor</h3>
          <ul className="grid gap-1.5 text-cuerpo">
            {queSubir.unSoloAutor.map((tema) => (
              <li key={tema.nombre}>
                {tema.id === null ? (
                  tema.nombre
                ) : (
                  <Link href={hrefDeTema(tema.id)} className="text-tinta underline decoration-1 underline-offset-4">
                    {tema.nombre}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {queSubir.pilaresSinMaterial.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-cuerpo font-semibold">Pilares sin material</h3>
          <ul className="grid gap-1.5 text-cuerpo">
            {queSubir.pilaresSinMaterial.map((pilar) => (
              <li key={pilar.slug}>{etiquetaDePilarParaSubir(pilar)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

const ID_DE_LO_CRUZADO = "lo-que-cruzo"

function Teoria({ teoria }: { teoria: TeoriaEscrita }) {
  const respaldo = respaldoDeTeoria(teoria.nivelEvidencia)
  return (
    <li data-contorno className="grid gap-3 rounded-panel bg-piedra-alta p-5">
      <h3 className="text-cuerpo font-semibold text-balance">{teoria.titulo}</h3>
      {teoria.tesis ? <p className="text-cuerpo">{teoria.tesis}</p> : null}
      {respaldo ? (
        <PildoraDeEstado tipo="neutro" className="w-fit">
          {respaldo}
        </PildoraDeEstado>
      ) : null}
      <EnlacesDeTemas temas={teoria.temas} etiqueta={`Temas de «${teoria.titulo}»`} />
      <DetalleParaWav lineas={lineasDeTeoriaParaWav(teoria)} proveedor={null} />
    </li>
  )
}

/** Folded, with their count (4l): the crossings the engine tried and dropped, and why. */
function CrucesQueNoSirvieron({ descartadas }: { descartadas: readonly CruceDescartado[] }) {
  if (descartadas.length === 0) return null
  return (
    <MasOpciones titulo={crucesQueNoSirvieron(descartadas.length)}>
      <ul aria-label="Cruces que no sirvieron" className="grid gap-4">
        {descartadas.map((cruce, indice) => (
          <li key={cruce.id} className="grid gap-2">
            <EnlacesDeTemas temas={cruce.temas} etiqueta={`Temas del cruce ${indice + 1}`} />
            <p className="text-meta text-apagado">{cruce.razon}</p>
          </li>
        ))}
      </ul>
    </MasOpciones>
  )
}

/** What the run says in the left column when it wrote no theory, or why there is none yet (plan D2). */
function AvisoDeLaCorrida({ corrida, hayTeorias }: { corrida: CorridaLeida; hayTeorias: boolean }) {
  if (corrida.estado === "fallida") {
    return <LineaDeEstado tipo="error" titulo={corrida.motivoFallo ?? MOTOR_NO_TERMINO} tituloEnTinta anunciada />
  }
  if (corrida.estado === "corriendo") return <p className="text-cuerpo text-apagado">{TRABAJANDO}</p>
  return hayTeorias ? null : <p className="text-cuerpo text-apagado">{SIN_CRUCES}</p>
}

/** «Lo que el motor cruzó esta semana» (4h): the theories by score, then the folded crossings. Empty in one line (4l). */
export function LoQueCruzo({
  corrida,
  teorias,
  descartadas,
}: {
  corrida: CorridaLeida | null
  teorias: readonly TeoriaEscrita[]
  descartadas: readonly CruceDescartado[]
}) {
  if (corrida === null) return <p className="text-cuerpo text-apagado">{SIN_CORRIDAS}</p>
  const aviso = <AvisoDeLaCorrida corrida={corrida} hayTeorias={teorias.length > 0} />
  if (teorias.length === 0) {
    return (
      <div className="grid gap-4">
        {aviso}
        <CrucesQueNoSirvieron descartadas={descartadas} />
      </div>
    )
  }
  return (
    <section aria-labelledby={ID_DE_LO_CRUZADO} className="grid gap-4">
      <h2 id={ID_DE_LO_CRUZADO} className="text-pieza text-balance">
        {TITULO_DE_LO_CRUZADO}
      </h2>
      {aviso}
      <ul className="grid gap-4">
        {teorias.map((teoria) => (
          <Teoria key={teoria.id} teoria={teoria} />
        ))}
      </ul>
      <CrucesQueNoSirvieron descartadas={descartadas} />
    </section>
  )
}

/**
 * The DOM follows the phone (title, run and «Proponer ahora», what was crossed, what to upload); on a computer the grid
 * puts the panel in a sticky right column beside everything (plan D1). «Qué subir después» is drawn twice, as Materiales
 * draws its cards and its table: only one is ever displayed.
 */
export function VistaDeSemana({
  encabezado,
  semana,
  costoUsd,
}: {
  encabezado: ReactNode
  semana: SemanaLeida
  costoUsd: number
}) {
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-x-8">
      <div className="grid min-w-0 gap-5 md:col-start-1 md:row-start-1">{encabezado}</div>
      <aside
        aria-label="Corrida del motor"
        className="grid content-start gap-5 md:sticky md:top-24 md:col-start-2 md:row-span-2 md:row-start-1 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
        {semana.corrida ? <CorridaDeLaSemana corrida={semana.corrida} /> : null}
        <BotonProponerAhora costoUsd={costoUsd} />
        <div className="hidden md:block">
          <QueSubir queSubir={semana.queSubir} />
        </div>
      </aside>
      <div className="grid min-w-0 content-start gap-5 md:col-start-1 md:row-start-2">
        <LoQueCruzo corrida={semana.corrida} teorias={semana.teorias} descartadas={semana.descartadas} />
      </div>
      <div className="md:hidden">
        <QueSubir queSubir={semana.queSubir} />
      </div>
    </div>
  )
}
