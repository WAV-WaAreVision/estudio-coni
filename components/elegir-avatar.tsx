"use client"

import { Check } from "@phosphor-icons/react"
import { useId } from "react"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { cn } from "@/lib/utils"

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
    return <LineaDeEstado tipo="aviso" titulo={TEXTO_SIN_AVATARES} tituloEnTinta />
  }

  return (
    <div role="radiogroup" aria-labelledby={titulo} className="grid gap-3">
      <p id={titulo} className="text-meta text-apagado">
        Elige con qué avatar se graba
      </p>
      <div className="grid grid-cols-2 gap-3">
        {avatares.map((avatar) => {
          const elegida = elegido === avatar.id
          return (
            <label
              key={avatar.id}
              className="relative grid min-h-11 cursor-pointer content-start gap-2 has-focus-visible:shadow-[var(--anillo-foco)]"
            >
              <input
                type="radio"
                name={grupo}
                value={avatar.id}
                // The photo's alt and the visible name would otherwise be read twice.
                aria-label={avatar.nombre}
                checked={elegida}
                onChange={() => alElegir(avatar.id)}
                className="sr-only"
              />
              {avatar.imagenUrl ? (
                // A signed R2 link that expires: next/image would only proxy and cache it.
                // biome-ignore lint/performance/noImgElement: see above
                <img
                  src={avatar.imagenUrl}
                  alt={avatar.nombre}
                  style={{ filter: "brightness(var(--foto-brillo))" }}
                  className={cn(
                    "aspect-[3/4] w-full rounded-12 bg-pista object-cover",
                    elegida && "outline-2 outline-offset-[3px] outline-tinta",
                  )}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-2 right-2 grid size-6 place-items-center rounded-full",
                  elegida ? "bg-tinta" : "bg-superficie ring-[1.5px] ring-campo ring-inset",
                )}
              >
                {elegida ? <Check weight="bold" size={ICONO.mini} className="text-sobre-tinta" /> : null}
              </span>
              <span className={cn("text-cuerpo", elegida ? "font-semibold" : "font-medium")}>{avatar.nombre}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
