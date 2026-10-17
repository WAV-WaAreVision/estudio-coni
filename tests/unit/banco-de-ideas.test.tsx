import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type AccionesDelBanco, BancoDeIdeas } from "@/app/(app)/ideas/banco-de-ideas"
import { CartaDeIdea } from "@/app/(app)/ideas/carta-de-idea"
import { nombreDePilar, soloActivos } from "@/lib/dominio/pilares"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const todasEmpezadas = (ids: string[]) => ({
  ok: true as const,
  tipo: "empezadas" as const,
  resultados: ids.map((ideaId) => ({ ideaId, tipo: "empezada" as const, piezaId: `p-${ideaId}` })),
})

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

function idea(parcial: Partial<IdeaDeBanco> & { id: string }): IdeaDeBanco {
  return {
    numero: 1,
    pilar: "pareja",
    gancho: "Un gancho",
    tema: "Un tema",
    formato: "Mito o realidad",
    fuerza: "alta",
    alertas: [],
    estado: "idea",
    fijada: false,
    nueva: false,
    porQue: null,
    ...parcial,
    nombrePilar: nombreDePilar(PILARES_DE_PRUEBA, parcial.pilar ?? "pareja"),
  }
}

const IDEAS: IdeaDeBanco[] = [
  idea({
    id: "a",
    numero: 1,
    gancho: "Si van a discutir, siéntense del mismo lado.",
    tema: "Sentarse al lado cambia el tono.",
    alertas: [{ tipo: "verificar dato", texto: "La fuente cita proxémica sin estudio." }],
  }),
  idea({ id: "b", numero: 2, gancho: "El deseo no se apaga: se esconde.", pilar: "practica-clinica", fuerza: "media" }),
  idea({ id: "c", numero: 3, gancho: "¿Por qué sientes culpa al descansar?", pilar: "autoestima" }),
  idea({ id: "d", numero: 4, gancho: "Ya la usé hace poco.", estado: "usada" }),
]

const NUEVA_PARA_ORDEN = idea({
  id: "o",
  gancho: "Una idea del motor.",
  nueva: true,
  porQue: {
    titulo: "Teoría",
    tesis: "Tesis.",
    nivel: "medio",
    respaldo: [],
    fuente: null,
  },
})

function acciones(cambios: Partial<AccionesDelBanco> = {}): AccionesDelBanco {
  return {
    usar: vi.fn(async () => ({ ok: true as const })),
    quitar: vi.fn(async () => ({ ok: true as const })),
    descartar: vi.fn(async () => ({ ok: true as const })),
    proponer: vi.fn(async () => ({
      ok: true as const,
      propuesta: {
        pilar: "acceso-salud-publica",
        formato: "Mito o realidad",
        alertas: [{ tipo: "líneas de ayuda" as const, texto: "El tema roza la violencia en la pareja." }],
      },
    })),
    crear: vi.fn(async () => ({ ok: true as const, id: "nueva" })),
    elegirVarias: vi.fn(async (ids: string[]) => todasEmpezadas(ids)),
    descartarVarias: vi.fn(async () => ({ ok: true as const })),
    restaurar: vi.fn(async (ids: string[]) => ({ ok: true as const, restauradas: ids })),
    ...cambios,
  }
}

const ACTIVOS = soloActivos(PILARES_DE_PRUEBA).map(({ slug, nombre, nombreCorto }) => ({ slug, nombre, nombreCorto }))

function mostrar(cambios: Partial<AccionesDelBanco> = {}, ideas: IdeaDeBanco[] = IDEAS) {
  const a = acciones(cambios)
  render(<BancoDeIdeas ideas={ideas} pilares={ACTIVOS} acciones={a} />)
  return a
}

