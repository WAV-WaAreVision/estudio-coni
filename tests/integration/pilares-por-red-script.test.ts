import { randomUUID } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { leerPilares } from "@/lib/datos/pilares"
import { ponerAngulosDelLote } from "@/lib/datos/pilares-por-red"
import { ejecutarPilaresPorRed } from "@/lib/pilares/ejecutar-por-red"
import { aCsvPorRed, type FilaPorRed, LOTE_PILARES_POR_RED, leerCsvPorRed } from "@/lib/pilares/por-red"
import { servidor } from "../msw"
import { pool, sinLimiteFijado } from "./db"
import { URL_CLAUDE, USO } from "./procesar-comun"
import { clienteDeServicio } from "./servicio"

const carpeta = mkdtempSync(join(tmpdir(), "pilares-por-red-"))
const SUFIJO = randomUUID().slice(0, 8)
const NOMBRE_DEL_TEMA = `Pilares script ${SUFIJO}`
const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`
let tema = ""
let idea = ""

beforeAll(async () => {
  await sinLimiteFijado()
  const t = await pool.query<{ id: string }>(
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [NOMBRE_DEL_TEMA, CENTROIDE],
  )
  tema = t.rows[0]?.id ?? ""
  const i = await pool.query<{ id: string }>(
    "insert into public.ideas (pilar, gancho, fuerza, estado) values ('caso-coni', $1, 'media', 'idea') returning id",
    [`Idea del script ${SUFIJO}`],
  )
  idea = i.rows[0]?.id ?? ""
})

afterAll(async () => {
  // A failed run must not leave the local DB with the old pillars retired.
  await pool.query("select public.deshacer_lote_de_pilares(lote) from public.lotes_de_pilares where lote = $1", [
    LOTE_PILARES_POR_RED,
  ])
  await pool.query("delete from public.ideas where id = $1", [idea])
  await pool.query("delete from public.temas where id = $1", [tema])
  await pool.query("delete from public.gastos where paso = 'pilares_por_red'")
  rmSync(carpeta, { recursive: true, force: true })
  await pool.end()
})

/** Counts what the run asks for; a Claude client it builds is answered by MSW only where a test says so. */
function dependencias() {
  const uso = { llaves: 0, clientes: 0, lineas: [] as string[] }
  return {
    uso,
    deps: {
      db: clienteDeServicio(),
      leerLlave: async () => {
        uso.llaves += 1
        return "sk-ant-prueba"
      },
      crearClaude: (llave: string) => {
        uso.clientes += 1
        return new Anthropic({ apiKey: llave, maxRetries: 0 })
      },
      ahora: () => "2026-11-04T12:00:00.000Z",
      avisar: (linea: string) => {
        uso.lineas.push(linea)
      },
    },
  }
}

/** Answers every topic and idea it is sent, as Claude would. */
function simularClaude() {
  servidor.use(
    http.post<never, { messages: { content: string }[] }>(URL_CLAUDE, async ({ request }) => {
      const usuario = (await request.json()).messages[0]?.content ?? ""
      const datos = JSON.parse(usuario.split("<elementos>\n")[1]?.split("\n</elementos>")[0] ?? "{}") as {
        temas: { id: string }[]
        ideas: { id: string }[]
      }
      const salida = {
        temas: datos.temas.map((t) => ({
          id: t.id,
          linkedin: "bienestar-e-impacto",
          instagram: null,
          secundarios: ["diagnostico-doble"],
          capa: true,
          razon: "Calza.",
        })),
        ideas: datos.ideas.map((i) => ({ id: i.id, pilar: "mi-nueva-partida", razon: "Calza." })),
      }
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
}

const filaDelTema = (cambios: Partial<FilaPorRed> = {}): FilaPorRed => ({
  tipo: "tema",
  id: tema,
  nombre: NOMBRE_DEL_TEMA,
  linkedin: "bienestar-e-impacto",
  instagram: "",
  secundarios: "",
  capa_tdah: "no",
  pilar_nuevo: "",
  angulo: "",
  venia_de: "",
  razon: "",
  ...cambios,
})

const filaDeIdea = (id: string): FilaPorRed => ({
  tipo: "idea",
  id,
  nombre: "",
  linkedin: "",
  instagram: "",
  secundarios: "",
  capa_tdah: "",
  pilar_nuevo: "psicologia-en-la-mesa",
  angulo: "",
  venia_de: "",
  razon: "",
})

async function bancoEnPilaresViejos(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `select i.id from public.ideas i join public.categorias c on c.slug = i.pilar
      where i.estado = 'idea' and c.es_pilar and c.activa and c.red is null order by i.id`,
  )
  return rows.map((r) => r.id)
}

describe("pilares por red, los comandos", () => {
  it("asks for a command it knows", async () => {
    const { deps } = dependencias()
    await expect(ejecutarPilaresPorRed([], deps)).rejects.toThrow("Uso: pnpm pilares:proponer")
    await expect(ejecutarPilaresPorRed(["aplica", "x.csv"], deps)).rejects.toThrow("Uso: pnpm pilares:proponer")
  })

  it("proponer refuses to overwrite either output before reading the key", async () => {
    const base = join(carpeta, "existe")
    writeFileSync(`${base}.md`, "lo que Coni ya revisó", "utf-8")
    const { uso, deps } = dependencias()
    await expect(ejecutarPilaresPorRed(["proponer", base], deps)).rejects.toThrow(`Ya existe ${base}.md`)
    expect(uso).toMatchObject({ llaves: 0, clientes: 0 })
    expect(existsSync(`${base}.csv`)).toBe(false)
  })

  it("proponer writes the CSV and Coni's list from Claude's answer, and changes no topic and no idea", async () => {
    simularClaude()
    const base = join(carpeta, "propuesta")
    const { uso, deps } = dependencias()
    await ejecutarPilaresPorRed(["proponer", base], deps)

    const filas = leerCsvPorRed(readFileSync(`${base}.csv`, "utf-8"))
    expect(filas.find((f) => f.id === tema)).toMatchObject({
      tipo: "tema",
      linkedin: "bienestar-e-impacto",
      instagram: "",
      secundarios: "diagnostico-doble",
      capa_tdah: "si",
      venia_de: "",
    })
    expect(filas.find((f) => f.id === idea)).toMatchObject({
      tipo: "idea",
      pilar_nuevo: "mi-nueva-partida",
      venia_de: "Caso Coni",
    })
    const md = readFileSync(`${base}.md`, "utf-8")
    expect(md).toContain(
      `| ${NOMBRE_DEL_TEMA} | Bienestar e impacto | Sin pilar | Diagnóstico doble | Sí | Sin pilar |`,
    )
    expect(uso.lineas.at(-1)).toContain("Nada cambió en los temas ni en las ideas.")

    const filasDelTema = await pool.query("select 1 from public.tema_pilares where tema_id = $1", [tema])
    expect(filasDelTema.rowCount).toBe(0)
    const delBanco = await pool.query<{ pilar: string }>("select pilar from public.ideas where id = $1", [idea])
    expect(delBanco.rows[0]?.pilar).toBe("caso-coni")
    const gasto = await pool.query<{ estado: string }>(
      "select estado from public.gastos where paso = 'pilares_por_red' order by creado_en desc limit 1",
    )
    expect(gasto.rows[0]?.estado).toBe("confirmado")
  })

  async function ultimoGasto() {
    const { rows } = await pool.query<{ estado: string; real_usd: string | null }>(
      "select estado, real_usd::text from public.gastos where paso = 'pilares_por_red' order by creado_en desc, id desc limit 1",
    )
    return rows[0]
  }

  it("proponer charges a cut answer, writes no file and says why", async () => {
    servidor.use(
      http.post(URL_CLAUDE, () =>
        HttpResponse.json({
          id: "msg_prueba",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: '{"temas": [' }],
          stop_reason: "max_tokens",
          stop_sequence: null,
          usage: USO,
        }),
      ),
    )
    const base = join(carpeta, "cortada")
    const { deps } = dependencias()
    await expect(ejecutarPilaresPorRed(["proponer", base], deps)).rejects.toThrow(
      "Claude se quedó sin espacio antes de terminar la respuesta.",
    )
    expect(existsSync(`${base}.csv`) || existsSync(`${base}.md`)).toBe(false)
    const gasto = await ultimoGasto()
    expect(gasto?.estado).toBe("confirmado")
    expect(Number(gasto?.real_usd)).toBeGreaterThan(0)
  })

  it("proponer releases the reservation when Claude never answered, and writes no file", async () => {
    servidor.use(http.post(URL_CLAUDE, () => HttpResponse.json({ error: { type: "api_error" } }, { status: 500 })))
    const base = join(carpeta, "sin-respuesta")
    const { deps } = dependencias()
    await expect(ejecutarPilaresPorRed(["proponer", base], deps)).rejects.toThrow()
    expect(existsSync(`${base}.csv`) || existsSync(`${base}.md`)).toBe(false)
    expect((await ultimoGasto())?.estado).toBe("liberado")
  })

  it("proponer stops at the month's limit without calling Claude", async () => {
    const { rows } = await pool.query<{ t: string }>("select tope_mensual_usd::text as t from public.ajustes")
    const tope = rows[0]?.t ?? "100"
    await pool.query("update public.ajustes set tope_mensual_usd = 0.00001, limite_duro_usd = null")
    const base = join(carpeta, "sin-limite")
    const { uso, deps } = dependencias()
    try {
      await expect(ejecutarPilaresPorRed(["proponer", base], deps)).rejects.toThrow(
        "El límite del mes no alcanza para la propuesta.",
      )
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [tope])
    }
    expect(uso.clientes).toBe(0)
    expect(existsSync(`${base}.csv`) || existsSync(`${base}.md`)).toBe(false)
  })

  it("aplicar refuses a CSV with mistakes, naming them, and changes nothing", async () => {
    const ruta = join(carpeta, "con-errores.csv")
    writeFileSync(ruta, aCsvPorRed([filaDelTema({ linkedin: "mi-nueva-partida" })]), "utf-8")
    const { deps } = dependencias()
    await expect(ejecutarPilaresPorRed(["aplicar", ruta], deps)).rejects.toThrow(
      "«mi-nueva-partida» no es un pilar de LinkedIn",
    )
    const lote = await pool.query("select 1 from public.lotes_de_pilares where lote = $1", [LOTE_PILARES_POR_RED])
    expect(lote.rowCount).toBe(0)
  })

  it("aplicar refuses a CSV without topics before calling the database", async () => {
    const ruta = join(carpeta, "sin-temas.csv")
    writeFileSync(ruta, aCsvPorRed([]), "utf-8")
    const { deps } = dependencias()
    await expect(ejecutarPilaresPorRed(["aplicar", ruta], deps)).rejects.toThrow(
      "El CSV no trae ningún tema: no hay nada que aplicar.",
    )
    const lote = await pool.query("select 1 from public.lotes_de_pilares where lote = $1", [LOTE_PILARES_POR_RED])
    expect(lote.rowCount).toBe(0)
  })

  it("aplicar says in plain Spanish why the database refused the lot", async () => {
    const otro = randomUUID()
    const ruta = join(carpeta, "tema-que-no-existe.csv")
    writeFileSync(
      ruta,
      aCsvPorRed([filaDelTema({ id: otro }), ...(await bancoEnPilaresViejos()).map(filaDeIdea)]),
      "utf-8",
    )
    const { deps } = dependencias()
    await expect(ejecutarPilaresPorRed(["aplicar", ruta], deps)).rejects.toThrow(
      `Fila 2 (tema ${otro}): no existe o se fusionó con otro. Sácalo del CSV y vuelve a aplicar.`,
    )

    const sinIdeas = join(carpeta, "sin-ideas.csv")
    writeFileSync(sinIdeas, aCsvPorRed([filaDelTema()]), "utf-8")
    const faltan = ejecutarPilaresPorRed(["aplicar", sinIdeas], deps)
    await expect(faltan).rejects.toThrow("en un pilar anterior y el CSV no nombra.")
    await expect(faltan).rejects.toThrow(`- ${idea} «Idea del script ${SUFIJO}»`)
    const lote = await pool.query("select 1 from public.lotes_de_pilares where lote = $1", [LOTE_PILARES_POR_RED])
    expect(lote.rowCount).toBe(0)
  })

  it("deshacer says there is nothing to undo when the lot is not applied", async () => {
    const { deps } = dependencias()
    await expect(ejecutarPilaresPorRed(["deshacer"], deps)).rejects.toThrow(
      `El lote ${LOTE_PILARES_POR_RED} no está aplicado: no hay nada que deshacer.`,
    )
  })

  it("aplicar applies the reviewed CSV without the key or Claude, and deshacer brings everything back", async () => {
    const ideas = await bancoEnPilaresViejos()
    const ruta = join(carpeta, "revisado.csv")
    writeFileSync(
      ruta,
      aCsvPorRed([
        filaDelTema(),
        ...ideas.map(
          (id): FilaPorRed => ({
            tipo: "idea",
            id,
            nombre: "",
            linkedin: "",
            instagram: "",
            secundarios: "",
            capa_tdah: "",
            pilar_nuevo: "psicologia-en-la-mesa",
            angulo: id === idea ? "lo-que-construyo" : "",
            venia_de: "",
            razon: "",
          }),
        ),
      ]),
      "utf-8",
    )
    const { uso, deps } = dependencias()
    try {
      await ejecutarPilaresPorRed(["aplicar", ruta], deps)
      expect(uso).toMatchObject({ llaves: 0, clientes: 0 })
      expect(uso.lineas.some((linea) => linea.includes(`Lote ${LOTE_PILARES_POR_RED} aplicado`))).toBe(true)
      const filas = await pool.query("select 1 from public.tema_pilares where tema_id = $1", [tema])
      expect(filas.rowCount).toBe(1)
      const viejos = await pool.query("select 1 from public.categorias where es_pilar and activa and red is null")
      expect(viejos.rowCount).toBe(0)
      const conAngulo = await pool.query<{ angulo: string | null }>(
        "select a.slug as angulo from public.ideas i left join public.pilar_angulos a on a.id = i.angulo_id where i.id = $1",
        [idea],
      )
      expect(conAngulo.rows[0]?.angulo).toBe("lo-que-construyo")
      expect(uso.lineas.at(-1)).toContain("1 ángulo puesto")
      await expect(ejecutarPilaresPorRed(["aplicar", ruta], deps)).rejects.toThrow(
        `El lote ${LOTE_PILARES_POR_RED} ya está aplicado. Para aplicarlo de nuevo, primero corre pnpm pilares:deshacer.`,
      )
    } finally {
      await ejecutarPilaresPorRed(["deshacer"], deps)
    }
    expect(uso.lineas.at(-1)).toContain(`Lote ${LOTE_PILARES_POR_RED} deshecho`)
    const viejos = await pool.query("select 1 from public.categorias where es_pilar and activa and red is null")
    expect(viejos.rowCount).toBe(5)
    const delBanco = await pool.query<{ pilar: string }>("select pilar from public.ideas where id = $1", [idea])
    expect(delBanco.rows[0]?.pilar).toBe("caso-coni")
    const sinAngulo = await pool.query<{ angulo_id: string | null }>(
      "select angulo_id from public.ideas where id = $1",
      [idea],
    )
    expect(sinAngulo.rows[0]?.angulo_id).toBeNull()
    const filas = await pool.query("select 1 from public.tema_pilares where tema_id = $1", [tema])
    expect(filas.rowCount).toBe(0)
  })
})

describe("ponerAngulosDelLote", () => {
  it("fails in words when an angle's idea is gone, instead of counting it as set", async () => {
    const db = clienteDeServicio()
    const catalogo = await leerPilares(db)
    const ausente = randomUUID()
    await expect(
      ponerAngulosDelLote(
        db,
        [{ ideaId: ausente, pilar: "psicologia-en-la-mesa", angulo: "lo-que-construyo" }],
        catalogo,
      ),
    ).rejects.toThrow(`Apliqué el lote, pero no pude poner el ángulo de la idea ${ausente}`)
  })
})
