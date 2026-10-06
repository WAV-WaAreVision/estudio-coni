"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useAutoAlto } from "@/components/use-auto-alto"
import type { Resultado } from "@/lib/acciones/resultado"
import { MAXIMO_TEXTO_LINKEDIN } from "@/lib/dominio/revision"

interface PropiedadesDeTextoLinkedin {
  piezaId: string
  version: number
  /** The saved text, or, when `guardado` is false, the one the screen starts from (the caption without hashtags). */
  texto: string
  /** False for a piece from before LinkedIn: the text is a starting point that she has to review and save. */
  guardado: boolean
  editable?: boolean
  alGuardar: (piezaId: string, version: number, texto: string) => Promise<Resultado>
  /** Tells the screen while the editor is open, so it can hold the approval until she saves or cancels. */
  alEditar?: (editando: boolean) => void
}

const miles = (n: number) => n.toLocaleString("es-CL")

/** "Texto para LinkedIn" at gate 2: the text as it will be published, and a way to edit it. */
export function TextoLinkedin({
  piezaId,
  version,
  texto,
  guardado,
  editable = true,
  alGuardar,
  alEditar,
}: PropiedadesDeTextoLinkedin) {
  const [editando, setEditando] = useState(!guardado && editable)
  const [borrador, setBorrador] = useState(texto)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const caja = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    alEditar?.(editando)
    return () => alEditar?.(false)
  }, [editando, alEditar])
  useAutoAlto(caja, borrador)

  if (!editando) {
    return (
      <div className="grid gap-1">
        <p className="whitespace-pre-line text-cuerpo leading-prosa">{texto}</p>
        <p className="text-meta text-apagado tabular-nums">
          {miles([...texto].length)} de {miles(MAXIMO_TEXTO_LINKEDIN)}
        </p>
        {editable ? (
          <button
            type="button"
            className="min-h-11 w-fit text-cuerpo font-medium text-tinta underline"
            onClick={() => {
              setBorrador(texto)
              setEditando(true)
            }}
          >
            Editar el texto para LinkedIn
          </button>
        ) : null}
      </div>
    )
  }

  const largo = [...borrador].length
  const vacio = borrador.trim() === ""
  return (
    <form
      className="grid gap-3"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (vacio || largo > MAXIMO_TEXTO_LINKEDIN) return
        ejecutar(
          () => alGuardar(piezaId, version, borrador),
          () => setEditando(false),
        )
      }}
    >
      {guardado ? null : (
        <p className="text-cuerpo">
          Parte del texto de Instagram, sin los hashtags. Revísalo, ajústalo para LinkedIn y guárdalo para poder
          aprobar.
        </p>
      )}
      <label className="grid gap-2">
        <span className="text-meta font-semibold">Texto de la publicación en LinkedIn</span>
        <textarea
          ref={caja}
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          className="campo w-full text-cuerpo"
        />
      </label>
      <p className={`text-meta tabular-nums ${largo > MAXIMO_TEXTO_LINKEDIN ? "text-error" : "text-apagado"}`}>
        {miles(largo)} de {miles(MAXIMO_TEXTO_LINKEDIN)}
      </p>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      <div className="grid gap-2">
        <Boton type="submit" cargando={pendiente} deshabilitado={vacio || largo > MAXIMO_TEXTO_LINKEDIN}>
          Guardar el texto para LinkedIn
        </Boton>
        {guardado ? (
          <Boton
            variante="callado"
            onClick={() => {
              limpiarError()
              setBorrador(texto)
              setEditando(false)
            }}
          >
            Cancelar
          </Boton>
        ) : null}
      </div>
    </form>
  )
}
