import { Seccion } from "@/components/seccion"
import { MAXIMO_TEXTO_LINKEDIN } from "@/lib/dominio/revision"

/**
 * The LinkedIn text on the Guion screen: read only. It is not part of gate 1; she reviews and edits it when she approves
 * the video, where she also chooses the destinations.
 */
export function TextoLinkedinEnLectura({ texto }: { texto: string }) {
  return (
    <Seccion
      titulo="Texto para LinkedIn"
      id="texto-linkedin"
      cifra={`${[...texto].length.toLocaleString("es-CL")} de ${MAXIMO_TEXTO_LINKEDIN.toLocaleString("es-CL")}`}
    >
      <p className="whitespace-pre-line text-cuerpo leading-prosa">{texto}</p>
      <p className="text-meta text-apagado">Lo revisas y editas al aprobar el video.</p>
    </Seccion>
  )
}
