import type pg from "pg"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { leerDatosDelMotor } from "@/lib/motor/datos"
import { CONI, como, comoConi, comoServicio, fallaCon, pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

const vector = (valor: number, posicion = 0) =>
  `[${Array.from({ length: 1024 }, (_, i) => (i === posicion ? valor : 0)).join(",")}]`

async function id(c: Cliente, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const valor = rows[0]?.id
  if (!valor) throw new Error(`Sin id para: ${sql}`)
  return valor
}

const crearAutor = (c: Cliente, nombre: string) =>
  id(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [nombre])

const crearMaterial = (c: Cliente, autor: string, rol = "referente") =>
  id(
    c,
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('documento', $1, $2, 'motor-datos', now(), $3) returning id`,
    [autor, rol, CONI],
  )

const crearTema = (c: Cliente, nombre: string, pilar: string | null, posicion: number) =>
  id(
    c,
    `insert into public.temas (nombre, descripcion, categoria_id, centroide)
     values ($1, 'd', (select id from public.categorias where slug = $2), $3::extensions.vector) returning id`,
    [nombre, pilar, vector(1, posicion)],
  )

const crearAfirmacion = (
  c: Cliente,
  material: string,
  autor: string,
  tema: string,
  extra: { evidencia?: string; excluida?: boolean } = {},
) =>
  id(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, excluida)
     values ($1, $2, 0, '{"pagina": 1}', 'Idea', 'cita', 'consejo', $3, $4, $5) returning id`,
    [material, autor, extra.evidencia ?? "opinion", tema, extra.excluida ?? false],
  )

interface FilaTema {
  tema_id: string
  nombre: string
  pilar: string | null
  afirmaciones: number
  autores: number
  evidencia_fuerte: number
  cubierto_por_coni: boolean
}

interface FilaPar {
  a: string
  b: string
  puente: number
  autores_comunes: number
}

describe("motor_temas", () => {
  it("returns one row per active topic with pillar, authors and strong evidence counts", async () => {
    await como(comoServicio, async (c) => {
      const ana = await crearAutor(c, "Ana motor")
      const beto = await crearAutor(c, "Beto motor")
      const mAna = await crearMaterial(c, ana)
      const mBeto = await crearMaterial(c, beto, "voz_propia")
      const t = await crearTema(c, "Deseo espontáneo", "deseo", 0)
      const sinPilar = await crearTema(c, "Tema suelto", null, 1)
      await crearAfirmacion(c, mAna, ana, t, { evidencia: "estudio" })
      await crearAfirmacion(c, mAna, ana, t, { evidencia: "clinica" })
      await crearAfirmacion(c, mBeto, beto, t, { evidencia: "opinion" })
      await crearAfirmacion(c, mBeto, beto, t, { evidencia: "estudio", excluida: true })

      const { rows } = await c.query<FilaTema>("select * from public.motor_temas() order by nombre")
      expect(rows).toHaveLength(2)
      const fila = rows.find((r) => r.tema_id === t)
      expect(fila).toMatchObject({
        nombre: "Deseo espontáneo",
        pilar: "deseo",
        afirmaciones: 3,
        autores: 2,
        evidencia_fuerte: 2,
        cubierto_por_coni: true,
      })
      expect(rows.find((r) => r.tema_id === sinPilar)).toMatchObject({ pilar: null, evidencia_fuerte: 0 })
    })
  })

  it("leaves merged topics out", async () => {
    await como(comoServicio, async (c) => {
      const ganador = await crearTema(c, "Ganador", "deseo", 0)
      const perdedor = await crearTema(c, "Perdedor", "deseo", 1)
      await c.query("update public.temas set fusionado_en = $1 where id = $2", [ganador, perdedor])
      const { rows } = await c.query<FilaTema>("select * from public.motor_temas()")
      expect(rows.map((r) => r.tema_id)).toEqual([ganador])
    })
  })

  it("is not callable by Coni", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select * from public.motor_temas()")
      expect(error.code).toBe("42501")
    })
  })
})

