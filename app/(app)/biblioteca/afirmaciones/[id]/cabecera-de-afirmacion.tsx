import Link from "next/link"
import type { ReactNode } from "react"
import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import type { AfirmacionLeida } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { textoDeUbicacion } from "@/lib/dominio/biblioteca/ficha"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"

const ENLACE = "font-semibold text-tinta underline decoration-1 underline-offset-4"

function Fila({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-meta text-apagado">{termino}</dt>
      <dd className="text-cuerpo">{children}</dd>
    </div>
  )
}

/** The claim in its words and where it comes from (spec 6c-1), each with its link. */
export function CabeceraDeAfirmacion({ afirmacion }: { afirmacion: AfirmacionLeida }) {
  const donde = afirmacion.ubicacion ? textoDeUbicacion(afirmacion.ubicacion) : null
  return (
    <header className="grid gap-4">
      <h1 className="text-pantalla text-balance">{`«${afirmacion.texto}»`}</h1>
      <dl className="grid gap-3">
        <Fila termino="Cita">{`«${afirmacion.cita}»`}</Fila>
        {afirmacion.autor ? (
          <Fila termino="Autor">
            <Link href={hrefDeAutor(afirmacion.autor.id)} className={ENLACE}>
              {afirmacion.autor.nombre}
            </Link>
          </Fila>
        ) : null}
        <Fila termino="Material">
          <Link href={`/biblioteca/materiales/${afirmacion.material.id}`} className={ENLACE}>
            {afirmacion.material.titulo ?? "Material sin título"}
          </Link>
        </Fila>
        {donde ? <Fila termino="Dónde">{donde}</Fila> : null}
        <Fila termino="Tema">
          {afirmacion.tema ? (
            <Link href={hrefDeTema(afirmacion.tema.id)} className={ENLACE}>
              {afirmacion.tema.nombre}
            </Link>
          ) : (
            "Sin tema todavía"
          )}
        </Fila>
      </dl>
    </header>
  )
}
