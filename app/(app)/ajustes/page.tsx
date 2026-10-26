import { Suspense } from "react"
import { FilaNavegacion } from "@/components/ui/filas"
import { leerPresupuesto } from "@/lib/datos/pantallas"
import { destinosPorDefecto } from "@/lib/dominio/destinos"
import { linkedinConectadoEn } from "@/lib/dominio/linkedin"
import { exigirConi } from "@/lib/sesion/coni"
import { cerrarSesionAccion } from "../acciones"
import { enviarPruebaAccion, guardarAjusteAccion, guardarSuscripcionAccion, quitarSuscripcionAccion } from "./acciones"
import { AvisosDelCelular } from "./avisos-del-celular"
import { BloqueDeEstado } from "./bloque-de-estado"
import { CerrarSesion } from "./cerrar-sesion"
import { EditorDeAjustes } from "./editor-de-ajustes"

export default async function Ajustes() {
  const { db } = await exigirConi()
  const { data: ajustes, error } = await db.from("ajustes").select("*").maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  if (!ajustes) throw new Error("Falta la fila de ajustes.")
  const presupuesto = await leerPresupuesto(db, Date.now(), ajustes.zona)
  const { count: dispositivos, error: errorDeDispositivos } = await db
    .from("suscripciones_push")
    .select("id", { count: "exact", head: true })
  if (errorDeDispositivos) throw new Error(`No pude leer tus aparatos: ${errorDeDispositivos.message}`)
  // Read at request time on purpose: it is not a NEXT_PUBLIC variable, so the build does not freeze it.
  const claveVapid = process.env.VAPID_PUBLIC_KEY || null

  return (
    <div>
      <h1 className="text-pantalla">Ajustes</h1>

      <div className="mt-6">
        <Suspense fallback={<EsqueletoDelBloque />}>
          <BloqueDeEstado zona={ajustes.zona} avisosActivos={(dispositivos ?? 0) > 0} mostrar="pendiente" />
        </Suspense>
      </div>

      <div className="mt-10">
        <EditorDeAjustes
          inicial={{
            meta: ajustes.meta === "talleres" || ajustes.meta === "marca" ? ajustes.meta : "consultas",
            dias: ajustes.dias_publicacion,
            hora: ajustes.hora_publicacion.slice(0, 5),
            tope: Number(ajustes.tope_mensual_usd),
            usado: presupuesto.usado,
            avisosResumen: ajustes.avisos_resumen,
            avisosUrgentes: ajustes.avisos_urgentes,
            destinos: destinosPorDefecto(ajustes.destinos_por_defecto),
          }}
          acciones={{ guardar: guardarAjusteAccion }}
          linkedinConectado={linkedinConectadoEn(ajustes, Date.now())}
          paraWav={<FilaNavegacion href="/ajustes/cuentas">Cuentas conectadas</FilaNavegacion>}
          avisosDelCelular={
            <AvisosDelCelular
              claveVapid={claveVapid}
              acciones={{
                guardar: guardarSuscripcionAccion,
                quitar: quitarSuscripcionAccion,
                probar: enviarPruebaAccion,
              }}
            />
          }
        />
      </div>

      <div className="mt-6">
        <CerrarSesion cerrar={cerrarSesionAccion} />
      </div>
    </div>
  )
}

function EsqueletoDelBloque() {
  return (
    <output className="grid gap-3" aria-label="Revisando las cuentas">
      <div className="esqueleto h-3 w-2/3" />
      <div className="esqueleto h-3 w-4/5" />
    </output>
  )
}
