import { afterAll, afterEach, describe, expect, it } from "vitest"
import { claveGrabar, claveProducir } from "@/lib/acciones/disparos"
import { type DepsArranques, reanudarArranques } from "@/lib/mantenimiento/arranques"
import { mantenimientoFrecuente } from "@/lib/mantenimiento/ejecutar"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { crearPiezaEn } from "./flujo"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const MINUTO = 60_000
const piezasCreadas: string[] = []

const dentroDe = (minutos: number) => () => new Date(Date.now() + minutos * MINUTO).toISOString()

async function pieza(
  destino: "guion_en_proceso" | "en_render",
  extra: { render_id?: string; explicacion?: string } = {},
) {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearPiezaEn(c, destino)
    await c.query("update public.piezas set render_id = $2, explicacion = $3, version = version + 1 where id = $1", [
      id,
      extra.render_id ?? null,
      extra.explicacion ?? null,
    ])
    await c.query("commit")
    piezasCreadas.push(id)
    return id
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

async function fila(id: string) {
  const { rows } = await pool.query("select * from public.piezas where id = $1", [id])
  return rows[0]
}

function doble(ahora: () => string, cambios: Partial<DepsArranques> = {}) {
  const disparos: { tarea: "grabar" | "producir"; piezaId: string; clave: string }[] = []
  const deps: DepsArranques = {
    db: clienteDeServicio(),
    ahora,
    dispararGrabacion: async (piezaId, clave) => {
      disparos.push({ tarea: "grabar", piezaId, clave })
    },
    dispararProduccion: async (piezaId, clave) => {
      disparos.push({ tarea: "producir", piezaId, clave })
    },
    ...cambios,
  }
  return { deps, disparos }
}

afterEach(async () => {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
})

describe("reanudarArranques: grabar-pieza", () => {
  it("starts the recording again, under the key of the approval, when an approved piece has no render after 10 minutes", async () => {
    const id = await pieza("en_render")
    const { deps, disparos } = doble(dentroDe(11))

    const resultado = await reanudarArranques(deps)

    expect(resultado).toEqual([{ piezaId: id, tarea: "grabar" }])
    expect(disparos).toEqual([{ tarea: "grabar", piezaId: id, clave: claveGrabar(await fila(id)) }])
  })

  it("asks for the same key on every tick, so Trigger.dev starts one run and not one every ten minutes", async () => {
    const id = await pieza("en_render")
    const primera = doble(dentroDe(11))
    const segunda = doble(dentroDe(21))

    await reanudarArranques(primera.deps)
    await reanudarArranques(segunda.deps)

    expect(segunda.disparos).toEqual(primera.disparos)
    expect(primera.disparos[0]?.piezaId).toBe(id)
  })

  it("leaves a recording that is younger than 10 minutes alone", async () => {
    await pieza("en_render")
    const { deps, disparos } = doble(dentroDe(9))

    expect(await reanudarArranques(deps)).toEqual([])
    expect(disparos).toEqual([])
  })

  it("leaves alone a piece that already has a render (reconciliation reads it) and one waiting for the cap", async () => {
    await pieza("en_render", { render_id: "v_1" })
    await pieza("en_render", { explicacion: "Llegaste al tope de gasto de este mes." })
    const { deps, disparos } = doble(dentroDe(40))

    expect(await reanudarArranques(deps)).toEqual([])
    expect(disparos).toEqual([])
  })
})

describe("reanudarArranques: producir-pieza", () => {
  it("starts the script again, under the key of its round, when it has no explanation after 15 minutes", async () => {
    const id = await pieza("guion_en_proceso")
    const { deps, disparos } = doble(dentroDe(16))

    const resultado = await reanudarArranques(deps)

    expect(resultado).toEqual([{ piezaId: id, tarea: "producir" }])
    expect(disparos).toEqual([{ tarea: "producir", piezaId: id, clave: claveProducir(await fila(id)) }])
  })

  it("leaves a script that is younger than 15 minutes alone", async () => {
    await pieza("guion_en_proceso")
    const { deps, disparos } = doble(dentroDe(14))

    expect(await reanudarArranques(deps)).toEqual([])
    expect(disparos).toEqual([])
  })

  it("leaves alone a script with an explanation: Coni retries it from the screen", async () => {
    await pieza("guion_en_proceso", { explicacion: "No pude empezar a escribir el guion." })
    const { deps, disparos } = doble(dentroDe(60))

    expect(await reanudarArranques(deps)).toEqual([])
    expect(disparos).toEqual([])
  })
})

describe("reanudarArranques: failures", () => {
  it("keeps going when one start fails and raises the failures at the end", async () => {
    const roto = await pieza("en_render")
    const bueno = await pieza("guion_en_proceso")
    const { deps, disparos } = doble(dentroDe(30), {
      dispararGrabacion: async () => {
        throw new Error("Trigger.dev no responde")
      },
    })

    const error = await reanudarArranques(deps).then(
      () => new Error("se esperaba un rechazo"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    )

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toContain(roto)
    expect(disparos).toMatchObject([{ tarea: "producir", piezaId: bueno }])
  })
})

describe("mantenimientoFrecuente", () => {
  it("includes the restart of runs that never started, next to the reconciliation and the spend sweeper", async () => {
    const id = await pieza("en_render")
    const { deps, disparos } = doble(dentroDe(11))

    const resultado = await mantenimientoFrecuente({
      ...deps,
      avisos: notificadorEnMemoria(),
      temas: async () => null,
    })

    expect(resultado.arranques).toEqual([{ piezaId: id, tarea: "grabar" }])
    expect(disparos).toMatchObject([{ tarea: "grabar", piezaId: id }])
  })
})
