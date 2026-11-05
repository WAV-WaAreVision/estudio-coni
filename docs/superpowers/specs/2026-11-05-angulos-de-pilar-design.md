# Pillars per network, part 15d: angles of a pillar and the balance warning

Issue WAV-WaAreVision/estudio-coni#18 (change 15), last of four parts. Design approved by Federico on 2026-11-05.
Builds on 15a (`2026-11-04-pilares-por-red-design.md`, PR #68), 15b (`2026-11-04-temas-por-red-design.md`, PR #70) and
15c (`2026-11-05-borradores-de-pilares-design.md`, PR #72). Source: Coni's answer of 2026-11-04,
`docs/pedido-coni-2026-10-31/respuesta-coni-temas-pilares-2026-11-04.md`, part 1 section 6, and parts 3 and 4 (the
manual sections with each angle's definition, voice, format and series).

## Context

- **Coni's rule:** three merged pillars have two angles each, "dos formas de abordarlos, cada una con su voz y su
  formato", and every piece of those pillars keeps its angle. In «Psicología en la mesa» at least 1 of every 3 pieces is
  «Lo que construyo»; in «Mi nueva partida», at least 1 of every 3 is «Pruébalo tú». If weeks go by without that angle,
  the app tells her. It only warns, it never blocks.
- **Today's data:**
  - Pillars are `categorias` rows (`es_pilar`, `red`, `es_capa`), read only through `leerPilares` (`lib/datos/pilares.ts`).
    Their `descripcion` (15a seed) already mentions the angles in prose.
  - `ideas.pilar` is `text` holding the pillar's `categorias.slug` (foreign key `ideas_pilar_fkey`, trigger
    `exigir_pilar_activo`). A piece points at its idea through `piezas.idea_id`; there is no pillar on the piece.
  - A piece went out on a network when its `publicaciones` row is `publicado` or `subido_a_mano` (the definition of
    15b's `temas_tratados`); both paths set `marcado_en`. A piece may go out on both networks: one row per network.
  - `avisos.tipo` is a check constraint that each new kind drops and re-adds with the full list
    (`20261103000100_presupuesto.sql`); `TIPOS_DE_AVISO` (`lib/avisos/tipos.ts`) must equal it (two integration tests
    compare them). `avisos.clave` is unique and `registrarAviso` stores a key once.
  - The 08:30 summary (`resumen-diario`, `enviarResumenDelDia` in `lib/avisos/resumen.ts`) already writes the notices
    that are not born from a state change (Monday's ideas, the 48 h reminders) before it sends the pending ones.

## Decisions taken in the design

1. **Angles are data,** in their own table, seeded by the migration with the manuals' words. A layer or a pillar
   without rows has no angles; the app never edits them.
2. **The angle lives on the idea** (`ideas.angulo_id`), as the pillar does, so a piece's angle is its idea's angle.
   Existing ideas stay without one and do not count for the balance.
3. **Claude proposes, Coni corrects.** Every place that proposes a pillar proposes an angle when that pillar has angles;
   an angle that is not one of the chosen pillar's is dropped, never a failure. Coni sees the angle next to the pillar
   and can change it until she signs the script or the carousel at gate 1.
4. **The balance is per pillar, whatever the network,** over the published pieces that have an angle. It is checked once
   a day by the 08:30 summary, warns at most once per angle per week and never blocks anything.

## 1. Data

- **`pilar_angulos`:**
  - `id uuid primary key`, `pilar_id uuid not null`, `red text`, `es_capa boolean not null default false`,
    `slug text not null`, `nombre text not null`, `descripcion text not null` (definition, voice and format, as the
    prompts read it), `orden int not null`, `minimo numeric` (nullable: the least share of the pillar's pieces the
    angle must have; `check (minimo > 0 and minimo <= 1)`).
  - Like `pilar_pesos`, the pillar is tied through the composite key `(pilar_id, red, es_capa) references
    categorias (id, red, es_capa)` with `check (red is not null and not es_capa)`: an angle belongs to a network's
    pillar, never to a layer, and its pillar can neither become a layer nor lose its network.
  - `unique (pilar_id, slug)`, `unique (pilar_id, orden)`.
  - **Seed** (slug, «nombre», minimum), descriptions from parts 3 and 4 of Coni's answer:
    - `bienestar-e-impacto`: `lo-que-se-ve` «Lo que se ve» ("... Voz íntima, texto en primera persona."), `como-se-mide`
      «Cómo se mide» ("... Voz declarativa, carrusel PDF con datos."); no minimum.
    - `psicologia-en-la-mesa`: `lo-que-planteo` «Lo que planteo» ("... Voz declarativa, carrusel con datos y fuentes
      revisadas."), `lo-que-construyo` «Lo que construyo» ("... Voz íntima, fotos reales, demos y video."), minimum 1/3.
    - `mi-nueva-partida`: `lo-vivo` «Lo vivo» ("... Reel detrás de escena y Stories, voz íntima. Series «Mi nueva
      partida» y «Lo probé»."), `pruebalo-tu` «Pruébalo tú» ("... Reel de pantalla y carrusel paso a paso. Series
      «Prompt con inteligencia emocional» y «Pequeño experimento»."), minimum 1/3.
    - The minimum is stored as `1.0 / 3`, not a rounded decimal, so `ceil(6 * minimo)` is 2.
  - **RLS** like `categorias`: Coni and the maintainer read (`es_coni() or es_mantenedor()`); `revoke all` from `anon`,
    `authenticated` and `service_role`, `grant select` to `authenticated` and `service_role`. Only migrations write.
    Audited with `registrar_evento`.
- **`ideas.angulo_id uuid references pilar_angulos (id)`,** nullable, indexed. A before trigger
  `exigir_angulo_de_pilar` on insert or update of `pilar, angulo_id`:
  1. On update, when `pilar` changes and the same statement does not set `angulo_id`, it clears `angulo_id`. So the
     undo of 15a's lot (`deshacer_lote_de_pilares`) and any later pillar change leave the idea without an angle.
  2. A non-null angle must belong to the idea's pillar (`pilar_angulos.pilar_id` = the `categorias.id` of
     `ideas.pilar`), else `angulo_de_otro_pilar` (`23514`).
  3. On update, an angle change with the pillar unchanged is refused (`angulo_firmado`) when a piece of that idea,
     not `descartado`, has `puerta1_en` set. Asking for changes or "volver a firmar" clears `puerta1_en`, so the angle
     opens again with the script. The angle is not part of any gate hash.
- **`aplicar_lote_de_pilares` is redefined** (`create or replace`, same signature) so an idea row may carry
  `"angulo": slug`: it sets `angulo_id` with the pillar in one update, or fails with `angulo_de_otro_pilar`. Nothing
  else in it changes; `deshacer_lote_de_pilares` stays as it is (decision 1 of the trigger does the rest).
- **View `piezas_con_angulo`** (`security_invoker`, so only Coni's session and `service_role` see rows, as with
  `temas_tratados`): one row per piece that went out on some network (`publicaciones.estado in ('publicado',
  'subido_a_mano')`, `marcado_en` not null) and whose idea has an angle, with `pieza_id`, `pilar_id`, `angulo_id` and
  `publicada_en` = the earliest `marcado_en` of its rows. A piece out on both networks counts once. `revoke all` from
  `anon` and `authenticated`, `grant select` to `authenticated` and `service_role`.
- **`avisos_tipo_check`** is dropped and re-added with the full current list plus `equilibrio_de_angulo`, and
  `TIPOS_DE_AVISO` gains the same value.
- **Readers:** `leerPilares` selects `pilar_angulos(id, slug, nombre, descripcion, orden, minimo)`, so `DatosDePilar`
  carries `angulos` ordered by `orden` (empty for a layer or a pillar without them). Every reader that already selects
  an idea's `pilar` (`lib/datos/inicio.ts`, `calendario.ts`, `banco.ts`, `repositorio.ts`, the guion and video pages)
  also selects `angulo_id`. `pilarVisible(catalogo, slug, anguloId?)` adds `angulo: string | null` (the angle's
  `nombre`).

## 2. Claude proposes the angle

- **Shared:** `listaDePilares` (`lib/proveedores/anthropic/secciones.ts`) lists each pillar's angles under it
  (`  - ángulo lo-que-construyo: Lo que construyo. <descripcion>`), and the prompts say: when the chosen pillar has
  angles, `angulo` is the slug of one of them, else null. The answer field is a nullable string, checked after
  parsing against the chosen pillar's angles: anything else becomes null (tolerant, like the pillar of
  `proponerPilaresPorRed`). It never fails a run or a batch.
- **Weekly engine:** the ideas of `escribirTeorias` (`lib/proveedores/anthropic/teorias.ts`, run by `motor-semanal` and
  `motor-manual` through `lib/motor/semanal.ts`) gain `angulo`; `guardarIdeas` stores the angle's id.
- **Coni's own ideas:** `clasificarIdea` (`lib/proveedores/anthropic/ideas.ts`) proposes `angulo`; `IdeaPropia` shows an
  «Ángulo» choice under the pillar when that pillar has angles (prefilled, with «Sin ángulo» as the last option), and
  `crearIdeaPropia` takes the slug and stores its id.
- **`pnpm pilares:proponer`:** the idea proposals of `proponerPilaresPorRed` gain `angulo`; the CSV gains a column
  `angulo` after `pilar_nuevo` (also shown in Coni's Markdown list as «Ángulo»); `filasDelLote` checks it belongs to
  `pilar_nuevo` and sends it to the lot. `leerCsvPorRed` also accepts the 15a header without `angulo`, so a list already
  reviewed with Coni applies unchanged (its ideas get no angle).
- **Guion and carousel:** `IdeaParaGuion` gains `angulo: { nombre, descripcion } | null`, filled by `cargarContexto`
  (`lib/produccion/contexto.ts`). `pedidoDeGuion` (`guion.ts`) and `pedidoDeCarrusel` (`carrusel.ts`) add, after the
  «Pilar:» line, `Ángulo: <nombre> (<descripcion>)` and one rule: "Escribe con la voz y el formato del ángulo." An idea
  without an angle sends the prompt exactly as today.

## 3. Coni sees and changes the angle

- **Where it shows:** next to the pillar, as "Psicología en la mesa · Lo que construyo", everywhere an idea's pillar
  shows: the ideas of the week and the firm cards in Inicio (`ideas-semana.tsx`, `page.tsx`), `FilaPieza`, the
  calendar (`agenda-del-calendario`, `ritmo-del-calendario`), the guion and carousel pages (`EstadoSencillo`,
  `pantalla-guion`, `pantalla-carrusel`), the video page (`FilaMeta`) and the bank's `CartaDeIdea`. Without an angle it
  shows the pillar alone. Metrics keep grouping by pillar.
- **Changing it:** there is no action today that changes an idea's pillar (only "Cambiar pilares" of a topic, 15a), so
  this adds `cambiarAnguloAccion(ideaId, anguloId | null)` in `app/(app)/ideas/acciones.ts`, through
  `conSesionDeConi` and a domain function in `lib/acciones/ideas.ts`. It writes `ideas.angulo_id` with Coni's session
  (her RLS update policy on `ideas`); the trigger is the guard. An «Ángulo» control (the pillar's angles plus «Sin
  ángulo») sits:
  - on the bank's `CartaDeIdea` and in `IdeaPropia`;
  - on the guion and carousel pages while the piece is not signed at gate 1. After that the angle shows as text.
- **Errors** in her words: "Ese ángulo no es de este pilar." (`angulo_de_otro_pilar`), "Ya firmaste el guion: el
  ángulo quedó como estaba." (`angulo_firmado`), no session. Nothing is swallowed.
- **Accessibility and words:** as 15b and 15c: tú, no em dashes, targets of 44 px or more, a label on the control,
  phone and computer, Axe passes, large text works.

## 4. The balance warning

- **Rule** (pure, `lib/dominio/angulos.ts`, the time enters as a parameter), for each angle with `minimo`, over the
  rows of `piezas_con_angulo` of its pillar:
  1. **Share:** take the pillar's last 6 pieces by `publicada_en`. When there are 6 and fewer than `ceil(6 * minimo)`
     (2) are of the angle, it falls short. With fewer than 6 counted pieces this rule waits.
  2. **Time:** the reference is the angle's latest piece, or, when it has none, the pillar's first counted piece. It
     falls short when the reference is 21 days old or more and the pillar has a counted piece after it (with no piece
     of the angle, the first piece itself counts).
  Pieces without an angle count for neither rule, so nothing warns the day 15d ships.
- **Where it runs:** inside `enviarResumenDelDia`, next to `anunciarIdeasDelLunes` and `recordarEsperas`, so the notice
  goes out in that same 08:30 summary. No new task. If the check fails, the summary of the other notices still goes
  out and then the run fails, so `onFailure` tells WAV and the retry checks again.
- **The notice:** `registrarAviso` with `tipo = 'equilibrio_de_angulo'` and `clave = 'equilibrio_de_angulo:<angulo_id>:
  <lunes>'`, the Monday of the Monday to Sunday week in `ajustes.zona`: at most one per angle per week while it falls
  short. Messages:
  - share: "En «Psicología en la mesa», solo 1 de tus últimas 6 piezas es de «Lo que construyo». Tu regla es al menos
    2 de cada 6."
  - time: "Llevas 3 semanas sin publicar piezas de «Lo que construyo» en «Psicología en la mesa»."
  It shows in Inicio's «Avisos» and in the summary like any other. `CUERPO_DE_PUSH` gets "Un ángulo de tus pilares
  necesita piezas"; `rutaDeAviso` leads to `/biblioteca/temas`.
- **Temas row:** the page computes the same rule at load time (Coni's session reads the view) and the pillar's chip
  adds a second line «Falta Lo que construyo» while it falls short, so the mark ends with the shortfall, not with the
  week. It is text inside the chip's link, read with it by a screen reader.
- **Never blocks:** nothing in the engine, the gates or publishing reads the rule.

## 5. Tests (TDD, failing test first)

- **Integration (local Supabase):**
  - `pilar_angulos`: the six seeded rows; Coni and WAV read, nobody writes; an angle on a layer or on a pillar without
    a network is refused by the composite key.
  - `ideas.angulo_id`: an angle of another pillar fails with `angulo_de_otro_pilar`; changing the pillar clears the
    angle; setting pillar and angle together keeps it; changing the angle of an idea whose piece is signed fails with
    `angulo_firmado`, and works again after `puerta1_en` is cleared; a discarded piece does not lock it.
  - `aplicar_lote_de_pilares` with `angulo` sets it; with an angle of another pillar it fails and moves nothing; the
    undo leaves the idea without angle.
  - `piezas_con_angulo`: only `publicado` and `subido_a_mano`, a piece on two networks once with its first
    `marcado_en`, ideas without angle absent, WAV sees no row.
  - `avisos_tipo_check` equals `TIPOS_DE_AVISO` (the two existing tests).
  - The summary: a shortfall writes one notice per angle and week, a second run the same week writes none, the next
    week writes again; it is sent with the summary.
- **Unit:** the rule's cases (fewer than 6 pieces, exactly 2 of 6, 1 of 6, 21 days with and without later pillar
  pieces, never published), the week key across a daylight saving change, the tolerant angle in each proposer, the
  CSV with and without `angulo`, the label "pilar · ángulo", the chip's «Falta» line.
- **Prompts:** `tests/unit/anthropic-instrucciones.test.ts` pins prompts byte for byte; the fixtures change for
  `teorias`, `clasificarIdea`, `proponerPilaresPorRed` and the guion and carousel prompts with an angle, and stay equal
  for an idea without one.
- **E2E (phone and desktop):** Coni sees the angle next to the pillar on a guion page, changes it before signing, and
  sees it fixed after signing. With pieces the scene seeds relative to today, Temas shows «Falta Lo que construyo» on
  LinkedIn and Inicio lists the notice. Axe and large text.
- **Visual baselines:** the guion page, the bank card and Temas change; Federico looks at the captures before they are
  taken.

## 6. Release

- One additive migration: the table and its seed, the column, the trigger, the view, the new notice kind (drop and
  re-add of `avisos_tipo_check` with the full list, as in `20261103000100_presupuesto.sql`) and the redefined
  `aplicar_lote_de_pilares`. No existing row changes. `db push`, then merge.
- **Trigger deploy, with Federico's OK:** `motor-semanal` and `motor-manual` (angle in the ideas), `producir-pieza`
  (angle in the guion and carousel prompts) and `resumen-diario` (the balance). The old Trigger code works with the new
  database (the column is nullable), so the deploy follows the merge.
- If 15a's lot is applied before 15d ships, its four bank ideas stay without angle; Coni can set it on the bank card.

## Out of scope

Editing angles in the app. Angles for pillars approved from 15c drafts. Balance of weights between pillars. Angles in
metrics. Telling the engine which angle falls short.
