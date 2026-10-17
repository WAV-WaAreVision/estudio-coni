import { ArrowUpRight, CheckCircle } from "@phosphor-icons/react/dist/ssr"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"

/** Brandkit 9.25: a quiet closing moment. A 32 px check in the success ink, the title at 24, the detail at 18. */
export function MomentoDeCierre({
  titulo,
  detalle,
  enlace,
  enlaces = [],
}: {
  titulo: string
  detalle?: string
  /** The reel on Instagram, when there is a link. */
  enlace?: string | null
  /** The post on each network she uploaded to by hand, when she pasted its link. */
  enlaces?: readonly { etiqueta: string; href: string }[]
}) {
  const todos = [...(enlace ? [{ etiqueta: "Ver en Instagram", href: enlace }] : []), ...enlaces]
  return (
    <div className="grid justify-items-start gap-3">
      <CheckCircle aria-hidden="true" size={ICONO.cierre} className="text-tinta" />
      <p className="text-pieza">{titulo}</p>
      {detalle ? <p className="text-cuerpo text-apagado">{detalle}</p> : null}
      {todos.map((vinculo) => (
        <a
          key={vinculo.href}
          href={vinculo.href}
          target="_blank"
          rel="noopener noreferrer"
          className={clasesDeBoton({ variante: "callado", tamano: "chico", className: "gap-2" })}
        >
          {vinculo.etiqueta}
          <ArrowUpRight aria-hidden="true" size={ICONO.medio} />
        </a>
      ))}
    </div>
  )
}
