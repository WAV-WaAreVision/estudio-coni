import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PropiedadesDeSeccion {
  titulo: string
  id: string
  /** The figure on the right: «2», «123 palabras · ≈ 52 s», «1 frase marcada». Text or a node. */
  cifra?: ReactNode
  /** The title says a date that moves with the clock: the visual baselines mask it. */
  varia?: boolean
  /** `ninguno` when the container already spaces its children (a gap): the default keeps the screen's rhythm. */
  espacio?: "amplio" | "ninguno"
  /** 3 when the section sits under a heading of its own (a panel's h2). */
  nivel?: 2 | 3
  /** Placement from the screen around it (a grid column on a computer). */
  className?: string
  children: ReactNode
}

/** v6 `.sech` (decision 4): no rule; the label meta 600 in ink on the left, the figure meta 500 apagado on the right. */
export function Seccion({
  titulo,
  id,
  cifra,
  varia = false,
  espacio = "amplio",
  nivel = 2,
  className,
  children,
}: PropiedadesDeSeccion) {
  const Titulo = nivel === 3 ? "h3" : "h2"
  return (
    <section
      aria-labelledby={id}
      className={cn(espacio === "amplio" ? "mt-8 grid gap-3 first:mt-0" : "grid gap-3", className)}
    >
      <div className="mx-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <Titulo id={id} data-snapshot={varia ? "varia" : undefined} className="text-meta font-semibold text-tinta">
          {titulo}
        </Titulo>
        {cifra !== undefined ? <span className="text-meta font-medium text-apagado tabular-nums">{cifra}</span> : null}
      </div>
      {children}
    </section>
  )
}
