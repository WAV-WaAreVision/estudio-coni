// @vitest-environment node
import { createHash } from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import type { DatosDePilar } from "@/lib/dominio/pilares"
import {
  acortarLaminas,
  clasificarEnPilares,
  clasificarIdea,
  confirmarFusiones,
  escribirCarrusel,
  escribirFicha,
  escribirGuion,
  escribirTeorias,
  extraerAfirmaciones,
  guiaDeReclasificacion,
  leerTextoEnImagenes,
  nombrarTemas,
  pedidoDeReclasificacion,
  proponerPilaresPorRed,
  RechazoDeClaude,
  revisarCarruselConClaude,
  revisarConClaude,
  VERSION_DE_EXTRACCION,
} from "@/lib/proveedores/anthropic"
import { servidor } from "../msw"

// Characterization of every prompt this provider sends (issue #16). Each case pins the sha256 of the system text, of
// the user messages and of the whole request body (model, effort, schema) for a fixed input. A changed hash means a
// prompt, a schema or a model setting changed: intended only when the change is the point, and then the snapshot is
// updated in the same commit. The fixtures live here on purpose, so a shared fixture never moves these hashes.

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"

const cliente = () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })

const sha = (texto: string) => createHash("sha256").update(texto).digest("hex")

interface CuerpoMensaje {
  system: { text: string }[]
  messages: unknown
}

const BETA_ESPERADA = "server-side-fallback-2026-07-01"

interface Huella {
  sistema: string
  usuario: string
  cuerpo: string
}

/** Runs one call against a refusing API and returns the fingerprint of every request it sent. */
async function huellas(llamada: (c: Anthropic) => Promise<unknown>): Promise<Huella[]> {
  const cuerpos: CuerpoMensaje[] = []
  const betas: (string | null)[] = []
  servidor.use(
    http.post<never, CuerpoMensaje>(URL_MENSAJES, async ({ request }) => {
      betas.push(request.headers.get("anthropic-beta"))
      cuerpos.push(await request.json())
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: "refusal",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    }),
  )
  await expect(llamada(cliente())).rejects.toBeInstanceOf(RechazoDeClaude)
  // The fallback beta travels as a header, not in the body, so the body hash alone would not catch losing it.
  expect(betas).toEqual(cuerpos.map(() => BETA_ESPERADA))
  return cuerpos.map((cuerpo) => ({
    sistema: sha(cuerpo.system.map((bloque) => bloque.text).join("\n")),
    usuario: sha(JSON.stringify(cuerpo.messages)),
    cuerpo: sha(JSON.stringify(cuerpo)),
  }))
}

const GUIA = "# Línea editorial de prueba\n\nTrata de tú. Español de Chile."

const PILARES: DatosDePilar[] = [
  {
    id: "p-1",
    angulos: [],
    red: null,
    esCapa: false,
    slug: "ia-salud-mental",
    nombre: "IA y salud mental",
    nombreCorto: "IA y salud mental",
    descripcion: "Qué dice la evidencia sobre chatbots y apps.",
    activa: true,
    orden: 1,
  },
  {
    id: "p-2",
    angulos: [],
    red: null,
    esCapa: false,
    slug: "vinculos",
    nombre: "Vínculos",
    nombreCorto: "Vínculos",
    descripcion: null,
    activa: true,
    orden: 2,
  },
  {
    id: "p-3",
    angulos: [],
    red: null,
    esCapa: false,
    slug: "retirado",
    nombre: "Pilar retirado",
    nombreCorto: "Retirado",
    descripcion: null,
    activa: false,
    orden: 3,
  },
]

const IDEA = {
  pilar: { nombre: "IA y salud mental", descripcion: "Qué dice la evidencia sobre chatbots y apps." },
  gancho: "Un chatbot te responde a cualquier hora.",
  tema: "Lo que una app no ve de ti.",
  formato: "Mito o realidad",
  alertas: [{ tipo: "verificar dato" as const, texto: "Confirmar la cifra antes de grabar." }],
}

const IDEA_SIN_NADA = { ...IDEA, pilar: { nombre: "Vínculos", descripcion: null }, alertas: [] }
// 15d: the angle line. An idea without one keeps every hash above (the field is absent there on purpose).
const IDEA_CON_ANGULO = {
  ...IDEA,
  angulo: { nombre: "Lo que construyo", descripcion: "Mi caso a la vista. Voz íntima, fotos reales, demos y video." },
}

