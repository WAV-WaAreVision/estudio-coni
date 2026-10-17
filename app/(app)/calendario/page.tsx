import Link from "next/link"
import { AgendaDelCalendario } from "@/components/agenda-del-calendario"
import { FilaPieza } from "@/components/fila-pieza"
import { MesDelCalendario } from "@/components/mes-del-calendario"
import { RitmoDelCalendario } from "@/components/ritmo-del-calendario"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { Grupo } from "@/components/ui/grupo"
import { Volver } from "@/components/ui/volver"
import { esVista, VistasDelCalendario } from "@/components/vistas-del-calendario"
import { construirCalendario } from "@/lib/calendario/modelo"
import { leerDatosDeCalendario } from "@/lib/datos/calendario"
import { exigirConi } from "@/lib/sesion/coni"
import { cambiarPropuestaAccion, repartirFechasAccion } from "./acciones"

export default async function Calendario({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const [{ db }, { vista: pedida }] = await Promise.all([exigirConi(), searchParams])
  const vista = esVista(pedida) ? pedida : "mes"
  const ahora = Date.now()
  const datos = await leerDatosDeCalendario(db, ahora)
  const calendario = construirCalendario({ ...datos, ahora })

  return (
    <div>
      <header className="grid gap-1">
        <Volver href="/">Inicio</Volver>
        <h1 data-snapshot="varia" className="text-pantalla capitalize">
          {calendario.mes.nombre}
        </h1>
      </header>

      <div className="mt-4">
        <VistasDelCalendario activa={vista} />
      </div>

      {vista === "mes" ? (
        <>
          <div className="mt-6">
            <MesDelCalendario celdas={calendario.mes.celdas} />
          </div>
          {calendario.mes.sinPublicaciones ? (
            <div className="mt-10 grid gap-2 py-1">
              <p className="text-cuerpo font-semibold">Nada programado este mes.</p>
              <Link
                href="/ideas"
                className={clasesDeBoton({ variante: "secundario", tamano: "chico", className: "w-fit" })}
              >
                Elegir ideas
              </Link>
            </div>
          ) : null}
          {calendario.mes.porSubir.length > 0 ? (
            <Seccion titulo="Para subir" id="por-subir" cifra={calendario.mes.porSubir.length}>
              <Grupo lista>
                {calendario.mes.porSubir.map((fila) => (
                  <FilaPieza
                    key={fila.piezaId}
                    titulo={fila.titulo}
                    estado={`Para subir a ${fila.pendientes} · ${fila.fecha}`}
                    pilar={fila.pilar}
                    href={`/video/${fila.piezaId}`}
                  />
                ))}
              </Grupo>
            </Seccion>
          ) : null}
          {calendario.mes.proximos.length > 0 ? (
            <Seccion titulo="Próximos" id="proximos" cifra={calendario.mes.proximos.length}>
              <Grupo plano lista>
                {calendario.mes.proximos.map((proxima) => (
                  <FilaPieza
                    key={proxima.piezaId}
                    titulo={proxima.titulo}
                    estado={proxima.fecha}
                    pilar={proxima.pilar}
                  />
                ))}
              </Grupo>
            </Seccion>
          ) : null}
        </>
      ) : null}
      {vista === "agenda" ? (
        <div className="mt-6">
          <AgendaDelCalendario
            semanas={calendario.agenda.semanas}
            porRepartir={calendario.agenda.porRepartir}
            alternativas={calendario.agenda.alternativas}
            acciones={{ repartir: repartirFechasAccion, cambiar: cambiarPropuestaAccion }}
          />
        </div>
      ) : null}
      {vista === "ritmo" ? (
        <div className="mt-6">
          <RitmoDelCalendario ritmo={calendario.ritmo} />
        </div>
      ) : null}
    </div>
  )
}
