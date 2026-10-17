import { Suspense } from "react"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { Volver } from "@/components/ui/volver"
import { avisoDeInstagram } from "@/lib/ajustes/instagram-aviso"
import { avisoDeLinkedin } from "@/lib/ajustes/linkedin-aviso"
import { filaDeCuenta } from "@/lib/ajustes/presentar"
import { exigirConi } from "@/lib/sesion/coni"
import { desconectarLinkedinAccion, guardarLlaveAccion } from "../acciones"
import { BloqueDeEstado } from "../bloque-de-estado"
import { CuentasConectadas } from "../cuentas-conectadas"
import { revisionDeCuentas } from "../revision"
import { SaldosDeLaPagina } from "../saldos"

/** «Cuentas» as its own level of Ajustes (decision 12): each account, its keys and the balances. */
export default async function Cuentas({
  searchParams,
}: {
  searchParams: Promise<{ instagram?: string; linkedin?: string }>
}) {
  const { db } = await exigirConi()
  const { instagram, linkedin } = await searchParams
  const { data: ajustes, error } = await db.from("ajustes").select("zona").maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  if (!ajustes) throw new Error("Falta la fila de ajustes.")
  const { count: dispositivos, error: errorDeDispositivos } = await db
    .from("suscripciones_push")
    .select("id", { count: "exact", head: true })
  if (errorDeDispositivos) throw new Error(`No pude leer tus aparatos: ${errorDeDispositivos.message}`)
  const aviso = avisoDeInstagram(instagram) ?? avisoDeLinkedin(linkedin)

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Cuentas</h1>
      <p className="mt-1.5 text-meta text-apagado">
        Conectadas a Conidolly: lo que la app necesita para escribir, grabar y publicar.
      </p>

      {aviso ? (
        <Bloque tipo={aviso.tipo} titulo={aviso.titulo} className="mt-6">
          {aviso.texto}
        </Bloque>
      ) : null}

      <div className="mt-6">
        <Suspense fallback={null}>
          <BloqueDeEstado zona={ajustes.zona} avisosActivos={(dispositivos ?? 0) > 0} mostrar="bueno" />
        </Suspense>
      </div>

      <section aria-label="Cuentas" className="mt-8">
        <Suspense fallback={<EsqueletoDeCuentas />}>
          <CuentasDeLaPagina />
        </Suspense>
      </section>

      <Seccion titulo="Saldos" id="saldos">
        <Suspense fallback={<EsqueletoDeCuentas />}>
          <SaldosDeLaPagina zona={ajustes.zona} />
        </Suspense>
      </Seccion>
    </div>
  )
}

async function CuentasDeLaPagina() {
  const ahora = Date.now()
  const filas = (await revisionDeCuentas()).map((estado) => filaDeCuenta(estado, ahora))
  return (
    <CuentasConectadas
      filas={filas}
      guardarLlave={guardarLlaveAccion}
      desconectarLinkedin={desconectarLinkedinAccion}
    />
  )
}

function EsqueletoDeCuentas() {
  return (
    <output className="grid gap-3" aria-label="Revisando las cuentas">
      {[0, 1, 2, 3, 4].map((fila) => (
        <div key={fila} className="esqueleto h-3 w-full" />
      ))}
    </output>
  )
}
