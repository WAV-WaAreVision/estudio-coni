"use client"

import Link from "next/link"
import { type ChangeEvent, type FormEvent, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useIrA } from "@/components/use-ir-a"
import {
  armarBorradorDeRed,
  CAMPOS_DE_RED_VACIOS,
  type CampoDeRed,
  type CamposDeRed,
  LARGOS,
} from "@/lib/dominio/biblioteca/borradores"
import { cn } from "@/lib/utils"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { editarBorradorDeRedAccion, guardarBorradorDeRedAccion } from "./borradores/acciones"

type Modo = { tipo: "nuevo" } | { tipo: "editar"; id: string }

interface Propiedades {
  modo: Modo
  inicial?: CamposDeRed
  cancelar: string
}

const NOTAS: { campo: Exclude<CampoDeRed, "nombre">; etiqueta: string; ayuda: string }[] = [
  { campo: "manual", etiqueta: "Manual (opcional)", ayuda: "A quién le habla la red y qué pilares tendría." },
  { campo: "receta", etiqueta: "Receta (opcional)", ayuda: "Cómo se arma una pieza para esa red." },
  {
    campo: "conexion",
    etiqueta: "Conexión (opcional)",
    // Decision 17: a plain text column that WAV reads.
    ayuda: "Qué cuenta usar para publicar. No escribas contraseñas aquí.",
  },
]

/** Spec 15c: a network draft keeps her idea; WAV builds the network. Only the name is needed. */
export function FormularioDeRed({ modo, inicial = CAMPOS_DE_RED_VACIOS, cancelar }: Propiedades) {
  const id = useId()
  const idDelError = `${id}-error`
  const [campos, setCampos] = useState(inicial)
  const [invalido, setInvalido] = useState<{ error: string; campo: CampoDeRed } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()
  // The action names the next screen; this goes there and checks it landed (Next can drop it).
  const { ir, yendo, error: errorAlIr } = useIrA()

  const idDe = (campo: CampoDeRed) => `${id}-${campo}`
  const cambiar = (campo: CampoDeRed) => (evento: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCampos((actuales) => ({ ...actuales, [campo]: evento.target.value }))
  const marca = (campo: CampoDeRed, conAyuda: boolean) => {
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
    // Busy, or done and only the next screen failed: a second tap would send it twice.
    if (pendiente || yendo || errorAlIr !== null) return
    const formulario = evento.currentTarget
    const armado = armarBorradorDeRed(campos)
    if (!armado.ok) {
      setInvalido({ error: armado.error, campo: armado.campo })
      document.getElementById(idDe(armado.campo))?.focus()
      return
    }
    setInvalido(null)
    const { datos } = armado
    ejecutar<{ destino: string }>(
      () =>
        modo.tipo === "nuevo"
          ? guardarBorradorDeRedAccion(datos)
          : editarBorradorDeRedAccion({ ...datos, id: modo.id }),
      ({ destino }) => ir(destino, formulario),
    )
  }

  return (
    <form onSubmit={guardar} noValidate className="grid gap-5">
      <Campo id={idDe("nombre")} etiqueta="Nombre">
        <input
          type="text"
          autoComplete="off"
          maxLength={LARGOS.nombreDeRed}
          value={campos.nombre}
          onChange={cambiar("nombre")}
          {...marca("nombre", false)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      {NOTAS.map(({ campo, etiqueta, ayuda }) => (
        <Campo key={campo} id={idDe(campo)} etiqueta={etiqueta} ayuda={ayuda}>
          <textarea
            rows={4}
            maxLength={LARGOS.notaDeRed}
            value={campos[campo]}
            onChange={cambiar(campo)}
            {...marca(campo, true)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
      ))}
      {invalido ? (
        <div id={idDelError}>
          <LineaDeError>{invalido.error}</LineaDeError>
        </div>
      ) : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      {errorAlIr ? <LineaDeError>{errorAlIr}</LineaDeError> : null}
      <div className="flex flex-wrap gap-3">
        <Boton
          type="submit"
          cargando={(pendiente || yendo) && errorAlIr === null}
          deshabilitado={errorAlIr !== null}
          className="md:w-auto"
        >
          Guardar borrador
        </Boton>
        <Link href={cancelar} className={cn(clasesDeBoton({ variante: "secundario" }), "md:w-auto")}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
