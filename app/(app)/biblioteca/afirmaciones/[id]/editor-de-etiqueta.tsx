"use client"

import { CaretRight } from "@phosphor-icons/react"
import { useEffect, useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { Eleccion } from "@/components/ui/filas"
import { ICONO } from "@/components/ui/icono"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import {
  type CampoDeEtiqueta,
  CERTEZA_BAJA,
  ELIGE_UN_VALOR,
  esMarca,
  FALTA_FRASE,
  FALTA_POR_QUE,
  type GrupoDeOpciones,
  pidePorQue,
  type RedDeEtiqueta,
} from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { confirmarEtiquetaAccion, corregirEtiquetaAccion, quitarMarcaAccion } from "../../acciones"
import { CLASES_DE_CAMPO } from "../../campo"

/** What a tag says now, already in her words. */
export interface EtiquetaActual {
  valor: string
  etiqueta: string
  frase: string | null
  porQue: string | null
  certezaBaja: boolean
  /** «Corregida por ti» or «Confirmada por ti», when she already acted on it. */
  revision: string | null
}

interface Propiedades {
  afirmacionId: string
  campo: CampoDeEtiqueta
  red: RedDeEtiqueta
  /** The mark's row; null for tipo, evidencia, the hook, and a mark to add. */
  marcaId: string | null
  /** «Emoción en Instagram»: names the tag, its list and its «Agregar». */
  titulo: string
  /** Null: the mark is missing and the tag offers «Agregar». */
  actual: EtiquetaActual | null
  /** Empty for dato and caso: only their phrase changes. */
  opciones: readonly GrupoDeOpciones[]
  conFrase: boolean
  quitable: boolean
}

/** Where the focus goes once a tag closes: back to the tag, or to its row's «Agregar» after «Quitar». */
interface Foco {
  afirmacionId: string
  campo: CampoDeEtiqueta
  red: RedDeEtiqueta
  /** Null: whichever tag of that field and network (a mark just added has no id on this screen yet). */
  marcaId: string | null
  a: "etiqueta" | "agregar"
  hasta: number
}

// A save refreshes the page, and an editor whose row changed remounts after this one closed: the new one takes the focus
// on mount. Module state, because the editor that asked is gone by then; it expires so it never steals a later focus.
let focoPendiente: Foco | null = null
const VIDA_DEL_FOCO_MS = 5000

/**
 * One tag (spec 6c-1): tapping it opens its list with «Está bien» and «Cambiar»; «Otro» or «Otra» asks one line of why;
 * a mark can be removed after a confirmation. A missing mark offers «Agregar». The refreshed page brings the new value.
 */
export function EditorDeEtiqueta({
  afirmacionId,
  campo,
  red,
  marcaId,
  titulo,
  actual,
  opciones,
  conFrase,
  quitable,
}: Propiedades) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [elegido, setElegido] = useState(actual?.valor ?? "")
  const [frase, setFrase] = useState(actual?.frase ?? "")
  const [porQue, setPorQue] = useState(actual?.porQue ?? "")
  const [quitando, setQuitando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const etiquetaRef = useRef<HTMLButtonElement>(null)
  const agregarRef = useRef<HTMLButtonElement>(null)
  const formularioRef = useRef<HTMLFormElement>(null)
  const conLista = opciones.length > 0
  const panel = `${id}-panel`

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount; a remounted editor takes the focus its predecessor left.
  useEffect(() => {
    const foco = focoPendiente
    if (!foco || foco.hasta < Date.now()) return
    if (foco.afirmacionId !== afirmacionId || foco.campo !== campo || foco.red !== red) return
    const destino = foco.a === "agregar" ? (actual ? null : agregarRef.current) : actual ? etiquetaRef.current : null
    if (!destino || (foco.marcaId !== null && foco.marcaId !== marcaId)) return
    focoPendiente = null
    destino.focus()
  }, [])

  useEffect(() => {
    if (!abierto) return
    const formulario = formularioRef.current
    const primero =
      formulario?.querySelector<HTMLInputElement>("input[type=radio]:checked") ??
      formulario?.querySelector<HTMLInputElement>("input")
    primero?.focus()
  }, [abierto])

  function abrir() {
    setElegido(actual?.valor ?? "")
    setFrase(actual?.frase ?? "")
    setPorQue(actual?.porQue ?? "")
    setAbierto(true)
  }

  function cerrar(a: Foco["a"] = "etiqueta") {
    setAbierto(false)
    setQuitando(false)
    setAviso(null)
    limpiarError()
    focoPendiente = {
      afirmacionId,
      campo,
      red,
      marcaId: a === "agregar" ? null : marcaId,
      a,
      hasta: Date.now() + VIDA_DEL_FOCO_MS,
    }
    requestAnimationFrame(() => {
      const destino = a === "agregar" ? null : (etiquetaRef.current ?? agregarRef.current)
      destino?.focus()
    })
  }

  function guardar() {
    setAviso(null)
    if (conLista && elegido === "") {
      setAviso(ELIGE_UN_VALOR)
      return
    }
    if (!conLista && frase.trim() === "") {
      setAviso(FALTA_FRASE)
      return
    }
    if (pidePorQue(elegido) && porQue.trim() === "") {
      setAviso(FALTA_POR_QUE)
      return
    }
    ejecutar(
      () =>
        corregirEtiquetaAccion({
          afirmacionId,
          campo,
          red,
          marcaId,
          valor: elegido,
          frase,
          porQue: pidePorQue(elegido) ? porQue : "",
        }),
      () => cerrar(),
    )
  }

  const problema = aviso ?? (quitando ? null : error)
  // Only a mark has a row to remove; tipo, evidencia and the hook never offer «Quitar».
  const marca = esMarca(campo) ? campo : null
  // A value the list no longer offers (sin_clasificar, a retired one) cannot be confirmed: the server would refuse it.
  const confirmable =
    actual !== null && (!conLista || opciones.some((g) => g.opciones.some((o) => o.valor === actual.valor)))

  return (
    <div className="grid gap-2 rounded-panel bg-piedra-alta p-3">
      {actual ? (
        <button
          ref={etiquetaRef}
          type="button"
          aria-expanded={abierto}
          aria-controls={panel}
          onClick={() => (abierto ? cerrar() : abrir())}
          className="group flex min-h-objetivo w-full items-center gap-3 rounded-control text-left"
        >
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-meta text-apagado">{titulo}</span>
            <span className="text-cuerpo font-semibold text-tinta">{actual.etiqueta}</span>
            {actual.frase ? <span className="text-meta text-tinta">{`«${actual.frase}»`}</span> : null}
          </span>
          <CaretRight
            aria-hidden="true"
            size={ICONO.medio}
            className="shrink-0 text-apagado transition-transform duration-[var(--dur-media)] ease-salida group-aria-expanded:rotate-90"
          />
        </button>
      ) : (
        <div className="flex min-h-objetivo flex-wrap items-center justify-between gap-2">
          <span className="text-meta text-apagado">{titulo}</span>
          {abierto ? null : (
            <Boton
              ref={agregarRef}
              variante="secundario"
              tamano="chico"
              aria-expanded={false}
              aria-controls={panel}
              // The name says what is added; a space inside an sr-only span is trimmed from the computed name.
              aria-label={`Agregar ${titulo}`}
              onClick={abrir}
            >
              Agregar
            </Boton>
          )}
        </div>
      )}
      {actual?.certezaBaja ? <p className="text-meta text-apagado">{CERTEZA_BAJA}</p> : null}
      {actual?.porQue ? <p className="text-meta text-apagado">{`Por qué: ${actual.porQue}`}</p> : null}
      {actual?.revision ? <p className="text-meta font-semibold text-tinta">{actual.revision}</p> : null}

      {abierto ? (
        <form
          ref={formularioRef}
          id={panel}
          aria-label={titulo}
          className="grid gap-3 border-t border-hilo pt-3"
          onSubmit={(evento) => {
            evento.preventDefault()
            guardar()
          }}
        >
          {opciones.map((grupo) => (
            <fieldset key={grupo.titulo ?? "lista"} className="grid">
              <legend className="text-meta font-semibold text-apagado">{grupo.titulo ?? titulo}</legend>
              <div className="elecciones grid">
                {grupo.opciones.map((opcion) => (
                  <Eleccion
                    key={opcion.valor}
                    nombre={`${id}-valor`}
                    valor={opcion.valor}
                    elegido={elegido === opcion.valor}
                    etiqueta={opcion.etiqueta}
                    detalle={opcion.detalle ?? undefined}
                    alElegir={setElegido}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          {conFrase ? (
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-frase`} className="text-cuerpo font-semibold">
                Frase
              </label>
              <input
                id={`${id}-frase`}
                className={CLASES_DE_CAMPO}
                value={frase}
                maxLength={500}
                onChange={(evento) => setFrase(evento.target.value)}
              />
            </div>
          ) : null}
          {pidePorQue(elegido) ? (
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-por-que`} className="text-cuerpo font-semibold">
                ¿Por qué? En una línea
              </label>
              <input
                id={`${id}-por-que`}
                className={CLASES_DE_CAMPO}
                value={porQue}
                maxLength={500}
                onChange={(evento) => setPorQue(evento.target.value)}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {confirmable ? (
              <Boton
                variante="secundario"
                tamano="chico"
                cargando={pendiente}
                onClick={() =>
                  ejecutar(
                    () => confirmarEtiquetaAccion({ afirmacionId, campo, red, marcaId }),
                    () => cerrar(),
                  )
                }
              >
                Está bien
              </Boton>
            ) : null}
            <Boton type="submit" tamano="chico" cargando={pendiente}>
              {actual ? "Cambiar" : "Guardar"}
            </Boton>
            <Boton variante="callado" tamano="chico" onClick={() => cerrar()}>
              Cerrar
            </Boton>
          </div>
          {quitable && actual && marca ? (
            quitando ? (
              <ConfirmacionEnLinea
                trato="destructivo"
                pregunta="¿Quito esta marca? Queda anotado que la quitaste."
                confirmar="Quitar"
                volver="Volver"
                cargando={pendiente}
                error={error}
                alConfirmar={() =>
                  ejecutar(
                    () => quitarMarcaAccion({ afirmacionId, marca, red, marcaId }),
                    () => cerrar("agregar"),
                  )
                }
                alVolver={() => setQuitando(false)}
              />
            ) : (
              <Boton variante="callado" tamano="chico" onClick={() => setQuitando(true)}>
                Quitar
              </Boton>
            )
          ) : null}
          {problema ? <LineaDeError>{problema}</LineaDeError> : null}
        </form>
      ) : null}
    </div>
  )
}
