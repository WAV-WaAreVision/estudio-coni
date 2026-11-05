import { expect, type Locator, type Page, test } from "@playwright/test"
import { etiquetaDeEtapa } from "@/lib/dominio/biblioteca/borradores"
import { pool } from "../integration/db"
import { bloquearRedExterna, capturar, conLetraGrande, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  BORRADOR_DE_INSTAGRAM,
  RED_EN_BORRADOR,
  sembrarAutoresYTemas,
  sembrarBorradores,
  sembrarEtapaDeLinkedin,
} from "./biblioteca-escena"

// Coni's acceptance line (respuesta-coni-temas-pilares-2026-11-04.md, part 1, section 7) and spec 15c, section 4.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
})

const NUEVO = {
  nombre: "Liderazgo sereno: decidir con IA sin perder la calma",
  corto: "Liderazgo sereno",
  definicion: "Cómo decide una líder cuando la IA acelera todo, sin perder el criterio ni la calma.",
}
const UN_ID = "[0-9a-f-]{36}"
const pilaresDe = (page: Page, nombre: "LinkedIn" | "Instagram") =>
  page.getByRole("list", { name: `Pilares de ${nombre}` })
const fila = (page: Page) => page.getByRole("group", { name: "Filtrar temas" })

test("«+ Agregar pilar» guarda un borrador que no aparece en la lista hasta que lo apruebo", async ({ page }) => {
  // A later stage of the scene's own, 400 days ahead: the test edits it whatever today's date is (decision 20).
  const etapaPropia = await sembrarEtapaDeLinkedin()
  await page.goto("/biblioteca/temas?red=linkedin")
  await tocarHastaLlegar(
    page,
    pilaresDe(page, "LinkedIn").getByRole("link", { name: "Agregar pilar" }),
    /\/biblioteca\/temas\/pilar-nuevo\?red=linkedin$/,
  )
  await expect(page.getByText("Red: LinkedIn")).toBeVisible()
  await page.getByLabel("Nombre", { exact: true }).fill(NUEVO.nombre)
  await page.getByLabel("Nombre corto").fill(NUEVO.corto)
  await page.getByLabel("Definición").fill(NUEVO.definicion)
  await page.getByLabel("Peso (%)").fill("10")
  await page.getByRole("button", { name: "Guardar borrador" }).click()

  // Back on Temas, on LinkedIn: the note is said once and leaves the address; the draft is not a pillar.
  await expect(page.getByText("Guardé el borrador. Apruébalo en Borradores cuando quieras.")).toBeVisible()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?red=linkedin(?:&v=\d+)?$/)
  await expect(pilaresDe(page, "LinkedIn").getByRole("link", { name: NUEVO.corto })).toHaveCount(0)
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Borradores · 1" }), /\/biblioteca\/temas\/borradores$/)

  const tarjeta = page.getByRole("article", { name: NUEVO.nombre })
  await tocarHastaLlegar(
    page,
    tarjeta.getByRole("link", { name: "Aprobar" }),
    new RegExp(`/biblioteca/temas/borradores/${UN_ID}/aprobar$`),
  )
  // LinkedIn adds up to 100 in every stage: with the new 10 each is 110 until she redistributes it.
  const hoy = page.getByRole("group", { name: "Hoy", exact: true })
  const propia = page.getByRole("group", { name: etiquetaDeEtapa(etapaPropia, ""), exact: true })
  const total = (etapa: Locator) => etapa.getByRole("status").filter({ hasText: "Total:" })
  await expect(total(hoy)).toHaveText("Total: 110 %")
  await expect(
    hoy.getByText("Los pesos de LinkedIn suman 110 %. Puedes aprobar igual y ajustarlos después."),
  ).toBeVisible()
  await expect(total(propia)).toHaveText("Total: 110 %")
  const diagnostico = hoy.getByLabel(/^Diagnóstico doble/)
  const antes = Number((await diagnostico.inputValue()).replace(",", "."))
  await diagnostico.fill(String(antes - 10))
  await expect(total(hoy)).toHaveText("Total: 100 %")
  await expect(hoy.getByText(/suman/)).toHaveCount(0)
  // In her own later stage (25 each) the new pillar takes 15, all of it from Diagnóstico doble.
  await propia.getByLabel(/^Liderazgo sereno · nuevo/).fill("15")
  await propia.getByLabel(/^Diagnóstico doble/).fill("10")
  await expect(total(propia)).toHaveText("Total: 100 %")
  await expect(propia.getByText(/suman/)).toHaveCount(0)
  await page.getByRole("button", { name: "Aprobar pilar" }).click()

  // Temas on LinkedIn with the new pillar chosen: its topics filter works and shows nothing yet.
  await expect(page).toHaveURL(new RegExp(`/biblioteca/temas\\?red=linkedin&pilar=${UN_ID}(?:&v=\\d+)?$`))
  await expect(page.getByText("Aprobé el pilar. Ya aparece en Temas.")).toBeVisible()
  const nuevo = pilaresDe(page, "LinkedIn").getByRole("link", { name: NUEVO.corto, exact: true })
  await expect(nuevo).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
  await expect(page.getByRole("link", { name: /^Borradores/ })).toHaveCount(0)
  await expect(pilaresDe(page, "LinkedIn").getByRole("link")).toHaveText([
    "Todos los pilares",
    "Diagnóstico doble",
    "Bienestar e impacto",
    "Psicología en la mesa",
    "Mujeres líderes",
    NUEVO.corto,
    "Agregar pilar",
  ])
  const pesosEn = async (desde: string) => {
    const { rows } = await pool.query<{ nombre_corto: string; peso: number }>(
      `select c.nombre_corto, p.peso::float8 as peso
       from public.pilar_pesos p join public.categorias c on c.id = p.pilar_id
       where p.desde = $1::date and c.nombre_corto = any($2::text[])
       order by c.nombre_corto`,
      [desde, ["Diagnóstico doble", NUEVO.corto]],
    )
    return rows
  }
  const { rows: dia } = await pool.query<{ hoy: string }>(
    "select ((now() at time zone 'America/Santiago')::date)::text as hoy",
  )
  expect(await pesosEn(dia[0]?.hoy ?? "")).toEqual([
    { nombre_corto: "Diagnóstico doble", peso: antes - 10 },
    { nombre_corto: NUEVO.corto, peso: 10 },
  ])
  expect(await pesosEn(etapaPropia)).toEqual([
    { nombre_corto: "Diagnóstico doble", peso: 10 },
    { nombre_corto: NUEVO.corto, peso: 15 },
  ])
  // Every later stage of LinkedIn (the seed's ones still ahead, if any) gave the new pillar a weight.
  const { rows: sinPeso } = await pool.query(
    `select distinct w.desde from public.pilar_pesos w join public.categorias c on c.id = w.pilar_id
     where c.red = 'linkedin' and c.activa and not c.es_capa
       and w.desde > (now() at time zone 'America/Santiago')::date
       and not exists (
         select 1 from public.pilar_pesos n join public.categorias nc on nc.id = n.pilar_id
         where nc.nombre_corto = $1 and n.desde = w.desde
       )`,
    [NUEVO.corto],
  )
  expect(sinPeso).toEqual([])
})

