"use client"

import { CaretLeft } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"
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
import { contarPalabras } from "@/lib/dominio/duracion"
import { etiquetasDe } from "@/lib/dominio/etiquetas"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { aprobarGuionAccion, pedirCambiosAccion } from "../../piezas/acciones"
import { BarraDeGrabacion } from "./barra-de-grabacion"

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
  /** Set once gate 1 is signed: the voice and video bar replaces the approve bar. */
  grabacion: DatosDeGrabacion | null
  /** The name of the approved look, shown instead of the chooser once gate 1 is signed. */
  avatarElegido: string | null
  explicacion: string | null
  /** The looks WAV lets her choose; empty means there is nothing to choose and the approval stays blocked. */
  avatares: AvatarParaElegir[]
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

/** Gate 1: she reads and edits the script, confirms what the review flagged, and slides. The voice comes after, in the video. */
export function PantallaGuion({ datos }: { datos: DatosDeGuion }) {
  const [version, setVersion] = useState(datos.version)
  const [revision, setRevision] = useState(datos.revision)
  const [sinGuardar, setSinGuardar] = useState(false)
  const [avatarElegido, setAvatarElegido] = useState<string | null>(null)
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  const [pidiendoCambios, setPidiendoCambios] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const aprobacion = useAccion()
  const cambios = useAccion()

  const bloqueos = revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const advertencias = revision.filter((hallazgo) => hallazgo.tipo === "advierte")
  const sinConfirmar = advertencias.filter((hallazgo) => !confirmadas.has(claveDe(hallazgo)))

  const sinAvatares = datos.avatares.length === 0
  const faltan = [
    ...(avatarElegido === null && !sinAvatares ? ["elegir el avatar"] : []),
    ...(sinConfirmar.length > 0 ? ["confirmar la revisión"] : []),
  ]
  const faltaTexto = faltan.length > 1 ? `${faltan.slice(0, -1).join(", ")} y ${faltan.at(-1)}` : faltan.join("")
  const motivo = sinGuardar
    ? "Guarda tus cambios antes de aprobar"
    : bloqueos.length > 0
      ? "Hay algo que corregir antes de aprobar."
      : sinAvatares
        ? "Todavía no hay avatares para elegir."
        : faltan.length > 0
          ? `Falta ${faltaTexto}.`
          : undefined
  const habilitado = motivo === undefined

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

  return (
    <div className={datos.grabacion ? undefined : "pb-[calc(var(--barra-max)+env(safe-area-inset-bottom))]"}>
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
        {datos.salida && !datos.grabacion ? (
          <LineaDeEstado
            tipo="fecha"
            titulo={
              <>
                Si lo apruebas hoy, sale el{" "}
                <span className="font-semibold whitespace-nowrap text-firma tabular-nums">{datos.salida}</span>
              </>
            }
            tituloEnTinta
            detalle="Después grabas la voz y el video."
          />
        ) : null}
      </header>

      {datos.explicacion ? (
        <div className="mt-6">
          <LineaDeEstado tipo="aviso" titulo={datos.explicacion} tituloEnTinta />
        </div>
      ) : null}

      {datos.grabacion ? (
        // The server's version, not the screen's own: the screen refreshes by itself while the voice is recorded and
        // its saved version only follows her own edits, so it would be stale after the voice is ready.
        <BarraDeGrabacion piezaId={datos.id} version={datos.version} datos={datos.grabacion}>
          <Seccion titulo="Guion" id="guion" cifra={`${contarPalabras(datos.guion)} palabras · ≈ ${datos.segundos} s`}>
            <GuionEnLectura guion={datos.guion} />
            {etiquetasDe(datos.guion).length > 0 ? <p className="text-meta text-apagado">{AYUDA_DE_MARCAS}</p> : null}
          </Seccion>
          <Seccion
            titulo="Texto de la publicación"
            id="texto"
            cifra={`${[...datos.texto].length.toLocaleString("es-CL")} de 2.200`}
          >
            <p className="whitespace-pre-wrap text-cuerpo leading-prosa">{datos.texto}</p>
            {/* What the bar records is what she approved: changing it means taking the approval back first. */}
            <p className="text-meta text-apagado">Para cambiar el guion o el texto, vuelve a revisar el guion.</p>
          </Seccion>
          {datos.textoLinkedin !== null ? <TextoLinkedinEnLectura texto={datos.textoLinkedin} /> : null}
          <Seccion titulo="Avatar" id="avatar">
            <p className="text-cuerpo font-semibold">{datos.avatarElegido ?? "El avatar que elegiste"}</p>
          </Seccion>
        </BarraDeGrabacion>
      ) : (
        <>
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
          {datos.textoLinkedin !== null ? <TextoLinkedinEnLectura texto={datos.textoLinkedin} /> : null}
          <Seccion titulo="Avatar" id="avatar">
            <ElegirAvatar avatares={datos.avatares} elegido={avatarElegido} alElegir={setAvatarElegido} />
          </Seccion>
        </>
      )}

      {datos.grabacion ? null : (
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
      )}

      {datos.grabacion ? null : (
        <>
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
              <Boton variante="destructiva" onClick={() => setPidiendoCambios(true)}>
                Pedir cambios
              </Boton>
            )}
          </div>
          <BarraDeFirma etiqueta="Firma">
            {aprobacion.error || cambios.error ? (
              <LineaDeEstado tipo="error" titulo={aprobacion.error ?? cambios.error} />
            ) : null}
            <DeslizarParaAprobar
              etiqueta="Desliza para aprobar el guion"
              habilitado={habilitado}
              motivo={motivo}
              nota="Aprobar no gasta nada."
              enviando={aprobacion.pendiente}
              alAprobar={() => aprobacion.ejecutar(() => aprobarGuionAccion(datos.id, version, avatarElegido))}
            />
          </BarraDeFirma>
        </>
      )}
      {aviso ? <Aviso mensaje={aviso} alCerrar={() => setAviso(null)} sobreBarra /> : null}
    </div>
  )
}
