"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Eleccion, FilaConValor } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { etiquetaDeDia, etiquetaDeFecha, horaElegida, horaEnBloques } from "@/lib/dominio/fechas"
import type { FechaPropuesta } from "./video/[id]/pantalla-video"

const OTRA = "otra"

export interface EleccionDeFecha {
  /** What the signature sends, or null while nothing valid is chosen. */
  fecha: FechaPropuesta | null
  fechas: FechaPropuesta[]
  zona: string
  elegida: string
  elegir: (valor: string) => void
  dia: string
  setDia: (dia: string) => void
  hora: string
  setHora: (hora: string) => void
  motivo: string | null
  cambiando: boolean
  setCambiando: (cambiando: boolean) => void
}

/**
 * Gate 2's date (spec 2026-10-28): a schedule slot, or "Otra fecha y hora" picked in Chile time. The clock is read only
 * once a day is picked (decision P4), so the server and the first client frame agree.
 */
export function useEleccionDeFecha(entrada: {
  fechas: FechaPropuesta[]
  zona: string
  horaDelRitmo: string
}): EleccionDeFecha {
  const { fechas, zona } = entrada
  const [elegida, elegir] = useState(fechas[0]?.iso ?? OTRA)
  const [dia, setDia] = useState("")
  const [hora, setHora] = useState(horaEnBloques(entrada.horaDelRitmo))
  const [cambiando, setCambiando] = useState(fechas.length === 0)

  let fecha: FechaPropuesta | null = null
  let motivo: string | null = null
  if (elegida === OTRA) {
    const resultado = horaElegida({ dia, hora, zona, ahora: dia === "" ? 0 : Date.now() })
    if (resultado.ok) {
      fecha = {
        iso: resultado.iso,
        etiqueta: etiquetaDeFecha(resultado.iso, zona, "larga"),
        corta: etiquetaDeFecha(resultado.iso, zona, "corta"),
      }
    } else {
      motivo = resultado.motivo
    }
  } else {
    fecha = fechas.find((propuesta) => propuesta.iso === elegida) ?? null
  }
  return { fecha, fechas, zona, elegida, elegir, dia, setDia, hora, setHora, motivo, cambiando, setCambiando }
}

/** The "Cuándo sale" / "Dónde y cuándo" section body: the chosen date, then the choices while she changes it. */
export function ElegirFecha({
  eleccion,
  meta,
  debajo,
}: {
  eleccion: EleccionDeFecha
  /** "LinkedIn · hora de Chile": where and in which clock. */
  meta: string
  /** What follows from the chosen time (the carousel's LinkedIn line). */
  debajo?: (iso: string) => ReactNode
}) {
  const { fecha, cambiando } = eleccion
  const abierto = cambiando || fecha === null
  return (
    <div className="grid gap-2">
      {fecha ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="grid">
            <span data-snapshot="varia" className="font-semibold tabular-nums">
              {fecha.etiqueta}
            </span>
            <span className="text-meta text-apagado">{meta}</span>
          </span>
          <Boton
            variante="secundario"
            tamano="chico"
            aria-expanded={cambiando}
            onClick={() => eleccion.setCambiando(!cambiando)}
          >
            {cambiando ? "Listo" : "Cambiar"}
          </Boton>
        </div>
      ) : null}
      {fecha && debajo ? <p className="text-meta text-apagado">{debajo(fecha.iso)}</p> : null}
      {abierto ? (
        <fieldset className="elecciones grid border-0 p-0">
          <legend className="sr-only">Elige cuándo sale</legend>
          {eleccion.fechas.map((propuesta) => (
            <Eleccion
              key={propuesta.iso}
              nombre="fecha"
              valor={propuesta.iso}
              elegido={propuesta.iso === eleccion.elegida}
              etiqueta={propuesta.etiqueta}
              alElegir={eleccion.elegir}
            />
          ))}
          <Eleccion
            nombre="fecha"
            valor={OTRA}
            elegido={eleccion.elegida === OTRA}
            etiqueta="Otra fecha y hora"
            alElegir={eleccion.elegir}
          />
        </fieldset>
      ) : null}
      {abierto && eleccion.elegida === OTRA ? (
        <>
          <Grupo>
            <FilaConValor
              tipo="date"
              etiqueta="Día"
              valor={eleccion.dia}
              mostrar={etiquetaDeDia(eleccion.dia, eleccion.zona) || "Elegir"}
              alCambiar={eleccion.setDia}
            />
            <FilaConValor
              tipo="time"
              etiqueta="Hora"
              valor={eleccion.hora}
              step={300}
              sufijo="hora de Chile"
              alCambiar={eleccion.setHora}
            />
          </Grupo>
          <p className="text-meta text-apagado" aria-live="polite">
            {eleccion.motivo ?? ""}
          </p>
        </>
      ) : null}
    </div>
  )
}
