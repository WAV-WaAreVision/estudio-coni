// @vitest-environment node
import { describe, expect, it } from "vitest"
import { esVisitaHumana } from "@/lib/enlaces/robots"

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
// What Instagram's in-app browser sends when a real person taps the link in the bio.
const INSTAGRAM_EN_LA_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 380.0.0.28.104 (iPhone14,5; iOS 18_5; es_CL; es; scale=3.00; 1170x2532; 712938574)"

function cabeceras(extra: Record<string, string> = {}, agente: string | null = IPHONE): Headers {
  const h = new Headers(extra)
  if (agente !== null) h.set("user-agent", agente)
  return h
}

describe("esVisitaHumana", () => {
  it("counts a person on Safari and a person inside Instagram's own browser", () => {
    expect(esVisitaHumana(cabeceras())).toBe(true)
    expect(esVisitaHumana(cabeceras({}, INSTAGRAM_EN_LA_APP))).toBe(true)
  })

  it("counts a browser that sends fetch metadata for a navigation", () => {
    expect(esVisitaHumana(cabeceras({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }))).toBe(true)
  })

  it.each([
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
    "WhatsApp/2.23.20.0 A",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "TelegramBot (like TwitterBot)",
    "Twitterbot/1.0",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; moto g power) Chrome-Lighthouse",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Go-http-client/2.0",
    "node-fetch/1.0",
    "UptimeRobot/2.0",
  ])("does not count a link scanner, crawler or script: %s", (agente) => {
    expect(esVisitaHumana(cabeceras({}, agente))).toBe(false)
  })

  it("does not count a request with no user agent at all", () => {
    expect(esVisitaHumana(cabeceras({}, null))).toBe(false)
    expect(esVisitaHumana(cabeceras({}, "   "))).toBe(false)
  })

  it.each([
    ["purpose", "prefetch"],
    ["sec-purpose", "prefetch"],
    ["sec-purpose", "prefetch;prerender"],
    ["x-purpose", "preview"],
    ["x-moz", "prefetch"],
    ["x-forwarded-purpose", "prefetch"],
  ])("does not count a prefetch the browser made before anybody tapped (%s: %s)", (nombre, valor) => {
    expect(esVisitaHumana(cabeceras({ [nombre]: valor }))).toBe(false)
  })

  it("does not count a request that fetch metadata says is not a navigation", () => {
    expect(esVisitaHumana(cabeceras({ "sec-fetch-mode": "cors" }))).toBe(false)
    expect(esVisitaHumana(cabeceras({ "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }))).toBe(false)
    expect(esVisitaHumana(cabeceras({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }))).toBe(false)
  })
})
