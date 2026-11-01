import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { type DepsAjustes, guardarAjuste, guardarLlave } from "@/lib/acciones/ajustes"
import type { Database } from "@/lib/supabase/database.types"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

type Db = SupabaseClient<Database>

let coni: Db
let mantenedor: Db

function deps(db: Db = coni): DepsAjustes {
  return { db, ahora: () => new Date().toISOString() }
}

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

beforeEach(async () => {
  await pool.query("delete from vault.secrets where name in ('heygen','elevenlabs','anthropic')")
})

afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from vault.secrets where name in ('heygen','elevenlabs','anthropic')")
  await pool.query("delete from public.gastos where paso = 'prueba_ajustes'")
  await pool.query(
    "update public.ajustes set meta = 'consultas', dias_publicacion = '{2,4,6}', hora_publicacion = '19:00', tope_mensual_usd = 40, limite_duro_usd = null, motor_semanal_activo = true, fusiones_nocturnas_activas = true, avisos_resumen = true, avisos_urgentes = true, destinos_por_defecto = '{instagram}', produccion = '{}'::jsonb",
  )
})

afterAll(() => pool.end())

async function ajustes() {
  const { rows } = await pool.query("select * from public.ajustes")
  return rows[0]
}

async function secreto(nombre: string): Promise<string | undefined> {
  const { rows } = await pool.query("select decrypted_secret from vault.decrypted_secrets where name = $1", [nombre])
  return rows[0]?.decrypted_secret
}

