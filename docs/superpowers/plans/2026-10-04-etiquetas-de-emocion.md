# Tone marks in every script: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The script writer adds 3 to 6 ElevenLabs tone marks (`[warm]`, `[pause]`...) from a closed list to every
script; Coni sees and edits them; they reach ElevenLabs only on models that speak them and never appear in subtitles,
caption, counts, checks or anything published.

**Spec:** `docs/superpowers/specs/2026-10-04-conidolly-etiquetas-de-emocion-design.md` (read it first; "Decisions"
1 to 7 are what this plan builds).

**Architecture:** One pure helper, `lib/dominio/etiquetas.ts`, owns the list, the grammar of a mark and three
functions: `etiquetasDe`, `sinEtiquetas` (identity on a text without marks) and `textoParaVoz` (known marks kept for
`eleven_v3*`/`eleven_v4*`, all stripped otherwise). Counting strips inside `palabras`/`estimarSegundos`, which also
covers subtitles and costs; the review, Claude's review, the voice and HeyGen Route A call the helper explicitly. Gate 1
keeps hashing the raw script; the voice fingerprint hashes the text actually sent.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest + Testing Library, MSW 2, Supabase local (integration),
Playwright, Biome.

**Rules (every task):**

- Strict TDD: write the failing test first, run it and see it red, then the minimum code, then green.
- MSW for every external call (Anthropic, ElevenLabs, HeyGen). No real network in tests. Never call a real API, and
  never run `pnpm test:eval` with `RUN_EVALS=1` (it spends money; Federico runs it).
- Local Supabase only (`pnpm db:start`, `supabase db reset`). Never touch the hosted project or production. Never read
  `.env*` files or secrets.
- Never `as any`, `@ts-expect-error`, non-null assertions (`!`) or silent catches.
- Biome safe mode only (`pnpm check`, never `--unsafe`). After `pnpm check`, run
  `grep -L '^"use client"' $(grep -rl '"use client"' app components)` and expect no output.
- No migration is needed (the review column is `jsonb`; the rule names live in code). If one ever is: append-only.
- Copy for Coni: Spanish of Chile, `tú`, no em dashes. Before each commit: `git diff --cached | grep '—'` must print
  nothing.
- One commit per task. Message in English, then a blank line, then
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Commands:**

- `pnpm type`
- `pnpm test:run` (unit; one file with `pnpm test:run tests/unit/<file>`)
- `supabase db reset && pnpm test:db` (integration; one file with `pnpm test:db tests/integration/<file>`)
- `pnpm test:e2e`
- `pnpm build`
- `pnpm lint` has one known failure in `tests/unit/duracion.test.ts`; nothing new may fail.

**Invariant to protect in every task:** a script without marks must behave exactly as today (same words, seconds,
subtitles, fingerprint, review). `tests/unit/subtitulos-goldens.test.ts` and `tests/unit/voz.test.ts` must stay green
untouched.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/dominio/etiquetas.ts` | create | The list, the grammar of a mark, `etiquetasDe`, `sinEtiquetas`, `admiteEtiquetas`, `textoParaVoz` |
| `lib/dominio/estimaciones.ts` | modify | `palabras` and `estimarSegundos` ignore marks (counter, seconds, costs, subtitles) |
| `lib/dominio/revision.ts` | modify | Review on the spoken text; rules `etiqueta_desconocida`, `muchas_etiquetas`, `etiqueta_en_texto` |
| `lib/produccion/voz.ts` | modify | Fingerprint, cost and ElevenLabs request on `textoParaVoz` |
| `lib/proveedores/heygen.ts` | modify | Route A script without marks |
| `lib/proveedores/anthropic.ts` | modify | Writer prompt asks for marks; Claude's review gets the script without marks |
| `components/ayuda-de-marcas.tsx` | create | The help line and the list, under the script |
| `components/editor-de-guion.tsx` | modify | Shows `AyudaDeMarcas` |
| `app/(app)/guion/[id]/pantalla-guion.tsx` | modify | Read-only approved script shows the help when it has marks |
| `tests/eval/guion.eval.ts` | modify | Asserts 3 to 6 known marks and none in the caption |
| `tests/unit/etiquetas.test.ts` | create | Helper |
| `tests/unit/estimaciones.test.ts`, `tests/unit/duracion.test.ts`, `tests/unit/subtitulos.test.ts`, `tests/unit/editor-de-guion.test.tsx` | modify | Counting, subtitles, editor |
| `tests/unit/revision.test.ts` | modify | Review rules |
| `tests/unit/huella-del-guion.test.ts` | create | Fingerprint per model |
| `tests/integration/grabar-voz.test.ts` | modify | Text sent to ElevenLabs per model |
| `tests/unit/pedido.test.ts` | modify | HeyGen Route A |
| `tests/unit/anthropic.test.ts` | modify | Prompt and review |
| `tests/e2e/guion.spec.ts` | modify | Help visible in the editor, absent on an approved script without marks |
| `docs/TRASPASO.md` | modify | Handoff note |

---

### Task 1: The tone-mark helper

**Files:**
- Create: `lib/dominio/etiquetas.ts`
- Test: `tests/unit/etiquetas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/etiquetas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  admiteEtiquetas,
  ETIQUETAS_DE_TONO,
  etiquetasDe,
  MAXIMO_DE_ETIQUETAS,
  MINIMO_DE_ETIQUETAS,
  sinEtiquetas,
  textoParaVoz,
} from "@/lib/dominio/etiquetas"

const CON_MARCAS =
  "[warm] Hola, tú.\n\n[pause]\nHoy [softly] hablamos de límites [cálido] con calma.\n\nSoy Coni del Rosario."

describe("ETIQUETAS_DE_TONO", () => {
  it("is the closed list of the design, with no laugh", () => {
    expect(ETIQUETAS_DE_TONO).toEqual([
      "warm",
      "softly",
      "gentle",
      "reassuring",
      "encouraging",
      "thoughtful",
      "empathetic",
      "calm",
      "confident",
      "clear",
      "casual",
      "matter-of-fact",
      "pause",
      "sighs",
    ])
    expect([MINIMO_DE_ETIQUETAS, MAXIMO_DE_ETIQUETAS]).toEqual([3, 6])
  })
})

