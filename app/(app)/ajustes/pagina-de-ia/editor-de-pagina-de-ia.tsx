"use client"

import { Check } from "@phosphor-icons/react"
import { useId, useRef, useState } from "react"
import { Seccion } from "@/components/seccion"
import { TextoEnParrafos } from "@/components/texto-en-parrafos"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { useAccion } from "@/components/use-accion"
import { useAutoAlto } from "@/components/use-auto-alto"
import type { Resultado } from "@/lib/acciones/resultado"
import { LARGO_MAXIMO_TRANSPARENCIA, LARGO_MINIMO_TRANSPARENCIA, largoDeTexto } from "@/lib/transparencia/texto"

export interface VersionParaMostrar {
  version: number
  /** «2 de noviembre de 2026». */
  fecha: string
  motivo: string
  texto: string
  vigente: boolean
}

interface PropiedadesDelEditor {
  /** What /l/ia shows today, or null before the first publication. */
  publicada: { texto: string; fecha: string } | null
  /** The published text, or WAV's draft before the first publication. */
  inicial: string
  esPropuesta: boolean
  historial: readonly VersionParaMostrar[]
  lineaParaLaBio: string
  publicar: (texto: string, motivo: string) => Promise<Resultado<{ version: number }>>
  volverA: (version: number) => Promise<Resultado<{ version: number }>>
}

const MOTIVO_MINIMO = 3
const miles = (n: number) => n.toLocaleString("es-CL")

