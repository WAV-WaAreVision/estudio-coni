"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { ReproductorVoz } from "@/components/reproductor-voz"
import { Seccion } from "@/components/seccion"
import { TextoDeInstagram } from "@/components/texto-de-instagram"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { PildoraPilar } from "@/components/ui/pildora-pilar"
import { useAccion } from "@/components/use-accion"
import type { Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { aprobarGuionAccion, pedirCambiosAccion } from "../../piezas/acciones"

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
  audioUrl: string | null
  audioId: string
  /** "jueves 16 de octubre · 19:00": when it would go out if she approves today. */
  salida: string | null
  /** "Grabar cuesta unos US$ 2,40 · te quedan US$ 37,00 este mes". */
  costo: string | null
  explicacion: string | null
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

/** Gate 1: she reads the script as a letter, hears the voice, confirms what the review flagged, and slides. */
export function PantallaGuion({ datos }: { datos: DatosDeGuion }) {
  const [escuchada, setEscuchada] = useState(false)
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  const [pidiendoCambios, setPidiendoCambios] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const aprobacion = useAccion()
  const cambios = useAccion()

  const bloqueos = datos.revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const advertencias = datos.revision.filter((hallazgo) => hallazgo.tipo === "advierte")
  const sinConfirmar = advertencias.filter((hallazgo) => !confirmadas.has(claveDe(hallazgo)))

  const faltan = [
    ...(escuchada ? [] : ["escuchar la voz"]),
    ...(sinConfirmar.length > 0 ? ["confirmar la revisión"] : []),
  ]
  const motivo =
    bloqueos.length > 0
      ? "Hay algo que corregir antes de aprobar."
      : faltan.length > 0
        ? `Falta ${faltan.join(" y ")}.`
        : undefined
  const habilitado = motivo === undefined
  const parrafos = datos.guion.split(/\n{2,}/).filter((parrafo) => parrafo.trim() !== "")

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
        {datos.salida ? (
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

      <article
        data-pilar={datos.pilar ?? undefined}
        aria-label="El guion"
        className="grid gap-3.5 rounded-lg bg-pilar-tinte px-5 py-5.5 font-serif text-script"
      >
        {parrafos.map((parrafo) => (
          <p key={parrafo}>{parrafo}</p>
        ))}
      </article>

      <Seccion titulo="Voz" id="voz">
        <ReproductorVoz src={datos.audioUrl} clave={datos.audioId} alEscuchar={() => setEscuchada(true)} />
      </Seccion>

      <Seccion titulo="Así sale en Instagram" id="texto">
        <TextoDeInstagram piezaId={datos.id} version={datos.version} texto={datos.texto} />
      </Seccion>

      <Seccion titulo="Revisión" id="revision">
        <p className="text-apagado">
          {datos.revision.length === 0
            ? "Claude revisó el guion y no encontró observaciones. Tú decides."
            : "Claude revisó el guion. Tú decides."}
        </p>
        <div className="grid gap-2.5">
          {datos.revision.map((hallazgo) => (
            <MarcaRevision
              key={claveDe(hallazgo)}
              hallazgo={hallazgo}
              confirmada={confirmadas.has(claveDe(hallazgo))}
              alCambiar={(confirmada) => alternarConfirmacion(hallazgo, confirmada)}
            />
          ))}
        </div>
      </Seccion>

      <div className="sticky bottom-0 -mx-4.5 -mb-6 grid gap-2 border-t border-linea bg-superficie px-4.5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-flotante">
        {datos.costo ? <p className="text-center text-meta text-apagado">{datos.costo}</p> : null}
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
                  () => pedirCambiosAccion(datos.id, datos.version),
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
              etiqueta="Desliza para aprobar y grabar"
              habilitado={habilitado}
              motivo={motivo}
              enviando={aprobacion.pendiente}
              alAprobar={() =>
                aprobacion.ejecutar(
                  () => aprobarGuionAccion(datos.id, datos.version),
                  (r) => setAviso(r.advertencia ?? null),
                )
              }
            />
            <Boton variante="callado" onClick={() => setPidiendoCambios(true)}>
              Pedir cambios
            </Boton>
          </>
        )}
      </div>
      {aviso ? <Aviso mensaje={aviso} alCerrar={() => setAviso(null)} /> : null}
    </div>
  )
}
