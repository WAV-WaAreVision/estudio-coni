"use client"

import { useRef } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useIrA } from "@/components/use-ir-a"
import type { LoBorrado } from "@/lib/dominio/biblioteca/borrado"
import { borrarAutorAccion, borrarMaterialAccion } from "./acciones"

const ETIQUETA: Record<LoBorrado, string> = { material: "Borrar material", autor: "Borrar autor" }

/**
 * A quiet «Borrar» with no question (change 28: only «Deshacer» after acting). The action marks the row and names the
 * list with its note; this goes there and checks it landed (Next can drop it). On a refusal the button stays.
 */
export function BotonBorrar({ tipo, id }: { tipo: LoBorrado; id: string }) {
  // What started the trip: a tap inside it does not end the watch (useIrA).
  const zona = useRef<HTMLDivElement>(null)
  const { pendiente, error, ejecutar } = useAccion()
  const { ir, yendo, error: errorAlIr } = useIrA()
  const problema = error ?? errorAlIr
  return (
    <div ref={zona} className="grid justify-items-start gap-2">
      <Boton
        variante="callado"
        cargando={(pendiente || yendo) && errorAlIr === null}
        // Deleted, and only the next screen failed: a second tap would only say it again.
        deshabilitado={errorAlIr !== null}
        onClick={() => {
          if (pendiente || yendo || errorAlIr !== null) return
          ejecutar<{ destino: string }>(
            () => (tipo === "material" ? borrarMaterialAccion(id) : borrarAutorAccion(id)),
            ({ destino }) => ir(destino, zona.current),
          )
        }}
      >
        {ETIQUETA[tipo]}
      </Boton>
      {problema ? <LineaDeError>{problema}</LineaDeError> : null}
    </div>
  )
}
