"use client"

import { Check, Pause, Play } from "@phosphor-icons/react"
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

/** Brandkit 9.16: an outlined play, a seekable rail and the time, flat; the state sits under the rail at x = 80. */
export function ReproductorVoz({ src, clave, alEscuchar }: PropiedadesDeVoz) {
  const { elemento, eventos, visto, reproduciendo, tiempo, duracion, conError, alternar, buscar } =
    useReproduccion<HTMLAudioElement>({ clave, alTerminar: alEscuchar })
  const falla = src === null || conError
  const avance = duracion > 0 ? Math.min(100, (tiempo / duracion) * 100) : 0

  return (
    <div className="grid grid-cols-[48px_1fr_auto] items-center gap-x-3 gap-y-1">
      {src ? <audio ref={elemento} src={src} preload="metadata" {...eventos} /> : null}
      <button
        type="button"
        onClick={alternar}
        disabled={falla}
        aria-label={reproduciendo ? "Pausar la voz" : "Escuchar la voz"}
        className="grid size-12 place-items-center rounded-full text-tinta ring-[1.5px] ring-tinta transition-transform duration-[var(--dur-corta)] ease-salida active:scale-[0.98] disabled:text-apagado disabled:ring-linea motion-reduce:active:scale-100"
      >
        {reproduciendo ? (
          <Pause aria-hidden="true" size={20} weight="fill" />
        ) : (
          <Play aria-hidden="true" size={20} weight="fill" />
        )}
      </button>
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
        className="avance"
        style={{ "--p": `${avance}%` } as React.CSSProperties}
      />
      <span data-snapshot="varia" className="text-meta text-tinta tabular-nums">
        {mmss(tiempo)} / {mmss(duracion)}
      </span>
      <div className="col-span-2 col-start-2">
        {falla ? (
          <LineaDeEstado tipo="error" titulo="No pude cargar la voz. Recarga la pantalla." />
        ) : visto ? (
          <p className="flex items-center gap-2 text-meta text-exito">
            <Check aria-hidden="true" size={16} />
            Ya la escuchaste
          </p>
        ) : (
          <p className="text-meta text-apagado">Escucha cómo suena antes de grabar</p>
        )}
      </div>
    </div>
  )
}
