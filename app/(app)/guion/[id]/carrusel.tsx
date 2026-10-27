import type { SupabaseClient } from "@supabase/supabase-js"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { MomentoDeCierre } from "@/components/momento-de-cierre"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { urlParaVer } from "@/lib/acciones/medios"
import { contarCambiosDeTexto, leerCarruselVigente, leerVersion, leerVersionVigente } from "@/lib/datos/carrusel"
import { type FilaDePieza, leerPublicaciones } from "@/lib/datos/repositorio"
import { leerRevision } from "@/lib/datos/revision"
import { cambiosQuedan } from "@/lib/dominio/carrusel"
import { etiquetaDeFecha } from "@/lib/dominio/fechas"
import type { PilarVisible } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { AccionesDeEstado } from "../../estado-de-pieza"
import { fechasDePuerta2 } from "../../fechas-de-puerta-2"
import { descargarCarruselAccion, marcarSubidoAManoAccion } from "../../piezas/acciones"
import { LaminasEnLectura } from "./laminas-en-lectura"
import { PantallaCarrusel } from "./pantalla-carrusel"
import { PantallaPuerta2Carrusel } from "./puerta-2-carrusel"
import { SubirCarruselAMano } from "./subir-carrusel"
import {
  TEXTO_ARMANDO,
  TEXTO_ARMANDO_DETALLE,
  TEXTO_ASI_QUEDO_FIRMADO,
  TEXTO_ESCRIBIENDO_CARRUSEL,
  TEXTO_NO_ARME,
  TEXTO_NO_ESCRIBI_CARRUSEL,
  TEXTO_PROGRAMADO_CARRUSEL,
  TEXTO_REINTENTA,
} from "./textos"
import { Trabajando } from "./trabajando"

/** A carousel's `/guion/<id>` (design 2026-10-26): every state, from writing to gate 2 and the manual upload. */
export async function VistaDeCarrusel({
  db,
  fila,
  pilar,
}: {
  db: SupabaseClient<Database>
  fila: FilaDePieza
  pilar: PilarVisible | null
}) {
  switch (fila.estado) {
    case "guion_en_proceso":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          {fila.explicacion ? (
            <>
              <Bloque
                tipo="error"
                grande
                titulo={TEXTO_NO_ESCRIBI_CARRUSEL}
                accion={
                  <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentarGuion"]} enUnError />
                }
              >
                <ExplicacionParaConi texto={fila.explicacion} enSusPalabras={TEXTO_REINTENTA} />
              </Bloque>
              <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
            </>
          ) : (
            <Trabajando
              titulo={TEXTO_ESCRIBIENDO_CARRUSEL}
              detalle="Tarda unos minutos; te aviso cuando esté para que lo leas."
            />
          )}
          <RefrescoAutomatico activo={fila.explicacion === null} cadaMs={4000} />
        </EstadoSencillo>
      )
    case "guion_por_aprobar": {
      const [carrusel, cambios] = await Promise.all([
        leerCarruselVigente(db, fila.id),
        contarCambiosDeTexto(db, fila.id),
      ])
      if (!carrusel) throw new Error(`La pieza ${fila.id} está por aprobar sin carrusel.`)
      return (
        <PantallaCarrusel
          // A new version or a refused signature brings a new piece version: the screen starts over with it.
          key={`${fila.id}:${fila.version}`}
          datos={{
            id: fila.id,
            version: fila.version,
            titulo: fila.titulo,
            pilar,
            laminas: carrusel.laminas,
            textoPost: carrusel.textoPost,
            revision: leerRevision(fila.revision),
            cambiosQuedan: cambiosQuedan(cambios),
            explicacion: fila.explicacion,
          }}
        />
      )
    }
    case "armando_carrusel": {
      const carrusel = await leerCarruselVigente(db, fila.id)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <Trabajando titulo={TEXTO_ARMANDO} detalle={TEXTO_ARMANDO_DETALLE} />
          {carrusel ? (
            <Seccion titulo={TEXTO_ASI_QUEDO_FIRMADO} id="firmado">
              <LaminasEnLectura laminas={carrusel.laminas} />
            </Seccion>
          ) : null}
          <RefrescoAutomatico activo={fila.explicacion === null} cadaMs={4000} />
        </EstadoSencillo>
      )
    }
    case "carrusel_por_aprobar": {
      const version = await leerVersionVigente(db, fila.id)
      if (!version || version.estado !== "listo")
        throw new Error(`La pieza ${fila.id} está en la puerta 2 sin láminas.`)
      const [imagenes, { fechas }] = await Promise.all([
        Promise.all(version.pngClaves.map((clave) => urlParaVer(clave))),
        fechasDePuerta2(db, fila.id, Date.now()),
      ])
      return (
        <PantallaPuerta2Carrusel
          key={`${fila.id}:${fila.version}`}
          datos={{
            id: fila.id,
            version: fila.version,
            titulo: fila.titulo,
            pilar,
            carruselId: version.id,
            laminas: version.laminas,
            imagenes,
            diseno: version.diseno,
            textoPost: version.textoPost,
            fechas,
            cambiosQuedan: cambiosQuedan(fila.cambios_de_texto),
            explicacion: fila.explicacion,
          }}
        />
      )
    }
    case "programado": {
      const { zona } = await fechasDePuerta2(db, fila.id, Date.now())
      const cuando = fila.puerta2_publicar_en
        ? etiquetaDeFecha(fila.puerta2_publicar_en, zona, "larga")
        : "día aprobado"
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <LineaDeEstado tipo="exito" titulo={`Programado para el ${cuando}`} detalle={TEXTO_PROGRAMADO_CARRUSEL} />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["cambiarFecha", "descartar"]} />
        </EstadoSencillo>
      )
    }
    case "para_subir_a_mano": {
      const version = fila.puerta2_carrusel_id ? await leerVersion(db, fila.puerta2_carrusel_id) : null
      if (!version) throw new Error(`La pieza ${fila.id} espera subirse sin el carrusel aprobado.`)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <LineaDeEstado tipo="aviso" titulo="Listo para que lo subas a LinkedIn" />
          <SubirCarruselAMano
            piezaId={fila.id}
            version={fila.version}
            texto={version.textoPost}
            alDescargar={descargarCarruselAccion}
            alMarcar={marcarSubidoAManoAccion}
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
        </EstadoSencillo>
      )
    }
    case "publicado_a_mano": {
      const enlace = (await leerPublicaciones(db, fila.id)).find((p) => p.destino === "linkedin")?.enlace
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <MomentoDeCierre
            titulo="Subido a LinkedIn"
            detalle="Lo subiste tú a LinkedIn."
            enlaces={enlace ? [{ etiqueta: "Ver en LinkedIn", href: enlace }] : []}
          />
        </EstadoSencillo>
      )
    }
    case "error_produccion":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <Bloque
            tipo="error"
            grande
            titulo={TEXTO_NO_ARME}
            accion={
              <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentarCarrusel"]} enUnError />
            }
          >
            <ExplicacionParaConi
              texto={fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
              enSusPalabras={TEXTO_REINTENTA}
            />
          </Bloque>
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
        </EstadoSencillo>
      )
    case "error_publicacion":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <LineaDeEstado
            tipo="error"
            titulo="No te lo pude dejar para subir"
            detalle={
              <ExplicacionParaConi
                texto={fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
                enSusPalabras={TEXTO_REINTENTA}
              />
            }
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentar", "descartar"]} />
        </EstadoSencillo>
      )
    default:
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <p className="text-cuerpo text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }
}
