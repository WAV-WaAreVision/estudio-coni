"use client"

import { Check, DownloadSimple } from "@phosphor-icons/react"
import { type ReactNode, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"
import type { Destino } from "@/lib/dominio/destinos"

interface PropiedadesDeSubirAMano {
  piezaId: string
  version: number
  /** The destination of this block: each one is uploaded and confirmed on its own. */
  destino: Destino
  /** The text she approved for this destination, exactly as stored. */
  texto: string
  alDescargar: (piezaId: string) => Promise<Resultado<{ url: string }>>
  alMarcar: (piezaId: string, version: number, destino: string, enlace: string) => Promise<Resultado>
  /** Where the browser goes to download; replaced in tests. */
  alIrA?: (url: string) => void
}

const IR_A_LA_DESCARGA = (url: string) => window.location.assign(url)

interface CopiaDeDestino {
  paso: string
  indicacion: string
  /** What she has to keep in mind before publishing; null when the text already carries it. */
  recordatorio: string | null
  casilla: string
  etiquetaDelEnlace: string
  ejemplo: string
  boton: string
  motivo: string
}

const COPIA: Record<Destino, CopiaDeDestino> = {
  instagram: {
    paso: "Súbelo en Instagram",
    indicacion: "Súbelo como Reel y pega el texto.",
    recordatorio: "Antes de publicar, activa la etiqueta «Información de IA». Es tu avatar y tiene que decirlo.",
    casilla: "Activé la etiqueta «Información de IA»",
    etiquetaDelEnlace: "Enlace del reel (opcional)",
    ejemplo: "https://www.instagram.com/reel/...",
    boton: "Ya lo subí a Instagram",
    motivo: "Se activa cuando confirmas la etiqueta de IA.",
  },
  linkedin: {
    paso: "Súbelo en LinkedIn",
    indicacion: "Publica el video en LinkedIn y pega el texto.",
    recordatorio: null,
    casilla: "Dejé en el texto que es mi avatar digital",
    etiquetaDelEnlace: "Enlace de la publicación en LinkedIn (opcional)",
    ejemplo: "https://www.linkedin.com/posts/...",
    boton: "Ya lo subí a LinkedIn",
    motivo: "Se activa cuando confirmas el aviso de avatar.",
  },
}

/**
 * She takes the video and the text to the app of one destination herself (Instagram while it is not connected,
 * LinkedIn always). The video goes from R2 to her phone through a short signed link; the notice of the avatar is a step
 * she confirms because every post says it is an avatar.
 */
export function SubirAMano({
  piezaId,
  version,
  destino,
  texto,
  alDescargar,
  alMarcar,
  alIrA = IR_A_LA_DESCARGA,
}: PropiedadesDeSubirAMano) {
  const [etiquetaPuesta, setEtiquetaPuesta] = useState(false)
  const [enlace, setEnlace] = useState("")
  const [copia, setCopia] = useState<"nada" | "copiado" | "fallo">("nada")
  const descarga = useAccion()
  const confirmacion = useAccion()
  const idDelMotivo = useId()
  const frases = COPIA[destino]

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopia("copiado")
    } catch (error) {
      // The clipboard can be refused (a permission, an in-app browser): the text is on screen to copy by hand.
      if (!(error instanceof DOMException)) throw error
      setCopia("fallo")
    }
  }

  return (
    <ol className="grid gap-8">
      <Paso numero={1} titulo="Descarga el video">
        <Boton
          variante="secundario"
          cargando={descarga.pendiente}
          icono={<DownloadSimple aria-hidden="true" size={ICONO.medio} />}
          onClick={() =>
            descarga.ejecutar(
              () => alDescargar(piezaId),
              (resultado) => alIrA(resultado.url),
            )
          }
        >
          Descargar video
        </Boton>
        {descarga.error ? <LineaDeEstado tipo="error" titulo={descarga.error} /> : null}
      </Paso>

      <Paso numero={2} titulo="Copia el texto">
        <p className="whitespace-pre-line text-cuerpo leading-prosa">{texto}</p>
        <Boton variante="callado" onClick={copiar}>
          Copiar texto
        </Boton>
        <output className="block min-h-6 text-meta text-apagado">
          {copia === "copiado" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-tinta">
              <Check aria-hidden="true" size={ICONO.chico} />
              Texto copiado
            </span>
          ) : null}
          {copia === "fallo" ? "No pude copiarlo. Mantén apretado el texto de arriba para copiarlo." : null}
        </output>
      </Paso>

      <Paso numero={3} titulo={frases.paso}>
        <p className="text-cuerpo">{frases.indicacion}</p>
        {frases.recordatorio ? <p className="text-cuerpo">{frases.recordatorio}</p> : null}
        <Casilla etiqueta={frases.casilla} marcada={etiquetaPuesta} alCambiar={setEtiquetaPuesta} />
      </Paso>

      <Paso numero={4} titulo="Avísame cuando esté arriba">
        <label className="grid gap-2">
          <span className="text-meta font-semibold">{frases.etiquetaDelEnlace}</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            value={enlace}
            onChange={(evento) => setEnlace(evento.target.value)}
            placeholder={frases.ejemplo}
            className="campo w-full text-cuerpo"
          />
        </label>
        {confirmacion.error ? <LineaDeEstado tipo="error" titulo={confirmacion.error} /> : null}
        <Boton
          variante="primario"
          cargando={confirmacion.pendiente}
          deshabilitado={!etiquetaPuesta}
          aria-describedby={etiquetaPuesta ? undefined : idDelMotivo}
          onClick={() => confirmacion.ejecutar(() => alMarcar(piezaId, version, destino, enlace))}
        >
          {frases.boton}
        </Boton>
        {etiquetaPuesta ? null : (
          <p id={idDelMotivo} className="text-meta text-apagado">
            {frases.motivo}
          </p>
        )}
      </Paso>
    </ol>
  )
}

/** One numbered step: the number sits in the icon column, so the content keeps the screen's left axis at x = 56. */
function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 pt-1">
      <span aria-hidden="true" className="text-meta font-semibold tabular-nums">
        {numero}
      </span>
      <div className="grid gap-3">
        <h3 className="text-meta font-semibold">{titulo}</h3>
        {children}
      </div>
    </li>
  )
}
