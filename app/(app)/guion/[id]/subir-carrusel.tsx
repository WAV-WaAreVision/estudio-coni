"use client"

import { Check, DownloadSimple } from "@phosphor-icons/react"
import { useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"
import { Paso } from "../../video/[id]/subir-a-mano"

const IR_A_LA_DESCARGA = (url: string) => window.location.assign(url)

/**
 * The manual upload of a carousel (decision P1): the approved PDF from R2 to her phone through a ten-minute link, the
 * signed post text, LinkedIn's document upload, and "Ya lo subí" with the link (today's subido_a_mano).
 */
export function SubirCarruselAMano({
  piezaId,
  version,
  texto,
  alDescargar,
  alMarcar,
  alIrA = IR_A_LA_DESCARGA,
}: {
  piezaId: string
  version: number
  texto: string
  alDescargar: (piezaId: string) => Promise<Resultado<{ url: string }>>
  alMarcar: (piezaId: string, version: number, destino: string, enlace: string) => Promise<Resultado>
  alIrA?: (url: string) => void
}) {
  const [enlace, setEnlace] = useState("")
  const [copia, setCopia] = useState<"nada" | "copiado" | "fallo">("nada")
  const descarga = useAccion()
  const confirmacion = useAccion()
  const idEnlace = useId()

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
      <Paso numero={1} titulo="Descarga el PDF">
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
          Descargar PDF
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
      <Paso numero={3} titulo="Súbelo en LinkedIn">
        <p className="text-cuerpo">
          Crea una publicación, toca «Agregar un documento», sube el PDF y pega el texto. Como título del documento usa
          la portada.
        </p>
      </Paso>
      <Paso numero={4} titulo="Avísame cuando esté arriba">
        <label htmlFor={idEnlace} className="text-meta font-semibold">
          Enlace de la publicación en LinkedIn (opcional)
        </label>
        <input
          id={idEnlace}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={enlace}
          onChange={(evento) => setEnlace(evento.target.value)}
          placeholder="https://www.linkedin.com/posts/..."
          className="campo w-full text-cuerpo"
        />
        {confirmacion.error ? <LineaDeEstado tipo="error" titulo={confirmacion.error} /> : null}
        <Boton
          variante="primario"
          cargando={confirmacion.pendiente}
          onClick={() => confirmacion.ejecutar(() => alMarcar(piezaId, version, "linkedin", enlace))}
        >
          Ya lo subí a LinkedIn
        </Boton>
      </Paso>
    </ol>
  )
}
