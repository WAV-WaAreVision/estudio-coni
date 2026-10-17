"use client"

import { Info } from "@phosphor-icons/react"
import { useId } from "react"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { ICONO } from "@/components/ui/icono"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { separarParaConi } from "@/lib/diseno/para-coni"
import { pedirVozAccion } from "../../piezas/acciones"
import {
  separarFallaDeVoz,
  TEXTO_FALTA_VOZ,
  TEXTO_GUARDA_ANTES_DE_VOZ,
  TEXTO_PREPARANDO_VOZ,
  TEXTO_REINTENTA_VOZ,
  TEXTO_SIN_SALDO_VOZ,
} from "./textos"

interface PropiedadesDeVoz {
  piezaId: string
  /** The version of the screen: a request on a piece that moved on is refused. */
  version: number
  datos: DatosDeGrabacion
  /** Why the last voice could not be made; given only when there is no voice. */
  explicacion: string | null
  /** Which take she heard to the end. */
  alEscuchar: (clave: string) => void
  /** The editor holds changes she has not saved: a voice now would speak the old text and lose her draft. */
  sinGuardar: boolean
}

/** Why the voice buttons are closed, if they are: unsaved changes first, else what does not reach. */
function razonDeVoz(datos: DatosDeGrabacion, sinGuardar: boolean): string | null {
  if (sinGuardar) return TEXTO_GUARDA_ANTES_DE_VOZ
  return datos.botones?.bloqueoVoz ?? null
}

/**
 * Under a voice button: its reason when it is closed, in her words, and the ElevenLabs numbers (the balance, a reason
 * that names the provider) folded for WAV.
 */
function LineaBajoElBoton({
  id,
  razon,
  datos,
  paraWav = [],
}: {
  id: string
  razon: string | null
  datos: DatosDeGrabacion
  /** WAV's lines of the block above (a provider's reason for the failed voice): one fold per block, not two. */
  paraWav?: readonly string[]
}) {
  const para = separarParaConi(razon ?? "", TEXTO_SIN_SALDO_VOZ, [
    ...paraWav,
    ...(datos.botones ? [datos.botones.saldoVoz] : []),
  ])
  return (
    <>
      {razon !== null ? (
        <p id={id} className="flex items-start gap-2 text-meta font-medium text-tinta">
          <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
          {para.texto}
        </p>
      ) : null}
      {para.detalle.length > 0 ? <DetalleParaWav lineas={para.detalle} proveedor={para.proveedor} /> : null}
    </>
  )
}

/**
 * Decision 9, step 4: "1. Escucha tu voz". Her take of this script in the player, the take being made as a working
 * line, or, without a voice, a block with "Preparar mi voz" and its cost (an error block when the last one failed).
 */
export function VozParaFirmar({ piezaId, version, datos, explicacion, alEscuchar, sinGuardar }: PropiedadesDeVoz) {
  const pedir = useAccion()
  const idRazon = useId()
  const { voz, botones } = datos
  const razon = razonDeVoz(datos, sinGuardar)
  const falla = explicacion ? separarFallaDeVoz(explicacion) : null
  const detalleDeFalla = falla?.detalle ? separarParaConi(falla.detalle, TEXTO_REINTENTA_VOZ) : null

  return (
    <Seccion titulo="1. Escucha tu voz" id="voz">
      {datos.estado === "grabando_voz" ? (
        <output className="flex items-center gap-3 text-boton font-semibold">
          <PuntoTrabajando />
          {TEXTO_PREPARANDO_VOZ}
        </output>
      ) : voz ? (
        // Keyed by the take: "she heard it" belongs to one file, and a new take starts unheard.
        <ReproductorVoz key={voz.clave} src={voz.url} clave={voz.clave} alEscuchar={() => alEscuchar(voz.clave)} />
      ) : (
        <Bloque
          tipo={falla ? "error" : "neutro"}
          grande
          titulo={falla ? falla.titulo : TEXTO_FALTA_VOZ}
          accion={
            <div className="grid gap-2">
              <Boton
                precio={botones?.montoVoz}
                cargando={pedir.pendiente}
                deshabilitado={razon !== null}
                aria-describedby={razon !== null ? idRazon : undefined}
                onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, false))}
              >
                Preparar mi voz
              </Boton>
              <LineaBajoElBoton id={idRazon} razon={razon} datos={datos} paraWav={detalleDeFalla?.detalle} />
            </div>
          }
        >
          {detalleDeFalla?.texto}
        </Bloque>
      )}
      {pedir.error ? <Bloque tipo="error" titulo={pedir.error} /> : null}
    </Seccion>
  )
}

/** Inside "Editar el guion" (decision 9, step 5): a new take of the same text, its cost on the right. */
export function GrabarDeNuevo({
  piezaId,
  version,
  datos,
  sinGuardar,
}: Pick<PropiedadesDeVoz, "piezaId" | "version" | "datos" | "sinGuardar">) {
  const pedir = useAccion()
  const idRazon = useId()
  const razon = razonDeVoz(datos, sinGuardar)
  return (
    <div className="grid gap-2">
      <Boton
        variante="secundario"
        tamano="chico"
        className="w-full"
        precio={datos.botones?.montoVoz}
        cargando={pedir.pendiente}
        deshabilitado={razon !== null}
        aria-describedby={razon !== null ? idRazon : undefined}
        onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, true))}
      >
        Grabar la voz de nuevo
      </Boton>
      <LineaBajoElBoton id={idRazon} razon={razon} datos={datos} />
      {pedir.error ? <Bloque tipo="error" titulo={pedir.error} /> : null}
    </div>
  )
}