describe("BancoDeIdeas: composition", () => {
  it("keeps Después and Usar esta right under the hook, above Por qué", () => {
    mostrar({}, [{ ...NUEVA_PARA_ORDEN }])
    const usar = screen.getByRole("button", { name: "Usar esta" })
    const porQue = screen.getByText("Por qué")
    expect(usar.compareDocumentPosition(porQue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("keeps both labels on one line, side by side until large text stacks them", () => {
    mostrar({}, [{ ...NUEVA_PARA_ORDEN }])
    const usar = screen.getByRole("button", { name: "Usar esta" })
    const despues = screen.getByRole("button", { name: "Después" })
    for (const boton of [usar, despues]) expect(boton).toHaveClass("whitespace-nowrap")
    expect(usar.parentElement?.className).toMatch(/auto-fit/)
  })

  it("draws discard as a quiet action, never filled and never magenta", () => {
    mostrar()
    const descartar = screen.getByRole("button", { name: "Descartar" })
    expect(descartar).toHaveClass("underline")
    expect(descartar.className).not.toMatch(/\btext-error\b|\bbg-/)
  })

  it("raises the idea as the one high card of the screen", () => {
    mostrar()
    expect(screen.getByRole("article")).toHaveClass("bg-piedra", "shadow-relieve-alto", "rounded-panel")
  })
})

describe("BancoDeIdeas: una idea a la vez", () => {
  it("shows the first free idea with its pillar, strength and alerts, and counts only the free ones", () => {
    mostrar()

    expect(screen.getByText("Idea 1 de 3")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
    expect(screen.getByText("Pareja y conversación")).toBeInTheDocument()
    expect(screen.getByText(/Fuerza alta/)).toBeInTheDocument()
    expect(screen.getByText("Verificar dato")).toBeInTheDocument()
    expect(screen.queryByText("Ya la usé hace poco.")).not.toBeInTheDocument()
  })

  it("explains each alert so she knows what to check before recording", async () => {
    mostrar()

    fireEvent.click(screen.getByText("Qué revisar antes de grabar"))

    expect(screen.getByText("La fuente cita proxémica sin estudio.")).toBeVisible()
  })

  it("goes to the next idea on Después and comes back to the first after the last", async () => {
    mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    expect(screen.getByRole("heading", { name: "El deseo no se apaga: se esconde." })).toBeInTheDocument()
    expect(screen.getByText("Idea 2 de 3")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
  })

  it("adds the idea to the week on Usar esta, says so and moves on", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    await waitFor(() => expect(a.usar).toHaveBeenCalledWith("a"))
    expect(await screen.findByText("La sumé a las ideas de la semana.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "El deseo no se apaga: se esconde." })).toBeInTheDocument()
    expect(screen.getByText("Idea 1 de 2")).toBeInTheDocument()
  })

  it("brings the idea back and takes it out of the week on Deshacer", async () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }))

    await waitFor(() => expect(a.quitar).toHaveBeenCalledWith("a"))
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
    expect(screen.getByText("Idea 1 de 3")).toBeInTheDocument()
  })

  it("stays on the idea and says why when it could not be added", async () => {
    mostrar({ usar: vi.fn(async () => ({ ok: false as const, error: "Esa idea ya no está disponible." })) })

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa idea ya no está disponible.")
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
  })

  it("says the bank is used up and offers to write an idea when she went through the free ones", async () => {
    mostrar({}, [idea({ id: "a" }), idea({ id: "d", estado: "usada" })])

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    expect(await screen.findByText("Usaste todas las ideas del banco. Escribe una idea nueva.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Usar esta" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escribir una idea mía" })).toBeInTheDocument()
  })

  it("shows the engine empty state when the bank only holds used ideas", () => {
    mostrar({}, [idea({ id: "d", estado: "usada" })])

    expect(screen.getByText(/El motor propone ideas cada domingo/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Abrir Conidolly Ingesta" })).toBeInTheDocument()
    expect(screen.queryByText(/Usaste todas/)).not.toBeInTheDocument()
  })
})

describe("BancoDeIdeas: buscar", () => {
  async function abrirBusqueda() {
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }))
  }

  it("lists the free ideas, narrows by word and pillar and tells how many there are", async () => {
    mostrar()
    await abrirBusqueda()

    expect(screen.getByText("3 resultados")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Buscar por palabra o tema"), { target: { value: "culpa" } })
    expect(screen.getByText("1 resultado")).toBeInTheDocument()
    expect(screen.getByText("¿Por qué sientes culpa al descansar?")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Buscar por palabra o tema"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Práctica clínica" }))
    expect(screen.getByText("1 resultado")).toBeInTheDocument()
    expect(screen.getByText("El deseo no se apaga: se esconde.")).toBeInTheDocument()
  })

  it("offers the pillars it is given, in order, and no others", async () => {
    mostrar()
    await abrirBusqueda()

    const chips = within(screen.getByRole("group", { name: "Pilar" })).getAllByRole("button")
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Todos",
      "IA y salud mental",
      "Práctica clínica",
      "Ética",
      "Acceso",
      "Caso Coni",
    ])
    expect(screen.queryByRole("button", { name: "Pareja" })).not.toBeInTheDocument()
  })

  it("can include the ideas already used", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.click(screen.getByRole("button", { name: "Sin usar" }))

    expect(screen.getByText("4 resultados")).toBeInTheDocument()
    expect(screen.getByText("Usada")).toBeInTheDocument()
  })

  it("opens the idea she taps in the one-at-a-time view", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.click(screen.getByRole("button", { name: /culpa al descansar/ }))

    expect(screen.getByRole("heading", { name: "¿Por qué sientes culpa al descansar?" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Usar esta" })).toBeInTheDocument()
  })

  it("says nothing matched and offers to write her own idea", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.change(screen.getByLabelText("Buscar por palabra o tema"), { target: { value: "zzz" } })

    expect(screen.getByText("No encontré ideas con esa palabra.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escribir una idea mía" })).toBeInTheDocument()
  })

  it("goes back to one at a time", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.click(screen.getByRole("button", { name: "Una a la vez" }))

    expect(screen.getByRole("button", { name: "Usar esta" })).toBeInTheDocument()
  })
})

