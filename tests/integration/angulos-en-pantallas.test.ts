import { afterAll, afterEach, describe, expect, it } from "vitest"
import { leerPieza } from "@/lib/datos/repositorio"
import { cargarContexto } from "@/lib/produccion/contexto"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
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
