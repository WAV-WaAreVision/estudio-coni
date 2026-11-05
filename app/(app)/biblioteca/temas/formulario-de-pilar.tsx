"use client"

import Link from "next/link"
import { type ChangeEvent, type FormEvent, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import {
  armarBorradorDePilar,
  CAMPOS_DE_PILAR_VACIOS,
  type CampoDePilar,
  type CamposDePilar,
  LARGOS,
} from "@/lib/dominio/biblioteca/borradores"
import type { Red } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { editarBorradorDePilarAccion, guardarBorradorDePilarAccion } from "./borradores/acciones"

type Modo = { tipo: "nuevo"; red: Red } | { tipo: "editar"; id: string }

interface Propiedades {
  modo: Modo
  inicial?: CamposDePilar
  /** Where Cancelar goes: Temas on the network, or Borradores. */
  cancelar: string
}

/**
 * Spec 15c: a pillar draft (name, short name, definition, weight). It is checked here in her words before it is sent;
 * the field that failed says so and takes the focus. The action answers with the next screen itself.
 */
export function FormularioDePilar({ modo, inicial = CAMPOS_DE_PILAR_VACIOS, cancelar }: Propiedades) {
  const id = useId()
  const idDelError = `${id}-error`
  const [campos, setCampos] = useState(inicial)
  const [invalido, setInvalido] = useState<{ error: string; campo: CampoDePilar } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  const idDe = (campo: CampoDePilar) => `${id}-${campo}`
  const cambiar = (campo: CampoDePilar) => (evento: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCampos((actuales) => ({ ...actuales, [campo]: evento.target.value }))
  /** The field the error is about says so and points at it; its hint stays described too. */
  const marca = (campo: CampoDePilar, conAyuda = false) => {
    const conError = invalido?.campo === campo
    const descripcion = [conError ? idDelError : null, conAyuda ? `${idDe(campo)}-ayuda` : null]
      .filter((parte) => parte !== null)
      .join(" ")
    return {
      id: idDe(campo),
      "aria-invalid": conError || undefined,
      "aria-describedby": descripcion === "" ? undefined : descripcion,
    }
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const armado = armarBorradorDePilar(campos)
    if (!armado.ok) {
      setInvalido({ error: armado.error, campo: armado.campo })
      document.getElementById(idDe(armado.campo))?.focus()
      return
    }
    setInvalido(null)
    const { datos } = armado
    ejecutar<object>(() =>
      modo.tipo === "nuevo"
        ? guardarBorradorDePilarAccion({ ...datos, red: modo.red })
        : editarBorradorDePilarAccion({ ...datos, id: modo.id }),
    )
  }

  return (
    <form onSubmit={guardar} noValidate className="grid gap-5">
      <Campo id={idDe("nombre")} etiqueta="Nombre">
        <input
          type="text"
          autoComplete="off"
          maxLength={LARGOS.nombre}
          value={campos.nombre}
          onChange={cambiar("nombre")}
          {...marca("nombre")}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <Campo id={idDe("nombreCorto")} etiqueta="Nombre corto" ayuda="Es el texto del botón en Temas.">
        <input
          type="text"
          autoComplete="off"
          maxLength={LARGOS.nombreCorto}
          value={campos.nombreCorto}
          onChange={cambiar("nombreCorto")}
          {...marca("nombreCorto", true)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <Campo
        id={idDe("descripcion")}
        etiqueta="Definición"
        ayuda="Lo que el motor lee para proponer ideas de este pilar."
      >
        <textarea
          rows={5}
          maxLength={LARGOS.descripcion}
          value={campos.descripcion}
          onChange={cambiar("descripcion")}
          {...marca("descripcion", true)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <Campo
        id={idDe("peso")}
        etiqueta="Peso (%)"
        ayuda="Cuánto de la red le toca. Al aprobarlo puedes repartir los pesos de los demás."
      >
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={campos.peso}
          onChange={cambiar("peso")}
          {...marca("peso", true)}
          className={cn(CLASES_DE_CAMPO, "tabular-nums")}
        />
      </Campo>
      {invalido ? (
        <div id={idDelError}>
          <LineaDeError>{invalido.error}</LineaDeError>
        </div>
      ) : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={pendiente} className="md:w-auto">
          Guardar borrador
        </Boton>
        <Link href={cancelar} className={cn(clasesDeBoton({ variante: "secundario" }), "md:w-auto")}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
