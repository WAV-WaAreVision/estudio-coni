"use client"

import { SlidersHorizontal } from "@phosphor-icons/react"
import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { ICONO } from "@/components/ui/icono"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { useAccion } from "@/components/use-accion"
import { etiquetaDeTipo, type TipoDeGancho } from "@/lib/dominio/biblioteca/ganchos"
import { guardarMisTiposAccion } from "../acciones"

/**
 * «Mis tipos» (spec 6b): the active types as boxes; saving stores them in Ajustes. The «Mis tipos» filter appears once
 * at least one is saved. A chosen type that left the list is named here, since saving drops it.
 */
export function ElegirMisTipos({ tipos, elegidos }: { tipos: readonly TipoDeGancho[]; elegidos: readonly string[] }) {
  const activos = tipos.filter((tipo) => tipo.activo)
  const esActivo = (valor: string) => activos.some((tipo) => tipo.valor === valor)
  const [marcados, setMarcados] = useState<string[]>(() => elegidos.filter(esActivo))
  const [guardado, setGuardado] = useState(false)
  const { pendiente, error, ejecutar } = useAccion()
  const retirados = elegidos.filter((valor) => !esActivo(valor))

  function alternar(valor: string, marcada: boolean) {
    setGuardado(false)
    setMarcados((actuales) => (marcada ? [...actuales, valor] : actuales.filter((otro) => otro !== valor)))
  }

  return (
    <MasOpciones
      titulo="Elegir mis tipos"
      forma="boton"
      icono={<SlidersHorizontal aria-hidden="true" size={ICONO.chico} />}
      className="open:basis-full [&>summary]:w-fit [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:text-meta"
    >
      <div className="grid gap-3 md:max-w-xl">
        <fieldset className="m-0 grid min-w-0 border-0 p-0 md:grid-cols-2 md:gap-x-6">
          <legend className="mb-1 text-cuerpo font-semibold">Mis tipos de gancho</legend>
          {activos.map((tipo) => (
            <Casilla
              key={tipo.valor}
              etiqueta={tipo.etiqueta}
              marcada={marcados.includes(tipo.valor)}
              alCambiar={(marcada) => alternar(tipo.valor, marcada)}
            />
          ))}
        </fieldset>
        {retirados.length > 0 ? (
          <p className="text-meta text-apagado">
            {`Ya no están en la lista y se quitan al guardar: ${retirados.map((valor) => etiquetaDeTipo(tipos, valor)).join(", ")}.`}
          </p>
        ) : null}
        <Boton
          variante="secundario"
          tamano="chico"
          className="w-fit"
          cargando={pendiente}
          onClick={() =>
            ejecutar(
              () => guardarMisTiposAccion(marcados),
              () => setGuardado(true),
            )
          }
        >
          Guardar mis tipos
        </Boton>
        <output aria-live="polite" className="text-meta text-apagado empty:sr-only">
          {guardado ? "Guardé tus tipos." : ""}
        </output>
        {error ? <LineaDeError>{error}</LineaDeError> : null}
      </div>
    </MasOpciones>
  )
}
