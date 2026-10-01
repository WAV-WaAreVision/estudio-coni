"use client"

import { Pause, Play } from "lucide-react"
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

export function ReproductorVoz({ src, clave, alEscuchar }: PropiedadesDeVoz) {
  const { elemento, eventos, visto, reproduciendo, tiempo, duracion, conError, alternar } =
    useReproduccion<HTMLAudioElement>({ clave, alTerminar: alEscuchar })
  const falla = src === null || conError
  const avance = duracion > 0 ? Math.min(100, (tiempo / duracion) * 100) : 0

  return (
    <div className="grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-lg border border-linea bg-superficie py-2.5 pr-3.5 pl-2.5">
      {src ? <audio ref={elemento} src={src} preload="metadata" {...eventos} /> : null}
      <button
        type="button"
        onClick={alternar}
        disabled={falla}
        aria-label={reproduciendo ? "Pausar la voz" : "Escuchar la voz"}
        className="grid size-13 place-items-center rounded-full bg-acento text-sobre-acento transition-transform duration-150 ease-fuerte active:scale-95 disabled:bg-hundido disabled:text-apagado motion-reduce:active:scale-100"
      >
        {reproduciendo ? (
          <Pause aria-hidden="true" size={22} fill="currentColor" />
        ) : (
          <Play aria-hidden="true" size={22} fill="currentColor" />
        )}
      </button>
      <div className="h-1.5 overflow-hidden rounded-full bg-hundido">
        <div className="h-full rounded-full bg-acento" style={{ width: `${avance}%` }} />
      </div>
      <span className="text-meta text-apagado tabular-nums">
        {mmss(tiempo)} / {mmss(duracion)}
      </span>
      <p className="col-span-2 col-start-2 -mt-1 text-meta text-apagado">
        {falla
          ? "No pude cargar la voz. Recarga la pantalla."
          : visto
            ? "Ya la escuchaste"
            : "Escucha cómo suena antes de grabar"}
      </p>
    </div>
  )
}
