import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { FilaPieza } from "@/components/fila-pieza"
import { Nota } from "@/components/nota"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { rutaDeAviso } from "@/lib/avisos/tipos"
import { leerAvisosSinLeer } from "@/lib/datos/avisos"
import { leerConsultas } from "@/lib/datos/consultas"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
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
    <div className="grid gap-5.5">
      <header className="grid gap-1.5">
        <p className="text-meta text-apagado">{inicio.semana}</p>
        <h1 className="font-serif text-display">Hola, Coni</h1>
        <p className="text-[1.0625rem] text-apagado">{inicio.resumen}</p>
      </header>

      {inicio.avisos.map((aviso) => (
        <AvisoEnInicio key={`${aviso.titulo}-${aviso.texto}`} aviso={aviso} />
      ))}

      <AvisosSinLeer
        avisos={sinLeer.map((aviso) => ({
          id: aviso.id,
          mensaje: aviso.mensaje,
          href: rutaDeAviso({ tipo: aviso.tipo, piezaId: aviso.pieza_id }),
          cuando: etiquetaDeFecha(aviso.creado_en, datos.zona, "corta"),
        }))}
        marcar={marcarAvisoLeidoAccion}
      />

      {inicio.porSubir.length > 0 ? (
        <Seccion titulo="Para subir a Instagram" id="por-subir">
          <ul>
            {inicio.porSubir.map((fila) => (
              <FilaPieza key={fila.id} titulo={fila.titulo} meta={fila.meta} pilar={fila.pilar} href={fila.href} />
            ))}
          </ul>
        </Seccion>
      ) : null}

      <Seccion titulo="Necesita tu firma" id="firma">
        {inicio.firma.length > 0 ? (
          <ul>
            {inicio.firma.map((fila) => (
              <FilaPieza key={fila.id} titulo={fila.titulo} meta={fila.meta} pilar={fila.pilar} href={fila.href} />
            ))}
          </ul>
        ) : (
          <div className="grid gap-1.5 py-1">
            <p className="font-semibold">Nada espera tu firma esta semana.</p>
            <p className="text-apagado">El lunes a las 8:00 te propongo 5 ideas nuevas.</p>
            <Link
              href="#ideas"
              className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "mt-1.5 w-fit" })}
            >
              Elegir ideas ahora
            </Link>
          </div>
        )}
      </Seccion>

      {inicio.camino.length > 0 ? (
        <Seccion titulo="En camino" id="camino">
          <ul>
            {inicio.camino.map((fila) => (
              <FilaPieza
                key={fila.id}
                titulo={fila.titulo}
                meta={fila.estado}
                pilar={fila.pilar}
                ocupada={fila.ocupada}
              />
            ))}
          </ul>
        </Seccion>
      ) : null}

      <Link href="/calendario" className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "w-fit" })}>
        Ver calendario
      </Link>

      <div id="ideas" className="scroll-mt-4">
        <Seccion titulo="Ideas de la semana" id="ideas-titulo">
          <IdeasSemana
            ideas={ideas.flatMap((idea) => {
              const gancho = ganchos.get(idea.id)
              return gancho ? [{ id: idea.id, gancho, pilar: idea.pilar }] : []
            })}
            alElegir={elegirIdeasAccion}
          />
          <Link href="/ideas" className={clasesDeBoton({ variante: "callado", tamano: "chico", className: "w-fit" })}>
            Ver todas las ideas
          </Link>
        </Seccion>
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
  )
}

function AvisoEnInicio({ aviso }: { aviso: AvisoDeInicio }) {
  return (
    <Nota tipo={aviso.tipo} titulo={aviso.titulo}>
      <p>{aviso.texto}</p>
      {aviso.accion ? (
        <Link
          href={aviso.accion.href}
          {...(aviso.accion.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={clasesDeBoton({
            variante: aviso.tipo === "ok" ? "callado" : "linea",
            tamano: "chico",
            className: "mt-1.5 w-fit",
          })}
        >
          {aviso.accion.etiqueta}
          {aviso.accion.externo ? <ExternalLink aria-hidden="true" size={18} /> : null}
        </Link>
      ) : null}
    </Nota>
  )
}
