"use client"

import { useEffect } from "react"

/**
 * WCAG 2.4.11 (issue #78): while the sign bar is pinned to the bottom of the window, the page keeps its height as
 * scroll padding, so the control the Tab key reaches scrolls into view above the bar instead of under it. Pinned only
 * in the phone's column; in two columns it sticks to the top and at large text it sits in the flow, and the padding
 * goes back to 0. Renders nothing: a screen has one bar, the one this sits in.
 */
export function HuecoDeFirma() {
  useEffect(() => {
    const barra = document.querySelector<HTMLElement>("[data-barra-de-firma]")
    if (!barra) return
    const raiz = document.documentElement
    const medir = () => {
      const estilo = getComputedStyle(barra)
      const fijaAbajo = estilo.position === "sticky" && estilo.bottom === "0px"
      raiz.style.setProperty(
        "--alto-firma-fija",
        fijaAbajo ? `${Math.ceil(barra.getBoundingClientRect().height)}px` : "0px",
      )
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(barra)
    window.addEventListener("resize", medir)
    return () => {
      observador.disconnect()
      window.removeEventListener("resize", medir)
      raiz.style.removeProperty("--alto-firma-fija")
    }
  }, [])

  return null
}
