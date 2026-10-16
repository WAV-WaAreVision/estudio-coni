import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, configurarServicios, simularMedios } from "./ayudas"
import { sembrarEscena } from "./escena"

test("the app text is set in Geist, one family", async ({ page }) => {
  await page.goto("/")
  const familia = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(familia).toMatch(/Geist/i)
  expect(familia).not.toMatch(/Hanken|Young/i)
  // The approx sign is in the npm Geist and not in the Google subset (brandkit section 4).
  const cargada = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].some((f) => /geist/i.test(f.family) && f.status === "loaded")
  })
  expect(cargada).toBe(true)
})

test("the app stays light even when the phone is in dark mode (light only)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await page.goto("/")
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(fondo).toBe("rgb(235, 235, 234)") // #ebebea, piedra
  const esquema = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
  expect(esquema).toBe("light")
})

// Light only: there is no dark theme to audit.
async function rutas(): Promise<string[]> {
  const { guion, video } = await sembrarEscena()
  return [
    "/",
    "/ideas",
    "/calendario",
    "/calendario?vista=agenda",
    "/calendario?vista=ritmo",
    "/metricas",
    "/ajustes",
    "/ajustes/cuentas",
    `/guion/${guion}`,
    `/video/${video}`,
    "/l",
  ]
}

test.beforeEach(async ({ page }) => {
  // The idea card fades in: axe would read the colours halfway. Reduced motion is also a real way to use the app.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await configurarServicios()
  await simularMedios(page)
})

test("every screen passes WCAG 2.x AA", async ({ page }) => {
  // Tall enough that the sticky bottom bar never covers content while axe measures target sizes (it depends on scroll).
  await page.setViewportSize({ width: 390, height: 2600 })
  const hallazgos: string[] = []
  for (const ruta of await rutas()) {
    await page.goto(ruta)
    // The frame of the video is the user's footage: its contrast is not the app's.
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude("video")
      .analyze()
    hallazgos.push(...violations.map((v) => `${ruta}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`))
  }
  expect(hallazgos).toEqual([])
})

test("every control on every screen is at least 44 x 44", async ({ page }) => {
  const hallazgos: string[] = []
  for (const ruta of await rutas()) {
    await page.goto(ruta)
    const chicos = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, [role=slider], [role=switch], input:not([type=hidden]), select, summary",
        ),
      ]
        .filter((el) => el.offsetParent !== null && !el.closest("[aria-hidden=true], [data-en-linea]"))
        // A native input that is invisible or covers its row is measured through its label: the label is the target.
        .map((el) => ({ el, caja: (el.closest("label") ?? el).getBoundingClientRect() }))
        .filter(({ caja }) => caja.width < 44 || caja.height < 44)
        .map(
          ({ el, caja }) =>
            `${el.tagName} "${el.textContent?.trim().slice(0, 30) || el.getAttribute("aria-label")}" ${Math.round(caja.width)}x${Math.round(caja.height)}`,
        ),
    )
    hallazgos.push(...chicos.map((chico) => `${ruta}: ${chico}`))
  }
  expect(hallazgos).toEqual([])
})
