"use client"

import { ErrorDePantalla, type PropiedadesDeError } from "@/components/error-de-pantalla"

// A Biblioteca screen that could not load (4m).
export default function ErrorDeLaBiblioteca({ error, unstable_retry }: PropiedadesDeError) {
  return (
    <ErrorDePantalla
      error={error}
      titulo="No pude cargar la Biblioteca."
      registro="Una pantalla de la Biblioteca no pudo cargar"
      reintentar={unstable_retry}
    />
  )
}
