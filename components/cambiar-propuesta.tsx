"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Boton } from "@/components/ui/boton"
import { Grupo } from "@/components/ui/grupo"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { Resultado } from "@/lib/acciones/resultado"

const OPCION =
  "flex min-h-fila-baja w-full items-center text-left text-cuerpo font-semibold text-tinta transition-colors duration-[var(--dur-corta)] active:bg-piedra-honda aria-disabled:cursor-not-allowed aria-disabled:text-apagado"

/** `Cambiar` under a proposal (decision 25): the next free slots in line, one tap each; focus goes to the first. */
export function CambiarPropuesta({
  piezaId,
  titulo,
  alternativas,
  cambiar,
}: {
  piezaId: string
  titulo: string
  alternativas: readonly { instante: string; etiqueta: string }[]
  cambiar: (piezaId: string, instante: string) => Promise<Resultado>
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (abierto) contenedor.current?.querySelector<HTMLButtonElement>("fieldset button")?.focus()
  }, [abierto])

  if (alternativas.length === 0) return null

  function elegir(instante: string) {
    setError(null)
    empezar(async () => {
      const resultado = await cambiar(piezaId, instante)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setAbierto(false)
    })
  }

  return (
    <div ref={contenedor} className="grid gap-2 pb-3 pl-[84px]">
      {abierto ? (
        <fieldset className="grid">
          <legend className="pb-1 text-meta font-semibold">¿Qué otro día?</legend>
          <Grupo>
            {alternativas.map((alternativa) => (
              <button
                key={alternativa.instante}
                type="button"
                data-snapshot="varia"
                aria-disabled={pendiente || undefined}
                onClick={() => {
                  if (!pendiente) elegir(alternativa.instante)
                }}
                className={OPCION}
              >
                {alternativa.etiqueta}
              </button>
            ))}
          </Grupo>
          {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
          <Boton variante="callado" onClick={() => setAbierto(false)}>
            Volver
          </Boton>
        </fieldset>
      ) : (
        <Boton variante="callado" aria-label={`Cambiar la fecha de ${titulo}`} onClick={() => setAbierto(true)}>
          Cambiar
        </Boton>
      )}
    </div>
  )
}
