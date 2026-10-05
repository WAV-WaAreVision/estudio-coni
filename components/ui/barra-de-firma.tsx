import type { ReactNode } from "react"

interface PropiedadesDeBarra {
  etiqueta: string
  /** One short line under the action; a node is accepted so a reason can carry its icon. */
  linea?: ReactNode
  children: ReactNode
}

/**
 * Brandkit 9.13: the one elevated bar, fixed at the bottom of Guion and Video, with one action and one line. The screen
 * adds its own bottom padding (`--barra-max` plus `--final-pagina`) so the bar never covers its last control.
 */
export function BarraDeFirma({ etiqueta, linea, children }: PropiedadesDeBarra) {
  return (
    <section aria-label={etiqueta} className="fixed inset-x-0 bottom-0 z-10 bg-superficie shadow-barra">
      <div className="mx-auto grid max-w-[560px] gap-2 px-5 pt-3 pb-[calc(8px+env(safe-area-inset-bottom))]">
        {children}
        {linea ? <p className="text-meta text-apagado">{linea}</p> : null}
      </div>
    </section>
  )
}
