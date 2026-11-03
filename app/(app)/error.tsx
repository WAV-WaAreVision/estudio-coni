"use client"

import { ErrorDePantalla, type PropiedadesDeError } from "@/components/error-de-pantalla"

export default function ErrorDeLaApp({ error, unstable_retry }: PropiedadesDeError) {
  return (
    <ErrorDePantalla
      error={error}
      titulo="No pude cargar esta pantalla."
      registro="Una pantalla no pudo cargar"
      reintentar={unstable_retry}
    />
  )
}
