"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { MensajeDePrimeraVez } from "@/components/mensaje-primera-vez"
import { ReproductorVideo } from "@/components/reproductor-video"
import { Seccion } from "@/components/seccion"
import { TextoDeInstagram } from "@/components/texto-de-instagram"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { PildoraPilar } from "@/components/ui/pildora-pilar"
import { useAccion } from "@/components/use-accion"
import type { Pilar } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { marcarAvatarVistoAccion } from "../../ajustes/acciones"
import { aprobarVideoAccion, regrabarAccion } from "../../piezas/acciones"

export interface FechaPropuesta {
  /** UTC instant, ISO. This is what the action receives. */
  iso: string
  /** "jueves 8 de octubre · 19:00", in Chile time. */
  etiqueta: string
}

export interface DatosDeVideo {
  id: string
  version: number
  titulo: string
  pilar: Pilar | null
  segundos: number
  texto: string
  revision: Hallazgo[]
  videoUrl: string | null
  videoId: string
  fechas: FechaPropuesta[]
  /** "Regrabar cuesta unos US$ 2,40"; null when the setup cannot say. */
  costoDeRegrabar: string | null
  explicacion: string | null
  /** She has never opened a ready video before: show "Así se ve tu avatar". */
  primeraVez: boolean
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

/** Gate 2: she watches the video as it will look, checks it, picks the date and slides. */
export function PantallaVideo({ datos }: { datos: DatosDeVideo }) {
  const [visto, setVisto] = useState(false)
  const [zonas, setZonas] = useState(false)
  const [revisado, setRevisado] = useState(false)
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  const [fecha, setFecha] = useState(datos.fechas[0]?.iso ?? null)
  const [cambiandoFecha, setCambiandoFecha] = useState(false)
  const [regrabando, setRegrabando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const aprobacion = useAccion()
  const regrabacion = useAccion()

  const bloqueos = datos.revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const advertencias = datos.revision.filter((hallazgo) => hallazgo.tipo === "advierte")
  const sinConfirmar = advertencias.filter((hallazgo) => !confirmadas.has(claveDe(hallazgo)))
  const fechaElegida = datos.fechas.find((propuesta) => propuesta.iso === fecha)

  const motivo = !visto
    ? "Se activa al terminar de verlo."
    : bloqueos.length > 0
      ? "Hay algo que corregir antes de aprobar."
      : !revisado
        ? "Marca lo que revisaste."
        : sinConfirmar.length > 0
          ? "Confirma la revisión."
          : !fechaElegida
            ? "No hay un horario libre. Avísale a Federico."
            : undefined
  const habilitado = motivo === undefined

  function alternarConfirmacion(hallazgo: Hallazgo, confirmada: boolean) {
    setConfirmadas((actuales) => {
      const siguientes = new Set(actuales)
      if (confirmada) siguientes.add(claveDe(hallazgo))
      else siguientes.delete(claveDe(hallazgo))
      return siguientes
    })
  }

  return (
    <div className="grid gap-4.5">
      <header className="grid gap-1.5">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-label font-semibold text-acento"
        >
          <ChevronLeft aria-hidden="true" size={20} />
          Inicio
        </Link>
        <p className="text-meta text-apagado">Video por aprobar</p>
        <h1 className="font-serif text-title text-balance">{datos.titulo}</h1>
        <div className="flex flex-wrap gap-1.5">
          {datos.pilar ? <PildoraPilar pilar={datos.pilar} /> : null}
          <span className="inline-flex items-center rounded-full bg-hundido px-2.5 py-1.5 text-label font-semibold">
            {datos.segundos} s
          </span>
        </div>
      </header>

      {datos.primeraVez ? <MensajeDePrimeraVez marcar={marcarAvatarVistoAccion} /> : null}

      {datos.explicacion ? (
        <p role="alert" className="rounded-lg bg-aviso-fondo p-4 text-[1.0625rem] text-aviso-tinta">
          {datos.explicacion}
        </p>
      ) : null}

      <div className="-mx-4.5">
        <ReproductorVideo
          src={datos.videoUrl}
          clave={datos.videoId}
          alVerCompleto={() => setVisto(true)}
          zonas={zonas}
        />
      </div>

      <p className="flex flex-wrap items-center justify-between gap-2 text-meta text-apagado">
        <span>
          {visto ? <b className="font-semibold text-tinta">Lo viste completo</b> : "Míralo completo para aprobar"}
        </span>
        <button
          type="button"
          aria-pressed={zonas}
          className="min-h-11 text-label font-semibold text-acento"
          onClick={() => setZonas((actual) => !actual)}
        >
          {zonas ? "Ocultar" : "Ver"} zonas de Instagram
        </button>
      </p>

      {visto ? (
        <div className="-mx-4.5 grid gap-5.5 rounded-t-xl bg-superficie px-4.5 py-5 shadow-flotante">
          <Seccion titulo="Antes de aprobar" id="antes">
            <label className="grid min-h-11 cursor-pointer grid-cols-[26px_1fr] items-center gap-2.5">
              <input
                type="checkbox"
                className="size-6 accent-acento"
                checked={revisado}
                onChange={(evento) => setRevisado(evento.target.checked)}
              />
              <span>Revisé labios, nombre, subtítulos y cortes</span>
            </label>
          </Seccion>

          <Seccion titulo="Así sale en Instagram" id="texto">
            <TextoDeInstagram piezaId={datos.id} version={datos.version} texto={datos.texto} />
          </Seccion>

          {datos.revision.length > 0 ? (
            <Seccion titulo="Revisión" id="revision">
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
          ) : null}

          <Seccion titulo="Fecha de publicación" id="fecha">
            {fechaElegida ? (
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
                <span className="text-body font-semibold">{fechaElegida.etiqueta}</span>
                <button
                  type="button"
                  aria-expanded={cambiandoFecha}
                  className="min-h-11 text-label font-semibold text-acento"
                  onClick={() => setCambiandoFecha((actual) => !actual)}
                >
                  {cambiandoFecha ? "Listo" : "Cambiar"}
                </button>
                <span className="text-meta text-apagado">Hora de Chile · próximo horario libre</span>
                {cambiandoFecha ? (
                  <fieldset className="col-span-2 mt-2 grid gap-2 border-0 p-0">
                    <legend className="sr-only">Elige cuándo sale</legend>
                    {datos.fechas.map((propuesta) => (
                      <label
                        key={propuesta.iso}
                        className="grid min-h-12 cursor-pointer grid-cols-[24px_1fr] items-center gap-2.5 rounded-sm border border-linea bg-superficie px-3 py-2 text-[1.0625rem]"
                      >
                        <input
                          type="radio"
                          name="fecha"
                          className="size-5 accent-acento"
                          checked={propuesta.iso === fecha}
                          onChange={() => setFecha(propuesta.iso)}
                        />
                        <span>{propuesta.etiqueta}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
              </div>
            ) : (
              <p className="text-apagado">No hay un horario libre en los próximos días.</p>
            )}
          </Seccion>
        </div>
      ) : (
        <p className="text-[1.0625rem] text-apagado">Cuando termine el video aparece lo que falta para aprobarlo.</p>
      )}

      <div className="sticky bottom-0 -mx-4.5 -mb-6 grid gap-2 border-t border-linea bg-superficie px-4.5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-flotante">
        {aprobacion.error || regrabacion.error ? (
          <p role="alert" className="rounded-md bg-error-fondo p-3 text-[1rem] text-error-tinta">
            {aprobacion.error ?? regrabacion.error}
          </p>
        ) : null}
        {regrabando ? (
          <div className="grid gap-2 rounded-md bg-acento-suave p-3.5">
            <p className="text-[1rem]">
              Se vuelve a grabar con tu avatar y este video se descarta. {datos.costoDeRegrabar ?? ""} ¿Seguro?
            </p>
            <Boton
              cargando={regrabacion.pendiente}
              onClick={() =>
                regrabacion.ejecutar(
                  () => regrabarAccion(datos.id, datos.version),
                  (r) => setAviso(r.advertencia ?? null),
                )
              }
            >
              Sí, regrabar
            </Boton>
            <Boton variante="callado" onClick={() => setRegrabando(false)}>
              Volver
            </Boton>
          </div>
        ) : (
          <>
            <DeslizarParaAprobar
              etiqueta="Desliza para aprobar video y fecha"
              habilitado={habilitado}
              motivo={motivo}
              enviando={aprobacion.pendiente}
              alAprobar={() => {
                if (fecha) aprobacion.ejecutar(() => aprobarVideoAccion(datos.id, datos.version, fecha))
              }}
            />
            <Boton variante="callado" onClick={() => setRegrabando(true)}>
              Regrabar
            </Boton>
          </>
        )}
      </div>
      {aviso ? <Aviso mensaje={aviso} alCerrar={() => setAviso(null)} /> : null}
    </div>
  )
}
