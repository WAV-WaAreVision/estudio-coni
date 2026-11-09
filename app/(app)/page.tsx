import { ArrowRight, ArrowUpRight, CaretRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { FilaPieza } from "@/components/fila-pieza"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { FilaNavegacion } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { rutaDeAviso } from "@/lib/avisos/tipos"
import { leerAvisosSinLeer } from "@/lib/datos/avisos"
import { leerConsultas } from "@/lib/datos/consultas"
import { contarPropuestasParaInicio } from "@/lib/datos/fusiones"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
import { contarLinkedinSinNumeros } from "@/lib/datos/metricas-linkedin"
import { leerPilares } from "@/lib/datos/pilares"
import { piezaTrabajando } from "@/lib/dominio/estados"
import { etiquetaDeFecha } from "@/lib/dominio/fechas"
import { sugerirIdeas } from "@/lib/dominio/ideas"
import { contarEnMes, limitesDelMes } from "@/lib/dominio/metricas"
import { etiquetaDePilar, type PilarVisible, pilarVisible } from "@/lib/dominio/pilares"
import { type AvisoDeInicio, construirInicio, type FilaDeFirma, TEXTO_ENTRA_A_LA_PIEZA } from "@/lib/inicio/modelo"
import { exigirConi } from "@/lib/sesion/coni"
import { marcarAvisoLeidoAccion } from "./ajustes/acciones"
import { AvisosSinLeer } from "./avisos-sin-leer"
import { ConsultaNueva } from "./consulta-nueva"
import { anotarConsultaAccion, deshacerConsultaAccion } from "./consultas/acciones"
import { IdeasSemana } from "./ideas-semana"
import { elegirIdeasAccion } from "./piezas/acciones"
import { SinFirmas } from "./sin-firmas"

const IDEAS_DE_LA_SEMANA = 5
const AVISOS_A_MOSTRAR = 5

/** Two columns from 40rem of container (app/globals.css): reading column and a narrower side, centred. */
const COLUMNAS_DE_INICIO =
  "dos-columnas:grid dos-columnas:grid-cols-[minmax(0,1fr)_minmax(15rem,17rem)] dos-columnas:items-start dos-columnas:justify-center dos-columnas:gap-x-8 dos-columnas-amplias:grid-cols-[minmax(0,40rem)_minmax(16rem,22rem)] dos-columnas-amplias:gap-x-12"

/** "5 nuevas", "1 nueva", or nothing: the meta of the row that opens the week's ideas. */
function nuevas(cantidad: number): string | undefined {
  if (cantidad === 0) return undefined
  return cantidad === 1 ? "1 nueva" : `${cantidad} nuevas`
}

export default async function Inicio() {
  const { db } = await exigirConi()
  const ahora = Date.now()
  const [datos, pilares, linkedinSinNumeros, fusionesPorDecidir] = await Promise.all([
    leerDatosDeInicio(db, ahora),
    leerPilares(db),
    contarLinkedinSinNumeros(db, ahora),
    contarPropuestasParaInicio(db),
  ])
  const inicio = construirInicio({
    piezas: datos.piezas,
    ahora,
    zona: datos.zona,
    pausas: datos.pausas,
    linkedinSinNumeros,
    fusionesPorDecidir,
  })
  const ideas = sugerirIdeas({ banco: datos.banco, recientes: datos.recientes, cuantas: IDEAS_DE_LA_SEMANA })
  const ganchos = new Map(datos.banco.map((idea) => [idea.id, idea.gancho]))
  const angulosDeIdea = new Map(datos.banco.map((idea) => [idea.id, idea.angulo_id]))
  const ideasParaElegir = ideas.flatMap((idea) => {
    const gancho = ganchos.get(idea.id)
    return gancho
      ? [{ id: idea.id, gancho, pilar: pilarVisible(pilares, idea.pilar, angulosDeIdea.get(idea.id) ?? null) }]
      : []
  })
  const mes = limitesDelMes(ahora, datos.zona)
  const consultas = await leerConsultas(db, new Date(mes.desde).toISOString())
  const sinLeer = await leerAvisosSinLeer(db, AVISOS_A_MOSTRAR)
  const [principal, ...otrasFallas] = inicio.atencion
  const [carta, ...otrasFirmas] = inicio.firma

  return (
    // On a tablet or a computer (Federico, 07-11) two columns: what asks for her on the left at reading width (attention,
    // what to upload, her signature), and on the right what she only looks at (notices, what is on its way, her week).
    // Below 40rem of container (a phone, a large text) it stays the phone's one column, in the same
    // order. The wrappers keep the phone's rhythm: the left one adds nothing, the right one the gap a section had.
    <div data-ancho="inicio" className="@container">
      <div className={COLUMNAS_DE_INICIO}>
        <header className="grid gap-1.5 dos-columnas:col-span-full">
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-meta">
            <span className="font-semibold">Hola, Coni</span>
            <span data-snapshot="varia" className="text-apagado">
              {inicio.semana}
            </span>
          </p>
          <h1 className="mt-6 text-pantalla text-balance">{inicio.titulo}</h1>
          {inicio.linea ? <p className="text-meta text-apagado">{inicio.linea}</p> : null}
        </header>

        <RefrescoAutomatico activo={datos.piezas.some(piezaTrabajando)} cadaMs={8000} />

        <div className="min-w-0 dos-columnas:col-start-1">
          {inicio.pausas.length > 0 || inicio.recordatorios.length > 0 || principal ? (
            <section aria-label="Necesita atención" className="mt-6 grid gap-4">
              {/* A pause is information (WAV is on it), not an error of hers: a plain line each, before the failures. */}
              {inicio.pausas.map((linea) => (
                <LineaDeEstado key={linea} tipo="aviso" titulo={linea} />
              ))}
              {inicio.recordatorios.map((recordatorio) => (
                <LineaDeEstado
                  key={recordatorio.titulo}
                  tipo="aviso"
                  titulo={recordatorio.titulo}
                  detalle={recordatorio.detalle}
                  accion={<AccionDeAviso accion={recordatorio.accion} />}
                />
              ))}
              {principal ? (
                <>
                  <Bloque
                    tipo="error"
                    grande
                    titulo={principal.causa}
                    pieza={principal.titulo}
                    accion={principal.accion ? <AccionDeAviso accion={principal.accion} principal /> : undefined}
                  >
                    <ExplicacionParaConi texto={principal.texto} enSusPalabras={TEXTO_ENTRA_A_LA_PIEZA} />
                  </Bloque>
                  {otrasFallas.length > 0 ? (
                    <Grupo lista>
                      {otrasFallas.map((aviso) => (
                        <FilaPieza
                          key={`${aviso.titulo}-${aviso.texto}`}
                          titulo={aviso.titulo}
                          causa={aviso.causa}
                          pilar={pilarVisible(pilares, aviso.pilar)}
                          href={aviso.accion?.href}
                        />
                      ))}
                    </Grupo>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          {inicio.avisos.map((aviso) => (
            <Bloque
              key={aviso.titulo}
              tipo="ok"
              titulo={aviso.titulo}
              className="mt-6"
              accion={aviso.accion ? <AccionDeAviso accion={aviso.accion} /> : undefined}
            >
              {aviso.texto}
            </Bloque>
          ))}

          {inicio.porSubir.length > 0 ? (
            <Seccion
              titulo={inicio.porSubirTitulo}
              id="por-subir"
              cifra={inicio.porSubir.length}
              className="first:mt-8"
            >
              <Grupo lista>
                {inicio.porSubir.map((fila) => (
                  <FilaPieza
                    key={fila.id}
                    titulo={fila.titulo}
                    estado={fila.meta}
                    pilar={pilarVisible(pilares, fila.pilar, datos.angulos.get(fila.id) ?? null)}
                    href={fila.href}
                  />
                ))}
              </Grupo>
            </Seccion>
          ) : null}

          <Seccion
            titulo="Necesita tu firma"
            id="firma"
            cifra={inicio.firma.length > 0 ? inicio.firma.length : undefined}
            className="first:mt-8"
          >
            {carta ? (
              <CartaDeFirma
                fila={carta}
                pilar={pilarVisible(pilares, carta.pilar, datos.angulos.get(carta.id) ?? null)}
                principal={principal === undefined}
              />
            ) : (
              <SinFirmas motorSemanalActivo={datos.motorSemanalActivo} />
            )}
            {otrasFirmas.length > 0 ? (
              <Grupo lista className="mt-2">
                {otrasFirmas.map((fila) => (
                  <FilaPieza
                    key={fila.id}
                    titulo={fila.titulo}
                    estado={fila.meta}
                    pilar={pilarVisible(pilares, fila.pilar, datos.angulos.get(fila.id) ?? null)}
                    href={fila.href}
                  />
                ))}
              </Grupo>
            ) : null}
            {inicio.enPreparacion.length > 0 ? (
              <>
                <p className="mx-0.5 mt-2 text-meta font-semibold">En preparación, aún no se firma</p>
                <Grupo plano lista>
                  {inicio.enPreparacion.map((fila) => (
                    <FilaPieza
                      key={fila.id}
                      titulo={fila.titulo}
                      estado={fila.meta}
                      pilar={pilarVisible(pilares, fila.pilar, datos.angulos.get(fila.id) ?? null)}
                      trabajando
                    />
                  ))}
                </Grupo>
              </>
            ) : null}
          </Seccion>
        </div>

        <div
          data-columna="lado"
          className="mt-8 min-w-0 dos-columnas:mt-6 dos-columnas:col-start-2 dos-columnas:row-start-2"
        >
          <AvisosSinLeer
            avisos={sinLeer.map((aviso) => ({
              id: aviso.id,
              mensaje: aviso.mensaje,
              href: rutaDeAviso({ tipo: aviso.tipo, piezaId: aviso.pieza_id }),
              cuando: etiquetaDeFecha(aviso.creado_en, datos.zona, "corta"),
            }))}
            marcar={marcarAvisoLeidoAccion}
          />

          {inicio.camino.length > 0 ? (
            <Seccion titulo="En camino" id="camino" cifra={inicio.camino.length}>
              <Grupo lista>
                {inicio.camino.map((fila) => (
                  <FilaPieza
                    key={fila.id}
                    titulo={fila.titulo}
                    estado={fila.estado}
                    pilar={pilarVisible(pilares, fila.pilar, datos.angulos.get(fila.id) ?? null)}
                    trabajando={fila.ocupada}
                    href={fila.href}
                  />
                ))}
              </Grupo>
            </Seccion>
          ) : null}

          <Seccion titulo="Tu semana" id="semana">
            <Grupo>
              <MasOpciones forma="fila" titulo="Elegir ideas de la semana" resumen={nuevas(ideasParaElegir.length)}>
                <IdeasSemana ideas={ideasParaElegir} alElegir={elegirIdeasAccion} />
              </MasOpciones>
              <FilaNavegacion href="/calendario">Ver calendario</FilaNavegacion>
              <MasOpciones forma="fila" titulo="Consultas">
                <ConsultaNueva
                  total={contarEnMes(consultas, mes.clave, datos.zona)}
                  mes={mes.nombre}
                  alAnotar={anotarConsultaAccion}
                  alDeshacer={deshacerConsultaAccion}
                />
              </MasOpciones>
            </Grupo>
          </Seccion>
        </div>
      </div>
    </div>
  )
}

/** The first signable piece: the one high card of the screen, with its one action (decision 8, step 6). */
function CartaDeFirma({
  fila,
  pilar,
  principal,
}: {
  fila: FilaDeFirma
  pilar: PilarVisible | null
  principal: boolean
}) {
  return (
    <article data-pilar={pilar?.slug} className="grid gap-2 rounded-panel bg-piedra p-5 shadow-relieve-alto">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado">
        <span>{fila.meta}</span>
        <span>{pilar ? etiquetaDePilar(pilar) : null}</span>
      </p>
      <h3 className="text-pieza text-balance">{fila.titulo}</h3>
      <p className="text-meta text-apagado">{fila.instruccion}</p>
      <Link
        href={fila.href}
        className={clasesDeBoton({ variante: principal ? "primario" : "secundario", className: "mt-3" })}
      >
        Revisar y firmar
        <ArrowRight aria-hidden="true" size={ICONO.grande} />
      </Link>
    </article>
  )
}

/** A notice's way out: the primary of the attention block, or a quiet link under good news. */
function AccionDeAviso({
  accion,
  principal = false,
}: {
  accion: NonNullable<AvisoDeInicio["accion"]>
  principal?: boolean
}) {
  return (
    <Link
      href={accion.href}
      {...(accion.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={
        principal
          ? clasesDeBoton({ variante: "primario" })
          : clasesDeBoton({ variante: "callado", tamano: "chico", className: "gap-2" })
      }
    >
      {accion.etiqueta}
      {accion.externo ? (
        <ArrowUpRight aria-hidden="true" size={ICONO.medio} />
      ) : principal ? (
        <ArrowRight aria-hidden="true" size={ICONO.grande} />
      ) : (
        <CaretRight aria-hidden="true" size={ICONO.medio} />
      )}
    </Link>
  )
}
