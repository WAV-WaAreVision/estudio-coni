const HOSTS_LOCALES = new Set(["127.0.0.1", "localhost"])

function hostDe(url: string): string {
  try {
    return new URL(url).hostname
  } catch (causa) {
    throw new Error("Las pruebas solo corren contra la base local: no pude leer SUPABASE_DB_URL.", { cause: causa })
  }
}

/**
 * The integration tests and the e2e teardown delete spend, pieces and limits: they only ever run against the local
 * Supabase. The URL is not repeated in the error because it carries the password.
 */
export function exigirBaseLocal(url: string): string {
  const host = hostDe(url)
  if (!HOSTS_LOCALES.has(host)) {
    throw new Error(
      `Las pruebas solo corren contra la base local (127.0.0.1 o localhost), no contra ${host}. Revisa SUPABASE_DB_URL.`,
    )
  }
  return url
}
