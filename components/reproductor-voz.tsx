"use client"

import { ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react"
import type { CSSProperties } from "react"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { mmss } from "@/lib/formato"
import { useReproduccion } from "./use-reproduccion"

interface PropiedadesDeVoz {
  /** Signed URL of the voice; null when it could not be signed. */
  src: string | null
  /** The stored file, so "listened" is remembered per voice. */
  clave: string
  /** Called once she has listened to 95 percent, and again on every visit once she did. */
  alEscuchar: () => void
}

/**
 * Decision 9, v6 `.voz`: the raised play and the time on top, the rail below; it never collapses. After a full listen,
 * the ok pill "La escuchaste completa"; once the voice ended, the play replays it.
 */
export function ReproductorVoz({ src, clave, alEscuchar }: PropiedadesDeVoz) {
  const { elemento, eventos, visto, reproduciendo, terminado, tiempo, duracion, conError, alternar, buscar } =
    useReproduccion<HTMLAudioElement>({ clave, alTerminar: alEscuchar })
  const falla = src === null || conError
  const avance = duracion > 0 ? Math.min(100, (tiempo / duracion) * 100) : 0
  const nombre = reproduciendo ? "Pausar la voz" : terminado ? "Escuchar de nuevo" : "Escuchar la voz"
  const Icono = reproduciendo ? Pause : terminado ? ArrowCounterClockwise : Play

  return (
    <div className="grid gap-1">
      {src ? <audio ref={elemento} src={src} preload="metadata" {...eventos} /> : null}
      <div className="flex items-center gap-[14px]">
        <button
          type="button"
          onClick={alternar}
          disabled={falla}
          aria-label={nombre}
          className="grid size-play shrink-0 place-items-center rounded-full bg-piedra text-tinta shadow-relieve transition-shadow duration-[var(--dur-corta)] ease-salida active:shadow-hundido disabled:bg-piedra-honda disabled:text-apagado disabled:shadow-none"
        >
          <Icono aria-hidden="true" size={ICONO.grande} weight={Icono === ArrowCounterClockwise ? "bold" : "fill"} />
        </button>
        <span data-snapshot="varia" className="text-meta font-semibold text-tinta tabular-nums">
          {mmss(tiempo)} / {mmss(duracion)}
        </span>
      </div>
      <input
        type="range"
        aria-label="Avance de la voz"
        aria-valuetext={`${mmss(tiempo)} de ${mmss(duracion)}`}
        min={0}
        max={duracion > 0 ? duracion : 0}
        step={0.1}
        value={Math.min(tiempo, duracion > 0 ? duracion : 0)}
        disabled={falla || duracion <= 0}
        onChange={(evento) => buscar(Number(evento.target.value))}
        className="avance px-2.5"
        style={{ "--p": `${avance}%` } as CSSProperties}
      />
      {falla ? (
        <LineaDeEstado tipo="error" titulo="No pude cargar la voz. Recarga la pantalla." />
      ) : visto ? (
        <LineaDeEstado tipo="exito" titulo="La escuchaste completa" />
      ) : null}
    </div>
  )
}
