import Link from "next/link"
import { type AutorResumido, descripcionDeAutor, hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import { SinMaterial } from "./sin-material"

/** An author on the phone: the text opens its page; the way to give it material sits outside that link. */
export function TarjetaDeAutor({ autor }: { autor: AutorResumido }) {
  const cuentas = cuentasDeAutor(autor)
  return (
    <li className="grid gap-2 rounded-panel bg-piedra p-4 shadow-relieve">
      <Link href={hrefDeAutor(autor.id)} className="grid gap-1">
        <span className="text-cuerpo font-semibold text-balance text-tinta">{autor.nombre}</span>
        <span className="text-meta text-apagado">{descripcionDeAutor(autor)}</span>
        {cuentas ? <span className="text-meta text-apagado">{cuentas}</span> : null}
        {autor.temas.length > 0 ? (
          <span className="text-meta text-apagado">{autor.temas.map((tema) => tema.nombre).join(" · ")}</span>
        ) : null}
      </Link>
      {cuentas === null ? <SinMaterial /> : null}
    </li>
  )
}
