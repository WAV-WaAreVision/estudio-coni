import { House } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { ICONO } from "@/components/ui/icono"
import { tieneVersionDeClaude } from "@/lib/acciones/guion"
import { urlParaVer } from "@/lib/acciones/medios"
import { ocupadasEnLaPuerta, propuestaVigente } from "@/lib/calendario/propuestas"
import { leerAvisoAFederico } from "@/lib/datos/aviso-a-federico"
import { leerDatosDeGrabacion, vozVigente } from "@/lib/datos/grabacion"
import { leerAvataresElegibles, leerContextoDeFechas, leerPantallaDePieza } from "@/lib/datos/pantallas"
import { leerPausasAbiertas } from "@/lib/datos/pausas"
import { piezaDesdeFila } from "@/lib/datos/piezas"
import { leerPilares } from "@/lib/datos/pilares"
import { leerProduccion } from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { leerRevision } from "@/lib/datos/revision"
import { fallaParaFederico, ocurrenciaDePieza } from "@/lib/dominio/avisar-a-federico"
import { piezaTrabajando } from "@/lib/dominio/estados"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import { lineaDeFuente } from "@/lib/dominio/fuente"
import { explicacionAnteLaPausa, textoDePausa } from "@/lib/dominio/pausas"
import { angulosDelPilar, pilarVisible } from "@/lib/dominio/pilares"
import { sinLinkedin } from "@/lib/dominio/revision"
import { lineaDeSaldoVideo } from "@/lib/dominio/saldos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { leerSaldos } from "@/lib/saldos/reales"
import { exigirConi } from "@/lib/sesion/coni"
import { AccionesDeEstado } from "../../estado-de-pieza"
import { cambiarAnguloAccion } from "../../ideas/acciones"
import { ElegirAngulo } from "../../ideas/elegir-angulo"
import { VistaDeCarrusel } from "./carrusel"
import { DeshacerFirma } from "./deshacer-firma"
import { PantallaGuion } from "./pantalla-guion"
import { TEXTO_NO_ESCRIBI, TEXTO_NO_TERMINE, TEXTO_REINTENTA } from "./textos"
import { Trabajando } from "./trabajando"
import { avisoAlVolver, ventanaDeDeshacer } from "./ventana-de-firma"
import { VideoDetenido } from "./video-detenido"
import { VozSuelta } from "./voz-suelta"

const segundosDe = (guion: string | null) => (guion ? Math.round(estimarSegundos(guion)) : undefined)

const DOCE_HORAS_MS = 12 * 60 * 60 * 1000

