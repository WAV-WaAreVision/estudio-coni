import { CaretLeft } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { AgendaDelCalendario } from "@/components/agenda-del-calendario"
import { FilaPieza } from "@/components/fila-pieza"
import { MesDelCalendario } from "@/components/mes-del-calendario"
import { RitmoDelCalendario } from "@/components/ritmo-del-calendario"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { esVista, VistasDelCalendario } from "@/components/vistas-del-calendario"
import { construirCalendario } from "@/lib/calendario/modelo"
import { leerDatosDeCalendario } from "@/lib/datos/calendario"
import { exigirConi } from "@/lib/sesion/coni"

export default async function Calendario({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const [{ db }, { vista: pedida }] = await Promise.all([exigirConi(), searchParams])
  const vista = esVista(pedida) ? pedida : "mes"
  const ahora = Date.now()
  const datos = await leerDatosDeCalendario(db, ahora)
  const calendario = construirCalendario({ ...datos, ahora })

  return (
    <div>
      <header className="grid gap-1">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta"
        >
          <CaretLeft aria-hidden="true" size={ICONO.medio} />
          Inicio
        </Link>
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
              <ul>
                {calendario.mes.porSubir.map((fila) => (
                  <FilaPieza
                    key={fila.piezaId}
                    titulo={fila.titulo}
                    estado={`Para subir a ${fila.pendientes} · ${fila.fecha}`}
                    pilar={fila.pilar}
                    href={`/video/${fila.piezaId}`}
                  />
                ))}
              </ul>
            </Seccion>
          ) : null}
          {calendario.mes.proximos.length > 0 ? (
            <Seccion titulo="Próximos" id="proximos" cifra={calendario.mes.proximos.length}>
              <ul>
                {calendario.mes.proximos.map((proxima) => (
                  <FilaPieza
                    key={proxima.piezaId}
                    titulo={proxima.titulo}
                    estado={proxima.fecha}
                    pilar={proxima.pilar}
                  />
                ))}
              </ul>
            </Seccion>
          ) : null}
        </>
      ) : null}
      {vista === "agenda" ? (
        <div className="mt-6">
          <AgendaDelCalendario semanas={calendario.agenda.semanas} />
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
