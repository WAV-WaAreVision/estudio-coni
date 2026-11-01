import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AnotarBorrado } from "@/lib/datos-personales/borrados"
import { registrarMetricasDiarias } from "@/lib/metricas/diarias"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

afterAll(() => pool.end())

const TOKEN = "IGAA_token_actual_de_coni"
const CUENTA = "17841400000000001"
// 23:00 on 9 Oct in Santiago (summer time, UTC-3): UTC has already moved on to the 10th.
const AHORA = "2026-10-10T02:00:00.000Z"
const HOY = "2026-10-09"

interface Lectura {
  alcance: number | null
  guardados: number | null
  compartidos: number | null
  comentarios: number | null
  tiempo_promedio: string | null
}

const dato = (name: string, value: number) => ({ name, period: "lifetime", values: [{ value }] })

function simularInsights(opciones: { medias: Record<string, unknown>; toques?: (desde: number) => unknown }) {
  const pedidos: URL[] = []
  servidor.use(
    http.get("https://graph.instagram.com/v25.0/:id/insights", ({ request, params }) => {
      const url = new URL(request.url)
      pedidos.push(url)
      if (url.searchParams.get("metric") === "profile_links_taps") {
        const desde = Number(url.searchParams.get("since")) * 1000
        return HttpResponse.json((opciones.toques?.(desde) ?? { data: [] }) as Record<string, unknown>)
      }
      const respuesta = opciones.medias[String(params.id)]
      if (respuesta instanceof Response) return respuesta
      return HttpResponse.json((respuesta ?? { data: [] }) as Record<string, unknown>)
    }),
  )
  return pedidos
}

async function reelPublicado(mediaId: string | null, pilar = "etica-regulacion") {
  const idea = await sembrarIdea({ pilar, gancho: `Gancho ${mediaId ?? "sin media"}` })
  return sembrarPieza("publicado", { idea_id: idea, titulo: `Reel ${mediaId}`, media_id: mediaId })
}

async function lecturas(piezaId: string) {
  const { rows } = await pool.query<Lectura & { dia: string }>(
    "select to_char(dia, 'YYYY-MM-DD') as dia, alcance, guardados, compartidos, comentarios, tiempo_promedio from public.metricas_reel where pieza_id = $1 order by dia",
    [piezaId],
  )
  return rows
}

async function cuenta() {
  const { rows } = await pool.query<{ dia: string; toques_perfil: number }>(
    "select to_char(dia, 'YYYY-MM-DD') as dia, toques_perfil from public.metricas_cuenta order by dia",
  )
  return rows
}

const sinAnotar: AnotarBorrado = async () => {}

const deps = (anotarBorrado: AnotarBorrado = sinAnotar) => ({
  db: clienteDeServicio(),
  ahora: () => AHORA,
  anotarBorrado,
})

beforeEach(async () => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_cuenta")
  await pool.query("delete from public.visitas_clic")
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query("select vault.create_secret($1, 'meta')", [TOKEN])
  await pool.query("update public.ajustes set meta_cuenta_id = $1", [CUENTA])
})

afterEach(async () => {
  await pool.query("delete from public.visitas_clic")
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_cuenta")
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query("update public.ajustes set meta_cuenta_id = null")
})

