"use client"

import { useState } from "react"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Boton } from "@/components/ui/boton"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { pedirVideoAccion, pedirVozAccion, reabrirGuionAccion } from "../../piezas/acciones"

/** After gate 1: her voice alone first if she wants it, then the video. Each button says what it costs and what is left. */
export function BarraDeGrabacion({
  piezaId,
  version,
  datos,
}: {
  piezaId: string
  version: number
  datos: DatosDeGrabacion
}) {
  const voz = useAccion()
  const video = useAccion()
  const reabrir = useAccion()
  const [confirmando, setConfirmando] = useState(false)
  const { botones } = datos
  const grabandoVoz = datos.estado === "grabando_voz"
  const bloqueoVoz = botones?.bloqueoVoz ?? null
  const bloqueoVideo = botones?.bloqueoVideo ?? null
  const error = voz.error ?? video.error ?? reabrir.error

  return (
    <div className="grid gap-3 border-t border-linea pt-4">
      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        {datos.voz ? <ReproductorVoz src={datos.voz.url} clave={datos.voz.clave} alEscuchar={() => undefined} /> : null}
        <Boton
          variante={datos.voz ? "linea" : "primario"}
          cargando={voz.pendiente}
          deshabilitado={grabandoVoz || bloqueoVoz !== null}
          onClick={() => voz.ejecutar(() => pedirVozAccion(piezaId, version, datos.voz !== null))}
        >
          {grabandoVoz ? "Grabando la voz…" : datos.voz ? "Volver a grabar voz" : "Grabar voz"}
        </Boton>
        {botones ? (
          <>
            <p className="text-center text-meta text-apagado">{botones.costoVoz}</p>
            <p className="text-center text-meta text-apagado">{bloqueoVoz ?? botones.saldoVoz}</p>
          </>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        {confirmando ? (
          <div className="grid gap-2 rounded-md bg-acento-suave p-3.5">
            <p className="text-[1rem]">{botones?.confirmacionVideo ?? "¿Grabar el video?"}</p>
            <Boton cargando={video.pendiente} onClick={() => video.ejecutar(() => pedirVideoAccion(piezaId, version))}>
              Sí, grabar
            </Boton>
            <Boton variante="callado" onClick={() => setConfirmando(false)}>
              Volver
            </Boton>
          </div>
        ) : (
          <Boton deshabilitado={grabandoVoz || bloqueoVideo !== null} onClick={() => setConfirmando(true)}>
            Grabar video
          </Boton>
        )}
        {botones ? (
          <>
            <p className="text-center text-meta text-apagado">{botones.costoVideo}</p>
            <p className="text-center text-meta text-apagado">{bloqueoVideo ?? botones.saldoVideo}</p>
          </>
        ) : null}
      </div>

      <Boton
        variante="callado"
        cargando={reabrir.pendiente}
        deshabilitado={grabandoVoz}
        onClick={() => reabrir.ejecutar(() => reabrirGuionAccion(piezaId, version))}
      >
        Volver a revisar el guion
      </Boton>
    </div>
  )
}
