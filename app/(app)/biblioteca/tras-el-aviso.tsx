"use client"

import { useEffect } from "react"
import { ID_DEL_AVISO_DE_IDEAS } from "@/lib/dominio/biblioteca/ideas"

/**
 * What the page does once its note (`AvisoDeIdeas`) arrived with the address after Ocultar or Mostrar. On a new page
 * (the Temas list after a topic's last idea) the focus `BotonOcultar` gave the old note is gone, so the note takes it.
 * Only while the address still has the note and nothing holds the focus: a page shown again by Back, or one where she
 * already moved on, keeps hers.
 *
 * Then the note leaves the address, so a reload or a shared link does not say it again. The note the server drew stays
 * on screen. The state passed is `null` on purpose: Next's patched `replaceState` skips its router when the state
 * carries `__NA`, so its router would keep the old address and write it back on its next commit. With `null` Next
 * copies its own internals into the entry and tells its router the new address. A draft's form (15c) leaves `?aviso=`
 * the same way.
 */
export function TrasElAviso({ parametro }: { parametro: "oculta" | "mostrada" | "aviso" }) {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(parametro)) return
    const activo = document.activeElement
    if (activo === null || activo === document.body) document.getElementById(ID_DEL_AVISO_DE_IDEAS)?.focus()
    url.searchParams.delete(parametro)
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [parametro])
  return null
}
