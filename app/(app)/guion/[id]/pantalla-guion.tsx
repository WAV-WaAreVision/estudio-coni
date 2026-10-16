"use client"

import { CaretLeft, Info } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type Dispatch, type SetStateAction, useCallback, useId, useState } from "react"
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
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { etiquetasDe } from "@/lib/dominio/etiquetas"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { aprobarGuionAccion, pedirCambiosAccion } from "../../piezas/acciones"
import { TEXTO_CAMBIOS_TRAS_LA_VOZ, TEXTO_ESCUCHA_COMPLETA, TEXTO_FALTA_VOZ, TEXTO_PREPARANDO_VOZ } from "./textos"
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
  /** The look stored on the piece (the one she signed with before an undo); preselected while it is still offered. */
  avatarGuardado: string | null
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
  // Her choices outlive the round trips of gate 1 (her voice being made, a new take): the page keys this by piece, and
  // only the screen below starts over with each state.
  const [avatarElegido, setAvatarElegido] = useState<string | null>(() =>
    datos.avatares.some((avatar) => avatar.id === datos.avatarGuardado) ? datos.avatarGuardado : null,
  )
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  return (
    <PuertaUno
      key={datos.grabacion.estado}
      datos={datos}
      elecciones={{ avatarElegido, setAvatarElegido, confirmadas, setConfirmadas }}
    />
  )
}

interface Elecciones {
  avatarElegido: string | null
  setAvatarElegido: (avatarId: string | null) => void
  confirmadas: ReadonlySet<string>
  setConfirmadas: Dispatch<SetStateAction<ReadonlySet<string>>>
}

function PuertaUno({ datos, elecciones }: { datos: DatosDeGuion; elecciones: Elecciones }) {
  const { avatarElegido, setAvatarElegido, confirmadas, setConfirmadas } = elecciones
  const router = useRouter()
  const [version, setVersion] = useState(datos.version)
  const [versionVista, setVersionVista] = useState(datos.version)
  // The server sent a newer piece without a change of state (a voice that failed to start): it is the new base.
  if (versionVista !== datos.version) {
    setVersionVista(datos.version)
    setVersion(datos.version)
  }
  const [revision, setRevision] = useState(datos.revision)
  const [sinGuardar, setSinGuardar] = useState(false)
  const [pidiendoCambios, setPidiendoCambios] = useState(false)
  const [aviso, setAviso] = useState<string | null>(datos.avisoInicial)
  // The take she heard to the end: another take (a new text, or "Grabar la voz de nuevo") asks again.
  const [escuchada, setEscuchada] = useState<string | null>(null)
  const aprobacion = useAccion()
  const cambios = useAccion()
  const idSinCambios = useId()
  const idConsecuencia = useId()
  const idMotivo = useId()

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

  // Stable, so typing, saving or a refresh does not restart the toast's timer.
  const { avisoInicial, id } = datos
  const cerrarAviso = useCallback(() => {
    setAviso(null)
    // The toast after an undo came in the address: it is said once.
    if (avisoInicial !== null) router.replace(`/guion/${id}`)
  }, [avisoInicial, id, router])

  return (
    <div>
      <header data-pilar={datos.pilar ?? undefined} className="grid gap-3">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta"
        >
          <CaretLeft aria-hidden="true" size={ICONO.medio} />
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
                <span data-snapshot="varia" className="font-semibold whitespace-nowrap text-firma tabular-nums">
                  {datos.salida}
                </span>
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
                <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
                {TEXTO_CAMBIOS_TRAS_LA_VOZ}
              </p>
            ) : null}
          </>
        )}
      </div>
      {aviso ? <Aviso mensaje={aviso} alCerrar={cerrarAviso} lugar="arriba" /> : null}
      <BarraDeFirma
        idConsecuencia={idConsecuencia}
        consecuencia={grabacion.lineaDeFirma}
        arriba={
          <>
            {aprobacion.error || cambios.error ? (
              <LineaDeEstado tipo="error" titulo={aprobacion.error ?? cambios.error} />
            ) : null}
            {motivo ? (
              <p id={idMotivo} className="flex items-start gap-2 text-meta font-medium text-tinta">
                <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
                {motivo}
              </p>
            ) : null}
          </>
        }
      >
        <DeslizarParaAprobar
          habilitado={motivo === undefined}
          enviando={aprobacion.pendiente}
          describidoPor={motivo ? `${idMotivo} ${idConsecuencia}` : idConsecuencia}
          alFirmar={() =>
            aprobacion.ejecutar(
              () => aprobarGuionAccion(datos.id, version, avatarElegido),
              // The undo on the video screen sends the version she signed at, never one a refresh brought later.
              (firmada) => router.replace(`/guion/${datos.id}?firmada=${firmada.version}`),
            )
          }
        />
      </BarraDeFirma>
    </div>
  )
}
