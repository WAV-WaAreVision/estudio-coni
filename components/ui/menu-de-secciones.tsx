"use client"

import { CaretDown, Check } from "@phosphor-icons/react"
import Link from "next/link"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { ICONO } from "./icono"

interface OpcionDeSeccion<T extends string> {
  valor: T
  etiqueta: string
  href: string
  icono?: ReactNode
}

interface PropiedadesDeMenuDeSecciones<T extends string> {
  /** The landmark's name, the same one the tabs carry on a computer. */
  etiqueta: string
  /** The button's name before the open section's ("Sección de la Biblioteca: Semana"); it ends in the visible word. */
  nombreDelBoton: string
  actual: T
  opciones: readonly OpcionDeSeccion<T>[]
  className?: string
}

/**
 * The phone's way between sections when they no longer fit one row as tabs: a button naming the open one, which folds
 * out the sections as links. Choosing one, Escape (the focus goes back to the button), a tap outside or Tab past the
 * last one folds it.
 */
export function MenuDeSecciones<T extends string>({
  etiqueta,
  nombreDelBoton,
  actual,
  opciones,
  className,
}: PropiedadesDeMenuDeSecciones<T>) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const idDeLaLista = useId()
  const abierta = opciones.find((opcion) => opcion.valor === actual)

  useEffect(() => {
    if (!abierto) return
    const alTocar = (evento: PointerEvent) => {
      if (!caja.current?.contains(evento.target as Node)) setAbierto(false)
    }
    // On the document, not the nav: Safari does not focus a button on a tap, so after one the focus is on the body.
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return
      setAbierto(false)
      boton.current?.focus()
    }
    document.addEventListener("pointerdown", alTocar)
    document.addEventListener("keydown", alPulsar)
    return () => {
      document.removeEventListener("pointerdown", alTocar)
      document.removeEventListener("keydown", alPulsar)
    }
  }, [abierto])

  return (
    <nav
      ref={caja}
      aria-label={etiqueta}
      className={cn("relative min-w-0", className)}
      onBlur={(evento) => {
        // Tab past the last section closes it, so the open list never covers what takes the focus (WCAG 2.4.11).
        // A null target (a Safari tap on the button, the window losing focus) is left to the tap and click handlers.
        const destino = evento.relatedTarget
        if (destino && !caja.current?.contains(destino)) setAbierto(false)
      }}
    >
      <button
        ref={boton}
        type="button"
        aria-label={`${nombreDelBoton}: ${abierta?.etiqueta ?? ""}`}
        aria-expanded={abierto}
        aria-controls={idDeLaLista}
        onClick={() => setAbierto((antes) => !antes)}
        className={cn(
          "inline-flex min-h-objetivo max-w-full items-center gap-2 rounded-control bg-piedra px-3 text-cuerpo font-semibold text-tinta shadow-relieve",
          "transition-shadow duration-[var(--dur-corta)] ease-salida active:shadow-hundido",
          abierto && "shadow-hundido",
        )}
      >
        {abierta?.icono}
        <span className="min-w-0">{abierta?.etiqueta}</span>
        <CaretDown
          aria-hidden="true"
          size={ICONO.medio}
          className={cn(
            "shrink-0 text-apagado transition-transform duration-[var(--dur-media)] ease-salida",
            abierto && "rotate-180",
          )}
        />
      </button>
      {/* Above z-10: the Temas network row lifts its chips to z-10 and sits later in the page, so a tie lost the taps. */}
      <ul
        id={idDeLaLista}
        hidden={!abierto}
        className="absolute top-full left-0 z-20 mt-2 grid w-max min-w-full max-w-[calc(100vw-2.5rem)] gap-1 rounded-panel bg-piedra p-1 shadow-relieve-alto"
      >
        {opciones.map((opcion) => {
          const esActual = opcion.valor === actual
          return (
            <li key={opcion.valor}>
              <Link
                href={opcion.href}
                replace
                aria-current={esActual ? "page" : undefined}
                onClick={() => setAbierto(false)}
                className={cn(
                  "flex min-h-objetivo items-center gap-2 rounded-control px-3 text-cuerpo",
                  esActual ? "bg-piedra-honda font-semibold text-tinta shadow-hundido" : "font-medium text-apagado",
                )}
              >
                {opcion.icono}
                <span className="min-w-0 flex-1">{opcion.etiqueta}</span>
                {esActual ? <Check aria-hidden="true" size={ICONO.medio} className="shrink-0" /> : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
