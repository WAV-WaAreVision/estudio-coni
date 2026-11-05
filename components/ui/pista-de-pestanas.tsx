"use client"

import { type ReactNode, useEffect, useRef } from "react"

/**
 * The compact tabs' track: when its row is wider than the screen it slides, so on arrival it brings the open section
 * into view (Temas, the last one, starts cut off on a phone). It runs again when `actual` changes (the Temas pillars
 * keep their track, and the focus in it, while Coni picks) or when the parent remounts it with a new key (the
 * Biblioteca tabs, one per section).
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
    // jsdom has no scrollIntoView: the optional call keeps the unit tests about the markup alone.
    pista.current
      ?.querySelector<HTMLElement>("[aria-current='page']")
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [actual])
  return (
    <ul ref={pista} aria-label={etiqueta} className={className}>
      {children}
    </ul>
  )
}
