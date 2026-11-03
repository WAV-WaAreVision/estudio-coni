# Biblioteca batch 2: Subir (change 29b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni uploads a material from Conidolly at `/biblioteca/subir` (reachable from the Materiales header and its empty state): one field that takes a pasted link or text, or a picked file, detects its type as an editable fact, asks only the extras of that type, and sends the files straight from the browser to R2; then the list says "Lo estoy procesando." (fixes 4d, 4e, 4k).

**Architecture:** Ported from Ingesta's `app/(app)/subir/*` and `lib/ingesta/{subir,subida-cliente,modelo,youtube}.ts`, rewritten to Conidolly's layers as batch 1 did. Pure rules in `lib/dominio/biblioteca/` (`youtube.ts`, `subir.ts` with `leerEntrada` and `detectarTipo`, `borrador-de-subida.ts` with what the form derives); the three actions `crearMaterial`, `confirmarMaterial`, `descartarMaterial` in `lib/acciones/biblioteca.ts` (injected `DepsSubir`, `es_coni` checked inside), wrapped by the `"use server"` module `app/(app)/biblioteca/acciones.ts` (`conSesionDeConi` + Zod + `revalidatePath("/biblioteca", "layout")`). The browser PUTs each file to the presigned URL (`subida-cliente.ts`); the E2E runs the real R2 code against batch 1's fake S3. No migration, no Trigger.dev change, no change to the bar or to Ingesta.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, `@supabase/supabase-js` 2.105, Zod 4, Tailwind v4, `@aws-sdk/client-s3` + `s3-request-presigner` (presigned PUT already in `lib/proveedores/almacen.ts`), Phosphor (`@phosphor-icons/react` in client modules, `/dist/ssr` in server ones), Vitest 4 (jsdom unit, node integration against the local Supabase), Playwright 1.59 + `@axe-core/playwright`, Biome 2.2 (safe mode only).

