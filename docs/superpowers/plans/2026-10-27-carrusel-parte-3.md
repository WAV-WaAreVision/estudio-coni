# LinkedIn Carousels, Part 3 (automatic publishing through the Documents API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the time Coni approved at gate 2, Conidolly posts the carousel to her LinkedIn profile by itself (the
approved PDF as a document, the approved post text as `commentary`, the cover slide as the document title); every case
that cannot post goes to part 2's manual path (`para_subir_a_mano`) with the reason, and a send in doubt is never resent.

**Architecture:** A carousel branch of the LinkedIn publisher, `resolverLinkedinCarrusel`
(`lib/publicacion/linkedin-carrusel.ts`), with the same contract and the same resumable, one-step-per-tick shape as the
reel's `resolverLinkedin`: read the row, settle doubt and exhausted tries first, check the connection, check the bound
version against gate 2 (`puedePublicar` now takes the `carruselId`), upload the bound version's PDF once
(`subirDocumento`, `documento_urn` stored), poll it (`estadoDelDocumento`), re-check, reserve (`reservar_envio_linkedin`,
widened in SQL to a document row), post (`crearPost` with a document and title), store the post. `procesar` sends a
carousel to `publicarCarrusel`, which maps the outcome: `listo` closes the piece as `publicado`, `en_curso` waits for the
next tick, `guardia` fails it with part 2's guard text, everything else is handed over by `entregarCarrusel` with the
row's reason in the notice. Gate 2 shows one line about whether it will post by itself, read from the stored token expiry
on the server. The reel path does not change.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (security definer RPC), Trigger.dev v4 (no task change; redeploy
only to ship the code), LinkedIn REST `Linkedin-Version: 202609`, Zod 4, Vitest + Testing Library + MSW 2, Playwright
Test + axe, Biome, pnpm.

---

**Spec:** `docs/superpowers/specs/2026-10-27-conidolly-carrusel-linkedin-parte-3-design.md` (the source of truth; P3-1 to
P3-5, Tests, Rollout). Parent: `docs/superpowers/specs/2026-10-26-conidolly-carrusel-linkedin-design.md` D6. Out of
scope: Métricas (a carousel already counts as a LinkedIn row), editing a live post, comments, other networks.

**Main as read for this plan (`b106177`, 2026-10-27):**

- `lib/publicacion/publicar.ts`: `procesar` sends every `tipo = 'carrusel'` to `entregarCarrusel` before
  `resolverLinkedin`; `entregarCarrusel` checks `puedeEntregarseParaSubir` with `hashTextoDeCarrusel(version)` and
  `carruselId`, refuses with `EXPLICACION_CAMBIO_CARRUSEL` (through `fallar`), then `entregar_para_subir`; `cerrarPublicada`
  writes the `publicado` event; `avisarLinkedinPublicado` says "Tu reel «…» ya está publicado en LinkedIn".
