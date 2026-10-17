"use client"

import { useId } from "react"
import { Eleccion } from "@/components/ui/filas"

export interface AvatarParaElegir {
  id: string
  nombre: string
  /** A short-lived signed link to the preview photo; null when it could not be signed. */
  imagenUrl: string | null
}

interface PropiedadesDeElegirAvatar {
  avatares: readonly AvatarParaElegir[]
  /** Nothing is pre-selected by WAV: null until she picks, or the look she signed with before an undo. */
  elegido: string | null
  alElegir: (avatarId: string) => void
}

/** Gate 1 says it as a block in the sign bar, and then does not render this list at all. */
export const TEXTO_SIN_AVATARES = "Todavía no hay avatares para elegir: avísale a Federico."

/**
 * Decision 9, step 6: WAV's looks as choice rows with their round photo. A native radio group: arrows come free. The
 * list is never empty: with no looks the caller shows TEXTO_SIN_AVATARES instead.
 */
export function ElegirAvatar({ avatares, elegido, alElegir }: PropiedadesDeElegirAvatar) {
  const grupo = useId()
  return (
    <fieldset className="elecciones grid border-0 p-0">
      <legend className="sr-only">Avatar</legend>
      {avatares.map((avatar) => (
        <Eleccion
          key={avatar.id}
          nombre={grupo}
          valor={avatar.id}
          elegido={elegido === avatar.id}
          etiqueta={avatar.nombre}
          alElegir={alElegir}
          imagen={
            avatar.imagenUrl ? (
              // A signed R2 link that expires: next/image would only proxy and cache it. The name labels the row.
              // biome-ignore lint/performance/noImgElement: see above
              <img
                src={avatar.imagenUrl}
                alt=""
                className="size-foto shrink-0 rounded-full bg-piedra-honda object-cover"
              />
            ) : undefined
          }
        />
      ))}
    </fieldset>
  )
}
