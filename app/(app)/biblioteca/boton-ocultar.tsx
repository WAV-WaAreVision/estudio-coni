"use client"

import { useRouter } from "next/navigation"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { ID_DEL_AVISO_DE_IDEAS, idDeIdea } from "@/lib/dominio/biblioteca/ideas"
import { ocultarIdeaAccion } from "./acciones"

interface Propiedades {
  ideaId: string
  /** Whether it is hidden now: the button does the opposite. */
  oculta: boolean
  /** Where to go after it worked (`hrefTrasOcultar`, `hrefTrasMostrar`): an address whose page says the note. */
  despues: string
}

/**
 * Ported from Ingesta's `boton-ocultar.tsx` (D6). Hiding is undone from the author's page, so it does not ask. The idea
 * moves away on the fresh screen and takes the button with it, so the focus goes first to the page's note
 * (`AvisoDeIdeas`), which stays.
 */
export function BotonOcultar({ ideaId, oculta, despues }: Propiedades) {
  const router = useRouter()
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
              document.getElementById(ID_DEL_AVISO_DE_IDEAS)?.focus()
              router.replace(despues, { scroll: false })
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
