"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { FilaConInterruptor } from "@/components/ui/filas"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import {
  type EleccionDePilares,
  eleccionDe,
  eleccionDisponible,
  filasDeEleccion,
  lineaDePilares,
  mismaEleccion,
  NOMBRE_DE_RED,
  type PilarDeRed,
  type PilaresDeTema,
  pilaresDeEleccion,
  REDES,
  type Red,
} from "@/lib/dominio/pilares"
import { cambiarPilaresAccion } from "../../acciones"
import { Campo, CLASES_DE_CAMPO } from "../../campo"

const GUARDADOS = "Listo, guardé los pilares."
const SIN_TAMBIEN_TOCA = "Sin pilar, esta red no lleva «También toca»."

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
  // What the form started from: saving it unchanged writes nothing (her rows keep their origin and lot).
  const [inicial, setInicial] = useState<EleccionDePilares>(() => eleccionDe(pilares))
  // Her last save, until the page's own pillars bring it: before that the props are the old ones, and reopening from
  // them would save the old pillars back.
  const [guardada, setGuardada] = useState<EleccionDePilares | null>(null)
  const [guardo, setGuardo] = useState(false)
  // Opening and closing unmount the focused button: the focus goes to the first field, or back to the button.
  const [enfocar, setEnfocar] = useState<"campo" | "abrir" | null>(null)
  const abrir = useRef<HTMLButtonElement>(null)
  const primerCampo = useRef<HTMLSelectElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const redibujar = useRedibujar()
  const base = useId()

  const delServidor = eleccionDe(pilares)
  const porLlegar = guardada !== null && !mismaEleccion(guardada, delServidor) ? guardada : null
  const vigentes = porLlegar ? pilaresDeEleccion(porLlegar, opciones) : pilares

  useEffect(() => {
    if (guardada !== null && mismaEleccion(guardada, eleccionDe(pilares))) setGuardada(null)
  }, [guardada, pilares])

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

  // The form starts from what the lines say, without a pillar retired since (it has no option to show).
  function abrirFormulario() {
    const desde = eleccionDisponible(porLlegar ?? delServidor, opciones)
    setEleccion(desde)
    setInicial(desde)
    setGuardo(false)
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
    if (mismaEleccion(eleccion, inicial)) {
      cerrar()
      return
    }
    const guardando = eleccion
    ejecutar(
      () => cambiarPilaresAccion({ temaId, filas: filasDeEleccion(guardando) }),
      () => {
        setGuardada(guardando)
        setGuardo(true)
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
            {lineaDePilares(red, vigentes[red])}
          </li>
        ))}
      </ul>
      {/* The section's one live region: always mounted so the note is announced; empty, it is out of the layout. */}
      <div aria-live="polite" aria-atomic="true" className="empty:sr-only">
        {guardo ? <LineaDeEstado tipo="neutro" titulo={GUARDADOS} enVivo={false} /> : null}
      </div>
      {abierto ? (
        <section aria-label="Cambiar pilares" className="grid gap-5 rounded-panel bg-piedra p-4 shadow-relieve">
          {REDES.map((red, posicion) => {
            const deLaRed = opciones.filter((opcion) => opcion.red === red && !opcion.esCapa)
            const capas = opciones.filter((opcion) => opcion.red === red && opcion.esCapa)
            const elegido = eleccion.principal[red]
            const nombreDeRed = NOMBRE_DE_RED[red]
            const idDelCampo = `${base}-${red}`
            return (
              // Disabled while it saves: what is sent is what she sees.
              <fieldset key={red} disabled={pendiente} className="grid gap-3">
                <legend className="mb-1 text-meta text-apagado">{nombreDeRed}</legend>
                <Campo
                  id={idDelCampo}
                  etiqueta={`Pilar en ${nombreDeRed}`}
                  ayuda={elegido === "" ? SIN_TAMBIEN_TOCA : undefined}
                >
                  <select
                    id={idDelCampo}
                    aria-describedby={elegido === "" ? `${idDelCampo}-ayuda` : undefined}
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
