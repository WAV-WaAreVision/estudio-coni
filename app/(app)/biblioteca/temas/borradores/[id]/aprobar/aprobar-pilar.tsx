"use client"

import Link from "next/link"
import { type FormEvent, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import {
  AVISO_DE_LA_GUIA,
  armarPesos,
  avisoDePesos,
  type BorradorDePilar,
  type EtapaEditable,
  formatoDePeso,
  NUEVO,
  totalDePesos,
} from "@/lib/dominio/biblioteca/borradores"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"
import { CLASES_DE_CAMPO } from "../../../../campo"
import { aprobarBorradorDePilarAccion } from "../../acciones"

interface Propiedades {
  borrador: BorradorDePilar
  /** «Hoy» and each later stage of the network, the new pillar last in each (`etapasDeAprobacion`). */
  etapas: EtapaEditable[]
  cancelar: string
}

/**
 * Spec 15c, decision 8: every stage of the network's weights from today on, each with every pillar and the new one,
 * editable, its own live total and its own warning when it is not 100 (it never blocks). Columns on the computer,
 * blocks one under another on the phone. The database writes only what changed, on each stage's date.
 */
export function AprobarPilar({ borrador, etapas: iniciales, cancelar }: Propiedades) {
  const id = useId()
  const idDelError = `${id}-error`
  const [etapas, setEtapas] = useState(iniciales)
  const [invalido, setInvalido] = useState<{ error: string; desde: string; clave: string } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()
  const idDe = (desde: string, clave: string) => `${id}-${desde}-${clave}`

  function cambiar(desde: string, clave: string, peso: string) {
    setEtapas((actuales) =>
      actuales.map((etapa) =>
        etapa.desde !== desde
          ? etapa
          : { ...etapa, filas: etapa.filas.map((fila) => (fila.clave === clave ? { ...fila, peso } : fila)) },
      ),
    )
  }

  function aprobar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const armado = armarPesos(etapas)
    if (!armado.ok) {
      setInvalido({ error: armado.error, desde: armado.desde, clave: armado.clave })
      document.getElementById(idDe(armado.desde, armado.clave))?.focus()
      return
    }
    setInvalido(null)
    ejecutar(() => aprobarBorradorDePilarAccion({ id: borrador.id, pesos: armado.pesos }))
  }

  return (
    <form onSubmit={aprobar} noValidate className="grid gap-5">
      <h2 className="text-pieza">{`Pesos de ${NOMBRE_DE_RED[borrador.red]}`}</h2>
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] md:items-start">
        {etapas.map((etapa) => {
          const total = totalDePesos(etapa.filas)
          const aviso = total === null ? null : avisoDePesos(borrador.red, total, etapa)
          return (
            <div key={etapa.desde} data-contorno className="rounded-panel bg-piedra-alta p-4">
              <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
                <legend className="mb-1 text-cuerpo font-semibold">{etapa.etiqueta}</legend>
                {etapa.filas.map((fila) => {
                  const conError = invalido?.desde === etapa.desde && invalido.clave === fila.clave
                  return (
                    <div key={fila.clave} className="grid gap-1">
                      <label htmlFor={idDe(etapa.desde, fila.clave)} className="text-meta font-semibold">
                        {fila.nombre}
                        {fila.clave === NUEVO ? <span className="text-apagado"> · nuevo</span> : null}
                        {/* The same pillar is in every stage: the stage completes its name. */}
                        <span className="sr-only">{`, ${etapa.etiqueta}`}</span>
                      </label>
                      <input
                        id={idDe(etapa.desde, fila.clave)}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={fila.peso}
                        onChange={(evento) => cambiar(etapa.desde, fila.clave, evento.target.value)}
                        aria-invalid={conError || undefined}
                        aria-describedby={conError ? idDelError : undefined}
                        className={cn(CLASES_DE_CAMPO, "tabular-nums")}
                      />
                    </div>
                  )
                })}
                <output aria-live="polite" className="text-cuerpo font-semibold tabular-nums">
                  {total === null ? "Total: falta un peso válido" : `Total: ${formatoDePeso(total)} %`}
                </output>
                {aviso ? <LineaDeEstado tipo="aviso" titulo={aviso} /> : null}
              </fieldset>
            </div>
          )
        })}
      </div>
      <p className="text-meta text-apagado">{AVISO_DE_LA_GUIA}</p>
      {invalido ? (
        <div id={idDelError}>
          <LineaDeError>{invalido.error}</LineaDeError>
        </div>
      ) : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={pendiente} className="md:w-auto">
          Aprobar pilar
        </Boton>
        <Link href={cancelar} className={cn(clasesDeBoton({ variante: "secundario" }), "md:w-auto")}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
