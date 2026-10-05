import { CaretRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

interface PropiedadesDeFila {
  titulo: string
  meta: string
  pilar: Pilar | null
  /** Without it the row is not a link (something is happening to the piece and there is nothing to do yet). */
  href?: string
  ocupada?: boolean
}

/** One piece in a list: the pillar's dot, the title, a line of meta and, when it opens something, a chevron. */
export function FilaPieza({ titulo, meta, pilar, href, ocupada = false }: PropiedadesDeFila) {
  const contenido = (
    <>
      <span aria-hidden="true" className="mt-2 size-2.5 self-start rounded-full bg-pilar-punto" />
      <span className="grid gap-0.5">
        <span className="text-body font-semibold leading-[1.3]">{titulo}</span>
        <span className="text-meta text-apagado">
          {meta}
          {pilar ? ` · ${NOMBRE_DE_PILAR[pilar]}` : ""}
        </span>
        {ocupada ? <span aria-hidden="true" className="esqueleto mt-1.5 h-1.5 w-2/3" /> : null}
      </span>
      {href ? <CaretRight aria-hidden="true" size={20} className="self-center text-apagado" /> : <span />}
    </>
  )
  const clases = cn(
    "grid min-h-16 grid-cols-[auto_1fr_auto] gap-x-3 border-b border-linea py-3.5 text-left last:border-b-0",
    !pilar && "[--p-punto:var(--apagado)]",
  )

  return (
    <li data-pilar={pilar ?? undefined} className="list-none">
      {href ? (
        <Link
          href={href}
          className={cn(
            clases,
            "transition-colors duration-150 ease-out active:bg-hundido motion-reduce:transition-none",
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
