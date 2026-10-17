"use client"

import { Info, PencilSimple } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { type Dispatch, type SetStateAction, useCallback, useId, useRef, useState } from "react"
import { AYUDA_DE_MARCAS_EN_LECTURA } from "@/components/ayuda-de-marcas"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { EditorDeGuion, type GuionGuardado } from "@/components/editor-de-guion"
import { type AvatarParaElegir, ElegirAvatar } from "@/components/elegir-avatar"
import { GuionEnLectura } from "@/components/guion-en-lectura"
import { Seccion } from "@/components/seccion"
import { TextoLinkedinEnLectura } from "@/components/texto-linkedin-en-lectura"
import { Aviso } from "@/components/ui/aviso"
import { BarraDeFirma, LineaDeFalta } from "@/components/ui/barra-de-firma"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Panel } from "@/components/ui/panel"
import { Volver } from "@/components/ui/volver"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import { TEXTO_ALGO_FALLO } from "@/lib/diseno/para-coni"
import { resaltarFrases } from "@/lib/diseno/resaltado"
import { cifraDeRevision } from "@/lib/diseno/revision"
import { etiquetasDe } from "@/lib/dominio/etiquetas"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { aprobarGuionAccion, pedirCambiosAccion } from "../../piezas/acciones"
import { faltaParaFirmar } from "./falta-para-firmar"
import {
  TEXTO_CAMBIOS_TRAS_LA_VOZ,
  TEXTO_NO_PUDE_GRABAR,
  TEXTO_NO_PUDE_REHACER_VOZ,
  TEXTO_PEDIR_CAMBIOS,
  TEXTO_SIN_OBSERVACIONES,
  TEXTO_SIN_SALDO_VIDEO,
} from "./textos"
import { GrabarDeNuevo, VozParaFirmar } from "./voz-para-firmar"

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
  /** "jueves 16 de octubre · 19:00": when it would go out if she signs today. */
  salida: string | null
  explicacion: string | null
  /** The looks WAV lets her choose; empty means there is nothing to choose and the signature stays blocked. */
  avatares: AvatarParaElegir[]
  /** Her voice of this script and what the signature spends (design 2026-10-15, decisions 3 and 4). */
  grabacion: DatosDeGrabacion
  /** A toast the screen opens with: she just took a signature back. */
  avisoInicial: string | null
  /** The look stored on the piece (the one she signed with before an undo); preselected while it is still offered. */
  avatarGuardado: string | null
}

/** A provider's reason left on a script that has her voice, said by what failed: the video, or a new take. */
function enSusPalabras(explicacion: string): string {
  if (/\bHeyGen\b/i.test(explicacion)) return TEXTO_NO_PUDE_GRABAR
  if (/\bElevenLabs\b/i.test(explicacion)) return TEXTO_NO_PUDE_REHACER_VOZ
  return TEXTO_ALGO_FALLO
}

