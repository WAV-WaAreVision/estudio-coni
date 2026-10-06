import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { MomentoDeCierre } from "@/components/momento-de-cierre"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { urlParaVer } from "@/lib/acciones/medios"
import {
  leerContextoDeFechas,
  leerCostoDeGrabar,
  leerInstagramConectado,
  leerPantallaDePieza,
} from "@/lib/datos/pantallas"
import { leerPublicaciones } from "@/lib/datos/repositorio"
import { leerRevision } from "@/lib/datos/revision"
import { type Destino, destinosDe, destinosPorDefecto, nombreDeDestino, nombreDeDestinos } from "@/lib/dominio/destinos"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import { esPilar } from "@/lib/dominio/pilares"
import { dolares } from "@/lib/formato"
import { exigirConi } from "@/lib/sesion/coni"
import { AccionesDeEstado } from "../../estado-de-pieza"
import { descargarVideoAccion, marcarSubidoAManoAccion } from "../../piezas/acciones"
import { PantallaVideo } from "./pantalla-video"
import { PorSubir } from "./por-subir"

const pilarDe = (idea: { pilar?: string | null } | null | undefined) => (esPilar(idea?.pilar) ? idea.pilar : null)
const segundosDe = (guion: string | null) => (guion ? Math.round(estimarSegundos(guion)) : undefined)

const UNA_HORA_MS = 60 * 60 * 1000
const FECHAS_A_OFRECER = 4

export default async function PaginaDeVideo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { db } = await exigirConi()
  const pantalla = await leerPantallaDePieza(db, id)
  if (!pantalla) notFound()
  const { fila, idea } = pantalla

  switch (fila.estado) {
    case "video_por_aprobar":
      break
    case "programado": {
      const zona = (await leerContextoDeFechas(db, fila.id)).horario.zona
      const sinInstagram = !(await leerInstagramConectado(db))
      const publicaciones = await leerPublicaciones(db, fila.id)
      const destinos = destinosDe(fila.destinos)
      // Before its time she can already upload what goes by hand: LinkedIn always, Instagram while it is not connected.
      const pendientes = publicaciones
        .filter((p) => p.estado === "esperando" && (p.destino === "linkedin" || sinInstagram))
        .map((p) => p.destino)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="exito"
            titulo={`Programado para el ${fila.puerta2_publicar_en ? etiquetaDeFecha(fila.puerta2_publicar_en, zona, "larga") : "día aprobado"}`}
            detalle={detalleDeProgramado(destinos, sinInstagram)}
          />
          {fila.texto !== null ? (
            <PorSubir
              piezaId={fila.id}
              version={fila.version}
              texto={fila.texto}
              textoLinkedin={fila.texto_linkedin}
              publicaciones={publicaciones}
              pendientes={pendientes}
              alDescargar={descargarVideoAccion}
              alMarcar={marcarSubidoAManoAccion}
            />
          ) : null}
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["cambiarFecha", "descartar"]} />
        </EstadoSencillo>
      )
    }
    case "para_subir_a_mano": {
      if (fila.texto === null) throw new Error(`La pieza ${fila.id} espera subirse sin texto guardado.`)
      const publicaciones = await leerPublicaciones(db, fila.id)
      const pendientes = publicaciones.filter((p) => p.estado === "para_subir").map((p) => p.destino)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="aviso"
            titulo={`Listo para que lo subas a ${nombreDeDestinos(pendientes)}`}
            detalle={
              pendientes.includes("instagram")
                ? "Instagram todavía no está conectado, así que este reel no sale solo. Súbelo tú con estos pasos."
                : "LinkedIn se sube a mano. Súbelo tú con estos pasos."
            }
          />
          <PorSubir
            piezaId={fila.id}
            version={fila.version}
            texto={fila.texto}
            textoLinkedin={fila.texto_linkedin}
            publicaciones={publicaciones}
            pendientes={pendientes}
            alDescargar={descargarVideoAccion}
            alMarcar={marcarSubidoAManoAccion}
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
        </EstadoSencillo>
      )
    }
    case "publicado_a_mano": {
      const subidas = (await leerPublicaciones(db, fila.id)).filter((p) => p.estado === "subido_a_mano")
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <MomentoDeCierre
            titulo="Subido a mano"
            detalle={detalleDeSubida(subidas.map((p) => p.destino))}
            enlaces={subidas.flatMap((p) =>
              p.enlace ? [{ etiqueta: `Ver en ${nombreDeDestino(p.destino)}`, href: p.enlace }] : [],
            )}
          />
        </EstadoSencillo>
      )
    }
    case "publicado":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <MomentoDeCierre
            titulo="Ya se publicó"
            detalle="La etiqueta de IA quedó puesta en Instagram."
            enlace={fila.permalink}
          />
        </EstadoSencillo>
      )
    case "error_publicacion":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="error"
            titulo="No se pudo publicar"
            detalle={
              <>
                {fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
                {fila.media_id
                  ? " Es posible que el reel ya esté en Instagram. Reintentar solo vuelve a comprobarlo."
                  : null}
              </>
            }
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentar", "descartar"]} />
        </EstadoSencillo>
      )
    case "guion_por_aprobar":
    case "guion_en_proceso":
    case "guion_aprobado":
    case "grabando_voz":
    case "en_render":
    case "subtitulando":
    case "error_produccion":
      return redirect(`/guion/${fila.id}`)
    default:
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <p className="text-cuerpo text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }

  if (fila.guion === null || fila.texto === null || fila.video_id === null) {
    throw new Error(`La pieza ${fila.id} está por aprobar sin guion, texto o video.`)
  }

  const ahora = Date.now()
  const contexto = await leerContextoDeFechas(db, fila.id)
  const fechas = proponerFechas({
    ahora,
    horario: contexto.horario,
    ocupadas: contexto.ocupadas,
    cuantas: FECHAS_A_OFRECER,
    antelacionMs: UNA_HORA_MS,
  }).map((iso) => ({ iso, etiqueta: etiquetaDeFecha(iso, contexto.horario.zona, "larga") }))
  const [videoUrl, costo, ajustes, instagramConectado] = await Promise.all([
    urlParaVer(fila.video_id),
    leerCostoDeGrabar(db, fila.guion, ahora, contexto.horario.zona, fila.audio_id),
    leerAjustesDelVideo(db),
    leerInstagramConectado(db),
  ])

  return (
    <PantallaVideo
      key={fila.version}
      datos={{
        id: fila.id,
        version: fila.version,
        titulo: fila.titulo,
        pilar: esPilar(idea?.pilar) ? idea.pilar : null,
        segundos: Math.round(estimarSegundos(fila.guion)),
        texto: fila.texto,
        textoLinkedin: fila.texto_linkedin,
        // What she would publish if she did not touch it: where Ajustes says reels go by default.
        destinosPorDefecto: ajustes.destinosPorDefecto,
        instagramConectado,
        revision: leerRevision(fila.revision),
        videoUrl,
        videoId: fila.video_id,
        fechas,
        costoDeRegrabar: costo.estimadoUsd === null ? null : `Regrabar cuesta unos ${dolares(costo.estimadoUsd)}.`,
        explicacion: fila.explicacion,
        primeraVez: ajustes.primeraVez,
      }}
    />
  )
}

