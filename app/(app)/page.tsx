import { ArrowUpRight, CaretRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { FilaPieza } from "@/components/fila-pieza"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { FilaNavegacion } from "@/components/ui/filas"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { rutaDeAviso } from "@/lib/avisos/tipos"
import { leerAvisosSinLeer } from "@/lib/datos/avisos"
import { leerConsultas } from "@/lib/datos/consultas"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
import { piezaTrabajando } from "@/lib/dominio/estados"
import { etiquetaDeFecha } from "@/lib/dominio/fechas"
import { sugerirIdeas } from "@/lib/dominio/ideas"
import { contarEnMes, limitesDelMes } from "@/lib/dominio/metricas"
import { type AvisoDeInicio, construirInicio } from "@/lib/inicio/modelo"
import { exigirConi } from "@/lib/sesion/coni"
import { marcarAvisoLeidoAccion } from "./ajustes/acciones"
import { AvisosSinLeer } from "./avisos-sin-leer"
import { ConsultaNueva } from "./consulta-nueva"
import { anotarConsultaAccion, deshacerConsultaAccion } from "./consultas/acciones"
import { IdeasSemana } from "./ideas-semana"
import { elegirIdeasAccion } from "./piezas/acciones"

const IDEAS_DE_LA_SEMANA = 5
const AVISOS_A_MOSTRAR = 5

export default async function Inicio() {
  const { db } = await exigirConi()
  const ahora = Date.now()
  const datos = await leerDatosDeInicio(db, ahora)
  const inicio = construirInicio({ piezas: datos.piezas, ahora, zona: datos.zona })
  const ideas = sugerirIdeas({ banco: datos.banco, recientes: datos.recientes, cuantas: IDEAS_DE_LA_SEMANA })
  const ganchos = new Map(datos.banco.map((idea) => [idea.id, idea.gancho]))
  const mes = limitesDelMes(ahora, datos.zona)
  const consultas = await leerConsultas(db, new Date(mes.desde).toISOString())
  const sinLeer = await leerAvisosSinLeer(db, AVISOS_A_MOSTRAR)

  return (
    <div>
      <header className="grid gap-1">
        <p className="flex items-baseline justify-between gap-4 text-meta">
          <span className="font-semibold">Hola, Coni</span>
          <span className="text-apagado">{inicio.semana}</span>
        </p>
        <h1 className="mt-6 text-pantalla text-balance">{inicio.titulo}</h1>
        {inicio.tiempo ? <p className="mt-1 text-cuerpo text-apagado">{inicio.tiempo}</p> : null}
      </header>

      <RefrescoAutomatico activo={datos.piezas.some(piezaTrabajando)} cadaMs={8000} />

      {inicio.avisos.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {inicio.avisos.map((aviso) => (
            <AvisoEnInicio key={`${aviso.titulo}-${aviso.texto}`} aviso={aviso} />
          ))}
        </div>
      ) : null}

      <div className="mt-10">
        {inicio.porSubir.length > 0 ? (
          <Seccion titulo={inicio.porSubirTitulo} id="por-subir" cifra={inicio.porSubir.length}>
            <ul>
              {inicio.porSubir.map((fila) => (
                <FilaPieza key={fila.id} titulo={fila.titulo} estado={fila.meta} pilar={fila.pilar} href={fila.href} />
              ))}
            </ul>
          </Seccion>
        ) : null}

        <Seccion titulo="Necesita tu firma" id="firma" cifra={inicio.firma.length}>
          {inicio.firma.length > 0 ? (
            <ul>
              {inicio.firma.map((fila) => (
                <FilaPieza key={fila.id} titulo={fila.titulo} estado={fila.meta} pilar={fila.pilar} href={fila.href} />
              ))}
            </ul>
          ) : (
            <div className="grid gap-1 py-1">
              <p className="text-cuerpo font-semibold">Nada espera tu firma esta semana.</p>
              <p className="text-cuerpo text-apagado">El lunes a las 8:00 te propongo 5 ideas nuevas.</p>
              <Link
                href="#ideas"
                className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "mt-2 w-fit" })}
              >
                Elegir ideas ahora
              </Link>
            </div>
          )}
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
            <ul>
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
            </ul>
            <FilaNavegacion href="/calendario">Ver calendario</FilaNavegacion>
          </Seccion>
        ) : (
          <div className="mt-10">
            <FilaNavegacion href="/calendario">Ver calendario</FilaNavegacion>
          </div>
        )}

        <div id="ideas" className="mt-10 scroll-mt-4">
          <IdeasSemana
            ideas={ideas.flatMap((idea) => {
              const gancho = ganchos.get(idea.id)
              return gancho ? [{ id: idea.id, gancho, pilar: idea.pilar }] : []
            })}
            alElegir={elegirIdeasAccion}
          />
        </div>

        <Seccion titulo="Consultas" id="consultas">
          <ConsultaNueva
            total={contarEnMes(consultas, mes.clave, datos.zona)}
            mes={mes.nombre}
            alAnotar={anotarConsultaAccion}
            alDeshacer={deshacerConsultaAccion}
          />
        </Seccion>
      </div>
    </div>
  )
}

const TIPO_DE_LINEA = { ok: "exito", error: "error" } as const

function AvisoEnInicio({ aviso }: { aviso: AvisoDeInicio }) {
  return (
    <LineaDeEstado
      tipo={TIPO_DE_LINEA[aviso.tipo]}
      titulo={<strong className="font-semibold">{aviso.titulo}</strong>}
      tituloEnTinta
      detalle={aviso.texto}
      accion={
        aviso.accion ? (
          <Link
            href={aviso.accion.href}
            {...(aviso.accion.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex min-h-11 items-center gap-2 text-cuerpo font-medium text-tinta"
          >
            {aviso.accion.etiqueta}
            {aviso.accion.externo ? (
              <ArrowUpRight aria-hidden="true" size={20} />
            ) : (
              <CaretRight aria-hidden="true" size={20} />
            )}
          </Link>
        ) : undefined
      }
    />
  )
}
