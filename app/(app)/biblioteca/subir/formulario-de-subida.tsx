"use client"

import { CaretLeft, Paperclip } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { Eleccion } from "@/components/ui/filas"
import { ICONO } from "@/components/ui/icono"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { CLASES_DE_VOLVER, Volver } from "@/components/ui/volver"
import { ERROR_GENERICO, ERROR_SESION_VENCIDA, type Resultado } from "@/lib/acciones/resultado"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import {
  armarEntrada,
  type EntradaDeSubida,
  GUARDANDO,
  HREF_TRAS_SUBIR,
  juntarArchivos,
  moverArchivo,
  PREPARANDO,
  progresoDeSubida,
} from "@/lib/dominio/biblioteca/borrador-de-subida"
import { AYUDA_DE_ROL, ETIQUETA_DE_ROL, ROLES, type Rol, type TipoDeMaterial } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import {
  ACEPTA_TODO,
  ACEPTA_VIDEO,
  AYUDA_DEL_CAMPO,
  detectarTipo,
  FALTA_EL_ARCHIVO,
  FALTA_LA_ENTRADA,
  GUARDADO_SIN_INICIAR,
  leerEntrada,
  NO_RECONOZCO,
  normalizarEnlace,
  PESA_DEMASIADO,
  TAMANO_MAXIMO_BYTES,
  tipoEfectivo,
} from "@/lib/dominio/biblioteca/subir"
import { AVISO_DE_PODCAST, esPodcast, esYoutube, PASOS_DE_YOUTUBE } from "@/lib/dominio/biblioteca/youtube"
import { cn } from "@/lib/utils"
import { confirmarMaterialAccion, crearAutorAccion, crearMaterialAccion, descartarMaterialAccion } from "../acciones"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { SelectorDeAutor } from "../selector-de-autor"
import { ListaDeImagenes } from "./lista-de-imagenes"
import { subirArchivos } from "./subida-cliente"
import { TipoDetectado } from "./tipo-detectado"

type Lectura = { ok: true; entrada: EntradaDeSubida; aSubir: File[] } | { ok: false; error: string }

/** A rejected action (the network, the server) must not leave the button spinning or break the screen. */
async function pedir<T extends object>(accion: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await accion()
  } catch (fallo) {
    console.error("Una acción de Subir no respondió", fallo)
    return { ok: false, error: ERROR_GENERICO }
  }
}

interface Propiedades {
  autores: AutorDeLista[]
  /** The page's heading, between the way back and the form. */
  encabezado: ReactNode
}