describe("motor_pares", () => {
  it("pairs topics of different pillars with enough authors and measures the bridge and common authors", async () => {
    await como(comoServicio, async (c) => {
      const ana = await crearAutor(c, "Ana pares")
      const beto = await crearAutor(c, "Beto pares")
      const mAna = await crearMaterial(c, ana)
      const mBeto = await crearMaterial(c, beto)
      const a = await crearTema(c, "Tema A", "deseo", 0)
      const b = await crearTema(c, "Tema B", "pareja", 0)
      for (const tema of [a, b]) {
        await crearAfirmacion(c, mAna, ana, tema)
        await crearAfirmacion(c, mBeto, beto, tema)
      }
      const solo = await crearTema(c, "Tema solo", "limites", 0)
      await crearAfirmacion(c, mAna, ana, solo)

      const { rows } = await c.query<FilaPar>("select * from public.motor_pares(2)")
      expect(rows).toHaveLength(1)
      const par = rows[0]
      expect(par?.a < (par?.b ?? "")).toBe(true)
      expect([par?.a, par?.b].sort()).toEqual([a, b].sort())
      expect(par?.puente).toBeCloseTo(1, 5)
      expect(par?.autores_comunes).toBe(2)
    })
  })

  it("excludes pairs of the same pillar and counts only non-excluded claims as common authors", async () => {
    await como(comoServicio, async (c) => {
      const ana = await crearAutor(c, "Ana mismo")
      const beto = await crearAutor(c, "Beto mismo")
      const mAna = await crearMaterial(c, ana)
      const mBeto = await crearMaterial(c, beto)
      const a = await crearTema(c, "Mismo A", "deseo", 0)
      const b = await crearTema(c, "Mismo B", "deseo", 1)
      const otro = await crearTema(c, "Otro pilar", "bienestar", 2)
      for (const tema of [a, b, otro]) {
        await crearAfirmacion(c, mAna, ana, tema)
        await crearAfirmacion(c, mBeto, beto, tema, { excluida: tema === otro })
      }
      const { rows } = await c.query<FilaPar>("select * from public.motor_pares(1)")
      const claves = rows.map((r) => [r.a, r.b].sort().join("|"))
      expect(claves).not.toContain([a, b].sort().join("|"))
      const conOtro = rows.find((r) => [r.a, r.b].includes(otro) && [r.a, r.b].includes(a))
      expect(conOtro?.autores_comunes).toBe(1)
      expect(conOtro?.puente).toBeCloseTo(0, 5)
    })
  })

  it("is not callable by Coni", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select * from public.motor_pares(1)")
      expect(error.code).toBe("42501")
    })
  })
})

