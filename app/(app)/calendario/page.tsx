import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { AgendaDelCalendario } from "@/components/agenda-del-calendario"
import { FilaPieza } from "@/components/fila-pieza"
import { MesDelCalendario } from "@/components/mes-del-calendario"
import { RitmoDelCalendario } from "@/components/ritmo-del-calendario"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
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
    <div className="grid gap-5">
      <header className="grid gap-3">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-label font-semibold text-acento"
        >
          <ChevronLeft aria-hidden="true" size={20} />
          Inicio
        </Link>
        <h1 className="font-serif text-display capitalize">{calendario.mes.nombre}</h1>
      </header>

      <VistasDelCalendario activa={vista} />

      {vista === "mes" ? (
        <>
          <MesDelCalendario celdas={calendario.mes.celdas} />
          {calendario.mes.sinPublicaciones ? (
            <div className="grid gap-2 py-1">
              <p className="font-semibold">Nada programado este mes.</p>
              <Link href="/ideas" className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "w-fit" })}>
                Elegir ideas
              </Link>
            </div>
          ) : null}
          {calendario.mes.proximos.length > 0 ? (
            <Seccion titulo="Próximos" id="proximos">
              <ul>
                {calendario.mes.proximos.map((proxima) => (
                  <FilaPieza key={proxima.piezaId} titulo={proxima.titulo} meta={proxima.fecha} pilar={proxima.pilar} />
                ))}
              </ul>
            </Seccion>
          ) : null}
        </>
      ) : null}
      {vista === "agenda" ? <AgendaDelCalendario semanas={calendario.agenda.semanas} /> : null}
      {vista === "ritmo" ? <RitmoDelCalendario ritmo={calendario.ritmo} /> : null}
    </div>
  )
}