export default async function PaginaDeGuion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ deshecho?: string; firmada?: string }>
}) {
  const [{ id }, { deshecho, firmada }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const { db } = await exigirConi()
  const [pantalla, pilares, pausas] = await Promise.all([
    leerPantallaDePieza(db, id),
    leerPilares(db),
    leerPausasAbiertas(db),
  ])
  if (!pantalla) notFound()
  const { fila, idea } = pantalla
  const pilar = pilarVisible(pilares, idea?.pilar, idea?.angulo_id)
  // Gate 1 not signed yet: she may still change the angle (spec 15d, section 3). After that it is only text.
  const angulo =
    idea && fila.puerta1_en === null ? (
      <ElegirAngulo
        ideaId={idea.id}
        angulos={angulosDelPilar(pilares, idea.pilar).map(({ id, slug, nombre }) => ({ id, slug, nombre }))}
        elegido={idea.angulo_id}
        cambiar={cambiarAnguloAccion}
      />
    ) : null
  // A carousel has its own gate 1 (design 2026-10-26): no script, voice or avatar.
  if (fila.tipo === "carrusel") {
    return <VistaDeCarrusel db={db} fila={fila} pilar={pilar} angulo={angulo} pausas={pausas} />
  }
  const pausaDeClaude = textoDePausa(pausas, "claude")
  const pausaDeHeygen = textoDePausa(pausas, "heygen")

  switch (fila.estado) {
    case "guion_por_aprobar":
    case "grabando_voz":
      break
    case "guion_en_proceso": {
      const porQue = explicacionAnteLaPausa(
        fila.explicacion,
        pausaDeClaude,
        "Algo falló al preparar tu guion. WAV ya está revisando.",
      )
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          {fila.explicacion ? (
            <>
              <Bloque
                tipo={pausaDeClaude ? "aviso" : "error"}
                grande
                titulo={TEXTO_NO_ESCRIBI}
                accion={
                  <AccionesDeEstado
                    piezaId={fila.id}
                    version={fila.version}
                    acciones={["reintentarGuion"]}
                    enUnError
                    bloqueo={pausaDeClaude}
                  />
                }
              >
                {porQue ? <ExplicacionParaConi texto={porQue} enSusPalabras={TEXTO_REINTENTA} /> : null}
              </Bloque>
              <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
            </>
          ) : (
            <Trabajando
              titulo="Estoy escribiendo el guion"
              detalle="Tarda unos minutos; te aviso cuando esté para que lo leas."
            />
          )}
          <RefrescoAutomatico activo={fila.explicacion === null} cadaMs={4000} />
        </EstadoSencillo>
      )
    }
    case "en_render":
    case "subtitulando": {
      const ventana = ventanaDeDeshacer(
        { ...fila, firmaEn: piezaDesdeFila(fila).puerta1?.en ?? null },
        firmada,
        new Date().toISOString(),
      )
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          {fila.explicacion ? (
            <VideoDetenido piezaId={fila.id} explicacion={fila.explicacion} aviso={await avisoDeLaPieza(db, fila)} />
          ) : (
            <DeshacerFirma piezaId={fila.id} version={ventana.version} quedanMs={ventana.quedanMs} />
          )}
          <Link href="/" className={clasesDeBoton({ variante: "secundario", className: "mt-2" })}>
            Volver a Inicio
            <House aria-hidden="true" size={ICONO.medio} />
          </Link>
          <RefrescoAutomatico activo={piezaTrabajando(fila)} cadaMs={4000} />
        </EstadoSencillo>
      )
    }
    case "error_produccion": {
      const voz = await vozParaEscuchar(db, fila)
      const porQue = explicacionAnteLaPausa(
        fila.explicacion,
        pausaDeHeygen,
        "Algo no salió como esperábamos con esta pieza.",
      )
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <Bloque
            tipo={pausaDeHeygen ? "aviso" : "error"}
            grande
            titulo={TEXTO_NO_TERMINE}
            accion={
              <AccionesDeEstado
                piezaId={fila.id}
                version={fila.version}
                acciones={["reintentar"]}
                enUnError
                bloqueo={pausaDeHeygen}
              />
            }
          >
            {/* The HeyGen balance is WAV's: it goes with the provider's reason under "Detalle para WAV". */}
            {porQue ? (
              <ExplicacionParaConi
                texto={porQue}
                enSusPalabras={TEXTO_REINTENTA}
                extra={[lineaDeSaldoVideo((await leerSaldos()).heygen)]}
              />
            ) : null}
          </Bloque>
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
          {voz ? (
            <Seccion titulo="Voz" id="voz">
              <p className="text-meta text-apagado">Mientras tanto, puedes escuchar la voz.</p>
              <VozSuelta src={voz.url} clave={voz.clave} />
            </Seccion>
          ) : null}
        </EstadoSencillo>
      )
    }
    case "video_por_aprobar":
    case "programado":
    case "para_subir_a_mano":
    case "publicado":
    case "publicado_a_mano":
    case "error_publicacion":
      return redirect(`/video/${fila.id}`)
    default:
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <p className="text-cuerpo text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }

  if (fila.guion === null || fila.texto === null) {
    throw new Error(`La pieza ${fila.id} está por aprobar sin guion o texto.`)
  }

  const ahora = Date.now()
  const contexto = await leerContextoDeFechas(db, fila.id)
  const ocupadas = ocupadasEnLaPuerta(contexto, ahora)
  const propuestas = proponerFechas({
    ahora,
    horario: contexto.horario,
    ocupadas,
    cuantas: contexto.enCola + 1,
    antelacionMs: DOCE_HORAS_MS,
  })
  const tomadas = new Set(ocupadas.map((iso) => Date.parse(iso)))
  const propuesta = propuestaVigente(contexto.propuesta, { ahora, tomadas, antelacionMs: DOCE_HORAS_MS })
  const salida = propuesta ?? propuestas[contexto.enCola]
  const [avatares, conVersionDeClaude, grabacion, aviso] = await Promise.all([
    avataresParaElegir(db),
    tieneVersionDeClaude({ db }, fila.id),
    leerDatosDeGrabacion(db, { fila, estado: fila.estado, guion: fila.guion, zona: contexto.horario.zona }),
    avisoDeLaPieza(db, fila),
  ])

  return (
    <>
      <RefrescoAutomatico activo={fila.estado === "grabando_voz"} cadaMs={4000} />
      {/* One per piece: the screen starts over with each state on its own and keeps her choices across them. */}
      <PantallaGuion
        key={fila.id}
        angulo={angulo}
        datos={{
          id: fila.id,
          version: fila.version,
          titulo: fila.titulo,
          pilar,
          formato: idea?.formato || null,
          segundos: Math.round(estimarSegundos(fila.guion)),
          guion: fila.guion,
          texto: fila.texto,
          textoLinkedin: fila.texto_linkedin,
          fuente: lineaDeFuente(leerRespaldo(fila.respaldo)?.afirmaciones ?? []),
          // Gate 1 is about the script and the caption: the LinkedIn findings are reviewed at gate 2.
          revision: sinLinkedin(leerRevision(fila.revision)),
          tieneVersionDeClaude: conVersionDeClaude,
          salida: salida ? etiquetaDeFecha(salida, contexto.horario.zona, "larga") : null,
          explicacion: fila.explicacion,
          aviso,
          avatares,
          grabacion,
          avisoInicial: avisoAlVolver(deshecho, fila.estado),
          avatarGuardado: fila.avatar_id,
        }}
      />
    </>
  )
}

