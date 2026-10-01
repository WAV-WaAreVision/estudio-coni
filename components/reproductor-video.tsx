"use client"

import { Pause, Play } from "lucide-react"
import { mmss } from "@/lib/formato"
import { useReproduccion } from "./use-reproduccion"

interface PropiedadesDeVideo {
  src: string | null
  /** The stored file, so "watched" is remembered per video. */
  clave: string
  alVerCompleto: () => void
  /** Shows where Instagram puts its own text and buttons over the video. */
  zonas: boolean
}

/** The 9:16 player at full width: what is approved is exactly what is seen, with the "Avatar IA" label on it. */
export function ReproductorVideo({ src, clave, alVerCompleto, zonas }: PropiedadesDeVideo) {
  const { elemento, eventos, reproduciendo, tiempo, duracion, conError, alternar } = useReproduccion<HTMLVideoElement>({
    clave,
    alTerminar: alVerCompleto,
  })
  const falla = src === null || conError
  const avance = duracion > 0 ? Math.min(100, (tiempo / duracion) * 100) : 0

  return (
    <div
      className="relative mx-auto aspect-[9/16] w-[min(100%,calc(88dvh*9/16))] overflow-hidden bg-tinta text-sobre-acento"
      data-testid="reproductor-video"
    >
      {src ? (
        <video
          ref={elemento}
          src={src}
          playsInline
          preload="metadata"
          className="size-full object-cover"
          aria-label="Video de tu avatar"
          {...eventos}
        >
          <track kind="captions" />
        </video>
      ) : null}
      <span className="absolute top-3 left-3 rounded-full bg-tinta/65 px-2.5 py-1.5 text-label font-semibold text-sobre-acento">
        Avatar IA
      </span>
      {falla ? (
        <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-body font-semibold">
          No pude cargar el video. Recarga la pantalla.
        </p>
      ) : null}
      {zonas ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 bottom-0 grid h-[22%] place-items-center border-t-2 border-dashed border-sobre-acento/80 bg-tinta/55 px-4 text-center text-label font-semibold">
            Aquí Instagram pone el texto y los botones
          </div>
          <div className="absolute top-[40%] right-0 bottom-[22%] w-[16%] border-l-2 border-dashed border-sobre-acento/80 bg-tinta/55" />
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 grid grid-cols-[48px_1fr_auto] items-center gap-2.5 bg-gradient-to-t from-tinta/60 to-transparent p-3">
        <button
          type="button"
          onClick={alternar}
          disabled={falla}
          aria-label={reproduciendo ? "Pausar el video" : "Reproducir el video"}
          className="grid size-12 place-items-center rounded-full bg-sobre-acento/90 text-tinta transition-transform duration-150 ease-fuerte active:scale-95 disabled:opacity-50 motion-reduce:active:scale-100"
        >
          {reproduciendo ? (
            <Pause aria-hidden="true" size={20} fill="currentColor" />
          ) : (
            <Play aria-hidden="true" size={20} fill="currentColor" />
          )}
        </button>
        <div className="h-1.5 overflow-hidden rounded-full bg-sobre-acento/35">
          <div className="h-full bg-sobre-acento" style={{ width: `${avance}%` }} />
        </div>
        <span className="text-label tabular-nums">
          {mmss(tiempo)} / {mmss(duracion)}
        </span>
      </div>
    </div>
  )
}
