"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { useAccion } from "@/components/use-accion"
import { useIrA } from "@/components/use-ir-a"
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
  // The question that started the trip: a tap on it does not end the watch (useIrA).
  const pregunta = useRef<HTMLDivElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  // The action names Borradores with its note; this goes there and checks it landed (Next can drop it).
  const { ir, yendo, error: errorAlIr } = useIrA()

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
    <div ref={pregunta} className="basis-full">
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta={`¿Descartar «${nombre}»? ${tipo === "pilar" ? "Ya no lo podrás aprobar ni editar." : "Ya no lo podrás editar."}`}
        confirmar="Descartar"
        volver="Cancelar"
        cargando={(pendiente || yendo) && errorAlIr === null}
        deshabilitado={errorAlIr !== null}
        error={error ?? errorAlIr}
        alConfirmar={() => {
          // Busy, or done and only the next screen failed: a second tap would discard it twice.
          if (pendiente || yendo || errorAlIr !== null) return
          ejecutar<{ destino: string }>(
            () => descartarBorradorAccion({ tipo, id }),
            ({ destino }) => ir(destino, pregunta.current),
          )
        }}
        alVolver={() => {
          limpiarError()
          setPreguntando(false)
          setDevolverFoco(true)
        }}
      />
    </div>
  )
}
