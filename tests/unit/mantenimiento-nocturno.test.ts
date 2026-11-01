// @vitest-environment node
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import { type DepsNocturno, mantenimientoNocturno } from "@/lib/mantenimiento/ejecutar"
import { borrarHuellaDeVisitas } from "@/lib/mantenimiento/huella"
import { recordarRevisionDeInventario } from "@/lib/mantenimiento/revision-de-inventario"
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
  it("deletes the visitor hashes and checks the yearly review every night, after the backup", async () => {
    const resultado = await mantenimientoNocturno(DEPS)

    expect(Object.keys(resultado)).toEqual([
      "retencion",
      "token",
      "linkedin",
      "numerosLinkedin",
      "respaldo",
      "huella",
      "revisionDeInventario",
      "fusiones",
    ])
    expect(resultado.huella).toEqual({ huellas: 2 })
    expect(resultado.revisionDeInventario).toBe("al_dia")
    expect(borrarHuellaDeVisitas).toHaveBeenCalledWith(DEPS)
    expect(recordarRevisionDeInventario).toHaveBeenCalledWith(DEPS)
  })
})
