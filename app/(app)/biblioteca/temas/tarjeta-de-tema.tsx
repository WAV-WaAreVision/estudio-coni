import Link from "next/link"
import { cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import { Insignias } from "./insignias"

/** A topic on the phone: the text opens its page. */
export function TarjetaDeTema({ tema }: { tema: TemaResumido }) {
  return (
    <li className="grid gap-2 rounded-panel bg-piedra p-4 shadow-relieve">
      <Link href={hrefDeTema(tema.id)} className="grid gap-1">
        <span className="text-cuerpo font-semibold text-balance text-tinta">{tema.nombre}</span>
        <span className="text-meta text-apagado">{cuentasDeTema(tema)}</span>
      </Link>
      <Insignias tema={tema} />
    </li>
  )
}
