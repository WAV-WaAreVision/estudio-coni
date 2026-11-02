"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import {
  ANIO_MAXIMO,
  ANIO_MINIMO,
  esEnlaceWeb,
  type FichaLeida,
  LARGO_DE_AUTOR,
  LARGO_DE_CITA,
  LARGO_DE_ENLACE,
  LARGO_DE_IDEA,
  LARGO_DE_RESUMEN,
  leerEdicion,
  MAXIMO_DE_IDEAS,
  textoDeUbicacion,
} from "@/lib/dominio/biblioteca/ficha"
import { editarFichaAccion } from "../../acciones"
import { Campo, CLASES_DE_CAMPO } from "../../campo"

const SUBTITULO = "text-pieza text-balance"

function Lectura({ ficha }: { ficha: FichaLeida }) {
  const { fuente } = ficha
  const autorYAnio = [fuente.autor, fuente.anio].filter((dato) => dato !== null).join(" · ")
  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h2 className={SUBTITULO}>Resumen</h2>
        <p className="whitespace-pre-line">{ficha.resumen}</p>
      </section>
      <section className="grid gap-2">
        <h2 className={SUBTITULO}>Ideas clave</h2>
        <ul className="grid list-disc gap-2 pl-5">
          {ficha.ideasClave.map((idea, indice) => (
            // The ideas are an ordered list that is only ever replaced whole: the position is its identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <li key={indice}>{idea}</li>
          ))}
        </ul>
      </section>
      {ficha.citas.length > 0 ? (
        <section className="grid gap-3">
          <h2 className={SUBTITULO}>Citas</h2>
          {ficha.citas.map((cita, indice) => {
            const lugar = textoDeUbicacion(cita.ubicacion)
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: quotes have no id; they are replaced whole
              <figure key={indice} className="grid gap-1 border-l-2 border-campo pl-3.5">
                <blockquote>{cita.texto}</blockquote>
                {lugar ? <figcaption className="text-meta text-apagado">{lugar}</figcaption> : null}
              </figure>
            )
          })}
        </section>
      ) : null}
      {autorYAnio || fuente.enlace ? (
        <section className="grid gap-2">
          <h2 className={SUBTITULO}>Fuente</h2>
          {autorYAnio ? <p>{autorYAnio}</p> : null}
          {fuente.enlace && esEnlaceWeb(fuente.enlace) ? (
            <a href={fuente.enlace} className="break-all text-tinta underline" rel="noreferrer noopener">
              {fuente.enlace}
            </a>
          ) : fuente.enlace ? (
            <p className="break-all">{fuente.enlace}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

interface Borrador {
  resumen: string
  ideas: string[]
  citas: FichaLeida["citas"]
  autor: string
  anio: string
  enlace: string
}

function aBorrador(ficha: FichaLeida): Borrador {
  return {
    resumen: ficha.resumen,
    ideas: ficha.ideasClave,
    citas: ficha.citas,
    autor: ficha.fuente.autor ?? "",
    anio: ficha.fuente.anio === null ? "" : String(ficha.fuente.anio),
    enlace: ficha.fuente.enlace ?? "",
  }
}

export function FichaEditable({ materialId, ficha: inicial }: { materialId: string; ficha: FichaLeida }) {
  const [ficha, setFicha] = useState(inicial)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [errorDeLaFicha, setErrorDeLaFicha] = useState<string | null>(null)
  const [preguntandoDescartar, setPreguntandoDescartar] = useState(false)
  // Opening, closing and the discard question each unmount the focused control: the focus moves after the render.
  const [enfocar, setEnfocar] = useState<"resumen" | "editar" | "cancelar" | null>(null)
  const resumen = useRef<HTMLTextAreaElement>(null)
  const editar = useRef<HTMLButtonElement>(null)
  const cancelar = useRef<HTMLButtonElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  // No dependency list: the target appears in a later render than the one that asked for it.
  useEffect(() => {
    if (enfocar === null) return
    const destino = { resumen, editar, cancelar }[enfocar].current
    if (!destino) return
    destino.focus()
    setEnfocar(null)
  })

  function cerrar() {
    setPreguntandoDescartar(false)
    setBorrador(null)
    setEnfocar("editar")
  }

  if (borrador === null) {
    return (
      <div className="grid gap-5">
        <Lectura ficha={ficha} />
        <Boton
          ref={editar}
          variante="secundario"
          onClick={() => {
            setErrorDeLaFicha(null)
            limpiarError()
            setBorrador(aBorrador(ficha))
            setEnfocar("resumen")
          }}
        >
          Editar
        </Boton>
      </div>
    )
  }

  const cambiar = (cambios: Partial<Borrador>) => setBorrador({ ...borrador, ...cambios })

  function guardar(actual: Borrador) {
    // A year that is not a whole number reaches leerEdicion as it is, so she hears why instead of losing it.
    const anio = actual.anio.trim() === "" ? null : Number(actual.anio.trim())
    const leida = leerEdicion({
      materialId,
      resumen: actual.resumen,
      ideasClave: actual.ideas,
      citas: actual.citas,
      fuente: {
        autor: actual.autor,
        anio,
        enlace: actual.enlace,
      },
    })
    if (!leida.ok) {
      setErrorDeLaFicha(leida.error)
      return
    }
    setErrorDeLaFicha(null)
    ejecutar(
      () => editarFichaAccion(leida.datos),
      () => {
        const { resumen, ideasClave, citas, fuente } = leida.datos
        setFicha({ resumen, ideasClave, citas, fuente })
        cerrar()
      },
    )
  }

  const aviso = errorDeLaFicha ?? error
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(evento) => {
        evento.preventDefault()
        guardar(borrador)
      }}
    >
      <Campo id="ficha-resumen" etiqueta="Resumen">
        <textarea
          ref={resumen}
          id="ficha-resumen"
          rows={6}
          maxLength={LARGO_DE_RESUMEN}
          className={CLASES_DE_CAMPO}
          value={borrador.resumen}
          onChange={(evento) => cambiar({ resumen: evento.target.value })}
        />
      </Campo>

      <section className="grid gap-3">
        <h2 className={SUBTITULO}>Ideas clave</h2>
        {borrador.ideas.map((idea, indice) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the ideas are plain strings edited in place by position
          <div key={indice} className="grid gap-2">
            <Campo id={`ficha-idea-${indice}`} etiqueta={`Idea clave ${indice + 1}`}>
              <textarea
                id={`ficha-idea-${indice}`}
                rows={2}
                maxLength={LARGO_DE_IDEA}
                className={CLASES_DE_CAMPO}
                value={idea}
                onChange={(evento) =>
                  cambiar({ ideas: borrador.ideas.map((actual, i) => (i === indice ? evento.target.value : actual)) })
                }
              />
            </Campo>
            <Boton
              variante="callado"
              tamano="chico"
              className="w-fit"
              aria-label={`Quitar la idea clave ${indice + 1}`}
              onClick={() => cambiar({ ideas: borrador.ideas.filter((_, i) => i !== indice) })}
            >
              Quitar
            </Boton>
          </div>
        ))}
        {borrador.ideas.length < MAXIMO_DE_IDEAS ? (
          <Boton
            variante="secundario"
            tamano="chico"
            className="w-fit"
            onClick={() => cambiar({ ideas: [...borrador.ideas, ""] })}
          >
            Agregar una idea clave
          </Boton>
        ) : null}
      </section>

      {borrador.citas.length > 0 ? (
        <section className="grid gap-3">
          <h2 className={SUBTITULO}>Citas</h2>
          {borrador.citas.map((cita, indice) => {
            const lugar = textoDeUbicacion(cita.ubicacion)
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: quotes have no id; they are edited in place by position
              <fieldset key={indice} className="grid gap-2">
                <legend className="text-cuerpo font-semibold">Cita {indice + 1}</legend>
                <textarea
                  aria-label={`Texto de la cita ${indice + 1}`}
                  rows={3}
                  maxLength={LARGO_DE_CITA}
                  className={CLASES_DE_CAMPO}
                  value={cita.texto}
                  onChange={(evento) =>
                    cambiar({
                      citas: borrador.citas.map((actual, i) =>
                        i === indice ? { ...actual, texto: evento.target.value } : actual,
                      ),
                    })
                  }
                />
                {lugar ? <p className="text-meta text-apagado">{lugar}</p> : null}
                <Boton
                  variante="callado"
                  tamano="chico"
                  className="w-fit"
                  aria-label={`Quitar la cita ${indice + 1}`}
                  onClick={() => cambiar({ citas: borrador.citas.filter((_, i) => i !== indice) })}
                >
                  Quitar
                </Boton>
              </fieldset>
            )
          })}
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className={SUBTITULO}>Fuente</h2>
        <Campo id="ficha-autor" etiqueta="Autor de la fuente">
          <input
            id="ficha-autor"
            maxLength={LARGO_DE_AUTOR}
            className={CLASES_DE_CAMPO}
            value={borrador.autor}
            onChange={(evento) => cambiar({ autor: evento.target.value })}
          />
        </Campo>
        <Campo id="ficha-anio" etiqueta="Año">
          <input
            id="ficha-anio"
            type="number"
            inputMode="numeric"
            min={ANIO_MINIMO}
            max={ANIO_MAXIMO}
            step={1}
            className={CLASES_DE_CAMPO}
            value={borrador.anio}
            onChange={(evento) => cambiar({ anio: evento.target.value })}
          />
        </Campo>
        <Campo id="ficha-enlace" etiqueta="Enlace">
          <input
            id="ficha-enlace"
            type="url"
            inputMode="url"
            maxLength={LARGO_DE_ENLACE}
            className={CLASES_DE_CAMPO}
            value={borrador.enlace}
            onChange={(evento) => cambiar({ enlace: evento.target.value })}
          />
        </Campo>
      </section>

      {aviso ? <LineaDeError>{aviso}</LineaDeError> : null}
      <Boton type="submit" cargando={pendiente}>
        Guardar cambios
      </Boton>
      {preguntandoDescartar ? (
        <ConfirmacionEnLinea
          trato="destructivo"
          pregunta="¿Descartar lo que cambiaste?"
          confirmar="Sí, descartar"
          volver="Seguir editando"
          alConfirmar={cerrar}
          alVolver={() => {
            setPreguntandoDescartar(false)
            setEnfocar("cancelar")
          }}
        />
      ) : (
        <Boton
          ref={cancelar}
          variante="callado"
          deshabilitado={pendiente}
          onClick={() => {
            const sinCambios = JSON.stringify(borrador) === JSON.stringify(aBorrador(ficha))
            if (sinCambios) cerrar()
            else setPreguntandoDescartar(true)
          }}
        >
          Cancelar
        </Boton>
      )}
    </form>
  )
}
