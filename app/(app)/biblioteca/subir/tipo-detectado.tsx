"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Eleccion } from "@/components/ui/filas"
import { ETIQUETA_DE_TIPO, TIPOS_DE_MATERIAL, type TipoDeMaterial } from "@/lib/dominio/biblioteca/modelo"
import type { Deteccion } from "@/lib/dominio/biblioteca/subir"

interface Propiedades {
  efectivo: Deteccion | null
  ocupado: boolean
  alElegir: (tipo: TipoDeMaterial) => void
}

/** What the field understood, said as a fact she can correct: "Tipo: Video de YouTube · Cambiar" (4k). */
export function TipoDetectado({ efectivo, ocupado, alElegir }: Propiedades) {
  const [abierto, setAbierto] = useState(false)
  const [devolverFoco, setDevolverFoco] = useState(false)
  const cambiar = useRef<HTMLButtonElement>(null)
  const grupo = useId()

  // Choosing unmounts the radios: the focus goes back to "Cambiar", which only exists after that render.
  useEffect(() => {
    if (!devolverFoco || abierto) return
    cambiar.current?.focus()
    setDevolverFoco(false)
  }, [devolverFoco, abierto])

  if (!efectivo) return null

  if (abierto) {
    return (
      <fieldset className="elecciones grid">
        <legend className="text-cuerpo font-semibold">¿Qué tipo de material es?</legend>
        {TIPOS_DE_MATERIAL.map((tipo) => (
          <Eleccion
            key={tipo}
            nombre={grupo}
            valor={tipo}
            elegido={efectivo.tipo === tipo}
            etiqueta={ETIQUETA_DE_TIPO[tipo]}
            alElegir={() => {
              alElegir(tipo)
              setAbierto(false)
              setDevolverFoco(true)
            }}
          />
        ))}
      </fieldset>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p className="text-cuerpo">{`Tipo: ${efectivo.etiqueta}`}</p>
      <span aria-hidden="true" className="text-apagado">
        ·
      </span>
      <Boton
        ref={cambiar}
        variante="callado"
        aria-label="Cambiar el tipo"
        deshabilitado={ocupado}
        onClick={() => setAbierto(true)}
      >
        Cambiar
      </Boton>
    </div>
  )
}
