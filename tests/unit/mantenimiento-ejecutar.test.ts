// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { existeAviso } from "@/lib/avisos/registro"
import { type DepsFrecuente, enSerie, mantenimientoFrecuente } from "@/lib/mantenimiento/ejecutar"
import type { DepsMantenimientoTemas } from "@/lib/mantenimiento/temas"
import { avisarLimite } from "@/lib/presupuesto/limite"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

vi.mock("@/lib/mantenimiento/arranques", () => ({ reanudarArranques: vi.fn(async () => []) }))
vi.mock("@/lib/mantenimiento/conciliar", () => ({ conciliarRenders: vi.fn(async () => []) }))
vi.mock("@/lib/mantenimiento/voces", () => ({ devolverVocesTrabadas: vi.fn(async () => 0) }))
vi.mock("@/lib/mantenimiento/borrado-diferido", () => ({
  borrarLoMarcado: vi.fn(async () => ({ materiales: 0, carpetasPendientes: [] })),
}))
vi.mock("@/lib/mantenimiento/materiales-abandonados", () => ({
  barrerMaterialesAbandonados: vi.fn(async () => ({ materiales: [], carpetasPendientes: [] })),
}))
vi.mock("@/lib/mantenimiento/pausas", () => ({ cerrarPausas: vi.fn(async () => ({ cerradas: [], abiertas: [] })) }))
vi.mock("@/lib/mantenimiento/gastos", () => ({ barrerGastos: vi.fn(async () => ({ confirmados: 0, liberados: 0 })) }))
vi.mock("@/lib/mantenimiento/temas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mantenimiento/temas")>()),
  mantenerTemas: vi.fn(async () => ({ tope: true, embebidas: 0, asignadas: 0, formacion: null, pausa: null })),
}))
// The temas step reads the open pauses first; the DB below is never reached.
vi.mock("@/lib/datos/pausas", () => ({ leerPausasAbiertas: vi.fn(async () => []) }))
vi.mock("@/lib/avisos/registro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/avisos/registro")>()),
  existeAviso: vi.fn(async () => false),
}))
vi.mock("@/lib/presupuesto/limite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/presupuesto/limite")>()),
  avisarLimite: vi.fn(async () => {}),
}))

beforeEach(() => vi.clearAllMocks())

