"use client"

import { useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { EVENTO_DE_LLEGADA } from "@/components/use-ir-a"
import { ID_DEL_AVISO_DE_IDEAS } from "@/lib/dominio/biblioteca/ideas"

/**
 * What the page does once its note (`AvisoDeIdeas`, or the deletion's toast) arrived with the address after Ocultar,
 * Mostrar or Borrar. On a new page
 * (the Temas list after a topic's last idea) the focus `BotonOcultar` gave the old note is gone, so the note takes it.
 * Only while the address still has the note and nothing holds the focus: a page shown again by Back, or one where she
 * already moved on, keeps hers.
 *
 * Then the note leaves the address, so a reload or a shared link does not say it again. The note the server drew stays
 * on screen. The state passed is `null` on purpose: Next's patched `replaceState` skips its router when the state
 * carries `__NA`, so its router would keep the old address and write it back on its next commit. With `null` Next
 * copies its own internals into the entry and tells its router the new address. A draft's form (15c) leaves `?aviso=`
 * the same way, and once it is out the page says the note arrived (`EVENTO_DE_LLEGADA`): `useIrA` waits for that when
 * the next screen is the one she is on. It runs again when a new note comes to a page already showing one (a second
 * Descartar in Borradores keeps this component mounted).
 */
export function TrasElAviso({
  parametro,
  tambien,
}: {
  parametro: "oculta" | "mostrada" | "aviso"
  /** A second key that belongs to the same note: the deletion's `id` (`?aviso=borrado&id=`). */
  tambien?: "id"
}) {
  // The router's own copy of the address (null outside one, as in unit tests): a new note re-runs the effect.
  const nota = useSearchParams()?.get(parametro) ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nota` is not read, it is the trigger: the window's address is the truth.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(parametro)) return
    const activo = document.activeElement
    if (activo === null || activo === document.body) document.getElementById(ID_DEL_AVISO_DE_IDEAS)?.focus()
    url.searchParams.delete(parametro)
    if (tambien) url.searchParams.delete(tambien)
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
    window.dispatchEvent(new Event(EVENTO_DE_LLEGADA))
  }, [parametro, tambien, nota])
  return null
}
