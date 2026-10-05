import { CaretLeft } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Suspense } from "react"
import { Seccion } from "@/components/seccion"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { avisoDeInstagram } from "@/lib/ajustes/instagram-aviso"
import { filaDeCuenta } from "@/lib/ajustes/presentar"
import { exigirConi } from "@/lib/sesion/coni"
import { guardarLlaveAccion } from "../acciones"
import { BloqueDeEstado } from "../bloque-de-estado"
import { CuentasConectadas } from "../cuentas-conectadas"
import { revisionDeCuentas } from "../revision"
import { SaldosDeLaPagina } from "../saldos"

const TIPO_DE_AVISO = { ok: "exito", aviso: "aviso", error: "error" } as const

/** «Cuentas conectadas» as its own level of Ajustes (brandkit 9.21): each account, its keys and the balances. */
export default async function Cuentas({ searchParams }: { searchParams: Promise<{ instagram?: string }> }) {
  const { db } = await exigirConi()
  const { instagram } = await searchParams
  const { data: ajustes, error } = await db.from("ajustes").select("zona").maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  if (!ajustes) throw new Error("Falta la fila de ajustes.")
  const { count: dispositivos, error: errorDeDispositivos } = await db
    .from("suscripciones_push")
    .select("id", { count: "exact", head: true })
  if (errorDeDispositivos) throw new Error(`No pude leer tus aparatos: ${errorDeDispositivos.message}`)
  const aviso = avisoDeInstagram(instagram)

  return (
    <div>
      <Link
        href="/ajustes"
        className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-cuerpo font-medium text-tinta"
      >
        <CaretLeft aria-hidden="true" size={20} />
        Ajustes
      </Link>
      <h1 className="mt-1 text-pantalla text-balance">Cuentas conectadas</h1>

      {aviso ? (
        <div className="mt-6">
          <LineaDeEstado tipo={TIPO_DE_AVISO[aviso.tipo]} titulo={aviso.titulo} tituloEnTinta detalle={aviso.texto} />
        </div>
      ) : null}

      <div className="mt-6">
        <Suspense fallback={null}>
          <BloqueDeEstado zona={ajustes.zona} avisosActivos={(dispositivos ?? 0) > 0} mostrar="bueno" />
        </Suspense>
      </div>

      <Seccion titulo="Cuentas" id="cuentas">
        <Suspense fallback={<EsqueletoDeCuentas />}>
          <CuentasDeLaPagina />
        </Suspense>
      </Seccion>

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
  return <CuentasConectadas filas={filas} guardarLlave={guardarLlaveAccion} />
}

function EsqueletoDeCuentas() {
  return (
    <output className="grid gap-3" aria-label="Revisando las cuentas">
      {[0, 1, 2, 3].map((fila) => (
        <div key={fila} className="esqueleto h-3 w-full" />
      ))}
    </output>
  )
}
