// Production's Supabase project. A Vercel preview must never reach it: previews run on the staging branch (issue 7).
const REF_DE_PRODUCCION = "mvfytttfxmzzjajecsch"
const VARIABLES = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const

/**
 * Fails the build of a Vercel preview whose database or Trigger key is production's, so a forgotten variable stops the deployment
 * instead of letting a PR write real data. Production and local builds are left alone.
 */
export function exigirPreviewSinProduccion(entorno: Record<string, string | undefined>): void {
  if (entorno.VERCEL_ENV !== "preview") return
  for (const variable of VARIABLES) {
    if (entorno[variable]?.includes(REF_DE_PRODUCCION))
      throw new Error(`${variable} apunta a la base de producción en una vista previa de Vercel: usa la de staging.`)
  }
  // Trigger's production keys start with `tr_prod_`: a preview with one would run production's tasks.
  if (entorno.TRIGGER_SECRET_KEY?.startsWith("tr_prod_"))
    throw new Error(
      "TRIGGER_SECRET_KEY es la llave de producción de Trigger en una vista previa de Vercel: usa la de staging.",
    )
}
