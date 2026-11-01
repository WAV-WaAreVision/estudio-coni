// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import { fusionarTemas } from "@/lib/ingesta/temas"
import { type DepsNocturno, mantenimientoNocturno } from "@/lib/mantenimiento/ejecutar"
import { borrarHuellaDeVisitas } from "@/lib/mantenimiento/huella"
import { recordarRevisionDeInventario } from "@/lib/mantenimiento/revision-de-inventario"
import type { DepsMantenimientoTemas } from "@/lib/mantenimiento/temas"
import { leerInterruptores } from "@/lib/presupuesto/interruptores"
import { avisarLimite } from "@/lib/presupuesto/limite"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

vi.mock("@/lib/mantenimiento/retencion", () => ({ aplicarRetencion: vi.fn(async () => ({ piezas: 0, archivos: 0 })) }))
vi.mock("@/lib/mantenimiento/token-meta", () => ({ mantenerTokenMeta: vi.fn(async () => "sin_token") }))
vi.mock("@/lib/mantenimiento/token-linkedin", () => ({ mantenerTokenLinkedin: vi.fn(async () => "sin_conexion") }))
vi.mock("@/lib/mantenimiento/numeros-linkedin", () => ({ recordarNumerosDeLinkedin: vi.fn(async () => "al_dia") }))
vi.mock("@/lib/mantenimiento/respaldo", () => ({ respaldarBase: vi.fn(async () => ({ estado: "vacio" })) }))
vi.mock("@/lib/mantenimiento/huella", () => ({ borrarHuellaDeVisitas: vi.fn(async () => ({ huellas: 2 })) }))
vi.mock("@/lib/mantenimiento/revision-de-inventario", () => ({
  recordarRevisionDeInventario: vi.fn(async () => "al_dia"),
}))
vi.mock("@/lib/ingesta/temas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingesta/temas")>()),
  fusionarTemas: vi.fn(async () => ({ tope: false, fusionados: 0 })),
}))
vi.mock("@/lib/presupuesto/interruptores", () => ({
  leerInterruptores: vi.fn(async () => ({ motorSemanal: true, fusionesNocturnas: true })),
}))
vi.mock("@/lib/presupuesto/limite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/presupuesto/limite")>()),
  avisarLimite: vi.fn(async () => {}),
}))

const DEPS: DepsNocturno = {
  // Never reached: every step is mocked. A real client keeps the type honest without a cast.
  db: createClient<Database>("http://127.0.0.1:9", "clave-de-prueba"),
  almacen: almacenEnMemoria(),
  avisos: notificadorEnMemoria(),
  ahora: () => "2026-11-02T06:00:00.000Z",
  anotarBorrado: async () => {},
  volcarBase: async () => new Uint8Array(),
  temas: async () => null,
}

describe("mantenimientoNocturno", () => {
  it("deletes the visitor hashes before the backup (so it keeps only yesterday's) and checks the yearly review every night", async () => {
    const resultado = await mantenimientoNocturno(DEPS)

    expect(Object.keys(resultado)).toEqual([
      "retencion",
      "token",
      "linkedin",
      "numerosLinkedin",
      "huella",
      "respaldo",
      "revisionDeInventario",
      "fusiones",
    ])
    expect(resultado.huella).toEqual({ huellas: 2 })
    expect(resultado.revisionDeInventario).toBe("al_dia")
    expect(borrarHuellaDeVisitas).toHaveBeenCalledWith(DEPS)
    expect(recordarRevisionDeInventario).toHaveBeenCalledWith(DEPS)
  })
})

const TEMAS: DepsMantenimientoTemas = {
  db: DEPS.db,
  almacen: almacenEnMemoria(),
  ahora: DEPS.ahora,
  claude: new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  llaveVoyage: () => undefined,
}

describe("las fusiones nocturnas", () => {
  it("are skipped, as «apagado» and not as a failure, when Coni turned them off", async () => {
    vi.mocked(leerInterruptores).mockResolvedValueOnce({ motorSemanal: true, fusionesNocturnas: false })

    const resultado = await mantenimientoNocturno({ ...DEPS, temas: async () => TEMAS })

    expect(resultado.fusiones).toEqual({ apagado: true })
    expect(fusionarTemas).not.toHaveBeenCalled()
  })

  it("tell Coni when the month's limit stops them", async () => {
    vi.mocked(fusionarTemas).mockResolvedValueOnce({ tope: true, fusionados: 0 })

    const resultado = await mantenimientoNocturno({ ...DEPS, temas: async () => TEMAS })

    expect(resultado.fusiones).toEqual({ tope: true, fusionados: 0 })
    expect(avisarLimite).toHaveBeenCalledWith(expect.objectContaining({ avisos: DEPS.avisos }), DEPS.ahora())
  })
})
