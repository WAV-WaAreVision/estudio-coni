"use client"

import { ArrowRight, CaretLeft } from "@phosphor-icons/react"
import { useState, useTransition } from "react"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { Eleccion, FilaConValor } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { CLASES_DE_VOLVER } from "@/components/ui/volver"
import type { Resultado } from "@/lib/acciones/resultado"
import type { PilarVisible } from "@/lib/dominio/pilares"
import { type Alerta, etiquetaDeAlerta, TIPOS_DE_ALERTA } from "@/lib/dominio/revision"
import type { PropuestaDeIdea } from "@/lib/proveedores/anthropic"

export const FORMATOS = [
  "Mito o realidad",
  "Tres señales",
  "Ejercicio de la semana",
  "Pregunta de la audiencia",
  "Idea de sus libros",
]

const DESCRIPCION_DE_ALERTA: Record<(typeof TIPOS_DE_ALERTA)[number], string> = {
  "verificar dato": "Hay una cifra o un estudio que confirmar",
  "líneas de ayuda": "Toca violencia, abuso o salud mental",
  "no es terapia": "Roza el diagnóstico o un caso particular",
  nota: "Una indicación para quien escribe el guion",
}

/** What a tip says when Coni turns the alert on herself instead of taking Claude's. */
const TEXTO_POR_DEFECTO: Record<(typeof TIPOS_DE_ALERTA)[number], string> = {
  "verificar dato": "Confirmar las cifras o los estudios antes de usarlos.",
  "líneas de ayuda": "El tema toca violencia, abuso o salud mental: la publicación lleva las líneas de ayuda de Chile.",
  "no es terapia": "Mantener el encuadre educativo, sin diagnósticos ni consejos para casos particulares.",
  nota: "Idea propia de Coni.",
}

/** The classifier still types its pillar as the old enum; the screen takes any slug of the pillars it offers. */
export type PropuestaParaConfirmar = Omit<PropuestaDeIdea, "pilar"> & { pilar: string }

export interface IdeaConfirmada {
  gancho: string
  tema: string
  formato: string
  pilar: string
  alertas: Alerta[]
}

interface PropiedadesDeIdeaPropia {
  proponer: (gancho: string, tema: string) => Promise<Resultado<{ propuesta: PropuestaParaConfirmar }>>
  crear: (idea: IdeaConfirmada) => Promise<Resultado<{ id: string }>>
  /** The active pillars, in order: the only ones she can file an idea under. */
  pilares: readonly PilarVisible[]
  alGuardar: () => void
  alVolver: () => void
}

type Paso = "escribir" | "confirmar"

