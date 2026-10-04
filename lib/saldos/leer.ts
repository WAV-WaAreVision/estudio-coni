import type { SaldoElevenlabs, SaldoHeygen, Saldos } from "@/lib/dominio/saldos"

export interface DepsSaldos {
  /** Reads a provider key from the Vault (service client). */
  leerLlave: (nombre: "elevenlabs" | "heygen") => Promise<string | null>
  elevenlabs: (clave: string) => Promise<SaldoElevenlabs>
  heygen: (clave: string) => Promise<SaldoHeygen>
  ahora: () => number
  vigencia?: { okMs: number; fallaMs: number }
}

const VIGENCIA = { okMs: 60_000, fallaMs: 15_000 }
const FALLIDOS: Saldos = { elevenlabs: { ok: false, motivo: "error" }, heygen: { ok: false, motivo: "error" } }

/**
 * Both balances, cached per server instance: a minute when they answered, 15 seconds when not, and one request shared
 * by callers that arrive together. A failure is a value ("No pude ver tu saldo"), never an exception for the page.
 */
export function lectorDeSaldos(deps: DepsSaldos): () => Promise<Saldos> {
  const vigencia = deps.vigencia ?? VIGENCIA
  let guardado: { saldos: Saldos; hasta: number } | null = null
  let enCurso: Promise<Saldos> | null = null

  async function consultar(): Promise<Saldos> {
    const [llaveVoz, llaveVideo] = await Promise.all([deps.leerLlave("elevenlabs"), deps.leerLlave("heygen")])
    const [elevenlabs, heygen] = await Promise.all([
      llaveVoz === null ? ({ ok: false, motivo: "sin_llave" } as const) : deps.elevenlabs(llaveVoz),
      llaveVideo === null ? ({ ok: false, motivo: "sin_llave" } as const) : deps.heygen(llaveVideo),
    ])
    return { elevenlabs, heygen }
  }

  return async () => {
    if (guardado !== null && guardado.hasta > deps.ahora()) return guardado.saldos
    if (enCurso !== null) return enCurso
    enCurso = consultar()
      .catch((error: unknown) => {
        console.error("No pude leer los saldos", error)
        return FALLIDOS
      })
      .then((saldos) => {
        for (const [proveedor, saldo] of Object.entries(saldos)) {
          if (!saldo.ok) console.error(`No pude ver el saldo de ${proveedor}: ${saldo.motivo}`)
        }
        const todosOk = saldos.elevenlabs.ok && saldos.heygen.ok
        guardado = { saldos, hasta: deps.ahora() + (todosOk ? vigencia.okMs : vigencia.fallaMs) }
        return saldos
      })
      .finally(() => {
        enCurso = null
      })
    return enCurso
  }
}
