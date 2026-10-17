"use client"

import { useEffect } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"

// A screen that could not load says why in one sentence and offers the way forward (brandkit 9.6).
export default function ErrorDePantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Una pantalla no pudo cargar", error)
  }, [error])

  return (
    <div className="grid gap-4">
      <LineaDeEstado
        tipo="error"
        titulo={<strong className="font-semibold">No pude cargar esta pantalla.</strong>}
        tituloEnTinta
        detalle="Puede ser la conexión. Si sigue pasando, avísale a Federico."
      />
      <Boton variante="secundario" onClick={reset}>
        Intentar de nuevo
      </Boton>
    </div>
  )
}
