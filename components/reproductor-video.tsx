"use client"

import { Pause, Play } from "@phosphor-icons/react"
import type { CSSProperties } from "react"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { faltanDelVideo } from "@/lib/diseno/video"
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

const INSIGNIA =
  "insignia-video grid min-h-6 place-items-center rounded-control bg-velo-video px-2.5 text-insignia font-semibold"

/**
 * Decision 11, revised after the exit critique: the 9:16 video at the column width, large enough to check lips and
 * subtitles, narrowed only so all of it fits above the sign bar on load (16rem: the back link and the bar). Raised,
 * with "Avatar IA" and, while it plays, what is left. The controls are one row on the bottom strip: play, rail, time.
 */
export function ReproductorVideo({ src, clave, alVerCompleto, zonas }: PropiedadesDeVideo) {
  const { elemento, eventos, visto, reproduciendo, tiempo, duracion, conError, alternar, buscar } =
    useReproduccion<HTMLVideoElement>({ clave, alTerminar: alVerCompleto })
  const falla = src === null || conError
  const avance = duracion > 0 ? Math.min(100, (tiempo / duracion) * 100) : 0
  const faltan = faltanDelVideo({ duracion, tiempo, reproduciendo, visto })

  return (
    <>
      {/* Tapping anywhere on the frame plays or pauses; the play button is the keyboard and screen reader way in. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the labelled play button inside is the control. */}
      <div
        role="presentation"
        data-testid="reproductor-video"
        onClick={alternar}
        className="video-puerta relative mx-auto aspect-[9/16] w-full max-w-[calc((100svh-16rem)*9/16)] overflow-hidden rounded-video bg-video text-luz shadow-relieve"
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
        <div className="absolute top-2.5 left-2.5 z-10 grid justify-items-start gap-1">
          <span className={INSIGNIA}>Avatar IA</span>
          {faltan ? (
            <span data-snapshot="varia" className={INSIGNIA}>
              {faltan}
            </span>
          ) : null}
        </div>
        {zonas ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 bottom-0 grid h-[22%] place-items-center border-t-[1.5px] border-dashed border-luz bg-velo-video px-4 text-center text-insignia font-semibold">
              Aquí Instagram pone el texto y los botones
            </div>
            <div className="absolute top-[40%] right-0 bottom-[22%] w-[16%] border-l-[1.5px] border-dashed border-luz bg-velo-video" />
          </div>
        ) : null}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops a tap on the controls from toggling playback. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: not a control; the button and the range inside are. */}
        <div
          onClick={(evento) => evento.stopPropagation()}
          className="absolute inset-x-2.5 bottom-2.5 z-10 rounded-[14px] bg-velo-video px-1.5"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={alternar}
              disabled={falla}
              aria-label={reproduciendo ? "Pausar el video" : "Reproducir el video"}
              className="grid size-objetivo shrink-0 place-items-center rounded-full text-luz disabled:opacity-50"
            >
              {reproduciendo ? (
                <Pause aria-hidden="true" size={ICONO.chico} weight="fill" />
              ) : (
                <Play aria-hidden="true" size={ICONO.chico} weight="fill" />
              )}
            </button>
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
              className="avance sobre-video min-w-0 flex-1"
              style={{ "--p": `${avance}%` } as CSSProperties}
            />
            <span data-snapshot="varia" className="shrink-0 pr-2 text-insignia tabular-nums">
              {mmss(tiempo)} / {mmss(duracion)}
            </span>
          </div>
        </div>
      </div>
      {falla ? (
        <LineaDeEstado tipo="error" titulo="No pude cargar el video. Recarga la pantalla." className="mt-3" />
      ) : null}
    </>
  )
}
