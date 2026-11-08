import { House } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { AvisarAFederico } from "@/components/avisar-a-federico"
import { COLUMNAS_DE_PUERTA } from "@/components/puerta-en-columnas"
import { Bloque } from "@/components/ui/bloque"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { ICONO } from "@/components/ui/icono"
import { Volver } from "@/components/ui/volver"
import { etiquetaDePilar, type PilarVisible } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { TEXTO_DETENIDO_EN_SUS_PALABRAS, TEXTO_VIDEO_DETENIDO } from "./textos"

type Aviso = { avisado: boolean } | null

/**
 * A signed video stopped with an explanation. When only WAV can fix it (`aviso`), «Avisar a Federico» sits in the
 * block (spec 2026-11-07, A11); a pause has none: WAV already knows.
 */
export function VideoDetenido({ piezaId, explicacion, aviso }: { piezaId: string; explicacion: string; aviso: Aviso }) {
  return (
    <Bloque
      tipo="error"
      grande
      titulo={TEXTO_VIDEO_DETENIDO}
      accion={aviso ? <AvisarAFederico tipo="pieza" id={piezaId} avisado={aviso.avisado} /> : undefined}
    >
      <ExplicacionParaConi texto={explicacion} enSusPalabras={TEXTO_DETENIDO_EN_SUS_PALABRAS} />
    </Bloque>
  )
}

/**
 * The stopped-video screen (issue 101, decision 4). On a phone, the column of `EstadoSencillo`: the way back, the
 * piece's pillar, length and title, then what happened and «Volver a Inicio». From the gates' two-column breakpoint,
 * what happened and its actions take the reading column and the piece becomes a card in the side column.
 */
export function PantallaDeVideoDetenido({
  titulo,
  pilar,
  segundos,
  piezaId,
  explicacion,
  aviso,
}: {
  titulo: string
  pilar: PilarVisible | null
  segundos?: number
  piezaId: string
  explicacion: string
  aviso: Aviso
}) {
  return (
    <div data-ancho="puerta" className="@container">
      <div className={cn("grid gap-3", COLUMNAS_DE_PUERTA)}>
        <div className="dos-columnas:col-span-full">
          <Volver href="/">Inicio</Volver>
        </div>
        <header
          data-testid="detenido-pieza"
          className="grid gap-3 dos-columnas:col-start-2 dos-columnas:row-start-2 dos-columnas:mt-8 dos-columnas:self-start dos-columnas:rounded-panel dos-columnas:bg-piedra-alta dos-columnas:p-5"
        >
          {pilar || segundos ? (
            <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado dos-columnas:mt-0">
              <span>{pilar ? etiquetaDePilar(pilar) : null}</span>
              <span>{segundos ? `${segundos} s` : null}</span>
            </p>
          ) : null}
          <h1 className="text-pieza text-balance">{titulo}</h1>
        </header>
        <div
          data-testid="detenido-principal"
          className="mt-6 grid gap-6 dos-columnas:col-start-1 dos-columnas:row-start-2 dos-columnas:mt-8 dos-columnas:self-start"
        >
          <VideoDetenido piezaId={piezaId} explicacion={explicacion} aviso={aviso} />
          <Link href="/" className={clasesDeBoton({ variante: "secundario", className: "mt-2" })}>
            Volver a Inicio
            <House aria-hidden="true" size={ICONO.medio} />
          </Link>
        </div>
      </div>
    </div>
  )
}
