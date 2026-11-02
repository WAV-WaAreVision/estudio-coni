"use client"

import { useEffect } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"

// A Biblioteca screen that could not load says why in one sentence and offers the way forward (brandkit 9.6, 4m).
export default function ErrorDeLaBiblioteca({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Una pantalla de la Biblioteca no pudo cargar", error)
  }, [error])

  return (
    <div className="grid gap-4">
      <LineaDeEstado
        tipo="error"
        titulo={<strong className="font-semibold">No pude cargar la Biblioteca.</strong>}
        tituloEnTinta
        detalle="Puede ser la conexión. Si sigue pasando, avísale a Federico."
      />
      <Boton variante="secundario" onClick={reset}>
        Intentar de nuevo
      </Boton>
    </div>
  )
}