test("«+ Agregar red» saves a draft that waits for its connection and can never be approved", async ({ page }) => {
  await page.goto("/biblioteca/temas")
  await tocarHastaLlegar(page, fila(page).getByRole("link", { name: "Agregar red" }), /\/biblioteca\/temas\/red-nueva$/)
  await page.getByLabel("Nombre", { exact: true }).fill(RED_EN_BORRADOR)
  await page.getByLabel("Manual (opcional)").fill("Videos cortos para líderes jóvenes.")
  await page.getByRole("button", { name: "Guardar borrador" }).click()
  await expect(page.getByText("Guardé el borrador de la red. Queda en Borradores, esperando conexión.")).toBeVisible()
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Borradores · 1" }), /\/biblioteca\/temas\/borradores$/)
  const tarjeta = page.getByRole("article", { name: RED_EN_BORRADOR })
  await expect(tarjeta.getByText("Esperando conexión")).toBeVisible()
  await expect(tarjeta.getByRole("link", { name: "Aprobar" })).toHaveCount(0)
  await expect(tarjeta.getByRole("link", { name: "Editar" })).toBeVisible()
  const { rows } = await pool.query("select nombre, manual, receta, conexion, estado from public.borradores_de_red")
  expect(rows).toEqual([
    {
      nombre: RED_EN_BORRADOR,
      manual: "Videos cortos para líderes jóvenes.",
      receta: "",
      conexion: "",
      estado: "borrador",
    },
  ])
})

