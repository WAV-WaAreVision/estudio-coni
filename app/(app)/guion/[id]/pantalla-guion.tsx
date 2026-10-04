"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { EditorDeGuion, type GuionGuardado } from "@/components/editor-de-guion"
import { type AvatarParaElegir, ElegirAvatar } from "@/components/elegir-avatar"
import { Nota } from "@/components/nota"
import { Seccion } from "@/components/seccion"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { PildoraPilar } from "@/components/ui/pildora-pilar"
import { useAccion } from "@/components/use-accion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import type { Pilar } from "@/lib/dominio/pilares"
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
  const grabandoVoz = datos.grabacion?.estado === "grabando_voz"
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
    <div className="grid gap-5.5">
      <header
        data-pilar={datos.pilar ?? undefined}
        className="-mx-4.5 -mt-4 grid gap-2.5 bg-pilar-tinte px-4.5 pt-2 pb-5.5"
      >
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-label font-semibold text-acento"
        >
          <ChevronLeft aria-hidden="true" size={20} />
          Inicio
        </Link>
        <h1 className="font-serif text-display text-balance">{datos.titulo}</h1>
        <div className="flex flex-wrap gap-1.5">
          {datos.pilar ? <PildoraPilar pilar={datos.pilar} /> : null}
          <span className="inline-flex items-center rounded-full bg-superficie px-2.5 py-1.5 text-label font-semibold text-tinta">
            {datos.formato ? `${datos.formato} · ` : ""}
            {datos.segundos} s
          </span>
        </div>
        {datos.salida && !datos.grabacion ? (
          <p className="w-fit rounded-md bg-superficie px-3 py-2 text-label font-semibold text-acento">
            Si lo apruebas hoy, sale el {datos.salida}
          </p>
        ) : null}
      </header>

      {datos.explicacion ? (
        <p role="alert" className="rounded-lg bg-aviso-fondo p-4 text-[1.0625rem] text-aviso-tinta">
          {datos.explicacion}
        </p>
      ) : null}

      <Seccion titulo="El guion" id="guion">
        {datos.grabacion ? (
          <>
            <p className="whitespace-pre-wrap text-[1.0625rem]">{datos.guion}</p>
            <p className="whitespace-pre-wrap text-apagado">{datos.texto}</p>
            {grabandoVoz ? (
              <Nota tipo="ocupada" titulo="Estoy grabando tu voz">
                <p>Tarda unos segundos.</p>
              </Nota>
            ) : null}
            {/* What the bar records is what she approved: changing it means taking the approval back first. */}
            <p className="text-meta text-apagado">Para cambiar el guion o el texto, vuelve a revisar el guion.</p>
          </>
        ) : (
          <EditorDeGuion
            piezaId={datos.id}
            version={version}
            guion={datos.guion}
            texto={datos.texto}
            tieneVersionDeClaude={datos.tieneVersionDeClaude}
            alGuardar={alGuardar}
            alCambiarSinGuardar={setSinGuardar}
          />
        )}
      </Seccion>

      <Seccion titulo="Avatar" id="avatar">
        {datos.grabacion ? (
          <p>{datos.avatarElegido ?? "El avatar que elegiste"}</p>
        ) : (
          <ElegirAvatar avatares={datos.avatares} elegido={avatarElegido} alElegir={setAvatarElegido} />
        )}
      </Seccion>

      {datos.grabacion ? null : (
        <Seccion titulo="Revisión" id="revision">
          <p className="text-apagado">
            {revision.length === 0
              ? "Claude revisó el guion y no encontró observaciones. Tú decides."
              : "Claude revisó el guion. Tú decides."}
          </p>
          <div className="grid gap-2.5">
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

      {datos.grabacion ? (
        // The server's version, not the screen's own: the screen refreshes by itself while the voice is recorded and
        // its saved version only follows her own edits, so it would be stale after the voice is ready.
        <BarraDeGrabacion piezaId={datos.id} version={datos.version} datos={datos.grabacion} />
      ) : (
        <div className="sticky bottom-0 -mx-4.5 -mb-6 grid gap-2 border-t border-linea bg-superficie px-4.5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-flotante">
          {aprobacion.error || cambios.error ? (
            <p role="alert" className="rounded-md bg-error-fondo p-3 text-[1rem] text-error-tinta">
              {aprobacion.error ?? cambios.error}
            </p>
          ) : null}
          {pidiendoCambios ? (
            <div className="grid gap-2 rounded-md bg-acento-suave p-3.5">
              <p className="text-[1rem]">Se escribe un guion nuevo y este se descarta. ¿Seguro?</p>
              <Boton
                cargando={cambios.pendiente}
                onClick={() =>
                  cambios.ejecutar(
                    () => pedirCambiosAccion(datos.id, version),
                    (r) => setAviso(r.advertencia ?? null),
                  )
                }
              >
                Sí, pedir cambios
              </Boton>
              <Boton variante="callado" onClick={() => setPidiendoCambios(false)}>
                Volver
              </Boton>
            </div>
          ) : (
            <>
              <DeslizarParaAprobar
                etiqueta="Desliza para aprobar el guion"
                habilitado={habilitado}
                motivo={motivo}
                enviando={aprobacion.pendiente}
                alAprobar={() => aprobacion.ejecutar(() => aprobarGuionAccion(datos.id, version, avatarElegido))}
              />
              <p className="text-center text-meta text-apagado">
                Aprobar no gasta nada. Después grabas la voz y el video.
              </p>
              <Boton variante="callado" onClick={() => setPidiendoCambios(true)}>
                Pedir cambios
              </Boton>
            </>
          )}
        </div>
      )}
      {aviso ? <Aviso mensaje={aviso} alCerrar={() => setAviso(null)} /> : null}
    </div>
  )
}
