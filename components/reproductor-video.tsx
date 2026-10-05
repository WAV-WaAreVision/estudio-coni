"use client"

import { Pause, Play } from "@phosphor-icons/react"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { mmss } from "@/lib/formato"
import { cn } from "@/lib/utils"
import { useReproduccion } from "./use-reproduccion"

// Brandkit 9.17: the whole 9:16 and its play fit above the sign bar on load. 44 back + 8 + 112 bar + 16 = 180, less the
// 8 the bar's own padding gives back: 172, plus the safe areas. The width part is the column (560 on a tablet, 40 of margin).
const ALTO_DEL_VIDEO =
  "min(calc((min(100vw, 560px) - 40px) * 16 / 9), calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 172px))"

interface PropiedadesDeVideo {
  src: string | null
  /** The stored file, so "watched" is remembered per video. */
  clave: string
  alVerCompleto: () => void
  /** Shows where Instagram puts its own text and buttons over the video. */
  zonas: boolean
}

/** The 9:16 player at the available height: what is approved is exactly what is seen, with «Avatar IA» on it. */
export function ReproductorVideo({ src, clave, alVerCompleto, zonas }: PropiedadesDeVideo) {
  const { elemento, eventos, reproduciendo, tiempo, duracion, conError, alternar, buscar } =
    useReproduccion<HTMLVideoElement>({ clave, alTerminar: alVerCompleto })
  const falla = src === null || conError
  const avance = duracion > 0 ? Math.min(100, (tiempo / duracion) * 100) : 0

  return (
    <>
      {/* Tapping anywhere on the frame plays or pauses; the play button is the keyboard and screen reader way in. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the labelled play button inside is the control. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the labelled play button inside is the keyboard control. */}
      <div
        role="presentation"
        data-testid="reproductor-video"
        onClick={alternar}
        style={{ "--alto-video": ALTO_DEL_VIDEO } as React.CSSProperties}
        className="relative mx-auto h-[var(--alto-video)] w-[calc(var(--alto-video)*9/16)] max-w-full overflow-hidden rounded-12 bg-tinta text-sobre-video"
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
        <span className="absolute top-3 left-3 grid h-7 place-items-center rounded-12 bg-velo-video px-2 text-meta font-semibold">
          Avatar IA
        </span>
        {zonas ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 bottom-0 grid h-[22%] place-items-center border-t-[1.5px] border-dashed border-sobre-video bg-velo-video px-4 text-center text-meta font-semibold">
              Aquí Instagram pone el texto y los botones
            </div>
            <div className="absolute top-[40%] right-0 bottom-[22%] w-[16%] border-l-[1.5px] border-dashed border-sobre-video bg-velo-video" />
          </div>
        ) : null}
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation()
            alternar()
          }}
          disabled={falla}
          aria-label={reproduciendo ? "Pausar el video" : "Reproducir el video"}
          className={cn(
            "absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-velo-video text-sobre-video",
            "transition-opacity duration-[var(--dur-media)] ease-salida disabled:opacity-50",
            // Playing: out of the picture, but a keyboard user who tabs to it sees it.
            reproduciendo && "opacity-0 focus-visible:opacity-100",
          )}
        >
          {reproduciendo ? (
            <Pause aria-hidden="true" size={28} weight="fill" />
          ) : (
            <Play aria-hidden="true" size={28} weight="fill" />
          )}
        </button>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops a tap on the controls from toggling playback. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: not a control; the range and the time inside are. */}
        <div
          onClick={(evento) => evento.stopPropagation()}
          className="absolute inset-x-0 bottom-0 grid grid-cols-[1fr_auto] items-center gap-x-3 bg-linear-to-t from-velo-video to-transparent px-3 pt-12 pb-1"
        >
          <input
            type="range"
            aria-label="Avance del video"
            aria-valuetext={`${mmss(tiempo)} de ${mmss(duracion)}`}
            min={0}
            max={duracion > 0 ? duracion : 0}
            step={0.1}
            value={Math.min(tiempo, duracion > 0 ? duracion : 0)}
            disabled={falla || duracion <= 0}
            onChange={(evento) => buscar(Number(evento.target.value))}
            className="avance [--avance-color:var(--sobre-video)] [--avance-riel:color-mix(in_srgb,var(--sobre-video)_50%,transparent)]"
            style={{ "--p": `${avance}%` } as React.CSSProperties}
          />
          <span className="text-meta tabular-nums">
            {mmss(tiempo)} / {mmss(duracion)}
          </span>
        </div>
      </div>
      {falla ? (
        <LineaDeEstado tipo="error" titulo="No pude cargar el video. Recarga la pantalla." className="mt-3" />
      ) : null}
    </>
  )
}
