"use client"

import { useRef, useState } from "react"
import { editarTextoAccion } from "@/app/(app)/piezas/acciones"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "./use-accion"
import { useAutoAlto } from "./use-auto-alto"

const MAXIMO = 2200

interface PropiedadesDeTexto {
  piezaId: string
  version: number
  texto: string
  /** Where the text is shown: the title says what Coni is reading. */
  puedeEditar?: boolean
}

/** "Así sale en Instagram": the caption exactly as stored, with the notice of the avatar, and a way to edit it. */
export function TextoDeInstagram({ piezaId, version, texto, puedeEditar = true }: PropiedadesDeTexto) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(texto)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const caja = useRef<HTMLTextAreaElement>(null)
  useAutoAlto(caja, borrador)

  if (!editando) {
    return (
      <div className="grid gap-1">
        <p className="whitespace-pre-line text-cuerpo leading-prosa">{texto}</p>
        {puedeEditar ? (
          <button
            type="button"
            className="min-h-11 w-fit text-cuerpo font-medium text-tinta underline"
            onClick={() => {
              setBorrador(texto)
              setEditando(true)
            }}
          >
            Editar el texto
          </button>
        ) : null}
      </div>
    )
  }

  const largo = [...borrador].length
  return (
    <form
      className="grid gap-3"
      onSubmit={(evento) => {
        evento.preventDefault()
        ejecutar(
          () => editarTextoAccion(piezaId, version, borrador),
          () => setEditando(false),
        )
      }}
    >
      <label className="grid gap-2">
        <span className="text-meta font-semibold">Texto de la publicación</span>
        <textarea
          ref={caja}
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          maxLength={MAXIMO + 200}
          className="campo w-full text-cuerpo"
        />
      </label>
      <p className={`text-meta ${largo > MAXIMO ? "text-error" : "text-apagado"}`}>
        {largo.toLocaleString("es-CL")} de {MAXIMO.toLocaleString("es-CL")}
      </p>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      <div className="grid gap-2">
        <Boton type="submit" cargando={pendiente} deshabilitado={largo === 0 || largo > MAXIMO}>
          Guardar el texto
        </Boton>
        <Boton
          variante="callado"
          onClick={() => {
            limpiarError()
            setEditando(false)
          }}
        >
          Cancelar
        </Boton>
      </div>
    </form>
  )
}