const RESPALDO = {
  teoria: { titulo: "Teoría", tesis: "Una tesis.", porQue: "Porque sí." },
  afirmaciones: [{ texto: "Una paráfrasis.", cita: "A literal quote.", aporte: "Lo que aporta." }],
}

const FUENTES = [{ autor: "Esther Perel", titulo: "Mating in Captivity", anio: 2006 }]

const CORRECCIONES = [
  { regla: "diagnostico" as const, tipo: "advierte" as const, mensaje: "Diagnostica.", frase: "tienes ansiedad" },
  { regla: "largo" as const, tipo: "bloquea" as const, mensaje: "Muy largo." },
]

const LAMINAS = [
  { tipo: "portada" as const, texto: "Lo que un chatbot no ve de ti" },
  { tipo: "idea" as const, texto: "No nota el silencio largo antes de una respuesta difícil.", destacado: "silencio" },
  { tipo: "cierre" as const, texto: "¿Qué te faltó la última vez?" },
]

describe("instrucciones de Claude (caracterización byte a byte)", () => {
  it("keeps the extraction version, which marks every stored extraction as current or stale", () => {
    expect(VERSION_DE_EXTRACCION).toMatchInlineSnapshot(
      `"96f15b3ea669df81f6c564694020c5b713e3182d6574c688d623984a2ccee486"`,
    )
  })

  it("keeps the re-classification guide and batch text", () => {
    expect(sha(guiaDeReclasificacion(PILARES))).toMatchInlineSnapshot(
      `"14a791df4614404bceb513bebd630eaea5ef836a35fb65fd3c016bb4f1ee3fd7"`,
    )
    expect(sha(pedidoDeReclasificacion([{ id: "m1", tipo: "material", texto: "Un material." }]))).toMatchInlineSnapshot(
      `"90aac3e0d8326b26aa31a1bdd5624a9227d70e2ebf8cf687a5e60ebb9610d7cd"`,
    )
  })

  it("keeps the script prompt with backing, sources, help lines and corrections", async () => {
    const pedidos = await huellas((c) =>
      escribirGuion({
        cliente: c,
        guia: GUIA,
        idea: IDEA,
        respaldo: RESPALDO,
        fuentes: FUENTES,
        requiereLineasAyuda: true,
        correcciones: CORRECCIONES,
      }),
    )
    expect(pedidos).toMatchInlineSnapshot(`
      [
        {
          "cuerpo": "91a413cf3d70b5997a3cea3d1795e7afd48af940b2c2cadd2ae8a8235b009ca3",
          "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
          "usuario": "11abc45108f7bf79353a37d413957552b34e2e1f484ecaed5a874a8b202d13be",
        },
      ]
    `)
  })

  it("keeps the bare script prompt", async () => {
    const pedidos = await huellas((c) =>
      escribirGuion({
        cliente: c,
        guia: GUIA,
        idea: IDEA_SIN_NADA,
        respaldo: null,
        fuentes: [],
        requiereLineasAyuda: false,
      }),
    )
    expect(pedidos).toMatchInlineSnapshot(`
      [
        {
          "cuerpo": "8db0d431f7c14dc3c2ce9ad52b2408798a5f35b49737040993b72b6b442561a6",
          "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
          "usuario": "1bc9ccdac12b0e6f9689964758067203aa1874abf28d84d876f6cbf85897ea5d",
        },
      ]
    `)
  })

  it("keeps the review prompt with and without the LinkedIn text", async () => {
    const base = { guia: GUIA, guion: "[calm] Una idea.\n\nCierre.", texto: "Un texto.", alertas: IDEA.alertas }
    const conLinkedin = await huellas((c) => revisarConClaude({ cliente: c, ...base, textoLinkedin: "En LinkedIn." }))
    const sinLinkedin = await huellas((c) =>
      revisarConClaude({ cliente: c, ...base, textoLinkedin: null, alertas: [] }),
    )
    expect({ conLinkedin, sinLinkedin }).toMatchInlineSnapshot(`
      {
        "conLinkedin": [
          {
            "cuerpo": "51ef7e63adf15245011c51cfb7b69a6c1c76245006d38f5244466411a28760c4",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "2a0826b522e9d3f3b27c21af958343d339430406ee23e1e2826717a02e364e08",
          },
        ],
        "sinLinkedin": [
          {
            "cuerpo": "adbe93bff34e05eb11ca3a74ee8dc6a9993b7b79ad1076263e7bba046949aaf7",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "51b0ca01e2baad5745ccb645dc9df7026f06417f82df44aa8a1fec6e64e13ba6",
          },
        ],
      }
    `)
  })

  it("keeps the carousel prompt with a change request and corrections, and the bare one", async () => {
    const completo = await huellas((c) =>
      escribirCarrusel({
        cliente: c,
        guia: GUIA,
        idea: IDEA,
        respaldo: RESPALDO,
        fuentes: FUENTES,
        requiereLineasAyuda: true,
        cambio: { pedido: "Más corto.", anterior: { laminas: LAMINAS, textoPost: "Un post." } },
        correcciones: CORRECCIONES,
      }),
    )
    const simple = await huellas((c) =>
      escribirCarrusel({
        cliente: c,
        guia: GUIA,
        idea: IDEA_SIN_NADA,
        respaldo: null,
        fuentes: [],
        requiereLineasAyuda: false,
        cambio: null,
      }),
    )
    expect({ completo, simple }).toMatchInlineSnapshot(`
      {
        "completo": [
          {
            "cuerpo": "92467c512933f65e8b5bde6a25dd8f48759abea0b2ed31d0ce03ce9c85ae2941",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "f4d250713e8cb993ee12942fc360b198911f04ce35d098e8ebf41d198f5b52c6",
          },
        ],
        "simple": [
          {
            "cuerpo": "7ee4810426c21ac93e2372e67ed053829f6185dc6516ba44d1eb198f35057336",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "d84c2b061b38e50c746d7a4942ab486aa5618fe23462dbed007d0cd66055634d",
          },
        ],
      }
    `)
  })

  it("keeps the carousel review and shortening prompts", async () => {
    const revision = await huellas((c) =>
      revisarCarruselConClaude({
        cliente: c,
        guia: GUIA,
        laminas: LAMINAS,
        textoPost: "Un post.",
        alertas: IDEA.alertas,
      }),
    )
    const acortado = await huellas((c) => acortarLaminas({ cliente: c, guia: GUIA, laminas: LAMINAS, largas: [1, 2] }))
    expect({ revision, acortado }).toMatchInlineSnapshot(`
      {
        "acortado": [
          {
            "cuerpo": "e6e0cd4f7e28b38cdac271106ca7de9be5f7ac05d42fc9872c73f4d25785b236",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "8fc2d64465539c78a2670b4a319f225ae6c5182dd7247b55722e6500f7088b95",
          },
        ],
        "revision": [
          {
            "cuerpo": "590029192767d1c1e928c8e91be16caf387d403821a959ef1aeab02ec68b9d4d",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "30c933a4f9aadc08b357213f6e58c3b073ee45114b66d41af17f551cc237ee42",
          },
        ],
      }
    `)
  })

  it("keeps the idea and pillar classification prompts", async () => {
    const idea = await huellas((c) =>
      clasificarIdea({ cliente: c, guia: GUIA, gancho: "Un gancho.", tema: "", pilares: PILARES }),
    )
    const pilares = await huellas((c) =>
      clasificarEnPilares({
        cliente: c,
        pilares: PILARES,
        elementos: [{ id: "t1", tipo: "tema", texto: "Un tema." }],
      }),
    )
    expect({ idea, pilares }).toMatchInlineSnapshot(`
      {
        "idea": [
          {
            "cuerpo": "1edf774cc6444b27d21186bad08d8e997baa20b3e0c366545ded3e268e0e9fe0",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "a3539ef330430b3efd8da789a3941cd76b3682a76a4165c842557c694b7c78b8",
          },
        ],
        "pilares": [
          {
            "cuerpo": "c33cfc90d30e6eb4b609aad559cd333217d6bdc7ab8bd68305b8307779d73098",
            "sistema": "14a791df4614404bceb513bebd630eaea5ef836a35fb65fd3c016bb4f1ee3fd7",
            "usuario": "ac4da2af3c698c9e41c2679c8d576dcac56217e03d0fd871a2ca262c4d2e9bb2",
          },
        ],
      }
    `)
  })

  it("keeps the image reading prompt of a full first batch", async () => {
    const imagenes = Array.from({ length: 21 }, (_, i) => ({ id: `img-${i}`, jpeg: new Uint8Array([i, 1, 2]) }))
    const lote = await huellas((c) => leerTextoEnImagenes({ cliente: c, imagenes }))
    expect(lote).toMatchInlineSnapshot(`
      [
        {
          "cuerpo": "19e7e407a7a18d70a34a590c6db60fabd73c2687febbbac3c264f9cd9fa747b7",
          "sistema": "ad11b6d8abda6e3d78ecb54a0cfc84c5fa69b2c68140591e4ac563da2920a53f",
          "usuario": "2e795b47d72845b46cf3d878523a54c541f6839dd3a2a61668e26fd180707fa5",
        },
      ]
    `)
  })

  it("keeps the topic naming and merging prompts", async () => {
    const nombres = await huellas((c) =>
      nombrarTemas({ cliente: c, grupos: [{ id: "g1", textos: ["Uno.", "Dos."] }], pilares: ["vinculos"], redes: [] }),
    )
    const tema = (id: string) => ({ id, nombre: `Tema ${id}`, descripcion: null, textos: ["Un texto."] })
    const fusiones = await huellas((c) => confirmarFusiones({ cliente: c, pares: [{ a: tema("a"), b: tema("b") }] }))
    expect({ nombres, fusiones }).toMatchInlineSnapshot(`
      {
        "fusiones": [
          {
            "cuerpo": "530400f8e7f7b4169e572ecbc4b7386fb70c9e2daa0e741a140038404aa0cb3a",
            "sistema": "8e8eaba95a0faed1282af2c3eeeec17eb4bdb08d3a747a9c09393cb022a7b444",
            "usuario": "94d7549ee5ba87a0c095d6ed5683ea219280a94c919634516429d8d969acb900",
          },
        ],
        "nombres": [
          {
            "cuerpo": "da12657d0412ed9d2ecf8138d0550dca3c17c832817cb0c5c67bb68e5229909c",
            "sistema": "c046f993dbf03a7d8c8af80a10c4aa28ac0b3c2ba73109b1f442528724ae77de",
            "usuario": "6b586895e0be9f1c79f44b4e0a8047b39749d8bc5895702e69da52d62b35a526",
          },
        ],
      }
    `)
  })

  it("keeps the card prompt, whole and cut", async () => {
    const parte = { texto: "Un párrafo de la fuente.", ubicacion: { pagina: 1 } }
    const entera = await huellas((c) => escribirFicha({ cliente: c, titulo: "Un libro", autor: null, partes: [parte] }))
    const larga = { texto: "a".repeat(120_010), ubicacion: { segundo: 3, pista: "voz" as const } }
    const cortada = await huellas((c) =>
      escribirFicha({ cliente: c, titulo: "Un libro", autor: "Alguien", partes: [parte, larga] }),
    )
    expect({ entera, cortada }).toMatchInlineSnapshot(`
      {
        "cortada": [
          {
            "cuerpo": "5ff538aed57699d7afb44f0a929ad6c040f461b730433164869c61758d3c59c0",
            "sistema": "0b0fb96cdb88d8deffbf40a1399c2dcb172e9e9d5aa618341c79eb0a03404f35",
            "usuario": "d980c479766d9bce75c9ffcaebb32da0d632713e820ac91ad36e61fcef7ecd83",
          },
        ],
        "entera": [
          {
            "cuerpo": "1f63c5e4ec612b00cd6a5a75ae15cbb7ec8411cde77b5c8625c2668bcf13f81a",
            "sistema": "0b0fb96cdb88d8deffbf40a1399c2dcb172e9e9d5aa618341c79eb0a03404f35",
            "usuario": "265418ca7cbd73f4e8992bd6d8a85d3efd4e9e699104886e2cbd220b5e8ccdc2",
          },
        ],
      }
    `)
  })

  it("keeps the claim extraction prompt, whose guide is the extraction version", async () => {
    const pedidos = await huellas((c) =>
      extraerAfirmaciones({
        cliente: c,
        tramo: {
          numero: 1,
          texto: "Un fragmento de la fuente.",
          ubicacion: { pagina: 2 },
          piezas: [{ desde: 0, hasta: 26, ubicacion: { pagina: 2 } }],
        },
        autor: { nombre: "Alguien", credencial: null },
      }),
    )
    expect(pedidos[0]?.sistema).toBe(VERSION_DE_EXTRACCION)
    expect(pedidos).toMatchInlineSnapshot(`
      [
        {
          "cuerpo": "ee6d0db9521a21aa2b6665c02c32a09c5af555387801cf0f13c99476a2f53085",
          "sistema": "96f15b3ea669df81f6c564694020c5b713e3182d6574c688d623984a2ccee486",
          "usuario": "8678eb90a3d77a90371ef5b620f7787b1fb876fca059b73b74b66885d4d5cfc0",
        },
      ]
    `)
  })

  it("keeps the theories prompt", async () => {
    const pedidos = await huellas((c) =>
      escribirTeorias({
        cliente: c,
        cruces: [
          {
            id: "c1",
            temas: [{ id: "t1", nombre: "Tema", pilares: ["vinculos"] }],
            afirmaciones: [
              {
                id: "a1",
                autor: "Alguien",
                texto: "Un texto.",
                cita: "A quote.",
                tipo: "dato",
                evidencia: "estudio",
                publico: null,
                dolor: "Un dolor.",
                emocion: null,
              },
            ],
          },
        ],
        contexto: { guia: GUIA, estrategia: ["Una estrategia."], vozPropia: ["Una frase de Coni."], pilares: PILARES },
      }),
    )
    expect(pedidos).toMatchInlineSnapshot(`
      [
        {
          "cuerpo": "1083d8c80eae3223daa33d52fd5e176896070a15ed40977ff9b740a9bc68f4b7",
          "sistema": "bd8dd1c92c56e58ca098e6ce906fd51c317e12b16756a44d2b7364d4ab8ad146",
          "usuario": "0c4b91e3cc0290914c6fbeba010c0fb564359d852ff097912c28b975eeecae12",
        },
      ]
    `)
  })

  it("keeps the pillars-per-network proposal prompt", async () => {
    const pedidos = await huellas((c) =>
      proponerPilaresPorRed({
        cliente: c,
        pilares: PILARES,
        temas: [{ id: "t1", nombre: "Tema", descripcion: null, ideas: ["Una idea."] }],
        ideas: [{ id: "i1", gancho: "Un gancho.", tema: "" }],
      }),
    )
    expect(pedidos).toMatchInlineSnapshot(`
      [
        {
          "cuerpo": "355c29bfe2146739b058ad3f581e75c4680982dd0993e6c46d667479e88a1088",
          "sistema": "7fb433441794fcbfdac41b5f9459b51cb852f2fb058fd960e8f8b424002f9866",
          "usuario": "98b4416136fbbc9e27dc7fc75d18844002344925c54bd7ae726bda3188916db2",
        },
      ]
    `)
  })

  it("keeps the script and carousel prompts of an idea with an angle", async () => {
    const guion = await huellas((c) =>
      escribirGuion({
        cliente: c,
        guia: GUIA,
        idea: IDEA_CON_ANGULO,
        respaldo: null,
        fuentes: [],
        requiereLineasAyuda: false,
      }),
    )
    const carrusel = await huellas((c) =>
      escribirCarrusel({
        cliente: c,
        guia: GUIA,
        idea: IDEA_CON_ANGULO,
        respaldo: null,
        fuentes: [],
        requiereLineasAyuda: false,
        cambio: null,
      }),
    )
    expect({ guion, carrusel }).toMatchInlineSnapshot(`
      {
        "carrusel": [
          {
            "cuerpo": "77c6440b96af8e60ae41de0c48aacf54833b603b233c1e7ee2a2a1a9ebe3f4ed",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "4cda1fb1d81b9816849e13eacdd786c032588594f11759386a872be8f5400054",
          },
        ],
        "guion": [
          {
            "cuerpo": "40a3553cca26add5e55291e1495d389d2da81537079c0928296567e8edad48c1",
            "sistema": "298f1b58ddcfc01539f86d568bf1ee6da23eaefe893f701d25559db076eaa6ad",
            "usuario": "ede238bde1bd90ea501c23ed0ac363023f8c17316e6ab0500dd47f0bb4b20dd1",
          },
        ],
      }
    `)
  })
})
