import { HttpResponse, http } from "msw"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { alFallarMaterial } from "@/lib/ingesta/falla-material"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { pool } from "./db"
import {
  almacenEnMemoria,
  COSTO_CLAUDE,
  crearMaterial,
  deps,
  ficha,
  fixture,
  gastos,
  limpiar,
  material,
  simularClaude,
  TEXTO_CHILENO,
  texto,
} from "./procesar-comun"
import { clienteDeServicio } from "./servicio"

afterEach(limpiar)
afterAll(() => pool.end())

const UN_PDF = { extension: "pdf", tipo: "application/pdf" }

describe("documento", () => {
  it("extracts the text, stores it, pays Claude for the card of a strategy material and leaves it ready", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude({ idioma: "es" })
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      rol: "estrategia",
      titulo: "Dos páginas",
      archivo: { ...UN_PDF, datos: await fixture("dos-paginas.pdf") },
    })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(texto(almacen, id, "texto-original.txt")).toBe(
      "[página 1] Primera pagina del documento\n\n[página 2] Segunda pagina del documento",
    )
    const fila = await material(id)
    expect(fila).toMatchObject({
      estado: "listo",
      texto_clave: `materiales/${id}/texto-original.txt`,
      motivo_fallo: null,
      // Two short lines: the stopwords do not settle the language and no Claude call is made for it.
      idioma_original: null,
    })
    const f = await ficha(id)
    expect(f?.resumen).toBe("Un resumen de la fuente.")
    expect(f?.ideas_clave).toHaveLength(5)
    expect(claude.fichas).toHaveLength(1)
    expect(claude.adaptaciones).toEqual([])
    const filas = await gastos(id)
    expect(filas.find((g) => g.paso === "ficha")).toEqual({
      proveedor: "anthropic",
      paso: "ficha",
      estado: "confirmado",
      real: COSTO_CLAUDE,
    })
  })

  it("takes the card's author from the material's author row and never writes the legacy author column", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ autorSugerido: "Esther Perel" })
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO, rol: "estrategia" })

    await procesarMaterial(await deps(almacen), id)

    expect((await material(id)).autor).toBeNull()
    expect((await ficha(id))?.fuente.autor).toBe("Constanza del Rosario")
  })

  it("does nothing for a material that is already ready", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await procesarMaterial(await deps(almacen), id)
    const llamadas = claude.total

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "ya_listo" })
    expect(claude.total).toBe(llamadas)
    expect(await gastos(id)).toHaveLength(1)
  })

  it("reuses the stored text after a crash and pays the card once", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ idioma: "es", fichaFalla: true })
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      rol: "estrategia",
      archivo: { ...UN_PDF, datos: await fixture("dos-paginas.pdf") },
    })
    await expect(procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)).rejects.toThrow()
    expect((await material(id)).estado).toBe("procesando")
    expect(texto(almacen, id, "texto-original.txt")).toBeDefined()

    servidor.resetHandlers()
    const sana = simularClaude({ idioma: "es" })
    const resultado = await procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(sana.idiomas).toBe(0)
    expect(sana.fichas).toHaveLength(1)
    const filas = await gastos(id)
    expect(filas.filter((g) => g.paso === "ficha" && g.estado === "confirmado")).toHaveLength(1)
    expect(filas.filter((g) => g.paso === "ficha" && g.estado === "liberado")).toHaveLength(1)
  })

  it("does not write a second card when one already exists", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO, rol: "estrategia" })
    await pool.query(
      "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, 'ya estaba', '[]', '[]', '{}')",
      [id],
    )

    await procesarMaterial(await deps(almacen), id)

    expect(claude.fichas).toEqual([])
    expect((await ficha(id))?.resumen).toBe("ya estaba")
    expect((await material(id)).estado).toBe("listo")
  })
})

