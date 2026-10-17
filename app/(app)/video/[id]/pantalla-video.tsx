"use client"

import { useCallback, useId, useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { MensajeDePrimeraVez } from "@/components/mensaje-primera-vez"
import { ReproductorVideo } from "@/components/reproductor-video"
import { Seccion } from "@/components/seccion"
import { TextoDeInstagram } from "@/components/texto-de-instagram"
import { Aviso } from "@/components/ui/aviso"
import { BarraDeFirma, LineaDeFalta, ResumenListo } from "@/components/ui/barra-de-firma"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { Eleccion } from "@/components/ui/filas"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Volver } from "@/components/ui/volver"
import { useAccion } from "@/components/use-accion"
import { type Destino, nombreDeDestinos } from "@/lib/dominio/destinos"
import { textoDeLinkedinDesdeInstagram } from "@/lib/dominio/linkedin"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import { type Hallazgo, hallazgosDeLaAprobacion, sinLinkedin } from "@/lib/dominio/revision"
import { marcarAvatarVistoAccion } from "../../ajustes/acciones"
import { aprobarVideoAccion, editarTextoLinkedinAccion, regrabarAccion } from "../../piezas/acciones"
import { ElegirDestinos } from "./elegir-destinos"
import { faltaParaFirmarVideo, LISTO_PARA_FIRMAR, resumenDeMasOpciones } from "./falta-para-firmar"
import { TextoLinkedin } from "./texto-linkedin"

export interface FechaPropuesta {
  /** UTC instant, ISO. This is what the action receives. */
  iso: string
  /** "jueves 8 de octubre · 19:00", in Chile time. */
  etiqueta: string
  /** "jueves 8 · 19:00", for the consequence under the track. */
  corta: string
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
  /** "US$ 2,40": what re-recording costs; null when the setup cannot say. */
  costoDeRegrabar: string | null
  explicacion: string | null
  /** She has never opened a ready video before: show "Así se ve tu avatar". */
  primeraVez: boolean
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

/**
 * Gate 2 (design 2026-10-16, decision 11): everything is on screen before the video ends, and the signature waits for
 * the full watch and her check. She reads what will be published, picks the date and slides.
 */
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
  const idFalta = useId()
  const idConsecuencia = useId()

  const conLinkedin = destinos.includes("linkedin")
  const conInstagram = destinos.includes("instagram")
  // The findings of the LinkedIn text are shown with it, and only count when LinkedIn is among the destinations.
  const revisionDelTexto = sinLinkedin(datos.revision)
  const revisionDeLinkedin = datos.revision.filter((hallazgo) => hallazgo.campo === "linkedin")
  const aplicables = hallazgosDeLaAprobacion(datos.revision, { linkedin: conLinkedin })
  const bloqueos = aplicables.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const sinConfirmar = aplicables.filter(
    (hallazgo) => hallazgo.tipo === "advierte" && !confirmadas.has(claveDe(hallazgo)),
  )
  const fechaElegida = datos.fechas.find((propuesta) => propuesta.iso === fecha)
  const falta = faltaParaFirmarVideo({
    visto,
    revisado,
    // A piece from before LinkedIn has no text for it yet: the one on screen is only a start until she saves it.
    linkedinSinGuardar: conLinkedin && datos.textoLinkedin === null,
    editando: editandoElTexto || editandoLinkedin,
    bloqueos: bloqueos.length,
    sinRevisar: sinConfirmar,
    hayFecha: fechaElegida !== undefined,
  })
  const errorDeAccion = aprobacion.error ?? regrabacion.error

  function alternarConfirmacion(hallazgo: Hallazgo, confirmada: boolean) {
    setConfirmadas((actuales) => {
      const siguientes = new Set(actuales)
      if (confirmada) siguientes.add(claveDe(hallazgo))
      else siguientes.delete(claveDe(hallazgo))
      return siguientes
    })
  }

  const panelDe = (hallazgo: Hallazgo) => (
    <MarcaRevision
      key={claveDe(hallazgo)}
      hallazgo={hallazgo}
      confirmada={confirmadas.has(claveDe(hallazgo))}
      alCambiar={(confirmada) => alternarConfirmacion(hallazgo, confirmada)}
    />
  )

