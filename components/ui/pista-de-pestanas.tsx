"use client"

import { type ReactNode, useEffect, useRef } from "react"

/**
 * The compact tabs' track: when its row is wider than the screen it slides, so on arrival it brings the open section
 * into view (Temas, the last one, starts cut off on a phone). Keyed by the section, so it runs again on each one. The
 * Temas row's pillars slide in one too.
 */
export function PistaDePestanas({
  className,
  etiqueta,
  children,
}: {
  className: string
  /** The list's accessible name, when the track is a list of its own (the Temas pillars). */
  etiqueta?: string
  children: ReactNode
}) {
  const pista = useRef<HTMLUListElement>(null)
  useEffect(() => {
    // jsdom has no scrollIntoView: the optional call keeps the unit tests about the markup alone.
    pista.current
      ?.querySelector<HTMLElement>("[aria-current='page']")
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [])
  return (
    <ul ref={pista} aria-label={etiqueta} className={className}>
      {children}
    </ul>
  )
}
