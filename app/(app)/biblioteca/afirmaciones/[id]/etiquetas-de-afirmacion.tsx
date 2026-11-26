import type { ReactNode } from "react"
import {
  type AfirmacionLeida,
  AVISO_DE_REPROCESO,
  agruparMarcas,
  type CatalogoDeEtiquetas,
  type CorreccionLeida,
  esAfirmacionNueva,
  etiquetaDe,
  MARCAS_POR_RED,
  type MarcaLeida,
  type MarcasDeRed,
  opcionesDe,
  revisionDe,
  tituloDeEtiqueta,
} from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { NOMBRE_DE_RED, REDES, type Red } from "@/lib/dominio/pilares"
import { EditorDeEtiqueta, type EtiquetaActual } from "./editor-de-etiqueta"

function Fila({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-meta text-apagado">{termino}</dt>
      <dd className="text-cuerpo">{children}</dd>
    </div>
  )
}

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-3">
      <h2 id={id} className="text-pieza">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function actualDeMarca(
  marca: MarcaLeida,
  catalogo: CatalogoDeEtiquetas,
  correcciones: readonly CorreccionLeida[],
): EtiquetaActual {
  return {
    valor: marca.valor,
    etiqueta: etiquetaDe(catalogo, marca.marca, marca.red, marca.valor),
    frase: marca.frase,
    porQue: marca.porQue,
    certezaBaja: marca.certeza === "baja",
    revision: marca.origen === "coni" ? revisionDe(correcciones, marca.marca, marca.red) : null,
  }
}

/**
 * The marks of one field and network: one editor per row, or «Agregar» when there is none. Keyed by what the row
 * says, so the refreshed page remounts an editor whose value changed and its form starts from the new one.
 */
function Marcas({
  afirmacion,
  catalogo,
  campo,
  red,
  filas,
}: {
  afirmacion: AfirmacionLeida
  catalogo: CatalogoDeEtiquetas
  campo: MarcaLeida["marca"]
  red: Red | "todas"
  filas: readonly MarcaLeida[]
}) {
  const comun = {
    afirmacionId: afirmacion.id,
    campo,
    red,
    titulo: tituloDeEtiqueta(campo, red),
    opciones: opcionesDe(catalogo, campo, red),
    conFrase: true,
  }
  if (filas.length === 0) return <EditorDeEtiqueta {...comun} marcaId={null} actual={null} quitable={false} />
  return filas.map((fila) => (
    <EditorDeEtiqueta
      key={`${fila.id}-${fila.valor}-${fila.frase ?? ""}`}
      {...comun}
      marcaId={fila.id}
      actual={actualDeMarca(fila, catalogo, afirmacion.correcciones)}
      quitable
    />
  ))
}

function MarcasDeUnaRed({
  afirmacion,
  catalogo,
  red,
  marcas,
}: {
  afirmacion: AfirmacionLeida
  catalogo: CatalogoDeEtiquetas
  red: Red
  marcas: MarcasDeRed
}) {
  return (
    <Seccion id={`etiquetas-${red}`} titulo={NOMBRE_DE_RED[red]}>
      {MARCAS_POR_RED.map((campo) => (
        <Marcas key={campo} afirmacion={afirmacion} catalogo={catalogo} campo={campo} red={red} filas={marcas[campo]} />
      ))}
    </Seccion>
  )
}

/** Every tag of a claim (spec 6c-1); an old claim corrects tipo and evidencia only, until change 7 fills its marks. */
export function EtiquetasDeAfirmacion({
  afirmacion,
  catalogo,
}: {
  afirmacion: AfirmacionLeida
  catalogo: CatalogoDeEtiquetas
}) {
  const marcas = agruparMarcas(afirmacion.marcas)
  const deLaIdea = (campo: "tipo" | "evidencia") => {
    const valor = afirmacion[campo]
    return (
      <EditorDeEtiqueta
        key={`${campo}-${valor}`}
        afirmacionId={afirmacion.id}
        campo={campo}
        red="todas"
        marcaId={null}
        titulo={tituloDeEtiqueta(campo, "todas")}
        actual={{
          valor,
          etiqueta: etiquetaDe(catalogo, campo, "todas", valor),
          frase: null,
          porQue: null,
          certezaBaja: false,
          revision: revisionDe(afirmacion.correcciones, campo, "todas"),
        }}
        opciones={opcionesDe(catalogo, campo, "todas")}
        conFrase={false}
        quitable={false}
      />
    )
  }
  const { gancho, textoAntiguo } = afirmacion
  return (
    <div className="grid gap-6">
      <Seccion id="etiquetas-idea" titulo="La idea">
        {deLaIdea("tipo")}
        {deLaIdea("evidencia")}
      </Seccion>

      {esAfirmacionNueva(afirmacion) ? (
        <>
          {/* The two networks side by side only where each column still fits a list of emotions. */}
          <div className="grid gap-6 xl:grid-cols-2">
            {REDES.map((red) => (
              <MarcasDeUnaRed key={red} afirmacion={afirmacion} catalogo={catalogo} red={red} marcas={marcas[red]} />
            ))}
          </div>
          <Seccion id="etiquetas-dato-y-caso" titulo="Dato y caso">
            <Marcas afirmacion={afirmacion} catalogo={catalogo} campo="dato" red="todas" filas={marcas.dato} />
            <Marcas afirmacion={afirmacion} catalogo={catalogo} campo="caso" red="todas" filas={marcas.caso} />
          </Seccion>
        </>
      ) : (
        <Seccion id="etiquetas-marcas" titulo="Marcas">
          <p className="text-cuerpo text-apagado">{AVISO_DE_REPROCESO}</p>
          <dl className="grid gap-3">
            {textoAntiguo.publico ? <Fila termino="Público">{textoAntiguo.publico}</Fila> : null}
            {textoAntiguo.dolor ? <Fila termino="Dolor">{textoAntiguo.dolor}</Fila> : null}
            {textoAntiguo.emocion ? <Fila termino="Emoción">{textoAntiguo.emocion}</Fila> : null}
            {textoAntiguo.gancho ? <Fila termino="Gancho">{`«${textoAntiguo.gancho}»`}</Fila> : null}
          </dl>
        </Seccion>
      )}

      {gancho ? (
        <Seccion id="etiquetas-gancho" titulo="Gancho">
          <dl className="grid gap-3">
            <Fila termino="Frase exacta">{`«${gancho.fraseExacta}»`}</Fila>
            <Fila termino="Frase sin gancho">{gancho.fraseSinGancho}</Fila>
          </dl>
          <EditorDeEtiqueta
            key={`tipo_de_gancho-${gancho.tipo}`}
            afirmacionId={afirmacion.id}
            campo="tipo_de_gancho"
            red="todas"
            marcaId={null}
            titulo={tituloDeEtiqueta("tipo_de_gancho", "todas")}
            actual={{
              valor: gancho.tipo,
              etiqueta: etiquetaDe(catalogo, "tipo_de_gancho", "todas", gancho.tipo),
              frase: null,
              porQue: null,
              certezaBaja: gancho.certeza === "baja",
              revision:
                gancho.origen === "coni" ? revisionDe(afirmacion.correcciones, "tipo_de_gancho", "todas") : null,
            }}
            opciones={opcionesDe(catalogo, "tipo_de_gancho", "todas")}
            conFrase={false}
            quitable={false}
          />
        </Seccion>
      ) : null}
    </div>
  )
}
