import type { ReactNode } from "react"

/** The balance under its action, left aligned and whole: its explanation never leaves its figure. */
export function LineaDeSaldo({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} data-snapshot="varia" className="text-meta text-apagado">
      {children}
    </p>
  )
}
