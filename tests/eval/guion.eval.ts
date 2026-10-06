// @vitest-environment node
// Reads fixtures through import.meta.url, which jsdom does not support.
import { readFileSync } from "node:fs"
import Anthropic from "@anthropic-ai/sdk"
import { afterAll, describe, expect, it } from "vitest"
import { etiquetasDe, MAXIMO_DE_ETIQUETAS, MINIMO_DE_ETIQUETAS } from "@/lib/dominio/etiquetas"
import { ajenoDelRespaldo } from "@/lib/dominio/respaldo"
import { type Alerta, bloquea, type Hallazgo, pideLineasDeAyuda, revisarGuion } from "@/lib/dominio/revision"
import {
  costoClaude,
  escribirGuion,
  type IdeaParaGuion,
  MODELO_POR_TAREA,
  revisarConClaude,
  type UsoClaude,
} from "@/lib/proveedores/anthropic"

interface IdeaDeEval extends IdeaParaGuion {
  numero: number
  alertas: Alerta[]
}

function leer(archivo: string): string {
  return readFileSync(new URL(`../fixtures/${archivo}`, import.meta.url), "utf-8")
}

// These calls spend real money, so they never run by accident.
const CORRE = process.env.RUN_EVALS === "1" && Boolean(process.env.ANTHROPIC_API_KEY)

const IDEAS: IdeaDeEval[] = JSON.parse(leer("ideas-eval.json"))
const GUIA = leer("linea-editorial.md")
const CON_DATO_POR_VERIFICAR = IDEAS.filter((idea) => idea.alertas.some((alerta) => alerta.tipo === "verificar dato"))

let gastado = 0
const gasto = (uso: UsoClaude) => {
  gastado += costoClaude(uso, MODELO_POR_TAREA.escribirGuion.modelo)
}
const guionesGenerados = new Map<number, { guion: string; texto: string; textoLinkedin: string }>()

afterAll(() => {
  if (CORRE) console.log(`Costo de este eval: US$ ${gastado.toFixed(4)}`)
})

async function escribirConUnaCorreccion(cliente: Anthropic, idea: IdeaDeEval) {
  const requiereLineasAyuda = pideLineasDeAyuda(idea.alertas)
  const revisar = (guion: string, texto: string) =>
    revisarGuion({ guion, texto, esAvatar: true, requiereLineasAyuda, ajeno: ajenoDelRespaldo(null) })

  let escrito = await escribirGuion({ cliente, guia: GUIA, idea, respaldo: null, requiereLineasAyuda })
  gasto(escrito.uso)
  let hallazgos = revisar(escrito.guion, escrito.texto)
  let correcciones = 0
  if (bloquea(hallazgos)) {
    correcciones = 1
    escrito = await escribirGuion({
      cliente,
      guia: GUIA,
      idea,
      respaldo: null,
      requiereLineasAyuda,
      correcciones: hallazgos,
    })
    gasto(escrito.uso)
    hallazgos = revisar(escrito.guion, escrito.texto)
  }
  return { escrito, hallazgos, correcciones }
}

describe.skipIf(!CORRE)("evals del guion con la API real", () => {
  const cliente = new Anthropic()

  it.each(IDEAS.map((idea) => [idea.numero, idea] as const))(
    "idea %i: el guion no tiene hallazgos que bloqueen despues de una ronda de correccion como maximo, y trae de 3 a 6 marcas de tono de la lista",
    async (_numero, idea) => {
      const { escrito, hallazgos, correcciones } = await escribirConUnaCorreccion(cliente, idea)
      guionesGenerados.set(idea.numero, {
        guion: escrito.guion,
        texto: escrito.texto,
        textoLinkedin: escrito.textoLinkedin,
      })
      expect(correcciones).toBeLessThanOrEqual(1)
      expect(hallazgos.filter((h) => h.tipo === "bloquea")).toEqual([])
      const marcas = etiquetasDe(escrito.guion)
      expect(marcas.length).toBeGreaterThanOrEqual(MINIMO_DE_ETIQUETAS)
      expect(marcas.length).toBeLessThanOrEqual(MAXIMO_DE_ETIQUETAS)
      expect(marcas.filter((marca) => !marca.conocida)).toEqual([])
      expect(etiquetasDe(escrito.texto)).toEqual([])
    },
  )

  it("la revision de Claude marca cifra_sin_verificar en al menos 2 de 3 ideas con dato por verificar", async () => {
    const ideas = CON_DATO_POR_VERIFICAR.slice(0, 3)
    expect(ideas).toHaveLength(3)

    const marcadas: number[] = []
    for (const idea of ideas) {
      const base = guionesGenerados.get(idea.numero) ?? (await escribirConUnaCorreccion(cliente, idea)).escrito
      // The writer avoids figures, so a made-up study is injected to test the detector, not the writer.
      const lineas = base.guion.trimEnd().split("\n")
      const cierre = lineas.pop() ?? ""
      const guion = [
        ...lineas,
        "",
        "Un estudio reciente encontró que el setenta por ciento de las parejas mejora en tres semanas.",
        "",
        cierre,
      ].join("\n")
      const { hallazgos, uso }: { hallazgos: Hallazgo[]; uso: UsoClaude } = await revisarConClaude({
        cliente,
        guia: GUIA,
        guion,
        texto: base.texto,
        textoLinkedin: base.textoLinkedin,
        alertas: idea.alertas,
      })
      gasto(uso)
      if (hallazgos.some((h) => h.regla === "cifra_sin_verificar")) marcadas.push(idea.numero)
    }
    expect(marcadas.length).toBeGreaterThanOrEqual(2)
  })
})
