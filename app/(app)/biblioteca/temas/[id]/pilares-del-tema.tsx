"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { FilaConInterruptor } from "@/components/ui/filas"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import {
  type EleccionDePilares,
  eleccionDe,
  filasDeEleccion,
  lineaDePilares,
  NOMBRE_DE_RED,
  type PilarDeRed,
  type PilaresDeTema,
  REDES,
  type Red,
} from "@/lib/dominio/pilares"
import { cambiarPilaresAccion } from "../../acciones"
import { Campo, CLASES_DE_CAMPO } from "../../campo"

interface Propiedades {
  temaId: string
  pilares: PilaresDeTema
  /** The pillars and layers of each network, as `listarPilaresDeTemas` gives them. */
  opciones: readonly PilarDeRed[]
}

/**
 * A topic's pillars (spec 2026-11-04, part 15a, section 5): one line per network, and "Cambiar pilares" opens the form
 * in place. Per network: its pillar (or none), «También toca» once it has one, and the layers it has.
 */
export function PilaresDelTema({ temaId, pilares, opciones }: Propiedades) {
  const [abierto, setAbierto] = useState(false)
  const [eleccion, setEleccion] = useState<EleccionDePilares>(() => eleccionDe(pilares))
  // Opening and closing unmount the focused button: the focus goes to the first field, or back to the button.
  const [enfocar, setEnfocar] = useState<"campo" | "abrir" | null>(null)
  const abrir = useRef<HTMLButtonElement>(null)
  const primerCampo = useRef<HTMLSelectElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const redibujar = useRedibujar()
  const base = useId()

  useEffect(() => {
    if (enfocar === null) return
    ;(enfocar === "campo" ? primerCampo.current : abrir.current)?.focus()
    setEnfocar(null)
  }, [enfocar])

  function elegirPilar(red: Red, slug: string) {
    setEleccion((actual) => ({
      ...actual,
      principal: { ...actual.principal, [red]: slug },
      // The pillar of a network is never also one of its «También toca».
      secundarios: { ...actual.secundarios, [red]: actual.secundarios[red].filter((otro) => otro !== slug) },
    }))
  }

  function marcarTambienToca(red: Red, slug: string, marcado: boolean) {
    setEleccion((actual) => ({
      ...actual,
      secundarios: {
        ...actual.secundarios,
        [red]: marcado ? [...actual.secundarios[red], slug] : actual.secundarios[red].filter((otro) => otro !== slug),
      },
    }))
  }

  function marcarCapa(slug: string, encendida: boolean) {
    setEleccion((actual) => ({
      ...actual,
      capas: encendida ? [...actual.capas, slug] : actual.capas.filter((otra) => otra !== slug),
    }))
  }

  // The form always starts from the pillars the page has now: after a save they are the saved ones.
  function abrirFormulario() {
    setEleccion(eleccionDe(pilares))
    limpiarError()
    setAbierto(true)
    setEnfocar("campo")
  }

  function cerrar() {
    limpiarError()
    setAbierto(false)
    setEnfocar("abrir")
  }

  function guardar() {
    ejecutar(
      () => cambiarPilaresAccion({ temaId, filas: filasDeEleccion(eleccion) }),
      () => {
        setAbierto(false)
        setEnfocar("abrir")
        // The action's revalidated tree can lose the race with earlier prefetches: the lines redraw with fresh data.
        redibujar()
      },
    )
  }

  return (
    <Seccion titulo="Pilares" id={`${base}-pilares`} espacio="ninguno">
      <ul className="grid gap-1">
        {REDES.map((red) => (
          <li key={red} className="text-cuerpo">
            {lineaDePilares(red, pilares[red])}
          </li>
        ))}
      </ul>
      {abierto ? (
        <section aria-label="Cambiar pilares" className="grid gap-5 rounded-panel bg-piedra p-4 shadow-relieve">
          {REDES.map((red, posicion) => {
            const deLaRed = opciones.filter((opcion) => opcion.red === red && !opcion.esCapa)
            const capas = opciones.filter((opcion) => opcion.red === red && opcion.esCapa)
            const elegido = eleccion.principal[red]
            const nombreDeRed = NOMBRE_DE_RED[red]
            const idDelCampo = `${base}-${red}`
            return (
              <fieldset key={red} className="grid gap-3">
                <legend className="mb-1 text-meta text-apagado">{nombreDeRed}</legend>
                <Campo id={idDelCampo} etiqueta={`Pilar en ${nombreDeRed}`}>
                  <select
                    id={idDelCampo}
                    ref={posicion === 0 ? primerCampo : undefined}
                    value={elegido}
                    onChange={(evento) => elegirPilar(red, evento.target.value)}
                    className={CLASES_DE_CAMPO}
                  >
                    <option value="">{`Sin pilar en ${nombreDeRed}`}</option>
                    {deLaRed.map((opcion) => (
                      <option key={opcion.slug} value={opcion.slug}>
                        {opcion.nombreCorto}
                      </option>
                    ))}
                  </select>
                </Campo>
                {elegido === "" ? null : (
                  <fieldset className="grid">
                    <legend className="text-cuerpo font-semibold">{`También toca en ${nombreDeRed}`}</legend>
                    {deLaRed
                      .filter((opcion) => opcion.slug !== elegido)
                      .map((opcion) => (
                        <Casilla
                          key={opcion.slug}
                          etiqueta={opcion.nombreCorto}
                          marcada={eleccion.secundarios[red].includes(opcion.slug)}
                          alCambiar={(marcada) => marcarTambienToca(red, opcion.slug, marcada)}
                        />
                      ))}
                  </fieldset>
                )}
                {capas.map((capa) => (
                  <FilaConInterruptor
                    key={capa.slug}
                    etiqueta={capa.nombreCorto}
                    detalle="Una mirada dentro de los pilares, no un pilar."
                    encendido={eleccion.capas.includes(capa.slug)}
                    alCambiar={(encendida) => marcarCapa(capa.slug, encendida)}
                  />
                ))}
              </fieldset>
            )
          })}
          {error ? <LineaDeError>{error}</LineaDeError> : null}
          <Boton cargando={pendiente} onClick={guardar}>
            Guardar
          </Boton>
          <Boton variante="callado" deshabilitado={pendiente} onClick={cerrar}>
            Cancelar
          </Boton>
        </section>
      ) : (
        <Boton ref={abrir} variante="secundario" tamano="chico" className="w-fit" onClick={abrirFormulario}>
          Cambiar pilares
        </Boton>
      )}
    </Seccion>
  )
}
