import { Check, Info } from "@phosphor-icons/react/dist/ssr"
import { Fragment, type ReactNode } from "react"
import { ICONO } from "./icono"

interface PropiedadesDeBarra {
  /** Above the track: an action error, a blocking block or the "Falta:" line. */
  arriba?: ReactNode
  /** Under the track, centred: what the signature does. Its id describes the track. */
  consecuencia?: string
  idConsecuencia?: string
  /** The consequence says a date that moves with the clock: the visual baselines mask it. */
  consecuenciaVaria?: boolean
  /** The track. */
  children: ReactNode
}

/**
 * Decisions 5 and 6: the one high bar of a signing screen. Sticky at the bottom, as the screen's last element: it sits
 * in the flow at the end of the page, so the page keeps no padding for it. Static at large text (Task 45).
 */
export function BarraDeFirma({
  arriba,
  consecuencia,
  idConsecuencia,
  consecuenciaVaria = false,
  children,
}: PropiedadesDeBarra) {
  return (
    <section
      aria-label="Firma"
      data-barra-de-firma
      className="barra-de-firma sticky bottom-0 z-10 -mx-5 mt-8 grid gap-3 rounded-t-barra bg-piedra px-5 pt-[14px] pb-[calc(14px+env(safe-area-inset-bottom))] shadow-relieve-alto-fijo"
    >
      {arriba}
      {children}
      {consecuencia ? (
        <p
          id={idConsecuencia}
          data-snapshot={consecuenciaVaria ? "varia" : undefined}
          className="text-center text-meta text-apagado"
        >
          {consecuencia.split(" · ").map((parte, indice) => (
            // Each part moves whole to the next line: a narrow line breaks between parts, never inside a price.
            // biome-ignore lint/suspicious/noArrayIndexKey: two parts may read the same; their order is the identity
            <Fragment key={indice}>
              {indice > 0 ? " · " : null}
              <span data-parte className="inline-block">
                {parte}
              </span>
            </Fragment>
          ))}
        </p>
      ) : null}
    </section>
  )
}

/** "Falta: guardar tus cambios · escuchar tu voz": what still closes the signature, after the info icon. */
export function LineaDeFalta({ id, cosas }: { id: string; cosas: readonly string[] }) {
  return (
    <p id={id} className="flex items-start gap-2 text-meta font-medium text-tinta">
      <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
      <span>
        <b className="font-semibold">Falta:</b> {cosas.join(" · ")}
      </span>
    </p>
  )
}

/** Gate 2 when nothing is missing: "Video visto" and "Texto", each with its check. */
export function ResumenListo({ id, cosas }: { id: string; cosas: readonly string[] }) {
  return (
    <p id={id} className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-meta font-semibold text-tinta">
      {cosas.map((cosa) => (
        <span key={cosa} className="inline-flex items-center gap-1.5">
          <Check aria-hidden="true" weight="bold" size={ICONO.chico} />
          {cosa}
        </span>
      ))}
    </p>
  )
}
