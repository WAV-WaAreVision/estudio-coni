import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { FUSION_APLICADA, FUSION_PROPUESTA, sembrarAutoresYTemas, sembrarFusiones } from "./biblioteca-escena"

// Spec 2026-11-09-fusiones-de-temas-design.md, «Done when» 1 to 4.
let fusiones: Awaited<ReturnType<typeof sembrarFusiones>>

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  fusiones = await sembrarFusiones(await sembrarAutoresYTemas())
})

test("una fusión delicada espera a Coni: Inicio y Temas lo dicen y ella la decide en la página", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Revisa una fusión de temas")).toBeVisible()
  await page.goto("/biblioteca/temas")
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Fusiones · 1" }), /\/biblioteca\/temas\/fusiones$/)
  expect(await revisarConAxe(page, "fusiones en el teléfono")).toEqual([])
  const tarjeta = page.getByRole("article", { name: `«${FUSION_PROPUESTA.perdedor}» y «${FUSION_PROPUESTA.ganador}»` })
  await expect(tarjeta.getByText(`Razón: ${FUSION_PROPUESTA.razon}`)).toBeVisible()
  await expect(tarjeta.getByText(FUSION_PROPUESTA.motivo)).toBeVisible()
  await tarjeta.getByRole("button", { name: "Son distintos" }).click()

  await expect(page.getByText("Guardé que son distintos. No te los vuelvo a proponer.")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Para que decidas" })).toHaveCount(0)
  await expect(
    page.getByRole("region", { name: "Pares que no uní" }).getByText("Tú dijiste que son distintos."),
  ).toBeVisible()
  const { rows } = await pool.query(
    "select tipo, tema_nombre, otro_tema_nombre from public.decisiones_de_tema where tema_nombre = $1",
    [FUSION_PROPUESTA.ganador],
  )
  expect(rows).toEqual([
    { tipo: "fusion_rechazada", tema_nombre: FUSION_PROPUESTA.ganador, otro_tema_nombre: FUSION_PROPUESTA.perdedor },
  ])
  await page.goto("/biblioteca/temas")
  await expect(page.getByRole("link", { name: /^Fusiones/ })).toHaveCount(0)
  await page.goto("/")
  await expect(page.getByText("Revisa una fusión de temas")).toHaveCount(0)
})

test("una fusión aplicada se deshace y el tema absorbido vuelve con sus ideas", async ({ page }) => {
  await page.goto("/biblioteca/temas/fusiones")
  const tarjeta = page.getByRole("region", { name: "Fusiones recientes" }).getByRole("article")
  await expect(tarjeta).toContainText(`Uní «${FUSION_APLICADA.perdedor}» con «${FUSION_APLICADA.ganador}» el`)
  await tarjeta.getByRole("button", { name: "Deshacer" }).click()
  await tarjeta.getByRole("button", { name: "Sí, deshacer" }).click()
  await expect(page.getByText("Deshice la fusión. Los dos temas quedaron como antes.")).toBeVisible()
  await page.goto(`/biblioteca/temas/${fusiones.perdedorAplicado}`)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(FUSION_APLICADA.perdedor)
  await expect(page.getByText("Dormir mal sube la ansiedad.")).toBeVisible()
  const { rows } = await pool.query("select estado from public.fusiones where id = $1", [fusiones.aplicada])
  expect(rows).toEqual([{ estado: "deshecha" }])
})

test("revisión: Fusiones en el teléfono, guardada para Federico", async ({ page }) => {
  const carpeta = process.env.VISUAL_FINALES
  test.skip(!carpeta, "Pantalla nueva: sin referencia hasta que Federico la apruebe.")
  await page.goto("/biblioteca/temas/fusiones")
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  mkdirSync(carpeta ?? "", { recursive: true })
  await page.screenshot({ path: join(carpeta ?? "", "fusiones-telefono.png"), fullPage: true })
})
