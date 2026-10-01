"use client"

import { ChevronLeft } from "lucide-react"
import { useState, useTransition } from "react"
import { etiquetaDeAlerta } from "@/components/chip-de-alerta"
import { Boton } from "@/components/ui/boton"
import type { Resultado } from "@/lib/acciones/resultado"
import { NOMBRE_DE_PILAR, PILARES, type Pilar } from "@/lib/dominio/pilares"
import { type Alerta, TIPOS_DE_ALERTA } from "@/lib/dominio/revision"
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

export interface IdeaConfirmada {
  gancho: string
  tema: string
  formato: string
  pilar: Pilar
  alertas: Alerta[]
}

interface PropiedadesDeIdeaPropia {
  proponer: (gancho: string, tema: string) => Promise<Resultado<{ propuesta: PropuestaDeIdea }>>
  crear: (idea: IdeaConfirmada) => Promise<Resultado<{ id: string }>>
  alGuardar: () => void
  alVolver: () => void
}

type Paso = "escribir" | "confirmar"

export function IdeaPropia({ proponer, crear, alGuardar, alVolver }: PropiedadesDeIdeaPropia) {
  const [paso, setPaso] = useState<Paso>("escribir")
  const [gancho, setGancho] = useState("")
  const [tema, setTema] = useState("")
  const [pilar, setPilar] = useState<Pilar | null>(null)
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
    <div className="grid gap-4.5">
      <button
        type="button"
        onClick={alVolver}
        className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-label font-semibold text-acento"
      >
        <ChevronLeft aria-hidden="true" size={20} />
        Volver a las ideas
      </button>
      <h1 className="font-serif text-title text-balance">Tu idea</h1>

      {paso === "escribir" ? (
        <div className="grid gap-3.5">
          <div className="grid gap-1.5">
            <label className="text-label font-semibold" htmlFor="idea-gancho">
              Tu idea
            </label>
            <textarea
              id="idea-gancho"
              value={gancho}
              onChange={(evento) => setGancho(evento.target.value)}
              aria-describedby="idea-gancho-ayuda"
              rows={3}
              maxLength={220}
              className="rounded-md border border-linea bg-superficie p-3.5 text-body text-tinta"
            />
            <p id="idea-gancho-ayuda" className="text-meta text-apagado">
              La frase con que abrirías el reel, como la dirías tú.
            </p>
          </div>
          <label className="grid gap-1.5 text-label font-semibold" htmlFor="idea-tema">
            De qué trata (si quieres)
            <textarea
              id="idea-tema"
              value={tema}
              onChange={(evento) => setTema(evento.target.value)}
              rows={3}
              maxLength={600}
              className="rounded-md border border-linea bg-superficie p-3.5 text-body font-normal text-tinta"
            />
          </label>
          {error ? <MensajeDeError mensaje={error} /> : null}
          <Boton deshabilitado={!listaParaProponer} cargando={pendiente} onClick={pedirPropuesta}>
            Proponer pilar y alertas
          </Boton>
          {error ? (
            <Boton variante="callado" onClick={() => setPaso("confirmar")}>
              Elegir yo el pilar
            </Boton>
          ) : null}
          {!listaParaProponer ? <p className="text-center text-meta text-apagado">Escribe tu idea primero.</p> : null}
        </div>
      ) : (
        <div className="grid gap-4.5">
          <p className="rounded-lg bg-hundido p-3.5 text-[1.0625rem]">{gancho.trim()}</p>
          <p className="text-apagado">Esto propongo. Corrígelo si no calza.</p>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-label font-semibold text-apagado">Pilar</legend>
            {PILARES.map((candidato) => (
              <label
                key={candidato}
                data-pilar={candidato}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-linea bg-superficie px-3.5 has-[:checked]:border-acento has-[:checked]:bg-pilar-tinte"
              >
                <input
                  type="radio"
                  name="pilar"
                  className="size-5 accent-acento"
                  checked={pilar === candidato}
                  onChange={() => setPilar(candidato)}
                />
                <span>{NOMBRE_DE_PILAR[candidato]}</span>
              </label>
            ))}
          </fieldset>

          <label className="grid gap-1.5 text-label font-semibold text-apagado" htmlFor="idea-formato">
            Formato
            <select
              id="idea-formato"
              value={formato}
              onChange={(evento) => setFormato(evento.target.value)}
              className="min-h-13 rounded-md border border-linea bg-superficie px-3 text-body font-normal text-tinta"
            >
              {formatos.map((opcion) => (
                <option key={opcion}>{opcion}</option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-1">
            <legend className="mb-1 text-label font-semibold text-apagado">Alertas para el guion</legend>
            {TIPOS_DE_ALERTA.map((tipo) => (
              <label key={tipo} className="grid min-h-12 cursor-pointer grid-cols-[26px_1fr] items-start gap-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-6 accent-acento"
                  checked={alertas[tipo] !== undefined}
                  onChange={(evento) => alternarAlerta(tipo, evento.target.checked)}
                />
                <span className="grid">
                  <span className="font-semibold">{etiquetaDeAlerta(tipo)}</span>
                  <span className="text-meta text-apagado">{alertas[tipo] ?? DESCRIPCION_DE_ALERTA[tipo]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {error ? <MensajeDeError mensaje={error} /> : null}
          <Boton deshabilitado={pilar === null} cargando={pendiente} onClick={guardar}>
            Guardar idea
          </Boton>
          {pilar === null ? <p className="text-center text-meta text-apagado">Elige el pilar para guardarla.</p> : null}
        </div>
      )}
    </div>
  )
}

function MensajeDeError({ mensaje }: { mensaje: string }) {
  return (
    <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
      {mensaje}
    </p>
  )
}
