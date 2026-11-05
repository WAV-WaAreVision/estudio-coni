import { afterAll, afterEach, describe, expect, it } from "vitest"
import { leerBanco } from "@/lib/datos/banco"
import { leerDatosDeCalendario } from "@/lib/datos/calendario"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
import { leerPieza } from "@/lib/datos/repositorio"
import { cargarContexto } from "@/lib/produccion/contexto"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado } from "./siembra"

let piezas: string[] = []
let ideas: string[] = []

afterEach(async () => {
  await borrarSembrado(piezas, ideas)
  piezas = []
  ideas = []
})
afterAll(() => pool.end())

/** A bank idea on `pilar` with `angulo` (or none), and a piece of it. */
async function ideaConPieza(pilar: string, angulo: string | null): Promise<{ idea: string; pieza: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.ideas (pilar, angulo_id, gancho, tema, fuerza, estado)
     values ($1, (select id from public.pilar_angulos where slug = $2), 'Entreno modelos.', 'Construir', 'alta', 'usada') returning id`,
    [pilar, angulo],
  )
  const idea = rows[0]?.id ?? ""
  ideas.push(idea)
  const { rows: creada } = await pool.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Entreno modelos') returning id",
    [idea],
  )
  const pieza = creada[0]?.id ?? ""
  piezas.push(pieza)
  return { idea, pieza }
}

describe("cargarContexto", () => {
  it("gives the writer the idea's angle with its voice and format, and none without one", async () => {
    const db = clienteDeServicio()
    const con = await ideaConPieza("psicologia-en-la-mesa", "lo-que-construyo")
    const fila = await leerPieza(db, con.pieza)
    if (!fila) throw new Error("No leí la pieza")
    expect((await cargarContexto({ db }, fila)).angulo).toEqual({
      nombre: "Lo que construyo",
      descripcion:
        "Mi caso a la vista. Una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg. Voz íntima, fotos reales, demos y video.",
    })
    const sin = await ideaConPieza("psicologia-en-la-mesa", null)
    const otra = await leerPieza(db, sin.pieza)
    if (!otra) throw new Error("No leí la pieza")
    expect((await cargarContexto({ db }, otra)).angulo).toBeNull()
  })
})

describe("the readers carry the angle", () => {
  it("Inicio knows each piece's angle and each bank idea's", async () => {
    const db = clienteDeServicio()
    const { idea, pieza } = await ideaConPieza("psicologia-en-la-mesa", "lo-que-construyo")
    await pool.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [
      pieza,
    ])
    const banco = await ideaConPieza("mi-nueva-partida", "lo-vivo")
    await pool.query("update public.ideas set estado = 'idea' where id = $1", [banco.idea])
    const datos = await leerDatosDeInicio(db, Date.now())
    const { rows } = await pool.query<{ slug: string; id: string }>("select slug, id from public.pilar_angulos")
    const id = (slug: string) => rows.find((fila) => fila.slug === slug)?.id
    expect(datos.angulos.get(pieza)).toBe(id("lo-que-construyo"))
    expect(datos.banco.find((i) => i.id === banco.idea)?.angulo_id).toBe(id("lo-vivo"))
    expect(idea).toBeTruthy()
  })

  it("the bank labels an idea with its angle", async () => {
    const { idea } = await ideaConPieza("mi-nueva-partida", "pruebalo-tu")
    await pool.query("update public.ideas set estado = 'idea' where id = $1", [idea])
    const banco = await leerBanco(clienteDeServicio(), Date.now())
    expect(banco.find((i) => i.id === idea)).toMatchObject({
      nombreCortoPilar: "Mi nueva partida · Pruébalo tú",
      angulo: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  it("the calendar carries the piece's angle", async () => {
    const { pieza } = await ideaConPieza("psicologia-en-la-mesa", "lo-que-planteo")
    await pool.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [
      pieza,
    ])
    // The calendar reads tables only her session may (fechas_propuestas), as the screen does.
    const datos = await leerDatosDeCalendario(await clienteDeConi(), Date.now())
    expect(datos.piezas.find((p) => p.id === pieza)?.angulo).toMatch(/^[0-9a-f-]{36}$/)
  })
})
