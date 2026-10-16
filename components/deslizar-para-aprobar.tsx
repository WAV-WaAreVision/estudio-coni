"use client"

import { ArrowRight, Check, Info } from "@phosphor-icons/react"
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { apruebaAlSoltar, progresoDeArrastre, UMBRAL_DE_APROBACION } from "@/lib/diseno/deslizador"
import { cn } from "@/lib/utils"

const PASO = 4
// The arrows stop one step before the end: only a drag, End or the Aprobar button approves.
const TOPE_DE_FLECHAS = UMBRAL_DE_APROBACION - PASO
const PULGAR = 48
const MARGEN = 4

interface PropiedadesDeDeslizar {
  etiqueta: string
  /** False until the gate's conditions are met; the control stays focusable so a screen reader can read why. */
  habilitado: boolean
  /** What is missing, shown under the control when it is not enabled. */
  motivo?: string
  /** True while the approval travels to the server: the thumb stays at the end. */
  enviando?: boolean
  /** One short line beside the slider («Tienes 8 s para deshacer.»). */
  nota?: ReactNode
  alAprobar: () => void
}

/**
 * The gesture that approves, on both gates (brandkit 9.12). Pointer events captured on the thumb: tapping the track or
 * the thumb does nothing, approval happens on release at the end. Keyboard: arrows and Home move, End approves.
 * The visible Aprobar button is the alternative to dragging (WCAG 2.5.7): same preconditions, same action.
 */
export function DeslizarParaAprobar({
  etiqueta,
  habilitado,
  motivo,
  enviando = false,
  nota,
  alAprobar,
}: PropiedadesDeDeslizar) {
  const [valor, setValor] = useState(0)
  const [aprobado, setAprobado] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  // Guards against a second approval before React re-renders with `aprobado`.
  const yaAprobo = useRef(false)
  const inicio = useRef<{ x: number; recorrido: number } | null>(null)
  const pista = useRef<HTMLDivElement>(null)
  const idMotivo = useId()
  const activo = habilitado && !enviando
  const conMotivo = !habilitado && motivo

  // The approval did not go through (or finished): the thumb goes back so she can try again.
  useEffect(() => {
    if (!enviando) {
      yaAprobo.current = false
      setAprobado(false)
      setValor((actual) => (actual >= UMBRAL_DE_APROBACION ? 0 : actual))
    }
  }, [enviando])

  function aprobar() {
    if (yaAprobo.current || !activo) return
    yaAprobo.current = true
    setAprobado(true)
    setValor(100)
    alAprobar()
  }

  function alBajar(evento: PointerEvent<HTMLDivElement>) {
    if (!activo || yaAprobo.current || !pista.current) return
    evento.currentTarget.setPointerCapture(evento.pointerId)
    const ancho = pista.current.getBoundingClientRect().width
    inicio.current = { x: evento.clientX, recorrido: ancho - PULGAR - 2 * MARGEN }
    setArrastrando(true)
  }

  function alMover(evento: PointerEvent<HTMLDivElement>) {
    if (!inicio.current) return
    setValor(
      progresoDeArrastre({ inicioX: inicio.current.x, actualX: evento.clientX, recorrido: inicio.current.recorrido }),
    )
  }

  function alSoltar(evento: PointerEvent<HTMLDivElement>) {
    if (!inicio.current) return
    const final = progresoDeArrastre({
      inicioX: inicio.current.x,
      actualX: evento.clientX,
      recorrido: inicio.current.recorrido,
    })
    inicio.current = null
    setArrastrando(false)
    if (apruebaAlSoltar(final)) aprobar()
    else setValor(0)
  }

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (yaAprobo.current) return
    const pasos: Record<string, number> = { ArrowRight: PASO, ArrowUp: PASO, ArrowLeft: -PASO, ArrowDown: -PASO }
    if (evento.key === "End") {
      evento.preventDefault()
      aprobar()
    } else if (evento.key === "Home") {
      evento.preventDefault()
      setValor(0)
    } else if (evento.key in pasos) {
      evento.preventDefault()
      if (activo) setValor((actual) => Math.min(TOPE_DE_FLECHAS, Math.max(0, actual + pasos[evento.key])))
    }
  }

  return (
    <div className="grid gap-2">
      <div ref={pista} data-testid="pista-deslizador" className="relative h-14 touch-pan-y rounded-full bg-pista">
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            aprobado ? "bg-firma" : "bg-firma-rastro",
            !arrastrando && "transition-[width] duration-[var(--dur-larga)] ease-vuelta",
          )}
          style={{
            width:
              valor === 0 ? 0 : `calc(${MARGEN + PULGAR / 2}px + (100% - ${PULGAR + 2 * MARGEN}px) * ${valor / 100})`,
          }}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-4 left-14 grid place-items-center text-center text-cuerpo font-semibold",
            aprobado ? "text-sobre-firma" : activo ? "text-tinta" : "text-apagado",
          )}
          style={{ opacity: aprobado ? 1 : Math.max(0, 1 - valor / 60) }}
        >
          {aprobado ? "Aprobado" : etiqueta}
        </span>
        <div
          role="slider"
          tabIndex={0}
          aria-label={etiqueta}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(valor)}
          aria-valuetext={aprobado ? "Aprobado" : "No aprobado"}
          aria-disabled={!activo}
          aria-describedby={conMotivo ? idMotivo : undefined}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onKeyDown={alTeclear}
          className={cn(
            "absolute top-1 grid size-12 touch-none place-items-center rounded-full",
            !arrastrando && "transition-[left] duration-[var(--dur-larga)] ease-vuelta",
            aprobado
              ? "bg-sobre-firma text-firma"
              : activo
                ? "cursor-grab bg-firma text-sobre-firma active:cursor-grabbing"
                : "cursor-not-allowed bg-superficie text-apagado ring-[1.5px] ring-apagado ring-inset",
          )}
          style={{ left: `calc(${MARGEN}px + (100% - ${PULGAR + 2 * MARGEN}px) * ${valor / 100})` }}
        >
          {aprobado ? (
            <Check aria-hidden="true" weight="bold" size={ICONO.grande} />
          ) : (
            <ArrowRight aria-hidden="true" size={ICONO.grande} />
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Boton
          variante="linea"
          tamano="chico"
          className="w-fit shrink-0"
          deshabilitado={!activo || aprobado}
          aria-describedby={conMotivo ? idMotivo : undefined}
          onClick={aprobar}
        >
          Aprobar
        </Boton>
        {nota ? <p className="text-meta text-apagado">{nota}</p> : null}
      </div>
      {conMotivo ? (
        <p id={idMotivo} className="flex items-start gap-2 text-meta font-medium text-tinta">
          <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
          {motivo}
        </p>
      ) : null}
    </div>
  )
}
