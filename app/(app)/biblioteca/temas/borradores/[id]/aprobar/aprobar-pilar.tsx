"use client"

import Link from "next/link"
import { type CSSProperties, type FormEvent, useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useIrA } from "@/components/use-ir-a"
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
 * editable, its own live total and its own warning when it is not 100 (it never blocks). On the phone, blocks one under
 * another. On a wide computer (xl, where the table fits beside its panel) the same fields make a table (issue 103): a row per pillar, a column per stage, the grid
 * placing each field by `--fila` and `--columna` while the blocks and their groups step aside (`contents`); each
 * stage's total and warning move to a side panel. The database writes only what changed, on each stage's date.
 */
export function AprobarPilar({ borrador, etapas: iniciales, cancelar }: Propiedades) {
  const id = useId()
  const idDelError = `${id}-error`
  const [etapas, setEtapas] = useState(iniciales)
  const [invalido, setInvalido] = useState<{ error: string; desde: string; clave: string } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()
  // The action names Temas with the new pillar; this goes there and checks it landed (Next can drop it).
  const { ir, yendo, error: errorAlIr } = useIrA()
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
    // Busy, or done and only the next screen failed: a second tap would send it twice.
    if (pendiente || yendo || errorAlIr !== null) return
    const formulario = evento.currentTarget
    const armado = armarPesos(etapas)
    if (!armado.ok) {
      setInvalido({ error: armado.error, desde: armado.desde, clave: armado.clave })
      document.getElementById(idDe(armado.desde, armado.clave))?.focus()
      return
    }
    setInvalido(null)
    ejecutar<{ destino: string }>(
      () => aprobarBorradorDePilarAccion({ id: borrador.id, pesos: armado.pesos }),
      ({ destino }) => ir(destino, formulario),
    )
  }

  const pilares = pilaresDeLaTabla(etapas)
  // Each stage with its total and warning: drawn in its block on a phone and in the side panel on a computer.
  const conSumas = etapas.map((etapa) => {
    const total = totalDePesos(etapa.filas)
    return {
      etapa,
      texto: total === null ? "Total: falta un peso válido" : `Total: ${formatoDePeso(total)} %`,
      aviso: total === null ? null : avisoDePesos(borrador.red, total, etapa),
    }
  })

  return (
    <form
      onSubmit={aprobar}
      noValidate
      className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-x-12"
    >
      <div data-testid="pagina-principal" className="contents xl:grid xl:min-w-0 xl:gap-5">
        <h2 className="text-pieza">{`Pesos de ${NOMBRE_DE_RED[borrador.red]}`}</h2>
        <div
          data-testid="pesos"
          style={{ "--etapas": etapas.length } as CSSProperties}
          className="grid gap-4 xl:grid-cols-[minmax(8rem,max-content)_repeat(var(--etapas),minmax(6.5rem,9rem))] xl:items-center xl:gap-x-4 xl:gap-y-2"
        >
          {conSumas.map(({ etapa, texto, aviso }, posicion) => {
            return (
              <div
                key={etapa.desde}
                data-contorno
                style={{ "--columna": posicion + 2 } as CSSProperties}
                className="rounded-panel bg-piedra-alta p-4 xl:contents"
              >
                <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0 xl:contents">
                  <legend className="mb-1 text-cuerpo font-semibold xl:col-[var(--columna)] xl:row-start-1 xl:mb-0 xl:self-end xl:text-meta">
                    {etapa.etiqueta}
                  </legend>
                  {etapa.filas.map((fila) => {
                    const conError = invalido?.desde === etapa.desde && invalido.clave === fila.clave
                    const enLaTabla = pilares.findIndex((pilar) => pilar.clave === fila.clave) + 2
                    return (
                      <div
                        key={fila.clave}
                        style={{ "--fila": enLaTabla } as CSSProperties}
                        className="grid gap-1 xl:col-[var(--columna)] xl:row-[var(--fila)]"
                      >
                        <label htmlFor={idDe(etapa.desde, fila.clave)} className="text-meta font-semibold xl:sr-only">
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
                  <output aria-live="polite" className="text-cuerpo font-semibold tabular-nums xl:hidden">
                    {texto}
                  </output>
                  {aviso ? <LineaDeEstado tipo="aviso" titulo={aviso} className="xl:hidden" /> : null}
                </fieldset>
              </div>
            )
          })}
          {/* The table's row headings: each field keeps its own label (hidden here), so they are for the eye only. */}
          {pilares.map((pilar, posicion) => (
            <span
              key={pilar.clave}
              aria-hidden="true"
              data-encabezado-de-fila
              style={{ "--fila": posicion + 2 } as CSSProperties}
              className="hidden text-meta font-semibold xl:col-start-1 xl:row-[var(--fila)] xl:block"
            >
              {pilar.nombre}
              {pilar.clave === NUEVO ? <span className="text-apagado"> · nuevo</span> : null}
            </span>
          ))}
        </div>
        <p className="text-meta text-apagado">{AVISO_DE_LA_GUIA}</p>
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
            className="xl:w-auto"
          >
            Aprobar pilar
          </Boton>
          <Link href={cancelar} className={cn(clasesDeBoton({ variante: "secundario" }), "xl:w-auto")}>
            Cancelar
          </Link>
        </div>
      </div>

      {/* Each stage's total and warning beside the table, on a computer only; the phone has them in each block. */}
      <dl
        data-testid="pagina-panel"
        className="hidden xl:sticky xl:top-24 xl:grid xl:content-start xl:gap-4 xl:rounded-panel xl:bg-piedra-alta xl:p-5"
      >
        {conSumas.map(({ etapa, texto, aviso }) => {
          return (
            <div key={etapa.desde} className="grid gap-1.5">
              <dt className="text-meta text-apagado">{etapa.etiqueta}</dt>
              <dd className="m-0 grid gap-2">
                <output aria-live="polite" className="text-cuerpo font-semibold tabular-nums">
                  {texto}
                </output>
                {aviso ? <LineaDeEstado tipo="aviso" titulo={aviso} /> : null}
              </dd>
            </div>
          )
        })}
      </dl>
    </form>
  )
}

/** Every pillar of every stage once, in the order they first appear: the rows of the computer's table. */
function pilaresDeLaTabla(etapas: readonly EtapaEditable[]): { clave: string; nombre: string }[] {
  const vistos = new Map<string, string>()
  for (const etapa of etapas)
    for (const fila of etapa.filas) if (!vistos.has(fila.clave)) vistos.set(fila.clave, fila.nombre)
  return [...vistos].map(([clave, nombre]) => ({ clave, nombre }))
}
