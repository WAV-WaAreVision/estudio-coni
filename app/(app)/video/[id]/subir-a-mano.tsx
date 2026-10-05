"use client"

import { Check, DownloadSimple } from "@phosphor-icons/react"
import { type ReactNode, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"

interface PropiedadesDeSubirAMano {
  piezaId: string
  version: number
  /** The caption she approved, exactly as stored. */
  texto: string
  alDescargar: (piezaId: string) => Promise<Resultado<{ url: string }>>
  alMarcar: (piezaId: string, version: number, enlace: string) => Promise<Resultado>
  /** Where the browser goes to download; replaced in tests. */
  alIrA?: (url: string) => void
}

const IR_A_LA_DESCARGA = (url: string) => window.location.assign(url)

/**
 * Instagram is not connected: she takes the video and the text to the Instagram app herself. The video goes from R2 to
 * her phone through a short signed link; the label is a step she confirms because every post says it is an avatar.
 */
export function SubirAMano({
  piezaId,
  version,
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
          variante="linea"
          cargando={descarga.pendiente}
          icono={<DownloadSimple aria-hidden="true" size={20} />}
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
            <span className="inline-flex items-center gap-1 text-exito">
              <Check aria-hidden="true" size={16} />
              Texto copiado
            </span>
          ) : null}
          {copia === "fallo" ? "No pude copiarlo. Mantén apretado el texto de arriba para copiarlo." : null}
        </output>
      </Paso>

      <Paso numero={3} titulo="Súbelo en Instagram">
        <p className="text-cuerpo">Súbelo como Reel y pega el texto.</p>
        <p className="text-cuerpo">
          Antes de publicar, activa la etiqueta «Información de IA». Es tu avatar y tiene que decirlo.
        </p>
        <Casilla
          etiqueta="Activé la etiqueta «Información de IA»"
          marcada={etiquetaPuesta}
          alCambiar={setEtiquetaPuesta}
        />
      </Paso>

      <Paso numero={4} titulo="Avísame cuando esté arriba">
        <label className="grid gap-2">
          <span className="text-meta font-semibold">Enlace del reel (opcional)</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            value={enlace}
            onChange={(evento) => setEnlace(evento.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            className="campo w-full text-cuerpo"
          />
        </label>
        {confirmacion.error ? <LineaDeEstado tipo="error" titulo={confirmacion.error} /> : null}
        <Boton
          variante="primario"
          cargando={confirmacion.pendiente}
          deshabilitado={!etiquetaPuesta}
          aria-describedby={etiquetaPuesta ? undefined : "subir-motivo"}
          onClick={() => confirmacion.ejecutar(() => alMarcar(piezaId, version, enlace))}
        >
          Ya lo subí
        </Boton>
        {etiquetaPuesta ? null : (
          <p id="subir-motivo" className="text-meta text-apagado">
            Se activa cuando confirmas la etiqueta de IA.
          </p>
        )}
      </Paso>
    </ol>
  )
}

/** One numbered step: the number sits in the icon column, so the content keeps the screen's left axis at x = 56. */
function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 border-t border-tinta pt-3">
      <span aria-hidden="true" className="text-meta font-semibold tabular-nums">
        {numero}
      </span>
      <div className="grid gap-3">
        <h2 className="text-meta font-semibold">{titulo}</h2>
        {children}
      </div>
    </li>
  )
}