describe("etiquetasDe", () => {
  it("finds every mark with its name in lowercase and whether it is on the list", () => {
    expect(etiquetasDe("[warm] Hola [Softly] tú [matter-of-fact] y [cálido].")).toEqual([
      { escrita: "[warm]", nombre: "warm", conocida: true },
      { escrita: "[Softly]", nombre: "softly", conocida: true },
      { escrita: "[matter-of-fact]", nombre: "matter-of-fact", conocida: true },
      { escrita: "[cálido]", nombre: "cálido", conocida: false },
    ])
  })

  it("does not take brackets with digits or symbols, or a lone bracket, for a mark", () => {
    expect(etiquetasDe("Uno [1] dos [ok!] tres [ y ] cuatro")).toEqual([])
  })
})

describe("sinEtiquetas", () => {
  it("returns the very same text when there is no mark", () => {
    const texto = "Hola,  tú. \n\n\n Así es.  "
    expect(sinEtiquetas(texto)).toBe(texto)
  })

  it("removes every mark, known or not, and leaves clean spacing and paragraphs", () => {
    expect(sinEtiquetas(CON_MARCAS)).toBe("Hola, tú.\n\nHoy hablamos de límites con calma.\n\nSoy Coni del Rosario.")
  })

  it("does not leave a space before punctuation where a mark was", () => {
    expect(sinEtiquetas("Hola [warm], tú [pause].")).toBe("Hola, tú.")
  })

  it("leaves nothing when the text is only marks", () => {
    expect(sinEtiquetas("[warm] [pause]")).toBe("")
  })
})

describe("admiteEtiquetas", () => {
  it.each(["eleven_v3", "eleven_v4", "eleven_v3_alpha", "eleven_v4_preview"])("%s speaks the marks", (modelo) => {
    expect(admiteEtiquetas(modelo)).toBe(true)
  })

  it.each(["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v30", "eleven_v5", ""])(
    "%s would read them aloud",
    (modelo) => {
      expect(admiteEtiquetas(modelo)).toBe(false)
    },
  )
})