export function IdeaPropia({ proponer, crear, pilares, alGuardar, alVolver }: PropiedadesDeIdeaPropia) {
  const [paso, setPaso] = useState<Paso>("escribir")
  const [gancho, setGancho] = useState("")
  const [tema, setTema] = useState("")
  const [pilar, setPilar] = useState<string | null>(null)
  const [formato, setFormato] = useState(FORMATOS[0] ?? "")
  const [alertas, setAlertas] = useState<Partial<Record<(typeof TIPOS_DE_ALERTA)[number], string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  const listaParaProponer = gancho.trim() !== ""

  function pedirPropuesta() {
    setError(null)
    empezar(async () => {
      const resultado = await proponer(gancho.trim(), tema.trim())
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      const { propuesta } = resultado
      setPilar(propuesta.pilar)
      setFormato(propuesta.formato)
      setAlertas(Object.fromEntries(propuesta.alertas.map((alerta) => [alerta.tipo, alerta.texto])))
      setPaso("confirmar")
    })
  }

  function alternarAlerta(tipo: (typeof TIPOS_DE_ALERTA)[number], puesta: boolean) {
    setAlertas((actuales) => {
      const { [tipo]: _quitada, ...resto } = actuales
      return puesta ? { ...resto, [tipo]: actuales[tipo] ?? TEXTO_POR_DEFECTO[tipo] } : resto
    })
  }

  function guardar() {
    if (pilar === null) return
    setError(null)
    empezar(async () => {
      const resultado = await crear({
        gancho: gancho.trim(),
        tema: tema.trim(),
        formato,
        pilar,
        alertas: TIPOS_DE_ALERTA.flatMap((tipo) => {
          const texto = alertas[tipo]
          return texto === undefined ? [] : [{ tipo, texto }]
        }),
      })
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      alGuardar()
    })
  }

  const formatos = FORMATOS.includes(formato) ? FORMATOS : [...FORMATOS, formato]

  return (
    <div className="grid gap-4">
      <button type="button" onClick={alVolver} className={CLASES_DE_VOLVER}>
        <CaretLeft aria-hidden="true" size={ICONO.medio} />
        Volver a las ideas
      </button>
      <h1 className="text-pantalla text-balance">Tu idea</h1>

      {paso === "escribir" ? (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-meta font-semibold" htmlFor="idea-gancho">
              Tu idea
            </label>
            <textarea
              id="idea-gancho"
              value={gancho}
              onChange={(evento) => setGancho(evento.target.value)}
              aria-describedby="idea-gancho-ayuda"
              maxLength={220}
              className="campo min-h-24 text-cuerpo font-normal text-tinta"
            />
            <p id="idea-gancho-ayuda" className="text-meta text-apagado">
              La frase con que abrirías el reel, como la dirías tú.
            </p>
          </div>
          <label className="grid gap-2 text-meta font-semibold" htmlFor="idea-tema">
            De qué trata (si quieres)
            <textarea
              id="idea-tema"
              value={tema}
              onChange={(evento) => setTema(evento.target.value)}
              maxLength={600}
              className="campo min-h-24 text-cuerpo font-normal text-tinta"
            />
          </label>
          {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
          <Boton
            deshabilitado={!listaParaProponer}
            cargando={pendiente}
            icono={<ArrowRight aria-hidden="true" size={ICONO.medio} />}
            onClick={pedirPropuesta}
          >
            Proponer pilar y alertas
          </Boton>
          {error ? (
            <Boton variante="callado" onClick={() => setPaso("confirmar")}>
              Elegir yo el pilar
            </Boton>
          ) : null}
          {!listaParaProponer ? <p className="text-meta text-apagado">Escribe tu idea primero.</p> : null}
        </div>
      ) : (
        <div className="grid gap-6">
          <p className="text-cuerpo font-semibold">{gancho.trim()}</p>
          <p className="text-cuerpo text-apagado">Esto propongo. Corrígelo si no calza.</p>

          <fieldset className="elecciones grid">
            <legend className="mb-1 text-meta font-semibold">Pilar</legend>
            {pilares.map((candidato) => (
              <Eleccion
                key={candidato.slug}
                nombre="pilar"
                valor={candidato.slug}
                elegido={pilar === candidato.slug}
                etiqueta={candidato.nombre}
                alElegir={() => setPilar(candidato.slug)}
              />
            ))}
          </fieldset>

          <Grupo>
            <FilaConValor
              etiqueta="Formato"
              valor={formato}
              opciones={formatos.map((opcion) => ({ valor: opcion, etiqueta: opcion }))}
              alCambiar={setFormato}
            />
          </Grupo>

          <fieldset className="grid">
            <legend className="mb-1 text-meta font-semibold">Alertas para el guion</legend>
            {TIPOS_DE_ALERTA.map((tipo) => (
              <Casilla
                key={tipo}
                etiqueta={etiquetaDeAlerta(tipo)}
                detalle={alertas[tipo] ?? DESCRIPCION_DE_ALERTA[tipo]}
                marcada={alertas[tipo] !== undefined}
                alCambiar={(puesta) => alternarAlerta(tipo, puesta)}
              />
            ))}
          </fieldset>

          {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
          <Boton
            deshabilitado={pilar === null}
            cargando={pendiente}
            icono={<ArrowRight aria-hidden="true" size={ICONO.medio} />}
            onClick={guardar}
          >
            Guardar idea
          </Boton>
          {pilar === null ? <p className="text-meta text-apagado">Elige el pilar para guardarla.</p> : null}
        </div>
      )}
    </div>
  )
}
