"use client"

import { type ReactNode, useEffect } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"

/** What an error.tsx receives from Next 16.2. */
export interface PropiedadesDeError {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry: () => void
}

interface Propiedades {
  error: Error & { digest?: string }
  titulo: ReactNode
  /** The line WAV reads in the console, next to the error. */
  registro: string
  reintentar: () => void
}

// A screen that could not load says why in one sentence and offers the way forward (brandkit 9.6). "Intentar de
// nuevo" uses unstable_retry, which fetches the segment again: reset() alone re-renders the same failed server read.
export function ErrorDePantalla({ error, titulo, registro, reintentar }: Propiedades) {
  useEffect(() => {
    console.error(registro, error)
  }, [registro, error])

  return (
    <div className="grid gap-4">
      <LineaDeEstado
        tipo="error"
        titulo={<strong className="font-semibold">{titulo}</strong>}
        tituloEnTinta
        detalle="Puede ser la conexión. Si sigue pasando, avísale a Federico."
      />
      <Boton variante="secundario" onClick={reintentar}>
        Intentar de nuevo
      </Boton>
    </div>
  )
}
