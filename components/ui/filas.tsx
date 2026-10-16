"use client"

import { CaretRight, CaretUpDown } from "@phosphor-icons/react"
import Link from "next/link"
import { type ReactNode, useId } from "react"
import { cn } from "@/lib/utils"
import { ICONO } from "./icono"
import { Interruptor } from "./interruptor"

/** Decision 4: a 3.75rem row of a group that opens another level; the group draws the hairline between rows. */
export function FilaNavegacion({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-fila-baja items-center justify-between gap-3 text-cuerpo font-semibold text-tinta transition-colors duration-[var(--dur-corta)] active:bg-piedra-honda motion-reduce:transition-none"
    >
      {children}
      <CaretRight aria-hidden="true" size={ICONO.medio} className="text-apagado" />
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
  /** What the row says on the left when it is not the accessible name («A las» for «Hora de publicación»). */
  titulo?: string
  /** A word after the value («hora de Chile»). */
  sufijo?: string
}

/**
 * Label left, current value right. The native control sits invisible over the whole row, so iOS shows its own wheel
 * and the target is the full row.
 */
export function FilaConValor<T extends string>({
  etiqueta,
  valor,
  alCambiar,
  tipo = "select",
  opciones = [],
  titulo,
  sufijo,
}: PropiedadesDeFilaConValor<T>) {
  const visible = tipo === "select" ? (opciones.find((opcion) => opcion.valor === valor)?.etiqueta ?? valor) : valor
  const clasesDelControl = "absolute inset-0 size-full cursor-pointer opacity-0"
  return (
    <div className="relative flex min-h-fila-baja items-center justify-between gap-4">
      <span className="text-cuerpo font-semibold">{titulo ?? etiqueta}</span>
      <span className="flex items-center gap-2 text-cuerpo text-apagado tabular-nums">
        <span className="tabular-nums">{visible}</span>
        {sufijo ? <span>{sufijo}</span> : null}
        <CaretUpDown aria-hidden="true" size={ICONO.medio} />
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

/** A label around the switch, so the whole row is its target and the click reaches it once. */
export function FilaConInterruptor({ etiqueta, detalle, encendido, alCambiar }: PropiedadesDeFilaConInterruptor) {
  const id = useId()
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is a button with role=switch, which a label can wrap.
    <label className="flex min-h-fila-baja cursor-pointer items-center justify-between gap-4 py-2">
      <span className="grid">
        <span id={id} className="text-cuerpo font-semibold">
          {etiqueta}
        </span>
        {detalle ? <span className="text-meta text-apagado">{detalle}</span> : null}
      </span>
      <Interruptor encendido={encendido} aria-labelledby={id} onClick={() => alCambiar(!encendido)} />
    </label>
  )
}

interface PropiedadesDeEleccion {
  nombre: string
  valor: string
  elegido: boolean
  etiqueta: string
  /** A line under the label; it describes the radio. */
  detalle?: string
  /** A photo before the label (the avatar's look). */
  imagen?: ReactNode
  alElegir: (valor: string) => void
}

/**
 * Decision 4, a choice row: a sunken round radio that fills with ink around a light dot. Put the rows in a container
 * with the class `elecciones`, so the rows not chosen turn apagado once one is.
 */
export function Eleccion({ nombre, valor, elegido, etiqueta, detalle, imagen, alElegir }: PropiedadesDeEleccion) {
  const idEtiqueta = useId()
  const idDetalle = useId()
  return (
    <label className="relative flex min-h-objetivo cursor-pointer items-center gap-[14px] py-3">
      <input
        type="radio"
        name={nombre}
        value={valor}
        checked={elegido}
        aria-labelledby={idEtiqueta}
        aria-describedby={detalle ? idDetalle : undefined}
        onChange={() => alElegir(valor)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-casilla shrink-0 place-items-center rounded-full",
          elegido ? "bg-tinta shadow-hundido-marcado" : "bg-piedra-honda shadow-hundido outline-2 outline-campo",
        )}
      >
        {elegido ? <span className="size-[0.6rem] rounded-full bg-luz" /> : null}
      </span>
      {imagen}
      <span className="grid min-w-0">
        <span id={idEtiqueta} className="eleccion-titulo text-cuerpo font-semibold">
          {etiqueta}
        </span>
        {detalle ? (
          <span id={idDetalle} className="text-meta text-apagado">
            {detalle}
          </span>
        ) : null}
      </span>
    </label>
  )
}
