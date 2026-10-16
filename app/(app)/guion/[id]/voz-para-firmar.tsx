"use client"

import { Microphone } from "@phosphor-icons/react"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { CostoDeAccion, LineaDeSaldo } from "@/components/ui/costo"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { pedirVozAccion } from "../../piezas/acciones"
import { TEXTO_FALTA_VOZ, TEXTO_PREPARANDO_VOZ } from "./textos"

interface PropiedadesDeVoz {
  piezaId: string
  /** The version of the screen: a request on a piece that moved on is refused. */
  version: number
  datos: DatosDeGrabacion
  /** Which take she heard to the end. */
  alEscuchar: (clave: string) => void
}

/**
 * Gate 1's voice, above the script (design 2026-10-15, decision 3): her take of this script with "Grabar la voz de
 * nuevo", the take being made, or "Falta preparar tu voz." with "Preparar mi voz". The cost sits beside the button and
 * the balance under it; a balance or cap that does not reach disables the button and says why on that line.
 */
export function VozParaFirmar({ piezaId, version, datos, alEscuchar }: PropiedadesDeVoz) {
  const pedir = useAccion()
  const { voz, botones } = datos
  const bloqueoVoz = botones?.bloqueoVoz ?? null
  const costo = botones ? <CostoDeAccion monto={botones.montoVoz} unidad={botones.unidadVoz} /> : null
  const saldo = botones ? <LineaDeSaldo>{bloqueoVoz ?? botones.saldoVoz}</LineaDeSaldo> : null

  return (
    <Seccion titulo="Voz" id="voz">
      {datos.estado === "grabando_voz" ? (
        <p className="flex items-center gap-3 text-cuerpo font-medium">
          <PuntoTrabajando />
          {TEXTO_PREPARANDO_VOZ}
        </p>
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
                deshabilitado={bloqueoVoz !== null}
                onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, true))}
              >
                Grabar la voz de nuevo
              </Boton>
              {costo}
            </div>
            {saldo}
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <LineaDeEstado tipo="aviso" titulo={TEXTO_FALTA_VOZ} tituloEnTinta />
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <Boton
              cargando={pedir.pendiente}
              deshabilitado={bloqueoVoz !== null}
              icono={<Microphone aria-hidden="true" size={20} />}
              onClick={() => pedir.ejecutar(() => pedirVozAccion(piezaId, version, false))}
            >
              Preparar mi voz
            </Boton>
            {costo}
          </div>
          {saldo}
        </div>
      )}
      {pedir.error ? <LineaDeEstado tipo="error" titulo={pedir.error} /> : null}
    </Seccion>
  )
}