describe("BancoDeIdeas: escribir una idea mía", () => {
  async function escribir(texto = "Tu pareja te revisa el celular y lo llama amor.") {
    fireEvent.click(screen.getByRole("button", { name: "Escribir una idea mía" }))
    fireEvent.change(screen.getByLabelText("Tu idea"), { target: { value: texto } })
  }

  it("asks Claude for the pillar and alerts and shows them for her to confirm", async () => {
    const a = mostrar()
    await escribir()

    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))

    await waitFor(() => expect(a.proponer).toHaveBeenCalledWith("Tu pareja te revisa el celular y lo llama amor.", ""))
    expect(await screen.findByRole("radio", { name: "Acceso y salud pública" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /Líneas de ayuda/ })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /Verificar dato/ })).not.toBeChecked()
  })

  it("saves what she confirmed: the pillar she chose and the alerts she kept", async () => {
    const a = mostrar()
    await escribir()
    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))
    await screen.findByRole("radio", { name: "Acceso y salud pública" })

    fireEvent.click(screen.getByRole("radio", { name: "IA y salud mental" }))
    fireEvent.click(screen.getByRole("checkbox", { name: /Verificar dato/ }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))

    await waitFor(() => expect(a.crear).toHaveBeenCalledTimes(1))
    expect(a.crear).toHaveBeenCalledWith({
      gancho: "Tu pareja te revisa el celular y lo llama amor.",
      tema: "",
      formato: "Mito o realidad",
      pilar: "ia-salud-mental",
      alertas: [
        { tipo: "verificar dato", texto: expect.any(String) },
        { tipo: "líneas de ayuda", texto: "El tema roza la violencia en la pareja." },
      ],
    })
    expect(await screen.findByText("Guardé tu idea y la sumé a las ideas de la semana.")).toBeInTheDocument()
  })

  it("lets her choose the pillar herself when Claude could not propose one", async () => {
    const a = mostrar({
      proponer: vi.fn(async () => ({
        ok: false as const,
        error: "No pude proponerte el pilar ahora. Elígelo tú y confirma las alertas.",
      })),
    })
    await escribir()

    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("No pude proponerte el pilar ahora.")
    fireEvent.click(screen.getByRole("button", { name: "Elegir yo el pilar" }))
    expect(screen.getByRole("button", { name: "Guardar idea" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("radio", { name: "Caso Coni: humana + avatar" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))

    await waitFor(() =>
      expect(a.crear).toHaveBeenCalledWith(expect.objectContaining({ pilar: "caso-coni", alertas: [] })),
    )
  })

  it("lets her choose among the pillars it is given, by their full names", async () => {
    mostrar({ proponer: vi.fn(async () => ({ ok: false as const, error: "No pude proponerte el pilar ahora." })) })
    await escribir()
    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("button", { name: "Elegir yo el pilar" }))

    const nombres = [
      "IA y salud mental",
      "Práctica clínica aumentada",
      "Ética y regulación",
      "Acceso y salud pública",
      "Caso Coni: humana + avatar",
    ]
    const radios = screen.getAllByRole("radio")
    expect(radios).toEqual(nombres.map((name) => screen.getByRole("radio", { name })))
  })

  it("does not ask Claude about an empty idea", async () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Escribir una idea mía" }))

    expect(screen.getByRole("button", { name: "Proponer pilar y alertas" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))
    expect(a.proponer).not.toHaveBeenCalled()
  })

  it("goes back to the ideas without saving", async () => {
    const a = mostrar()
    await escribir()

    fireEvent.click(screen.getByRole("button", { name: "Volver a las ideas" }))

    expect(screen.getByRole("button", { name: "Usar esta" })).toBeInTheDocument()
    expect(a.crear).not.toHaveBeenCalled()
  })
})

