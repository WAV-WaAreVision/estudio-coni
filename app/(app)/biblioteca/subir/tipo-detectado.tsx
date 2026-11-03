"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ETIQUETA_DE_TIPO, esTipo, TIPOS_DE_MATERIAL, type TipoDeMaterial } from "@/lib/dominio/biblioteca/modelo"
import type { Deteccion } from "@/lib/dominio/biblioteca/subir"
import { Campo, CLASES_DE_CAMPO } from "../campo"

interface Propiedades {
  efectivo: Deteccion | null
  ocupado: boolean
  alElegir: (tipo: TipoDeMaterial) => void
}

/** What the field understood, said as a fact she can correct: "Tipo: Video de YouTube · Cambiar" (4k). */
export function TipoDetectado({ efectivo, ocupado, alElegir }: Propiedades) {
  const [abierto, setAbierto] = useState(false)
  const selector = useRef<HTMLSelectElement>(null)
  const id = useId()

  // "Cambiar" unmounts when the select opens: the focus moves to the select, which only exists after that render.
  useEffect(() => {
    if (abierto) selector.current?.focus()
  }, [abierto])

  if (!efectivo) return null

  if (abierto) {
    // The select stays after a change: a keyboard walks the types with the arrows, each one a change.
    return (
      <Campo id={`${id}-tipo`} etiqueta="Tipo">
        <select
          ref={selector}
          id={`${id}-tipo`}
          value={efectivo.tipo}
          disabled={ocupado}
          onChange={(evento) => {
            if (esTipo(evento.target.value)) alElegir(evento.target.value)
          }}
          className={CLASES_DE_CAMPO}
        >
          {TIPOS_DE_MATERIAL.map((tipo) => (
            <option key={tipo} value={tipo}>
              {ETIQUETA_DE_TIPO[tipo]}
            </option>
          ))}
        </select>
      </Campo>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p className="text-cuerpo">{`Tipo: ${efectivo.etiqueta}`}</p>
      <span aria-hidden="true" className="text-apagado">
        ·
      </span>
      <Boton variante="callado" aria-label="Cambiar el tipo" deshabilitado={ocupado} onClick={() => setAbierto(true)}>
        Cambiar
      </Boton>
    </div>
  )
}
