"use client"

import { useEffect } from "react"
import { ID_DEL_AVISO_DE_IDEAS } from "@/lib/dominio/biblioteca/ideas"

/**
 * What the page does once its note (`AvisoDeIdeas`) arrived with the address after Ocultar or Mostrar. On a new page
 * (the Temas list after a topic's last idea) the focus `BotonOcultar` gave the old note is gone, so the note takes it.
 * Only while the address still has the note and nothing holds the focus: a page shown again by Back, or one where she
 * already moved on, keeps hers.
 */
export function TrasElAviso({ parametro }: { parametro: "oculta" | "mostrada" }) {
  useEffect(() => {
    if (!new URL(window.location.href).searchParams.has(parametro)) return
    const activo = document.activeElement
    if (activo === null || activo === document.body) document.getElementById(ID_DEL_AVISO_DE_IDEAS)?.focus()
  }, [parametro])
  return null
}
