"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { useAccion } from "@/components/use-accion"
import { descartarBorradorAccion } from "./acciones"

interface Propiedades {
  tipo: "pilar" | "red"
  id: string
  nombre: string
  /** The id of the card's title, so «Descartar» says which draft. */
  describe: string
}

/** Discarding cannot be undone from the app: it asks in line, as Desconectar does; the action lands on Borradores. */
export function BotonDescartar({ tipo, id, nombre, describe }: Propiedades) {
  const [preguntando, setPreguntando] = useState(false)
  // Cancelar unmounts the question, which held the focus: it goes back to the button that asked.
  const [devolverFoco, setDevolverFoco] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  useEffect(() => {
    if (!devolverFoco || preguntando) return
    boton.current?.focus()
    setDevolverFoco(false)
  }, [devolverFoco, preguntando])

  if (!preguntando) {
    return (
      <Boton
        ref={boton}
        variante="destructiva"
        tamano="chico"
        className="w-fit"
        aria-describedby={describe}
        onClick={() => setPreguntando(true)}
      >
        Descartar
      </Boton>
    )
  }
  return (
    <div className="basis-full">
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta={`¿Descartar «${nombre}»? ${tipo === "pilar" ? "Ya no lo podrás aprobar ni editar." : "Ya no lo podrás editar."}`}
        confirmar="Descartar"
        volver="Cancelar"
        cargando={pendiente}
        error={error}
        alConfirmar={() => ejecutar(() => descartarBorradorAccion({ tipo, id }))}
        alVolver={() => {
          limpiarError()
          setPreguntando(false)
          setDevolverFoco(true)
        }}
      />
    </div>
  )
}
