import Link from "next/link"
import type { ReactNode } from "react"
import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { hrefDeAfirmacion } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { textoDeUbicacion } from "@/lib/dominio/biblioteca/ficha"
import { hrefDeGancho } from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import {
  AVISO_SIN_CLASIFICAR,
  etiquetaDeTipo,
  type GanchoDeLista,
  type TipoDeGancho,
} from "@/lib/dominio/biblioteca/ganchos"
import { NOMBRE_DE_RED, REDES } from "@/lib/dominio/pilares"

const ENLACE = "font-semibold text-tinta underline decoration-1 underline-offset-4"

function Fila({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-meta text-apagado">{termino}</dt>
      <dd className="text-cuerpo">{children}</dd>
    </div>
  )
}

/** The parts of a hook and where it comes from (spec 6b), shared by the side panel and the phone's page. */
export function DetalleDeGancho({ gancho, tipos }: { gancho: GanchoDeLista; tipos: readonly TipoDeGancho[] }) {
  const donde = gancho.ubicacion ? textoDeUbicacion(gancho.ubicacion) : null
  const redes = REDES.flatMap((red) => {
    const nombres = gancho.pilares.filter((pilar) => pilar.red === red).map((pilar) => pilar.nombre)
    return nombres.length > 0 ? [{ red, nombres }] : []
  })
  return (
    <div className="grid gap-4">
      {gancho.clasificado ? null : <p className="text-cuerpo text-apagado">{AVISO_SIN_CLASIFICAR}</p>}
      <dl className="grid gap-3">
        <Fila termino="Tipo">{etiquetaDeTipo(tipos, gancho.tipo)}</Fila>
        {gancho.fraseSinGancho ? <Fila termino="Frase sin gancho">{gancho.fraseSinGancho}</Fila> : null}
        {gancho.autor ? (
          <Fila termino="Autor">
            <Link href={hrefDeAutor(gancho.autor.id)} className={ENLACE}>
              {gancho.autor.nombre}
            </Link>
          </Fila>
        ) : null}
        <Fila termino="Material">
          <Link href={`/biblioteca/materiales/${gancho.material.id}`} className={ENLACE}>
            {gancho.material.titulo ?? "Material sin título"}
          </Link>
        </Fila>
        {donde ? <Fila termino="Dónde">{donde}</Fila> : null}
        {gancho.tema ? (
          <Fila termino="Tema">
            <Link href={hrefDeTema(gancho.tema.id)} className={ENLACE}>
              {gancho.tema.nombre}
            </Link>
          </Fila>
        ) : null}
        {redes.length === 0 ? (
          <Fila termino="Red">Sin red</Fila>
        ) : (
          redes.map(({ red, nombres }) => (
            <Fila key={red} termino={`Pilar en ${NOMBRE_DE_RED[red]}`}>
              {nombres.join(" · ")}
            </Fila>
          ))
        )}
      </dl>
      <Link
        href={hrefDeAfirmacion(gancho.afirmacionId, hrefDeGancho(gancho.afirmacionId))}
        className={`${ENLACE} inline-flex min-h-objetivo w-fit items-center`}
      >
        Ver la afirmación
      </Link>
    </div>
  )
}
