"use client"

import { ArrowRight, Check, Lock } from "@phosphor-icons/react"
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useEffect, useId, useRef, useState } from "react"
import { ICONO } from "@/components/ui/icono"
import {
  ARMADO_MAXIMO_MS,
  AYUDA_DE_TECLADO,
  AYUDA_DE_TOQUE,
  apruebaAlSoltar,
  ETIQUETA_CORTA_DE_FIRMA,
  ETIQUETA_DE_FIRMA,
  esToque,
  PISTA_DE_FIRMA,
  progresoDeArrastre,
  respuestaAlToque,
  TEXTO_ARMADO,
  TEXTO_FIRMADO,
  TEXTO_SIN_FIRMAR,
  UMBRAL_DE_APROBACION,
} from "@/lib/diseno/deslizador"
import { cn } from "@/lib/utils"

const MARGEN = 4
const TECLAS_QUE_FIRMAN = new Set(["Enter", " ", "End"])
const TECLAS_QUE_ARMAN = new Set(["ArrowUp", "ArrowRight"])
const TECLAS_QUE_DESARMAN = new Set(["ArrowDown", "ArrowLeft", "Home", "Escape"])

interface PropiedadesDeDeslizar {
  /** False until the gate's conditions are met; the track stays focusable so a screen reader can read why. */
  habilitado: boolean
  /** True while the signature travels to the server: the thumb stays at the end. */
  enviando?: boolean
  /** Ids of what describes the track (the "Falta:" line, the consequence), space separated. */
  describidoPor?: string
  alFirmar: () => void
}

interface Gesto {
  x: number
  y: number
  /** It started on the thumb at rest: a move past 8 px is a drag. Anywhere else it is a scroll. */
  enPulgar: boolean
  recorrido: number
  arrastre: boolean
}

/**
 * Decision 5: the one sign control, on both gates. Drag the thumb past 96 percent and release; or tap anywhere on the
 * track to arm it and tap again between 400 ms and 4 s to sign (WCAG 2.5.7: single pointer, no path; 2.5.2: it signs
 * on the up event). Enter, Space and End sign; ArrowUp and ArrowRight arm, then sign; ArrowDown, ArrowLeft, Home and
 * Escape disarm.
 */
