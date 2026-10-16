import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PropiedadesDeGrupo {
  children: ReactNode
  /** Rows that open nothing: flat on piedra-alta instead of raised. */
  plano?: boolean
  /** The rows are list items. */
  lista?: boolean
  className?: string
}

/** Decision 4: rows that open something live in a raised group, divided by 1 px hairlines; the group has no rule. */
export function Grupo({ children, plano = false, lista = false, className }: PropiedadesDeGrupo) {
  const clases = cn(
    "divide-y divide-hilo rounded-panel px-[18px]",
    plano ? "bg-piedra-alta" : "bg-piedra shadow-relieve",
    className,
  )
  return lista ? (
    <ul data-contorno={plano || undefined} className={clases}>
      {children}
    </ul>
  ) : (
    <div data-contorno={plano || undefined} className={clases}>
      {children}
    </div>
  )
}
