// The outside world of the E2E run: one local server that answers like Anthropic, HeyGen, ElevenLabs and Instagram, so
// the app never calls a real service. The specs steer it with POST /__estado and read what it was asked with
// GET /__registro. It runs as its own web server (playwright.config.ts) because the app is a separate process.
import { createServer } from "node:http"

interface Estado {
  anthropic: "ok" | "401" | "500"
  heygen: "ok" | "401"
  elevenlabs: "ok" | "401"
  instagram: "ok" | "rechazo"
  push: "ok" | "410" | "503"
  heygenSaldo: number
  elevenlabsUsados: number
}

const INICIAL: Estado = {
  anthropic: "ok",
  heygen: "ok",
  elevenlabs: "ok",
  instagram: "ok",
  push: "ok",
  heygenSaldo: 50,
  elevenlabsUsados: 1000,
}

let estado: Estado = { ...INICIAL }
let registro: { metodo: string; ruta: string; cuerpo: string }[] = []

const PUERTO = Number(process.env.PUERTO_SERVICIOS_FALSOS ?? 3201)

const PROPUESTA = {
  pilar: "acceso-salud-publica",
  formato: "Mito o realidad",
  alertas: [{ tipo: "líneas de ayuda", texto: "El tema roza la violencia en la pareja." }],
}

function responder(res: import("node:http").ServerResponse, codigo: number, cuerpo: unknown) {
  res.writeHead(codigo, { "content-type": "application/json" })
  res.end(JSON.stringify(cuerpo))
}

const servidor = createServer((req, res) => {
  const trozos: Buffer[] = []
  req.on("data", (trozo: Buffer) => trozos.push(trozo))
  req.on("end", () => {
    const cuerpo = Buffer.concat(trozos).toString("utf-8")
    const url = new URL(req.url ?? "/", "http://localhost")
    const metodo = req.method ?? "GET"
    const ruta = url.pathname

    if (ruta === "/__salud") return responder(res, 200, { ok: true })
    if (ruta === "/__registro") return responder(res, 200, registro)
    if (ruta === "/__estado" && metodo === "POST") {
      estado = { ...INICIAL, ...JSON.parse(cuerpo || "{}") }
      registro = []
      return responder(res, 200, estado)
    }
    // Web Push: POST /push/<token>, what a push service answers (RFC 8030). The path is a capability and the body is
    // encrypted, so the log only says that a push arrived and how big it was.
    if (ruta.startsWith("/push/") && metodo === "POST") {
      registro.push({ metodo, ruta: "/push/[x]", cuerpo: `[cifrado, ${Buffer.byteLength(cuerpo)} bytes]` })
      if (estado.push === "410") return responder(res, 410, { error: "gone" })
      if (estado.push === "503") return responder(res, 503, { error: "unavailable" })
      return responder(res, 201, {})
    }

    // The keys never go into the log: only that they were sent.
    registro.push({
      metodo,
      ruta,
      cuerpo: cuerpo
        .replace(/"(client_secret|access_token|code)":"[^"]*"/g, '"$1":"[x]"')
        .replace(/\b(client_secret|access_token|code)=[^&]*/g, "$1=[x]"),
    })

    // Anthropic: POST /v1/messages (classify an idea), GET /v1/models (check the key)
    if (ruta === "/v1/messages") {
      if (estado.anthropic === "500")
        return responder(res, 500, { type: "error", error: { type: "api_error", message: "x" } })
      if (estado.anthropic === "401") {
        return responder(res, 401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        })
      }
      // The script review (Coni edits on the Guion screen) asks for findings; an idea asks for a proposal.
      const salida = cuerpo.includes("Revisa el guion y el texto de publicación") ? { hallazgos: [] } : PROPUESTA
      return responder(res, 200, {
        id: "msg_falso",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 3000, output_tokens: 200 },
      })
    }
    if (ruta === "/v1/models") {
      if (estado.anthropic === "500")
        return responder(res, 500, { type: "error", error: { type: "api_error", message: "x" } })
      if (estado.anthropic === "401") {
        return responder(res, 401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        })
      }
      return responder(res, 200, { data: [{ id: "claude-opus-5-5", type: "model" }], has_more: false })
    }

    // HeyGen v3: GET /v3/users/me
    if (ruta === "/v3/users/me") {
      return estado.heygen === "401"
        ? responder(res, 401, { error: { code: "unauthorized", message: "unauthorized" } })
        : responder(res, 200, {
            data: {
              username: "coni",
              billing_type: "wallet",
              wallet: { currency: "usd", remaining_balance: estado.heygenSaldo },
            },
          })
    }

    // ElevenLabs: GET /v1/user/subscription (the characters left)
    if (ruta === "/v1/user/subscription") {
      return estado.elevenlabs === "401"
        ? responder(res, 401, { detail: { status: "invalid_api_key", message: "Invalid API key" } })
        : responder(res, 200, {
            tier: "creator",
            status: "active",
            character_count: estado.elevenlabsUsados,
            character_limit: 100_000,
            next_character_count_reset_unix: 1_760_281_200,
            can_extend_character_limit: false,
            allowed_to_extend_character_limit: false,
          })
    }

    // ElevenLabs: GET /v1/voices/:id
    if (ruta.startsWith("/v1/voices/")) {
      return estado.elevenlabs === "401"
        ? responder(res, 401, { detail: { status: "invalid_api_key", message: "Invalid API key" } })
        : responder(res, 200, { voice_id: ruta.split("/").pop(), name: "Coni" })
    }

    // Instagram Login: POST /oauth/access_token, GET /access_token (long-lived), GET /v25.0/me
    if (ruta === "/oauth/access_token") {
      return estado.instagram === "rechazo"
        ? responder(res, 400, { error_type: "OAuthException", code: 400, error_message: "Invalid authorization code" })
        : responder(res, 200, {
            access_token: "IGQ_corto",
            user_id: 17841400000000000,
            permissions: ["instagram_business_basic"],
          })
    }
    if (ruta === "/access_token") {
      return responder(res, 200, { access_token: "IGQ_largo_falso", token_type: "bearer", expires_in: 5_183_944 })
    }
    if (ruta.endsWith("/me")) {
      return responder(res, 200, { user_id: "17841400000000000", username: "coni.delrosario" })
    }

    return responder(res, 404, { error: `ruta desconocida: ${metodo} ${ruta}` })
  })
})

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`servicios falsos en http://127.0.0.1:${PUERTO}`)
})
