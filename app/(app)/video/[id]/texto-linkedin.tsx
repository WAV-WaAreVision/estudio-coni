"use client"

import { PencilSimple, Warning } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { useAccion } from "@/components/use-accion"
import { useAutoAlto } from "@/components/use-auto-alto"
import type { Resultado } from "@/lib/acciones/resultado"
import { MAXIMO_TEXTO_LINKEDIN } from "@/lib/dominio/revision"
import { cn } from "@/lib/utils"

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
      <div className="grid gap-3">
        <Panel>
          <p className="whitespace-pre-line text-[1.125rem] leading-prosa">{texto}</p>
        </Panel>
        <p className="mx-0.5 text-meta text-apagado tabular-nums">
          {miles([...texto].length)} de {miles(MAXIMO_TEXTO_LINKEDIN)}
        </p>
        {editable ? (
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
            Editar el texto para LinkedIn
          </Boton>
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
      <p
        className={cn(
          "flex items-center gap-1.5 text-meta tabular-nums",
          largo > MAXIMO_TEXTO_LINKEDIN ? "font-semibold text-tinta" : "text-apagado",
        )}
      >
        {largo > MAXIMO_TEXTO_LINKEDIN ? <Warning aria-hidden="true" size={ICONO.chico} /> : null}
        <span>
          {miles(largo)} de {miles(MAXIMO_TEXTO_LINKEDIN)}
        </span>
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
