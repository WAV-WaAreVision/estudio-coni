import { CaretRight, Warning } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { PilarVisible } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { ICONO } from "./ui/icono"
import { PuntoTrabajando } from "./ui/punto-trabajando"

interface PropiedadesDeFila {
  titulo: string
  /** What is happening to the piece, in one line: «Guion · 52 s», «Escribiendo el guion · te aviso». */
  estado?: string
  /** A failure's cause, in a honda pill with the warning icon, in place of the state (Inicio, decision 8). */
  causa?: string
  pilar: PilarVisible | null
  /** Without it the row is not a link (something is happening to the piece and there is nothing to do yet). */
  href?: string
  trabajando?: boolean
  /** An unread notice points at this piece: an ink dot in the left margin. */
  sinLeer?: boolean
  /** The real frame of the video, only when there is one. */
  miniatura?: string
}

/** Decision 4, v6 `.fila`: a row of a group. Pillar, title and state; a chevron when it opens something. */
export function FilaPieza({
  titulo,
  estado,
  causa,
  pilar,
  href,
  trabajando = false,
  sinLeer = false,
  miniatura,
}: PropiedadesDeFila) {
  const contenido = (
    <>
      <span className="grid min-w-0 gap-0.5">
        {pilar ? <span className="text-meta text-apagado">{pilar.nombreCorto}</span> : null}
        <span className="text-cuerpo leading-[1.3] font-semibold">{titulo}</span>
        {causa ? (
          <span className="mt-1.5 inline-flex w-fit items-start gap-1.5 rounded-bloque bg-piedra-honda px-2.5 py-1 text-meta font-semibold">
            <Warning aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
            <span className="min-w-0">{causa}</span>
          </span>
        ) : estado ? (
          <span data-snapshot="varia" className="flex items-center gap-2 text-meta text-tinta">
            {trabajando ? <PuntoTrabajando chico /> : null}
            {estado}
          </span>
        ) : null}
      </span>
      {miniatura ? (
        // biome-ignore lint/performance/noImgElement: a signed storage URL of a small frame; next/image adds nothing here.
        <img src={miniatura} alt="" className="h-16 w-12 rounded-bloque object-cover" />
      ) : (
        <span />
      )}
      {href ? <CaretRight aria-hidden="true" size={ICONO.medio} className="text-apagado" /> : <span />}
      {sinLeer ? (
        <>
          <span aria-hidden="true" className="absolute top-1/2 -left-3 size-2 -translate-y-1/2 rounded-full bg-tinta" />
          <span className="sr-only">Sin leer</span>
        </>
      ) : null}
    </>
  )
  const clases = "relative grid min-h-fila grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-[14px] text-left"

  return (
    <li data-pilar={pilar?.slug} className="list-none">
      {href ? (
        <Link
          href={href}
          className={cn(
            clases,
            "transition-colors duration-[var(--dur-corta)] active:bg-piedra-honda motion-reduce:transition-none",
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
