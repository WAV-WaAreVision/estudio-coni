"use client"

import { type RefObject, useLayoutEffect } from "react"

/**
 * Brandkit 9.8: a field grows with its text and never scrolls inside. Browsers with `field-sizing: content` (the .campo
 * rule) do it by themselves; for the rest the height follows the content here.
 */
export function useAutoAlto(caja: RefObject<HTMLTextAreaElement | null>, valor: string) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `valor` is not read, it is the trigger: the height follows every edit.
  useLayoutEffect(() => {
    const elemento = caja.current
    if (!elemento) return
    if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return
    elemento.style.height = "auto"
    elemento.style.height = `${elemento.scrollHeight}px`
  }, [caja, valor])
}
