import { Suspense } from "react"
import { FORMULARIO_Y_PANEL, INTRO_DE_PAGINA } from "@/components/pagina-en-columnas"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { Volver } from "@/components/ui/volver"
import { avisoDeInstagram } from "@/lib/ajustes/instagram-aviso"
import { avisoDeLinkedin } from "@/lib/ajustes/linkedin-aviso"
import { filaDeCuenta } from "@/lib/ajustes/presentar"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { desconectarLinkedinAccion, guardarLlaveAccion } from "../acciones"
import { BloqueDeEstado } from "../bloque-de-estado"
import { CuentasConectadas } from "../cuentas-conectadas"
import { revisionDeCuentas } from "../revision"
import { SaldosDeLaPagina } from "../saldos"

/** «Cuentas» as its own level of Ajustes (decision 12): each account, its keys and the balances. */
export default async function Cuentas({
  searchParams,
}: {
  searchParams: Promise<{ instagram?: string; linkedin?: string; federico?: string }>
}) {
  const { db } = await exigirConi()
  const { instagram, linkedin, federico } = await searchParams
  const { data: ajustes, error } = await db.from("ajustes").select("zona").maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  if (!ajustes) throw new Error("Falta la fila de ajustes.")
  const { count: dispositivos, error: errorDeDispositivos } = await db
    .from("suscripciones_push")
    .select("id", { count: "exact", head: true })
  if (errorDeDispositivos) throw new Error(`No pude leer tus aparatos: ${errorDeDispositivos.message}`)
  // Only the fixed word: anything else in the address leaves «Le avisé a Federico.» out.
  const avisado = federico === "avisado"
  const aviso = avisoDeInstagram(instagram, avisado) ?? avisoDeLinkedin(linkedin, avisado)

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Cuentas</h1>
      <p className={cn("mt-1.5 text-meta text-apagado", INTRO_DE_PAGINA)}>
        Conectadas a Conidolly: lo que la app necesita para escribir, grabar y publicar.
      </p>

      {/* On a phone the first block's 24 px fold through the grid's box; on a computer the grid takes them. */}
      <div className={cn(FORMULARIO_Y_PANEL, "md:mt-6")}>
        <div data-testid="pagina-principal" className="md:[&>:first-child]:mt-0">
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
        </div>

        {/* Its section has no top margin of its own: the panel brings the phone's 32 px. */}
        <div data-testid="pagina-panel" className="mt-8 md:mt-0">
          <Seccion titulo="Saldos" id="saldos">
            <Suspense fallback={<EsqueletoDeCuentas />}>
              <SaldosDeLaPagina zona={ajustes.zona} />
            </Suspense>
          </Seccion>
        </div>
      </div>
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
