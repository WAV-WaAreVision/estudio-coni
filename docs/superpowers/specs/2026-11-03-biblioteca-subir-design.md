# Biblioteca in Conidolly, batch 2: Subir (change 29, stage 2)

Issue WAV-WaAreVision/estudio-coni#17 · Pedido 29b · batch 2 of 7. Approved by Federico on 2026-11-03, including the R2
CORS change. Sources: `docs/pedido-coni-2026-10-31/pedido-original.md` (Cambio 29, fixes 4d, 4e, 4k), batch 1 spec
`docs/superpowers/specs/2026-11-02-biblioteca-materiales-design.md` (its "fixed for the whole stage" rules apply here).
Ported from Ingesta `app/(app)/subir/*`, `lib/ingesta/subir.ts`, `subida-cliente.ts`, `modelo.ts` (`leerEntrada`),
`youtube.ts` (commit 39f9887).

## Context

Batch 1 left in Conidolly the store (`urlDeSubida`, `tamano`), the `material` disparo with a per-attempt key, the E2E fake
S3 and the Biblioteca shell. The database already lets Coni insert materials and `materiales_archivos`, and delete a
material she uploaded (`supabase/migrations/20261003000100_ingesta.sql`). So this batch needs **no migration and no
Trigger deploy**. The bar's tab still opens Ingesta until batch 7.

## 1. Where it lives

- Page `app/(app)/biblioteca/subir/page.tsx` (gate `exigirConi()`, own `loading`/`error`/`not-found` come from the section).
  It is not a section tab: a "Subir" button sits in the Materiales header and in its empty state.
- "← Volver a Biblioteca" top left (to `/biblioteca`), and a quiet "Cancelar" next to "Subir" (same destination) (4e).
- Phone: one column. Desktop: a reading column (same width rule as the batch 1 detail), no side panel.

## 2. One field (4k, 4d)

- One field labelled "Pega un enlace o elige un archivo", plus its own "Elegir archivo" button (a hidden native input
  behind a `Boton`), with the chosen file name(s) below (4d). Never the native "Choose File".
- A pure `detectarTipo` in `lib/dominio/biblioteca/subir.ts` decides the type from what was pasted or picked:

  | Input | Detected (label) | Material `tipo` |
  |---|---|---|
  | YouTube link (any youtube.com / youtu.be / youtube-nocookie subdomain) | "Video de YouTube" | `link` |
  | open.spotify.com / podcasts.apple.com link | "Podcast" | `link` |
  | other http(s) link | "Enlace" | `link` |
  | .pdf .docx .txt | "Documento" | `documento` |
  | .mp3 .m4a .wav | "Audio" | `audio` |
  | .mp4 .mov | "Video" | `video` |
  | .jpg .jpeg .png .webp .heic (1 to 20) | "Imagen" / "N imágenes" | `imagen` |
  | pasted text that is not a link | "Texto" | `post` |
  | any other extension | nothing detected; the field says which files it takes | none |

- The detected type shows as an editable fact ("Tipo: Video de YouTube · Cambiar"); "Cambiar" opens the six types
  (`TIPOS_DE_MATERIAL`, labels from `ETIQUETA_DE_TIPO`). A manual choice wins over detection until the input changes.
- Extras per type, as Ingesta: YouTube asks for the pasted transcript (Ingesta's `PASOS_DE_YOUTUBE` steps); podcast shows
  "Por ahora leo solo la página del episodio; el audio llega más adelante."; `post` takes the pasted text and an optional
  video; `video` and `imagen` take the reference link ("no se abre"); images keep order (← →) and "Quitar".
- Kept from Ingesta: optional title, `SelectorDeAutor` with "Autor nuevo" (batch 1), "¿Quién es para ti?" with the four
  roles (choosing "Lo dijo Coni" with no author picks Coni), and the "Este material no contiene datos de pacientes" box.
- Input rules (`leerEntrada`, ported to `lib/dominio/biblioteca/subir.ts`): 2 GB per file, up to 20 images, extensions
  per type, link required for `link`, transcript required for YouTube, text required for `post`. The server runs the
  same rules again.

## 3. Upload flow

Same three steps as Ingesta, as server actions in `lib/acciones/biblioteca.ts` through `conSesionDeConi` with Zod:

1. `crearMaterial`: insert the row as Coni (and `materiales_archivos` for images), then sign one PUT per file with
   `almacen.urlDeSubida(clave, 1 h, contentType)`. A failed signature or image insert deletes the row.
2. The browser PUTs each file straight to R2 (`subirArchivos`, ported to `app/(app)/biblioteca/subir/subida-cliente.ts`), showing
   "Subiendo 1 de N".
3. `confirmarMaterial`: checks every file with `almacen.tamano` (missing, empty or over 2 GB deletes the material with
   a plain message), then `disparos.material(id)`. A failed disparo calls `marcar_disparo_fallido` and says the material
   was saved. A second confirm of a material no longer `procesando` is a no-op.

If an upload fails, `descartarMaterial` deletes the row, only when it is still `procesando` and uploaded by Coni. After
confirm, the page goes to `/biblioteca` with the notice "Lo estoy procesando." and the list's auto-refresh takes over.
Cost behaviour ("Procesar por ~US$ X") stays as today; it changes in batch 6. `revalidatePath("/biblioteca")`.

## 4. R2 CORS (approved)

Add a second rule to bucket `estudio-coni`: origin `https://conidolly.vercel.app`, methods PUT, GET, HEAD, header
`content-type`, expose `ETag`, max age 3600. Ingesta's rule `conidolly-ingesta-subidas` stays untouched. Done with the
Cloudflare API right before the merge, read back to verify. Preview deployments cannot upload (no CORS); the E2E uses
the fake S3.

## 5. Tests (TDD, failing test first)

- Unit: `detectarTipo` (every row of the table, uppercase extensions, links with spaces, plain text vs link), manual
  type wins, `leerEntrada` rules, `subirArchivos` (order, content type, failure message), the page's pure labels.
- Integration (local Supabase): create, confirm and discard as Coni; WAV refused on all three; discard never deletes a
  ready material; confirm with a missing file deletes the material.
- E2E (phone and desktop, fake S3): upload a PDF; a YouTube link with transcript; three images reordered; a failed PUT
  leaves no material; "Volver a Biblioteca" and "Cancelar"; each confirm records a `procesar-material` disparo; axe;
  large text; `tests/unit/diseno-reglas.test.ts` on every new file.
- Visual baselines for Subir (phone and desktop), committed after Federico looks at them.

## 6. Release

Merge plus the CORS rule (section 4). No migration, no Trigger deploy, no env var. After the merge `/biblioteca/subir`
redirects to sign-in without a session; Federico uploads one real PDF with Coni's account by the address.

## Out of scope

Repeated material and folders (change 8), Gemini for YouTube (change 5), the shared classification card with Investigar
(change 24), processing immediately (batch 6), the tab switch (batch 7).
