import { Suspense } from "react"
import { Nota } from "@/components/nota"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { avisoDeInstagram } from "@/lib/ajustes/instagram-aviso"
import { filaDeCuenta } from "@/lib/ajustes/presentar"
import { leerPresupuesto } from "@/lib/datos/pantallas"
import { exigirConi } from "@/lib/sesion/coni"
import { cerrarSesionAccion } from "../acciones"
import {
  enviarPruebaAccion,
  guardarAjusteAccion,
  guardarLlaveAccion,
  guardarSuscripcionAccion,
  quitarSuscripcionAccion,
} from "./acciones"
import { AvisosDelCelular } from "./avisos-del-celular"
import { BloqueDeEstado } from "./bloque-de-estado"
import { CuentasConectadas } from "./cuentas-conectadas"
import { EditorDeAjustes } from "./editor-de-ajustes"
import { revisionDeCuentas } from "./revision"

export default async function Ajustes({ searchParams }: { searchParams: Promise<{ instagram?: string }> }) {
  const { db } = await exigirConi()
  const { instagram } = await searchParams
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
  const aviso = avisoDeInstagram(instagram)

  return (
    <div className="grid gap-5.5">
      <h1 className="font-serif text-display">Ajustes</h1>

      {aviso ? (
        <Nota tipo={aviso.tipo} titulo={aviso.titulo}>
          {aviso.texto ? <p>{aviso.texto}</p> : null}
        </Nota>
      ) : null}

      <Suspense fallback={<EsqueletoDelBloque />}>
        <BloqueDeEstado zona={ajustes.zona} avisosActivos={(dispositivos ?? 0) > 0} />
      </Suspense>

      <Seccion titulo="Avisos en tu celular" id="avisos">
        <AvisosDelCelular
          claveVapid={claveVapid}
          acciones={{
            guardar: guardarSuscripcionAccion,
            quitar: quitarSuscripcionAccion,
            probar: enviarPruebaAccion,
          }}
        />
      </Seccion>

      <EditorDeAjustes
        inicial={{
          meta: ajustes.meta === "talleres" || ajustes.meta === "marca" ? ajustes.meta : "consultas",
          dias: ajustes.dias_publicacion,
          hora: ajustes.hora_publicacion.slice(0, 5),
          tope: Number(ajustes.tope_mensual_usd),
          usado: presupuesto.usado,
          avisosResumen: ajustes.avisos_resumen,
          avisosUrgentes: ajustes.avisos_urgentes,
        }}
        acciones={{ guardar: guardarAjusteAccion }}
      />

      <Seccion titulo="Cuentas conectadas" id="cuentas">
        <Suspense fallback={<EsqueletoDeCuentas />}>
          <CuentasDeLaPagina />
        </Suspense>
      </Seccion>

      <form action={cerrarSesionAccion}>
        <Boton type="submit" variante="callado">
          Cerrar sesión
        </Boton>
      </form>
    </div>
  )
}

async function CuentasDeLaPagina() {
  const ahora = Date.now()
  const filas = (await revisionDeCuentas()).map((estado) => filaDeCuenta(estado, ahora))
  return <CuentasConectadas filas={filas} guardarLlave={guardarLlaveAccion} />
}

function EsqueletoDelBloque() {
  return (
    <output className="grid gap-2.5 rounded-lg bg-hundido p-4.5" aria-label="Revisando las cuentas">
      <div className="esqueleto h-5 w-2/3" />
      <div className="esqueleto h-3.5 w-4/5" />
    </output>
  )
}

function EsqueletoDeCuentas() {
  return (
    <output className="grid gap-3" aria-label="Revisando las cuentas">
      {[0, 1, 2, 3].map((fila) => (
        <div key={fila} className="esqueleto h-5 w-full" />
      ))}
    </output>
  )
}