const TEORIA = {
  titulo: "El deseo se esconde detrás del cansancio",
  tesis: "Quien dice estar cansada muchas veces protege su deseo.",
  nivel: "medio" as const,
  respaldo: [
    { autor: "Autora Uno", cita: "El cansancio es una forma de decir que no." },
    { autor: "Autora Dos", cita: "El deseo necesita seguridad para aparecer." },
  ],
  fuente: null,
}

const NUEVA = idea({
  id: "n",
  numero: null,
  gancho: "Estar cansada no siempre es cansancio.",
  nueva: true,
  porQue: TEORIA,
})

describe("CartaDeIdea: fuente", () => {
  it("shows the source under the hook", () => {
    render(<CartaDeIdea idea={{ ...NUEVA, porQue: { ...TEORIA, fuente: "Fuente: OMS · Informe (2025)" } }} />)
    const gancho = screen.getByRole("heading", { level: 2 })
    const fuente = screen.getByText("Fuente: OMS · Informe (2025)")
    expect(gancho.compareDocumentPosition(fuente) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("gives the source its own row after the topic and the strength, with a decorative icon beside the text", () => {
    render(
      <CartaDeIdea
        idea={{ ...NUEVA, tema: "Un tema", porQue: { ...TEORIA, fuente: "Fuente: OMS · Informe (2025)" } }}
      />,
    )
    const fila = screen.getByText("Fuente: OMS · Informe (2025)").closest("[data-fuente]")
    expect(fila).not.toBeNull()
    expect(fila).toHaveClass("text-meta", "text-apagado")
    expect(fila?.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    const fuerza = screen.getByText(/^Fuerza/)
    expect(screen.getByText("Un tema").compareDocumentPosition(fuerza) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fuerza.compareDocumentPosition(fila as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows no source line for an idea without backing", () => {
    render(<CartaDeIdea idea={{ ...NUEVA, porQue: null }} />)
    expect(screen.queryByText(/^Fuentes?:|^De Coni$/)).not.toBeInTheDocument()
  })
})

describe("BancoDeIdeas: nuevas de la semana", () => {
  it("labels the engine ideas of the week as a section and drops the label for the rest", () => {
    mostrar({}, [NUEVA, ...IDEAS])

    expect(screen.getByText("Nuevas de la semana")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Estar cansada no siempre es cansancio." })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    expect(screen.queryByText("Nuevas de la semana")).not.toBeInTheDocument()
  })

  it("explains why under Por qué: theory, thesis, level and the backing as author and quote", () => {
    mostrar({}, [NUEVA])

    fireEvent.click(screen.getByText("Por qué"))

    expect(screen.getByText(TEORIA.titulo)).toBeVisible()
    expect(screen.getByText(TEORIA.tesis)).toBeVisible()
    expect(screen.getByText("Evidencia: Media")).toBeVisible()
    expect(screen.getByText(/Autora Uno: El cansancio es una forma de decir que no\./)).toBeVisible()
    expect(screen.getByText(/Autora Dos: El deseo necesita seguridad para aparecer\./)).toBeVisible()
    expect(screen.getByText("Solo para ti, no se publica")).toBeVisible()
  })

  it.each([
    ["alto", "Evidencia: Alta"],
    ["debil", "Evidencia: Débil"],
  ] as const)("writes the %s level as it reads to her", (nivel, texto) => {
    mostrar({}, [{ ...NUEVA, porQue: { ...TEORIA, nivel } }])

    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it("has no Por qué on an idea that did not come from the engine", () => {
    mostrar()

    expect(screen.queryByText("Por qué")).not.toBeInTheDocument()
  })

  it("shows the weak backing as a quiet badge, not as something to check before recording", () => {
    mostrar({}, [{ ...NUEVA, alertas: [{ tipo: "respaldo", texto: "respaldo débil" }] }])

    expect(screen.getByText("Respaldo débil")).toBeInTheDocument()
    expect(screen.queryByText("Qué revisar antes de grabar")).not.toBeInTheDocument()
  })

  it("keeps Usar esta working on an engine idea", async () => {
    const a = mostrar({}, [NUEVA])

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    await waitFor(() => expect(a.usar).toHaveBeenCalledWith("n"))
  })
})

describe("BancoDeIdeas: descartar", () => {
  it("opens an in-page choice of reasons with focus on it, and cancelling closes it", () => {
    mostrar({}, [NUEVA, ...IDEAS])

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))

    const grupo = screen.getByRole("group", { name: "¿Por qué la descartas?" })
    for (const motivo of ["No me representa", "Repetida", "Débil", "Otro"]) {
      expect(screen.getByRole("button", { name: motivo })).toBeInTheDocument()
    }
    expect(grupo.contains(document.activeElement)).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByRole("group", { name: "¿Por qué la descartas?" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Descartar" })).toHaveFocus()
  })

  it.each([
    ["No me representa", "no_me_representa"],
    ["Repetida", "repetida"],
    ["Débil", "debil"],
    ["Otro", "otro"],
  ])("discards with the reason %s and moves on to the next idea", async (nombre, motivo) => {
    const a = mostrar({}, [NUEVA, ...IDEAS])

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    fireEvent.click(screen.getByRole("button", { name: nombre }))

    await waitFor(() => expect(a.descartar).toHaveBeenCalledWith("n", motivo))
    expect(await screen.findByText("Descarté la idea.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
    expect(screen.getByText("Idea 1 de 3")).toBeInTheDocument()
  })

  it("keeps the idea and says why when it could not be discarded", async () => {
    mostrar({ descartar: vi.fn(async () => ({ ok: false as const, error: "Esa idea ya no está disponible." })) })

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    fireEvent.click(screen.getByRole("button", { name: "Repetida" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa idea ya no está disponible.")
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
  })
})

describe("BancoDeIdeas: banco vacío", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("tells her when the engine proposes and links to the ingestion app from the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_INGESTA", "https://ingesta.ejemplo.test")
    mostrar({}, [])

    expect(
      screen.getByText(
        "El motor propone ideas cada domingo a las 20:00. Mientras, sube material en Conidolly Ingesta.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Abrir Conidolly Ingesta" })).toHaveAttribute(
      "href",
      "https://ingesta.ejemplo.test",
    )
  })

  it("falls back to the production URL when the environment has none", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_INGESTA", "")
    mostrar({}, [])

    expect(screen.getByRole("link", { name: "Abrir Conidolly Ingesta" })).toHaveAttribute(
      "href",
      "https://conidolly-ingesta.vercel.app",
    )
  })
})

describe("BancoDeIdeas: elegir varias", () => {
  it("opens the batch view with the free ideas only, and Listo brings the deck back", () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Elegir varias" }))
    expect(screen.getByRole("heading", { name: "Elegir varias", level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox")).toHaveLength(3)
    expect(screen.queryByRole("checkbox", { name: "Ya la usé hace poco." })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Listo" }))
    expect(screen.getByText("Idea 1 de 3")).toBeInTheDocument()
  })

  it("stops offering the ideas it started, in the batch view and in the deck", async () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Elegir varias" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Si van a discutir, siéntense del mismo lado." }))
    fireEvent.click(screen.getByRole("button", { name: "Hacer los guiones (1)" }))
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2))
    fireEvent.click(screen.getByRole("button", { name: "Listo" }))
    expect(screen.getByText("Idea 1 de 2")).toBeInTheDocument()
  })

  it("moves the focus to the view's heading once the scripts started, as the bar it was on goes away", async () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Elegir varias" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Si van a discutir, siéntense del mismo lado." }))
    fireEvent.click(screen.getByRole("button", { name: "Hacer los guiones (1)" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Elegir varias", level: 1 })).toHaveFocus())
  })
})
