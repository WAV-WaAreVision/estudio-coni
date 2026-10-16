import { CaretRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { PuntoTrabajando } from "./ui/punto-trabajando"

interface PropiedadesDeFila {
  titulo: string
  /** What is happening to the piece, in one line: «Guion · 52 s», «Escribiendo el guion · te aviso». */
  estado: string
  pilar: Pilar | null
  /** Without it the row is not a link (something is happening to the piece and there is nothing to do yet). */
  href?: string
  trabajando?: boolean
  /** An unread notice points at this piece: an ink dot in the left margin. */
  sinLeer?: boolean
  /** The real frame of the video, only when there is one. */
  miniatura?: string
}

/** Brandkit 9.3: pillar word, title and state on a flat row; a caret when it opens something. */
export function FilaPieza({
  titulo,
  estado,
  pilar,
  href,
  trabajando = false,
  sinLeer = false,
  miniatura,
}: PropiedadesDeFila) {
  const contenido = (
    <>
      <span className="grid gap-0.5">
        {pilar ? <span className="text-meta text-apagado">{NOMBRE_DE_PILAR[pilar]}</span> : null}
        <span className="text-cuerpo font-semibold tracking-[-0.004em]">{titulo}</span>
        <span data-snapshot="varia" className="flex items-center gap-2 text-meta font-medium text-tinta">
          {trabajando ? <PuntoTrabajando /> : null}
          {estado}
        </span>
      </span>
      {miniatura ? (
        // biome-ignore lint/performance/noImgElement: a signed storage URL of a 48 px frame; next/image adds nothing here.
        <img src={miniatura} alt="" className="h-16 w-12 rounded-12 object-cover" />
      ) : (
        <span />
      )}
      {href ? <CaretRight aria-hidden="true" size={20} className="text-apagado" /> : <span />}
      {sinLeer ? (
        <>
          <span
            aria-hidden="true"
            className="absolute top-1/2 -left-3.5 size-2 -translate-y-1/2 rounded-full bg-tinta"
          />
          <span className="sr-only">Sin leer</span>
        </>
      ) : null}
    </>
  )
  const clases =
    "relative grid min-h-16 grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-linea py-3 text-left last:border-b-0"

  return (
    <li data-pilar={pilar ?? undefined} className="list-none">
      {href ? (
        <Link
          href={href}
          className={cn(
            clases,
            "transition-opacity duration-[var(--dur-corta)] active:opacity-70 motion-reduce:transition-none",
          )}
        >
          {contenido}
        </Link>
      ) : (
        <div className={clases}>{contenido}</div>
      )}
    </li>
  )
}
