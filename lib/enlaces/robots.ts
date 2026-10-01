// Who is not a person. The count of `/l` is the only account-level conversion signal besides consultations, and
// Meta's link scanner, chat previews and browser prefetches would inflate it (design review, R2).

/** User agents of crawlers, link-preview fetchers, monitors and scripts. A real Instagram browser says "Instagram"
 * plainly, so that word alone never counts as a bot. */
const AGENTES_NO_HUMANOS = new RegExp(
  [
    "bot\\b",
    "bots\\b",
    "crawl",
    "spider",
    "slurp",
    "facebookexternalhit",
    "facebookcatalog",
    "meta-external",
    "whatsapp",
    "telegram",
    "slack",
    "discord",
    "skype",
    "linkedin",
    "pinterest",
    "embedly",
    "quora link preview",
    "preview",
    "headless",
    "lighthouse",
    "pagespeed",
    "gtmetrix",
    "uptime",
    "pingdom",
    "monitor",
    "curl/",
    "wget/",
    "python",
    "go-http-client",
    "okhttp",
    "node-fetch",
    "axios",
    "libwww",
    "httpclient",
    "java/",
    "ruby",
    "php/",
  ].join("|"),
  "i",
)

/** Headers a browser (or a platform) adds when it fetches a page nobody has asked for yet. */
const CABECERAS_DE_ANTICIPO: readonly [nombre: string, patron: RegExp][] = [
  ["purpose", /prefetch|preview/i],
  ["sec-purpose", /prefetch|prerender/i],
  ["x-purpose", /prefetch|preview/i],
  ["x-moz", /prefetch/i],
  ["x-forwarded-purpose", /prefetch|preview/i],
]

/**
 * Whether a request to `/l/ir/<link>` looks like a person who tapped. There is no script on the page to prove it, so
 * the answer comes from the request alone: a user agent that is not a known scanner, no prefetch header, and, when
 * the browser sends fetch metadata, a navigation to a document. A header that is absent never counts against the
 * visitor (older browsers do not send fetch metadata).
 */
export function esVisitaHumana(cabeceras: Headers): boolean {
  const agente = cabeceras.get("user-agent")?.trim() ?? ""
  if (agente === "" || AGENTES_NO_HUMANOS.test(agente)) return false
  if (CABECERAS_DE_ANTICIPO.some(([nombre, patron]) => patron.test(cabeceras.get(nombre) ?? ""))) return false
  const modo = cabeceras.get("sec-fetch-mode")
  if (modo !== null && modo !== "navigate") return false
  const destino = cabeceras.get("sec-fetch-dest")
  if (destino !== null && destino !== "document") return false
  return true
}
