"use client"

import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { TEXTO_DESLIZA_RIEL } from "./textos"

export interface LaminaDelRiel {
  texto: string
  /** A signed R2 link of an hour (`urlParaVer`); null when it could not be signed. */
  url: string | null
}

const SEPARACION_PX = 12

/**
 * The slides at reading size, one after another as LinkedIn shows them (design 2026-10-26, C6). Swiping, the buttons
 * or the keyboard move it; reaching the last slide is what gate 2 asks before scheduling.
 */
export function RielDeLaminas({ laminas, alVerTodas }: { laminas: readonly LaminaDelRiel[]; alVerTodas: () => void }) {
  const riel = useRef<HTMLOListElement>(null)
  const vioTodas = useRef(false)
  const [actual, setActual] = useState(0)
  const total = laminas.length

  function llegar(indice: number) {
    setActual(indice)
    if (indice === total - 1 && !vioTodas.current) {
      vioTodas.current = true
      alVerTodas()
    }
  }

  // The slide a button asked for while the smooth scroll travels to it: the slides it passes on the way are not where
  // she is, and a second tap counts from the slide asked, not from one passed.
  const objetivo = useRef<number | null>(null)

  useEffect(() => {
    const elemento = riel.current
    const soltar = () => {
      objetivo.current = null
    }
    elemento?.addEventListener("scrollend", soltar)
    return () => elemento?.removeEventListener("scrollend", soltar)
  }, [])

  function mover(paso: number) {
    const destino = Math.max(0, Math.min(total - 1, (objetivo.current ?? actual) + paso))
    objetivo.current = destino
    // jsdom has no scrollIntoView: the optional call keeps the unit tests honest about the index alone.
    riel.current?.children[destino]?.scrollIntoView?.({ behavior: "smooth", inline: "start", block: "nearest" })
    llegar(destino)
  }

  function alDesplazar() {
    const elemento = riel.current
    const ancho = elemento?.firstElementChild?.clientWidth ?? 0
    if (!elemento || ancho <= 0) return
    const indice = Math.round(elemento.scrollLeft / (ancho + SEPARACION_PX))
    if (objetivo.current !== null && indice !== objetivo.current) return
    objetivo.current = null
    llegar(indice)
  }

  return (
    <div className="grid gap-3">
      <p className="text-meta text-apagado">{TEXTO_DESLIZA_RIEL}</p>
      <ol
        ref={riel}
        onScroll={alDesplazar}
        aria-label="Láminas"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable list a keyboard user must be able to reach
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      >
        {laminas.map((lamina, indice) => {
          const nombre = `Lámina ${indice + 1} de ${total}: ${lamina.texto}`
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a slide's place is its identity within a version
            <li key={indice} className="w-[82%] shrink-0 snap-start list-none">
              {lamina.url ? (
                // biome-ignore lint/performance/noImgElement: a signed link of an hour, which next/image would cache past its expiry
                <img
                  src={lamina.url}
                  alt={nombre}
                  width={1080}
                  height={1350}
                  className="block aspect-[4/5] w-full rounded-bloque shadow-relieve"
                />
              ) : (
                <div
                  role="img"
                  aria-label={nombre}
                  className="flex aspect-[4/5] w-full items-center rounded-bloque bg-piedra-honda p-4 text-meta"
                >
                  {lamina.texto}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex items-center justify-between gap-3">
        {/* Arrows with their names, so the counter keeps its one line beside them at 390 px. */}
        <Boton
          variante="callado"
          tamano="chico"
          aria-label="Lámina anterior"
          className="min-w-11"
          deshabilitado={actual === 0}
          onClick={() => mover(-1)}
        >
          <CaretLeft aria-hidden="true" size={ICONO.medio} />
        </Boton>
        <p aria-live="polite" className="whitespace-nowrap text-meta tabular-nums">
          Lámina {actual + 1} de {total}
        </p>
        <Boton
          variante="callado"
          tamano="chico"
          aria-label="Lámina siguiente"
          className="min-w-11"
          deshabilitado={actual === total - 1}
          onClick={() => mover(1)}
        >
          <CaretRight aria-hidden="true" size={ICONO.medio} />
        </Boton>
      </div>
      <p aria-hidden="true" className="text-center text-meta tracking-[3px] text-apagado">
        {laminas.map((_, indice) => (indice === actual ? "●" : "○")).join(" ")}
      </p>
    </div>
  )
}