function detalleDeProgramado(destinos: readonly Destino[], sinInstagram: boolean): string {
  const conInstagram = destinos.includes("instagram")
  const conLinkedin = destinos.includes("linkedin")
  if (conInstagram && sinInstagram) {
    const base = "Instagram todavía no está conectado, así que este reel no sale solo."
    return conLinkedin
      ? `${base} LinkedIn tampoco: a esa hora te aviso y los subes tú.`
      : `${base} A esa hora te aviso y lo subes tú.`
  }
  if (conInstagram) {
    const base = "Sale con la etiqueta de IA. Puedes cambiar la fecha mientras no se publique."
    return conLinkedin ? `${base} LinkedIn lo subes tú a mano.` : base
  }
  return "LinkedIn se sube a mano: a esa hora te aviso y lo subes tú."
}

/** What she did, in her words: Instagram keeps saying the AI label went on, as it always did. */
function detalleDeSubida(destinos: readonly Destino[]): string {
  if (destinos.length === 1 && destinos[0] === "instagram") return "Lo subiste tú a Instagram, con la etiqueta de IA."
  return `Lo subiste tú a ${nombreDeDestinos(destinos)}.`
}

async function leerAjustesDelVideo(
  db: Awaited<ReturnType<typeof exigirConi>>["db"],
): Promise<{ primeraVez: boolean; destinosPorDefecto: Destino[] }> {
  const { data, error } = await db.from("ajustes").select("avatar_visto_en, destinos_por_defecto").maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  return {
    primeraVez: data?.avatar_visto_en === null,
    destinosPorDefecto: destinosPorDefecto(data?.destinos_por_defecto ?? []),
  }
}
