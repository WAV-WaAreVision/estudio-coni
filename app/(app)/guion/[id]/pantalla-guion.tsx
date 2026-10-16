"use client"

import { CaretLeft, Info } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { AYUDA_DE_MARCAS } from "@/components/ayuda-de-marcas"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { EditorDeGuion, type GuionGuardado } from "@/components/editor-de-guion"
import { type AvatarParaElegir, ElegirAvatar } from "@/components/elegir-avatar"
import { GuionEnLectura } from "@/components/guion-en-lectura"
import { Seccion } from "@/components/seccion"
import { TextoLinkedinEnLectura } from "@/components/texto-linkedin-en-lectura"
import { Aviso } from "@/components/ui/aviso"
import { BarraDeFirma } from "@/components/ui/barra-de-firma"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { etiquetasDe } from "@/lib/dominio/etiquetas"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { aprobarGuionAccion, pedirCambiosAccion } from "../../piezas/acciones"
import {
  ETIQUETA_DE_FIRMA,
  TEXTO_CAMBIOS_TRAS_LA_VOZ,
  TEXTO_ESCUCHA_COMPLETA,
  TEXTO_FALTA_VOZ,
  TEXTO_PREPARANDO_VOZ,
} from "./textos"
import { VozParaFirmar } from "./voz-para-firmar"

