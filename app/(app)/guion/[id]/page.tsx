import { House } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeSaldo } from "@/components/ui/costo"
import { ICONO } from "@/components/ui/icono"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import { tieneVersionDeClaude } from "@/lib/acciones/guion"
import { urlParaVer } from "@/lib/acciones/medios"
import { leerDatosDeGrabacion, vozVigente } from "@/lib/datos/grabacion"
import { leerAvataresElegibles, leerContextoDeFechas, leerPantallaDePieza } from "@/lib/datos/pantallas"
import { piezaDesdeFila } from "@/lib/datos/piezas"
import { leerProduccion } from "@/lib/datos/repositorio"
import { leerRevision } from "@/lib/datos/revision"
import { piezaTrabajando } from "@/lib/dominio/estados"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import { esPilar } from "@/lib/dominio/pilares"
import { sinLinkedin } from "@/lib/dominio/revision"
import { lineaDeSaldoVideo } from "@/lib/dominio/saldos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { leerSaldos } from "@/lib/saldos/reales"
import { exigirConi } from "@/lib/sesion/coni"
import { AccionesDeEstado } from "../../estado-de-pieza"
import { DeshacerFirma } from "./deshacer-firma"
import { PantallaGuion } from "./pantalla-guion"
import { TEXTO_NO_ESCRIBI, TEXTO_NO_TERMINE, TEXTO_VIDEO_DETENIDO } from "./textos"
import { avisoAlVolver, ventanaDeDeshacer } from "./ventana-de-firma"
import { VozSuelta } from "./voz-suelta"

const pilarDe = (idea: { pilar?: string | null } | null | undefined) => (esPilar(idea?.pilar) ? idea.pilar : null)
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
  const pantalla = await leerPantallaDePieza(db, id)
  if (!pantalla) notFound()
  const { fila, idea } = pantalla

  switch (fila.estado) {
    case "guion_por_aprobar":
    case "grabando_voz":
      break
    case "guion_en_proceso":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          {fila.explicacion ? (
            <>
              <Bloque
                tipo="error"
                grande
                titulo={TEXTO_NO_ESCRIBI}
                accion={
                  <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentarGuion"]} enUnError />
                }
              >
                {fila.explicacion}
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
    case "en_render":
    case "subtitulando": {
      const ventana = ventanaDeDeshacer(
        { ...fila, firmaEn: piezaDesdeFila(fila).puerta1?.en ?? null },
        firmada,
        new Date().toISOString(),
      )
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          {fila.explicacion ? (
            <Bloque tipo="error" grande titulo={TEXTO_VIDEO_DETENIDO}>
              {fila.explicacion}
            </Bloque>
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
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <Bloque
            tipo="error"
            grande
            titulo={TEXTO_NO_TERMINE}
            accion={<AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentar"]} enUnError />}
          >
            {fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
          </Bloque>
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
          {voz ? (
            <Seccion titulo="Voz" id="voz">
              <p className="text-meta text-apagado">Mientras tanto, puedes escuchar la voz.</p>
              <VozSuelta src={voz.url} clave={voz.clave} />
            </Seccion>
          ) : null}
          <LineaDeSaldo>{lineaDeSaldoVideo((await leerSaldos()).heygen)}</LineaDeSaldo>
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
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <p className="text-cuerpo text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }

  if (fila.guion === null || fila.texto === null) {
    throw new Error(`La pieza ${fila.id} está por aprobar sin guion o texto.`)
  }

  const ahora = Date.now()
  const contexto = await leerContextoDeFechas(db, fila.id)
  const propuestas = proponerFechas({
    ahora,
    horario: contexto.horario,
    ocupadas: contexto.ocupadas,
    cuantas: contexto.enCola + 1,
    antelacionMs: DOCE_HORAS_MS,
  })
  const salida = propuestas[contexto.enCola]
  const [avatares, conVersionDeClaude, grabacion] = await Promise.all([
    avataresParaElegir(db),
    tieneVersionDeClaude({ db }, fila.id),
    leerDatosDeGrabacion(db, { fila, estado: fila.estado, guion: fila.guion, zona: contexto.horario.zona }),
  ])

  return (
    <>
      <RefrescoAutomatico activo={fila.estado === "grabando_voz"} cadaMs={4000} />
      {/* One per piece: the screen starts over with each state on its own and keeps her choices across them. */}
      <PantallaGuion
        key={fila.id}
        datos={{
          id: fila.id,
          version: fila.version,
          titulo: fila.titulo,
          pilar: esPilar(idea?.pilar) ? idea.pilar : null,
          formato: idea?.formato || null,
          segundos: Math.round(estimarSegundos(fila.guion)),
          guion: fila.guion,
          texto: fila.texto,
          textoLinkedin: fila.texto_linkedin,
          // Gate 1 is about the script and the caption: the LinkedIn findings are reviewed at gate 2.
          revision: sinLinkedin(leerRevision(fila.revision)),
          tieneVersionDeClaude: conVersionDeClaude,
          salida: salida ? etiquetaDeFecha(salida, contexto.horario.zona, "larga") : null,
          explicacion: fila.explicacion,
          avatares,
          grabacion,
          avisoInicial: avisoAlVolver(deshecho, fila.estado),
          avatarGuardado: fila.avatar_id,
        }}
      />
    </>
  )
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

/** A piece being worked on (v6 `.trabajando`): the working dot, what is happening, and when she will hear about it. */
function Trabajando({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="grid gap-1.5">
      <output className="flex items-center gap-3 text-boton font-semibold">
        <PuntoTrabajando />
        {titulo}
      </output>
      <p className="text-meta text-apagado">{detalle}</p>
    </div>
  )
}
