"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"

interface Propiedades {
  etiqueta: string
  pregunta: string
  confirmar: string
  alConfirmar: () => Promise<Resultado>
}

/** An action that spends (D11): the question appears in line, and a refusal is said under it. */
export function BotonQuePregunta({ etiqueta, pregunta, confirmar, alConfirmar }: Propiedades) {
  const [preguntando, setPreguntando] = useState(false)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  if (!preguntando) {
    return (
      <Boton variante="secundario" tamano="chico" className="w-fit" onClick={() => setPreguntando(true)}>
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
        alConfirmar={() => ejecutar(alConfirmar, () => setPreguntando(false))}
        alVolver={() => {
          limpiarError()
          setPreguntando(false)
        }}
      />
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