const TEXTO_AUN_SIN_AVATARES = "Aún no hay avatares. Cuando WAV los agregue, los eliges aquí."

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`
const idDeRevision = (indice: number) => `revision-${indice}`

/**
 * Gate 1 (design 2026-10-16, decision 9): she listens to her voice of the script, reads it with the review beside it,
 * edits it if she wants, picks the look (step 3) and signs once. The signature approves the script and the voice, and the video
 * starts after the undo window.
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
  const editor = useRef<HTMLDetailsElement>(null)
  const idSinCambios = useId()
  const idFalta = useId()
  const idConsecuencia = useId()

  const { grabacion } = datos
  const preparando = grabacion.estado === "grabando_voz"
  const bloqueos = revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const sinConfirmar = revision.filter(
    (hallazgo) => hallazgo.tipo === "advierte" && !confirmadas.has(claveDe(hallazgo)),
  )
  const sinAvatares = datos.avatares.length === 0
  const falta = faltaParaFirmar({
    sinGuardar,
    preparando,
    voz: grabacion.voz?.clave ?? null,
    escuchada,
    bloqueos: bloqueos.length,
    sinRevisar: sinConfirmar,
    sinAvatares,
    avatarElegido: avatarElegido !== null,
    bloqueoVideo: grabacion.botones?.bloqueoVideo ?? null,
  })
  const frases = revision.map((hallazgo) => hallazgo.frase ?? null)
  const { resaltadas } = resaltarFrases(datos.guion, frases)
  const marcadas = new Set(revision.filter((_, indice) => resaltadas.has(indice)))
  const errorDeAccion = aprobacion.error ?? cambios.error

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

  // A blocking finding's "Editar el guion": the disclosure opens where it is.
  function abrirEditor() {
    const detalles = editor.current
    if (!detalles) return
    detalles.open = true
    detalles.scrollIntoView({ block: "start" })
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
        <Volver href="/">Inicio</Volver>
        <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado">
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
                Si lo firmas hoy, sale el <b className="font-semibold text-tinta tabular-nums">{datos.salida}</b>
              </>
            }
          />
        ) : null}
      </header>

      {grabacion.voz && datos.explicacion ? (
        <Bloque tipo="aviso" className="mt-6">
          <ExplicacionParaConi texto={datos.explicacion} enSusPalabras={enSusPalabras(datos.explicacion)} />
        </Bloque>
      ) : null}

      <VozParaFirmar
        piezaId={datos.id}
        version={version}
        datos={grabacion}
        explicacion={grabacion.voz ? null : datos.explicacion}
        alEscuchar={setEscuchada}
        sinGuardar={sinGuardar}
      />

      <Seccion
        titulo="2. Revisa el guion"
        id="guion"
        cifra={cifraDeRevision([...bloqueos, ...sinConfirmar], revision.length, marcadas) ?? undefined}
      >
        {etiquetasDe(datos.guion).length > 0 ? (
          <p className="text-meta text-apagado">{AYUDA_DE_MARCAS_EN_LECTURA}</p>
        ) : null}
        <Panel>
          <GuionEnLectura guion={datos.guion} frases={frases} idDeRevision={idDeRevision} />
        </Panel>
        {revision.length === 0 ? (
          <p className="text-meta text-apagado">{TEXTO_SIN_OBSERVACIONES}</p>
        ) : (
          revision.map((hallazgo, indice) => (
            <MarcaRevision
              key={claveDe(hallazgo)}
              id={idDeRevision(indice)}
              hallazgo={hallazgo}
              confirmada={confirmadas.has(claveDe(hallazgo))}
              alCambiar={(confirmada) => alternarConfirmacion(hallazgo, confirmada)}
              fraseResaltada={resaltadas.has(indice)}
              alEditar={preparando ? undefined : abrirEditor}
            />
          ))
        )}
        <MasOpciones
          ref={editor}
          forma="boton"
          titulo="Editar el guion"
          icono={<PencilSimple aria-hidden="true" size={ICONO.medio} />}
          abiertaAlInicio={bloqueos.length > 0}
        >
          {preparando ? (
            <>
              {/* Her voice is being made of this text: it cannot change until the voice is back. */}
              <div className="grid gap-2">
                <p className="mx-0.5 text-meta font-semibold">Texto de la publicación</p>
                <Panel>
                  <p className="whitespace-pre-wrap text-cuerpo leading-prosa">{datos.texto}</p>
                </Panel>
              </div>
              <div className="grid gap-1.5">
                <Boton variante="secundario" deshabilitado aria-describedby={idSinCambios}>
                  Pedir cambios
                </Boton>
                <p id={idSinCambios} className="flex items-start gap-2 text-meta font-medium text-tinta">
                  <Info aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
                  {TEXTO_CAMBIOS_TRAS_LA_VOZ}
                </p>
              </div>
            </>
          ) : (
            <>
              <EditorDeGuion
                piezaId={datos.id}
                version={version}
                guion={datos.guion}
                texto={datos.texto}
                tieneVersionDeClaude={datos.tieneVersionDeClaude}
                alGuardar={alGuardar}
                alCambiarSinGuardar={setSinGuardar}
              />
              {grabacion.voz ? (
                <GrabarDeNuevo piezaId={datos.id} version={version} datos={grabacion} sinGuardar={sinGuardar} />
              ) : null}
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
                <div className="grid gap-1.5">
                  <Boton variante="secundario" onClick={() => setPidiendoCambios(true)}>
                    Pedir cambios
                  </Boton>
                  <p className="mx-0.5 text-meta text-apagado">{TEXTO_PEDIR_CAMBIOS}</p>
                </div>
              )}
            </>
          )}
        </MasOpciones>
      </Seccion>

      {/* Required to sign, so it is a step of its own and never folded. */}
      <Seccion titulo="3. Elige tu avatar" id="avatar">
        {sinAvatares ? (
          <p className="text-meta text-apagado">{TEXTO_AUN_SIN_AVATARES}</p>
        ) : (
          <ElegirAvatar avatares={datos.avatares} elegido={avatarElegido} alElegir={setAvatarElegido} />
        )}
      </Seccion>

      {/* Only what is optional: the LinkedIn text, read here and reviewed at gate 2. */}
      {datos.textoLinkedin !== null ? (
        <MasOpciones className="mt-8" titulo="Más opciones">
          <TextoLinkedinEnLectura texto={datos.textoLinkedin} />
        </MasOpciones>
      ) : null}

      {aviso ? <Aviso mensaje={aviso} alCerrar={cerrarAviso} lugar="arriba" /> : null}
      <BarraDeFirma
        idConsecuencia={idConsecuencia}
        consecuencia={grabacion.lineaDeFirma}
        arriba={
          <>
            {errorDeAccion ? <Bloque tipo="error" titulo={errorDeAccion} /> : null}
            {falta.tipo === "bloqueo" ? (
              <Bloque tipo="aviso">
                <ExplicacionParaConi id={idFalta} texto={falta.texto} enSusPalabras={TEXTO_SIN_SALDO_VIDEO} />
              </Bloque>
            ) : null}
            {falta.tipo === "falta" ? <LineaDeFalta id={idFalta} cosas={falta.cosas} /> : null}
          </>
        }
      >
        <DeslizarParaAprobar
          habilitado={falta.tipo === "nada"}
          enviando={aprobacion.pendiente}
          describidoPor={falta.tipo === "nada" ? idConsecuencia : `${idFalta} ${idConsecuencia}`}
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