export function DeslizarParaAprobar({ habilitado, enviando = false, describidoPor, alFirmar }: PropiedadesDeDeslizar) {
  const [valor, setValor] = useState(0)
  const [armado, setArmado] = useState(false)
  const [firmado, setFirmado] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  // Guards against a second signature before React re-renders with `firmado`.
  const yaFirmo = useRef(false)
  const armadoEn = useRef<number | null>(null)
  const gesto = useRef<Gesto | null>(null)
  const pista = useRef<HTMLDivElement>(null)
  const pulgar = useRef<HTMLSpanElement>(null)
  const idPista = useId()
  const activo = habilitado && !enviando

  // The signature did not go through (or finished): the thumb goes back so she can try again.
  useEffect(() => {
    if (!enviando) {
      yaFirmo.current = false
      setFirmado(false)
      setValor((actual) => (actual >= UMBRAL_DE_APROBACION ? 0 : actual))
    }
  }, [enviando])

  // A control that closes while armed (she started editing, a refresh brought a block) disarms.
  useEffect(() => {
    if (habilitado) return
    armadoEn.current = null
    setArmado(false)
    if (!yaFirmo.current) setValor(0)
  }, [habilitado])

  // Armed for 4 s at most; then the thumb goes back.
  useEffect(() => {
    if (!armado) return
    const temporizador = setTimeout(() => {
      armadoEn.current = null
      setArmado(false)
      setValor(0)
    }, ARMADO_MAXIMO_MS)
    return () => clearTimeout(temporizador)
  }, [armado])

  function desarmar() {
    armadoEn.current = null
    setArmado(false)
    setValor(0)
  }

  function armar() {
    armadoEn.current = Date.now()
    setArmado(true)
    setValor(100)
  }

  function firmar() {
    if (yaFirmo.current || !activo) return
    yaFirmo.current = true
    armadoEn.current = null
    setArmado(false)
    setFirmado(true)
    setValor(100)
    alFirmar()
  }

  function tocar() {
    if (!activo || yaFirmo.current) return
    const respuesta = respuestaAlToque(armadoEn.current, Date.now())
    if (respuesta === "armar") armar()
    else if (respuesta === "firmar") firmar()
  }

  function alBajar(evento: PointerEvent<HTMLDivElement>) {
    if (!activo || yaFirmo.current || !pista.current) return
    const sobrePulgar = evento.target instanceof Node && (pulgar.current?.contains(evento.target) ?? false)
    const anchoDePista = pista.current.getBoundingClientRect().width
    const anchoDePulgar = pulgar.current?.getBoundingClientRect().width ?? 0
    gesto.current = {
      x: evento.clientX,
      y: evento.clientY,
      enPulgar: sobrePulgar && !armado,
      recorrido: anchoDePista - anchoDePulgar - 2 * MARGEN,
      arrastre: false,
    }
    if (sobrePulgar && !armado) evento.currentTarget.setPointerCapture(evento.pointerId)
  }

  function alMover(evento: PointerEvent<HTMLDivElement>) {
    const actual = gesto.current
    if (!actual) return
    if (!actual.arrastre) {
      if (esToque({ dx: evento.clientX - actual.x, dy: evento.clientY - actual.y })) return
      // Past 8 px: a drag when it started on the thumb, otherwise a scroll that signs nothing.
      if (!actual.enPulgar) {
        gesto.current = null
        return
      }
      actual.arrastre = true
      setArrastrando(true)
    }
    setValor(progresoDeArrastre({ inicioX: actual.x, actualX: evento.clientX, recorrido: actual.recorrido }))
  }

  function alSoltar(evento: PointerEvent<HTMLDivElement>) {
    const actual = gesto.current
    gesto.current = null
    if (!actual) return
    if (!actual.arrastre) {
      if (esToque({ dx: evento.clientX - actual.x, dy: evento.clientY - actual.y })) tocar()
      return
    }
    setArrastrando(false)
    const final = progresoDeArrastre({ inicioX: actual.x, actualX: evento.clientX, recorrido: actual.recorrido })
    if (apruebaAlSoltar(final)) firmar()
    else setValor(0)
  }

  // VoiceOver's double tap, Voice Control, Switch Control and desktop screen readers send a click with no pointer
  // events (detail 0). A real pointer's click has detail >= 1 and alSoltar already handled its tap.
  function alActivar(evento: MouseEvent<HTMLDivElement>) {
    if (evento.detail === 0) tocar()
  }

  function alCancelar() {
    const actual = gesto.current
    gesto.current = null
    if (actual?.arrastre) {
      setArrastrando(false)
      setValor(0)
    }
  }

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (yaFirmo.current) return
    if (TECLAS_QUE_FIRMAN.has(evento.key)) {
      evento.preventDefault()
      firmar()
    } else if (TECLAS_QUE_ARMAN.has(evento.key)) {
      evento.preventDefault()
      tocar()
    } else if (TECLAS_QUE_DESARMAN.has(evento.key)) {
      evento.preventDefault()
      if (armado) desarmar()
    }
  }

  const texto = firmado ? TEXTO_FIRMADO : armado ? TEXTO_ARMADO : null
  const posicion = `calc(${MARGEN}px + (100% - var(--pulgar-firma) - ${2 * MARGEN}px) * ${valor / 100})`

  return (
    <>
      <div
        ref={pista}
        role="slider"
        tabIndex={0}
        aria-label={ETIQUETA_DE_FIRMA}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(valor)}
        aria-valuetext={firmado ? TEXTO_FIRMADO : armado ? TEXTO_ARMADO : TEXTO_SIN_FIRMAR}
        aria-disabled={!activo}
        aria-describedby={describidoPor ? `${describidoPor} ${idPista}` : idPista}
        data-testid="pista-de-firma"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alCancelar}
        onClick={alActivar}
        onKeyDown={alTeclear}
        className={cn(
          "pista-de-firma relative flex min-h-[var(--pista-firma)] touch-pan-y items-center rounded-control bg-piedra-honda shadow-hundido select-none focus-visible:outline-3 focus-visible:outline-offset-3",
          activo ? "cursor-grab" : "cursor-not-allowed",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 left-0 rounded-control",
            firmado ? "bg-firma" : "bg-firma-rastro",
            !arrastrando && "transition-[width] duration-[var(--dur-larga)] ease-vuelta",
          )}
          style={{ width: valor === 0 ? 0 : `calc(${posicion} + var(--pulgar-firma) / 2)` }}
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative z-10 flex-1 py-2 pr-4 pl-[calc(var(--pulgar-firma)+var(--hueco-etiqueta))] text-center text-cuerpo leading-tight font-semibold text-balance",
            firmado ? "text-luz" : activo ? "text-tinta" : "text-apagado",
          )}
        >
          {texto ? (
            <span data-etiqueta-de-firma>{texto}</span>
          ) : (
            <>
              <span data-etiqueta-de-firma className="etiqueta-de-firma-larga">
                {ETIQUETA_DE_FIRMA}
              </span>
              <span data-etiqueta-de-firma className="etiqueta-de-firma-corta">
                {ETIQUETA_CORTA_DE_FIRMA}
              </span>
            </>
          )}
        </span>
        <span
          ref={pulgar}
          aria-hidden="true"
          data-testid="pulgar-firma"
          className={cn(
            "absolute top-1/2 z-20 grid size-[var(--pulgar-firma)] -translate-y-1/2 touch-none place-items-center rounded-full",
            !arrastrando && "transition-[left] duration-[var(--dur-larga)] ease-vuelta",
            firmado
              ? "bg-luz text-firma"
              : activo
                ? "bg-firma text-luz shadow-relieve-pulgar"
                : "bg-piedra text-apagado outline-2 -outline-offset-2 outline-campo",
          )}
          style={{ left: posicion }}
        >
          {firmado ? (
            <Check aria-hidden="true" weight="bold" size={ICONO.grande} />
          ) : habilitado ? (
            <ArrowRight aria-hidden="true" data-icono="flecha" size={ICONO.grande} />
          ) : (
            // v6 2b and 3: a closed signature is a lock on a flat thumb; the "Falta:" line says why.
            <Lock aria-hidden="true" data-icono="candado" size={ICONO.grande} />
          )}
        </span>
        <span id={idPista} className="sr-only">
          {PISTA_DE_FIRMA}
        </span>
      </div>
      {habilitado ? (
        // The visible way to sign without dragging (WCAG 2.5.7). The track's description says it to a screen reader;
        // armed, the line keeps its height so the track does not move under the finger between the two taps.
        <p
          data-ayuda-de-firma
          aria-hidden="true"
          className={cn("ayuda-de-firma -mt-1 text-center text-meta text-apagado", (armado || firmado) && "invisible")}
        >
          <span className="ayuda-de-toque">{AYUDA_DE_TOQUE}</span>
          <span className="ayuda-de-teclado">{AYUDA_DE_TECLADO}</span>
        </p>
      ) : null}
    </>
  )
}
