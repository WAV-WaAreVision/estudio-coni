import { Star } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { ICONO } from "@/components/ui/icono"
import { hrefDeGancho } from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import { etiquetaDeTipo, type GanchoDeLista, type TipoDeGancho } from "@/lib/dominio/biblioteca/ganchos"

/** A hook on the phone: the phrase, its type and author; the whole card opens its page. */
export function TarjetaDeGancho({ gancho, tipos }: { gancho: GanchoDeLista; tipos: readonly TipoDeGancho[] }) {
  const linea = [etiquetaDeTipo(tipos, gancho.tipo), gancho.autor?.nombre].filter(Boolean).join(" · ")
  return (
    <li className="grid rounded-panel bg-piedra p-4 shadow-relieve">
      <Link href={hrefDeGancho(gancho.afirmacionId)} className="grid gap-1">
        <span className="text-cuerpo font-semibold text-balance text-tinta">{`«${gancho.fraseExacta}»`}</span>
        <span className="text-meta text-apagado">{linea}</span>
        {gancho.favorito ? (
          <span className="inline-flex items-center gap-1 text-meta font-semibold text-tinta">
            <Star aria-hidden="true" weight="fill" size={ICONO.chico} />
            Favorito
          </span>
        ) : null}
      </Link>
    </li>
  )
}
