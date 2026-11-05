"use client"

import { type ReactNode, useEffect, useRef } from "react"

/** Pixels of a CSS length such as a computed `scroll-padding`; anything else (jsdom's "", "auto") is 0. */
function pixeles(valor: string): number {
  const numero = Number.parseFloat(valor)
  return Number.isFinite(numero) ? numero : 0
}

/**
 * The compact tabs' track: when its row is wider than the screen it slides, so on arrival it brings the open section
 * into view (Temas, the last one, starts cut off on a phone). Only the track moves sideways: the page keeps its
 * vertical position. It runs again when `actual` changes (the Temas pillars keep their track, and the focus in it,
 * while Coni picks) or when the parent remounts it with a new key (the Biblioteca tabs, one per section). The Temas
 * row's pillars slide in one too.
 */
export function PistaDePestanas({
  className,
  etiqueta,
  actual,
  children,
}: {
  className: string
  /** The list's accessible name, when the track is a list of its own (the Temas pillars). */
  etiqueta?: string
  /** The open option's value: the track slides to it again whenever it changes. */
  actual?: string
  children: ReactNode
}) {
  const pista = useRef<HTMLUListElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `actual` is the signal to slide again, not read inside.
  useEffect(() => {
    const lista = pista.current
    const elegida = lista?.querySelector<HTMLElement>("[aria-current='page']")
    if (!lista || !elegida) return
    const caja = lista.getBoundingClientRect()
    const opcion = elegida.getBoundingClientRect()
    const estilo = getComputedStyle(lista)
    const izquierda = caja.left + pixeles(estilo.scrollPaddingLeft)
    const derecha = caja.right - pixeles(estilo.scrollPaddingRight)
    if (opcion.left < izquierda) lista.scrollLeft += opcion.left - izquierda
    else if (opcion.right > derecha) lista.scrollLeft += opcion.right - derecha
  }, [actual])
  return (
    <ul ref={pista} aria-label={etiqueta} className={className}>
      {children}
    </ul>
  )
}
