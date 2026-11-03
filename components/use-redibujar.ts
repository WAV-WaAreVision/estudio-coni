"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"

// How long a redraw has to show its marker before it is checked, and how many times it is tried in all.
const REVISAR_TRAS_MS = 1500
const INTENTOS = 3

/** The address without the marker: two addresses that only differ in `v` are the same screen. */
function sinMarcador(url: URL): string {
  const copia = new URL(url)
  copia.searchParams.delete("v")
  return `${copia.pathname}${copia.search}${copia.hash}`
}

/**
 * Redraws the screen with fresh server data after an action that changed it in place. A `router.refresh()` on the same
 * address lost the race with the prefetches of that address made before the action (the Agenda kept the old places
 * although the server had rendered the new ones), so it goes to its own address with a fresh marker, as gate 1 does
 * after signing. Only `v` changes: every other parameter, the view among them, and the anchor stay.
 *
 * In the production build an action's own revalidated tree could still commit after the redraw and put back the address
 * and the screen from before it. So the redraw checks back: if the page fell back to the address it left (its marker is
 * gone and she did not go anywhere else), it redraws again, a few times at most. The check lives in a timer, not in the
 * component, because the fresh screen may unmount the button that asked for it.
 */
export function useRedibujar(): () => void {
  const router = useRouter()
  return useCallback(() => {
    const origen = sinMarcador(new URL(window.location.href))
    const intentar = (quedan: number) => {
      const url = new URL(window.location.href)
      const marca = String(Date.now())
      url.searchParams.set("v", marca)
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false })
      if (quedan <= 1) return
      setTimeout(() => {
        const ahora = new URL(window.location.href)
        if (ahora.searchParams.get("v") === marca || sinMarcador(ahora) !== origen) return
        intentar(quedan - 1)
      }, REVISAR_TRAS_MS)
    }
    intentar(INTENTOS)
  }, [router])
}
