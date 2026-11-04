"use client"

import { useRouter } from "next/navigation"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import { idDeIdea } from "@/lib/dominio/biblioteca/ideas"
import { ocultarIdeaAccion } from "./acciones"

interface Propiedades {
  ideaId: string
  /** Whether it is hidden now: the button does the opposite. */
  oculta: boolean
  /** Where to go after it worked (`hrefTrasOcultar`); null redraws the page where it is. */
  despues: string | null
}

/** Ported from Ingesta's `boton-ocultar.tsx` (D6). Hiding is undone from the author's page, so it does not ask. */
export function BotonOcultar({ ideaId, oculta, despues }: Propiedades) {
  const router = useRouter()
  const redibujar = useRedibujar()
  const { pendiente, error, ejecutar } = useAccion()
  return (
    <div className="grid justify-items-start gap-1">
      <Boton
        variante="callado"
        cargando={pendiente}
        aria-describedby={idDeIdea(ideaId)}
        onClick={() =>
          ejecutar(
            () => ocultarIdeaAccion({ id: ideaId, oculta: !oculta }),
            () => {
              if (despues) router.replace(despues, { scroll: false })
              else redibujar()
            },
          )
        }
      >
        {oculta ? "Mostrar" : "Ocultar"}
      </Boton>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
