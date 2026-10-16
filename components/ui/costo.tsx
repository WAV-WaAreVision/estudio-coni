import type { ReactNode } from "react"

/** Brandkit 9.14: the cost sits to the right of its action, in two right-aligned tabular lines. */
export function CostoDeAccion({ monto, unidad }: { monto: string; unidad: string }) {
  return (
    <div className="grid text-right">
      <span className="text-pieza tabular-nums">{monto}</span>
      <span className="text-meta text-apagado tabular-nums">{unidad}</span>
    </div>
  )
}

/** The balance under its action, left aligned and whole: its explanation never leaves its figure. */
export function LineaDeSaldo({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} data-snapshot="varia" className="text-meta text-apagado">
      {children}
    </p>
  )
}