- `lib/publicacion/linkedin.ts`: `resolverLinkedin`, private `aMano` (WAV subject hardcoded "LinkedIn no publicó un
  reel"), `antesDeEnviar`, `vigente`, `plazoVencido` (12 min), `esperarVideo`, `enviar`, `guardarPost`.
- `lib/proveedores/linkedin.ts`: `subirVideo`, `estadoDelVideo`, `crearPost({ token, miembro, video, commentary })`
  (no title), `TokenDeLinkedinVencido`, `RechazoDeLinkedin`, `RespuestaDudosa`, `VERSION_DE_LINKEDIN = "202609"`,
  `llamar` (timeouts, never prints the URL), `cabeceras`.
- `lib/dominio/linkedin.ts`: `FilaDeLinkedin { estado, videoUrn, enviadoEn, postUrn, intentos }`,
  `siguientePasoLinkedin` (`nada`, `dudosa`, `a_mano`, `subir_video`, `esperar_video`), `MAXIMO_DE_INTENTOS_LINKEDIN = 3`,
  `aLittleText`, `enlaceDePost`.
- `lib/datos/repositorio.ts`: `leerFilaLinkedin` (selects no `documento_urn`), `escribirFilaLinkedin` (only the
  `esperando` row), `guardarVideoLinkedin`, `sumarIntentoLinkedin({ error, borrarVideo })`, `reservarEnvioLinkedin`,
  `guardarPostLinkedin`, `pasarLinkedinAMano`, `leerConexionLinkedin`, `leerVencimientoLinkedin`, `leerPublicaciones`.
- `lib/datos/carrusel.ts`: `leerVersion(db, id)` returns `VersionDeCarrusel` with `laminas`, `textoPost`, `pdfClave`.
- `lib/dominio/puertas.ts`: `puedePublicar(pieza, { hashTexto, ahora })` passes `actual` to `aprobacionVigente`, which
  already compares `carruselId` for a carousel, but its parameter type has no `carruselId`, so a carousel is always
  `artefacto_cambio` there (part 2 on purpose; `tests/unit/puertas-carrusel.test.ts` "is never published by the API path
  in part 2").
- `lib/dominio/estados.ts`: `EVENTOS_DE_CARRUSEL` has no `"publicado"`, so `transicionar(carrusel programado,
  { tipo: "publicado" })` throws (`tests/unit/estados-carrusel-armado.test.ts` "never publishes by itself or expires in
  part 2"). The SQL side already allows it: `proteger_pieza` (as of `20261027000120`) lists `publicado` among a carousel's
  states that need the latest `hash_texto`, and `publicado` is not in the `solo_coni_entra_a_puerta` list.
- `supabase/migrations/20261007000110_linkedin_publicacion.sql`: `reservar_envio_linkedin` requires `video_urn is not
  null`. `20261026000110_carrusel.sql`: `publicaciones.documento_urn` with `documento_urn_es_de_documento`
  (`^urn:li:document:[A-Za-z0-9_-]+$`) and `un_solo_medio`. `reservar_envio_linkedin` was never redefined after
  `20261007000110`. Last migration on main: `20261027000150`.
- `app/(app)/guion/[id]/carrusel.tsx` (`VistaDeCarrusel`): gate 2 builds `DatosDePuerta2Carrusel`; `programado` says
  `TEXTO_PROGRAMADO_CARRUSEL` ("A esa hora te dejo el PDF y el texto para que lo subas a LinkedIn."); `para_subir_a_mano`
  shows no reason; there is no `publicado` case (it falls to "Esta pieza ya no está en curso.").
- `lib/inicio/modelo.ts` `avisoDePublicacion` says "La etiqueta de IA quedó puesta en Instagram." for every published
  piece.
- Tests: `tests/linkedin-msw.ts` (`simularLinkedin`, no documents), `tests/unit/linkedin-proveedor.test.ts`,
  `tests/unit/linkedin-dominio.test.ts`, `tests/integration/publicar-linkedin.test.ts`,
  `tests/integration/publicar-carrusel.test.ts` (part 2: "not one call to LinkedIn"),
  `tests/integration/linkedin-publicacion-esquema.test.ts`, `tests/integration/flujo.ts` (`crearCarruselEn`, its
  `programado` version has `pdf_clave = carruseles/<pieza>/<version>/carrusel.pdf`), `tests/integration/siembra.ts`
  (`sembrarCarrusel`), `tests/e2e/carrusel.spec.ts`, `tests/e2e/escena.ts` (`sembrarCarruselDeEscena`),
  `tests/e2e/ayudas.ts` (`conectarLinkedin` with a token for 9.5 days, `desconectarLinkedin`), `tests/e2e/visual.spec.ts`,
  `tests/e2e/accesibilidad.spec.ts`.

**Branch and worktree:** `feat/carrusel-3` in `.worktrees/carrusel-3`, from `main` at this plan's commit.

## LinkedIn API, verified on 2026-10-27 (learn.microsoft.com, `?view=li-lms-2026-09`; every page lists the moniker `li-lms-2026-09`)

Documents API (`marketing/community-management/shares/documents-api`, page dated 2026-06-19):

- `POST https://api.linkedin.com/rest/documents?action=initializeUpload`, headers `Linkedin-Version: YYYYMM` and
  `X-Restli-Protocol-Version: 2.0.0`, body `{ "initializeUploadRequest": { "owner": "<urn>" } }` (a person URN owner is
  allowed: "the caller must match the document owner"). `SYNCHRONOUS_UPLOAD` is not supported.
- Response: `{ "value": { "uploadUrlExpiresAt": <ms>, "uploadUrl": "https://www.linkedin.com/dms-uploads/...", "document": "urn:li:document:C5F10AQGKQg_6y2a4sQ" } }`.
- Upload: the sample is `curl -i --upload-file Mydoc.pdf -H 'Authorization: Bearer …' "<uploadUrl>"` (a PUT, **with**
  the bearer token, unlike the video parts); sample answer `HTTP/2 201`, empty body.
- `GET https://api.linkedin.com/rest/documents/{urn}`: `{ owner, downloadUrl, downloadUrlExpiresAt, id, status }`;
  `status` is `PROCESSING`, `PROCESSING_FAILED`, `AVAILABLE` or `WAITING_UPLOAD`. No failure-reason field is documented.
- Limits: 100 MB and 300 pages; PPT, PPTX, DOC, DOCX, PDF. Permission `w_member_social` for a member. 403
  `DOCUMENT_FORBIDDEN` when the actor does not own the document.
- Post: `POST /rest/posts` with `content.media = { "title": "Example.pdf", "id": "urn:li:document:…" }`; `201 Created`
  with the id in `x-restli-id`.

Post schema (`post-api-schema`): `Media.title` is "The media title (Required field for Documents API)"; no length limit
is documented for `title` (nor for `commentary`; the Posts API only lists `400 FIELD_LENGTH_TOO_LONG`). Posts API
(`posts-api`): documents are supported for organic posts; `201` with `x-restli-id` (`urn:li:share:…` or
`urn:li:ugcPost:…`).

**Not verified (the first real carousel is the test, spec option A):** F3 (a member app may call `/rest/documents` at
all); the `Content-Type` of the PUT (the docs' curl sends none; this plan sends `application/octet-stream`, as the video
parts); whether the PUT can answer 200 instead of 201 (the code accepts any 2xx); a title length limit (the cover is at
most 90 characters by part 1's limits); the charset of a document URN beyond the documented samples (the DB check allows
`[A-Za-z0-9_-]`, which covers them).

## Decisions the spec did not settle (the plan picks the bracketed default and goes on)

- P1. **The carousel branch lives in its own file** `lib/publicacion/linkedin-carrusel.ts` (the spec names
  `lib/publicacion/linkedin.ts`), importing the shared helpers that `linkedin.ts` now exports (`aMano`, `antesDeEnviar`,
  `plazoVencido`, `guardarPost`, `ResultadoLinkedin`). Keeps `linkedin.ts` the reel's file, under 300 lines [yes].
- P2. **Not connected or expired:** the carousel's LinkedIn row is settled to `para_subir` with `LINKEDIN_SIN_CONEXION`
  as its `explicacion` (so her screen and the notice say why), **without** a WAV alert (it is not a failure). A 401 during
  the run keeps the existing `EXPLICACION_LINKEDIN_RECONECTAR` [yes].
- P3. **A definitive 4xx before sending** (`RechazoDeLinkedin`: e.g. 403 or 422 at initializeUpload) goes to manual at
  once with the carousel rejection text, as the video path does; temporary errors count a try (P3-2) [yes].
- P4. **The PUT carries `Authorization: Bearer`** (as the docs' sample) and `Content-Type: application/octet-stream`
  [yes; unverified, see above].
- P5. **`content.media.title` is the cover slide's text as stored** (`laminas[0].texto`), no truncation [yes].
- P6. **A PDF over 100 MB** goes to manual with the rejection text (cannot happen at 8 pages; a guard, not a feature)
  [yes].
- P7. **Resume after a lost close:** a row already `publicado` (post saved) while the piece is still `programado` is
  closed as `publicado` with the notice, never handed over [yes; the reel path does the same through `cerrarPublicada`].
- P8. **`puedePublicar` gains an optional `carruselId`**, reusing the half-hour logic; without it a carousel is still
  `artefacto_cambio` [yes].
- P9. **Screens the spec does not name:** `programado` says "A esa hora se publica solo en LinkedIn." when the connection
  will be alive then (else part 2's text); a new `publicado` state screen ("Publicado en LinkedIn", "Salió solo a la hora
  que elegiste.", "Ver en LinkedIn"); `para_subir_a_mano` shows the LinkedIn row's reason; Inicio's published notice for a
  carousel says "Salió solo en LinkedIn." instead of the Instagram line. Reels unchanged [yes].
- P10. **WAV's subject names the type** ("LinkedIn no publicó un carrusel" / "…un reel") [yes].
- P11. **The published notice:** `Tu carrusel «…» se publicó en LinkedIn. Míralo aquí: <enlace>` (urgent false, kind
  `publicado`, key with `linkedin`) [yes].
- P12. **`EXPLICACION_CAMBIO_CARRUSEL` is reused as written** ("…así que no te lo dejé para subir. WAV ya está
  revisando."): nothing is posted either way [yes].
- P13. **No new Trigger.dev task or config**: `publicar` already runs `publicarPendientes`; the deploy only ships code
  [yes].

Copy (es-CL, tú, no em dashes, "carrusel", never "video"): `LinkedIn no aceptó el carrusel, así que te lo dejé para subir a
mano. WAV ya está revisando.`, `No pude confirmar si LinkedIn publicó tu carrusel. Revisa tu perfil de LinkedIn: si no
está, súbelo a mano desde aquí.`, `Se publica solo en LinkedIn a esa hora.`, `LinkedIn no está conectado: te lo dejo para
subir a mano.`, `A esa hora se publica solo en LinkedIn.`, `Publicado en LinkedIn`, `Salió solo a la hora que elegiste.`,
`Ver en LinkedIn`, `Salió solo en LinkedIn.`, `Tu carrusel «…» se publicó en LinkedIn. Míralo aquí: …`; existing:
`LINKEDIN_SIN_CONEXION`, `EXPLICACION_LINKEDIN_TARDE`, `EXPLICACION_LINKEDIN_RECONECTAR`, `EXPLICACION_CAMBIO_CARRUSEL`.

**Rules (every task):**

- Strict TDD: failing test, run it red, minimum code, run it green, commit. One commit per cycle.
- MSW for every LinkedIn call (`tests/linkedin-msw.ts`, `onUnhandledRequest: "error"`); local Supabase only
  (`pnpm db:start`; `colima start` first if Docker is down). Never touch the hosted project (`mvfytttfxmzzjajecsch`).
  Never read or print `.env*`, the Vault or any token.
- Never `as any`, `@ts-expect-error`, non-null assertions (`!`) or silent catches (every `catch` narrows and rethrows
  what it does not handle).
- Biome safe mode only (`pnpm check`, never `--unsafe`). After it: `grep -L '^"use client"' $(grep -rl 'use client' app components)` prints nothing.
- No hex in `app/` or `components/`; tokens only. Before each commit: `git diff --cached | grep -- '—'` prints nothing.
- Migrations append-only from `20261028000100`. `set search_path = ''`. Regenerate types after the migration:
  `pnpm db:reset && pnpm db:types` (the function's signature does not change, so `git diff lib/supabase/database.types.ts`
  is expected empty).
- **The reel path does not change:** `tests/integration/publicar-linkedin.test.ts`, `tests/integration/publicar.test.ts`,
  `tests/unit/linkedin-proveedor.test.ts` stay green without edits (except the one literal of Task 4).
- Commits in English, imperative, blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage only your paths (`git add <paths>`, never `-A`). Do not push, do not deploy: Task 21 is Federico's runbook.

**Commands:** `pnpm type` · `pnpm test:run [tests/unit/<file>]` · `pnpm db:reset && pnpm test:db [tests/integration/<file>]`
· `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell pnpm test:e2e [tests/e2e/<file>]`
(abbreviated `pnpm test:e2e`) · `pnpm build` · lint: `pnpm exec biome check lib app components trigger scripts tests supabase`.

**Known red window:** part 2 tests that assert "a carousel never posts" go red on purpose and are rewritten in the task
that flips them: `tests/unit/estados-carrusel-armado.test.ts` "never publishes by itself…" (Task 2),
`tests/unit/puertas-carrusel.test.ts` "is never published by the API path in part 2" (Task 3),
`tests/integration/publicar-carrusel.test.ts` "is handed to Coni… not one call to LinkedIn" (Task 9). Visual baseline
`carrusel-puerta-2` changes (the LinkedIn line, Task 18); new baseline `carrusel-publicado`.

## Lotes (batches for subagent-driven execution, one reviewer per lote)

| Lote | Tasks | Depends on | Parallel with |
|---|---|---|---|
| 0 Setup | 0 | none | none |
| 1 Schema | 1 | 0 | 2, 3 |
| 2 Domain and data | 2, 3, 4, 5 | 0 | 1, 3 |
| 3 Provider | 6, 7, 8 | 0 | 1, 2 |
| 4 Publisher | 9, 10, 11, 12, 13 | 1, 2, 3 | none |
| 5 Screens | 14, 15, 16 | 4 | none |
| 6 E2E, baselines, axe | 17, 18 | 5 | none |
| 7 Docs and verification | 19, 20 | 6 | none |
| 8 Deploy runbook | 21 | 7 | none |

Each lote ends with a reviewer checkpoint: `superpowers:code-reviewer` with this plan's decisions and the lote's tasks;
findings are fixed test-first before the next lote. Lotes 1, 2, 3 touch disjoint files (`supabase/migrations/*` +
`tests/integration/linkedin-documento-esquema.test.ts`; `lib/dominio/*`, `lib/datos/repositorio.ts`; `lib/proveedores/linkedin.ts`,
`tests/linkedin-msw.ts`); the controller serializes commits.

## File structure

| File | Change | Responsibility | Task |
|---|---|---|---|
| `supabase/migrations/20261028000100_linkedin_documento.sql` | create | `reservar_envio_linkedin` reserves a document row too | 1 |
| `tests/integration/linkedin-documento-esquema.test.ts` | create | Reservation, `un_solo_medio`, a carousel closing as `publicado` | 1 |
| `lib/dominio/estados.ts` | modify | `"publicado"` in `EVENTOS_DE_CARRUSEL` | 2 |
| `lib/dominio/puertas.ts` | modify | `puedePublicar` takes `carruselId` | 3 |
| `lib/dominio/linkedin.ts` | modify | `FilaDeLinkedin.documentoUrn`, `siguientePasoLinkedin(fila, medio)` | 4 |
| `lib/datos/repositorio.ts` | modify | `leerFilaLinkedin` reads `documento_urn`, `guardarDocumentoLinkedin`, `sumarIntentoLinkedin` `borrarDocumento` | 5 |
| `tests/integration/linkedin-documento-datos.test.ts` | create | The data helpers on a carousel row | 5 |
| `tests/linkedin-msw.ts` | modify | Documents API simulated | 6 |
| `lib/proveedores/linkedin.ts` | modify | `subirDocumento`, `estadoDelDocumento`, `crearPost` with a document | 6, 7, 8 |
| `tests/unit/linkedin-documentos.test.ts` | create | Provider tests for documents | 6, 7, 8 |
| `lib/publicacion/linkedin.ts` | modify | Export helpers; `aMano` subject by type; `antesDeEnviar` rejection text | 9 |
| `lib/publicacion/linkedin-carrusel.ts` | create | `resolverLinkedinCarrusel` | 9 to 13 |
| `lib/publicacion/publicar.ts` | modify | `publicarCarrusel`, `rechazarCarrusel`, `avisarCarruselPublicado`, reason in `entregarCarrusel` | 9, 10, 12 |
| `tests/integration/publicar-carrusel.test.ts` | rewrite | The publisher end to end with MSW | 9 to 13 |
| `app/(app)/guion/[id]/linea-de-linkedin.ts` | create | `saleSoloEnLinkedin`, the gate 2 and `programado` lines | 14 |
| `app/(app)/guion/[id]/puerta-2-carrusel.tsx` | modify | The line under the date | 14 |
| `app/(app)/guion/[id]/carrusel.tsx` | modify | Pass the expiry; `programado`, `para_subir_a_mano` reason, `publicado` | 14, 15 |
| `tests/unit/linea-de-linkedin.test.ts`, `tests/unit/puerta-2-carrusel.test.tsx` | create, modify | The line | 14 |
| `lib/inicio/modelo.ts`, `tests/unit/inicio-modelo.test.ts` | modify | A carousel's published notice | 16 |
| `tests/integration/flujo.ts` | modify | `crearCarruselEn(…, "publicado")` | 15 |
| `tests/e2e/carrusel.spec.ts` | modify | Gate 2 lines, published, manual with reason | 17 |
| `tests/e2e/visual.spec.ts`, `tests/e2e/accesibilidad.spec.ts`, snapshots | modify | Baselines and axe | 18 |
| `docs/TRASPASO.md`, `docs/PRODUCT.md` | modify | Part 3 entry | 19 |

---

## Lote 0: Setup

### Task 0: Worktree and baseline

**Files:** none.

- [ ] **Step 1: Create the worktree from `main`**

```bash
cd /Users/fede/Projects/estudio-coni
git status --short   # only the untracked .impeccable/ folders
git log --oneline -1 # this plan's commit, after b106177
git worktree add .worktrees/carrusel-3 -b feat/carrusel-3 main
cd .worktrees/carrusel-3
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Local database and baseline**

```bash
supabase status || (colima start && pnpm db:start)
pnpm db:reset
pnpm type && pnpm test:run && pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-base-carrusel-3.txt
```

Expected: all green. Write down the unit and integration counts (Task 20 compares).

- [ ] **Step 3: No commit.**

---

## Lote 1: Schema

### Task 1: `reservar_envio_linkedin` reserves a document row (`20261028000100_linkedin_documento.sql`)

**Files:**
- Create: `supabase/migrations/20261028000100_linkedin_documento.sql`
- Create: `tests/integration/linkedin-documento-esquema.test.ts`

- [ ] **Step 1: Write the failing test** `tests/integration/linkedin-documento-esquema.test.ts`

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { pool } from "./db"
import { PUBLICAR_EN } from "./programadas"
import { borrarSembrado, leerFila, publicacionesConDetalle, sembrarCarrusel } from "./siembra"

const DOCUMENTO = "urn:li:document:D5510AQprueba"
const creadas: string[] = []
afterEach(async () => {
  await borrarSembrado(creadas, [])
  creadas.length = 0
})
afterAll(() => pool.end())

async function programado(): Promise<string> {
  const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
  creadas.push(id)
  return id
}

async function version(id: string): Promise<number> {
  return (await leerFila(id)).version
}

describe("reservar_envio_linkedin for a carousel (part 3, P3-4)", () => {
  it("reserves a row with its document, marks it sent and bumps the piece once", async () => {
    const id = await programado()
    await pool.query("update public.publicaciones set documento_urn = $2 where pieza_id = $1", [id, DOCUMENTO])
    const antes = await version(id)
    const { rows } = await pool.query<{ v: number }>("select public.reservar_envio_linkedin($1, $2) as v", [id, antes])
    expect(rows[0]?.v).toBe(antes + 1)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila?.enviado_en).not.toBeNull()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, antes + 1])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("still refuses a row with neither a video nor a document", async () => {
    const id = await programado()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, await version(id)])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("still refuses a stale version", async () => {
    const id = await programado()
    await pool.query("update public.publicaciones set documento_urn = $2 where pieza_id = $1", [id, DOCUMENTO])
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, 0])).rejects.toThrow(
      /version_desfasada/,
    )
  })

  it("keeps one medium per row", async () => {
    const id = await programado()
    await expect(
      pool.query("update public.publicaciones set documento_urn = $2, video_urn = 'urn:li:video:C1' where pieza_id = $1", [
        id,
        DOCUMENTO,
      ]),
    ).rejects.toThrow(/un_solo_medio/)
  })

  it("lets the service close a carousel as publicado once its LinkedIn row has the post", async () => {
    const id = await programado()
    await pool.query(
      `update public.publicaciones set documento_urn = $2, enviado_en = now(), estado = 'publicado',
         post_urn = 'urn:li:share:71', enlace = 'https://www.linkedin.com/feed/update/urn:li:share:71/', marcado_en = now()
       where pieza_id = $1`,
      [id, DOCUMENTO],
    )
    const c = await pool.connect()
    try {
      await c.query("begin")
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })])
      await c.query("set local role service_role")
      await c.query("update public.piezas set estado = 'publicado', version = version + 1 where id = $1", [id])
      await c.query("commit")
    } finally {
      c.release()
    }
    expect((await leerFila(id)).estado).toBe("publicado")
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm db:reset && pnpm test:db tests/integration/linkedin-documento-esquema.test.ts`
Expected: FAIL on the first test (`linkedin_no_espera`: the function requires `video_urn`); the other four PASS
already (they pin what must not change). If the last one fails, stop: the SQL premise of this plan is wrong.

- [ ] **Step 3: The migration** `supabase/migrations/20261028000100_linkedin_documento.sql`

```sql
-- Carousels part 3 (design 2026-10-27, P3-4): reservar_envio_linkedin as of 20261007000110, plus a carousel's row
-- reserves with its document. Everything else is unchanged: version lock, programado, enviado_en once, never twice.
create or replace function public.reservar_envio_linkedin(p_pieza uuid, p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_nueva integer;
begin
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado <> 'programado' then
    raise exception using errcode = 'P0001', message = 'estado_no_publicable';
  end if;
  update public.publicaciones
     set enviado_en = now()
   where pieza_id = p_pieza and destino = 'linkedin' and estado = 'esperando'
     and (video_urn is not null or documento_urn is not null) and enviado_en is null and post_urn is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'linkedin_no_espera';
  end if;
  update public.piezas set version = version + 1 where id = p_pieza returning version into v_nueva;
  return v_nueva;
end $$;

revoke execute on function public.reservar_envio_linkedin(uuid, integer) from public, anon, authenticated;
grant execute on function public.reservar_envio_linkedin(uuid, integer) to service_role;
```

- [ ] **Step 4: Run it green, plus the reel's schema suite, and regenerate types**

Run: `pnpm db:reset && pnpm test:db tests/integration/linkedin-documento-esquema.test.ts tests/integration/linkedin-publicacion-esquema.test.ts && pnpm db:types && git diff --stat lib/supabase/database.types.ts`
Expected: PASS; the types diff is empty (same signature).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261028000100_linkedin_documento.sql tests/integration/linkedin-documento-esquema.test.ts
git commit -m "Let reservar_envio_linkedin reserve a carousel's document row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Lote 2: Domain and data

### Task 2: A scheduled carousel may close as `publicado`

**Files:** Modify `lib/dominio/estados.ts`, `tests/unit/estados-carrusel-armado.test.ts`

- [ ] **Step 1: Rewrite the part 2 test** "never publishes by itself or expires in part 2, and a reel never takes a
carousel event" (near line 127) as:

```ts
  it("closes as publicado when LinkedIn posted it (part 3), never expires, and a reel never takes a carousel event", () => {
    const programado = transicionar(carrusel("carrusel_por_aprobar"), aprobar()).pieza
    expect(transicionar(programado, { tipo: "publicado" }).pieza).toMatchObject({ estado: "publicado" })
    expect(() => transicionar(programado, { tipo: "hora_vencida" })).toThrow(TransicionInvalida)
    const reel = { ...piezaNueva("reel"), estado: "video_por_aprobar" as const }
    expect(() => transicionar(reel, aprobar())).toThrow(TransicionInvalida)
    expect(() => transicionar(reel, { tipo: "cambiar_diseno" })).toThrow(TransicionInvalida)
  })
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/estados-carrusel-armado.test.ts`
Expected: FAIL (`TransicionInvalida` for `publicado`).

- [ ] **Step 3: Implement.** In `lib/dominio/estados.ts`, add `"publicado"` to `EVENTOS_DE_CARRUSEL` right after
`"entregar_para_subir"`, and change its comment's last sentence to: `Never a voice, an avatar, a video or Instagram; since
part 3 LinkedIn posts it by itself ("publicado") or it goes by hand.` Do not add it to `SOLO_DE_CARRUSEL` (reels take it
too).

- [ ] **Step 4: Run green**

Run: `pnpm test:run tests/unit/estados-carrusel-armado.test.ts tests/unit/carrusel-sin-reel.test.ts tests/unit/estados.test.ts`
Expected: PASS (`carrusel-sin-reel` still holds: `publicado` is invalid from every pre-gate-2 state it checks).

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/estados.ts tests/unit/estados-carrusel-armado.test.ts
git commit -m "Let a scheduled carousel close as published

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `puedePublicar` binds a carousel by its version (decision P8)

**Files:** Modify `lib/dominio/puertas.ts`, `tests/unit/puertas-carrusel.test.ts`

- [ ] **Step 1: Replace** the test "is never published by the API path in part 2" with:

```ts
  it("is published by the API path only with its bound version, inside the half hour (part 3)", () => {
    const ahora = "2026-10-29T22:01:00.000Z"
    expect(puedePublicar(programado, { hashTexto: HASH, carruselId: CARRUSEL, ahora })).toEqual({ ok: true })
    expect(puedePublicar(programado, { hashTexto: HASH, ahora })).toEqual({ ok: false, motivo: "artefacto_cambio" })
    expect(puedePublicar(programado, { hashTexto: HASH, carruselId: "otro", ahora })).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
    expect(puedePublicar(programado, { hashTexto: "b".repeat(64), carruselId: CARRUSEL, ahora })).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
    expect(
      puedePublicar(programado, { hashTexto: HASH, carruselId: CARRUSEL, ahora: "2026-10-29T22:31:00.000Z" }),
    ).toEqual({ ok: false, motivo: "hora_vencida" })
    expect(
      puedePublicar(programado, { hashTexto: HASH, carruselId: CARRUSEL, ahora: "2026-10-29T21:59:00.000Z" }),
    ).toEqual({ ok: false, motivo: "antes_de_hora" })
  })
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/puertas-carrusel.test.ts`
Expected: FAIL (type error on `carruselId` under `pnpm type`; at runtime the field is passed through, so check with
`pnpm type` too: it must report `Object literal may only specify known properties`).

- [ ] **Step 3: Implement.** In `lib/dominio/puertas.ts`:

```ts
/** The publish task calls this right before publishing; it never publishes at an unapproved time. */
export function puedePublicar(
  pieza: Pieza,
  actual: { hashTexto: string; carruselId?: string; ahora: string },
): Veredicto {
  // A carousel is bound by its version (`carruselId`, part 3): without it, it is refused.
  const vigente = aprobacionVigente(pieza, actual)
```

(the rest of the body unchanged; replace the part 2 comment line "A carousel is never published by this path in part 2…").

- [ ] **Step 4: Run green**

Run: `pnpm test:run tests/unit/puertas-carrusel.test.ts tests/unit/puertas.test.ts tests/unit/carrusel-sin-reel.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/puertas.ts tests/unit/puertas-carrusel.test.ts
git commit -m "Let the publish guard bind a carousel by its approved version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: `siguientePasoLinkedin` knows the document

**Files:** Modify `lib/dominio/linkedin.ts`, `tests/unit/linkedin-dominio.test.ts`, `lib/datos/repositorio.ts` (the one
literal that builds `FilaDeLinkedin`)

- [ ] **Step 1: Write the failing test.** In `tests/unit/linkedin-dominio.test.ts`, `describe("siguientePasoLinkedin")`:
change `base` to include `documentoUrn: null`, and add:

```ts
  it("uploads the document first, then waits for it, for a carousel", () => {
    expect(siguientePasoLinkedin(base, "documento")).toEqual({ tipo: "subir_documento" })
    expect(siguientePasoLinkedin({ ...base, documentoUrn: "urn:li:document:D1" }, "documento")).toEqual({
      tipo: "esperar_documento",
    })
  })

  it("settles doubt and exhausted tries first for a carousel too", () => {
    const enviado = { ...base, documentoUrn: "urn:li:document:D1", enviadoEn: "2031-01-01T00:00:00Z" }
    expect(siguientePasoLinkedin(enviado, "documento")).toEqual({ tipo: "dudosa" })
    expect(siguientePasoLinkedin({ ...base, intentos: MAXIMO_DE_INTENTOS_LINKEDIN }, "documento")).toEqual({
      tipo: "a_mano",
    })
    expect(siguientePasoLinkedin({ ...base, postUrn: "urn:li:share:1" }, "documento")).toEqual({ tipo: "nada" })
  })
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:run tests/unit/linkedin-dominio.test.ts`
Expected: FAIL (`subir_video` returned).

- [ ] **Step 3: Implement** in `lib/dominio/linkedin.ts`:

```ts
export interface FilaDeLinkedin {
  estado: EstadoDePublicacion
  videoUrn: string | null
  /** A carousel's document (part 3); a row never has both (`un_solo_medio`). */
  documentoUrn: string | null
  enviadoEn: string | null
  postUrn: string | null
  intentos: number
}

export type PasoLinkedin =
  | { tipo: "nada" }
  | { tipo: "dudosa" }
  | { tipo: "a_mano" }
  | { tipo: "subir_video" }
  | { tipo: "esperar_video" }
  | { tipo: "subir_documento" }
  | { tipo: "esperar_documento" }

/** Where a LinkedIn row is, read from its columns alone (L6, L10). A sent row without a post is never sent again. */
export function siguientePasoLinkedin(fila: FilaDeLinkedin, medio: "video" | "documento" = "video"): PasoLinkedin {
  if (fila.estado !== "esperando" || fila.postUrn !== null) return { tipo: "nada" }
  if (fila.enviadoEn !== null) return { tipo: "dudosa" }
  if (fila.intentos >= MAXIMO_DE_INTENTOS_LINKEDIN) return { tipo: "a_mano" }
  if (medio === "documento") {
    return fila.documentoUrn === null ? { tipo: "subir_documento" } : { tipo: "esperar_documento" }
  }
  if (fila.videoUrn === null) return { tipo: "subir_video" }
  return { tipo: "esperar_video" }
}
```

`pnpm type` now fails in `lib/datos/repositorio.ts` `leerFilaLinkedin` (missing `documentoUrn`): change its select to
`"estado, video_urn, documento_urn, enviado_en, post_urn, intentos"` and add `documentoUrn: data.documento_urn,` to the
returned object. Then `grep -rn "videoUrn:" lib tests` and add `documentoUrn: null` to any other `FilaDeLinkedin`
literal it lists (on `b106177` there is none besides the test's `base`).

- [ ] **Step 4: Run green**

Run: `pnpm test:run tests/unit/linkedin-dominio.test.ts && pnpm type && pnpm test:db tests/integration/publicar-linkedin.test.ts`
Expected: PASS (the reel calls `siguientePasoLinkedin(filaLinkedin)`, default `"video"`).

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/linkedin.ts lib/datos/repositorio.ts tests/unit/linkedin-dominio.test.ts
git commit -m "Teach the LinkedIn row's next step about a carousel's document

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Writing and clearing `documento_urn`

**Files:** Modify `lib/datos/repositorio.ts`; Create `tests/integration/linkedin-documento-datos.test.ts`

- [ ] **Step 1: Write the failing test** `tests/integration/linkedin-documento-datos.test.ts`

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import {
  guardarDocumentoLinkedin,
  guardarVideoLinkedin,
  leerFilaLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import { pool } from "./db"
import { PUBLICAR_EN } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, sembrarCarrusel } from "./siembra"

const DOCUMENTO = "urn:li:document:D5510AQprueba"
const creadas: string[] = []
afterEach(async () => {
  await borrarSembrado(creadas, [])
  creadas.length = 0
})
afterAll(() => pool.end())

async function programado(): Promise<string> {
  const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
  creadas.push(id)
  return id
}

describe("a carousel's LinkedIn row from the service", () => {
  it("stores the document, reads it back, and clears it when a try fails processing", async () => {
    const db = clienteDeServicio()
    const id = await programado()
    await guardarDocumentoLinkedin(db, id, DOCUMENTO)
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ documentoUrn: DOCUMENTO, videoUrn: null, intentos: 0 })

    await sumarIntentoLinkedin(db, id, { error: "PROCESSING_FAILED", borrarVideo: false, borrarDocumento: true })
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ documentoUrn: null, intentos: 1 })
  })

  it("keeps the document on a temporary failure", async () => {
    const db = clienteDeServicio()
    const id = await programado()
    await guardarDocumentoLinkedin(db, id, DOCUMENTO)
    await sumarIntentoLinkedin(db, id, { error: "503", borrarVideo: false })
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ documentoUrn: DOCUMENTO, intentos: 1 })
  })

  it("refuses something that is not a document, and a video beside it", async () => {
    const db = clienteDeServicio()
    const id = await programado()
    await expect(guardarDocumentoLinkedin(db, id, "urn:li:video:C1")).rejects.toThrow(/documento_urn_es_de_documento/)
    await guardarDocumentoLinkedin(db, id, DOCUMENTO)
    await expect(guardarVideoLinkedin(db, id, "urn:li:video:C1")).rejects.toThrow(/un_solo_medio/)
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm test:db tests/integration/linkedin-documento-datos.test.ts`
Expected: FAIL (`guardarDocumentoLinkedin` is not exported).

- [ ] **Step 3: Implement** in `lib/datos/repositorio.ts`, after `guardarVideoLinkedin`:

```ts
/** A carousel's uploaded PDF (part 3): stored before polling, so a later run never uploads it again. */
export function guardarDocumentoLinkedin(db: Db, piezaId: string, documentoUrn: string): Promise<void> {
  return escribirFilaLinkedin(db, piezaId, { documento_urn: documentoUrn }, "guardar el documento")
}
```

and `sumarIntentoLinkedin`:

```ts
export async function sumarIntentoLinkedin(
  db: Db,
  piezaId: string,
  entrada: { error: string; borrarVideo: boolean; borrarDocumento?: boolean },
): Promise<void> {
  const fila = await leerFilaLinkedin(db, piezaId)
  if (!fila) throw new Error(`La pieza ${piezaId} no tiene fila de LinkedIn.`)
  await escribirFilaLinkedin(
    db,
    piezaId,
    {
      intentos: fila.intentos + 1,
      ultimo_error: entrada.error.slice(0, 500),
      ...(entrada.borrarVideo ? { video_urn: null } : {}),
      ...(entrada.borrarDocumento ? { documento_urn: null } : {}),
    },
    "contar el intento",
  )
}
```

The error message `fallo()` builds includes Postgres's text, which names the constraint (that is what the regexes match).

- [ ] **Step 4: Run green**

Run: `pnpm test:db tests/integration/linkedin-documento-datos.test.ts tests/integration/publicar-linkedin.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/repositorio.ts tests/integration/linkedin-documento-datos.test.ts
git commit -m "Store and clear a carousel's LinkedIn document from the service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Lote 3: Provider

### Task 6: `subirDocumento` and the simulated Documents API

**Files:** Modify `tests/linkedin-msw.ts`, `lib/proveedores/linkedin.ts`; Create `tests/unit/linkedin-documentos.test.ts`

- [ ] **Step 1: Extend the simulator** `tests/linkedin-msw.ts` (no product code yet). Add the constant, the options, the
records and three handlers:

```ts
export const DOCUMENTO = "urn:li:document:D5510AQprueba"
const SUBIDA_DOCUMENTO = `${SUBIDAS}/D5510AQprueba/ads-uploadedDocument/0`
```

In `OpcionesLinkedin`:

```ts
  /** Answers of GET /rest/documents/{urn}, in order; the last one repeats. */
  documentos?: string[]
  iniciarDocumento?: () => Response
  subidaDeDocumento?: () => Response
  /** Replaces the document read; may do work first (a test changes the database while LinkedIn processes). */
  documento?: () => Response | Promise<Response>
```

In `SimulacionLinkedin` (and its initial value):

```ts
  documentosIniciados: unknown[]
  subidasDeDocumento: { datos: Uint8Array; autorizacion: string | null }[]
  consultasDeDocumento: string[]
```

Inside `simularLinkedin`, beside `estados`/`consultas`:

```ts
  const estadosDeDocumento = opciones.documentos ?? ["AVAILABLE"]
  let consultasDoc = 0
```

and in `servidor.use(...)`:

```ts
    http.post(`${API}/rest/documents`, async ({ request }) => {
      guardarCabeceras(request)
      sim.documentosIniciados.push(await request.json())
      return (
        opciones.iniciarDocumento?.() ??
        HttpResponse.json({
          value: { uploadUrlExpiresAt: 4_102_444_800_000, uploadUrl: SUBIDA_DOCUMENTO, document: DOCUMENTO },
        })
      )
    }),
    http.put(SUBIDA_DOCUMENTO, async ({ request }) => {
      sim.subidasDeDocumento.push({
        datos: new Uint8Array(await request.arrayBuffer()),
        autorizacion: request.headers.get("authorization"),
      })
      return opciones.subidaDeDocumento?.() ?? new HttpResponse(null, { status: 201 })
    }),
    http.get(`${API}/rest/documents/:urn`, async ({ request, params }) => {
      guardarCabeceras(request)
      sim.consultasDeDocumento.push(String(params.urn))
      if (opciones.documento) return opciones.documento()
      const estado = estadosDeDocumento[Math.min(consultasDoc, estadosDeDocumento.length - 1)]
      consultasDoc += 1
      return HttpResponse.json({ id: DOCUMENTO, owner: "urn:li:person:abc123XYZ", status: estado })
    }),
```

The shapes are the documented ones (see "LinkedIn API, verified").

- [ ] **Step 2: Write the failing test** `tests/unit/linkedin-documentos.test.ts`

```ts
// @vitest-environment node
import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RechazoDeLinkedin, subirDocumento, VERSION_DE_LINKEDIN } from "@/lib/proveedores/linkedin"
import { DOCUMENTO, simularLinkedin } from "../linkedin-msw"

const TOKEN = "AQV_token_de_prueba"
const MIEMBRO = "urn:li:person:abc123XYZ"
const PDF = new TextEncoder().encode("%PDF-1.7 carrusel")

describe("subirDocumento", () => {
  it("initializes for the member, PUTs the whole PDF with her token and returns the document URN", async () => {
    const sim = simularLinkedin()
    expect(await subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF })).toBe(DOCUMENTO)
    expect(sim.documentosIniciados).toEqual([{ initializeUploadRequest: { owner: MIEMBRO } }])
    expect(sim.subidasDeDocumento).toHaveLength(1)
    expect(sim.subidasDeDocumento[0]?.datos).toEqual(PDF)
    expect(sim.subidasDeDocumento[0]?.autorizacion).toBe(`Bearer ${TOKEN}`)
    expect(sim.cabeceras.every((c) => c.version === VERSION_DE_LINKEDIN && c.protocolo === "2.0.0")).toBe(true)
  })

  it("is a definitive rejection when LinkedIn refuses the upload", async () => {
    simularLinkedin({ iniciarDocumento: () => HttpResponse.json({ status: 403 }, { status: 403 }) })
    await expect(subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF })).rejects.toBeInstanceOf(
      RechazoDeLinkedin,
    )
  })

  it("refuses an answer that does not carry a document URN", async () => {
    simularLinkedin({
      iniciarDocumento: () => HttpResponse.json({ value: { uploadUrl: "https://x.test/u", document: "urn:li:video:1" } }),
    })
    await expect(subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF })).rejects.toThrow(/inesperada/)
  })

  it("never puts the upload URL or the token in its error", async () => {
    simularLinkedin({ subidaDeDocumento: () => new HttpResponse(`fallo ${TOKEN}`, { status: 500 }) })
    const error = await subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF }).catch((e: unknown) => e)
    expect(String(error)).not.toContain(TOKEN)
    expect(String(error)).not.toContain("dms-uploads")
  })
})
```

- [ ] **Step 3: Run it red**

Run: `pnpm test:run tests/unit/linkedin-documentos.test.ts`
Expected: FAIL (`subirDocumento` is not exported).

- [ ] **Step 4: Implement** in `lib/proveedores/linkedin.ts`. Add the Documents API link to the header comment
(`https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api`, verified 2026-10-27
for 202609), then after `crearPost`'s predecessor block (after `estadoDelVideo`):

```ts
const DocumentoIniciado = z.object({
  value: z.object({
    uploadUrl: z.string().url(),
    document: z.string().regex(/^urn:li:document:[A-Za-z0-9_-]+$/),
  }),
})

/** A carousel's PDF (part 3): initializeUpload for the member, then one PUT of the whole file. Returns the URN. */
export async function subirDocumento(entrada: { token: string; miembro: string; datos: Uint8Array }): Promise<string> {
  const { token, miembro, datos } = entrada
  const inicio = await llamar(
    `${base()}/rest/documents?action=initializeUpload`,
    {
      method: "POST",
      headers: cabeceras(token),
      body: JSON.stringify({ initializeUploadRequest: { owner: miembro } }),
    },
    "initializeUpload del documento",
    token,
  )
  const leida = DocumentoIniciado.safeParse(await inicio.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en initializeUpload del documento.")
  const { uploadUrl, document } = leida.data.value
  // The documented upload carries the member's token (a video part does not). LinkedIn names no content type.
  await llamar(
    uploadUrl,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: datos.slice(),
    },
    "la subida del documento",
    token,
    ESPERA_PARTE_MS,
  )
  return document
}
```

`llamar` maps a 403 to `RechazoDeLinkedin` and a 500 to a plain `Error`; its message never has the URL and `errorDe`
already replaces the token with `[x]`.

- [ ] **Step 5: Run green, then the reel's provider tests**

Run: `pnpm test:run tests/unit/linkedin-documentos.test.ts tests/unit/linkedin-proveedor.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/linkedin-msw.ts lib/proveedores/linkedin.ts tests/unit/linkedin-documentos.test.ts
git commit -m "Upload a carousel PDF through LinkedIn's Documents API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: `estadoDelDocumento`

**Files:** Modify `lib/proveedores/linkedin.ts`, `tests/unit/linkedin-documentos.test.ts`

- [ ] **Step 1: Write the failing test** (append; import `estadoDelDocumento`):

```ts
describe("estadoDelDocumento", () => {
  it.each([
    ["AVAILABLE", "listo"],
    ["PROCESSING", "procesando"],
    ["WAITING_UPLOAD", "procesando"],
    ["PROCESSING_FAILED", "fallido"],
  ])("handles %s when LinkedIn answers it: %s", async (status, esperado) => {
    simularLinkedin({ documentos: [status] })
    expect((await estadoDelDocumento({ token: TOKEN, documento: DOCUMENTO })).estado).toBe(esperado)
  })

  it("asks for the document by its URN", async () => {
    const sim = simularLinkedin()
    await estadoDelDocumento({ token: TOKEN, documento: DOCUMENTO })
    expect(sim.consultasDeDocumento).toEqual([DOCUMENTO])
  })

  it("refuses an answer without a status", async () => {
    simularLinkedin({ documento: () => HttpResponse.json({ id: DOCUMENTO }) })
    await expect(estadoDelDocumento({ token: TOKEN, documento: DOCUMENTO })).rejects.toThrow(/inesperada/)
  })
})
```

- [ ] **Step 2: Run red.** `pnpm test:run tests/unit/linkedin-documentos.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** after `subirDocumento`:

```ts
const Documento = z.object({ status: z.string() })

/** The docs name no failure reason for a document, so a failure carries none. */
export type EstadoDeDocumento = { estado: "listo" } | { estado: "procesando" } | { estado: "fallido" }

/** Post only when AVAILABLE (as a video, F6). */
export async function estadoDelDocumento(entrada: { token: string; documento: string }): Promise<EstadoDeDocumento> {
  const respuesta = await llamar(
    `${base()}/rest/documents/${encodeURIComponent(entrada.documento)}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "el estado del documento",
    entrada.token,
  )
  const leido = Documento.safeParse(await respuesta.json())
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada al leer el documento.")
  switch (leido.data.status) {
    case "AVAILABLE":
      return { estado: "listo" }
    case "PROCESSING_FAILED":
      return { estado: "fallido" }
    default:
      return { estado: "procesando" }
  }
}
```

- [ ] **Step 4: Run green.** `pnpm test:run tests/unit/linkedin-documentos.test.ts && pnpm type` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/linkedin.ts tests/unit/linkedin-documentos.test.ts
git commit -m "Read a LinkedIn document's processing state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: `crearPost` with a document and its title

**Files:** Modify `lib/proveedores/linkedin.ts`, `tests/unit/linkedin-documentos.test.ts`

- [ ] **Step 1: Write the failing test** (append; import `crearPost`):

```ts
describe("crearPost with a document", () => {
  it("posts the document with its title and returns the URN from x-restli-id", async () => {
    const sim = simularLinkedin()
    const urn = await crearPost({
      token: TOKEN,
      miembro: MIEMBRO,
      documento: DOCUMENTO,
      titulo: "Lo que un chatbot no ve de ti",
      commentary: "Hola \\(1\\)",
    })
    expect(urn).toBe("urn:li:share:71")
    expect(sim.posts[0]).toEqual({
      author: MIEMBRO,
      commentary: "Hola \\(1\\)",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: DOCUMENTO, title: "Lo que un chatbot no ve de ti" } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    })
  })

  it("keeps a video post without a title", async () => {
    const sim = simularLinkedin()
    await crearPost({ token: TOKEN, miembro: MIEMBRO, video: "urn:li:video:C1", commentary: "x" })
    expect(sim.posts[0]?.content).toEqual({ media: { id: "urn:li:video:C1" } })
  })
})
```

- [ ] **Step 2: Run red.** `pnpm type` fails (`documento` unknown) and the test fails.

- [ ] **Step 3: Implement.** Replace `crearPost`'s signature and `content`:

```ts
/** One medium per post: a reel's video (no title: it is not part of gate 2) or a carousel's document with its title. */
export type MedioDelPost = { video: string } | { documento: string; titulo: string }

/** F7: the 201 carries the post URN in `x-restli-id`. The Documents API requires `content.media.title`. */
export async function crearPost(
  entrada: { token: string; miembro: string; commentary: string } & MedioDelPost,
): Promise<string> {
  const media = "documento" in entrada ? { id: entrada.documento, title: entrada.titulo } : { id: entrada.video }
```

and in the body `content: { media },`. Everything else unchanged.

- [ ] **Step 4: Run green.** `pnpm test:run tests/unit/linkedin-documentos.test.ts tests/unit/linkedin-proveedor.test.ts && pnpm type` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/linkedin.ts tests/unit/linkedin-documentos.test.ts
git commit -m "Post a LinkedIn document with its title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Lote 4: Publisher

All five tasks grow `tests/integration/publicar-carrusel.test.ts`. Task 9 rewrites its head; later tasks append `it`
blocks inside the describes it creates.

### Task 9: A scheduled carousel posts by itself and closes as `publicado`

**Files:**
- Modify: `lib/publicacion/linkedin.ts`, `lib/publicacion/publicar.ts`
- Create: `lib/publicacion/linkedin-carrusel.ts`
- Rewrite: `tests/integration/publicar-carrusel.test.ts`

- [ ] **Step 1: Rewrite the test file** `tests/integration/publicar-carrusel.test.ts` (the part 2 "not one call to
LinkedIn" test goes; "waits before its time" stays):

```ts
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { aLittleText } from "@/lib/dominio/linkedin"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { DOCUMENTO, simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { despues, PUBLICAR_EN } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, leerFila, publicacionesConDetalle, sembrarCarrusel } from "./siembra"

const TITULO = "Lo que un chatbot no ve de ti"
const PDF = new TextEncoder().encode("%PDF-1.7 el aprobado")
const creadas: string[] = []
afterAll(() => pool.end())
afterEach(async () => {
  await borrarSembrado(creadas, [])
  creadas.length = 0
  await desconectar()
})

async function conectar(expira = "2031-12-31T00:00:00Z") {
  await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
  await pool.query(
    "update public.ajustes set linkedin_miembro = 'urn:li:person:abc123XYZ', linkedin_nombre = 'Coni', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
    [expira],
  )
}

async function desconectar() {
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
}

function doble(ahora: () => string) {
  const almacen = almacenEnMemoria()
  const avisos = notificadorEnMemoria()
  const deps: DepsPublicacion = {
    db: clienteDeServicio(),
    almacen,
    avisos,
    ahora,
    dormir: async () => {},
    sondeo: { cadaMs: 60_000, veces: 5 },
    sondeoLinkedin: { cadaMs: 15_000, veces: 8 },
  }
  return { deps, almacen, avisos }
}

/** The R2 key of the PDF gate 2 bound (`piezas.puerta2_carrusel_id`). */
async function pdfAprobado(id: string): Promise<string> {
  const { rows } = await pool.query<{ pdf_clave: string }>(
    "select c.pdf_clave from public.carruseles c join public.piezas p on p.puerta2_carrusel_id = c.id where p.id = $1",
    [id],
  )
  const clave = rows[0]?.pdf_clave
  if (!clave) throw new Error("El carrusel programado no tiene PDF aprobado")
  return clave
}

/** Signed for a far future time (the real flow refuses a past one); the run's clock is moved to it. */
async function programado(d: ReturnType<typeof doble>) {
  const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
  creadas.push(id)
  await d.almacen.subir(await pdfAprobado(id), PDF, "application/pdf")
  return id
}

describe("a scheduled carousel with LinkedIn connected (part 3)", () => {
  beforeEach(async () => {
    await conectar()
  })

  it("uploads the approved PDF, posts the approved text with the cover as title and closes as publicado", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({ documentos: ["PROCESSING", "AVAILABLE"] })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])

    expect(sim.documentosIniciados).toEqual([{ initializeUploadRequest: { owner: "urn:li:person:abc123XYZ" } }])
    expect(sim.subidasDeDocumento.map((s) => s.datos)).toEqual([PDF])
    expect(sim.posts).toHaveLength(1)
    expect(sim.posts[0]).toMatchObject({
      author: "urn:li:person:abc123XYZ",
      commentary: aLittleText(TEXTO_POST_DE_PRUEBA),
      content: { media: { id: DOCUMENTO, title: LAMINAS_DE_PRUEBA[0]?.texto } },
    })
    // C11: a carousel is signed "Constanza del Rosario"; it needs no avatar line and still goes out.
    expect(TEXTO_POST_DE_PRUEBA).not.toContain(AVISO_AVATAR_LINKEDIN)
    expect(await publicacionesConDetalle(id)).toMatchObject([
      {
        destino: "linkedin",
        estado: "publicado",
        post_urn: "urn:li:share:71",
        enlace: "https://www.linkedin.com/feed/update/urn:li:share:71/",
      },
    ])
    expect((await leerFila(id)).estado).toBe("publicado")
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toContain(
      `Tu carrusel «${TITULO}» se publicó en LinkedIn. Míralo aquí: https://www.linkedin.com/feed/update/urn:li:share:71/`,
    )
    expect(d.avisos.aWavEnviados).toEqual([])
  })

  it("waits before its time", async () => {
    const d = doble(() => despues(-10))
    const id = await programado(d)
    const sim = simularLinkedin()
    expect(await publicarPendientes(d.deps)).toEqual([])
    expect((await leerFila(id)).estado).toBe("programado")
    expect(sim.documentosIniciados).toHaveLength(0)
  })
})
```

`programado(d)` takes the double so the PDF lands in that run's in-memory store. `LAMINAS_DE_PRUEBA[0]?.texto` is the
portada ("Lo que un chatbot no ve de ti").

- [ ] **Step 2: Run it red**

Run: `pnpm test:db tests/integration/publicar-carrusel.test.ts`
Expected: FAIL (the first test gets `para_subir_a_mano`, no LinkedIn call).

- [ ] **Step 3: Export and generalize the shared helpers** in `lib/publicacion/linkedin.ts` (reel behavior unchanged):

- `export async function aMano(...)`, with the WAV subject by type (decision P10):

```ts
export async function aMano(contexto: Contexto, explicacion: string, detalle: string): Promise<ResultadoLinkedin> {
  const { db, avisos } = contexto.deps
  await pasarLinkedinAMano(db, contexto.fila.id, { explicacion, error: detalle })
  const que = contexto.fila.tipo === "carrusel" ? "un carrusel" : "un reel"
  try {
    await avisos.aWav(`LinkedIn no publicó ${que}`, `pieza ${contexto.fila.id} («${contexto.fila.titulo}»): ${detalle}`)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    contexto.avisosFallidos.push(error)
  }
  return { tipo: "a_mano" }
}
```

- `export async function antesDeEnviar(contexto: Contexto, error: unknown, borrarVideo: boolean, rechazo = EXPLICACION_LINKEDIN_GENERICA)`
  with `if (error instanceof RechazoDeLinkedin) return aMano(contexto, rechazo, error.message)` (the reel's calls pass
  three arguments, so they keep the generic text).
- `export function plazoVencido(...)` and `export async function guardarPost(...)` (bodies unchanged).

- [ ] **Step 4: Create** `lib/publicacion/linkedin-carrusel.ts` (the whole file; Tasks 10 to 13 only add tests against
it, plus the guards they name):

```ts
import { leerVersion, type VersionDeCarrusel } from "@/lib/datos/carrusel"
import { piezaDesdeFila } from "@/lib/datos/piezas"
import {
  type ConexionLinkedin,
  guardarDocumentoLinkedin,
  leerConexionLinkedin,
  leerFilaLinkedin,
  leerPieza,
  pasarLinkedinAMano,
  reservarEnvioLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import { aLittleText, siguientePasoLinkedin } from "@/lib/dominio/linkedin"
import { hashTexto, hashTextoDeCarrusel, puedePublicar, type Veredicto } from "@/lib/dominio/puertas"
import { crearPost, estadoDelDocumento, subirDocumento } from "@/lib/proveedores/linkedin"
import {
  aMano,
  antesDeEnviar,
  EXPLICACION_LINKEDIN_TARDE,
  guardarPost,
  LINKEDIN_SIN_CONEXION,
  plazoVencido,
  type ResultadoLinkedin,
} from "./linkedin"
import type { Contexto } from "./publicar"

export const EXPLICACION_LINKEDIN_CARRUSEL =
  "LinkedIn no aceptó el carrusel, así que te lo dejé para subir a mano. WAV ya está revisando."
export const EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL =
  "No pude confirmar si LinkedIn publicó tu carrusel. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí."

/** Documents API: 100 MB and 300 pages (verified 2026-10-27). A carousel is at most 8 pages (decision P6). */
const BYTES_MAXIMOS_DEL_DOCUMENTO = 100 * 1024 * 1024

async function versionAprobada(contexto: Contexto): Promise<VersionDeCarrusel | null> {
  const id = contexto.fila.puerta2_carrusel_id
  return id ? leerVersion(contexto.deps.db, id) : null
}

/** Gate 2 bound this version, these words and this half hour; checked with the clock of the moment. */
function vigente(contexto: Contexto, version: VersionDeCarrusel): Veredicto {
  return puedePublicar(piezaDesdeFila(contexto.fila), {
    hashTexto: hashTextoDeCarrusel(version),
    carruselId: version.id,
    ahora: contexto.deps.ahora(),
  })
}

/**
 * Part 3 (design P3-1): one resumable step of a carousel's LinkedIn row per call, with `resolverLinkedin`'s contract.
 * Never posts twice, never posts what gate 2 did not bind, never uploads the PDF twice.
 */
export async function resolverLinkedinCarrusel(contexto: Contexto): Promise<ResultadoLinkedin> {
  const { db, ahora } = contexto.deps
  const { fila } = contexto
  const filaLinkedin = await leerFilaLinkedin(db, fila.id)
  if (!filaLinkedin || filaLinkedin.estado !== "esperando") return { tipo: "nada" }

  // Settled without calling LinkedIn, before the connection is looked at (as for a reel).
  const paso = siguientePasoLinkedin(filaLinkedin, "documento")
  if (paso.tipo === "nada") return { tipo: "nada" }
  if (paso.tipo === "dudosa") {
    return aMano(contexto, EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL, "un envío anterior no devolvió el post")
  }
  if (paso.tipo === "a_mano") return aMano(contexto, EXPLICACION_LINKEDIN_CARRUSEL, "se agotaron los intentos")

  const conexion = await leerConexionLinkedin(db)
  if (!conexion || Date.parse(conexion.expiraEn) <= Date.parse(ahora())) {
    // Not a failure (decision P2): WAV is not told; the row says why, for her screen and the notice.
    await pasarLinkedinAMano(db, fila.id, {
      explicacion: LINKEDIN_SIN_CONEXION,
      error: conexion ? "venció la conexión de LinkedIn" : "LinkedIn no está conectado",
    })
    return { tipo: "a_mano" }
  }

  const version = await versionAprobada(contexto)
  if (!version) return { tipo: "guardia", veredicto: { ok: false, motivo: "sin_aprobacion" } }
  const veredicto = vigente(contexto, version)
  if (!veredicto.ok) {
    if (veredicto.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto }
  }
  if (plazoVencido(contexto)) return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó el plazo propio de LinkedIn")
  const portada = version.laminas[0]?.texto
  // `listo_con_archivos` and `leerLaminas` guarantee both for an approved version: missing means a bug, not a fallback.
  if (version.pdfClave === null || !portada) throw new Error(`La versión ${version.id} aprobada no tiene PDF o portada.`)

  let documentoUrn = filaLinkedin.documentoUrn
  if (paso.tipo === "subir_documento") {
    let datos: Uint8Array
    try {
      datos = await contexto.deps.almacen.bajar(version.pdfClave)
    } catch (error) {
      return antesDeEnviar(contexto, error, false, EXPLICACION_LINKEDIN_CARRUSEL)
    }
    if (datos.byteLength > BYTES_MAXIMOS_DEL_DOCUMENTO) {
      return aMano(contexto, EXPLICACION_LINKEDIN_CARRUSEL, `el PDF pesa ${datos.byteLength} bytes`)
    }
    try {
      documentoUrn = await subirDocumento({ token: conexion.token, miembro: conexion.miembro, datos })
    } catch (error) {
      return antesDeEnviar(contexto, error, false, EXPLICACION_LINKEDIN_CARRUSEL)
    }
    await guardarDocumentoLinkedin(db, fila.id, documentoUrn)
  }
  if (documentoUrn === null) throw new Error(`La fila de LinkedIn de la pieza ${fila.id} quedó sin documento.`)

  const listo = await esperarDocumento(contexto, conexion, documentoUrn)
  if (listo !== true) return listo
  return enviar(contexto, conexion, { version, documentoUrn, titulo: portada })
}

async function esperarDocumento(
  contexto: Contexto,
  conexion: ConexionLinkedin,
  documentoUrn: string,
): Promise<true | ResultadoLinkedin> {
  const { sondeoLinkedin, dormir } = contexto.deps
  for (let lectura = 0; lectura < sondeoLinkedin.veces; lectura += 1) {
    if (plazoVencido(contexto)) return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó el plazo propio de LinkedIn")
    let estado: Awaited<ReturnType<typeof estadoDelDocumento>>
    try {
      estado = await estadoDelDocumento({ token: conexion.token, documento: documentoUrn })
    } catch (error) {
      return antesDeEnviar(contexto, error, false, EXPLICACION_LINKEDIN_CARRUSEL)
    }
    if (estado.estado === "listo") return true
    if (estado.estado === "fallido") {
      // Dropped and counted: the next try uploads again (design P3-2).
      await sumarIntentoLinkedin(contexto.deps.db, contexto.fila.id, {
        error: "PROCESSING_FAILED del documento",
        borrarVideo: false,
        borrarDocumento: true,
      })
      return { tipo: "en_curso" }
    }
    if (lectura < sondeoLinkedin.veces - 1) await dormir(sondeoLinkedin.cadaMs)
  }
  return { tipo: "en_curso" }
}

async function enviar(
  contexto: Contexto,
  conexion: ConexionLinkedin,
  aprobado: { version: VersionDeCarrusel; documentoUrn: string; titulo: string },
): Promise<ResultadoLinkedin> {
  const { db } = contexto.deps
  // Polling takes time: the bound version, its words and the half hour are checked again right before sending.
  const actual = await leerPieza(db, contexto.fila.id)
  if (!actual) throw new Error(`La pieza ${contexto.fila.id} desapareció mientras se publicaba en LinkedIn.`)
  contexto.fila = actual
  const releida = await versionAprobada(contexto)
  if (
    !releida ||
    releida.id !== aprobado.version.id ||
    releida.textoPost !== aprobado.version.textoPost ||
    hashTextoDeCarrusel(releida) !== hashTextoDeCarrusel(aprobado.version)
  ) {
    return { tipo: "guardia", veredicto: { ok: false, motivo: "artefacto_cambio" } }
  }
  const ultimo = vigente(contexto, releida)
  if (!ultimo.ok) {
    if (ultimo.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto: ultimo }
  }

  // From here on the post is never sent again (L10).
  const version = await reservarEnvioLinkedin(db, actual.id, actual.version)
  contexto.fila = { ...actual, version }

  let postUrn: string
  try {
    postUrn = await crearPost({
      token: conexion.token,
      miembro: conexion.miembro,
      documento: aprobado.documentoUrn,
      titulo: aprobado.titulo,
      commentary: aLittleText(releida.textoPost),
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return aMano(contexto, EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL, `después de enviar: ${error.message}`)
  }
  await guardarPost(contexto, postUrn, hashTexto(releida.textoPost))
  return { tipo: "listo" }
}
```

- [ ] **Step 5: Wire it** in `lib/publicacion/publicar.ts`. Import `resolverLinkedinCarrusel` from `./linkedin-carrusel`.
Replace `entregarCarrusel`'s refusal block with a shared `rechazarCarrusel`, give it the row's reason (used from Task
10), and add `avisarCarruselPublicado` and `publicarCarrusel`:

```ts
/** What the carousel's own guard refuses (spec P3-2, last row): nothing is posted and WAV reviews it. */
async function rechazarCarrusel(
  contexto: Contexto,
  veredicto: Exclude<Veredicto, { ok: true }>,
): Promise<ResultadoPublicacion> {
  const { fila } = contexto
  switch (veredicto.motivo) {
    case "antes_de_hora":
      return { piezaId: fila.id, resultado: "esperando" }
    case "estado":
      throw new Error(`La pieza ${fila.id} dejó de estar programada mientras se publicaba.`)
    case "hora_vencida":
      // Late is not a change: it goes by hand (entregarCarrusel has no window, so this does not loop).
      return entregarCarrusel(contexto)
    case "sin_aprobacion":
    case "artefacto_cambio":
      return fallar(
        contexto,
        EXPLICACION_CAMBIO_CARRUSEL,
        `el carrusel aprobado y el guardado no coinciden (${veredicto.motivo})`,
      )
  }
}

/**
 * A carousel goes by hand (part 2's path, the net of part 3): the PDF, the text and "Ya lo subí", with the reason the
 * LinkedIn row gives. It still has to be the version and words she approved, and never before its time.
 */
async function entregarCarrusel(contexto: Contexto): Promise<ResultadoPublicacion> {
  const { fila } = contexto
  const pieza = piezaDesdeFila(fila)
  const version = fila.puerta2_carrusel_id ? await leerVersion(contexto.deps.db, fila.puerta2_carrusel_id) : null
  const veredicto = puedeEntregarseParaSubir(pieza, {
    hashTexto: version ? hashTextoDeCarrusel(version) : "",
    carruselId: version?.id,
    ahora: contexto.deps.ahora(),
  })
  if (!veredicto.ok) return rechazarCarrusel(contexto, veredicto)
  await escribirTransicion(contexto, { tipo: "entregar_para_subir" })
  const filas = await leerPublicaciones(contexto.deps.db, fila.id)
  const razon = filas.find((p) => p.destino === "linkedin" && p.estado === "para_subir")?.explicacion
  const mensaje = [
    `Tu carrusel «${fila.titulo}» está listo para que lo subas a LinkedIn. Entra a la app para descargar el PDF y copiar el texto.`,
    ...(razon ? [razon] : []),
  ].join(" ")
  await avisar(contexto, () => contexto.deps.avisos.aConi(mensaje, true, avisoDe(contexto, "listo_para_subir")))
  return { piezaId: fila.id, resultado: "para_subir_a_mano" }
}

async function avisarCarruselPublicado(contexto: Contexto): Promise<void> {
  const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
  const enlace = filas.find((p) => p.destino === "linkedin")?.enlace
  const mensaje = `Tu carrusel «${contexto.fila.titulo}» se publicó en LinkedIn.${enlace ? ` Míralo aquí: ${enlace}` : ""}`
  await avisar(contexto, () => contexto.deps.avisos.aConi(mensaje, false, avisoDe(contexto, "publicado", "linkedin")))
}

/** Part 3: LinkedIn first; whatever cannot post goes by hand with its reason. Never Instagram, never a video. */
async function publicarCarrusel(contexto: Contexto): Promise<ResultadoPublicacion> {
  const linkedin = await resolverLinkedinCarrusel(contexto)
  switch (linkedin.tipo) {
    case "en_curso":
      // As for a reel: released at the end of the run, so the next tick resumes it within minutes.
      contexto.liberarAlFinal = true
      return { piezaId: contexto.fila.id, resultado: "esperando" }
    case "guardia":
      return rechazarCarrusel(contexto, linkedin.veredicto)
    case "listo":
      await avisarCarruselPublicado(contexto)
      return cerrarPublicada(contexto)
    case "nada": {
      // A run that saved the post and stopped before closing the piece (decision P7): it is live, so it is closed.
      const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
      if (filas.some((p) => p.destino === "linkedin" && p.estado === "publicado")) {
        await avisarCarruselPublicado(contexto)
        return cerrarPublicada(contexto)
      }
      return entregarCarrusel(contexto)
    }
    case "a_mano":
      return entregarCarrusel(contexto)
  }
}
```

In `procesar`, replace the part 2 line and its comment with:

```ts
    // A carousel never reaches the reel's LinkedIn or Instagram paths: it has its own (part 3).
    if (contexto.fila.tipo === "carrusel") return await publicarCarrusel(contexto)
```

Keep `entregarCarrusel` defined before `rechazarCarrusel` or after; both are `async function` declarations, so order
does not matter.

- [ ] **Step 6: Run green, plus every publishing suite**

Run: `pnpm test:db tests/integration/publicar-carrusel.test.ts tests/integration/publicar.test.ts tests/integration/publicar-linkedin.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/publicacion/linkedin.ts lib/publicacion/linkedin-carrusel.ts lib/publicacion/publicar.ts tests/integration/publicar-carrusel.test.ts
git commit -m "Post a scheduled carousel to LinkedIn by itself

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Not connected, expired, or late: by hand with the reason

**Files:** Modify `tests/integration/publicar-carrusel.test.ts` (code from Task 9; fix it test-first if any fails)

- [ ] **Step 1: Write the tests.** Import `LINKEDIN_SIN_CONEXION`, `EXPLICACION_LINKEDIN_TARDE` from
`@/lib/publicacion/linkedin`. Add a describe outside the connected one:

```ts
describe("a scheduled carousel that cannot post by itself", () => {
  const AVISO = `Tu carrusel «${TITULO}» está listo para que lo subas a LinkedIn. Entra a la app para descargar el PDF y copiar el texto.`

  it("goes by hand with the reason and no call to LinkedIn when LinkedIn is not connected", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])

    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect(await publicacionesConDetalle(id)).toMatchObject([
      { destino: "linkedin", estado: "para_subir", explicacion: LINKEDIN_SIN_CONEXION },
    ])
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toEqual([`${AVISO} ${LINKEDIN_SIN_CONEXION}`])
    expect(d.avisos.aWavEnviados).toEqual([])
  })

  it("goes by hand the same way when the connection expired before its time", async () => {
    await conectar("2031-03-01T00:00:00Z")
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(LINKEDIN_SIN_CONEXION)
  })

  it("goes by hand, never late, when the approved half hour passed", async () => {
    await conectar()
    const d = doble(() => despues(31))
    const id = await programado(d)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_TARDE)
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toEqual([`${AVISO} ${EXPLICACION_LINKEDIN_TARDE}`])
    expect(d.avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["LinkedIn no publicó un carrusel"])
  })

  it("goes by hand when LinkedIn's own deadline passed while the document processed", async () => {
    await conectar()
    const d = doble(() => despues(13))
    const id = await programado(d)
    simularLinkedin()
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_TARDE)
  })
})
```

`despues(13)` is inside the 30-minute window but past `PLAZO_DE_LINKEDIN_MS` (12 minutes), so it reaches
`plazoVencido`.

- [ ] **Step 2: Run.** `pnpm test:db tests/integration/publicar-carrusel.test.ts` → PASS with Task 9's code. If a test is
red, fix `linkedin-carrusel.ts` or `publicar.ts` (not the test) and rerun. To prove the tests bite, temporarily remove
the `...(razon ? [razon] : [])` spread and see the first test fail, then restore it.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/publicar-carrusel.test.ts
git commit -m "Cover a carousel that goes by hand: not connected, expired, late

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Processing, temporary failures, failed processing and the maximum

**Files:** Modify `tests/integration/publicar-carrusel.test.ts`

- [ ] **Step 1: Write the tests** (inside "a scheduled carousel with LinkedIn connected"; import `HttpResponse` from
`msw` and `EXPLICACION_LINKEDIN_CARRUSEL` from `@/lib/publicacion/linkedin-carrusel`):

```ts
  it("keeps the piece while the document processes and resumes without uploading again", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    simularLinkedin({ documentos: ["PROCESSING"] })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await leerFila(id)).estado).toBe("programado")
    expect((await publicacionesConDetalle(id))[0]).toMatchObject({ documento_urn: DOCUMENTO, estado: "esperando" })

    const sim2 = simularLinkedin({ documentos: ["AVAILABLE"] })
    const d2 = doble(() => despues(6))
    expect(await publicarPendientes(d2.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim2.documentosIniciados).toHaveLength(0)
    expect(sim2.posts).toHaveLength(1)
  })

  it("counts a temporary failure as one try and keeps the piece for the next tick", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    simularLinkedin({ iniciarDocumento: () => new HttpResponse("ocupado", { status: 503 }) })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await publicacionesConDetalle(id))[0]).toMatchObject({ estado: "esperando", intentos: 1 })
    expect((await leerFila(id)).estado).toBe("programado")
  })

  it("counts a store that does not answer as a try", async () => {
    const d = doble(() => despues(1))
    const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
    creadas.push(id)
    simularLinkedin()
    // No PDF in the store: `bajar` throws as R2 not answering would.
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await publicacionesConDetalle(id))[0]?.intentos).toBe(1)
  })

  it("drops a document that failed processing, uploads again, and goes by hand after the maximum", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({ documentos: ["PROCESSING_FAILED"] })

    for (const minuto of [1, 2, 3]) {
      const corrida = doble(() => despues(minuto))
      await corrida.almacen.subir(await pdfAprobado(id), PDF, "application/pdf")
      expect(await publicarPendientes(corrida.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
      expect((await publicacionesConDetalle(id))[0]).toMatchObject({ documento_urn: null, intentos: minuto })
    }
    expect(sim.documentosIniciados).toHaveLength(3)

    const ultima = doble(() => despues(4))
    expect(await publicarPendientes(ultima.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_CARRUSEL)
  })

  it("goes by hand at once when LinkedIn rejects the PDF", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    simularLinkedin({ iniciarDocumento: () => HttpResponse.json({ status: 422 }, { status: 422 }) })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_CARRUSEL)
  })
```

Each in-memory store is per double, so the failed-processing loop puts the PDF in every run's store (the first `d` only
seeds the piece).

- [ ] **Step 2: Run.** `pnpm test:db tests/integration/publicar-carrusel.test.ts` → PASS. Prove the third test bites by
temporarily changing `borrarDocumento: true` to `false` in `esperarDocumento` (the loop's `documento_urn: null` fails),
then restore.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/publicar-carrusel.test.ts
git commit -m "Cover a carousel's processing, retries and failed documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Doubt is never resent; a saved post is closed, never handed over

**Files:** Modify `tests/integration/publicar-carrusel.test.ts`

- [ ] **Step 1: Write the tests** (connected describe; import `EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL`):

```ts
  it("goes by hand with the doubt text when the post fails after the reservation, and never posts again", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({ post: () => new HttpResponse("caído", { status: 500 }) })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(1)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila).toMatchObject({ estado: "para_subir", explicacion: EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL })
    expect(fila?.enviado_en).not.toBeNull()

    const sim2 = simularLinkedin()
    expect(await publicarPendientes(doble(() => despues(2)).deps)).toEqual([])
    expect(sim2.posts).toHaveLength(0)
  })

  it("never posts again when an earlier run reserved the send and lost the answer", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query("update public.publicaciones set documento_urn = $2, enviado_en = now() where pieza_id = $1", [
      id,
      DOCUMENTO,
    ])
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(0)
    expect(sim.consultasDeDocumento).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL)
  })

  it("settles a doubtful send even when the connection is gone", async () => {
    await desconectar()
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query("update public.publicaciones set documento_urn = $2, enviado_en = now() where pieza_id = $1", [
      id,
      DOCUMENTO,
    ])
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL)
  })

  it("never uploads again when the row already has its document", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query("update public.publicaciones set documento_urn = $2 where pieza_id = $1", [id, DOCUMENTO])
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.subidasDeDocumento).toHaveLength(0)
    expect(sim.posts).toHaveLength(1)
  })

  it("closes a carousel whose post was saved by a run that stopped before closing it", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query(
      `update public.publicaciones set documento_urn = $2, enviado_en = now(), estado = 'publicado',
         post_urn = 'urn:li:share:71', enlace = 'https://www.linkedin.com/feed/update/urn:li:share:71/', marcado_en = now()
       where pieza_id = $1`,
      [id, DOCUMENTO],
    )
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.posts).toHaveLength(0)
    expect((await leerFila(id)).estado).toBe("publicado")
  })
```

- [ ] **Step 2: Run.** `pnpm test:db tests/integration/publicar-carrusel.test.ts` → PASS. Prove the last test bites by
temporarily making `publicarCarrusel`'s `nada` case always `return entregarCarrusel(contexto)` (it fails with
`para_subir_a_mano`), then restore.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/publicar-carrusel.test.ts
git commit -m "Cover a carousel's doubtful send and a post saved before closing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Only the bound version, before upload and before sending

**Files:** Modify `tests/integration/publicar-carrusel.test.ts`

- [ ] **Step 1: Write the tests** (connected describe). The helper changes the bound version's post text while keeping
its `hash_texto` column, so `proteger_pieza` still lets the piece move (it compares that column) while the recomputed hash
differs from gate 2's; the DDL runs inside one transaction so no other test sees the trigger off:

```ts
/** Changes the words of the bound version behind the database's back (its trigger forbids it), as a bug would. */
async function cambiarElTextoAprobado(id: string): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await c.query("alter table public.carruseles disable trigger proteger_carrusel")
    await c.query(
      "update public.carruseles set texto_post = texto_post || ' (cambiado)' where id = (select puerta2_carrusel_id from public.piezas where id = $1)",
      [id],
    )
    await c.query("alter table public.carruseles enable trigger proteger_carrusel")
    await c.query("commit")
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}
```

(put it at module level, after `pdfAprobado`; import `EXPLICACION_CAMBIO_CARRUSEL` is not exported, so assert the
text literally), and:

```ts
  it("uploads the PDF gate 2 bound, never a newer version's", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    // A newer version with the same words (as a design change would make), and its own PDF in the store.
    await pool.query(
      `insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, diseno, pdf_clave)
       select pieza_id, version + 1, laminas, texto_post, hash_texto, 'cambio_diseno', '{"variante": "oscura"}', 'otro.pdf'
         from public.carruseles where id = (select puerta2_carrusel_id from public.piezas where id = $1)`,
      [id],
    )
    await d.almacen.subir("otro.pdf", new TextEncoder().encode("%PDF-1.7 otro"), "application/pdf")
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.subidasDeDocumento.map((s) => s.datos)).toEqual([PDF])
  })

  it("refuses a changed version before uploading anything", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await cambiarElTextoAprobado(id)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect(await leerFila(id)).toMatchObject({
      estado: "error_publicacion",
      explicacion:
        "El carrusel o su texto cambiaron después de que los aprobaste, así que no te lo dejé para subir. WAV ya está revisando.",
    })
  })

  it("refuses a version that changed while LinkedIn processed it, before sending", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({
      documento: async () => {
        await cambiarElTextoAprobado(id)
        return HttpResponse.json({ id: DOCUMENTO, status: "AVAILABLE" })
      },
    })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    expect(sim.documentosIniciados).toHaveLength(1)
    expect(sim.posts).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.enviado_en).toBeNull()
  })
```

The newer version is `escrito` (default), so `listo_con_archivos` does not apply, and its `hash_texto` equals the bound
one, so `proteger_pieza`'s latest-hash rule still lets the piece close.

- [ ] **Step 2: Run.** `pnpm test:db tests/integration/publicar-carrusel.test.ts` → PASS. Prove the last test bites by
temporarily deleting the re-read block in `enviar` (from `const releida` to its `return`), then restore.

- [ ] **Step 3: The reel guard.** `pnpm test:db tests/integration/publicar.test.ts tests/integration/publicar-linkedin.test.ts tests/integration/carrusel-aguas-abajo.test.ts && pnpm test:run`
→ PASS with no edits to those files.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/publicar-carrusel.test.ts
git commit -m "Cover that a carousel posts only the version gate 2 bound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Lote 5: Screens

### Task 14: Gate 2 says whether it posts by itself (P3-3)

**Files:**
- Create: `app/(app)/guion/[id]/linea-de-linkedin.ts`, `tests/unit/linea-de-linkedin.test.ts`
- Modify: `app/(app)/guion/[id]/puerta-2-carrusel.tsx`, `app/(app)/guion/[id]/carrusel.tsx`, `tests/unit/puerta-2-carrusel.test.tsx`

- [ ] **Step 1: Write the failing tests.** `tests/unit/linea-de-linkedin.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  detalleDeProgramado,
  lineaDeLinkedin,
  saleSoloEnLinkedin,
  TEXTO_LINKEDIN_A_MANO,
  TEXTO_PROGRAMADO_SOLO,
  TEXTO_SALE_SOLO_EN_LINKEDIN,
} from "@/app/(app)/guion/[id]/linea-de-linkedin"
import { TEXTO_PROGRAMADO_CARRUSEL } from "@/app/(app)/guion/[id]/textos"

const EL_JUEVES = "2026-10-29T22:00:00.000Z"

describe("whether a carousel will post by itself at its time", () => {
  it("does while the connection outlives the chosen time", () => {
    expect(saleSoloEnLinkedin("2026-12-06T12:00:00.000Z", EL_JUEVES)).toBe(true)
    expect(lineaDeLinkedin("2026-12-06T12:00:00.000Z", EL_JUEVES)).toBe(TEXTO_SALE_SOLO_EN_LINKEDIN)
    expect(detalleDeProgramado("2026-12-06T12:00:00.000Z", EL_JUEVES)).toBe(TEXTO_PROGRAMADO_SOLO)
  })

  it("does not without a connection, or when the token will have expired by then", () => {
    expect(lineaDeLinkedin(null, EL_JUEVES)).toBe(TEXTO_LINKEDIN_A_MANO)
    expect(lineaDeLinkedin("2026-10-29T21:59:00.000Z", EL_JUEVES)).toBe(TEXTO_LINKEDIN_A_MANO)
    expect(lineaDeLinkedin(EL_JUEVES, EL_JUEVES)).toBe(TEXTO_LINKEDIN_A_MANO)
    expect(detalleDeProgramado(null, EL_JUEVES)).toBe(TEXTO_PROGRAMADO_CARRUSEL)
  })
})
```

In `tests/unit/puerta-2-carrusel.test.tsx`, add `linkedinExpiraEn: "2026-12-06T12:00:00.000Z",` to `DATOS` and:

```ts
  it("says under the date that it posts by itself while LinkedIn will be connected", () => {
    render(<PantallaPuerta2Carrusel datos={DATOS} />)
    expect(screen.getByText("Se publica solo en LinkedIn a esa hora.")).toBeInTheDocument()
  })

  it("says it will be left to upload by hand when LinkedIn is not connected", () => {
    render(<PantallaPuerta2Carrusel datos={{ ...DATOS, linkedinExpiraEn: null }} />)
    expect(screen.getByText("LinkedIn no está conectado: te lo dejo para subir a mano.")).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run red.** `pnpm test:run tests/unit/linea-de-linkedin.test.ts tests/unit/puerta-2-carrusel.test.tsx` → FAIL.

- [ ] **Step 3: Implement.** `app/(app)/guion/[id]/linea-de-linkedin.ts` (pure, no imports from server code, safe for
the client component):

```ts
import { TEXTO_PROGRAMADO_CARRUSEL } from "./textos"

export const TEXTO_SALE_SOLO_EN_LINKEDIN = "Se publica solo en LinkedIn a esa hora."
export const TEXTO_LINKEDIN_A_MANO = "LinkedIn no está conectado: te lo dejo para subir a mano."
export const TEXTO_PROGRAMADO_SOLO = "A esa hora se publica solo en LinkedIn."

/**
 * Whether her LinkedIn connection will still be alive at `instante` (design P3-3: the expiry is known, so a token that
 * ends before the chosen date already says "a mano"). `expiraEn` is null when LinkedIn is not connected.
 */
export function saleSoloEnLinkedin(expiraEn: string | null, instante: string): boolean {
  return expiraEn !== null && Date.parse(expiraEn) > Date.parse(instante)
}

/** The line under the date at a carousel's gate 2. */
export function lineaDeLinkedin(expiraEn: string | null, publicarEn: string): string {
  return saleSoloEnLinkedin(expiraEn, publicarEn) ? TEXTO_SALE_SOLO_EN_LINKEDIN : TEXTO_LINKEDIN_A_MANO
}

/** What a scheduled carousel's screen says will happen at its time (decision P9). */
export function detalleDeProgramado(expiraEn: string | null, publicarEn: string): string {
  return saleSoloEnLinkedin(expiraEn, publicarEn) ? TEXTO_PROGRAMADO_SOLO : TEXTO_PROGRAMADO_CARRUSEL
}
```

`textos.ts` has no `"use client"` and only string constants, so importing it here is fine.

In `puerta-2-carrusel.tsx`: add to `DatosDePuerta2Carrusel`

```ts
  /** When her LinkedIn connection ends (null when not connected), read on the server: it decides the date's line. */
  linkedinExpiraEn: string | null
```

import `{ lineaDeLinkedin } from "./linea-de-linkedin"`, and right after the closing `</div>` of the
`flex flex-wrap items-center justify-between gap-3` row (inside the `grid gap-2` div), add:

```tsx
            <p className="text-meta text-apagado">{lineaDeLinkedin(datos.linkedinExpiraEn, fechaElegida.iso)}</p>
```

In `carrusel.tsx`, `case "carrusel_por_aprobar"`: import `leerVencimientoLinkedin` from `@/lib/datos/repositorio`
(beside `leerPublicaciones`), read it in the same `Promise.all`:

```ts
      const [imagenes, { fechas }, linkedinExpiraEn] = await Promise.all([
        Promise.all(version.pngClaves.map((clave) => urlParaVer(clave))),
        fechasDePuerta2(db, fila.id, Date.now()),
        leerVencimientoLinkedin(db),
      ])
```

and pass `linkedinExpiraEn,` in `datos`. `leerVencimientoLinkedin` reads only `ajustes` (no Vault), which Coni's session
may read (as `leerLinkedinConectado` already does).

- [ ] **Step 4: Run green.** `pnpm test:run tests/unit/linea-de-linkedin.test.ts tests/unit/puerta-2-carrusel.test.tsx && pnpm type && pnpm check && head -1 "app/(app)/guion/[id]/puerta-2-carrusel.tsx"` → PASS; first line `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/guion/[id]/linea-de-linkedin.ts" "app/(app)/guion/[id]/puerta-2-carrusel.tsx" "app/(app)/guion/[id]/carrusel.tsx" tests/unit/linea-de-linkedin.test.ts tests/unit/puerta-2-carrusel.test.tsx
git commit -m "Tell Coni at gate 2 whether her carousel posts by itself

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Scheduled, published and by-hand screens of a carousel (decision P9)

**Files:** Modify `app/(app)/guion/[id]/carrusel.tsx`, `tests/integration/flujo.ts`

This server component has no unit test file; its states are pinned by the E2E of Task 17, written first here and run
red at the end of this task.

- [ ] **Step 1: A seed for a published carousel.** In `tests/integration/flujo.ts`, add `| "publicado"` to
`EstadoDeCarruselDePrueba`, and in `crearCarruselEn` replace `if (destino === "programado") return id` with:

```ts
  if (destino === "programado") return id

  if (destino === "publicado") {
    // What part 3's publisher leaves: the row with its document and post, then the piece closed by the service.
    await asumir(c, comoServicio)
    await c.query(
      `update public.publicaciones
          set documento_urn = 'urn:li:document:D5510AQprueba', enviado_en = now(), estado = 'publicado',
              post_urn = 'urn:li:share:7123456789', enlace = 'https://www.linkedin.com/feed/update/urn:li:share:7123456789/',
              marcado_en = now()
        where pieza_id = $1 and destino = 'linkedin'`,
      [id],
    )
    await aplicar(c, id, comoServicio, { tipo: "publicado" })
    return id
  }
```

- [ ] **Step 2: Write the E2E tests** (they belong to Task 17's file; write them now) in `tests/e2e/carrusel.spec.ts`,
importing `conectarLinkedin`, `desconectarLinkedin` from `./ayudas` and `pool` already imported:

```ts
test("a carousel LinkedIn posted shows as published, with its link", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("publicado")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Publicado en LinkedIn")).toBeVisible()
  await expect(page.getByText("Salió solo a la hora que elegiste.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Ver en LinkedIn" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/feed/update/urn:li:share:7123456789/",
  )
})

test("a scheduled carousel says it posts by itself while LinkedIn will be connected", async ({ page }) => {
  await conectarLinkedin()
  const id = await sembrarCarruselDeEscena("programado")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("A esa hora se publica solo en LinkedIn.")).toBeVisible()
  await desconectarLinkedin()
  await page.reload()
  await expect(page.getByText("A esa hora te dejo el PDF y el texto para que lo subas a LinkedIn.")).toBeVisible()
})

test("a carousel left to upload by hand says why", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("para_subir_a_mano")
  await pool.query("update public.publicaciones set explicacion = $2 where pieza_id = $1 and destino = 'linkedin'", [
    id,
    "LinkedIn no está conectado, así que te lo dejé para subir a mano.",
  ])
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Listo para que lo subas a LinkedIn")).toBeVisible()
  await expect(page.getByText("LinkedIn no está conectado, así que te lo dejé para subir a mano.")).toBeVisible()
})
```

`sembrarCarruselDeEscena("programado")` signs for tomorrow (`maniana()`), inside `conectarLinkedin`'s 9.5 days. Add
`test.afterEach(async () => { await desconectarLinkedin() })` at the top of the file.

- [ ] **Step 3: Run red.** `pnpm db:reset && pnpm test:e2e tests/e2e/carrusel.spec.ts -g "published|posts by itself|says why"`
→ FAIL (no `publicado` case; old `programado` text; no reason).

- [ ] **Step 4: Implement** in `app/(app)/guion/[id]/carrusel.tsx` (imports: `detalleDeProgramado` from
`./linea-de-linkedin`; drop the now-unused `TEXTO_PROGRAMADO_CARRUSEL` import if Biome flags it):

```tsx
    case "programado": {
      const [{ zona }, linkedinExpiraEn] = await Promise.all([
        fechasDePuerta2(db, fila.id, Date.now()),
        leerVencimientoLinkedin(db),
      ])
      const cuando = fila.puerta2_publicar_en
        ? etiquetaDeFecha(fila.puerta2_publicar_en, zona, "larga")
        : "día aprobado"
      const detalle = fila.puerta2_publicar_en
        ? detalleDeProgramado(linkedinExpiraEn, fila.puerta2_publicar_en)
        : TEXTO_PROGRAMADO_CARRUSEL
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <LineaDeEstado tipo="exito" titulo={`Programado para el ${cuando}`} detalle={detalle} />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["cambiarFecha", "descartar"]} />
        </EstadoSencillo>
      )
    }
```

(keep `TEXTO_PROGRAMADO_CARRUSEL` imported: it is the fallback). In `case "para_subir_a_mano"`, read the row's reason
with the version:

```tsx
      const [version, publicaciones] = await Promise.all([
        fila.puerta2_carrusel_id ? leerVersion(db, fila.puerta2_carrusel_id) : Promise.resolve(null),
        leerPublicaciones(db, fila.id),
      ])
      if (!version) throw new Error(`La pieza ${fila.id} espera subirse sin el carrusel aprobado.`)
      const razon = publicaciones.find((p) => p.destino === "linkedin" && p.estado === "para_subir")?.explicacion
```

and `<LineaDeEstado tipo="aviso" titulo="Listo para que lo subas a LinkedIn" detalle={razon ?? undefined} />`. Add,
before `case "publicado_a_mano"`:

```tsx
    case "publicado": {
      const enlace = (await leerPublicaciones(db, fila.id)).find((p) => p.destino === "linkedin")?.enlace
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <MomentoDeCierre
            titulo="Publicado en LinkedIn"
            detalle="Salió solo a la hora que elegiste."
            enlaces={enlace ? [{ etiqueta: "Ver en LinkedIn", href: enlace }] : []}
          />
        </EstadoSencillo>
      )
    }
```

If `LineaDeEstado`'s `detalle` prop is not optional-accepting `undefined` under `exactOptionalPropertyTypes`, render it as
`{...(razon ? { detalle: razon } : {})}`.

- [ ] **Step 5: Run green.** `pnpm type && pnpm db:reset && pnpm test:e2e tests/e2e/carrusel.spec.ts` → PASS (the whole
file: part 2's tests still pass).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/guion/[id]/carrusel.tsx" tests/integration/flujo.ts tests/e2e/carrusel.spec.ts
git commit -m "Show a carousel's published state, its posting line and why it went by hand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: Inicio's notice for a published carousel

**Files:** Modify `lib/inicio/modelo.ts`, `tests/unit/inicio-modelo.test.ts`

- [ ] **Step 1: Write the failing test** (beside "celebrates the last piece published…"):

```ts
  it("celebrates a carousel LinkedIn posted without the Instagram line", () => {
    const carrusel = pieza("publicado", {
      tipo: "carrusel",
      actualizadaEn: "2026-10-07T14:00:00Z",
      destinos: ["linkedin"] as const,
    })
    const { avisos } = construirInicio({ piezas: [carrusel], ahora: AHORA, zona: ZONA })
    expect(avisos).toEqual([
      { tipo: "ok", titulo: `${carrusel.titulo} se publicó hoy a las 11:00`, texto: "Salió solo en LinkedIn." },
    ])
  })
```

- [ ] **Step 2: Run red.** `pnpm test:run tests/unit/inicio-modelo.test.ts` → FAIL (Instagram line).

- [ ] **Step 3: Implement** in `lib/inicio/modelo.ts`:

```ts
function avisoDePublicacion(pieza: PiezaDeInicio, ahora: number, zona: string): AvisoDeInicio {
  const titulo = `${pieza.titulo} se publicó ${cuandoSePublico(pieza, ahora, zona)}`
  // A carousel is a LinkedIn document signed with her name (C11): no Instagram, no AI label. Its link is on its screen.
  if (pieza.tipo === "carrusel") return { tipo: "ok", titulo, texto: "Salió solo en LinkedIn." }
  return {
    tipo: "ok",
    titulo,
    texto: "La etiqueta de IA quedó puesta en Instagram.",
    ...(pieza.permalink ? { accion: { etiqueta: "Ver en Instagram", href: pieza.permalink, externo: true } } : {}),
  }
}
```

- [ ] **Step 4: Run green.** `pnpm test:run tests/unit/inicio-modelo.test.ts && pnpm type` → PASS (the reel test unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/inicio/modelo.ts tests/unit/inicio-modelo.test.ts
git commit -m "Say in Inicio that a carousel went out on LinkedIn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Lote 6: E2E, baselines and axe

### Task 17: Gate 2's two lines end to end

**Files:** Modify `tests/e2e/carrusel.spec.ts`

- [ ] **Step 1: Write the tests:**

```ts
test("gate 2 of a carousel says it posts by itself while LinkedIn is connected, and by hand when not", async ({
  page,
}) => {
  await simularMedios(page)
  await conectarLinkedin()
  const id = await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Se publica solo en LinkedIn a esa hora.")).toBeVisible()

  await desconectarLinkedin()
  await page.reload()
  await expect(page.getByText("LinkedIn no está conectado: te lo dejo para subir a mano.")).toBeVisible()
})
```

The first offered date is the next free slot of `dias_publicacion` (at most a few days away), inside the 9.5 days of
`conectarLinkedin`; the expiry-vs-date edge is pinned by Task 14's unit test.

- [ ] **Step 2: Run.** `pnpm db:reset && pnpm test:e2e tests/e2e/carrusel.spec.ts` → PASS (it is green against Task 14;
to see it bite, temporarily pass `null` instead of `linkedinExpiraEn` in `carrusel.tsx`, then restore).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/carrusel.spec.ts
git commit -m "Cover gate 2's LinkedIn line end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: Baselines and axe

**Files:** Modify `tests/e2e/visual.spec.ts`, `tests/e2e/accesibilidad.spec.ts`, snapshots

- [ ] **Step 1:** In `tests/e2e/visual.spec.ts`, after "carrusel para subir":

```ts
test("carrusel publicado", async ({ page }) => {
  await sembrarEscena()
  const id = await sembrarCarruselDeEscena("publicado")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "carrusel-publicado")
})
```

In `tests/e2e/accesibilidad.spec.ts`, add `"publicado"` to the `estados` array of "the carousel's render, gate 2, design
change, upload and failure pass WCAG 2.x AA".

- [ ] **Step 2: Run red, then refresh only the expected baselines**

```bash
pnpm db:reset && pnpm test:e2e tests/e2e/visual.spec.ts -g "carrusel"
```

Expected: `carrusel-publicado` missing and `carrusel-puerta-2` (and `carrusel-puerta-2-diseno` if the date section is
in its frame) differ by the LinkedIn line only. Open each diff in `test-results/` and confirm it is that line. Then:

```bash
pnpm test:e2e tests/e2e/visual.spec.ts -g "carrusel publicado|carrusel puerta 2" --update-snapshots
pnpm test:e2e tests/e2e/visual.spec.ts tests/e2e/accesibilidad.spec.ts
```

Expected: PASS; `git status` shows only `carrusel-publicado-app-darwin.png` (new) and the `carrusel-puerta-2*` files.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/visual.spec.ts tests/e2e/accesibilidad.spec.ts tests/e2e/visual.spec.ts-snapshots/carrusel-publicado-app-darwin.png tests/e2e/visual.spec.ts-snapshots/carrusel-puerta-2*-app-darwin.png
git commit -m "Baseline and audit a published carousel and gate 2's LinkedIn line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Lote 7: Docs and verification

### Task 19: TRASPASO and PRODUCT

**Files:** Modify `docs/TRASPASO.md`, `docs/PRODUCT.md`

- [ ] **Step 1:** In `docs/TRASPASO.md` "Lo que está hecho", after the part 2 bullet:

```markdown
- **Carruseles de LinkedIn, parte 3** (plan `docs/superpowers/plans/2026-10-27-carrusel-parte-3.md`): a su hora el
  carrusel se publica solo en el perfil de Coni con la Documents API (`subirDocumento`, `estadoDelDocumento`,
  `crearPost` con documento y título = la portada), desde `resolverLinkedinCarrusel`
  (`lib/publicacion/linkedin-carrusel.ts`). Sube el PDF de la versión firmada una sola vez (`documento_urn`), espera
  `AVAILABLE`, vuelve a revisar versión, texto y media hora, reserva (`reservar_envio_linkedin` acepta documento desde la
  migración `20261028000100`) y nunca reenvía. Todo lo que no puede salir queda para subir a mano con la razón: sin
  conexión o token vencido, fuera de la media hora, LinkedIn rechazó el PDF o falló tres veces, o envío en duda. La puerta
  2 dice "Se publica solo en LinkedIn a esa hora." o "LinkedIn no está conectado: te lo dejo para subir a mano.".
  Verificado contra la documentación de LinkedIn (202609) el 2026-10-27; sin probar en real hasta el primer carrusel.
```

In `docs/PRODUCT.md`, in the carousels paragraph, replace "until the LinkedIn API path ships, she uploads the PDF
herself at its time" (or its Spanish equivalent there) with: at its time Conidolly posts it to her LinkedIn profile by
itself; if LinkedIn is not connected or does not take it, it is left for her to upload with the reason. es-CL, no long
dashes.

- [ ] **Step 2:** `grep -n -- '—' docs/TRASPASO.md docs/PRODUCT.md` prints nothing new.

- [ ] **Step 3: Commit**

```bash
git add docs/TRASPASO.md docs/PRODUCT.md
git commit -m "Record carousels part 3 in the handoff and product docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: Full verification and review

**Files:** none (fixes go in their own commits, test first).

- [ ] **Step 1: Full suites**

```bash
pnpm db:reset
pnpm type
pnpm test:run
pnpm test:db
pnpm exec biome check lib app components trigger scripts tests supabase 2>&1 | tail -20 > /tmp/lint-carrusel-3.txt
diff /tmp/lint-base-carrusel-3.txt /tmp/lint-carrusel-3.txt
pnpm build
pnpm test:e2e
```

Expected: all green; counts grow by this plan's tests (compare Task 0); empty lint diff; only Task 18's baselines changed.

- [ ] **Step 2: Banned patterns in my own diff**

```bash
git diff main -- lib app components trigger tests | grep -nE "as any|@ts-expect-error|—|catch \{\s*\}" || echo "clean"
git diff main -- app components | grep -nE "#[0-9a-fA-F]{3,6}\b" || echo "no hex"
git diff main -- lib/publicacion/linkedin.ts | grep -n "^-.*subirVideo\|^-.*estadoDelVideo" || echo "reel calls untouched"
head -1 "app/(app)/guion/[id]/puerta-2-carrusel.tsx"
grep -rn "video" lib/publicacion/linkedin-carrusel.ts | grep -v "borrarVideo" || echo "no video in the carousel path"
```

Expected: `clean`, `no hex`, `reel calls untouched`, `"use client"`, `no video in the carousel path`.

- [ ] **Step 3: Code review** with `superpowers:requesting-code-review` on `main..feat/carrusel-3`, giving decisions P1 to
P13 and the "LinkedIn API, verified" block. Focus: no path posts twice (reservation before `crearPost`, doubt never
resent, `documento_urn` stored before polling); every post is the bound version (`carruselId` + recomputed hash + post
text, checked before upload and again before reserving); the reel path's behavior is byte-identical except WAV's subject
naming the type; no token or upload URL in any error, notice or row; `publicarCarrusel` handles every `ResultadoLinkedin`
case; the SQL change only widens one `where`. Fix findings test-first.

- [ ] **Step 4: No commit** unless a fix was needed.

---

## Lote 8: Deploy runbook

### Task 21: Production (Federico; nothing runs without his explicit OK, step by step)

Federico runs every production command from the **macOS Terminal** (not the app's terminal). **Order: database, then
Trigger.dev, then the app.** Why:

- **Old code on the new database is safe:** the migration only widens `reservar_envio_linkedin`'s `where` (a row with a
  document); the old worker never writes `documento_urn`, so nothing it does changes.
- **The new worker needs the new database:** without the migration, its reservation of a document row raises
  `linkedin_no_espera` after uploading, and the carousel would sit until the half hour passed.
- **The new worker on the old app is safe:** carousels post by themselves; the old gate 2 just lacks the line and the old
  `programado` screen still says "te dejo el PDF" for minutes.
- **The new app on the old worker is not:** gate 2 would promise "Se publica solo" while the old worker hands it over.
  Hence Trigger.dev before Vercel.

- [ ] **Step 1 (OK needed): merge, no push unless asked.**
`git checkout main && git merge --no-ff feat/carrusel-3`. `git push` only when Federico asks.

- [ ] **Step 2 (OK needed): preflight, read only.** In the SQL editor of `estudio-coni` (`mvfytttfxmzzjajecsch`):

```sql
select linkedin_miembro is not null as conectado, linkedin_token_expira_en from public.ajustes;
select p.id, p.titulo, p.estado, p.puerta2_publicar_en, u.estado as fila, u.documento_urn, u.enviado_en
  from public.piezas p join public.publicaciones u on u.pieza_id = p.id and u.destino = 'linkedin'
 where p.tipo = 'carrusel' and p.estado in ('programado', 'para_subir_a_mano') order by p.puerta2_publicar_en;
```

Expected: connected, expiry about 2026-12-06; the list of scheduled carousels (any one due within the next hour should
wait until Step 5 is done, or Federico accepts that it may post during the deploy).

- [ ] **Step 3 (OK needed): database.** `supabase migration list` shows exactly `20261028000100` as local-only; then
`supabase db push`. Check:

```sql
select pg_get_functiondef('public.reservar_envio_linkedin(uuid, integer)'::regprocedure) like '%documento_urn is not null%' as acepta_documento,
       has_function_privilege('authenticated', 'public.reservar_envio_linkedin(uuid, integer)', 'execute') as autenticado,
       has_function_privilege('anon', 'public.reservar_envio_linkedin(uuid, integer)', 'execute') as anonimo;
```

Expected: `true`, `false`, `false`.

- [ ] **Step 4 (OK needed): Trigger.dev.** `pnpm install` first so the deploy bundles the lockfile's versions:

```bash
cd /Users/fede/Projects/estudio-coni && pnpm install
TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check
```

Check the deploy lists `publicar` (and the other tasks as before). Note the new version for TRASPASO. No new environment
variable.

- [ ] **Step 5 (OK needed): app**, only after Step 4, from a clean `git archive` of `main`:

```bash
cd /Users/fede/Projects/estudio-coni
rm -rf /tmp/estudio-deploy && mkdir /tmp/estudio-deploy && git archive main | tar -x -C /tmp/estudio-deploy
cp -R .vercel /tmp/estudio-deploy/ && cd /tmp/estudio-deploy && vercel deploy --prod --yes
```

Wait 15 to 45 s for the alias, then confirm it is served: the live HTML of a carousel at gate 2 (`/guion/<id>`, with
Coni's session) contains `Se publica solo en LinkedIn a esa hora.` before judging any screenshot (hard refresh if the old
page shows).

- [ ] **Step 6 (OK needed): smoke = the first real carousel.** Coni (or Federico with her) schedules a real carousel at
gate 2 and reads "Se publica solo en LinkedIn a esa hora.". At its time, Claude watches the `publicar` run in the
Trigger.dev dashboard (prod) and, after it:

```sql
select p.estado, p.explicacion, u.estado as fila, u.documento_urn, u.enviado_en, u.post_urn, u.enlace, u.intentos,
       u.explicacion as razon, u.ultimo_error
  from public.piezas p join public.publicaciones u on u.pieza_id = p.id and u.destino = 'linkedin'
 where p.id = '<its id>';
```

  - **Success:** `publicado`, a `urn:li:document:` and a `urn:li:share:`/`urn:li:ugcPost:` URN, the link opens the post
    on her profile with the PDF as a document titled with the cover and the approved text; Coni got "Tu carrusel «…» se
    publicó en LinkedIn. Míralo aquí: …". This confirms F3 for documents; record it in TRASPASO.
  - **A rejection** (`para_subir_a_mano`, `razon` = the carousel rejection text): Coni uploads it by hand from the app
    ("Descargar PDF", "Copiar texto", "Ya lo subí"). Read `ultimo_error` (and the run's log) before any retry; a 403 at
    `initializeUpload del documento` is F3 failing (the member app is not allowed `/rest/documents`).
  - **Doubt** (`enviado_en` set, no `post_urn`): check her profile first; never resend.

- [ ] **Step 7: Handoff.** Update `docs/TRASPASO.md` "Producción" (migration `20261028000100`, the Trigger version, the
Vercel deploy, the smoke result and whether F3 is confirmed) in a commit on `main`, pushed only if Federico asks. Update
the auto-memory note of the carousels only if Federico asks.

---

## Self-review (2026-10-27)

- **Spec coverage.** P3-1 steps 1 to 6: connection and bound-version guard (Task 9 `resolverLinkedinCarrusel`, Task 3);
  upload once from `pdf_clave` and store `documento_urn` (Tasks 5, 6, 9, 12); poll bounded by `sondeoLinkedin` and
  `plazoVencido` (Tasks 7, 9, 10, 11); re-read right before sending (Tasks 9, 13); reserve then `crearPost` with
  `commentary` = the version's post text and `title` = the cover, never resent (Tasks 1, 8, 9, 12); `post_urn` stored with
  retries (`guardarPost`), `publicada`, notice with the link (Tasks 2, 9). No avatar disclosure required (Task 9 asserts).
  P3-2 table: not connected and expired (Task 10, P2), late and LinkedIn's deadline (Task 10), rejection and processing
  failure after the maximum (Task 11, P3), doubt (Task 12), changed version (Task 13); transient failure counts one try
  (Task 11), `PROCESSING_FAILED` clears `documento_urn` (Task 11). P3-3 (Tasks 14, 17). P3-4: migration (Task 1),
  `documento_urn` writes and clears keeping `un_solo_medio` (Tasks 1, 5), `siguientePasoLinkedin` (Task 4), `publicada`
  through `cerrarPublicada` with the state machine checked test-first (Tasks 1, 2). P3-5: provider (Tasks 6 to 8),
  carousel branch (Task 9, P1), `publicar.ts` routing (Task 9), gate 2 line (Task 14), reels unchanged (Task 13 Step 3,
  Task 20). Tests section: unit, database, E2E (gate 2 lines, published, manual fallback: Tasks 15, 17 and part 2's
  "the manual upload" test kept), reel guard. Rollout (Task 21).
- **Gaps found and resolved.** The state machine refused `publicado` for a carousel (Task 2); `puedePublicar` could not
  take a `carruselId` (Task 3); `leerFilaLinkedin` did not read `documento_urn` (Task 4); a post saved by a run that
  stopped would have been handed over by hand (P7, Task 12); the `programado` screen and Inicio's notice would have told
  Coni the wrong thing after part 3 (P9, Tasks 15, 16); `publicado` had no carousel screen (Task 15); WAV's subject said
  "reel" (P10).
- **Placeholders.** None open. Conditional notes name their fallback: `LineaDeEstado`'s optional `detalle` (Task 15), a
  Biome unused import (Task 15).
- **Type consistency.** `FilaDeLinkedin.documentoUrn`, `PasoLinkedin` `subir_documento`/`esperar_documento`,
  `siguientePasoLinkedin(fila, medio)` (Task 4) are used by Task 9; `guardarDocumentoLinkedin`,
  `sumarIntentoLinkedin({ borrarDocumento })` (Task 5) by Task 9; `subirDocumento`, `estadoDelDocumento`,
  `EstadoDeDocumento`, `MedioDelPost`, `crearPost({ documento, titulo })` (Tasks 6 to 8) by Task 9; `DOCUMENTO`,
  `documentosIniciados`, `subidasDeDocumento`, `consultasDeDocumento`, options `documentos`, `iniciarDocumento`,
  `subidaDeDocumento`, `documento` (Task 6) by Tasks 9 to 13; exported `aMano`, `antesDeEnviar(…, rechazo)`,
  `plazoVencido`, `guardarPost` (Task 9) by `linkedin-carrusel.ts`; `EXPLICACION_LINKEDIN_CARRUSEL`,
  `EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL`, `resolverLinkedinCarrusel` (Task 9) by Tasks 10 to 13; `publicarCarrusel`,
  `rechazarCarrusel`, `avisarCarruselPublicado` (Task 9); `saleSoloEnLinkedin`, `lineaDeLinkedin`, `detalleDeProgramado`,
  `linkedinExpiraEn` (Task 14) by Task 15; `crearCarruselEn(…, "publicado")` (Task 15) by Tasks 15, 18.
- **Risks I checked.** F3 unverified: the manual net plus a read of `ultimo_error` before any retry (Task 21). A run
  ending between reservation and `guardarPost`: `dudosa` next tick, never resent. A run ending between `guardarPost` and
  closing: P7. Disabling `proteger_carrusel` in a test inside one transaction (ACCESS EXCLUSIVE lock, no other test sees
  it). The token expiring between gate 2 and the time: the line already says "a mano" (Task 14) and the publisher settles
  it (Task 10). Known limit: LinkedIn's title length and PUT content type are not documented; the first carousel tells.