describe("enSerie", () => {
  it("runs every job even when one fails, and raises all the failures at the end", async () => {
    const corridos: string[] = []
    const trabajos = {
      uno: async () => {
        corridos.push("uno")
        throw new Error("falló uno")
      },
      dos: async () => {
        corridos.push("dos")
        return 2
      },
      tres: async () => {
        corridos.push("tres")
        throw new Error("falló tres")
      },
    }

    const error = await enSerie(trabajos).then(
      () => new Error("se esperaba un rechazo"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    )

    expect(corridos).toEqual(["uno", "dos", "tres"])
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toContain("uno: falló uno")
    expect(error.message).toContain("tres: falló tres")
  })

  it("returns what each job returned when none fails", async () => {
    expect(await enSerie({ a: async () => 1, b: async () => "x" })).toEqual({ a: 1, b: "x" })
  })
})

// Never reached: every step is mocked. A real client keeps the type honest without a cast.
const DB = createClient<Database>("http://127.0.0.1:9", "clave-de-prueba")
const TEMAS: DepsMantenimientoTemas = {
  db: DB,
  almacen: almacenEnMemoria(),
  ahora: () => "2026-11-02T06:00:00.000Z",
  claude: new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  llaveVoyage: () => undefined,
}
const ALMACEN = almacenEnMemoria()
const FRECUENTE: DepsFrecuente = {
  db: DB,
  almacen: () => ALMACEN,
  avisos: notificadorEnMemoria(),
  ahora: () => "2026-11-02T06:00:00.000Z",
  dispararGrabacion: async () => undefined,
  dispararProduccion: async () => undefined,
  dispararArmado: async () => undefined,
  temas: async () => TEMAS,
  chequear: async () => ({ ok: false, motivo: "prueba" }),
}

describe("the ten-minute run", () => {
  it("closes the pauses first, then deletes what Coni marked, with the run's store and clock", async () => {
    const { borrarLoMarcado } = await import("@/lib/mantenimiento/borrado-diferido")
    const resultado = await mantenimientoFrecuente(FRECUENTE)
    expect(Object.keys(resultado).slice(0, 2)).toEqual(["pausas", "borrado"])
    expect(borrarLoMarcado).toHaveBeenCalledWith({ db: DB, almacen: ALMACEN, ahora: FRECUENTE.ahora })
  })

  it("sweeps the uploads never confirmed right after the deletion, with the run's store and clock (issue 63)", async () => {
    const { barrerMaterialesAbandonados } = await import("@/lib/mantenimiento/materiales-abandonados")
    const resultado = await mantenimientoFrecuente(FRECUENTE)
    expect(Object.keys(resultado).slice(0, 3)).toEqual(["pausas", "borrado", "abandonados"])
    expect(barrerMaterialesAbandonados).toHaveBeenCalledWith({ db: DB, almacen: ALMACEN, ahora: FRECUENTE.ahora })
  })

  it("fails only the deletion when the store cannot be built, and still runs every other job", async () => {
    const { borrarLoMarcado } = await import("@/lib/mantenimiento/borrado-diferido")
    const { reanudarArranques } = await import("@/lib/mantenimiento/arranques")
    const { conciliarRenders } = await import("@/lib/mantenimiento/conciliar")
    const { devolverVocesTrabadas } = await import("@/lib/mantenimiento/voces")
    const { barrerGastos } = await import("@/lib/mantenimiento/gastos")
    const { mantenerTemas } = await import("@/lib/mantenimiento/temas")
    const sinR2: DepsFrecuente = {
      ...FRECUENTE,
      almacen: () => {
        throw new Error("Falta R2_BUCKET")
      },
    }

    const error = await mantenimientoFrecuente(sinR2).then(
      () => new Error("se esperaba un rechazo"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    )

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toContain("borrado: Falta R2_BUCKET")
    expect(borrarLoMarcado).not.toHaveBeenCalled()
    for (const trabajo of [reanudarArranques, conciliarRenders, devolverVocesTrabadas, barrerGastos, mantenerTemas]) {
      expect(trabajo).toHaveBeenCalled()
    }
  })
})

describe("the limit notice of the ten-minute topics job", () => {
  it("fails the run when the month's first notice could not be sent", async () => {
    vi.mocked(avisarLimite).mockRejectedValueOnce(new Error("push caído"))

    const error = await mantenimientoFrecuente(FRECUENTE).then(
      () => new Error("se esperaba un rechazo"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    )

    expect(existeAviso).toHaveBeenCalledWith(DB, "limite_alcanzado:2026-11")
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toContain("temas: push caído")
  })

  it("keeps the run green and shows the pending notice when the month's notice was already registered", async () => {
    vi.mocked(existeAviso).mockResolvedValueOnce(true)
    vi.mocked(avisarLimite).mockRejectedValueOnce(new Error("push caído"))
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await mantenimientoFrecuente(FRECUENTE)

    expect(resultado.temas).toMatchObject({ tope: true, avisoPendiente: "push caído" })
    expect(registro).toHaveBeenCalled()
    registro.mockRestore()
  })

  it("does not look for the notice when the limit did not stop the job", async () => {
    const { mantenerTemas } = await import("@/lib/mantenimiento/temas")
    vi.mocked(mantenerTemas).mockResolvedValueOnce({
      tope: false,
      embebidas: 0,
      asignadas: 0,
      formacion: null,
      pausa: null,
    })

    await mantenimientoFrecuente(FRECUENTE)

    expect(existeAviso).not.toHaveBeenCalled()
    expect(avisarLimite).not.toHaveBeenCalled()
  })
})