describe("link", () => {
  const URL_NOTA = "https://ejemplo.cl/nota"

  it("reads the article, takes its title and keeps the link as the source", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ idioma: "es" })
    const html = new TextDecoder().decode(await fixture("articulo.html"))
    servidor.use(http.get(URL_NOTA, () => HttpResponse.html(html)))
    const id = await crearMaterial(almacen, { tipo: "link", origen_url: URL_NOTA, rol: "estrategia" })

    await procesarMaterial(await deps(almacen), id)

    const guardado = texto(almacen, id, "texto-original.txt") ?? ""
    expect(guardado).toContain("El deseo sexual fluctúa")
    expect(guardado).not.toContain("PUBLICIDAD")
    const fila = await material(id)
    expect(fila).toMatchObject({ estado: "listo", titulo: "El deseo y la rutina" })
    expect((await ficha(id))?.fuente.enlace).toBe(URL_NOTA)
  })

  it.each([401, 403])("fails with the login message on HTTP %i", async (estado) => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    servidor.use(http.get(URL_NOTA, () => new HttpResponse("no", { status: estado })))
    const id = await crearMaterial(almacen, { tipo: "link", origen_url: URL_NOTA })

    const resultado = await procesarMaterial(await deps(almacen), id)

    const motivo = "El link pide iniciar sesión o no tiene texto: sube el texto o el archivo"
    expect(resultado).toEqual({ resultado: "fallido", motivo })
    expect(await material(id)).toMatchObject({ estado: "fallido", motivo_fallo: motivo })
    expect(claude.total).toBe(0)
  })

  it("fails with the same message when the page has no article text", async () => {
    const almacen = almacenEnMemoria()
    const html = new TextDecoder().decode(await fixture("sin-articulo.html"))
    servidor.use(http.get(URL_NOTA, () => HttpResponse.html(html)))
    const id = await crearMaterial(almacen, { tipo: "link", origen_url: URL_NOTA })

    await procesarMaterial(await deps(almacen), id)

    expect((await material(id)).motivo_fallo).toBe(
      "El link pide iniciar sesión o no tiene texto: sube el texto o el archivo",
    )
  })

  it("refuses a link that resolves to a private address without requesting it", async () => {
    const almacen = almacenEnMemoria()
    let pedidos = 0
    servidor.use(
      http.get(URL_NOTA, () => {
        pedidos += 1
        return HttpResponse.html("<p>secreto</p>")
      }),
    )
    const id = await crearMaterial(almacen, { tipo: "link", origen_url: URL_NOTA })

    await procesarMaterial(await deps(almacen, { resolver: async () => ["10.0.0.7"] }), id)

    expect(pedidos).toBe(0)
    const fila = await material(id)
    expect(fila.estado).toBe("fallido")
    expect(fila.motivo_fallo).toContain("Ese link no se puede abrir")
  })

  it("lets Trigger.dev retry a server error instead of failing the material", async () => {
    const almacen = almacenEnMemoria()
    servidor.use(http.get(URL_NOTA, () => new HttpResponse("caído", { status: 503 })))
    const id = await crearMaterial(almacen, { tipo: "link", origen_url: URL_NOTA })

    await expect(procesarMaterial(await deps(almacen), id)).rejects.toThrow()

    expect((await material(id)).estado).toBe("procesando")
  })
})