describe("leerDatosDelMotor", () => {
  const db = clienteDeServicio()
  const hoy = "2026-10-04"

  async function limpiar() {
    await pool.query("delete from public.ideas where gancho like 'motor-datos%'")
    await pool.query("delete from public.teorias where titulo like 'motor-datos%'")
    await pool.query("delete from public.afirmaciones")
    await pool.query("delete from public.temas")
    await pool.query("delete from public.materiales where texto_pegado = 'motor-datos'")
    await pool.query("delete from public.autores where nombre like '%datos motor'")
  }
  afterEach(limpiar)

  async function teoria(titulo: string, semana: string, temas: string[]): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.teorias (titulo, tesis, origen, semana, temas, creada_por)
       values ($1, 't', 'motor', $2, $3, $4) returning id`,
      [titulo, semana, temas, CONI],
    )
    return rows[0]?.id ?? ""
  }

  async function idea(
    teoriaId: string,
    semana: string,
    estado: string,
    origen = "motor",
    motivo: string | null = null,
  ) {
    await pool.query(
      `insert into public.ideas (pilar, gancho, tema, formato, fuerza, estado, origen, semana, teoria_id, motivo_descarte)
       values ('ia-salud-mental', 'motor-datos', 't', 'reel', 'media', $1, $2, $3, $4, $5)`,
      [estado, origen, semana, teoriaId, motivo],
    )
  }

  it("returns topics, pairs, recent usage and discards inside a 28 day window", async () => {
    const c = await pool.connect()
    let t1 = ""
    let t2 = ""
    let t3 = ""
    try {
      const autor = await crearAutor(c, "Ana datos motor")
      const material = await crearMaterial(c, autor)
      t1 = await crearTema(c, "Datos 1", "deseo", 0)
      t2 = await crearTema(c, "Datos 2", "pareja", 1)
      t3 = await crearTema(c, "Datos 3", "limites", 2)
      for (const t of [t1, t2, t3]) await crearAfirmacion(c, material, autor, t)
    } finally {
      c.release()
    }

    const reciente = await teoria("motor-datos reciente", "2026-09-27", [t1, t2])
    const borde = await teoria("motor-datos borde", "2026-09-06", [t2, t3])
    const vieja = await teoria("motor-datos vieja", "2026-09-05", [t3, t1])
    await idea(reciente, "2026-09-27", "descartada")
    await idea(reciente, "2026-09-27", "descartada")
    await idea(reciente, "2026-09-27", "idea")
    await idea(borde, "2026-09-06", "descartada")
    await idea(vieja, "2026-09-05", "descartada")
    await idea(reciente, "2026-09-27", "descartada", "propuesta")

    const datos = await leerDatosDelMotor(db, { hoy, minimoAutores: 1 })

    expect(datos.temas.map((t) => t.tema_id).sort()).toEqual([t1, t2, t3].sort())
    expect(datos.pares.length).toBeGreaterThan(0)
    expect([...datos.recientes.temas].sort()).toEqual([t1, t2, t3].sort())
    const clave = (x: string, y: string) => [x, y].sort().join("|")
    expect([...datos.recientes.pares].sort()).toEqual([clave(t1, t2), clave(t2, t3)].sort())
    expect(datos.descartes.get(t1)).toBe(2)
    expect(datos.descartes.get(t2)).toBe(3)
    expect(datos.descartes.get(t3)).toBe(1)
  })

  it("does not count an idea archived because its pillar retired as a discard of its topics", async () => {
    const c = await pool.connect()
    let t1 = ""
    try {
      const autor = await crearAutor(c, "Caro datos motor")
      const material = await crearMaterial(c, autor)
      t1 = await crearTema(c, "Datos retirado", "ia-salud-mental", 0)
      await crearAfirmacion(c, material, autor, t1)
    } finally {
      c.release()
    }

    const reciente = await teoria("motor-datos retirado", "2026-09-27", [t1])
    await idea(reciente, "2026-09-27", "descartada", "motor", "pilar_retirado")
    await idea(reciente, "2026-09-27", "descartada", "motor", "debil")

    const datos = await leerDatosDelMotor(db, { hoy, minimoAutores: 1 })

    expect(datos.descartes.get(t1)).toBe(1)
  })

  it("pages past 1000 rows", async () => {
    const c = await pool.connect()
    try {
      const autor = await crearAutor(c, "Beto datos motor")
      const material = await crearMaterial(c, autor)
      const base = await crearTema(c, "Paginado base", "deseo", 0)
      await crearAfirmacion(c, material, autor, base)
      await c.query(
        `insert into public.temas (nombre, descripcion, categoria_id, centroide)
         select 'Paginado ' || n, 'd', (select id from public.categorias where slug = 'pareja'), $1::extensions.vector
         from generate_series(1, 1100) n`,
        [vector(1, 3)],
      )
    } finally {
      c.release()
    }
    const datos = await leerDatosDelMotor(db, { hoy })
    expect(datos.temas).toHaveLength(1101)
  })
})
