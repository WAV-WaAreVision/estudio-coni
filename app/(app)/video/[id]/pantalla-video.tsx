"use client"

import { CaretLeft } from "@phosphor-icons/react"
import Link from "next/link"
import { useCallback, useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { MensajeDePrimeraVez } from "@/components/mensaje-primera-vez"
import { ReproductorVideo } from "@/components/reproductor-video"
import { Seccion } from "@/components/seccion"
import { TextoDeInstagram } from "@/components/texto-de-instagram"
import { Aviso } from "@/components/ui/aviso"
import { BarraDeFirma } from "@/components/ui/barra-de-firma"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { Eleccion } from "@/components/ui/filas"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { useAccion } from "@/components/use-accion"
import type { Destino } from "@/lib/dominio/destinos"
import { textoDeLinkedinDesdeInstagram } from "@/lib/dominio/linkedin"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import { type Hallazgo, hallazgosDeLaAprobacion, sinLinkedin } from "@/lib/dominio/revision"
import { marcarAvatarVistoAccion } from "../../ajustes/acciones"
import { aprobarVideoAccion, editarTextoLinkedinAccion, regrabarAccion } from "../../piezas/acciones"
import { ElegirDestinos } from "./elegir-destinos"
import { TextoLinkedin } from "./texto-linkedin"

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
  /** Null for a piece from before LinkedIn, or one the writer gave none: the screen starts it from the caption. */
  textoLinkedin: string | null
  /** The destinations ticked when she opens the screen: what Ajustes says. */
  destinosPorDefecto: Destino[]
  instagramConectado: boolean
  linkedinConectado: boolean
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
  const [editandoElTexto, setEditandoElTexto] = useState(false)
  const [editandoLinkedin, setEditandoLinkedin] = useState(false)
  const [destinos, setDestinos] = useState<Destino[]>(datos.destinosPorDefecto)
  const [fecha, setFecha] = useState(datos.fechas[0]?.iso ?? null)
  const [cambiandoFecha, setCambiandoFecha] = useState(false)
  const [regrabando, setRegrabando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  // Stable, so a re-render while the toast is up does not restart its 8 s.
  const cerrarAviso = useCallback(() => setAviso(null), [])
  const aprobacion = useAccion()
  const regrabacion = useAccion()

  const conLinkedin = destinos.includes("linkedin")
  // The findings of the LinkedIn text are shown with it, and only count when LinkedIn is among the destinations.
  const revisionDelTexto = sinLinkedin(datos.revision)
  const revisionDeLinkedin = datos.revision.filter((hallazgo) => hallazgo.campo === "linkedin")
  const aplicables = hallazgosDeLaAprobacion(datos.revision, { linkedin: conLinkedin })
  const bloqueos = aplicables.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const advertencias = aplicables.filter((hallazgo) => hallazgo.tipo === "advierte")
  // A piece from before LinkedIn has no text for it yet: the one on screen is only a start until she saves it.
  const linkedinSinGuardar = conLinkedin && datos.textoLinkedin === null
  const sinConfirmar = advertencias.filter((hallazgo) => !confirmadas.has(claveDe(hallazgo)))
  const fechaElegida = datos.fechas.find((propuesta) => propuesta.iso === fecha)

  const motivo = !visto
    ? "Se activa al terminar de verlo."
    : linkedinSinGuardar
      ? "Guarda el texto para LinkedIn."
      : editandoElTexto || editandoLinkedin
        ? "Guarda o cancela la edición del texto."
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
    <div className="pb-[calc(var(--barra-max)+env(safe-area-inset-bottom))]">
      <Link href="/" className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta">
        <CaretLeft aria-hidden="true" size={ICONO.medio} />
        Inicio
      </Link>
      <div className="mt-2">
        <ReproductorVideo
          src={datos.videoUrl}
          clave={datos.videoId}
          alVerCompleto={() => setVisto(true)}
          zonas={zonas}
        />
      </div>

      <header className="mt-4 grid gap-3">
        <p className="flex items-baseline justify-between gap-4 text-meta text-apagado">
          <span>{datos.pilar ? NOMBRE_DE_PILAR[datos.pilar] : null}</span>
          <span>{datos.segundos} s</span>
        </p>
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
        {visto ? (
          <LineaDeEstado tipo="exito" titulo="Lo viste completo" />
        ) : (
          <LineaDeEstado tipo="neutro" titulo="Míralo completo para aprobar" tituloEnTinta />
        )}
        <Boton variante="callado" tamano="chico" aria-pressed={zonas} onClick={() => setZonas((actual) => !actual)}>
          {zonas ? "Ocultar" : "Ver"} zonas de Instagram
        </Boton>
      </header>

      {datos.primeraVez ? (
        <div className="mt-6">
          <MensajeDePrimeraVez marcar={marcarAvatarVistoAccion} />
        </div>
      ) : null}

      {datos.explicacion ? (
        <div className="mt-6">
          <LineaDeEstado tipo="aviso" titulo={datos.explicacion} tituloEnTinta />
        </div>
      ) : null}

      {visto ? (
        <>
          <Seccion titulo="Antes de aprobar" id="antes">
            <Casilla etiqueta="Revisé labios, nombre, subtítulos y cortes" marcada={revisado} alCambiar={setRevisado} />
          </Seccion>

          <Seccion titulo="Dónde se publica" id="destinos">
            <ElegirDestinos
              elegidos={destinos}
              instagramConectado={datos.instagramConectado}
              linkedinConectado={datos.linkedinConectado}
              alCambiar={setDestinos}
            />
          </Seccion>

          <Seccion titulo="Así sale en Instagram" id="texto">
            <TextoDeInstagram
              piezaId={datos.id}
              version={datos.version}
              texto={datos.texto}
              alEditar={setEditandoElTexto}
            />
          </Seccion>

          {conLinkedin ? (
            <Seccion titulo="Texto para LinkedIn" id="texto-linkedin">
              <TextoLinkedin
                piezaId={datos.id}
                version={datos.version}
                texto={datos.textoLinkedin ?? textoDeLinkedinDesdeInstagram(datos.texto)}
                guardado={datos.textoLinkedin !== null}
                alGuardar={editarTextoLinkedinAccion}
                alEditar={setEditandoLinkedin}
              />
              {datos.textoLinkedin !== null && revisionDeLinkedin.length > 0 ? (
                <div className="mt-2 grid gap-4">
                  {revisionDeLinkedin.map((hallazgo) => (
                    <MarcaRevision
                      key={claveDe(hallazgo)}
                      hallazgo={hallazgo}
                      confirmada={confirmadas.has(claveDe(hallazgo))}
                      alCambiar={(confirmada) => alternarConfirmacion(hallazgo, confirmada)}
                    />
                  ))}
                </div>
              ) : null}
            </Seccion>
          ) : null}

          {revisionDelTexto.length > 0 ? (
            <Seccion titulo="Revisión" id="revision">
              <div className="grid gap-4">
                {revisionDelTexto.map((hallazgo) => (
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
              <div className="grid gap-1">
                <div className="flex min-h-14 items-center justify-between gap-3 border-b border-linea">
                  <span className="text-cuerpo font-semibold">{fechaElegida.etiqueta}</span>
                  <Boton
                    variante="callado"
                    tamano="chico"
                    aria-expanded={cambiandoFecha}
                    className="w-auto"
                    onClick={() => setCambiandoFecha((actual) => !actual)}
                  >
                    {cambiandoFecha ? "Listo" : "Cambiar"}
                  </Boton>
                </div>
                <p className="text-meta text-apagado">Hora de Chile · próximo horario libre</p>
                {cambiandoFecha ? (
                  <fieldset className="mt-2 grid border-0 p-0">
                    <legend className="sr-only">Elige cuándo sale</legend>
                    {datos.fechas.map((propuesta) => (
                      <Eleccion
                        key={propuesta.iso}
                        nombre="fecha"
                        valor={propuesta.iso}
                        elegido={propuesta.iso === fecha}
                        etiqueta={propuesta.etiqueta}
                        alElegir={setFecha}
                      />
                    ))}
                  </fieldset>
                ) : null}
              </div>
            ) : (
              <p className="text-cuerpo text-apagado">No hay un horario libre en los próximos días.</p>
            )}
          </Seccion>
        </>
      ) : (
        <p className="mt-10 text-cuerpo text-apagado">Cuando termine el video aparece lo que falta para aprobarlo.</p>
      )}

      <div className="mt-10 grid gap-2">
        {regrabando ? (
          <ConfirmacionEnLinea
            trato="destructivo"
            pregunta={`Se vuelve a grabar con tu avatar y este video se descarta. ${datos.costoDeRegrabar ?? ""} ¿Seguro?`}
            confirmar="Sí, regrabar"
            volver="Volver"
            cargando={regrabacion.pendiente}
            alConfirmar={() =>
              regrabacion.ejecutar(
                () => regrabarAccion(datos.id, datos.version),
                (r) => setAviso(r.advertencia ?? null),
              )
            }
            alVolver={() => setRegrabando(false)}
          />
        ) : (
          <Boton variante="destructiva" onClick={() => setRegrabando(true)}>
            Regrabar
          </Boton>
        )}
      </div>

      <BarraDeFirma etiqueta="Firma">
        {aprobacion.error || regrabacion.error ? (
          <LineaDeEstado tipo="error" titulo={aprobacion.error ?? regrabacion.error} />
        ) : null}
        <DeslizarParaAprobar
          etiqueta="Desliza para aprobar video y fecha"
          habilitado={habilitado}
          motivo={motivo}
          enviando={aprobacion.pendiente}
          alAprobar={() => {
            if (fecha) aprobacion.ejecutar(() => aprobarVideoAccion(datos.id, datos.version, fecha, destinos))
          }}
        />
      </BarraDeFirma>
      {aviso ? <Aviso mensaje={aviso} alCerrar={cerrarAviso} sobreBarra /> : null}
    </div>
  )
}
