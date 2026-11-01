# Personal data register and AI transparency page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni opens Ajustes and reads, in plain words, every kind of personal data the app handles (what for, which provider, which country, when it is deleted), sees what the app deleted by itself, and confirms once a year that she reviewed it. A public page `/l/ia`, "Cómo uso IA en mi contenido", explains how she uses AI; she edits it from Ajustes and every published version is kept. WAV keeps the register up to date from Ingesta.

**Architecture:** One migration adds four tables (`inventario_de_datos`, `registro_de_borrados`, `revisiones_de_inventario`, `transparencia_versiones`), two `ajustes` columns, three Coni-only `security definer` RPCs, one anon function `transparencia_vigente()` and the full `avisos_tipo_check` list with `revision_de_inventario`. The deletion periods live once, in `lib/datos-personales/reglas.ts` (`REGLAS_DE_BORRADO`); retention and backups import them, and a new nightly step `huella` deletes old `visitas_clic`. Every deleting step writes one `registro_de_borrados` row per night through an `anotarBorrado` port. A nightly step sends the yearly review notice. Conidolly gets Ajustes › Datos personales (read-only, "Lo revisé") and Ajustes › Página de IA (editor, versions, bio line); `/l/ia` renders the current text as escaped paragraphs. Ingesta gets a WAV-only editor of the register.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (Postgres + RLS), Trigger.dev v4 (nightly maintenance), Vitest (unit `pnpm test:run`, integration `pnpm test:db` against local Supabase on port 54422), Playwright + axe (`pnpm test:e2e`), Biome (`pnpm lint`; never `--unsafe`).

**Spec:** `docs/superpowers/specs/2026-11-01-conidolly-registro-de-datos-y-transparencia-design.md`.

**Work in a worktree:** `git worktree add .worktrees/registro-de-datos feat/registro-de-datos` (the branch already exists with the spec commit; see P1: the main checkout must leave it first). Then `cd .worktrees/registro-de-datos && pnpm install --frozen-lockfile`. Commit after each task (messages in English, ending with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line); before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes and formatting only, never `--unsafe`) and check line 1 of every edited client file is still `"use client"`. No push. Never `supabase db push`, never a Trigger or Vercel deploy: those are Federico's (Task 16). Local Supabase must be running (`pnpm db:start`); every migration change is applied with `pnpm db:reset` (local only: it reruns all migrations and `supabase/seed.sql`).

The Ingesta part (Tasks 17 and 18) runs in `/Users/fede/Projects/conidolly-ingesta`, on its own branch, after Task 2 (it needs the migrated local database to regenerate its types).

## Decisions taken while planning (not in the spec)

- **P1. Worktree.** `feat/registro-de-datos` is checked out in `/Users/fede/Projects/estudio-coni` itself, so `git worktree add` refuses it. First run `git -C /Users/fede/Projects/estudio-coni switch main` (the checkout only has untracked `.impeccable/` files), then the worktree command above.
- **P2. The deletion log is a port, `anotarBorrado(regla, cantidad)`,** added to `DepsRetencion`, `DepsRespaldo` and the new `DepsHuella`. Production builds it once with `anotadorDeBorrados(db, ahora)` (`lib/datos-personales/borrados.ts`), so `respaldarBase` keeps its database-free unit tests. It writes nothing when `cantidad` is 0.
- **P3. Two `ajustes` columns in the same migration:** `inventario_desde date not null default current_date` (the day the migration runs: the base of the first yearly review, "after the migration date" in the spec) and `revision_de_inventario_avisada date` (the due date already notified, the same once-only pattern as `linkedin_version_avisada`).
- **P4. `regla_de_borrado` is set only by migrations.** Column grants let WAV insert and update every descriptive column but not `regla_de_borrado` (D4: a screen edit never changes what is deleted). Ingesta shows it read-only. WAV can still change `plazo_dias`, and Conidolly flags the mismatch.
- **P5. WAV's draft is version 0** (`propuesta = true`, `creada_por` null, never `vigente` by a check constraint). Coni's first publication is version 1. The history in Ajustes lists published versions only; the editor starts from the draft until the first publication.
- **P6. Two "unit" tests of the spec are integration tests:** "seed vs `REGLAS_DE_BORRADO`" and "`avisos_tipo_check` final list" read the migrated database (the seed and the check live in SQL, not in TypeScript).
- **P7. Every country starts unconfirmed.** No provider region could be verified from the repo while planning, so the "single documented region" exception is not applied: all 11 rows have `pais_confirmado = false`, and rows on Supabase or R2 say "Por confirmar". WAV confirms each from Ingesta after the legal review.
- **P8. The `/l` footer link to `/l/ia` shows only while a version is published,** so there is never a dead link before D7's first publication. A failed read hides it and is logged, as `/l` already does with its links.
- **P9. `/l/ia` reads with an anon-key client** (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, already set in Vercel for the proxy), so D6 is real: the public page can call `transparencia_vigente()` and nothing else.
- **P10. The bio line lives in Ajustes › Página de IA** with a "Copiar la línea" button: "Cómo uso IA en mi contenido: conidolly.vercel.app/l/ia".
- **P11. The yearly notice is not urgent** (it waits for the 08:30 summary); its push opens `/ajustes/datos-personales`. "Lo revisé" marks every unread `revision_de_inventario` notice as read.
- **P12. Deletion counts:** `videos_de_piezas` counts files (final videos and voices), `respaldos` counts dump files, `huella_de_visitas` counts rows. The screen words them per rule ("Se borraron 3 archivos de videos y voces el 2 de noviembre.").
- **P13. `huella` uses the zone in `ajustes`** (`leerZona`), the same calendar `registrar_clic` is called with, and deletes `dia < hoy - REGLAS_DE_BORRADO.huella_de_visitas`.
- **P14. Ingesta navigation:** `NavegacionPrincipal` takes the `rol` and shows a fifth tab "Datos" only to WAV; Coni opening `/datos-personales` reads one sentence instead of the editor. Ingesta gets unit and integration tests but no e2e: its Playwright setup signs in only as Coni.
- **P15. Ingesta branch in place** (`git switch -c feat/datos-personales main`): that repo does not ignore `.worktrees/`.

## File map

| File | Change |
|---|---|
| `supabase/migrations/20261101000100_registro_de_datos.sql` (new) | the 4 tables, RLS and grants, seed of 11 rows and of the draft, `ajustes` columns, `marcar_inventario_revisado`, `publicar_transparencia`, `volver_a_transparencia`, `transparencia_vigente`, `avisos_tipo_check` |
| `lib/supabase/database.types.ts` | regenerated (`pnpm db:types`) |
| `lib/avisos/tipos.ts` | `revision_de_inventario` in `TIPOS_DE_AVISO`, its push body and route |
| `lib/datos-personales/reglas.ts` (new) | `REGLAS_DE_BORRADO`, `ReglaDeBorrado`, `esReglaDeBorrado`, `discrepanciaDeRegla`, `textoDeDiscrepancia` |
| `lib/datos-personales/fechas.ts` (new) | `diaAntes`, `unAnioDespues`, `diaEnPalabras`, `instanteEnPalabras` |
| `lib/datos-personales/borrados.ts` (new) | `AnotarBorrado`, `anotadorDeBorrados` |
| `lib/datos-personales/revision.ts` (new) | `DIAS_DE_AVISO_DE_REVISION`, `venceLaRevision`, `revisionPorAvisar` |
| `lib/datos-personales/leer.ts` (new) | `leerFechasDeRevision`, `leerRegistroDeDatos` and their types |
| `lib/datos-personales/presentar.ts` (new) | `paisEnPalabras`, `fraseDeBorrado`, `presentarRegistro` |
| `lib/mantenimiento/retencion.ts`, `lib/mantenimiento/respaldo.ts` | periods from `REGLAS_DE_BORRADO`, log their deletions |
| `lib/mantenimiento/huella.ts` (new) | `DepsHuella`, `borrarHuellaDeVisitas` |
| `lib/mantenimiento/revision-de-inventario.ts` (new) | `DepsRevisionDeInventario`, `recordarRevisionDeInventario` |
| `lib/mantenimiento/ejecutar.ts`, `lib/produccion/deps-reales.ts`, `trigger/mantenimiento.ts` | wire the two new nightly steps and `anotarBorrado` |
| `lib/acciones/datos-personales.ts` (new) | `marcarInventarioRevisado`, `publicarTransparencia`, `volverATransparencia` |
| `app/(app)/ajustes/acciones.ts` | three Server Actions |
| `lib/transparencia/texto.ts` (new) | `TITULO_DE_TRANSPARENCIA`, limits, `LINEA_PARA_LA_BIO`, `normalizarTexto`, `largoDeTexto`, `parrafos` |
| `lib/transparencia/versiones.ts` (new) | `leerVersionesDeTransparencia` |
| `lib/transparencia/publica.ts` (new) | `clienteAnonimo`, `leerTransparenciaVigente` |
| `components/texto-en-parrafos.tsx` (new) | `TextoEnParrafos` |
| `app/(app)/ajustes/tus-datos.tsx` (new), `app/(app)/ajustes/page.tsx` | two rows: Datos personales, Página de IA |
| `app/(app)/ajustes/datos-personales/page.tsx`, `registro-de-datos.tsx` (new) | the register screen |
| `app/(app)/ajustes/pagina-de-ia/page.tsx`, `editor-de-pagina-de-ia.tsx` (new) | the page editor |
| `app/l/ia/page.tsx`, `app/l/ia/pagina-de-ia.tsx`, `app/l/ia/error.tsx` (new), `app/l/page.tsx` | public page, its error page, footer link |
| tests | unit: `avisos`, `reglas-de-borrado`, `fechas-de-datos`, `respaldo`, `revision-de-inventario`, `mantenimiento-nocturno`, `presentar-registro`, `registro-de-datos`, `tus-datos`, `texto-de-transparencia`, `texto-en-parrafos`, `editor-de-pagina-de-ia`, `pagina-de-ia-publica`; integration: `datos-personales-esquema`, `transparencia-esquema`, `registro-de-borrados`, `retencion`, `huella`, `revision-de-inventario`, `acciones-datos-personales`, `datos-personales-datos`, `transparencia-datos`, `transparencia-publica`; e2e: `datos-personales.spec.ts`, `pagina-de-ia.ts` (helper), `accesibilidad.spec.ts` |
| `docs/TRASPASO.md` | one bullet |
| Ingesta: `lib/supabase/database.types.ts`, `lib/ingesta/datos-personales.ts`, `components/navegacion-principal.tsx`, `app/(app)/datos-personales/{page,acciones,editor-de-fila}.tsx`, 4 pages passing `rol`, tests | WAV editor |

---

### Task 1: Schema for the register, the deletion log, the yearly review and its notice

**Files:**
- Create: `supabase/migrations/20261101000100_registro_de_datos.sql`
- Modify: `lib/avisos/tipos.ts`
- Test: `tests/integration/datos-personales-esquema.test.ts` (new), `tests/unit/avisos.test.ts`

- [ ] **Step 1: Write the failing unit test** (append to `tests/unit/avisos.test.ts`; `esTipoDeAviso`, `mensajePush` and `rutaDeAviso` are already imported)

```ts
describe("aviso de la revisión anual", () => {
  it("opens the register in Ajustes and says it in the push without detail", () => {
    const aviso = { tipo: "revision_de_inventario" } as const
    expect(esTipoDeAviso("revision_de_inventario")).toBe(true)
    expect(rutaDeAviso(aviso)).toBe("/ajustes/datos-personales")
    expect(mensajePush(aviso)).toMatchObject({
      cuerpo: "Te toca revisar tus datos personales",
      url: "/ajustes/datos-personales",
    })
  })
})
```

- [ ] **Step 2: Write the failing integration test** (`tests/integration/datos-personales-esquema.test.ts`)

```ts
import { afterAll, describe, expect, it } from "vitest"
import { TIPOS_DE_AVISO } from "@/lib/avisos/tipos"
import {
  asumir,
  como,
  comoConi,
  comoMantenedor,
  comoOtra,
  comoPostgres,
  comoServicio,
  CONI,
  fallaCon,
  MANTENEDOR,
  pool,
} from "./db"

afterAll(() => pool.end())

const CLAVES_SEMBRADAS = [
  "rostro_de_coni",
  "voz_de_coni",
  "conexiones_de_cuentas",
  "metricas_de_cuentas",
  "material_y_afirmaciones",
  "textos_enviados_a_ia",
  "audios_a_transcribir",
  "videos_de_piezas",
  "respaldos",
  "huella_de_visitas",
  "suscripciones_a_avisos",
]

const FILA_NUEVA =
  "insert into public.inventario_de_datos (clave, dato, para_que, proveedor, pais, plazo, orden) values ('prueba_nueva', 'Un dato de prueba', 'Probar el registro', 'Supabase', 'Por confirmar', 'Mientras dure la prueba', 99)"
const ANOTAR = "insert into public.registro_de_borrados (regla, cantidad) values ('respaldos', 2)"

describe("inventario_de_datos", () => {
  it("is seeded with the eleven kinds of data the app handles today, in order, none with its country confirmed", async () => {
    const { rows } = await pool.query<{ clave: string; pais_confirmado: boolean }>(
      "select clave, pais_confirmado from public.inventario_de_datos order by orden",
    )
    expect(rows.map((fila) => fila.clave)).toEqual(CLAVES_SEMBRADAS)
    expect(rows.filter((fila) => fila.pais_confirmado)).toEqual([])
  })

  it("lets Coni and WAV read it and hides it from anybody else", async () => {
    await como(comoPostgres, async (c) => {
      const total = (await c.query("select 1 from public.inventario_de_datos")).rowCount
      for (const [sesion, filas] of [
        [comoConi, total],
        [comoMantenedor, total],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        expect((await c.query("select 1 from public.inventario_de_datos")).rowCount).toBe(filas)
      }
    })
  })

  it("lets WAV add, correct and remove a row, and stamps who changed it", async () => {
    await como(comoMantenedor, async (c) => {
      await c.query(FILA_NUEVA)
      const { rows } = await c.query<{ actualizado_por: string }>(
        "update public.inventario_de_datos set pais = 'Brasil', pais_confirmado = true where clave = 'prueba_nueva' returning actualizado_por",
      )
      expect(rows[0]?.actualizado_por).toBe(MANTENEDOR)
      expect((await c.query("delete from public.inventario_de_datos where clave = 'prueba_nueva'")).rowCount).toBe(1)
    })
  })

  it("does not let Coni or anybody else change it", async () => {
    for (const sesion of [comoConi, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await c.query("update public.inventario_de_datos set pais = 'Chile'")).rowCount).toBe(0)
        expect((await c.query("delete from public.inventario_de_datos")).rowCount).toBe(0)
        const alta = await fallaCon(c, FILA_NUEVA)
        expect(alta.message).toMatch(/row-level security/)
      })
    }
  })

  it("never lets WAV change what the app deletes: the rule is set by migrations only", async () => {
    await como(comoMantenedor, async (c) => {
      const error = await fallaCon(
        c,
        "update public.inventario_de_datos set regla_de_borrado = null where clave = 'respaldos'",
      )
      expect(error.message).toMatch(/permission denied/)
    })
  })

  it("needs the days whenever a row has a deletion rule", async () => {
    await como(comoMantenedor, async (c) => {
      const error = await fallaCon(c, "update public.inventario_de_datos set plazo_dias = null where clave = 'respaldos'")
      expect(error.message).toMatch(/regla_con_plazo/)
    })
  })
})

describe("registro_de_borrados", () => {
  it("lets only the service role write it", async () => {
    await como(comoServicio, async (c) => {
      expect((await c.query(ANOTAR)).rowCount).toBe(1)
    })
    for (const sesion of [comoConi, comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await fallaCon(c, ANOTAR)).message).toMatch(/permission denied/)
      })
    }
  })

  it("lets Coni and WAV read it and hides it from anybody else", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("delete from public.registro_de_borrados")
      await c.query(ANOTAR)
      for (const [sesion, filas] of [
        [comoConi, 1],
        [comoMantenedor, 1],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        expect((await c.query("select * from public.registro_de_borrados")).rowCount).toBe(filas)
      }
    })
  })

  it("refuses a row that deleted nothing", async () => {
    await como(comoServicio, async (c) => {
      const error = await fallaCon(c, "insert into public.registro_de_borrados (regla, cantidad) values ('respaldos', 0)")
      expect(error.message).toMatch(/check constraint/)
    })
  })
})

describe("marcar_inventario_revisado", () => {
  it("lets Coni mark the register as reviewed and closes the yearly notice", async () => {
    const clave = `revision_de_inventario:prueba-${Date.now()}`
    await como(comoPostgres, async (c) => {
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('revision_de_inventario', $1, 'Te toca revisar tu registro.')",
        [clave],
      )
      const contar = async () =>
        (
          await c.query<{ n: number }>(
            "select count(*)::int as n from public.revisiones_de_inventario where revisado_por = $1",
            [CONI],
          )
        ).rows[0]?.n
      const antes = await contar()

      await asumir(c, comoConi)
      const { rows } = await c.query<{ revisado_en: Date }>("select public.marcar_inventario_revisado() as revisado_en")
      expect(rows[0]?.revisado_en).toBeInstanceOf(Date)

      await asumir(c, comoPostgres)
      expect(await contar()).toBe((antes ?? 0) + 1)
      const aviso = await c.query<{ leido_en: Date | null }>("select leido_en from public.avisos where clave = $1", [
        clave,
      ])
      expect(aviso.rows[0]?.leido_en).toBeInstanceOf(Date)
    })
  })

  it("does not let WAV or anybody else mark it, nor anyone write a review directly", async () => {
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await fallaCon(c, "select public.marcar_inventario_revisado()")).message).toBe("solo_coni_revisa")
      })
    }
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "insert into public.revisiones_de_inventario (revisado_por) values ($1)", [CONI])
      expect(error.message).toMatch(/permission denied/)
    })
  })
})

describe("ajustes for the yearly review", () => {
  it("starts the register on the day of the migration", async () => {
    const { rows } = await pool.query<{ inventario_desde: Date | null }>("select inventario_desde from public.ajustes")
    expect(rows[0]?.inventario_desde).toBeInstanceOf(Date)
  })
})

describe("avisos_tipo_check", () => {
  it("accepts exactly the notice types the app knows, the yearly review included", async () => {
    const { rows } = await pool.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'avisos_tipo_check'",
    )
    const tipos = [...(rows[0]?.def ?? "").matchAll(/'([a-z0-9_]+)'::text/g)].map((m) => m[1])
    expect(tipos).toContain("revision_de_inventario")
    expect([...tipos].sort()).toEqual([...TIPOS_DE_AVISO].sort())
  })
})
```

- [ ] **Step 3: Run both, expect FAIL** (the type, the tables and the function do not exist)

Run: `pnpm test:run tests/unit/avisos.test.ts -t "revisión anual"` and `pnpm test:db tests/integration/datos-personales-esquema.test.ts`

- [ ] **Step 4: Implement the notice type** in `lib/avisos/tipos.ts`. Add `"revision_de_inventario",` as the last item of `TIPOS_DE_AVISO`, add to `CUERPO_DE_PUSH`:

```ts
  revision_de_inventario: "Te toca revisar tus datos personales",
```

and make `rutaDeAviso` start with:

```ts
export function rutaDeAviso(aviso: { tipo: TipoDeAviso; piezaId?: string | null }): string {
  if (aviso.tipo === "revision_de_inventario") return "/ajustes/datos-personales"
  if (!aviso.piezaId) return "/"
  return aviso.tipo === "guion_listo" ? `/guion/${aviso.piezaId}` : `/video/${aviso.piezaId}`
}
```

(update its doc comment: "Where tapping a notice leads: the piece it is about, the register for the yearly review, or Inicio. Never an approve action.").

- [ ] **Step 5: Write part 1 of the migration** (`supabase/migrations/20261101000100_registro_de_datos.sql`)

