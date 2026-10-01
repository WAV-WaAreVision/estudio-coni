import type { ReactNode } from "react"

/** A titled part of a screen. Titles are plain sentences, never small caps over a heading (DESIGN.md, Typography). */
export function Seccion({ titulo, id, children }: { titulo: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h2 id={id} className="text-label font-semibold text-apagado">
        {titulo}
      </h2>
      {children}
    </section>
  )
}
