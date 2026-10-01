"use client"

import { useEffect } from "react"
import { Boton } from "@/components/ui/boton"

// A screen that could not load says why in one sentence and offers the way forward (docs/DESIGN.md, states).
export default function ErrorDePantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Una pantalla no pudo cargar", error)
  }, [error])

  return (
    <div className="grid gap-3.5 rounded-lg bg-error-fondo p-4 text-error-tinta" role="alert">
      <p className="font-semibold text-tinta">No pude cargar esta pantalla.</p>
      <p>Puede ser la conexión. Si sigue pasando, avísale a Federico.</p>
      <Boton variante="linea" onClick={reset}>
        Intentar de nuevo
      </Boton>
    </div>
  )
}
