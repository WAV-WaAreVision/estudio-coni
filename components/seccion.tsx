import type { ReactNode } from "react"

interface PropiedadesDeSeccion {
  titulo: string
  id: string
  /** The figure on the right: «2», «123 palabras · ≈ 52 s», «1 frase marcada». Text or a node. */
  cifra?: ReactNode
  /** The title says a date that moves with the clock: the visual baselines mask it. */
  varia?: boolean
  children: ReactNode
}

/** v6 `.sech` (decision 4): no rule; the label meta 600 in ink on the left, the figure meta 500 apagado on the right. */
export function Seccion({ titulo, id, cifra, varia = false, children }: PropiedadesDeSeccion) {
  return (
    <section aria-labelledby={id} className="mt-8 grid gap-3 first:mt-0">
      <div className="mx-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id={id} data-snapshot={varia ? "varia" : undefined} className="text-meta font-semibold text-tinta">
          {titulo}
        </h2>
        {cifra !== undefined ? <span className="text-meta font-medium text-apagado tabular-nums">{cifra}</span> : null}
      </div>
      {children}
    </section>
  )
}