```sql
-- Personal data register and AI transparency page (spec 2026-11-01, change 26 of Coni's request). Part 1: the
-- register, the log of what the app deletes by itself, the yearly review and its notice.

-- What the app handles, in Coni's words (D2: WAV keeps it from Ingesta, Coni reads it in Ajustes). The register
-- describes and the code deletes (D4): `regla_de_borrado` is a key of REGLAS_DE_BORRADO in
-- lib/datos-personales/reglas.ts, set only by migrations; a different `plazo_dias` is shown as a mismatch.
create table public.inventario_de_datos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z][a-z_]{2,39}$'),
  dato text not null check (char_length(btrim(dato)) between 3 and 120),
  para_que text not null check (char_length(btrim(para_que)) between 3 and 300),
  proveedor text not null check (char_length(btrim(proveedor)) between 2 and 120),
  pais text not null check (char_length(btrim(pais)) between 2 and 80),
  pais_confirmado boolean not null default false,
  plazo text not null check (char_length(btrim(plazo)) between 3 and 200),
  regla_de_borrado text check (regla_de_borrado ~ '^[a-z][a-z_]{2,39}$'),
  plazo_dias integer check (plazo_dias is null or plazo_dias >= 0),
  orden integer not null check (orden between 0 and 999),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null,
  constraint regla_con_plazo check (regla_de_borrado is null or plazo_dias is not null)
);

create function public.sellar_inventario() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

create trigger sellar_inventario before insert or update on public.inventario_de_datos
  for each row execute function public.sellar_inventario();

alter table public.inventario_de_datos enable row level security;
create policy "coni y wav leen el inventario" on public.inventario_de_datos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "wav agrega al inventario" on public.inventario_de_datos for insert to authenticated
  with check (public.es_mantenedor());
create policy "wav corrige el inventario" on public.inventario_de_datos for update to authenticated
  using (public.es_mantenedor()) with check (public.es_mantenedor());
create policy "wav quita del inventario" on public.inventario_de_datos for delete to authenticated
  using (public.es_mantenedor());
revoke all on public.inventario_de_datos from anon;
revoke insert, update, delete, truncate on public.inventario_de_datos from authenticated;
grant select, delete on public.inventario_de_datos to authenticated;
grant insert (clave, dato, para_que, proveedor, pais, pais_confirmado, plazo, plazo_dias, orden)
  on public.inventario_de_datos to authenticated;
grant update (dato, para_que, proveedor, pais, pais_confirmado, plazo, plazo_dias, orden)
  on public.inventario_de_datos to authenticated;

-- What exists today (scope A). Followers, reposts and comments get their rows with their own changes (8, 13, 27).
-- Countries and periods wait for the legal review: WAV confirms them from Ingesta.
insert into public.inventario_de_datos
  (clave, orden, dato, para_que, proveedor, pais, plazo, regla_de_borrado, plazo_dias)
values
  ('rostro_de_coni', 1, 'Tu rostro (biometría)', 'Crear y animar tu avatar digital en los reels.', 'HeyGen',
   'Estados Unidos', 'Mientras uses el avatar. Se borra si se lo pides a HeyGen.', null, null),
  ('voz_de_coni', 2, 'Tu voz (biometría)', 'Crear la voz de tu avatar y leer tus guiones.', 'ElevenLabs',
   'Estados Unidos', 'Mientras uses la voz. Se borra si se lo pides a ElevenLabs.', null, null),
  ('conexiones_de_cuentas', 3, 'Las conexiones con tus cuentas de Instagram y LinkedIn',
   'Publicar tus piezas y leer sus números.', 'Meta y LinkedIn', 'Estados Unidos e Irlanda',
   'Mientras estén conectadas. Se borran al desconectarlas.', null, null),
  ('metricas_de_cuentas', 4, 'Los números de tus cuentas y de tus piezas',
   'Mostrarte cómo le va a cada pieza y a cada red.', 'Supabase', 'Por confirmar', 'Mientras uses la app.', null,
   null),
  ('material_y_afirmaciones', 5, 'Tu material de referencia y sus afirmaciones (sin datos de pacientes)',
   'Armar tu biblioteca y escribir tus piezas con fuentes.', 'Supabase y Cloudflare R2', 'Por confirmar',
   'Mientras exista tu biblioteca. Se borra al borrar el material.', null, null),
  ('textos_enviados_a_ia', 6, 'Textos enviados a IA', 'Escribir, revisar y buscar en tu material.',
   'Anthropic (Claude) y Voyage', 'Estados Unidos', 'Según cada proveedor, por confirmar.', null, null),
  ('audios_a_transcribir', 7, 'Audios y videos enviados a transcribir', 'Pasar a texto el material que subes.',
   'ElevenLabs', 'Estados Unidos', 'Según ElevenLabs, por confirmar.', null, null),
  ('videos_de_piezas', 8, 'Videos y voces de tus piezas', 'Grabar, revisar y publicar tus reels.', 'Cloudflare R2',
   'Por confirmar', 'El video final, 30 días después de publicar o descartar la pieza. La voz, 30 días después de descartarla.',
   'videos_de_piezas', 30),
  ('respaldos', 9, 'Respaldo nocturno de la base', 'Recuperar la app si algo se pierde.', 'Cloudflare R2',
   'Por confirmar', 'Se guardan los últimos 30 días.', 'respaldos', 30),
  ('huella_de_visitas', 10, 'Huella diaria de quien toca tus enlaces de /l',
   'Contar un clic por persona y día, sin guardar su dirección ni su aparato.', 'Supabase', 'Por confirmar',
   'Se borra al día siguiente. El respaldo nocturno guarda una copia hasta 30 días.', 'huella_de_visitas', 1),
  ('suscripciones_a_avisos', 11, 'Los aparatos donde recibes avisos', 'Mandarte avisos al celular.', 'Supabase',
   'Por confirmar', 'Mientras no los quites en Ajustes.', null, null);

-- One row per rule per night that deleted something: which rule, how many, when. Never what was deleted.
create table public.registro_de_borrados (
  id uuid primary key default gen_random_uuid(),
  regla text not null check (regla ~ '^[a-z][a-z_]{2,39}$'),
  cantidad integer not null check (cantidad > 0),
  borrado_en timestamptz not null default now()
);
create index registro_de_borrados_recientes on public.registro_de_borrados (borrado_en desc);

alter table public.registro_de_borrados enable row level security;
create policy "coni y wav leen los borrados" on public.registro_de_borrados for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- Written only by the nightly maintenance, as service_role.
revoke all on public.registro_de_borrados from anon;
revoke insert, update, delete, truncate on public.registro_de_borrados from authenticated;
grant select on public.registro_de_borrados to authenticated;

-- Coni's yearly "Lo revisé". Written only through marcar_inventario_revisado().
create table public.revisiones_de_inventario (
  id uuid primary key default gen_random_uuid(),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_en timestamptz not null default now()
);

alter table public.revisiones_de_inventario enable row level security;
create policy "coni y wav leen las revisiones" on public.revisiones_de_inventario for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
revoke all on public.revisiones_de_inventario from anon;
revoke insert, update, delete, truncate on public.revisiones_de_inventario from authenticated;
grant select on public.revisiones_de_inventario to authenticated;

alter table public.ajustes
  -- The first yearly review is due a year after the register started: the day this migration runs.
  add column inventario_desde date not null default current_date,
  -- The due date Coni and WAV were already told about: the nightly run tells them once per due date.
  add column revision_de_inventario_avisada date;

create function public.marcar_inventario_revisado() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_revisado_en timestamptz;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_revisa';
  end if;
  insert into public.revisiones_de_inventario (revisado_por) values (auth.uid())
    returning revisado_en into v_revisado_en;
  -- The yearly notice has done its job once she reviewed.
  update public.avisos set leido_en = now() where tipo = 'revision_de_inventario' and leido_en is null;
  return v_revisado_en;
end $$;

revoke execute on function public.marcar_inventario_revisado() from public, anon;
grant execute on function public.marcar_inventario_revisado() to authenticated;

-- `revision_de_inventario`: the yearly review. The full list (20261007000100_linkedin_conexion.sql plus this type);
-- tests/integration/datos-personales-esquema.test.ts checks it equals TIPOS_DE_AVISO.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer', 'revision_de_inventario'
));
```

- [ ] **Step 6: Apply and run, expect PASS**

Run: `pnpm db:reset`, then `pnpm test:db tests/integration/datos-personales-esquema.test.ts tests/integration/avisos-esquema.test.ts` and `pnpm test:run tests/unit/avisos.test.ts`

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261101000100_registro_de_datos.sql lib/avisos/tipos.ts tests/unit/avisos.test.ts tests/integration/datos-personales-esquema.test.ts
git commit -m "Add the personal data register, the deletion log and the yearly review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Schema for the versions of the AI page

**Files:**
- Modify: `supabase/migrations/20261101000100_registro_de_datos.sql` (append part 2), `lib/supabase/database.types.ts` (regenerated)
- Test: `tests/integration/transparencia-esquema.test.ts` (new)

- [ ] **Step 1: Write the failing test** (`tests/integration/transparencia-esquema.test.ts`)

```ts
import type { PoolClient } from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, CONI, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const OTRO = `${LARGO}\n\nY una línea más.`
const TABLAS = ["inventario_de_datos", "registro_de_borrados", "revisiones_de_inventario", "transparencia_versiones"]

/** Each test starts with nothing published; `como` rolls everything back afterwards. */
async function sinPublicar(c: PoolClient): Promise<void> {
  await asumir(c, comoPostgres)
  await c.query("delete from public.transparencia_versiones where not propuesta")
}

async function comoAnonimo(c: PoolClient): Promise<void> {
  await asumir(c, comoPostgres)
  await c.query("set local role anon")
}

async function publicar(c: PoolClient, texto: string, motivo: string): Promise<number | undefined> {
  const { rows } = await c.query<{ v: number }>("select public.publicar_transparencia($1, $2) as v", [texto, motivo])
  return rows[0]?.v
}

describe("transparencia_versiones", () => {
  it("starts with WAV's draft as version 0, a proposal that can never be the current page", async () => {
    const { rows } = await pool.query<{ version: number; vigente: boolean; largo: number }>(
      "select version, vigente, char_length(texto) as largo from public.transparencia_versiones where propuesta",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ version: 0, vigente: false })
    expect(rows[0]?.largo).toBeGreaterThanOrEqual(300)
    expect(rows[0]?.largo).toBeLessThanOrEqual(6000)
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(c, "update public.transparencia_versiones set vigente = true where propuesta")
      expect(error.message).toMatch(/propuesta_nunca_vigente/)
    })
  })

  it("gives the public page nothing before Coni publishes, then only the current text and its date", async () => {
    await como(comoPostgres, async (c) => {
      await sinPublicar(c)
      await comoAnonimo(c)
      expect((await c.query("select * from public.transparencia_vigente()")).rowCount).toBe(0)

      await asumir(c, comoConi)
      await publicar(c, LARGO, "Primera versión")
      await comoAnonimo(c)
      const { rows } = await c.query<{ texto: string; creada_en: Date }>("select * from public.transparencia_vigente()")
      expect(rows).toHaveLength(1)
      expect(rows[0]?.texto).toBe(LARGO)
      expect(rows[0]?.creada_en).toBeInstanceOf(Date)
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["creada_en", "texto"])
    })
  })

  it("lets Coni publish: each publication is a new version and the only current one", async () => {
    await como(comoPostgres, async (c) => {
      await sinPublicar(c)
      await asumir(c, comoConi)
      expect(await publicar(c, LARGO, "Primera versión")).toBe(1)
      expect(await publicar(c, `\r\n${OTRO}  `, "Agrego una línea")).toBe(2)
      const { rows } = await c.query<{ version: number; texto: string; creada_por: string }>(
        "select version, texto, creada_por from public.transparencia_versiones where vigente",
      )
      // Line ends are normalised and the edges trimmed, as the editor counts them.
      expect(rows).toEqual([{ version: 2, texto: OTRO, creada_por: CONI }])
    })
  })

  it("going back copies that text into a new version and never rewrites the history", async () => {
    await como(comoPostgres, async (c) => {
      await sinPublicar(c)
      await asumir(c, comoConi)
      await publicar(c, LARGO, "Primera versión")
      await publicar(c, OTRO, "Agrego una línea")
      const { rows: vuelta } = await c.query<{ v: number }>("select public.volver_a_transparencia(1) as v")
      expect(vuelta[0]?.v).toBe(3)
      const { rows } = await c.query<{ version: number; texto: string; motivo: string; vigente: boolean }>(
        "select version, texto, motivo, vigente from public.transparencia_versiones where not propuesta order by version",
      )
      expect(rows).toEqual([
        { version: 1, texto: LARGO, motivo: "Primera versión", vigente: false },
        { version: 2, texto: OTRO, motivo: "Agrego una línea", vigente: false },
        { version: 3, texto: LARGO, motivo: "Volví a la versión 1", vigente: true },
      ])
    })
  })

  it("refuses a text outside 300 to 6000 characters, a change without a reason and an unknown version", async () => {
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.publicar_transparencia('Muy corto.', 'Prueba')")).message).toBe(
        "texto_fuera_de_largo",
      )
      expect(
        (await fallaCon(c, "select public.publicar_transparencia($1, 'Prueba')", ["x".repeat(6001)])).message,
      ).toBe("texto_fuera_de_largo")
      expect((await fallaCon(c, "select public.publicar_transparencia($1, '  ')", [LARGO])).message).toBe(
        "falta_motivo",
      )
      expect((await fallaCon(c, "select public.volver_a_transparencia(999)")).message).toBe("version_desconocida")
    })
  })

  it("lets nobody but Coni publish or go back", async () => {
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await fallaCon(c, "select public.publicar_transparencia($1, 'Prueba')", [LARGO])).message).toBe(
          "solo_coni_publica",
        )
        expect((await fallaCon(c, "select public.volver_a_transparencia(0)")).message).toBe("solo_coni_publica")
      })
    }
  })

  it("lets Coni and WAV read the versions and nobody write them directly", async () => {
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        expect((await c.query("select 1 from public.transparencia_versiones where propuesta")).rowCount).toBe(1)
        const error = await fallaCon(
          c,
          "insert into public.transparencia_versiones (version, texto, motivo) values (50, $1, 'Directo')",
          [LARGO],
        )
        expect(error.message).toMatch(/permission denied/)
      })
    }
    await como(comoOtra, async (c) => {
      expect((await c.query("select 1 from public.transparencia_versiones")).rowCount).toBe(0)
    })
  })

  it("lets the public call transparencia_vigente() and nothing else of this feature", async () => {
    await como(comoPostgres, async (c) => {
      for (const tabla of TABLAS) {
        await comoAnonimo(c)
        expect((await fallaCon(c, `select * from public.${tabla}`)).message).toMatch(/permission denied/)
      }
      for (const llamada of [
        "select public.publicar_transparencia('x', 'y')",
        "select public.volver_a_transparencia(0)",
        "select public.marcar_inventario_revisado()",
      ]) {
        await comoAnonimo(c)
        expect((await fallaCon(c, llamada)).message).toMatch(/permission denied/)
      }
    })
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/transparencia-esquema.test.ts`

- [ ] **Step 3: Append part 2 to the migration** (end of `supabase/migrations/20261101000100_registro_de_datos.sql`)

```sql
-- Part 2: «Cómo uso IA en mi contenido». Coni edits and publishes it (D3); every publication is a new version and
-- going back copies an old text into a new one, so the history is never rewritten. Plain text with blank lines
-- between paragraphs (D5). WAV's first draft is version 0, a proposal that can never be the current page.
create table public.transparencia_versiones (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version >= 0),
  texto text not null check (char_length(texto) between 300 and 6000),
  motivo text not null check (char_length(btrim(motivo)) between 3 and 300),
  creada_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default now(),
  propuesta boolean not null default false,
  vigente boolean not null default false,
  constraint propuesta_nunca_vigente check (not (propuesta and vigente))
);
create unique index una_transparencia_vigente on public.transparencia_versiones (vigente) where vigente;

alter table public.transparencia_versiones enable row level security;
create policy "coni y wav leen las versiones" on public.transparencia_versiones for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- Written only through publicar_transparencia and volver_a_transparencia.
revoke all on public.transparencia_versiones from anon;
revoke insert, update, delete, truncate on public.transparencia_versiones from authenticated;
grant select on public.transparencia_versiones to authenticated;

-- WAV's draft from Coni's five points (pedido L.16851). Coni rewrites and publishes it.
insert into public.transparencia_versiones (version, texto, motivo, propuesta) values (0, $texto$Uso inteligencia artificial para hacer mi contenido y quiero contarte cómo, con palabras simples.

Algunos de mis reels los hace mi avatar digital: una versión de mí creada con IA a partir de mi rostro y mi voz, con mi autorización. Cada reel hecho así lo dice en su texto y, en Instagram, lleva la etiqueta «Información de IA». Antes de que salga, veo el video completo y lo apruebo yo.

Mis textos los escribo con apoyo de IA. La herramienta me ayuda a ordenar ideas, proponer borradores y revisar la redacción, pero cada texto lo leo, lo corrijo y lo firmo yo. Lo que publico es mi criterio profesional y respondo por él.

Cuando hablo de un estudio o de un dato, cito la fuente para que puedas revisarla tú también. Si algo no tiene una fuente que lo respalde, no lo presento como un hecho.

Nunca uso datos de mis pacientes. Ninguna conversación, historia ni caso de mi consulta entra a estas herramientas ni aparece en mi contenido.

Si uso una imagen hecha con IA que se ve real, la marco como hecha con IA. No publico imágenes hechas con IA que se hagan pasar por fotos reales de una persona, un lugar o una situación.

Mi contenido es educativo y no reemplaza una consulta.$texto$, 'Borrador de WAV para que lo revises', true);

create function public.publicar_transparencia(p_texto text, p_motivo text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  -- The same normalisation as normalizarTexto in lib/transparencia/texto.ts, so the editor counts what is stored.
  v_texto text := btrim(replace(coalesce(p_texto, ''), E'\r\n', E'\n'), E' \t\n');
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_version integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_publica';
  end if;
  if char_length(v_texto) not between 300 and 6000 then
    raise exception using errcode = '22023', message = 'texto_fuera_de_largo';
  end if;
  if char_length(v_motivo) not between 3 and 300 then
    raise exception using errcode = '22023', message = 'falta_motivo';
  end if;
  -- Two taps at once must not take the same number.
  lock table public.transparencia_versiones in share row exclusive mode;
  select coalesce(max(version), 0) + 1 into v_version from public.transparencia_versiones;
  update public.transparencia_versiones set vigente = false where vigente;
  insert into public.transparencia_versiones (version, texto, motivo, creada_por, vigente)
  values (v_version, v_texto, v_motivo, auth.uid(), true);
  return v_version;
end $$;

create function public.volver_a_transparencia(p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_texto text;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_publica';
  end if;
  select texto into v_texto from public.transparencia_versiones where version = p_version;
  if not found then
    raise exception using errcode = '22023', message = 'version_desconocida';
  end if;
  return public.publicar_transparencia(v_texto, format('Volví a la versión %s', p_version));
end $$;

-- D6: what the public page reads, with the anon key. Only the current published text and its date.
create function public.transparencia_vigente() returns table (texto text, creada_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.texto, v.creada_en from public.transparencia_versiones v where v.vigente and not v.propuesta
$$;

revoke execute on function public.publicar_transparencia(text, text) from public, anon;
grant execute on function public.publicar_transparencia(text, text) to authenticated;
revoke execute on function public.volver_a_transparencia(integer) from public, anon;
grant execute on function public.volver_a_transparencia(integer) to authenticated;
revoke execute on function public.transparencia_vigente() from public;
grant execute on function public.transparencia_vigente() to anon, authenticated, service_role;
```

- [ ] **Step 4: Apply and run, expect PASS**

Run: `pnpm db:reset && pnpm test:db tests/integration/transparencia-esquema.test.ts tests/integration/datos-personales-esquema.test.ts`

- [ ] **Step 5: Regenerate the types and check** — `pnpm db:types && pnpm type` → PASS. `git diff --stat lib/supabase/database.types.ts` shows the four tables, the two `ajustes` columns and the four functions.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261101000100_registro_de_datos.sql lib/supabase/database.types.ts tests/integration/transparencia-esquema.test.ts
git commit -m "Add the versioned AI transparency page with WAV's draft" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The deletion rules in one place

**Files:**
- Create: `lib/datos-personales/reglas.ts`
- Modify: `lib/mantenimiento/retencion.ts` (`DIAS_DE_RETENCION`, line ~16), `lib/mantenimiento/respaldo.ts` (`DIAS_DE_HISTORIA`, line ~20)
- Test: `tests/unit/reglas-de-borrado.test.ts` (new), `tests/integration/datos-personales-esquema.test.ts` (one more test)

- [ ] **Step 1: Write the failing unit test** (`tests/unit/reglas-de-borrado.test.ts`)

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  discrepanciaDeRegla,
  esReglaDeBorrado,
  REGLAS_DE_BORRADO,
  textoDeDiscrepancia,
} from "@/lib/datos-personales/reglas"

describe("REGLAS_DE_BORRADO", () => {
  it("holds what the app deletes by itself, in days", () => {
    expect(REGLAS_DE_BORRADO).toEqual({ videos_de_piezas: 30, respaldos: 30, huella_de_visitas: 1 })
    expect(esReglaDeBorrado("respaldos")).toBe(true)
    expect(esReglaDeBorrado("comentarios")).toBe(false)
  })
})

describe("discrepanciaDeRegla", () => {
  it("has nothing to say about a row the app does not delete", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: null, plazo_dias: null })).toBeNull()
  })

  it("has nothing to say when the register says what the code does", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: "respaldos", plazo_dias: 30 })).toBeNull()
  })

  it("flags a period that differs from the code, giving the code's days", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: "respaldos", plazo_dias: 90 })).toEqual({
      tipo: "otro_plazo",
      dias: 30,
    })
    expect(discrepanciaDeRegla({ regla_de_borrado: "huella_de_visitas", plazo_dias: null })).toEqual({
      tipo: "otro_plazo",
      dias: 1,
    })
  })

  it("flags a rule the code does not have", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: "comentarios", plazo_dias: 90 })).toEqual({ tipo: "sin_regla" })
  })
})

