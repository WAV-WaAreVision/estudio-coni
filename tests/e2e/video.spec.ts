import { expect, test } from "@playwright/test"
import { CONI, pool } from "../integration/db"
import { leerFila, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  capturar,
  deslizarHastaElFinal,
  disparosRegistrados,
  GUION_VALIDO,
  limpiarDisparos,
  simularMedios,
  TEXTO_VALIDO,
} from "./ayudas"

const ETIQUETA = "Desliza para firmar"

test.beforeEach(async () => {
  await vaciarPiezasEIdeas()
  limpiarDisparos()
})

async function videoPorAprobar() {
  const idea = await sembrarIdea({ pilar: "autoestima", gancho: "Ser tu propia diosa" })
  return sembrarPieza("video_por_aprobar", {
    titulo: "Ser tu propia diosa",
    idea_id: idea,
    guion: GUION_VALIDO,
    texto: TEXTO_VALIDO,
    video_id: "videos/e2e.webm",
  })
}

test("she watches the whole video, checks it, picks a date and slides: it is scheduled as she approved it", async ({
  page,
}) => {
  const id = await videoPorAprobar()
  await simularMedios(page)
  await page.goto(`/video/${id}`)

  const deslizador = page.getByRole("slider", { name: ETIQUETA })
  await expect(page.getByText("Avatar IA")).toBeVisible()
  await expect(page.getByText("Míralo completo para aprobar")).toBeVisible()
  await expect(page.getByText("Se activa al terminar de verlo.")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  // The review panel is not there until the video was watched to the end.
  await expect(page.getByRole("checkbox", { name: /Revisé labios/ })).toHaveCount(0)

  await page.getByRole("button", { name: "Reproducir el video" }).click()
  await expect(page.getByText("Lo viste completo")).toBeVisible({ timeout: 15_000 })
  await page
    .getByRole("button", { name: "Pausar el video" })
    .or(page.getByRole("button", { name: "Reproducir el video" }))
    .first()
    .scrollIntoViewIfNeeded()

  await expect(page.getByText("Marca lo que revisaste.")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await page.getByRole("checkbox", { name: /Revisé labios/ }).check()
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  // She takes the second free slot instead of the first one.
  await page.getByRole("button", { name: "Cambiar" }).click()
  const opciones = page.getByRole("radio")
  await expect(opciones).toHaveCount(4)
  await opciones.nth(1).check()
  const etiquetaElegida = (await page.locator("label:has(input[type=radio])").nth(1).innerText()).trim()
  await page.getByRole("button", { name: "Listo" }).click()
  await expect(page.getByText(etiquetaElegida, { exact: true })).toBeVisible()
  await capturar(page, "05-video")

  // Drag the thumb across the track with the pointer: the other way to sign besides the keyboard and two taps.
  await deslizarHastaElFinal(page)

  await expect(page.getByText(`Programado para el ${etiquetaElegida}`)).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("programado")
  expect(fila.puerta2_por).toBe(CONI)
  expect(fila.puerta2_video_id).toBe("videos/e2e.webm")
  const hora = new Date(fila.puerta2_publicar_en)
  expect(hora.getUTCMinutes()).toBe(0)
  // 19:00 in Chile is 22:00 UTC in summer time and 23:00 in winter time.
  expect([22, 23]).toContain(hora.getUTCHours())
  expect(disparosRegistrados()).toEqual([])
})

test("skipping to the end of the video does not count as watching it", async ({ page }) => {
  await videoPorAprobar()
  await simularMedios(page)
  const id = (await pool.query<{ id: string }>("select id from public.piezas")).rows[0]?.id
  await page.goto(`/video/${id}`)

  await page.getByRole("button", { name: "Reproducir el video" }).click()
  await page.evaluate(() => {
    const video = document.querySelector("video")
    if (video) video.currentTime = video.duration - 0.2
  })
  await page.waitForTimeout(1500)

  await expect(page.getByText("Lo viste completo")).toHaveCount(0)
  await expect(page.getByText("Míralo completo para aprobar")).toBeVisible()
})

test("regrabar goes back to recording as a new attempt", async ({ page }) => {
  const id = await videoPorAprobar()
  await simularMedios(page)
  await page.goto(`/video/${id}`)

  await page.getByRole("button", { name: "Regrabar" }).click()
  await page.getByRole("button", { name: "Sí, regrabar" }).click()

  await expect(page).toHaveURL(new RegExp(`/guion/${id}$`))
  await expect(page.getByText("Estoy grabando tu video.")).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("en_render")
  expect(fila.intento).toBe(1)
  expect(disparosRegistrados().map((d) => d.tarea)).toEqual(["grabar"])
})

test("a scheduled piece shows its date and lets her change it", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "pareja", gancho: "Si van a discutir" })
  const id = await sembrarPieza("programado", { titulo: "Si van a discutir, siéntense del mismo lado", idea_id: idea })

  await page.goto(`/video/${id}`)
  await expect(page.getByText(/^Programado para el /)).toBeVisible()
  await page.getByRole("button", { name: "Cambiar la fecha" }).click()

  await expect(page.getByRole("slider", { name: ETIQUETA })).toBeVisible()
  expect((await leerFila(id)).estado).toBe("video_por_aprobar")
})

test("the first ready video she opens says how to read it, once, and the database remembers", async ({ page }) => {
  await pool.query("update public.ajustes set avatar_visto_en = null")
  const id = await videoPorAprobar()
  await simularMedios(page)
  const mensaje = page.getByText("Así se ve tu avatar. Si algo no te calza, regrábalo.")

  await page.goto(`/video/${id}`)
  await expect(mensaje).toBeVisible()
  await capturar(page, "primera-vez-avatar")
  await expect
    .poll(async () => (await pool.query("select avatar_visto_en from public.ajustes")).rows[0]?.avatar_visto_en)
    .not.toBeNull()

  await page.reload()
  await expect(page.getByText("Avatar IA")).toBeVisible()
  await expect(mensaje).toHaveCount(0)
})

test("the whole video and its play are visible above the sign bar on load at 390 x 844", async ({ page }) => {
  const id = await videoPorAprobar()
  await simularMedios(page)
  await page.goto(`/video/${id}`)
  const play = page.getByRole("button", { name: "Reproducir el video" })
  const barra = page.getByRole("region", { name: "Firma" })
  await expect(page.getByTestId("reproductor-video")).toBeVisible()
  const [cajaPlay, cajaBarra, cajaVideo] = await Promise.all([
    play.boundingBox(),
    barra.boundingBox(),
    page.getByTestId("reproductor-video").boundingBox(),
  ])
  if (!cajaPlay || !cajaBarra || !cajaVideo) throw new Error("missing boxes")
  expect(cajaPlay.y + cajaPlay.height).toBeLessThan(cajaBarra.y)
  expect(cajaVideo.y + cajaVideo.height).toBeLessThanOrEqual(cajaBarra.y)
  // The video is never dimmed (brandkit 9.17).
  expect(await page.locator("video").evaluate((el) => getComputedStyle(el).filter)).toBe("none")
  await capturar(page, "video-por-aprobar-abrir")
})
