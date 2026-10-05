"use client"

import { CaretRight, CaretUpDown, Check } from "@phosphor-icons/react"
import Link from "next/link"
import { type ReactNode, useId } from "react"
import { cn } from "@/lib/utils"
import { Interruptor } from "./interruptor"

/** Brandkit 9.3: a 56 px row that opens another level. */
export function FilaNavegacion({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center justify-between border-t border-linea text-cuerpo font-medium text-tinta"
    >
      {children}
      <CaretRight aria-hidden="true" size={20} className="text-apagado" />
    </Link>
  )
}

interface OpcionDeFila<T extends string> {
  valor: T
  etiqueta: string
}

interface PropiedadesDeFilaConValor<T extends string> {
  etiqueta: string
  valor: T
  alCambiar: (valor: T) => void
  /** «select» (default) lists `opciones`; «time» hands over the native time picker. */
  tipo?: "select" | "time"
  opciones?: readonly OpcionDeFila<T>[]
}

/**
 * Brandkit 9.3: label left, current value right. The native control sits invisible over the whole row, so iOS shows
 * its own wheel and the target is the full 56 px.
 */
export function FilaConValor<T extends string>({
  etiqueta,
  valor,
  alCambiar,
  tipo = "select",
  opciones = [],
}: PropiedadesDeFilaConValor<T>) {
  const visible = tipo === "select" ? (opciones.find((opcion) => opcion.valor === valor)?.etiqueta ?? valor) : valor
  const clasesDelControl = "absolute inset-0 size-full cursor-pointer opacity-0"
  return (
    <div className="relative flex min-h-14 items-center justify-between gap-4 border-b border-linea">
      <span className="text-cuerpo">{etiqueta}</span>
      <span className="flex items-center gap-2 text-cuerpo text-apagado tabular-nums">
        <span className="tabular-nums">{visible}</span>
        <CaretUpDown aria-hidden="true" size={20} />
      </span>
      {tipo === "time" ? (
        <input
          type="time"
          aria-label={etiqueta}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value as T)}
          className={clasesDelControl}
        />
      ) : (
        <select
          aria-label={etiqueta}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value as T)}
          className={clasesDelControl}
        >
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

interface PropiedadesDeFilaConInterruptor {
  etiqueta: string
  detalle?: string
  encendido: boolean
  alCambiar: (encendido: boolean) => void
}

/** Brandkit 9.3: a label around the switch, so the whole row is its target and the click reaches it once. */
export function FilaConInterruptor({ etiqueta, detalle, encendido, alCambiar }: PropiedadesDeFilaConInterruptor) {
  const id = useId()
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is a button with role=switch, which a label can wrap.
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b border-linea py-2">
      <span className="grid">
        <span id={id} className="text-cuerpo">
          {etiqueta}
        </span>
        {detalle ? <span className="text-meta text-apagado">{detalle}</span> : null}
      </span>
      <Interruptor encendido={encendido} aria-labelledby={id} onClick={() => alCambiar(!encendido)} />
    </label>
  )
}

interface PropiedadesDeFilaConCheck {
  nombre: string
  valor: string
  elegido: boolean
  etiqueta: string
  alElegir: (valor: string) => void
}

/** Brandkit 9.3: a radio row; the check marks the chosen one. */
export function FilaConCheck({ nombre, valor, elegido, etiqueta, alElegir }: PropiedadesDeFilaConCheck) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b border-linea text-cuerpo",
        "has-[:focus-visible]:shadow-[var(--anillo-foco)]",
      )}
    >
      <input
        type="radio"
        name={nombre}
        value={valor}
        checked={elegido}
        onChange={() => alElegir(valor)}
        className="peer sr-only"
      />
      <span className={elegido ? "font-semibold" : undefined}>{etiqueta}</span>
      {elegido ? <Check aria-hidden="true" size={20} /> : <span className="size-5" />}
    </label>
  )
}
