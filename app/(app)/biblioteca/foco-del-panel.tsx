"use client"

import { useEffect } from "react"

// The panel (a server component) writes this id on its heading, with tabIndex -1.
const ID_DEL_TITULO_DEL_PANEL = "panel-titulo"

type Pendiente = { tipo: "abrir" | "cerrar"; materialId: string } | null

// Module state, not a ref: opening or closing the panel changes the search params, and the page may remount.
let pendiente: Pendiente = null
// What the panel shows now: a tap on that row keeps the address, so no render comes to move the focus.
let abierto: string | null = null

function alHacerClic(evento: MouseEvent) {
  if (!(evento.target instanceof Element)) return
  const enlace = evento.target.closest("a[data-abre-panel], a[data-cierra-panel]")
  if (!(enlace instanceof HTMLElement)) return
  const abre = enlace.dataset.abrePanel
  const cierra = enlace.dataset.cierraPanel
  if (abre && abre === abierto) {
    document.getElementById(ID_DEL_TITULO_DEL_PANEL)?.focus()
    pendiente = null
  } else if (abre) pendiente = { tipo: "abrir", materialId: abre }
  else if (cierra) pendiente = { tipo: "cerrar", materialId: cierra }
}

/**
 * The side panel opens and closes through links, so the browser leaves the focus where the click was. Opening from a
 * row moves it to the panel's heading, also from the row already open; closing gives it back to the row of the material
 * that was open.
 */
export function FocoDelPanel({ seleccion }: { seleccion: string | null }) {
  useEffect(() => {
    document.addEventListener("click", alHacerClic, true)
    return () => document.removeEventListener("click", alHacerClic, true)
  }, [])

  useEffect(() => {
    abierto = seleccion
    if (pendiente === null) return
    if (pendiente.tipo === "abrir" && seleccion === pendiente.materialId) {
      document.getElementById(ID_DEL_TITULO_DEL_PANEL)?.focus()
      pendiente = null
    } else if (pendiente.tipo === "cerrar" && seleccion === null) {
      const fila = document.querySelector(`a[data-abre-panel="${CSS.escape(pendiente.materialId)}"]`)
      if (fila instanceof HTMLElement) fila.focus()
      pendiente = null
    }
  }, [seleccion])

  return null
}
