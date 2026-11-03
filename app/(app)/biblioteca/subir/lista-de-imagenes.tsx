"use client"

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"

interface Propiedades {
  archivos: readonly File[]
  ocupado: boolean
  alMover: (indice: number, hacia: -1 | 1) => void
  alQuitar: (indice: number) => void
}

/** The images of a material in the order they are stored (`orden` 1..20): she moves or removes each one. */
export function ListaDeImagenes({ archivos, ocupado, alMover, alQuitar }: Propiedades) {
  const miniaturas = useMemo(() => archivos.map((archivo) => URL.createObjectURL(archivo)), [archivos])
  useEffect(
    () => () => {
      for (const miniatura of miniaturas) URL.revokeObjectURL(miniatura)
    },
    [miniaturas],
  )

  // The keys are positions, so a moved or removed image re-renders its buttons: the focus is put back by name.
  const lista = useRef<HTMLOListElement>(null)
  const [aEnfocar, setAEnfocar] = useState<string | null>(null)
  useEffect(() => {
    if (aEnfocar === null) return
    lista.current?.querySelector<HTMLButtonElement>(`button[aria-label="${aEnfocar}"]`)?.focus()
    setAEnfocar(null)
  }, [aEnfocar])

  function mover(indice: number, hacia: -1 | 1) {
    alMover(indice, hacia)
    setAEnfocar(`Mover la imagen ${indice + 1 + hacia} ${hacia === -1 ? "antes" : "después"}`)
  }

  function quitar(indice: number) {
    alQuitar(indice)
    // The next image takes this place; when the last one goes, the one before it.
    const siguiente = indice < archivos.length - 1 ? indice + 1 : indice
    setAEnfocar(`Quitar la imagen ${siguiente}`)
  }

  return (
    <ol ref={lista} aria-label="Imágenes en orden" className="grid grid-cols-2 gap-3">
      {archivos.map((archivo, indice) => {
        const numero = indice + 1
        return (
          <li
            // The key is the position: the list is reordered by hand and the same file may be picked twice.
            key={`${indice}-${archivo.name}`}
            data-nombre={archivo.name}
            className="grid content-start gap-2 rounded-bloque bg-piedra-honda p-2"
          >
            {/* biome-ignore lint/performance/noImgElement: a blob preview of a picked file, nothing to optimize */}
            <img
              src={miniaturas[indice]}
              alt={`Imagen ${numero}: ${archivo.name}`}
              className="aspect-square w-full rounded-casilla object-cover"
            />
            <p className="truncate text-meta text-apagado">{archivo.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Boton
                variante="secundario"
                tamano="chico"
                aria-label={`Mover la imagen ${numero} antes`}
                deshabilitado={indice === 0 || ocupado}
                onClick={() => mover(indice, -1)}
              >
                <ArrowLeft aria-hidden="true" size={ICONO.medio} />
              </Boton>
              <Boton
                variante="secundario"
                tamano="chico"
                aria-label={`Mover la imagen ${numero} después`}
                deshabilitado={indice === archivos.length - 1 || ocupado}
                onClick={() => mover(indice, 1)}
              >
                <ArrowRight aria-hidden="true" size={ICONO.medio} />
              </Boton>
              <Boton
                variante="callado"
                aria-label={`Quitar la imagen ${numero}`}
                deshabilitado={ocupado}
                onClick={() => quitar(indice)}
              >
                Quitar
              </Boton>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