  return (
    <div>
      <Volver href="/">Inicio</Volver>
      <div className="mt-3">
        <ReproductorVideo
          src={datos.videoUrl}
          clave={datos.videoId}
          alVerCompleto={() => setVisto(true)}
          zonas={zonas && conInstagram}
        />
      </div>

      <p className="mt-[18px] flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado">
        <span>{datos.pilar ? NOMBRE_DE_PILAR[datos.pilar] : null}</span>
        <span>{datos.segundos} s</span>
      </p>
      <h1 className="mt-1.5 text-pieza text-balance">{datos.titulo}</h1>
      {visto ? <LineaDeEstado tipo="exito" titulo="Lo viste completo" className="mt-3" /> : null}
      <div className="mt-3">
        <Casilla etiqueta="Revisé labios, nombre, subtítulos y cortes" marcada={revisado} alCambiar={setRevisado} />
      </div>

      {datos.primeraVez ? (
        <div className="mt-6">
          <MensajeDePrimeraVez marcar={marcarAvatarVistoAccion} />
        </div>
      ) : null}
      {datos.explicacion ? (
        <Bloque tipo="aviso" className="mt-6">
          {datos.explicacion}
        </Bloque>
      ) : null}

      {/* With LinkedIn among the destinations its text leads, as it will be published; the caption folds under it. */}
      {conLinkedin ? (
        <Seccion titulo="Así sale en LinkedIn" id="texto-linkedin">
          <TextoLinkedin
            piezaId={datos.id}
            version={datos.version}
            texto={datos.textoLinkedin ?? textoDeLinkedinDesdeInstagram(datos.texto)}
            guardado={datos.textoLinkedin !== null}
            alGuardar={editarTextoLinkedinAccion}
            alEditar={setEditandoLinkedin}
          />
          {datos.textoLinkedin !== null ? revisionDeLinkedin.map(panelDe) : null}
        </Seccion>
      ) : null}

      {conInstagram && conLinkedin ? (
        <MasOpciones className="mt-8" titulo="Así sale en Instagram">
          <TextoDeInstagram
            piezaId={datos.id}
            version={datos.version}
            texto={datos.texto}
            alEditar={setEditandoElTexto}
          />
        </MasOpciones>
      ) : conInstagram ? (
        <Seccion titulo="Así sale en Instagram" id="texto">
          <TextoDeInstagram
            piezaId={datos.id}
            version={datos.version}
            texto={datos.texto}
            alEditar={setEditandoElTexto}
          />
        </Seccion>
      ) : null}

      {revisionDelTexto.length > 0 ? (
        <Seccion titulo="Revisión" id="revision">
          {/* The caption findings count whatever the destinations: without Instagram its editor lives here. */}
          {conInstagram ? null : (
            <TextoDeInstagram
              piezaId={datos.id}
              version={datos.version}
              texto={datos.texto}
              alEditar={setEditandoElTexto}
            />
          )}
          {revisionDelTexto.map(panelDe)}
        </Seccion>
      ) : null}

      <Seccion titulo="Dónde y cuándo" id="fecha">
        {fechaElegida ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="grid">
                <span data-snapshot="varia" className="font-semibold tabular-nums">
                  {fechaElegida.etiqueta}
                </span>
                <span className="text-meta text-apagado">{nombreDeDestinos(destinos)} · hora de Chile</span>
              </span>
              <Boton
                variante="secundario"
                tamano="chico"
                aria-expanded={cambiandoFecha}
                onClick={() => setCambiandoFecha((actual) => !actual)}
              >
                {cambiandoFecha ? "Listo" : "Cambiar"}
              </Boton>
            </div>
            {cambiandoFecha ? (
              <fieldset className="elecciones grid border-0 p-0">
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

      <MasOpciones className="mt-8" titulo="Más opciones" resumen={resumenDeMasOpciones(destinos)}>
        <ElegirDestinos
          elegidos={destinos}
          instagramConectado={datos.instagramConectado}
          linkedinConectado={datos.linkedinConectado}
          alCambiar={setDestinos}
        />
        {conInstagram ? (
          <Boton variante="callado" aria-pressed={zonas} onClick={() => setZonas((actual) => !actual)}>
            {zonas ? "Ocultar" : "Ver"} zonas de Instagram
          </Boton>
        ) : null}
        {regrabando ? (
          <ConfirmacionEnLinea
            trato="destructivo"
            pregunta={`Se vuelve a grabar con tu avatar y este video se descarta.${
              datos.costoDeRegrabar ? ` Regrabar cuesta unos ${datos.costoDeRegrabar}.` : ""
            } ¿Seguro?`}
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
          <div className="grid gap-1.5">
            <Boton
              variante="secundario"
              tamano="chico"
              className="w-full"
              precio={datos.costoDeRegrabar ?? undefined}
              onClick={() => setRegrabando(true)}
            >
              Regrabar video
            </Boton>
            <p className="mx-0.5 text-meta text-apagado">Se vuelve a grabar con tu avatar y este video se descarta.</p>
          </div>
        )}
      </MasOpciones>

      {aviso ? <Aviso mensaje={aviso} alCerrar={cerrarAviso} lugar="arriba" /> : null}
      <BarraDeFirma
        idConsecuencia={idConsecuencia}
        consecuencia={fechaElegida ? `Sale el ${fechaElegida.corta}` : undefined}
        arriba={
          <>
            {errorDeAccion ? <Bloque tipo="error" titulo={errorDeAccion} /> : null}
            {falta.tipo === "bloqueo" ? (
              <Bloque tipo="aviso" id={idFalta}>
                {falta.texto}
              </Bloque>
            ) : null}
            {falta.tipo === "falta" ? <LineaDeFalta id={idFalta} cosas={falta.cosas} /> : null}
            {falta.tipo === "nada" ? <ResumenListo id={idFalta} cosas={LISTO_PARA_FIRMAR} /> : null}
          </>
        }
      >
        <DeslizarParaAprobar
          habilitado={falta.tipo === "nada"}
          enviando={aprobacion.pendiente}
          describidoPor={fechaElegida ? `${idFalta} ${idConsecuencia}` : idFalta}
          alFirmar={() => {
            if (fecha) aprobacion.ejecutar(() => aprobarVideoAccion(datos.id, datos.version, fecha, destinos))
          }}
        />
      </BarraDeFirma>
    </div>
  )
}
