import type { ReactNode } from "react"

/** The sunken field of globals.css (`.campo`), full width, in body size. */
export const CLASES_DE_CAMPO = "campo w-full text-cuerpo"

interface PropiedadesDeCampo {
  id: string
  etiqueta: ReactNode
  /** A line under the field; the field points at it with `aria-describedby="<id>-ayuda"`. */
  ayuda?: string
  children: ReactNode
}

/** A label, the field and an optional hint. */
export function Campo({ id, etiqueta, ayuda, children }: PropiedadesDeCampo) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-cuerpo font-semibold">
        {etiqueta}
      </label>
      {children}
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-meta text-apagado">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}