describe("link de YouTube", () => {
  const PASOS =
    "YouTube no deja leer lo que se dice en el video. Abre el video, toca «…más» y luego «Mostrar transcripción», cópiala y pégala como texto."

  it.each([
    "https://www.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://m.youtube.com/watch?v=abc123",
    "https://music.youtube.com/watch?v=abc123",
    "https://www.youtube-nocookie.com/embed/abc123",
  ])("asks for the transcript without fetching or spending when %s has no pasted text", async (url) => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const pedidos: string[] = []
    const id = await crearMaterial(almacen, { tipo: "link", origen_url: url })

    const resultado = await procesarMaterial(
      await deps(almacen, {
        fetch: async (entrada) => {
          pedidos.push(String(entrada))
          throw new Error("no debería salir")
        },
      }),
      id,
    )

    expect(resultado).toEqual({ resultado: "fallido", motivo: PASOS })
    expect(await material(id)).toMatchObject({ estado: "fallido", motivo_fallo: PASOS })
    expect(pedidos).toEqual([])
    expect(claude.total).toBe(0)
    expect(await gastos(id)).toEqual([])
  })

  it("processes the pasted transcript of a YouTube link and keeps the link as the source", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ idioma: "es" })
    const url = "https://www.youtube.com/watch?v=abc123"
    const pedidos: string[] = []
    const id = await crearMaterial(almacen, {
      tipo: "link",
      origen_url: url,
      texto_pegado: TEXTO_CHILENO,
      rol: "estrategia",
    })

    await procesarMaterial(
      await deps(almacen, {
        fetch: async (entrada) => {
          pedidos.push(String(entrada))
          throw new Error("no debería salir")
        },
      }),
      id,
    )

    expect(pedidos).toEqual([])
    expect(texto(almacen, id, "texto-original.txt")).toContain("El deseo sexual cambia")
    expect((await material(id)).estado).toBe("listo")
    expect((await ficha(id))?.fuente.enlace).toBe(url)
  })

  it("feeds the cleaned transcript, without timestamps or info cards, to the material", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ idioma: "es" })
    const id = await crearMaterial(almacen, {
      tipo: "link",
      origen_url: "https://youtu.be/abc123",
      texto_pegado:
        "0:000 segundosEl deseo cambia\n0:051 minuto y 5 segundoscon el tiempo [música]\n\nUniversidad Stanford\nUna universidad privada.\n...más\n\n1:101 minuto y 10 segundosy con la pareja",
      rol: "estrategia",
    })

    await procesarMaterial(await deps(almacen), id)

    const original = texto(almacen, id, "texto-original.txt")
    expect(original).toContain("El deseo cambia con el tiempo y con la pareja")
    expect(original).not.toMatch(/segundos|Stanford|más|\[/)
  })

  it("does not clean pasted text that is not a YouTube transcript", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ idioma: "es" })
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      texto_pegado: "0:000 segundosEl deseo cambia con el tiempo",
      rol: "estrategia",
    })

    await procesarMaterial(await deps(almacen), id)

    expect(texto(almacen, id, "texto-original.txt")).toContain("0:000 segundos")
  })

  it("still opens a host that only looks like YouTube", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ idioma: "es" })
    const html = new TextDecoder().decode(await fixture("articulo.html"))
    servidor.use(http.get("https://notyoutube.com/nota", () => HttpResponse.html(html)))
    const id = await crearMaterial(almacen, { tipo: "link", origen_url: "https://notyoutube.com/nota" })

    await procesarMaterial(await deps(almacen), id)

    expect((await material(id)).estado).toBe("listo")
  })
})

describe("límite del mes", () => {
  it("leaves the material in process with the reason, calls no provider and tells Coni", async () => {
    await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      archivo: { ...UN_PDF, datos: await fixture("dos-paginas.pdf") },
    })
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.0001")
    const avisos = notificadorEnMemoria()

    try {
      const resultado = await procesarMaterial(await deps(almacen, { avisos }), id)

      expect(resultado).toEqual({ resultado: "tope" })
      const fila = await material(id)
      expect(fila.estado).toBe("procesando")
      expect(fila.motivo_fallo).toBe(TEXTO_LIMITE)
      expect(claude.total).toBe(0)
      expect(avisos.avisosEnviados.map((aviso) => aviso.tipo)).toEqual(["limite_alcanzado"])
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })

  it("clears the reason when a later run gets through", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await pool.query("update public.materiales set motivo_fallo = 'Llegaste al tope de gasto del mes' where id = $1", [
      id,
    ])

    await procesarMaterial(await deps(almacen), id)

    expect(await material(id)).toMatchObject({ estado: "listo", motivo_fallo: null })
  })
})

describe("errores", () => {
  it("fails with the message of a PDF that has no text", async () => {
    const almacen = almacenEnMemoria()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      archivo: { ...UN_PDF, datos: await fixture("en-blanco.pdf") },
    })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "fallido", motivo: "No encontré texto en el archivo." })
    expect(await material(id)).toMatchObject({ estado: "fallido", motivo_fallo: "No encontré texto en el archivo." })
  })

  it("marks a material failed with a generic notice when the error was written for WAV", async () => {
    const almacen = almacenEnMemoria()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    const avisos = notificadorEnMemoria()

    await alFallarMaterial(
      { db: clienteDeServicio(), avisos },
      { materialId: id, corrida: "run_2", error: new Error("ECONNRESET") },
    )

    const fila = await material(id)
    expect(fila.estado).toBe("fallido")
    expect(fila.motivo_fallo).toBe("No pude procesar el material. WAV ya está revisando.")
    expect(fila.motivo_fallo).not.toContain("ECONNRESET")
  })

  it("never turns a ready material into a failed one", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await procesarMaterial(await deps(almacen), id)

    await alFallarMaterial(
      { db: clienteDeServicio(), avisos: notificadorEnMemoria() },
      { materialId: id, corrida: "run_3", error: new Error("tarde") },
    )

    expect((await material(id)).estado).toBe("listo")
  })

  it("fails a material that does not exist as a configuration problem for WAV", async () => {
    await expect(procesarMaterial(await deps(almacenEnMemoria()), crypto.randomUUID())).rejects.toThrow(
      /No existe el material/,
    )
  })
})

