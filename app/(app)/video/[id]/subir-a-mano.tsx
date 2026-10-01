"use client"

import { useState } from "react"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
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
    <div className="grid gap-5.5">
      <Seccion titulo="1. Descarga el video" id="subir-video">
        <Boton
          variante="primario"
          cargando={descarga.pendiente}
          onClick={() =>
            descarga.ejecutar(
              () => alDescargar(piezaId),
              (resultado) => alIrA(resultado.url),
            )
          }
        >
          Descargar video
        </Boton>
        {descarga.error ? (
          <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
            {descarga.error}
          </p>
        ) : null}
      </Seccion>

      <Seccion titulo="2. Copia el texto" id="subir-texto">
        <p className="whitespace-pre-line rounded-lg border border-linea bg-superficie p-4 text-[1.0625rem] leading-normal">
          {texto}
        </p>
        <Boton variante="callado" onClick={copiar}>
          Copiar texto
        </Boton>
        <output className="block min-h-6 text-meta text-apagado">
          {copia === "copiado" ? "Texto copiado" : null}
          {copia === "fallo" ? "No pude copiarlo. Mantén apretado el texto de arriba para copiarlo." : null}
        </output>
      </Seccion>

      <Seccion titulo="3. Súbelo en Instagram" id="subir-instagram">
        <ul className="grid list-disc gap-1.5 pl-5 text-[1.0625rem]">
          <li>Súbelo como Reel y pega el texto.</li>
          <li>Antes de publicar, activa la etiqueta «Información de IA». Es tu avatar y tiene que decirlo.</li>
        </ul>
        <label className="mt-1 grid min-h-11 cursor-pointer grid-cols-[26px_1fr] items-center gap-2.5">
          <input
            type="checkbox"
            className="size-6 accent-acento"
            checked={etiquetaPuesta}
            onChange={(evento) => setEtiquetaPuesta(evento.target.checked)}
          />
          <span>Activé la etiqueta «Información de IA»</span>
        </label>
      </Seccion>

      <Seccion titulo="4. Avísame cuando esté arriba" id="subir-listo">
        <label className="grid gap-1.5">
          <span className="text-meta text-apagado">Enlace del reel (opcional)</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            value={enlace}
            onChange={(evento) => setEnlace(evento.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            className="min-h-12 w-full rounded-lg border-[1.5px] border-linea bg-superficie px-3.5 text-[1.0625rem] focus:border-acento"
          />
        </label>
        {confirmacion.error ? (
          <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
            {confirmacion.error}
          </p>
        ) : null}
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
      </Seccion>
    </div>
  )
}
