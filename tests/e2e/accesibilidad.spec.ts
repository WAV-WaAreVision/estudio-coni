import { expect, test } from "@playwright/test"

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
