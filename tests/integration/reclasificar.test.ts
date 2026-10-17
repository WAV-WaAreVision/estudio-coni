import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, describe, expect, it } from "vitest"
import { aplicarReclasificacion, leerElementosPorReclasificar } from "@/lib/datos/reclasificacion"
import { proponerReclasificacion } from "@/lib/pilares/proponer"
import { servidor } from "../msw"
import { CONI, pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(async () => {
  await pool.query("delete from public.materiales where texto_pegado = 'siembra-reclasificar'")
  await pool.query("delete from public.gastos where paso = 'reclasificar_pilares'")
  await pool.end()
})

async function materialEn(slug: string | null, titulo: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.materiales (autor_id, tipo, categoria_id, titulo, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ((select id from public.autores where tipo = 'coni'), 'documento',
             (select id from public.categorias where slug = $1), $2, 'siembra-reclasificar', now(), $3) returning id`,
    [slug, titulo, CONI],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el material")
  return id
}

const slugDe = async (id: string) =>
  (
    await pool.query<{ slug: string | null }>(
      "select c.slug from public.materiales m left join public.categorias c on c.id = m.categoria_id where m.id = $1",
      [id],
    )
  ).rows[0]?.slug ?? null

describe("reclasificación de pilares", () => {
  it("reads items of retired pillars, general and none, and leaves active pillars alone", async () => {
    const viejo = await materialEn("pareja", "Siembra viejo")
    const general = await materialEn("general", "Siembra general")
    const nuevo = await materialEn("caso-coni", "Siembra nuevo")
    const ids = (await leerElementosPorReclasificar(clienteDeServicio())).map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining([viejo, general]))
    expect(ids).not.toContain(nuevo)
  })

  it("proposes through Claude under the monthly cap and writes nothing to the items", async () => {
    const viejo = await materialEn("deseo", "Siembra propuesta")
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
              text: JSON.stringify({ asignaciones: ids.map((id) => ({ id, pilar: "ia-salud-mental", razon: "IA" })) }),
            },
          ],
        })
      }),
    )
    const { filas, estimado, realUsd } = await proponerReclasificacion({
      db: clienteDeServicio(),
      claude: new Anthropic({ apiKey: "sk-ant-prueba", maxRetries: 0 }),
      ahora: "2026-10-17T12:00:00.000Z",
      avisar: () => {},
    })
    expect(filas.find((f) => f.id === viejo)).toMatchObject({
      tipo: "material",
      antes: "deseo",
      propuesta: "ia-salud-mental",
    })
    expect(estimado.usd).toBeGreaterThan(0)
    expect(realUsd).toBeGreaterThan(0)
    expect(await slugDe(viejo)).toBe("deseo")
    const { rows } = await pool.query(
      "select estado from public.gastos where paso = 'reclasificar_pilares' order by creado_en desc limit 1",
    )
    expect(rows[0]?.estado).toBe("confirmado")
  })

  it("releases the reservation when Claude fails, so the cap does not count it", async () => {
    await materialEn("limites", "Siembra falla")
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({ type: "error", error: { type: "api_error", message: "caído" } }, { status: 500 }),
      ),
    )
    await expect(
      proponerReclasificacion({
        db: clienteDeServicio(),
        claude: new Anthropic({ apiKey: "sk-ant-prueba", maxRetries: 0 }),
        ahora: "2026-10-17T12:00:00.000Z",
        avisar: () => {},
      }),
    ).rejects.toThrow()
    const { rows } = await pool.query(
      "select estado from public.gastos where paso = 'reclasificar_pilares' order by creado_en desc limit 1",
    )
    expect(rows[0]?.estado).toBe("liberado")
  })

  it("applies the reviewed rows and skips a row whose category changed since", async () => {
    const a = await materialEn("pareja", "Siembra aplicar")
    const b = await materialEn("general", "Siembra cambiada")
    const resultado = await aplicarReclasificacion(clienteDeServicio(), [
      { id: a, tipo: "material", antes: "pareja", propuesta: "etica-regulacion", razon: "x" },
      { id: b, tipo: "material", antes: "pareja", propuesta: "caso-coni", razon: "y" },
    ])
    expect(await slugDe(a)).toBe("etica-regulacion")
    expect(await slugDe(b)).toBe("general")
    expect(resultado).toEqual({
      aplicadas: 1,
      saltadas: [{ id: b, motivo: "su categoría cambió: ahora es general, no pareja" }],
    })
  })
})