export interface DatosDeGuion {
  id: string
  version: number
  titulo: string
  pilar: Pilar | null
  formato: string | null
  segundos: number
  guion: string
  texto: string
  /** The LinkedIn text, shown read only: it is reviewed and edited at gate 2. Null when the piece has none yet. */
  textoLinkedin: string | null
  revision: Hallazgo[]
  /** Whether there is a version Claude wrote to go back to. */
  tieneVersionDeClaude: boolean
  /** "jueves 16 de octubre · 19:00": when it would go out if she approves today. */
  salida: string | null
  explicacion: string | null
  /** The looks WAV lets her choose; empty means there is nothing to choose and the approval stays blocked. */
  avatares: AvatarParaElegir[]
  /** Her voice of this script and what the signature spends (design 2026-10-15, decisions 3 and 4). */
  grabacion: DatosDeGrabacion
  /** A toast the screen opens with: she just took a signature back. */
  avisoInicial: string | null
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

const unirConY = (partes: readonly string[]) =>
  partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes.join("")

/** What still keeps the signature closed, the most useful first; undefined when she can sign. */
function motivoParaFirmar(estado: {
  sinGuardar: boolean
  preparando: boolean
  voz: string | null
  escuchada: string | null
  bloqueos: number
  sinAvatares: boolean
  bloqueoFirma: string | null
  faltan: readonly string[]
}): string | undefined {
  if (estado.sinGuardar) return "Guarda tus cambios antes de aprobar"
  if (estado.preparando) return TEXTO_PREPARANDO_VOZ
  // The HeyGen wallet or the month's cap would stop the video: preparing or listening to her voice would not help.
  if (estado.bloqueoFirma !== null) return estado.bloqueoFirma
  if (estado.voz === null) return TEXTO_FALTA_VOZ
  if (estado.bloqueos > 0) return "Hay algo que corregir antes de aprobar."
  if (estado.sinAvatares) return "Todavía no hay avatares para elegir."
  if (estado.faltan.length > 0) return `Falta ${unirConY(estado.faltan)}.`
  if (estado.escuchada !== estado.voz) return TEXTO_ESCUCHA_COMPLETA
  return undefined
}

/**
 * Gate 1 (design 2026-10-15): she listens to her voice of the script, reads and edits it, confirms what the review
 * flagged and slides once. The signature approves the script and the voice, and the video starts after the undo window.
 */
export function PantallaGuion({ datos }: { datos: DatosDeGuion }) {
  const router = useRouter()
  const [version, setVersion] = useState(datos.version)
  const [revision, setRevision] = useState(datos.revision)
  const [sinGuardar, setSinGuardar] = useState(false)
  const [avatarElegido, setAvatarElegido] = useState<string | null>(null)
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  const [pidiendoCambios, setPidiendoCambios] = useState(false)
  const [aviso, setAviso] = useState<string | null>(datos.avisoInicial)
  // The take she heard to the end: another take (a new text, or "Grabar la voz de nuevo") asks again.
  const [escuchada, setEscuchada] = useState<string | null>(null)
  const aprobacion = useAccion()
  const cambios = useAccion()
  const idSinCambios = useId()

  const { grabacion } = datos
  const preparando = grabacion.estado === "grabando_voz"
  const bloqueos = revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const advertencias = revision.filter((hallazgo) => hallazgo.tipo === "advierte")
  const sinConfirmar = advertencias.filter((hallazgo) => !confirmadas.has(claveDe(hallazgo)))
  const sinAvatares = datos.avatares.length === 0
  const faltan = [
    ...(avatarElegido === null && !sinAvatares ? ["elegir el avatar"] : []),
    ...(sinConfirmar.length > 0 ? ["confirmar la revisión"] : []),
  ]
  const motivo = motivoParaFirmar({
    sinGuardar,
    preparando,
    voz: grabacion.voz?.clave ?? null,
    escuchada,
    bloqueos: bloqueos.length,
    sinAvatares,
    bloqueoFirma: grabacion.botones?.bloqueoVideo ?? null,
    faltan,
  })

  function alGuardar(guardado: GuionGuardado) {
    setVersion(guardado.version)
    setRevision(guardado.revision)
    // The ticks belong to the review she saw: a new review asks again.
    setConfirmadas(new Set())
  }

  function alternarConfirmacion(hallazgo: Hallazgo, confirmada: boolean) {
    setConfirmadas((actuales) => {
      const siguientes = new Set(actuales)
      if (confirmada) siguientes.add(claveDe(hallazgo))
      else siguientes.delete(claveDe(hallazgo))
      return siguientes
    })
  }

  function cerrarAviso() {
    setAviso(null)
    // The toast after an undo came in the address: it is said once.
    if (datos.avisoInicial !== null) router.replace(`/guion/${datos.id}`)
  }

  return (
    <div className="pb-[calc(var(--barra-max)+env(safe-area-inset-bottom))]">
      <header data-pilar={datos.pilar ?? undefined} className="grid gap-3">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta"
        >
          <CaretLeft aria-hidden="true" size={20} />
          Inicio
        </Link>
        <p className="flex items-baseline justify-between gap-4 text-meta text-apagado">
          <span>{datos.pilar ? NOMBRE_DE_PILAR[datos.pilar] : null}</span>
          <span>
            {datos.formato ? `${datos.formato} · ` : ""}
            {datos.segundos} s
          </span>
        </p>
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
        {datos.salida ? (
          <LineaDeEstado
            tipo="fecha"
            titulo={
              <>
                Si lo apruebas hoy, sale el{" "}
                <span className="font-semibold whitespace-nowrap text-firma tabular-nums">{datos.salida}</span>
              </>
            }
            tituloEnTinta
          />
        ) : null}
      </header>

      {datos.explicacion ? (
        <div className="mt-6">
          <LineaDeEstado tipo="aviso" titulo={datos.explicacion} tituloEnTinta />
        </div>
      ) : null}

      <VozParaFirmar
        piezaId={datos.id}
        version={version}
        datos={grabacion}
        alEscuchar={setEscuchada}
        sinGuardar={sinGuardar}
      />

      {preparando ? (
        <>
          {/* Her voice is being made of this text: it cannot change until the voice is back. */}
          <Seccion titulo="Guion" id="guion">
            <GuionEnLectura guion={datos.guion} />
            {etiquetasDe(datos.guion).length > 0 ? <p className="text-meta text-apagado">{AYUDA_DE_MARCAS}</p> : null}
          </Seccion>
          <Seccion titulo="Texto de la publicación" id="texto">
            <p className="whitespace-pre-wrap text-cuerpo leading-prosa">{datos.texto}</p>
          </Seccion>
        </>
      ) : (
        <div className="mt-10">
          <EditorDeGuion
            piezaId={datos.id}
            version={version}
            guion={datos.guion}
            texto={datos.texto}
            tieneVersionDeClaude={datos.tieneVersionDeClaude}
            alGuardar={alGuardar}
            alCambiarSinGuardar={setSinGuardar}
          />
        </div>
      )}
      {datos.textoLinkedin !== null ? <TextoLinkedinEnLectura texto={datos.textoLinkedin} /> : null}
      <Seccion titulo="Avatar" id="avatar">
        <ElegirAvatar avatares={datos.avatares} elegido={avatarElegido} alElegir={setAvatarElegido} />
      </Seccion>

      <Seccion titulo="Revisión" id="revision" cifra={revision.length > 0 ? revision.length : undefined}>
        <p className="text-cuerpo text-apagado">
          {revision.length === 0
            ? "Claude revisó el guion y no encontró observaciones. Tú decides."
            : "Claude revisó el guion. Tú decides."}
        </p>
        <div className="grid gap-4">
          {revision.map((hallazgo) => (
            <MarcaRevision
              key={claveDe(hallazgo)}
              hallazgo={hallazgo}
              confirmada={confirmadas.has(claveDe(hallazgo))}
              alCambiar={(confirmada) => alternarConfirmacion(hallazgo, confirmada)}
            />
          ))}
        </div>
      </Seccion>

      <div className="mt-10 grid gap-2">
        {pidiendoCambios ? (
          <ConfirmacionEnLinea
            trato="destructivo"
            pregunta="Se escribe un guion nuevo y este se descarta. ¿Seguro?"
            confirmar="Sí, pedir cambios"
            volver="Volver"
            cargando={cambios.pendiente}
            alConfirmar={() =>
              cambios.ejecutar(
                () => pedirCambiosAccion(datos.id, version),
                (r) => setAviso(r.advertencia ?? null),
              )
            }
            alVolver={() => setPidiendoCambios(false)}
          />
        ) : (
          <>
            <Boton
              variante="destructiva"
              deshabilitado={preparando}
              aria-describedby={preparando ? idSinCambios : undefined}
              onClick={() => setPidiendoCambios(true)}
            >
              Pedir cambios
            </Boton>
            {preparando ? (
              <p id={idSinCambios} className="flex items-start gap-2 text-meta font-medium text-tinta">
                <Info aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                {TEXTO_CAMBIOS_TRAS_LA_VOZ}
              </p>
            ) : null}
          </>
        )}
      </div>
      <BarraDeFirma etiqueta="Firma">
        {aprobacion.error || cambios.error ? (
          <LineaDeEstado tipo="error" titulo={aprobacion.error ?? cambios.error} />
        ) : null}
        <DeslizarParaAprobar
          etiqueta={ETIQUETA_DE_FIRMA}
          habilitado={motivo === undefined}
          motivo={motivo}
          nota={grabacion.lineaDeFirma}
          enviando={aprobacion.pendiente}
          alAprobar={() => aprobacion.ejecutar(() => aprobarGuionAccion(datos.id, version, avatarElegido))}
        />
      </BarraDeFirma>
      {aviso ? <Aviso mensaje={aviso} alCerrar={cerrarAviso} sobreBarra /> : null}
    </div>
  )
}
