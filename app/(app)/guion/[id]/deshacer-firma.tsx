"use client"

import { ArrowCounterClockwise } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { PildoraDeEstado } from "@/components/ui/estado"
import { ICONO } from "@/components/ui/icono"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import { useAccion } from "@/components/use-accion"
import { deshacerAprobacionAccion } from "../../piezas/acciones"
import { TEXTO_DESHAZLO, TEXTO_GRABANDO, TEXTO_GRABANDO_DETALLE, textoGraboEn } from "./textos"

/**
 * After the signature (design 2026-10-16, decision 10), in the page: while the undo window lasts, "Firmaste", "Grabo tu
 * video en N s" and "Deshacer", focused; then, or on a later visit, the recording going on. The version she signed at
 * and the time left are kept from the first render: the screen refreshes every 4 s, and once the render claims the
 * piece the row's version moves on; the undo must send the signed version so the lock refuses a late one. After an
 * undo the Guion screen opens again with its own toast (`?deshecho=1`).
 */
export function DeshacerFirma({ piezaId, version, quedanMs }: { piezaId: string; version: number; quedanMs: number }) {
  const router = useRouter()
  const deshacer = useAccion()
  const [firmada] = useState(version)
  const [duracionMs] = useState(quedanMs)
  const [abierta, setAbierta] = useState(quedanMs > 0)
  const boton = useRef<HTMLButtonElement>(null)
  // A refused undo closes the window: the refusal is said in its place.
  if (deshacer.error !== null && abierta) setAbierta(false)

  useEffect(() => {
    if (abierta) boton.current?.focus()
  }, [abierta])

  useEffect(() => {
    // An undo on its way decides how the window ends; the timer must not close it first.
    if (!abierta || deshacer.pendiente) return
    const temporizador = setTimeout(() => setAbierta(false), duracionMs)
    return () => clearTimeout(temporizador)
  }, [abierta, deshacer.pendiente, duracionMs])

  if (abierta)
    return (
      <output className="grid justify-items-start gap-2.5">
        <PildoraDeEstado tipo="ok">Firmaste</PildoraDeEstado>
        <p className="mt-1 text-pieza">{textoGraboEn(duracionMs)}</p>
        <p className="text-cuerpo text-apagado">{TEXTO_DESHAZLO}</p>
        <Boton
          ref={boton}
          variante="secundario"
          tamano="chico"
          cargando={deshacer.pendiente}
          icono={<ArrowCounterClockwise aria-hidden="true" size={ICONO.medio} />}
          onClick={() =>
            deshacer.ejecutar(
              () => deshacerAprobacionAccion(piezaId, firmada),
              () => router.replace(`/guion/${piezaId}?deshecho=1`),
            )
          }
        >
          {deshacer.pendiente ? "Deshaciendo…" : "Deshacer"}
        </Boton>
      </output>
    )

  return (
    <div className="grid justify-items-start gap-2.5">
      <PildoraDeEstado tipo="ok">Firmaste</PildoraDeEstado>
      {deshacer.error ? <Bloque tipo="error" titulo={deshacer.error} className="w-full" /> : null}
      <output className="mt-1 flex items-center gap-3 text-pieza">
        <PuntoTrabajando />
        {TEXTO_GRABANDO}
      </output>
      <p className="text-cuerpo text-apagado">{TEXTO_GRABANDO_DETALLE}</p>
    </div>
  )
}
