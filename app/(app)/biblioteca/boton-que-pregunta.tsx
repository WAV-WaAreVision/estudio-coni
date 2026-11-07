"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import type { Resultado } from "@/lib/acciones/resultado"

interface Propiedades {
  etiqueta: string
  pregunta: string
  confirmar: string
  alConfirmar: () => Promise<Resultado>
  /** Closed for a reason said next to it (a provider's pause): it neither asks nor acts. */
  deshabilitado?: boolean
  idDeLaRazon?: string
}

/** An action that spends (D11): the question appears in line, and a refusal is said under it. */
export function BotonQuePregunta({
  etiqueta,
  pregunta,
  confirmar,
  alConfirmar,
  deshabilitado = false,
  idDeLaRazon,
}: Propiedades) {
  const [preguntando, setPreguntando] = useState(false)
  // Cancelar unmounts the question, which held the focus: it goes back to the button that asked.
  const [devolverFoco, setDevolverFoco] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const redibujar = useRedibujar()

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
        deshabilitado={deshabilitado}
        aria-describedby={deshabilitado ? idDeLaRazon : undefined}
        onClick={() => setPreguntando(true)}
      >
        {etiqueta}
      </Boton>
    )
  }
  return (
    <div className="grid gap-2">
      <ConfirmacionEnLinea
        trato="gasto"
        pregunta={pregunta}
        confirmar={confirmar}
        volver="Cancelar"
        cargando={pendiente}
        alConfirmar={() =>
          ejecutar(alConfirmar, () => {
            setPreguntando(false)
            redibujar()
          })
        }
        alVolver={() => {
          limpiarError()
          setPreguntando(false)
          setDevolverFoco(true)
        }}
      />
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
