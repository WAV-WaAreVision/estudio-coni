import type { ReactNode } from "react"

/**
 * Decision 23: what she does with the ideas she ticked. One raised bar that floats above the bottom nav while the list
 * scrolls (globals.css places it), in the flow at large text. Only shown while something is ticked.
 */
export function BarraDeLote({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={titulo}
      data-barra-de-lote
      className="barra-de-lote sticky z-10 -mx-2 mt-2 grid gap-3 rounded-panel bg-piedra px-5 py-[14px] shadow-relieve-alto"
    >
      {children}
    </section>
  )
}
