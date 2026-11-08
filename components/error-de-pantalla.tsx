"use client"

import { type ReactNode, useEffect, useState } from "react"
import { avisarErrorDePantallaAccion } from "@/app/(app)/acciones-avisar"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { TEXTO_LE_AVISE } from "@/lib/dominio/avisar-a-federico"

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
  const [avisado, setAvisado] = useState(false)

  useEffect(() => {
    console.error(registro, error)
  }, [registro, error])

  // Issue 111: WAV hears about it without her doing anything; the screen says so only once the email went out. When it
  // cannot go out (often the same lost connection), she still has the retry and WAV still has the log above.
  useEffect(() => {
    let vigente = true
    avisarErrorDePantallaAccion(error.digest ? { registro, digest: error.digest } : { registro })
      .then((resultado) => {
        if (!resultado.ok) console.error("No pude avisarle a WAV de esta pantalla", resultado.error)
        else if (vigente) setAvisado(true)
      })
      .catch((falla: unknown) => console.error("No pude avisarle a WAV de esta pantalla", falla))
    return () => {
      vigente = false
    }
  }, [registro, error])

  return (
    <div className="grid gap-4">
      <LineaDeEstado
        tipo="error"
        titulo={<strong className="font-semibold">{titulo}</strong>}
        tituloEnTinta
        detalle={avisado ? `Puede ser la conexión. ${TEXTO_LE_AVISE}` : "Puede ser la conexión."}
      />
      <Boton variante="secundario" onClick={reintentar}>
        Intentar de nuevo
      </Boton>
    </div>
  )
}
