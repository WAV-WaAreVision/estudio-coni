// @vitest-environment node
import { describe, expect, it } from "vitest"
import { respaldarBase } from "@/lib/mantenimiento/respaldo"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"

const AHORA = "2031-03-14T12:00:00.000Z"

function doble(volcado: () => Promise<Uint8Array>, ahora = AHORA) {
  const almacen = almacenEnMemoria()
  const avisos = notificadorEnMemoria()
  return { deps: { almacen, avisos, ahora: () => ahora, volcarBase: volcado }, almacen, avisos }
}

const bytes = (n: number) => new Uint8Array(n).fill(7)

async function previo(almacen: ReturnType<typeof almacenEnMemoria>, fecha: string, n: number) {
  await almacen.subir(`respaldos/${fecha}.sql.gz`, bytes(n), "application/gzip")
}

describe("respaldarBase", () => {
  it("stores the dump as respaldos/<date>.sql.gz and says nothing when all is well", async () => {
    const { deps, almacen, avisos } = doble(async () => bytes(1000))

    expect(await respaldarBase(deps)).toEqual({ estado: "guardado", clave: "respaldos/2031-03-14.sql.gz", bytes: 1000 })

    expect(almacen.obtener("respaldos/2031-03-14.sql.gz")?.datos.byteLength).toBe(1000)
    expect(almacen.obtener("respaldos/2031-03-14.sql.gz")?.tipo).toBe("application/gzip")
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("names the file with the date in America/Santiago, not the UTC one", async () => {
    // 01:00 UTC on the 15th is still 22:00 on the 14th in Santiago (UTC-3 in March).
    const { deps, almacen } = doble(async () => bytes(10), "2031-03-15T01:00:00.000Z")

    await respaldarBase(deps)

    expect(almacen.claves()).toEqual(["respaldos/2031-03-14.sql.gz"])
  })

  it("alerts WAV and stores nothing when the dump fails", async () => {
    const { deps, almacen, avisos } = doble(async () => {
      throw new Error("pg_dump terminó con código 1: connection refused")
    })

    expect(await respaldarBase(deps)).toEqual({ estado: "fallo" })

    expect(almacen.claves()).toEqual([])
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.detalle).toContain("connection refused")
  })

  it("alerts WAV and stores nothing when the dump is empty, so an empty file never becomes the one to compare with", async () => {
    const { deps, almacen, avisos } = doble(async () => new Uint8Array(0))

    expect(await respaldarBase(deps)).toEqual({ estado: "vacio" })

    expect(almacen.claves()).toEqual([])
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("alerts WAV when the dump weighs less than 80% of the previous one, and still stores it", async () => {
    const { deps, almacen, avisos } = doble(async () => bytes(790))
    await previo(almacen, "2031-03-13", 1000)

    expect(await respaldarBase(deps)).toEqual({ estado: "mas_chico", clave: "respaldos/2031-03-14.sql.gz", bytes: 790 })

    expect(almacen.claves()).toContain("respaldos/2031-03-14.sql.gz")
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.detalle).toContain("790")
    expect(avisos.aWavEnviados[0]?.detalle).toContain("1000")
  })

  it("accepts a dump that weighs exactly 80% of the previous one", async () => {
    const { deps, almacen, avisos } = doble(async () => bytes(800))
    await previo(almacen, "2031-03-13", 1000)

    expect((await respaldarBase(deps)).estado).toBe("guardado")

    expect(avisos.aWavEnviados).toEqual([])
  })

  it("compares with the latest earlier day, not with the file of today when it runs again", async () => {
    const { deps, almacen, avisos } = doble(async () => bytes(900))
    await previo(almacen, "2031-03-13", 1000)
    await previo(almacen, "2031-03-14", 100)

    expect((await respaldarBase(deps)).estado).toBe("guardado")

    expect(almacen.obtener("respaldos/2031-03-14.sql.gz")?.datos.byteLength).toBe(900)
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("keeps 30 days of backups and deletes the older ones", async () => {
    const { deps, almacen } = doble(async () => bytes(1000))
    await previo(almacen, "2031-02-11", 1000)
    await previo(almacen, "2031-02-12", 1000)
    await previo(almacen, "2031-03-13", 1000)

    await respaldarBase(deps)

    expect(almacen.claves().sort()).toEqual([
      "respaldos/2031-02-12.sql.gz",
      "respaldos/2031-03-13.sql.gz",
      "respaldos/2031-03-14.sql.gz",
    ])
  })

  it("leaves alone anything under respaldos/ that is not a dated backup", async () => {
    const { deps, almacen } = doble(async () => bytes(1000))
    await almacen.subir("respaldos/LEEME.txt", bytes(3), "text/plain")

    await respaldarBase(deps)

    expect(almacen.claves()).toContain("respaldos/LEEME.txt")
  })
})
