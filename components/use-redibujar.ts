"use client"

import { useRouter } from "next/navigation"

/**
 * Redraws the screen with fresh server data after an action that changed it in place. A `router.refresh()` on the same
 * address lost the race with the prefetches of that address made before the action (the Agenda kept the old places
 * although the server had rendered the new ones), so it goes to its own address with a fresh marker, as gate 1 does
 * after signing. Only `v` changes: every other parameter, the view among them, and the anchor stay.
 */
export function useRedibujar(): () => void {
  const router = useRouter()
  return () => {
    const url = new URL(window.location.href)
    url.searchParams.set("v", String(Date.now()))
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false })
  }
}