describe("guardarAjuste", () => {
  it("saves each setting and gives back the previous value, for Deshacer", async () => {
    expect(await guardarAjuste(deps(), { campo: "meta", valor: "talleres" })).toMatchObject({
      ok: true,
      anterior: { campo: "meta", valor: "consultas" },
    })
    expect(await guardarAjuste(deps(), { campo: "dias", valor: [5, 1, 3] })).toMatchObject({
      ok: true,
      anterior: { campo: "dias", valor: [2, 4, 6] },
    })
    expect(await guardarAjuste(deps(), { campo: "hora", valor: "20:30" })).toMatchObject({
      ok: true,
      anterior: { campo: "hora", valor: "19:00" },
    })
    expect(await guardarAjuste(deps(), { campo: "avisos_resumen", valor: false })).toMatchObject({
      ok: true,
      anterior: { campo: "avisos_resumen", valor: true },
    })
    expect(await guardarAjuste(deps(), { campo: "avisos_urgentes", valor: false })).toMatchObject({ ok: true })

    expect(await ajustes()).toMatchObject({
      meta: "talleres",
      dias_publicacion: [1, 3, 5],
      hora_publicacion: "20:30:00",
      avisos_resumen: false,
      avisos_urgentes: false,
    })
  })

  it("puts it back with the value Deshacer carries", async () => {
    const guardado = await guardarAjuste(deps(), { campo: "tope", valor: 60 })
    if (!guardado.ok) throw new Error("se esperaba que guardara")

    await guardarAjuste(deps(), guardado.anterior)

    expect(Number((await ajustes()).tope_mensual_usd)).toBe(40)
  })

  it("keeps the days sorted and without repeats", async () => {
    await guardarAjuste(deps(), { campo: "dias", valor: [6, 2, 2, 4] })

    expect((await ajustes()).dias_publicacion).toEqual([2, 4, 6])
  })

  it("saves where reels are published by default, in the canonical order, and answers with what was there", async () => {
    const guardado = await guardarAjuste(deps(), { campo: "destinos", valor: ["linkedin", "instagram"] })

    expect(guardado).toMatchObject({ ok: true, anterior: { campo: "destinos", valor: ["instagram"] } })
    expect((await ajustes()).destinos_por_defecto).toEqual(["instagram", "linkedin"])
    expect(await guardarAjuste(deps(), { campo: "destinos", valor: ["linkedin"] })).toMatchObject({
      ok: true,
      anterior: { campo: "destinos", valor: ["instagram", "linkedin"] },
    })
    expect((await ajustes()).destinos_por_defecto).toEqual(["linkedin"])
  })

  it("refuses an empty, unknown or repeated list of destinations and leaves the setting as it was", async () => {
    for (const valor of [[], ["tiktok"], ["instagram", "instagram"], "instagram"]) {
      expect(await guardarAjuste(deps(), { campo: "destinos", valor })).toMatchObject({ ok: false })
    }
    expect((await ajustes()).destinos_por_defecto).toEqual(["instagram"])
  })

  it("refuses values the screen cannot send", async () => {
    for (const cambio of [
      { campo: "dias", valor: [] },
      { campo: "dias", valor: [0] },
      { campo: "dias", valor: [8] },
      { campo: "hora", valor: "25:00" },
      { campo: "hora", valor: "7pm" },
      { campo: "tope", valor: -5 },
      { campo: "tope", valor: 100000 },
      { campo: "meta", valor: "fama" },
      { campo: "avisos_resumen", valor: "si" },
      { campo: "otra_cosa", valor: 1 },
    ]) {
      expect(await guardarAjuste(deps(), cambio)).toMatchObject({ ok: false })
    }
    expect(await ajustes()).toMatchObject({
      meta: "consultas",
      dias_publicacion: [2, 4, 6],
      hora_publicacion: "19:00:00",
    })
  })

  it("warns when the new cap leaves a limit under what the month already spent, and still saves it", async () => {
    await pool.query(
      "insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'prueba_ajustes', date_trunc('month', now() at time zone 'America/Santiago')::date, 10, 12.5, 'confirmado', 'prueba-ajustes-1')",
    )

    const resultado = await guardarAjuste(deps(), { campo: "tope", valor: 5 })

    expect(resultado).toMatchObject({
      ok: true,
      aviso:
        "Ya gastaste US$ 12,50; con este límite lo nuevo queda en pausa hasta el próximo mes. Lo que ya firmaste sigue.",
    })
    expect(Number((await ajustes()).tope_mensual_usd)).toBe(5)
  })

  it("brings the limit back to twice the cap, and says so, when the cap goes above the limit she set", async () => {
    await pool.query("update public.ajustes set limite_duro_usd = 60")

    const resultado = await guardarAjuste(deps(), { campo: "tope", valor: 70 })

    expect(resultado).toMatchObject({ ok: true, aviso: "Tu límite volvió al doble del tope: US$ 140,00" })
    expect(await ajustes()).toMatchObject({ tope_mensual_usd: "70.00", limite_duro_usd: null })
  })

  it("keeps the limit she set when the cap stays under it", async () => {
    await pool.query("update public.ajustes set limite_duro_usd = 100")

    expect(await guardarAjuste(deps(), { campo: "tope", valor: 45 })).toMatchObject({ ok: true })
    expect(await ajustes()).toMatchObject({ tope_mensual_usd: "45.00", limite_duro_usd: "100.00" })
  })

  it("saves her own limit, back to twice the cap with null, and never one under the cap", async () => {
    expect(await guardarAjuste(deps(), { campo: "limite", valor: 90 })).toMatchObject({
      ok: true,
      anterior: { campo: "limite", valor: null },
    })
    expect((await ajustes()).limite_duro_usd).toBe("90.00")

    expect(await guardarAjuste(deps(), { campo: "limite", valor: null })).toMatchObject({ ok: true })
    expect((await ajustes()).limite_duro_usd).toBeNull()

    expect(await guardarAjuste(deps(), { campo: "limite", valor: 30 })).toEqual({
      ok: false,
      error: "Tu límite no puede ser menor que tu tope de US$ 40,00.",
    })
    expect((await ajustes()).limite_duro_usd).toBeNull()
  })

  it("saves the switches of what spends by itself", async () => {
    expect(await guardarAjuste(deps(), { campo: "motor_semanal", valor: false })).toMatchObject({
      ok: true,
      anterior: { campo: "motor_semanal", valor: true },
    })
    expect(await guardarAjuste(deps(), { campo: "fusiones_nocturnas", valor: false })).toMatchObject({ ok: true })
    expect(await ajustes()).toMatchObject({ motor_semanal_activo: false, fusiones_nocturnas_activas: false })
  })

  it("does not warn when the cap is above the spend", async () => {
    const resultado = await guardarAjuste(deps(), { campo: "tope", valor: 45 })

    expect(resultado).toMatchObject({ ok: true })
    expect(resultado.ok && resultado.aviso).toBeUndefined()
  })

  it("does not let the maintainer change anything", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(await guardarAjuste(deps(mantenedor), { campo: "tope", valor: 500 })).toMatchObject({ ok: false })
    expect(Number((await ajustes()).tope_mensual_usd)).toBe(40)
  })

  it("leaves the cap change in the audit log with Coni as the actor", async () => {
    await guardarAjuste(deps(), { campo: "tope", valor: 55 })

    const { rows } = await pool.query(
      "select actor_usuario from public.eventos where tabla = 'ajustes' and datos ->> 'tope_mensual_usd' = '55.00' order by id desc limit 1",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_usuario).toBe("c0000000-0000-4000-8000-000000000001")
  })
})

