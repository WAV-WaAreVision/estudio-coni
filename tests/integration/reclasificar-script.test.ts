import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, describe, expect, it } from "vitest"
import { ejecutarReclasificacion } from "@/lib/pilares/ejecutar"
import { servidor } from "../msw"
import { CONI, pool } from "./db"
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

async function materialEnPareja(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.materiales (autor_id, tipo, categoria_id, titulo, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ((select id from public.autores where tipo = 'coni'), 'documento',
             (select id from public.categorias where slug = 'pareja'), 'Siembra script', 'siembra-script', now(), $1)
     returning id`,
    [CONI],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el material")
  return id
}

const slugDe = async (id: string) =>
  (
    await pool.query<{ slug: string }>(
      "select c.slug from public.materiales m join public.categorias c on c.id = m.categoria_id where m.id = $1",
      [id],
    )
  ).rows[0]?.slug

describe("script de reclasificación", () => {
  it("refuses to overwrite an existing CSV before reading the key or calling anyone", async () => {
    const ruta = join(carpeta, "revisado.csv")
    writeFileSync(ruta, "lo que WAV revisó", "utf-8")
    const { uso, deps } = dependencias()
    await expect(ejecutarReclasificacion([ruta], deps)).rejects.toThrow(`Ya existe ${ruta}`)
    expect(readFileSync(ruta, "utf-8")).toBe("lo que WAV revisó")
    expect(uso).toMatchObject({ llaves: 0, clientes: 0 })
  })

  it("refuses an unknown option", async () => {
    const { deps } = dependencias()
    await expect(ejecutarReclasificacion([join(carpeta, "x.csv"), "--aplica"], deps)).rejects.toThrow(
      "Opción desconocida: --aplica",
    )
  })

  it("asks for the CSV path", async () => {
    const { deps } = dependencias()
    await expect(ejecutarReclasificacion([], deps)).rejects.toThrow("Uso: pnpm reclasificar:pilares")
  })

  it("applies with --aplicar without reading the key or building a Claude client", async () => {
    const id = await materialEnPareja()
    const ruta = join(carpeta, "aplicar.csv")
    writeFileSync(ruta, `id,tipo,antes,propuesta,razon\n${id},material,pareja,caso-coni,revisado\n`, "utf-8")
    const { uso, deps } = dependencias()
    await ejecutarReclasificacion([ruta, "--aplicar"], deps)
    expect(uso).toMatchObject({ llaves: 0, clientes: 0, lineas: ["1 filas leídas; 1 movidas."] })
    expect(await slugDe(id)).toBe("caso-coni")
  })

  it("proposes without flag: writes the new CSV and leaves every category as it was", async () => {
    const id = await materialEnPareja()
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        const cuerpo = JSON.stringify(await request.json())
        const ids = [...cuerpo.matchAll(/\\"id\\":\\"([0-9a-f-]{36})\\"/g)].map((m) => m[1])
        return HttpResponse.json({
          id: "msg",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 500, output_tokens: 100 },
          content: [
            {
              type: "text",
              text: JSON.stringify({ asignaciones: ids.map((i) => ({ id: i, pilar: "caso-coni", razon: "x" })) }),
            },
          ],
        })
      }),
    )
    const ruta = join(carpeta, "propuesta.csv")
    const { uso, deps } = dependencias()
    await ejecutarReclasificacion([ruta], deps)
    expect(uso).toMatchObject({ llaves: 1, clientes: 1 })
    expect(readFileSync(ruta, "utf-8")).toContain(`"${id}","material","pareja","caso-coni"`)
    expect(await slugDe(id)).toBe("pareja")
    await pool.query("delete from public.gastos where paso = 'reclasificar_pilares'")
  })
})
