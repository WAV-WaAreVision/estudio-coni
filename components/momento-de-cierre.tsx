import { ArrowUpRight, CheckCircle } from "@phosphor-icons/react/dist/ssr"

/** Brandkit 9.25: a quiet closing moment. A 32 px check in the success ink, the title at 24, the detail at 18. */
export function MomentoDeCierre({
  titulo,
  detalle,
  enlace,
}: {
  titulo: string
  detalle?: string
  /** The reel on Instagram, when there is a link. */
  enlace?: string | null
}) {
  return (
    <div className="grid justify-items-start gap-3">
      <CheckCircle aria-hidden="true" size={32} className="text-exito" />
      <p className="text-pieza">{titulo}</p>
      {detalle ? <p className="text-cuerpo text-apagado">{detalle}</p> : null}
      {enlace ? (
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-cuerpo font-medium text-tinta underline"
        >
          Ver en Instagram
          <ArrowUpRight aria-hidden="true" size={20} />
        </a>
      ) : null}
    </div>
  )
}