describe("registrarMetricasDiarias", () => {
  it("stores today's reading of every published reel, keyed by the day in Santiago", async () => {
    const a = await reelPublicado("m-1")
    const b = await reelPublicado("m-2")
    simularInsights({
      medias: {
        "m-1": {
          data: [
            dato("reach", 2400),
            dato("saved", 121),
            dato("shares", 30),
            dato("comments", 7),
            dato("ig_reels_avg_watch_time", 24_400),
          ],
        },
        "m-2": { data: [dato("reach", 900), dato("saved", 9)] },
      },
    })

    const resultado = await registrarMetricasDiarias(deps())

    expect(resultado).toEqual({ estado: "leidas", reels: 2, sinLectura: 0, dias: 0 })
    expect(await lecturas(a)).toEqual([
      { dia: HOY, alcance: 2400, guardados: 121, compartidos: 30, comentarios: 7, tiempo_promedio: "24400.000" },
    ])
    expect(await lecturas(b)).toEqual([
      { dia: HOY, alcance: 900, guardados: 9, compartidos: null, comentarios: null, tiempo_promedio: null },
    ])
  })

  it("updates the day's reading when the run happens again instead of adding a second one", async () => {
    const a = await reelPublicado("m-1")
    simularInsights({ medias: { "m-1": { data: [dato("reach", 100), dato("saved", 1)] } } })
    await registrarMetricasDiarias(deps())
    simularInsights({ medias: { "m-1": { data: [dato("reach", 150), dato("saved", 3)] } } })

    await registrarMetricasDiarias(deps())

    expect(await lecturas(a)).toMatchObject([{ dia: HOY, alcance: 150, guardados: 3 }])
  })

  it("skips pieces that are not published or have no Instagram media yet", async () => {
    await reelPublicado(null)
    const programada = await sembrarPieza("programado")
    const pedidos = simularInsights({ medias: {} })

    const resultado = await registrarMetricasDiarias(deps())

    expect(resultado).toEqual({ estado: "leidas", reels: 0, sinLectura: 0, dias: 0 })
    expect(await lecturas(programada)).toEqual([])
    expect(pedidos.filter((url) => url.searchParams.get("metric") !== "profile_links_taps")).toEqual([])
  })

  it("stores the account's profile taps for each of the last three complete days, and nothing for a day without data", async () => {
    simularInsights({
      medias: {},
      toques: (desde) => {
        const dia = new Date(desde - 3 * 3_600_000).toISOString().slice(0, 10)
        if (dia === "2026-10-07") return { data: [] }
        return { data: [{ name: "profile_links_taps", period: "day", total_value: { value: 4 } }] }
      },
    })

    const resultado = await registrarMetricasDiarias(deps())

    expect(resultado).toMatchObject({ estado: "leidas", dias: 2 })
    expect(await cuenta()).toEqual([
      { dia: "2026-10-06", toques_perfil: 4 },
      { dia: "2026-10-08", toques_perfil: 4 },
    ])
  })

  it("asks for each day between its own midnights in Santiago", async () => {
    const pedidos = simularInsights({ medias: {} })

    await registrarMetricasDiarias(deps())

    const tramos = pedidos
      .filter((url) => url.searchParams.get("metric") === "profile_links_taps")
      .map((url) => [
        new Date(Number(url.searchParams.get("since")) * 1000),
        new Date(Number(url.searchParams.get("until")) * 1000),
      ])
      .map(([desde, hasta]) => [desde?.toISOString(), hasta?.toISOString()])
    expect(tramos).toEqual([
      ["2026-10-08T03:00:00.000Z", "2026-10-09T03:00:00.000Z"],
      ["2026-10-07T03:00:00.000Z", "2026-10-08T03:00:00.000Z"],
      ["2026-10-06T03:00:00.000Z", "2026-10-07T03:00:00.000Z"],
    ])
  })

  it("leaves a reel Instagram refuses for good without numbers, keeps the others and does not fail the run", async () => {
    const mala = await reelPublicado("m-mala")
    const buena = await reelPublicado("m-buena")
    simularInsights({
      medias: {
        "m-mala": HttpResponse.json({ error: { message: "Media is not available", code: 100 } }, { status: 400 }),
        "m-buena": { data: [dato("reach", 500), dato("saved", 5)] },
      },
    })
    const fallas = vi.spyOn(console, "error").mockImplementation(() => {})

    const resultado = await registrarMetricasDiarias(deps())

    expect(resultado).toMatchObject({ estado: "leidas", reels: 1, sinLectura: 1 })
    expect(await lecturas(mala)).toEqual([])
    expect(await lecturas(buena)).toMatchObject([{ guardados: 5 }])
    // Not silent: WAV can see which reel and why.
    expect(fallas.mock.calls.flat().join(" ")).toContain("m-mala")
    fallas.mockRestore()
  })

  it("keeps the readings it could take when a reel fails for a reason that may pass, and then fails the run to retry", async () => {
    const lenta = await reelPublicado("m-lenta")
    const buena = await reelPublicado("m-buena")
    simularInsights({
      medias: {
        "m-lenta": HttpResponse.json({ error: { message: "Service unavailable" } }, { status: 503 }),
        "m-buena": { data: [dato("reach", 500), dato("saved", 5)] },
      },
    })

    await expect(registrarMetricasDiarias(deps())).rejects.toThrow(/m-lenta/)

    expect(await lecturas(lenta)).toEqual([])
    expect(await lecturas(buena)).toMatchObject([{ guardados: 5 }])
  })

  it("stops at an expired token without reading any other reel or the account", async () => {
    await reelPublicado("m-1")
    await reelPublicado("m-2")
    const muerto = () => HttpResponse.json({ error: { message: "Session has expired", code: 190 } }, { status: 400 })
    const pedidos = simularInsights({ medias: { "m-1": muerto(), "m-2": muerto() }, toques: () => muerto() })

    await expect(registrarMetricasDiarias(deps())).rejects.toThrow(/Instagram respondió HTTP 400/)

    expect(pedidos.filter((url) => url.pathname.includes("m-"))).toHaveLength(1)
    expect(pedidos.filter((url) => url.searchParams.get("metric") === "profile_links_taps")).toEqual([])
  })

  it("forgets the click visitors from before yesterday, even if nobody clicked since", async () => {
    await pool.query(
      `insert into public.visitas_clic (dia, enlace, visitante) values
         ('2026-10-07', 'agenda', repeat('a', 64)), ('2026-10-08', 'agenda', repeat('b', 64)), ('2026-10-09', 'agenda', repeat('c', 64))`,
    )
    simularInsights({ medias: {} })

    await registrarMetricasDiarias(deps())

    const { rows } = await pool.query<{ dia: string }>(
      "select to_char(dia, 'YYYY-MM-DD') as dia from public.visitas_clic order by dia",
    )
    expect(rows.map((r) => r.dia)).toEqual(["2026-10-08", "2026-10-09"])
  })

  it("writes down how many click visitors it forgot", async () => {
    await pool.query(
      `insert into public.visitas_clic (dia, enlace, visitante) values
         ('2026-10-06', 'agenda', repeat('a', 64)), ('2026-10-07', 'agenda', repeat('b', 64)), ('2026-10-09', 'agenda', repeat('c', 64))`,
    )
    simularInsights({ medias: {} })
    const anotados: [string, number][] = []

    await registrarMetricasDiarias(
      deps(async (regla, cantidad) => {
        anotados.push([regla, cantidad])
      }),
    )

    expect(anotados).toEqual([["huella_de_visitas", 2]])
  })

  it("writes nothing down when there were no old click visitors", async () => {
    await pool.query(
      "insert into public.visitas_clic (dia, enlace, visitante) values ('2026-10-09', 'agenda', repeat('c', 64))",
    )
    simularInsights({ medias: {} })
    const anotados: [string, number][] = []

    await registrarMetricasDiarias(
      deps(async (regla, cantidad) => {
        anotados.push([regla, cantidad])
      }),
    )

    expect(anotados).toEqual([])
  })

  it("keeps the click visitors forgotten and fails the run when the log cannot be written", async () => {
    await pool.query(
      `insert into public.visitas_clic (dia, enlace, visitante) values
         ('2026-10-07', 'agenda', repeat('a', 64)), ('2026-10-09', 'agenda', repeat('c', 64))`,
    )
    simularInsights({ medias: {} })

    await expect(
      registrarMetricasDiarias(
        deps(async () => {
          throw new Error("No pude anotar el borrado de huella_de_visitas: sin conexión")
        }),
      ),
    ).rejects.toThrow(/visitas: .*sin conexión/)

    const { rows } = await pool.query<{ dia: string }>(
      "select to_char(dia, 'YYYY-MM-DD') as dia from public.visitas_clic order by dia",
    )
    expect(rows.map((r) => r.dia)).toEqual(["2026-10-09"])
  })

  it("does nothing while Instagram is not connected", async () => {
    await pool.query("delete from vault.secrets where name = 'meta'")
    await reelPublicado("m-1")
    const pedidos = simularInsights({ medias: {} })

    expect(await registrarMetricasDiarias(deps())).toEqual({ estado: "sin_cuenta" })

    expect(pedidos).toEqual([])
  })
})
