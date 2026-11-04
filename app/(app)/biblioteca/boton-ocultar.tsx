"use client"

import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { ID_DEL_AVISO_DE_IDEAS, idDeIdea } from "@/lib/dominio/biblioteca/ideas"
import { ocultarIdeaAccion } from "./acciones"

interface Propiedades {
  ideaId: string
  /** Whether it is hidden now: the button does the opposite. */
  oculta: boolean
  /** Where the server goes after it worked (`hrefTrasOcultar`, `hrefTrasMostrar`): an address whose page says the note. */
  despues: string
}

/**
 * Ported from Ingesta's `boton-ocultar.tsx` (D6). Hiding is undone from the author's page, so it does not ask. The action
 * answers with the new screen itself (`redirect`), where the idea has moved away and taken the button with it, so the
 * focus goes first to the page's note (`AvisoDeIdeas`), which stays; a refusal gives it back to the button.
 */
export function BotonOcultar({ ideaId, oculta, despues }: Propiedades) {
  const { pendiente, error, ejecutar } = useAccion()
  return (
    <div className="grid justify-items-start gap-1">
      <Boton
        variante="callado"
        cargando={pendiente}
        aria-describedby={idDeIdea(ideaId)}
        onClick={(evento) => {
          const boton = evento.currentTarget
          document.getElementById(ID_DEL_AVISO_DE_IDEAS)?.focus()
          ejecutar(
            () => ocultarIdeaAccion({ id: ideaId, oculta: !oculta }, despues),
            undefined,
            () => boton.focus(),
          )
        }}
      >
        {oculta ? "Mostrar" : "Ocultar"}
      </Boton>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
