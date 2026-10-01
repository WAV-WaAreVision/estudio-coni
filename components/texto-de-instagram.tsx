"use client"

import { useState } from "react"
import { editarTextoAccion } from "@/app/(app)/piezas/acciones"
import { Boton } from "@/components/ui/boton"
import { useAccion } from "./use-accion"

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

  if (!editando) {
    return (
      <div className="grid gap-1.5">
        <p className="whitespace-pre-line rounded-lg border border-linea bg-superficie p-4 text-[1.0625rem] leading-normal">
          {texto}
        </p>
        {puedeEditar ? (
          <button
            type="button"
            className="min-h-11 w-fit text-label font-semibold text-acento"
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
      className="grid gap-2.5"
      onSubmit={(evento) => {
        evento.preventDefault()
        ejecutar(
          () => editarTextoAccion(piezaId, version, borrador),
          () => setEditando(false),
        )
      }}
    >
      <label className="grid gap-1.5">
        <span className="text-meta text-apagado">Texto de la publicación</span>
        <textarea
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          rows={9}
          maxLength={MAXIMO + 200}
          className="w-full rounded-lg border-[1.5px] border-linea bg-superficie p-3.5 text-[1.0625rem] leading-normal focus:border-acento"
        />
      </label>
      <p className={`text-meta ${largo > MAXIMO ? "text-error-tinta" : "text-apagado"}`}>
        {largo.toLocaleString("es-CL")} de {MAXIMO.toLocaleString("es-CL")}
      </p>
      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}
      <div className="grid gap-1">
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