async function corridaDe(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ corrida_id: string | null }>(
    "select corrida_id from public.materiales where id = $1",
    [id],
  )
  return rows[0]?.corrida_id ?? null
}

describe("una corrida por material", () => {
  it("returns en_curso and calls no provider when another run holds the material", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await pool.query("update public.materiales set corrida_id = 'run_otra', corrida_desde = now() where id = $1", [id])

    const resultado = await procesarMaterial(await deps(almacen, { corrida: "run_nueva" }), id)

    expect(resultado).toEqual({ resultado: "en_curso" })
    expect(claude.total).toBe(0)
    expect(await gastos(id)).toEqual([])
    expect(await corridaDe(id)).toBe("run_otra")
  })

  it("lets the run that holds the material continue after a retry, and releases it when ready", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await pool.query("update public.materiales set corrida_id = 'run_a', corrida_desde = now() where id = $1", [id])

    const resultado = await procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(await corridaDe(id)).toBeNull()
  })

  it("takes over a claim older than the task's maximum duration", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await pool.query(
      "update public.materiales set corrida_id = 'run_muerta', corrida_desde = now() - interval '40 minutes' where id = $1",
      [id],
    )

    const resultado = await procesarMaterial(await deps(almacen, { corrida: "run_nueva" }), id)

    expect(resultado).toEqual({ resultado: "listo" })
  })

  it("does not process a failed material, so a late run cannot revive it", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await pool.query("update public.materiales set estado = 'fallido', motivo_fallo = 'sin texto' where id = $1", [id])

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "fallido", motivo: "sin texto" })
    expect(claude.total).toBe(0)
    expect(await material(id)).toMatchObject({ estado: "fallido", motivo_fallo: "sin texto" })
  })

  it("releases the material when the monthly cap stops the run", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.0001")
    try {
      expect(await procesarMaterial(await deps(almacen), id)).toEqual({ resultado: "tope" })
      expect(await corridaDe(id)).toBeNull()
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })

  it("releases the material when it fails for good", async () => {
    const almacen = almacenEnMemoria()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      archivo: { ...UN_PDF, datos: await fixture("en-blanco.pdf") },
    })

    expect((await procesarMaterial(await deps(almacen), id)).resultado).toBe("fallido")
    expect(await corridaDe(id)).toBeNull()
  })

  it("keeps the claim when the run fails for a reason that will be retried", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ afirmacionesFallanDesde: 1 })
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })

    await expect(procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)).rejects.toThrow()

    expect(await corridaDe(id)).toBe("run_a")
  })
})

describe("material borrado", () => {
  it("stops without paying when the material is deleted after the extraction", async () => {
    const base = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(base, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    const almacen = {
      ...base,
      async subir(clave: string, datos: Uint8Array, tipo: string) {
        await base.subir(clave, datos, tipo)
        if (clave.endsWith("partes-original.json"))
          await pool.query("delete from public.materiales where id = $1", [id])
      },
    }

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "borrado" })
    expect(claude.total).toBe(0)
    expect(await gastos(id)).toEqual([])
  })

  it("lets the failure hook run on a deleted material without touching anything or alerting WAV", async () => {
    const avisos = notificadorEnMemoria()

    await alFallarMaterial(
      { db: clienteDeServicio(), avisos },
      { materialId: crypto.randomUUID(), corrida: "run_9", error: new Error("tarde") },
    )

    expect(avisos.aWavEnviados).toEqual([])
  })
})

describe("post y material de terceros", () => {
  it("uses the pasted text of a post and never opens its Instagram link", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const pedidos: string[] = []
    const id = await crearMaterial(almacen, {
      tipo: "post",
      origen_url: "https://www.instagram.com/p/abc123/",
      texto_pegado: TEXTO_CHILENO,
    })

    await procesarMaterial(
      await deps(almacen, {
        fetch: async (entrada) => {
          pedidos.push(String(entrada))
          throw new Error("no debería salir")
        },
      }),
      id,
    )

    expect(pedidos).toEqual([])
    expect(texto(almacen, id, "texto-original.txt")).toContain("El deseo sexual cambia")
    const fila = await material(id)
    expect(fila.estado).toBe("listo")
    const guardado = await pool.query<{ origen_url: string }>(
      "select origen_url from public.materiales where id = $1",
      [id],
    )
    expect(guardado.rows[0]?.origen_url).toBe("https://www.instagram.com/p/abc123/")
  })
})