test("a draft is edited from Borradores, says a missing field, and once discarded is gone and cannot be opened", async ({
  page,
}) => {
  const { pilar } = await sembrarBorradores()
  await page.goto("/biblioteca/temas/borradores")
  const tarjeta = page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre })
  await tocarHastaLlegar(
    page,
    tarjeta.getByRole("link", { name: "Editar" }),
    new RegExp(`/biblioteca/temas/borradores/${pilar}/editar$`),
  )
  await expect(page.getByText("Red: Instagram")).toBeVisible()
  const corto = page.getByLabel("Nombre corto")
  await expect(corto).toHaveValue(BORRADOR_DE_INSTAGRAM.nombreCorto)
  await corto.fill("")
  await page.getByRole("button", { name: "Guardar borrador" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Escribe el nombre corto" })).toBeVisible()
  await expect(corto).toBeFocused()
  await expect(corto).toHaveAttribute("aria-invalid", "true")
  await corto.fill(BORRADOR_DE_INSTAGRAM.nombreCorto)
  await page.getByLabel("Peso (%)").fill("12,5")
  await page.getByRole("button", { name: "Guardar borrador" }).click()

  await expect(page.getByText("Guardé los cambios del borrador.")).toBeVisible()
  await expect(tarjeta).toContainText("Peso: 12,5 %")
  await tarjeta.getByRole("button", { name: "Descartar" }).click()
  await expect(tarjeta.getByText(/¿Descartar «/)).toBeFocused()
  await tarjeta.getByRole("button", { name: "Descartar" }).click()
  await expect(page.getByText("Descarté el borrador.")).toBeVisible()
  await expect(page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre })).toHaveCount(0)
  await expect(page.getByRole("article", { name: RED_EN_BORRADOR })).toBeVisible()
  const { rows } = await pool.query(
    "select estado, peso::float8 as peso from public.borradores_de_pilar where id = $1",
    [pilar],
  )
  expect(rows).toEqual([{ estado: "descartado", peso: 12.5 }])
  await page.goto(`/biblioteca/temas/borradores/${pilar}/editar`)
  await expect(page.getByRole("heading", { name: "No encontré lo que buscabas", level: 1 })).toBeVisible()
})

test("«Agregar pilar» slides with the pillars on the phone and opens from the keyboard", async ({ page }) => {
  await page.goto("/biblioteca/temas?red=instagram")
  const pista = pilaresDe(page, "Instagram")
  await expect(pista.getByRole("link")).toHaveText([
    "Todos los pilares",
    "Game Over Impostora",
    "Mi nueva partida",
    "Inteligencia emocional",
    "Agregar pilar",
    "Capa TDAH",
  ])
  await expect
    .poll(
      async () =>
        new Set(await pista.getByRole("link").evaluateAll((e) => e.map((x) => x.getBoundingClientRect().top))).size,
    )
    .toBe(1)
  const agregar = pista.getByRole("link", { name: "Agregar pilar" })
  await agregar.focus()
  await expect(agregar).toBeInViewport({ ratio: 1 })
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/biblioteca\/temas\/pilar-nuevo\?red=instagram$/)
})

test("the drafts' pages pass WCAG 2.x AA, keep 44 px targets and fit the phone at large text", async ({ page }) => {
  const { pilar } = await sembrarBorradores()
  // Temas itself (with its hidden desktop table) is checked by biblioteca-temas-por-red.spec.ts, buttons included.
  const paginas = [
    ["/biblioteca/temas/pilar-nuevo?red=instagram", "pilar nuevo"],
    ["/biblioteca/temas/red-nueva", "red nueva"],
    ["/biblioteca/temas/borradores", "borradores"],
    [`/biblioteca/temas/borradores/${pilar}/aprobar`, "aprobar pilar"],
  ] as const
  for (const [direccion, estado] of paginas) {
    await page.goto(direccion)
    expect(await revisarConAxe(page, estado)).toEqual([])
    await conLetraGrande(page)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), {
        message: `${estado}: la página no se desliza`,
      })
      .toBe(true)
    const objetivos = page.locator("main").locator("a, button, input, textarea")
    for (const objetivo of await objetivos.all()) {
      const nombre = (await objetivo.getAttribute("aria-label")) ?? (await objetivo.textContent()) ?? ""
      expect((await objetivo.boundingBox())?.height ?? 0, `${estado}: ${nombre}`).toBeGreaterThanOrEqual(44)
    }
    expect(await revisarConAxe(page, `${estado} con letra grande`)).toEqual([])
  }
  await capturar(page, "aprobar-pilar-letra-grande", { completa: true })
})
