import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import {
  type BorradorDePilar,
  type BorradorDeRed,
  ESPERANDO_CONEXION,
  formatoDePeso,
  hrefDeAprobarBorrador,
  hrefDeEditarBorrador,
} from "@/lib/dominio/biblioteca/borradores"
import { BotonDescartar } from "./boton-descartar"

const ACCIONES = "flex flex-wrap items-start gap-3"

/** A pillar draft as she wrote it, with what she can do with it (spec 15c, section 2). */
export function TarjetaDeBorradorDePilar({ borrador }: { borrador: BorradorDePilar }) {
  const titulo = `borrador-${borrador.id}`
  return (
    <article aria-labelledby={titulo} className="h-full">
      <Panel className="grid h-full content-start gap-3">
        <h3 id={titulo} className="text-cuerpo font-semibold text-balance">
          {borrador.nombre}
        </h3>
        <p className="text-meta text-apagado">
          {`Nombre corto: ${borrador.nombreCorto} · Peso: ${formatoDePeso(borrador.peso)} %`}
        </p>
        <p className="text-cuerpo whitespace-pre-line">{borrador.descripcion}</p>
        <div className={ACCIONES}>
          <Link
            href={hrefDeAprobarBorrador(borrador.id)}
            aria-describedby={titulo}
            className={clasesDeBoton({ variante: "primario", tamano: "chico" })}
          >
            Aprobar
          </Link>
          <Link
            href={hrefDeEditarBorrador(borrador.id)}
            aria-describedby={titulo}
            className={clasesDeBoton({ variante: "secundario", tamano: "chico" })}
          >
            Editar
          </Link>
          <BotonDescartar tipo="pilar" id={borrador.id} nombre={borrador.nombre} describe={titulo} />
        </div>
      </Panel>
    </article>
  )
}

const NOTAS = [
  ["manual", "Manual"],
  ["receta", "Receta"],
  ["conexion", "Conexión"],
] as const

/** A network draft never gets «Aprobar» here: WAV builds the network (decision 3 of the spec). */
export function TarjetaDeBorradorDeRed({ borrador }: { borrador: BorradorDeRed }) {
  const titulo = `borrador-${borrador.id}`
  return (
    <article aria-labelledby={titulo} className="h-full">
      <Panel className="grid h-full content-start gap-3">
        <h3 id={titulo} className="text-cuerpo font-semibold text-balance">
          {borrador.nombre}
        </h3>
        <LineaDeEstado tipo="neutro" titulo={ESPERANDO_CONEXION} enVivo={false} />
        {NOTAS.filter(([campo]) => borrador[campo] !== "").map(([campo, etiqueta]) => (
          <p key={campo} className="text-meta whitespace-pre-line">
            <span className="font-semibold">{`${etiqueta}: `}</span>
            {borrador[campo]}
          </p>
        ))}
        <div className={ACCIONES}>
          <Link
            href={hrefDeEditarBorrador(borrador.id)}
            aria-describedby={titulo}
            className={clasesDeBoton({ variante: "secundario", tamano: "chico" })}
          >
            Editar
          </Link>
          <BotonDescartar tipo="red" id={borrador.id} nombre={borrador.nombre} describe={titulo} />
        </div>
      </Panel>
    </article>
  )
}