**Spec:** `docs/superpowers/specs/2026-11-03-biblioteca-subir-design.md` (issue WAV-WaAreVision/estudio-coni#17, pedido 29b, batch 2 of 7). Batch 1 plan, whose style and helpers this one reuses: `docs/superpowers/plans/2026-11-02-biblioteca-materiales.md`. Source to port from: Ingesta `/Users/fede/Projects/conidolly-ingesta` (main, `39f9887`, read only).

---

## Where to work

- Worktree: `/Users/fede/Projects/estudio-coni/.worktrees/biblioteca-subir`, branch `feat/biblioteca-subir` (already holds the spec, on top of batch 1). Below, **`CONIDOLLY`** means that path. Every command runs from it.

  ```bash
  cd /Users/fede/Projects/estudio-coni/.worktrees/biblioteca-subir && pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it (.env* is ignored)
  ```

- Local Supabase of estudio-coni must be running (`cd /Users/fede/Projects/estudio-coni && pnpm db:start`): API `127.0.0.1:54421`, database `54422`, Mailpit `54424`. **Do not run `pnpm db:reset`** while another worktree uses the stack; this batch adds no migration, so it never needs one.
- Ingesta is read only: open its files to port them, never edit, commit or push there.
- Read `CONIDOLLY/CLAUDE.md` before Task 1.

## Rules for every task

- **TDD strict:** write the failing test, run it and see it fail for the reason written in the step, write the minimum code, run it green. A task is one commit.
- Commit messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes only, **never `--unsafe`**), then `head -1` every client file the task touched: it must still be `"use client"`.
- No `any`, no `@ts-expect-error`, no non-null `!`, no silent `catch` (a `catch` logs and rethrows, or turns the error into a message for Coni). No hex colour outside `app/globals.css`. Icons are Phosphor, sized through `ICONO` (`components/ui/icono.ts`). No `text-[...]` sizes, no `min-h-11..16`, `text-error` only through `LineaDeError` (all enforced by `tests/unit/diseno-reglas.test.ts`, which walks every file of `app/` and `components/`, so it covers the new files with no change).
- Copy for Coni in Spanish of Chile, tú, no em dashes, quotes as «». No "Papel", "Afirmaciones" or "Evidencia" in a screen of `app/(app)/biblioteca/` (fix 4h, `tests/unit/biblioteca-palabras.test.ts` scans the folder).
- Code identifiers in Spanish like the codebase; comments in English, sparse, only for "why".
- **Coni only:** the page calls `exigirConi()`; every action goes through `conSesionDeConi` and checks `es_coni` again inside `lib/acciones/biblioteca.ts`.
- **Never send file bytes through a server action:** the browser PUTs to a presigned URL.
- **Not touched:** `components/nav-inferior.tsx` (the bar's tab keeps opening Ingesta until batch 7), `app/ir-a-biblioteca/`, `supabase/`, `trigger/`, Ingesta.
- Run `pnpm test:run` (all unit tests, not only the new file) before each commit from Task 9 on.
- From Task 15 on, the two Biblioteca visual baselines of batch 1 (`biblioteca-lista`, `biblioteca-escritorio`) differ (the header gains "Subir"); until Task 20 retakes them, run the E2E by file, never the whole `pnpm test:e2e`.

## Facts fixed before planning

Each was checked in the code on 2026-11-03 (CONIDOLLY at `ec8bb01`, Ingesta at `39f9887`).

- **F1. Row level security already lets Coni do all three steps.** `supabase/migrations/20261003000100_ingesta.sql`: policy "coni y wav suben materiales" (insert with `subido_por = auth.uid()`, which is the column default), column grant `insert (id, tipo, titulo, autor, categoria_id, etiquetas, origen_url, archivo_clave, texto_pegado, declaracion_sin_pacientes_en, subido_por)`, plus `insert (autor_id, rol)` in `20261003000300_autores.sql:53`; "coni o quien subio borra materiales" (Coni deletes any); `20261003000150_claves_en_la_carpeta_del_material.sql`: "quien subio agrega archivos mientras procesa" (images while `procesando`, by the uploader) and both `*_en_su_carpeta` checks, which `claveMaterial` satisfies. `estado` defaults to `procesando`, `categoria_id` is nullable since `..._300`. **No migration is needed.**
- **F2. Row level security lets WAV do the same** (`es_mantenedor()` in every policy above). "WAV is refused" comes from `es_coni` inside each action, as batch 1 did (`exigirConi` in `lib/acciones/biblioteca.ts`).
- **F3. The store already signs uploads:** `Almacen.urlDeSubida(clave, segundos, tipo)` (only for a `claveMaterial` key, at most one hour, `content-type` signed) and `Almacen.tamano(clave)` (`null` when missing) exist in `lib/proveedores/almacen.ts`, with `almacenEnMemoria().simularSubida(url, bytes)` for tests. `EXTENSIONES_DE_MATERIAL` holds the 13 extensions Ingesta takes.
- **F4. The run of a new material:** `DisparosDeBiblioteca.material(materialId, intento?)`; without `intento` the key is `procesar-material:<id>` (`claveProcesarMaterial`, `lib/acciones/disparos.ts`). Test mode writes `{ tarea: "procesar-material", materialId, clave }`, which `disparosDeMateriales()` (`tests/e2e/ayudas.ts`) reads.
- **F5. `DepsBiblioteca.nuevoId` is the attempt of a run** and the integration tests give it `intento-N` strings; a material id must be a UUID (`claveMaterial`, the `*_en_su_carpeta` checks). Subir therefore gets its own `DepsSubir` instead of reusing `DepsBiblioteca`, so batch 1's tests and wrappers stay as they are.
- **F6. The fake S3 of the E2E** (`tests/e2e/almacen-falso-servidor.ts`, port `3203`) answers CORS `*` for PUT with `content-type`, stores the PUT with its content type and `firmada: true` when the URL carries `X-Amz-Signature`, answers HEAD with `content-length` and lists everything at `GET /__objetos`. It cannot fail a PUT on demand: the E2E aborts the PUT with `page.route` instead (no change to the fake).
- **F7. Pieces to reuse:** `Campo` + `CLASES_DE_CAMPO` (`app/(app)/biblioteca/campo.tsx`), `SelectorDeAutor` (`app/(app)/biblioteca/selector-de-autor.tsx`: search label "Autor", results named `<nombre>, <credencial>`, "Autor nuevo"), `crearAutorAccion` (`app/(app)/biblioteca/acciones.ts`), `Eleccion` (`components/ui/filas.tsx`, radio rows inside `.elecciones`), `Casilla` (`components/ui/casilla.tsx`), `Boton` (`icono`, `cargando`, `deshabilitado`), `clasesDeBoton`, `LineaDeError`, `LineaDeEstado` (`neutro` is an `output` with an info icon), `Volver`, `PALABRAS.papel` = "¿Quién es para ti?", `listarAutores(db)`, `exigirConi()`. `ERROR_SESION_VENCIDA` and `ERROR_GENERICO` in `lib/acciones/resultado.ts`.
- **F8. Ingesta's words that break 4h or the design rules:** the role radio group is named "Papel del material", `leerEntrada` says "Elige qué papel cumple este material.", the form draws `min-h-13` and `text-[1rem] text-error`, and `←`/`→` as text. All are replaced here.
- **F9. Batch 1's visual baselines show the Materiales header:** `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png` and `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png`. Adding "Subir" to the header changes both, so Task 20 retakes them next to the new ones.
- **F10. Test styles to mirror:** client components are tested in `tests/unit` with the actions module mocked (`tests/unit/biblioteca-editar-autor-y-rol.test.tsx`); pages in node by walking their element tree (`tests/unit/biblioteca-pagina-materiales.test.tsx`); server wrappers with `conSesionDeConi` mocked (`tests/unit/biblioteca-acciones-servidor.test.ts`); lib actions against the local database with `clienteDeConi()` / `clienteDelMantenedor()` and `pool` (`tests/integration/acciones-biblioteca.test.ts`). MSW blocks every unhandled request in unit tests, so `subirArchivos` gets its `enviar` injected or is mocked.
- **F11. Commands:** unit `pnpm exec vitest run <file>`, all unit `pnpm test:run`, integration `pnpm test:db <file>`, E2E phone `pnpm exec playwright test <file>`, desktop `pnpm exec playwright test --project escritorio <file>`, gate `pnpm lint`, `pnpm type`, `pnpm build`, `pnpm test:run`, `pnpm test:db`, `pnpm test:e2e`.

## Decisions taken while planning (not in the spec)

- **D1. Two layers, as batch 1 (its D1).** The spec says the actions live in `lib/acciones/biblioteca.ts` "through `conSesionDeConi` with Zod": the plain actions go there (deps injected, `es_coni` inside, callable as WAV from the integration tests) and the `"use server"` wrappers in `app/(app)/biblioteca/acciones.ts`. `crearMaterialAccion` takes `z.unknown()` and lets `leerEntrada` answer in Coni's words (as `editarFichaAccion` does); confirm and discard take `SobreMaterial`.
- **D2. `DepsSubir`** = `{ db, almacen: Pick<Almacen, "urlDeSubida" | "tamano">, disparar: Pick<DisparosDeBiblioteca, "material">, nuevoId, ahora }` (F5). The wrapper resolves R2 on use, like batch 1.
- **D3. A store that cannot be measured** at confirm (R2 down) leaves the material with a reason (`marcar_disparo_fallido`), like a run that cannot start, and says "El material quedó guardado, pero no pude iniciar su procesamiento. Toca Reintentar en un rato." Ingesta left it `procesando` with no reason, polling forever with no Reintentar.
- **D4. One field, two ways in.** The field is a textarea ("Pega un enlace o elige un archivo") plus "Elegir archivo" (a native input with `hidden`, opened by a `Boton`). Picking files clears the text; typing clears the files; either clears a manual type. When files are there, they decide the type; images picked again join the ones already there (up to 20), anything else replaces them. A post's optional video has its own "Elegir video".
- **D5. Domain files:** `youtube.ts` (`esYoutube`, `esPodcast`, the two hints), `subir.ts` (limits, extensions, content types, `leerEntrada`, `detectarTipo`, `tipoEfectivo`, `SubidaFirmada`), `borrador-de-subida.ts` (`armarEntrada`, `juntarArchivos`, `moverArchivo`, `progresoDeSubida`, the notice and its address). `detectarTipo` and `leerEntrada` stay in `subir.ts` as the spec says.
- **D6. The notice after an upload** travels in the address: the form goes to `/biblioteca?subido=1` and the Materiales page shows `LineaDeEstado tipo="neutro"` "Lo estoy procesando."; `leerFiltros` ignores the parameter, so every filter link drops it.
- **D7. 4h in the rules' words:** "Elige qué papel cumple este material." becomes "Elige quién es para ti."; the role group is the `fieldset` "¿Quién es para ti?" (`PALABRAS.papel`).
- **D8. Confirm and discard act only on her own material** (`subido_por` = whoever is signed in), as Ingesta did; a second confirm of a material no longer `procesando` answers `ok` and starts nothing.
- **D9. Revalidation:** confirm and discard refresh `/biblioteca` (`layout`); create does not (Coni is still on the form, and a refresh there would only re-read the authors).
- **D10. Labels:** the type fact reads `Tipo: <etiqueta>` in one text, then `·` and a quiet "Cambiar" named "Cambiar el tipo"; the six types use `ETIQUETA_DE_TIPO` (a manual "link" reads "Enlace"); detected images read "Imagen" or "N imágenes". The submit button is "Subir"; Cancelar is hidden while uploading (leaving mid-upload would orphan the row).
- **D11. E2E:** a new phone file `tests/e2e/biblioteca-subir.spec.ts` and desktop file `tests/e2e/biblioteca-subir.escritorio.ts`; each test seeds batch 1's scene (`sembrarBiblioteca()`, which also gives the author "Daniela Ruiz, investigadora de confianza"); files are picked through the real button with Playwright's `filechooser`; `objetosDelAlmacen()` joins `tests/e2e/biblioteca-escena.ts`.

## File structure

New (all paths from `CONIDOLLY`):

| File | Responsibility |
|---|---|
| `lib/dominio/biblioteca/youtube.ts` | `esYoutube`, `esPodcast`, `PASOS_DE_YOUTUBE`, `AVISO_DE_PODCAST` |
| `lib/dominio/biblioteca/subir.ts` | limits, extensions per type, `tipoDeContenido`, `extensionDe`, `leerEntrada`, `detectarTipo`, `tipoEfectivo`, `SubidaFirmada`, the field's words |
| `lib/dominio/biblioteca/borrador-de-subida.ts` | `armarEntrada`, `juntarArchivos`, `moverArchivo`, `progresoDeSubida`, `HREF_TRAS_SUBIR`, `AVISO_TRAS_SUBIR`, `vieneDeSubir` |
| `app/(app)/biblioteca/subir/subida-cliente.ts` | `subirArchivos`: one PUT per file, in order |
| `app/(app)/biblioteca/subir/tipo-detectado.tsx` | "Tipo: X · Cambiar" and the six types |
| `app/(app)/biblioteca/subir/lista-de-imagenes.tsx` | thumbnails in order, move and remove |
| `app/(app)/biblioteca/subir/formulario-de-subida.tsx` | the form and the three-step upload |
| `app/(app)/biblioteca/subir/page.tsx` | gate, authors, back link, heading, form |
| `tests/unit/biblioteca-youtube.test.ts`, `biblioteca-subir.test.ts`, `biblioteca-detectar-tipo.test.ts`, `biblioteca-borrador-de-subida.test.ts`, `biblioteca-subida-cliente.test.ts`, `biblioteca-tipo-detectado.test.tsx`, `biblioteca-lista-de-imagenes.test.tsx`, `biblioteca-formulario-de-subida.test.tsx`, `biblioteca-formulario-de-subida-flujo.test.tsx`, `biblioteca-pagina-subir.test.tsx` | unit tests |
| `tests/integration/acciones-subir.test.ts` | the three actions against the local database |
| `tests/e2e/biblioteca-subir.spec.ts`, `tests/e2e/biblioteca-subir.escritorio.ts` | phone and desktop E2E |

Modified: `lib/acciones/biblioteca.ts` (Tasks 6 to 8), `app/(app)/biblioteca/acciones.ts` (Task 9), `app/(app)/biblioteca/page.tsx` (Task 15), `tests/unit/biblioteca-acciones-servidor.test.ts` (Task 9), `tests/unit/biblioteca-pagina-materiales.test.tsx` (Task 15), `tests/e2e/biblioteca-escena.ts` (Task 16), `tests/e2e/visual.spec.ts` and snapshots (Task 20).

Not touched: `components/nav-inferior.tsx`, `app/ir-a-biblioteca/`, `supabase/`, `trigger/`, `lib/proveedores/almacen.ts`, `tests/e2e/almacen-falso*.ts`, `playwright.config.ts`, Ingesta.

## Suggested implementer batches

| Batch | Tasks | Theme |
|---|---|---|
| A | 1, 2, 3, 4, 5 | pure domain and the browser upload |
| B | 6, 7, 8, 9 | actions and server wrappers |
| C | 10, 11, 12, 13, 14, 15 | screens |
| D | 16, 17, 18, 19 | E2E phone and desktop, axe, large text |
| Release | 20, 21 | baselines after Federico looks, full gate |

---

# Part A: domain and the browser upload

### Task 1: YouTube and podcast links

**Files:**
- Create: `lib/dominio/biblioteca/youtube.ts`
- Test: `tests/unit/biblioteca-youtube.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-youtube.test.ts` (Ingesta's `tests/unit/youtube.test.ts`, plus podcasts):

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AVISO_DE_PODCAST, esPodcast, esYoutube, PASOS_DE_YOUTUBE } from "@/lib/dominio/biblioteca/youtube"

describe("esYoutube", () => {
  it.each([
    "https://www.youtube.com/watch?v=abc123",
    "https://youtube.com/watch?v=abc123",
    "https://m.youtube.com/watch?v=abc123",
    "https://music.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://www.youtube-nocookie.com/embed/abc123",
    "HTTPS://WWW.YOUTUBE.COM/watch?v=abc123",
    "  https://youtu.be/abc123  ",
  ])("recognizes %s", (url) => {
    expect(esYoutube(url)).toBe(true)
  })

  it.each([
    "https://notyoutube.com/nota",
    "https://youtube.com.evil.cl/nota",
    "https://ejemplo.cl/?u=https://youtu.be/abc",
    "https://example.com/nota",
    "youtube.com/watch?v=abc123",
    "no es un link",
    "",
  ])("does not treat %s as YouTube", (url) => {
    expect(esYoutube(url)).toBe(false)
  })

  it("explains how to copy the transcript", () => {
    expect(PASOS_DE_YOUTUBE).toContain("Mostrar transcripción")
  })
})

describe("esPodcast", () => {
  it.each([
    "https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk",
    "https://podcasts.apple.com/cl/podcast/x/id123?i=456",
    "  HTTPS://OPEN.SPOTIFY.COM/episode/abc  ",
  ])("recognizes %s", (url) => {
    expect(esPodcast(url)).toBe(true)
  })

  it.each([
    "https://spotify.com/episode/abc",
    "https://open.spotify.com.evil.cl/episode/abc",
    "https://apple.com/podcasts",
    "https://www.youtube.com/watch?v=abc123",
    "no es un link",
  ])("does not treat %s as a podcast", (url) => {
    expect(esPodcast(url)).toBe(false)
  })

  it("says only the episode page is read for now", () => {
    expect(AVISO_DE_PODCAST).toBe("Por ahora leo solo la página del episodio; el audio llega más adelante.")
  })
})

it("writes Coni's copy without an em dash", () => {
  expect(readFileSync(join(__dirname, "../../lib/dominio/biblioteca/youtube.ts"), "utf-8")).not.toContain("\u2014")
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-youtube.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/biblioteca/youtube"`.

- [ ] **Step 3: Write the module.** Create `lib/dominio/biblioteca/youtube.ts`:

```ts
// Ported from Ingesta's lib/ingesta/youtube.ts (change 29b), plus the podcast hosts of the spec.

const ANFITRIONES_DE_YOUTUBE = ["youtube.com", "youtu.be", "youtube-nocookie.com"]
const ANFITRIONES_DE_PODCAST = new Set(["open.spotify.com", "podcasts.apple.com"])

export const PASOS_DE_YOUTUBE =
  "YouTube no deja leer lo que se dice en el video. Ábrelo, toca «…más» y luego «Mostrar transcripción», cópiala y pégala aquí."

export const AVISO_DE_PODCAST = "Por ahora leo solo la página del episodio; el audio llega más adelante."

function anfitrion(direccion: string): string | null {
  try {
    return new URL(direccion.trim()).hostname.toLowerCase()
  } catch {
    // Not an address yet (she is still typing): no host, and the form reports the address itself.
    return null
  }
}

/** Whether a link points to YouTube (any subdomain); third-party video is never fetched, so its transcript is pasted. */
export function esYoutube(direccion: string): boolean {
  const host = anfitrion(direccion)
  if (host === null) return false
  return ANFITRIONES_DE_YOUTUBE.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))
}

/** An episode page of Spotify or Apple Podcasts: only the page is read until the audio arrives (a later batch). */
export function esPodcast(direccion: string): boolean {
  const host = anfitrion(direccion)
  return host !== null && ANFITRIONES_DE_PODCAST.has(host)
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-youtube.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/youtube.ts tests/unit/biblioteca-youtube.test.ts
git add lib/dominio/biblioteca/youtube.ts tests/unit/biblioteca-youtube.test.ts
git commit -m "$(cat <<'EOF'
Recognize YouTube and podcast links for the Biblioteca's upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: the rules of an upload (`leerEntrada`)

**Files:**
- Create: `lib/dominio/biblioteca/subir.ts`
- Test: `tests/unit/biblioteca-subir.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-subir.test.ts` (Ingesta's `tests/unit/modelo-ingesta.test.ts`, with the 4h message and the store's extensions):

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ROLES } from "@/lib/dominio/biblioteca/modelo"
import {
  ACEPTA_TODO,
  ACEPTA_VIDEO,
  EXTENSIONES_POR_TIPO,
  extensionDe,
  leerEntrada,
  MAXIMO_DE_IMAGENES,
  TAMANO_MAXIMO_BYTES,
  tipoDeContenido,
} from "@/lib/dominio/biblioteca/subir"
import { EXTENSIONES_DE_MATERIAL } from "@/lib/proveedores/almacen"

const AUTOR = "11111111-2222-4333-8444-555555555555"
const base = { autorId: AUTOR, rol: "referente", declaracion: true }
const archivo = (nombre: string, tamano = 1000) => ({ nombre, tamano })

function error(entrada: unknown): string {
  const resultado = leerEntrada(entrada)
  if (resultado.ok) throw new Error("Se esperaba un error y la entrada pasó")
  return resultado.error
}

describe("leerEntrada: types with one file", () => {
  it.each([
    ["documento", "tesis.PDF"],
    ["documento", "notas.docx"],
    ["documento", "notas.txt"],
    ["audio", "charla.mp3"],
    ["audio", "charla.m4a"],
    ["audio", "charla.wav"],
    ["video", "clase.mp4"],
    ["video", "clase.mov"],
  ])("accepts one %s file named %s", (tipo, nombre) => {
    expect(leerEntrada({ ...base, tipo, archivos: [archivo(nombre)] }).ok).toBe(true)
  })

  it.each([
    ["documento", "charla.mp3", "Ese archivo no sirve como documento. Sube un PDF, un Word o un texto."],
    ["audio", "tesis.pdf", "Ese archivo no sirve como audio. Sube un mp3, m4a o wav."],
    ["video", "tesis.pdf", "Ese archivo no sirve como video. Sube un mp4 o mov."],
    ["documento", "virus.exe", "Ese archivo no sirve como documento. Sube un PDF, un Word o un texto."],
  ])("refuses a %s file named %s", (tipo, nombre, mensaje) => {
    expect(error({ ...base, tipo, archivos: [archivo(nombre)] })).toBe(mensaje)
  })

  it.each(["documento", "audio", "video"])("needs exactly one file for %s", (tipo) => {
    const nombre = tipo === "documento" ? "a.pdf" : tipo === "audio" ? "a.mp3" : "a.mp4"
    expect(error({ ...base, tipo, archivos: [] })).toBe("Falta el archivo.")
    expect(error({ ...base, tipo, archivos: [archivo(nombre), archivo(nombre)] })).toBe("Sube un solo archivo.")
  })
})

describe("leerEntrada: images", () => {
  it("accepts from one to twenty images", () => {
    expect(leerEntrada({ ...base, tipo: "imagen", archivos: [archivo("a.jpg")] }).ok).toBe(true)
    const veinte = Array.from({ length: MAXIMO_DE_IMAGENES }, (_, i) => archivo(`${i}.png`))
    expect(leerEntrada({ ...base, tipo: "imagen", archivos: veinte }).ok).toBe(true)
  })

  it("refuses twenty one images and none", () => {
    const veintiuna = Array.from({ length: MAXIMO_DE_IMAGENES + 1 }, (_, i) => archivo(`${i}.png`))
    expect(error({ ...base, tipo: "imagen", archivos: veintiuna })).toBe("Puedes subir hasta 20 imágenes.")
    expect(error({ ...base, tipo: "imagen", archivos: [] })).toBe("Falta el archivo.")
  })

  it.each(["a.jpg", "a.jpeg", "a.png", "a.webp", "a.heic"])("accepts %s", (nombre) => {
    expect(leerEntrada({ ...base, tipo: "imagen", archivos: [archivo(nombre)] }).ok).toBe(true)
  })

  it("refuses a file that is not an image", () => {
    expect(error({ ...base, tipo: "imagen", archivos: [archivo("a.gif")] })).toBe(
      "Ese archivo no sirve como imagen. Sube jpg, png, webp o heic.",
    )
  })
})

describe("leerEntrada: link and post", () => {
  it("needs an http or https address for a link and no files", () => {
    expect(leerEntrada({ ...base, tipo: "link", url: "https://example.com/nota", archivos: [] }).ok).toBe(true)
    expect(error({ ...base, tipo: "link", archivos: [] })).toBe("Falta el link.")
    expect(error({ ...base, tipo: "link", url: "javascript:alert(1)", archivos: [] })).toBe(
      "Ese link no parece una dirección web válida.",
    )
    expect(error({ ...base, tipo: "link", url: "https://example.com", archivos: [archivo("a.pdf")] })).toBe(
      "Un link no lleva archivos.",
    )
  })

  it("needs the pasted transcript for a YouTube link and keeps it with the address", () => {
    const youtube = "https://www.youtube.com/watch?v=abc123"
    expect(error({ ...base, tipo: "link", url: youtube, archivos: [] })).toBe("Pega la transcripción del video.")
    expect(error({ ...base, tipo: "link", url: youtube, textoPegado: "   ", archivos: [] })).toBe(
      "Pega la transcripción del video.",
    )
    expect(leerEntrada({ ...base, tipo: "link", url: youtube, textoPegado: " Hola ", archivos: [] })).toMatchObject({
      ok: true,
      datos: { url: youtube, textoPegado: "Hola" },
    })
  })

  it("does not ask for text on other links and drops any it receives", () => {
    expect(
      leerEntrada({ ...base, tipo: "link", url: "https://example.com/nota", textoPegado: "x", archivos: [] }),
    ).toMatchObject({ ok: true, datos: { textoPegado: null } })
  })

  it("needs pasted text for a post and takes an optional video", () => {
    expect(leerEntrada({ ...base, tipo: "post", textoPegado: "Hola", archivos: [] }).ok).toBe(true)
    expect(leerEntrada({ ...base, tipo: "post", textoPegado: "Hola", archivos: [archivo("v.mp4")] }).ok).toBe(true)
    expect(error({ ...base, tipo: "post", textoPegado: "   ", archivos: [] })).toBe("Falta el texto del post.")
    expect(error({ ...base, tipo: "post", textoPegado: "Hola", archivos: [archivo("v.pdf")] })).toBe(
      "Ese archivo no sirve como video. Sube un mp4 o mov.",
    )
  })
})

describe("leerEntrada: the other fields", () => {
  it("trims the title and turns a blank one into null", () => {
    const con = leerEntrada({ ...base, tipo: "documento", titulo: "  Apego adulto ", archivos: [archivo("a.pdf")] })
    const sin = leerEntrada({ ...base, tipo: "documento", titulo: "   ", archivos: [archivo("a.pdf")] })
    expect(con.ok && con.datos.titulo).toBe("Apego adulto")
    expect(sin.ok && sin.datos.titulo).toBeNull()
  })

  it("keeps the reference link only for videos and images, and only if it is a web address", () => {
    const video = leerEntrada({ ...base, tipo: "video", referencia: "https://instagram.com/p/x", archivos: [archivo("a.mp4")] })
    expect(video.ok && video.datos.referencia).toBe("https://instagram.com/p/x")
    const documento = leerEntrada({ ...base, tipo: "documento", referencia: "https://x.cl", archivos: [archivo("a.pdf")] })
    expect(documento.ok && documento.datos.referencia).toBeNull()
    expect(error({ ...base, tipo: "video", referencia: "ftp://x.cl", archivos: [archivo("a.mp4")] })).toBe(
      "Ese link no parece una dirección web válida.",
    )
  })

  it("accepts a file of exactly 2 GB and refuses one byte more or an empty one", () => {
    expect(leerEntrada({ ...base, tipo: "video", archivos: [archivo("a.mp4", TAMANO_MAXIMO_BYTES)] }).ok).toBe(true)
    expect(error({ ...base, tipo: "video", archivos: [archivo("a.mp4", TAMANO_MAXIMO_BYTES + 1)] })).toBe(
      "Ese archivo pesa más de 2 GB.",
    )
    expect(error({ ...base, tipo: "video", archivos: [archivo("a.mp4", 0)] })).toBe("Ese archivo está vacío.")
  })

  it("requires the declaration that there is no patient data", () => {
    expect(error({ ...base, declaracion: false, tipo: "documento", archivos: [archivo("a.pdf")] })).toBe(
      "Marca que el material no contiene datos de pacientes.",
    )
  })

  it("asks for an author, and refuses one that is not an id", () => {
    expect(error({ ...base, autorId: "", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe("Elige el autor.")
    expect(error({ ...base, autorId: "Esther", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe(
      "Elige el autor.",
    )
  })

  it.each(ROLES)("accepts the role %s", (rol) => {
    expect(leerEntrada({ ...base, rol, tipo: "documento", archivos: [archivo("a.pdf")] }).ok).toBe(true)
  })

  it("asks who it is for her in her words (4h), and refuses a role that does not exist", () => {
    expect(error({ ...base, rol: "", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe("Elige quién es para ti.")
    expect(error({ ...base, rol: "jefa", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe(
      "Elige quién es para ti.",
    )
  })

  it("refuses a type that does not exist, and says it did not understand something that is not an object", () => {
    expect(error({ ...base, tipo: "planilla", archivos: [] })).toBe("Elige qué tipo de material es.")
    expect(error(null)).toBe("No entendí esa solicitud. Vuelve a abrir la pantalla.")
  })
})

describe("extensions and content types", () => {
  it("only takes extensions the store signs an upload for", () => {
    for (const extensiones of Object.values(EXTENSIONES_POR_TIPO)) {
      for (const extension of extensiones) expect(EXTENSIONES_DE_MATERIAL.has(extension), extension).toBe(true)
    }
  })

  it("offers every extension it takes in the file picker, and only videos for a post", () => {
    expect(ACEPTA_TODO.split(",").sort()).toEqual(
      Object.values(EXTENSIONES_POR_TIPO)
        .flat()
        .map((extension) => `.${extension}`)
        .sort(),
    )
    expect(ACEPTA_VIDEO).toBe(".mp4,.mov")
  })

  it("reads the extension in lower case, and none when there is no dot", () => {
    expect(extensionDe("Tesis.Final.PDF")).toBe("pdf")
    expect(extensionDe("sin-punto")).toBe("")
  })

  it.each([
    ["pdf", "application/pdf"],
    ["MP3", "audio/mpeg"],
    ["m4a", "audio/mp4"],
    ["wav", "audio/wav"],
    ["mp4", "video/mp4"],
    ["mov", "video/quicktime"],
    ["jpg", "image/jpeg"],
    ["heic", "image/heic"],
    ["txt", "text/plain"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("maps .%s to %s", (extension, esperado) => {
    expect(tipoDeContenido(extension)).toBe(esperado)
  })
})

it("writes Coni's copy without an em dash", () => {
  expect(readFileSync(join(__dirname, "../../lib/dominio/biblioteca/subir.ts"), "utf-8")).not.toContain("\u2014")
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-subir.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/biblioteca/subir"`.

- [ ] **Step 3: Write the module.** Create `lib/dominio/biblioteca/subir.ts`:

```ts
// Ported from Ingesta's lib/ingesta/modelo.ts (leerEntrada, change 29b). The server runs these rules again.
import { z } from "zod"
import { ROLES, TIPOS_DE_MATERIAL, type Rol, type TipoDeMaterial } from "./modelo"
import { esYoutube } from "./youtube"

export const TAMANO_MAXIMO_BYTES = 2 * 1024 ** 3
export const MAXIMO_DE_IMAGENES = 20
const MAXIMO_DE_TEXTO_PEGADO = 200_000

export const ERROR_SOLICITUD = "No entendí esa solicitud. Vuelve a abrir la pantalla."
export const PESA_DEMASIADO = "Ese archivo pesa más de 2 GB."
export const DEMASIADAS_IMAGENES = `Puedes subir hasta ${MAXIMO_DE_IMAGENES} imágenes.`

type TipoConArchivo = "documento" | "audio" | "video" | "imagen"

/** What each type accepts as a file; `claveMaterial` signs only these (EXTENSIONES_DE_MATERIAL). */
export const EXTENSIONES_POR_TIPO: Record<TipoConArchivo, readonly string[]> = {
  documento: ["pdf", "docx", "txt"],
  audio: ["mp3", "m4a", "wav"],
  video: ["mp4", "mov"],
  imagen: ["jpg", "jpeg", "png", "webp", "heic"],
}

const AYUDA_POR_TIPO: Record<TipoConArchivo, string> = {
  documento: "Ese archivo no sirve como documento. Sube un PDF, un Word o un texto.",
  audio: "Ese archivo no sirve como audio. Sube un mp3, m4a o wav.",
  video: "Ese archivo no sirve como video. Sube un mp4 o mov.",
  imagen: "Ese archivo no sirve como imagen. Sube jpg, png, webp o heic.",
}

const extensionesConPunto = (extensiones: readonly string[]) => extensiones.map((ext) => `.${ext}`).join(",")

/** What the main picker offers; the server checks the extension again. */
export const ACEPTA_TODO = extensionesConPunto(Object.values(EXTENSIONES_POR_TIPO).flat())
/** A post's optional video. */
export const ACEPTA_VIDEO = extensionesConPunto(EXTENSIONES_POR_TIPO.video)

const TIPOS_DE_CONTENIDO: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
}

/** The media type the browser must send; it comes from the extension, never from what the browser claims. */
export function tipoDeContenido(extension: string): string {
  return TIPOS_DE_CONTENIDO[extension.toLowerCase()] ?? "application/octet-stream"
}

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".")
  return punto === -1 ? "" : nombre.slice(punto + 1).toLowerCase()
}

/** One presigned PUT: the browser sends the file in `orden` with exactly this content type. */
export interface SubidaFirmada {
  orden: number
  url: string
  tipoContenido: string
}

const direccionWeb = z.string().refine((texto) => {
  try {
    const { protocol } = new URL(texto)
    return protocol === "http:" || protocol === "https:"
  } catch {
    // Not an address at all: the refinement answers with its own message.
    return false
  }
}, "Ese link no parece una dirección web válida.")

const textoOpcional = (maximo: number) =>
  z
    .string()
    .max(maximo, "Ese texto es demasiado largo.")
    .optional()
    .transform((texto) => (texto?.trim() ? texto.trim() : null))

const archivoDeclarado = z.object({
  nombre: z.string().min(1).max(255),
  tamano: z.number().int().min(1, "Ese archivo está vacío.").max(TAMANO_MAXIMO_BYTES, PESA_DEMASIADO),
})

const esquemaBase = z.object({
  tipo: z.enum(TIPOS_DE_MATERIAL, "Elige qué tipo de material es."),
  titulo: textoOpcional(200),
  autorId: z.uuid("Elige el autor."),
  rol: z.enum(ROLES, "Elige quién es para ti."),
  declaracion: z.literal(true, "Marca que el material no contiene datos de pacientes."),
  url: z.string().optional(),
  textoPegado: z.string().max(MAXIMO_DE_TEXTO_PEGADO, "Ese texto es demasiado largo.").optional(),
  referencia: z.string().optional(),
  archivos: z.array(archivoDeclarado),
})

function exigirArchivos(
  entrada: z.infer<typeof esquemaBase>,
  contexto: z.RefinementCtx,
  tipo: TipoConArchivo,
  cantidad: { minimo: number; maximo: number },
) {
  const { archivos } = entrada
  if (archivos.length < cantidad.minimo) {
    contexto.addIssue({ code: "custom", path: ["archivos"], message: "Falta el archivo." })
    return
  }
  if (archivos.length > cantidad.maximo) {
    const mensaje = cantidad.maximo === 1 ? "Sube un solo archivo." : DEMASIADAS_IMAGENES
    contexto.addIssue({ code: "custom", path: ["archivos"], message: mensaje })
    return
  }
  for (const archivo of archivos) {
    if (!EXTENSIONES_POR_TIPO[tipo].includes(extensionDe(archivo.nombre))) {
      contexto.addIssue({ code: "custom", path: ["archivos"], message: AYUDA_POR_TIPO[tipo] })
      return
    }
  }
}

const esquemaDeCreacion = esquemaBase.superRefine((entrada, contexto) => {
  switch (entrada.tipo) {
    case "documento":
    case "audio":
    case "video":
      exigirArchivos(entrada, contexto, entrada.tipo, { minimo: 1, maximo: 1 })
      break
    case "imagen":
      exigirArchivos(entrada, contexto, "imagen", { minimo: 1, maximo: MAXIMO_DE_IMAGENES })
      break
    case "link":
      if (!entrada.url?.trim()) contexto.addIssue({ code: "custom", path: ["url"], message: "Falta el link." })
      else if (!direccionWeb.safeParse(entrada.url.trim()).success) {
        contexto.addIssue({ code: "custom", path: ["url"], message: "Ese link no parece una dirección web válida." })
      } else if (esYoutube(entrada.url) && !entrada.textoPegado?.trim()) {
        contexto.addIssue({ code: "custom", path: ["textoPegado"], message: "Pega la transcripción del video." })
      }
      if (entrada.archivos.length > 0) {
        contexto.addIssue({ code: "custom", path: ["archivos"], message: "Un link no lleva archivos." })
      }
      break
    case "post":
      if (!entrada.textoPegado?.trim()) {
        contexto.addIssue({ code: "custom", path: ["textoPegado"], message: "Falta el texto del post." })
      }
      exigirArchivos(entrada, contexto, "video", { minimo: 0, maximo: 1 })
      break
  }
  const referencia = entrada.referencia?.trim()
  if ((entrada.tipo === "video" || entrada.tipo === "imagen") && referencia && !direccionWeb.safeParse(referencia).success) {
    contexto.addIssue({ code: "custom", path: ["referencia"], message: "Ese link no parece una dirección web válida." })
  }
})

export interface DatosDeCreacion {
  tipo: TipoDeMaterial
  titulo: string | null
  autorId: string
  rol: Rol
  url: string | null
  textoPegado: string | null
  /** A reference only for videos and images: it is stored and never fetched. */
  referencia: string | null
  archivos: { nombre: string; tamano: number }[]
}

export type EntradaLeida = { ok: true; datos: DatosDeCreacion } | { ok: false; error: string }

/** Pasted text is kept for a post and for the transcript of a YouTube link; any other link is opened by the task. */
function textoQueSeGuarda(datos: { tipo: TipoDeMaterial; url?: string; textoPegado?: string }): string | null {
  const guardaTexto = datos.tipo === "post" || (datos.tipo === "link" && esYoutube(datos.url ?? ""))
  return guardaTexto ? (datos.textoPegado?.trim() ?? null) : null
}

/** Validates what the browser sent; the error is the first problem, written for Coni. */
export function leerEntrada(entrada: unknown): EntradaLeida {
  // A problem nobody wrote a message for (a number where text goes) is a request this screen never sends.
  const resultado = esquemaDeCreacion.safeParse(entrada, { error: () => ERROR_SOLICITUD })
  if (!resultado.success) return { ok: false, error: resultado.error.issues[0]?.message ?? ERROR_SOLICITUD }
  const { declaracion: _declaracion, ...datos } = resultado.data
  const conReferencia = datos.tipo === "video" || datos.tipo === "imagen"
  return {
    ok: true,
    datos: {
      ...datos,
      url: datos.tipo === "link" ? (datos.url?.trim() ?? null) : null,
      textoPegado: textoQueSeGuarda(datos),
      referencia: conReferencia ? datos.referencia?.trim() || null : null,
    },
  }
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-subir.test.ts && pnpm type`
Expected: PASS, and `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/subir.ts tests/unit/biblioteca-subir.test.ts
git add lib/dominio/biblioteca/subir.ts tests/unit/biblioteca-subir.test.ts
git commit -m "$(cat <<'EOF'
Port the upload rules of a material from Ingesta, in Coni's words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: detect the type from what was pasted or picked (4k)

**Files:**
- Modify: `lib/dominio/biblioteca/subir.ts`
- Test: `tests/unit/biblioteca-detectar-tipo.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-detectar-tipo.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  AYUDA_DEL_CAMPO,
  detectarTipo,
  FALTA_LA_ENTRADA,
  NO_RECONOZCO,
  tipoEfectivo,
} from "@/lib/dominio/biblioteca/subir"

const archivos = (...nombres: string[]) => nombres.map((name) => ({ name }))
const conTexto = (texto: string) => detectarTipo({ texto, archivos: [] })
const conArchivos = (...nombres: string[]) => detectarTipo({ texto: "", archivos: archivos(...nombres) })

describe("detectarTipo: links and text", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123", "Video de YouTube"],
    ["https://youtu.be/abc123", "Video de YouTube"],
    ["https://m.youtube.com/watch?v=abc123", "Video de YouTube"],
    ["https://www.youtube-nocookie.com/embed/abc123", "Video de YouTube"],
    ["https://open.spotify.com/episode/abc", "Podcast"],
    ["https://podcasts.apple.com/cl/podcast/x/id1?i=2", "Podcast"],
    ["https://ejemplo.cl/nota", "Enlace"],
    ["http://ejemplo.cl/nota", "Enlace"],
  ])("takes %s as a link (%s)", (texto, etiqueta) => {
    expect(conTexto(texto)).toEqual({ tipo: "link", etiqueta })
  })

  it("trims the spaces around a pasted link", () => {
    expect(conTexto("   https://youtu.be/abc123 \n")).toEqual({ tipo: "link", etiqueta: "Video de YouTube" })
  })

  it.each([
    "Hoy quiero hablar de la carga mental.",
    "mira esto https://ejemplo.cl/nota",
    "https://ejemplo.cl/una nota con espacios",
    "ejemplo.cl/nota",
    "ftp://ejemplo.cl/archivo",
  ])("takes pasted text that is not a link as a post: %s", (texto) => {
    expect(conTexto(texto)).toEqual({ tipo: "post", etiqueta: "Texto" })
  })

  it("detects nothing when the field is empty or only spaces", () => {
    expect(conTexto("")).toBeNull()
    expect(conTexto("  \n ")).toBeNull()
  })
})

