"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ERROR_SESION_VENCIDA, type Resultado } from "@/lib/acciones/resultado"

/** Runs a Server Action from a button: pending state, the error it returns, and back to sign in if the session ended. */
export function useAccion() {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function ejecutar<T extends object>(
    accion: () => Promise<Resultado<T>>,
    alTerminar?: (resultado: { ok: true } & T) => void,
  ) {
    setError(null)
    empezar(async () => {
      const resultado = await accion()
      if (!resultado.ok) {
        if (resultado.error === ERROR_SESION_VENCIDA) router.push("/ingreso")
        else setError(resultado.error)
        return
      }
      // The action already revalidated the screens; `alTerminar` is for what only this component knows.
      alTerminar?.(resultado)
    })
  }

  return { pendiente, error, ejecutar, limpiarError: () => setError(null) }
}