describe("guardarLlave", () => {
  const LLAVE = "hg-llave-nueva-de-coni"

  it("checks the key with its provider and saves it encrypted when it works", async () => {
    let vista: string | null = null
    servidor.use(
      http.get("https://api.heygen.com/v3/users/me", ({ request }) => {
        vista = request.headers.get("x-api-key")
        return HttpResponse.json({ data: {} })
      }),
    )

    const resultado = await guardarLlave(deps(), { cuenta: "heygen", llave: `  ${LLAVE}\n` })

    expect(resultado).toEqual({ ok: true, estado: "comprobada" })
    expect(vista).toBe(LLAVE)
    expect(await secreto("heygen")).toBe(LLAVE)
  })

  it("refuses a key the provider rejects and keeps the one she had", async () => {
    await pool.query("select vault.create_secret('hg-la-anterior', 'heygen')")
    servidor.use(
      http.get("https://api.heygen.com/v3/users/me", () => new HttpResponse("unauthorized", { status: 401 })),
    )

    const resultado = await guardarLlave(deps(), { cuenta: "heygen", llave: LLAVE })

    expect(resultado).toEqual({ ok: false, error: "HeyGen no aceptó esa llave. Revisa que la copiaste completa." })
    expect(await secreto("heygen")).toBe("hg-la-anterior")
  })

  it("saves the key and says it could not check it when the provider does not answer", async () => {
    servidor.use(http.get("https://api.heygen.com/v3/users/me", () => HttpResponse.error()))

    const resultado = await guardarLlave(deps(), { cuenta: "heygen", llave: LLAVE })

    expect(resultado).toEqual({ ok: true, estado: "sin_comprobar" })
    expect(await secreto("heygen")).toBe(LLAVE)
  })

  it("checks Anthropic's key by listing a model", async () => {
    servidor.use(
      http.get("https://api.anthropic.com/v1/models", () => HttpResponse.json({ data: [], has_more: false })),
    )

    expect(await guardarLlave(deps(), { cuenta: "anthropic", llave: "sk-ant-nueva" })).toEqual({
      ok: true,
      estado: "comprobada",
    })
    expect(await secreto("anthropic")).toBe("sk-ant-nueva")
  })

  it("checks ElevenLabs' key against her voice", async () => {
    await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(coniConfig)])
    servidor.use(
      http.get(`https://api.elevenlabs.io/v1/voices/${coniConfig.elevenlabs.voice_id}`, () =>
        HttpResponse.json({ name: "Coni" }),
      ),
    )

    expect(await guardarLlave(deps(), { cuenta: "elevenlabs", llave: "el-nueva" })).toEqual({
      ok: true,
      estado: "comprobada",
    })
    expect(await secreto("elevenlabs")).toBe("el-nueva")
  })

  it("saves ElevenLabs' key without checking when her voice is not set yet, and says so", async () => {
    const resultado = await guardarLlave(deps(), { cuenta: "elevenlabs", llave: "el-nueva" })

    expect(resultado).toEqual({ ok: true, estado: "sin_voz" })
    expect(await secreto("elevenlabs")).toBe("el-nueva")
  })

  it("refuses an empty key, one with spaces inside, and an account that is not one of the three", async () => {
    expect(await guardarLlave(deps(), { cuenta: "heygen", llave: "   " })).toMatchObject({ ok: false })
    expect(await guardarLlave(deps(), { cuenta: "heygen", llave: "dos palabras" })).toMatchObject({ ok: false })
    expect(await guardarLlave(deps(), { cuenta: "meta", llave: "IGQ" })).toMatchObject({ ok: false })
    expect(await secreto("heygen")).toBeUndefined()
    expect(await secreto("meta")).toBeUndefined()
  })

  it("does not let the maintainer enter keys", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    servidor.use(http.get("https://api.heygen.com/v3/users/me", () => HttpResponse.json({ data: {} })))

    expect(await guardarLlave(deps(mantenedor), { cuenta: "heygen", llave: LLAVE })).toMatchObject({ ok: false })
    expect(await secreto("heygen")).toBeUndefined()
  })

  it("never repeats the key in what it answers", async () => {
    servidor.use(http.get("https://api.heygen.com/v3/users/me", () => new HttpResponse(LLAVE, { status: 401 })))

    expect(JSON.stringify(await guardarLlave(deps(), { cuenta: "heygen", llave: LLAVE }))).not.toContain(LLAVE)
  })
})
