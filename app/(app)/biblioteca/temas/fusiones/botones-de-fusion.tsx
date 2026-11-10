"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useIrA } from "@/components/use-ir-a"
import type { Resultado } from "@/lib/acciones/resultado"
import { BOTONES_DE_VEREDICTO, preguntaDeDeshacer, TEXTOS_DE_FUSIONES } from "@/lib/dominio/fusiones"
import { decidirFusionAccion, deshacerFusionAccion, unirTemasAccion } from "./acciones"

const ACCIONES = "flex flex-wrap items-start gap-3"

/** An action that answers Fusiones with its note; useIrA goes there and checks it landed (Next can drop it). */
function useHaciaFusiones() {
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const { ir, yendo, error: errorAlIr } = useIrA()
  const lugar = useRef<HTMLDivElement>(null)
  // Busy, or done and only the next screen failed: a second tap would run it twice.
  const ocupado = pendiente || yendo || errorAlIr !== null
  function correr(accion: () => Promise<Resultado<{ destino: string }>>) {
    if (ocupado) return
    ejecutar<{ destino: string }>(accion, ({ destino }) => ir(destino, lugar.current))
  }
  return {
    lugar,
    ocupado,
    cargando: (pendiente || yendo) && errorAlIr === null,
    error: error ?? errorAlIr,
    correr,
    limpiarError,
  }
}

/** The three answers to a proposal (spec, «Para que decidas»). All secondary: the page may hold several proposals. */
export function DecidirFusion({ id, describe }: { id: string; describe: string }) {
  const { lugar, ocupado, error, correr } = useHaciaFusiones()
  return (
    <div ref={lugar} className="grid gap-2">
      <div className={ACCIONES}>
        {BOTONES_DE_VEREDICTO.map(({ veredicto, etiqueta }) => (
          <Boton
            key={veredicto}
            variante="secundario"
            tamano="chico"
            className="w-fit"
            aria-describedby={describe}
            deshabilitado={ocupado}
            onClick={() => correr(() => decidirFusionAccion({ id, veredicto }))}
          >
            {etiqueta}
          </Boton>
        ))}
      </div>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}

/** Undoing asks in line first (as Descartar does); a refusal says why under the question. */
export function DeshacerFusion({
  id,
  ganador,
  perdedor,
  describe,
}: {
  id: string
  ganador: string
  perdedor: string
  describe: string
}) {
  const [preguntando, setPreguntando] = useState(false)
  // Cancelar unmounts the question, which held the focus: it goes back to the button that asked.
  const [devolverFoco, setDevolverFoco] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const { lugar, ocupado, cargando, error, correr, limpiarError } = useHaciaFusiones()

  useEffect(() => {
    if (!devolverFoco || preguntando) return
    boton.current?.focus()
    setDevolverFoco(false)
  }, [devolverFoco, preguntando])

  if (!preguntando) {
    return (
      <Boton
        ref={boton}
        variante="secundario"
        tamano="chico"
        className="w-fit"
        aria-describedby={describe}
        onClick={() => setPreguntando(true)}
      >
        {TEXTOS_DE_FUSIONES.deshacer}
      </Boton>
    )
  }
  return (
    <div ref={lugar} className="grid gap-2">
      <ConfirmacionEnLinea
        trato="neutro"
        pregunta={preguntaDeDeshacer(ganador, perdedor)}
        confirmar={TEXTOS_DE_FUSIONES.confirmarDeshacer}
        volver={TEXTOS_DE_FUSIONES.volver}
        cargando={cargando}
        deshabilitado={ocupado && !cargando}
        alConfirmar={() => correr(() => deshacerFusionAccion({ id }))}
        alVolver={() => {
          limpiarError()
          setPreguntando(false)
          setDevolverFoco(true)
        }}
      />
      {/* The neutral confirmation has no error line of its own. */}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}

export function UnirIgual({ a, b, describe }: { a: string; b: string; describe: string }) {
  const { lugar, ocupado, error, correr } = useHaciaFusiones()
  return (
    <div ref={lugar} className="grid gap-2">
      <Boton
        variante="secundario"
        tamano="chico"
        className="w-fit"
        aria-describedby={describe}
        deshabilitado={ocupado}
        onClick={() => correr(() => unirTemasAccion({ a, b }))}
      >
        {TEXTOS_DE_FUSIONES.unirIgual}
      </Boton>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
