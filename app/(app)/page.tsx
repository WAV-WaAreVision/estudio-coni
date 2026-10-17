import { ArrowRight, ArrowUpRight, CaretRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { FilaPieza } from "@/components/fila-pieza"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { FilaNavegacion } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { rutaDeAviso } from "@/lib/avisos/tipos"
import { leerAvisosSinLeer } from "@/lib/datos/avisos"
import { leerConsultas } from "@/lib/datos/consultas"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
import { piezaTrabajando } from "@/lib/dominio/estados"
import { etiquetaDeFecha } from "@/lib/dominio/fechas"
import { sugerirIdeas } from "@/lib/dominio/ideas"
import { contarEnMes, limitesDelMes } from "@/lib/dominio/metricas"
import { NOMBRE_DE_PILAR } from "@/lib/dominio/pilares"
import { type AvisoDeInicio, construirInicio, type FilaDeFirma } from "@/lib/inicio/modelo"
import { exigirConi } from "@/lib/sesion/coni"
import { marcarAvisoLeidoAccion } from "./ajustes/acciones"
import { AvisosSinLeer } from "./avisos-sin-leer"
import { ConsultaNueva } from "./consulta-nueva"
import { anotarConsultaAccion, deshacerConsultaAccion } from "./consultas/acciones"
import { IdeasSemana } from "./ideas-semana"
import { elegirIdeasAccion } from "./piezas/acciones"

const IDEAS_DE_LA_SEMANA = 5
const AVISOS_A_MOSTRAR = 5

/** "5 nuevas", "1 nueva", or nothing: the meta of the row that opens the week's ideas. */
function nuevas(cantidad: number): string | undefined {
  if (cantidad === 0) return undefined
  return cantidad === 1 ? "1 nueva" : `${cantidad} nuevas`
}

export default async function Inicio() {
  const { db } = await exigirConi()
  const ahora = Date.now()
  const datos = await leerDatosDeInicio(db, ahora)
  const inicio = construirInicio({ piezas: datos.piezas, ahora, zona: datos.zona })
  const ideas = sugerirIdeas({ banco: datos.banco, recientes: datos.recientes, cuantas: IDEAS_DE_LA_SEMANA })
  const ganchos = new Map(datos.banco.map((idea) => [idea.id, idea.gancho]))
  const ideasParaElegir = ideas.flatMap((idea) => {
    const gancho = ganchos.get(idea.id)
    return gancho ? [{ id: idea.id, gancho, pilar: idea.pilar }] : []
  })
  const mes = limitesDelMes(ahora, datos.zona)
  const consultas = await leerConsultas(db, new Date(mes.desde).toISOString())
  const sinLeer = await leerAvisosSinLeer(db, AVISOS_A_MOSTRAR)
  const [principal, ...otrasFallas] = inicio.atencion
  const [carta, ...otrasFirmas] = inicio.firma

  return (
    <div>
      <header className="grid gap-1.5">
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

      {principal ? (
        <section aria-label="Necesita atención" className="mt-6 grid gap-4">
          <Bloque
            tipo="error"
            grande
            titulo={principal.causa}
            pieza={principal.titulo}
            accion={principal.accion ? <AccionDeAviso accion={principal.accion} principal /> : undefined}
          >
            {principal.texto}
          </Bloque>
          {otrasFallas.length > 0 ? (
            <Grupo lista>
              {otrasFallas.map((aviso) => (
                <FilaPieza
                  key={`${aviso.titulo}-${aviso.texto}`}
                  titulo={aviso.titulo}
                  causa={aviso.causa}
                  pilar={aviso.pilar ?? null}
                  href={aviso.accion?.href}
                />
              ))}
            </Grupo>
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
        <Seccion titulo={inicio.porSubirTitulo} id="por-subir" cifra={inicio.porSubir.length}>
          <Grupo lista>
            {inicio.porSubir.map((fila) => (
              <FilaPieza key={fila.id} titulo={fila.titulo} estado={fila.meta} pilar={fila.pilar} href={fila.href} />
            ))}
          </Grupo>
        </Seccion>
      ) : null}

      <Seccion titulo="Necesita tu firma" id="firma" cifra={inicio.firma.length > 0 ? inicio.firma.length : undefined}>
        {carta ? (
          <CartaDeFirma fila={carta} principal={principal === undefined} />
        ) : (
          <div className="grid gap-1 py-1">
            <p className="text-cuerpo font-semibold">Nada espera tu firma esta semana.</p>
            <p className="text-cuerpo text-apagado">El lunes a las 8:00 te propongo 5 ideas nuevas.</p>
          </div>
        )}
        {otrasFirmas.length > 0 ? (
          <Grupo lista className="mt-2">
            {otrasFirmas.map((fila) => (
              <FilaPieza key={fila.id} titulo={fila.titulo} estado={fila.meta} pilar={fila.pilar} href={fila.href} />
            ))}
          </Grupo>
        ) : null}
        {inicio.enPreparacion.length > 0 ? (
          <>
            <p className="mx-0.5 mt-2 text-meta font-semibold">En preparación, aún no se firma</p>
            <Grupo plano lista>
              {inicio.enPreparacion.map((fila) => (
                <FilaPieza key={fila.id} titulo={fila.titulo} estado={fila.meta} pilar={fila.pilar} trabajando />
              ))}
            </Grupo>
          </>
        ) : null}
      </Seccion>

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
                pilar={fila.pilar}
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
  )
}

/** The first signable piece: the one high card of the screen, with its one action (decision 8, step 6). */
function CartaDeFirma({ fila, principal }: { fila: FilaDeFirma; principal: boolean }) {
  return (
    <article
      data-pilar={fila.pilar ?? undefined}
      className="grid gap-2 rounded-panel bg-piedra p-5 shadow-relieve-alto"
    >
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado">
        <span>{fila.meta}</span>
        <span>{fila.pilar ? NOMBRE_DE_PILAR[fila.pilar] : null}</span>
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