describe("detectarTipo: files", () => {
  it.each([
    ["tesis.pdf", "documento", "Documento"],
    ["notas.DOCX", "documento", "Documento"],
    ["notas.txt", "documento", "Documento"],
    ["charla.MP3", "audio", "Audio"],
    ["charla.m4a", "audio", "Audio"],
    ["charla.wav", "audio", "Audio"],
    ["clase.mp4", "video", "Video"],
    ["clase.MOV", "video", "Video"],
    ["foto.jpg", "imagen", "Imagen"],
    ["foto.JPEG", "imagen", "Imagen"],
    ["foto.png", "imagen", "Imagen"],
    ["foto.webp", "imagen", "Imagen"],
    ["foto.heic", "imagen", "Imagen"],
  ])("takes %s as %s", (nombre, tipo, etiqueta) => {
    expect(conArchivos(nombre)).toEqual({ tipo, etiqueta })
  })

  it("counts several images", () => {
    expect(conArchivos("a.jpg", "b.PNG", "c.heic")).toEqual({ tipo: "imagen", etiqueta: "3 imágenes" })
  })

  it("lets the files decide when there are files, whatever the text says", () => {
    expect(detectarTipo({ texto: "https://youtu.be/abc", archivos: archivos("tesis.pdf") })).toEqual({
      tipo: "documento",
      etiqueta: "Documento",
    })
  })

  it.each([["planilla.xlsx"], ["animacion.gif"], ["sin-extension"]])("detects nothing for %s", (nombre) => {
    expect(conArchivos(nombre)).toBeNull()
  })

  it("detects nothing for two files that are not all images", () => {
    expect(conArchivos("a.pdf", "b.pdf")).toBeNull()
    expect(conArchivos("a.jpg", "b.pdf")).toBeNull()
  })
})

describe("tipoEfectivo", () => {
  it("is what was detected while she has not chosen", () => {
    expect(tipoEfectivo({ tipo: "link", etiqueta: "Video de YouTube" }, null)).toEqual({
      tipo: "link",
      etiqueta: "Video de YouTube",
    })
    expect(tipoEfectivo(null, null)).toBeNull()
  })

  it("is her choice when she chose one, in the words of the six types", () => {
    expect(tipoEfectivo({ tipo: "post", etiqueta: "Texto" }, "documento")).toEqual({
      tipo: "documento",
      etiqueta: "Documento",
    })
    expect(tipoEfectivo(null, "link")).toEqual({ tipo: "link", etiqueta: "Enlace" })
  })
})