/** D3: Coni edits her public page; every publication is a version and «Volver a esta» publishes an old text again. */
export function EditorDePaginaDeIa({
  publicada,
  inicial,
  esPropuesta,
  historial,
  lineaParaLaBio,
  publicar,
  volverA,
}: PropiedadesDelEditor) {
  const [texto, setTexto] = useState(inicial)
  const [motivo, setMotivo] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)
  const [avisoDeVuelta, setAvisoDeVuelta] = useState<string | null>(null)
  const [volviendoA, setVolviendoA] = useState<number | null>(null)
  const [copia, setCopia] = useState<"nada" | "copiado" | "fallo">("nada")
  const publicacion = useAccion()
  const vuelta = useAccion()
  const caja = useRef<HTMLTextAreaElement>(null)
  useAutoAlto(caja, texto)
  const idDelContador = useId()
  const idDeLaRazon = useId()

  const largo = largoDeTexto(texto)
  const fueraDeLargo = largo < LARGO_MINIMO_TRANSPARENCIA || largo > LARGO_MAXIMO_TRANSPARENCIA
  const sinMotivo = motivo.trim().length < MOTIVO_MINIMO
  const razon = fueraDeLargo
    ? `El texto tiene que tener entre ${LARGO_MINIMO_TRANSPARENCIA} y ${miles(LARGO_MAXIMO_TRANSPARENCIA)} caracteres.`
    : sinMotivo
      ? "Escribe por qué lo cambias para poder publicar."
      : null
  // One change at a time: a publication and a going back would race for the next version number.
  const ocupado = publicacion.pendiente || vuelta.pendiente

  async function copiar() {
    try {
      await navigator.clipboard.writeText(lineaParaLaBio)
      setCopia("copiado")
    } catch (error) {
      // The clipboard can be refused (a permission, an in-app browser): the line is on screen to copy by hand.
      if (!(error instanceof DOMException)) throw error
      setCopia("fallo")
    }
  }

  function volver(version: VersionParaMostrar) {
    if (ocupado) return
    setVolviendoA(version.version)
    setAvisoDeVuelta(null)
    setAviso(null)
    vuelta.ejecutar(
      () => volverA(version.version),
      (resultado) => {
        // The old text is now the published one, so the editor starts from it (her unsaved edits are replaced).
        setTexto(version.texto)
        setAvisoDeVuelta(
          `Volviste al texto de la versión ${version.version}: ahora es la versión ${resultado.version}.`,
        )
      },
    )
  }

  return (
    <div>
      <Seccion titulo="Lo que se ve hoy" id="ia-publicada">
        {publicada ? (
          <Panel>
            <TextoEnParrafos texto={publicada.texto} className="text-cuerpo leading-prosa" />
            <p className="mt-4 text-meta text-apagado">{`Publicada el ${publicada.fecha}.`}</p>
          </Panel>
        ) : (
          <Bloque tipo="neutro" titulo="Todavía no la publicas">
            La página pública aparece cuando publiques tu primera versión.
          </Bloque>
        )}
      </Seccion>

      <Seccion titulo="Editar" id="ia-editar">
        {esPropuesta ? (
          <Bloque tipo="neutro" titulo="Propuesta de WAV">
            Es un borrador para partir. Cámbialo con tus palabras y publícalo cuando te represente.
          </Bloque>
        ) : null}
        <form
          className="grid gap-3"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (razon !== null || ocupado) return
            setAviso(null)
            setAvisoDeVuelta(null)
            vuelta.limpiarError()
            publicacion.ejecutar(
              () => publicar(texto, motivo),
              (resultado) => {
                setMotivo("")
                setAviso(`Publicaste la versión ${resultado.version}.`)
              },
            )
          }}
        >
          <label className="grid gap-2">
            <span className="text-meta font-semibold">Texto de la página</span>
            <textarea
              ref={caja}
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              aria-describedby={idDelContador}
              className="campo w-full text-cuerpo"
            />
          </label>
          <p id={idDelContador} className="mx-0.5 text-meta text-apagado tabular-nums">
            {`${miles(largo)} de ${miles(LARGO_MAXIMO_TRANSPARENCIA)} caracteres · mínimo ${LARGO_MINIMO_TRANSPARENCIA}`}
          </p>
          <div className="grid gap-2">
            <h3 className="text-meta font-semibold">Así se verá</h3>
            <Panel>
              <TextoEnParrafos texto={texto} className="text-cuerpo leading-prosa" />
            </Panel>
          </div>
          <label className="grid gap-2">
            <span className="text-meta font-semibold">¿Por qué lo cambias?</span>
            <input
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              className="campo w-full text-cuerpo"
            />
          </label>
          {publicacion.error ? <LineaDeEstado tipo="error" titulo={publicacion.error} /> : null}
          {aviso ? <LineaDeEstado tipo="exito" titulo={aviso} /> : null}
          <Boton
            type="submit"
            cargando={publicacion.pendiente}
            deshabilitado={razon !== null || vuelta.pendiente}
            aria-describedby={razon !== null ? idDeLaRazon : undefined}
          >
            Publicar
          </Boton>
          {razon !== null ? (
            <p id={idDeLaRazon} className="text-meta text-apagado">
              {razon}
            </p>
          ) : null}
        </form>
      </Seccion>

      {historial.length > 0 ? (
        <Seccion titulo="Versiones" id="ia-versiones" cifra={historial.length}>
          <ul className="grid gap-3">
            {historial.map((version) => (
              <li key={version.version}>
                <Panel>
                  <p className="text-cuerpo font-semibold">{`Versión ${version.version} · ${version.fecha}`}</p>
                  <p className="mt-1 text-meta">{version.motivo}</p>
                  {version.vigente ? (
                    <p className="mt-3 text-meta text-apagado">Es la que se ve hoy.</p>
                  ) : (
                    <Boton
                      variante="secundario"
                      tamano="chico"
                      className="mt-3 w-fit"
                      cargando={vuelta.pendiente && volviendoA === version.version}
                      deshabilitado={ocupado}
                      onClick={() => volver(version)}
                    >
                      Volver a esta
                    </Boton>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
          {vuelta.error ? <LineaDeEstado tipo="error" titulo={vuelta.error} /> : null}
          {avisoDeVuelta ? <LineaDeEstado tipo="exito" titulo={avisoDeVuelta} /> : null}
        </Seccion>
      ) : null}

      <Seccion titulo="Para tu bio" id="ia-bio">
        <Panel>
          <p className="text-cuerpo">{lineaParaLaBio}</p>
        </Panel>
        <Boton variante="callado" onClick={copiar}>
          Copiar la línea
        </Boton>
        <output className="block min-h-6 text-meta text-apagado">
          {copia === "copiado" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-tinta">
              <Check aria-hidden="true" size={ICONO.chico} />
              Línea copiada
            </span>
          ) : null}
          {copia === "fallo" ? "No pude copiarla. Mantén apretada la línea de arriba para copiarla." : null}
        </output>
      </Seccion>
    </div>
  )
}
