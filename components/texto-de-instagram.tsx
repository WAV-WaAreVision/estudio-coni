"use client"

import { PencilSimple, Warning } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { editarTextoAccion } from "@/app/(app)/piezas/acciones"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"
import { useAccion } from "./use-accion"
import { useAutoAlto } from "./use-auto-alto"

const MAXIMO = 2200

interface PropiedadesDeTexto {
  piezaId: string
  version: number
  texto: string
  /** Where the text is shown: the title says what Coni is reading. */
  puedeEditar?: boolean
  /** Tells the screen while the editor is open, so it can hold the approval until she saves or cancels. */
  alEditar?: (editando: boolean) => void
}

/** "Así sale en Instagram": the caption exactly as stored, with the notice of the avatar, and a way to edit it. */
export function TextoDeInstagram({ piezaId, version, texto, puedeEditar = true, alEditar }: PropiedadesDeTexto) {
  const [editando, setEditando] = useState(false)
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
      <div className="grid gap-3">
        <Panel>
          <p className="whitespace-pre-line text-cuerpo leading-prosa">{texto}</p>
        </Panel>
        {puedeEditar ? (
          <Boton
            variante="secundario"
            tamano="chico"
            className="w-fit"
            icono={<PencilSimple aria-hidden="true" size={ICONO.medio} />}
            onClick={() => {
              setBorrador(texto)
              setEditando(true)
            }}
          >
            Editar el texto
          </Boton>
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
      <p
        className={cn(
          "flex items-center gap-1.5 text-meta tabular-nums",
          largo > MAXIMO ? "font-semibold text-tinta" : "text-apagado",
        )}
      >
        {largo > MAXIMO ? <Warning aria-hidden="true" size={ICONO.chico} /> : null}
        <span>
          {largo.toLocaleString("es-CL")} de {MAXIMO.toLocaleString("es-CL")}
        </span>
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
