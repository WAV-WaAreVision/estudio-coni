"use client"

import { useId } from "react"

export interface AvatarParaElegir {
  id: string
  nombre: string
  /** A short-lived signed link to the preview photo; null when it could not be signed. */
  imagenUrl: string | null
}

interface PropiedadesDeElegirAvatar {
  avatares: readonly AvatarParaElegir[]
  /** Nothing is pre-selected: null until she picks. */
  elegido: string | null
  alElegir: (avatarId: string) => void
}

export const TEXTO_SIN_AVATARES = "Todavía no hay avatares para elegir: avísale a Federico."

/** Which of WAV's curated looks the reel is recorded with. A native radio group: the arrow keys and focus come free. */
export function ElegirAvatar({ avatares, elegido, alElegir }: PropiedadesDeElegirAvatar) {
  const grupo = useId()
  const titulo = useId()

  if (avatares.length === 0) {
    return <p className="rounded-md bg-aviso-fondo p-3.5 text-[1rem] text-aviso-tinta">{TEXTO_SIN_AVATARES}</p>
  }

  return (
    <div role="radiogroup" aria-labelledby={titulo} className="grid gap-2.5">
      <p id={titulo} className="text-[1rem]">
        Elige con qué avatar se graba
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {avatares.map((avatar) => (
          <label
            key={avatar.id}
            className="relative grid min-h-11 cursor-pointer content-start gap-2 rounded-md border-2 border-linea bg-superficie p-2 has-checked:border-acento has-checked:bg-acento-suave has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-acento"
          >
            <input
              type="radio"
              name={grupo}
              value={avatar.id}
              // The photo's alt and the visible name would otherwise be read twice.
              aria-label={avatar.nombre}
              checked={elegido === avatar.id}
              onChange={() => alElegir(avatar.id)}
              className="sr-only"
            />
            {avatar.imagenUrl ? (
              // A signed R2 link that expires: next/image would only proxy and cache it.
              // biome-ignore lint/performance/noImgElement: see above
              <img
                src={avatar.imagenUrl}
                alt={avatar.nombre}
                className="aspect-[3/4] w-full rounded-sm bg-hundido object-cover"
              />
            ) : null}
            <span className="px-1 pb-1 text-[1rem] font-semibold text-tinta">{avatar.nombre}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
