import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import {
  EDAD_DE_CORRIDA_MUERTA_MS,
  MOTIVO_CORRIDA_MUERTA,
  rescatarCorridasMuertas,
} from "@/lib/mantenimiento/corridas-muertas"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const materiales: string[] = []
const autores: string[] = []

afterAll(async () => {
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

const haceHoras = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000).toISOString()
const ahora = () => new Date().toISOString()

async function tomado(
  corridaDesde: string | null,
  extra: { estado?: "listo" | "procesando" | "fallido"; motivo?: string } = {},
): Promise<string> {
  const autor = await sembrarAutor(`Autora de corrida ${SUFIJO} ${randomUUID().slice(0, 4)}`)
  autores.push(autor)
  const id = await sembrarMaterial({
    titulo: `Corrida ${SUFIJO}`,
    autorId: autor,
    estado: extra.estado ?? "procesando",
    creadoEn: haceHoras(24),
    motivo: extra.motivo,
  })
  materiales.push(id)
  await pool.query("update public.materiales set corrida_id = $2, corrida_desde = $3 where id = $1", [
    id,
    corridaDesde ? "run_muerta" : null,
    corridaDesde,
  ])
  return id
}

async function fila(id: string) {
  const { rows } = await pool.query<{
    estado: string
    motivo_fallo: string | null
    corrida_id: string | null
    corrida_desde: string | null
  }>("select estado, motivo_fallo, corrida_id, corrida_desde from public.materiales where id = $1", [id])
  return rows[0]
}

describe("rescatarCorridasMuertas", () => {
  it("waits two hours: far past the 30-minute limit of one attempt of procesar-material", () => {
    expect(EDAD_DE_CORRIDA_MUERTA_MS).toBe(2 * 60 * 60 * 1000)
  })

  it("releases a run that has not renewed its claim in two hours and gives Coni Reintentar", async () => {
    const muerta = await tomado(haceHoras(3))

    const resultado = await rescatarCorridasMuertas({ db: clienteDeServicio(), ahora })

    expect(resultado.materiales).toContain(muerta)
    expect(await fila(muerta)).toEqual({
      estado: "procesando",
      motivo_fallo: MOTIVO_CORRIDA_MUERTA,
      corrida_id: null,
      corrida_desde: null,
    })
  })

  it("leaves a live run, an untaken material, a ready one and one marked to delete alone", async () => {
    const viva = await tomado(haceHoras(1))
    const sinCorrida = await tomado(null)
    const listo = await tomado(haceHoras(3), { estado: "listo" })
    const marcado = await tomado(haceHoras(3))
    await pool.query("update public.materiales set borrar_desde = now() where id = $1", [marcado])

    const resultado = await rescatarCorridasMuertas({ db: clienteDeServicio(), ahora })

    for (const id of [viva, sinCorrida, listo, marcado]) expect(resultado.materiales).not.toContain(id)
    expect((await fila(viva))?.corrida_id).toBe("run_muerta")
    expect((await fila(viva))?.motivo_fallo).toBeNull()
    expect((await fila(listo))?.corrida_id).toBe("run_muerta")
    expect((await fila(marcado))?.corrida_id).toBe("run_muerta")
  })
})
