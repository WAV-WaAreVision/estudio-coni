import { Seccion } from "@/components/seccion"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { Resultado } from "@/lib/acciones/resultado"
import { type Destino, nombreDeDestino, type PublicacionConEnlace } from "@/lib/dominio/destinos"
import { SubirAMano } from "./subir-a-mano"

interface PropiedadesDePorSubir {
  piezaId: string
  version: number
  /** The caption she approved for Instagram. */
  texto: string
  /** The LinkedIn text she approved; null on a piece that never had one. */
  textoLinkedin: string | null
  publicaciones: readonly PublicacionConEnlace[]
  /** The destinations that wait for her to upload them now. */
  pendientes: readonly Destino[]
  alDescargar: (piezaId: string) => Promise<Resultado<{ url: string }>>
  alMarcar: (piezaId: string, version: number, destino: string, enlace: string) => Promise<Resultado>
}

/**
 * What waits for her to be uploaded by hand: one block per pending destination, each confirmed on its own, and a line
 * for every destination she already uploaded, with the link she pasted.
 */
export function PorSubir({
  piezaId,
  version,
  texto,
  textoLinkedin,
  publicaciones,
  pendientes,
  alDescargar,
  alMarcar,
}: PropiedadesDePorSubir) {
  const hechas = publicaciones.filter((publicacion) => publicacion.estado === "subido_a_mano")
  return (
    <>
      {pendientes.map((destino) => {
        const textoDelDestino = destino === "linkedin" ? textoLinkedin : texto
        if (textoDelDestino === null)
          throw new Error(`La pieza ${piezaId} espera subirse a LinkedIn sin texto para LinkedIn.`)
        return (
          <Seccion key={destino} titulo={`Subir a ${nombreDeDestino(destino)}`} id={`subir-${destino}`}>
            <SubirAMano
              piezaId={piezaId}
              version={version}
              destino={destino}
              texto={textoDelDestino}
              alDescargar={alDescargar}
              alMarcar={alMarcar}
            />
          </Seccion>
        )
      })}
      {hechas.length > 0 ? (
        <div className="grid gap-4">
          {hechas.map((hecha) => (
            <LineaDeEstado
              key={hecha.destino}
              tipo="exito"
              titulo={`Subido a ${nombreDeDestino(hecha.destino)}`}
              tituloEnTinta
              detalle={
                hecha.enlace ? (
                  <a
                    href={hecha.enlace}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center font-medium text-tinta underline"
                  >
                    Ver en {nombreDeDestino(hecha.destino)}
                  </a>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </>
  )
}