describe("textoDeDiscrepancia", () => {
  it("says it in plain words", () => {
    expect(textoDeDiscrepancia({ tipo: "otro_plazo", dias: 30 })).toBe("No coincide con lo que la app borra (30 días)")
    expect(textoDeDiscrepancia({ tipo: "otro_plazo", dias: 1 })).toBe("No coincide con lo que la app borra (1 día)")
    expect(textoDeDiscrepancia({ tipo: "sin_regla" })).toBe(
      "No coincide con lo que la app borra: la app no tiene esa regla",
    )
  })
})
```

And append to `tests/integration/datos-personales-esquema.test.ts` (add `import { REGLAS_DE_BORRADO } from "@/lib/datos-personales/reglas"`):

```ts
describe("the seeded register and the code", () => {
  it("has one row per deletion rule, with the same days the code uses", async () => {
    const { rows } = await pool.query<{ regla_de_borrado: string; plazo_dias: number }>(
      "select regla_de_borrado, plazo_dias from public.inventario_de_datos where regla_de_borrado is not null",
    )
    expect(Object.fromEntries(rows.map((fila) => [fila.regla_de_borrado, fila.plazo_dias]))).toEqual(
      REGLAS_DE_BORRADO,
    )
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/reglas-de-borrado.test.ts` and `pnpm test:db tests/integration/datos-personales-esquema.test.ts -t "seeded register"`

- [ ] **Step 3: Implement** (`lib/datos-personales/reglas.ts`)

```ts
/**
 * What the app deletes by itself, in days (spec D4: the register describes, the code deletes). Retention, backups
 * and the nightly `huella` step read their period here, and `inventario_de_datos.regla_de_borrado` names one of
 * these keys.
 */
export const REGLAS_DE_BORRADO = { videos_de_piezas: 30, respaldos: 30, huella_de_visitas: 1 } as const

export type ReglaDeBorrado = keyof typeof REGLAS_DE_BORRADO

export function esReglaDeBorrado(valor: string): valor is ReglaDeBorrado {
  return Object.hasOwn(REGLAS_DE_BORRADO, valor)
}

export type Discrepancia = { tipo: "sin_regla" } | { tipo: "otro_plazo"; dias: number }

/** Whether a row of the register says something different from what the code deletes. */
export function discrepanciaDeRegla(fila: {
  regla_de_borrado: string | null
  plazo_dias: number | null
}): Discrepancia | null {
  if (fila.regla_de_borrado === null) return null
  if (!esReglaDeBorrado(fila.regla_de_borrado)) return { tipo: "sin_regla" }
  const dias = REGLAS_DE_BORRADO[fila.regla_de_borrado]
  return fila.plazo_dias === dias ? null : { tipo: "otro_plazo", dias }
}

export function textoDeDiscrepancia(discrepancia: Discrepancia): string {
  if (discrepancia.tipo === "sin_regla") return "No coincide con lo que la app borra: la app no tiene esa regla"
  return `No coincide con lo que la app borra (${discrepancia.dias} ${discrepancia.dias === 1 ? "día" : "días"})`
}
```

In `lib/mantenimiento/retencion.ts` add `import { REGLAS_DE_BORRADO } from "@/lib/datos-personales/reglas"` and replace the constant with:

```ts
/** Design D5: files of published and discarded pieces are kept for 30 days (the number lives in REGLAS_DE_BORRADO). */
const DIAS_DE_RETENCION = REGLAS_DE_BORRADO.videos_de_piezas
```

In `lib/mantenimiento/respaldo.ts` add the same import and replace `const DIAS_DE_HISTORIA = 30` with:

```ts
const DIAS_DE_HISTORIA = REGLAS_DE_BORRADO.respaldos
```

- [ ] **Step 4: Run, expect PASS** — `pnpm test:run tests/unit/reglas-de-borrado.test.ts tests/unit/respaldo.test.ts` and `pnpm test:db tests/integration/datos-personales-esquema.test.ts tests/integration/retencion.test.ts`. Then `grep -rn "30" lib/mantenimiento/retencion.ts lib/mantenimiento/respaldo.ts`: no period number is left as a literal (only comments and `PROPORCION_MINIMA`).

- [ ] **Step 5: Commit**

```bash
git add lib/datos-personales/reglas.ts lib/mantenimiento/retencion.ts lib/mantenimiento/respaldo.ts tests/unit/reglas-de-borrado.test.ts tests/integration/datos-personales-esquema.test.ts
git commit -m "Keep the deletion periods in one place and detect a register mismatch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dates in plain words

**Files:**
- Create: `lib/datos-personales/fechas.ts`
- Test: `tests/unit/fechas-de-datos.test.ts` (new)

- [ ] **Step 1: Write the failing test** (`tests/unit/fechas-de-datos.test.ts`)

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { diaAntes, diaEnPalabras, instanteEnPalabras, unAnioDespues } from "@/lib/datos-personales/fechas"

const ZONA = "America/Santiago"

describe("diaAntes", () => {
  it("counts calendar days back, across a month", () => {
    expect(diaAntes("2026-03-01", 1)).toBe("2026-02-28")
    expect(diaAntes("2027-11-15", 30)).toBe("2027-10-16")
  })
})

describe("unAnioDespues", () => {
  it("is the same day next year, and 1 March after a 29 February", () => {
    expect(unAnioDespues("2026-11-01")).toBe("2027-11-01")
    expect(unAnioDespues("2028-02-29")).toBe("2029-03-01")
  })
})

describe("diaEnPalabras", () => {
  it("names a calendar day with its year", () => {
    expect(diaEnPalabras("2027-11-15")).toBe("15 de noviembre de 2027")
  })
})

describe("instanteEnPalabras", () => {
  it("names the day in Chile, with or without the year", () => {
    expect(instanteEnPalabras("2026-11-02T06:00:00Z", ZONA, { anio: false })).toBe("2 de noviembre")
    // 02:00 UTC is still 23:00 of the day before in Santiago.
    expect(instanteEnPalabras("2026-11-02T02:00:00Z", ZONA, { anio: true })).toBe("1 de noviembre de 2026")
  })

  it("refuses an unreadable instant", () => {
    expect(() => instanteEnPalabras("ayer", ZONA, { anio: true })).toThrow("Instante ilegible: ayer")
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/fechas-de-datos.test.ts`

- [ ] **Step 3: Implement** (`lib/datos-personales/fechas.ts`)

```ts
// Calendar days travel as `2026-11-01`. Midday UTC stands for the day, so no offset can move it to the next one.
const DIA_MS = 86_400_000

const aMediodia = (dia: string) => new Date(`${dia}T12:00:00Z`)

/** `dias` calendar days before `dia`. */
export function diaAntes(dia: string, dias: number): string {
  return new Date(aMediodia(dia).getTime() - dias * DIA_MS).toISOString().slice(0, 10)
}

/** The same calendar day a year later; Date.UTC turns a 29 February that does not exist into 1 March. */
export function unAnioDespues(dia: string): string {
  const fecha = aMediodia(dia)
  return new Date(Date.UTC(fecha.getUTCFullYear() + 1, fecha.getUTCMonth(), fecha.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

const formatos = new Map<string, Intl.DateTimeFormat>()

function formato(zona: string, anio: boolean): Intl.DateTimeFormat {
  const clave = `${zona}:${anio}`
  let creado = formatos.get(clave)
  if (!creado) {
    creado = new Intl.DateTimeFormat("es-CL", {
      timeZone: zona,
      day: "numeric",
      month: "long",
      ...(anio ? { year: "numeric" } : {}),
    })
    formatos.set(clave, creado)
  }
  return creado
}

/** "15 de noviembre de 2027" for a calendar day. */
export function diaEnPalabras(dia: string): string {
  return formato("UTC", true).format(aMediodia(dia))
}

/** "2 de noviembre" (or "2 de noviembre de 2026") for an instant, on the calendar of `zona`. */
export function instanteEnPalabras(instante: string, zona: string, opciones: { anio: boolean }): string {
  const ms = Date.parse(instante)
  if (Number.isNaN(ms)) throw new Error(`Instante ilegible: ${instante}`)
  return formato(zona, opciones.anio).format(ms)
}
```

- [ ] **Step 4: Run, expect PASS** — `pnpm test:run tests/unit/fechas-de-datos.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/datos-personales/fechas.ts tests/unit/fechas-de-datos.test.ts
git commit -m "Add plain-word dates for the data register" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The deletion log writer

**Files:**
- Create: `lib/datos-personales/borrados.ts`
- Test: `tests/integration/registro-de-borrados.test.ts` (new)

- [ ] **Step 1: Write the failing test** (`tests/integration/registro-de-borrados.test.ts`)

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { anotadorDeBorrados } from "@/lib/datos-personales/borrados"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"

const AHORA = "2026-11-02T06:00:00.000Z"

afterEach(async () => {
  await pool.query("delete from public.registro_de_borrados where borrado_en = $1", [AHORA])
})
afterAll(() => pool.end())

async function anotados() {
  const { rows } = await pool.query<{ regla: string; cantidad: number }>(
    "select regla, cantidad from public.registro_de_borrados where borrado_en = $1",
    [AHORA],
  )
  return rows
}

describe("anotadorDeBorrados", () => {
  it("writes one row with the rule, how many and when", async () => {
    await anotadorDeBorrados(clienteDeServicio(), () => AHORA)("respaldos", 3)
    expect(await anotados()).toEqual([{ regla: "respaldos", cantidad: 3 }])
  })

  it("writes nothing when nothing was deleted", async () => {
    await anotadorDeBorrados(clienteDeServicio(), () => AHORA)("respaldos", 0)
    expect(await anotados()).toEqual([])
  })

  it("says which rule it could not write down", async () => {
    // Coni's session may read the log but never write it.
    const anotar = anotadorDeBorrados(await clienteDeConi(), () => AHORA)
    await expect(anotar("huella_de_visitas", 2)).rejects.toThrow(/No pude anotar el borrado de huella_de_visitas/)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/registro-de-borrados.test.ts`

- [ ] **Step 3: Implement** (`lib/datos-personales/borrados.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type { ReglaDeBorrado } from "./reglas"

/** Writes down that a rule deleted `cantidad` things tonight. Never what they were. */
export type AnotarBorrado = (regla: ReglaDeBorrado, cantidad: number) => Promise<void>

/** The log of the nightly maintenance, with a `service_role` client. A night that deleted nothing writes nothing. */
export function anotadorDeBorrados(db: SupabaseClient<Database>, ahora: () => string): AnotarBorrado {
  return async (regla, cantidad) => {
    if (cantidad <= 0) return
    const { error } = await db.from("registro_de_borrados").insert({ regla, cantidad, borrado_en: ahora() })
    if (error) throw new Error(`No pude anotar el borrado de ${regla}: ${error.message}`, { cause: error })
  }
}
```

- [ ] **Step 4: Run, expect PASS** — `pnpm test:db tests/integration/registro-de-borrados.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/datos-personales/borrados.ts tests/integration/registro-de-borrados.test.ts
git commit -m "Add the writer of the deletion log" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Retention and backups write their deletions down

**Files:**
- Modify: `lib/mantenimiento/retencion.ts` (`DepsRetencion`, end of `aplicarRetencion`), `lib/mantenimiento/respaldo.ts` (`DepsRespaldo`, the clean-up loop and the end of `respaldarBase`), `lib/produccion/deps-reales.ts` (`depsNocturno`, line ~230)
- Test: `tests/unit/respaldo.test.ts`, `tests/integration/retencion.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/respaldo.test.ts`, import `import type { AnotarBorrado } from "@/lib/datos-personales/borrados"` and change `doble` to take the log:

```ts
function doble(volcado: () => Promise<Uint8Array>, ahora = AHORA, anotarBorrado: AnotarBorrado = async () => {}) {
  const almacen = almacenEnMemoria()
  const avisos = notificadorEnMemoria()
  return { deps: { almacen, avisos, ahora: () => ahora, volcarBase: volcado, anotarBorrado }, almacen, avisos }
}
```

Then append inside `describe("respaldarBase", ...)`:

```ts
  it("writes down how many old backups it deleted under the respaldos rule", async () => {
    const anotados: [string, number][] = []
    const { deps, almacen } = doble(async () => bytes(1000), AHORA, async (regla, cantidad) => {
      anotados.push([regla, cantidad])
    })
    await previo(almacen, "2031-02-01", 1000)
    await previo(almacen, "2031-02-11", 1000)
    await previo(almacen, "2031-03-13", 1000)

    await respaldarBase(deps)

    expect(anotados).toEqual([["respaldos", 2]])
  })

  it("writes nothing down on a night that deleted no backup", async () => {
    const anotados: [string, number][] = []
    const { deps, almacen } = doble(async () => bytes(1000), AHORA, async (regla, cantidad) => {
      anotados.push([regla, cantidad])
    })
    await previo(almacen, "2031-03-13", 1000)

    await respaldarBase(deps)

    expect(anotados).toEqual([])
  })

  it("keeps the deletion and fails the step when the log cannot be written", async () => {
    const { deps, almacen } = doble(async () => bytes(1000), AHORA, async () => {
      throw new Error("No pude anotar el borrado de respaldos: sin conexión")
    })
    await previo(almacen, "2031-02-01", 1000)

    await expect(respaldarBase(deps)).rejects.toThrow("sin conexión")

    expect(almacen.claves()).toEqual(["respaldos/2031-03-14.sql.gz"])
  })
```

In `tests/integration/retencion.test.ts`, add near the top `const sinAnotar = async () => {}` and, in every existing call, replace `{ db: clienteDeServicio(), almacen, ahora:` with `{ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora:` (a plain search and replace: every call has that exact prefix). Then append inside `describe("aplicarRetencion", ...)`:

```ts
  it("writes down how many files it deleted under the videos_de_piezas rule", async () => {
    const p = await pieza("video_por_aprobar", "descartado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)
    const anotados: [string, number][] = []

    await aplicarRetencion({
      db: clienteDeServicio(),
      almacen,
      anotarBorrado: async (regla, cantidad) => {
        anotados.push([regla, cantidad])
      },
      ahora: dentroDe(31),
    })

    expect(anotados).toEqual([["videos_de_piezas", 2]])
  })

  it("writes nothing down on a night with nothing to delete", async () => {
    const p = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)
    const anotados: [string, number][] = []

    await aplicarRetencion({
      db: clienteDeServicio(),
      almacen,
      anotarBorrado: async (regla, cantidad) => {
        anotados.push([regla, cantidad])
      },
      ahora: dentroDe(29),
    })

    expect(anotados).toEqual([])
  })

  it("keeps the deleted files and fails the step when the log cannot be written", async () => {
    const p = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    await expect(
      aplicarRetencion({
        db: clienteDeServicio(),
        almacen,
        anotarBorrado: async () => {
          throw new Error("No pude anotar el borrado de videos_de_piezas: sin conexión")
        },
        ahora: dentroDe(31),
      }),
    ).rejects.toThrow(/sin conexión/)

    expect(almacen.claves()).toEqual([p.audio])
    expect(await borradoEn(p.id)).not.toBeNull()
  })
```

- [ ] **Step 2: Run, expect the new tests to FAIL** — `pnpm test:run tests/unit/respaldo.test.ts` and `pnpm test:db tests/integration/retencion.test.ts`

- [ ] **Step 3: Implement.** In `lib/mantenimiento/retencion.ts` import `import type { AnotarBorrado } from "@/lib/datos-personales/borrados"` and add to `DepsRetencion`:

```ts
  /** The deletion log (`registro_de_borrados`). */
  anotarBorrado: AnotarBorrado
```

In `aplicarRetencion`, between the `for` loop and the final `if (errores.length > 0)`:

```ts
  if (archivos > 0) {
    try {
      await deps.anotarBorrado("videos_de_piezas", archivos)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      // The files are gone either way: the night fails so WAV hears that the log is missing a row.
      errores.push(error)
    }
  }
```

In `lib/mantenimiento/respaldo.ts` import the same type and add to `DepsRespaldo`:

```ts
  /** The deletion log (`registro_de_borrados`). */
  anotarBorrado: AnotarBorrado
```

Count the clean-up:

```ts
  // Older than the history: dated keys only, whatever else lives under the prefix stays.
  const corte = fechaEnSantiago(ahora - DIAS_DE_HISTORIA * DIA_MS)
  let borrados = 0
  for (const objeto of existentes) {
    const fecha = fechaDe(objeto.clave)
    if (fecha !== null && fecha < corte) {
      await deps.almacen.borrar(objeto.clave)
      borrados += 1
    }
  }
```

and replace the end of `respaldarBase` (from `if (anterior && ...)` to the last `return`) with:

```ts
  let resultado: ResultadoRespaldo = { estado: "guardado", clave, bytes: volcado.byteLength }
  if (anterior && volcado.byteLength < anterior.bytes * PROPORCION_MINIMA) {
    await deps.avisos.aWav(
      "El respaldo de la base pesa mucho menos que el anterior",
      `El volcado del ${hoy} pesa ${volcado.byteLength} bytes y el del ${anterior.fecha} pesaba ${anterior.bytes}: menos del 80 %.`,
    )
    resultado = { estado: "mas_chico", clave, bytes: volcado.byteLength }
  }
  // Last, so a failed log fails the step after the backup and its alerts are done; the deletion stands.
  if (borrados > 0) await deps.anotarBorrado("respaldos", borrados)
  return resultado
```

- [ ] **Step 4: Give production its log.** In `lib/produccion/deps-reales.ts` import `import { anotadorDeBorrados } from "@/lib/datos-personales/borrados"` and make `depsNocturno` build one client and one clock for everything:

```ts
export function depsNocturno(): DepsNocturno {
  const db = clienteDeServicio()
  const ahora = () => new Date().toISOString()
  return {
    db,
    almacen: almacenReal(),
    avisos: avisosReales(),
    ahora,
    anotarBorrado: anotadorDeBorrados(db, ahora),
    volcarBase: () => volcarConPgDump(exigirEnv("RESPALDO_DB_URL", process.env.RESPALDO_DB_URL)),
    temas: depsTemas,
  }
}
```

- [ ] **Step 5: Run, expect PASS** — `pnpm test:run tests/unit/respaldo.test.ts tests/unit/deps-reales.test.ts && pnpm test:db tests/integration/retencion.test.ts && pnpm type`

- [ ] **Step 6: Commit**

```bash
git add lib/mantenimiento/retencion.ts lib/mantenimiento/respaldo.ts lib/produccion/deps-reales.ts tests/unit/respaldo.test.ts tests/integration/retencion.test.ts
git commit -m "Log the deletions of retention and backups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The nightly `huella` step

**Files:**
- Create: `lib/mantenimiento/huella.ts`
- Test: `tests/integration/huella.test.ts` (new)

- [ ] **Step 1: Write the failing test** (`tests/integration/huella.test.ts`)

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { anotadorDeBorrados } from "@/lib/datos-personales/borrados"
import { diaAntes } from "@/lib/datos-personales/fechas"
import { diaLocal } from "@/lib/dominio/fechas"
import { borrarHuellaDeVisitas } from "@/lib/mantenimiento/huella"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const AHORA = new Date().toISOString()
// The local seed keeps ajustes.zona at America/Santiago, the calendar registrar_clic is called with.
const HOY = diaLocal(Date.parse(AHORA), "America/Santiago")
const HUELLA = "a".repeat(64)

afterEach(async () => {
  await pool.query("delete from public.visitas_clic")
  await pool.query("delete from public.registro_de_borrados where regla = 'huella_de_visitas' and borrado_en = $1", [
    AHORA,
  ])
})
afterAll(() => pool.end())

async function visitasDe(...dias: string[]): Promise<void> {
  for (const dia of dias) {
    await pool.query("insert into public.visitas_clic (dia, enlace, visitante) values ($1, 'agenda', $2)", [
      dia,
      HUELLA,
    ])
  }
}

async function diasQueQuedan(): Promise<string[]> {
  const { rows } = await pool.query<{ dia: string }>("select dia::text as dia from public.visitas_clic order by dia")
  return rows.map((fila) => fila.dia)
}

function anotarEn(anotados: [string, number][]) {
  return async (regla: string, cantidad: number) => {
    anotados.push([regla, cantidad])
  }
}

describe("borrarHuellaDeVisitas", () => {
  it("deletes the visits older than yesterday every night, even when nobody clicked", async () => {
    await visitasDe(diaAntes(HOY, 3), diaAntes(HOY, 2), diaAntes(HOY, 1), HOY)
    const anotados: [string, number][] = []

    const resultado = await borrarHuellaDeVisitas({
      db: clienteDeServicio(),
      ahora: () => AHORA,
      anotarBorrado: anotarEn(anotados),
    })

    expect(resultado).toEqual({ huellas: 2 })
    expect(await diasQueQuedan()).toEqual([diaAntes(HOY, 1), HOY])
    expect(anotados).toEqual([["huella_de_visitas", 2]])
  })

  it("writes its row in registro_de_borrados", async () => {
    await visitasDe(diaAntes(HOY, 5))
    const db = clienteDeServicio()

    await borrarHuellaDeVisitas({ db, ahora: () => AHORA, anotarBorrado: anotadorDeBorrados(db, () => AHORA) })

    const { rows } = await pool.query<{ cantidad: number }>(
      "select cantidad from public.registro_de_borrados where regla = 'huella_de_visitas' and borrado_en = $1",
      [AHORA],
    )
    expect(rows).toEqual([{ cantidad: 1 }])
  })

  it("keeps yesterday and today and writes nothing down when nothing is old", async () => {
    await visitasDe(diaAntes(HOY, 1), HOY)
    const anotados: [string, number][] = []

    expect(
      await borrarHuellaDeVisitas({ db: clienteDeServicio(), ahora: () => AHORA, anotarBorrado: anotarEn(anotados) }),
    ).toEqual({ huellas: 0 })

    expect(await diasQueQuedan()).toEqual([diaAntes(HOY, 1), HOY])
    expect(anotados).toEqual([])
  })

  it("keeps the deletion and fails the step when the log cannot be written", async () => {
    await visitasDe(diaAntes(HOY, 4), HOY)

    await expect(
      borrarHuellaDeVisitas({
        db: clienteDeServicio(),
        ahora: () => AHORA,
        anotarBorrado: async () => {
          throw new Error("No pude anotar el borrado de huella_de_visitas: sin conexión")
        },
      }),
    ).rejects.toThrow("sin conexión")

    expect(await diasQueQuedan()).toEqual([HOY])
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/huella.test.ts`

- [ ] **Step 3: Implement** (`lib/mantenimiento/huella.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AnotarBorrado } from "@/lib/datos-personales/borrados"
import { diaAntes } from "@/lib/datos-personales/fechas"
import { REGLAS_DE_BORRADO } from "@/lib/datos-personales/reglas"
import { leerZona } from "@/lib/datos/metricas"
import { diaLocal } from "@/lib/dominio/fechas"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsHuella {
  /** A `service_role` client: nobody else may touch `visitas_clic`. */
  db: SupabaseClient<Database>
  ahora: () => string
  anotarBorrado: AnotarBorrado
}

/**
 * Deletes the daily hashes of `/l` visitors once they are older than yesterday. `registrar_clic` does the same, but
 * only when somebody clicks, so on a quiet week they stayed (spec, gap fixed). Same calendar as the clicks: the zone
 * of `ajustes`.
 */
export async function borrarHuellaDeVisitas(deps: DepsHuella): Promise<{ huellas: number }> {
  const zona = await leerZona(deps.db)
  const hoy = diaLocal(Date.parse(deps.ahora()), zona)
  const corte = diaAntes(hoy, REGLAS_DE_BORRADO.huella_de_visitas)
  const { count, error } = await deps.db.from("visitas_clic").delete({ count: "exact" }).lt("dia", corte)
  if (error) throw new Error(`No pude borrar las huellas de visitas: ${error.message}`, { cause: error })
  const huellas = count ?? 0
  if (huellas > 0) await deps.anotarBorrado("huella_de_visitas", huellas)
  return { huellas }
}
```

- [ ] **Step 4: Run, expect PASS** — `pnpm test:db tests/integration/huella.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/huella.ts tests/integration/huella.test.ts
git commit -m "Delete old visitor hashes every night, with or without clicks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The yearly review rule and its nightly notice

**Files:**
- Create: `lib/datos-personales/revision.ts`, `lib/datos-personales/leer.ts`, `lib/mantenimiento/revision-de-inventario.ts`
- Test: `tests/unit/revision-de-inventario.test.ts` (new), `tests/integration/revision-de-inventario.test.ts` (new)

- [ ] **Step 1: Write the failing unit test** (`tests/unit/revision-de-inventario.test.ts`)

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { revisionPorAvisar, venceLaRevision } from "@/lib/datos-personales/revision"

const ZONA = "America/Santiago"

describe("venceLaRevision", () => {
  it("is due a year after the register started while she never reviewed it", () => {
    expect(venceLaRevision({ ultima: null, desde: "2026-11-15", zona: ZONA })).toBe("2027-11-15")
  })

  it("is due a year after her latest review, on her calendar", () => {
    // 02:00 UTC on 10 March is still 9 March in Santiago.
    expect(venceLaRevision({ ultima: "2027-03-10T02:00:00Z", desde: "2026-11-15", zona: ZONA })).toBe("2028-03-09")
  })

  it("moves a 29 February to 1 March", () => {
    expect(venceLaRevision({ ultima: null, desde: "2028-02-29", zona: ZONA })).toBe("2029-03-01")
  })
})

describe("revisionPorAvisar", () => {
  const VENCE = "2027-11-15"

  it("waits until 30 days before the due date", () => {
    expect(revisionPorAvisar({ vence: VENCE, avisada: null, hoy: "2027-10-15" })).toBe(false)
    expect(revisionPorAvisar({ vence: VENCE, avisada: null, hoy: "2027-10-16" })).toBe(true)
  })

  it("still tells when the due date already passed without a notice", () => {
    expect(revisionPorAvisar({ vence: VENCE, avisada: null, hoy: "2027-12-01" })).toBe(true)
  })

  it("tells once per due date", () => {
    expect(revisionPorAvisar({ vence: VENCE, avisada: VENCE, hoy: "2027-10-20" })).toBe(false)
    expect(revisionPorAvisar({ vence: VENCE, avisada: "2026-11-15", hoy: "2027-10-20" })).toBe(true)
  })
})
```

- [ ] **Step 2: Write the failing integration test** (`tests/integration/revision-de-inventario.test.ts`)

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { recordarRevisionDeInventario } from "@/lib/mantenimiento/revision-de-inventario"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { CONI, pool } from "./db"
import { clienteDeServicio } from "./servicio"

let desdeOriginal = ""

beforeAll(async () => {
  const { rows } = await pool.query<{ desde: string }>("select inventario_desde::text as desde from public.ajustes")
  desdeOriginal = rows[0]?.desde ?? ""
})
afterEach(async () => {
  await pool.query("update public.ajustes set inventario_desde = $1, revision_de_inventario_avisada = null", [
    desdeOriginal,
  ])
  await pool.query("delete from public.revisiones_de_inventario")
})
afterAll(() => pool.end())

const deps = (avisos: ReturnType<typeof notificadorEnMemoria>, ahora: string) => ({
  db: clienteDeServicio(),
  avisos,
  ahora: () => ahora,
})

describe("recordarRevisionDeInventario", () => {
  it("tells Coni and WAV 30 days before the first review is due", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    const avisos = notificadorEnMemoria()

    expect(await recordarRevisionDeInventario(deps(avisos, "2027-10-16T12:00:00.000Z"))).toBe("avisado")

    expect(avisos.avisosEnviados).toEqual([
      { tipo: "revision_de_inventario", clave: "revision_de_inventario:2027-11-15" },
    ])
    expect(avisos.aConiEnviados).toEqual([
      {
        mensaje:
          "Te toca revisar tu registro de datos personales antes del 15 de noviembre de 2027. Está en Ajustes, Datos personales: léelo y toca «Lo revisé».",
        urgente: false,
      },
    ])
    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: "Revisión anual del registro de datos personales",
        detalle:
          "Coni tiene que revisar su registro antes del 2027-11-15. Si cambió un proveedor, un país o un plazo, corrígelo antes en Ingesta, Datos personales.",
      },
    ])
  })

  it("says nothing 31 days before", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    const avisos = notificadorEnMemoria()

    expect(await recordarRevisionDeInventario(deps(avisos, "2027-10-15T12:00:00.000Z"))).toBe("al_dia")

    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("never tells twice for the same due date", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    const avisos = notificadorEnMemoria()

    await recordarRevisionDeInventario(deps(avisos, "2027-10-16T12:00:00.000Z"))
    expect(await recordarRevisionDeInventario(deps(avisos, "2027-10-17T12:00:00.000Z"))).toBe("al_dia")

    expect(avisos.aConiEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("counts the year from Coni's latest review", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    await pool.query(
      "insert into public.revisiones_de_inventario (revisado_por, revisado_en) values ($1, '2027-03-10T15:00:00Z')",
      [CONI],
    )

    expect(await recordarRevisionDeInventario(deps(notificadorEnMemoria(), "2027-10-16T12:00:00.000Z"))).toBe(
      "al_dia",
    )
    const avisos = notificadorEnMemoria()
    expect(await recordarRevisionDeInventario(deps(avisos, "2028-02-09T12:00:00.000Z"))).toBe("avisado")
    expect(avisos.avisosEnviados[0]?.clave).toBe("revision_de_inventario:2028-03-10")
  })
})
```

- [ ] **Step 3: Run both, expect FAIL** — `pnpm test:run tests/unit/revision-de-inventario.test.ts` and `pnpm test:db tests/integration/revision-de-inventario.test.ts`

- [ ] **Step 4: Implement the rule** (`lib/datos-personales/revision.ts`)

```ts
import { diaLocal } from "@/lib/dominio/fechas"
import { diaAntes, unAnioDespues } from "./fechas"

/** Spec, yearly review: Coni and WAV hear about it this many days before it is due. */
export const DIAS_DE_AVISO_DE_REVISION = 30

/** The day the next review is due: a year after her latest «Lo revisé», or after the register started. */
export function venceLaRevision(entrada: { ultima: string | null; desde: string; zona: string }): string {
  const base = entrada.ultima === null ? entrada.desde : diaLocal(Date.parse(entrada.ultima), entrada.zona)
  return unAnioDespues(base)
}

/** From 30 days before the due date, once per due date. Days are `2027-11-15`, so text order is date order. */
export function revisionPorAvisar(entrada: { vence: string; avisada: string | null; hoy: string }): boolean {
  return entrada.avisada !== entrada.vence && entrada.hoy >= diaAntes(entrada.vence, DIAS_DE_AVISO_DE_REVISION)
}
```

- [ ] **Step 5: Implement the read** (`lib/datos-personales/leer.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(que: string, error: { message: string }): Error {
  return new Error(`No pude leer ${que}: ${error.message}`, { cause: error })
}

export interface FechasDeRevision {
  /** When Coni last tapped «Lo revisé», or null. */
  ultima: string | null
  /** `ajustes.inventario_desde`: the base of the first review. */
  desde: string
  zona: string
  /** The due date already notified, or null. */
  avisada: string | null
}

/** What the yearly review is computed from. Works with Coni's session or with `service_role`. */
export async function leerFechasDeRevision(db: Db): Promise<FechasDeRevision> {
  const [revision, ajustes] = await Promise.all([
    db
      .from("revisiones_de_inventario")
      .select("revisado_en")
      .order("revisado_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("ajustes").select("zona, inventario_desde, revision_de_inventario_avisada").single(),
  ])
  if (revision.error) throw fallo("la última revisión del registro", revision.error)
  if (ajustes.error) throw fallo("los ajustes", ajustes.error)
  return {
    ultima: revision.data?.revisado_en ?? null,
    desde: ajustes.data.inventario_desde,
    zona: ajustes.data.zona,
    avisada: ajustes.data.revision_de_inventario_avisada,
  }
}
```

- [ ] **Step 6: Implement the step** (`lib/mantenimiento/revision-de-inventario.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { diaEnPalabras } from "@/lib/datos-personales/fechas"
import { leerFechasDeRevision } from "@/lib/datos-personales/leer"
import { revisionPorAvisar, venceLaRevision } from "@/lib/datos-personales/revision"
import { diaLocal } from "@/lib/dominio/fechas"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsRevisionDeInventario {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoRevisionDeInventario = "al_dia" | "avisado"

/**
 * The yearly review of the register (spec): 30 days before it is due, one notice for Coni (it waits for the daily
 * summary) and one message for WAV, who corrects the register first. The due date is written down after both go out,
 * so a due date is told once.
 */
export async function recordarRevisionDeInventario(
  deps: DepsRevisionDeInventario,
): Promise<ResultadoRevisionDeInventario> {
  const fechas = await leerFechasDeRevision(deps.db)
  const vence = venceLaRevision(fechas)
  const hoy = diaLocal(Date.parse(deps.ahora()), fechas.zona)
  if (!revisionPorAvisar({ vence, avisada: fechas.avisada, hoy })) return "al_dia"

  await deps.avisos.aConi(
    `Te toca revisar tu registro de datos personales antes del ${diaEnPalabras(vence)}. Está en Ajustes, Datos personales: léelo y toca «Lo revisé».`,
    false,
    { tipo: "revision_de_inventario", clave: `revision_de_inventario:${vence}` },
  )
  await deps.avisos.aWav(
    "Revisión anual del registro de datos personales",
    `Coni tiene que revisar su registro antes del ${vence}. Si cambió un proveedor, un país o un plazo, corrígelo antes en Ingesta, Datos personales.`,
  )
  const { error } = await deps.db.from("ajustes").update({ revision_de_inventario_avisada: vence }).eq("id", true)
  if (error) throw new Error(`No pude anotar el aviso de la revisión del ${vence}: ${error.message}`, { cause: error })
  return "avisado"
}
```

- [ ] **Step 7: Run, expect PASS** — `pnpm test:run tests/unit/revision-de-inventario.test.ts && pnpm test:db tests/integration/revision-de-inventario.test.ts`

- [ ] **Step 8: Commit**

```bash
git add lib/datos-personales/revision.ts lib/datos-personales/leer.ts lib/mantenimiento/revision-de-inventario.ts tests/unit/revision-de-inventario.test.ts tests/integration/revision-de-inventario.test.ts
git commit -m "Notify the yearly review of the data register once per due date" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Both steps join the nightly maintenance

**Files:**
- Modify: `lib/mantenimiento/ejecutar.ts` (`DepsNocturno`, `mantenimientoNocturno`), `trigger/mantenimiento.ts` (doc comment of `CONFIGURACION_NOCTURNA`)
- Test: `tests/unit/mantenimiento-nocturno.test.ts` (new)

- [ ] **Step 1: Write the failing test** (`tests/unit/mantenimiento-nocturno.test.ts`)

```ts
// @vitest-environment node
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import { type DepsNocturno, mantenimientoNocturno } from "@/lib/mantenimiento/ejecutar"
import { borrarHuellaDeVisitas } from "@/lib/mantenimiento/huella"
import { recordarRevisionDeInventario } from "@/lib/mantenimiento/revision-de-inventario"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

vi.mock("@/lib/mantenimiento/retencion", () => ({ aplicarRetencion: vi.fn(async () => ({ piezas: 0, archivos: 0 })) }))
vi.mock("@/lib/mantenimiento/token-meta", () => ({ mantenerTokenMeta: vi.fn(async () => "sin_token") }))
vi.mock("@/lib/mantenimiento/token-linkedin", () => ({ mantenerTokenLinkedin: vi.fn(async () => "sin_conexion") }))
vi.mock("@/lib/mantenimiento/numeros-linkedin", () => ({ recordarNumerosDeLinkedin: vi.fn(async () => "al_dia") }))
vi.mock("@/lib/mantenimiento/respaldo", () => ({ respaldarBase: vi.fn(async () => ({ estado: "vacio" })) }))
vi.mock("@/lib/mantenimiento/huella", () => ({ borrarHuellaDeVisitas: vi.fn(async () => ({ huellas: 2 })) }))
vi.mock("@/lib/mantenimiento/revision-de-inventario", () => ({
  recordarRevisionDeInventario: vi.fn(async () => "al_dia"),
}))

const DEPS: DepsNocturno = {
  // Never reached: every step is mocked. A real client keeps the type honest without a cast.
  db: createClient<Database>("http://127.0.0.1:9", "clave-de-prueba"),
  almacen: almacenEnMemoria(),
  avisos: notificadorEnMemoria(),
  ahora: () => "2026-11-02T06:00:00.000Z",
  anotarBorrado: async () => {},
  volcarBase: async () => new Uint8Array(),
  temas: async () => null,
}

describe("mantenimientoNocturno", () => {
  it("deletes the visitor hashes and checks the yearly review every night, after the backup", async () => {
    const resultado = await mantenimientoNocturno(DEPS)

    expect(Object.keys(resultado)).toEqual([
      "retencion",
      "token",
      "linkedin",
      "numerosLinkedin",
      "respaldo",
      "huella",
      "revisionDeInventario",
      "fusiones",
    ])
    expect(resultado.huella).toEqual({ huellas: 2 })
    expect(resultado.revisionDeInventario).toBe("al_dia")
    expect(borrarHuellaDeVisitas).toHaveBeenCalledWith(DEPS)
    expect(recordarRevisionDeInventario).toHaveBeenCalledWith(DEPS)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/mantenimiento-nocturno.test.ts`

- [ ] **Step 3: Implement** in `lib/mantenimiento/ejecutar.ts`. Add the imports

```ts
import { borrarHuellaDeVisitas, type DepsHuella } from "./huella"
import { type DepsRevisionDeInventario, recordarRevisionDeInventario } from "./revision-de-inventario"
```

extend the nightly deps

```ts
export type DepsNocturno = DepsRetencion &
  DepsTokenMeta &
  DepsTokenLinkedin &
  DepsNumerosLinkedin &
  DepsRespaldo &
  DepsHuella &
  DepsRevisionDeInventario & { temas: ConstructorDeTemas }
```

and replace `mantenimientoNocturno` with:

```ts
/** At 03:00 America/Santiago: file retention, Instagram's token, LinkedIn's expiry, the Monday reminder of LinkedIn's numbers, the backup of the database, the visitor hashes of /l, the yearly review of the data register and the merges of topics. */
export function mantenimientoNocturno(deps: DepsNocturno) {
  return enSerie({
    retencion: () => aplicarRetencion(deps),
    token: () => mantenerTokenMeta(deps),
    linkedin: () => mantenerTokenLinkedin(deps),
    numerosLinkedin: () => recordarNumerosDeLinkedin(deps),
    respaldo: () => respaldarBase(deps),
    huella: () => borrarHuellaDeVisitas(deps),
    revisionDeInventario: () => recordarRevisionDeInventario(deps),
    fusiones: async () => {
      const propias = await deps.temas()
      return propias ? fusionarTemas(propias) : OMITIDO
    },
  })
}
```

In `trigger/mantenimiento.ts` change the doc comment of `CONFIGURACION_NOCTURNA` to: `/** 03:00 in Chile whatever the daylight saving time (design Q4): file retention, Instagram's token, the backup, the visitor hashes of /l, the yearly review of the data register and the merges of topics. */` (no code change: `depsNocturno` already carries `db`, `avisos`, `ahora` and, since Task 6, `anotarBorrado`).

- [ ] **Step 4: Run, expect PASS** — `pnpm test:run tests/unit/mantenimiento-nocturno.test.ts tests/unit/mantenimiento-ejecutar.test.ts tests/unit/mantenimiento-task.test.ts tests/unit/deps-reales.test.ts && pnpm type`

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/ejecutar.ts trigger/mantenimiento.ts tests/unit/mantenimiento-nocturno.test.ts
git commit -m "Run the visitor hash cleanup and the yearly review every night" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Coni's actions: «Lo revisé», «Publicar», «Volver a esta»

**Files:**
- Create: `lib/acciones/datos-personales.ts`
- Modify: `app/(app)/ajustes/acciones.ts`
- Test: `tests/integration/acciones-datos-personales.test.ts` (new)

- [ ] **Step 1: Write the failing test** (`tests/integration/acciones-datos-personales.test.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { marcarInventarioRevisado, publicarTransparencia, volverATransparencia } from "@/lib/acciones/datos-personales"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

type Db = SupabaseClient<Database>

let coni: Db
let mantenedor: Db
const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const OTRO = `${LARGO} Y una línea más.`

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})
afterEach(async () => {
  await pool.query("delete from public.transparencia_versiones where not propuesta")
  await pool.query("delete from public.revisiones_de_inventario")
})
afterAll(() => pool.end())

async function vigentes() {
  const { rows } = await pool.query<{ version: number; texto: string }>(
    "select version, texto from public.transparencia_versiones where vigente",
  )
  return rows
}

async function revisiones(): Promise<number> {
  return (await pool.query("select 1 from public.revisiones_de_inventario")).rowCount ?? 0
}

describe("marcarInventarioRevisado", () => {
  it("writes down Coni's review and answers when it was", async () => {
    expect(await marcarInventarioRevisado(coni)).toEqual({ ok: true, revisadoEn: expect.any(String) })
    expect(await revisiones()).toBe(1)
  })

  it("does not let WAV mark it", async () => {
    expect(await marcarInventarioRevisado(mantenedor)).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(await revisiones()).toBe(0)
  })
})

describe("publicarTransparencia", () => {
  it("publishes a new current version each time", async () => {
    expect(await publicarTransparencia(coni, { texto: LARGO, motivo: "Primera versión" })).toEqual({
      ok: true,
      version: 1,
    })
    expect(await publicarTransparencia(coni, { texto: OTRO, motivo: "Agrego una línea" })).toEqual({
      ok: true,
      version: 2,
    })
    expect(await vigentes()).toEqual([{ version: 2, texto: OTRO }])
  })

  it("says how long the text must be and publishes nothing", async () => {
    expect(await publicarTransparencia(coni, { texto: "Muy corto.", motivo: "Prueba" })).toEqual({
      ok: false,
      error: "El texto tiene que tener entre 300 y 6.000 caracteres.",
    })
    expect(await vigentes()).toEqual([])
  })

  it("asks for the reason of the change", async () => {
    expect(await publicarTransparencia(coni, { texto: LARGO, motivo: "  " })).toEqual({
      ok: false,
      error: "Escribe en pocas palabras por qué lo cambias.",
    })
  })

  it("does not let WAV publish", async () => {
    expect(await publicarTransparencia(mantenedor, { texto: LARGO, motivo: "Prueba" })).toEqual({
      ok: false,
      error: ERROR_GENERICO,
    })
    expect(await vigentes()).toEqual([])
  })
})

describe("volverATransparencia", () => {
  it("publishes the text of an earlier version as a new one", async () => {
    await publicarTransparencia(coni, { texto: LARGO, motivo: "Primera versión" })
    await publicarTransparencia(coni, { texto: OTRO, motivo: "Agrego una línea" })

    expect(await volverATransparencia(coni, 1)).toEqual({ ok: true, version: 3 })
    expect(await vigentes()).toEqual([{ version: 3, texto: LARGO }])
  })

  it("says so when the version does not exist", async () => {
    expect(await volverATransparencia(coni, 99)).toEqual({
      ok: false,
      error: "Esa versión ya no existe. Vuelve a abrir la pantalla.",
    })
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/acciones-datos-personales.test.ts`

- [ ] **Step 3: Implement** (`lib/acciones/datos-personales.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { Falla } from "@/lib/dominio/falla"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

/** The refusals of the RPCs that Coni can fix herself. Anything else is WAV's (logged, generic notice). */
const PARA_CONI = new Map([
  ["texto_fuera_de_largo", "El texto tiene que tener entre 300 y 6.000 caracteres."],
  ["falta_motivo", "Escribe en pocas palabras por qué lo cambias."],
  ["version_desconocida", "Esa versión ya no existe. Vuelve a abrir la pantalla."],
])

function falloDeRpc(que: string, error: { message: string }): Error {
  const paraConi = PARA_CONI.get(error.message)
  return paraConi ? new Falla(paraConi) : new Error(`No pude ${que}: ${error.message}`, { cause: error })
}

/** «Lo revisé» in Ajustes › Datos personales. */
export function marcarInventarioRevisado(db: Db): Promise<Resultado<{ revisadoEn: string }>> {
  return aResultado("marcarInventarioRevisado", async () => {
    const { data, error } = await db.rpc("marcar_inventario_revisado")
    if (error) throw falloDeRpc("anotar la revisión del registro", error)
    return { revisadoEn: data }
  })
}

/** «Publicar» in Ajustes › Página de IA: a new version that is the public page from now on. */
export function publicarTransparencia(
  db: Db,
  entrada: { texto: string; motivo: string },
): Promise<Resultado<{ version: number }>> {
  return aResultado("publicarTransparencia", async () => {
    const { data, error } = await db.rpc("publicar_transparencia", { p_texto: entrada.texto, p_motivo: entrada.motivo })
    if (error) throw falloDeRpc("publicar la página de IA", error)
    return { version: data }
  })
}

/** «Volver a esta»: the text of an earlier version, published again as a new one. */
export function volverATransparencia(db: Db, version: number): Promise<Resultado<{ version: number }>> {
  return aResultado("volverATransparencia", async () => {
    const { data, error } = await db.rpc("volver_a_transparencia", { p_version: version })
    if (error) throw falloDeRpc("volver a una versión de la página de IA", error)
    return { version: data }
  })
}
```

Then the Server Actions, appended to `app/(app)/ajustes/acciones.ts` (add `marcarInventarioRevisado`, `publicarTransparencia`, `volverATransparencia` to a new import from `@/lib/acciones/datos-personales`):

```ts
export async function marcarInventarioRevisadoAccion() {
  return refrescar(
    await conSesionDeConi("marcarInventarioRevisado", z.object({}), {}, (db) => marcarInventarioRevisado(db)),
  )
}

// The limits themselves are the database's (300 to 6000 after trimming); this only keeps a request reasonable.
const paginaDeIa = z.object({ texto: z.string().max(7000), motivo: z.string().max(400) })

export async function publicarTransparenciaAccion(texto: string, motivo: string) {
  return refrescar(
    await conSesionDeConi("publicarTransparencia", paginaDeIa, { texto, motivo }, (db, d) =>
      publicarTransparencia(db, d),
    ),
  )
}

export async function volverATransparenciaAccion(version: number) {
  return refrescar(
    await conSesionDeConi(
      "volverATransparencia",
      z.object({ version: z.number().int().min(0) }),
      { version },
      (db, d) => volverATransparencia(db, d.version),
    ),
  )
}
```

(`refrescar` revalidates the whole layout, which covers both Ajustes screens; `/l/ia` is `force-dynamic`.)

- [ ] **Step 4: Run, expect PASS** — `pnpm test:db tests/integration/acciones-datos-personales.test.ts && pnpm type`

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/datos-personales.ts "app/(app)/ajustes/acciones.ts" tests/integration/acciones-datos-personales.test.ts
git commit -m "Add Coni's actions to review the register and publish the AI page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Reading and wording the register

**Files:**
- Modify: `lib/datos-personales/leer.ts` (add `leerRegistroDeDatos`)
- Create: `lib/datos-personales/presentar.ts`
- Test: `tests/integration/datos-personales-datos.test.ts` (new), `tests/unit/presentar-registro.test.ts` (new)

- [ ] **Step 1: Write the failing unit test** (`tests/unit/presentar-registro.test.ts`)

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { RegistroDeDatos } from "@/lib/datos-personales/leer"
import { fraseDeBorrado, paisEnPalabras, presentarRegistro } from "@/lib/datos-personales/presentar"

const ZONA = "America/Santiago"

describe("paisEnPalabras", () => {
  it("adds «por confirmar» until WAV confirms the country", () => {
    expect(paisEnPalabras("Estados Unidos", false)).toBe("Estados Unidos (por confirmar)")
    expect(paisEnPalabras("Estados Unidos", true)).toBe("Estados Unidos")
    expect(paisEnPalabras("Por confirmar", false)).toBe("Por confirmar")
  })
})

describe("fraseDeBorrado", () => {
  it("says what was deleted and when, in her words", () => {
    expect(
      fraseDeBorrado({ id: "1", regla: "videos_de_piezas", cantidad: 3, borradoEn: "2026-11-02T06:00:00Z" }, ZONA),
    ).toBe("Se borraron 3 archivos de videos y voces el 2 de noviembre.")
    expect(fraseDeBorrado({ id: "2", regla: "respaldos", cantidad: 1, borradoEn: "2026-11-02T06:00:00Z" }, ZONA)).toBe(
      "Se borró 1 respaldo de la base el 2 de noviembre.",
    )
    expect(
      fraseDeBorrado({ id: "3", regla: "huella_de_visitas", cantidad: 5, borradoEn: "2026-11-03T06:00:00Z" }, ZONA),
    ).toBe("Se borraron 5 huellas de visitas el 3 de noviembre.")
  })

  it("still says something for a rule the code no longer has", () => {
    expect(fraseDeBorrado({ id: "4", regla: "reposts", cantidad: 2, borradoEn: "2026-11-02T06:00:00Z" }, ZONA)).toBe(
      "Se borraron 2 elementos de reposts el 2 de noviembre.",
    )
  })
})

describe("presentarRegistro", () => {
  const REGISTRO: RegistroDeDatos = {
    filas: [
      {
        clave: "respaldos",
        dato: "Respaldo nocturno de la base",
        para_que: "Recuperar la app si algo se pierde.",
        proveedor: "Cloudflare R2",
        pais: "Por confirmar",
        pais_confirmado: false,
        plazo: "Se guardan los últimos 90 días.",
        regla_de_borrado: "respaldos",
        plazo_dias: 90,
      },
    ],
    borrados: [{ id: "b1", regla: "respaldos", cantidad: 2, borradoEn: "2026-11-02T06:00:00Z" }],
    ultimaRevision: null,
    vence: "2027-11-15",
    zona: ZONA,
  }

  it("turns each row into a card, flags a mismatch with the code and words the review dates", () => {
    expect(presentarRegistro(REGISTRO)).toEqual({
      tarjetas: [
        {
          clave: "respaldos",
          dato: "Respaldo nocturno de la base",
          paraQue: "Recuperar la app si algo se pierde.",
          donde: "Cloudflare R2, Por confirmar",
          plazo: "Se guardan los últimos 90 días.",
          discrepancia: "No coincide con lo que la app borra (30 días)",
        },
      ],
      borrados: [{ id: "b1", frase: "Se borraron 2 respaldos de la base el 2 de noviembre." }],
      revision: { ultima: null, vence: "15 de noviembre de 2027" },
    })
  })

  it("words her latest review with its year", () => {
    expect(presentarRegistro({ ...REGISTRO, ultimaRevision: "2026-11-02T15:00:00Z" }).revision.ultima).toBe(
      "2 de noviembre de 2026",
    )
  })
})
```

- [ ] **Step 2: Write the failing integration test** (`tests/integration/datos-personales-datos.test.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { unAnioDespues } from "@/lib/datos-personales/fechas"
import { leerRegistroDeDatos } from "@/lib/datos-personales/leer"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

let coni: SupabaseClient<Database>

beforeAll(async () => {
  coni = await clienteDeConi()
})
afterEach(async () => {
  await pool.query("delete from public.registro_de_borrados where borrado_en >= '2031-01-01'")
  await pool.query("delete from public.revisiones_de_inventario")
})
afterAll(() => pool.end())

describe("leerRegistroDeDatos", () => {
  it("reads the rows in order, the latest deletions first and when the first review is due", async () => {
    await pool.query(
      "insert into public.registro_de_borrados (regla, cantidad, borrado_en) values ('respaldos', 1, '2031-01-02T06:00:00Z'), ('huella_de_visitas', 4, '2031-01-03T06:00:00Z')",
    )

    const registro = await leerRegistroDeDatos(coni)

    expect(registro.filas[0]).toMatchObject({ clave: "rostro_de_coni", dato: "Tu rostro (biometría)" })
    expect(registro.filas.find((fila) => fila.clave === "respaldos")).toMatchObject({
      regla_de_borrado: "respaldos",
      plazo_dias: 30,
    })
    expect(registro.borrados.slice(0, 2)).toEqual([
      { id: expect.any(String), regla: "huella_de_visitas", cantidad: 4, borradoEn: expect.stringMatching(/^2031-01-03T06:00:00/) },
      { id: expect.any(String), regla: "respaldos", cantidad: 1, borradoEn: expect.stringMatching(/^2031-01-02T06:00:00/) },
    ])
    expect(registro.ultimaRevision).toBeNull()
    const { rows } = await pool.query<{ desde: string }>("select inventario_desde::text as desde from public.ajustes")
    expect(registro.vence).toBe(unAnioDespues(rows[0]?.desde ?? ""))
    expect(registro.zona).toBe("America/Santiago")
  })

  it("counts the next review from her latest one", async () => {
    await pool.query(
      "insert into public.revisiones_de_inventario (revisado_por, revisado_en) values ($1, '2031-01-05T15:00:00Z')",
      [CONI],
    )

    const registro = await leerRegistroDeDatos(coni)

    expect(registro.ultimaRevision).toMatch(/^2031-01-05T15:00:00/)
    expect(registro.vence).toBe("2032-01-05")
  })
})
```

- [ ] **Step 3: Run both, expect FAIL** — `pnpm test:run tests/unit/presentar-registro.test.ts` and `pnpm test:db tests/integration/datos-personales-datos.test.ts`

- [ ] **Step 4: Implement the read.** Append to `lib/datos-personales/leer.ts` (add `import { venceLaRevision } from "./revision"` at the top):

```ts
export type FilaDelInventario = Pick<
  Database["public"]["Tables"]["inventario_de_datos"]["Row"],
  "clave" | "dato" | "para_que" | "proveedor" | "pais" | "pais_confirmado" | "plazo" | "regla_de_borrado" | "plazo_dias"
>

export interface BorradoAnotado {
  id: string
  regla: string
  cantidad: number
  borradoEn: string
}

export interface RegistroDeDatos {
  filas: FilaDelInventario[]
  /** The latest rows of `registro_de_borrados`, newest first. */
  borrados: BorradoAnotado[]
  ultimaRevision: string | null
  /** The day the next review is due (`2027-11-15`). */
  vence: string
  zona: string
}

const BORRADOS_A_MOSTRAR = 10

/** What Ajustes › Datos personales shows, read with Coni's session. */
export async function leerRegistroDeDatos(db: Db): Promise<RegistroDeDatos> {
  const [inventario, borrados, fechas] = await Promise.all([
    db
      .from("inventario_de_datos")
      .select("clave, dato, para_que, proveedor, pais, pais_confirmado, plazo, regla_de_borrado, plazo_dias")
      .order("orden"),
    db
      .from("registro_de_borrados")
      .select("id, regla, cantidad, borrado_en")
      .order("borrado_en", { ascending: false })
      .limit(BORRADOS_A_MOSTRAR),
    leerFechasDeRevision(db),
  ])
  if (inventario.error) throw fallo("el registro de datos personales", inventario.error)
  if (borrados.error) throw fallo("los borrados", borrados.error)
  return {
    filas: inventario.data,
    borrados: borrados.data.map((fila) => ({
      id: fila.id,
      regla: fila.regla,
      cantidad: fila.cantidad,
      borradoEn: fila.borrado_en,
    })),
    ultimaRevision: fechas.ultima,
    vence: venceLaRevision(fechas),
    zona: fechas.zona,
  }
}
```

- [ ] **Step 5: Implement the wording** (`lib/datos-personales/presentar.ts`)

```ts
import { diaEnPalabras, instanteEnPalabras } from "./fechas"
import type { BorradoAnotado, RegistroDeDatos } from "./leer"
import { discrepanciaDeRegla, esReglaDeBorrado, type ReglaDeBorrado, textoDeDiscrepancia } from "./reglas"

export interface TarjetaDeDato {
  clave: string
  dato: string
  paraQue: string
  /** Provider and country: «HeyGen, Estados Unidos (por confirmar)». */
  donde: string
  plazo: string
  /** «No coincide con lo que la app borra (30 días)», or null. */
  discrepancia: string | null
}

export interface VistaDelRegistro {
  tarjetas: TarjetaDeDato[]
  borrados: { id: string; frase: string }[]
  revision: { ultima: string | null; vence: string }
}

const POR_CONFIRMAR = /^por confirmar$/i

export function paisEnPalabras(pais: string, confirmado: boolean): string {
  const limpio = pais.trim()
  return confirmado || POR_CONFIRMAR.test(limpio) ? limpio : `${limpio} (por confirmar)`
}

const NOMBRES: Record<ReglaDeBorrado, readonly [uno: string, varios: string]> = {
  videos_de_piezas: ["archivo de video o voz", "archivos de videos y voces"],
  respaldos: ["respaldo de la base", "respaldos de la base"],
  huella_de_visitas: ["huella de visitas", "huellas de visitas"],
}

/** «Se borraron 3 archivos de videos y voces el 2 de noviembre.» */
export function fraseDeBorrado(borrado: BorradoAnotado, zona: string): string {
  const [uno, varios] = esReglaDeBorrado(borrado.regla)
    ? NOMBRES[borrado.regla]
    : ([`elemento de ${borrado.regla}`, `elementos de ${borrado.regla}`] as const)
  const cuando = instanteEnPalabras(borrado.borradoEn, zona, { anio: false })
  return borrado.cantidad === 1
    ? `Se borró 1 ${uno} el ${cuando}.`
    : `Se borraron ${borrado.cantidad} ${varios} el ${cuando}.`
}

/** The screen's words for the register, computed on the server so the client renders what the server rendered. */
export function presentarRegistro(registro: RegistroDeDatos): VistaDelRegistro {
  return {
    tarjetas: registro.filas.map((fila) => {
      const discrepancia = discrepanciaDeRegla(fila)
      return {
        clave: fila.clave,
        dato: fila.dato,
        paraQue: fila.para_que,
        donde: `${fila.proveedor}, ${paisEnPalabras(fila.pais, fila.pais_confirmado)}`,
        plazo: fila.plazo,
        discrepancia: discrepancia ? textoDeDiscrepancia(discrepancia) : null,
      }
    }),
    borrados: registro.borrados.map((borrado) => ({ id: borrado.id, frase: fraseDeBorrado(borrado, registro.zona) })),
    revision: {
      ultima: registro.ultimaRevision ? instanteEnPalabras(registro.ultimaRevision, registro.zona, { anio: true }) : null,
      vence: diaEnPalabras(registro.vence),
    },
  }
}
```

- [ ] **Step 6: Run, expect PASS** — `pnpm test:run tests/unit/presentar-registro.test.ts && pnpm test:db tests/integration/datos-personales-datos.test.ts && pnpm type`

- [ ] **Step 7: Commit**

```bash
git add lib/datos-personales/leer.ts lib/datos-personales/presentar.ts tests/unit/presentar-registro.test.ts tests/integration/datos-personales-datos.test.ts
git commit -m "Read the data register and word it for Coni" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Ajustes › Datos personales

**Files:**
- Create: `app/(app)/ajustes/tus-datos.tsx`, `app/(app)/ajustes/datos-personales/registro-de-datos.tsx`, `app/(app)/ajustes/datos-personales/page.tsx`
- Modify: `app/(app)/ajustes/page.tsx` (one block before `CerrarSesion`)
- Test: `tests/unit/tus-datos.test.tsx` (new), `tests/unit/registro-de-datos.test.tsx` (new)

- [ ] **Step 1: Write the failing tests.** `tests/unit/tus-datos.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TusDatos } from "@/app/(app)/ajustes/tus-datos"

describe("TusDatos", () => {
  it("opens the data register and the AI page from Ajustes", () => {
    render(<TusDatos />)

    expect(screen.getByRole("heading", { name: "Tus datos y la IA" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Datos personales" })).toHaveAttribute("href", "/ajustes/datos-personales")
    expect(screen.getByRole("link", { name: "Página de IA" })).toHaveAttribute("href", "/ajustes/pagina-de-ia")
  })
})
```

`tests/unit/registro-de-datos.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RegistroDeDatos } from "@/app/(app)/ajustes/datos-personales/registro-de-datos"
import type { Resultado } from "@/lib/acciones/resultado"
import type { VistaDelRegistro } from "@/lib/datos-personales/presentar"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const VISTA: VistaDelRegistro = {
  tarjetas: [
    {
      clave: "rostro_de_coni",
      dato: "Tu rostro (biometría)",
      paraQue: "Crear y animar tu avatar digital en los reels.",
      donde: "HeyGen, Estados Unidos (por confirmar)",
      plazo: "Mientras uses el avatar. Se borra si se lo pides a HeyGen.",
      discrepancia: null,
    },
    {
      clave: "respaldos",
      dato: "Respaldo nocturno de la base",
      paraQue: "Recuperar la app si algo se pierde.",
      donde: "Cloudflare R2, Por confirmar",
      plazo: "Se guardan los últimos 90 días.",
      discrepancia: "No coincide con lo que la app borra (30 días)",
    },
  ],
  borrados: [{ id: "b1", frase: "Se borraron 3 archivos de videos y voces el 2 de noviembre." }],
  revision: { ultima: null, vence: "15 de noviembre de 2027" },
}

type Marcar = () => Promise<Resultado<{ revisadoEn: string }>>

function mostrar(
  vista: VistaDelRegistro = VISTA,
  marcar: Marcar = async () => ({ ok: true, revisadoEn: "2026-11-02T12:00:00Z" }),
) {
  const accion = vi.fn<Marcar>(marcar)
  render(<RegistroDeDatos {...vista} marcar={accion} />)
  return accion
}

function tarjetaDe(dato: string): HTMLElement {
  const tarjeta = screen.getAllByRole("listitem").find((item) => item.textContent?.includes(dato))
  if (!tarjeta) throw new Error(`No hay tarjeta de ${dato}`)
  return tarjeta
}

describe("RegistroDeDatos", () => {
  it("shows one card per kind of data with what for, where and when it is deleted", () => {
    mostrar()

    const rostro = tarjetaDe("Tu rostro (biometría)")
    expect(within(rostro).getByRole("heading", { name: "Tu rostro (biometría)" })).toBeInTheDocument()
    expect(within(rostro).getByText("Crear y animar tu avatar digital en los reels.")).toBeInTheDocument()
    expect(within(rostro).getByText("HeyGen, Estados Unidos (por confirmar)")).toBeInTheDocument()
    expect(within(rostro).getByText("Mientras uses el avatar. Se borra si se lo pides a HeyGen.")).toBeInTheDocument()
    expect(within(rostro).queryByText(/No coincide/)).toBeNull()
    const respaldos = tarjetaDe("Respaldo nocturno de la base")
    expect(within(respaldos).getByText("No coincide con lo que la app borra (30 días)")).toBeInTheDocument()
  })

  it("lists the latest deletions in words", () => {
    mostrar()
    expect(screen.getByText("Se borraron 3 archivos de videos y voces el 2 de noviembre.")).toBeInTheDocument()
  })

  it("says when nothing was deleted yet", () => {
    mostrar({ ...VISTA, borrados: [] })
    expect(screen.getByText("Todavía no hay borrados anotados.")).toBeInTheDocument()
  })

  it("says when the review is due and marks it reviewed", async () => {
    const marcar = mostrar()
    expect(
      screen.getByText("Todavía no la revisas. Tu próxima revisión vence el 15 de noviembre de 2027."),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Lo revisé" }))

    expect(await screen.findByText("Quedó anotado. Gracias.")).toBeInTheDocument()
    expect(marcar).toHaveBeenCalledOnce()
  })

  it("names her latest review", () => {
    mostrar({ ...VISTA, revision: { ultima: "2 de noviembre de 2026", vence: "2 de noviembre de 2027" } })
    expect(
      screen.getByText(
        "La revisaste por última vez el 2 de noviembre de 2026. Tu próxima revisión vence el 2 de noviembre de 2027.",
      ),
    ).toBeInTheDocument()
  })

  it("says why when the review could not be written down", async () => {
    mostrar(VISTA, async () => ({
      ok: false,
      error: "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos.",
    }))

    fireEvent.click(screen.getByRole("button", { name: "Lo revisé" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado.")
    expect(screen.queryByText("Quedó anotado. Gracias.")).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/tus-datos.test.tsx tests/unit/registro-de-datos.test.tsx`

- [ ] **Step 3: Implement the rows** (`app/(app)/ajustes/tus-datos.tsx`)

```tsx
import { Seccion } from "@/components/seccion"
import { FilaNavegacion } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"

/** Ley 21.719 (spec 2026-11-01): what the app keeps about her, and what she says in public about AI. */
export function TusDatos() {
  return (
    <Seccion titulo="Tus datos y la IA" id="ajuste-tus-datos">
      <Grupo>
        <FilaNavegacion href="/ajustes/datos-personales">Datos personales</FilaNavegacion>
        <FilaNavegacion href="/ajustes/pagina-de-ia">Página de IA</FilaNavegacion>
      </Grupo>
    </Seccion>
  )
}
```

In `app/(app)/ajustes/page.tsx` import `import { TusDatos } from "./tus-datos"` and insert before the `<div className="mt-6">` that holds `<CerrarSesion ... />`:

```tsx
      <div className="mt-10">
        <TusDatos />
      </div>
```

- [ ] **Step 4: Implement the screen** (`app/(app)/ajustes/datos-personales/registro-de-datos.tsx`)

```tsx
"use client"

import { useState } from "react"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"
import type { VistaDelRegistro } from "@/lib/datos-personales/presentar"

interface PropiedadesDelRegistro extends VistaDelRegistro {
  marcar: () => Promise<Resultado<{ revisadoEn: string }>>
}

/** D2: she reads the register and confirms once a year; WAV corrects it from Ingesta. */
export function RegistroDeDatos({ tarjetas, borrados, revision, marcar }: PropiedadesDelRegistro) {
  const { pendiente, error, ejecutar } = useAccion()
  const [revisado, setRevisado] = useState(false)
  const ultima = revision.ultima ? `La revisaste por última vez el ${revision.ultima}.` : "Todavía no la revisas."

  return (
    <div>
      <Seccion titulo="Lo que la app guarda" id="datos-lista" cifra={tarjetas.length}>
        <ul className="grid gap-3">
          {tarjetas.map((tarjeta) => (
            <li key={tarjeta.clave}>
              <Panel>
                <h3 className="text-cuerpo font-semibold text-balance">{tarjeta.dato}</h3>
                <dl className="mt-3 grid gap-2 text-meta">
                  <Linea titulo="Para qué">{tarjeta.paraQue}</Linea>
                  <Linea titulo="Dónde queda">{tarjeta.donde}</Linea>
                  <Linea titulo="Cuándo se borra">{tarjeta.plazo}</Linea>
                </dl>
                {tarjeta.discrepancia ? (
                  <LineaDeEstado className="mt-3" tipo="aviso" titulo={tarjeta.discrepancia} />
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Lo que la app borró sola" id="datos-borrados">
        {borrados.length === 0 ? (
          <p className="text-meta text-apagado">Todavía no hay borrados anotados.</p>
        ) : (
          <ul className="grid gap-1.5 text-meta">
            {borrados.map((borrado) => (
              <li key={borrado.id}>{borrado.frase}</li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Revisión anual" id="datos-revision">
        <p className="text-cuerpo">{`${ultima} Tu próxima revisión vence el ${revision.vence}.`}</p>
        {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
        {revisado ? <LineaDeEstado tipo="exito" titulo="Quedó anotado. Gracias." /> : null}
        <Boton variante="secundario" cargando={pendiente} onClick={() => ejecutar(marcar, () => setRevisado(true))}>
          Lo revisé
        </Boton>
      </Seccion>
    </div>
  )
}

function Linea({ titulo, children }: { titulo: string; children: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-semibold text-tinta">{titulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}
```

The deletions are `<li>` too: `tarjetaDe` in the test finds a card by its own text, which no deletion sentence contains.

The page (`app/(app)/ajustes/datos-personales/page.tsx`):

```tsx
import { Volver } from "@/components/ui/volver"
import { leerRegistroDeDatos } from "@/lib/datos-personales/leer"
import { presentarRegistro } from "@/lib/datos-personales/presentar"
import { exigirConi } from "@/lib/sesion/coni"
import { marcarInventarioRevisadoAccion } from "../acciones"
import { RegistroDeDatos } from "./registro-de-datos"

/** Ajustes › Datos personales (spec 2026-11-01): read-only for Coni, plus «Lo revisé» once a year. */
export default async function DatosPersonales() {
  const { db } = await exigirConi()
  const vista = presentarRegistro(await leerRegistroDeDatos(db))

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Datos personales</h1>
      <p className="mt-1.5 text-meta text-apagado">
        Lo que Conidolly guarda, para qué, dónde queda y cuándo se borra. WAV lo mantiene al día; tú lo revisas una vez
        al año.
      </p>
      <div className="mt-6">
        <RegistroDeDatos {...vista} marcar={marcarInventarioRevisadoAccion} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run, expect PASS** — `pnpm test:run tests/unit/tus-datos.test.tsx tests/unit/registro-de-datos.test.tsx && pnpm type`. Then start the dev server once inside tmux (`tmux new-session -d -s dev "pnpm dev"`: a local hook refuses a dev server outside tmux), open `/ajustes` and `/ajustes/datos-personales` as Coni: both render, and `tmux capture-pane -pt dev` shows no server/client boundary error. Stop it with `tmux kill-session -t dev`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/ajustes/tus-datos.tsx" "app/(app)/ajustes/page.tsx" "app/(app)/ajustes/datos-personales" tests/unit/tus-datos.test.tsx tests/unit/registro-de-datos.test.tsx
git commit -m "Show Coni her personal data register in Ajustes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Plain-text paragraphs and the versions of the page

**Files:**
- Create: `lib/transparencia/texto.ts`, `components/texto-en-parrafos.tsx`, `lib/transparencia/versiones.ts`
- Test: `tests/unit/texto-de-transparencia.test.ts` (new), `tests/unit/texto-en-parrafos.test.tsx` (new), `tests/integration/transparencia-datos.test.ts` (new)

- [ ] **Step 1: Write the failing unit tests.** `tests/unit/texto-de-transparencia.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  LARGO_MAXIMO_TRANSPARENCIA,
  LARGO_MINIMO_TRANSPARENCIA,
  LINEA_PARA_LA_BIO,
  largoDeTexto,
  normalizarTexto,
  parrafos,
  TITULO_DE_TRANSPARENCIA,
} from "@/lib/transparencia/texto"

describe("texto de la página de IA", () => {
  it("has the limits of the database and the title of the page", () => {
    expect([LARGO_MINIMO_TRANSPARENCIA, LARGO_MAXIMO_TRANSPARENCIA]).toEqual([300, 6000])
    expect(TITULO_DE_TRANSPARENCIA).toBe("Cómo uso IA en mi contenido")
  })

  it("offers a line for her bios with the public address", () => {
    expect(LINEA_PARA_LA_BIO).toBe("Cómo uso IA en mi contenido: conidolly.vercel.app/l/ia")
  })

  it("normalises like publicar_transparencia: Windows line ends and the edges", () => {
    expect(normalizarTexto("\r\nUno\r\nDos \n")).toBe("Uno\nDos")
  })

  it("counts characters as the database does, an emoji as one", () => {
    expect(largoDeTexto("\r\n  Hola  \r\n")).toBe(4)
    expect(largoDeTexto("🙂")).toBe(1)
  })

  it("splits paragraphs on blank lines and keeps single line breaks inside one", () => {
    expect(parrafos("Uno.\r\n\r\nDos,\nsigue.\n\n\n\nTres.  ")).toEqual(["Uno.", "Dos,\nsigue.", "Tres."])
    expect(parrafos("   ")).toEqual([])
  })
})
```

`tests/unit/texto-en-parrafos.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TextoEnParrafos } from "@/components/texto-en-parrafos"

describe("TextoEnParrafos", () => {
  it("draws one paragraph per block and keeps single line breaks", () => {
    const { container } = render(<TextoEnParrafos texto={"Uno.\n\nDos,\nsigue."} />)

    const parrafos = [...container.querySelectorAll("p")]
    expect(parrafos.map((parrafo) => parrafo.textContent)).toEqual(["Uno.", "Dos,\nsigue."])
    expect(parrafos[1]).toHaveClass("whitespace-pre-line")
  })

  it("shows markup as text, never as HTML or markdown", () => {
    const { container } = render(
      <TextoEnParrafos texto={'<script>alert("x")</script>\n\n**negrita** <b>no</b> [enlace](https://x.test)'} />,
    )

    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("b")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    expect(screen.getByText('<script>alert("x")</script>')).toBeInTheDocument()
    expect(screen.getByText("**negrita** <b>no</b> [enlace](https://x.test)")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write the failing integration test** (`tests/integration/transparencia-datos.test.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Database } from "@/lib/supabase/database.types"
import { leerVersionesDeTransparencia } from "@/lib/transparencia/versiones"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

let coni: SupabaseClient<Database>
const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const OTRO = `${LARGO} Y una línea más.`

const quitarPublicadas = () => pool.query("delete from public.transparencia_versiones where not propuesta")

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(quitarPublicadas)
afterEach(quitarPublicadas)
afterAll(() => pool.end())

async function publicar(texto: string, motivo: string): Promise<void> {
  const { error } = await coni.rpc("publicar_transparencia", { p_texto: texto, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

describe("leerVersionesDeTransparencia", () => {
  it("has only WAV's draft before the first publication", async () => {
    const versiones = await leerVersionesDeTransparencia(coni)

    expect(versiones.vigente).toBeNull()
    expect(versiones.propuesta).toMatchObject({ version: 0, propuesta: true, vigente: false })
    expect(versiones.propuesta?.texto).toMatch(/^Uso inteligencia artificial para hacer mi contenido/)
    expect(versiones.historial).toEqual([])
  })

  it("lists Coni's versions newest first and knows the current one", async () => {
    await publicar(LARGO, "Primera versión")
    await publicar(OTRO, "Agrego una línea")

    const versiones = await leerVersionesDeTransparencia(coni)

    expect(versiones.historial.map((version) => [version.version, version.vigente])).toEqual([
      [2, true],
      [1, false],
    ])
    expect(versiones.vigente).toMatchObject({
      version: 2,
      texto: OTRO,
      motivo: "Agrego una línea",
      creadaEn: expect.any(String),
    })
  })
})
```

- [ ] **Step 3: Run, expect FAIL** — `pnpm test:run tests/unit/texto-de-transparencia.test.ts tests/unit/texto-en-parrafos.test.tsx` and `pnpm test:db tests/integration/transparencia-datos.test.ts`

- [ ] **Step 4: Implement the text rules** (`lib/transparencia/texto.ts`)

```ts
import { URL_DE_LA_APP } from "@/lib/diseno/marca"

export const TITULO_DE_TRANSPARENCIA = "Cómo uso IA en mi contenido"

/** The limits of `transparencia_versiones.texto`: long enough to say something, short enough to read. */
export const LARGO_MINIMO_TRANSPARENCIA = 300
export const LARGO_MAXIMO_TRANSPARENCIA = 6000

/** What she pastes in her bios (spec, rollout step 4). */
export const LINEA_PARA_LA_BIO = `${TITULO_DE_TRANSPARENCIA}: ${URL_DE_LA_APP.replace(/^https?:\/\//, "")}/l/ia`

const BORDES = /^[ \t\n]+|[ \t\n]+$/g

/** The same normalisation as `publicar_transparencia`: Windows line ends become plain ones, the edges are trimmed. */
export function normalizarTexto(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(BORDES, "")
}

/** Characters as `char_length` counts them: code points, so an emoji is one. */
export function largoDeTexto(texto: string): number {
  return [...normalizarTexto(texto)].length
}

/** Spec D5: plain text, a blank line between paragraphs. Never markdown or HTML: React prints it as text. */
export function parrafos(texto: string): string[] {
  return normalizarTexto(texto)
    .split(/\n[ \t]*\n/)
    .map((parrafo) => parrafo.replace(BORDES, ""))
    .filter((parrafo) => parrafo !== "")
}
```

- [ ] **Step 5: Implement the paragraphs** (`components/texto-en-parrafos.tsx`)

```tsx
import { parrafos } from "@/lib/transparencia/texto"
import { cn } from "@/lib/utils"

/** Coni's plain text as paragraphs. Every piece is a React text node, so markup is shown, never run. */
export function TextoEnParrafos({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn("grid gap-4", className)}>
      {parrafos(texto).map((parrafo, indice) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no identity of their own and never reorder
        <p key={indice} className="whitespace-pre-line">
          {parrafo}
        </p>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Implement the read** (`lib/transparencia/versiones.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

export interface VersionDeTransparencia {
  version: number
  texto: string
  motivo: string
  creadaEn: string
  propuesta: boolean
  vigente: boolean
}

export interface VersionesDeTransparencia {
  /** What /l/ia shows, or null before the first publication. */
  vigente: VersionDeTransparencia | null
  /** WAV's draft (version 0). */
  propuesta: VersionDeTransparencia | null
  /** Coni's publications, newest first. */
  historial: VersionDeTransparencia[]
}

/** Ajustes › Página de IA, with Coni's session. */
export async function leerVersionesDeTransparencia(db: SupabaseClient<Database>): Promise<VersionesDeTransparencia> {
  const { data, error } = await db
    .from("transparencia_versiones")
    .select("version, texto, motivo, creada_en, propuesta, vigente")
    .order("version", { ascending: false })
  if (error) throw new Error(`No pude leer las versiones de la página de IA: ${error.message}`, { cause: error })
  const versiones = data.map((fila) => ({
    version: fila.version,
    texto: fila.texto,
    motivo: fila.motivo,
    creadaEn: fila.creada_en,
    propuesta: fila.propuesta,
    vigente: fila.vigente,
  }))
  return {
    vigente: versiones.find((version) => version.vigente) ?? null,
    propuesta: versiones.find((version) => version.propuesta) ?? null,
    historial: versiones.filter((version) => !version.propuesta),
  }
}
```

- [ ] **Step 7: Run, expect PASS** — `pnpm test:run tests/unit/texto-de-transparencia.test.ts tests/unit/texto-en-parrafos.test.tsx && pnpm test:db tests/integration/transparencia-datos.test.ts`

- [ ] **Step 8: Commit**

```bash
git add lib/transparencia/texto.ts lib/transparencia/versiones.ts components/texto-en-parrafos.tsx tests/unit/texto-de-transparencia.test.ts tests/unit/texto-en-parrafos.test.tsx tests/integration/transparencia-datos.test.ts
git commit -m "Render the AI page as plain paragraphs and read its versions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Ajustes › Página de IA

**Files:**
- Create: `app/(app)/ajustes/pagina-de-ia/editor-de-pagina-de-ia.tsx`, `app/(app)/ajustes/pagina-de-ia/page.tsx`
- Test: `tests/unit/editor-de-pagina-de-ia.test.tsx` (new)

- [ ] **Step 1: Write the failing test** (`tests/unit/editor-de-pagina-de-ia.test.tsx`)

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  EditorDePaginaDeIa,
  type VersionParaMostrar,
} from "@/app/(app)/ajustes/pagina-de-ia/editor-de-pagina-de-ia"
import type { Resultado } from "@/lib/acciones/resultado"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const copiar = vi.fn(async (_texto: string) => {})
Object.defineProperty(navigator, "clipboard", { value: { writeText: copiar }, configurable: true })

const BORRADOR = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const LINEA = "Cómo uso IA en mi contenido: conidolly.vercel.app/l/ia"
const VIGENTE: VersionParaMostrar = {
  version: 2,
  fecha: "3 de noviembre de 2026",
  motivo: "Agrego las imágenes",
  texto: `${BORRADOR} Dos.`,
  vigente: true,
}
const PRIMERA: VersionParaMostrar = {
  version: 1,
  fecha: "2 de noviembre de 2026",
  motivo: "Primera versión",
  texto: `${BORRADOR} Uno.`,
  vigente: false,
}

type Publicar = (texto: string, motivo: string) => Promise<Resultado<{ version: number }>>
type VolverA = (version: number) => Promise<Resultado<{ version: number }>>

function antesDePublicar(publicar: Publicar = async () => ({ ok: true, version: 1 })) {
  const accion = vi.fn<Publicar>(publicar)
  render(
    <EditorDePaginaDeIa
      publicada={null}
      inicial={BORRADOR}
      esPropuesta
      historial={[]}
      lineaParaLaBio={LINEA}
      publicar={accion}
      volverA={vi.fn<VolverA>()}
    />,
  )
  return accion
}

function conVersiones(volverA: VolverA = async () => ({ ok: true, version: 3 })) {
  const accion = vi.fn<VolverA>(volverA)
  render(
    <EditorDePaginaDeIa
      publicada={{ texto: VIGENTE.texto, fecha: VIGENTE.fecha }}
      inicial={VIGENTE.texto}
      esPropuesta={false}
      historial={[VIGENTE, PRIMERA]}
      lineaParaLaBio={LINEA}
      publicar={vi.fn<Publicar>()}
      volverA={accion}
    />,
  )
  return accion
}

const editor = () => screen.getByLabelText<HTMLTextAreaElement>("Texto de la página")

describe("EditorDePaginaDeIa", () => {
  it("starts from WAV's draft, says it is a proposal and that nothing is published yet", () => {
    antesDePublicar()

    expect(screen.getByText("Propuesta de WAV")).toBeInTheDocument()
    expect(screen.getByText("Todavía no la publicas")).toBeInTheDocument()
    expect(editor().value).toBe(BORRADOR)
    expect(screen.queryByRole("heading", { name: "Versiones" })).toBeNull()
  })

  it("publishes the text with its reason and says which version it is", async () => {
    const publicar = antesDePublicar()

    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Primera versión" } })
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }))

    expect(await screen.findByText("Publicaste la versión 1.")).toBeInTheDocument()
    expect(publicar).toHaveBeenCalledWith(BORRADOR, "Primera versión")
  })

  it("keeps her text in the editor and says why when publishing fails", async () => {
    antesDePublicar(async () => ({
      ok: false,
      error: "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos.",
    }))

    fireEvent.change(editor(), { target: { value: `${BORRADOR} Cambio mío.` } })
    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Lo dejo a mi manera" } })
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado.")
    expect(editor().value).toBe(`${BORRADOR} Cambio mío.`)
  })

  it("does not publish a text under 300 characters or without a reason", () => {
    const publicar = antesDePublicar()
    const boton = screen.getByRole("button", { name: "Publicar" })

    expect(boton).toHaveAttribute("aria-disabled", "true")
    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Prueba" } })
    fireEvent.change(editor(), { target: { value: "Corto." } })
    expect(screen.getByText("6 de 6.000 caracteres · mínimo 300")).toBeInTheDocument()
    fireEvent.click(boton)

    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(publicar).not.toHaveBeenCalled()
  })

  it("lists the versions and goes back to an earlier one, loading its text", async () => {
    const volverA = conVersiones()

    expect(screen.getByText("Es la que se ve hoy.")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Volver a esta" })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Volver a esta" }))

    expect(await screen.findByText("Volviste al texto de la versión 1: ahora es la versión 3.")).toBeInTheDocument()
    expect(volverA).toHaveBeenCalledWith(1)
    await waitFor(() => expect(editor().value).toBe(PRIMERA.texto))
  })

  it("copies the line for her bios", async () => {
    antesDePublicar()

    expect(screen.getByText(LINEA)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Copiar la línea" }))

    expect(await screen.findByText("Línea copiada")).toBeInTheDocument()
    expect(copiar).toHaveBeenCalledWith(LINEA)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/editor-de-pagina-de-ia.test.tsx`

- [ ] **Step 3: Implement the editor** (`app/(app)/ajustes/pagina-de-ia/editor-de-pagina-de-ia.tsx`)

```tsx
"use client"

import { Check } from "@phosphor-icons/react"
import { useRef, useState } from "react"
import { Seccion } from "@/components/seccion"
import { TextoEnParrafos } from "@/components/texto-en-parrafos"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { useAccion } from "@/components/use-accion"
import { useAutoAlto } from "@/components/use-auto-alto"
import type { Resultado } from "@/lib/acciones/resultado"
import { LARGO_MAXIMO_TRANSPARENCIA, LARGO_MINIMO_TRANSPARENCIA, largoDeTexto } from "@/lib/transparencia/texto"

export interface VersionParaMostrar {
  version: number
  /** «2 de noviembre de 2026». */
  fecha: string
  motivo: string
  texto: string
  vigente: boolean
}

interface PropiedadesDelEditor {
  /** What /l/ia shows today, or null before the first publication. */
  publicada: { texto: string; fecha: string } | null
  /** The published text, or WAV's draft before the first publication. */
  inicial: string
  esPropuesta: boolean
  historial: readonly VersionParaMostrar[]
  lineaParaLaBio: string
  publicar: (texto: string, motivo: string) => Promise<Resultado<{ version: number }>>
  volverA: (version: number) => Promise<Resultado<{ version: number }>>
}

const MOTIVO_MINIMO = 3
const miles = (n: number) => n.toLocaleString("es-CL")

/** D3: Coni edits her public page; every publication is a version and «Volver a esta» publishes an old text again. */
export function EditorDePaginaDeIa({
  publicada,
  inicial,
  esPropuesta,
  historial,
  lineaParaLaBio,
  publicar,
  volverA,
}: PropiedadesDelEditor) {
  const [texto, setTexto] = useState(inicial)
  const [motivo, setMotivo] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)
  const [volviendoA, setVolviendoA] = useState<number | null>(null)
  const [copia, setCopia] = useState<"nada" | "copiado" | "fallo">("nada")
  const publicacion = useAccion()
  const vuelta = useAccion()
  const caja = useRef<HTMLTextAreaElement>(null)
  useAutoAlto(caja, texto)

  const largo = largoDeTexto(texto)
  const fueraDeLargo = largo < LARGO_MINIMO_TRANSPARENCIA || largo > LARGO_MAXIMO_TRANSPARENCIA
  const sinMotivo = motivo.trim().length < MOTIVO_MINIMO

  async function copiar() {
    try {
      await navigator.clipboard.writeText(lineaParaLaBio)
      setCopia("copiado")
    } catch (error) {
      // The clipboard can be refused (a permission, an in-app browser): the line is on screen to copy by hand.
      if (!(error instanceof DOMException)) throw error
      setCopia("fallo")
    }
  }

  function volver(version: VersionParaMostrar) {
    setVolviendoA(version.version)
    setAviso(null)
    vuelta.ejecutar(
      () => volverA(version.version),
      (resultado) => {
        setTexto(version.texto)
        setAviso(`Volviste al texto de la versión ${version.version}: ahora es la versión ${resultado.version}.`)
      },
    )
  }

  return (
    <div>
      <Seccion titulo="Lo que se ve hoy" id="ia-publicada">
        {publicada ? (
          <Panel>
            <TextoEnParrafos texto={publicada.texto} className="text-cuerpo leading-prosa" />
            <p className="mt-4 text-meta text-apagado">{`Publicada el ${publicada.fecha}.`}</p>
          </Panel>
        ) : (
          <Bloque tipo="neutro" titulo="Todavía no la publicas">
            La página pública aparece cuando publiques tu primera versión.
          </Bloque>
        )}
      </Seccion>

      <Seccion titulo="Editar" id="ia-editar">
        {esPropuesta ? (
          <Bloque tipo="neutro" titulo="Propuesta de WAV">
            Es un borrador para partir. Cámbialo con tus palabras y publícalo cuando te represente.
          </Bloque>
        ) : null}
        <form
          className="grid gap-3"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (fueraDeLargo || sinMotivo) return
            setAviso(null)
            publicacion.ejecutar(
              () => publicar(texto, motivo),
              (resultado) => {
                setMotivo("")
                setAviso(`Publicaste la versión ${resultado.version}.`)
              },
            )
          }}
        >
          <label className="grid gap-2">
            <span className="text-meta font-semibold">Texto de la página</span>
            <textarea
              ref={caja}
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              className="campo w-full text-cuerpo"
            />
          </label>
          <p className="mx-0.5 text-meta text-apagado tabular-nums">
            {`${miles(largo)} de ${miles(LARGO_MAXIMO_TRANSPARENCIA)} caracteres · mínimo ${LARGO_MINIMO_TRANSPARENCIA}`}
          </p>
          <div className="grid gap-2">
            <h3 className="text-meta font-semibold">Así se verá</h3>
            <Panel>
              <TextoEnParrafos texto={texto} className="text-cuerpo leading-prosa" />
            </Panel>
          </div>
          <label className="grid gap-2">
            <span className="text-meta font-semibold">¿Por qué lo cambias?</span>
            <input
              value={motivo}
              maxLength={300}
              onChange={(evento) => setMotivo(evento.target.value)}
              className="campo w-full text-cuerpo"
            />
          </label>
          {publicacion.error ? <LineaDeEstado tipo="error" titulo={publicacion.error} /> : null}
          {aviso ? <LineaDeEstado tipo="exito" titulo={aviso} /> : null}
          <Boton type="submit" cargando={publicacion.pendiente} deshabilitado={fueraDeLargo || sinMotivo}>
            Publicar
          </Boton>
        </form>
      </Seccion>

      {historial.length > 0 ? (
        <Seccion titulo="Versiones" id="ia-versiones" cifra={historial.length}>
          <ul className="grid gap-3">
            {historial.map((version) => (
              <li key={version.version}>
                <Panel>
                  <p className="text-cuerpo font-semibold">{`Versión ${version.version} · ${version.fecha}`}</p>
                  <p className="mt-1 text-meta">{version.motivo}</p>
                  {version.vigente ? (
                    <p className="mt-3 text-meta text-apagado">Es la que se ve hoy.</p>
                  ) : (
                    <Boton
                      variante="secundario"
                      tamano="chico"
                      className="mt-3 w-fit"
                      cargando={vuelta.pendiente && volviendoA === version.version}
                      onClick={() => volver(version)}
                    >
                      Volver a esta
                    </Boton>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
          {vuelta.error ? <LineaDeEstado tipo="error" titulo={vuelta.error} /> : null}
        </Seccion>
      ) : null}

      <Seccion titulo="Para tu bio" id="ia-bio">
        <Panel>
          <p className="text-cuerpo">{lineaParaLaBio}</p>
        </Panel>
        <Boton variante="callado" onClick={copiar}>
          Copiar la línea
        </Boton>
        <output className="block min-h-6 text-meta text-apagado">
          {copia === "copiado" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-tinta">
              <Check aria-hidden="true" size={ICONO.chico} />
              Línea copiada
            </span>
          ) : null}
          {copia === "fallo" ? "No pude copiarla. Mantén apretada la línea de arriba para copiarla." : null}
        </output>
      </Seccion>
    </div>
  )
}
```

- [ ] **Step 4: Implement the page** (`app/(app)/ajustes/pagina-de-ia/page.tsx`)

```tsx
import { Volver } from "@/components/ui/volver"
import { instanteEnPalabras } from "@/lib/datos-personales/fechas"
import { leerZona } from "@/lib/datos/metricas"
import { exigirConi } from "@/lib/sesion/coni"
import { LINEA_PARA_LA_BIO, TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { leerVersionesDeTransparencia, type VersionDeTransparencia } from "@/lib/transparencia/versiones"
import { publicarTransparenciaAccion, volverATransparenciaAccion } from "../acciones"
import { EditorDePaginaDeIa } from "./editor-de-pagina-de-ia"

/** Ajustes › Página de IA (spec 2026-11-01, D3): the editor of /l/ia, its versions and the line for her bios. */
export default async function AjustesPaginaDeIa() {
  const { db } = await exigirConi()
  const [versiones, zona] = await Promise.all([leerVersionesDeTransparencia(db), leerZona(db)])
  const fecha = (version: VersionDeTransparencia) => instanteEnPalabras(version.creadaEn, zona, { anio: true })

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Página de IA</h1>
      <p className="mt-1.5 text-meta text-apagado">
        «{TITULO_DE_TRANSPARENCIA}»: lo que cuentas en público sobre cómo usas IA. Cada vez que publicas queda una
        versión.
      </p>
      <div className="mt-6">
        <EditorDePaginaDeIa
          publicada={versiones.vigente ? { texto: versiones.vigente.texto, fecha: fecha(versiones.vigente) } : null}
          inicial={versiones.vigente?.texto ?? versiones.propuesta?.texto ?? ""}
          esPropuesta={versiones.vigente === null && versiones.propuesta !== null}
          historial={versiones.historial.map((version) => ({
            version: version.version,
            fecha: fecha(version),
            motivo: version.motivo,
            texto: version.texto,
            vigente: version.vigente,
          }))}
          lineaParaLaBio={LINEA_PARA_LA_BIO}
          publicar={publicarTransparenciaAccion}
          volverA={volverATransparenciaAccion}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run, expect PASS** — `pnpm test:run tests/unit/editor-de-pagina-de-ia.test.tsx && pnpm type && pnpm lint`. With the dev server in tmux (as in Task 12), open `/ajustes/pagina-de-ia` as Coni once: the draft shows under «Propuesta de WAV», no boundary error.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/ajustes/pagina-de-ia" tests/unit/editor-de-pagina-de-ia.test.tsx
git commit -m "Let Coni edit, publish and go back on her AI page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The public page `/l/ia`

**Files:**
- Create: `lib/transparencia/publica.ts`, `app/l/superficie-publica.tsx`, `app/l/ia/pagina-de-ia.tsx`, `app/l/ia/page.tsx`, `app/l/ia/error.tsx`
- Modify: `app/l/page.tsx` (footer link), `tests/integration/sesion-coni.ts` (anon client for tests)
- Test: `tests/unit/pagina-de-ia-publica.test.tsx` (new), `tests/integration/transparencia-publica.test.ts` (new)

- [ ] **Step 1: Write the failing unit test** (`tests/unit/pagina-de-ia-publica.test.tsx`)

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorDePaginaDeIa from "@/app/l/ia/error"
import PaginaDeIa from "@/app/l/ia/page"
import { leerTransparenciaVigente } from "@/lib/transparencia/publica"

vi.mock("@/lib/transparencia/publica", () => ({ clienteAnonimo: vi.fn(() => ({})), leerTransparenciaVigente: vi.fn() }))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

const leer = vi.mocked(leerTransparenciaVigente)

describe("/l/ia", () => {
  it("shows the published text as paragraphs, as text, with the day it was updated", async () => {
    leer.mockResolvedValue({ texto: "Primero.\n\nDos <b>tres</b>.", creadaEn: "2026-11-02T15:00:00Z" })

    const { container } = render(await PaginaDeIa())

    expect(screen.getByRole("heading", { level: 1, name: "Cómo uso IA en mi contenido" })).toBeInTheDocument()
    expect(screen.getByText("Coni del Rosario")).toBeInTheDocument()
    expect(screen.getByText("Dos <b>tres</b>.")).toBeInTheDocument()
    expect(container.querySelector("b")).toBeNull()
    expect(screen.getByText("Actualizado el 2 de noviembre de 2026.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver a mis enlaces" })).toHaveAttribute("href", "/l")
  })

  it("is a 404 while nothing is published", async () => {
    leer.mockResolvedValue(null)
    await expect(PaginaDeIa()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("lets a database failure reach the error page instead of a 404", async () => {
    leer.mockRejectedValue(new Error("No pude leer la página de IA: tiempo agotado"))
    await expect(PaginaDeIa()).rejects.toThrow("No pude leer la página de IA")
  })

  it("answers a failure with the page's look, one sentence and the way back", () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})

    render(<ErrorDePaginaDeIa error={new Error("caída")} reset={() => {}} />)

    expect(screen.getByRole("heading", { level: 1, name: "Cómo uso IA en mi contenido" })).toBeInTheDocument()
    expect(screen.getByText("No pude cargar esta página. Inténtalo de nuevo en unos minutos.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver a mis enlaces" })).toHaveAttribute("href", "/l")
    expect(registro).toHaveBeenCalled()
    registro.mockRestore()
  })
})
```

- [ ] **Step 2: Write the failing integration test.** Add to `tests/integration/sesion-coni.ts`:

```ts
/** A client with the anon key and no session: what a visitor of a public page has. */
export function clienteAnonimoDePrueba(): SupabaseClient<Database> {
  return createClient<Database>(credencialesDeServicio().url, claveAnonima(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

and create `tests/integration/transparencia-publica.test.ts`:

```ts
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { leerTransparenciaVigente } from "@/lib/transparencia/publica"
import { pool } from "./db"
import { clienteAnonimoDePrueba } from "./sesion-coni"

const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const quitarPublicadas = () => pool.query("delete from public.transparencia_versiones where not propuesta")

beforeEach(quitarPublicadas)
afterEach(quitarPublicadas)
afterAll(() => pool.end())

describe("leerTransparenciaVigente", () => {
  it("gives a visitor nothing before the first publication, never WAV's draft", async () => {
    expect(await leerTransparenciaVigente(clienteAnonimoDePrueba())).toBeNull()
  })

  it("gives a visitor the current text and when it was published", async () => {
    await pool.query(
      "insert into public.transparencia_versiones (version, texto, motivo, vigente, creada_en) values (1, $1, 'Prueba', true, '2026-11-02T15:00:00Z')",
      [LARGO],
    )

    expect(await leerTransparenciaVigente(clienteAnonimoDePrueba())).toEqual({
      texto: LARGO,
      creadaEn: expect.stringMatching(/^2026-11-02T15:00:00/),
    })
  })
})
```

- [ ] **Step 3: Run both, expect FAIL** — `pnpm test:run tests/unit/pagina-de-ia-publica.test.tsx` and `pnpm test:db tests/integration/transparencia-publica.test.ts`

- [ ] **Step 4: Implement the read** (`lib/transparencia/publica.ts`)

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { exigirEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

export interface TransparenciaVigente {
  texto: string
  creadaEn: string
}

/** D6: the public page reads with the anon key, which reaches transparencia_vigente() and nothing else of this. */
export function clienteAnonimo(): SupabaseClient<Database> {
  return createClient<Database>(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** The current text of /l/ia, or null while Coni has published nothing (D7). A failure throws. */
export async function leerTransparenciaVigente(db: SupabaseClient<Database>): Promise<TransparenciaVigente | null> {
  const { data, error } = await db.rpc("transparencia_vigente")
  if (error) throw new Error(`No pude leer la página de IA: ${error.message}`, { cause: error })
  const fila = data.at(0)
  return fila ? { texto: fila.texto, creadaEn: fila.creada_en } : null
}
```

- [ ] **Step 5: Implement the surface and the page.** `app/l/superficie-publica.tsx`:

```tsx
import type { ReactNode } from "react"

/** A link on the raspberry: full colour, underlined, the focus ring in the same colour (brandkit 2). */
export const CLASES_DE_ENLACE_PUBLICO =
  "w-fit font-semibold underline underline-offset-4 outline-offset-2 focus-visible:outline-sobre-firma"

/** The raspberry surface of `/l/ia` and its error page: the same column and safe areas as `/l`. */
export function SuperficiePublica({ children }: { children: ReactNode }) {
  return (
    <div data-superficie="marca" className="min-h-dvh bg-firma text-sobre-firma">
      <main className="mx-auto grid w-full max-w-[560px] content-start gap-8 px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  )
}
```

`app/l/ia/pagina-de-ia.tsx`:

```tsx
import { TextoEnParrafos } from "@/components/texto-en-parrafos"
import { NOMBRE_PUBLICO } from "@/lib/enlaces/perfil"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { CLASES_DE_ENLACE_PUBLICO, SuperficiePublica } from "../superficie-publica"

export function PaginaPublicaDeIa({ texto, actualizado }: { texto: string; actualizado: string }) {
  return (
    <SuperficiePublica>
      <header className="grid gap-3">
        <p className="text-cuerpo font-semibold">{NOMBRE_PUBLICO}</p>
        <h1 className="text-pantalla font-semibold tracking-[-0.022em] text-balance">{TITULO_DE_TRANSPARENCIA}</h1>
      </header>
      <TextoEnParrafos texto={texto} className="text-cuerpo leading-prosa" />
      <footer className="grid gap-3 text-meta">
        <p>{`Actualizado el ${actualizado}.`}</p>
        <a href="/l" className={CLASES_DE_ENLACE_PUBLICO}>
          Volver a mis enlaces
        </a>
      </footer>
    </SuperficiePublica>
  )
}
```

`app/l/ia/page.tsx`:

```tsx
import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { instanteEnPalabras } from "@/lib/datos-personales/fechas"
import { COLOR_DE_FIRMA } from "@/lib/diseno/marca"
import { NOMBRE_PUBLICO } from "@/lib/enlaces/perfil"
import { clienteAnonimo, leerTransparenciaVigente } from "@/lib/transparencia/publica"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { PaginaPublicaDeIa } from "./pagina-de-ia"

// Coni's to change: read on every request, no session, no client script.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: `${TITULO_DE_TRANSPARENCIA} · ${NOMBRE_PUBLICO}`,
  description: `Cómo usa inteligencia artificial ${NOMBRE_PUBLICO} en su contenido.`,
  robots: { index: true, follow: true },
}

export const viewport: Viewport = { themeColor: COLOR_DE_FIRMA, colorScheme: "light" }

/** Her calendar for «Actualizado el»: a public page reads no settings. */
const ZONA_PUBLICA = "America/Santiago"

export default async function PaginaDeIa() {
  // A failed read throws on purpose: error.tsx answers with an error page, never with a 404 that says "nothing here".
  const vigente = await leerTransparenciaVigente(clienteAnonimo())
  if (!vigente) notFound()
  return (
    <PaginaPublicaDeIa
      texto={vigente.texto}
      actualizado={instanteEnPalabras(vigente.creadaEn, ZONA_PUBLICA, { anio: true })}
    />
  )
}
```

`app/l/ia/error.tsx`:

```tsx
"use client"

import { useEffect } from "react"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { CLASES_DE_ENLACE_PUBLICO, SuperficiePublica } from "../superficie-publica"

// Not the app's error screen: a visitor gets the page's look, one sentence and the way back.
export default function ErrorDePaginaDeIa({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("/l/ia no pudo cargar", error)
  }, [error])

  return (
    <SuperficiePublica>
      <h1 className="text-pantalla font-semibold tracking-[-0.022em] text-balance">{TITULO_DE_TRANSPARENCIA}</h1>
      <p className="text-cuerpo">No pude cargar esta página. Inténtalo de nuevo en unos minutos.</p>
      <a href="/l" className={CLASES_DE_ENLACE_PUBLICO}>
        Volver a mis enlaces
      </a>
    </SuperficiePublica>
  )
}
```

- [ ] **Step 6: The footer link of `/l`** (`app/l/page.tsx`). Add the imports

```ts
import { clienteAnonimo, leerTransparenciaVigente } from "@/lib/transparencia/publica"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { CLASES_DE_ENLACE_PUBLICO } from "./superficie-publica"
```

add, next to `enlacesDeLaPagina`:

```ts
async function hayPaginaDeIa(): Promise<boolean> {
  try {
    return (await leerTransparenciaVigente(clienteAnonimo())) !== null
  } catch (error) {
    // Like the links: the page stays up without the footer link, and WAV finds the reason in the logs.
    console.error("/l no pudo leer la página de IA", error)
    return false
  }
}
```

replace `const enlaces = await enlacesDeLaPagina()` with `const [enlaces, conPaginaDeIa] = await Promise.all([enlacesDeLaPagina(), hayPaginaDeIa()])`, and right after `<p className="text-meta">{AVISO_PUBLICO}</p>`:

```tsx
        {conPaginaDeIa ? (
          <a href="/l/ia" className={`text-meta ${CLASES_DE_ENLACE_PUBLICO}`}>
            {TITULO_DE_TRANSPARENCIA}
          </a>
        ) : null}
```

- [ ] **Step 7: Run, expect PASS** — `pnpm test:run tests/unit/pagina-de-ia-publica.test.tsx tests/unit/proxy-matcher.test.ts && pnpm test:db tests/integration/transparencia-publica.test.ts && pnpm type`. The proxy matcher already leaves `/l/...` out (`l(?:/|$)`): no session is read for `/l/ia`.

- [ ] **Step 8: Commit**

```bash
git add lib/transparencia/publica.ts app/l tests/unit/pagina-de-ia-publica.test.tsx tests/integration/transparencia-publica.test.ts tests/integration/sesion-coni.ts
git commit -m "Publish Coni's AI page at /l/ia and link it from /l" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End to end, accessibility, docs and hand-off

**Files:**
- Create: `tests/e2e/pagina-de-ia.ts` (helper), `tests/e2e/datos-personales.spec.ts`
- Modify: `tests/e2e/accesibilidad.spec.ts` (`rutas()`), `docs/TRASPASO.md`

These e2e tests are the acceptance of Tasks 12 to 15, so they are expected to pass at once. A failure here is a bug: reproduce it first in a unit or integration test, then fix.

- [ ] **Step 1: The helper** (`tests/e2e/pagina-de-ia.ts`)

```ts
import { pool } from "../integration/db"

/** Four short paragraphs, over the 300 characters the table asks for. */
export const TEXTO_DE_PRUEBA = [
  "Uso IA para preparar mi contenido y te cuento cómo lo hago, con palabras simples y sin rodeos.",
  "Algunos videos los hace mi avatar digital y cada uno lo dice en su texto, para que lo sepas siempre.",
  "Los textos los escribo con apoyo de IA y los firmo yo, después de leerlos y corregirlos uno por uno.",
  "Nunca uso datos de mis pacientes, y cuando cito un estudio dejo la fuente para que la revises tú.",
].join("\n\n")

/** Leaves only WAV's draft, as before Coni's first publication. */
export async function quitarPaginaDeIa(): Promise<void> {
  await pool.query("delete from public.transparencia_versiones where not propuesta")
}

/** Publishes `textos` as versions 1, 2, ...; the last one is the current page. */
export async function publicarPaginaDeIa(...textos: string[]): Promise<void> {
  await quitarPaginaDeIa()
  for (const [indice, texto] of textos.entries()) {
    await pool.query(
      "insert into public.transparencia_versiones (version, texto, motivo, vigente) values ($1, $2, 'Prueba de extremo a extremo', $3)",
      [indice + 1, texto, indice === textos.length - 1],
    )
  }
}
```

- [ ] **Step 2: The flows** (`tests/e2e/datos-personales.spec.ts`)

```ts
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { URL_DE_LA_APP } from "./entorno"
import { publicarPaginaDeIa, quitarPaginaDeIa, TEXTO_DE_PRUEBA } from "./pagina-de-ia"

async function limpiar() {
  await quitarPaginaDeIa()
  await pool.query("delete from public.revisiones_de_inventario")
}

test.beforeEach(limpiar)
test.afterAll(limpiar)

test("Coni reads her data register from Ajustes and marks it reviewed", async ({ page }) => {
  await page.goto("/ajustes")
  await page.getByRole("link", { name: "Datos personales" }).click()

  await expect(page.getByRole("heading", { name: "Datos personales", level: 1 })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Tu rostro (biometría)" })).toBeVisible()
  await expect(page.getByText("HeyGen, Estados Unidos (por confirmar)")).toBeVisible()
  await expect(page.getByText(/^Todavía no la revisas\. Tu próxima revisión vence el /)).toBeVisible()

  await page.getByRole("button", { name: "Lo revisé" }).click()
  await expect(page.getByText("Quedó anotado. Gracias.")).toBeVisible()
  await page.reload()
  await expect(page.getByText(/^La revisaste por última vez el /)).toBeVisible()
})

test("Coni publishes WAV's draft and a visitor reads it on /l/ia, linked from /l", async ({ page, browser }) => {
  await page.goto("/ajustes/pagina-de-ia")
  await expect(page.getByText("Propuesta de WAV")).toBeVisible()
  await page.getByLabel("¿Por qué lo cambias?").fill("Primera versión")
  await page.getByRole("button", { name: "Publicar" }).click()
  await expect(page.getByText("Publicaste la versión 1.")).toBeVisible()

  const visitante = await browser.newContext({ baseURL: URL_DE_LA_APP, storageState: { cookies: [], origins: [] } })
  const publica = await visitante.newPage()
  await publica.emulateMedia({ colorScheme: "dark" })
  await publica.goto("/l/ia")
  await expect(publica.getByRole("heading", { name: "Cómo uso IA en mi contenido", level: 1 })).toBeVisible()
  await expect(publica.getByText(/^Algunos de mis reels los hace mi avatar digital/)).toBeVisible()
  await expect(publica.getByText(/^Actualizado el \d{1,2} de [a-z]+ de \d{4}\.$/)).toBeVisible()
  // Light theme even on a phone in dark mode, like the rest of the app.
  expect(await publica.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light")

  await publica.goto("/l")
  await expect(publica.getByRole("link", { name: "Cómo uso IA en mi contenido" })).toHaveAttribute("href", "/l/ia")
  await visitante.close()
})

test("/l/ia is a 404 and /l has no link to it before anything is published", async ({ page }) => {
  const respuesta = await page.goto("/l/ia")
  expect(respuesta?.status()).toBe(404)

  await page.goto("/l")
  await expect(page.getByRole("link", { name: "Cómo uso IA en mi contenido" })).toHaveCount(0)
})

test("going back to an earlier version publishes its text again", async ({ page }) => {
  await publicarPaginaDeIa(TEXTO_DE_PRUEBA, `${TEXTO_DE_PRUEBA}\n\nUna línea más.`)

  await page.goto("/ajustes/pagina-de-ia")
  await expect(page.getByText("Es la que se ve hoy.")).toBeVisible()
  await page.getByRole("button", { name: "Volver a esta" }).click()

  await expect(page.getByText("Volviste al texto de la versión 1: ahora es la versión 3.")).toBeVisible()
  const { rows } = await pool.query<{ version: number; texto: string }>(
    "select version, texto from public.transparencia_versiones where vigente",
  )
  expect(rows).toEqual([{ version: 3, texto: TEXTO_DE_PRUEBA }])
})
```

- [ ] **Step 3: Axe on the three new screens.** In `tests/e2e/accesibilidad.spec.ts` import `import { publicarPaginaDeIa, quitarPaginaDeIa, TEXTO_DE_PRUEBA } from "./pagina-de-ia"`, make `rutas()` publish a page first and list the three screens:

```ts
async function rutas(): Promise<string[]> {
  const { guion, video } = await sembrarEscena()
  // /l/ia is a 404 until something is published (D7).
  await publicarPaginaDeIa(TEXTO_DE_PRUEBA)
  return [
    "/",
    "/ideas",
    "/calendario",
    "/calendario?vista=agenda",
    "/calendario?vista=ritmo",
    "/metricas",
    "/ajustes",
    "/ajustes/cuentas",
    "/ajustes/datos-personales",
    "/ajustes/pagina-de-ia",
    `/guion/${guion}`,
    `/video/${video}`,
    "/l",
    "/l/ia",
  ]
}
```

and add after the `test.beforeEach` of that file:

```ts
test.afterAll(quitarPaginaDeIa)
```

The new screens fold nothing, so `abrirPliegues` needs no new branch.

- [ ] **Step 4: Run** — `pnpm test:e2e tests/e2e/datos-personales.spec.ts tests/e2e/accesibilidad.spec.ts tests/e2e/enlaces.spec.ts tests/e2e/ajustes.spec.ts` → PASS (the known flakies `linkedin.spec.ts:63` and `inicio.spec.ts:99` are pre-existing and not in this list). Axe must report nothing for `/ajustes/datos-personales`, `/ajustes/pagina-de-ia` and `/l/ia`, and the touch-target audit of the same file must pass for them.

- [ ] **Step 5: Docs.** In `docs/TRASPASO.md`, under «Lo que está hecho», after the bullet of «Fecha y hora exacta en la puerta 2», add:

```markdown
- **Registro de datos personales y página de IA** (spec `2026-11-01-conidolly-registro-de-datos-y-transparencia-design.md`, plan `2026-11-01-registro-de-datos-y-transparencia.md`, ramas `feat/registro-de-datos` y, en Ingesta, `feat/datos-personales`, pendiente de deploy, plazo legal 1-12-2026): migración `20261101000100` (inventario de 11 filas con países por confirmar, `registro_de_borrados`, revisión anual, versiones de la página con el borrador de WAV como versión 0); los plazos que la app borra viven en `REGLAS_DE_BORRADO` (`lib/datos-personales/reglas.ts`); el mantenimiento nocturno suma `huella` (borra `visitas_clic` de antes de ayer aunque nadie haga clic) y el aviso anual `revision_de_inventario` (30 días antes, una vez por fecha); Ajustes › Datos personales y Ajustes › Página de IA; `/l/ia` pública con la llave anónima (404 hasta la primera publicación, enlace en el pie de `/l`); Ingesta › Datos solo para WAV. Despliegue: `db push`, Trigger, Vercel de las dos apps.
```

- [ ] **Step 6: Full gate** — `pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build`, then `pnpm test:e2e`. Then:
  - `git diff main -- app components lib supabase | grep "^+" | grep "—"` → nothing (no em dash in new copy, SQL or comments).
  - `head -1` of `app/(app)/ajustes/datos-personales/registro-de-datos.tsx`, `app/(app)/ajustes/pagina-de-ia/editor-de-pagina-de-ia.tsx` and `app/l/ia/error.tsx` is `"use client"`.
  - `grep -rn "as any\|@ts-expect-error" lib/datos-personales lib/transparencia lib/mantenimiento/huella.ts lib/mantenimiento/revision-de-inventario.ts app/l app/\(app\)/ajustes` → nothing.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/pagina-de-ia.ts tests/e2e/datos-personales.spec.ts tests/e2e/accesibilidad.spec.ts docs/TRASPASO.md
git commit -m "Cover the data register and the AI page end to end and document them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Final review and hand-off.** A reviewer subagent reads `git diff main...feat/registro-de-datos` against the spec. Merge `--no-ff` into `main` locally only when Federico says so; no push. Then give Federico this checklist (he runs every line; the executor runs none of them):

1. `supabase migration list --linked`: the pending migrations must be exactly what is expected. TRASPASO lists production up to `20261027000150`, so `20261028000100_linkedin_documento.sql` may also be pending; confirm it is meant to go out with this one before pushing.
2. `supabase db push` (production, ref `mvfytttfxmzzjajecsch`). Check in the dashboard: 11 rows in `inventario_de_datos`, one row (version 0, `propuesta`) in `transparencia_versiones`, `ajustes.inventario_desde` = the day of the push.
3. Trigger.dev (the nightly maintenance changed: the new step `huella`, before `respaldo`, is now the only one that deletes `visitas_clic`; the daily metrics run no longer does): `pnpm install`, then `TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check`.
4. Vercel, estudio-coni, from a clean copy: `git archive main | tar -x -C <dir>`, copy `.vercel/project.json`, `vercel deploy --prod --yes`. No new variable: `/l/ia` uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, already set.
5. Vercel, conidolly-ingesta, after its PR is merged (Task 18), the same way.
6. Smoke: `https://conidolly.vercel.app/l/ia` answers 404 and `/l` has no AI link; as Coni, Ajustes › Datos personales shows 11 cards and Ajustes › Página de IA shows «Propuesta de WAV»; as WAV, Ingesta shows the «Datos» tab. The morning after, the run of `mantenimiento-nocturno` lists `huella` (before `respaldo`) and `revisionDeInventario` in its output, and `visitas_clic` holds no row older than yesterday.
7. Coni reviews the register, edits and publishes the page, and pastes the bio line. After the legal review WAV confirms countries and periods from Ingesta.

---

### Task 17: Ingesta: types and the register's data functions

Work in `/Users/fede/Projects/conidolly-ingesta`. The local Supabase of estudio-coni must be running with the migration of Tasks 1 and 2 applied (Ingesta has no migrations of its own and reads the same local database on port 54422).

**Files:**
- Modify: `lib/supabase/database.types.ts` (regenerated)
- Create: `lib/ingesta/datos-personales.ts`
- Test: `tests/integration/datos-personales.test.ts` (new)

- [ ] **Step 1: Branch** — `git -C /Users/fede/Projects/conidolly-ingesta switch -c feat/datos-personales main` (P15), then `pnpm install --frozen-lockfile`.

- [ ] **Step 2: Regenerate the types** — `pnpm db:types && pnpm type` → PASS; `git diff --stat lib/supabase/database.types.ts` shows the four new tables.

```bash
git add lib/supabase/database.types.ts
git commit -m "Regenerate the database types with the personal data register" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Write the failing test** (`tests/integration/datos-personales.test.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  agregarFila,
  confirmarPais,
  guardarFila,
  listarRegistro,
  SOLO_WAV,
} from "@/lib/ingesta/datos-personales"
import type { Database } from "@/lib/supabase/database.types"
import { clienteDeConi, clienteDeServicio, clienteDeWav } from "./sesion"

type Db = SupabaseClient<Database>
type FilaNueva = Database["public"]["Tables"]["inventario_de_datos"]["Insert"]

const servicio = clienteDeServicio()
const deps = (db: Db) => ({ db })
const CAMPOS = {
  dato: "Un dato de prueba",
  para_que: "Probar el registro",
  proveedor: "Supabase",
  pais: "Por confirmar",
  plazo: "Mientras dure la prueba",
  plazo_dias: null,
  orden: 99,
}

let coni: Db
let wav: Db

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDeWav()
})
afterEach(async () => {
  const { error } = await servicio.from("inventario_de_datos").delete().like("clave", "prueba_%")
  if (error) throw new Error(error.message)
})

/** A row made by the service role, which may also set the deletion rule that WAV cannot. */
async function sembrar(extra: Partial<FilaNueva> = {}): Promise<string> {
  const { data, error } = await servicio
    .from("inventario_de_datos")
    .insert({ clave: "prueba_sembrada", ...CAMPOS, ...extra })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

async function leer(id: string) {
  const { data, error } = await servicio.from("inventario_de_datos").select("*").eq("id", id).single()
  if (error) throw new Error(error.message)
  return data
}

describe("listarRegistro", () => {
  it("lists the register in its order, with the deletion rules", async () => {
    const filas = await listarRegistro(wav)

    expect(filas[0]).toMatchObject({ clave: "rostro_de_coni", pais_confirmado: false })
    expect(filas.find((fila) => fila.clave === "respaldos")).toMatchObject({
      regla_de_borrado: "respaldos",
      plazo_dias: 30,
    })
  })
})

describe("guardarFila", () => {
  it("lets WAV correct a row, trimming what she typed", async () => {
    const id = await sembrar()

    expect(await guardarFila(deps(wav), { id, ...CAMPOS, pais: "  Brasil ", plazo_dias: 7 })).toEqual({ ok: true })

    expect(await leer(id)).toMatchObject({ pais: "Brasil", plazo_dias: 7 })
  })

  it("refuses Coni, and the row stays as it was", async () => {
    const id = await sembrar()

    expect(await guardarFila(deps(coni), { id, ...CAMPOS, pais: "Chile" })).toEqual({ ok: false, error: SOLO_WAV })

    expect((await leer(id)).pais).toBe("Por confirmar")
  })

  it("says what is wrong with a field", async () => {
    const id = await sembrar()

    expect(await guardarFila(deps(wav), { id, ...CAMPOS, dato: "x" })).toEqual({
      ok: false,
      error: "Escribe el dato en al menos 3 letras.",
    })
  })

  it("keeps the days of a row the app deletes by itself", async () => {
    const id = await sembrar({ regla_de_borrado: "respaldos", plazo_dias: 30 })

    expect(await guardarFila(deps(wav), { id, ...CAMPOS, plazo_dias: null })).toEqual({
      ok: false,
      error: "Esta fila la borra la app sola: necesita su plazo en días.",
    })
  })

  it("says so when the row no longer exists", async () => {
    expect(await guardarFila(deps(wav), { id: "00000000-0000-4000-8000-000000000000", ...CAMPOS })).toEqual({
      ok: false,
      error: "Esa fila ya no existe. Recarga la página.",
    })
  })
})

describe("agregarFila", () => {
  it("lets WAV add a row, once per key", async () => {
    expect(await agregarFila(deps(wav), { clave: "prueba_nueva", ...CAMPOS })).toEqual({
      ok: true,
      id: expect.any(String),
    })
    expect(await agregarFila(deps(wav), { clave: "prueba_nueva", ...CAMPOS })).toEqual({
      ok: false,
      error: "Ya hay una fila con esa clave.",
    })
  })

  it("refuses a key that is not lowercase with underscores", async () => {
    expect(await agregarFila(deps(wav), { clave: "Prueba Nueva", ...CAMPOS })).toEqual({
      ok: false,
      error: "La clave va en minúsculas y con guiones bajos, de 3 a 40 letras (por ejemplo, comentarios_de_riesgo).",
    })
  })
})

describe("confirmarPais", () => {
  it("marks the country as confirmed", async () => {
    const id = await sembrar()

    expect(await confirmarPais(deps(wav), { id })).toEqual({ ok: true })

    expect((await leer(id)).pais_confirmado).toBe(true)
  })

  it("refuses Coni", async () => {
    const id = await sembrar()

    expect(await confirmarPais(deps(coni), { id })).toEqual({ ok: false, error: SOLO_WAV })
    expect((await leer(id)).pais_confirmado).toBe(false)
  })
})
```

- [ ] **Step 4: Run, expect FAIL** — `pnpm test:db tests/integration/datos-personales.test.ts`

- [ ] **Step 5: Implement** (`lib/ingesta/datos-personales.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { ERROR_GENERICO, type Resultado } from "@/lib/acciones/resultado"
import type { Database } from "@/lib/supabase/database.types"
import { ERROR_SOLICITUD } from "./modelo"
import { type DepsSubir, exigirMiembro } from "./subir"

type Db = SupabaseClient<Database>

export type FilaDelRegistro = Pick<
  Database["public"]["Tables"]["inventario_de_datos"]["Row"],
  | "id"
  | "clave"
  | "dato"
  | "para_que"
  | "proveedor"
  | "pais"
  | "pais_confirmado"
  | "plazo"
  | "regla_de_borrado"
  | "plazo_dias"
  | "orden"
>

const COLUMNAS = "id, clave, dato, para_que, proveedor, pais, pais_confirmado, plazo, regla_de_borrado, plazo_dias, orden"
export const SOLO_WAV = "Solo WAV corrige el registro de datos personales. Coni lo revisa en Conidolly."
const FILA_INEXISTENTE = "Esa fila ya no existe. Recarga la página."
const CODIGO_DUPLICADO = "23505"
const CODIGO_DE_CHEQUEO = "23514"

const texto = (minimo: number, maximo: number, corto: string, largo: string) =>
  z.string().trim().min(minimo, corto).max(maximo, largo)

// The same limits as the checks of `inventario_de_datos` in estudio-coni's migration 20261101000100.
const campos = z.object({
  dato: texto(3, 120, "Escribe el dato en al menos 3 letras.", "El dato es demasiado largo (máximo 120)."),
  para_que: texto(3, 300, "Escribe para qué se usa.", "«Para qué» es demasiado largo (máximo 300)."),
  proveedor: texto(2, 120, "Escribe el proveedor.", "El proveedor es demasiado largo (máximo 120)."),
  pais: texto(2, 80, "Escribe el país, o «Por confirmar».", "El país es demasiado largo (máximo 80)."),
  plazo: texto(3, 200, "Escribe el plazo de borrado en palabras.", "El plazo es demasiado largo (máximo 200)."),
  plazo_dias: z
    .number("Escribe los días como un número.")
    .int("Escribe los días como un número entero.")
    .min(0, "Los días no pueden ser negativos.")
    .nullable(),
  orden: z
    .number("Escribe el orden como un número.")
    .int("Escribe el orden como un número entero.")
    .min(0, "El orden va de 0 a 999.")
    .max(999, "El orden va de 0 a 999."),
})

const filaEditada = campos.extend({ id: z.uuid() })
const filaNueva = campos.extend({
  clave: z
    .string()
    .regex(
      /^[a-z][a-z_]{2,39}$/,
      "La clave va en minúsculas y con guiones bajos, de 3 a 40 letras (por ejemplo, comentarios_de_riesgo).",
    ),
})
const soloElId = z.object({ id: z.uuid() })

/** D2: only WAV corrects the register. Row level security says the same; this answers in words. */
async function exigirWav(db: Db, accion: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const miembro = await exigirMiembro(db, accion)
  if (!miembro.ok) return miembro
  return miembro.rol === "wav" ? { ok: true } : { ok: false, error: SOLO_WAV }
}

function leerEntrada<T extends z.ZodType>(
  esquema: T,
  entrada: unknown,
): { ok: true; datos: z.output<T> } | { ok: false; error: string } {
  const leida = esquema.safeParse(entrada, { error: () => ERROR_SOLICITUD })
  if (!leida.success) return { ok: false, error: leida.error.issues[0]?.message ?? ERROR_SOLICITUD }
  return { ok: true, datos: leida.data }
}

function falloDeEscritura(accion: string, error: { code: string; message: string }): { ok: false; error: string } {
  if (error.code === CODIGO_DUPLICADO) return { ok: false, error: "Ya hay una fila con esa clave." }
  if (error.code === CODIGO_DE_CHEQUEO && error.message.includes("regla_con_plazo")) {
    return { ok: false, error: "Esta fila la borra la app sola: necesita su plazo en días." }
  }
  console.error(`La acción ${accion} no pudo escribir en el registro de datos personales`, error)
  return { ok: false, error: ERROR_GENERICO }
}

/** The register in its order. Row level security shows it to Coni and WAV only. */
export async function listarRegistro(db: Db): Promise<FilaDelRegistro[]> {
  const { data, error } = await db.from("inventario_de_datos").select(COLUMNAS).order("orden")
  if (error) throw new Error(`No pude leer el registro de datos personales: ${error.message}`, { cause: error })
  return data
}

/** Corrects a row. The deletion rule is not among the fields: only a migration sets it (D4). */
export async function guardarFila(deps: Pick<DepsSubir, "db">, entrada: unknown): Promise<Resultado> {
  const wav = await exigirWav(deps.db, "guardarFila")
  if (!wav.ok) return wav
  const leida = leerEntrada(filaEditada, entrada)
  if (!leida.ok) return leida
  const { id, ...cambios } = leida.datos
  const { data, error } = await deps.db.from("inventario_de_datos").update(cambios).eq("id", id).select("id")
  if (error) return falloDeEscritura("guardarFila", error)
  return data.length === 0 ? { ok: false, error: FILA_INEXISTENTE } : { ok: true }
}

/** Adds a kind of data the app started to handle (changes 8, 13 and 27 bring theirs). */
export async function agregarFila(deps: Pick<DepsSubir, "db">, entrada: unknown): Promise<Resultado<{ id: string }>> {
  const wav = await exigirWav(deps.db, "agregarFila")
  if (!wav.ok) return wav
  const leida = leerEntrada(filaNueva, entrada)
  if (!leida.ok) return leida
  const { data, error } = await deps.db.from("inventario_de_datos").insert(leida.datos).select("id").single()
  if (error) return falloDeEscritura("agregarFila", error)
  return { ok: true, id: data.id }
}

/** After the legal review: the country of a row is the real one. */
export async function confirmarPais(deps: Pick<DepsSubir, "db">, entrada: unknown): Promise<Resultado> {
  const wav = await exigirWav(deps.db, "confirmarPais")
  if (!wav.ok) return wav
  const leida = leerEntrada(soloElId, entrada)
  if (!leida.ok) return leida
  const { data, error } = await deps.db
    .from("inventario_de_datos")
    .update({ pais_confirmado: true })
    .eq("id", leida.datos.id)
    .select("id")
  if (error) return falloDeEscritura("confirmarPais", error)
  return data.length === 0 ? { ok: false, error: FILA_INEXISTENTE } : { ok: true }
}
```

- [ ] **Step 6: Run, expect PASS** — `pnpm test:db tests/integration/datos-personales.test.ts && pnpm type`

- [ ] **Step 7: Commit**

```bash
git add lib/ingesta/datos-personales.ts tests/integration/datos-personales.test.ts
git commit -m "Let WAV read and correct the personal data register" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Ingesta › Datos personales screen, navigation and PR

**Files:**
- Modify: `components/navegacion-principal.tsx`, `app/(app)/page.tsx`, `app/(app)/autores/page.tsx`, `app/(app)/temas/page.tsx`, `app/(app)/semana/page.tsx` (pass `rol`)
- Create: `app/(app)/datos-personales/acciones.ts`, `app/(app)/datos-personales/editor-de-fila.tsx`, `app/(app)/datos-personales/page.tsx`
- Test: `tests/unit/navegacion-principal.test.tsx`, `tests/unit/editor-de-fila.test.tsx` (new)

- [ ] **Step 1: Write the failing tests.** In `tests/unit/navegacion-principal.test.tsx`, change the existing render to `render(<NavegacionPrincipal actual="autores" rol="coni" />)` and add:

```tsx
  it("shows Datos to WAV only", () => {
    const { unmount } = render(<NavegacionPrincipal actual="materiales" rol="coni" />)
    expect(screen.queryByRole("link", { name: "Datos" })).toBeNull()
    unmount()

    render(<NavegacionPrincipal actual="datos" rol="wav" />)
    expect(screen.getByRole("link", { name: "Datos" })).toHaveAttribute("href", "/datos-personales")
    expect(screen.getByRole("link", { name: "Datos" })).toHaveAttribute("aria-current", "page")
  })
```

`tests/unit/editor-de-fila.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agregarFilaAccion, confirmarPaisAccion, guardarFilaAccion } from "@/app/(app)/datos-personales/acciones"
import { EditorDeFila } from "@/app/(app)/datos-personales/editor-de-fila"
import type { FilaDelRegistro } from "@/lib/ingesta/datos-personales"

const refrescar = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refrescar, push: vi.fn() }) }))
vi.mock("@/app/(app)/datos-personales/acciones", () => ({
  guardarFilaAccion: vi.fn(),
  agregarFilaAccion: vi.fn(),
  confirmarPaisAccion: vi.fn(),
}))

const guardar = vi.mocked(guardarFilaAccion)
const agregar = vi.mocked(agregarFilaAccion)
const confirmar = vi.mocked(confirmarPaisAccion)

const FILA: FilaDelRegistro = {
  id: "11111111-2222-4333-8444-555555555555",
  clave: "respaldos",
  dato: "Respaldo nocturno de la base",
  para_que: "Recuperar la app si algo se pierde.",
  proveedor: "Cloudflare R2",
  pais: "Por confirmar",
  pais_confirmado: false,
  plazo: "Se guardan los últimos 30 días.",
  regla_de_borrado: "respaldos",
  plazo_dias: 30,
  orden: 9,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("EditorDeFila", () => {
  it("saves the corrected row, with no days as null, and refreshes", async () => {
    guardar.mockResolvedValue({ ok: true })
    render(<EditorDeFila fila={FILA} />)

    fireEvent.change(screen.getByLabelText("País"), { target: { value: "Estados Unidos" } })
    fireEvent.change(screen.getByLabelText("Plazo en días (si la app lo borra sola)"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(refrescar).toHaveBeenCalled())
    expect(guardar).toHaveBeenCalledWith({
      id: FILA.id,
      dato: FILA.dato,
      para_que: FILA.para_que,
      proveedor: "Cloudflare R2",
      pais: "Estados Unidos",
      plazo: FILA.plazo,
      plazo_dias: null,
      orden: 9,
    })
    expect(screen.getByText("Guardado.")).toBeInTheDocument()
  })

  it("says the app deletes this row by itself, and under which rule, without letting it change", () => {
    render(<EditorDeFila fila={FILA} />)
    expect(screen.getByText("respaldos · la app lo borra sola (regla respaldos)")).toBeInTheDocument()
    expect(screen.queryByLabelText(/regla/i)).toBeNull()
  })

  it("confirms the country", async () => {
    confirmar.mockResolvedValue({ ok: true })
    render(<EditorDeFila fila={FILA} />)

    fireEvent.click(screen.getByRole("button", { name: "Confirmar país" }))

    await waitFor(() => expect(refrescar).toHaveBeenCalled())
    expect(confirmar).toHaveBeenCalledWith({ id: FILA.id })
  })

  it("offers no confirmation once the country is confirmed", () => {
    render(<EditorDeFila fila={{ ...FILA, pais_confirmado: true }} />)
    expect(screen.getByText("País confirmado.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Confirmar país" })).toBeNull()
  })

  it("adds a new row with its key and empties the form", async () => {
    agregar.mockResolvedValue({ ok: true, id: "nueva" })
    render(<EditorDeFila />)

    for (const [etiqueta, valor] of [
      ["Clave", "comentarios_de_riesgo"],
      ["Dato", "Comentarios con señales de riesgo"],
      ["Para qué", "Avisarte sin guardar su texto."],
      ["Proveedor", "Supabase"],
      ["País", "Por confirmar"],
      ["Plazo en palabras", "90 días"],
      ["Plazo en días (si la app lo borra sola)", "90"],
      ["Orden", "12"],
    ]) {
      fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
    }
    fireEvent.click(screen.getByRole("button", { name: "Agregar fila" }))

    expect(await screen.findByText("Fila agregada.")).toBeInTheDocument()
    expect(agregar).toHaveBeenCalledWith({
      clave: "comentarios_de_riesgo",
      dato: "Comentarios con señales de riesgo",
      para_que: "Avisarte sin guardar su texto.",
      proveedor: "Supabase",
      pais: "Por confirmar",
      plazo: "90 días",
      plazo_dias: 90,
      orden: 12,
    })
    expect(screen.getByLabelText("Clave")).toHaveValue("")
  })

  it("shows why it failed and keeps what was typed", async () => {
    guardar.mockResolvedValue({ ok: false, error: "Esta fila la borra la app sola: necesita su plazo en días." })
    render(<EditorDeFila fila={FILA} />)

    fireEvent.change(screen.getByLabelText("Plazo en días (si la app lo borra sola)"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("necesita su plazo en días")
    expect(screen.getByLabelText("Plazo en días (si la app lo borra sola)")).toHaveValue(null)
    expect(refrescar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/navegacion-principal.test.tsx tests/unit/editor-de-fila.test.tsx`

- [ ] **Step 3: Navigation** (`components/navegacion-principal.tsx`)

```tsx
import Link from "next/link"
import type { Rol } from "@/lib/acciones/ingreso"
import { cn } from "@/lib/utils"

const SECCIONES = [
  { clave: "materiales", texto: "Materiales", ruta: "/", soloWav: false },
  { clave: "autores", texto: "Autores", ruta: "/autores", soloWav: false },
  { clave: "temas", texto: "Temas", ruta: "/temas", soloWav: false },
  { clave: "semana", texto: "Semana", ruta: "/semana", soloWav: false },
  // The personal data register is WAV's to correct (Conidolly spec 2026-11-01, D2); Coni reviews it in Conidolly.
  { clave: "datos", texto: "Datos", ruta: "/datos-personales", soloWav: true },
] as const

export type Seccion = (typeof SECCIONES)[number]["clave"]

export function NavegacionPrincipal({ actual, rol }: { actual: Seccion; rol: Rol }) {
  const visibles = SECCIONES.filter((seccion) => !seccion.soloWav || rol === "wav")
  return (
    <nav aria-label="Secciones" className="flex gap-1.5">
      {visibles.map((seccion) => (
        <Link
          key={seccion.clave}
          href={seccion.ruta}
          aria-current={seccion.clave === actual ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md border border-linea px-1 text-nav font-semibold",
            "focus-visible:outline-3 focus-visible:outline-acento",
            seccion.clave === actual
              ? "border-acento bg-acento-suave text-acento-profundo"
              : "bg-superficie text-tinta",
          )}
        >
          {seccion.texto}
        </Link>
      ))}
    </nav>
  )
}
```

In the four pages, `sesion` is already the member session: change each call to pass the role, e.g. `<NavegacionPrincipal actual="materiales" rol={sesion.rol} />` in `app/(app)/page.tsx`, and the same with `"autores"`, `"temas"` and `"semana"`.

- [ ] **Step 4: Actions** (`app/(app)/datos-personales/acciones.ts`)

```ts
"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesion } from "@/lib/acciones/servidor"
import { agregarFila, confirmarPais, guardarFila } from "@/lib/ingesta/datos-personales"

function refrescar<T extends object>(resultado: Resultado<T>): Resultado<T> {
  if (resultado.ok) revalidatePath("/datos-personales")
  return resultado
}

export async function guardarFilaAccion(entrada: unknown) {
  return refrescar(await conSesion("guardarFila", (deps) => guardarFila(deps, entrada)))
}

export async function agregarFilaAccion(entrada: unknown) {
  return refrescar(await conSesion("agregarFila", (deps) => agregarFila(deps, entrada)))
}

export async function confirmarPaisAccion(entrada: unknown) {
  return refrescar(await conSesion("confirmarPais", (deps) => confirmarPais(deps, entrada)))
}
```

- [ ] **Step 5: The row editor** (`app/(app)/datos-personales/editor-de-fila.tsx`)

```tsx
"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useId, useState } from "react"
import { Campo, CLASES_DE_CAMPO } from "@/components/campo"
import { Boton } from "@/components/ui/boton"
import type { FilaDelRegistro } from "@/lib/ingesta/datos-personales"
import { agregarFilaAccion, confirmarPaisAccion, guardarFilaAccion } from "./acciones"

function leer(datos: FormData, nombre: string): string {
  const valor = datos.get(nombre)
  return typeof valor === "string" ? valor : ""
}

/** The editable fields as the actions validate them: the days are a number, or null when left empty. */
function camposDe(datos: FormData) {
  const dias = leer(datos, "plazo_dias").trim()
  return {
    dato: leer(datos, "dato"),
    para_que: leer(datos, "para_que"),
    proveedor: leer(datos, "proveedor"),
    pais: leer(datos, "pais"),
    plazo: leer(datos, "plazo"),
    plazo_dias: dias === "" ? null : Number(dias),
    orden: Number(leer(datos, "orden")),
  }
}

/** One row of the register for WAV: correct it or confirm its country; without `fila`, add a new one. */
export function EditorDeFila({ fila }: { fila?: FilaDelRegistro }) {
  const router = useRouter()
  const prefijo = useId()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const id = (campo: string) => `${prefijo}-${campo}`

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = evento.currentTarget
    const datos = new FormData(formulario)
    setCargando(true)
    setError(null)
    setGuardado(false)
    const resultado = fila
      ? await guardarFilaAccion({ id: fila.id, ...camposDe(datos) })
      : await agregarFilaAccion({ clave: leer(datos, "clave"), ...camposDe(datos) })
    setCargando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    if (!fila) formulario.reset()
    setGuardado(true)
    router.refresh()
  }

  async function confirmar(filaId: string) {
    setError(null)
    const resultado = await confirmarPaisAccion({ id: filaId })
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    router.refresh()
  }

  return (
    <form
      onSubmit={(evento) => void enviar(evento)}
      aria-label={fila ? fila.dato : "Fila nueva"}
      className="grid gap-3 rounded-lg border border-linea bg-superficie p-4"
    >
      {fila ? (
        <p className="text-meta text-apagado">
          {fila.regla_de_borrado
            ? `${fila.clave} · la app lo borra sola (regla ${fila.regla_de_borrado})`
            : fila.clave}
        </p>
      ) : (
        <Campo
          id={id("clave")}
          etiqueta="Clave"
          ayuda="En minúsculas y con guiones bajos, por ejemplo comentarios_de_riesgo. No cambia después."
        >
          <input
            id={id("clave")}
            name="clave"
            required
            aria-describedby={`${id("clave")}-ayuda`}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
      )}
      <Campo id={id("dato")} etiqueta="Dato">
        <input id={id("dato")} name="dato" defaultValue={fila?.dato} className={CLASES_DE_CAMPO} />
      </Campo>
      <Campo id={id("para_que")} etiqueta="Para qué">
        <textarea id={id("para_que")} name="para_que" rows={2} defaultValue={fila?.para_que} className={CLASES_DE_CAMPO} />
      </Campo>
      <Campo id={id("proveedor")} etiqueta="Proveedor">
        <input id={id("proveedor")} name="proveedor" defaultValue={fila?.proveedor} className={CLASES_DE_CAMPO} />
      </Campo>
      <Campo id={id("pais")} etiqueta="País">
        <input id={id("pais")} name="pais" defaultValue={fila?.pais} className={CLASES_DE_CAMPO} />
      </Campo>
      <p className="text-meta text-apagado">{fila?.pais_confirmado ? "País confirmado." : "País por confirmar."}</p>
      <Campo id={id("plazo")} etiqueta="Plazo en palabras">
        <input id={id("plazo")} name="plazo" defaultValue={fila?.plazo} className={CLASES_DE_CAMPO} />
      </Campo>
      <Campo id={id("plazo_dias")} etiqueta="Plazo en días (si la app lo borra sola)">
        <input
          id={id("plazo_dias")}
          name="plazo_dias"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={fila?.plazo_dias ?? ""}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <Campo id={id("orden")} etiqueta="Orden">
        <input
          id={id("orden")}
          name="orden"
          type="number"
          min={0}
          max={999}
          inputMode="numeric"
          defaultValue={fila?.orden ?? 100}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      {error ? (
        <p role="alert" className="text-meta text-error-tinta">
          {error}
        </p>
      ) : null}
      {guardado ? (
        <p role="status" className="text-meta text-apagado">
          {fila ? "Guardado." : "Fila agregada."}
        </p>
      ) : null}
      <Boton type="submit" variante="linea" cargando={cargando}>
        {fila ? "Guardar" : "Agregar fila"}
      </Boton>
      {fila && !fila.pais_confirmado ? (
        <Boton variante="callado" tamano="chico" onClick={() => void confirmar(fila.id)}>
          Confirmar país
        </Boton>
      ) : null}
    </form>
  )
}
```

- [ ] **Step 6: The page** (`app/(app)/datos-personales/page.tsx`)

```tsx
import { NavegacionPrincipal } from "@/components/navegacion-principal"
import { listarRegistro } from "@/lib/ingesta/datos-personales"
import { leerSesion } from "@/lib/sesion/miembro"
import { EditorDeFila } from "./editor-de-fila"

/** Ingesta › Datos (Conidolly spec 2026-11-01, D2): WAV keeps the register; Coni reads it in Conidolly. */
export default async function DatosPersonales() {
  const sesion = await leerSesion()
  if (sesion.estado !== "miembro") return null
  const filas = sesion.rol === "wav" ? await listarRegistro(sesion.db) : []

  return (
    <main className="mx-auto grid w-full max-w-[560px] content-start gap-5.5 px-4.5 pt-[max(2rem,env(safe-area-inset-top))] pb-8">
      <h1 className="font-serif text-display text-balance">Datos personales</h1>
      <NavegacionPrincipal actual="datos" rol={sesion.rol} />
      {sesion.rol === "wav" ? (
        <>
          <p className="text-apagado">
            Lo que Conidolly guarda, para qué, dónde queda y cuándo se borra. Coni lo lee en Conidolly y lo revisa una
            vez al año. Lo que la app borra sola no cambia desde aquí: si los días no calzan con el código, Conidolly
            lo marca.
          </p>
          <ul className="grid gap-3">
            {filas.map((fila) => (
              <li key={fila.id}>
                <EditorDeFila fila={fila} />
              </li>
            ))}
          </ul>
          <section aria-labelledby="fila-nueva" className="grid gap-3">
            <h2 id="fila-nueva" className="font-semibold">
              Agregar una fila
            </h2>
            <EditorDeFila />
          </section>
        </>
      ) : (
        <p className="text-apagado">
          Esta lista la corrige WAV. Tú la revisas en Conidolly, en Ajustes, Datos personales.
        </p>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Run, expect PASS** — `pnpm test:run tests/unit/navegacion-principal.test.tsx tests/unit/editor-de-fila.test.tsx`, then the whole gate of this repo: `pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build`. With its dev server in tmux (`tmux new-session -d -s ingesta "pnpm dev"`, port 3100), sign in as WAV («Soy WAV») and open `/datos-personales`: the 11 rows, the tab «Datos» marked, «Confirmar país» on each row; as Coni the tab is absent and `/datos-personales` shows the sentence.

- [ ] **Step 8: Commit**

```bash
git add components/navegacion-principal.tsx "app/(app)/page.tsx" "app/(app)/autores/page.tsx" "app/(app)/temas/page.tsx" "app/(app)/semana/page.tsx" "app/(app)/datos-personales" tests/unit/navegacion-principal.test.tsx tests/unit/editor-de-fila.test.tsx
git commit -m "Add the WAV editor of the personal data register" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: PR, only when Federico says so** (Ingesta's own PR; the repo is private):

```bash
git push -u origin feat/datos-personales
gh pr create --base main --head feat/datos-personales --title "Add the WAV editor of the personal data register" --body "$(cat <<'EOF'
Ingesta part of Conidolly change 26 (spec estudio-coni docs/superpowers/specs/2026-11-01-conidolly-registro-de-datos-y-transparencia-design.md).

- New tab «Datos» for WAV only: edit each row of `inventario_de_datos`, add a row, confirm its country.
- The deletion rule stays read-only (D4: only a migration sets it).
- Types regenerated from estudio-coni migration 20261101000100.

Deploy only after `supabase db push` of that migration.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merging and the Vercel deploy of Ingesta are step 5 of the checklist in Task 16.

---

## Spec coverage

| Spec section | Task |
|---|---|
| Data model: `inventario_de_datos`, RLS, 11 seed rows | 1 |
| `registro_de_borrados`, service-role only | 1 |
| `revisiones_de_inventario`, `marcar_inventario_revisado()` | 1, 10 |
| `transparencia_versiones`, `publicar_transparencia`, `volver_a_transparencia`, `transparencia_vigente()` for anon, draft never current | 2, 10 |
| Notices: full `avisos_tipo_check` rewrite with `revision_de_inventario`, test of the final list | 1 |
| `REGLAS_DE_BORRADO`, `retencion.ts` and `respaldo.ts` import it | 3 |
| Gap fixed: nightly `huella` | 7, 9 |
| Log: one row per rule per night; a failed log keeps the deletion and fails the step | 5, 6, 7 |
| Mismatch flag and the seed-vs-rules test | 3, 11, 12 |
| Yearly review: 30 days before, once per due date, Coni + `aWav`; «Lo revisé» closes the notice | 1, 8, 9, 10, 12 |
| Conidolly › Ajustes › Datos personales | 11, 12 |
| Conidolly › Ajustes › Página de IA (editor, motivo, history, «Volver a esta», draft as proposal) | 13, 14 |
| Public `/l/ia` (paragraphs, escaped, 404, error page, light, `/l` footer link, bio line) | 13, 14, 15, 16 |
| Ingesta › Datos personales (edit, add, confirm country) | 17, 18 |
| Errors: publishing keeps the text; only Coni publishes, only WAV edits | 2, 10, 14, 17 |
| Tests: unit, integration, e2e + axe on the three new screens | every task, 16 |
| Rollout: types in both repos, two PRs, Federico's deploy | 2, 16, 17, 18 |
