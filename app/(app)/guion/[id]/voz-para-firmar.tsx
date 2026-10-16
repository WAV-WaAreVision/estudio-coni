"use client"

import { Info, Microphone } from "@phosphor-icons/react"
import { useId } from "react"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { CostoDeAccion, LineaDeSaldo } from "@/components/ui/costo"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { pedirVozAccion } from "../../piezas/acciones"
import { TEXTO_FALTA_VOZ, TEXTO_GUARDA_ANTES_DE_VOZ, TEXTO_PREPARANDO_VOZ } from "./textos"

interface PropiedadesDeVoz {
  piezaId: string
  /** The version of the screen: a request on a piece that moved on is refused. */
  version: number
  datos: DatosDeGrabacion
  /** Which take she heard to the end. */
  alEscuchar: (clave: string) => void
  /** The editor holds changes she has not saved: a voice now would speak the old text and lose her draft. */
  sinGuardar: boolean
}

/**
 * Gate 1's voice, above the script (design 2026-10-15, decision 3): her take of this script with "Grabar la voz de
 * nuevo", the take being made, or "Falta preparar tu voz." with "Preparar mi voz". The cost sits beside the button and
 * the balance under it; a balance or cap that does not reach disables the button and says why on that line.
 */
export function VozParaFirmar({ piezaId, version, datos, alEscuchar, sinGuardar }: PropiedadesDeVoz) {
  const pedir = useAccion()
  const idRazon = useId()
  const { voz, botones } = datos
  const bloqueoVoz = botones?.bloqueoVoz ?? null
  const cerrado = sinGuardar || bloqueoVoz !== null
  const descrito = cerrado ? idRazon : undefined
  const costo = botones ? <CostoDeAccion monto={botones.montoVoz} unidad={botones.unidadVoz} /> : null
  // One reason describes the buttons: unsaved changes first, else what does not reach (on the balance line).
  const saldo = botones ? (
    <LineaDeSaldo id={!sinGuardar && bloqueoVoz !== null ? idRazon : undefined}>
      {bloqueoVoz ?? botones.saldoVoz}
    </LineaDeSaldo>
  ) : null
  const razonSinGuardar = sinGuardar ? (
    <p id={idRazon} className="flex items-start gap-2 text-meta font-medium text-tinta">
      <Info aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
      {TEXTO_GUARDA_ANTES_DE_VOZ}
    </p>
  ) : null

  return (
    <Seccion titulo="Voz" id="voz">
      {datos.estado === "grabando_voz" ? (
        <output className="flex items-center gap-3 text-cuerpo font-medium">
          <PuntoTrabajando />
          {TEXTO_PREPARANDO_VOZ}
        </output>
      ) : voz ? (
        <>
          {/* Keyed by the take: the player's "she heard it" belongs to one file, and a new take starts unheard. */}
          <ReproductorVoz key={voz.clave} src={voz.url} clave={voz.clave} alEscuchar={() => alEscuchar(voz.clave)} />
          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
              <Boton
                variante="linea"
                tamano="chico"
                className="w-fit"
                cargando={pedir.pendiente}
                deshabilitado={cerrado}
                aria-describedby={descrito}
                onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, true))}
              >
                Grabar la voz de nuevo
              </Boton>
              {costo}
            </div>
            {saldo}
            {razonSinGuardar}
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <LineaDeEstado tipo="aviso" titulo={TEXTO_FALTA_VOZ} tituloEnTinta />
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <Boton
              cargando={pedir.pendiente}
              deshabilitado={cerrado}
              aria-describedby={descrito}
              icono={<Microphone aria-hidden="true" size={20} />}
              onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, false))}
            >
              Preparar mi voz
            </Boton>
            {costo}
          </div>
          {saldo}
          {razonSinGuardar}
        </div>
      )}
      {pedir.error ? <LineaDeEstado tipo="error" titulo={pedir.error} /> : null}
    </Seccion>
  )
}