/** Whether «Avisar a Federico» is offered for the piece's failure, and whether its email went out (spec 2026-11-07, A11). */
function avisoDeLaPieza(
  db: Parameters<typeof leerAvisoAFederico>[0],
  fila: { id: string; estado: string; explicacion: string | null; intento: number },
) {
  const explicacion = fallaParaFederico({ tipo: "pieza", estado: fila.estado, explicacion: fila.explicacion })
  return explicacion === null
    ? Promise.resolve(null)
    : leerAvisoAFederico(db, {
        tipo: "pieza",
        id: fila.id,
        explicacion,
        ocurrencia: ocurrenciaDePieza(fila.intento),
      })
}

/** The stored voice of the approved script, signed for listening, or null when there is none or the setup does not read. */
async function vozParaEscuchar(db: Parameters<typeof leerProduccion>[0], fila: Parameters<typeof vozVigente>[0]) {
  if (fila.guion === null) return null
  let clave: string | null
  try {
    clave = vozVigente(fila, fila.guion, leerConfigProduccion(await leerProduccion(db)))
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer la voz de la pieza con error", error)
    return null
  }
  return clave === null ? null : { clave, url: await urlParaVer(clave) }
}

/** The curated looks with a signed link to each photo. A setup that does not read leaves the list empty, which blocks. */
async function avataresParaElegir(db: Parameters<typeof leerAvataresElegibles>[0]) {
  let elegibles: Awaited<ReturnType<typeof leerAvataresElegibles>>
  try {
    elegibles = await leerAvataresElegibles(db)
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer los avatares para elegir", error)
    return []
  }
  return Promise.all(
    elegibles.map(async (avatar) => ({
      id: avatar.avatar_id,
      nombre: avatar.nombre,
      imagenUrl: await urlParaVer(avatar.imagen),
    })),
  )
}
