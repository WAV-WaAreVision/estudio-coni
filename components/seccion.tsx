import type { ReactNode } from "react"

interface PropiedadesDeSeccion {
  titulo: string
  id: string
  /** The figure on the right axis: «2», «123 palabras · ≈ 52 s». Text or a node (for «Bien» with its check). */
  cifra?: ReactNode
  children: ReactNode
}

/** Brandkit 9.2: a 1 px ink rule opens the section; label 15/600 left, figure 15 apagado right. */
export function Seccion({ titulo, id, cifra, children }: PropiedadesDeSeccion) {
  return (
    <section aria-labelledby={id} className="mt-10 grid gap-2 first:mt-0">
      <div className="flex items-baseline justify-between gap-4 border-t border-tinta pt-3">
        <h2 id={id} className="text-meta font-semibold text-tinta">
          {titulo}
        </h2>
        {cifra !== undefined ? <span className="text-meta text-apagado tabular-nums">{cifra}</span> : null}
      </div>
      {children}
    </section>
  )
}