export function FormularioDeSubida({ autores, encabezado }: Propiedades) {
  const router = useRouter()
  const id = useId()
  const principal = useRef<HTMLInputElement>(null)
  const elegirArchivo = useRef<HTMLButtonElement>(null)
  const delPost = useRef<HTMLInputElement>(null)
  // A tap that lands before the screen re-renders still sees `ocupado` false: the ref is the real lock.
  const enCurso = useRef(false)
  // Once the row exists, a retry only confirms it again (a second confirmation is a no-op): never a second material.
  const creadoId = useRef<string | null>(null)
  const [texto, setTexto] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])
  const [manual, setManual] = useState<TipoDeMaterial | null>(null)
  // Each new input remounts the type line: an open Tipo select closes back to what is detected.
  const [entradaNumero, setEntradaNumero] = useState(0)
  const [transcripcion, setTranscripcion] = useState("")
  const [referencia, setReferencia] = useState("")
  const [videoDelPost, setVideoDelPost] = useState<File | null>(null)
  const [titulo, setTitulo] = useState("")
  const [autorId, setAutorId] = useState("")
  const [rol, setRol] = useState<Rol | "">("")
  const [declaracion, setDeclaracion] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<string | null>(null)

  const ocupado = progreso !== null

  // Leaving mid-upload would keep a material whose files never arrive (D10): the browser asks first.
  useEffect(() => {
    if (!ocupado) return
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [ocupado])

  // An upload that ends after she left must not pull her back to the list.
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])
  const deteccion = detectarTipo({ texto, archivos })
  const efectivo = tipoEfectivo(deteccion, manual)
  const tipo = efectivo?.tipo ?? null
  // "youtu.be/abc" is the same link as "https://youtu.be/abc": the extras follow the address it points to.
  const enlace = normalizarEnlace(texto) ?? texto.trim()

  // One field, two ways in (D4): typing clears the files, picking clears the text; either clears a manual type.
  function escribir(nuevo: string) {
    setTexto(nuevo)
    setArchivos([])
    setManual(null)
    setEntradaNumero((numero) => numero + 1)
    setError(null)
  }

  function elegir(elegidos: File[]) {
    if (elegidos.length === 0) return
    const juntos = juntarArchivos(archivos, elegidos)
    setArchivos(juntos.archivos)
    setTexto("")
    setManual(null)
    setEntradaNumero((numero) => numero + 1)
    setError(juntos.error)
  }

  function quitarArchivo(indice: number) {
    const quedan = archivos.filter((_, posicion) => posicion !== indice)
    setArchivos(quedan)
    // The list goes away with its last file: the focus goes back to where files come from.
    if (quedan.length === 0) elegirArchivo.current?.focus()
  }

  function elegirVideo(elegido: File | undefined) {
    if (!elegido) return
    if (elegido.size > TAMANO_MAXIMO_BYTES) {
      setError(PESA_DEMASIADO)
      return
    }
    setError(null)
    setVideoDelPost(elegido)
  }

  function elegirRol(opcion: Rol) {
    setRol(opcion)
    // What Coni says is by Coni: her author is the obvious pick while none is chosen.
    if (opcion === "voz_propia" && autorId === "") setAutorId(autores.find((autor) => autor.tipo === "coni")?.id ?? "")
    setError(null)
  }

  /** The same rules the server runs again (leerEntrada): nothing is sent while one fails. */
  function leerFormulario(): Lectura {
    if (!efectivo) return { ok: false, error: archivos.length > 0 ? NO_RECONOZCO : FALTA_LA_ENTRADA }
    const { entrada, aSubir } = armarEntrada({
      tipo: efectivo.tipo,
      texto,
      archivos,
      videoDelPost,
      transcripcion,
      referencia,
      titulo,
      autorId,
      rol,
      declaracion,
    })
    const lectura = leerEntrada(entrada)
    return lectura.ok ? { ok: true, entrada, aSubir } : { ok: false, error: lectura.error }
  }

  function ir(ruta: string) {
    if (montado.current) router.push(ruta)
  }

  function fallar(mensaje: string) {
    setProgreso(null)
    if (mensaje === ERROR_SESION_VENCIDA) ir("/ingreso")
    else setError(mensaje)
  }

  /** Create the row and its signed uploads, put each file straight to the store, then confirm (spec section 3). */
  async function subir() {
    if (enCurso.current) return
    setError(null)
    const pendiente = creadoId.current
    const leido = pendiente ? null : leerFormulario()
    if (leido && !leido.ok) {
      setError(leido.error)
      return
    }
    enCurso.current = true
    try {
      if (pendiente) await confirmar(pendiente)
      else if (leido) await crearYSubir(leido)
    } finally {
      enCurso.current = false
    }
  }

  async function crearYSubir(leido: Extract<Lectura, { ok: true }>) {
    setProgreso(PREPARANDO)
    const creado = await pedir(() => crearMaterialAccion(leido.entrada))
    if (!creado.ok) {
      fallar(creado.error)
      return
    }
    try {
      await subirArchivos({
        subidas: creado.subidas,
        archivos: leido.aSubir,
        alAvanzar: (hechos, total) => setProgreso(progresoDeSubida(hechos, total)),
      })
    } catch (falla) {
      // The row exists before the upload: a failed upload must not leave a material that will never have its file.
      const descartado = await pedir(() => descartarMaterialAccion(creado.materialId))
      if (!descartado.ok) console.error(`No pude descartar el material ${creado.materialId}`, descartado.error)
      fallar(falla instanceof Error ? falla.message : ERROR_GENERICO)
      return
    }
    creadoId.current = creado.materialId
    await confirmar(creado.materialId)
  }

  async function confirmar(materialId: string) {
    setProgreso(GUARDANDO)
    const confirmado = await pedir(() => confirmarMaterialAccion(materialId))
    if (confirmado.ok) {
      ir(HREF_TRAS_SUBIR)
      return
    }
    // Saved but not started: the row on the list already offers Reintentar.
    if (confirmado.error === GUARDADO_SIN_INICIAR) {
      ir("/biblioteca")
      return
    }
    // The server deleted a material whose file was wrong: the next Subir starts over.
    if (confirmado.error === FALTA_EL_ARCHIVO || confirmado.error === PESA_DEMASIADO) creadoId.current = null
    fallar(confirmado.error)
  }

  return (
    <>
      {ocupado ? (
        // biome-ignore lint/a11y/useSemanticElements: an <a> with no href is not a link; this one says it is inactive
        <span
          role="link"
          aria-disabled="true"
          // No href while uploading: as a disabled Boton, still found by the focus and a screen reader, going nowhere.
          tabIndex={0}
          className={cn(CLASES_DE_VOLVER, "cursor-not-allowed bg-piedra-honda text-apagado shadow-none")}
        >
          <CaretLeft aria-hidden="true" size={ICONO.medio} />
          Volver a Biblioteca
        </span>
      ) : (
        <Volver href="/biblioteca">Volver a Biblioteca</Volver>
      )}
      {encabezado}
      <form
        aria-label="Subir material"
        noValidate
        className="grid gap-6"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (!ocupado) void subir()
        }}
      >
        <div className="grid gap-3">
          <Campo id={`${id}-entrada`} etiqueta="Pega un enlace o elige un archivo" ayuda={AYUDA_DEL_CAMPO}>
            <textarea
              id={`${id}-entrada`}
              rows={2}
              autoComplete="off"
              value={texto}
              aria-describedby={`${id}-entrada-ayuda`}
              onChange={(evento) => escribir(evento.target.value)}
              className={cn(CLASES_DE_CAMPO, "resize-y")}
            />
          </Campo>
          <Boton
            ref={elegirArchivo}
            variante="secundario"
            tamano="chico"
            className="w-fit"
            deshabilitado={ocupado}
            icono={<Paperclip aria-hidden="true" size={ICONO.medio} />}
            onClick={() => principal.current?.click()}
          >
            Elegir archivo
          </Boton>
          {/* Never the native "Choose File" (4d): the button above opens it. */}
          <input
            ref={principal}
            type="file"
            hidden
            multiple
            accept={ACEPTA_TODO}
            onChange={(evento) => {
              elegir(Array.from(evento.target.files ?? []))
              evento.target.value = ""
            }}
          />
          {tipo === "imagen" ? (
            <ListaDeImagenes
              archivos={archivos}
              ocupado={ocupado}
              alMover={(indice, hacia) => setArchivos(moverArchivo(archivos, indice, hacia))}
              alQuitar={quitarArchivo}
            />
          ) : archivos.length > 0 ? (
            <ul aria-label="Archivos elegidos" className="grid gap-2">
              {archivos.map((archivo, indice) => (
                // The key is the position: the same file may be picked twice.
                <li
                  key={`${indice}-${archivo.name}`}
                  className="rounded-bloque bg-piedra-honda p-3 text-cuerpo break-words"
                >
                  {archivo.name}
                </li>
              ))}
            </ul>
          ) : null}
          {deteccion === null && archivos.length > 0 ? <p className="text-meta text-apagado">{NO_RECONOZCO}</p> : null}
          <TipoDetectado key={entradaNumero} efectivo={efectivo} ocupado={ocupado} alElegir={setManual} />
        </div>

        {tipo === "link" && esYoutube(enlace) ? (
          <Campo id={`${id}-transcripcion`} etiqueta="Transcripción del video" ayuda={PASOS_DE_YOUTUBE}>
            <textarea
              id={`${id}-transcripcion`}
              rows={6}
              value={transcripcion}
              aria-describedby={`${id}-transcripcion-ayuda`}
              onChange={(evento) => setTranscripcion(evento.target.value)}
              className={cn(CLASES_DE_CAMPO, "min-h-40 resize-y")}
            />
          </Campo>
        ) : null}
        {tipo === "link" && esPodcast(enlace) ? <p className="text-meta text-apagado">{AVISO_DE_PODCAST}</p> : null}

        {tipo === "post" ? (
          <div className="grid gap-2">
            <p className="text-cuerpo font-semibold">
              Video <span className="font-normal text-apagado">(opcional)</span>
            </p>
            {videoDelPost ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-bloque bg-piedra-honda p-3">
                <span className="text-cuerpo break-words">{videoDelPost.name}</span>
                <Boton
                  variante="callado"
                  aria-label="Quitar el video"
                  deshabilitado={ocupado}
                  onClick={() => setVideoDelPost(null)}
                >
                  Quitar
                </Boton>
              </div>
            ) : (
              <Boton
                variante="secundario"
                tamano="chico"
                className="w-fit"
                deshabilitado={ocupado}
                onClick={() => delPost.current?.click()}
              >
                Elegir video
              </Boton>
            )}
            <input
              ref={delPost}
              type="file"
              hidden
              accept={ACEPTA_VIDEO}
              onChange={(evento) => {
                elegirVideo(evento.target.files?.[0])
                evento.target.value = ""
              }}
            />
          </div>
        ) : null}

        {tipo === "video" || tipo === "imagen" ? (
          <Campo id={`${id}-referencia`} etiqueta="Link de referencia (no se abre)">
            <input
              id={`${id}-referencia`}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={referencia}
              onChange={(evento) => setReferencia(evento.target.value)}
              className={CLASES_DE_CAMPO}
            />
          </Campo>
        ) : null}

        <Campo
          id={`${id}-titulo`}
          etiqueta={
            <>
              Título <span className="font-normal text-apagado">(opcional)</span>
            </>
          }
        >
          <input
            id={`${id}-titulo`}
            type="text"
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>

        <SelectorDeAutor
          autores={autores}
          valor={autorId}
          alElegir={(elegido) => {
            setAutorId(elegido)
            setError(null)
          }}
          alCrear={crearAutorAccion}
        />

        <fieldset className="elecciones grid">
          <legend className="text-cuerpo font-semibold">{PALABRAS.papel}</legend>
          {ROLES.map((opcion) => (
            <Eleccion
              key={opcion}
              nombre={`${id}-rol`}
              valor={opcion}
              elegido={rol === opcion}
              etiqueta={ETIQUETA_DE_ROL[opcion]}
              detalle={AYUDA_DE_ROL[opcion]}
              alElegir={() => elegirRol(opcion)}
            />
          ))}
        </fieldset>

        <Casilla
          etiqueta="Este material no contiene datos de pacientes"
          marcada={declaracion}
          alCambiar={setDeclaracion}
        />

        {error ? <LineaDeError>{error}</LineaDeError> : null}
        <output aria-live="polite" className="block text-cuerpo text-tinta">
          {progreso}
        </output>

        <div className="grid gap-3 md:flex md:items-center md:gap-6">
          <Boton type="submit" cargando={ocupado} className="md:w-auto">
            Subir
          </Boton>
          {/* Leaving mid-upload would keep a material whose files never arrive (D10). */}
          {ocupado ? null : (
            <Link href="/biblioteca" className={clasesDeBoton({ variante: "callado", className: "justify-center" })}>
              Cancelar
            </Link>
          )}
        </div>
      </form>
    </>
  )
}
