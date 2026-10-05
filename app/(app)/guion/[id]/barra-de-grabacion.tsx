"use client"

import { ArrowCounterClockwise, Microphone, VideoCamera } from "@phosphor-icons/react"
import { type ReactNode, useState } from "react"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Seccion } from "@/components/seccion"
import { BarraDeFirma } from "@/components/ui/barra-de-firma"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { CostoDeAccion, LineaDeSaldo } from "@/components/ui/costo"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { pedirVideoAccion, pedirVozAccion, reabrirGuionAccion } from "../../piezas/acciones"

/**
 * After gate 1 (brandkit 9.13, 9.14): the state of the piece, the voice with its secondary, whatever the screen puts
 * between (`children`: the script, the caption, the avatar), the other recording as a secondary, and the sign bar with
 * the one principal and its cost on the right. A block (balance, cap) takes the bar away: the action stays in the flow,
 * disabled, and the block reads under the header. While the voice is recorded there is no bar.
 */
export function BarraDeGrabacion({
  piezaId,
  version,
  datos,
  children,
}: {
  piezaId: string
  version: number
  datos: DatosDeGrabacion
  children?: ReactNode
}) {
  const voz = useAccion()
  const video = useAccion()
  const reabrir = useAccion()
  const [confirmando, setConfirmando] = useState(false)
  const { botones } = datos
  const grabandoVoz = datos.estado === "grabando_voz"
  const sinVoz = datos.voz === null
  const bloqueoVoz = botones?.bloqueoVoz ?? null
  const bloqueoVideo = botones?.bloqueoVideo ?? null
  const bloqueoPrincipal = sinVoz ? bloqueoVoz : bloqueoVideo
  const conBarra = !grabandoVoz && bloqueoPrincipal === null
  const error = voz.error ?? video.error ?? reabrir.error

  const pedirVideo = () => video.ejecutar(() => pedirVideoAccion(piezaId, version))
  const confirmacion = (
    <ConfirmacionEnLinea
      trato="gasto"
      pregunta={botones?.confirmacionVideo ?? "¿Grabar el video?"}
      confirmar="Sí, grabar"
      volver="Volver"
      cargando={video.pendiente}
      alConfirmar={pedirVideo}
      alVolver={() => setConfirmando(false)}
    />
  )

  const principal = (
    <div className="grid gap-2">
      <div className="grid grid-cols-[1fr_auto] items-center gap-4">
        {sinVoz ? (
          <Boton
            cargando={voz.pendiente}
            deshabilitado={bloqueoVoz !== null}
            icono={<Microphone aria-hidden="true" size={20} />}
            onClick={() => voz.ejecutar(() => pedirVozAccion(piezaId, version, false))}
          >
            Grabar voz
          </Boton>
        ) : (
          <Boton
            deshabilitado={bloqueoVideo !== null}
            icono={<VideoCamera aria-hidden="true" size={20} />}
            onClick={() => setConfirmando(true)}
          >
            Grabar video
          </Boton>
        )}
        {botones ? (
          <CostoDeAccion
            monto={sinVoz ? botones.montoVoz : botones.montoVideo}
            unidad={sinVoz ? botones.unidadVoz : botones.unidadVideo}
          />
        ) : null}
      </div>
      {botones && bloqueoPrincipal === null ? (
        <LineaDeSaldo>{sinVoz ? botones.saldoVoz : botones.saldoVideo}</LineaDeSaldo>
      ) : null}
    </div>
  )

  return (
    <div className="grid gap-0">
      {grabandoVoz ? (
        <p className="mt-6 flex items-center gap-3 text-cuerpo font-medium">
          <PuntoTrabajando />
          Grabando la voz · unos segundos
        </p>
      ) : (
        <div className="mt-6">
          <LineaDeEstado
            tipo="exito"
            titulo="Guion aprobado · falta grabar"
            detalle={sinVoz ? "Primero grabas la voz y la escuchas. Después, el video." : undefined}
          />
        </div>
      )}
      {bloqueoPrincipal !== null && !grabandoVoz ? (
        <div className="mt-4">
          <LineaDeEstado tipo="aviso" titulo={bloqueoPrincipal} tituloEnTinta />
        </div>
      ) : null}

      {datos.voz ? (
        <Seccion titulo="Voz" id="voz">
          <ReproductorVoz src={datos.voz.url} clave={datos.voz.clave} alEscuchar={() => undefined} />
          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
              <Boton
                variante="linea"
                tamano="chico"
                className="w-fit"
                cargando={voz.pendiente}
                deshabilitado={grabandoVoz || bloqueoVoz !== null}
                onClick={() => voz.ejecutar(() => pedirVozAccion(piezaId, version, true))}
              >
                Volver a grabar voz
              </Boton>
              {botones ? <CostoDeAccion monto={botones.montoVoz} unidad={botones.unidadVoz} /> : null}
            </div>
            {botones ? <LineaDeSaldo>{bloqueoVoz ?? botones.saldoVoz}</LineaDeSaldo> : null}
          </div>
        </Seccion>
      ) : null}

      {children}

      {sinVoz ? (
        <Seccion titulo="Video" id="video-grabacion">
          {confirmando ? (
            confirmacion
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                <Boton
                  variante="linea"
                  tamano="chico"
                  className="w-fit"
                  cargando={video.pendiente}
                  deshabilitado={grabandoVoz || bloqueoVideo !== null}
                  onClick={() => setConfirmando(true)}
                >
                  Grabar video
                </Boton>
                {botones ? <CostoDeAccion monto={botones.montoVideo} unidad={botones.unidadVideo} /> : null}
              </div>
              {/* A block that is already read under the header is not said twice. */}
              {botones && !(bloqueoVideo !== null && bloqueoVideo === bloqueoPrincipal) ? (
                <LineaDeSaldo>{bloqueoVideo ?? botones.saldoVideo}</LineaDeSaldo>
              ) : null}
            </div>
          )}
        </Seccion>
      ) : null}

      <div className="mt-10">
        <Boton
          variante="callado"
          cargando={reabrir.pendiente}
          deshabilitado={grabandoVoz}
          onClick={() => reabrir.ejecutar(() => reabrirGuionAccion(piezaId, version))}
        >
          <ArrowCounterClockwise aria-hidden="true" size={20} />
          Volver a revisar el guion
        </Boton>
      </div>

      {error ? (
        <div className="mt-4">
          <LineaDeEstado tipo="error" titulo={error} />
        </div>
      ) : null}

      {conBarra ? (
        <>
          <div
            aria-hidden="true"
            className="h-[calc(var(--barra-max)+var(--final-pagina)+env(safe-area-inset-bottom))]"
          />
          <BarraDeFirma etiqueta="Grabación">{!sinVoz && confirmando ? confirmacion : principal}</BarraDeFirma>
        </>
      ) : (
        <>
          {!grabandoVoz ? <div className="mt-10">{principal}</div> : null}
          <div aria-hidden="true" className="h-[var(--final-pagina)]" />
        </>
      )}
    </div>
  )
}
