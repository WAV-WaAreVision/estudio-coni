import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { afterAll, describe, expect, it } from "vitest"
import { ejecutarReclasificacion } from "@/lib/pilares/ejecutar"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const carpeta = mkdtempSync(join(tmpdir(), "reclasificar-"))

afterAll(async () => {
  rmSync(carpeta, { recursive: true, force: true })
  await pool.query("delete from public.materiales where texto_pegado = 'siembra-script'")
  await pool.end()
})

/** Counts what the run asks for; any Claude client it builds points nowhere MSW answers, so a call would fail. */
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
      ahora: () => "2026-10-17T12:00:00.000Z",
      avisar: (linea: string) => {
        uso.lineas.push(linea)
      },
    },
  }
}

describe("script de reclasificación", () => {
  it("refuses to overwrite an existing CSV before reading the key or calling anyone", async () => {
    const ruta = join(carpeta, "revisado.csv")
    writeFileSync(ruta, "lo que WAV revisó", "utf-8")
    const { uso, deps } = dependencias()
    await expect(ejecutarReclasificacion([ruta], deps)).rejects.toThrow(`Ya existe ${ruta}`)
    expect(readFileSync(ruta, "utf-8")).toBe("lo que WAV revisó")
    expect(uso).toMatchObject({ llaves: 0, clientes: 0 })
  })
})
