import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { capturar } from "./ayudas"
import { URL_DE_LA_APP } from "./entorno"

// The public page is for anybody: these specs arrive with no session at all.
test.use({ storageState: { cookies: [], origins: [] } })

const PERSONA = {
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
}

const ENLACES = [
  {
    id: "agenda",
    titulo: "Agenda una consulta",
    detalle: "Adolescentes, adultos y parejas",
    url: "https://agenda.test/coni",
  },
  { id: "taller", titulo: "Taller Ser tu propia diosa", detalle: "Próximas fechas", url: null },
  {
    id: "libros",
    titulo: "Mis libros",
    detalle: "Si la cama hablara… y Soy mi propia diosa",
    url: "https://libros.test/coni",
  },
  { id: "ring", titulo: "Fundación Ring!", detalle: "Relaciones Inteligentes", url: "https://ring.test" },
]

let originales: unknown

test.beforeAll(async () => {
  originales = (await pool.query("select enlaces from public.ajustes")).rows[0]?.enlaces
})

test.beforeEach(async () => {
  await pool.query("update public.ajustes set enlaces = $1::jsonb", [JSON.stringify(ENLACES)])
  await pool.query("delete from public.clics_enlace_dia")
  await pool.query("delete from public.visitas_clic")
})

test.afterAll(async () => {
  await pool.query("update public.ajustes set enlaces = $1::jsonb", [JSON.stringify(originales)])
  await pool.query("delete from public.clics_enlace_dia")
  await pool.query("delete from public.visitas_clic")
})

async function clics(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ enlace: string; total: number }>(
    "select enlace, sum(clics)::int as total from public.clics_enlace_dia group by enlace",
  )
  return Object.fromEntries(rows.map((r) => [r.enlace, r.total]))
}