describe("the field's words", () => {
  it("say which files it takes, and what is missing", () => {
    expect(AYUDA_DEL_CAMPO).toBe(
      "Sirve un PDF, Word o texto; un audio mp3, m4a o wav; un video mp4 o mov; o hasta 20 imágenes.",
    )
    expect(NO_RECONOZCO).toBe(`No reconozco ese archivo. ${AYUDA_DEL_CAMPO}`)
    expect(FALTA_LA_ENTRADA).toBe("Pega un enlace o elige un archivo.")
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-detectar-tipo.test.ts`
Expected: FAIL, `detectarTipo is not a function` (the other names are `undefined` too).

- [ ] **Step 3: Add detection to the module.** In `lib/dominio/biblioteca/subir.ts`, change the imports at the top to:

```ts
import { z } from "zod"
import { ETIQUETA_DE_TIPO, ROLES, TIPOS_DE_MATERIAL, type Rol, type TipoDeMaterial } from "./modelo"
import { esPodcast, esYoutube } from "./youtube"
```

and append at the end of the file:

```ts
export const AYUDA_DEL_CAMPO =
  "Sirve un PDF, Word o texto; un audio mp3, m4a o wav; un video mp4 o mov; o hasta 20 imágenes."
export const NO_RECONOZCO = `No reconozco ese archivo. ${AYUDA_DEL_CAMPO}`
export const FALTA_LA_ENTRADA = "Pega un enlace o elige un archivo."

/** What the field understood: the material's type and how it is said to her ("Video de YouTube"). */
export interface Deteccion {
  tipo: TipoDeMaterial
  etiqueta: string
}

function tipoDeArchivo(nombre: string): TipoConArchivo | null {
  const extension = extensionDe(nombre)
  const tipos = Object.keys(EXTENSIONES_POR_TIPO) as TipoConArchivo[]
  return tipos.find((tipo) => EXTENSIONES_POR_TIPO[tipo].includes(extension)) ?? null
}

/** A whole pasted address, nothing around it: "mira https://..." is a text she wrote, not a link. */
function esEnlace(texto: string): boolean {
  if (/\s/.test(texto)) return false
  try {
    const { protocol } = new URL(texto)
    return protocol === "http:" || protocol === "https:"
  } catch {
    // Not an address: it is text.
    return false
  }
}

/** The type of what she pasted or picked (spec table, 4k); the files decide when there are files. */
export function detectarTipo(entrada: { texto: string; archivos: readonly { name: string }[] }): Deteccion | null {
  const { archivos } = entrada
  if (archivos.length > 0) {
    const tipos = archivos.map((archivo) => tipoDeArchivo(archivo.name))
    if (tipos.every((tipo) => tipo === "imagen")) {
      return { tipo: "imagen", etiqueta: archivos.length === 1 ? "Imagen" : `${archivos.length} imágenes` }
    }
    const [unico] = tipos
    return tipos.length === 1 && unico ? { tipo: unico, etiqueta: ETIQUETA_DE_TIPO[unico] } : null
  }
  const texto = entrada.texto.trim()
  if (texto === "") return null
  if (!esEnlace(texto)) return { tipo: "post", etiqueta: "Texto" }
  if (esYoutube(texto)) return { tipo: "link", etiqueta: "Video de YouTube" }
  if (esPodcast(texto)) return { tipo: "link", etiqueta: "Podcast" }
  return { tipo: "link", etiqueta: "Enlace" }
}

/** Her choice wins over the detection until the input changes (the form clears `manual` then). */
export function tipoEfectivo(deteccion: Deteccion | null, manual: TipoDeMaterial | null): Deteccion | null {
  return manual ? { tipo: manual, etiqueta: ETIQUETA_DE_TIPO[manual] } : deteccion
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-detectar-tipo.test.ts tests/unit/biblioteca-subir.test.ts && pnpm type`
Expected: PASS, and `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/subir.ts tests/unit/biblioteca-detectar-tipo.test.ts
git add lib/dominio/biblioteca/subir.ts tests/unit/biblioteca-detectar-tipo.test.ts
git commit -m "$(cat <<'EOF'
Detect a material's type from the pasted link or text or the picked files (4k)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: what the form derives (entry, files, order, progress, notice)

**Files:**
- Create: `lib/dominio/biblioteca/borrador-de-subida.ts`
- Test: `tests/unit/biblioteca-borrador-de-subida.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-borrador-de-subida.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  armarEntrada,
  AVISO_TRAS_SUBIR,
  type Borrador,
  GUARDANDO,
  HREF_TRAS_SUBIR,
  juntarArchivos,
  moverArchivo,
  PREPARANDO,
  progresoDeSubida,
  RUTA_DE_SUBIR,
  vieneDeSubir,
} from "@/lib/dominio/biblioteca/borrador-de-subida"
import { leerEntrada, TAMANO_MAXIMO_BYTES } from "@/lib/dominio/biblioteca/subir"

const AUTOR = "11111111-2222-4333-8444-555555555555"
const archivo = (name: string, size = 10) => ({ name, size })

const borrador = (extra: Partial<Borrador<{ name: string; size: number }>>): Borrador<{ name: string; size: number }> => ({
  tipo: "documento",
  texto: "",
  archivos: [],
  videoDelPost: null,
  transcripcion: "",
  referencia: "",
  titulo: "",
  autorId: AUTOR,
  rol: "referente",
  declaracion: true,
  ...extra,
})

describe("armarEntrada", () => {
  it("sends a document's file and nothing pasted", () => {
    const pdf = archivo("tesis.pdf", 500)
    const { entrada, aSubir } = armarEntrada(borrador({ tipo: "documento", archivos: [pdf], referencia: "https://x.cl" }))
    expect(aSubir).toEqual([pdf])
    expect(entrada).toEqual({
      tipo: "documento",
      titulo: "",
      autorId: AUTOR,
      rol: "referente",
      declaracion: true,
      url: "",
      textoPegado: "",
      referencia: "",
      archivos: [{ nombre: "tesis.pdf", tamano: 500 }],
    })
    expect(leerEntrada(entrada).ok).toBe(true)
  })

  it("sends a YouTube link with its transcript, and another link without the transcript", () => {
    const youtube = armarEntrada(
      borrador({ tipo: "link", texto: "  https://youtu.be/abc  ", transcripcion: "Hola a todos" }),
    )
    expect(youtube.entrada).toMatchObject({ url: "https://youtu.be/abc", textoPegado: "Hola a todos", archivos: [] })
    expect(youtube.aSubir).toEqual([])
    const otro = armarEntrada(borrador({ tipo: "link", texto: "https://ejemplo.cl/nota", transcripcion: "x" }))
    expect(otro.entrada).toMatchObject({ url: "https://ejemplo.cl/nota", textoPegado: "" })
  })

  it("sends a post's text with its optional video, never the main files", () => {
    const video = archivo("clase.mp4", 99)
    const { entrada, aSubir } = armarEntrada(
      borrador({ tipo: "post", texto: "Mi texto", archivos: [archivo("a.pdf")], videoDelPost: video }),
    )
    expect(entrada).toMatchObject({ textoPegado: "Mi texto", archivos: [{ nombre: "clase.mp4", tamano: 99 }] })
    expect(aSubir).toEqual([video])
  })

  it("keeps the reference link only for a video or images", () => {
    const imagenes = [archivo("a.jpg"), archivo("b.png")]
    const conReferencia = armarEntrada(borrador({ tipo: "imagen", archivos: imagenes, referencia: "https://ig.cl/p" }))
    expect(conReferencia.entrada).toMatchObject({ referencia: "https://ig.cl/p" })
    expect(conReferencia.aSubir).toEqual(imagenes)
    expect(armarEntrada(borrador({ tipo: "audio", archivos: [archivo("a.mp3")], referencia: "https://x.cl" })).entrada)
      .toMatchObject({ referencia: "" })
  })
})

describe("juntarArchivos", () => {
  it("replaces what was picked unless both are images", () => {
    expect(juntarArchivos([archivo("a.pdf")], [archivo("b.mp3")])).toEqual({ archivos: [archivo("b.mp3")], error: null })
    expect(juntarArchivos([archivo("a.jpg")], [archivo("b.pdf")])).toEqual({ archivos: [archivo("b.pdf")], error: null })
  })

  it("adds images to the images already there, in the order picked", () => {
    expect(juntarArchivos([archivo("a.jpg")], [archivo("b.png"), archivo("c.heic")]).archivos.map((a) => a.name)).toEqual([
      "a.jpg",
      "b.png",
      "c.heic",
    ])
  })

  it("keeps twenty images and says it takes no more", () => {
    const diecinueve = Array.from({ length: 19 }, (_, i) => archivo(`${i}.jpg`))
    const juntas = juntarArchivos(diecinueve, [archivo("x.jpg"), archivo("y.jpg")])
    expect(juntas.archivos).toHaveLength(20)
    expect(juntas.error).toBe("Puedes subir hasta 20 imágenes.")
  })

  it("drops a file over 2 GB and says so", () => {
    const juntas = juntarArchivos([], [archivo("enorme.mp4", TAMANO_MAXIMO_BYTES + 1)])
    expect(juntas).toEqual({ archivos: [], error: "Ese archivo pesa más de 2 GB." })
  })
})

describe("moverArchivo", () => {
  const lista = ["a", "b", "c"]

  it("moves one place before or after", () => {
    expect(moverArchivo(lista, 2, -1)).toEqual(["a", "c", "b"])
    expect(moverArchivo(lista, 0, 1)).toEqual(["b", "a", "c"])
  })

  it("leaves the list as it was past either end, without changing the one it got", () => {
    expect(moverArchivo(lista, 0, -1)).toEqual(lista)
    expect(moverArchivo(lista, 2, 1)).toEqual(lista)
    expect(lista).toEqual(["a", "b", "c"])
  })
})

describe("progresoDeSubida", () => {
  it("says which file is going up, and saving when there is none", () => {
    expect(progresoDeSubida(0, 3)).toBe("Subiendo 1 de 3")
    expect(progresoDeSubida(2, 3)).toBe("Subiendo 3 de 3")
    expect(progresoDeSubida(3, 3)).toBe("Subiendo 3 de 3")
    expect(progresoDeSubida(0, 0)).toBe(GUARDANDO)
    expect([PREPARANDO, GUARDANDO]).toEqual(["Preparando…", "Guardando…"])
  })
})

describe("after the upload", () => {
  it("goes to the list with the notice, and the list knows it came from Subir", () => {
    expect(RUTA_DE_SUBIR).toBe("/biblioteca/subir")
    expect(HREF_TRAS_SUBIR).toBe("/biblioteca?subido=1")
    expect(AVISO_TRAS_SUBIR).toBe("Lo estoy procesando.")
    expect(vieneDeSubir({ subido: "1" })).toBe(true)
    expect(vieneDeSubir({ subido: ["1", "x"] })).toBe(true)
    expect(vieneDeSubir({})).toBe(false)
    expect(vieneDeSubir({ subido: "0" })).toBe(false)
  })
})

it("writes Coni's copy without an em dash", () => {
  const ruta = join(__dirname, "../../lib/dominio/biblioteca/borrador-de-subida.ts")
  expect(readFileSync(ruta, "utf-8")).not.toContain("\u2014")
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-borrador-de-subida.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/biblioteca/borrador-de-subida"`.

- [ ] **Step 3: Write the module.** Create `lib/dominio/biblioteca/borrador-de-subida.ts`:

```ts
import type { Rol, TipoDeMaterial } from "./modelo"
import { DEMASIADAS_IMAGENES, EXTENSIONES_POR_TIPO, extensionDe, MAXIMO_DE_IMAGENES, PESA_DEMASIADO, TAMANO_MAXIMO_BYTES } from "./subir"
import { esYoutube } from "./youtube"

export const RUTA_DE_SUBIR = "/biblioteca/subir"
/** The list reads `subido=1` and says the notice; every filter link drops it (D6). */
export const HREF_TRAS_SUBIR = "/biblioteca?subido=1"
export const AVISO_TRAS_SUBIR = "Lo estoy procesando."
export const PREPARANDO = "Preparando…"
export const GUARDANDO = "Guardando…"

/** A picked file as the form sees it: a `File` in the browser, a plain object in tests. */
export interface ArchivoElegido {
  name: string
  size: number
}

/** Everything the form holds, before it becomes the entry `leerEntrada` reads. */
export interface Borrador<A extends ArchivoElegido> {
  tipo: TipoDeMaterial
  /** The main field: a link, or a post's text. */
  texto: string
  archivos: readonly A[]
  videoDelPost: A | null
  transcripcion: string
  referencia: string
  titulo: string
  autorId: string
  rol: Rol | ""
  declaracion: boolean
}

/** The shape `leerEntrada` reads; the server receives exactly this. */
export interface EntradaDeSubida {
  tipo: TipoDeMaterial
  titulo: string
  autorId: string
  rol: Rol | ""
  declaracion: boolean
  url: string
  textoPegado: string
  referencia: string
  archivos: { nombre: string; tamano: number }[]
}

/** Only what the type uses is sent; `aSubir` is in the order of the signed uploads. */
export function armarEntrada<A extends ArchivoElegido>(borrador: Borrador<A>): { entrada: EntradaDeSubida; aSubir: A[] } {
  const { tipo } = borrador
  const aSubir =
    tipo === "post" ? (borrador.videoDelPost ? [borrador.videoDelPost] : []) : tipo === "link" ? [] : [...borrador.archivos]
  const url = tipo === "link" ? borrador.texto.trim() : ""
  const textoPegado = tipo === "post" ? borrador.texto : tipo === "link" && esYoutube(url) ? borrador.transcripcion : ""
  return {
    entrada: {
      tipo,
      titulo: borrador.titulo,
      autorId: borrador.autorId,
      rol: borrador.rol,
      declaracion: borrador.declaracion,
      url,
      textoPegado,
      referencia: tipo === "video" || tipo === "imagen" ? borrador.referencia : "",
      archivos: aSubir.map((archivo) => ({ nombre: archivo.name, tamano: archivo.size })),
    },
    aSubir,
  }
}

const sonImagenes = (archivos: readonly ArchivoElegido[]) =>
  archivos.length > 0 && archivos.every((archivo) => EXTENSIONES_POR_TIPO.imagen.includes(extensionDe(archivo.name)))

/** Images picked again join the ones there (up to 20); anything else replaces them. A file over 2 GB never enters. */
export function juntarArchivos<A extends ArchivoElegido>(
  actuales: readonly A[],
  elegidos: readonly A[],
): { archivos: A[]; error: string | null } {
  const caben = elegidos.filter((archivo) => archivo.size <= TAMANO_MAXIMO_BYTES)
  const error = caben.length < elegidos.length ? PESA_DEMASIADO : null
  const juntos = sonImagenes(actuales) && sonImagenes(caben) ? [...actuales, ...caben] : caben
  if (juntos.length > MAXIMO_DE_IMAGENES && sonImagenes(juntos)) {
    return { archivos: juntos.slice(0, MAXIMO_DE_IMAGENES), error: DEMASIADAS_IMAGENES }
  }
  return { archivos: juntos, error }
}

/** The images keep the order she gives them: that order is `orden` 1..20 in the store. */
export function moverArchivo<T>(lista: readonly T[], indice: number, hacia: -1 | 1): T[] {
  const destino = indice + hacia
  const copia = [...lista]
  if (destino < 0 || destino >= lista.length) return copia
  const [movido] = copia.splice(indice, 1)
  if (movido !== undefined) copia.splice(destino, 0, movido)
  return copia
}

export function progresoDeSubida(hechos: number, total: number): string {
  return total === 0 ? GUARDANDO : `Subiendo ${Math.min(hechos + 1, total)} de ${total}`
}

export function vieneDeSubir(params: Record<string, string | string[] | undefined>): boolean {
  const valor = params.subido
  return (Array.isArray(valor) ? valor[0] : valor) === "1"
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-borrador-de-subida.test.ts && pnpm type`
Expected: PASS, and `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/dominio/biblioteca/borrador-de-subida.ts tests/unit/biblioteca-borrador-de-subida.test.ts
git add lib/dominio/biblioteca/borrador-de-subida.ts tests/unit/biblioteca-borrador-de-subida.test.ts
git commit -m "$(cat <<'EOF'
Derive the upload's entry, files, order, progress and notice from the form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: the browser puts each file straight to the store

**Files:**
- Create: `app/(app)/biblioteca/subir/subida-cliente.ts`
- Test: `tests/unit/biblioteca-subida-cliente.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-subida-cliente.test.ts` (Ingesta's `tests/unit/subida-cliente.test.ts`):

```ts
import { describe, expect, it, vi } from "vitest"
import { subirArchivos } from "@/app/(app)/biblioteca/subir/subida-cliente"

const archivo = (nombre: string, tipo: string) => new File(["contenido"], nombre, { type: tipo })

describe("subirArchivos", () => {
  it("puts each file straight to its URL with the content type that was signed, in order", async () => {
    const enviar = vi.fn(async (..._: unknown[]) => new Response(null, { status: 200 }))
    const avances: [number, number][] = []

    await subirArchivos({
      subidas: [
        { orden: 1, url: "https://r2.test/a", tipoContenido: "image/jpeg" },
        { orden: 2, url: "https://r2.test/b", tipoContenido: "image/png" },
      ],
      archivos: [archivo("a.jpg", "image/jpeg"), archivo("b.png", "")],
      enviar,
      alAvanzar: (hechos, total) => avances.push([hechos, total]),
    })

    expect(enviar).toHaveBeenNthCalledWith(1, "https://r2.test/a", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: expect.any(File),
    })
    expect(enviar).toHaveBeenNthCalledWith(
      2,
      "https://r2.test/b",
      expect.objectContaining({ headers: { "Content-Type": "image/png" } }),
    )
    expect(avances).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ])
  })

  it("says which file failed when the store answers with an error, and stops there", async () => {
    const enviar = vi.fn(async (..._: unknown[]) => new Response(null, { status: 403 }))
    await expect(
      subirArchivos({
        subidas: [
          { orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" },
          { orden: 2, url: "https://r2.test/b", tipoContenido: "application/pdf" },
        ],
        archivos: [archivo("tesis.pdf", "application/pdf"), archivo("otra.pdf", "application/pdf")],
        enviar,
      }),
    ).rejects.toThrow("No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo.")
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it("says the same when the network drops", async () => {
    const enviar = vi.fn(async (..._: unknown[]): Promise<Response> => {
      throw new TypeError("Failed to fetch")
    })
    await expect(
      subirArchivos({
        subidas: [{ orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" }],
        archivos: [archivo("tesis.pdf", "application/pdf")],
        enviar,
      }),
    ).rejects.toThrow("No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo.")
  })

  it("refuses to go on when a signed upload has no file", async () => {
    await expect(
      subirArchivos({
        subidas: [{ orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" }],
        archivos: [],
        enviar: vi.fn(),
      }),
    ).rejects.toThrow("Falta el archivo 1 para subirlo.")
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-subida-cliente.test.ts`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/subir/subida-cliente"`.

- [ ] **Step 3: Write the module.** Create `app/(app)/biblioteca/subir/subida-cliente.ts`:

```ts
// Ported from Ingesta's lib/ingesta/subida-cliente.ts. The bytes never pass through a server action.
import type { SubidaFirmada } from "@/lib/dominio/biblioteca/subir"

interface Pedido {
  subidas: SubidaFirmada[]
  /** In the same order as `subidas`. */
  archivos: readonly File[]
  enviar?: typeof fetch
  alAvanzar?: (hechos: number, total: number) => void
}

/** Puts each file straight to the store, one after another, with the content type that was signed into its URL. */
export async function subirArchivos({ subidas, archivos, enviar = fetch, alAvanzar }: Pedido): Promise<void> {
  alAvanzar?.(0, subidas.length)
  for (const [indice, subida] of subidas.entries()) {
    const archivo = archivos[indice]
    if (!archivo) throw new Error(`Falta el archivo ${subida.orden} para subirlo.`)
    const mensaje = `No pude subir ${archivo.name}. Revisa tu conexión e inténtalo de nuevo.`
    let respuesta: Response
    try {
      respuesta = await enviar(subida.url, {
        method: "PUT",
        headers: { "Content-Type": subida.tipoContenido },
        body: archivo,
      })
    } catch (error) {
      throw new Error(mensaje, { cause: error })
    }
    if (!respuesta.ok) throw new Error(mensaje)
    alAvanzar?.(indice + 1, subidas.length)
  }
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-subida-cliente.test.ts && pnpm type`
Expected: PASS, and `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/subir/subida-cliente.ts" tests/unit/biblioteca-subida-cliente.test.ts
git add "app/(app)/biblioteca/subir/subida-cliente.ts" tests/unit/biblioteca-subida-cliente.test.ts
git commit -m "$(cat <<'EOF'
Put each picked file straight to its presigned URL, in order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part B: actions and server wrappers

### Task 6: `crearMaterial`, Coni only

**Files:**
- Modify: `lib/acciones/biblioteca.ts`
- Test: `tests/integration/acciones-subir.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/integration/acciones-subir.test.ts` (Ingesta's `tests/integration/subir.test.ts`, as Coni with Conidolly's helpers):

```ts
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { crearMaterial, type DepsSubir } from "@/lib/acciones/biblioteca"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import { TAMANO_MAXIMO_BYTES } from "@/lib/dominio/biblioteca/subir"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>
type Fila = Record<string, unknown>

const SUFIJO = randomUUID().slice(0, 8)
const AHORA = new Date("2026-11-03T12:00:00.000Z")

let coni: Db
let autor = ""
const creados: string[] = []
const disparos: { materialId: string; intento: string | undefined }[] = []
const almacen = almacenEnMemoria()

function deps(db: Db, extra: Partial<DepsSubir> = {}): DepsSubir {
  return {
    db,
    almacen,
    disparar: {
      async material(materialId, intento) {
        disparos.push({ materialId, intento })
      },
    },
    nuevoId: randomUUID,
    ahora: () => AHORA,
    ...extra,
  }
}

const base = () => ({ autorId: autor, rol: "referente", declaracion: true })

async function crearOk(db: Db, entrada: Record<string, unknown>) {
  const resultado = await crearMaterial(deps(db), { ...base(), ...entrada })
  if (!resultado.ok) throw new Error(`crearMaterial falló: ${resultado.error}`)
  creados.push(resultado.materialId)
  return resultado
}

async function fila(id: string): Promise<Fila | null> {
  const { rows } = await pool.query<Fila>("select * from public.materiales where id = $1", [id])
  return rows[0] ?? null
}

async function cuantosCon(titulo: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from public.materiales where titulo = $1",
    [titulo],
  )
  return rows[0]?.n ?? 0
}

beforeAll(async () => {
  coni = await clienteDeConi()
  autor = await sembrarAutor(`Autora de subir ${SUFIJO}`)
})

afterEach(async () => {
  disparos.length = 0
  vi.restoreAllMocks()
  await pool.query("delete from public.materiales where id = any($1::uuid[])", [creados.splice(0)])
})

afterAll(async () => {
  await borrarSembrado([], [], [autor])
  await pool.end()
})

describe("crearMaterial", () => {
  it("as Coni, creates a procesando row owned by her and gives a signed PUT for the file", async () => {
    const titulo = `Apego adulto ${SUFIJO}`
    const resultado = await crearOk(coni, {
      tipo: "documento",
      titulo,
      rol: "evidencia",
      archivos: [{ nombre: "Tesis.PDF", tamano: 5000 }],
    })

    const material = await fila(resultado.materialId)
    expect(material).toMatchObject({
      tipo: "documento",
      titulo,
      autor_id: autor,
      rol: "evidencia",
      estado: "procesando",
      subido_por: CONI,
      archivo_clave: `materiales/${resultado.materialId}/original.pdf`,
      origen_url: null,
      texto_pegado: null,
    })
    expect(new Date(material?.declaracion_sin_pacientes_en as Date).toISOString()).toBe(AHORA.toISOString())
    expect(resultado.subidas).toEqual([
      {
        orden: 1,
        url: expect.stringContaining(`materiales/${resultado.materialId}/original.pdf`),
        tipoContenido: "application/pdf",
      },
    ])
  })

  it("stores a link as its address and needs no upload", async () => {
    const resultado = await crearOk(coni, { tipo: "link", url: "https://example.com/nota", archivos: [] })
    expect(resultado.subidas).toEqual([])
    expect(await fila(resultado.materialId)).toMatchObject({ origen_url: "https://example.com/nota", archivo_clave: null })
  })

  it("stores a YouTube link with its pasted transcript, and refuses it without one", async () => {
    const youtube = "https://www.youtube.com/watch?v=abc123"
    const creado = await crearOk(coni, { tipo: "link", url: youtube, textoPegado: "Hola a todos", archivos: [] })
    expect(await fila(creado.materialId)).toMatchObject({ origen_url: youtube, texto_pegado: "Hola a todos" })
    expect(await crearMaterial(deps(coni), { ...base(), tipo: "link", url: youtube, archivos: [] })).toEqual({
      ok: false,
      error: "Pega la transcripción del video.",
    })
  })

  it("stores a post as its pasted text, with an optional video", async () => {
    const solo = await crearOk(coni, { tipo: "post", textoPegado: "Un texto largo", archivos: [] })
    const conVideo = await crearOk(coni, {
      tipo: "post",
      textoPegado: "Con video",
      archivos: [{ nombre: "v.mov", tamano: 10 }],
    })
    expect(await fila(solo.materialId)).toMatchObject({ texto_pegado: "Un texto largo", archivo_clave: null })
    expect((await fila(conVideo.materialId))?.archivo_clave).toBe(`materiales/${conVideo.materialId}/original.mov`)
    expect(conVideo.subidas[0]?.tipoContenido).toBe("video/quicktime")
  })

  it("keeps the reference link of a video, which is never fetched", async () => {
    const resultado = await crearOk(coni, {
      tipo: "video",
      referencia: "https://instagram.com/reel/x",
      archivos: [{ nombre: "v.mp4", tamano: 10 }],
    })
    expect(await fila(resultado.materialId)).toMatchObject({ origen_url: "https://instagram.com/reel/x" })
  })

  it("saves each image in order and points archivo_clave at the first", async () => {
    const resultado = await crearOk(coni, {
      tipo: "imagen",
      archivos: [
        { nombre: "a.jpg", tamano: 10 },
        { nombre: "b.PNG", tamano: 10 },
        { nombre: "c.heic", tamano: 10 },
      ],
    })
    const { rows } = await pool.query<{ orden: number; archivo_clave: string }>(
      "select orden, archivo_clave from public.materiales_archivos where material_id = $1 order by orden",
      [resultado.materialId],
    )
    const carpeta = `materiales/${resultado.materialId}/`
    expect(rows).toEqual([
      { orden: 1, archivo_clave: `${carpeta}original-01.jpg` },
      { orden: 2, archivo_clave: `${carpeta}original-02.png` },
      { orden: 3, archivo_clave: `${carpeta}original-03.heic` },
    ])
    expect((await fila(resultado.materialId))?.archivo_clave).toBe(`${carpeta}original-01.jpg`)
    expect(resultado.subidas.map((s) => [s.orden, s.tipoContenido])).toEqual([
      [1, "image/jpeg"],
      [2, "image/png"],
      [3, "image/heic"],
    ])
  })

  it("refuses an entry that breaks a rule before touching the database", async () => {
    expect(await crearMaterial(deps(coni), { ...base(), tipo: "documento", archivos: [] })).toEqual({
      ok: false,
      error: "Falta el archivo.",
    })
    expect(
      await crearMaterial(deps(coni), {
        ...base(),
        tipo: "video",
        archivos: [{ nombre: "clase.mp4", tamano: TAMANO_MAXIMO_BYTES + 1 }],
      }),
    ).toEqual({ ok: false, error: "Ese archivo pesa más de 2 GB." })
  })

  it("says the author is gone when it does not exist anymore", async () => {
    expect(
      await crearMaterial(deps(coni), {
        ...base(),
        autorId: randomUUID(),
        tipo: "link",
        url: "https://example.com/otra",
        archivos: [],
      }),
    ).toEqual({ ok: false, error: "Ese autor ya no existe. Elígelo de nuevo." })
  })

  it("deletes the row when the upload cannot be signed, and answers the generic notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const titulo = `Sin firma ${SUFIJO}`
    const sinFirma = deps(coni, {
      almacen: {
        ...almacen,
        urlDeSubida: async () => {
          throw new Error("R2 caído")
        },
      },
    })
    const resultado = await crearMaterial(sinFirma, {
      ...base(),
      titulo,
      tipo: "documento",
      archivos: [{ nombre: "a.pdf", tamano: 4 }],
    })
    expect(resultado).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(await cuantosCon(titulo)).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm test:db tests/integration/acciones-subir.test.ts`
Expected: FAIL, `crearMaterial is not a function` (the import resolves to `undefined`), and `tsc` would say `Module '"@/lib/acciones/biblioteca"' has no exported member 'crearMaterial'`.

- [ ] **Step 3: Write the action.** In `lib/acciones/biblioteca.ts`, replace the line `import type { Almacen } from "@/lib/proveedores/almacen"` with:

```ts
import { extensionDe, leerEntrada, type SubidaFirmada, tipoDeContenido } from "@/lib/dominio/biblioteca/subir"
import { type Almacen, claveMaterial } from "@/lib/proveedores/almacen"
```

Append at the end of the file:

```ts
/** Uploading a material (batch 2). Its id is new and a UUID: its files' keys live in its own folder. */
export interface DepsSubir {
  /** Coni's client: row level security applies, and `es_coni` is checked again here. */
  db: Db
  almacen: Pick<Almacen, "urlDeSubida" | "tamano">
  disparar: Pick<DisparosDeBiblioteca, "material">
  nuevoId: () => string
  ahora: () => Date
}

/** A browser upload link only has to outlast one upload. */
const UNA_HORA_S = 60 * 60

async function borrarMaterial(db: Db, materialId: string): Promise<void> {
  const { error } = await db.from("materiales").delete().eq("id", materialId)
  // The caller answers with the failure that led here; a row left behind is for WAV to find in the log.
  if (error) console.error(`No pude borrar el material ${materialId}`, error)
}

/**
 * Creates the row of a material as Coni and signs one PUT per file. The row goes first: nothing is uploaded for a
 * material the database refused, and a failure after it deletes the row.
 */
export function crearMaterial(
  deps: DepsSubir,
  entrada: unknown,
): Promise<Resultado<{ materialId: string; subidas: SubidaFirmada[] }>> {
  return aResultado("crearMaterial", async () => {
    await exigirConi(deps.db)
    const leida = leerEntrada(entrada)
    if (!leida.ok) throw new Falla(leida.error)
    const { datos } = leida

    const materialId = deps.nuevoId()
    const claves = datos.archivos.map((archivo, indice) =>
      claveMaterial(materialId, extensionDe(archivo.nombre), datos.tipo === "imagen" ? indice + 1 : undefined),
    )
    const { error } = await deps.db.from("materiales").insert({
      id: materialId,
      tipo: datos.tipo,
      titulo: datos.titulo,
      autor_id: datos.autorId,
      rol: datos.rol,
      origen_url: datos.url ?? datos.referencia,
      archivo_clave: claves[0] ?? null,
      texto_pegado: datos.textoPegado,
      declaracion_sin_pacientes_en: deps.ahora().toISOString(),
    })
    if (error) {
      if (error.code === CLAVE_FORANEA) throw new Falla("Ese autor ya no existe. Elígelo de nuevo.")
      throw new Error(`No pude crear el material: ${error.message}`, { cause: error })
    }

    if (datos.tipo === "imagen") {
      const { error: errorDeArchivos } = await deps.db
        .from("materiales_archivos")
        .insert(claves.map((clave, indice) => ({ material_id: materialId, orden: indice + 1, archivo_clave: clave })))
      if (errorDeArchivos) {
        await borrarMaterial(deps.db, materialId)
        throw new Error(`No pude guardar las imágenes del material ${materialId}: ${errorDeArchivos.message}`, {
          cause: errorDeArchivos,
        })
      }
    }

    let subidas: SubidaFirmada[]
    try {
      subidas = await Promise.all(
        claves.map(async (clave, indice) => {
          const tipoContenido = tipoDeContenido(extensionDe(clave))
          return { orden: indice + 1, url: await deps.almacen.urlDeSubida(clave, UNA_HORA_S, tipoContenido), tipoContenido }
        }),
      )
    } catch (error) {
      await borrarMaterial(deps.db, materialId)
      throw new Error(`No pude firmar la subida del material ${materialId}`, { cause: error })
    }
    return { materialId, subidas }
  })
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm test:db tests/integration/acciones-subir.test.ts && pnpm test:db tests/integration/acciones-biblioteca.test.ts && pnpm type`
Expected: PASS (10 tests in the new file; batch 1's actions unchanged), and `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/acciones/biblioteca.ts tests/integration/acciones-subir.test.ts
git add lib/acciones/biblioteca.ts tests/integration/acciones-subir.test.ts
git commit -m "$(cat <<'EOF'
Create a material as Coni and sign the upload of each of its files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 7: `confirmarMaterial` checks every file, then starts the run

**Files:**
- Modify: `lib/acciones/biblioteca.ts`
- Test: `tests/integration/acciones-subir.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/integration/acciones-subir.test.ts`, change the import of `@/lib/acciones/biblioteca` to `import { confirmarMaterial, crearMaterial, type DepsSubir } from "@/lib/acciones/biblioteca"`, add under the constants:

```ts
const GUARDADO_SIN_INICIAR =
  "El material quedó guardado, pero no pude iniciar su procesamiento. Toca Reintentar en un rato."
const FALTA_EL_ARCHIVO = "No encontré el archivo que subiste. Inténtalo de nuevo."
```

and append:

```ts
describe("confirmarMaterial", () => {
  it("starts the run once the file is in the store, with the material's own key", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([1, 2, 3, 4]))

    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(disparos).toEqual([{ materialId: creado.materialId, intento: undefined }])
  })

  it("starts a link right away: there is no file to wait for", async () => {
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/z", archivos: [] })
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(disparos).toEqual([{ materialId: creado.materialId, intento: undefined }])
  })

  it("needs every image of the material, and deletes it when one is missing", async () => {
    const creado = await crearOk(coni, {
      tipo: "imagen",
      archivos: [
        { nombre: "a.jpg", tamano: 1 },
        { nombre: "b.jpg", tamano: 1 },
      ],
    })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([1]))

    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: false, error: FALTA_EL_ARCHIVO })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toBeNull()
  })

  it("deletes the material and starts nothing when the file never arrived", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: false, error: FALTA_EL_ARCHIVO })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toBeNull()
  })

  it("deletes the material when the file in the store is empty", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([]))
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: false, error: FALTA_EL_ARCHIVO })
    expect(await fila(creado.materialId)).toBeNull()
  })

  it("deletes the material when the object in the store is over 2 GB, whatever was declared", async () => {
    const creado = await crearOk(coni, { tipo: "video", archivos: [{ nombre: "a.mp4", tamano: 10 }] })
    const enorme = deps(coni, { almacen: { ...almacen, tamano: async () => TAMANO_MAXIMO_BYTES + 1 } })

    expect(await confirmarMaterial(enorme, creado.materialId)).toEqual({
      ok: false,
      error: "Ese archivo pesa más de 2 GB.",
    })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toBeNull()
  })

  it("answers ok and starts nothing for a material that is not procesando anymore (a second tap)", async () => {
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/w", archivos: [] })
    await pool.query("update public.materiales set estado = 'listo' where id = $1", [creado.materialId])
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(disparos).toEqual([])
  })

  it("leaves the material retryable and says it was saved when the run cannot start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/caido", archivos: [] })
    const caido = deps(coni, {
      disparar: {
        material: async () => {
          throw new Error("Trigger caído")
        },
      },
    })

    expect(await confirmarMaterial(caido, creado.materialId)).toEqual({ ok: false, error: GUARDADO_SIN_INICIAR })
    expect(await fila(creado.materialId)).toMatchObject({
      estado: "procesando",
      motivo_fallo: "No pude iniciar el procesamiento. Reintenta.",
    })
  })

  it("does the same when the store cannot say whether the file is there (D3)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    const mudo = deps(coni, {
      almacen: {
        ...almacen,
        tamano: async () => {
          throw new Error("R2 caído")
        },
      },
    })

    expect(await confirmarMaterial(mudo, creado.materialId)).toEqual({ ok: false, error: GUARDADO_SIN_INICIAR })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toMatchObject({
      estado: "procesando",
      motivo_fallo: "No pude iniciar el procesamiento. Reintenta.",
    })
  })

  it("says it did not find a material that does not exist", async () => {
    expect(await confirmarMaterial(deps(coni), randomUUID())).toEqual({ ok: false, error: "No encontré ese material." })
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm test:db tests/integration/acciones-subir.test.ts`
Expected: FAIL in the new block, `confirmarMaterial is not a function`.

- [ ] **Step 3: Write the action.** In `lib/acciones/biblioteca.ts`, extend the import of `@/lib/dominio/biblioteca/subir` to `import { extensionDe, leerEntrada, PESA_DEMASIADO, type SubidaFirmada, TAMANO_MAXIMO_BYTES, tipoDeContenido } from "@/lib/dominio/biblioteca/subir"`, then append:

```ts
const FALTA_EL_ARCHIVO = "No encontré el archivo que subiste. Inténtalo de nuevo."
const GUARDADO_SIN_INICIAR =
  "El material quedó guardado, pero no pude iniciar su procesamiento. Toca Reintentar en un rato."

/** Whoever is signed in: a material is only ever confirmed or thrown away by the one who uploaded it (D8). */
async function idDeQuienEntro(db: Db): Promise<string> {
  const { data, error } = await db.auth.getUser()
  if (error) throw new Error(`No pude leer quién entró: ${error.message}`, { cause: error })
  if (!data.user) throw new Error("No hay nadie con la sesión abierta")
  return data.user.id
}

/** The keys of the files of a material, in order: the images of `materiales_archivos`, or its single file. */
async function clavesDelMaterial(db: Db, materialId: string, archivoClave: string | null): Promise<string[]> {
  const { data, error } = await db
    .from("materiales_archivos")
    .select("orden, archivo_clave")
    .eq("material_id", materialId)
    .order("orden")
  if (error) throw new Error(`No pude leer los archivos del material ${materialId}: ${error.message}`, { cause: error })
  if (data.length > 0) return data.map((archivo) => archivo.archivo_clave)
  return archivoClave ? [archivoClave] : []
}

/** Every file's size, or `undefined` when the store could not answer (logged for WAV). */
async function medirArchivos(
  almacen: DepsSubir["almacen"],
  materialId: string,
  claves: string[],
): Promise<(number | null)[] | undefined> {
  try {
    const tamanos: (number | null)[] = []
    for (const clave of claves) tamanos.push(await almacen.tamano(clave))
    return tamanos
  } catch (error) {
    console.error(`No pude revisar los archivos del material ${materialId}`, error)
    return undefined
  }
}

/** A material that cannot start now gets a reason, so the list offers Reintentar instead of waiting for ever (D3). */
async function dejarParaReintentar(db: Db, materialId: string): Promise<never> {
  const { error } = await db.rpc("marcar_disparo_fallido", { p_id: materialId })
  if (error) console.error(`El material ${materialId} quedó procesando sin motivo: no pude marcarlo`, error)
  throw new Falla(GUARDADO_SIN_INICIAR)
}

/** Checks that every file arrived and fits, then starts the run. A material whose file is wrong is deleted. */
export function confirmarMaterial(deps: DepsSubir, materialId: string): Promise<Resultado> {
  return aResultado("confirmarMaterial", async () => {
    await exigirConi(deps.db)
    const subidoPor = await idDeQuienEntro(deps.db)
    const { data: material, error } = await deps.db
      .from("materiales")
      .select("id, estado, archivo_clave")
      .eq("id", materialId)
      .eq("subido_por", subidoPor)
      .maybeSingle()
    if (error) throw new Error(`No pude leer el material ${materialId}: ${error.message}`, { cause: error })
    if (!material) throw new Falla(NO_ENCONTRE)
    // A second tap, or a retry after the page was closed: the work already started.
    if (material.estado !== "procesando") return {}

    const claves = await clavesDelMaterial(deps.db, materialId, material.archivo_clave)
    const tamanos = await medirArchivos(deps.almacen, materialId, claves)
    if (tamanos === undefined) return dejarParaReintentar(deps.db, materialId)
    const malo = tamanos.find((bytes) => bytes === null || bytes === 0 || bytes > TAMANO_MAXIMO_BYTES)
    if (malo !== undefined) {
      await borrarMaterial(deps.db, materialId)
      throw new Falla(malo !== null && malo > TAMANO_MAXIMO_BYTES ? PESA_DEMASIADO : FALTA_EL_ARCHIVO)
    }

    try {
      await deps.disparar.material(materialId)
    } catch (errorDeDisparo) {
      console.error(`No pude iniciar el procesamiento del material ${materialId}`, errorDeDisparo)
      return dejarParaReintentar(deps.db, materialId)
    }
    return {}
  })
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm test:db tests/integration/acciones-subir.test.ts && pnpm type`
Expected: PASS (20 tests), and `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/acciones/biblioteca.ts tests/integration/acciones-subir.test.ts
git add lib/acciones/biblioteca.ts tests/integration/acciones-subir.test.ts
git commit -m "$(cat <<'EOF'
Confirm an upload: check every file in the store, then start its run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 8: `descartarMaterial`, and WAV refused on all three

**Files:**
- Modify: `lib/acciones/biblioteca.ts`
- Test: `tests/integration/acciones-subir.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/integration/acciones-subir.test.ts`, change the import to `import { confirmarMaterial, crearMaterial, type DepsSubir, descartarMaterial } from "@/lib/acciones/biblioteca"`, add `const SOLO_CONI = "Esta app es solo para Coni."` under the constants, change the import of `./sesion-coni` to `import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"`, add `let wav: Db` under `let coni: Db`, replace the first line of `beforeAll` with `;[coni, wav] = await Promise.all([clienteDeConi(), clienteDelMantenedor()])`, and append:

```ts
describe("descartarMaterial", () => {
  it("deletes her material that is still procesando", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    expect(await descartarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(await fila(creado.materialId)).toBeNull()
  })

  it("never deletes a material that is ready", async () => {
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/v", archivos: [] })
    await pool.query("update public.materiales set estado = 'listo' where id = $1", [creado.materialId])
    expect(await descartarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(await fila(creado.materialId)).not.toBeNull()
  })
})

describe("WAV is refused on every upload action (es_coni), even where row level security would let it", () => {
  it("creates nothing, starts nothing and deletes nothing", async () => {
    const titulo = `De WAV ${SUFIJO}`
    const enProceso = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    almacen.simularSubida(enProceso.subidas[0]?.url ?? "", new Uint8Array([1]))

    const resultados = [
      await crearMaterial(deps(wav), { ...base(), titulo, tipo: "link", url: "https://ejemplo.cl/wav", archivos: [] }),
      await confirmarMaterial(deps(wav), enProceso.materialId),
      await descartarMaterial(deps(wav), enProceso.materialId),
    ]

    expect(resultados).toEqual(Array.from({ length: 3 }, () => ({ ok: false, error: SOLO_CONI })))
    expect(await cuantosCon(titulo)).toBe(0)
    expect(await fila(enProceso.materialId)).toMatchObject({ estado: "procesando", motivo_fallo: null })
    expect(disparos).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm test:db tests/integration/acciones-subir.test.ts`
Expected: FAIL in the new blocks, `descartarMaterial is not a function`.

- [ ] **Step 3: Write the action.** Append to `lib/acciones/biblioteca.ts`:

```ts
/** Throws away a material whose upload failed: only hers, and only while it is still `procesando`. */
export function descartarMaterial(deps: Pick<DepsSubir, "db">, materialId: string): Promise<Resultado> {
  return aResultado("descartarMaterial", async () => {
    await exigirConi(deps.db)
    const subidoPor = await idDeQuienEntro(deps.db)
    const { error } = await deps.db
      .from("materiales")
      .delete()
      .eq("id", materialId)
      .eq("subido_por", subidoPor)
      .eq("estado", "procesando")
    if (error) throw new Error(`No pude descartar el material ${materialId}: ${error.message}`, { cause: error })
    return {}
  })
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm test:db tests/integration/acciones-subir.test.ts && pnpm test:db tests/integration/acciones-biblioteca.test.ts && pnpm type`
Expected: PASS (23 tests in the new file; batch 1's file unchanged), and `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write lib/acciones/biblioteca.ts tests/integration/acciones-subir.test.ts
git add lib/acciones/biblioteca.ts tests/integration/acciones-subir.test.ts
git commit -m "$(cat <<'EOF'
Discard a failed upload, and refuse WAV on every upload action

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 9: the server actions of Subir

**Files:**
- Modify: `app/(app)/biblioteca/acciones.ts`
- Test: `tests/unit/biblioteca-acciones-servidor.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/unit/biblioteca-acciones-servidor.test.ts`, extend the import of `@/app/(app)/biblioteca/acciones` with `confirmarMaterialAccion, crearMaterialAccion, descartarMaterialAccion`, and append inside the `describe("the Biblioteca's server actions", ...)` block:

```ts
  it.each([
    ["confirmarMaterial", () => confirmarMaterialAccion(ID)],
    ["descartarMaterial", () => descartarMaterialAccion(ID)],
  ] as const)("%s checks Coni with the material's id and refreshes the whole section", async (nombre, accion) => {
    expect(await accion()).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenCalledWith(nombre, SobreMaterial, { materialId: ID }, expect.any(Function))
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
  })

  it("crearMaterial lets the entry through to leerEntrada, which answers in her words, and refreshes nothing", async () => {
    const entrada = { tipo: "link", url: "https://ejemplo.cl/nota" }
    expect(await crearMaterialAccion(entrada)).toEqual({ ok: true })
    const [nombre, esquema, recibida] = conSesionDeConi.mock.calls[0] ?? []
    expect(nombre).toBe("crearMaterial")
    expect(recibida).toEqual(entrada)
    expect((esquema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(42).success).toBe(true)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-acciones-servidor.test.ts`
Expected: FAIL, `confirmarMaterialAccion is not a function` (and the two others).

- [ ] **Step 3: Write the wrappers.** In `app/(app)/biblioteca/acciones.ts`, extend the import of `@/lib/acciones/biblioteca` with `confirmarMaterial, crearMaterial, type DepsSubir, descartarMaterial`, add after `depsDeBiblioteca`:

```ts
function depsDeSubir(db: DepsSubir["db"]): DepsSubir {
  return {
    db,
    disparar: disparosDeBibliotecaDeLaApp(),
    nuevoId: randomUUID,
    ahora: () => new Date(),
    // Resolved on use, like depsDeBiblioteca: a link needs no R2 variable to be created.
    almacen: {
      urlDeSubida: (clave, segundos, tipo) => almacenReal().urlDeSubida(clave, segundos, tipo),
      tamano: (clave) => almacenReal().tamano(clave),
    },
  }
}
```

and append at the end of the file:

```ts
/** The entry is validated inside `crearMaterial` with her words (leerEntrada), not here. Coni is still on the form. */
export async function crearMaterialAccion(entrada: unknown) {
  return conSesionDeConi("crearMaterial", z.unknown(), entrada, (db, d) => crearMaterial(depsDeSubir(db), d))
}

export async function confirmarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("confirmarMaterial", SobreMaterial, { materialId }, (db, d) =>
      confirmarMaterial(depsDeSubir(db), d.materialId),
    ),
  )
}

export async function descartarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("descartarMaterial", SobreMaterial, { materialId }, (db, d) =>
      descartarMaterial({ db }, d.materialId),
    ),
  )
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-acciones-servidor.test.ts && pnpm type && pnpm test:run`
Expected: PASS, `tsc` clean, all unit tests green.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/acciones.ts" tests/unit/biblioteca-acciones-servidor.test.ts
head -1 "app/(app)/biblioteca/acciones.ts"   # must print "use server"
git add "app/(app)/biblioteca/acciones.ts" tests/unit/biblioteca-acciones-servidor.test.ts
git commit -m "$(cat <<'EOF'
Expose create, confirm and discard of an upload as Coni's server actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part C: screens

### Task 10: the detected type, as a fact she can change

**Files:**
- Create: `app/(app)/biblioteca/subir/tipo-detectado.tsx`
- Test: `tests/unit/biblioteca-tipo-detectado.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-tipo-detectado.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TipoDetectado } from "@/app/(app)/biblioteca/subir/tipo-detectado"

const YOUTUBE = { tipo: "link", etiqueta: "Video de YouTube" } as const

describe("TipoDetectado", () => {
  it("says the detected type as one fact with a quiet Cambiar", () => {
    render(<TipoDetectado efectivo={YOUTUBE} ocupado={false} alElegir={vi.fn()} />)
    expect(screen.getByText("Tipo: Video de YouTube")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cambiar el tipo" })).toHaveTextContent("Cambiar")
  })

  it("opens the six types with the current one marked, and gives the focus back to Cambiar after a choice", async () => {
    const alElegir = vi.fn()
    render(<TipoDetectado efectivo={YOUTUBE} ocupado={false} alElegir={alElegir} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))

    const grupo = screen.getByRole("group", { name: "¿Qué tipo de material es?" })
    expect(within(grupo).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "documento",
      "link",
      "audio",
      "video",
      "imagen",
      "post",
    ])
    expect(within(grupo).getByRole("radio", { name: "Enlace" })).toBeChecked()

    fireEvent.click(within(grupo).getByRole("radio", { name: "Documento" }))
    expect(alElegir).toHaveBeenCalledWith("documento")
    expect(screen.queryByRole("group", { name: "¿Qué tipo de material es?" })).toBeNull()
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar el tipo" })).toHaveFocus())
  })

  it("cannot be changed while uploading", () => {
    render(<TipoDetectado efectivo={YOUTUBE} ocupado alElegir={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))
    expect(screen.queryByRole("group", { name: "¿Qué tipo de material es?" })).toBeNull()
  })

  it("shows nothing while nothing was detected", () => {
    const { container } = render(<TipoDetectado efectivo={null} ocupado={false} alElegir={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-tipo-detectado.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/subir/tipo-detectado"`.

- [ ] **Step 3: Write the component.** Create `app/(app)/biblioteca/subir/tipo-detectado.tsx`:

```tsx
"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Eleccion } from "@/components/ui/filas"
import { ETIQUETA_DE_TIPO, TIPOS_DE_MATERIAL, type TipoDeMaterial } from "@/lib/dominio/biblioteca/modelo"
import type { Deteccion } from "@/lib/dominio/biblioteca/subir"

interface Propiedades {
  efectivo: Deteccion | null
  ocupado: boolean
  alElegir: (tipo: TipoDeMaterial) => void
}

/** What the field understood, said as a fact she can correct: "Tipo: Video de YouTube · Cambiar" (4k). */
export function TipoDetectado({ efectivo, ocupado, alElegir }: Propiedades) {
  const [abierto, setAbierto] = useState(false)
  const [devolverFoco, setDevolverFoco] = useState(false)
  const cambiar = useRef<HTMLButtonElement>(null)
  const grupo = useId()

  // Choosing unmounts the radios: the focus goes back to "Cambiar", which only exists after that render.
  useEffect(() => {
    if (!devolverFoco || abierto) return
    cambiar.current?.focus()
    setDevolverFoco(false)
  }, [devolverFoco, abierto])

  if (!efectivo) return null

  if (abierto) {
    return (
      <fieldset className="elecciones grid">
        <legend className="text-cuerpo font-semibold">¿Qué tipo de material es?</legend>
        {TIPOS_DE_MATERIAL.map((tipo) => (
          <Eleccion
            key={tipo}
            nombre={grupo}
            valor={tipo}
            elegido={efectivo.tipo === tipo}
            etiqueta={ETIQUETA_DE_TIPO[tipo]}
            alElegir={() => {
              alElegir(tipo)
              setAbierto(false)
              setDevolverFoco(true)
            }}
          />
        ))}
      </fieldset>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p className="text-cuerpo">{`Tipo: ${efectivo.etiqueta}`}</p>
      <span aria-hidden="true" className="text-apagado">
        ·
      </span>
      <Boton
        ref={cambiar}
        variante="callado"
        aria-label="Cambiar el tipo"
        deshabilitado={ocupado}
        onClick={() => setAbierto(true)}
      >
        Cambiar
      </Boton>
    </div>
  )
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-tipo-detectado.test.tsx && pnpm type && pnpm test:run`
Expected: PASS, `tsc` clean, all unit tests green (the design rules include the new file).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/subir/tipo-detectado.tsx" tests/unit/biblioteca-tipo-detectado.test.tsx
head -1 "app/(app)/biblioteca/subir/tipo-detectado.tsx"   # "use client"
git add "app/(app)/biblioteca/subir/tipo-detectado.tsx" tests/unit/biblioteca-tipo-detectado.test.tsx
git commit -m "$(cat <<'EOF'
Show the detected type of an upload as a fact she can change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 11: the images in order, moved and removed

**Files:**
- Create: `app/(app)/biblioteca/subir/lista-de-imagenes.tsx`
- Test: `tests/unit/biblioteca-lista-de-imagenes.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-lista-de-imagenes.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ListaDeImagenes } from "@/app/(app)/biblioteca/subir/lista-de-imagenes"

// jsdom has no blob URLs: each thumbnail is named after its file.
const crear = vi.fn((archivo: Blob) => `blob:${archivo instanceof File ? archivo.name : "x"}`)
const revocar = vi.fn()
Object.assign(URL, { createObjectURL: crear, revokeObjectURL: revocar })

const imagen = (nombre: string) => new File(["x"], nombre, { type: "image/png" })
const TRES = [imagen("uno.png"), imagen("dos.png"), imagen("tres.png")]

beforeEach(() => vi.clearAllMocks())

describe("ListaDeImagenes", () => {
  it("shows each image in order with a thumbnail and its name", () => {
    render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={vi.fn()} alQuitar={vi.fn()} />)
    const lista = screen.getByRole("list", { name: "Imágenes en orden" })
    const filas = within(lista).getAllByRole("listitem")
    expect(filas.map((fila) => fila.getAttribute("data-nombre"))).toEqual(["uno.png", "dos.png", "tres.png"])
    expect(screen.getByRole("img", { name: "Imagen 1: uno.png" })).toHaveAttribute("src", "blob:uno.png")
    expect(within(filas[1] as HTMLElement).getByText("dos.png")).toBeInTheDocument()
  })

  it("moves an image before or after, and never past either end", () => {
    const alMover = vi.fn()
    render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={alMover} alQuitar={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Mover la imagen 1 antes" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Mover la imagen 3 después" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 1 antes" }))
    expect(alMover).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 2 antes" }))
    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 2 después" }))
    expect(alMover.mock.calls).toEqual([
      [1, -1],
      [1, 1],
    ])
  })

  it("removes the image she asks for", () => {
    const alQuitar = vi.fn()
    render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={vi.fn()} alQuitar={alQuitar} />)
    fireEvent.click(screen.getByRole("button", { name: "Quitar la imagen 3" }))
    expect(alQuitar).toHaveBeenCalledWith(2)
  })

  it("changes nothing while uploading", () => {
    const alMover = vi.fn()
    const alQuitar = vi.fn()
    render(<ListaDeImagenes archivos={TRES} ocupado alMover={alMover} alQuitar={alQuitar} />)
    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 2 antes" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitar la imagen 1" }))
    expect(alMover).not.toHaveBeenCalled()
    expect(alQuitar).not.toHaveBeenCalled()
  })

  it("frees the thumbnails it made when it goes away", () => {
    const { unmount } = render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={vi.fn()} alQuitar={vi.fn()} />)
    unmount()
    expect(revocar.mock.calls.map(([url]) => url)).toEqual(["blob:uno.png", "blob:dos.png", "blob:tres.png"])
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-lista-de-imagenes.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/subir/lista-de-imagenes"`.

- [ ] **Step 3: Write the component.** Create `app/(app)/biblioteca/subir/lista-de-imagenes.tsx`:

```tsx
"use client"

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react"
import { useEffect, useMemo } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"

interface Propiedades {
  archivos: readonly File[]
  ocupado: boolean
  alMover: (indice: number, hacia: -1 | 1) => void
  alQuitar: (indice: number) => void
}

/** The images of a material in the order they are stored (`orden` 1..20): she moves or removes each one. */
export function ListaDeImagenes({ archivos, ocupado, alMover, alQuitar }: Propiedades) {
  const miniaturas = useMemo(() => archivos.map((archivo) => URL.createObjectURL(archivo)), [archivos])
  useEffect(
    () => () => {
      for (const miniatura of miniaturas) URL.revokeObjectURL(miniatura)
    },
    [miniaturas],
  )

  return (
    <ol aria-label="Imágenes en orden" className="grid grid-cols-2 gap-3">
      {archivos.map((archivo, indice) => {
        const numero = indice + 1
        return (
          <li
            // The key is the position: the list is reordered by hand and the same file may be picked twice.
            key={`${indice}-${archivo.name}`}
            data-nombre={archivo.name}
            className="grid content-start gap-2 rounded-bloque bg-piedra-honda p-2"
          >
            {/* biome-ignore lint/performance/noImgElement: a blob preview of a picked file, nothing to optimize */}
            <img
              src={miniaturas[indice]}
              alt={`Imagen ${numero}: ${archivo.name}`}
              className="aspect-square w-full rounded-casilla object-cover"
            />
            <p className="truncate text-meta text-apagado">{archivo.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Boton
                variante="secundario"
                tamano="chico"
                aria-label={`Mover la imagen ${numero} antes`}
                deshabilitado={indice === 0 || ocupado}
                onClick={() => alMover(indice, -1)}
              >
                <ArrowLeft aria-hidden="true" size={ICONO.medio} />
              </Boton>
              <Boton
                variante="secundario"
                tamano="chico"
                aria-label={`Mover la imagen ${numero} después`}
                deshabilitado={indice === archivos.length - 1 || ocupado}
                onClick={() => alMover(indice, 1)}
              >
                <ArrowRight aria-hidden="true" size={ICONO.medio} />
              </Boton>
              <Boton
                variante="callado"
                aria-label={`Quitar la imagen ${numero}`}
                deshabilitado={ocupado}
                onClick={() => alQuitar(indice)}
              >
                Quitar
              </Boton>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-lista-de-imagenes.test.tsx && pnpm type && pnpm test:run`
Expected: PASS, `tsc` clean, all unit tests green.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/subir/lista-de-imagenes.tsx" tests/unit/biblioteca-lista-de-imagenes.test.tsx
head -1 "app/(app)/biblioteca/subir/lista-de-imagenes.tsx"   # "use client"
git add "app/(app)/biblioteca/subir/lista-de-imagenes.tsx" tests/unit/biblioteca-lista-de-imagenes.test.tsx
git commit -m "$(cat <<'EOF'
List the picked images in order, to move or remove each one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 12: the form: one field, the type, the extras, author, who it is for her (4d, 4k)

**Files:**
- Create: `app/(app)/biblioteca/subir/formulario-de-subida.tsx`
- Test: `tests/unit/biblioteca-formulario-de-subida.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-formulario-de-subida.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { crearMaterialAccion, confirmarMaterialAccion, descartarMaterialAccion, crearAutorAccion, subirArchivos } =
  vi.hoisted(() => ({
    crearMaterialAccion: vi.fn(),
    confirmarMaterialAccion: vi.fn(),
    descartarMaterialAccion: vi.fn(),
    crearAutorAccion: vi.fn(),
    subirArchivos: vi.fn(),
  }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  crearMaterialAccion,
  confirmarMaterialAccion,
  descartarMaterialAccion,
  crearAutorAccion,
}))
vi.mock("@/app/(app)/biblioteca/subir/subida-cliente", () => ({ subirArchivos }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { FormularioDeSubida } from "@/app/(app)/biblioteca/subir/formulario-de-subida"
import { AYUDA_DEL_CAMPO, NO_RECONOZCO } from "@/lib/dominio/biblioteca/subir"
import { AVISO_DE_PODCAST } from "@/lib/dominio/biblioteca/youtube"

Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() })

const CONI = "c1111111-2222-4333-8444-555555555555"
const DANIELA = "d1111111-2222-4333-8444-555555555555"
const AUTORES = [
  { id: CONI, nombre: "Coni del Rosario", credencial: null, tipo: "coni", alias: [] },
  { id: DANIELA, nombre: "Daniela Ruiz", credencial: "investigadora", tipo: "persona", alias: [] },
]

const campo = () => screen.getByLabelText("Pega un enlace o elige un archivo")
const pegar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })

function elegir(container: HTMLElement, selector: string, archivos: File[]) {
  const input = container.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`No está el campo ${selector}`)
  fireEvent.change(input, { target: { files: archivos } })
}
const elegirArchivos = (container: HTMLElement, archivos: File[]) =>
  elegir(container, 'input[type="file"][multiple]', archivos)

beforeEach(() => vi.clearAllMocks())

describe("FormularioDeSubida: the field and its type", () => {
  it("has one field with its own file button and a hidden native input, and says which files it takes", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    expect(campo()).toHaveAccessibleDescription(AYUDA_DEL_CAMPO)
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toBeInTheDocument()
    expect(container.querySelector('input[type="file"][multiple]')).toHaveAttribute("hidden")
    expect(screen.queryByText(/^Tipo:/)).toBeNull()
  })

  it("detects a YouTube link and asks for the pasted transcript with its steps", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    pegar("https://youtu.be/abc123")
    expect(screen.getByText("Tipo: Video de YouTube")).toBeInTheDocument()
    expect(screen.getByLabelText("Transcripción del video")).toHaveAccessibleDescription(/Mostrar transcripción/)
  })

  it("warns that a podcast is read from its page only", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    pegar("https://open.spotify.com/episode/abc")
    expect(screen.getByText("Tipo: Podcast")).toBeInTheDocument()
    expect(screen.getByText(AVISO_DE_PODCAST)).toBeInTheDocument()
    expect(screen.queryByLabelText("Transcripción del video")).toBeNull()
  })

  it("lets her change the type, and a new input goes back to what is detected", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    pegar("Un texto mío sobre la carga mental")
    expect(screen.getByText("Tipo: Texto")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))
    fireEvent.click(screen.getByRole("radio", { name: "Documento" }))
    expect(screen.getByText("Tipo: Documento")).toBeInTheDocument()
    pegar("Otro texto")
    expect(screen.getByText("Tipo: Texto")).toBeInTheDocument()
  })

  it("shows the name of a picked file and its type, and clears what was pasted", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    pegar("https://ejemplo.cl/nota")
    elegirArchivos(container, [new File(["x"], "Tesis.PDF", { type: "application/pdf" })])
    expect(within(screen.getByRole("list", { name: "Archivos elegidos" })).getByText("Tesis.PDF")).toBeInTheDocument()
    expect(screen.getByText("Tipo: Documento")).toBeInTheDocument()
    expect(campo()).toHaveValue("")
  })

  it("says which files it takes when it does not know a picked file", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    elegirArchivos(container, [new File(["x"], "animacion.gif", { type: "image/gif" })])
    expect(screen.getByText(NO_RECONOZCO)).toBeInTheDocument()
    expect(screen.queryByText(/^Tipo:/)).toBeNull()
  })

  it("lists picked images in order and asks for their reference link", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    elegirArchivos(container, ["a.jpg", "b.png", "c.heic"].map((nombre) => new File(["x"], nombre)))
    expect(screen.getByText("Tipo: 3 imágenes")).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Imágenes en orden" })).getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByLabelText("Link de referencia (no se abre)")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Quitar la imagen 1" }))
    expect(screen.getByText("Tipo: 2 imágenes")).toBeInTheDocument()
  })

  it("takes a post's text and an optional video of its own", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    pegar("Hoy quiero hablar del descanso.")
    expect(screen.getByText("Tipo: Texto")).toBeInTheDocument()
    elegir(container, 'input[type="file"][accept=".mp4,.mov"]', [new File(["x"], "clase.mp4", { type: "video/mp4" })])
    expect(screen.getByText("clase.mp4")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Quitar el video" }))
    expect(screen.queryByText("clase.mp4")).toBeNull()
    expect(screen.getByRole("button", { name: "Elegir video" })).toBeInTheDocument()
  })
})

describe("FormularioDeSubida: author, who it is for her and the declaration", () => {
  it("asks who it is for her in her words (4h), with Coni's four labels", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    const grupo = screen.getByRole("group", { name: "¿Quién es para ti?" })
    expect(within(grupo).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "voz_propia",
      "referente",
      "evidencia",
      "estrategia",
    ])
    expect(screen.queryByText(/papel/i)).toBeNull()
  })

  it("picks Coni as the author when Lo dijo Coni is chosen with no author", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    fireEvent.click(screen.getByRole("radio", { name: "Lo dijo Coni" }))
    expect(screen.getByText("Coni del Rosario")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cambiar autor" })).toBeInTheDocument()
  })

  it("runs the rules before sending anything, and says the first problem", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    fireEvent.click(screen.getByRole("button", { name: "Subir" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Pega un enlace o elige un archivo.")
    pegar("https://ejemplo.cl/nota")
    fireEvent.click(screen.getByRole("button", { name: "Subir" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Elige el autor.")
    expect(crearMaterialAccion).not.toHaveBeenCalled()
  })

  it("has a quiet Cancelar back to the Biblioteca", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/biblioteca")
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-formulario-de-subida.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/subir/formulario-de-subida"`.

- [ ] **Step 3: Write the component.** Create `app/(app)/biblioteca/subir/formulario-de-subida.tsx` (this task's `subir` only validates; Task 13 adds the upload):

```tsx
"use client"

import { Paperclip } from "@phosphor-icons/react"
import Link from "next/link"
import { useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { Eleccion } from "@/components/ui/filas"
import { ICONO } from "@/components/ui/icono"
import { LineaDeError } from "@/components/ui/linea-de-error"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import {
  armarEntrada,
  type EntradaDeSubida,
  juntarArchivos,
  moverArchivo,
} from "@/lib/dominio/biblioteca/borrador-de-subida"
import { AYUDA_DE_ROL, ETIQUETA_DE_ROL, ROLES, type Rol, type TipoDeMaterial } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import {
  ACEPTA_TODO,
  ACEPTA_VIDEO,
  AYUDA_DEL_CAMPO,
  detectarTipo,
  FALTA_LA_ENTRADA,
  leerEntrada,
  NO_RECONOZCO,
  PESA_DEMASIADO,
  TAMANO_MAXIMO_BYTES,
  tipoEfectivo,
} from "@/lib/dominio/biblioteca/subir"
import { AVISO_DE_PODCAST, esPodcast, esYoutube, PASOS_DE_YOUTUBE } from "@/lib/dominio/biblioteca/youtube"
import { cn } from "@/lib/utils"
import { crearAutorAccion } from "../acciones"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { SelectorDeAutor } from "../selector-de-autor"
import { ListaDeImagenes } from "./lista-de-imagenes"
import { TipoDetectado } from "./tipo-detectado"

type Lectura = { ok: true; entrada: EntradaDeSubida; aSubir: File[] } | { ok: false; error: string }

export function FormularioDeSubida({ autores }: { autores: AutorDeLista[] }) {
  const id = useId()
  const principal = useRef<HTMLInputElement>(null)
  const delPost = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])
  const [manual, setManual] = useState<TipoDeMaterial | null>(null)
  const [transcripcion, setTranscripcion] = useState("")
  const [referencia, setReferencia] = useState("")
  const [videoDelPost, setVideoDelPost] = useState<File | null>(null)
  const [titulo, setTitulo] = useState("")
  const [autorId, setAutorId] = useState("")
  const [rol, setRol] = useState<Rol | "">("")
  const [declaracion, setDeclaracion] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progreso] = useState<string | null>(null)

  const ocupado = progreso !== null
  const deteccion = detectarTipo({ texto, archivos })
  const efectivo = tipoEfectivo(deteccion, manual)
  const tipo = efectivo?.tipo ?? null
  const enlace = texto.trim()

  // One field, two ways in (D4): typing clears the files, picking clears the text; either clears a manual type.
  function escribir(nuevo: string) {
    setTexto(nuevo)
    setArchivos([])
    setManual(null)
    setError(null)
  }

  function elegir(elegidos: File[]) {
    if (elegidos.length === 0) return
    const juntos = juntarArchivos(archivos, elegidos)
    setArchivos(juntos.archivos)
    setTexto("")
    setManual(null)
    setError(juntos.error)
  }

  function elegirVideo(elegido: File | undefined) {
    if (!elegido) return
    if (elegido.size > TAMANO_MAXIMO_BYTES) {
      setError(PESA_DEMASIADO)
      return
    }
    setError(null)
    setVideoDelPost(elegido)
  }

  function elegirRol(opcion: Rol) {
    setRol(opcion)
    // What Coni says is by Coni: her author is the obvious pick while none is chosen.
    if (opcion === "voz_propia" && autorId === "") setAutorId(autores.find((autor) => autor.tipo === "coni")?.id ?? "")
    setError(null)
  }

  /** The same rules the server runs again (leerEntrada): nothing is sent while one fails. */
  function leerFormulario(): Lectura {
    if (!efectivo) return { ok: false, error: archivos.length > 0 ? NO_RECONOZCO : FALTA_LA_ENTRADA }
    const { entrada, aSubir } = armarEntrada({
      tipo: efectivo.tipo,
      texto,
      archivos,
      videoDelPost,
      transcripcion,
      referencia,
      titulo,
      autorId,
      rol,
      declaracion,
    })
    const lectura = leerEntrada(entrada)
    return lectura.ok ? { ok: true, entrada, aSubir } : { ok: false, error: lectura.error }
  }

  function subir() {
    setError(null)
    const leido = leerFormulario()
    if (!leido.ok) setError(leido.error)
  }

  return (
    <form
      aria-label="Subir material"
      noValidate
      className="grid gap-6"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!ocupado) subir()
      }}
    >
      <div className="grid gap-3">
        <Campo id={`${id}-entrada`} etiqueta="Pega un enlace o elige un archivo" ayuda={AYUDA_DEL_CAMPO}>
          <textarea
            id={`${id}-entrada`}
            rows={2}
            autoComplete="off"
            value={texto}
            aria-describedby={`${id}-entrada-ayuda`}
            onChange={(evento) => escribir(evento.target.value)}
            className={cn(CLASES_DE_CAMPO, "resize-y")}
          />
        </Campo>
        <Boton
          variante="secundario"
          tamano="chico"
          className="w-fit"
          deshabilitado={ocupado}
          icono={<Paperclip aria-hidden="true" size={ICONO.medio} />}
          onClick={() => principal.current?.click()}
        >
          Elegir archivo
        </Boton>
        {/* Never the native "Choose File" (4d): the button above opens it. */}
        <input
          ref={principal}
          type="file"
          hidden
          multiple
          accept={ACEPTA_TODO}
          onChange={(evento) => {
            elegir(Array.from(evento.target.files ?? []))
            evento.target.value = ""
          }}
        />
        {tipo === "imagen" ? (
          <ListaDeImagenes
            archivos={archivos}
            ocupado={ocupado}
            alMover={(indice, hacia) => setArchivos(moverArchivo(archivos, indice, hacia))}
            alQuitar={(indice) => setArchivos(archivos.filter((_, posicion) => posicion !== indice))}
          />
        ) : archivos.length > 0 ? (
          <ul aria-label="Archivos elegidos" className="grid gap-2">
            {archivos.map((archivo, indice) => (
              // The key is the position: the same file may be picked twice.
              <li key={`${indice}-${archivo.name}`} className="rounded-bloque bg-piedra-honda p-3 text-cuerpo break-words">
                {archivo.name}
              </li>
            ))}
          </ul>
        ) : null}
        {deteccion === null && archivos.length > 0 ? <p className="text-meta text-apagado">{NO_RECONOZCO}</p> : null}
        <TipoDetectado efectivo={efectivo} ocupado={ocupado} alElegir={setManual} />
      </div>

      {tipo === "link" && esYoutube(enlace) ? (
        <Campo id={`${id}-transcripcion`} etiqueta="Transcripción del video" ayuda={PASOS_DE_YOUTUBE}>
          <textarea
            id={`${id}-transcripcion`}
            rows={6}
            value={transcripcion}
            aria-describedby={`${id}-transcripcion-ayuda`}
            onChange={(evento) => setTranscripcion(evento.target.value)}
            className={cn(CLASES_DE_CAMPO, "min-h-40 resize-y")}
          />
        </Campo>
      ) : null}
      {tipo === "link" && esPodcast(enlace) ? <p className="text-meta text-apagado">{AVISO_DE_PODCAST}</p> : null}

      {tipo === "post" ? (
        <div className="grid gap-2">
          <p className="text-cuerpo font-semibold">
            Video <span className="font-normal text-apagado">(opcional)</span>
          </p>
          {videoDelPost ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-bloque bg-piedra-honda p-3">
              <span className="text-cuerpo break-words">{videoDelPost.name}</span>
              <Boton
                variante="callado"
                aria-label="Quitar el video"
                deshabilitado={ocupado}
                onClick={() => setVideoDelPost(null)}
              >
                Quitar
              </Boton>
            </div>
          ) : (
            <Boton
              variante="secundario"
              tamano="chico"
              className="w-fit"
              deshabilitado={ocupado}
              onClick={() => delPost.current?.click()}
            >
              Elegir video
            </Boton>
          )}
          <input
            ref={delPost}
            type="file"
            hidden
            accept={ACEPTA_VIDEO}
            onChange={(evento) => {
              elegirVideo(evento.target.files?.[0])
              evento.target.value = ""
            }}
          />
        </div>
      ) : null}

      {tipo === "video" || tipo === "imagen" ? (
        <Campo id={`${id}-referencia`} etiqueta="Link de referencia (no se abre)">
          <input
            id={`${id}-referencia`}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={referencia}
            onChange={(evento) => setReferencia(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
      ) : null}

      <Campo
        id={`${id}-titulo`}
        etiqueta={
          <>
            Título <span className="font-normal text-apagado">(opcional)</span>
          </>
        }
      >
        <input
          id={`${id}-titulo`}
          type="text"
          value={titulo}
          onChange={(evento) => setTitulo(evento.target.value)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>

      <SelectorDeAutor
        autores={autores}
        valor={autorId}
        alElegir={(elegido) => {
          setAutorId(elegido)
          setError(null)
        }}
        alCrear={crearAutorAccion}
      />

      <fieldset className="elecciones grid">
        <legend className="text-cuerpo font-semibold">{PALABRAS.papel}</legend>
        {ROLES.map((opcion) => (
          <Eleccion
            key={opcion}
            nombre={`${id}-rol`}
            valor={opcion}
            elegido={rol === opcion}
            etiqueta={ETIQUETA_DE_ROL[opcion]}
            detalle={AYUDA_DE_ROL[opcion]}
            alElegir={() => elegirRol(opcion)}
          />
        ))}
      </fieldset>

      <Casilla etiqueta="Este material no contiene datos de pacientes" marcada={declaracion} alCambiar={setDeclaracion} />

      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <output aria-live="polite" className="block text-cuerpo text-tinta">
        {progreso}
      </output>

      <div className="grid gap-3 md:flex md:items-center md:gap-6">
        <Boton type="submit" cargando={ocupado} className="md:w-auto">
          Subir
        </Boton>
        {/* Leaving mid-upload would keep a material whose files never arrive (D10). */}
        {ocupado ? null : (
          <Link href="/biblioteca" className={clasesDeBoton({ variante: "callado", className: "justify-center" })}>
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-formulario-de-subida.test.tsx && pnpm type && pnpm test:run`
Expected: PASS, `tsc` clean, all unit tests green (design rules and the 4h scan of `app/(app)/biblioteca/` include the new file).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/subir/formulario-de-subida.tsx" tests/unit/biblioteca-formulario-de-subida.test.tsx
head -1 "app/(app)/biblioteca/subir/formulario-de-subida.tsx"   # "use client"
git add "app/(app)/biblioteca/subir/formulario-de-subida.tsx" tests/unit/biblioteca-formulario-de-subida.test.tsx
git commit -m "$(cat <<'EOF'
Add the upload form: one field, the detected type and each type's extras (4d, 4k)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 13: the form uploads in three steps

**Files:**
- Modify: `app/(app)/biblioteca/subir/formulario-de-subida.tsx`
- Test: `tests/unit/biblioteca-formulario-de-subida-flujo.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-formulario-de-subida-flujo.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
type Creado = { ok: true; materialId: string; subidas: unknown[] } | { ok: false; error: string }
type Pedido = { alAvanzar?: (hechos: number, total: number) => void }

const { crearMaterialAccion, confirmarMaterialAccion, descartarMaterialAccion, crearAutorAccion, subirArchivos, push } =
  vi.hoisted(() => ({
    crearMaterialAccion: vi.fn(async (..._: unknown[]): Promise<Creado> => ({ ok: false, error: "sin preparar" })),
    confirmarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
    descartarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
    crearAutorAccion: vi.fn(),
    subirArchivos: vi.fn(async (_: Pedido): Promise<void> => undefined),
    push: vi.fn(),
  }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  crearMaterialAccion,
  confirmarMaterialAccion,
  descartarMaterialAccion,
  crearAutorAccion,
}))
vi.mock("@/app/(app)/biblioteca/subir/subida-cliente", () => ({ subirArchivos }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))

import { FormularioDeSubida } from "@/app/(app)/biblioteca/subir/formulario-de-subida"
import { ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"

const ID = "11111111-2222-4333-8444-555555555555"
const DANIELA = "d1111111-2222-4333-8444-555555555555"
const AUTORES = [{ id: DANIELA, nombre: "Daniela Ruiz", credencial: "investigadora", tipo: "persona", alias: [] }]
const SUBIDAS = [{ orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" }]

function conUnPdf(): { pdf: File } {
  const { container } = render(<FormularioDeSubida autores={AUTORES} />)
  const pdf = new File(["%PDF-1.4"], "tesis.pdf", { type: "application/pdf" })
  const input = container.querySelector<HTMLInputElement>('input[type="file"][multiple]')
  if (!input) throw new Error("No está el campo de archivos")
  fireEvent.change(input, { target: { files: [pdf] } })
  fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "Daniela" } })
  fireEvent.click(screen.getByRole("button", { name: "Daniela Ruiz, investigadora" }))
  fireEvent.click(screen.getByRole("radio", { name: "Estudio o libro" }))
  fireEvent.click(screen.getByRole("checkbox", { name: "Este material no contiene datos de pacientes" }))
  return { pdf }
}

const subir = () => fireEvent.click(screen.getByRole("button", { name: "Subir" }))

beforeEach(() => {
  vi.clearAllMocks()
  crearMaterialAccion.mockResolvedValue({ ok: true, materialId: ID, subidas: SUBIDAS })
})

describe("FormularioDeSubida: the upload", () => {
  it("creates the material, puts the file, confirms it and opens the list with the notice", async () => {
    const { pdf } = conUnPdf()
    subir()

    await waitFor(() => expect(push).toHaveBeenCalledWith("/biblioteca?subido=1"))
    expect(crearMaterialAccion).toHaveBeenCalledWith({
      tipo: "documento",
      titulo: "",
      autorId: DANIELA,
      rol: "evidencia",
      declaracion: true,
      url: "",
      textoPegado: "",
      referencia: "",
      archivos: [{ nombre: "tesis.pdf", tamano: pdf.size }],
    })
    expect(subirArchivos).toHaveBeenCalledWith(expect.objectContaining({ subidas: SUBIDAS, archivos: [pdf] }))
    expect(confirmarMaterialAccion).toHaveBeenCalledWith(ID)
    expect(descartarMaterialAccion).not.toHaveBeenCalled()
  })

  it("says which file is going up, and hides Cancelar while it does", async () => {
    let soltar: () => void = () => undefined
    subirArchivos.mockImplementationOnce(async ({ alAvanzar }) => {
      alAvanzar?.(0, 1)
      await new Promise<void>((resolver) => {
        soltar = resolver
      })
    })
    conUnPdf()
    subir()

    expect(await screen.findByText("Subiendo 1 de 1")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Cancelar" })).toBeNull()
    soltar()
    await waitFor(() => expect(push).toHaveBeenCalledWith("/biblioteca?subido=1"))
  })

  it("throws the material away when a file fails to go up, says which one and stays", async () => {
    subirArchivos.mockRejectedValueOnce(new Error("No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo."))
    conUnPdf()
    subir()

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo.",
    )
    expect(descartarMaterialAccion).toHaveBeenCalledWith(ID)
    expect(confirmarMaterialAccion).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeInTheDocument()
  })

  it("says why when the confirmation is refused, and stays", async () => {
    confirmarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Ese archivo pesa más de 2 GB." })
    conUnPdf()
    subir()
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese archivo pesa más de 2 GB.")
    expect(push).not.toHaveBeenCalled()
  })

  it("says the generic notice when an action does not answer at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    crearMaterialAccion.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    conUnPdf()
    subir()
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado.")
    expect(subirArchivos).not.toHaveBeenCalled()
  })

  it("goes back to sign in when the session ended", async () => {
    crearMaterialAccion.mockResolvedValueOnce({ ok: false, error: ERROR_SESION_VENCIDA })
    conUnPdf()
    subir()
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
    expect(subirArchivos).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-formulario-de-subida-flujo.test.tsx`
Expected: FAIL, `expected "spy" to be called with arguments: [ "/biblioteca?subido=1" ]` (the form only validates so far).

- [ ] **Step 3: Add the upload.** In `app/(app)/biblioteca/subir/formulario-de-subida.tsx`:

1. Add the imports `import { useRouter } from "next/navigation"` and `import { ERROR_GENERICO, ERROR_SESION_VENCIDA, type Resultado } from "@/lib/acciones/resultado"`; extend the import of `@/lib/dominio/biblioteca/borrador-de-subida` with `GUARDANDO, HREF_TRAS_SUBIR, PREPARANDO, progresoDeSubida`; replace `import { crearAutorAccion } from "../acciones"` with `import { confirmarMaterialAccion, crearAutorAccion, crearMaterialAccion, descartarMaterialAccion } from "../acciones"`; add `import { subirArchivos } from "./subida-cliente"`.
2. Above `export function FormularioDeSubida`, add:

```tsx
/** A rejected action (the network, the server) must not leave the button spinning or break the screen. */
async function pedir<T extends object>(accion: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await accion()
  } catch (fallo) {
    console.error("Una acción de Subir no respondió", fallo)
    return { ok: false, error: ERROR_GENERICO }
  }
}
```

3. Add `const router = useRouter()` as the first line of the component, and replace `const [progreso] = useState<string | null>(null)` with `const [progreso, setProgreso] = useState<string | null>(null)`.
4. Replace the whole `function subir() { ... }` with:

```tsx
  function fallar(mensaje: string) {
    setProgreso(null)
    if (mensaje === ERROR_SESION_VENCIDA) router.push("/ingreso")
    else setError(mensaje)
  }

  /** Create the row and its signed uploads, put each file straight to the store, then confirm (spec section 3). */
  async function subir() {
    setError(null)
    const leido = leerFormulario()
    if (!leido.ok) {
      setError(leido.error)
      return
    }
    setProgreso(PREPARANDO)
    const creado = await pedir(() => crearMaterialAccion(leido.entrada))
    if (!creado.ok) {
      fallar(creado.error)
      return
    }
    try {
      await subirArchivos({
        subidas: creado.subidas,
        archivos: leido.aSubir,
        alAvanzar: (hechos, total) => setProgreso(progresoDeSubida(hechos, total)),
      })
    } catch (falla) {
      // The row exists before the upload: a failed upload must not leave a material that will never have its file.
      const descartado = await pedir(() => descartarMaterialAccion(creado.materialId))
      if (!descartado.ok) console.error(`No pude descartar el material ${creado.materialId}`, descartado.error)
      fallar(falla instanceof Error ? falla.message : ERROR_GENERICO)
      return
    }
    setProgreso(GUARDANDO)
    const confirmado = await pedir(() => confirmarMaterialAccion(creado.materialId))
    if (!confirmado.ok) {
      fallar(confirmado.error)
      return
    }
    router.push(HREF_TRAS_SUBIR)
  }
```

5. In the form's `onSubmit`, replace `if (!ocupado) subir()` with `if (!ocupado) void subir()`.

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-formulario-de-subida-flujo.test.tsx tests/unit/biblioteca-formulario-de-subida.test.tsx && pnpm type && pnpm test:run`
Expected: PASS (both files), `tsc` clean, all unit tests green.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/subir/formulario-de-subida.tsx" tests/unit/biblioteca-formulario-de-subida-flujo.test.tsx
head -1 "app/(app)/biblioteca/subir/formulario-de-subida.tsx"   # "use client"
git add "app/(app)/biblioteca/subir/formulario-de-subida.tsx" tests/unit/biblioteca-formulario-de-subida-flujo.test.tsx
git commit -m "$(cat <<'EOF'
Upload from the form: create, put each file to the store, confirm, or discard on failure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 14: the Subir page (4e)

**Files:**
- Create: `app/(app)/biblioteca/subir/page.tsx`
- Test: `tests/unit/biblioteca-pagina-subir.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-pagina-subir.test.tsx`:

```tsx
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// The page gates itself, as Materiales does: a layout does not run again on client navigation.
const { esConi, AUTORES, listarAutores } = vi.hoisted(() => {
  const AUTORES = [{ id: "a-1", nombre: "Daniela Ruiz", credencial: null, tipo: "persona", alias: [] }]
  return { esConi: { valor: false }, AUTORES, listarAutores: vi.fn(async () => AUTORES) }
})
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "alguien@ejemplo.cl" } } }) },
    rpc: async () => ({ data: esConi.valor, error: null }),
  }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (ruta: string) => {
    throw new Error(`NEXT_REDIRECT ${ruta}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/lib/datos/biblioteca", () => ({ listarAutores }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  crearMaterialAccion: vi.fn(),
  confirmarMaterialAccion: vi.fn(),
  descartarMaterialAccion: vi.fn(),
  crearAutorAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import { FormularioDeSubida } from "@/app/(app)/biblioteca/subir/formulario-de-subida"
import Subir from "@/app/(app)/biblioteca/subir/page"
import { Volver } from "@/components/ui/volver"

type Elemento = ReactElement<{ children?: ReactNode } & Record<string, unknown>>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

beforeEach(() => vi.clearAllMocks())

describe("the Subir page", () => {
  it("refuses a session that is not Coni's on its own, before reading the authors", async () => {
    esConi.valor = false
    await expect(Subir()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(listarAutores).not.toHaveBeenCalled()
  })

  it("gives Coni the way back on the left, the heading and the form with her authors (4e)", async () => {
    esConi.valor = true
    const arbol = elementos(await Subir())
    const volver = arbol.find((elemento) => elemento.type === Volver)
    expect(volver?.props.href).toBe("/biblioteca")
    expect(volver?.props.children).toBe("Volver a Biblioteca")
    expect(arbol.find((elemento) => elemento.type === "h1")?.props.children).toBe("Subir material")
    expect(arbol.find((elemento) => elemento.type === FormularioDeSubida)?.props.autores).toEqual(AUTORES)
  })

  it("reads in one column on a computer, as wide as a material's detail", async () => {
    esConi.valor = true
    const raiz = (await Subir()) as Elemento
    expect(raiz.props.className).toContain("md:max-w-[42rem]")
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-subir.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca/subir/page"`.

- [ ] **Step 3: Write the page.** Create `app/(app)/biblioteca/subir/page.tsx`:

```tsx
import { Volver } from "@/components/ui/volver"
import { listarAutores } from "@/lib/datos/biblioteca"
import { exigirConi } from "@/lib/sesion/coni"
import { FormularioDeSubida } from "./formulario-de-subida"

// Not a tab of the section: the Materiales header and its empty state link here. Loading, error and not-found are the
// section's own (batch 1).
export default async function Subir() {
  const { db } = await exigirConi()
  const autores = await listarAutores(db)
  return (
    <div className="grid w-full gap-6 md:max-w-[42rem]">
      <Volver href="/biblioteca">Volver a Biblioteca</Volver>
      <h1 className="text-pantalla text-balance">Subir material</h1>
      <FormularioDeSubida autores={autores} />
    </div>
  )
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-subir.test.tsx && pnpm type && pnpm test:run && pnpm build 2>&1 | grep "/biblioteca/subir"`
Expected: PASS, `tsc` clean, all unit tests green, and the build lists `ƒ /biblioteca/subir`.

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/subir/page.tsx" tests/unit/biblioteca-pagina-subir.test.tsx
git add "app/(app)/biblioteca/subir/page.tsx" tests/unit/biblioteca-pagina-subir.test.tsx
git commit -m "$(cat <<'EOF'
Add the Subir page of the Biblioteca, Coni only, with its way back (4e)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 15: "Subir" in the Materiales header and empty state, and "Lo estoy procesando."

**Files:**
- Modify: `app/(app)/biblioteca/page.tsx`
- Test: `tests/unit/biblioteca-pagina-materiales.test.tsx`

- [ ] **Step 1: Write the failing test.** Append inside the `describe("the Materiales page", ...)` block of `tests/unit/biblioteca-pagina-materiales.test.tsx`:

```tsx
  const aSubir = (arbol: Elemento[]) =>
    arbol.filter((elemento) => (elemento.props as { href?: unknown }).href === "/biblioteca/subir")
  const conAviso = (arbol: Elemento[]) =>
    arbol.some((elemento) => (elemento.props as { titulo?: unknown }).titulo === "Lo estoy procesando.")

  it("links to Subir from its header and, with nothing uploaded yet, from the empty list too", async () => {
    esConi.valor = true
    expect(aSubir(elementos(await Materiales({ searchParams: sinFiltros() })))).toHaveLength(2)
  })

  it("keeps only the header's Subir when filters leave the list empty", async () => {
    esConi.valor = true
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ estado: "listo" }) }))
    expect(aSubir(arbol)).toHaveLength(1)
  })

  it("says Lo estoy procesando. after an upload, and nothing otherwise", async () => {
    esConi.valor = true
    expect(conAviso(elementos(await Materiales({ searchParams: Promise.resolve({ subido: "1" }) })))).toBe(true)
    expect(conAviso(elementos(await Materiales({ searchParams: sinFiltros() })))).toBe(false)
  })
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-materiales.test.tsx`
Expected: FAIL in the three new tests (`expected [] to have a length of 2`, `... of 1`, `expected false to be true`).

- [ ] **Step 3: Change the page.** In `app/(app)/biblioteca/page.tsx`:

1. Add the imports:

```tsx
import { UploadSimple } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { AVISO_TRAS_SUBIR, RUTA_DE_SUBIR, vieneDeSubir } from "@/lib/dominio/biblioteca/borrador-de-subida"
```

2. After `const ahora = Date.now()`, add:

```tsx
  // One element, drawn in the header and again in the empty list: Subir is not a tab (spec section 1).
  const subir = (
    <Link href={RUTA_DE_SUBIR} className={clasesDeBoton({ variante: "secundario", tamano: "chico", className: "w-fit" })}>
      Subir
      <UploadSimple aria-hidden="true" size={ICONO.medio} />
    </Link>
  )
```

3. Replace `<h1 className="text-pantalla">Biblioteca</h1>` with:

```tsx
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-pantalla">Biblioteca</h1>
          {subir}
        </div>
        {vieneDeSubir(params) ? <LineaDeEstado tipo="neutro" titulo={AVISO_TRAS_SUBIR} /> : null}
```

4. Replace the empty-state paragraph

```tsx
          <p className="text-cuerpo text-apagado">
            {hayFiltros(filtros)
              ? "Ningún material coincide con esos filtros."
              : "Aún no hay material en la Biblioteca."}
          </p>
```

with:

```tsx
          hayFiltros(filtros) ? (
            <p className="text-cuerpo text-apagado">Ningún material coincide con esos filtros.</p>
          ) : (
            <div className="grid justify-items-start gap-3">
              <p className="text-cuerpo text-apagado">Aún no hay material en la Biblioteca.</p>
              {subir}
            </div>
          )
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec vitest run tests/unit/biblioteca-pagina-materiales.test.tsx && pnpm type && pnpm test:run && pnpm exec playwright test tests/e2e/biblioteca.spec.ts`
Expected: PASS; `tsc` clean; all unit tests green; batch 1's phone E2E still green (including the 375 px large-text check: the header wraps instead of scrolling sideways). Do not run `visual.spec.ts` or the desktop visual yet (F9, Task 20).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write "app/(app)/biblioteca/page.tsx" tests/unit/biblioteca-pagina-materiales.test.tsx
git add "app/(app)/biblioteca/page.tsx" tests/unit/biblioteca-pagina-materiales.test.tsx
git commit -m "$(cat <<'EOF'
Link Materiales to Subir and say Lo estoy procesando. after an upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part D: end to end, phone and desktop

The E2E tasks are acceptance tests on top of the unit-tested pieces, as in batch 1 (Tasks 28 to 31 there): each spec is written first and run; when one fails, the bug is fixed test-first in the unit or integration layer (a failing unit test that reproduces it, then the fix), never by bending the spec.

### Task 16: the run's store, and three uploads on the phone

**Files:**
- Modify: `tests/e2e/biblioteca-escena.ts`
- Create: `tests/e2e/biblioteca-subir.spec.ts`

- [ ] **Step 1: Write the spec.** Create `tests/e2e/biblioteca-subir.spec.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { alerta, bloquearRedExterna, disparosDeMateriales, limpiarDisparos, tocarHastaLlegar } from "./ayudas"
import { AUTORA, CREDENCIAL, objetosDelAlmacen, sembrarBiblioteca } from "./biblioteca-escena"
import { BALDE_DE_PRUEBA } from "./entorno"

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
const PNG = readFileSync(join(__dirname, "fixtures", "avatar-a.png"))
/** Three PNGs of three sizes, so the store tells which one landed at each position. */
const png = (nombre: string, extra: number) => ({
  name: nombre,
  mimeType: "image/png",
  buffer: Buffer.concat([PNG, Buffer.alloc(extra)]),
})

interface Material {
  id: string
  tipo: string
  estado: string
  rol: string
  archivo_clave: string | null
  origen_url: string | null
  texto_pegado: string | null
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarBiblioteca()
  limpiarDisparos()
})

/** Through the real "Elegir archivo" button: the native input is hidden (4d). */
async function elegirArchivos(page: Page, boton: string, archivos: { name: string; mimeType: string; buffer: Buffer }[]) {
  const selector = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: boton }).click()
  await (await selector).setFiles(archivos)
}

async function completar(page: Page, titulo: string, rol: string) {
  await page.getByLabel(/^Título/).fill(titulo)
  await page.getByLabel("Autor", { exact: true }).fill("Daniela")
  await page.getByRole("button", { name: `${AUTORA}, ${CREDENCIAL}` }).click()
  await page.getByRole("radio", { name: rol }).check()
  await page.getByRole("checkbox", { name: "Este material no contiene datos de pacientes" }).check()
}

const subir = (page: Page) => page.getByRole("button", { name: "Subir", exact: true }).click()

async function materialesCon(titulo: string): Promise<Material[]> {
  const { rows } = await pool.query<Material>(
    "select id, tipo, estado, rol, archivo_clave, origen_url, texto_pegado from public.materiales where titulo = $1",
    [titulo],
  )
  return rows
}

async function unicoCon(titulo: string): Promise<Material> {
  const [material, ...otros] = await materialesCon(titulo)
  if (!material || otros.length > 0) throw new Error(`Se esperaba un material «${titulo}»`)
  return material
}

test("Coni uploads a PDF from the Biblioteca: it goes straight to the store and the list says it is being processed", async ({
  page,
}) => {
  const titulo = "Apego adulto en la consulta"
  await page.goto("/biblioteca")
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Subir", exact: true }), /\/biblioteca\/subir$/)
  await expect(page.getByRole("heading", { name: "Subir material", level: 1 })).toBeVisible()

  await elegirArchivos(page, "Elegir archivo", [{ name: "apego.pdf", mimeType: "application/pdf", buffer: PDF }])
  await expect(page.getByRole("list", { name: "Archivos elegidos" })).toContainText("apego.pdf")
  await expect(page.getByText("Tipo: Documento")).toBeVisible()
  await completar(page, titulo, "Estudio o libro")
  await subir(page)

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  await expect(page.getByText("Lo estoy procesando.")).toBeVisible()
  const tarjeta = page.getByRole("list", { name: "Materiales" }).getByRole("listitem").filter({ hasText: titulo })
  await expect(tarjeta).toContainText("Procesando")

  const material = await unicoCon(titulo)
  expect(material).toMatchObject({ tipo: "documento", estado: "procesando", rol: "evidencia" })
  expect(material.archivo_clave).toBe(`materiales/${material.id}/original.pdf`)
  expect((await objetosDelAlmacen())[`/${BALDE_DE_PRUEBA}/${material.archivo_clave}`]).toEqual({
    bytes: PDF.byteLength,
    tipo: "application/pdf",
    firmada: true,
  })
  expect(disparosDeMateriales()).toEqual([
    { tarea: "procesar-material", materialId: material.id, clave: `procesar-material:${material.id}` },
  ])
})

test("a YouTube link asks for its transcript, keeps it with the address and starts the run", async ({ page }) => {
  const titulo = "Carga mental en video"
  const url = "https://www.youtube.com/watch?v=abc123"
  await page.goto("/biblioteca/subir")
  await page.getByLabel("Pega un enlace o elige un archivo").fill(url)
  await expect(page.getByText("Tipo: Video de YouTube")).toBeVisible()
  await expect(page.getByText(/Mostrar transcripción/)).toBeVisible()
  await completar(page, titulo, "Referente")

  await subir(page)
  await expect(alerta(page, "Pega la transcripción del video.")).toBeVisible()
  expect(await materialesCon(titulo)).toEqual([])

  await page.getByLabel("Transcripción del video").fill("Hoy hablamos de la carga mental.")
  await subir(page)

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  const material = await unicoCon(titulo)
  expect(material).toMatchObject({
    tipo: "link",
    origen_url: url,
    texto_pegado: "Hoy hablamos de la carga mental.",
    archivo_clave: null,
  })
  expect(disparosDeMateriales()).toEqual([
    { tarea: "procesar-material", materialId: material.id, clave: `procesar-material:${material.id}` },
  ])
})

test("three images keep the order she gives them, in the database and in the store", async ({ page }) => {
  const titulo = "Carrusel de pausas activas"
  await page.goto("/biblioteca/subir")
  await elegirArchivos(page, "Elegir archivo", [png("uno.png", 1), png("dos.png", 2), png("tres.png", 3)])
  await expect(page.getByText("Tipo: 3 imágenes")).toBeVisible()
  const lista = page.getByRole("list", { name: "Imágenes en orden" })
  await expect(lista.getByRole("listitem")).toHaveCount(3)

  await page.getByRole("button", { name: "Mover la imagen 3 antes" }).click()
  await expect(lista.getByRole("listitem").nth(1)).toHaveAttribute("data-nombre", "tres.png")
  await page.getByLabel("Link de referencia (no se abre)").fill("https://instagram.com/p/abc")
  await completar(page, titulo, "Referente")
  await subir(page)

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  const material = await unicoCon(titulo)
  expect(material).toMatchObject({ tipo: "imagen", origen_url: "https://instagram.com/p/abc" })
  const { rows } = await pool.query<{ orden: number; archivo_clave: string }>(
    "select orden, archivo_clave from public.materiales_archivos where material_id = $1 order by orden",
    [material.id],
  )
  expect(rows.map((fila) => fila.orden)).toEqual([1, 2, 3])
  expect(material.archivo_clave).toBe(rows[0]?.archivo_clave)
  const objetos = await objetosDelAlmacen()
  expect(rows.map((fila) => objetos[`/${BALDE_DE_PRUEBA}/${fila.archivo_clave}`])).toEqual([
    { bytes: PNG.byteLength + 1, tipo: "image/png", firmada: true },
    { bytes: PNG.byteLength + 3, tipo: "image/png", firmada: true },
    { bytes: PNG.byteLength + 2, tipo: "image/png", firmada: true },
  ])
  expect(disparosDeMateriales()).toHaveLength(1)
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec playwright test tests/e2e/biblioteca-subir.spec.ts`
Expected: FAIL in all three at the store check, `objetosDelAlmacen is not a function` (the helper does not exist yet; everything before it passes).

- [ ] **Step 3: Add the helper.** In `tests/e2e/biblioteca-escena.ts`, add `import { z } from "zod"` to the imports and append:

```ts
const Objetos = z.record(z.string(), z.object({ bytes: z.number(), tipo: z.string(), firmada: z.boolean() }))

/** What the fake R2 holds, by `/<bucket>/<key>`: size, content type and whether the PUT was presigned. */
export async function objetosDelAlmacen(): Promise<z.infer<typeof Objetos>> {
  const respuesta = await fetch(`${URL_DEL_ALMACEN}/__objetos`)
  if (!respuesta.ok) throw new Error(`El almacén falso no listó sus objetos: ${respuesta.status}`)
  return Objetos.parse(await respuesta.json())
}
```

- [ ] **Step 4: Run it to see it pass.**

Run: `pnpm exec playwright test tests/e2e/biblioteca-subir.spec.ts`
Expected: PASS (3 tests). A `403`/CORS error in the browser console on the PUT means the app signed for another endpoint: check that `playwright.config.ts` still passes `R2_ENDPOINT` (batch 1, untouched here).

- [ ] **Step 5: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca-subir.spec.ts
git add tests/e2e/biblioteca-escena.ts tests/e2e/biblioteca-subir.spec.ts
git commit -m "$(cat <<'EOF'
Test end to end a PDF, a YouTube link and three ordered images uploaded from the phone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 17: a failed upload, the ways out, and Coni only

**Files:**
- Modify: `tests/e2e/biblioteca-subir.spec.ts`

- [ ] **Step 1: Write the tests.** In `tests/e2e/biblioteca-subir.spec.ts`, change the imports to also bring `entrarComo` from `./ayudas`, `vaciarBiblioteca` from `./biblioteca-escena` and `CORREO_DEL_MANTENEDOR, URL_DEL_ALMACEN` from `./entorno`, and append:

```ts
test("a failed upload leaves no material, starts nothing and says which file failed", async ({ page }) => {
  const titulo = "Una subida que se cae"
  // Registered after bloquearRedExterna, so it is asked first: only the browser's PUT to the store is cut.
  await page.route(`${URL_DEL_ALMACEN}/**`, (ruta) =>
    ruta.request().method() === "PUT" ? ruta.abort("failed") : ruta.fallback(),
  )
  await page.goto("/biblioteca/subir")
  await elegirArchivos(page, "Elegir archivo", [{ name: "caida.pdf", mimeType: "application/pdf", buffer: PDF }])
  await completar(page, titulo, "Referente")
  await subir(page)

  await expect(alerta(page, "No pude subir caida.pdf. Revisa tu conexión e inténtalo de nuevo.")).toBeVisible()
  await expect(page).toHaveURL(/\/biblioteca\/subir$/)
  await expect(page.getByRole("link", { name: "Cancelar" })).toBeVisible()
  expect(await materialesCon(titulo)).toEqual([])
  expect(disparosDeMateriales()).toEqual([])
})

test("Volver a Biblioteca and Cancelar both go back to the list and leave nothing behind (4e)", async ({ page }) => {
  const { rows: antes } = await pool.query<{ n: number }>("select count(*)::int as n from public.materiales")
  await page.goto("/biblioteca/subir")
  await page.getByLabel("Pega un enlace o elige un archivo").fill("https://ejemplo.cl/nota")
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Volver a Biblioteca" }), /\/biblioteca$/)
  await page.goto("/biblioteca/subir")
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Cancelar" }), /\/biblioteca$/)
  const { rows: despues } = await pool.query<{ n: number }>("select count(*)::int as n from public.materiales")
  expect(despues[0]?.n).toBe(antes[0]?.n)
})

test("with nothing uploaded yet, the empty list offers Subir too", async ({ page }) => {
  await vaciarBiblioteca()
  await page.goto("/biblioteca")
  await expect(page.getByText("Aún no hay material en la Biblioteca.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Subir", exact: true })).toHaveCount(2)
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Subir", exact: true }).last(), /\/biblioteca\/subir$/)
})

test("only Coni: without a session it asks to sign in, and the maintainer is refused Subir", async ({ browser }) => {
  const sinSesion = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const visitante = await sinSesion.newPage()
  await visitante.goto("/biblioteca/subir")
  await expect(visitante).toHaveURL(/\/ingreso$/)
  await sinSesion.close()

  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const wav = await contexto.newPage()
  await wav.goto("/biblioteca/subir")
  await expect(wav.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
  await expect(wav.getByRole("form", { name: "Subir material" })).toHaveCount(0)
  await contexto.close()
})
```

- [ ] **Step 2: Run them.**

Run: `pnpm exec playwright test tests/e2e/biblioteca-subir.spec.ts`
Expected: PASS (7 tests). If the failed-upload test finds a material, `descartarMaterialAccion` was not reached: reproduce it first in `tests/unit/biblioteca-formulario-de-subida-flujo.test.tsx`.

- [ ] **Step 3: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-subir.spec.ts
git add tests/e2e/biblioteca-subir.spec.ts
git commit -m "$(cat <<'EOF'
Test end to end a failed upload, the ways back, the empty list and Coni only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 18: accessibility and large text on the phone (4c, 4n)

**Files:**
- Modify: `tests/e2e/biblioteca-subir.spec.ts`

- [ ] **Step 1: Write the tests.** In `tests/e2e/biblioteca-subir.spec.ts`, also import `conLetraGrande, revisarConAxe` from `./ayudas`, and append:

```ts
test("Subir passes WCAG 2.x AA empty, with a link, choosing the type, with images and with an error (4n)", async ({
  page,
}) => {
  const hallazgos: string[] = []
  await page.goto("/biblioteca/subir")
  hallazgos.push(...(await revisarConAxe(page, "subir vacío")))

  await page.getByLabel("Pega un enlace o elige un archivo").fill("https://youtu.be/abc123")
  await expect(page.getByLabel("Transcripción del video")).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "subir con un video de YouTube")))

  await page.getByRole("button", { name: "Cambiar el tipo" }).click()
  await expect(page.getByRole("group", { name: "¿Qué tipo de material es?" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "subir eligiendo el tipo")))
  await page.getByRole("radio", { name: "Enlace" }).check()

  await elegirArchivos(page, "Elegir archivo", [png("uno.png", 1), png("dos.png", 2)])
  await expect(page.getByRole("list", { name: "Imágenes en orden" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "subir con imágenes")))

  await subir(page)
  await expect(alerta(page, "Elige el autor.")).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "subir con un error")))
  expect(hallazgos).toEqual([])
})

test("at 375 px with large text Subir fits: nothing scrolls sideways, its buttons 44 px or more (4c)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/biblioteca/subir")
  await conLetraGrande(page)
  await page.getByLabel("Pega un enlace o elige un archivo").fill("https://www.youtube.com/watch?v=abc123")

  for (const nombre of ["Elegir archivo", "Cambiar el tipo", "Subir"]) {
    const boton = page.getByRole("button", { name: nombre, exact: true })
    await expect(boton).toBeVisible()
    expect((await boton.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  const volver = page.getByRole("link", { name: "Volver a Biblioteca" })
  expect((await volver.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  const sinDesborde = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(sinDesborde).toBe(true)
  expect(await revisarConAxe(page, "subir con letra grande")).toEqual([])
})
```

- [ ] **Step 2: Run them.**

Run: `pnpm exec playwright test tests/e2e/biblioteca-subir.spec.ts && pnpm exec playwright test tests/e2e/biblioteca.spec.ts -g "375 px"`
Expected: PASS (9 tests in the new file; batch 1's large-text check of the list still passes with "Subir" in its header). A contrast finding is fixed in the component with the existing tokens, never by excluding the node.

- [ ] **Step 3: The design rules on every new file.**

Run: `pnpm exec vitest run tests/unit/diseno-reglas.test.ts tests/unit/biblioteca-palabras.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-subir.spec.ts
git add tests/e2e/biblioteca-subir.spec.ts
git commit -m "$(cat <<'EOF'
Check Subir with axe in each state and at 375 px with large text (4c, 4n)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 19: Subir on a computer

**Files:**
- Create: `tests/e2e/biblioteca-subir.escritorio.ts`

- [ ] **Step 1: Write the spec.** Create `tests/e2e/biblioteca-subir.escritorio.ts`:

```ts
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, disparosDeMateriales, limpiarDisparos, revisarConAxe } from "./ayudas"
import { AUTORA, CREDENCIAL, sembrarBiblioteca } from "./biblioteca-escena"

// Runs only in the `escritorio` project: a computer, 1280 x 900.
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n")

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarBiblioteca()
  limpiarDisparos()
})

test("on a computer Subir reads in one column as wide as a material's detail, and uploads a PDF", async ({ page }) => {
  const titulo = "Apego adulto desde el computador"
  await page.goto("/biblioteca/subir")
  const formulario = page.getByRole("form", { name: "Subir material" })
  await expect(formulario).toBeVisible()
  const raiz = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
  expect((await formulario.boundingBox())?.width ?? 0).toBeLessThanOrEqual(42 * raiz + 1)

  const selector = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Elegir archivo" }).click()
  await (await selector).setFiles({ name: "apego.pdf", mimeType: "application/pdf", buffer: PDF })
  await page.getByLabel(/^Título/).fill(titulo)
  await page.getByLabel("Autor", { exact: true }).fill("Daniela")
  await page.getByRole("button", { name: `${AUTORA}, ${CREDENCIAL}` }).click()
  await page.getByRole("radio", { name: "Referente" }).check()
  await page.getByRole("checkbox", { name: "Este material no contiene datos de pacientes" }).check()
  await page.getByRole("button", { name: "Subir", exact: true }).click()

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  await expect(page.getByText("Lo estoy procesando.")).toBeVisible()
  await expect(page.getByRole("table", { name: "Materiales" })).toContainText(titulo)
  const { rows } = await pool.query<{ id: string }>("select id from public.materiales where titulo = $1", [titulo])
  expect(disparosDeMateriales().map((disparo) => disparo.materialId)).toEqual(rows.map((fila) => fila.id))
})

test("Subir on a computer passes WCAG 2.x AA", async ({ page }) => {
  await page.goto("/biblioteca/subir")
  await expect(page.getByRole("form", { name: "Subir material" })).toBeVisible()
  expect(await revisarConAxe(page, "subir en el computador")).toEqual([])
})
```

- [ ] **Step 2: Run it.**

Run: `pnpm exec playwright test --project escritorio tests/e2e/biblioteca-subir.escritorio.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit.**

```bash
pnpm exec biome check --write tests/e2e/biblioteca-subir.escritorio.ts
git add tests/e2e/biblioteca-subir.escritorio.ts
git commit -m "$(cat <<'EOF'
Test Subir on a computer: one reading column, a PDF upload and axe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Release

### Task 20: visual baselines of Subir, and the two Materiales baselines retaken, only after Federico looks

**Commit only after Federico approves the captures.** Do not generate or commit any baseline before Step 3. The new baselines, the two retaken ones (F9) and the tests that take them go in one commit of their own.

**Files:**
- Modify: `tests/e2e/visual.spec.ts`, `tests/e2e/biblioteca-subir.escritorio.ts`
- Create (Step 3 only): `tests/e2e/visual.spec.ts-snapshots/biblioteca-subir-app-darwin.png`, `tests/e2e/biblioteca-subir.escritorio.ts-snapshots/biblioteca-subir-escritorio-escritorio-darwin.png`
- Retake (Step 3 only): `tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png`, `tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png`

- [ ] **Step 1: Add the captures (not committed yet).** In `tests/e2e/visual.spec.ts`, append (the file already imports `sembrarBiblioteca` and has `capturaDe`):

```ts
test("biblioteca: Subir with a document picked", async ({ page }) => {
  await sembrarBiblioteca()
  await page.goto("/biblioteca/subir")
  const selector = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Elegir archivo" }).click()
  await (await selector).setFiles({
    name: "apego-adulto.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  })
  await page.getByLabel(/^Título/).fill("Apego adulto en la consulta")
  await expect(page.getByText("Tipo: Documento")).toBeVisible()
  await capturaDe(page, "biblioteca-subir")
})
```

In `tests/e2e/biblioteca-subir.escritorio.ts`, add `import { mkdirSync } from "node:fs"` and `import { join } from "node:path"` and append:

```ts
test("visual: Subir with a document picked", async ({ page }) => {
  await page.goto("/biblioteca/subir")
  const selector = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Elegir archivo" }).click()
  await (await selector).setFiles({ name: "apego-adulto.pdf", mimeType: "application/pdf", buffer: PDF })
  await page.getByLabel(/^Título/).fill("Apego adulto en la consulta")
  await expect(page.getByText("Tipo: Documento")).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, "biblioteca-subir-escritorio.png"), fullPage: true })
    return
  }
  await expect(page).toHaveScreenshot("biblioteca-subir-escritorio.png", { fullPage: true })
})
```

- [ ] **Step 2: Write review captures for Federico.**

```bash
VISUAL_FINALES=test-results/finales-subir pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca"
VISUAL_FINALES=test-results/finales-subir pnpm exec playwright test --project escritorio -g "visual"
open test-results/finales-subir
```

Expected: `biblioteca-subir.png` and `biblioteca-lista.png` (390 px, the list now with "Subir" in its header), `biblioteca-detalle.png` (unchanged), `biblioteca-subir-escritorio.png` and `biblioteca-escritorio.png` (1280 px). **Stop: ask Federico to look and say OK.** Fix what he asks for (test first where it is behaviour), regenerate the review captures, and ask again.

- [ ] **Step 3: After Federico's OK, take the baselines.**

```bash
pnpm exec playwright test tests/e2e/visual.spec.ts -g "biblioteca" --update-snapshots
pnpm exec playwright test --project escritorio -g "visual" --update-snapshots
pnpm exec playwright test tests/e2e/visual.spec.ts
pnpm exec playwright test --project escritorio
```

Expected: the last two runs pass without `--update-snapshots`; `git status` shows only the two new PNGs, the two retaken ones (`biblioteca-lista`, `biblioteca-escritorio`) and the two spec files. Any other changed baseline means a screen outside the Biblioteca moved: stop and find why.

- [ ] **Step 4: Commit them alone.**

```bash
pnpm exec biome check --write tests/e2e/visual.spec.ts tests/e2e/biblioteca-subir.escritorio.ts
git add tests/e2e/visual.spec.ts tests/e2e/biblioteca-subir.escritorio.ts \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-subir-app-darwin.png \
  tests/e2e/visual.spec.ts-snapshots/biblioteca-lista-app-darwin.png \
  tests/e2e/biblioteca-subir.escritorio.ts-snapshots \
  tests/e2e/biblioteca.escritorio.ts-snapshots/biblioteca-escritorio-escritorio-darwin.png
git commit -m "$(cat <<'EOF'
Add the visual baselines of Subir and retake the Materiales ones, reviewed by Federico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 21: the full gate

**Files:** none new.

- [ ] **Step 1: Run every check.**

Run: `pnpm lint && pnpm type && pnpm build && pnpm test:run && pnpm test:db && pnpm test:e2e`
Expected: all green (the E2E runs the `app` and `escritorio` projects, visual baselines included).

- [ ] **Step 2: Grep the new code for the banned patterns.**

Run: `git diff origin/main --name-only -- '*.ts' '*.tsx' | xargs grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|—|text-\[[0-9]|min-h-1[1-6]\b|text-error|catch \{\s*\}"`
Expected: no output (the `catch {` blocks of `youtube.ts` and `subir.ts` carry a comment line, so they do not match `catch \{\s*\}`).

- [ ] **Step 3: Check what must not change.**

```bash
git diff --stat origin/main -- components/nav-inferior.tsx app/ir-a-biblioteca supabase trigger lib/proveedores/almacen.ts playwright.config.ts
git -C /Users/fede/Projects/conidolly-ingesta status --short && git -C /Users/fede/Projects/conidolly-ingesta log -1 --format=%h
```

Expected: the first prints nothing (no change to the bar, the bridge, the database, the tasks, the store or the run's config); the second prints nothing and then `39f9887` (Ingesta untouched).

- [ ] **Step 4: Nothing to commit** unless Step 2 or 3 led to a fix (commit it with its task's message style and rerun Step 1).

## Release (controller, not plan tasks)

The controller does these after Task 21 and the code review, under Federico's standing release authorization: the R2 CORS rule of spec section 4 (second rule on bucket `estudio-coni`: origin `https://conidolly.vercel.app`, PUT/GET/HEAD, header `content-type`, expose `ETag`, max age 3600; Ingesta's `conidolly-ingesta-subidas` untouched; read back to verify) right before the merge, then the PR ("Part of #17", never "Closes"), CI, merge, the production check (`/biblioteca/subir` redirects to sign-in without a session) and Federico's real PDF upload with Coni's account. No migration, no Trigger deploy, no new env var.

---

## Self-review against the spec

| Spec section | Where |
|---|---|
| Context: no migration, no Trigger deploy, tab still opens Ingesta | F1 (RLS checked), Rules, Task 21 Step 3 |
| 1. Page `app/(app)/biblioteca/subir/page.tsx`, `exigirConi()`, section's loading/error/not-found | Task 14; Task 17 (no session, maintainer refused) |
| 1. Not a tab: "Subir" in the Materiales header and its empty state | Task 15; Tasks 16 and 17 (E2E) |
| 1. "← Volver a Biblioteca" top left, quiet "Cancelar" next to "Subir" (4e) | Tasks 12, 14; Task 17 |
| 1. Phone one column; desktop reading column like the detail, no side panel | Task 14 (`md:max-w-[42rem]`); Task 19 |
| 2. One field "Pega un enlace o elige un archivo" with its own "Elegir archivo", names below, never the native button (4d, 4k) | Task 12 (D4); Task 16 (filechooser) |
| 2. `detectarTipo` in `lib/dominio/biblioteca/subir.ts`, every row of the table | Tasks 1 and 3 (D5) |
| 2. Detected type as an editable fact, six types from `TIPOS_DE_MATERIAL` / `ETIQUETA_DE_TIPO`, manual wins until the input changes | Tasks 3 (`tipoEfectivo`), 10, 12 (D10) |
| 2. Extras: YouTube transcript with `PASOS_DE_YOUTUBE`; podcast line; post text + optional video; video/imagen reference link; images ordered with ← → and Quitar | Tasks 1, 11, 12; Task 16 |
| 2. Kept from Ingesta: optional title, `SelectorDeAutor` with "Autor nuevo", "¿Quién es para ti?" with four roles, "Lo dijo Coni" picks Coni, patients box | Task 12 (D7) |
| 2. Input rules (`leerEntrada`): 2 GB, 20 images, extensions per type, link, transcript, post text; server runs them again | Tasks 2, 6, 12 |
| 3. `crearMaterial`: row as Coni (+ `materiales_archivos`), one PUT per file for 1 h with content type; failed signature or image insert deletes the row | Task 6 (D2) |
| 3. Browser PUTs straight to R2 (`subirArchivos` in `app/(app)/biblioteca/subir/subida-cliente.ts`), "Subiendo 1 de N" | Tasks 4, 5, 13 |
| 3. `confirmarMaterial`: `tamano` of every file (missing, empty, over 2 GB deletes with a plain message), `disparos.material(id)`, failed disparo marks and says saved, second confirm no-op | Task 7 (D3, D8) |
| 3. `descartarMaterial` only while `procesando` and by Coni | Task 8 (D8); Task 17 |
| 3. After confirm `/biblioteca` with "Lo estoy procesando.", auto-refresh takes over; cost unchanged; `revalidatePath("/biblioteca")` | Tasks 4, 13, 15 (D6, D9); Task 16 |
| 4. R2 CORS | Release (controller) note only, as asked |
| 5. Unit: `detectarTipo` (rows, uppercase, links with spaces, text vs link), manual wins, `leerEntrada`, `subirArchivos` (order, content type, failure), the page's pure labels | Tasks 1 to 5, 10 to 15 |
| 5. Integration: create, confirm, discard as Coni; WAV refused on all three; discard never deletes a ready material; confirm with a missing file deletes | Tasks 6, 7, 8 |
| 5. E2E phone and desktop: PDF; YouTube with transcript; three images reordered; failed PUT leaves no material; Volver and Cancelar; each confirm records a `procesar-material` disparo; axe; large text; design rules on every new file | Tasks 16 to 19 (D11) |
| 5. Visual baselines Subir phone and desktop, committed after Federico looks | Task 20 (plus the two retaken Materiales baselines, F9) |
| 6. Release: merge plus CORS, no migration/deploy/env var, production redirect check, Federico's real PDF | Release (controller) note |
| Out of scope (repeated material, Gemini, shared card, immediate processing, tab switch) | Not planned; Task 21 Step 3 checks the tab is unchanged |

Type and name check across tasks: `Deteccion`, `detectarTipo`, `tipoEfectivo`, `SubidaFirmada`, `EXTENSIONES_POR_TIPO`, `ACEPTA_TODO`, `ACEPTA_VIDEO`, `PESA_DEMASIADO`, `DEMASIADAS_IMAGENES`, `TAMANO_MAXIMO_BYTES` (Tasks 2 and 3) are the names Tasks 4, 6, 7 and 12 import; `armarEntrada`, `EntradaDeSubida`, `juntarArchivos`, `moverArchivo`, `progresoDeSubida`, `PREPARANDO`, `GUARDANDO`, `HREF_TRAS_SUBIR`, `AVISO_TRAS_SUBIR`, `RUTA_DE_SUBIR`, `vieneDeSubir` (Task 4) are what Tasks 12, 13 and 15 use; `DepsSubir`, `crearMaterial(deps, entrada)`, `confirmarMaterial(deps, materialId)`, `descartarMaterial({ db }, materialId)` (Tasks 6 to 8) match Task 9's wrappers; `crearMaterialAccion(entrada)`, `confirmarMaterialAccion(materialId)`, `descartarMaterialAccion(materialId)` (Task 9) match Task 13's calls and mocks; `objetosDelAlmacen` (Task 16) is what Tasks 16 to 18 call.
