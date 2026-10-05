"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import type { MotivoDeDescarte } from "@/lib/acciones/ideas"

const MOTIVOS: { motivo: MotivoDeDescarte; texto: string }[] = [
  { motivo: "no_me_representa", texto: "No me representa" },
  { motivo: "repetida", texto: "Repetida" },
  { motivo: "debil", texto: "Débil" },
  { motivo: "otro", texto: "Otro" },
]

interface PropiedadesDeDescarte {
  ocupada: boolean
  alElegir: (motivo: MotivoDeDescarte) => void
}

/**
 * "Descartar" opens its choice in the page, not in a dialog: focus goes to the first reason, and goes back to the
 * button when she cancels. The reasons feed the next week's scores, so the choice is required.
 */
export function DescartarIdea({ ocupada, alElegir }: PropiedadesDeDescarte) {
  const [abierto, setAbierto] = useState(false)
  const [devolverFoco, setDevolverFoco] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (abierto) contenedor.current?.querySelector<HTMLButtonElement>("button")?.focus()
    else if (devolverFoco) {
      contenedor.current?.querySelector<HTMLButtonElement>("button")?.focus()
      setDevolverFoco(false)
    }
  }, [abierto, devolverFoco])

  return (
    <div ref={contenedor}>
      {abierto ? (
        <fieldset className="grid">
          <legend className="pb-1 text-meta font-semibold">¿Por qué la descartas?</legend>
          {MOTIVOS.map(({ motivo, texto }) => (
            <button
              key={motivo}
              type="button"
              aria-disabled={ocupada || undefined}
              onClick={() => {
                if (!ocupada) alElegir(motivo)
              }}
              className="min-h-14 border-b border-linea text-left text-cuerpo text-tinta active:opacity-70"
            >
              {texto}
            </button>
          ))}
          <Boton
            variante="callado"
            onClick={() => {
              setAbierto(false)
              setDevolverFoco(true)
            }}
          >
            Cancelar
          </Boton>
        </fieldset>
      ) : (
        <Boton variante="destructiva" onClick={() => setAbierto(true)}>
          Descartar
        </Boton>
      )}
    </div>
  )
}