describe("textoParaVoz", () => {
  it("keeps the known marks for a model that speaks them and drops the unknown ones", () => {
    expect(textoParaVoz("[warm] Hola [cálido] tú.", "eleven_v4")).toBe("[warm] Hola tú.")
  })

  it("drops every mark for a model that would read them aloud", () => {
    expect(textoParaVoz("[warm] Hola [cálido] tú.", "eleven_multilingual_v2")).toBe("Hola tú.")
  })

  it("sends a script without marks untouched to any model", () => {
    const guion = "Hola,  tú.\n\nSoy Coni del Rosario. "
    expect(textoParaVoz(guion, "eleven_v4")).toBe(guion)
    expect(textoParaVoz(guion, "eleven_multilingual_v2")).toBe(guion)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/etiquetas.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/etiquetas"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/dominio/etiquetas.ts`:

```ts
/**
 * ElevenLabs v3 and v4 take a word in square brackets as a direction and do not read it aloud. The writer may only use
 * this closed list (no laughs). Anything else in brackets is warned about and never reaches the voice.
 */
export const ETIQUETAS_DE_TONO = [
  "warm",
  "softly",
  "gentle",
  "reassuring",
  "encouraging",
  "thoughtful",
  "empathetic",
  "calm",
  "confident",
  "clear",
  "casual",
  "matter-of-fact",
  "pause",
  "sighs",
] as const
export const MINIMO_DE_ETIQUETAS = 3
export const MAXIMO_DE_ETIQUETAS = 6

export interface Etiqueta {
  /** As written in the text, brackets included: what Coni has to find and fix. */
  escrita: string
  nombre: string
  conocida: boolean
}

// A word or a few words in brackets. Digits or symbols inside are not a mark, so the symbol rule still catches them.
const ETIQUETA = /\[(\p{L}[\p{L}' -]{0,38})\]/gu
const CONOCIDAS: ReadonlySet<string> = new Set(ETIQUETAS_DE_TONO)
// eleven_v3 and eleven_v4 and their variants; anything else (v2, turbo, flash, an unknown future model) would read
// the marks aloud, and a flat voice is the safer failure.
const MODELO_CON_ETIQUETAS = /^eleven_v[34](?:_|$)/

const nombreDe = (marca: string) => marca.slice(1, -1).trim().toLowerCase()

export function etiquetasDe(texto: string): Etiqueta[] {
  return Array.from(texto.matchAll(ETIQUETA), ([marca]) => {
    const nombre = nombreDe(marca)
    return { escrita: marca, nombre, conocida: CONOCIDAS.has(nombre) }
  })
}

function quitar(texto: string, sobra: (nombre: string) => boolean): string {
  let quito = false
  const sin = texto.replace(ETIQUETA, (marca: string) => {
    if (!sobra(nombreDe(marca))) return marca
    quito = true
    return ""
  })
  // Only a text that lost a mark is tidied: a script without marks must stay byte for byte the same, or every older
  // voice fingerprint and subtitle golden would change.
  if (!quito) return texto
  return sin
    .split("\n")
    .map((linea) =>
      linea
        .replace(/[ \t]{2,}/g, " ")
        .replace(/ +([,.;:!?…])/g, "$1")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** The spoken text: what subtitles, counts and checks see. */
export function sinEtiquetas(texto: string): string {
  return quitar(texto, () => true)
}

export function admiteEtiquetas(modelo: string): boolean {
  return MODELO_CON_ETIQUETAS.test(modelo)
}

/** The exact text ElevenLabs receives with this model. The voice fingerprint hashes this, not the stored script. */
export function textoParaVoz(guion: string, modelo: string): string {
  return admiteEtiquetas(modelo) ? quitar(guion, (nombre) => !CONOCIDAS.has(nombre)) : sinEtiquetas(guion)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run tests/unit/etiquetas.test.ts && pnpm type`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
pnpm check
git add lib/dominio/etiquetas.ts tests/unit/etiquetas.test.ts
git diff --cached | grep '—'
git commit -m "feat(guion): add the tone-mark helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Counts, seconds and subtitles ignore the marks

**Files:**
- Modify: `lib/dominio/estimaciones.ts:7-14`
- Test: `tests/unit/estimaciones.test.ts`, `tests/unit/duracion.test.ts`, `tests/unit/subtitulos.test.ts`,
  `tests/unit/editor-de-guion.test.tsx`

`palabras` and `estimarSegundos` are the only counters: the editor (`lib/dominio/duracion.ts`), the screens' seconds,
Inicio, HeyGen credits and USD (`lib/produccion/grabar.ts`), `armarPedido` and `alinearConGuion` (subtitles) all go
through them. Stripping there covers every one.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("estimaciones", ...)` block of `tests/unit/estimaciones.test.ts`:

```ts
  it("no cuenta las marcas de tono como palabras ni como tiempo", () => {
    expect(palabras("[warm] Hola [softly] tú.")).toEqual(["Hola", "tú."])
    expect(estimarSegundos("[warm] uno dos\n\n[pause] tres")).toBeCloseTo((3 / 150) * 60 + 0.6, 9)
  })
```

Append inside the `describe("script length", ...)` block of `tests/unit/duracion.test.ts`:

```ts
  test("does not count tone marks as words", () => {
    expect(contarPalabras("[warm] Hola  tú.\n\n[pause] Así es.")).toBe(4)
  })
```

Append inside the `describe("subtítulos", ...)` block of `tests/unit/subtitulos.test.ts`:

```ts
  it("deja las marcas de tono fuera de los subtítulos", () => {
    const conMarcas = "[warm] ¿Te cuesta sentirte la\n\n[softly] Es súper común dudar de\n\n[pause]\nSoy Coni del Rosario."
    const cues = alinearConGuion(leerSrt(SRT_HEYGEN), conMarcas)
    expect(cues).toEqual(alinearConGuion(leerSrt(SRT_HEYGEN), GUION))
    expect(assDe(cues)).not.toContain("[")
  })
```

Append inside the `describe("EditorDeGuion", ...)` block of `tests/unit/editor-de-guion.test.tsx`:

```ts
  it("does not count the tone marks in the words or the seconds", () => {
    montar({ guion: "[warm] Hola, hoy [softly] hablamos del deseo." })

    expect(screen.getByText(/^5 palabras · ≈ 2 s$/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run tests/unit/estimaciones.test.ts tests/unit/duracion.test.ts tests/unit/subtitulos.test.ts tests/unit/editor-de-guion.test.tsx`
Expected: FAIL. `palabras` returns `["[warm]", "Hola", "[softly]", "tú."]`; `contarPalabras` returns 6; the subtitle
test throws `Los subtítulos de HeyGen no calzan con el guion` (or keeps `[warm]` in a cue); the editor shows
`7 palabras`.

- [ ] **Step 3: Write minimal implementation**

In `lib/dominio/estimaciones.ts`, add the import at the top and replace `palabras` and `estimarSegundos`:

```ts
import { sinEtiquetas } from "@/lib/dominio/etiquetas"
```

```ts
/**
 * Python's `str.split()` for real text, on the spoken words only: tone marks are not read, so they never count as
 * words, time or subtitle text. It differs from Python only on U+001C to U+001F and U+0085 (Python splits) and U+FEFF
 * (JS splits); neither appears in scripts.
 */
export function palabras(texto: string): string[] {
  return sinEtiquetas(texto).split(/\s+/).filter(Boolean)
}

export function estimarSegundos(texto: string): number {
  const hablado = sinEtiquetas(texto)
  const pausas = hablado.split("\n\n").length - 1
  return (palabras(hablado).length / PALABRAS_POR_MINUTO) * 60 + pausas * 0.6
}
```

- [ ] **Step 4: Run tests to verify they pass, goldens included**

Run: `pnpm test:run tests/unit/estimaciones.test.ts tests/unit/duracion.test.ts tests/unit/subtitulos.test.ts tests/unit/subtitulos-goldens.test.ts tests/unit/editor-de-guion.test.tsx tests/unit/pedido.test.ts && pnpm type`
Expected: PASS. The goldens pass untouched (their scripts have no marks, and `sinEtiquetas` is the identity there).

- [ ] **Step 5: Commit**

```bash
pnpm check
git add lib/dominio/estimaciones.ts tests/unit/estimaciones.test.ts tests/unit/duracion.test.ts tests/unit/subtitulos.test.ts tests/unit/editor-de-guion.test.tsx
git diff --cached | grep '—'
git commit -m "feat(guion): counts, seconds and subtitles ignore tone marks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The review reads the spoken text and checks the marks

**Files:**
- Modify: `lib/dominio/revision.ts` (imports, `REGLAS_DETERMINISTAS`, `revisarGuion`)
- Test: `tests/unit/revision.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/revision.test.ts` (it already defines `SIN_AJENO`, `CITA`, `CUERPO`, `GUION`, `TEXTO`,
`revisar` and imports `leerRevision`, `bloquea`, `CIERRE`):

```ts
describe("revisarGuion with tone marks", () => {
  const marcas = (n: number) => Array.from({ length: n }, () => "[warm]").join(" ")

  it("accepts known marks: they are not symbols, words or a broken closing", () => {
    expect(revisar({ guion: `[warm] ${CUERPO}.\n\n[pause]\n[softly] ${CIERRE}` })).toEqual([])
  })

  it("still blocks a stray bracket that is not a mark", () => {
    expect(revisar({ guion: `Una [idea simple. ${GUION}` }).map((h) => h.regla)).toEqual(["simbolos"])
  })

  it("warns once per unknown mark, naming it", () => {
    expect(revisar({ guion: `[cálido] ${CUERPO}.\n\n[cálido] [warm] ${CIERRE}` })).toEqual([
      {
        regla: "etiqueta_desconocida",
        tipo: "advierte",
        mensaje: "Esta marca de tono no la conozco: [cálido]. Usa una de la lista o bórrala.",
        frase: "[cálido]",
      },
    ])
  })

  it("warns about more than six marks and accepts six", () => {
    expect(revisar({ guion: `${marcas(6)} ${GUION}` })).toEqual([])
    expect(revisar({ guion: `${marcas(7)} ${GUION}` })).toEqual([
      {
        regla: "muchas_etiquetas",
        tipo: "advierte",
        mensaje: "El guion tiene 7 marcas de tono. Con 3 a 6 la voz suena natural; con más suena actuada.",
      },
    ])
  })

  it("blocks a mark in the caption, which is published as written", () => {
    const hallazgos = revisar({ texto: `[warm] ${TEXTO}` })
    expect(hallazgos).toEqual([
      {
        regla: "etiqueta_en_texto",
        tipo: "bloquea",
        mensaje: "Las marcas de tono van solo en el guion. Bórrala del texto de la publicación.",
        frase: "[warm]",
      },
    ])
    expect(bloquea(hallazgos)).toBe(true)
  })

  it("finds a copied phrase even with a mark in the middle of it", () => {
    const copiado = "El deseo no se apaga, se [softly] esconde debajo de la rutina"
    const hallazgos = revisar({ guion: `${copiado}. ${GUION}`, ajeno: { ...SIN_AJENO, citas: [CITA] } })
    expect(hallazgos.filter((h) => h.regla === "copia_de_fuente").map((h) => h.frase)).toEqual([
      "El deseo no se apaga, se esconde debajo de la rutina",
    ])
  })

  it("stores and reads back the new findings", () => {
    const hallazgos = revisar({ guion: `[cálido] ${GUION}`, texto: `[warm] ${TEXTO}` })
    expect(leerRevision(JSON.parse(JSON.stringify(hallazgos)))).toEqual(hallazgos)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run tests/unit/revision.test.ts`
Expected: FAIL. The first test gets a `simbolos` finding for `[`; the copy test finds nothing; the new rules do not
exist (`leerRevision` would also reject them).

- [ ] **Step 3: Write minimal implementation**

In `lib/dominio/revision.ts`:

Add to the imports:

```ts
import { etiquetasDe, MAXIMO_DE_ETIQUETAS, MINIMO_DE_ETIQUETAS, sinEtiquetas } from "@/lib/dominio/etiquetas"
```

Extend the rule list (the stored-review schema in `lib/datos/revision.ts` is built from it):

```ts
export const REGLAS_DETERMINISTAS = [
  "cierre",
  "simbolos",
  "aviso_avatar",
  "lineas_ayuda",
  "largo",
  "numeros",
  "copia_de_fuente",
  "nombra_autor",
  "etiqueta_desconocida",
  "muchas_etiquetas",
  "etiqueta_en_texto",
] as const
```

Replace the body of `revisarGuion` with:

```ts
export function revisarGuion(entrada: {
  guion: string
  texto: string
  esAvatar: boolean
  requiereLineasAyuda: boolean
  ajeno: Ajeno
}): Hallazgo[] {
  const { guion, texto, esAvatar, requiereLineasAyuda, ajeno } = entrada
  // Every rule about what is said reads the spoken text: a tone mark is not a symbol, a word or part of a quote.
  const hablado = sinEtiquetas(guion)
  const hallazgos: Hallazgo[] = []

  if (!hablado.trim().endsWith(CIERRE)) {
    hallazgos.push({
      regla: "cierre",
      tipo: "bloquea",
      mensaje: `El guion tiene que terminar con «${CIERRE}»`,
    })
  }

  const simbolo = SIMBOLO.exec(hablado)
  if (simbolo) {
    hallazgos.push({
      regla: "simbolos",
      tipo: "bloquea",
      mensaje: "Sin emojis, hashtags ni símbolos en el guion: van solo en la publicación.",
      frase: simbolo[0],
    })
  }

  if (esAvatar && !texto.includes(AVISO_AVATAR)) {
    hallazgos.push({
      regla: "aviso_avatar",
      tipo: "bloquea",
      mensaje: `El texto de la publicación tiene que avisar que es un avatar digital: «${AVISO_AVATAR}»`,
    })
  }

  if (requiereLineasAyuda && !["1455", "*4141", "133"].every((linea) => texto.includes(linea))) {
    hallazgos.push({
      regla: "lineas_ayuda",
      tipo: "bloquea",
      mensaje: "Este tema pide las líneas de ayuda de Chile en el texto de la publicación: 1455, *4141 y 133.",
    })
  }

  const cantidad = palabras(hablado).length
  if (cantidad < MINIMO_PALABRAS || cantidad > MAXIMO_PALABRAS) {
    hallazgos.push({
      regla: "largo",
      tipo: "advierte",
      mensaje: `El guion tiene ${cantidad} palabras. Lo ideal es entre ${MINIMO_PALABRAS} y ${MAXIMO_PALABRAS}.`,
    })
  }

  const numero = NUMERO.exec(hablado)
  if (numero) {
    hallazgos.push({
      regla: "numeros",
      tipo: "advierte",
      mensaje: "Escribe los números con palabras (tres señales, no 3 señales).",
      frase: numero[0],
    })
  }

  const marcas = etiquetasDe(guion)
  for (const frase of new Set(marcas.filter((marca) => !marca.conocida).map((marca) => marca.escrita))) {
    hallazgos.push({
      regla: "etiqueta_desconocida",
      tipo: "advierte",
      mensaje: `Esta marca de tono no la conozco: ${frase}. Usa una de la lista o bórrala.`,
      frase,
    })
  }
  if (marcas.length > MAXIMO_DE_ETIQUETAS) {
    hallazgos.push({
      regla: "muchas_etiquetas",
      tipo: "advierte",
      mensaje: `El guion tiene ${marcas.length} marcas de tono. Con ${MINIMO_DE_ETIQUETAS} a ${MAXIMO_DE_ETIQUETAS} la voz suena natural; con más suena actuada.`,
    })
  }
  // The caption is published as written: a mark there would reach Instagram.
  for (const frase of new Set(etiquetasDe(texto).map((marca) => marca.escrita))) {
    hallazgos.push({
      regla: "etiqueta_en_texto",
      tipo: "bloquea",
      mensaje: "Las marcas de tono van solo en el guion. Bórrala del texto de la publicación.",
      frase,
    })
  }

  // One finding per phrase even when the script and the caption share it: the screen keys and ticks findings by
  // rule, phrase and message, so two equal findings would be one checkbox for two warnings.
  const campos = [hablado, texto]
  for (const frase of new Set(campos.flatMap((campo) => tramosCopiados(campo, ajeno.citas)))) {
    hallazgos.push({ regla: "copia_de_fuente", tipo: "advierte", mensaje: MENSAJE_COPIA, frase })
  }
  for (const frase of new Set(campos.flatMap((campo) => autoresNombrados(campo, ajeno.autores, ajeno.personas)))) {
    hallazgos.push({ regla: "nombra_autor", tipo: "advierte", mensaje: MENSAJE_AUTOR, frase })
  }

  return hallazgos
}
```

Also update the comment above `SIMBOLO` to:

```ts
// The voice reads the script aloud: anything that is not speech goes in the caption. Tone marks are removed before
// this check (`sinEtiquetas`); any other bracket is still a symbol. `{`, `}` and `\` also reach the ASS subtitles,
// where they would be read as override codes.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run tests/unit/revision.test.ts && pnpm type`
Expected: PASS, including every existing test in the file.

Then: `supabase db reset && pnpm test:db tests/integration/acciones-guion.test.ts tests/integration/producir.test.ts tests/integration/acciones-piezas.test.ts`
Expected: PASS (they store and read reviews; no script there has marks).

- [ ] **Step 5: Commit**

```bash
pnpm check
git add lib/dominio/revision.ts tests/unit/revision.test.ts
git diff --cached | grep '—'
git commit -m "feat(revision): review the spoken text and warn about tone marks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The voice receives, hashes and pays for the text actually sent

**Files:**
- Modify: `lib/produccion/voz.ts` (`huellaDelGuion`, `asegurarVoz`)
- Test: `tests/unit/huella-del-guion.test.ts` (create), `tests/integration/grabar-voz.test.ts`

`vozAprobada` (`lib/produccion/grabar.ts`) and `vozVigente` (`lib/datos/grabacion.ts`) already go through
`huellaDelGuion`, so they follow without changes.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/huella-del-guion.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { huellaDeVoz } from "@/lib/dominio/voz"
import { huellaDelGuion, vozDe } from "@/lib/produccion/voz"
import type { ConfigElevenlabs } from "@/lib/proveedores/config"

const V2: ConfigElevenlabs = {
  voice_id: "voz-coni",
  model_id: "eleven_multilingual_v2",
  voice_settings: { stability: 0.5 },
  output_format: "mp3_44100_128",
}
const V4: ConfigElevenlabs = { ...V2, model_id: "eleven_v4" }
const SIN = "Hola, tú.\n\nSoy Coni del Rosario."
const CON = "[warm] Hola, tú.\n\nSoy Coni del Rosario."

describe("huellaDelGuion", () => {
  it("keeps the fingerprint of a script without marks exactly as before, so stored takes still match", () => {
    expect(huellaDelGuion(SIN, V4)).toBe(huellaDeVoz({ guion: SIN, voz: vozDe(V4) }))
    expect(huellaDelGuion(SIN, V2)).toBe(huellaDeVoz({ guion: SIN, voz: vozDe(V2) }))
  })

  it("hashes the text without marks for a model that cannot speak them", () => {
    expect(huellaDelGuion(CON, V2)).toBe(huellaDelGuion(SIN, V2))
  })

  it("hashes the marks for a model that speaks them", () => {
    expect(huellaDelGuion(CON, V4)).not.toBe(huellaDelGuion(SIN, V4))
    expect(huellaDelGuion(CON, V4)).toBe(huellaDeVoz({ guion: CON, voz: vozDe(V4) }))
  })

  it("ignores an unknown mark, which never reaches the voice", () => {
    expect(huellaDelGuion("[cálido] Hola, tú.\n\nSoy Coni del Rosario.", V4)).toBe(huellaDelGuion(SIN, V4))
  })

  it("never shares a take between models", () => {
    expect(huellaDelGuion(CON, V2)).not.toBe(huellaDelGuion(CON, V4))
  })
})
```

- [ ] **Step 2: Write the failing integration test**

In `tests/integration/grabar-voz.test.ts`, extend the imports:

```ts
import { leerPieza } from "@/lib/datos/repositorio"
import { asegurarVoz, huellaDelGuion } from "@/lib/produccion/voz"
```

(replace the existing `import { huellaDelGuion } from "@/lib/produccion/voz"` line with the second one), and append:

```ts
describe("asegurarVoz with tone marks", () => {
  const CON_MARCAS = "[warm] Hola, soy Coni. [cálido] Hoy hablamos de límites."

  async function pedirVoz(modelo: string) {
    const textos: string[] = []
    servidor.use(
      http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", async ({ request }) => {
        const cuerpo: unknown = await request.json()
        if (typeof cuerpo === "object" && cuerpo !== null && "text" in cuerpo && typeof cuerpo.text === "string") {
          textos.push(cuerpo.text)
        }
        return new HttpResponse(VOZ, { headers: { "Content-Type": "audio/mpeg" } })
      }),
    )
    const id = await grabando()
    const fila = await leerPieza(clienteDeServicio(), id)
    if (fila === null) throw new Error(`No se sembró la pieza ${id}`)
    const config = { ...leerConfigProduccion(coniConfig).elevenlabs, model_id: modelo }
    const voz = await asegurarVoz(deps(), {
      fila,
      guion: CON_MARCAS,
      config,
      llave: async () => "sk_eleven_de_prueba",
      nueva: true,
    })
    return { textos, voz, fila, config }
  }

  it("sends the known marks to a model that speaks them and drops the unknown ones", async () => {
    const { textos, voz, fila, config } = await pedirVoz("eleven_v4")

    expect(textos).toEqual(["[warm] Hola, soy Coni. Hoy hablamos de límites."])
    expect(voz).toEqual({
      tipo: "lista",
      audioId: claveDeToma(fila.id, huellaDelGuion(CON_MARCAS, config), fila.intento),
    })
  })

  it("sends no mark at all to a model that would read them aloud", async () => {
    const { textos } = await pedirVoz("eleven_multilingual_v2")

    expect(textos).toEqual(["Hola, soy Coni. Hoy hablamos de límites."])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test:run tests/unit/huella-del-guion.test.ts`
Expected: FAIL on "hashes the text without marks..." and "ignores an unknown mark..." (today the raw script is hashed).

Run: `supabase db reset && pnpm test:db tests/integration/grabar-voz.test.ts`
Expected: FAIL, ElevenLabs receives `"[warm] Hola, soy Coni. [cálido] Hoy hablamos de límites."` both times.

- [ ] **Step 4: Write minimal implementation**

In `lib/produccion/voz.ts`, add the import:

```ts
import { textoParaVoz } from "@/lib/dominio/etiquetas"
```

Replace `huellaDelGuion`:

```ts
/**
 * The fingerprint of this script spoken with the configured voice. It hashes the text ElevenLabs actually receives
 * (marks kept or stripped by model), so a take is reused only when the audio would be the same. A script without marks
 * hashes exactly as before.
 */
export function huellaDelGuion(guion: string, config: ConfigElevenlabs): string {
  return huellaDeVoz({ guion: textoParaVoz(guion, config.model_id), voz: vozDe(config) })
}
```

In `asegurarVoz`, compute the sent text once and use it for the cost and the request. Replace:

```ts
  const estimado = estimarCostoVoz(guion)
```

with:

```ts
  const texto = textoParaVoz(guion, config.model_id)
  const estimado = estimarCostoVoz(texto)
```

and replace:

```ts
    audio = await generarVoz({ clave: llave, config, texto: guion, base: deps.base?.elevenlabs })
```

with:

```ts
    audio = await generarVoz({ clave: llave, config, texto, base: deps.base?.elevenlabs })
```

(`const huella = huellaDelGuion(guion, config)` at the top of `asegurarVoz` stays: it now hashes the same `texto`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:run tests/unit/huella-del-guion.test.ts tests/unit/voz.test.ts && pnpm type`
Expected: PASS.

Run: `pnpm test:db tests/integration/grabar-voz.test.ts tests/integration/grabar.test.ts tests/integration/grabacion-datos.test.ts`
Expected: PASS (the existing tests use a script without marks; their `HUELLA` is unchanged).

- [ ] **Step 6: Commit**

```bash
pnpm check
git add lib/produccion/voz.ts tests/unit/huella-del-guion.test.ts tests/integration/grabar-voz.test.ts
git diff --cached | grep '—'
git commit -m "feat(voz): send ElevenLabs only the marks its model speaks, and hash that text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: HeyGen Route A never receives marks

**Files:**
- Modify: `lib/proveedores/heygen.ts:57-66` (`textoDelGuion`)
- Test: `tests/unit/pedido.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside `describe("armarPedido", ...)` in `tests/unit/pedido.test.ts`:

```ts
  it("no manda las marcas de tono a heygen en la ruta a", () => {
    const { cuerpo, palabras } = pedido(config(), { guion: `[warm] ${GUION}` })
    expect(cuerpo.script).toBe(GUION)
    expect(palabras).toBe(pedido().palabras)
  })

  it("trata como vacío un guion que solo tiene marcas", () => {
    expect(errorDe(() => pedido(config(), { guion: "[warm] [pause]" }))).toBeInstanceOf(Falla)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/pedido.test.ts`
Expected: FAIL, `cuerpo.script` is `"[warm] ¿Peleas siempre por lo mismo?..."` and the marks-only script is accepted.

- [ ] **Step 3: Write minimal implementation**

In `lib/proveedores/heygen.ts`, add the import:

```ts
import { sinEtiquetas } from "@/lib/dominio/etiquetas"
```

and in `textoDelGuion` replace `const texto = guion.trim()` with:

```ts
  // HeyGen's engine is not trusted with tone marks: Route A always speaks the plain text.
  const texto = sinEtiquetas(guion).trim()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run tests/unit/pedido.test.ts tests/unit/pedido-reales.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check
git add lib/proveedores/heygen.ts tests/unit/pedido.test.ts
git diff --cached | grep '—'
git commit -m "feat(heygen): strip tone marks from the Route A script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The writer adds the marks; Claude's review does not see them

**Files:**
- Modify: `lib/proveedores/anthropic.ts` (imports, `pedidoDeGuion`, `pedidoDeRevision`)
- Test: `tests/unit/anthropic.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/anthropic.test.ts`, add the import:

```ts
import { ETIQUETAS_DE_TONO } from "@/lib/dominio/etiquetas"
```

Append inside `describe("escribirGuion", ...)`:

```ts
  it("asks for three to six tone marks from the closed list, none in the caption and no laughs", async () => {
    const pedidos = respondiendo(() => HttpResponse.json(conTexto(guionOk)))
    await escribir()

    const usuario = JSON.stringify((pedidos[0] as PedidoCapturado).cuerpo.messages[0]?.content)
    for (const etiqueta of ETIQUETAS_DE_TONO) expect(usuario).toContain(`[${etiqueta}]`)
    expect(usuario).toContain("entre 3 y 6 marcas")
    expect(usuario).toContain("Las marcas de tono no cuentan como palabras")
    expect(usuario).toContain("Sin marcas de tono: van solo en el guion.")
    expect(usuario).toContain("MAYÚSCULAS")
    expect(usuario).not.toMatch(/laugh/i)
    expect(usuario).not.toContain("{ } [ ]")
  })
```

Append inside the `describe` that tests `revisarConClaude` (the one with "sends low effort, the same cached guide..."):

```ts
  it("reviews the spoken words only: tone marks do not reach Claude's review", async () => {
    const pedidos = respondiendo(() => HttpResponse.json(conTexto({ hallazgos: [] })))
    await revisar({ guion: `[warm] Una idea simple.\n\n${CIERRE}` })

    const usuario = JSON.stringify((pedidos[0] as PedidoCapturado).cuerpo.messages[0]?.content)
    expect(usuario).toContain("Una idea simple.")
    expect(usuario).not.toContain("[warm]")
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run tests/unit/anthropic.test.ts`
Expected: FAIL, the prompt has no marks and still lists `{ } [ ]`; the review receives `[warm]`.

- [ ] **Step 3: Write minimal implementation**

In `lib/proveedores/anthropic.ts`, add the import next to the other `@/lib/dominio` imports:

```ts
import { ETIQUETAS_DE_TONO, MAXIMO_DE_ETIQUETAS, MINIMO_DE_ETIQUETAS, sinEtiquetas } from "@/lib/dominio/etiquetas"
```

Above `pedidoDeGuion`, add:

```ts
const MARCAS_DE_TONO = ETIQUETAS_DE_TONO.map((etiqueta) => `[${etiqueta}]`).join(", ")
```

In `pedidoDeGuion`, replace the two rule blocks with:

```ts
    `REGLAS DEL GUION
- Entre 75 y 150 palabras. Las marcas de tono no cuentan como palabras.
- La última línea es exactamente: ${CIERRE}
- Escribe todos los números con palabras.
- Marca el tono de la voz con entre ${MINIMO_DE_ETIQUETAS} y ${MAXIMO_DE_ETIQUETAS} marcas entre corchetes, cada una justo antes de la frase donde el tono cambia. Usa solo estas, escritas tal cual: ${MARCAS_DE_TONO}. No marques risas. La voz no lee las marcas y no salen en los subtítulos. La línea del cierre va sin marca.
- Puedes usar puntos suspensivos para una pausa y, como mucho una vez, una palabra en MAYÚSCULAS para dar énfasis.
- Sin emojis, hashtags ni símbolos. Usa solo letras, la puntuación del español, saltos de línea y los corchetes de las marcas; nada de # @ * _ ~ ^ = < > { } \\ | / % $ & +.
- Sin diagnósticos, sin consejos para casos particulares, sin anécdotas de pacientes y sin cifras ni estudios que la idea no traiga ya verificados.`,
    `REGLAS DEL TEXTO DE PUBLICACIÓN
- Es el texto que acompaña el video en Instagram. Aquí sí pueden ir emojis y hashtags.
- Sin marcas de tono: van solo en el guion.
- Termina exactamente con: ${AVISO_AVATAR}${
      requiereLineasAyuda ? `\n- Antes de ese aviso incluye, tal cual, esta línea: ${LINEAS_AYUDA}` : ""
    }`,
```

In `pedidoDeRevision`, replace `${entrada.guion}` inside `<guion>` with:

```ts
${sinEtiquetas(entrada.guion)}
```

and add above the function:

```ts
// Claude judges what is said; the tone marks are not speech and would only be quoted back as findings.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run tests/unit/anthropic.test.ts tests/unit/anthropic-modelos.test.ts && pnpm type`
Expected: PASS (the cached system block is unchanged; only the user message changed).

Run: `pnpm test:db tests/integration/producir.test.ts tests/integration/acciones-guion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check
git add lib/proveedores/anthropic.ts tests/unit/anthropic.test.ts
git diff --cached | grep '—'
git commit -m "feat(guion): the writer adds three to six tone marks from the closed list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Coni sees what the brackets do

**Files:**
- Create: `components/ayuda-de-marcas.tsx`
- Modify: `components/editor-de-guion.tsx` (under the counter of the script box), `app/(app)/guion/[id]/pantalla-guion.tsx:134`
- Test: `tests/unit/editor-de-guion.test.tsx`, `tests/e2e/guion.spec.ts`

- [ ] **Step 1: Write the failing unit test**

Append inside `describe("EditorDeGuion", ...)` in `tests/unit/editor-de-guion.test.tsx`:

```ts
  it("explains the tone marks under the script and lists the known ones", () => {
    montar()

    expect(
      screen.getByText("Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos."),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Marcas que conozco: \[warm\] \[softly\]/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/editor-de-guion.test.tsx`
Expected: FAIL, `Unable to find an element with the text: Lo que va entre corchetes...`.

- [ ] **Step 3: Write minimal implementation**

Create `components/ayuda-de-marcas.tsx` (no hooks: it renders in the client editor and the client screen alike):

```tsx
import { ETIQUETAS_DE_TONO } from "@/lib/dominio/etiquetas"

export const AYUDA_DE_MARCAS = "Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos."

/** Under the script: what the brackets do, and the list the "no la conozco" warning points to. */
export function AyudaDeMarcas() {
  return (
    <div className="grid gap-0.5 text-meta text-apagado">
      <p>{AYUDA_DE_MARCAS}</p>
      <p>Marcas que conozco: {ETIQUETAS_DE_TONO.map((etiqueta) => `[${etiqueta}]`).join(" ")}</p>
    </div>
  )
}
```

In `components/editor-de-guion.tsx`, import it:

```ts
import { AyudaDeMarcas } from "@/components/ayuda-de-marcas"
```

and render it right after the counter paragraph of the script box (the `<p aria-live="polite" ...>` that shows
`{palabras} palabras · ≈ {segundos} s`), inside the same `<div className="grid gap-1.5">`:

```tsx
        <AyudaDeMarcas />
```

In `app/(app)/guion/[id]/pantalla-guion.tsx`, import:

```ts
import { AyudaDeMarcas } from "@/components/ayuda-de-marcas"
import { etiquetasDe } from "@/lib/dominio/etiquetas"
```

and right after `<p className="whitespace-pre-wrap text-[1.0625rem]">{datos.guion}</p>` add:

```tsx
            {etiquetasDe(datos.guion).length > 0 ? <AyudaDeMarcas /> : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run tests/unit/editor-de-guion.test.tsx && pnpm type`
Expected: PASS.

- [ ] **Step 5: Extend the end-to-end checks**

In `tests/e2e/guion.spec.ts`, add a constant next to `ETIQUETA` (a literal, so the spec does not import a TSX
component):

```ts
const AYUDA_DE_MARCAS = "Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos."
```

In the test "she edits a sentence, saves, picks the avatar and slides...", right after
`await page.goto(\`/guion/${id}\`)`, add:

```ts
  await expect(page.getByText(AYUDA_DE_MARCAS)).toBeVisible()
```

In the test "an approved script is read-only...", append:

```ts
  // That script has no marks: the help is only for scripts that have them.
  await expect(page.getByText(AYUDA_DE_MARCAS)).toHaveCount(0)
```

Run: `pnpm test:e2e tests/e2e/guion.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm check
grep -L '^"use client"' $(grep -rl '"use client"' app components)
git add components/ayuda-de-marcas.tsx components/editor-de-guion.tsx "app/(app)/guion/[id]/pantalla-guion.tsx" tests/unit/editor-de-guion.test.tsx tests/e2e/guion.spec.ts
git diff --cached | grep '—'
git commit -m "feat(guion): explain the tone marks under the script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The eval checks the marks

**Files:**
- Modify: `tests/eval/guion.eval.ts`

This file only runs with `RUN_EVALS=1` and a real key; it spends money. Do not run it. `pnpm type` checks it compiles.

- [ ] **Step 1: Add the assertions**

Add the import:

```ts
import { etiquetasDe, MAXIMO_DE_ETIQUETAS, MINIMO_DE_ETIQUETAS } from "@/lib/dominio/etiquetas"
```

Rename the `it.each` title to
`"idea %i: sin hallazgos que bloqueen tras una corrección como máximo, y con 3 a 6 marcas de tono de la lista"` and
append at the end of its body:

```ts
      const marcas = etiquetasDe(escrito.guion)
      expect(marcas.length).toBeGreaterThanOrEqual(MINIMO_DE_ETIQUETAS)
      expect(marcas.length).toBeLessThanOrEqual(MAXIMO_DE_ETIQUETAS)
      expect(marcas.filter((marca) => !marca.conocida)).toEqual([])
      expect(etiquetasDe(escrito.texto)).toEqual([])
```

- [ ] **Step 2: Verify it compiles and is skipped without the flag**

Run: `pnpm type`
Expected: no errors. (Do not run `pnpm test:eval`.)

- [ ] **Step 3: Commit**

```bash
pnpm check
git add tests/eval/guion.eval.ts
git diff --cached | grep '—'
git commit -m "test(eval): every script carries three to six known tone marks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification and handoff note

**Files:**
- Modify: `docs/TRASPASO.md` ("Lo que está hecho" and "Siguiente")

- [ ] **Step 1: Run every gate**

```bash
pnpm type
pnpm test:run
supabase db reset && pnpm test:db
pnpm test:e2e
pnpm build
pnpm lint
```

Expected: all green; `pnpm lint` shows only the known failure in `tests/unit/duracion.test.ts`.

- [ ] **Step 2: Check the invariants by hand**

```bash
git diff HEAD~8 --stat -- tests/fixtures/goldens        # expect no output: goldens untouched
grep -rn "sinEtiquetas\|textoParaVoz" lib --include='*.ts'
```

Expected uses: `estimaciones.ts`, `revision.ts`, `voz.ts` (produccion), `heygen.ts`, `anthropic.ts`, and the helper itself.

- [ ] **Step 3: Write the handoff note**

In `docs/TRASPASO.md`, under "Lo que está hecho", add one bullet:

```markdown
- Marcas de tono (plan `2026-10-04-etiquetas-de-emocion`): el guion trae 3 a 6 marcas `[warm]`... de una lista
  cerrada (`lib/dominio/etiquetas.ts`). Llegan a ElevenLabs solo con `eleven_v3*`/`eleven_v4*`; nunca a subtítulos,
  texto, conteos ni revisión. Puerta 1 incluye las marcas; la huella de voz hashea el texto enviado.
```

Under "Siguiente", add: `Correr el eval del guion (RUN_EVALS=1) para ver que el escritor pone las marcas.`

- [ ] **Step 4: Commit**

```bash
git add docs/TRASPASO.md
git diff --cached | grep '—'
git commit -m "docs: handoff note for tone marks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Production checklist (with Federico, only when he asks)

No migration and no database change. Both the worker (writer prompt, voice) and the app (editor, review on edit)
change.

1. `git push origin main`.
2. **Vercel first** (the push does not deploy): `vercel deploy --prod --yes`. The new app is backward compatible: it
   reads reviews from the old worker. Confirm it is served: the Guion editor shows "Lo que va entre corchetes marca el
   tono de la voz..." (hard-refresh before judging).
3. **Then Trigger** (from the repo, after `pnpm install`):
   `TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check`.
   The order matters: the old app's `leerRevision` (a `z.enum` of rule names) cannot parse the new rules
   `etiqueta_desconocida`, `muchas_etiquetas` and `etiqueta_en_texto` that the new worker writes into
   `piezas.revision`.
4. Window between steps 2 and 3: the new app runs with the old worker, which writes no marks. That is harmless.
5. **Smoke test** on conidolly.vercel.app with Coni's test account:
   - write one script (an idea, "Escribir guion"): the editor shows 3 to 6 marks, all from the list; the caption
     has none; the counter matches the words without marks; Revisión shows no `simbolos` finding;
   - approve it and "Grabar voz" with `eleven_v4` (one ElevenLabs spend, with Federico's OK): listen, the marks change
     the tone and none is read aloud;
   - check that no mark appears anywhere else: Inicio card, calendar, the notification, the read-only approved script
     shows them with the help (that is the editor surface), and, only if a video is recorded (spends HeyGen credits,
     Federico decides), the burned subtitles;
   - read-only SQL: `select guion, texto from piezas where id = '<id>'`: marks only in `guion`.
6. Optional, with Federico (spends money): `RUN_EVALS=1 pnpm test:eval` with his key in the shell.
7. Rollback: roll back Trigger only (the previous Trigger version); the new app keeps working. To roll back Vercel too,
   first clean the new findings from `piezas.revision` with SQL (remove the entries whose `regla` is
   `etiqueta_desconocida`, `muchas_etiquetas` or `etiqueta_en_texto`, and bump `version = version + 1` on each row),
   or the old app cannot read those reviews. Scripts with marks stay in the database: the old app blocks saving them
   until the marks are removed, and the old worker sends them raw to v4 (spoken as directions; an unknown mark would be
   sent too).

## Self-review against the spec

| Spec decision | Task |
|---|---|
| 1. Helper, list, grammar, model rule, `textoParaVoz` | 1 |
| 2. Stripped in counts, seconds, costs, subtitles | 2 |
| 2. Stripped in the deterministic review (incl. C3 copy and author) | 3 |
| 2. Stripped in Claude's review | 6 |
| 2. Stripped or kept for ElevenLabs by model; cost on the sent text | 4 |
| 2. Stripped for HeyGen Route A | 5 |
| 3. Writer adds 3 to 6 marks, punctuation, none in caption | 6 |
| 4. Help line and list under the editor; approved view with marks | 7 |
| 5. `etiqueta_desconocida`, `muchas_etiquetas`, `etiqueta_en_texto`; stored reviews readable | 3 |
| 6. Gate 1 unchanged (raw script); fingerprint on sent text, old takes still match | 4 (no change to `puertas.ts`) |
| 7. Old scripts unchanged; no backfill | invariant in every task; goldens and `voz.test.ts` untouched |
| Eval | 8 |