function luminancia(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

test("the page needs no session, shows her name, the notice and only the links that are ready", async ({ page }) => {
  await page.goto("/l")

  await expect(page).toHaveURL(/\/l$/)
  await expect(page.getByRole("heading", { name: "Constanza del Rosario", level: 1 })).toBeVisible()
  await expect(page.getByText("Psicóloga clínica y sexóloga")).toBeVisible()
  await expect(
    page.getByText("Contenido educativo. No reemplaza una consulta. Algunos videos usan mi avatar digital."),
  ).toBeVisible()
  const enlaces = page.getByRole("navigation", { name: "Enlaces" }).getByRole("link")
  await expect(enlaces).toHaveText([/Agenda una consulta/, /Mis libros/, /Fundación Ring!/])
  await expect(page.getByText("Taller Ser tu propia diosa")).toHaveCount(0)
  // Every link goes through the counter, never straight to the destination.
  await expect(enlaces.first()).toHaveAttribute("href", "/l/ir/agenda")
  await capturar(page, "l-publica")
})

test("sets no cookie and shows no app navigation to a visitor", async ({ page }) => {
  const respuesta = await page.goto("/l")

  expect(await respuesta?.headerValue("set-cookie")).toBeNull()
  await expect(page.getByRole("link", { name: "Métricas" })).toHaveCount(0)
  expect(await page.context().cookies()).toEqual([])
})

test("every piece of text on the raspberry surface reaches AA contrast without any transparency", async ({ page }) => {
  await page.goto("/l")

  const medidas = await page.evaluate(() => {
    const fondo = getComputedStyle(document.querySelector("[data-superficie=marca]") as Element).backgroundColor
    return [...document.querySelectorAll("h1, p, a span")].map((nodo) => {
      const estilo = getComputedStyle(nodo)
      return { texto: nodo.textContent, color: estilo.color, opacidad: estilo.opacity, fondo }
    })
  })

  expect(medidas.length).toBeGreaterThanOrEqual(6)
  for (const m of medidas) {
    expect(m.opacidad, m.texto ?? "").toBe("1")
    const claro = Math.max(luminancia(m.color), luminancia(m.fondo))
    const oscuro = Math.min(luminancia(m.color), luminancia(m.fondo))
    expect((claro + 0.05) / (oscuro + 0.05), m.texto ?? "").toBeGreaterThanOrEqual(4.5)
  }
})

test("a tap counts one click for that visitor for the day, and the visitor reaches the link", async ({ page }) => {
  // The browser cannot reach a made-up host, so this link points back at the app itself; the redirect to an outside
  // address is checked on its response in the next test.
  const destino = `${URL_DE_LA_APP}/ingreso`
  await pool.query("update public.ajustes set enlaces = $1::jsonb", [
    JSON.stringify(ENLACES.map((e) => (e.id === "agenda" ? { ...e, url: destino } : e))),
  ])
  await page.goto("/l")

  await page.getByRole("link", { name: /Agenda una consulta/ }).click()
  await expect(page).toHaveURL(destino)
  expect(await clics()).toEqual({ agenda: 1 })

  await page.goto("/l")
  await page.getByRole("link", { name: /Agenda una consulta/ }).click()
  await expect(page).toHaveURL(destino)
  expect(await clics()).toEqual({ agenda: 1 })
})

test("another person counts, a link scanner and a prefetch do not, and all of them are sent on", async ({
  request,
}) => {
  const ir = (cabeceras: Record<string, string>) => request.get("/l/ir/libros", { maxRedirects: 0, headers: cabeceras })

  const persona = await ir({ ...PERSONA, "x-forwarded-for": "190.1.1.1" })
  expect(persona.status()).toBe(302)
  expect(persona.headers().location).toBe("https://libros.test/coni")
  expect(persona.headers()["cache-control"]).toBe("no-store")
  await ir({ ...PERSONA, "x-forwarded-for": "190.1.1.1" })
  await ir({ ...PERSONA, "x-forwarded-for": "190.2.2.2" })
  expect(await clics()).toEqual({ libros: 2 })

  const escaner = await ir({ "user-agent": "facebookexternalhit/1.1", "x-forwarded-for": "31.13.1.1" })
  const anticipo = await ir({ ...PERSONA, "x-forwarded-for": "190.3.3.3", "sec-purpose": "prefetch" })
  expect(escaner.headers().location).toBe("https://libros.test/coni")
  expect(anticipo.headers().location).toBe("https://libros.test/coni")
  const cabeza = await request.head("/l/ir/libros", {
    maxRedirects: 0,
    headers: { ...PERSONA, "x-forwarded-for": "190.4.4.4" },
  })
  expect(cabeza.status()).toBe(302)
  expect(await clics()).toEqual({ libros: 2 })
})

test("stores no address and no device: the only trace of a visitor is a hash of the day", async ({ request }) => {
  await request.get("/l/ir/agenda", { maxRedirects: 0, headers: { ...PERSONA, "x-forwarded-for": "190.9.9.9" } })

  const { rows } = await pool.query<{ visitante: string }>("select * from public.visitas_clic")
  expect(rows).toHaveLength(1)
  const texto = JSON.stringify(rows)
  expect(texto).not.toContain("190.9.9.9")
  expect(texto).not.toContain("iPhone")
  expect(rows[0]?.visitante).toMatch(/^[0-9a-f]{64}$/)
})

test("a link that is not ready, or does not exist, sends the visitor back to the page and never to an error", async ({
  request,
}) => {
  for (const enlace of ["taller", "no-existe", "x".repeat(80)]) {
    const respuesta = await request.get(`/l/ir/${enlace}`, { maxRedirects: 0, headers: PERSONA })
    expect(respuesta.status()).toBe(302)
    expect(new URL(respuesta.headers().location ?? "").pathname).toBe("/l")
  }
  expect(await clics()).toEqual({})
})

test("/l is raspberry edge to edge with Coni's name in Geist at 2.75rem, without the app wordmark", async ({
  page,
}) => {
  await page.goto("/l")
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(168, 40, 90)")
  await expect(page.getByRole("img", { name: "Conidolly" })).toHaveCount(0)
  const titulo = page.getByRole("heading", { level: 1 })
  // 2.75rem on the 17 px root (106.25 %).
  await expect(titulo).toHaveCSS("font-size", "46.75px")
  expect(await titulo.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Geist/i)
  // Text on the raspberry is the full light colour, never a transparency.
  await expect(titulo).toHaveCSS("color", "rgb(251, 251, 250)")
  await capturar(page, "enlace-publico")
})
