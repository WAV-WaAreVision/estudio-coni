import { HandTap, HourglassMedium } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { PildoraDeEstado } from "@/components/ui/estado"
import { ICONO } from "@/components/ui/icono"
import { Panel } from "@/components/ui/panel"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import {
  A_PEDIDO,
  type CorridaLeida,
  etiquetaDePilarParaSubir,
  NADA_QUE_SUBIR,
  nadaQueSubir,
  presentarCorrida,
  type QueSubirLeido,
  resumenDeCorrida,
  tituloDeSemana,
} from "@/lib/dominio/biblioteca/semana"

// Ported from Ingesta's app/(app)/semana/vista-de-semana.tsx, with fixes 4a, 4h, 4j and 4l (spec 2026-11-06).

const ICONO_DE_PILDORA = { "aria-hidden": true, size: ICONO.chico, weight: "bold", className: "shrink-0" } as const

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
